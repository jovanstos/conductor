import { useState } from 'react'
import { useChamberStore } from '../../stores/chamberStore'
import ChamberConfigPane from './ChamberConfigPane'
import ChamberArena from './ChamberArena'
import ChamberLedger from './ChamberLedger'

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
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--c-base)' }}>
      {/* Left — Config */}
      <div className="w-72 shrink-0 overflow-hidden" style={{ borderRight: '1px solid var(--c-border)' }}>
        <ChamberConfigPane onRun={handleRun} />
      </div>

      {/* Center — Arena */}
      <div className="flex-1 overflow-hidden relative">
        {startError && (
          <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2 px-3 py-2 rounded text-xs border"
            style={{ background: 'var(--c-red-dim)', borderColor: 'rgba(255,68,68,0.25)', color: '#ff8888' }}>
            <span className="flex-1">{startError}</span>
            <button onClick={() => setStartError(null)} style={{ color: 'rgba(255,136,136,0.5)' }}>✕</button>
          </div>
        )}
        <ChamberArena />
      </div>

      {/* Right — Ledger */}
      <div className="w-72 shrink-0 overflow-hidden" style={{ borderLeft: '1px solid var(--c-border)' }}>
        <ChamberLedger />
      </div>
    </div>
  )
}
