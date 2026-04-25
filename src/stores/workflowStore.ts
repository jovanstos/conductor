import { create } from 'zustand'
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import type { Workflow, WorkflowNode, WorkflowEdge, AgentNodeData, LoopNodeData, ModelConfig } from '../types'
import * as tauri from '../lib/tauri'
import { newWorkflow, newAgentNodeData } from '../lib/defaults'

type ViewMode = 'canvas' | 'list'

const HISTORY_LIMIT = 50

interface WorkflowStore {
  workflows: Workflow[]
  currentWorkflow: Workflow | null
  selectedNodeId: string | null
  viewMode: ViewMode
  taskInput: string
  isLoading: boolean

  _history: Workflow[]
  _historyIndex: number
  _copiedNode: WorkflowNode | null
  canUndo: boolean
  canRedo: boolean

  loadWorkflows: () => Promise<void>
  setCurrentWorkflow: (workflow: Workflow | null) => void
  createWorkflow: (name: string) => Promise<Workflow>
  deleteWorkflow: (id: string) => Promise<void>
  duplicateWorkflow: (id: string) => Promise<void>
  saveCurrentWorkflow: () => Promise<void>
  updateWorkflowMeta: (patch: Partial<Pick<Workflow, 'name' | 'description' | 'settings'>>) => void

  addNode: (node: WorkflowNode) => void
  addLoopGroup: (params: { groupId: string; workerId: string; reviewerId: string; position: { x: number; y: number } }) => void
  updateNode: (id: string, patch: Partial<WorkflowNode>) => void
  removeNode: (id: string) => void
  addEdge: (edge: WorkflowEdge) => void
  removeEdge: (id: string) => void
  updateEdge: (id: string, patch: Partial<WorkflowEdge>) => void
  getChildNodes: (parentId: string) => WorkflowNode[]

  undo: () => void
  redo: () => void
  copySelectedNode: () => void
  pasteNode: () => void

