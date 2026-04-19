import { useState } from 'react'
import { useRunStore } from '../../stores/runStore'
import type { RunStep } from '../../types'

export default function RunDrawer({ height }: { height: number }) {
  const { currentRun, isRunning, isPaused, gateInfo, cancelRun, clearRun, openResultModal } =
    useRunStore()
  if (!currentRun) return null

  // Latest step per agent
  const agentMap = new Map<string, RunStep>()
  for (const step of currentRun.steps) {
    agentMap.set(step.nodeId, step)
  }
  const agentSteps = Array.from(agentMap.values())

  const activeStep = agentSteps.find((s) => s.status === 'running')
  const doneCount = agentSteps.filter((s) => s.status === 'done').length
  const isDone = currentRun.status === 'completed'
  const isFailed = currentRun.status === 'failed'
  const isCancelled = currentRun.status === 'cancelled'

  const gridCols =
    agentSteps.length <= 1 ? 'grid-cols-1' : agentSteps.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <div
      className="shrink-0 flex flex-col bg-[#08080b] overflow-hidden"
      style={{ height }}
    >
      {/* ── Status bar ── */}
      <div
        className={`flex items-center gap-3 px-4 py-2.5 border-b shrink-0 ${
          isDone
            ? 'bg-green-500/8 border-green-500/15'
            : isFailed
              ? 'bg-red-500/8 border-red-500/15'
              : isCancelled
                ? 'bg-white/3 border-white/6'
                : isPaused
                  ? 'bg-blue-500/8 border-blue-500/20'
                  : 'bg-purple-500/8 border-purple-500/12'
        }`}
      >
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isDone
              ? 'bg-green-500'
              : isFailed
                ? 'bg-red-500'
                : isCancelled
                  ? 'bg-white/20'
                  : isPaused
                    ? 'bg-blue-400 animate-pulse'
                    : 'bg-purple-500 animate-pulse'
          }`}
        />

        <p
          className={`text-sm font-semibold ${
            isDone
              ? 'text-green-400'
              : isFailed
                ? 'text-red-400'
                : isCancelled
                  ? 'text-white/35'
                  : isPaused
                    ? 'text-blue-300'
                    : 'text-purple-200'
          }`}
        >
          {isDone
            ? 'All done! Your team finished the job.'
            : isFailed
              ? 'Something went wrong.'
              : isCancelled
                ? 'Run was cancelled.'
                : isPaused
                  ? 'Workflow paused — your input is needed!'
                  : activeStep
                    ? `${activeStep.nodeName} is working...`
                    : 'Your team is starting up...'}
        </p>

        {agentSteps.length > 0 && !isPaused && (
          <span className="text-[11px] text-white/25 tabular-nums">
            {doneCount} / {agentSteps.length} done
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isDone && currentRun.finalOutput && (
            <button
              onClick={openResultModal}
              className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              See Full Results →
            </button>
          )}
          {isRunning && (
            <button
              onClick={cancelRun}
              className="text-xs text-red-400/70 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 px-2.5 py-1 rounded-lg transition-colors"
            >
              ■ Cancel
            </button>
          )}
          <button
            onClick={clearRun}
            className="text-white/20 hover:text-white/50 text-base leading-none transition-colors ml-1"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Review gate notice ── */}
      {isPaused && gateInfo && (
        <div className="mx-3 mt-2.5 shrink-0 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-base animate-pulse shrink-0">
            ⏸
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300">Review panel is open</p>
            <p className="text-xs text-blue-300/55 mt-0.5 line-clamp-1">
              {gateInfo.message || 'Check the review popup and click Approve to continue.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Employee cards ── */}
      <div className="flex-1 overflow-y-auto p-3">
        {agentSteps.length === 0 ? (
          <div className="flex items-center gap-2 h-full justify-center">
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.15s]" />
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.3s]" />
            <span className="text-sm text-white/30 ml-1">Preparing your team...</span>
          </div>
        ) : (
          <div className={`grid gap-2.5 ${gridCols}`}>
            {agentSteps.map((step) => (
              <EmployeeCard key={step.nodeId} step={step} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmployeeCard({ step }: { step: RunStep }) {
  const [expanded, setExpanded] = useState(false)

  const isRunning = step.status === 'running'
  const isDone = step.status === 'done'
  const isError = step.status === 'error'
  const hasOutput = !isRunning && (step.output || step.error)

  return (
    <div
      className={`rounded-xl border p-3 transition-all duration-300 ${
        isRunning
          ? 'border-purple-500/50 bg-purple-500/8 shadow-[0_0_18px_rgba(168,85,247,0.12)]'
          : isDone
            ? 'border-green-500/30 bg-green-500/5'
            : isError
              ? 'border-red-500/30 bg-red-500/5'
              : 'border-white/8 bg-white/2'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${
            isRunning
              ? 'bg-purple-500/20 animate-pulse'
              : isDone
                ? 'bg-green-500/15'
                : isError
                  ? 'bg-red-500/15'
                  : 'bg-white/6'
          }`}
        >
          {isRunning ? '⚡' : isDone ? '✓' : isError ? '✗' : '·'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-xs font-semibold text-white/90 truncate">{step.nodeName}</p>
            {step.attempt > 1 && (
              <span className="text-[9px] text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                retry {step.attempt}
              </span>
            )}
          </div>
          <p
            className={`text-[10px] font-medium ${
              isRunning
                ? 'text-purple-300/80'
                : isDone
                  ? 'text-green-400/70'
                  : isError
                    ? 'text-red-400/70'
                    : 'text-white/25'
            }`}
          >
            {isRunning ? (
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce inline-block" />
                <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce inline-block [animation-delay:0.15s]" />
                <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce inline-block [animation-delay:0.3s]" />
                <span className="ml-0.5">Thinking...</span>
              </span>
            ) : isDone ? (
              'Finished'
            ) : isError ? (
              'Error'
            ) : (
              'Waiting'
            )}
          </p>
        </div>
      </div>

      {/* Live streaming output while running */}
      {isRunning && step.output && (
        <div className="mt-2 pt-2 border-t border-white/6">
          <div className="max-h-40 overflow-y-auto rounded-lg bg-black/20 p-2">
            <pre className="text-[10px] text-purple-200/60 whitespace-pre-wrap leading-relaxed font-mono">
              {step.output}
            </pre>
          </div>
        </div>
      )}

      {/* Finished output section */}
      {hasOutput && (
        <div className="mt-2 pt-2 border-t border-white/6">
          {expanded ? (
            <>
              <div className="max-h-52 overflow-y-auto rounded-lg bg-black/25 p-2.5 mb-1.5">
                <pre className="text-xs text-white/70 whitespace-pre-wrap leading-relaxed font-mono">
                  {step.error ? (
                    <span className="text-red-400">{step.error}</span>
                  ) : (
                    step.output
                  )}
                </pre>
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                ▲ Show less
              </button>
            </>
          ) : (
            <>
              <p className="text-[10px] text-white/40 line-clamp-2 leading-relaxed mb-1">
                {step.error ?? step.output}
              </p>
              {(step.output?.length ?? 0) > 80 && (
                <button
                  onClick={() => setExpanded(true)}
                  className="text-[10px] text-purple-400/60 hover:text-purple-300 transition-colors"
                >
                  ▼ Read full response
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
