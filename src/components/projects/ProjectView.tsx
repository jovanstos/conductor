import { useEffect, useState } from 'react'
import { FolderOpen, Folder, FolderOpenIcon, Download, Play, X, ChevronRight, FileText } from 'lucide-react'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { openProjectTree, zipAndSaveWorkspace } from '../../lib/tauri'
import type { DirEntry, ProjectEntry } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'

interface Props {
  project: ProjectEntry
  onClose: () => void
}

// ── File icon helpers ────────────────────────────────────────────────────────

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx'].includes(ext)) return 'text-blue-400'
  if (['js', 'jsx', 'mjs'].includes(ext)) return 'text-yellow-400'
  if (['py'].includes(ext)) return 'text-green-400'
  if (['rs'].includes(ext)) return 'text-orange-400'
  if (['go'].includes(ext)) return 'text-cyan-400'
  if (['css', 'scss', 'less'].includes(ext)) return 'text-pink-400'
  if (['html', 'htm'].includes(ext)) return 'text-orange-300'
  if (['json', 'toml', 'yaml', 'yml'].includes(ext)) return 'text-amber-300'
  if (['md', 'txt', 'rst'].includes(ext)) return 'text-gray-400'
  return 'text-white/40'
}

// ── Recursive tree node ──────────────────────────────────────────────────────

interface TreeNodeProps {
  node: DirEntry
  depth: number
  selectedPath: string | null
  onSelectFile: (path: string, content: string) => void
}

function TreeNode({ node, depth, selectedPath, onSelectFile }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const indent = depth * 12

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full text-left flex items-center gap-1.5 py-0.5 text-xs font-mono text-white/50 hover:text-white/75 hover:bg-white/5 transition-colors"
          style={{ paddingLeft: `${8 + indent}px`, paddingRight: '8px' }}
        >
          <ChevronRight
            size={9}
            className={`shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
          />
          {expanded
            ? <FolderOpenIcon size={11} className="shrink-0 text-yellow-400/70" />
            : <Folder size={11} className="shrink-0 text-yellow-400/60" />
          }
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    )
  }

  const isSelected = selectedPath === node.path
  return (
    <button
      onClick={() => onSelectFile(node.path, node.content ?? '')}
      className={`w-full text-left flex items-center gap-1.5 py-0.5 text-xs font-mono truncate transition-colors ${
        isSelected
          ? 'bg-emerald-500/15 text-emerald-300'
          : 'text-white/45 hover:text-white/70 hover:bg-white/5'
      }`}
      style={{ paddingLeft: `${20 + indent}px`, paddingRight: '8px' }}
      title={node.path}
    >
      <FileText size={10} className={`shrink-0 ${isSelected ? 'text-emerald-400' : getFileColor(node.name)}`} />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

// ── Count helpers ────────────────────────────────────────────────────────────

function countFiles(entries: DirEntry[]): number {
  let count = 0
  for (const e of entries) {
    if (e.isDir) count += countFiles(e.children)
    else count += 1
  }
  return count
}

function findFirstFile(entries: DirEntry[]): DirEntry | null {
  for (const e of entries) {
    if (!e.isDir) return e
    const found = findFirstFile(e.children)
    if (found) return found
  }
  return null
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ProjectView({ project, onClose }: Props) {
  const [tree, setTree] = useState<DirEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedContent, setSelectedContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [showWorkflowPicker, setShowWorkflowPicker] = useState(false)
  const { workflows, currentWorkflow, setCurrentWorkflow, setWorkspacePath } = useWorkflowStore()

  useEffect(() => {
    setLoading(true)
    openProjectTree(project.path)
      .then((entries) => {
        setTree(entries)
        const first = findFirstFile(entries)
        if (first) {
          setSelectedPath(first.path)
          setSelectedContent(first.content ?? '')
        }
      })
      .finally(() => setLoading(false))
  }, [project.path])

  function handleSelectFile(path: string, content: string) {
    setSelectedPath(path)
    setSelectedContent(content)
  }

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

  function launchWithWorkflow(wf: typeof workflows[number]) {
    setCurrentWorkflow(wf)
    setWorkspacePath(project.path)
    onClose()
  }

  function handleContinue() {
    if (currentWorkflow) {
      launchWithWorkflow(currentWorkflow)
    } else if (workflows.length === 1) {
      launchWithWorkflow(workflows[0])
    } else {
      setShowWorkflowPicker(true)
    }
  }

  const fileCount = countFiles(tree)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-5xl h-[85vh] bg-[#0e0e13] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/8 flex items-center gap-3 shrink-0">
          <FolderOpen size={18} className="text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white/90 truncate">{project.name}</p>
            <p className="text-xs text-white/30 font-mono truncate">{project.path}</p>
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

        {/* Workflow picker banner */}
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
                    onClick={() => launchWithWorkflow(w)}
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
          <div className="flex-1 flex items-center justify-center text-white/25 text-sm">Loading project...</div>
        ) : tree.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/25 text-sm">No files found in this project.</div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* File tree sidebar */}
            <div className="w-60 shrink-0 border-r border-white/8 overflow-y-auto py-2">
              <p className="px-4 mb-2 text-xs font-semibold text-white/25 uppercase tracking-widest">
                {fileCount} file{fileCount !== 1 ? 's' : ''}
              </p>
              {tree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  onSelectFile={handleSelectFile}
                />
              ))}
            </div>

            {/* File preview */}
            <div className="flex-1 overflow-auto p-4">
              {selectedPath ? (
                <>
                  <p className="text-xs text-white/30 font-mono mb-3">{selectedPath}</p>
                  <pre className="text-xs text-white/70 whitespace-pre-wrap font-mono leading-relaxed">
                    {selectedContent || <span className="text-white/20 italic">Empty file</span>}
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
