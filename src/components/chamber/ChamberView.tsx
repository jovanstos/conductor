import { useState } from 'react'
import { useChamberStore } from '../../stores/chamberStore'
import ChamberConfigPane from './ChamberConfigPane'
import ChamberArena from './ChamberArena'
import ChamberLedger from './ChamberLedger'

const CONFIG_WIDTH = 280
const LEDGER_WIDTH = 300

export default function ChamberView() {
  const { startRun } = useChamberStore()
  const [startError, setStartError] = useState<string | null>(null)

  async function handleRun() {
    setStartError(null)
    try {
      await startRun()
    } catch (e) {
      setStartError(String(e))
    }
  }

  return (
    <div className="h-full flex overflow-hidden relative">
      {/* Left pane — Configuration */}
      <div className="shrink-0 overflow-hidden" style={{ width: CONFIG_WIDTH }}>
        <ChamberConfigPane onRun={handleRun} />
      </div>

      {/* Divider */}
      <div className="w-px bg-white/6 shrink-0" />

      {/* Center pane — Arena */}
      <div className="flex-1 overflow-hidden relative">
        {startError && (
          <div className="absolute top-3 left-3 right-3 z-10 bg-red-500/15 border border-red-500/25 rounded-xl px-3 py-2 text-xs text-red-300 flex items-center justify-between">
            <span>{startError}</span>
            <button onClick={() => setStartError(null)} className="ml-2 text-red-400/50 hover:text-red-400">✕</button>
          </div>
        )}
        <ChamberArena />
      </div>

      {/* Divider */}
      <div className="w-px bg-white/6 shrink-0" />

      {/* Right pane — Ledger */}
      <div className="shrink-0 overflow-hidden" style={{ width: LEDGER_WIDTH }}>
        <ChamberLedger />
      </div>
    </div>
  )
}
