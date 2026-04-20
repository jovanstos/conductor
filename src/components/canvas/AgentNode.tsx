import { memo } from 'react'
import type { ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { X, Zap, Check, RefreshCw, Code2, Search, PenLine, BookOpen, ClipboardList, TestTube2, Megaphone } from 'lucide-react'
import type { AgentNodeData, LoopNodeData } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'
import { getRoleInfo, type RoleCategory } from '../../lib/defaults'

function RoleIcon({ category, size = 14, className = '' }: { category: RoleCategory; size?: number; className?: string }): ReactNode {
  const props = { size, className }
  switch (category) {
    case 'developer': return <Code2 {...props} />
    case 'reviewer': return <Search {...props} />
    case 'writer': return <PenLine {...props} />
    case 'researcher': return <BookOpen {...props} />
    case 'planner': return <ClipboardList {...props} />
    case 'tester': return <TestTube2 {...props} />
    case 'marketer': return <Megaphone {...props} />
    default: return <Zap {...props} />
  }
}

export default memo(function AgentNode({ id, data }: NodeProps) {
  const d = data as unknown as AgentNodeData
  const { selectedNodeId, setSelectedNode, removeNode, currentWorkflow } = useWorkflowStore()
  const { currentRun } = useRunStore()

  const step = currentRun?.steps.filter((s) => s.nodeId === id).at(-1)
  const status = step?.status ?? 'idle'
  const role = getRoleInfo(d.name, d.roleDescription || '')

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
      className={`w-56 rounded-xl border-2 ${borderColor} ${bgColor} cursor-pointer transition-all shadow-lg group relative`}
      onClick={() => setSelectedNode(id)}
    >
      {/* Role accent strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl ${role.dotColor} opacity-60`} />

      <button
        className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-[#1a1a22] border border-white/15 text-white/30 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => { e.stopPropagation(); removeNode(id) }}
        title="Delete node"
      >
        <X size={10} />
      </button>

      {loopRole && (
        <div className="absolute -top-3 left-3 bg-amber-500/20 border border-amber-500/30 text-amber-400/90 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap z-10">
          <RefreshCw size={9} />
          {loopRole === 'worker' ? 'works in loop' : 'reviews in loop'}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        className="!bg-purple-500/40 !border-purple-500/20 !w-2.5 !h-2.5"
      />

      <div className="p-3.5 pl-4">
        <div className="flex items-start gap-2.5 mb-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isRunning ? 'bg-purple-500/25 animate-pulse' : isDone ? 'bg-green-500/15' : role.bgColor
            }`}
          >
            {isRunning
              ? <Zap size={14} className="text-purple-300" />
              : isDone
              ? <Check size={14} className="text-green-400" />
              : <RoleIcon category={role.category} size={14} className={role.textColor} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white/90 truncate">{d.name}</p>
            <p className={`text-[11px] truncate ${isRunning ? 'text-purple-400/70' : isDone ? 'text-green-400/60' : role.textColor + '/60'}`}>
              {role.label}
            </p>
          </div>
        </div>

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

        {isDone && step?.tokensUsed && (
          <div className="mt-1.5 flex justify-end">
            <span className="text-[9px] text-white/20 tabular-nums">
              {step.tokensUsed.toLocaleString()} tokens
            </span>
          </div>
        )}

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
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium flex items-center gap-1">
        <Check size={8} /> done
      </span>
    )
  if (status === 'running')
    return <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 animate-pulse">working</span>
  if (status === 'error')
    return <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">error</span>
  return <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-white/25">idle</span>
}
