import { useState, useEffect } from 'react'
import { Settings, History, CalendarClock, Target } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'
import { useMissionStore } from '../../stores/missionStore'
import WorkflowSidebar from './WorkflowSidebar'
import PipelineView from './PipelineView'
import SchedulePanel from './SchedulePanel'
import RunDrawer from '../run/RunDrawer'
import MissionView from './MissionView'
import EscalationModal from './EscalationModal'

type RightPanel = 'schedule' | 'history' | null

const SIDEBAR_W = 260
const DRAWER_DEFAULT = 280

export default function ConductorView({ onError }: { onError?: (msg: string) => void }) {
  const { currentWorkflow } = useWorkflowStore()
  const { currentRun } = useRunStore()
  const { currentMissionId, loadMissions, activeEscalation } = useMissionStore()
  const [rightPanel, setRightPanel] = useState<RightPanel>(null)
  const [drawerHeight, setDrawerHeight] = useState(DRAWER_DEFAULT)

  useEffect(() => {
    loadMissions()
  }, [loadMissions])

  function togglePanel(panel: RightPanel) {
    setRightPanel((p) => (p === panel ? null : panel))
  }

  // If a mission is selected, show mission view
  const showMission = currentMissionId !== null && !currentWorkflow

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left sidebar */}
      <div className="shrink-0 overflow-hidden" style={{ width: SIDEBAR_W }}>
        <WorkflowSidebar />
      </div>

      {/* Center content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {showMission ? (
          <MissionView />
        ) : currentWorkflow ? (
          <>
            {/* Workflow secondary toolbar */}
            <div
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b"
              style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
            >
              <span className="text-sm" style={{ color: 'var(--c-text-3)' }}>
                {currentWorkflow.nodes.filter((n) => n.type === 'agent').length} agent{currentWorkflow.nodes.filter((n) => n.type === 'agent').length !== 1 ? 's' : ''}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <PanelBtn
                  active={rightPanel === 'schedule'}
                  onClick={() => togglePanel('schedule')}
                  icon={<CalendarClock size={16} />}
                  label="Schedule"
                  color="amber"
                  hasIndicator={currentWorkflow.settings?.schedule?.enabled}
                />
                <PanelBtn
                  active={rightPanel === 'history'}
                  onClick={() => togglePanel('history')}
                  icon={<History size={16} />}
                  label="History"
                  color="blue"
                />
              </div>
            </div>

            {/* Pipeline + optional right panel */}
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <PipelineView onError={onError} />
              </div>

              {rightPanel && (
                <>
                  <div className="w-px shrink-0" style={{ background: 'var(--c-border)' }} />
                  <div className="shrink-0 overflow-y-auto" style={{ width: '268px', background: 'var(--c-surface)' }}>
                    {rightPanel === 'schedule' && <SchedulePanel />}
                    {rightPanel === 'history' && <HistoryPanel />}
                  </div>
                </>
              )}
            </div>

            {/* Run drawer */}
            {currentRun && (
              <>
                <DragHandle onDelta={(d) => setDrawerHeight((h) => Math.max(80, Math.min(600, h - d)))} />
                <RunDrawer height={drawerHeight} />
              </>
            )}
          </>
        ) : (
          <EmptyConductor />
        )}
      </div>

      {/* Escalation modal — shown when Manager needs human input */}
      {activeEscalation && <EscalationModal />}
    </div>
  )
}

function PanelBtn({
  active, onClick, icon, label, color, hasIndicator,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  color: 'amber' | 'blue' | 'green'
  hasIndicator?: boolean
}) {
  const colors = {
    amber: { color: 'var(--c-amber)',  bg: 'var(--c-amber-dim)',  border: 'rgba(251,146,60,0.35)' },
    blue:  { color: 'var(--c-accent)', bg: 'var(--c-accent-dim)', border: 'var(--c-accent-border)' },
    green: { color: 'var(--c-green)',  bg: 'var(--c-green-dim)',  border: 'rgba(34,197,94,0.35)' },
  }
  const c = colors[color]
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-all"
      style={active
        ? { background: c.bg, color: c.color, border: `1px solid ${c.border}` }
        : { color: 'var(--c-text-2)', border: '1px solid var(--c-border)', background: 'var(--c-card)' }
      }
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.color } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-2)' } }}
    >
      {icon}
      {label}
      {hasIndicator && !active && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
      )}
    </button>
  )
}

function DragHandle({ onDelta }: { onDelta: (d: number) => void }) {
  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    let prev = e.clientY
    function onMove(ev: MouseEvent) { onDelta(ev.clientY - prev); prev = ev.clientY }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.cursor = '' }
    document.body.style.cursor = 'row-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  return (
    <div
      className="h-1 shrink-0 cursor-row-resize"
      style={{ background: 'var(--c-border-subtle)' }}
      onMouseDown={handleMouseDown}
    />
  )
}

function HistoryPanel() {
  return (
    <div className="p-4">
      <p className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: 'var(--c-text-3)' }}>Run History</p>
      <p className="text-xs" style={{ color: 'var(--c-text-dim)' }}>Past runs will appear here.</p>
    </div>
  )
}

function EmptyConductor() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}>
        <Settings size={24} style={{ color: 'var(--c-accent)' }} />
      </div>
      <div className="max-w-sm">
        <p className="text-lg font-bold mb-2" style={{ color: 'var(--c-text-1)' }}>Select a workflow or mission</p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Choose a <strong>Workflow</strong> for one-time or scheduled pipelines, or a <strong>Mission</strong> to deploy a Manager Agent that runs continuously and manages a team of sub-agents toward your goals.
        </p>
      </div>
    </div>
  )
}
