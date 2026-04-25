import { useEffect, useRef } from 'react'
import { useChamberStore } from '../../stores/chamberStore'
import { getProviderColor } from '../../lib/defaults'
import type { ChamberAgentStatus } from '../../types'

const STATUS_LABEL: Record<ChamberAgentStatus, string> = {
  waiting:    'Waiting',
  thinking:   'Thinking...',
  typing:     'Typing...',
  critiquing: 'Critiquing...',
  done:       'Done',
  error:      'Error',
}

const STATUS_COLOR: Record<ChamberAgentStatus, string> = {
  waiting:    'text-white/25',
  thinking:   'text-amber-300',
  typing:     'text-emerald-300',
  critiquing: 'text-blue-300',
  done:       'text-white/40',
  error:      'text-red-400',
}

const STATUS_DOT: Record<ChamberAgentStatus, string> = {
  waiting:    'bg-white/15',
  thinking:   'bg-amber-400 animate-pulse',
  typing:     'bg-emerald-400 animate-pulse',
  critiquing: 'bg-blue-400 animate-pulse',
  done:       'bg-white/25',
  error:      'bg-red-400',
}

export default function ChamberArena() {
  const {
    roster, runStatus, agentStreams,
    currentPhase, phaseDescription,
    gateInfo, resumeRun,
  } = useChamberStore()

  const isActive = runStatus === 'running' || runStatus === 'paused' || runStatus === 'completed'

  if (!isActive) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/8 flex items-center justify-center text-3xl">⚔️</div>
        <div>
          <p className="text-sm font-semibold text-white/60">The Arena is quiet</p>
          <p className="text-xs text-white/25 mt-1">Configure agents on the left and start a run</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Phase banner */}
      <div className="shrink-0 px-4 py-2.5 bg-white/2 border-b border-white/6 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <span className="text-xs font-semibold text-amber-300/80 uppercase tracking-wider">
          {currentPhase || 'starting'}
        </span>
        {phaseDescription && (
          <span className="text-xs text-white/30 ml-1">{phaseDescription}</span>
        )}
        {runStatus === 'running' && (
          <div className="ml-auto w-3 h-3 rounded-full border-2 border-amber-300/30 border-t-amber-300 animate-spin shrink-0" />
        )}
      </div>

      {/* Agent streams */}
      <div
        className={`flex-1 overflow-hidden grid gap-0 ${
          roster.length <= 1 ? 'grid-cols-1' :
          roster.length === 2 ? 'grid-cols-2' :
          roster.length === 3 ? 'grid-cols-3' :
          'grid-cols-2'
        }`}
      >
        {roster.map((agent) => {
          const stream = agentStreams[agent.id] ?? { text: '', status: 'waiting' as ChamberAgentStatus }
          return (
            <AgentStreamPanel
              key={agent.id}
              agentName={agent.name}
              modelId={agent.model.modelId}
              provider={agent.model.provider}
              text={stream.text}
              status={stream.status}
            />
          )
        })}
      </div>

      {/* Review gate overlay */}
      {runStatus === 'paused' && gateInfo && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20 p-8">
          <div className="bg-[#141418] border border-white/12 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-sm font-bold text-white/85">⏸ Review Gate</p>
              <p className="text-xs text-white/40 mt-0.5">Phase: {gateInfo.phase}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-white/60 leading-relaxed">{gateInfo.message}</p>
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {gateInfo.outputs.map((o) => (
                  <div key={o.agentId} className="bg-white/3 rounded-xl p-3">
                    <p className="text-xs font-semibold text-white/50 mb-1">{o.agentName}</p>
                    <p className="text-xs text-white/40 line-clamp-3 leading-relaxed">{o.output}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 pb-4 flex gap-2">
              <button
                onClick={() => resumeRun('cancel')}
                className="flex-1 py-2 rounded-xl border border-white/10 text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                Cancel Run
              </button>
              <button
                onClick={() => resumeRun('approve')}
                className="flex-1 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-xs text-amber-300 hover:bg-amber-500/30 font-semibold transition-colors"
              >
                Continue ↗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AgentStreamPanel({
  agentName, modelId, provider, text, status,
}: {
  agentName: string
  modelId: string
  provider: string
  text: string
  status: ChamberAgentStatus
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [text])

  return (
    <div className="flex flex-col border-r border-white/5 last:border-r-0 overflow-hidden">
      {/* Agent header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white/2 border-b border-white/5">
        <div
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`}
        />
        <span className="text-xs font-semibold text-white/70 truncate">{agentName}</span>
        <span className="text-xs ml-auto shrink-0 font-mono" style={{ color: getProviderColor(provider) }}>
          {modelId}
        </span>
        <span className={`text-xs ml-2 shrink-0 ${STATUS_COLOR[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {/* Stream text */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {text ? (
          <p className="text-xs text-white/65 whitespace-pre-wrap leading-relaxed font-mono">
            {text}
            {status === 'typing' && (
              <span className="inline-block w-1.5 h-3.5 bg-white/40 ml-0.5 animate-pulse align-text-bottom" />
            )}
          </p>
        ) : (
          <p className="text-xs text-white/15 italic">
            {status === 'waiting' ? 'Waiting to start...' : 'Starting...'}
          </p>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
