import { create } from 'zustand'
import type { Run, RunStep, GatePausedPayload } from '../types'
import * as tauri from '../lib/tauri'

export type PendingRunConfig = {
  workflowId: string
  input: string
  presetProjectPath?: string
  presetProjectName?: string
}

interface RunStore {
  currentRun: Run | null
  isRunning: boolean
  isPaused: boolean
  gateInfo: GatePausedPayload | null
  logLines: string[]
  showResultModal: boolean
  pendingRun: PendingRunConfig | null

  startRun: (
    workflowId: string,
    input: string,
    workspaceMode?: string,
    projectName?: string,
    basePath?: string,
  ) => Promise<string>
  cancelRun: () => Promise<void>
  resumeGate: (action: 'approve' | 'reject' | 'edit', content?: string) => Promise<void>
  clearRun: () => void
  openResultModal: () => void
  dismissResultModal: () => void
  setPendingRun: (config: PendingRunConfig | null) => void

  _setRun: (run: Run) => void
  _addStep: (step: Partial<RunStep> & { nodeId: string }) => void
  _updateStep: (nodeId: string, patch: Partial<RunStep>) => void
  _appendStepOutput: (nodeId: string, chunk: string) => void
  _addLog: (line: string) => void
  _setGateInfo: (info: GatePausedPayload | null) => void
  _setRunStatus: (status: Run['status']) => void
  _setFinalOutput: (output: string) => void
}

export const useRunStore = create<RunStore>()((set, get) => ({
  currentRun: null,
  isRunning: false,
  isPaused: false,
  gateInfo: null,
  logLines: [],
  showResultModal: false,
  pendingRun: null,

  startRun: async (workflowId, input, workspaceMode, projectName, basePath) => {
    const runId = await tauri.startRun(workflowId, input, workspaceMode, projectName, basePath)
    const run: Run = {
      id: runId,
      workflowId,
      startedAt: new Date().toISOString(),
      status: 'running',
      input,
      steps: [],
    }
    set({ currentRun: run, isRunning: true, isPaused: false, gateInfo: null, logLines: [], pendingRun: null })
    return runId
  },

  cancelRun: async () => {
    const { currentRun } = get()
    if (!currentRun) return
    await tauri.cancelRun(currentRun.id)
    set({ isRunning: false, isPaused: false })
  },

  resumeGate: async (action, content) => {
    const { currentRun, gateInfo } = get()
    if (!currentRun || !gateInfo) return
    await tauri.resumeGate(currentRun.id, gateInfo.nodeId, action, content)
    set({ gateInfo: null, isPaused: false, isRunning: true })
  },

  clearRun: () => set({ currentRun: null, isRunning: false, isPaused: false, gateInfo: null, logLines: [], showResultModal: false }),
  openResultModal: () => set({ showResultModal: true }),
  dismissResultModal: () => set({ showResultModal: false }),
  setPendingRun: (config) => set({ pendingRun: config }),

  _setRun: (run) => set({ currentRun: run }),

  _addStep: (partial) => {
    set((s) => {
      if (!s.currentRun) return s
      const step: RunStep = {
        nodeId: partial.nodeId,
        nodeName: partial.nodeName ?? partial.nodeId,
        attempt: partial.attempt ?? 1,
        startedAt: partial.startedAt ?? new Date().toISOString(),
        status: partial.status ?? 'running',
        input: partial.input ?? '',
        output: partial.output ?? '',
        tokensUsed: partial.tokensUsed,
        error: partial.error,
        filesWritten: partial.filesWritten ?? [],
      }
      return { currentRun: { ...s.currentRun!, steps: [...s.currentRun!.steps, step] } }
    })
  },

  _updateStep: (nodeId, patch) => {
    set((s) => {
      if (!s.currentRun) return s
      const steps = s.currentRun.steps.map((step) =>
        step.nodeId === nodeId ? { ...step, ...patch } : step,
      )
      return { currentRun: { ...s.currentRun, steps } }
    })
  },

  _appendStepOutput: (nodeId, chunk) => {
    set((s) => {
      if (!s.currentRun) return s
      const steps = s.currentRun.steps.map((step) =>
        step.nodeId === nodeId ? { ...step, output: step.output + chunk } : step,
      )
      return { currentRun: { ...s.currentRun, steps } }
    })
  },

  _addLog: (line) => set((s) => ({ logLines: [...s.logLines, line] })),

  _setGateInfo: (info) =>
    set({ gateInfo: info, isPaused: info !== null, isRunning: info === null }),

  _setRunStatus: (status) => {
    set((s) => {
      const isRunning = status === 'running'
      const isPaused = status === 'paused'
      return {
        currentRun: s.currentRun ? { ...s.currentRun, status } : null,
        isRunning,
        isPaused,
      }
    })
  },

  _setFinalOutput: (output) => {
    set((s) => ({
      currentRun: s.currentRun ? { ...s.currentRun, finalOutput: output, status: 'completed' } : null,
      isRunning: false,
      isPaused: false,
      showResultModal: true,
    }))
  },
}))
