import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AgentNodeData, LoopNodeData } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'

export default memo(function AgentNode({ id, data }: NodeProps) {
  const d = data as unknown as AgentNodeData
  const { selectedNodeId, setSelectedNode, removeNode, currentWorkflow } = useWorkflowStore()
  const { currentRun } = useRunStore()

  const step = currentRun?.steps.filter((s) => s.nodeId === id).at(-1)
  const status = step?.status ?? 'idle'

  // Find which loop this agent belongs to (if any)
  const loopMembership = currentWorkflow?.nodes.find(
    (n) => n.type === 'loop' && ((n.data as LoopNodeData).targetNodeId === id || (n.data as LoopNodeData).reviewerNodeId === id),
  )
  const loopRole =
    loopMembership
      ? (loopMembership.data as LoopNodeData).targetNodeId === id
        ? 'worker'
        : 'reviewer'
      : null

  const isSelected = selectedNodeId === id
  const isRunning = status === 'running'
  const isDone = status === 'done'
  const isError = status === 'error'
  const needsSetup = !d.systemPrompt?.trim() && !isRunning && !isDone

  const borderColor = isRunning
    ? 'border-purple-500/70'
    : isDone
      ? 'border-green-500/50'
      : isError
        ? 'border-red-500/50'
        : isSelected
          ? 'border-purple-400/60'
          : needsSetup
            ? 'border-amber-500/30'
            : 'border-white/10'

  const bgColor = isRunning
    ? 'bg-[#1c1626]'
    : isDone
      ? 'bg-[#111a13]'
      : isError
        ? 'bg-[#1a1212]'
        : 'bg-[#141418]'

  return (
    <div
      className={`w-48 rounded-xl border-2 ${borderColor} ${bgColor} cursor-pointer transition-all shadow-lg group relative`}
      onClick={() => setSelectedNode(id)}
    >
      {/* Delete button */}
      <button
        className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-[#1a1a22] border border-white/15 text-white/30 hover:text-red-400 hover:border-red-500/40 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => { e.stopPropagation(); removeNode(id) }}
        title="Delete node"
      >
        ✕
      </button>

      {/* Loop membership badge */}
      {loopRole && (
        <div className="absolute -top-2.5 left-2 bg-amber-500/20 border border-amber-500/30 text-amber-400/80 text-[9px] px-1.5 py-0.5 rounded-full">
          {loopRole === 'worker' ? '↻ works in loop' : '↻ reviews in loop'}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        className="!bg-purple-500/40 !border-purple-500/20 !w-2.5 !h-2.5"
      />

      <div className="p-3.5">
        {/* Header */}
        <div className="flex items-start gap-2.5 mb-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 ${
              isRunning ? 'bg-purple-500/25 animate-pulse' : isDone ? 'bg-green-500/15' : 'bg-purple-500/12'
            }`}
          >
            {isRunning ? '⚡' : isDone ? '✓' : '✦'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/90 truncate">{d.name}</p>
            <p className="text-[11px] text-white/40 truncate">{d.roleDescription || 'AI Agent'}</p>
          </div>
        </div>

        {/* Status + model */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background:
                  d.model?.provider === 'anthropic' ? '#a78bfa' :
                  d.model?.provider === 'openai' ? '#34d399' :
                  d.model?.provider === 'ollama' ? '#fb923c' : '#60a5fa',
              }}
            />
            <span className="text-[10px] text-white/25 truncate max-w-[90px]">
              {d.model?.modelId?.split('-').slice(0, 2).join('-') ?? 'model'}
            </span>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Token count after completion */}
        {isDone && step?.tokensUsed && (
          <div className="mt-1.5 flex justify-end">
            <span className="text-[9px] text-white/20 tabular-nums">
              {step.tokensUsed.toLocaleString()} tokens
            </span>
          </div>
        )}

        {/* Output preview */}
        {step?.output && (
          <div className="mt-2.5 border-t border-white/6 pt-2">
            <p className="text-[10px] text-white/45 line-clamp-3 leading-relaxed">{step.output}</p>
          </div>
        )}

        {isRunning && !step?.output && (
          <div className="mt-2.5 border-t border-white/6 pt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.15s]" />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.3s]" />
            <span className="text-[10px] text-purple-300/60 ml-1">Thinking...</span>
          </div>
        )}

        {needsSetup && (
          <div className="mt-2 border-t border-amber-500/10 pt-2">
            <p className="text-[9px] text-amber-400/50">Click to add instructions</p>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-purple-500/40 !border-purple-500/20 !w-2.5 !h-2.5"
      />
    </div>
  )
})

function StatusBadge({ status }: { status: string }) {
  if (status === 'done')
    return <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">✓ done</span>
  if (status === 'running')
    return <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 animate-pulse">working</span>
  if (status === 'error')
    return <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">error</span>
  return <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-white/25">idle</span>
}
