import { useState } from 'react'
import { useRunStore } from '../../stores/runStore'
import { useSettingsStore } from '../../stores/settingsStore'

type Mode = 'temporary' | 'project' | null

export default function RunStartModal() {
  const { pendingRun, startRun, setPendingRun } = useRunStore()
  const { defaultProjectsPath } = useSettingsStore()

  const isExistingProject = !!(pendingRun?.presetProjectPath)

  const [taskInput, setTaskInput] = useState(pendingRun?.input ?? '')
  const [mode, setMode] = useState<Mode>(isExistingProject ? null : null)
  const [projectName, setProjectName] = useState('')
  const [basePath, setBasePath] = useState(defaultProjectsPath)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!pendingRun) return null

  const canStart = isExistingProject
    ? taskInput.trim().length > 0
    : mode !== null && taskInput.trim().length > 0 && (mode !== 'project' || projectName.trim().length > 0)

  async function handleStart() {
    if (!pendingRun || !canStart) return
    setError(null)
    setStarting(true)
    try {
      if (isExistingProject) {
        await startRun(
          pendingRun.workflowId,
          taskInput.trim(),
          'existing',
          pendingRun.presetProjectName,
          pendingRun.presetProjectPath,
        )
      } else if (mode === 'project') {
        await startRun(
          pendingRun.workflowId,
          taskInput.trim(),
          'project',
          projectName.trim(),
          basePath.trim() || undefined,
        )
      } else if (mode === 'temporary') {
        await startRun(pendingRun.workflowId, taskInput.trim(), 'temporary')
      }
    } catch (e) {
      setError(String(e))
      setStarting(false)
    }
  }

  async function handleNoSave() {
    if (!pendingRun || !taskInput.trim()) {
      setError('Please enter a task first.')
      return
    }
    setStarting(true)
    try {
      await startRun(pendingRun.workflowId, taskInput.trim())
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
          <p className="text-base font-bold text-white/90">
            {isExistingProject ? `Continue — ${pendingRun.presetProjectName}` : 'Start Run'}
          </p>
          <p className="text-xs text-white/35 mt-0.5">
            {isExistingProject
              ? 'Agents will read the existing files and apply your task.'
              : 'What should your workforce do, and where should they save their work?'}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Task input — always shown */}
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 block">
              Task *
            </label>
            <textarea
              autoFocus
              rows={3}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStart()
              }}
              placeholder="Describe what you want the agents to do..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/80 outline-none focus:border-purple-500/50 placeholder:text-white/20 resize-none leading-relaxed"
            />
            <p className="text-[10px] text-white/20 mt-1">Ctrl+Enter to start</p>
          </div>

          {/* Existing project badge */}
          {isExistingProject && (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-base shrink-0">◈</div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-300">{pendingRun.presetProjectName}</p>
                <p className="text-[10px] text-white/30 font-mono truncate">{pendingRun.presetProjectPath}</p>
              </div>
              <span className="ml-auto text-[10px] text-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">existing project</span>
            </div>
          )}

          {/* Workspace mode selection — only for new runs */}
          {!isExistingProject && (
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase tracking-wider block">
                Where to save files
              </label>

              <button
                onClick={() => setMode('temporary')}
                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border transition-all text-left ${
                  mode === 'temporary'
                    ? 'border-purple-500/60 bg-purple-500/8'
                    : 'border-white/10 bg-white/2 hover:bg-white/5 hover:border-white/20'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 ${mode === 'temporary' ? 'bg-purple-500/20 text-purple-300' : 'bg-white/8 text-white/40'}`}>◌</div>
                <div>
                  <p className="text-sm font-semibold text-white/85">Temporary</p>
                  <p className="text-xs text-white/40 leading-relaxed">Files are discarded when you close the run. Good for experiments.</p>
                </div>
              </button>

              <button
                onClick={() => setMode('project')}
                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border transition-all text-left ${
                  mode === 'project'
                    ? 'border-emerald-500/60 bg-emerald-500/5'
                    : 'border-white/10 bg-white/2 hover:bg-white/5 hover:border-white/20'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 ${mode === 'project' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/8 text-white/40'}`}>◈</div>
                <div>
                  <p className="text-sm font-semibold text-white/85">Save as Project</p>
                  <p className="text-xs text-white/40 leading-relaxed">Files are saved permanently so you can continue later.</p>
                </div>
              </button>

              {mode === 'project' && (
                <div className="space-y-3 pt-1 pl-1">
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 block">Project name *</label>
                    <input
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                      placeholder="e.g. my-app, research-report"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-emerald-500/50 placeholder:text-white/20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 block">
                      Save location <span className="text-white/20 normal-case">(optional)</span>
                    </label>
                    <input
                      value={basePath}
                      onChange={(e) => setBasePath(e.target.value)}
                      placeholder={defaultProjectsPath}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-emerald-500/50 placeholder:text-white/20 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleNoSave}
                disabled={starting}
                className="w-full text-center text-xs text-white/25 hover:text-white/50 py-1 transition-colors disabled:opacity-40"
              >
                Run without saving files →
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/8 bg-white/2">
          <button
            onClick={handleCancel}
            className="text-sm text-white/40 hover:text-white/70 px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {starting ? 'Starting...' : isExistingProject ? '▶ Continue Run' : '▶ Start Run'}
          </button>
        </div>
      </div>
    </div>
  )
}
