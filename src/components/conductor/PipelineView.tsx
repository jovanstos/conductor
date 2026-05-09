import { useState } from 'react'
import { Plus, Play, Square, Folder, RotateCcw } from 'lucide-react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { getOrderedSteps, appendAgentToPipeline, appendLoopToPipeline, removeStepFromPipeline, moveStepUp, moveStepDown } from '../../lib/pipelineUtils'
import AgentCard from './AgentCard'
import AgentConfigPanel from './AgentConfigPanel'

export default function PipelineView({ onError }: { onError?: (msg: string) => void }) {
  const {
    currentWorkflow, applyWorkflowPatch, setWorkspacePath,
    taskInput, setTaskInput,
  } = useWorkflowStore()
  const { startRun, cancelRun, isRunning, currentRun } = useRunStore()
  const { defaultModel } = useSettingsStore()
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)

  if (!currentWorkflow) return null

  const steps = getOrderedSteps(currentWorkflow)
  const selectedNode = selectedNodeId ? currentWorkflow.nodes.find((n) => n.id === selectedNodeId) : null

  function applyPatch(newWorkflow: typeof currentWorkflow) {
    applyWorkflowPatch(newWorkflow.nodes, newWorkflow.edges)
  }

  function handleAddAgent() {
    const updated = appendAgentToPipeline(currentWorkflow, undefined, defaultModel)
    applyPatch(updated)
    const newSteps = getOrderedSteps(updated)
    if (newSteps.length > 0) setSelectedNodeId(newSteps[newSteps.length - 1].id)
    setShowAddMenu(false)
  }

  function handleAddLoop() {
    const updated = appendLoopToPipeline(currentWorkflow, defaultModel)
    applyPatch(updated)
    setShowAddMenu(false)
  }

  function handleRemove(nodeId: string) {
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    const updated = removeStepFromPipeline(currentWorkflow, nodeId)
    applyPatch(updated)
  }

  function handleMoveUp(nodeId: string) {
    applyPatch(moveStepUp(currentWorkflow, nodeId))
  }

  function handleMoveDown(nodeId: string) {
    applyPatch(moveStepDown(currentWorkflow, nodeId))
  }

  async function handleRun() {
    if (!currentWorkflow || !taskInput.trim() || isRunning || isStarting) return

    const agents = currentWorkflow.nodes.filter((n) => n.type === 'agent')
    if (agents.length === 0) {
      onError?.('Add at least one agent to the pipeline first.')
      return
    }

    let workspace = currentWorkflow.settings?.workspacePath
    if (!workspace) {
      const selected = await openDialog({ directory: true, multiple: false, title: 'Select Workspace Directory' })
      if (!selected || typeof selected !== 'string') return
      setWorkspacePath(selected)
      workspace = selected
    }

    setIsStarting(true)
    try {
      await startRun(currentWorkflow.id, taskInput, workspace)
    } catch (e: unknown) {
      onError?.(String(e))
    } finally {
      setIsStarting(false)
    }
  }

  async function handlePickWorkspace() {
    const selected = await openDialog({ directory: true, multiple: false, title: 'Select Workspace Directory' })
    if (selected && typeof selected === 'string') setWorkspacePath(selected)
  }

  const runStepMap = new Map(currentRun?.steps.map((s) => [s.nodeId, s]) ?? [])

  return (
    <div className="h-full flex overflow-hidden">
      {/* Pipeline area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className="shrink-0 flex items-center gap-3 px-5 py-4 border-b"
          style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
        >
          {/* Workflow name */}
          <h2 className="text-base font-bold truncate" style={{ color: 'var(--c-text-1)' }}>
            {currentWorkflow.name}
          </h2>

          <div className="h-5 w-px mx-1" style={{ background: 'var(--c-border)' }} />

          {/* Task input — bigger */}
          <input
            className="flex-1 conductor-input px-4 py-2.5 text-base"
            placeholder="Describe the task for your agents…"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRun()}
            disabled={isRunning || isStarting}
            style={{ minWidth: '220px', maxWidth: '480px' }}
          />

          {/* Workspace */}
          <button
            onClick={handlePickWorkspace}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors"
            style={{ background: 'var(--c-card)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
            title={currentWorkflow.settings?.workspacePath ?? 'No workspace selected'}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-accent-border)'; e.currentTarget.style.color = 'var(--c-accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-2)' }}
          >
            <Folder size={15} />
            <span className="max-w-[140px] truncate">
              {currentWorkflow.settings?.workspacePath
                ? currentWorkflow.settings.workspacePath.split(/[\\/]/).pop()
                : 'Pick workspace'}
            </span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={cancelRun}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
                style={{ background: 'var(--c-red-dim)', color: 'var(--c-red)', border: '1px solid rgba(248,113,113,0.35)' }}
              >
                <Square size={14} fill="currentColor" /> Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={!taskInput.trim() || isStarting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
                style={{
                  background: 'var(--c-accent)',
                  color: '#000',
                }}
              >
                <Play size={14} fill="currentColor" />
                {isStarting ? 'Starting…' : 'Run'}
              </button>
            )}
          </div>
        </div>

        {/* Pipeline content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {steps.length === 0 ? (
            <EmptyPipeline onAddAgent={handleAddAgent} onAddLoop={handleAddLoop} />
          ) : (
            <div className="max-w-2xl mx-auto space-y-0">
              {/* Start indicator */}
              <div className="flex items-center gap-3 mb-1 px-2">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--c-text-3)' }} />
                <span className="text-xs font-mono-accent" style={{ color: 'var(--c-text-3)' }}>START</span>
                <div className="flex-1 h-px" style={{ background: 'var(--c-border-subtle)' }} />
                <span className="text-xs" style={{ color: 'var(--c-text-dim)' }}>{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Steps */}
              {steps.map((step, idx) => (
                <AgentCard
                  key={step.id}
                  node={step}
                  index={idx}
                  totalSteps={steps.length}
                  isFirst={idx === 0}
                  isLast={idx === steps.length - 1}
                  runStep={runStepMap.get(step.id)}
                  streamChunk={currentRun?.steps.find((s) => s.nodeId === step.id)?.output}
                  onConfigure={() => setSelectedNodeId(step.id === selectedNodeId ? null : step.id)}
                  onMoveUp={() => handleMoveUp(step.id)}
                  onMoveDown={() => handleMoveDown(step.id)}
                  onRemove={() => handleRemove(step.id)}
                />
              ))}

              {/* Connector to end */}
              <div className="flex justify-center" style={{ height: '20px' }}>
                <div className="w-px" style={{ background: 'var(--c-border)' }} />
              </div>

              {/* End indicator */}
              <div className="flex items-center gap-3 px-2">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--c-text-3)' }} />
                <span className="text-xs font-mono-accent" style={{ color: 'var(--c-text-3)' }}>END</span>
              </div>

              {/* Add step buttons — MUCH bigger */}
              <div className="mt-8 flex gap-3">
                <button
                  onClick={handleAddAgent}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-base font-semibold transition-all"
                  style={{ background: 'var(--c-card)', color: 'var(--c-text-1)', border: '1px solid var(--c-border)' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--c-accent-border)'
                    e.currentTarget.style.background = 'var(--c-accent-dim)'
                    e.currentTarget.style.color = 'var(--c-accent)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--c-border)'
                    e.currentTarget.style.background = 'var(--c-card)'
                    e.currentTarget.style.color = 'var(--c-text-1)'
                  }}
                >
                  <Plus size={18} /> Add Agent
                </button>
                <button
                  onClick={handleAddLoop}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-base font-semibold transition-all"
                  style={{ background: 'var(--c-card)', color: 'var(--c-text-1)', border: '1px solid var(--c-border)' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(245,158,11,0.45)'
                    e.currentTarget.style.background = 'var(--c-loop-dim)'
                    e.currentTarget.style.color = 'var(--c-loop)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--c-border)'
                    e.currentTarget.style.background = 'var(--c-card)'
                    e.currentTarget.style.color = 'var(--c-text-1)'
                  }}
                >
                  <RotateCcw size={18} /> Add Loop
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Config panel — slide in from right */}
      {selectedNode && (
        <>
          <div className="w-px shrink-0" style={{ background: 'var(--c-border)' }} />
          <div className="w-80 shrink-0 overflow-hidden">
            <AgentConfigPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} />
          </div>
        </>
      )}
    </div>
  )
}

function EmptyPipeline({ onAddAgent, onAddLoop }: { onAddAgent: () => void; onAddLoop: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 text-center max-w-md mx-auto py-16">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}
      >
        <Play size={26} style={{ color: 'var(--c-accent)' }} />
      </div>
      <div>
        <p className="text-xl font-bold mb-2" style={{ color: 'var(--c-text-1)' }}>
          Empty pipeline
        </p>
        <p className="text-base leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Add agents to build your workflow. Each agent runs in sequence, passing its output to the next step.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onAddAgent}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-bold transition-all"
          style={{ background: 'var(--c-accent)', color: '#000' }}
        >
          <Plus size={18} /> Add Agent
        </button>
        <button
          onClick={onAddLoop}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold transition-all"
          style={{ background: 'var(--c-loop-dim)', color: 'var(--c-loop)', border: '1px solid rgba(245,158,11,0.45)' }}
        >
          <RotateCcw size={18} /> Add Loop
        </button>
      </div>
    </div>
  )
}
