import { useEffect, useState } from 'react'
import { Sparkles, Settings, Upload, Download, Copy, Trash2, RefreshCw, FolderOpen, ChevronRight } from 'lucide-react'
import { useWorkflowStore } from '../stores/workflowStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { Workflow, ProjectEntry } from '../types'
import { getProviderColor } from '../lib/defaults'
import NewWorkflowModal from './workflow/NewWorkflowModal'
import { listProjects } from '../lib/tauri'
import ProjectView from './projects/ProjectView'

export default function Sidebar() {
  const { workflows, currentWorkflow, setCurrentWorkflow, deleteWorkflow, duplicateWorkflow, importWorkflow } = useWorkflowStore()
  const { providerStatuses, customHosts, openSettings, defaultProjectsPath } = useSettingsStore()
  const [search, setSearch]         = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [projects, setProjects]     = useState<ProjectEntry[]>([])
  const [selectedProject, setSelectedProject] = useState<ProjectEntry | null>(null)

  const filtered = workflows.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))

  const refreshProjects = () =>
    listProjects(defaultProjectsPath || undefined).then(setProjects).catch(() => {})

  useEffect(() => { refreshProjects() }, [defaultProjectsPath])

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--c-surface)', borderRight: '1px solid var(--c-border-subtle)' }}>

      {/* Logo */}
      <div className="px-4 h-14 flex items-center shrink-0" style={{ borderBottom: '1px solid var(--c-border-subtle)' }}>
        <span className="flex items-center gap-2.5 text-base font-semibold" style={{ color: 'var(--c-text-1)' }}>
          <Sparkles size={18} className="text-purple-400" />
          Conductor
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 shrink-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workflows…"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
          style={{
            background: 'var(--c-input)',
            border: '1px solid var(--c-border-subtle)',
            color: 'var(--c-text-2)',
          }}
        />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto py-1">

        {/* Workflows */}
        <Section label="Workflows">
          {filtered.length === 0 ? (
            <p className="px-4 py-2 text-sm" style={{ color: 'var(--c-text-dim)' }}>No workflows yet</p>
          ) : (
            filtered.map((w) => (
              <WorkflowItem
                key={w.id}
                workflow={w}
                active={currentWorkflow?.id === w.id}
                onSelect={() => setCurrentWorkflow(w)}
                onDelete={() => deleteWorkflow(w.id)}
                onDuplicate={() => duplicateWorkflow(w.id)}
                onExport={() => useWorkflowStore.getState().exportWorkflow(w.id)}
              />
            ))
          )}
          <div className="mx-2 mt-1 flex gap-1">
            <button
              onClick={() => setShowNewModal(true)}
              className="flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ color: 'var(--c-text-dim)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--c-text-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--c-text-dim)')}
            >
              + New workflow
            </button>
            <button
              onClick={() => importWorkflow()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors"
              title="Import workflow"
              style={{ color: 'var(--c-text-dim)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--c-text-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--c-text-dim)')}
            >
              <Upload size={14} /> Import
            </button>
          </div>
        </Section>

        {/* Projects */}
        <Section
          label="Projects"
          action={
            <button
              onClick={refreshProjects}
              className="transition-colors"
              title="Refresh"
              style={{ color: 'var(--c-text-dim)' }}
            >
              <RefreshCw size={14} />
            </button>
          }
        >
          {projects.length === 0 ? (
            <p className="px-4 py-2 text-sm" style={{ color: 'var(--c-text-dim)' }}>No projects found</p>
          ) : (
            projects.map((p) => (
              <ProjectItem key={p.path} project={p} onOpen={() => setSelectedProject(p)} />
            ))
          )}
        </Section>
      </div>

      {selectedProject && (
        <ProjectView project={selectedProject} onClose={() => setSelectedProject(null)} />
      )}

      {/* Provider dots */}
      <div className="px-4 py-2.5 shrink-0" style={{ borderTop: '1px solid var(--c-border-subtle)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          {providerStatuses.map((p) => (
            <div key={p.provider} className="flex items-center gap-1.5" title={`${p.provider} ${p.hasKey ? '— connected' : '— no key'}`}>
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: p.hasKey ? getProviderColor(p.provider) : 'var(--c-text-dim)' }}
              />
              <span className="text-xs capitalize" style={{ color: 'var(--c-text-dim)' }}>{p.provider}</span>
            </div>
          ))}
          {customHosts.map((h) => (
            <div key={h.id} className="flex items-center gap-1.5" title={`${h.name} ${h.hasKey ? '— connected' : '— no key'}`}>
              <div className="w-2 h-2 rounded-full" style={{ background: h.hasKey ? h.color : 'var(--c-text-dim)' }} />
              <span className="text-xs truncate max-w-[70px]" style={{ color: 'var(--c-text-dim)' }}>{h.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <button
        onClick={openSettings}
        className="flex items-center gap-2.5 px-4 py-3.5 text-sm transition-colors shrink-0"
        style={{ borderTop: '1px solid var(--c-border-subtle)', color: 'var(--c-text-3)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--c-text-1)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--c-text-3)')}
      >
        <Settings size={16} /> Settings
      </button>

      {showNewModal && <NewWorkflowModal onClose={() => setShowNewModal(false)} />}
    </div>
  )
}

function Section({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between px-4 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-dim)' }}>{label}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

function ProjectItem({ project, onOpen }: { project: ProjectEntry; onOpen: () => void }) {
  return (
    <div
      className="mx-2 flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer mb-0.5 group transition-colors"
      style={{ color: 'var(--c-text-3)' }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-text-2)'; e.currentTarget.style.background = 'var(--c-surface-alt)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-3)'; e.currentTarget.style.background = '' }}
      onClick={onOpen}
    >
      <FolderOpen size={14} className="text-emerald-500/60 shrink-0" />
      <span className="text-sm truncate flex-1">{project.name}</span>
      <ChevronRight size={13} className="opacity-0 group-hover:opacity-60 transition-opacity" />
    </div>
  )
}

function WorkflowItem({
  workflow, active, onSelect, onDelete, onDuplicate, onExport,
}: {
  workflow: Workflow
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onDuplicate: () => void
  onExport: () => void
}) {
  const [hover, setHover] = useState(false)

  const activeStyle: React.CSSProperties = {
    background: 'rgba(168,85,247,0.1)',
    color: 'rgb(216,180,254)',
  }
  const idleStyle: React.CSSProperties = {
    color: 'var(--c-text-3)',
  }
  const hoverStyle: React.CSSProperties = {
    background: 'var(--c-surface-alt)',
    color: 'var(--c-text-2)',
  }

  return (
    <div
      className="mx-2 flex items-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors"
      style={active ? activeStyle : hover ? hoverStyle : idleStyle}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="text-sm truncate flex-1">{workflow.name}</span>

      {hover && (
        <div className="flex items-center gap-0.5 shrink-0">
          <ActionBtn onClick={onExport} title="Export"><Download size={13} /></ActionBtn>
          <ActionBtn onClick={onDuplicate} title="Duplicate"><Copy size={13} /></ActionBtn>
          {!active && <ActionBtn onClick={onDelete} title="Delete" danger><Trash2 size={13} /></ActionBtn>}
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  onClick, title, children, danger = false,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={title}
      className="p-1.5 rounded transition-colors"
      style={{ color: 'var(--c-text-dim)' }}
      onMouseEnter={e => { e.currentTarget.style.color = danger ? 'rgb(248,113,113)' : 'var(--c-text-2)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-dim)' }}
    >
      {children}
    </button>
  )
}
