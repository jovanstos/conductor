import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { X, RefreshCw, Check } from 'lucide-react'
import type { LoopNodeData } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'

// Group dimensions — must match the style applied in toRFNode()
export const LOOP_GROUP_W = 580
export const LOOP_GROUP_H = 270

// Child card geometry (relative to group top-left, px)
const CARD_TOP   = 72
const CARD_H     = 160
const WORKER_X   = 28
const REVIEWER_X = 292
const CARD_W     = 224  // matches updated w-56 AgentNode width

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
  const isSelected        = selectedNodeId === id

  const borderColor = isLoopRunning
    ? 'rgba(245,158,11,0.55)'
    : isLoopDone
      ? 'rgba(52,211,153,0.35)'
      : isSelected
        ? 'rgba(245,158,11,0.45)'
        : 'rgba(245,158,11,0.18)'

  // SVG arrow coordinates
  const workerRight   = WORKER_X + CARD_W
  const workerMidY    = CARD_TOP + CARD_H / 2
  const reviewerLeft  = REVIEWER_X
  const reviewerRight = REVIEWER_X + CARD_W
  const cardBotY      = CARD_TOP + CARD_H

  return (
    <div
      className="rounded-2xl transition-all cursor-pointer group relative"
      style={{
        width: LOOP_GROUP_W,
        height: LOOP_GROUP_H,
        background: isLoopRunning
          ? 'rgba(245,158,11,0.04)'
          : isLoopDone
            ? 'rgba(52,211,153,0.03)'
            : 'var(--c-surface-alt)',
        border: `1.5px solid ${borderColor}`,
      }}
      onClick={(e) => { e.stopPropagation(); setSelectedNode(id) }}
    >
      {/* Delete button */}
      <button
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 text-red-400/60 hover:text-red-400"
        style={{ background: 'var(--c-elevated)', border: '1px solid var(--c-border)' }}
        onClick={(e) => { e.stopPropagation(); removeNode(id) }}
        title="Delete loop"
      >
        <X size={9} />
      </button>

      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 h-11 px-4 flex items-center gap-2.5 rounded-t-2xl"
        style={{ borderBottom: `1px solid rgba(245,158,11,0.12)` }}
      >
        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isLoopRunning ? 'bg-amber-500/20' : 'bg-amber-500/10'}`}>
          <RefreshCw
            size={11}
            className={`text-amber-400 ${isLoopRunning ? 'animate-spin [animation-duration:1.5s]' : ''}`}
          />
        </div>
        <span className="text-sm font-semibold" style={{ color: 'var(--c-text-2)' }}>Feedback Loop</span>
        <span className="text-xs text-amber-400/55 font-medium">up to {d.maxRetries}×</span>
        <span className="text-xs ml-auto" style={{ color: 'var(--c-text-dim)' }}>
          {d.exitCondition === 'reviewer_approves' ? 'exits on approval' : `always runs ${d.maxRetries}×`}
        </span>
        {isLoopDone && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-1 font-medium">
            <Check size={11} /> Done
          </span>
        )}
      </div>

      {/* Slot labels */}
      <span
        className="absolute text-xs font-medium text-purple-400/50 pointer-events-none select-none"
        style={{ left: WORKER_X, top: CARD_TOP - 18 }}
      >
        Worker
      </span>
      <span
        className="absolute text-xs font-medium text-sky-400/50 pointer-events-none select-none"
        style={{ left: REVIEWER_X, top: CARD_TOP - 18 }}
      >
        Reviewer
      </span>

      {/* Flow arrows */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <marker id={`loop-fwd-${id}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(245,158,11,0.5)" />
          </marker>
          <marker id={`loop-back-${id}`} markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(239,68,68,0.35)" />
          </marker>
        </defs>
        <line
          x1={workerRight} y1={workerMidY}
          x2={reviewerLeft} y2={workerMidY}
          stroke="rgba(245,158,11,0.4)" strokeWidth={1.5}
          markerEnd={`url(#loop-fwd-${id})`}
        />
        <path
          d={`M ${reviewerRight} ${cardBotY} C ${reviewerRight + 32} ${cardBotY + 52} ${WORKER_X - 20} ${cardBotY + 52} ${WORKER_X} ${cardBotY}`}
          fill="none"
          stroke="rgba(239,68,68,0.25)" strokeWidth={1.5} strokeDasharray="4 3"
          markerEnd={`url(#loop-back-${id})`}
        />
      </svg>

      {/* Live phase label */}
      {isWorkerRunning && (
        <span className="absolute bottom-3 left-0 right-0 text-center text-xs text-purple-400/60 pointer-events-none">
          Worker generating…
        </span>
      )}
      {isReviewerRunning && (
        <span className="absolute bottom-3 left-0 right-0 text-center text-xs text-sky-400/60 pointer-events-none">
          Reviewer checking…
        </span>
      )}

      <Handle type="target" position={Position.Left} id="context" className="!bg-amber-500/50 !border-amber-400/30 !w-3 !h-3" />
      <Handle type="source" position={Position.Right} id="result" className="!bg-emerald-500/50 !border-emerald-400/30 !w-3 !h-3" />
    </div>
  )
})
