import { useState } from 'react'
import { X, Folder, Target, Clock, Zap } from 'lucide-react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useMissionStore } from '../../stores/missionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import ModelPicker from '../shared/ModelPicker'
import type { ModelConfig } from '../../types'

export default function CreateMissionModal({ onClose }: { onClose: () => void }) {
  const { createMission, selectMission } = useMissionStore()
  const { defaultModel } = useSettingsStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [runMode, setRunMode] = useState<'goal_driven' | 'event_driven'>('goal_driven')
  const [cyclePeriodMinutes, setCyclePeriodMinutes] = useState(30)
  const [managerModel, setManagerModel] = useState<ModelConfig>({ ...defaultModel })
  const [allowManagerGoals, setAllowManagerGoals] = useState(false)
  const [autoBriefing, setAutoBriefing] = useState(false)
  const [workspacePath, setWorkspacePath] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      const mission = await createMission({
        name: name.trim(),
        description: description.trim(),
        runMode,
        cyclePeriodMinutes,
        managerModel,
        allowManagerGoals,
        autoBriefing,
        workspacePath: workspacePath.trim() || undefined,
      })
      selectMission(mission.id)
      onClose()
    } finally {
      setCreating(false)
    }
  }

  async function pickWorkspace() {
    const selected = await openDialog({ directory: true, multiple: false, title: 'Select Mission Workspace' })
    if (selected && typeof selected === 'string') setWorkspacePath(selected)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[560px] max-h-[88vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b" style={{ borderColor: 'var(--c-border)' }}>
          <div>
            <p className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>New Mission</p>
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
              Set up your Manager Agent and its corporate mandate
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--c-text-3)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--c-text-2)' }}>
              Mission Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Social Media Manager, Code Review Team, Research Unit"
              className="w-full conductor-input px-4 py-2.5 text-sm"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--c-text-2)' }}>
              Mission Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this mission trying to accomplish? What's the big picture?"
              rows={3}
              className="w-full conductor-input px-4 py-2.5 text-sm resize-none"
            />
          </div>

          {/* Manager Model */}
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--c-text-2)' }}>
              Manager Agent Model
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>
              The Manager + all sub-agents it dispatches will use this model. Use the most capable model you have.
            </p>
            <ModelPicker value={managerModel} onChange={setManagerModel} />
          </div>

          {/* Run Mode */}
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--c-text-2)' }}>
              Run Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRunMode('goal_driven')}
                className="p-4 rounded-xl text-left transition-all"
                style={{
                  background: runMode === 'goal_driven' ? 'var(--c-accent-dim)' : 'var(--c-card)',
                  border: `1px solid ${runMode === 'goal_driven' ? 'var(--c-accent-border)' : 'var(--c-border)'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} style={{ color: runMode === 'goal_driven' ? 'var(--c-accent)' : 'var(--c-text-3)' }} />
                  <span className="text-sm font-semibold" style={{ color: runMode === 'goal_driven' ? 'var(--c-accent)' : 'var(--c-text-1)' }}>
                    Goal-Driven Cycles
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                  Manager runs every N minutes, reviews progress, dispatches work. Like a manager who checks in regularly.
                </p>
              </button>
              <button
                onClick={() => setRunMode('event_driven')}
                className="p-4 rounded-xl text-left transition-all"
                style={{
                  background: runMode === 'event_driven' ? 'var(--c-accent-dim)' : 'var(--c-card)',
                  border: `1px solid ${runMode === 'event_driven' ? 'var(--c-accent-border)' : 'var(--c-border)'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={14} style={{ color: runMode === 'event_driven' ? 'var(--c-accent)' : 'var(--c-text-3)' }} />
                  <span className="text-sm font-semibold" style={{ color: runMode === 'event_driven' ? 'var(--c-accent)' : 'var(--c-text-1)' }}>
                    Event-Driven
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                  Manager reacts to completions and errors. More efficient, lower token usage. Like a reactive system.
                </p>
              </button>
            </div>
          </div>

          {/* Cycle period (only for goal_driven) */}
          {runMode === 'goal_driven' && (
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--c-text-2)' }}>
                Cycle Period
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={cyclePeriodMinutes}
                  onChange={(e) => setCyclePeriodMinutes(Math.max(1, Number(e.target.value)))}
                  min={1}
                  max={1440}
                  className="w-24 conductor-input px-3 py-2 text-sm"
                />
                <span className="text-sm" style={{ color: 'var(--c-text-3)' }}>minutes between cycles</span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--c-text-dim)' }}>
                Shorter = more active but higher token costs. 30 min is a good starting point.
              </p>
            </div>
          )}

          {/* Manager goal creation */}
          <div>
            <div className="flex items-start gap-4 p-4 rounded-xl"
              style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--c-text-1)' }}>
                  Allow Manager to create its own goals
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                  When enabled, the Manager can define new goals it thinks the mission needs — like a real manager who spots opportunities beyond the initial brief.
                  When disabled, only you can add goals.
                </p>
              </div>
              <button
                onClick={() => setAllowManagerGoals(!allowManagerGoals)}
                className="relative shrink-0 w-12 h-6 rounded-full transition-all mt-0.5"
                style={{
                  background: allowManagerGoals ? 'var(--c-accent-dim)' : 'var(--c-elevated)',
                  border: `1px solid ${allowManagerGoals ? 'var(--c-accent-border)' : 'var(--c-border)'}`,
                }}
              >
                <span
                  className="absolute top-1 rounded-full transition-all"
                  style={{
                    width: '14px', height: '14px',
                    background: allowManagerGoals ? 'var(--c-accent)' : 'var(--c-text-3)',
                    left: allowManagerGoals ? 'calc(100% - 18px)' : '3px',
                  }}
                />
              </button>
            </div>
          </div>

          {/* Auto briefing toggle */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--c-text-1)' }}>
                  Auto mode (skip briefing)
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                  When disabled (default), the Manager presents its plan before each cycle and waits for your approval.
                  When enabled, it skips the review step and acts immediately — faster, but less oversight.
                </p>
              </div>
              <button
                onClick={() => setAutoBriefing(!autoBriefing)}
                className="relative shrink-0 w-12 h-6 rounded-full transition-all mt-0.5"
                style={{
                  background: autoBriefing ? 'var(--c-green-dim)' : 'var(--c-elevated)',
                  border: `1px solid ${autoBriefing ? 'rgba(34,197,94,0.35)' : 'var(--c-border)'}`,
                }}
              >
                <span
                  className="absolute top-1 rounded-full transition-all"
                  style={{
                    width: '14px', height: '14px',
                    background: autoBriefing ? 'var(--c-green)' : 'var(--c-text-3)',
                    left: autoBriefing ? 'calc(100% - 18px)' : '3px',
                  }}
                />
              </button>
            </div>
          </div>

          {/* Workspace */}
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--c-text-2)' }}>
              Workspace Folder
            </label>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl"
                style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
              >
                <Folder size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                <span className="text-sm truncate" style={{ color: workspacePath ? 'var(--c-text-1)' : 'var(--c-text-dim)' }}>
                  {workspacePath || 'No folder selected (agents can still run without file access)'}
                </span>
              </div>
              <button
                onClick={pickWorkspace}
                className="px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'var(--c-elevated)', color: 'var(--c-text-1)', border: '1px solid var(--c-border)' }}
              >
                Browse
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 justify-end px-6 py-4 shrink-0 border-t" style={{ borderColor: 'var(--c-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm"
            style={{ color: 'var(--c-text-3)', background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-40"
            style={{ background: 'var(--c-accent)', color: '#000' }}
          >
            <Target size={14} />
            {creating ? 'Creating…' : 'Create Mission'}
          </button>
        </div>
      </div>
    </div>
  )
}
