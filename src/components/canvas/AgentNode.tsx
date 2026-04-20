import { memo, useState } from 'react'
import type { ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  X, Zap, Check, RefreshCw, Code2, Search, PenLine, BookOpen,
  ClipboardList, TestTube2, Megaphone, ChevronDown, ChevronRight,
} from 'lucide-react'
import type { AgentNodeData, LoopNodeData } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'
import { getRoleInfo, getProviderColor, type RoleCategory } from '../../lib/defaults'

function RoleIcon({ category, size = 13, className = '' }: { category: RoleCategory; size?: number; className?: string }): ReactNode {
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

export default memo(function AgentNode({ id, data }: NodeProps) {
  const d = data as unknown as AgentNodeData
  const { selectedNodeId, setSelectedNode, removeNode, currentWorkflow } = useWorkflowStore()
  const { currentRun } = useRunStore()
  const [inputExpanded, setInputExpanded] = useState(false)

  const step = currentRun?.steps.filter((s) => s.nodeId === id).at(-1)
  const status = step?.status ?? 'idle'
  const role = getRoleInfo(d.name, d.roleDescription || '')

  const loopMembership = currentWorkflow?.nodes.find(
    (n) => n.type === 'loop' &&
      ((n.data as LoopNodeData).targetNodeId === id || (n.data as LoopNodeData).reviewerNodeId === id),
  )
  const loopRole = loopMembership
    ? (loopMembership.data as LoopNodeData).targetNodeId === id ? 'worker' : 'reviewer'
    : null

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
          ? 'border-white/25'
          : needsSetup
            ? 'border-amber-500/25'
            : 'border-white/10'

  const bgColor = isRunning ? 'bg-[#1c1626]' : isDone ? 'bg-[#101a12]' : isError ? 'bg-[#1a1010]' : 'bg-[#141418]'

  return (
    <div
      className={`w-64 rounded-xl border ${borderColor} ${bgColor} cursor-pointer shadow-lg group relative transition-colors`}
      onClick={() => setSelectedNode(id)}
    >
      {/* Role accent strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl ${role.dotColor} opacity-50`} />

      {/* Delete button */}
      <button
        className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-[#1a1a22] border border-white/15 text-white/30 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => { e.stopPropagation(); removeNode(id) }}
        title="Delete node"
      >
        <X size={10} />
      </button>

      {/* Loop role badge */}
      {loopRole && (
        <div className={`absolute -top-3 left-3 border text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap z-10 ${
          loopRole === 'worker'
            ? 'bg-purple-500/15 border-purple-500/30 text-purple-300/80'
            : 'bg-sky-500/15 border-sky-500/30 text-sky-300/80'
        }`}>
          <RefreshCw size={9} />
          {loopRole === 'worker' ? 'Worker' : 'Reviewer'}
        </div>
      )}

      {/* IN label (inside, near left handle) */}
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-mono text-purple-400/25 pointer-events-none select-none">
        IN
      </span>

      {/* Target / input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-purple-500/60 !border-purple-400/30 !w-3 !h-3"
      />

      <div className="px-5 py-3">
        {/* Header row */}
        <div className="flex items-start gap-2 mb-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isRunning ? 'bg-purple-500/25 animate-pulse' : isDone ? 'bg-emerald-500/15' : role.bgColor
          }`}>
            {isRunning
              ? <Zap size={13} className="text-purple-300" />
              : isDone
                ? <Check size={13} className="text-emerald-400" />
                : <RoleIcon category={role.category} size={13} className={role.textColor} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white/90 truncate leading-tight">{d.name}</p>
            <p className={`text-[10px] truncate ${isRunning ? 'text-purple-400/70' : isDone ? 'text-emerald-400/60' : role.textColor + '/55'}`}>
              {isRunning ? 'Generating…' : isDone ? 'Completed' : role.label}
            </p>
          </div>
          {hasRun && <StatusBadge status={status} />}
        </div>

        {/* Model row */}
        <div className="flex items-center gap-1.5 pb-2 border-b border-white/5">
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0 opacity-80"
            style={{ background: getProviderColor(d.model?.provider) }}
          />
          <span className="text-[10px] text-white/20 truncate">
            {d.model?.modelId?.split('-').slice(0, 2).join('-') ?? 'no model'}
          </span>
          {isDone && step?.tokensUsed && (
            <span className="ml-auto text-[9px] text-white/15 tabular-nums">{step.tokensUsed.toLocaleString()} tok</span>
          )}
        </div>

        {/* INPUT section — collapsible, shows what context this agent received */}
        {step?.input && (
          <div className="mt-2">
            <button
              className="flex items-center gap-1 text-[9px] text-white/20 hover:text-white/40 transition-colors w-full text-left"
              onClick={(e) => { e.stopPropagation(); setInputExpanded((v) => !v) }}
            >
              {inputExpanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
              <span className="font-mono tracking-wide text-purple-400/40">INPUT</span>
            </button>
            {inputExpanded && (
              <p className="mt-1 text-[10px] text-white/30 line-clamp-4 leading-relaxed border-l-2 border-purple-500/20 pl-2">
                {step.input}
              </p>
            )}
          </div>
        )}

        {/* OUTPUT section — always visible when data exists */}
        {step?.output ? (
          <div className={`mt-1.5 ${step.input ? 'border-t border-white/5 pt-1.5' : ''}`}>
            <span className="font-mono text-[9px] tracking-wide text-emerald-400/40 block mb-1">OUTPUT</span>
            <p className="text-[10px] text-white/45 line-clamp-3 leading-relaxed">{step.output}</p>
          </div>
        ) : isRunning ? (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="text-[10px] text-purple-300/50 ml-1">Thinking…</span>
          </div>
        ) : needsSetup ? (
          <div className="mt-2">
            <p className="text-[9px] text-amber-400/40 italic">Click to configure instructions</p>
          </div>
        ) : null}
      </div>

      {/* OUT label (inside, near right handle) */}
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-mono text-emerald-400/25 pointer-events-none select-none">
        OUT
      </span>

      {/* Source / output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-emerald-500/60 !border-emerald-400/30 !w-3 !h-3"
      />
    </div>
  )
})

function StatusBadge({ status }: { status: string }) {
  if (status === 'done')
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-0.5 shrink-0">
        <Check size={8} /> done
      </span>
    )
  if (status === 'running')
    return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 animate-pulse shrink-0">running</span>
  if (status === 'error')
    return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 shrink-0">error</span>
  return null
}
