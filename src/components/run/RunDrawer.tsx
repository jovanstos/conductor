import { useState } from 'react'
import { useRunStore } from '../../stores/runStore'
import * as tauri from '../../lib/tauri'
import type { RunStep } from '../../types'

function stepDurationMs(step: RunStep): number | null {
  if (!step.completedAt) return null
  return new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function RunDrawer({ height }: { height: number }) {
  const { currentRun, isRunning, isPaused, gateInfo, logLines, cancelRun, clearRun, openResultModal } =
    useRunStore()
  const [discardConfirm, setDiscardConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  if (!currentRun) return null

  const steps = currentRun.steps
  const isDone = currentRun.status === 'completed'
  const isFailed = currentRun.status === 'failed'
  const isCancelled = currentRun.status === 'cancelled'
  const isFinished = isDone || isFailed || isCancelled
  const activeStep = steps.find((s) => s.status === 'running')
  const doneCount = steps.filter((s) => s.status === 'done').length
  const ws = currentRun.workspaceConfig
  const totalFilesWritten = steps.reduce((n, s) => n + (s.filesWritten?.length ?? 0), 0)

  async function handleDiscard() {
    if (!ws) { clearRun(); return }
    if (ws.mode === 'temporary') {
      try { await tauri.deleteWorkspace(ws.workspacePath) } catch { /* ignore */ }
      clearRun()
    } else {
      setDiscardConfirm(true)
    }
  }

  async function handleDiscardConfirmed() {
    if (!ws) return
    try { await tauri.deleteWorkspace(ws.workspacePath) } catch { /* ignore */ }
    setDiscardConfirm(false)
    clearRun()
  }

  async function handleExportZip() {
    if (!ws) return
    setSaving(true)
    try {
      const { save: saveDialog } = await import('@tauri-apps/plugin-dialog')
      const dest = await saveDialog({
        defaultPath: `${ws.projectName ?? 'project'}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      })
      if (!dest) { setSaving(false); return }
      await tauri.zipAndSaveWorkspace(ws.workspacePath, dest)
      setSaveMsg('Exported!')
      setTimeout(() => setSaveMsg(null), 4000)
    } catch (e) {
      setSaveMsg(`Error: ${String(e)}`)
    }
    setSaving(false)
  }

  return (
    <div className="shrink-0 flex flex-col bg-[#08080b] overflow-hidden" style={{ height }}>

      {/* ── Status bar ── */}
      <div className={`flex items-center gap-3 px-4 py-2.5 border-b shrink-0 ${
        isDone ? 'bg-green-500/8 border-green-500/15'
          : isFailed ? 'bg-red-500/8 border-red-500/15'
          : isCancelled ? 'bg-white/3 border-white/6'
          : isPaused ? 'bg-blue-500/8 border-blue-500/20'
          : 'bg-purple-500/8 border-purple-500/12'
      }`}>
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          isDone ? 'bg-green-500'
            : isFailed ? 'bg-red-500'
            : isCancelled ? 'bg-white/20'
            : isPaused ? 'bg-blue-400 animate-pulse'
            : 'bg-purple-500 animate-pulse'
        }`} />

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${
            isDone ? 'text-green-400'
              : isFailed ? 'text-red-400'
              : isCancelled ? 'text-white/35'
              : isPaused ? 'text-blue-300'
              : 'text-purple-200'
          }`}>
            {isDone ? 'All done! Your team finished the job.'
              : isFailed ? 'Something went wrong.'
              : isCancelled ? 'Run was cancelled.'
              : isPaused ? 'Workflow paused — your input is needed!'
              : activeStep ? `${activeStep.nodeName} is working...`
              : 'Your team is starting up...'}
          </p>
          {ws && (
            <p className="text-[10px] text-white/25 truncate mt-0.5">
              {ws.mode === 'project' || ws.mode === 'existing'
                ? `◈ ${ws.projectName ?? 'project'}` : '◌ temporary'}{' '}
              · {ws.workspacePath}
              {totalFilesWritten > 0 && (
                <span className="ml-1.5 text-emerald-400/60">
                  · {totalFilesWritten} file{totalFilesWritten !== 1 ? 's' : ''} written
                </span>
              )}
            </p>
          )}
        </div>

        {steps.length > 0 && !isPaused && (
          <span className="text-[11px] text-white/25 tabular-nums shrink-0">
            {doneCount} / {steps.length} steps
          </span>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {isDone && currentRun.finalOutput && (
            <button
              onClick={openResultModal}
              className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              See Results →
            </button>
          )}
          {isFinished && ws && (
            <>
              {ws.mode === 'project' || ws.mode === 'existing' ? (
                <>
                  <button onClick={handleExportZip} disabled={saving}
                    className="text-xs text-white/40 hover:text-white/70 border border-white/10 hover:border-white/25 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                    title="Export project as zip"
                  >
                    {saving ? '...' : '↓ Export'}
                  </button>
                  <button onClick={clearRun}
                    className="text-xs text-emerald-400/70 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40 px-2.5 py-1 rounded-lg transition-colors"
                  >◈ Keep Project</button>
                  <button onClick={handleDiscard}
                    className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                  >Discard</button>
                </>
              ) : (
                <button onClick={handleDiscard}
                  className="text-xs text-white/30 hover:text-white/60 border border-white/8 hover:border-white/20 px-2.5 py-1 rounded-lg transition-colors"
                >✕ Discard</button>
              )}
            </>
          )}
          {isRunning && (
            <button onClick={cancelRun}
              className="text-xs text-red-400/70 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 px-2.5 py-1 rounded-lg transition-colors"
            >■ Cancel</button>
          )}
          {!ws && (
            <button onClick={clearRun}
              className="text-white/20 hover:text-white/50 text-base leading-none transition-colors ml-1"
              title="Dismiss"
            >✕</button>
          )}
        </div>
      </div>

      {/* ── Save message toast ── */}
      {saveMsg && (
        <div className="mx-3 mt-2 shrink-0 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs text-emerald-300">
          {saveMsg}
        </div>
      )}

      {/* ── Discard confirmation ── */}
      {discardConfirm && (
        <div className="mx-3 mt-2 shrink-0 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">Delete project files?</p>
            <p className="text-xs text-red-300/60 mt-0.5">
              This will permanently delete all generated files at {ws?.workspacePath}. Cannot be undone.
            </p>
          </div>
          <button onClick={handleDiscardConfirmed}
            className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >Delete</button>
          <button onClick={() => setDiscardConfirm(false)}
            className="text-xs text-white/40 hover:text-white/70 transition-colors shrink-0"
          >Cancel</button>
        </div>
      )}

      {/* ── Gate notice ── */}
      {isPaused && gateInfo && (
        <div className="mx-3 mt-2.5 shrink-0 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-base animate-pulse shrink-0">⏸</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300">Review panel is open</p>
            <p className="text-xs text-blue-300/55 mt-0.5 line-clamp-1">
              {gateInfo.message || 'Check the review popup and click Approve to continue.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0">
        {steps.length === 0 ? (
          <div className="flex items-center gap-2 h-full justify-center">
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.15s]" />
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.3s]" />
            <span className="text-sm text-white/30 ml-1">Preparing your team...</span>
          </div>
        ) : (
          <>
            {steps.map((step, i) => (
              <TimelineEntry key={`${step.nodeId}-${step.attempt}-${i}`} step={step} isLast={i === steps.length - 1} />
            ))}
            {/* Log-only events (gate, cancelled, done) */}
            {logLines.filter(l => l.startsWith('[gate]') || l.startsWith('[cancelled]') || l.startsWith('[done]')).map((line, i) => (
              <div key={i} className="flex items-center gap-3 pl-1 py-0.5">
                <div className="w-5 flex justify-center shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                </div>
                <p className="text-[10px] text-white/20 italic">{line}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function TimelineEntry({ step, isLast }: { step: RunStep; isLast: boolean }) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [showFiles, setShowFiles] = useState(false)

  const isRunning = step.status === 'running'
  const isDone = step.status === 'done'
  const isError = step.status === 'error'
  const durationMs = stepDurationMs(step)
  const hasFiles = (step.filesWritten?.length ?? 0) > 0
  const hasOutput = !isRunning && (step.output || step.error)
  const promptChars = step.input?.length ?? 0

  return (
    <div className="flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0 w-5">
        <div className={`w-3 h-3 rounded-full border-2 shrink-0 mt-1 ${
          isRunning ? 'border-purple-400 bg-purple-500/30 animate-pulse'
            : isDone ? 'border-green-500 bg-green-500/30'
            : isError ? 'border-red-500 bg-red-500/30'
            : 'border-white/20 bg-white/5'
        }`} />
        {!isLast && <div className="w-px flex-1 bg-white/8 mt-1" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-3">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-white/85">{step.nodeName}</span>
          {step.attempt > 1 && (
            <span className="text-[9px] text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
              retry {step.attempt}
            </span>
          )}
          {isRunning && (
            <span className="flex items-center gap-0.5">
              <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" />
              <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce [animation-delay:0.15s]" />
              <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce [animation-delay:0.3s]" />
            </span>
          )}
          {durationMs !== null && (
            <span className="text-[10px] text-white/25 tabular-nums">{fmtDuration(durationMs)}</span>
          )}
          {step.tokensUsed != null && (
            <span className="text-[10px] text-white/20 tabular-nums">{step.tokensUsed.toLocaleString()} tok</span>
          )}
          <span className={`text-[10px] font-medium ml-auto ${
            isRunning ? 'text-purple-300/70'
              : isDone ? 'text-green-400/60'
              : isError ? 'text-red-400/70'
              : 'text-white/25'
          }`}>
            {isRunning ? 'running' : isDone ? 'done' : isError ? 'error' : 'pending'}
          </span>
        </div>

        {/* Live streaming output */}
        {isRunning && step.output && (
          <div className="mt-1.5 max-h-28 overflow-y-auto rounded-lg bg-black/20 px-2.5 py-2 border border-purple-500/10">
            <pre className="text-[10px] text-purple-200/60 whitespace-pre-wrap leading-relaxed font-mono">
              {step.output}
            </pre>
          </div>
        )}

        {/* Files written */}
        {hasFiles && (
          <div className="mt-1.5">
            <button onClick={() => setShowFiles(v => !v)}
              className="flex items-center gap-1 text-[10px] text-emerald-400/70 hover:text-emerald-300 transition-colors"
            >
              <span>◈</span>
              <span>{step.filesWritten!.length} file{step.filesWritten!.length !== 1 ? 's' : ''} written</span>
              <span className="text-white/20 ml-0.5">{showFiles ? '▲' : '▼'}</span>
            </button>
            {showFiles && (
              <div className="mt-1 bg-black/20 rounded-lg p-2 space-y-0.5">
                {step.filesWritten!.map(f => (
                  <p key={f} className="text-[10px] text-emerald-300/60 font-mono truncate">{f}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Finished output */}
        {hasOutput && (
          <div className="mt-1.5">
            {showOutput ? (
              <>
                <div className="max-h-48 overflow-y-auto rounded-lg bg-black/25 px-2.5 py-2 border border-white/6 mb-1">
                  <pre className="text-xs text-white/65 whitespace-pre-wrap leading-relaxed font-mono">
                    {isError
                      ? <span className="text-red-400">{step.error}</span>
                      : step.output}
                  </pre>
                </div>
                <button onClick={() => setShowOutput(false)}
                  className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
                >▲ Collapse output</button>
              </>
            ) : (
              <>
                <p className="text-[10px] text-white/40 line-clamp-2 leading-relaxed">
                  {isError ? step.error : step.output}
                </p>
                {((step.output?.length ?? 0) > 80 || isError) && (
                  <button onClick={() => setShowOutput(true)}
                    className="text-[10px] text-purple-400/60 hover:text-purple-300 transition-colors mt-0.5"
                  >▼ Read full response</button>
                )}
              </>
            )}
          </div>
        )}

        {/* View prompt (what was sent to the LLM) */}
        {promptChars > 0 && (
          <div className="mt-1.5">
            <button onClick={() => setShowPrompt(v => !v)}
              className="text-[10px] text-white/20 hover:text-white/45 transition-colors flex items-center gap-1"
            >
              <span>{showPrompt ? '▲' : '▶'}</span>
              <span>View prompt ({promptChars.toLocaleString()} chars)</span>
            </button>
            {showPrompt && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg bg-black/30 px-2.5 py-2 border border-white/5">
                <pre className="text-[10px] text-white/40 whitespace-pre-wrap leading-relaxed font-mono">
                  {step.input}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
