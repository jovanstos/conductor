import { useState } from 'react'
import { useWorkflowStore } from '../stores/workflowStore'
import { useSettingsStore } from '../stores/settingsStore'
import NewWorkflowModal from './workflow/NewWorkflowModal'

export default function Sidebar() {
  const { workflows, currentWorkflow, setCurrentWorkflow, deleteWorkflow, duplicateWorkflow } =
    useWorkflowStore()
  const { providerStatuses, openSettings } = useSettingsStore()
  const [search, setSearch] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)

  const filtered = workflows.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()),
  )

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
              name={w.name}
              active={currentWorkflow?.id === w.id}
              onSelect={() => setCurrentWorkflow(w)}
              onDelete={() => deleteWorkflow(w.id)}
              onDuplicate={() => duplicateWorkflow(w.id)}
            />
          ))
        )}

        <button
          onClick={() => setShowNewModal(true)}
          className="mx-3 mt-1 w-[calc(100%-24px)] text-left px-2 py-1.5 rounded-md text-[11px] text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
        >
          + New workflow
        </button>
      </div>

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

function WorkflowItem({
  name,
  active,
  onSelect,
  onDelete,
  onDuplicate,
}: {
  name: string
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const [hover, setHover] = useState(false)

  return (
    <div
      className={`mx-2 flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 group ${
        active ? 'bg-purple-500/15 text-purple-300' : 'text-white/45 hover:text-white/70 hover:bg-white/5'
      }`}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="text-[11px] truncate flex-1">{name}</span>
      {hover && (
        <>
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
