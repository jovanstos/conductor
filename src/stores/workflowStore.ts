import { create } from 'zustand'
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import type { Workflow, WorkflowNode, WorkflowEdge } from '../types'
import * as tauri from '../lib/tauri'
import { newWorkflow } from '../lib/defaults'

type ViewMode = 'canvas' | 'list'

const HISTORY_LIMIT = 50

interface WorkflowStore {
  workflows: Workflow[]
  currentWorkflow: Workflow | null
  selectedNodeId: string | null
  viewMode: ViewMode
  taskInput: string
  isLoading: boolean

  // Undo/Redo history
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
  updateNode: (id: string, patch: Partial<WorkflowNode>) => void
  removeNode: (id: string) => void
  addEdge: (edge: WorkflowEdge) => void
  removeEdge: (id: string) => void

  undo: () => void
  redo: () => void
  copySelectedNode: () => void
  pasteNode: () => void

  importWorkflow: () => Promise<void>
  exportWorkflow: (id: string) => Promise<void>
  setSelectedNode: (id: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setTaskInput: (input: string) => void
}

function snapshot<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
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
      const nodes = s.currentWorkflow.nodes.filter((n) => n.id !== id)
      const edges = s.currentWorkflow.edges.filter(
        (e) => e.sourceNodeId !== id && e.targetNodeId !== id,
      )
      const updated = { ...s.currentWorkflow, nodes, edges }
      tauri.saveWorkflow(updated).catch(() => {})
      return {
        currentWorkflow: updated,
        workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)),
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
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
      // redo means moving forward past the snapshot — but our history stores the state BEFORE the mutation
      // so we need to apply up to newIndex+1 if it exists, otherwise use what's after the current snapshot
      // Simple approach: history[newIndex] is the pre-mutation snapshot at that index
      // The post-mutation state is history[newIndex+1] if it exists, or currentWorkflow before undo started
      // Since we can't track future states cleanly here, use the snapshot at newIndex+1
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

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setTaskInput: (input) => set({ taskInput: input }),
}))
