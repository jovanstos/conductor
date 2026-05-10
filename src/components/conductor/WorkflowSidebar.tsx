import { useState } from 'react'
import {
  Plus, Trash2, Copy, MoreHorizontal, Clock, ChevronDown, ChevronRight,
  Upload, Download, CalendarClock,
} from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'
import type { Workflow } from '../../types'
import NewWorkflowModal from '../workflow/NewWorkflowModal'

export default function WorkflowSidebar() {
  const {
    workflows, currentWorkflow, setCurrentWorkflow,
    deleteWorkflow, duplicateWorkflow, importWorkflow, exportWorkflow,
  } = useWorkflowStore()
  const { currentRun, isRunning } = useRunStore()
  const [showNewModal, setShowNewModal] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [showSchedules, setShowSchedules] = useState(true)

  const scheduledWorkflows = workflows.filter((w) => w.settings?.schedule?.enabled)

  function handleSelect(w: Workflow) {
    setCurrentWorkflow(w)
    setMenuOpenId(null)
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    deleteWorkflow(id)
    setMenuOpenId(null)
  }

  function handleDuplicate(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    duplicateWorkflow(id)
    setMenuOpenId(null)
  }

  function handleExport(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    exportWorkflow(id)
    setMenuOpenId(null)
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: 'var(--c-surface)', borderRight: '1px solid var(--c-border)' }}
    >
      {/* Header */}
      <div className="px-3 pt-4 pb-3 flex items-center gap-2 shrink-0">
        <span className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--c-text-3)' }}>
          Workflows
        </span>
        <button
          onClick={() => setShowNewModal(true)}
          className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-lg transition-colors text-sm font-medium"
          style={{ color: 'var(--c-accent)', background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}
          title="New workflow"
        >
          <Plus size={14} /> New
        </button>
        <button
          onClick={importWorkflow}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: 'var(--c-text-3)', border: '1px solid var(--c-border)', background: 'var(--c-card)' }}
          title="Import workflow"
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-text-1)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-3)' }}
        >
          <Upload size={14} />
        </button>
      </div>

      {/* Workflow list */}
      <div className="flex-1 overflow-y-auto pb-2">
        {workflows.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs" style={{ color: 'var(--c-text-dim)' }}>No workflows yet</p>
            <button onClick={() => setShowNewModal(true)} className="mt-2 text-xs underline" style={{ color: 'var(--c-text-3)' }}>
              Create one
            </button>
          </div>
        ) : (
          workflows.map((w) => {
            const isActive = currentWorkflow?.id === w.id
            const isThisRunning = isRunning && currentRun?.workflowId === w.id
            const isScheduled = w.settings?.schedule?.enabled

            return (
              <div key={w.id} className="relative px-2">
                <button
                  onClick={() => handleSelect(w)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                  style={{
                    background: isActive ? 'var(--c-card)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--c-accent)' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-card)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <div className="shrink-0 flex items-center justify-center w-4">
                    {isThisRunning ? (
                      <span className="pulse-accent w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'var(--c-accent)' }} />
                    ) : isScheduled ? (
                      <CalendarClock size={13} style={{ color: 'var(--c-amber)' }} />
                    ) : (
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: isActive ? 'var(--c-accent)' : 'var(--c-border)' }} />
                    )}
                  </div>
                  <span className="flex-1 text-sm font-medium truncate" style={{ color: isActive ? 'var(--c-text-1)' : 'var(--c-text-2)' }}>
                    {w.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === w.id ? null : w.id) }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-colors"
                    style={{ color: 'var(--c-text-3)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-elevated)'; e.currentTarget.style.color = 'var(--c-text-1)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-text-3)' }}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </button>

                {menuOpenId === w.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                    <div className="absolute right-2 top-8 rounded border shadow-xl z-50 overflow-hidden"
                      style={{ background: 'var(--c-elevated)', borderColor: 'var(--c-border)', minWidth: '140px' }}>
                      <CtxBtn onClick={(e) => handleDuplicate(w.id, e)} icon={<Copy size={12} />}>Duplicate</CtxBtn>
                      <CtxBtn onClick={(e) => handleExport(w.id, e)} icon={<Download size={12} />}>Export</CtxBtn>
                      <div style={{ height: '1px', background: 'var(--c-border)' }} />
                      <CtxBtn onClick={(e) => handleDelete(w.id, e)} icon={<Trash2 size={12} />} danger>Delete</CtxBtn>
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Schedules section */}
      <div className="shrink-0 border-t" style={{ borderColor: 'var(--c-border)' }}>
        <button onClick={() => setShowSchedules(!showSchedules)} className="w-full flex items-center gap-2 px-3 py-2.5">
          <CalendarClock size={12} style={{ color: 'var(--c-amber)' }} />
          <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--c-text-3)' }}>Schedules</span>
          {scheduledWorkflows.length > 0 && (
            <span className="ml-auto text-xs px-1.5 rounded" style={{ background: 'var(--c-amber-dim)', color: 'var(--c-amber)' }}>
              {scheduledWorkflows.length}
            </span>
          )}
          {scheduledWorkflows.length === 0 && (
            <div className="ml-auto">
              {showSchedules ? <ChevronDown size={11} style={{ color: 'var(--c-text-3)' }} /> : <ChevronRight size={11} style={{ color: 'var(--c-text-3)' }} />}
            </div>
          )}
        </button>

        {showSchedules && (
          <div className="pb-2">
            {scheduledWorkflows.length === 0 ? (
              <p className="px-4 py-2 text-xs" style={{ color: 'var(--c-text-dim)' }}>No active schedules</p>
            ) : (
              scheduledWorkflows.map((w) => {
                const sched = w.settings.schedule!
                return (
                  <button key={w.id} onClick={() => handleSelect(w)}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left transition-colors"
                    style={{ background: currentWorkflow?.id === w.id ? 'var(--c-card)' : 'transparent' }}>
                    <Clock size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--c-amber)' }} />
                    <div className="min-w-0">
                      <p className="text-xs truncate" style={{ color: 'var(--c-text-2)' }}>{w.name}</p>
                      <p className="text-xs" style={{ color: 'var(--c-text-dim)' }}>
                        {sched.interval === 'minutes' && `Every ${sched.intervalValue}m`}
                        {sched.interval === 'hours'   && `Every ${sched.intervalValue}h`}
                        {sched.interval === 'daily'   && `Daily ${sched.time ?? ''}`}
                        {sched.interval === 'weekly'  && `Weekly ${sched.time ?? ''}`}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {showNewModal && <NewWorkflowModal onClose={() => setShowNewModal(false)} />}
    </div>
  )
}

function CtxBtn({ children, onClick, icon, danger }: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  icon?: React.ReactNode
  danger?: boolean
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
      style={{ color: danger ? 'var(--c-red)' : 'var(--c-text-2)' }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'var(--c-red-dim)' : 'var(--c-card)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      {icon}{children}
    </button>
  )
}
