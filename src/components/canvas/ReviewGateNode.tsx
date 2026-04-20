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

  const isActive = isPaused && gateInfo?.nodeId === id
  const isSelected = selectedNodeId === id

  return (
    <div
      className={`w-48 rounded-xl border-2 transition-all cursor-pointer group relative ${
        isActive
          ? 'border-blue-400/80 bg-[#0e1520] shadow-[0_0_20px_rgba(96,165,250,0.15)]'
          : isSelected
            ? 'border-blue-500/50 bg-[#0f1318]'
            : 'border-blue-500/25 bg-[#0d1015]'
      }`}
      onClick={() => setSelectedNode(id)}
    >
      <button
        className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-[#1a1a22] border border-white/15 text-white/30 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => { e.stopPropagation(); removeNode(id) }}
        title="Delete node"
      >
        <X size={10} />
      </button>

      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!bg-blue-500/40 !border-blue-500/20 !w-2.5 !h-2.5"
      />

      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isActive ? 'bg-blue-500/25 animate-pulse' : 'bg-blue-500/12'
            } text-blue-400`}
          >
            {isActive ? <Pause size={14} /> : <GitPullRequest size={14} />}
          </div>
          <div>
            <p className="text-sm font-semibold text-white/85">Review Gate</p>
            <p className="text-[11px] text-blue-300/50">
              {isActive ? 'Waiting for you...' : 'Human checkpoint'}
            </p>
          </div>
        </div>

        {isActive ? (
          <div className="bg-blue-500/12 border border-blue-500/25 rounded-lg px-3 py-2 text-center">
            <p className="text-[11px] text-blue-300 font-medium flex items-center justify-center gap-1.5">
              <Pause size={10} /> Paused for review
            </p>
            <p className="text-[10px] text-blue-300/50 mt-0.5">Check the review panel</p>
          </div>
        ) : (
          <p className="text-[10px] text-white/30 line-clamp-2 leading-relaxed">
            {d.message || 'Review and approve to continue'}
          </p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!bg-blue-500/40 !border-blue-500/20 !w-2.5 !h-2.5"
      />
    </div>
  )
})
