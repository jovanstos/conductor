import { create } from 'zustand'
import type { Workflow, WorkflowNode, WorkflowEdge } from '../types'
import * as tauri from '../lib/tauri'
import { newWorkflow } from '../lib/defaults'

type ViewMode = 'canvas' | 'list'

interface WorkflowStore {
  workflows: Workflow[]
  currentWorkflow: Workflow | null
  selectedNodeId: string | null
  viewMode: ViewMode
  taskInput: string
  isLoading: boolean

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

  setSelectedNode: (id: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setTaskInput: (input: string) => void
}

export const useWorkflowStore = create<WorkflowStore>()((set, get) => ({
  workflows: [],
  currentWorkflow: null,
  selectedNodeId: null,
  viewMode: 'canvas',
  taskInput: '',
  isLoading: false,

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
    set({ currentWorkflow: workflow, selectedNodeId: null })
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
      const updated = { ...s.currentWorkflow, nodes: [...s.currentWorkflow.nodes, node] }
      tauri.saveWorkflow(updated).catch(() => {})
      return { currentWorkflow: updated, workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)) }
    })
  },

  updateNode: (id, patch) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const nodes = s.currentWorkflow.nodes.map((n) =>
        n.id === id ? { ...n, ...patch } : n,
      )
      const updated = { ...s.currentWorkflow, nodes }
      tauri.saveWorkflow(updated).catch(() => {})
      return { currentWorkflow: updated, workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)) }
    })
  },

  removeNode: (id) => {
    set((s) => {
      if (!s.currentWorkflow) return s
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
      }
    })
  },

  addEdge: (edge) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      // Prevent duplicate edges between same nodes
      const exists = s.currentWorkflow.edges.some(
        (e) => e.sourceNodeId === edge.sourceNodeId && e.targetNodeId === edge.targetNodeId,
      )
      if (exists) return s
      const updated = { ...s.currentWorkflow, edges: [...s.currentWorkflow.edges, edge] }
      tauri.saveWorkflow(updated).catch(() => {})
      return { currentWorkflow: updated, workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)) }
    })
  },

  removeEdge: (id) => {
    set((s) => {
      if (!s.currentWorkflow) return s
      const updated = { ...s.currentWorkflow, edges: s.currentWorkflow.edges.filter((e) => e.id !== id) }
      tauri.saveWorkflow(updated).catch(() => {})
      return { currentWorkflow: updated, workflows: s.workflows.map((w) => (w.id === updated.id ? updated : w)) }
    })
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setTaskInput: (input) => set({ taskInput: input }),
}))
