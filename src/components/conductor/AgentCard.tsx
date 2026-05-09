import { useState } from 'react'
import {
  Settings2, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronRight,
  RotateCcw, GitPullRequest, Zap, Cpu, Hash
} from 'lucide-react'
import type { WorkflowNode, AgentNodeData, LoopNodeData, RunStep } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'

// ── Status config ────────────────────────────────────────────────────
type StepStatus = 'idle' | 'running' | 'done' | 'error'

function getStepStatus(step?: RunStep): StepStatus {
  if (!step) return 'idle'
  if (step.status === 'running') return 'running'
  if (step.status === 'done') return 'done'
  if (step.status === 'error') return 'error'
  return 'idle'
}

const STATUS_CONFIG = {
  idle:    { label: 'IDLE',    color: 'var(--c-text-3)',  bg: 'transparent',           border: 'transparent' },
  running: { label: 'RUNNING', color: 'var(--c-accent)',  bg: 'var(--c-accent-dim)',    border: 'var(--c-accent-border)' },
  done:    { label: 'DONE',    color: 'var(--c-green)',   bg: 'var(--c-green-dim)',     border: 'rgba(74,222,128,0.3)' },
  error:   { label: 'ERROR',   color: 'var(--c-red)',     bg: 'var(--c-red-dim)',       border: 'rgba(248,113,113,0.3)' },
}

// ── Provider color dots ──────────────────────────────────────────────
const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#f97316',
  openai:    '#10b981',
  ollama:    '#3b82f6',
  custom:    '#a855f7',
}

