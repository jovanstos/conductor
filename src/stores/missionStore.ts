import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Mission, MissionGoal, WorkLogEntry, MissionEscalation, MissionSubAgent, ModelConfig } from '../types'
import * as tauri from '../lib/tauri'
import { DEFAULT_MODEL } from '../lib/defaults'

const DEFAULT_MANAGER_SYSTEM_PROMPT = `You are a Manager Agent — the operational backbone of this mission. Think of yourself as a skilled middle manager: you receive goals from the human, break them down into executable tasks, dispatch specialist agents to complete those tasks, review their work, and keep everything moving forward.

## Your Responsibilities
- **Plan**: Break down high-level goals into concrete, actionable tasks
- **Delegate**: Dispatch the right specialist agent for each task
- **Review**: Evaluate agent outputs and decide next steps
- **Escalate**: When you need a decision only the human can make, ask them directly
- **Track**: Keep goals updated, mark things done when complete
- **Persist**: Keep the mission running until all goals are complete or you're stopped

## How to Work
1. Read the active goals carefully
2. Look at what's been done in the work log
3. Decide what needs to happen next
4. Dispatch agents to do the work — be specific with your task descriptions
5. When an agent returns results, review them and decide the next move
6. If you hit a blocker that only the human can resolve, escalate with a clear question
7. Mark goals complete when their criteria are met

## Be Strategic
Don't do everything at once. Focus on what matters most right now.
Quality over speed — make sure each agent has clear, detailed instructions.
If an agent's output needs follow-up, dispatch another agent to continue the work.`

interface MissionStore {
  missions: Mission[]
  currentMissionId: string | null
  activeEscalation: MissionEscalation | null
  isLoading: boolean

  // Current mission live state (updated by events)
  liveStatus: Record<string, string>           // missionId -> status
  liveLog: Record<string, WorkLogEntry[]>       // missionId -> recent entries
  liveSubAgents: Record<string, MissionSubAgent[]> // missionId -> active sub-agents

  loadMissions: () => Promise<void>
  selectMission: (id: string | null) => void
  createMission: (params: {
    name: string
    description: string
    runMode: 'goal_driven' | 'event_driven'
    cyclePeriodMinutes: number
    managerModel: ModelConfig
    allowManagerGoals: boolean
    workspacePath?: string
  }) => Promise<Mission>
  deleteMission: (id: string) => Promise<void>
  startMission: (id: string) => Promise<void>
  stopMission: (id: string) => Promise<void>
  addGoal: (missionId: string, text: string, priority: 'high' | 'normal' | 'low') => Promise<void>
  completeGoal: (missionId: string, goalId: string) => Promise<void>
  deleteGoal: (missionId: string, goalId: string) => Promise<void>
  respondToEscalation: (missionId: string, escalationId: string, response: string) => Promise<void>
  dismissEscalation: () => void

  // Event listener management
  _listeners: Record<string, () => void>  // missionId -> unlisten fn
  attachListeners: (missionId: string) => Promise<void>
  detachListeners: (missionId: string) => void
  detachAllListeners: () => void
}

