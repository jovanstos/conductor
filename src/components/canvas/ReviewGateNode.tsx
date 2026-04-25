import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { X, GitPullRequest, Pause } from 'lucide-react'
import type { ReviewGateData } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'

export default memo(function ReviewGateNode({ id, data }: NodeProps) {
  const d = data as unknown as ReviewGateData
  const { selectedNodeId, setSelectedNode, removeNode } = useWorkflowStore()
  const { isPaused, gateInfo } = useRunStore()

  const isActive   = isPaused && gateInfo?.nodeId === id
  const isSelected = selectedNodeId === id

  const borderColor = isActive
    ? 'rgba(96,165,250,0.7)'
    : isSelected
      ? 'rgba(96,165,250,0.45)'
      : 'rgba(96,165,250,0.22)'

  const glowStyle = isActive
    ? { boxShadow: '0 0 18px rgba(96,165,250,0.12)' }
    : {}

  return (
    <div
      className="w-52 rounded-2xl transition-all cursor-pointer group relative"
      style={{ background: 'var(--c-surface)', border: `1.5px solid ${borderColor}`, ...glowStyle }}
      onClick={() => setSelectedNode(id)}
    >
      {/* Delete button */}
      <button
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 text-red-400/60 hover:text-red-400"
        style={{ background: 'var(--c-elevated)', border: '1px solid var(--c-border)' }}
        onClick={(e) => { e.stopPropagation(); removeNode(id) }}
        title="Delete gate"
      >
        <X size={9} />
      </button>

      <Handle type="target" position={Position.Left} id="input" className="!bg-blue-500/40 !border-blue-500/20 !w-3 !h-3" />

      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-500/20 animate-pulse' : 'bg-blue-500/10'}`}>
            {isActive
              ? <Pause size={13} className="text-blue-300" />
              : <GitPullRequest size={13} className="text-blue-400" />
            }
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>Review Gate</p>
            <p className="text-xs text-blue-400/60">{isActive ? 'Waiting for you…' : 'Human checkpoint'}</p>
          </div>
        </div>

        {isActive ? (
          <div className="rounded-xl px-3 py-2 text-center bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-300 font-semibold flex items-center justify-center gap-1.5">
              <Pause size={11} /> Paused for review
            </p>
            <p className="text-xs text-blue-300/50 mt-0.5">Check the review panel</p>
          </div>
        ) : (
          <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
            {d.message || 'Review and approve to continue'}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="output" className="!bg-blue-500/40 !border-blue-500/20 !w-3 !h-3" />
    </div>
  )
})