export default function AgentCard({
  node,
  index,
  isFirst,
  isLast,
  runStep,
  onConfigure,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  node: WorkflowNode
  index: number
  isFirst: boolean
  isLast: boolean
  runStep?: RunStep
  onConfigure: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { getChildNodes } = useWorkflowStore()

  const isLoop   = node.type === 'loop'
  const isGate   = node.type === 'review_gate'
  const isAgent  = node.type === 'agent'

  const agentData = isAgent ? (node.data as AgentNodeData) : null
  const loopData  = isLoop  ? (node.data as LoopNodeData)  : null

  const status = getStepStatus(runStep)
  const sc = STATUS_CONFIG[status]

  const isRunning = status === 'running'
  const isDone    = status === 'done'
  const isError   = status === 'error'

  const name = isAgent ? agentData!.name : isLoop ? 'Loop' : 'Review Gate'
  const model = isAgent ? agentData!.model : null
  const tools = isAgent ? (agentData!.toolsEnabled ?? []) : []
  const contextMode = isAgent ? agentData!.contextMode : null

  const providerColor = model ? (PROVIDER_COLORS[model.provider] ?? PROVIDER_COLORS.custom) : null

  const children = isLoop ? getChildNodes(node.id) : []
  const worker   = isLoop ? children.find((c) => c.id === loopData!.targetNodeId)   : null
  const reviewer = isLoop ? children.find((c) => c.id === loopData!.reviewerNodeId) : null

  const liveOutput = isRunning ? runStep?.output : (isDone || isError) ? runStep?.output : undefined
  const hasOutput  = Boolean(liveOutput)

  // Card border class
  const cardClass = isRunning ? 'card-running' : isDone ? 'card-done' : isError ? 'card-error' : isLoop ? 'card-loop' : ''

  return (
    <div className="relative">
      {/* Vertical connector */}
      {index > 0 && (
        <div className="flex justify-center" style={{ height: '24px' }}>
          <div className="w-0.5 h-full" style={{ background: isDone ? 'rgba(74,222,128,0.4)' : 'var(--c-border)' }} />
        </div>
      )}

      {/* ── Main card ── */}
      <div
        className={`rounded-xl border transition-all ${cardClass}`}
        style={{
          background: isLoop ? 'rgba(52,211,153,0.06)' : isGate ? 'rgba(56,189,248,0.06)' : 'var(--c-card)',
          borderColor: isLoop
            ? 'rgba(52,211,153,0.35)'
            : isGate
            ? 'var(--c-accent-border)'
            : isRunning ? 'var(--c-accent-border)'
            : isDone ? 'rgba(74,222,128,0.25)'
            : isError ? 'rgba(248,113,113,0.3)'
            : 'var(--c-border)',
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4">

          {/* Step number badge */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-mono-accent shrink-0"
            style={{
              background: isRunning ? 'var(--c-accent-dim)' : 'var(--c-elevated)',
              color: isRunning ? 'var(--c-accent)' : 'var(--c-text-3)',
              border: `1px solid ${isRunning ? 'var(--c-accent-border)' : 'var(--c-border)'}`,
            }}
          >
            {index + 1}
          </div>

          {/* Type badge */}
          {isLoop && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0"
              style={{ background: 'rgba(52,211,153,0.2)', border: '1px solid rgba(52,211,153,0.4)', color: 'var(--c-loop)' }}>
              <RotateCcw size={13} />
              <span className="text-xs font-bold">LOOP</span>
            </div>
          )}
          {isGate && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0"
              style={{ background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)', color: 'var(--c-accent)' }}>
              <GitPullRequest size={13} />
              <span className="text-xs font-bold">GATE</span>
            </div>
          )}

          {/* Name */}
          <span className="text-base font-bold flex-1 truncate" style={{ color: 'var(--c-text-1)' }}>
            {name}
          </span>

          {/* Status pill */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg shrink-0 ${isRunning ? 'pulse-accent' : ''}`}
            style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sc.color }} />
            <span className="text-xs font-bold font-mono-accent">{sc.label}</span>
          </div>

          {/* Action buttons — MUCH bigger */}
          <div className="flex items-center gap-1 ml-1">
            {!isFirst && (
              <ActionBtn title="Move up" onClick={onMoveUp} size="sm">
                <ArrowUp size={15} />
              </ActionBtn>
            )}
            {!isLast && (
              <ActionBtn title="Move down" onClick={onMoveDown} size="sm">
                <ArrowDown size={15} />
              </ActionBtn>
            )}
            <ActionBtn title="Configure" onClick={onConfigure} color="accent" size="md">
              <Settings2 size={16} />
            </ActionBtn>
            <ActionBtn title="Remove step" onClick={onRemove} color="red" size="md">
              <Trash2 size={16} />
            </ActionBtn>
          </div>
        </div>

        {/* ── Agent details strip ── */}
        {isAgent && (
          <div
            className="flex items-center gap-4 px-5 py-2.5 flex-wrap"
            style={{ borderTop: '1px solid var(--c-border-subtle)', background: 'rgba(0,0,0,0.15)' }}
          >
            {/* Provider + model */}
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: providerColor ?? 'var(--c-text-3)', boxShadow: `0 0 6px ${providerColor ?? 'transparent'}` }} />
              <span className="text-sm font-mono-accent" style={{ color: 'var(--c-text-2)' }}>
                {model?.modelId ?? 'no model'}
              </span>
            </div>

            <Dot />

            {/* Context mode */}
            <div className="flex items-center gap-1.5">
              <Cpu size={12} style={{ color: 'var(--c-text-3)' }} />
              <span className="text-sm" style={{ color: 'var(--c-text-3)' }}>
                {contextMode === 'full_chain' ? 'full context' : contextMode === 'previous' ? 'prev only' : 'no context'}
              </span>
            </div>

            {/* Tools */}
            {tools.length > 0 && (
              <>
                <Dot />
                <div className="flex items-center gap-1.5">
                  <Zap size={12} style={{ color: 'var(--c-text-3)' }} />
                  <span className="text-sm" style={{ color: 'var(--c-text-3)' }}>
                    {tools.length} tool{tools.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </>
            )}

            {/* Tokens used (when done) */}
            {runStep?.tokensUsed != null && (
              <>
                <Dot />
                <div className="flex items-center gap-1.5">
                  <Hash size={12} style={{ color: 'var(--c-accent)' }} />
                  <span className="text-sm font-mono-accent" style={{ color: 'var(--c-accent)' }}>
                    {runStep.tokensUsed.toLocaleString()} tokens
                  </span>
                </div>
              </>
            )}

            {/* Duration */}
            {runStep?.completedAt && runStep?.startedAt && (
              <>
                <Dot />
                <span className="text-sm font-mono-accent" style={{ color: 'var(--c-text-3)' }}>
                  {((new Date(runStep.completedAt).getTime() - new Date(runStep.startedAt).getTime()) / 1000).toFixed(1)}s
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Loop children info ── */}
        {isLoop && worker && reviewer && (
          <div
            className="flex items-center gap-5 px-5 py-2.5 flex-wrap"
            style={{ borderTop: '1px solid rgba(52,211,153,0.2)', background: 'rgba(0,0,0,0.1)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--c-green)', border: '1px solid rgba(74,222,128,0.25)' }}>
                WORKER
              </span>
              <span className="text-sm" style={{ color: 'var(--c-text-2)' }}>{(worker.data as AgentNodeData).name}</span>
            </div>
            <ArrowDown size={12} style={{ color: 'var(--c-text-3)' }} />
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ background: 'var(--c-loop-dim)', color: 'var(--c-loop)', border: '1px solid rgba(52,211,153,0.3)' }}>
                REVIEWER
              </span>
              <span className="text-sm" style={{ color: 'var(--c-text-2)' }}>{(reviewer.data as AgentNodeData).name}</span>
            </div>
            <Dot />
            <span className="text-sm" style={{ color: 'var(--c-text-3)' }}>
              Max <span style={{ color: 'var(--c-amber)', fontWeight: 600 }}>{loopData!.maxRetries}</span> retries
            </span>
          </div>
        )}

        {/* ── Live output / result ── */}
        {hasOutput && (
          <div
            className="mx-4 mb-4 rounded-lg overflow-hidden cursor-pointer"
            style={{ border: `1px solid ${isRunning ? 'var(--c-accent-border)' : isError ? 'rgba(248,113,113,0.25)' : 'var(--c-border)'}`, marginTop: '2px' }}
            onClick={() => setExpanded(!expanded)}
          >
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{ background: isRunning ? 'var(--c-accent-glow)' : 'rgba(0,0,0,0.2)' }}
            >
              <span className="text-xs font-bold font-mono-accent" style={{ color: isRunning ? 'var(--c-accent)' : isError ? 'var(--c-red)' : 'var(--c-text-3)' }}>
                {isRunning ? '⬤ STREAMING' : isError ? '⬤ ERROR' : '⬤ OUTPUT'}
              </span>
              <div className="ml-auto">
                {expanded ? <ChevronDown size={13} style={{ color: 'var(--c-text-3)' }} /> : <ChevronRight size={13} style={{ color: 'var(--c-text-3)' }} />}
              </div>
            </div>
            <pre
              className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${!expanded ? 'line-clamp-3' : 'max-h-64 overflow-y-auto'} ${isRunning ? 'cursor-blink' : ''}`}
              style={{ color: isError ? 'var(--c-red)' : 'var(--c-text-2)', fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.25)' }}
            >
              {isError ? runStep?.error : liveOutput}
            </pre>
          </div>
        )}

        {/* ── Tool calls ── */}
        {runStep?.toolCalls && runStep.toolCalls.length > 0 && (
          <div className="px-4 pb-4 flex flex-wrap gap-1.5">
            {runStep.toolCalls.map((tc) => (
              <span
                key={tc.toolCallId}
                className="text-xs px-2.5 py-1 rounded-lg font-mono-accent"
                style={{
                  background: tc.isError ? 'var(--c-red-dim)' : 'var(--c-green-dim)',
                  color: tc.isError ? 'var(--c-red)' : 'var(--c-green)',
                  border: `1px solid ${tc.isError ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`,
                }}
              >
                {tc.toolName}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Dot() {
  return <span style={{ color: 'var(--c-border)', userSelect: 'none' }}>·</span>
}

function ActionBtn({
  children, onClick, title, color, size = 'md',
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  color?: 'accent' | 'red'
  size?: 'sm' | 'md'
}) {
  const dim = size === 'md' ? 'w-9 h-9' : 'w-8 h-8'
  const baseColor = color === 'accent' ? 'var(--c-accent)' : color === 'red' ? 'var(--c-red)' : 'var(--c-text-3)'
  const hoverBg = color === 'accent' ? 'var(--c-accent-dim)' : color === 'red' ? 'var(--c-red-dim)' : 'var(--c-elevated)'

  return (
    <button
      title={title}
      onClick={onClick}
      className={`${dim} flex items-center justify-center rounded-lg transition-all`}
      style={{ color: 'var(--c-text-3)', background: 'transparent', border: '1px solid transparent' }}
      onMouseEnter={e => {
        e.currentTarget.style.color = baseColor
        e.currentTarget.style.background = hoverBg
        e.currentTarget.style.borderColor = color === 'accent' ? 'var(--c-accent-border)' : color === 'red' ? 'rgba(248,113,113,0.3)' : 'var(--c-border)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'var(--c-text-3)'
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'transparent'
      }}
    >
      {children}
    </button>
  )
}
