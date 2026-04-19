import { useState } from 'react'
import { useRunStore } from '../../stores/runStore'

const DEFAULT_PROJECTS_PATH =
  typeof window !== 'undefined'
    ? (navigator.platform.includes('Win') ? 'C:/Users/user/conductor_projects' : '~/conductor_projects')
    : '~/conductor_projects'

type Mode = 'temporary' | 'project' | null

export default function RunStartModal() {
  const { pendingRun, startRun, setPendingRun } = useRunStore()
  const [mode, setMode] = useState<Mode>(null)
  const [projectName, setProjectName] = useState('')
  const [basePath, setBasePath] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!pendingRun) return null

  async function handleStart() {
    if (!mode || !pendingRun) return
    if (mode === 'project' && !projectName.trim()) {
      setError('Project name is required.')
      return
    }
    setError(null)
    setStarting(true)
    try {
      await startRun(
        pendingRun.workflowId,
        pendingRun.input,
        mode,
        mode === 'project' ? projectName.trim() : undefined,
        mode === 'project' && basePath.trim() ? basePath.trim() : undefined,
      )
    } catch (e) {
      setError(String(e))
      setStarting(false)
    }
  }

  function handleCancel() {
    setPendingRun(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleCancel()}
    >
      <div className="w-full max-w-lg bg-[#0e0e13] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/8">
          <p className="text-base font-bold text-white/90">Start Run</p>
          <p className="text-xs text-white/35 mt-0.5">
            Where should the agents save their work?
          </p>
        </div>

        {/* Mode cards */}
        <div className="p-6 space-y-3">
          {/* Temporary */}
          <button
            onClick={() => setMode('temporary')}
            className={`w-full flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${
              mode === 'temporary'
                ? 'border-purple-500/60 bg-purple-500/8'
                : 'border-white/10 bg-white/2 hover:bg-white/5 hover:border-white/20'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                mode === 'temporary' ? 'bg-purple-500/20 text-purple-300' : 'bg-white/8 text-white/40'
              }`}
            >
              ◌
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold text-white/90">Temporary Run</p>
                {mode === 'temporary' && (
                  <span className="text-[10px] text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded-full">selected</span>
                )}
              </div>
              <p className="text-xs text-white/45 leading-relaxed">
                Files are created in a temporary directory and deleted when you discard the run.
                Good for experiments and one-off tasks.
              </p>
            </div>
          </button>

          {/* Project */}
          <button
            onClick={() => setMode('project')}
            className={`w-full flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${
              mode === 'project'
                ? 'border-emerald-500/60 bg-emerald-500/5'
                : 'border-white/10 bg-white/2 hover:bg-white/5 hover:border-white/20'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                mode === 'project' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/8 text-white/40'
              }`}
            >
              ◈
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold text-white/90">Project Run</p>
                {mode === 'project' && (
                  <span className="text-[10px] text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full">selected</span>
                )}
              </div>
              <p className="text-xs text-white/45 leading-relaxed">
                Files are saved permanently to a named project folder.
                Come back later to view, continue, or export your work.
              </p>
            </div>
          </button>

          {/* Project fields */}
          {mode === 'project' && (
            <div className="mt-1 space-y-3 pl-1">
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 block">
                  Project name *
                </label>
                <input
                  autoFocus
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                  placeholder="e.g. my-app, research-report"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-emerald-500/50 placeholder:text-white/20"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 block">
                  Save location <span className="text-white/20 normal-case">(optional, defaults to ~/conductor_projects)</span>
                </label>
                <input
                  value={basePath}
                  onChange={(e) => setBasePath(e.target.value)}
                  placeholder={DEFAULT_PROJECTS_PATH}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-emerald-500/50 placeholder:text-white/20 font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* No workspace option */}
          <button
            onClick={async () => {
              if (!pendingRun) return
              setStarting(true)
              try {
                await startRun(pendingRun.workflowId, pendingRun.input)
              } catch (e) {
                setError(String(e))
                setStarting(false)
              }
            }}
            className="w-full text-center text-xs text-white/25 hover:text-white/50 py-1 transition-colors"
          >
            Run without saving files →
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/8 bg-white/2">
          <button
            onClick={handleCancel}
            className="text-sm text-white/40 hover:text-white/70 px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!mode || starting || (mode === 'project' && !projectName.trim())}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {starting ? 'Starting...' : 'Start Run'}
          </button>
        </div>
      </div>
    </div>
  )
}
