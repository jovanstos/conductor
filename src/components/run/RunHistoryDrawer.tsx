import { useEffect, useState } from 'react'
import { X, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { getRunsForWorkflow } from '../../lib/tauri'
import type { Run, RunStep } from '../../types'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function runDuration(run: Run): string | null {
  if (!run.completedAt) return null
  const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  cancelled: 'bg-yellow-500',
  running: 'bg-blue-500',
  paused: 'bg-orange-400',
}

function StepRow({ step }: { step: RunStep }) {
  const [open, setOpen] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  return (
    <div className="border-l-2 border-white/8 ml-2 pl-3 mb-1">
      <button
        className="w-full text-left flex items-center gap-2 py-0.5 group"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[step.status] ?? 'bg-white/20'}`} />
        <span className="text-xs text-white/55 flex-1 truncate">{step.nodeName}</span>
        {step.tokensUsed != null && (
          <span className="text-xs text-white/20">{step.tokensUsed.toLocaleString()} tok</span>
        )}
        {open ? <ChevronUp size={10} className="text-white/25 group-hover:text-white/50" /> : <ChevronDown size={10} className="text-white/25 group-hover:text-white/50" />}
      </button>

      {open && (
        <div className="pb-1 space-y-1">
          {step.output && (
            <pre className="text-xs text-white/40 whitespace-pre-wrap break-words leading-relaxed max-h-40 overflow-y-auto rounded bg-white/3 px-2 py-1.5">
              {step.output}
            </pre>
          )}
          {step.input && (
            <div>
              <button
                onClick={() => setShowPrompt((v) => !v)}
                className="text-xs text-purple-400/50 hover:text-purple-400/80 transition-colors"
              >
                {showPrompt
                  ? <><ChevronUp size={10} className="inline mr-1" />Hide prompt</>
                  : <><ChevronDown size={10} className="inline mr-1" />View prompt</>
                }
              </button>
              {showPrompt && (
                <pre className="mt-1 text-xs text-white/30 whitespace-pre-wrap break-words leading-relaxed max-h-40 overflow-y-auto rounded bg-purple-500/5 border border-purple-500/10 px-2 py-1.5">
                  {step.input}
                </pre>
              )}
            </div>
          )}
          {step.filesWritten && step.filesWritten.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {step.filesWritten.map((f) => (
                <span key={f} className="text-xs bg-emerald-500/10 text-emerald-400/60 rounded px-1.5 py-0.5">
                  {f}
                </span>
              ))}
            </div>
          )}
          {step.error && (
            <p className="text-xs text-red-400/70 bg-red-500/8 rounded px-2 py-1">{step.error}</p>
          )}
        </div>
      )}
    </div>
  )
}

function RunRow({ run }: { run: Run }) {
  const [expanded, setExpanded] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const duration = runDuration(run)
  const doneSteps = run.steps.filter((s) => s.status === 'done').length

  return (
    <div className="border border-white/6 rounded-lg mb-2 overflow-hidden">
      <button
        className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-white/3 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR[run.status] ?? 'bg-white/20'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/65 truncate">{run.input || '(no input)'}</p>
          <p className="text-xs text-white/25 mt-0.5">{fmtDate(run.startedAt)}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-xs text-white/35 capitalize block">{run.status}</span>
          {duration && <span className="text-xs text-white/20 block">{duration}</span>}
          {doneSteps > 0 && (
            <span className="text-xs text-white/20 block">{doneSteps} step{doneSteps !== 1 ? 's' : ''}</span>
          )}
        </div>
        {expanded ? <ChevronUp size={10} className="text-white/20 ml-1" /> : <ChevronDown size={10} className="text-white/20 ml-1" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5">
          {run.finalOutput && (
            <div className="mb-2">
              <button
                onClick={() => setShowOutput((v) => !v)}
                className="text-xs text-emerald-400/60 hover:text-emerald-400/90 transition-colors"
              >
                {showOutput
                  ? <><ChevronUp size={10} className="inline mr-1" />Hide final output</>
                  : <><ChevronDown size={10} className="inline mr-1" />Final output</>
                }
              </button>
              {showOutput && (
                <pre className="mt-1.5 text-xs text-white/50 whitespace-pre-wrap break-words leading-relaxed max-h-52 overflow-y-auto rounded bg-white/3 px-2.5 py-2">
                  {run.finalOutput}
                </pre>
              )}
            </div>
          )}
          {run.steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-white/25 mb-1.5 uppercase tracking-widest">Steps</p>
              {run.steps.map((step, i) => (
                <StepRow key={`${step.nodeId}-${i}`} step={step} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function RunHistoryDrawer({
  workflowId,
  onClose,
}: {
  workflowId: string
  onClose: () => void
}) {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getRunsForWorkflow(workflowId)
      .then(setRuns)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workflowId])

  return (
    <div className="fixed inset-y-0 right-0 w-[460px] bg-[#0a0a0d] border-l border-white/8 flex flex-col z-40 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <div>
          <p className="text-sm font-semibold text-white/80">Run History</p>
          {!loading && (
            <p className="text-xs text-white/30 mt-0.5">{runs.length} run{runs.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-md text-white/35 hover:text-white/70 hover:bg-white/6 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <span className="text-xs text-white/25 animate-pulse">Loading...</span>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Clock size={24} className="opacity-20" />
            <p className="text-xs text-white/25">No runs yet for this workflow</p>
          </div>
        ) : (
          runs.map((run) => <RunRow key={run.id} run={run} />)
        )}
      </div>
    </div>
  )
}
