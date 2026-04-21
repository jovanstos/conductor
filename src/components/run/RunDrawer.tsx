import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { FolderOpen, Clock, Download, X, ChevronDown, ChevronUp, ChevronRight, Pause, ArrowRight, Square, Code2, Search, PenLine, BookOpen, ClipboardList, TestTube2, Megaphone, Zap, Wrench, Check } from 'lucide-react'
import { useRunStore } from '../../stores/runStore'
import * as tauri from '../../lib/tauri'
import type { RunStep, ToolCallRecord } from '../../types'
import { getRoleInfo, type RoleCategory } from '../../lib/defaults'

function RoleIcon({ category, size = 13, className = '' }: { category: RoleCategory; size?: number; className?: string }): ReactNode {
  const props = { size, className }
  switch (category) {
    case 'developer': return <Code2 {...props} />
    case 'reviewer':  return <Search {...props} />
    case 'writer':    return <PenLine {...props} />
    case 'researcher':return <BookOpen {...props} />
    case 'planner':   return <ClipboardList {...props} />
    case 'tester':    return <TestTube2 {...props} />
    case 'marketer':  return <Megaphone {...props} />
    default:          return <Zap {...props} />
  }
}

function ToolCallBadge({ tc }: { tc: ToolCallRecord }) {
  const [expanded, setExpanded] = useState(false)

  const containerCls = tc.status === 'running'
    ? 'border-purple-500/30 bg-purple-500/6'
    : tc.isError
      ? 'border-red-500/30 bg-red-500/6'
      : 'border-white/8 bg-white/3'

  const iconCls = tc.status === 'running'
    ? 'text-purple-400'
    : tc.isError
      ? 'text-red-400'
      : 'text-emerald-400'

  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${containerCls}`}>
      <div className="flex items-center gap-2">
        <Wrench size={11} className={iconCls} />
        <span className="text-xs font-mono text-white/60 truncate flex-1">
          {tc.toolName}
          {tc.argsPreview && <span className="text-white/35">({tc.argsPreview})</span>}
        </span>
        {tc.status === 'running' && (
          <span className="flex items-center gap-0.5 shrink-0">
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.15s]" />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.3s]" />
          </span>
        )}
        {tc.status === 'done' && !tc.isError && <Check size={11} className="text-emerald-400 shrink-0" />}
        {tc.isError && <span className="text-xs text-red-400 shrink-0 font-medium">Error</span>}
        {tc.status !== 'running' && tc.resultPreview && (
          <button onClick={() => setExpanded(v => !v)} className="text-white/30 hover:text-white/55 shrink-0 transition-colors">
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        )}
      </div>
      {expanded && tc.resultPreview && (
        <pre className="mt-1.5 text-xs text-white/45 whitespace-pre-wrap leading-relaxed font-mono border-t border-white/6 pt-1.5">
          {tc.resultPreview}
        </pre>
      )}
    </div>
  )
}

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

  const timelineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isRunning && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight
    }
  }, [currentRun?.steps.length, currentRun?.steps.at(-1)?.output, isRunning])

  if (!currentRun) return null

  const steps = currentRun.steps
  const isDone      = currentRun.status === 'completed'
  const isFailed    = currentRun.status === 'failed'
  const isCancelled = currentRun.status === 'cancelled'
  const isFinished  = isDone || isFailed || isCancelled
  const activeStep  = steps.find((s) => s.status === 'running')
  const doneCount   = steps.filter((s) => s.status === 'done').length
  const ws          = currentRun.workspaceConfig
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
        isDone      ? 'bg-green-500/8 border-green-500/15'
        : isFailed  ? 'bg-red-500/8 border-red-500/15'
        : isCancelled ? 'bg-white/3 border-white/6'
        : isPaused  ? 'bg-blue-500/8 border-blue-500/20'
        : 'bg-purple-500/8 border-purple-500/12'
      }`}>
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          isDone      ? 'bg-green-500'
          : isFailed  ? 'bg-red-500'
          : isCancelled ? 'bg-white/20'
          : isPaused  ? 'bg-blue-400 animate-pulse'
          : 'bg-purple-500 animate-pulse'
        }`} />

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${
            isDone      ? 'text-green-400'
            : isFailed  ? 'text-red-400'
            : isCancelled ? 'text-white/35'
            : isPaused  ? 'text-blue-300'
            : 'text-purple-200'
          }`}>
            {isDone ? 'All done! Your team finished the job.'
              : isFailed ? 'Something went wrong.'
              : isCancelled ? 'Run was cancelled.'
              : isPaused ? 'Workflow paused — your input is needed!'
              : activeStep ? `${activeStep.nodeName} is working…`
              : 'Your team is starting up…'}
          </p>
          {ws && (
            <p className="text-xs text-white/30 truncate mt-0.5 flex items-center gap-1">
              {ws.mode === 'project' || ws.mode === 'existing'
                ? <><FolderOpen size={11} className="shrink-0" />{ws.projectName ?? 'project'}</>
                : <><Clock size={11} className="shrink-0" />temporary</>}
              <span className="text-white/15">·</span>
              <span className="truncate text-white/20">{ws.workspacePath}</span>
              {totalFilesWritten > 0 && (
                <span className="ml-1 text-emerald-400/70 shrink-0">
                  · {totalFilesWritten} file{totalFilesWritten !== 1 ? 's' : ''} written
                </span>
              )}
            </p>
          )}
        </div>

        {steps.length > 0 && !isPaused && (
          <span className="text-xs text-white/30 tabular-nums shrink-0 font-medium">
            {doneCount} / {steps.length} steps
          </span>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {isDone && currentRun.finalOutput && (
            <button
              onClick={openResultModal}
              className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              See Results <ArrowRight size={12} />
            </button>
          )}
          {isFinished && ws && (
            <>
              {ws.mode === 'project' || ws.mode === 'existing' ? (
                <>
                  <button onClick={handleExportZip} disabled={saving}
                    className="text-xs text-white/45 hover:text-white/70 border border-white/10 hover:border-white/25 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5"
                    title="Export project as zip"
                  >
                    {saving ? '…' : <><Download size={12} />Export</>}
                  </button>
                  <button onClick={clearRun}
                    className="text-xs text-emerald-400/75 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  ><FolderOpen size={12} />Keep Project</button>
                  <button onClick={handleDiscard}
                    className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                  >Discard</button>
                </>
              ) : (
                <button onClick={handleDiscard}
                  className="text-xs text-white/35 hover:text-white/65 border border-white/8 hover:border-white/20 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                ><X size={12} />Discard</button>
              )}
            </>
          )}
          {isRunning && (
            <button onClick={cancelRun}
              className="text-xs text-red-400/75 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            ><Square size={12} fill="currentColor" />Cancel</button>
          )}
          {!ws && (
            <button onClick={clearRun}
              className="text-white/25 hover:text-white/55 transition-colors ml-1"
              title="Dismiss"
            ><X size={15} /></button>
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
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center animate-pulse shrink-0 text-blue-400">
            <Pause size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300">Review panel is open</p>
            <p className="text-xs text-blue-300/55 mt-0.5 line-clamp-1">
              {gateInfo.message || 'Check the review popup and click Approve to continue.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Timeline ── */}
      <div ref={timelineRef} className="flex-1 overflow-y-auto px-3 py-3">
        {steps.length === 0 ? (
          <div className="flex items-center gap-2 h-full justify-center">
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.15s]" />
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.3s]" />
            <span className="text-sm text-white/30 ml-1">Preparing your team…</span>
          </div>
        ) : (
          <div className="space-y-0">
            {steps.map((step, i) => (
              <TimelineEntry key={`${step.nodeId}-${step.attempt}`} step={step} isLast={i === steps.length - 1} />
            ))}
            {logLines.filter(l => l.startsWith('[gate]') || l.startsWith('[cancelled]') || l.startsWith('[done]')).map((line, i) => (
              <div key={i} className="flex items-center gap-3 pl-1 py-1">
                <div className="w-5 flex justify-center shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                </div>
                <p className="text-xs text-white/25 italic">{line}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineEntry({ step, isLast }: { step: RunStep; isLast: boolean }) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const streamRef = useRef<HTMLDivElement>(null)

  const isRunning = step.status === 'running'
  const isDone    = step.status === 'done'
  const isError   = step.status === 'error'

  useEffect(() => {
    if (isRunning && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [step.output, isRunning])

  const durationMs = stepDurationMs(step)
  const hasFiles   = (step.filesWritten?.length ?? 0) > 0
  const hasOutput  = !isRunning && (step.output || step.error)
  const promptChars = step.input?.length ?? 0
  const role = getRoleInfo(step.nodeName, '')

  return (
    <div className="flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0 w-5">
        <div className={`w-3 h-3 rounded-full border-2 shrink-0 mt-1.5 ${
          isRunning ? 'border-purple-400 bg-purple-500/30 animate-pulse'
            : isDone  ? 'border-green-500 bg-green-500/25'
            : isError ? 'border-red-500 bg-red-500/25'
            : 'border-white/20 bg-white/5'
        }`} />
        {!isLast && <div className="w-px flex-1 bg-white/8 mt-1 mb-0" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
            isRunning ? 'bg-purple-500/20' : isDone ? 'bg-green-500/15' : role.bgColor
          }`}>
            <RoleIcon
              category={role.category}
              size={13}
              className={isRunning ? 'text-purple-300' : isDone ? 'text-green-400' : role.textColor}
            />
          </div>
          <span className="text-sm font-semibold text-white/85">
            {isRunning ? `${step.nodeName} is working…`
              : isDone  ? step.nodeName
              : isError ? `${step.nodeName} ran into a problem`
              : step.nodeName}
          </span>
          {step.attempt > 1 && (
            <span className="text-xs text-amber-400/75 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
              revision {step.attempt}
            </span>
          )}
          {isRunning && (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.15s]" />
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.3s]" />
            </span>
          )}
          {durationMs !== null && (
            <span className="text-xs text-white/30 tabular-nums ml-auto">{fmtDuration(durationMs)}</span>
          )}
          {step.tokensUsed != null && (
            <span className="text-xs text-white/25 tabular-nums">{step.tokensUsed.toLocaleString()} tok</span>
          )}
        </div>

        {/* Live streaming output */}
        {isRunning && step.output && (
          <div ref={streamRef} className="mt-2 max-h-28 overflow-y-auto rounded-lg bg-black/20 px-3 py-2 border border-purple-500/10">
            <pre className="text-xs text-purple-200/60 whitespace-pre-wrap leading-relaxed font-mono">
              {step.output}
            </pre>
          </div>
        )}

        {/* Tool calls */}
        {(step.toolCalls?.length ?? 0) > 0 && (
          <div className="mt-2 space-y-1">
            {step.toolCalls!.map((tc) => (
              <ToolCallBadge key={tc.toolCallId} tc={tc} />
            ))}
          </div>
        )}

        {/* Files written */}
        {hasFiles && (
          <div className="mt-2">
            <button
              onClick={() => setShowFiles(v => !v)}
              className="flex items-center gap-1.5 text-xs text-emerald-400/75 hover:text-emerald-300 transition-colors"
            >
              <FolderOpen size={12} />
              <span>{step.filesWritten!.length} file{step.filesWritten!.length !== 1 ? 's' : ''} written</span>
              {showFiles ? <ChevronUp size={11} className="text-white/25" /> : <ChevronDown size={11} className="text-white/25" />}
            </button>
            {showFiles && (
              <div className="mt-1.5 bg-black/20 rounded-lg p-2 space-y-0.5">
                {step.filesWritten!.map(f => (
                  <p key={f} className="text-xs text-emerald-300/60 font-mono truncate">{f}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Finished output */}
        {hasOutput && (
          <div className="mt-2">
            {showOutput ? (
              <>
                <div className="max-h-48 overflow-y-auto rounded-lg bg-black/25 px-3 py-2 border border-white/6 mb-1.5">
                  <pre className="text-xs text-white/65 whitespace-pre-wrap leading-relaxed font-mono">
                    {isError
                      ? <span className="text-red-400">{step.error}</span>
                      : step.output}
                  </pre>
                </div>
                <button
                  onClick={() => setShowOutput(false)}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors flex items-center gap-1"
                >
                  <ChevronUp size={11} />Collapse
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-white/40 line-clamp-2 leading-relaxed">
                  {isError ? step.error : step.output}
                </p>
                {((step.output?.length ?? 0) > 80 || isError) && (
                  <button
                    onClick={() => setShowOutput(true)}
                    className="text-xs text-purple-400/65 hover:text-purple-300 transition-colors mt-1 flex items-center gap-1"
                  >
                    <ChevronDown size={11} />View output →
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* View prompt */}
        {promptChars > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowPrompt(v => !v)}
              className="text-xs text-white/25 hover:text-white/45 transition-colors flex items-center gap-1"
            >
              {showPrompt ? <ChevronUp size={11} /> : <ChevronRight size={11} />}
              <span>Prompt ({promptChars.toLocaleString()} chars)</span>
            </button>
            {showPrompt && (
              <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg bg-black/30 px-3 py-2 border border-white/5">
                <pre className="text-xs text-white/40 whitespace-pre-wrap leading-relaxed font-mono">
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
