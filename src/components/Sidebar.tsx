import { useEffect, useState } from 'react'
import { useWorkflowStore } from '../stores/workflowStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { Workflow, ProjectEntry } from '../types'
import NewWorkflowModal from './workflow/NewWorkflowModal'
import { listProjects } from '../lib/tauri'
import ProjectView from './projects/ProjectView'

export default function Sidebar() {
  const { workflows, currentWorkflow, setCurrentWorkflow, deleteWorkflow, duplicateWorkflow, importWorkflow } =
    useWorkflowStore()
  const { providerStatuses, openSettings, defaultProjectsPath } = useSettingsStore()
  const [search, setSearch] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [selectedProject, setSelectedProject] = useState<ProjectEntry | null>(null)

  const filtered = workflows.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()),
  )

  const refreshProjects = () =>
    listProjects(defaultProjectsPath || undefined).then(setProjects).catch(() => {})

  useEffect(() => {
    refreshProjects()
  }, [defaultProjectsPath])

  return (
    <div className="w-full h-full bg-[#0a0a0d] border-r border-white/5 flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-3 border-b border-white/5">
        <p className="text-sm font-semibold text-white/80 tracking-tight">✦ Conductor</p>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full bg-white/5 rounded-md px-2.5 py-1.5 text-xs text-white/60 outline-none focus:bg-white/8 placeholder:text-white/25"
        />
      </div>

      {/* Workflow list */}
      <div className="flex-1 overflow-y-auto py-2">
        <SectionLabel label="My Workflows" />
        {filtered.length === 0 ? (
          <p className="px-4 py-2 text-[11px] text-white/25">No workflows yet</p>
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

        <div className="mx-3 mt-1 flex gap-1">
          <button
            onClick={() => setShowNewModal(true)}
            className="flex-1 text-left px-2 py-1.5 rounded-md text-[11px] text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
          >
            + New
          </button>
          <button
            onClick={() => importWorkflow()}
            className="px-2 py-1.5 rounded-md text-[11px] text-white/25 hover:text-white/55 hover:bg-white/5 transition-colors"
            title="Import workflow from JSON file"
          >
            ⬆ Import
          </button>
        </div>

        {/* Projects section */}
        <div className="mt-4">
          <div className="flex items-center justify-between pr-3">
            <SectionLabel label="My Projects" />
            <button
              onClick={refreshProjects}
              className="text-[10px] text-white/20 hover:text-white/50 transition-colors"
              title="Refresh projects"
            >
              ↻
            </button>
          </div>
          {projects.length === 0 ? (
            <p className="px-4 py-1 text-[11px] text-white/20">No saved projects</p>
          ) : (
            projects.map((p) => (
              <ProjectItem
                key={p.path}
                project={p}
                onOpen={() => setSelectedProject(p)}
              />
            ))
          )}
        </div>
      </div>

      {selectedProject && (
        <ProjectView project={selectedProject} onClose={() => setSelectedProject(null)} />
      )}

      {/* Model status indicators */}
      <div className="px-3 py-2 border-t border-white/5">
        <SectionLabel label="Providers" />
        {providerStatuses.map((p) => (
          <div key={p.provider} className="flex items-center gap-2 px-1 py-0.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${p.hasKey ? 'bg-green-500' : 'bg-white/15'}`}
            />
            <span className="text-[11px] text-white/40 capitalize">{p.provider}</span>
          </div>
        ))}
      </div>

      {/* Settings */}
      <button
        onClick={openSettings}
        className="px-4 py-2.5 border-t border-white/5 text-left text-xs text-white/35 hover:text-white/60 hover:bg-white/4 transition-colors"
      >
        ⚙ Settings
      </button>

      {showNewModal && <NewWorkflowModal onClose={() => setShowNewModal(false)} />}
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-4 mb-1 text-[10px] text-white/25 uppercase tracking-widest">{label}</p>
  )
}

function ProjectItem({ project, onOpen }: { project: ProjectEntry; onOpen: () => void }) {
  return (
    <div
      className="mx-2 flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 text-white/45 hover:text-white/70 hover:bg-white/5 transition-colors group"
      onClick={onOpen}
    >
      <span className="text-emerald-500/60 text-[10px]">◈</span>
      <span className="text-[11px] truncate flex-1">{project.name}</span>
      <span className="text-[10px] text-white/20 group-hover:text-white/40 transition-colors">→</span>
    </div>
  )
}

function WorkflowItem({
  workflow,
  active,
  onSelect,
  onDelete,
  onDuplicate,
  onExport,
}: {
  workflow: Workflow
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onDuplicate: () => void
  onExport: () => void
}) {
  const [hover, setHover] = useState(false)
  const agentCount = workflow.nodes.filter((n) => n.type === 'agent').length

  return (
    <div
      className={`mx-2 flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 group ${
        active ? 'bg-purple-500/15 text-purple-300' : 'text-white/45 hover:text-white/70 hover:bg-white/5'
      }`}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="text-[11px] truncate flex-1">{workflow.name}</span>
      {!hover && agentCount > 0 && (
        <span className="text-[9px] text-white/20 shrink-0">{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
      )}
      {hover && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onExport() }}
            className="text-[10px] text-white/20 hover:text-white/60 transition-colors px-0.5"
            title="Export as JSON"
          >
            ⬇
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate() }}
            className="text-[10px] text-white/20 hover:text-white/60 transition-colors px-0.5"
            title="Duplicate"
          >
            ⎘
          </button>
          {!active && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="text-[10px] text-white/20 hover:text-red-400 transition-colors px-0.5"
            >
              ✕
            </button>
          )}
        </>
      )}
    </div>
  )
}
