import { create } from 'zustand'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type {
  ChamberMode,
  ChamberRunStatus,
  ChamberAgentStatus,
  ChamberAgent,
  ChamberResult,
  ChamberAgentStatusPayload,
  ChamberAgentChunkPayload,
  ChamberAgentDonePayload,
  ChamberPhasePayload,
  ChamberGatePausedPayload,
  ChamberCompletedPayload,
  ChamberErrorPayload,
} from '../types'

export type ChamberAgentStream = {
  text: string
  status: ChamberAgentStatus
}

export type ChamberGateInfo = {
  message: string
  phase: string
  outputs: { agentId: string; agentName: string; output: string }[]
}

interface ChamberStore {
  // ── Config ────────────────────────────────────────
  mode: ChamberMode
  context: string
  rubric: string
  roster: ChamberAgent[]
  rounds: number
  reviewGateEnabled: boolean

  // ── Runtime state ─────────────────────────────────
  runId: string | null
  runStatus: ChamberRunStatus
  currentPhase: string
  phaseDescription: string
  agentStreams: Record<string, ChamberAgentStream>
  gateInfo: ChamberGateInfo | null
  results: ChamberResult[]
  finalOutput: string | null
  winnerId: string | null
  error: string | null

  // ── Config actions ────────────────────────────────
  setMode: (mode: ChamberMode) => void
  setContext: (context: string) => void
  setRubric: (rubric: string) => void
  addAgent: (agent: ChamberAgent) => void
  removeAgent: (id: string) => void
  updateAgent: (id: string, patch: Partial<ChamberAgent>) => void
  setRounds: (rounds: number) => void
  setReviewGateEnabled: (enabled: boolean) => void

  // ── Run actions ───────────────────────────────────
  startRun: () => Promise<void>
  cancelRun: () => Promise<void>
  resumeRun: (action: 'approve' | 'cancel') => Promise<void>
  reset: () => void

  // internal
  _unlisten: (() => void) | null
  _attachListeners: (runId: string) => Promise<void>
  _detachListeners: () => void
}

const DEFAULT_CONFIG = {
  mode: 'audition' as ChamberMode,
  context: '',
  rubric: '',
  roster: [] as ChamberAgent[],
  rounds: 3,
  reviewGateEnabled: false,
}

