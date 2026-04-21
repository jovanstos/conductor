import { useEffect, useState } from 'react'
import { Sparkles, Settings, Upload, Download, Copy, Trash2, RefreshCw, FolderOpen, ArrowRight } from 'lucide-react'
import { useWorkflowStore } from '../stores/workflowStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { Workflow, ProjectEntry } from '../types'
import type { AgentNodeData } from '../types'
import { getRoleInfo } from '../lib/defaults'
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
        <p className="text-base font-semibold text-white/90 tracking-tight flex items-center gap-2">
          <Sparkles size={16} className="text-purple-400" /> Conductor
        </p>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full bg-white/5 rounded-md px-2.5 py-1.5 text-sm text-white/60 outline-none focus:bg-white/8 placeholder:text-white/25"
        />
      </div>

      {/* Workflow list */}
      <div className="flex-1 overflow-y-auto py-2">
        <SectionLabel label="My Workflows" />
        {filtered.length === 0 ? (
          <p className="px-4 py-2 text-xs text-white/25">No workflows yet</p>
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
            className="flex-1 text-left px-2 py-1.5 rounded-md text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            + New
          </button>
          <button
            onClick={() => importWorkflow()}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-white/35 hover:text-white/65 hover:bg-white/5 transition-colors"
            title="Import workflow from JSON file"
          >
            <Upload size={11} /> Import
          </button>
        </div>

        {/* Projects section */}
        <div className="mt-4">
          <div className="flex items-center justify-between pr-3">
            <SectionLabel label="My Projects" />
            <button
              onClick={refreshProjects}
              className="text-white/20 hover:text-white/50 transition-colors"
              title="Refresh projects"
            >
              <RefreshCw size={11} />
            </button>
          </div>
          {projects.length === 0 ? (
            <p className="px-4 py-1 text-xs text-white/20">No saved projects</p>
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
            <span className="text-xs text-white/45 capitalize">{p.provider}</span>
          </div>
        ))}
      </div>

      {/* Settings */}
      <button
        onClick={openSettings}
        className="px-4 py-3 border-t border-white/5 text-left text-sm text-white/45 hover:text-white/70 hover:bg-white/4 transition-colors flex items-center gap-2"
      >
        <Settings size={15} /> Settings
      </button>

      {showNewModal && <NewWorkflowModal onClose={() => setShowNewModal(false)} />}
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-4 mb-1.5 text-xs font-semibold text-white/30 uppercase tracking-widest">{label}</p>
  )
}

function ProjectItem({ project, onOpen }: { project: ProjectEntry; onOpen: () => void }) {
  return (
    <div
      className="mx-2 flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 text-white/45 hover:text-white/70 hover:bg-white/5 transition-colors group"
      onClick={onOpen}
    >
      <FolderOpen size={11} className="text-emerald-500/60 shrink-0" />
      <span className="text-xs truncate flex-1">{project.name}</span>
      <ArrowRight size={11} className="text-white/20 group-hover:text-white/40 transition-colors" />
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
  const agentNodes = workflow.nodes.filter((n) => n.type === 'agent')
  const rosterDots = agentNodes.slice(0, 5).map((n) => getRoleInfo((n.data as AgentNodeData).name || '', (n.data as AgentNodeData).roleDescription || ''))

  return (
    <div
      className={`mx-2 flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 group ${
        active ? 'bg-purple-500/15 text-purple-300' : 'text-white/45 hover:text-white/70 hover:bg-white/5'
      }`}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="text-xs truncate flex-1">{workflow.name}</span>
      {!hover && rosterDots.length > 0 && (
        <div className="flex items-center gap-0.5 shrink-0">
          {rosterDots.map((r, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full ${r.dotColor} opacity-60`} title={r.label} />
          ))}
          {agentNodes.length > 5 && <span className="text-xs text-white/20 ml-0.5">+{agentNodes.length - 5}</span>}
        </div>
      )}
      {hover && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onExport() }}
            className="text-white/20 hover:text-white/60 transition-colors p-0.5"
            title="Export as JSON"
          >
            <Download size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate() }}
            className="text-white/20 hover:text-white/60 transition-colors p-0.5"
            title="Duplicate"
          >
            <Copy size={11} />
          </button>
          {!active && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="text-white/20 hover:text-red-400 transition-colors p-0.5"
              title="Delete"
            >
              <Trash2 size={11} />
            </button>
          )}
        </>
      )}
    </div>
  )
}
