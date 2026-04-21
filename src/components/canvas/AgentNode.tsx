import { memo, useState } from 'react'
import type { ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  X, Zap, Check, Code2, Search, PenLine, BookOpen,
  ClipboardList, TestTube2, Megaphone, ChevronDown, ChevronRight,
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
  const [inputExpanded, setInputExpanded] = useState(false)

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

  const borderColor = isRunning
    ? 'border-purple-400/80'
    : isDone
      ? 'border-emerald-500/60'
      : isError
        ? 'border-red-500/50'
        : isSelected
          ? 'border-white/30'
          : needsSetup
            ? 'border-amber-500/30'
            : 'border-white/12'

  const bgColor = isRunning
    ? 'bg-purple-950/60'
    : isDone
      ? 'bg-emerald-950/40'
      : isError
        ? 'bg-red-950/40'
        : 'bg-[#141418]'

  return (
    <div
      className={`w-64 rounded-xl border ${borderColor} ${bgColor} cursor-pointer shadow-lg group relative transition-colors`}
      onClick={() => setSelectedNode(id)}
    >
      {/* Role accent strip */}
      <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${role.dotColor} opacity-60`} />

      {/* Delete button — hidden for child nodes inside a loop group */}
      {!isChild && (
        <button
          className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-[#1a1a22] border border-white/15 text-white/30 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => { e.stopPropagation(); removeNode(id) }}
          title="Delete node"
        >
          <X size={10} />
        </button>
      )}

      <Handle
        type="target"
        position={Position.Left}
        id="context"
        className="!bg-purple-500/60 !border-purple-400/30 !w-3 !h-3"
      />

      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isRunning ? 'bg-purple-500/25 animate-pulse' : isDone ? 'bg-emerald-500/15' : role.bgColor
          }`}>
            {isRunning
              ? <Zap size={14} className="text-purple-300" />
              : isDone
                ? <Check size={14} className="text-emerald-400" />
                : <RoleIcon category={role.category} size={14} className={role.textColor} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/90 truncate leading-snug">{d.name}</p>
            <p className={`text-xs truncate ${isRunning ? 'text-purple-400/70' : isDone ? 'text-emerald-400/60' : role.textColor + '/55'}`}>
              {isRunning ? 'Generating…' : isDone ? 'Completed' : role.label}
            </p>
          </div>
          {hasRun && <StatusBadge status={status} />}
        </div>

        {/* Model row */}
        <div className="flex items-center gap-1.5 pb-2.5 border-b border-white/6">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: getProviderColor(d.model?.provider) }}
          />
          <span className="text-xs text-white/30 truncate">
            {d.model?.modelId?.split('-').slice(0, 2).join('-') ?? 'no model'}
          </span>
          {isDone && step?.tokensUsed && (
            <span className="ml-auto text-xs text-white/20 tabular-nums">{step.tokensUsed.toLocaleString()} tok</span>
          )}
        </div>

        {/* INPUT section */}
        {step?.input && (
          <div className="mt-2">
            <button
              className="flex items-center gap-1 text-xs text-white/25 hover:text-white/45 transition-colors w-full text-left"
              onClick={(e) => { e.stopPropagation(); setInputExpanded((v) => !v) }}
            >
              {inputExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span className="font-mono text-purple-400/50 tracking-wider text-xs uppercase">Input</span>
            </button>
            {inputExpanded && (
              <p className="mt-1 text-xs text-white/35 line-clamp-4 leading-relaxed border-l-2 border-purple-500/20 pl-2">
                {step.input}
              </p>
            )}
          </div>
        )}

        {/* OUTPUT section */}
        {step?.output ? (
          <div className={`mt-1.5 ${step.input ? 'border-t border-white/5 pt-1.5' : ''}`}>
            <span className="font-mono text-xs uppercase tracking-wider text-emerald-400/50 block mb-1">Output</span>
            <p className="text-xs text-white/50 line-clamp-3 leading-relaxed">{step.output}</p>
          </div>
        ) : isRunning ? (
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
            <span className="text-xs text-purple-300/50 ml-1">Thinking…</span>
          </div>
        ) : needsSetup ? (
          <div className="mt-2">
            <p className="text-xs text-amber-400/50 italic">Click to configure instructions</p>
          </div>
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
