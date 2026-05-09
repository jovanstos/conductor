import { useState } from 'react'
import { Clock, CalendarClock } from 'lucide-react'
import type { WorkflowSchedule, ScheduleInterval } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'

const INTERVAL_OPTIONS: { value: ScheduleInterval; label: string }[] = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours',   label: 'hours' },
  { value: 'daily',   label: 'daily' },
  { value: 'weekly',  label: 'weekly' },
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function SchedulePanel() {
  const { currentWorkflow, updateWorkflowMeta } = useWorkflowStore()

  if (!currentWorkflow) return null

  const sched = currentWorkflow.settings?.schedule

  const [enabled, setEnabled] = useState(sched?.enabled ?? false)
  const [interval, setInterval] = useState<ScheduleInterval>(sched?.interval ?? 'hours')
  const [intervalValue, setIntervalValue] = useState(sched?.intervalValue ?? 1)
  const [time, setTime] = useState(sched?.time ?? '09:00')
  const [days, setDays] = useState<number[]>(sched?.days ?? [1, 3, 5])
  const [task, setTask] = useState(sched?.task ?? '')

  function saveSchedule(patch?: Partial<WorkflowSchedule>) {
    const newSched: WorkflowSchedule = {
      enabled,
      interval,
      intervalValue,
      time,
      days,
      task,
      ...patch,
    }
    updateWorkflowMeta({
      settings: {
        ...currentWorkflow.settings,
        schedule: newSched,
      },
    })
  }

  function toggleDay(d: number) {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()
    setDays(next)
    saveSchedule({ days: next })
  }

  function getNextRunLabel(): string {
    if (!enabled) return 'Disabled'
    if (interval === 'minutes') return `Every ${intervalValue} minute${intervalValue !== 1 ? 's' : ''}`
    if (interval === 'hours') return `Every ${intervalValue} hour${intervalValue !== 1 ? 's' : ''}`
    if (interval === 'daily') return `Daily at ${time}`
    if (interval === 'weekly') {
      const dayNames = days.map((d) => DAYS[d]).join(', ')
      return `${dayNames} at ${time}`
    }
    return ''
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock size={16} style={{ color: enabled ? 'var(--c-amber)' : 'var(--c-text-3)' }} />
        <span className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>Schedule</span>
        <div className="ml-auto">
          <ToggleSwitch
            value={enabled}
            onChange={(v) => { setEnabled(v); saveSchedule({ enabled: v }) }}
            color="amber"
          />
        </div>
      </div>

      {/* Task input */}
      <div>
        <label className="block text-xs uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--c-text-3)' }}>
          Task input
        </label>
        <input
          className="w-full conductor-input rounded px-3 py-2 text-sm"
          placeholder="What should the agents do on each run?"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onBlur={() => saveSchedule()}
        />
      </div>

      {/* Interval type */}
      <div>
        <label className="block text-xs uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--c-text-3)' }}>
          Repeat
        </label>
        <div className="grid grid-cols-4 gap-1">
          {INTERVAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setInterval(opt.value); saveSchedule({ interval: opt.value }) }}
              className="py-1.5 rounded text-xs text-center transition-all"
              style={interval === opt.value
                ? { background: 'var(--c-amber-dim)', color: 'var(--c-amber)', border: '1px solid rgba(255,170,0,0.25)' }
                : { background: 'var(--c-card)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interval value (for minutes/hours) */}
      {(interval === 'minutes' || interval === 'hours') && (
        <div>
          <label className="block text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-2)' }}>
            Every
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={interval === 'minutes' ? 59 : 23}
              value={intervalValue}
              onChange={(e) => { setIntervalValue(Number(e.target.value)); saveSchedule({ intervalValue: Number(e.target.value) }) }}
              className="w-20 conductor-input rounded px-3 py-2 text-sm"
            />
            <span className="text-sm" style={{ color: 'var(--c-text-2)' }}>{interval}</span>
          </div>
        </div>
      )}

      {/* Time (for daily/weekly) */}
      {(interval === 'daily' || interval === 'weekly') && (
        <div>
          <label className="block text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-2)' }}>
            At time
          </label>
          <input
            type="time" value={time}
            onChange={(e) => { setTime(e.target.value); saveSchedule({ time: e.target.value }) }}
            className="conductor-input rounded px-3 py-2 text-sm"
            style={{ colorScheme: 'dark' }}
          />
        </div>
      )}

      {/* Day picker for weekly */}
      {interval === 'weekly' && (
        <div>
          <label className="block text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-2)' }}>
            On days
          </label>
          <div className="flex gap-1">
            {DAYS.map((dayName, idx) => (
              <button
                key={idx}
                onClick={() => toggleDay(idx)}
                className="flex-1 py-1.5 rounded text-xs transition-all"
                style={days.includes(idx)
                  ? { background: 'var(--c-amber-dim)', color: 'var(--c-amber)', border: '1px solid rgba(255,170,0,0.25)' }
                  : { background: 'var(--c-card)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }
                }
              >
                {dayName[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div
        className="rounded px-3 py-2.5 text-xs"
        style={{
          background: enabled ? 'var(--c-amber-dim)' : 'var(--c-card)',
          border: `1px solid ${enabled ? 'rgba(255,170,0,0.2)' : 'var(--c-border)'}`,
          color: enabled ? 'var(--c-amber)' : 'var(--c-text-3)',
        }}
      >
        <div className="flex items-center gap-2">
          <Clock size={12} />
          <span className="font-mono-accent">{getNextRunLabel()}</span>
        </div>
        {enabled && !task.trim() && (
          <p className="mt-1" style={{ color: 'rgba(255,170,0,0.6)' }}>
            Add a task input above to enable scheduling
          </p>
        )}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-dim)' }}>
        Scheduled runs trigger while the app is open. For persistent scheduling, use an OS task scheduler or system service.
      </p>
    </div>
  )
}

function ToggleSwitch({ value, onChange, color = 'amber' }: { value: boolean; onChange: (v: boolean) => void; color?: 'green' | 'amber' }) {
  const accentColor = color === 'amber' ? 'var(--c-amber)' : 'var(--c-accent)'
  const accentDim   = color === 'amber' ? 'var(--c-amber-dim)' : 'var(--c-accent-dim)'
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-12 h-6 rounded-full transition-all"
      style={{ background: value ? accentDim : 'var(--c-card)', border: `1px solid ${value ? accentColor : 'var(--c-border)'}` }}
    >
      <span
        className="absolute top-1 rounded-full transition-all"
        style={{
          width: '16px', height: '16px',
          background: value ? accentColor : 'var(--c-text-3)',
          left: value ? 'calc(100% - 20px)' : '3px',
        }}
      />
    </button>
  )
}
