import { useEffect, useState } from 'react'
import {
  Plus, Target, Trash2, ChevronRight, Briefcase,
} from 'lucide-react'
import { useMissionStore } from '../../stores/missionStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import MissionView from '../conductor/MissionView'
import CreateMissionModal from '../conductor/CreateMissionModal'
import EscalationModal from '../conductor/EscalationModal'

export default function ManagerView() {
  const { missions, currentMissionId, selectMission, deleteMission, liveStatus, loadMissions, activeEscalation } = useMissionStore()
  const { setCurrentWorkflow } = useWorkflowStore()
  const [showNewModal, setShowNewModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    loadMissions()
  }, [loadMissions])

  function handleSelect(id: string) {
    selectMission(id)
    setCurrentWorkflow(null)
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Left sidebar: mission list ── */}
      <div
        className="shrink-0 flex flex-col overflow-hidden border-r"
        style={{ width: 260, background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-3 pt-4 pb-3">
          <Briefcase size={14} style={{ color: 'var(--c-accent)' }} />
          <span className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--c-text-3)' }}>
            Missions
          </span>
          <button
            onClick={() => setShowNewModal(true)}
            className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium"
            style={{ color: 'var(--c-accent)', background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}
            title="New mission"
          >
            <Plus size={14} /> New
          </button>
        </div>

        {/* Mission list */}
        <div className="flex-1 overflow-y-auto pb-4">
          {missions.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                style={{ background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}
              >
                <Target size={20} style={{ color: 'var(--c-accent)' }} />
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>No missions yet</p>
              <p className="text-xs mb-3" style={{ color: 'var(--c-text-dim)' }}>
                Create a mission to deploy a Manager Agent toward your goals.
              </p>
              <button
                onClick={() => setShowNewModal(true)}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ color: 'var(--c-accent)', background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}
              >
                Create mission
              </button>
            </div>
          ) : (
            missions.map((m) => {
              const status = liveStatus[m.id] ?? m.status
              const isActive = currentMissionId === m.id
              const isRunning = status === 'running' || status === 'escalating' || status === 'briefing'
              const activeGoals = m.goals.filter((g) => g.status === 'active').length
              const doneGoals = m.goals.filter((g) => g.status === 'completed').length

              return (
                <div key={m.id} className="relative group px-2">
                  {deletingId === m.id ? (
                    <div className="mx-1 my-1 px-3 py-2.5 rounded-xl border" style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>
                      <p className="text-xs mb-2 truncate" style={{ color: 'var(--c-red)' }}>Delete "{m.name}"?</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={async () => { await deleteMission(m.id); setDeletingId(null) }}
                          className="flex-1 py-1 rounded text-xs font-semibold"
                          style={{ background: 'var(--c-red)', color: '#fff' }}
                        >Delete</button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="flex-1 py-1 rounded text-xs"
                          style={{ background: 'var(--c-elevated)', color: 'var(--c-text-2)' }}
                        >Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelect(m.id)}
                      className="w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-all"
                      style={{
                        background: isActive ? 'var(--c-card)' : 'transparent',
                        border: isActive ? '1px solid var(--c-accent-border)' : '1px solid transparent',
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--c-card)'; e.currentTarget.style.borderColor = 'var(--c-border)' } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' } }}
                    >
                      {/* Status indicator */}
                      <div className="shrink-0 mt-0.5">
                        {isRunning ? (
                          <span className="pulse-accent w-2.5 h-2.5 rounded-full inline-block" style={{ background: status === 'briefing' ? 'var(--c-amber)' : 'var(--c-accent)' }} />
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: isActive ? 'var(--c-accent)' : 'var(--c-border)' }} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: isActive ? 'var(--c-text-1)' : 'var(--c-text-2)' }}>
                          {m.name}
                        </p>
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-dim)' }}>
                          {activeGoals} active · {doneGoals} done
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <StatusPill status={status} />
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingId(m.id) }}
                          className="w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: 'var(--c-text-3)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-red)'; e.currentTarget.style.background = 'var(--c-red-dim)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-3)'; e.currentTarget.style.background = 'transparent' }}
                        >
                          <Trash2 size={11} />
                        </button>
                        {isActive && <ChevronRight size={12} style={{ color: 'var(--c-accent)' }} />}
                      </div>
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-hidden relative">
        {currentMissionId ? (
          <MissionView />
        ) : (
          <ManagerEmpty onNew={() => setShowNewModal(true)} />
        )}
      </div>

      {activeEscalation && <EscalationModal />}
      {showNewModal && <CreateMissionModal onClose={() => setShowNewModal(false)} />}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    idle:       { label: 'Idle',      color: 'var(--c-text-dim)',   bg: 'transparent' },
    running:    { label: 'Running',   color: 'var(--c-accent)',     bg: 'var(--c-accent-dim)' },
    briefing:   { label: 'Briefing',  color: 'var(--c-amber)',      bg: 'var(--c-amber-dim)' },
    escalating: { label: 'Waiting',   color: 'var(--c-amber)',      bg: 'var(--c-amber-dim)' },
    completed:  { label: 'Complete',  color: 'var(--c-green)',      bg: 'var(--c-green-dim)' },
    paused:     { label: 'Paused',    color: 'var(--c-text-3)',     bg: 'var(--c-card)' },
  }
  const c = cfg[status] ?? cfg.idle
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: c.color, background: c.bg }}>
      {c.label}
    </span>
  )
}

function ManagerEmpty({ onNew }: { onNew: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}
      >
        <Briefcase size={24} style={{ color: 'var(--c-accent)' }} />
      </div>
      <div className="max-w-sm">
        <p className="text-lg font-bold mb-2" style={{ color: 'var(--c-text-1)' }}>Manager</p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Deploy a Manager Agent that runs autonomously toward your goals — dispatching specialist workers, reviewing their output, and escalating decisions back to you.
        </p>
      </div>
      <button
        onClick={onNew}
        className="flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold"
        style={{ color: '#000', background: 'var(--c-accent)' }}
      >
        <Plus size={16} /> New Mission
      </button>
    </div>
  )
}
