import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { X, RefreshCw, ArrowRight, Check, Zap, CornerDownLeft } from 'lucide-react'
import type { LoopNodeData, AgentNodeData, RunStep } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'

export default memo(function LoopNode({ id, data }: NodeProps) {
  const d = data as unknown as LoopNodeData
  const { selectedNodeId, setSelectedNode, removeNode, currentWorkflow } = useWorkflowStore()
  const { currentRun } = useRunStore()

  const targetNode   = currentWorkflow?.nodes.find((n) => n.id === d.targetNodeId)
  const reviewerNode = currentWorkflow?.nodes.find((n) => n.id === d.reviewerNodeId)

  const workerName   = (targetNode?.data   as AgentNodeData | undefined)?.name ?? '— not set —'
  const reviewerName = (reviewerNode?.data as AgentNodeData | undefined)?.name ?? '— not set —'

  const workerStep   = currentRun?.steps.filter((s) => s.nodeId === d.targetNodeId).at(-1)
  const reviewerStep = currentRun?.steps.filter((s) => s.nodeId === d.reviewerNodeId).at(-1)

  const isConfigured = !!d.targetNodeId && !!d.reviewerNodeId
  const isSelected   = selectedNodeId === id

  const isWorkerRunning   = workerStep?.status === 'running'
  const isReviewerRunning = reviewerStep?.status === 'running'
  const isLoopRunning     = isWorkerRunning || isReviewerRunning
  const isLoopDone        = workerStep?.status === 'done' && !isReviewerRunning

  const borderColor = isLoopRunning
    ? 'border-amber-400/70'
    : isLoopDone
      ? 'border-emerald-500/40'
      : isSelected
        ? 'border-amber-500/60'
        : isConfigured
          ? 'border-amber-500/30'
          : 'border-amber-500/15'

  const bgColor = isLoopRunning
    ? 'bg-[#1a1608]'
    : isLoopDone
      ? 'bg-[#0f1a10]'
      : 'bg-[#111110]'

  return (
    <div
      className={`w-80 rounded-xl border transition-colors cursor-pointer group relative ${borderColor} ${bgColor}`}
      onClick={() => setSelectedNode(id)}
    >
      {/* Delete button */}
      <button
        className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-[#1a1a22] border border-white/15 text-white/30 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => { e.stopPropagation(); removeNode(id) }}
        title="Delete node"
      >
        <X size={10} />
      </button>

      {/* IN label */}
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-mono text-amber-400/25 pointer-events-none select-none">
        IN
      </span>

      <Handle
        type="target"
        position={Position.Left}
        className="!bg-amber-500/50 !border-amber-400/30 !w-3 !h-3"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-amber-500/10">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isLoopRunning ? 'bg-amber-500/20' : 'bg-amber-500/10'}`}>
            <RefreshCw
              size={12}
              className={`text-amber-400 ${isLoopRunning ? 'animate-spin' : ''}`}
              style={isLoopRunning ? { animationDuration: '1.5s' } : undefined}
            />
          </div>
          <span className="text-[12px] font-semibold text-white/80">Feedback Loop</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-amber-400/40">up to {d.maxRetries}×</span>
          {isLoopDone && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-0.5">
              <Check size={8} /> done
            </span>
          )}
        </div>
      </div>

      {/* Internal flow diagram */}
      <div className="px-3.5 py-3">
        <div className="flex items-stretch gap-2">
          {/* Worker box */}
          <AgentBox
            label="WORKER"
            name={workerName}
            configured={!!d.targetNodeId}
            step={workerStep}
            accent="purple"
          />

          {/* Arrow column */}
          <div className="flex flex-col items-center justify-between py-1 shrink-0 gap-1">
            <ArrowRight size={10} className="text-amber-400/50 mt-1" />
            <CornerDownLeft size={9} className="text-red-400/30 rotate-180 mb-1" />
          </div>

          {/* Reviewer box */}
          <AgentBox
            label="REVIEWER"
            name={reviewerName}
            configured={!!d.reviewerNodeId}
            step={reviewerStep}
            accent="sky"
          />
        </div>

        {/* Live phase label */}
        {isWorkerRunning && (
          <p className="mt-2 text-center text-[9px] text-purple-400/60">Worker generating…</p>
        )}
        {isReviewerRunning && (
          <p className="mt-2 text-center text-[9px] text-sky-400/60">Reviewer checking worker output…</p>
        )}

        {/* Footer: exit condition + output ownership */}
        <div className="mt-2.5 pt-2 border-t border-amber-500/8 flex items-center justify-between">
          <span className="text-[9px] text-amber-400/35">
            {d.exitCondition === 'reviewer_approves' ? '⊕ exits on approval' : `⊕ always runs ${d.maxRetries}×`}
          </span>
          <span className="text-[9px] text-white/20 flex items-center gap-1">
            OUT <ArrowRight size={8} className="inline" /> worker result
          </span>
        </div>

        {!isConfigured && (
          <p className="mt-1.5 text-[9px] text-amber-400/40 text-center italic">
            Click to assign agents in the right panel
          </p>
        )}
      </div>

      {/* OUT label */}
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-mono text-emerald-400/25 pointer-events-none select-none">
        OUT
      </span>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-emerald-500/50 !border-emerald-400/30 !w-3 !h-3"
      />
    </div>
  )
})

function AgentBox({
  label,
  name,
  configured,
  step,
  accent,
}: {
  label: string
  name: string
  configured: boolean
  step: RunStep | undefined
  accent: 'purple' | 'sky'
}) {
  const isRunning = step?.status === 'running'
  const isDone    = step?.status === 'done'

  const borderClass = isRunning
    ? accent === 'purple' ? 'border-purple-500/60' : 'border-sky-500/60'
    : isDone
      ? 'border-emerald-500/30'
      : accent === 'purple' ? 'border-purple-500/20' : 'border-sky-500/20'

  const labelClass = accent === 'purple' ? 'text-purple-400/50' : 'text-sky-400/50'

  return (
    <div className={`flex-1 border rounded-lg p-2 min-w-0 ${borderClass} bg-black/20 transition-colors`}>
      <div className={`text-[8px] font-mono ${labelClass} mb-0.5 flex items-center gap-1`}>
        {isRunning && <Zap size={7} className="animate-pulse" />}
        {isDone    && <Check size={7} className="text-emerald-400/60" />}
        {label}
      </div>
      <div className={`text-[11px] truncate ${configured ? 'text-white/65' : 'text-amber-400/35 italic'}`}>
        {name}
      </div>
      {step?.output && (
        <p className="mt-1 text-[9px] text-white/30 line-clamp-2 leading-relaxed">{step.output}</p>
      )}
    </div>
  )
}
