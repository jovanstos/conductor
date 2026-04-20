import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { X, RefreshCw } from 'lucide-react'
import type { LoopNodeData, AgentNodeData } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'

export default memo(function LoopNode({ id, data }: NodeProps) {
  const d = data as unknown as LoopNodeData
  const { selectedNodeId, setSelectedNode, removeNode, currentWorkflow } = useWorkflowStore()

  const targetNode = currentWorkflow?.nodes.find((n) => n.id === d.targetNodeId)
  const reviewerNode = currentWorkflow?.nodes.find((n) => n.id === d.reviewerNodeId)

  const targetName = (targetNode?.data as AgentNodeData | undefined)?.name ?? '— not set —'
  const reviewerName = (reviewerNode?.data as AgentNodeData | undefined)?.name ?? '— not set —'
  const isConfigured = !!d.targetNodeId && !!d.reviewerNodeId
  const isSelected = selectedNodeId === id

  return (
    <div
      className={`w-52 rounded-xl border-2 transition-all cursor-pointer group relative ${
        isSelected
          ? 'border-amber-500/70 bg-[#1c1810]'
          : isConfigured
            ? 'border-amber-500/40 bg-[#161410]'
            : 'border-amber-500/20 bg-[#131310]'
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
        className="!bg-amber-500/40 !border-amber-500/20 !w-2.5 !h-2.5"
      />

      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 text-amber-400">
            <RefreshCw size={14} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/85">Loop</p>
            <p className="text-[11px] text-amber-400/60">Retry up to {d.maxRetries}×</p>
          </div>
        </div>

        <div className="bg-white/4 rounded-lg p-2.5 space-y-2">
          <AgentSlot role="Worker" name={targetName} configured={!!d.targetNodeId} hint="Sets who does the work" />
          <div className="h-px bg-white/5" />
          <AgentSlot role="Reviewer" name={reviewerName} configured={!!d.reviewerNodeId} hint="Sets who checks the work" />
        </div>

        {!isConfigured && (
          <p className="mt-2 text-[10px] text-amber-400/50 text-center">
            Click to assign agents in the right panel
          </p>
        )}

        <div className="mt-2 flex items-center justify-center">
          <span className="text-[9px] text-amber-400/40 bg-amber-500/8 px-2 py-0.5 rounded-full">
            {d.exitCondition === 'reviewer_approves' ? 'exits on approval' : 'always runs max retries'}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-amber-500/40 !border-amber-500/20 !w-2.5 !h-2.5"
      />
    </div>
  )
})

function AgentSlot({ role, name, configured, hint }: { role: string; name: string; configured: boolean; hint: string }) {
  return (
    <div className="flex items-center gap-2" title={hint}>
      <span className="text-[9px] text-white/30 w-14 shrink-0">{role}</span>
      <span className={`text-[11px] truncate ${configured ? 'text-white/70' : 'text-amber-400/40 italic'}`}>
        {name}
      </span>
    </div>
  )
}
