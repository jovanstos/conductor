import { useState } from 'react'
import { Sparkles, X, Copy, Check, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { useRunStore } from '../../stores/runStore'
import { writeTextFile } from '../../lib/tauri'
import type { RunStep } from '../../types'

async function saveAsFile(content: string, defaultName: string, ext: string) {
  const path = await saveDialog({
    defaultPath: defaultName,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  })
  if (!path) return
  await writeTextFile(path, content)
}

export default function ResultModal() {
  const { currentRun, dismissResultModal } = useRunStore()
  const [tab, setTab] = useState<'output' | 'steps'>('output')
  const [copied, setCopied] = useState(false)
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  if (!currentRun?.finalOutput) return null

  const { finalOutput, steps, input, startedAt } = currentRun
  const completedAt = new Date().toLocaleTimeString()
  const startTime = new Date(startedAt).toLocaleTimeString()

  function copy() {
    navigator.clipboard.writeText(finalOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && dismissResultModal()}
    >
      <div className="w-full max-w-4xl max-h-[88vh] bg-[#0e0e13] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-start gap-4 px-6 py-5 border-b border-white/8 shrink-0 bg-green-500/5">
          <div className="w-11 h-11 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
            <Sparkles size={20} className="text-green-400/70" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-white/90">Workflow Complete</p>
            <p className="text-xs text-white/35 mt-0.5 truncate">
              Task: <span className="text-white/55">{input}</span>
            </p>
            <p className="text-xs text-white/25 mt-0.5">
              Started {startTime} · {steps.filter((s) => s.status === 'done').length} agents completed
            </p>
          </div>
          <button
            onClick={dismissResultModal}
            className="text-white/25 hover:text-white/60 transition-colors shrink-0 mt-0.5"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 px-6 pt-4 pb-0 border-b border-white/8 shrink-0">
          <TabBtn active={tab === 'output'} onClick={() => setTab('output')}>
            Final Output
          </TabBtn>
          <TabBtn active={tab === 'steps'} onClick={() => setTab('steps')}>
            Step by Step ({steps.length})
          </TabBtn>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'output' ? (
            <div className="p-6">
              {/* Action buttons */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={copy}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    copied
                      ? 'bg-green-500/15 border-green-500/30 text-green-400'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:bg-white/8'
                  }`}
                >
                  {copied
                    ? <><Check size={12} className="inline mr-1" />Copied!</>
                    : <><Copy size={12} className="inline mr-1" />Copy</>
                  }
                </button>
                <button
                  onClick={() => saveAsFile(finalOutput, 'output.txt', 'txt')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/8 transition-colors"
                >
                  <Download size={12} className="inline mr-1" />Save as .txt
                </button>
                <button
                  onClick={() => saveAsFile(finalOutput, 'output.md', 'md')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/8 transition-colors"
                >
                  <Download size={12} className="inline mr-1" />Save as .md
                </button>
              </div>

              {/* Output */}
              <div className="bg-[#0a0a0e] border border-white/8 rounded-xl p-5">
                <pre className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed font-mono">
                  {finalOutput}
                </pre>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-2">
              {steps.map((step, i) => (
                <StepAccordion
                  key={`${step.nodeId}-${step.attempt}-${i}`}
                  step={step}
                  index={i + 1}
                  isExpanded={expandedStep === `${step.nodeId}-${step.attempt}`}
                  onToggle={() =>
                    setExpandedStep(
                      expandedStep === `${step.nodeId}-${step.attempt}`
                        ? null
                        : `${step.nodeId}-${step.attempt}`,
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/8 bg-white/2 shrink-0">
          <p className="text-[11px] text-white/25">
            Completed at {completedAt}
          </p>
          <button
            onClick={dismissResultModal}
            className="text-xs text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/8 border border-white/8 px-4 py-1.5 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
        active
          ? 'text-white/85 border-purple-500'
          : 'text-white/35 border-transparent hover:text-white/60'
      }`}
    >
      {children}
    </button>
  )
}

function StepAccordion({
  step,
  index,
  isExpanded,
  onToggle,
}: {
  step: RunStep
  index: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const isDone = step.status === 'done'
  const isError = step.status === 'error'

  return (
    <div className="border border-white/8 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white/3 hover:bg-white/5 transition-colors text-left"
      >
        <span
          className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0 ${
            isDone ? 'bg-green-500/15 text-green-400' : isError ? 'bg-red-500/15 text-red-400' : 'bg-white/8 text-white/40'
          }`}
        >
          {isDone ? <Check size={11} /> : isError ? <X size={11} /> : index}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-white/80 font-medium">{step.nodeName}</span>
          {step.attempt > 1 && (
            <span className="ml-2 text-[10px] text-amber-400/60 bg-amber-500/8 px-1.5 py-0.5 rounded-full">
              attempt {step.attempt}
            </span>
          )}
        </div>
        {step.tokensUsed && (
          <span className="text-[10px] text-white/20 shrink-0">{step.tokensUsed.toLocaleString()} tokens</span>
        )}
        {isExpanded ? <ChevronUp size={14} className="text-white/25 shrink-0" /> : <ChevronDown size={14} className="text-white/25 shrink-0" />}
      </button>

      {isExpanded && (
        <div className="px-4 py-3 border-t border-white/6 bg-[#0a0a0e]">
          {step.error ? (
            <p className="text-sm text-red-400/80 font-mono">{step.error}</p>
          ) : step.output ? (
            <pre className="text-sm text-white/65 whitespace-pre-wrap leading-relaxed font-mono">
              {step.output}
            </pre>
          ) : (
            <p className="text-sm text-white/25 italic">No output</p>
          )}
        </div>
      )}
    </div>
  )
}
