import { memo } from 'react'
import type { ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  X, Zap, Check, Code2, Search, PenLine, BookOpen,
  ClipboardList, TestTube2, Megaphone,
} from 'lucide-react'
import type { AgentNodeData } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'
import { getRoleInfo, getProviderColor, type RoleCategory } from '../../lib/defaults'

function RoleIcon({ category, size = 14, className = '' }: { category: RoleCategory; size?: number; className?: string }): ReactNode {
  const props = { size, className }
  switch (category) {
    case 'developer':  return <Code2 {...props} />
    case 'reviewer':   return <Search {...props} />
    case 'writer':     return <PenLine {...props} />
    case 'researcher': return <BookOpen {...props} />
    case 'planner':    return <ClipboardList {...props} />
    case 'tester':     return <TestTube2 {...props} />
    case 'marketer':   return <Megaphone {...props} />
    default:           return <Zap {...props} />
  }
}

export default memo(function AgentNode({ id, data, parentId }: NodeProps) {
  const d = data as unknown as AgentNodeData
  const { selectedNodeId, setSelectedNode, removeNode } = useWorkflowStore()
  const { currentRun } = useRunStore()


  const step = currentRun?.steps.filter((s) => s.nodeId === id).at(-1)
  const status = step?.status ?? 'idle'
  const role = getRoleInfo(d.name, d.roleDescription || '')

  const isChild    = !!parentId
  const isSelected = selectedNodeId === id
  const isRunning  = status === 'running'
  const isDone     = status === 'done'
  const isError    = status === 'error'
  const hasRun     = isRunning || isDone || isError
  const needsSetup = !d.systemPrompt?.trim() && !hasRun

  const borderColor = isRunning  ? 'rgba(168,85,247,0.7)'
    : isDone    ? 'rgba(52,211,153,0.5)'
    : isError   ? 'rgba(239,68,68,0.5)'
    : isSelected? 'rgba(168,85,247,0.55)'  // purple works on both light + dark
    : needsSetup? 'rgba(245,158,11,0.35)'
    : 'var(--c-border)'

  const bgColor = isRunning ? 'rgba(88,28,135,0.25)'
    : isDone    ? 'rgba(6,78,59,0.2)'
    : isError   ? 'rgba(127,29,29,0.2)'
    : 'var(--c-surface)'

  return (
    <div
      className="w-56 rounded-2xl cursor-pointer shadow-md group relative transition-all"
      style={{ background: bgColor, border: `1px solid ${borderColor}` }}
      onClick={() => setSelectedNode(id)}
    >
      {/* Role accent strip */}
      <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${role.dotColor} opacity-50`} />

      {/* Delete button */}
      {!isChild && (
        <button
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 text-red-400/60 hover:text-red-400"
          style={{ background: 'var(--c-elevated)', border: '1px solid var(--c-border)' }}
          onClick={(e) => { e.stopPropagation(); removeNode(id) }}
          title="Delete"
        >
          <X size={9} />
        </button>
      )}

      <Handle
        type="target"
        position={Position.Left}
        id="context"
        className="!bg-purple-500/60 !border-purple-400/30 !w-3 !h-3"
      />

      <div className="px-3.5 py-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isRunning ? 'bg-purple-500/20 animate-pulse' : isDone ? 'bg-emerald-500/12' : role.bgColor
          }`}>
            {isRunning ? <Zap size={13} className="text-purple-300" />
              : isDone  ? <Check size={13} className="text-emerald-400" />
              : <RoleIcon category={role.category} size={13} className={role.textColor} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-snug" style={{ color: 'var(--c-text-1)' }}>{d.name}</p>
            <p className={`text-xs truncate ${isRunning ? 'text-purple-400/70' : isDone ? 'text-emerald-400/60' : role.textColor + '/55'}`}>
              {isRunning ? 'Running…' : isDone ? 'Done' : role.label}
            </p>
          </div>
          {hasRun && <StatusBadge status={status} />}
        </div>

        {/* Model */}
        <div className="flex items-center gap-1.5 pb-2 mb-2" style={{ borderBottom: '1px solid var(--c-border-subtle)' }}>
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getProviderColor(d.model?.provider) }} />
          <span className="text-xs truncate" style={{ color: 'var(--c-text-dim)' }}>
            {d.model?.modelId ?? 'no model'}
          </span>
          {isDone && step?.tokensUsed && (
            <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--c-text-dim)' }}>{step.tokensUsed.toLocaleString()}</span>
          )}
        </div>

        {/* Live / result content */}
        {step?.output ? (
          <p className="text-xs line-clamp-3 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>{step.output}</p>
        ) : isRunning ? (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
        ) : needsSetup ? (
          <p className="text-xs italic" style={{ color: 'rgba(245,158,11,0.5)' }}>Click to add instructions</p>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="response"
        className="!bg-emerald-500/60 !border-emerald-400/30 !w-3 !h-3"
      />
    </div>
  )
})

function StatusBadge({ status }: { status: string }) {
  if (status === 'done')
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-1 shrink-0 font-medium">
        <Check size={11} /> Done
      </span>
    )
  if (status === 'running')
    return <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 animate-pulse shrink-0 font-medium">Running</span>
  if (status === 'error')
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 shrink-0 font-medium">Error</span>
  return null
}
