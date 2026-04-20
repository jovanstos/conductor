import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { X, RefreshCw, Check } from 'lucide-react'
import type { LoopNodeData } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'

// Group dimensions — must match the style applied in toRFNode()
export const LOOP_GROUP_W = 560
export const LOOP_GROUP_H = 260

export default memo(function LoopGroupNode({ id, data }: NodeProps) {
  const d = data as unknown as LoopNodeData
  const { selectedNodeId, setSelectedNode, removeNode } = useWorkflowStore()
  const { currentRun } = useRunStore()

  const workerStep   = currentRun?.steps.filter((s) => s.nodeId === d.targetNodeId).at(-1)
  const reviewerStep = currentRun?.steps.filter((s) => s.nodeId === d.reviewerNodeId).at(-1)

  const isWorkerRunning   = workerStep?.status   === 'running'
  const isReviewerRunning = reviewerStep?.status === 'running'
  const isLoopRunning     = isWorkerRunning || isReviewerRunning
  const isLoopDone        = workerStep?.status === 'done' && !isReviewerRunning

  const isSelected = selectedNodeId === id

  const borderColor = isLoopRunning
    ? 'border-amber-400/60'
    : isLoopDone
      ? 'border-emerald-500/35'
      : isSelected
        ? 'border-amber-500/55'
        : 'border-amber-500/20'

  const bgColor = isLoopRunning
    ? 'bg-amber-500/4'
    : isLoopDone
      ? 'bg-emerald-500/3'
      : 'bg-[#0f0e09]/80'

  // Child agent card geometry (relative to group top-left)
  // Worker: x=30, y=70   width=256  height=160 (w-64)
  // Reviewer: x=274, y=70
  const W_LEFT   = 30   + 256  // right edge of worker
  const W_MID_Y  = 70  + 80  // vertical midpoint of worker
  const R_LEFT   = 274              // left edge of reviewer
  const R_MID_Y  = W_MID_Y
  const R_RIGHT  = 274 + 256       // right edge of reviewer
  const W_BOT_Y  = 70  + 150
  const R_BOT_Y  = W_BOT_Y

  return (
    <div
      className={`rounded-2xl border-2 transition-colors cursor-pointer group relative ${borderColor} ${bgColor}`}
      style={{ width: LOOP_GROUP_W, height: LOOP_GROUP_H }}
      onClick={(e) => { e.stopPropagation(); setSelectedNode(id) }}
    >
      {/* Delete button */}
      <button
        className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-[#1a1a22] border border-white/15 text-white/30 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => { e.stopPropagation(); removeNode(id) }}
        title="Delete loop group"
      >
        <X size={10} />
      </button>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-10 px-4 flex items-center gap-2 border-b border-amber-500/10">
        <div className={`w-5 h-5 rounded-md flex items-center justify-center ${isLoopRunning ? 'bg-amber-500/20' : 'bg-amber-500/10'}`}>
          <RefreshCw
            size={11}
            className={`text-amber-400 ${isLoopRunning ? 'animate-spin' : ''}`}
            style={isLoopRunning ? { animationDuration: '1.5s' } : undefined}
          />
        </div>
        <span className="text-[11px] font-semibold text-white/70">Feedback Loop</span>
        <span className="text-[9px] text-amber-400/40">up to {d.maxRetries}×</span>
        <span className="text-[9px] text-amber-400/30 ml-auto">
          {d.exitCondition === 'reviewer_approves' ? 'exits on approval' : `always runs ${d.maxRetries}×`}
        </span>
        {isLoopDone && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-0.5 ml-1">
            <Check size={7} /> done
          </span>
        )}
      </div>

      {/* Agent slot labels */}
      <span className="absolute text-[8px] font-mono text-purple-400/40 pointer-events-none select-none" style={{ left: 30, top: 54 }}>
        WORKER
      </span>
      <span className="absolute text-[8px] font-mono text-sky-400/40 pointer-events-none select-none" style={{ left: 274, top: 54 }}>
        REVIEWER
      </span>

      {/* Internal flow arrows — SVG overlay, non-interactive */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <defs>
          <marker id={`loop-fwd-${id}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(245,158,11,0.5)" />
          </marker>
          <marker id={`loop-back-${id}`} markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(239,68,68,0.3)" />
          </marker>
        </defs>

        {/* Forward arrow: worker → reviewer */}
        <line
          x1={W_LEFT}
          y1={W_MID_Y}
          x2={R_LEFT}
          y2={R_MID_Y}
          stroke="rgba(245,158,11,0.4)"
          strokeWidth={1.5}
          markerEnd={`url(#loop-fwd-${id})`}
        />

        {/* Feedback arc: reviewer bottom → worker bottom */}
        <path
          d={`M ${R_RIGHT} ${R_BOT_Y} C ${R_RIGHT + 30} ${R_BOT_Y + 55} ${W_LEFT - 230} ${W_BOT_Y + 55} ${W_LEFT - 256} ${W_BOT_Y}`}
          fill="none"
          stroke="rgba(239,68,68,0.25)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          markerEnd={`url(#loop-back-${id})`}
        />
      </svg>

      {/* Live phase label */}
      {isWorkerRunning && (
        <span className="absolute bottom-3 left-0 right-0 text-center text-[9px] text-purple-400/60 pointer-events-none">
          Worker generating…
        </span>
      )}
      {isReviewerRunning && (
        <span className="absolute bottom-3 left-0 right-0 text-center text-[9px] text-sky-400/60 pointer-events-none">
          Reviewer checking…
        </span>
      )}

      {/* External handles */}
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-mono text-amber-400/25 pointer-events-none select-none">
        ctx
      </span>
      <Handle
        type="target"
        position={Position.Left}
        id="context"
        className="!bg-amber-500/50 !border-amber-400/30 !w-3 !h-3"
      />

      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-mono text-emerald-400/25 pointer-events-none select-none">
        out
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id="result"
        className="!bg-emerald-500/50 !border-emerald-400/30 !w-3 !h-3"
      />
    </div>
  )
})