  setAllAgentModels: (model: ModelConfig) => void
  importWorkflow: () => Promise<void>
  exportWorkflow: (id: string) => Promise<void>
  setWorkspacePath: (path: string) => void
  setSelectedNode: (id: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setTaskInput: (input: string) => void
}

function snapshot<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function makeWorkerData(overrides?: Partial<AgentNodeData>): AgentNodeData {
  return newAgentNodeData({
    name: 'Worker',
    roleDescription: 'Does the task',
    systemPrompt: '## Role\nYou are a skilled worker agent.\n\n## Objective\nComplete the given task thoroughly. If given reviewer feedback, revise accordingly.\n\n## Output format\nComplete, well-structured response.\n\n## Constraints\n- Be specific and actionable\n- Address all feedback points when revising',
    contextMode: 'full_chain',
    ...overrides,
  })
}

function makeReviewerData(overrides?: Partial<AgentNodeData>): AgentNodeData {
  return newAgentNodeData({
    name: 'Reviewer',
    roleDescription: 'Reviews and provides feedback',
    systemPrompt: '## Role\nYou are a critical reviewer.\n\n## Objective\nReview the worker\'s output and provide structured feedback.\n\n## Output format\nYour response MUST end with either:\n- "APPROVED" if the output is satisfactory\n- "NEEDS REVISION" followed by specific numbered feedback points\n\n## Constraints\n- Be constructive and specific\n- Only say APPROVED when genuinely satisfied',
    contextMode: 'full_chain',
    ...overrides,
  })
}

export const useWorkflowStore = create<WorkflowStore>()((set, get) => ({
  workflows: [],
  currentWorkflow: null,
  selectedNodeId: null,
  viewMode: 'canvas',
  taskInput: '',
  isLoading: false,
  _history: [],
  _historyIndex: -1,
  _copiedNode: null,
  canUndo: false,
  canRedo: false,

  loadWorkflows: async () => {
    set({ isLoading: true })
    try {
      const workflows = await tauri.getWorkflows()
      set({ workflows, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  setCurrentWorkflow: (workflow) => {
    set({ currentWorkflow: workflow, selectedNodeId: null, _history: [], _historyIndex: -1, canUndo: false, canRedo: false })
  },

  createWorkflow: async (name) => {
    const workflow = newWorkflow(name)
    await tauri.saveWorkflow(workflow)
    set((s) => ({ workflows: [...s.workflows, workflow], currentWorkflow: workflow }))
    return workflow
  },

  deleteWorkflow: async (id) => {
    await tauri.deleteWorkflow(id)
    set((s) => ({
      workflows: s.workflows.filter((w) => w.id !== id),
      currentWorkflow: s.currentWorkflow?.id === id ? null : s.currentWorkflow,
    }))
  },

  duplicateWorkflow: async (id) => {
    const original = get().workflows.find((w) => w.id === id)
    if (!original) return
    const copy: Workflow = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await tauri.saveWorkflow(copy)
    set((s) => ({ workflows: [...s.workflows, copy], currentWorkflow: copy }))
  },

  saveCurrentWorkflow: async () => {
    const { currentWorkflow } = get()
    if (!currentWorkflow) return
    const updated = { ...currentWorkflow, updatedAt: new Date().toISOString() }
    await tauri.saveWorkflow(updated)
    set((s) => ({
      currentWorkflow: updated,
      workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
    }))
  },

  updateWorkflowMeta: (patch) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const updated = { ...s.currentWorkflow, ...patch, updatedAt: new Date().toISOString() }
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
      }
    })
  },

  addNode: (node) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const snap = snapshot(s.currentWorkflow)
      const hist = [...s._history.slice(0, s._historyIndex + 1), snap].slice(-HISTORY_LIMIT)
      const updated = { ...s.currentWorkflow, nodes: [...s.currentWorkflow.nodes, node] }
      tauri.saveWorkflow(updated).catch(() => {})
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
        _history: hist,
        _historyIndex: hist.length - 1,
        canUndo: true,
        canRedo: false,
      }
    })
  },

  addLoopGroup: ({ groupId, workerId, reviewerId, position }) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const snap = snapshot(s.currentWorkflow)
      const hist = [...s._history.slice(0, s._historyIndex + 1), snap].slice(-HISTORY_LIMIT)

      const groupNode: WorkflowNode = {
        id: groupId,
        type: 'loop',
        position,
        data: {
          targetNodeId: workerId,
          reviewerNodeId: reviewerId,
          maxRetries: 3,
          exitCondition: 'reviewer_approves',
        } satisfies LoopNodeData,
      }

      const workerNode: WorkflowNode = {
        id: workerId,
        type: 'agent',
        position: { x: 30, y: 70 },
        parentId: groupId,
        extent: 'parent',
        data: makeWorkerData(),
      }

      const reviewerNode: WorkflowNode = {
        id: reviewerId,
        type: 'agent',
        position: { x: 234, y: 70 },
        parentId: groupId,
        extent: 'parent',
        data: makeReviewerData(),
      }

      const updated = {
        ...s.currentWorkflow,
        nodes: [...s.currentWorkflow.nodes, groupNode, workerNode, reviewerNode],
      }
      tauri.saveWorkflow(updated).catch(() => {})
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
        _history: hist,
        _historyIndex: hist.length - 1,
        canUndo: true,
        canRedo: false,
      }
    })
  },

  updateNode: (id, patch) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const snap = snapshot(s.currentWorkflow)
      const hist = [...s._history.slice(0, s._historyIndex + 1), snap].slice(-HISTORY_LIMIT)
      const nodes = s.currentWorkflow.nodes.map((n) =>
        n.id === id ? { ...n, ...patch } : n,
      )
      const updated = { ...s.currentWorkflow, nodes }
      tauri.saveWorkflow(updated).catch(() => {})
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
        _history: hist,
        _historyIndex: hist.length - 1,
        canUndo: true,
        canRedo: false,
      }
    })
  },

  removeNode: (id) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const snap = snapshot(s.currentWorkflow)
      const hist = [...s._history.slice(0, s._historyIndex + 1), snap].slice(-HISTORY_LIMIT)

      // Collect node + all children (for loop groups)
      const toRemove = new Set([id])
      for (const n of s.currentWorkflow.nodes) {
        if (n.parentId === id) toRemove.add(n.id)
      }

      const nodes = s.currentWorkflow.nodes.filter((n) => !toRemove.has(n.id))
      const edges = s.currentWorkflow.edges.filter(
        (e) => !toRemove.has(e.sourceNodeId) && !toRemove.has(e.targetNodeId),
      )
      const updated = { ...s.currentWorkflow, nodes, edges }
      tauri.saveWorkflow(updated).catch(() => {})
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
        selectedNodeId: toRemove.has(s.selectedNodeId ?? '') ? null : s.selectedNodeId,
        _history: hist,
        _historyIndex: hist.length - 1,
        canUndo: true,
        canRedo: false,
      }
    })
  },

  addEdge: (edge) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const exists = s.currentWorkflow.edges.some(
        (e) => e.sourceNodeId === edge.sourceNodeId && e.targetNodeId === edge.targetNodeId,
      )
      if (exists) return s
      const snap = snapshot(s.currentWorkflow)
      const hist = [...s._history.slice(0, s._historyIndex + 1), snap].slice(-HISTORY_LIMIT)
      const updated = { ...s.currentWorkflow, edges: [...s.currentWorkflow.edges, edge] }
      tauri.saveWorkflow(updated).catch(() => {})
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
        _history: hist,
        _historyIndex: hist.length - 1,
        canUndo: true,
        canRedo: false,
      }
    })
  },

  removeEdge: (id) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const snap = snapshot(s.currentWorkflow)
      const hist = [...s._history.slice(0, s._historyIndex + 1), snap].slice(-HISTORY_LIMIT)
      const updated = { ...s.currentWorkflow, edges: s.currentWorkflow.edges.filter((e) => e.id !== id) }
      tauri.saveWorkflow(updated).catch(() => {})
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
        _history: hist,
        _historyIndex: hist.length - 1,
        canUndo: true,
        canRedo: false,
      }
    })
  },

  updateEdge: (id, patch) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const edges = s.currentWorkflow.edges.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      )
      const updated = { ...s.currentWorkflow, edges }
      tauri.saveWorkflow(updated).catch(() => {})
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
      }
    })
  },

  getChildNodes: (parentId) => {
    return get().currentWorkflow?.nodes.filter((n) => n.parentId === parentId) ?? []
  },

  undo: () => {
    set((s) => {
      if (!s.canUndo || s._historyIndex < 0) return s
      const restored = s._history[s._historyIndex]
      const newIndex = s._historyIndex - 1
      tauri.saveWorkflow(restored).catch(() => {})
      return {
        currentWorkflow: restored,
        workflows: s.workflows.map((w) => (w.id === restored.id ? restored : w)),
        _historyIndex: newIndex,
        canUndo: newIndex >= 0,
        canRedo: true,
      }
    })
  },

  redo: () => {
    set((s) => {
      if (!s.canRedo) return s
      const newIndex = s._historyIndex + 1
      if (newIndex >= s._history.length) return s
      const nextState = s._history[newIndex + 1] ?? s._history[newIndex]
      if (!nextState) return s
      tauri.saveWorkflow(nextState).catch(() => {})
      return {
        currentWorkflow: nextState,
        workflows: s.workflows.map((w) => (w.id === nextState.id ? nextState : w)),
        _historyIndex: newIndex,
        canUndo: true,
        canRedo: newIndex + 1 < s._history.length - 1,
      }
    })
  },

  copySelectedNode: () => {
    const { selectedNodeId, currentWorkflow } = get()
    if (!selectedNodeId || !currentWorkflow) return
    const node = currentWorkflow.nodes.find((n) => n.id === selectedNodeId)
    if (node) set({ _copiedNode: snapshot(node) as WorkflowNode })
  },

  pasteNode: () => {
    const { _copiedNode, currentWorkflow } = get()
    if (!_copiedNode || !currentWorkflow) return
    const newNode: WorkflowNode = {
      ...(snapshot(_copiedNode) as WorkflowNode),
      id: crypto.randomUUID(),
      position: {
        x: (_copiedNode.position?.x ?? 200) + 40,
        y: (_copiedNode.position?.y ?? 200) + 40,
      },
    }
    get().addNode(newNode)
    set({ selectedNodeId: newNode.id })
  },

  setAllAgentModels: (model) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const snap = snapshot(s.currentWorkflow)
      const hist = [...s._history.slice(0, s._historyIndex + 1), snap].slice(-HISTORY_LIMIT)
      const nodes = s.currentWorkflow.nodes.map((n): WorkflowNode => {
        if (n.type !== 'agent') return n
        return { ...n, data: { ...(n.data as AgentNodeData), model: { ...model } } }
      })
      const updated = { ...s.currentWorkflow, nodes }
      tauri.saveWorkflow(updated).catch(() => {})
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
        _history: hist,
        _historyIndex: hist.length - 1,
        canUndo: true,
        canRedo: false,
      }
    })
  },

  importWorkflow: async () => {
    const result = await openDialog({
      filters: [{ name: 'Conductor Workflow', extensions: ['json'] }],
      multiple: false,
    })
    if (!result) return
    const filePath = typeof result === 'string' ? result : (result as string[])[0]
    const json = await tauri.readTextFile(filePath)
    const workflow = await tauri.importWorkflow(json)
    set((s) => ({ workflows: [...s.workflows, workflow], currentWorkflow: workflow }))
  },

  exportWorkflow: async (id) => {
    const workflow = get().workflows.find((w) => w.id === id)
    if (!workflow) return
    const dest = await saveDialog({
      defaultPath: `${workflow.name}.json`,
      filters: [{ name: 'Conductor Workflow', extensions: ['json'] }],
    })
    if (!dest) return
    await tauri.writeTextFile(dest, JSON.stringify(workflow, null, 2))
  },

  setWorkspacePath: (path) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const updated = {
        ...s.currentWorkflow,
        settings: { ...s.currentWorkflow.settings, workspacePath: path },
        updatedAt: new Date().toISOString(),
      }
      tauri.saveWorkflow(updated).catch(() => {})
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
      }
    })
  },
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setTaskInput: (input) => set({ taskInput: input }),
}))
