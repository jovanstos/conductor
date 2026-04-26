import { useEffect, useRef } from 'react'
import { useChamberStore } from '../../stores/chamberStore'
import { getProviderColor } from '../../lib/defaults'
import type { ChamberAgentStatus } from '../../types'

const STATUS_LABEL: Record<ChamberAgentStatus, string> = {
  waiting:    'Waiting',
  thinking:   'Thinking',
  typing:     'Writing',
  critiquing: 'Judging',
  done:       'Done',
  error:      'Error',
}

const STATUS_COLOR: Record<ChamberAgentStatus, string> = {
  waiting:    'var(--c-text-dim)',
  thinking:   'rgb(251,191,36)',
  typing:     'rgb(52,211,153)',
  critiquing: 'rgb(96,165,250)',
  done:       'var(--c-text-3)',
  error:      'rgb(248,113,113)',
}

const STATUS_DOT: Record<ChamberAgentStatus, string> = {
  waiting:    '',
  thinking:   'bg-amber-400 animate-pulse',
  typing:     'bg-emerald-400 animate-pulse',
  critiquing: 'bg-blue-400 animate-pulse',
  done:       'bg-white/20',
  error:      'bg-red-400',
}

export default function ChamberArena() {
  const { roster, runStatus, agentStreams, currentPhase, phaseDescription, gateInfo, resumeRun } = useChamberStore()
  const isActive = runStatus === 'running' || runStatus === 'paused' || runStatus === 'completed'

  if (!isActive) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'rgba(245,158,11,0.08)' }}>
          ⚔️
        </div>
        <div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>The arena is quiet</p>
          <p className="text-xs" style={{ color: 'var(--c-text-dim)' }}>Add models on the left, set a task, and open the chamber</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Phase banner */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--c-border-subtle)', background: 'var(--c-surface)' }}>
        {runStatus === 'running' && (
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
        )}
        <span className="text-xs font-medium capitalize" style={{ color: runStatus === 'running' ? 'rgb(251,191,36)' : 'var(--c-text-3)' }}>
          {currentPhase || 'Starting'}
        </span>
        {phaseDescription && (
          <span className="text-xs" style={{ color: 'var(--c-text-dim)' }}>{phaseDescription}</span>
        )}
      </div>

      {/* Agent panels */}
      <div
        className={`flex-1 overflow-hidden grid ${
          roster.length === 1 ? 'grid-cols-1' :
          roster.length === 2 ? 'grid-cols-2' :
          roster.length === 3 ? 'grid-cols-3' :
          'grid-cols-2'
        }`}
      >
        {roster.map((agent, i) => {
          const stream = agentStreams[agent.id] ?? { text: '', status: 'waiting' as ChamberAgentStatus }
          return (
            <AgentStreamPanel
              key={agent.id}
              agentName={agent.name}
              modelId={agent.model.modelId}
              provider={agent.model.provider}
              text={stream.text}
              status={stream.status}
              isLast={i === roster.length - 1}
            />
          )
        })}
      </div>

      {/* Review gate overlay */}
      {runStatus === 'paused' && gateInfo && (
        <div className="absolute inset-0 flex items-center justify-center z-20 p-8" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-subtle)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>⏸ Review Gate</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-dim)' }}>{gateInfo.phase}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--c-text-2)' }}>{gateInfo.message}</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {gateInfo.outputs.map((o) => (
                  <div key={o.agentId} className="rounded-xl p-3" style={{ background: 'var(--c-input)' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--c-text-3)' }}>{o.agentName}</p>
                    <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--c-text-dim)' }}>{o.output}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 pb-4 flex gap-2">
              <button onClick={() => resumeRun('cancel')} className="flex-1 py-2 rounded-xl text-xs transition-colors" style={{ border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
                Cancel
              </button>
              <button onClick={() => resumeRun('approve')} className="flex-1 py-2 rounded-xl text-xs font-semibold text-amber-300 transition-colors bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AgentStreamPanel({ agentName, modelId, provider, text, status, isLast }: {
  agentName: string
  modelId: string
  provider: string
  text: string
  status: ChamberAgentStatus
  isLast: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [text])

  return (
    <div className="flex flex-col overflow-hidden" style={{ borderRight: isLast ? 'none' : '1px solid var(--c-border-subtle)' }}>
      {/* Agent header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--c-border-subtle)', background: 'var(--c-surface)' }}>
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status] || ''}`}
          style={!STATUS_DOT[status] ? { background: 'var(--c-text-dim)' } : undefined} />
        <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--c-text-2)' }}>{agentName}</span>
        <span className="text-xs font-mono shrink-0 truncate max-w-[80px]" style={{ color: getProviderColor(provider) }}>{modelId}</span>
        <span className="text-xs shrink-0 ml-1" style={{ color: STATUS_COLOR[status] }}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {/* Stream text */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {text ? (
          <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-2)' }}>
            {text}
            {status === 'typing' && (
              <span className="inline-block w-0.5 h-3.5 ml-0.5 align-text-bottom animate-pulse" style={{ background: 'var(--c-text-3)' }} />
            )}
          </p>
        ) : (
          <p className="text-xs italic" style={{ color: 'var(--c-text-dim)' }}>
            {status === 'waiting' ? 'Waiting to start...' : 'Starting...'}
          </p>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
