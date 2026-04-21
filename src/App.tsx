import { useEffect, useState } from 'react'
import { History, Play, Square, AlertTriangle, X, Sparkles } from 'lucide-react'
import { useWorkflowStore } from './stores/workflowStore'
import { useRunStore } from './stores/runStore'
import { useSettingsStore } from './stores/settingsStore'
import { useRun } from './hooks/useRun'
import Sidebar from './components/Sidebar'
import NewWorkflowModal from './components/workflow/NewWorkflowModal'
import WorkflowCanvas from './components/canvas/WorkflowCanvas'
import Inspector from './components/inspector/Inspector'
import RunDrawer from './components/run/RunDrawer'
import RunStartModal from './components/run/RunStartModal'
import RunHistoryDrawer from './components/run/RunHistoryDrawer'
import ReviewGateModal from './components/run/ReviewGateModal'
import ToolConfirmModal from './components/run/ToolConfirmModal'
import ResultModal from './components/run/ResultModal'
import SettingsPanel from './components/settings/SettingsPanel'

const SIDEBAR_DEFAULT = 192
const INSPECTOR_DEFAULT = 288
const DRAWER_DEFAULT = 300

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export default function App() {
  const { loadWorkflows, currentWorkflow, taskInput, setTaskInput } = useWorkflowStore()
  const { cancelRun, isRunning, currentRun, gateInfo, toolConfirmRequest, showResultModal, pendingRun, setPendingRun } = useRunStore()
  const { loadProviderStatuses, loadConfig, isOpen: settingsOpen } = useSettingsStore()

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT)
  const [drawerHeight, setDrawerHeight] = useState(DRAWER_DEFAULT)
  const [runError, setRunError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  useRun(currentRun?.id)

  useEffect(() => {
    loadWorkflows()
    loadProviderStatuses()
    loadConfig()
  }, [loadWorkflows, loadProviderStatuses, loadConfig])

  async function handleRun() {
    if (!currentWorkflow || !taskInput.trim() || isRunning) return

    const agents = currentWorkflow.nodes.filter(n => n.type === 'agent')
    if (agents.length === 0) {
      setRunError('Your workforce has no agents yet. Add at least one Agent node to the canvas first.')
      return
    }

    const badLoop = currentWorkflow.nodes.find(n => {
      if (n.type !== 'loop') return false
      const d = n.data as import('./types').LoopNodeData
      return !d.targetNodeId || !d.reviewerNodeId
    })
    if (badLoop) {
      setRunError("A Loop node isn't fully set up. Click it and assign both a Worker and a Reviewer agent.")
      return
    }

    const unconfiguredAll = agents.every(n => {
      const d = n.data as import('./types').AgentNodeData
      return !d.systemPrompt?.trim()
    })
    if (unconfiguredAll) {
      setRunError("None of your agents have instructions yet. Click an agent and write a prompt, or load a template.")
      return
    }

    setRunError(null)
    setPendingRun({ workflowId: currentWorkflow.id, input: taskInput })
  }

  return (
    <div className="flex h-screen bg-[#0f0f12] text-white overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="shrink-0 h-full" style={{ width: sidebarWidth }}>
        <Sidebar />
      </div>

      <DragHandle
        direction="h"
        onDelta={(d) => setSidebarWidth((w) => clamp(w + d, 120, 400))}
      />

      {/* ── Center column ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Workflow header bar */}
        <div className="h-11 bg-[#0a0a0d] border-b border-white/5 flex items-center px-4 gap-3 shrink-0 relative">
          <span className="text-sm font-medium text-white/70 truncate min-w-0">
            {currentWorkflow?.name ?? 'No workflow selected'}
          </span>

          {currentWorkflow && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setShowHistory((v) => !v)}
                title="View run history"
                className="text-xs text-white/30 hover:text-white/60 hover:bg-white/5 px-2 py-1 rounded-md transition-colors flex items-center gap-1.5"
              >
                <History size={12} /> History
              </button>
              <input
                className="w-64 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/70 outline-none focus:border-purple-500/50 placeholder:text-white/25"
                placeholder="Describe your task..."
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRun()}
                disabled={isRunning}
              />

              {isRunning ? (
                <button
                  onClick={cancelRun}
                  className="bg-red-700/80 hover:bg-red-600 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
                >
                  <Square size={12} className="inline mr-1" fill="currentColor" />Cancel
                </button>
              ) : (
                <button
                  onClick={handleRun}
                  disabled={!taskInput.trim()}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
                >
                  <Play size={12} className="inline mr-1" fill="currentColor" />Run
                </button>
              )}
            </div>
          )}
          {runError && (
            <div className="absolute top-full left-0 right-0 mt-1 mx-4 bg-red-500/15 border border-red-500/25 rounded-lg px-3 py-2 text-xs text-red-300 z-20 flex items-center gap-2">
              <AlertTriangle size={13} className="shrink-0" />
              <span>{runError}</span>
              <button onClick={() => setRunError(null)} className="ml-auto text-red-400/50 hover:text-red-400"><X size={13} /></button>
            </div>
          )}
        </div>

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {!currentWorkflow ? (
              <EmptyState />
            ) : (
              <WorkflowCanvas />
            )}
          </div>

          {currentWorkflow && (
            <>
              <DragHandle
                direction="h"
                onDelta={(d) => setInspectorWidth((w) => clamp(w - d, 200, 520))}
              />
              <div className="shrink-0 h-full" style={{ width: inspectorWidth }}>
                <Inspector />
              </div>
            </>
          )}
        </div>

        {/* Run drawer */}
        {currentRun && (
          <>
            <DragHandle
              direction="v"
              onDelta={(d) => setDrawerHeight((h) => clamp(h - d, 80, 640))}
            />
            <RunDrawer height={drawerHeight} />
          </>
        )}
      </div>

      {showHistory && currentWorkflow && (
        <RunHistoryDrawer workflowId={currentWorkflow.id} onClose={() => setShowHistory(false)} />
      )}
      {pendingRun && <RunStartModal />}
      {gateInfo && <ReviewGateModal />}
      {toolConfirmRequest && <ToolConfirmModal />}
      {showResultModal && <ResultModal />}
      {settingsOpen && <SettingsPanel />}
    </div>
  )
}