export const useMissionStore = create<MissionStore>()((set, get) => ({
  missions: [],
  currentMissionId: null,
  activeEscalation: null,
  isLoading: false,
  liveStatus: {},
  liveLog: {},
  liveSubAgents: {},
  _listeners: {},

  loadMissions: async () => {
    set({ isLoading: true })
    try {
      const missions = await tauri.listMissions()
      set({ missions, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  selectMission: (id) => {
    const { currentMissionId, detachListeners, attachListeners } = get()
    set({ currentMissionId: id, activeEscalation: null })
    if (id) attachListeners(id)
  },

  createMission: async (params) => {
    const mission: Mission = {
      id: uuidv4(),
      name: params.name,
      description: params.description,
      goals: [],
      runMode: params.runMode,
      cyclePeriodMinutes: params.cyclePeriodMinutes,
      managerModel: params.managerModel,
      managerSystemPrompt: DEFAULT_MANAGER_SYSTEM_PROMPT,
      allowManagerGoals: params.allowManagerGoals,
      status: 'idle',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workLog: [],
      activeSubAgents: [],
      chatLog: [],
      workspacePath: params.workspacePath,
    }
    await tauri.saveMission(mission)
    set((s) => ({ missions: [mission, ...s.missions] }))
    return mission
  },

  deleteMission: async (id) => {
    const { detachListeners } = get()
    detachListeners(id)
    await tauri.deleteMission(id)
    set((s) => ({
      missions: s.missions.filter((m) => m.id !== id),
      currentMissionId: s.currentMissionId === id ? null : s.currentMissionId,
    }))
  },

  startMission: async (id) => {
    await tauri.startMission(id)
    const { attachListeners } = get()
    await attachListeners(id)
    set((s) => ({
      missions: s.missions.map((m) => m.id === id ? { ...m, status: 'running' } : m),
      liveStatus: { ...s.liveStatus, [id]: 'running' },
    }))
  },

  stopMission: async (id) => {
    await tauri.stopMission(id)
    set((s) => ({
      missions: s.missions.map((m) => m.id === id ? { ...m, status: 'idle' } : m),
      liveStatus: { ...s.liveStatus, [id]: 'idle' },
    }))
  },

  addGoal: async (missionId, text, priority) => {
    const updated = await tauri.addMissionGoal(missionId, text, priority)
    set((s) => ({
      missions: s.missions.map((m) => m.id === missionId ? updated : m),
    }))
  },

  completeGoal: async (missionId, goalId) => {
    const updated = await tauri.completeMissionGoal(missionId, goalId)
    set((s) => ({
      missions: s.missions.map((m) => m.id === missionId ? updated : m),
    }))
  },

  deleteGoal: async (missionId, goalId) => {
    const updated = await tauri.deleteMissionGoal(missionId, goalId)
    set((s) => ({
      missions: s.missions.map((m) => m.id === missionId ? updated : m),
    }))
  },

  respondToEscalation: async (missionId, escalationId, response) => {
    await tauri.respondToMissionEscalation(missionId, escalationId, response)
    set({ activeEscalation: null })
    // Reload mission state
    const updated = await tauri.getMission(missionId)
    if (updated) {
      set((s) => ({
        missions: s.missions.map((m) => m.id === missionId ? updated : m),
      }))
    }
  },

  dismissEscalation: () => set({ activeEscalation: null }),

  attachListeners: async (missionId) => {
    const { _listeners, detachListeners } = get()
    if (_listeners[missionId]) detachListeners(missionId) // re-attach

    const unlisten = await tauri.listenToMission(missionId, {
      onStatusChange: ({ status }) => {
        set((s) => ({
          liveStatus: { ...s.liveStatus, [missionId]: status },
          missions: s.missions.map((m) =>
            m.id === missionId ? { ...m, status: status as Mission['status'] } : m
          ),
        }))
      },

      onLogEntry: ({ entry }) => {
        set((s) => {
          const prev = s.liveLog[missionId] ?? []
          const updated = [...prev, entry].slice(-100) // keep last 100
          return { liveLog: { ...s.liveLog, [missionId]: updated } }
        })
      },

      onEscalation: ({ escalation }) => {
        if (escalation.urgency === 'high' && escalation.status === 'pending') {
          set({ activeEscalation: escalation })
        }
        // Reload mission to get updated escalation state
        tauri.getMission(missionId).then((m) => {
          if (m) set((s) => ({ missions: s.missions.map((ms) => ms.id === missionId ? m : ms) }))
        })
      },

      onAgentStatus: ({ agent }) => {
        set((s) => {
          const prev = s.liveSubAgents[missionId] ?? []
          const existing = prev.findIndex((a) => a.id === agent.id)
          const updated = existing >= 0
            ? prev.map((a) => a.id === agent.id ? agent : a)
            : [...prev, agent]
          return { liveSubAgents: { ...s.liveSubAgents, [missionId]: updated } }
        })
      },

      onGoalUpdate: () => {
        // Reload mission to get latest goal state
        tauri.getMission(missionId).then((m) => {
          if (m) set((s) => ({ missions: s.missions.map((ms) => ms.id === missionId ? m : ms) }))
        })
      },
    })

    set((s) => ({ _listeners: { ...s._listeners, [missionId]: unlisten } }))
  },

  detachListeners: (missionId) => {
    const { _listeners } = get()
    if (_listeners[missionId]) {
      _listeners[missionId]()
      const { [missionId]: _, ...rest } = _listeners
      set({ _listeners: rest })
    }
  },

  detachAllListeners: () => {
    const { _listeners } = get()
    Object.values(_listeners).forEach((u) => u())
    set({ _listeners: {} })
  },
}))
