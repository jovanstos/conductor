import { useState, useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  Play, Square, Plus, Check, Target, Clock,
  Folder, AlertTriangle, Users, ScrollText, Flag, Trash2, MessageSquare,
  Send, RefreshCw, Zap, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useMissionStore } from '../../stores/missionStore'
import type { Mission, MissionGoal, WorkLogEntry, MissionSubAgent } from '../../types'
import MissionChatPanel from './MissionChatPanel'

export default function MissionView() {
  const {
    missions, currentMissionId, selectMission,
    startMission, stopMission, addGoal, completeGoal, deleteGoal, deleteMission,
    liveStatus, liveLog, liveSubAgents, activeBriefings, approveBriefing,
  } = useMissionStore()

  const mission = missions.find((m) => m.id === currentMissionId)
  const [chatOpen, setChatOpen] = useState(false)

  if (!mission) return <MissionEmpty />

  const liveStatusVal = liveStatus[mission.id] ?? mission.status
  const isRunning = liveStatusVal === 'running' || liveStatusVal === 'escalating' || liveStatusVal === 'briefing'
  const recentLog = liveLog[mission.id] ?? mission.workLog
  const subAgents = liveSubAgents[mission.id] ?? mission.activeSubAgents
  const activeBriefing = activeBriefings[mission.id] ?? null
  const runningAgent = subAgents.find((a) => a.status === 'running')

  return (
    <div className="h-full flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MissionHeader
          mission={mission}
          liveStatus={liveStatusVal}
          isRunning={isRunning}
          chatOpen={chatOpen}
          onChatToggle={() => setChatOpen(!chatOpen)}
          onStart={() => startMission(mission.id)}
          onStop={() => stopMission(mission.id)}
          onDelete={async () => { await deleteMission(mission.id); selectMission(null) }}
        />

        {/* Briefing panel — shown when Manager is waiting for approval */}
        {activeBriefing && (
          <BriefingPanel
            plan={activeBriefing.plan}
            onApprove={(redirect) => approveBriefing(mission.id, activeBriefing.briefingId, redirect)}
          />
        )}

        <div className="flex-1 overflow-hidden flex">
          {/* Goals panel */}
          <div className="w-72 shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: 'var(--c-border)' }}>
            <GoalsPanel mission={mission} onAddGoal={addGoal} onCompleteGoal={completeGoal} onDeleteGoal={deleteGoal} />
          </div>

          {/* Work log + live agent */}
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {runningAgent && runningAgent.runId && (
              <LiveAgentPanel agent={runningAgent} />
            )}
            <WorkLogPanel entries={recentLog} />
          </div>
        </div>
      </div>

      {chatOpen && (
        <div className="w-80 shrink-0 overflow-hidden">
          <MissionChatPanel missionId={mission.id} missionName={mission.name} onClose={() => setChatOpen(false)} />
        </div>
      )}
    </div>
  )
}

