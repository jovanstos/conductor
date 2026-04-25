import { useState } from 'react'
import { Copy, Check, Trophy, Star } from 'lucide-react'
import { useChamberStore } from '../../stores/chamberStore'
import type { ChamberResult } from '../../types'
import * as tauri from '../../lib/tauri'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'

export default function ChamberLedger() {
  const {
    runStatus, results, finalOutput, winnerId,
    mode, cancelRun, reset,
  } = useChamberStore()

  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const isCompleted = runStatus === 'completed'
  const hasError = runStatus === 'error'
  const { error } = useChamberStore()

  async function handleCopy() {
    if (!finalOutput) return
    await navigator.clipboard.writeText(finalOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSaveFile() {
    if (!finalOutput) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const path = await saveDialog({
        filters: [{ name: 'Text', extensions: ['txt', 'md'] }],
        defaultPath: 'chamber_output.md',
      })
      if (!path) { setSaving(false); return }
      await tauri.writeTextFile(path, finalOutput)
      setSaveMsg('Saved.')
    } catch (e) {
      setSaveMsg(`Error: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  // Sort results by score descending
  const sortedResults = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--c-surface)' }}>
      {/* Header */}
      <div className="px-4 h-12 flex items-center shrink-0" style={{ borderBottom: '1px solid var(--c-border-subtle)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
          {isCompleted ? 'Results' : 'Ledger'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* Error state */}
        {hasError && error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-3">
            <p className="text-xs font-semibold text-red-400 mb-1">Run failed</p>
            <p className="text-xs text-red-300/70 leading-relaxed">{error}</p>
          </div>
        )}

        {/* Cancelled state */}
        {runStatus === 'cancelled' && (
          <div className="bg-white/4 border border-white/8 rounded-xl px-3 py-3 text-center">
            <p className="text-xs text-white/40">Run was cancelled</p>
          </div>
        )}

        {/* Results — Audition mode rankings */}
        {isCompleted && mode === 'audition' && results.length > 0 && (
          <section>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Rankings
            </label>
            <div className="space-y-2">
              {sortedResults.map((r, i) => (
                <ResultCard key={r.agentId} result={r} rank={i + 1} isWinner={r.agentId === winnerId || i === 0} />
              ))}
            </div>
          </section>
        )}

        {/* Results — War Room / Syndicate */}
        {isCompleted && (mode === 'war_room' || mode === 'syndicate') && results.length > 0 && (
          <section>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Agents
            </label>
            <div className="space-y-2">
              {results.map((r) => (
                <ResultCard key={r.agentId} result={r} isWinner={false} />
              ))}
            </div>
          </section>
        )}

        {/* Final Output */}
        {isCompleted && finalOutput && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                {mode === 'audition' ? '🏆 Winning Output' : mode === 'war_room' ? '⚔️ Final Proposal' : '🔗 Unified Document'}
              </label>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-xl p-3 max-h-64 overflow-y-auto">
              <p className="text-xs text-white/65 whitespace-pre-wrap leading-relaxed font-mono">
                {finalOutput}
              </p>
            </div>
          </section>
        )}

        {/* Idle placeholder */}
        {runStatus === 'idle' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <Trophy size={24} className="text-white/10" />
            <p className="text-xs text-white/20">Scores and final output will appear here</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 shrink-0 space-y-2" style={{ borderTop: '1px solid var(--c-border-subtle)' }}>
        {isCompleted && finalOutput && (
          <>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:text-white/75 hover:border-white/20 transition-colors"
              >
                {copied ? <><Check size={12} className="text-emerald-400" /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
              <button
                onClick={handleSaveFile}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:text-white/75 hover:border-white/20 transition-colors disabled:opacity-40"
              >
                {saving ? 'Saving...' : '💾 Save File'}
              </button>
            </div>
            {saveMsg && <p className="text-xs text-center text-white/35">{saveMsg}</p>}
          </>
        )}

        {(isCompleted || hasError || runStatus === 'cancelled') && (
          <button
            onClick={reset}
            className="w-full py-2 rounded-xl border border-white/8 text-xs text-white/35 hover:text-white/60 hover:border-white/18 transition-colors"
          >
            Reset Chamber
          </button>
        )}

        {(runStatus === 'running' || runStatus === 'paused') && (
          <button
            onClick={cancelRun}
            className="w-full py-2 rounded-xl border border-red-500/20 text-xs text-red-400/60 hover:text-red-400 hover:border-red-500/40 transition-colors"
          >
            Cancel Run
          </button>
        )}
      </div>
    </div>
  )
}

function ResultCard({ result, rank, isWinner }: { result: ChamberResult; rank?: number; isWinner: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors ${
      isWinner
        ? 'border-amber-500/30 bg-amber-500/5'
        : 'border-white/6 bg-white/2'
    }`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {rank !== undefined && (
          <span className={`text-xs font-bold w-5 shrink-0 ${isWinner ? 'text-amber-300' : 'text-white/25'}`}>
            #{rank}
          </span>
        )}
        {isWinner && <Trophy size={12} className="text-amber-400 shrink-0" />}
        <span className="text-xs font-medium text-white/70 truncate flex-1">{result.agentName}</span>
        {result.score !== undefined && (
          <span className={`text-xs font-bold shrink-0 flex items-center gap-0.5 ${isWinner ? 'text-amber-300' : 'text-white/40'}`}>
            <Star size={10} fill="currentColor" />
            {result.score.toFixed(1)}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/5">
          <p className="text-xs text-white/50 whitespace-pre-wrap leading-relaxed font-mono max-h-40 overflow-y-auto pt-2">
            {result.output}
          </p>
        </div>
      )}
    </div>
  )
}