export const useChamberStore = create<ChamberStore>()((set, get) => ({
  ...DEFAULT_CONFIG,

  runId: null,
  runStatus: 'idle',
  currentPhase: '',
  phaseDescription: '',
  agentStreams: {},
  gateInfo: null,
  results: [],
  finalOutput: null,
  winnerId: null,
  error: null,
  _unlisten: null,

  setMode: (mode) => set({ mode }),
  setContext: (context) => set({ context }),
  setRubric: (rubric) => set({ rubric }),
  setRounds: (rounds) => set({ rounds }),
  setReviewGateEnabled: (reviewGateEnabled) => set({ reviewGateEnabled }),

  addAgent: (agent) =>
    set((s) => ({ roster: [...s.roster, agent] })),

  removeAgent: (id) =>
    set((s) => ({ roster: s.roster.filter((a) => a.id !== id) })),

  updateAgent: (id, patch) =>
    set((s) => ({
      roster: s.roster.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  startRun: async () => {
    const s = get()
    if (s.roster.length === 0) throw new Error('Add at least one agent to the roster.')
    if (!s.context.trim()) throw new Error('Enter a task or context prompt.')

    // Reset stream state but keep config
    const initialStreams: Record<string, ChamberAgentStream> = {}
    for (const a of s.roster) {
      initialStreams[a.id] = { text: '', status: 'waiting' }
    }

    set({
      runStatus: 'running',
      currentPhase: 'starting',
      phaseDescription: 'Preparing the chamber...',
      agentStreams: initialStreams,
      gateInfo: null,
      results: [],
      finalOutput: null,
      winnerId: null,
      error: null,
    })

    try {
      const runId = await invoke<string>('start_chamber_run', {
        config: {
          mode: s.mode,
          context: s.context,
          rubric: s.rubric,
          roster: s.roster.map((a) => ({
            id: a.id,
            name: a.name,
            systemPrompt: a.systemPrompt,
            model: a.model,
          })),
          rounds: s.rounds,
          reviewGateEnabled: s.reviewGateEnabled,
        },
      })
      set({ runId })
      await get()._attachListeners(runId)
    } catch (e) {
      set({ runStatus: 'error', error: String(e) })
    }
  },

  cancelRun: async () => {
    const { runId } = get()
    if (!runId) return
    try {
      await invoke<void>('cancel_chamber_run', { runId })
    } catch { /* ignore */ }
    get()._detachListeners()
    set({ runStatus: 'cancelled' })
  },

  resumeRun: async (action) => {
    const { runId } = get()
    if (!runId) return
    await invoke<void>('resume_chamber_run', { runId, action })
    if (action === 'cancel') {
      get()._detachListeners()
      set({ runStatus: 'cancelled', gateInfo: null })
    } else {
      set({ runStatus: 'running', gateInfo: null })
    }
  },

  reset: () => {
    get()._detachListeners()
    set({
      runId: null,
      runStatus: 'idle',
      currentPhase: '',
      phaseDescription: '',
      agentStreams: {},
      gateInfo: null,
      results: [],
      finalOutput: null,
      winnerId: null,
      error: null,
    })
  },

  _attachListeners: async (runId: string) => {
    const unlisteners: UnlistenFn[] = []

    const on = async <T>(event: string, handler: (p: T) => void) => {
      const u = await listen<T>(`conductor://chamber/${runId}/${event}`, (e) => handler(e.payload))
      unlisteners.push(u)
    }

    await on<ChamberAgentStatusPayload>('agent_status', (p) => {
      set((s) => ({
        agentStreams: {
          ...s.agentStreams,
          [p.agentId]: { ...s.agentStreams[p.agentId], status: p.status },
        },
      }))
    })

    await on<ChamberAgentChunkPayload>('agent_chunk', (p) => {
      set((s) => {
        const prev = s.agentStreams[p.agentId] ?? { text: '', status: 'typing' }
        return {
          agentStreams: {
            ...s.agentStreams,
            [p.agentId]: { ...prev, text: prev.text + p.chunk, status: 'typing' },
          },
        }
      })
    })

    await on<ChamberAgentDonePayload>('agent_done', (p) => {
      set((s) => ({
        agentStreams: {
          ...s.agentStreams,
          [p.agentId]: { text: p.output, status: 'done' },
        },
      }))
    })

    await on<ChamberPhasePayload>('phase', (p) => {
      set({ currentPhase: p.label, phaseDescription: p.description })
    })

    await on<ChamberGatePausedPayload>('gate_paused', (p) => {
      set({ runStatus: 'paused', gateInfo: { message: p.message, phase: p.phase, outputs: p.outputs } })
    })

    await on<ChamberCompletedPayload>('completed', (p) => {
      get()._detachListeners()
      // Reset scoring streams so agents show their final output
      const finalStreams: Record<string, ChamberAgentStream> = { ...get().agentStreams }
      for (const r of p.results) {
        finalStreams[r.agentId] = { text: r.output, status: 'done' }
      }
      set({
        runStatus: 'completed',
        results: p.results,
        finalOutput: p.finalOutput,
        winnerId: p.winnerId ?? null,
        agentStreams: finalStreams,
        currentPhase: 'completed',
        phaseDescription: 'Run complete.',
      })
    })

    await on<ChamberErrorPayload>('error', (p) => {
      get()._detachListeners()
      set({ runStatus: 'error', error: p.message })
    })

    await on<void>('cancelled', () => {
      get()._detachListeners()
      set({ runStatus: 'cancelled' })
    })

    const unlisten = () => unlisteners.forEach((u) => u())
    set({ _unlisten: unlisten })
  },

  _detachListeners: () => {
    const { _unlisten } = get()
    if (_unlisten) { _unlisten(); set({ _unlisten: null }) }
  },
}))