// ── Briefing Panel ────────────────────────────────────────────────────
function BriefingPanel({ plan, onApprove }: {
  plan: string
  onApprove: (redirect?: string) => void
}) {
  const [redirect, setRedirect] = useState('')
  const [showRedirect, setShowRedirect] = useState(false)

  return (
    <div
      className="shrink-0 mx-4 my-3 rounded-xl border p-4"
      style={{ background: 'var(--c-amber-dim)', borderColor: 'rgba(251,146,60,0.4)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'rgba(251,146,60,0.2)', border: '1px solid rgba(251,146,60,0.4)' }}
        >
          <RefreshCw size={14} style={{ color: 'var(--c-amber)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold mb-0.5" style={{ color: 'var(--c-amber)' }}>Manager's Plan</p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-1)' }}>{plan}</p>

          {showRedirect && (
            <textarea
              value={redirect}
              onChange={(e) => setRedirect(e.target.value)}
              placeholder="Add a directive or redirect… (optional)"
              rows={2}
              className="w-full mt-3 conductor-input px-3 py-2 text-sm resize-none"
              autoFocus
            />
          )}

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onApprove(redirect.trim() || undefined)}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--c-amber)', color: '#000' }}
            >
              <Play size={12} fill="currentColor" />
              Approve & Execute
            </button>
            <button
              onClick={() => setShowRedirect(!showRedirect)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium"
              style={{
                background: showRedirect ? 'rgba(251,146,60,0.2)' : 'transparent',
                color: 'var(--c-amber)',
                border: '1px solid rgba(251,146,60,0.35)',
              }}
            >
              <Send size={12} />
              {showRedirect ? 'Hide directive' : 'Add directive'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Live Agent Panel ──────────────────────────────────────────────────
function LiveAgentPanel({ agent }: { agent: MissionSubAgent }) {
  const [chunks, setChunks] = useState<string[]>([])
  const [toolCalls, setToolCalls] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!agent.runId) return
    setChunks([])
    setToolCalls([])

    const unlisteners: Array<() => void> = []

    listen<{ chunk: string }>(`conductor://run/${agent.runId}/step_chunk`, (e) => {
      setChunks((prev) => [...prev, e.payload.chunk])
    }).then((u) => unlisteners.push(u))

    listen<{ toolName: string }>(`conductor://run/${agent.runId}/tool_call_started`, (e) => {
      setToolCalls((prev) => [...prev, e.payload.toolName])
    }).then((u) => unlisteners.push(u))

    return () => unlisteners.forEach((u) => u())
  }, [agent.runId])

  useEffect(() => {
    if (!collapsed) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chunks, collapsed])

  const streamText = chunks.join('')
  const latestTool = toolCalls[toolCalls.length - 1]

  return (
    <div
      className="shrink-0 border-b"
      style={{ borderColor: 'var(--c-border)', maxHeight: collapsed ? 'auto' : '200px', display: 'flex', flexDirection: 'column' }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
        style={{ background: 'var(--c-card)' }}
      >
        <span className="pulse-accent w-2 h-2 rounded-full inline-block shrink-0" style={{ background: 'var(--c-accent)' }} />
        <Zap size={13} style={{ color: 'var(--c-accent)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--c-accent)' }}>LIVE</span>
        <span className="text-xs font-medium truncate" style={{ color: 'var(--c-text-2)' }}>
          {agent.templateName} — {agent.task}
        </span>
        {latestTool && !collapsed && (
          <span className="text-xs px-2 py-0.5 rounded ml-auto shrink-0"
            style={{ background: 'var(--c-accent-dim)', color: 'var(--c-accent)', border: '1px solid var(--c-accent-border)' }}>
            {latestTool}
          </span>
        )}
        <div className="ml-auto shrink-0">
          {collapsed ? <ChevronDown size={13} style={{ color: 'var(--c-text-3)' }} /> : <ChevronUp size={13} style={{ color: 'var(--c-text-3)' }} />}
        </div>
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-4 py-2" style={{ minHeight: 0 }}>
          {streamText ? (
            <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-2)', fontFamily: 'var(--font-mono)' }}>
              {streamText}
              <span className="cursor-blink">▋</span>
            </pre>
          ) : (
            <p className="text-xs flex items-center gap-2" style={{ color: 'var(--c-text-3)' }}>
              <RefreshCw size={11} className="animate-spin" />
              Agent is working…
            </p>
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  )
}

// ── Mission Header ────────────────────────────────────────────────────
function MissionHeader({
  mission, liveStatus, isRunning, chatOpen, onChatToggle, onStart, onStop, onDelete,
}: {
  mission: Mission
  liveStatus: string
  isRunning: boolean
  chatOpen: boolean
  onChatToggle: () => void
  onStart: () => void
  onStop: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const STATUS_COLORS: Record<string, string> = {
    idle:       'var(--c-text-3)',
    running:    'var(--c-accent)',
    briefing:   'var(--c-amber)',
    escalating: 'var(--c-amber)',
    paused:     'var(--c-amber)',
    completed:  'var(--c-green)',
  }
  const statusColor = STATUS_COLORS[liveStatus] ?? 'var(--c-text-3)'
  const activeGoals = mission.goals.filter((g) => g.status === 'active' || g.status === 'in_progress').length
  const completedGoals = mission.goals.filter((g) => g.status === 'completed').length
  const totalTokens = mission.workLog.reduce((sum, e) => sum + (e.tokensUsed ?? 0), 0)

  return (
    <div className="shrink-0 px-6 py-4 border-b flex items-center gap-4"
      style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-0.5">
          <h2 className="text-base font-bold truncate" style={{ color: 'var(--c-text-1)' }}>{mission.name}</h2>
          <span
            className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg ${isRunning ? 'pulse-accent' : ''}`}
            style={{ background: statusColor + '22', color: statusColor, border: `1px solid ${statusColor}44` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
            {liveStatus.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {mission.runMode === 'goal_driven' ? `Cycles every ${mission.cyclePeriodMinutes}m` : 'Event-driven'}
          </span>
          <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {activeGoals} active goal{activeGoals !== 1 ? 's' : ''}
            {completedGoals > 0 && <span style={{ color: 'var(--c-green)' }}> · {completedGoals} done</span>}
          </span>
          {totalTokens > 0 && (
            <span className="text-xs font-mono-accent px-2 py-0.5 rounded"
              style={{ background: 'var(--c-accent-dim)', color: 'var(--c-accent)', border: '1px solid var(--c-accent-border)' }}>
              {totalTokens.toLocaleString()} tokens
            </span>
          )}
          {mission.workspacePath && (
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--c-text-3)' }}>
              <Folder size={11} />
              {mission.workspacePath.split(/[\\/]/).pop()}
            </span>
          )}
          {mission.autoBriefing && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--c-green-dim)', color: 'var(--c-green)', border: '1px solid rgba(34,197,94,0.3)' }}>
              auto
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onChatToggle}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={chatOpen
            ? { background: 'var(--c-accent-dim)', color: 'var(--c-accent)', border: '1px solid var(--c-accent-border)' }
            : { background: 'var(--c-card)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }
          }
          title="Chat with Manager"
        >
          <MessageSquare size={15} /> Chat
        </button>

        {confirmDelete ? (
          <>
            <span className="text-sm" style={{ color: 'var(--c-red)' }}>Delete mission?</span>
            <button onClick={onDelete} className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--c-red)', color: '#fff' }}>Delete</button>
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--c-text-3)', background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>Cancel</button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--c-text-3)', background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
              title="Delete mission"
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-red)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'; e.currentTarget.style.background = 'var(--c-red-dim)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-3)'; e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.background = 'var(--c-card)' }}
            >
              <Trash2 size={15} />
            </button>
            {isRunning ? (
              <button onClick={onStop} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: 'var(--c-red-dim)', color: 'var(--c-red)', border: '1px solid rgba(239,68,68,0.35)' }}>
                <Square size={14} fill="currentColor" /> Stop
              </button>
            ) : (
              <button onClick={onStart} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: 'var(--c-accent)', color: '#000' }}>
                <Play size={14} fill="currentColor" /> Start
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Goals Panel ───────────────────────────────────────────────────────
function GoalsPanel({ mission, onAddGoal, onCompleteGoal, onDeleteGoal }: {
  mission: Mission
  onAddGoal: (missionId: string, text: string, priority: 'high' | 'normal' | 'low') => Promise<void>
  onCompleteGoal: (missionId: string, goalId: string) => Promise<void>
  onDeleteGoal: (missionId: string, goalId: string) => Promise<void>
}) {
  const [newGoalText, setNewGoalText] = useState('')
  const [newGoalPriority, setNewGoalPriority] = useState<'high' | 'normal' | 'low'>('normal')
  const [showAddForm, setShowAddForm] = useState(false)
  const [adding, setAdding] = useState(false)

  async function handleAddGoal() {
    if (!newGoalText.trim() || adding) return
    setAdding(true)
    try {
      await onAddGoal(mission.id, newGoalText.trim(), newGoalPriority)
      setNewGoalText('')
      setShowAddForm(false)
    } finally {
      setAdding(false)
    }
  }

  const activeGoals = mission.goals.filter((g) => g.status === 'active' || g.status === 'in_progress')
  const completedGoals = mission.goals.filter((g) => g.status === 'completed')

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
        <Flag size={14} style={{ color: 'var(--c-accent)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--c-text-1)' }}>Goals</span>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="ml-auto flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--c-accent-dim)', color: 'var(--c-accent)', border: '1px solid var(--c-accent-border)' }}
        >
          <Plus size={12} /> Add Goal
        </button>
      </div>

      {showAddForm && (
        <div className="px-4 pb-3 shrink-0 space-y-2">
          <textarea
            value={newGoalText}
            onChange={(e) => setNewGoalText(e.target.value)}
            placeholder="Describe what you want the Manager to achieve…"
            rows={3}
            className="w-full conductor-input px-3 py-2 text-sm resize-none"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleAddGoal() }}
          />
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(['high', 'normal', 'low'] as const).map((p) => (
                <button key={p} onClick={() => setNewGoalPriority(p)} className="px-2.5 py-1 rounded text-xs"
                  style={{
                    background: newGoalPriority === p ? (p === 'high' ? 'var(--c-red-dim)' : p === 'normal' ? 'var(--c-accent-dim)' : 'var(--c-card)') : 'var(--c-card)',
                    color: newGoalPriority === p ? (p === 'high' ? 'var(--c-red)' : p === 'normal' ? 'var(--c-accent)' : 'var(--c-text-3)') : 'var(--c-text-3)',
                    border: '1px solid var(--c-border)',
                  }}>
                  {p}
                </button>
              ))}
            </div>
            <button onClick={handleAddGoal} disabled={!newGoalText.trim() || adding}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
              style={{ background: 'var(--c-accent)', color: '#000' }}>
              {adding ? '…' : 'Add'}
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-2 py-1 text-xs" style={{ color: 'var(--c-text-3)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
        {activeGoals.length === 0 && completedGoals.length === 0 && (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-dim)' }}>
            No goals yet. Add a goal for the Manager to work toward.
          </p>
        )}
        {activeGoals.map((goal) => (
          <GoalItem key={goal.id} goal={goal}
            onComplete={() => onCompleteGoal(mission.id, goal.id)}
            onDelete={() => onDeleteGoal(mission.id, goal.id)} />
        ))}
        {completedGoals.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--c-text-dim)' }}>Completed</p>
            {completedGoals.map((goal) => (
              <GoalItem key={goal.id} goal={goal} onDelete={() => onDeleteGoal(mission.id, goal.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GoalItem({ goal, onComplete, onDelete }: { goal: MissionGoal; onComplete?: () => void; onDelete?: () => void }) {
  const isDone = goal.status === 'completed'
  const priorityColors = { high: 'var(--c-red)', normal: 'var(--c-accent)', low: 'var(--c-text-3)' }
  const priorityColor = priorityColors[goal.priority as keyof typeof priorityColors] ?? 'var(--c-text-3)'

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl group"
      style={{ background: isDone ? 'transparent' : 'var(--c-card)', border: `1px solid ${isDone ? 'transparent' : 'var(--c-border)'}`, opacity: isDone ? 0.5 : 1 }}>
      <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: priorityColor }} />
      <div className="flex-1 min-w-0">
        <span className="text-sm leading-relaxed" style={{ color: isDone ? 'var(--c-text-3)' : 'var(--c-text-1)', textDecoration: isDone ? 'line-through' : 'none' }}>
          {goal.text}
        </span>
        <span className="ml-2 text-xs" style={{ color: 'var(--c-text-dim)' }}>{goal.priority}</span>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {!isDone && onComplete && (
          <button onClick={onComplete} className="w-6 h-6 flex items-center justify-center rounded-lg" style={{ background: 'var(--c-green-dim)', color: 'var(--c-green)' }} title="Mark complete">
            <Check size={12} />
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="w-6 h-6 flex items-center justify-center rounded-lg" style={{ background: 'var(--c-red-dim)', color: 'var(--c-red)' }} title="Delete goal">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Work Log Panel ────────────────────────────────────────────────────
function WorkLogPanel({ entries }: { entries: WorkLogEntry[] }) {
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  const LOG_ICONS: Record<string, React.ReactNode> = {
    cycle_start:         <Clock size={13} style={{ color: 'var(--c-accent)' }} />,
    briefing:            <RefreshCw size={13} style={{ color: 'var(--c-amber)' }} />,
    manager_decision:    <Target size={13} style={{ color: 'var(--c-accent)' }} />,
    manager_tool:        <Zap size={13} style={{ color: 'var(--c-accent)' }} />,
    agent_dispatched:    <Users size={13} style={{ color: 'var(--c-green)' }} />,
    agent_completed:     <Check size={13} style={{ color: 'var(--c-green)' }} />,
    agent_error:         <AlertTriangle size={13} style={{ color: 'var(--c-red)' }} />,
    escalation_created:  <AlertTriangle size={13} style={{ color: 'var(--c-amber)' }} />,
    escalation_resolved: <Check size={13} style={{ color: 'var(--c-amber)' }} />,
    goal_completed:      <Flag size={13} style={{ color: 'var(--c-green)' }} />,
    note:                <ScrollText size={13} style={{ color: 'var(--c-text-3)' }} />,
    error:               <AlertTriangle size={13} style={{ color: 'var(--c-red)' }} />,
    stopped:             <Square size={13} style={{ color: 'var(--c-text-3)' }} />,
  }

  const sortedEntries = [...entries].reverse().slice(0, 100).reverse()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2 shrink-0">
        <ScrollText size={14} style={{ color: 'var(--c-accent)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--c-text-1)' }}>Work Log</span>
        <span className="text-xs ml-auto" style={{ color: 'var(--c-text-3)' }}>{entries.length} entries</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-0">
        {sortedEntries.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--c-text-dim)' }}>No activity yet. Start the mission to begin.</p>
          </div>
        )}
        {sortedEntries.map((entry, i) => {
          const icon = LOG_ICONS[entry.entryType] ?? <ScrollText size={13} style={{ color: 'var(--c-text-3)' }} />
          const isLast = i === sortedEntries.length - 1
          const isBriefing = entry.entryType === 'briefing'

          return (
            <div key={entry.id} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0 w-5">
                <div className="w-5 h-5 rounded-md flex items-center justify-center mt-2.5"
                  style={{ background: isBriefing ? 'rgba(251,146,60,0.15)' : 'var(--c-card)', border: `1px solid ${isBriefing ? 'rgba(251,146,60,0.35)' : 'var(--c-border)'}` }}>
                  {icon}
                </div>
                {!isLast && <div className="w-px flex-1 mt-1" style={{ background: 'var(--c-border-subtle)' }} />}
              </div>
              <div className="flex-1 min-w-0 pb-3 pt-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-mono-accent" style={{ color: 'var(--c-text-dim)', flexShrink: 0 }}>
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-xs uppercase tracking-wider" style={{ color: isBriefing ? 'var(--c-amber)' : 'var(--c-text-dim)', flexShrink: 0 }}>
                    {entry.entryType.replace(/_/g, ' ')}
                  </span>
                  {entry.tokensUsed != null && (
                    <span className="text-xs font-mono-accent" style={{ color: 'var(--c-accent)', flexShrink: 0 }}>
                      {entry.tokensUsed.toLocaleString()}t
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed mt-0.5" style={{ color: 'var(--c-text-2)' }}>{entry.content}</p>
              </div>
            </div>
          )
        })}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}

function MissionEmpty() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}>
        <Target size={26} style={{ color: 'var(--c-accent)' }} />
      </div>
      <div>
        <p className="text-lg font-bold mb-2" style={{ color: 'var(--c-text-1)' }}>Select a Mission</p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Pick a mission from the sidebar or create a new one to deploy your Manager Agent.
        </p>
      </div>
    </div>
  )
}