// ── Drag handle ──────────────────────────────────────────────────
function DragHandle({ direction, onDelta }: { direction: 'h' | 'v'; onDelta: (d: number) => void }) {
  const isH = direction === 'h'

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    let prev = isH ? e.clientX : e.clientY

    function onMove(ev: MouseEvent) {
      const curr = isH ? ev.clientX : ev.clientY
      onDelta(curr - prev)
      prev = curr
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = isH ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className={`group shrink-0 flex items-center justify-center hover:bg-purple-500/10 transition-colors z-10 ${
        isH ? 'w-1.5 h-full cursor-col-resize' : 'h-1.5 w-full cursor-row-resize'
      }`}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`bg-white/8 group-hover:bg-purple-400/40 transition-colors rounded-full ${
          isH ? 'w-px h-10' : 'h-px w-10'
        }`}
      />
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────
function EmptyState() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center gap-6 text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center text-3xl">
        <Sparkles size={28} className="text-purple-400/60" />
      </div>
      <div className="max-w-sm">
        <p className="text-lg font-semibold text-white/80 mb-2">Build your AI workforce</p>
        <p className="text-sm text-white/35 leading-relaxed">
          Create a workflow and fill it with AI agents — each one a specialist employee that does exactly what you tell it to. Chain them together and run any task, start to finish.
        </p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setShowModal(true)}
          className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
        >
          + Create a Workflow
        </button>
        <p className="text-[11px] text-white/20">Start from a template or build from scratch</p>
      </div>
      {showModal && <NewWorkflowModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
