import { useState } from 'react'
import type { ReactNode } from 'react'
import { Trophy, X, Copy, Check, Download, ChevronDown, ChevronUp, FileText, Cpu, Clock, Users, Code2, Search, PenLine, BookOpen, ClipboardList, TestTube2, Megaphone, Zap } from 'lucide-react'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { useRunStore } from '../../stores/runStore'
import { writeTextFile } from '../../lib/tauri'
import { getRoleInfo, type RoleCategory } from '../../lib/defaults'
import type { Run, RunStep } from '../../types'

function RoleIcon({ category, size = 13, className = '' }: { category: RoleCategory; size?: number; className?: string }): ReactNode {
  const props = { size, className }
  switch (category) {
    case 'developer': return <Code2 {...props} />
    case 'reviewer': return <Search {...props} />
    case 'writer': return <PenLine {...props} />
    case 'researcher': return <BookOpen {...props} />
    case 'planner': return <ClipboardList {...props} />
    case 'tester': return <TestTube2 {...props} />
    case 'marketer': return <Megaphone {...props} />
    default: return <Zap {...props} />
  }
}

async function saveAsFile(content: string, defaultName: string, ext: string) {
  const path = await saveDialog({
    defaultPath: defaultName,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  })
  if (!path) return
  await writeTextFile(path, content)
}

function runDuration(run: Run): string | null {
  if (!run.completedAt) return null
  const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export default function ResultModal() {
  const { currentRun, dismissResultModal } = useRunStore()
  const [showTeamReport, setShowTeamReport] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!currentRun?.finalOutput) return null

  const { finalOutput, steps, input, startedAt } = currentRun
  const doneSteps = steps.filter((s) => s.status === 'done')
  const totalTokens = steps.reduce((sum, s) => sum + (s.tokensUsed ?? 0), 0)
  const totalFiles = new Set(steps.flatMap((s) => s.filesWritten ?? [])).size
  const duration = runDuration(currentRun)
  const startTime = new Date(startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  function copy() {
    navigator.clipboard.writeText(finalOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && dismissResultModal()}
    >
      <div className="w-full max-w-3xl max-h-[88vh] bg-[#0e0e13] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">

        {/* ── Mission Complete header ── */}
        <div className="px-6 py-5 border-b border-white/8 shrink-0 bg-green-500/5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
              <Trophy size={22} className="text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-green-300">Mission Complete</p>
              <p className="text-xs text-white/45 mt-0.5 truncate">
                "{input}"
              </p>
            </div>
            <button
              onClick={dismissResultModal}
              className="text-white/25 hover:text-white/60 transition-colors shrink-0 mt-0.5"
            >
              <X size={16} />
            </button>
          </div>

          {/* Stat bar */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/6 flex-wrap">
            <StatPill icon={<Users size={11} />} label={`${doneSteps.length} agent${doneSteps.length !== 1 ? 's' : ''}`} />
            {totalTokens > 0 && <StatPill icon={<Cpu size={11} />} label={`${totalTokens.toLocaleString()} tokens`} />}
            {totalFiles > 0 && <StatPill icon={<FileText size={11} />} label={`${totalFiles} file${totalFiles !== 1 ? 's' : ''} created`} />}
            {duration && <StatPill icon={<Clock size={11} />} label={duration} />}
            <span className="text-[10px] text-white/20 ml-auto">{startTime}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">

            {/* Team Report (collapsible) */}
            {doneSteps.length > 0 && (
              <div className="border border-white/8 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowTeamReport((v) => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-white/3 hover:bg-white/5 transition-colors text-left"
                >
                  <Users size={13} className="text-white/35 shrink-0" />
                  <span className="text-xs font-medium text-white/60 flex-1">Team Report</span>
                  {showTeamReport ? <ChevronUp size={13} className="text-white/25" /> : <ChevronDown size={13} className="text-white/25" />}
                </button>
                {showTeamReport && (
                  <div className="border-t border-white/6 divide-y divide-white/4">
                    {doneSteps.map((step, i) => (
                      <TeamContributionRow key={`${step.nodeId}-${i}`} step={step} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={copy}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  copied
                    ? 'bg-green-500/15 border-green-500/30 text-green-400'
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:bg-white/8'
                }`}
              >
                {copied ? <><Check size={12} />Copied!</> : <><Copy size={12} />Copy</>}
              </button>
              <button
                onClick={() => saveAsFile(finalOutput, 'output.txt', 'txt')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/8 transition-colors"
              >
                <Download size={12} />Save as .txt
              </button>
              <button
                onClick={() => saveAsFile(finalOutput, 'output.md', 'md')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/8 transition-colors"
              >
                <Download size={12} />Save as .md
              </button>
            </div>

            {/* Final output */}
            <div className="bg-[#0a0a0e] border border-white/8 rounded-xl p-5">
              <pre className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed font-mono">
                {finalOutput}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-white/8 bg-white/2 shrink-0">
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

function StatPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-white/45">
      <span className="text-white/30">{icon}</span>
      {label}
    </div>
  )
}

function TeamContributionRow({ step }: { step: RunStep }) {
  const [open, setOpen] = useState(false)
  const role = getRoleInfo(step.nodeName, '')
  const filesCount = step.filesWritten?.length ?? 0

  return (
    <div className="px-4 py-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left group"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${role.bgColor}`}>
          <RoleIcon category={role.category} size={12} className={role.textColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white/75">{step.nodeName}</p>
          <p className="text-[10px] text-white/30">
            {filesCount > 0 ? `Created ${filesCount} file${filesCount !== 1 ? 's' : ''}` : 'Wrote response'}
            {step.tokensUsed ? ` · ${step.tokensUsed.toLocaleString()} tokens` : ''}
          </p>
        </div>
        {filesCount > 0 && (
          <div className="flex flex-wrap gap-1 max-w-[160px] justify-end">
            {step.filesWritten!.slice(0, 3).map((f) => (
              <span key={f} className="text-[9px] bg-emerald-500/10 text-emerald-400/60 rounded px-1.5 py-0.5 font-mono truncate max-w-[80px]">
                {f.split('/').pop()}
              </span>
            ))}
            {filesCount > 3 && <span className="text-[9px] text-white/20">+{filesCount - 3}</span>}
          </div>
        )}
        {open ? <ChevronUp size={11} className="text-white/20 shrink-0" /> : <ChevronDown size={11} className="text-white/20 shrink-0" />}
      </button>
      {open && step.output && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-black/20 px-2.5 py-2 border border-white/5">
          <pre className="text-[11px] text-white/50 whitespace-pre-wrap leading-relaxed font-mono">{step.output}</pre>
        </div>
      )}
    </div>
  )
}
