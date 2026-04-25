import { FolderOpen, FolderX, ChevronRight } from 'lucide-react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useWorkflowStore } from '../../stores/workflowStore'

export default function WorkspaceBar() {
  const { currentWorkflow, setWorkspacePath } = useWorkflowStore()
  const workspacePath = currentWorkflow?.settings?.workspacePath

  async function pickDirectory() {
    const selected = await openDialog({ directory: true, multiple: false })
    if (typeof selected === 'string' && selected) {
      setWorkspacePath(selected)
    }
  }

  if (!currentWorkflow) return null

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 border-b text-xs transition-colors cursor-pointer select-none group
        ${workspacePath
          ? 'border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10'
          : 'border-amber-500/25 bg-amber-500/8 hover:bg-amber-500/12'
        }`}
      onClick={pickDirectory}
      title={workspacePath ? 'Click to change workspace directory' : 'Click to select a workspace directory'}
    >
      {workspacePath ? (
        <FolderOpen size={12} className="text-emerald-400 shrink-0" />
      ) : (
        <FolderX size={12} className="text-amber-400 shrink-0" />
      )}

      <span className={`font-medium shrink-0 ${workspacePath ? 'text-emerald-400' : 'text-amber-400'}`}>
        Workspace
      </span>

      <ChevronRight size={10} className="text-white/20 shrink-0" />

      {workspacePath ? (
        <span className="font-mono text-white/50 truncate min-w-0">{workspacePath}</span>
      ) : (
        <span className="text-amber-300/70 italic">No directory selected — click to choose where agents will work</span>
      )}

      <span className={`ml-auto shrink-0 font-medium opacity-0 group-hover:opacity-100 transition-opacity
        ${workspacePath ? 'text-emerald-400' : 'text-amber-400'}`}>
        {workspacePath ? 'Change' : 'Select'}
      </span>
    </div>
  )
}
