import { useEffect, useState } from 'react'
import { FolderOpen, Download, Play, X } from 'lucide-react'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { openProject, zipAndSaveWorkspace } from '../../lib/tauri'
import type { FileEntry, ProjectEntry } from '../../types'
import { useRunStore } from '../../stores/runStore'
import { useWorkflowStore } from '../../stores/workflowStore'

interface Props {
  project: ProjectEntry
  onClose: () => void
}

export default function ProjectView({ project, onClose }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [showWorkflowPicker, setShowWorkflowPicker] = useState(false)
  const { setPendingRun } = useRunStore()
  const { workflows, currentWorkflow, setCurrentWorkflow } = useWorkflowStore()

  useEffect(() => {
    setLoading(true)
    openProject(project.path)
      .then((f) => {
        setFiles(f)
        setSelected(f[0] ?? null)
      })
      .finally(() => setLoading(false))
  }, [project.path])

  async function handleExport() {
    const dest = await saveDialog({
      defaultPath: `${project.name}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })
    if (!dest) return
    setExporting(true)
    setExportMsg(null)
    try {
      await zipAndSaveWorkspace(project.path, dest)
      setExportMsg('Exported!')
    } catch (e) {
      setExportMsg(`Error: ${e}`)
    } finally {
      setExporting(false)
      setTimeout(() => setExportMsg(null), 3000)
    }
  }

  function launchRun(workflowId: string) {
    setPendingRun({
      workflowId,
      input: '',
      presetProjectPath: project.path,
      presetProjectName: project.name,
    })
    onClose()
  }

  function handleContinue() {
    if (currentWorkflow) {
      launchRun(currentWorkflow.id)
    } else if (workflows.length === 1) {
      setCurrentWorkflow(workflows[0])
      launchRun(workflows[0].id)
    } else {
      setShowWorkflowPicker(true)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-[80vh] bg-[#0e0e13] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/8 flex items-center gap-3 shrink-0">
          <FolderOpen size={18} className="text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white/90 truncate">{project.name}</p>
            <p className="text-[11px] text-white/30 font-mono truncate">{project.path}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {exportMsg && <span className="text-xs text-emerald-300">{exportMsg}</span>}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="text-xs text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {exporting ? 'Exporting...' : <><Download size={12} className="inline mr-1" />Export zip</>}
            </button>
            <button
              onClick={handleContinue}
              className="text-xs text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Play size={12} className="inline mr-1.5" fill="currentColor" />Run with agents
            </button>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/60 px-2 py-1.5 rounded-lg transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Workflow picker banner — shown when no workflow is active */}
        {showWorkflowPicker && (
          <div className="px-5 py-3 bg-emerald-500/5 border-b border-emerald-500/15 shrink-0">
            <p className="text-xs text-white/60 mb-2">Pick a workflow to run this project with:</p>
            <div className="flex flex-wrap gap-2">
              {workflows.length === 0 ? (
                <p className="text-xs text-white/30">No workflows yet — create one first.</p>
              ) : (
                workflows.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => { setCurrentWorkflow(w); launchRun(w.id) }}
                    className="text-xs text-white/70 bg-white/8 hover:bg-emerald-500/15 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {w.name}
                    <span className="ml-1.5 text-white/25">
                      ({w.nodes.filter(n => n.type === 'agent').length} agents)
                    </span>
                  </button>
                ))
              )}
              <button
                onClick={() => setShowWorkflowPicker(false)}
                className="text-xs text-white/25 hover:text-white/50 px-2 py-1.5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/25 text-sm">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/25 text-sm">No files in this project yet.</div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* File tree */}
            <div className="w-52 shrink-0 border-r border-white/8 overflow-y-auto py-2">
              <p className="px-4 mb-1 text-[10px] text-white/25 uppercase tracking-widest">
                Files ({files.length})
              </p>
              {files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setSelected(f)}
                  className={`w-full text-left px-4 py-1.5 text-[11px] font-mono truncate transition-colors ${
                    selected?.path === f.path
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-white/45 hover:text-white/70 hover:bg-white/5'
                  }`}
                  title={f.path}
                >
                  {f.path}
                </button>
              ))}
            </div>

            {/* File preview */}
            <div className="flex-1 overflow-auto p-4">
              {selected ? (
                <>
                  <p className="text-[11px] text-white/30 font-mono mb-3">{selected.path}</p>
                  <pre className="text-xs text-white/70 whitespace-pre-wrap font-mono leading-relaxed">
                    {selected.content}
                  </pre>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-white/20 text-sm">
                  Select a file to preview
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
