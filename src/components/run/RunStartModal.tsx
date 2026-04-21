import { useState } from 'react'
import type { ReactNode } from 'react'
import { FolderOpen, Clock, Play, Users, Code2, Search, PenLine, BookOpen, ClipboardList, TestTube2, Megaphone, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { useRunStore } from '../../stores/runStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { getRoleInfo, type RoleCategory } from '../../lib/defaults'
import type { AgentNodeData } from '../../types'

function RoleIcon({ category, size = 14, className = '' }: { category: RoleCategory; size?: number; className?: string }): ReactNode {
  const props = { size, className }
  switch (category) {
    case 'developer': return <Code2 {...props} />
    case 'reviewer': return <Search {...props} />
    case 'writer': return <PenLine {...props} />
    case 'researcher': return <BookOpen {...props} />
    case 'planner': return <ClipboardList {...props} />
    case 'tester': return <TestTube2 {...props} />
    case 'marketer': return <Megaphone {...props} />
    default: return <Zap {...props} />
  }
}

function AgentBriefCard({ agentData }: { agentData: AgentNodeData }) {
  const role = getRoleInfo(agentData.name, agentData.roleDescription || '')
  const oneLiner = agentData.systemPrompt?.split('.')[0]?.slice(0, 80) || agentData.roleDescription || 'Ready to work'
  const modelShort = agentData.model?.modelId?.split('-').slice(0, 2).join('-') ?? 'model'

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${role.borderColor} bg-white/2`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${role.bgColor}`}>
        <RoleIcon category={role.category} size={15} className={role.textColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-xs font-semibold text-white/85 truncate">{agentData.name}</p>
          <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${role.bgColor} ${role.textColor}`}>
            {role.label}
          </span>
        </div>
        <p className="text-xs text-white/35 truncate">{oneLiner}</p>
      </div>
      <span className="text-xs text-white/20 shrink-0 font-mono">{modelShort}</span>
    </div>
  )
}

type Mode = 'temporary' | 'project' | null

export default function RunStartModal() {
  const { pendingRun, startRun, setPendingRun } = useRunStore()
  const { defaultProjectsPath } = useSettingsStore()
  const { workflows } = useWorkflowStore()

  const isExistingProject = !!(pendingRun?.presetProjectPath)

  const [taskInput, setTaskInput] = useState(pendingRun?.input ?? '')
  const [mode, setMode] = useState<Mode>(isExistingProject ? null : null)
  const [projectName, setProjectName] = useState('')
  const [basePath, setBasePath] = useState(defaultProjectsPath)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSaveOptions, setShowSaveOptions] = useState(false)

  if (!pendingRun) return null

  const workflow = workflows.find((w) => w.id === pendingRun.workflowId)
  const agentNodes = workflow?.nodes.filter((n) => n.type === 'agent') ?? []

  const canStart = isExistingProject
    ? taskInput.trim().length > 0
    : taskInput.trim().length > 0 && (mode === null || mode !== 'project' || projectName.trim().length > 0)

  async function handleStart() {
    if (!pendingRun || !taskInput.trim()) { setError('Please describe your task first.'); return }
    setError(null)
    setStarting(true)
    try {
      if (isExistingProject) {
        await startRun(pendingRun.workflowId, taskInput.trim(), 'existing', pendingRun.presetProjectName, pendingRun.presetProjectPath)
      } else if (mode === 'project') {
        if (!projectName.trim()) { setError('Please enter a project name.'); setStarting(false); return }
        await startRun(pendingRun.workflowId, taskInput.trim(), 'project', projectName.trim(), basePath.trim() || undefined)
      } else {
        await startRun(pendingRun.workflowId, taskInput.trim(), 'temporary')
      }
    } catch (e) {
      setError(String(e))
      setStarting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && setPendingRun(null)}
    >
      <div className="w-full max-w-lg bg-[#0e0e13] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/6">
          <div className="flex items-center gap-2 mb-1">
            <Users size={15} className="text-purple-400" />
            <p className="text-xs text-purple-400/70 uppercase tracking-widest font-semibold">Mission Briefing</p>
          </div>
          <p className="text-lg font-bold text-white/90">
            {isExistingProject ? `Continue — ${pendingRun.presetProjectName}` : 'Brief Your Team'}
          </p>
          <p className="text-xs text-white/35 mt-0.5">
            {isExistingProject
              ? 'Your team will read the existing files and carry out your task.'
              : 'Describe the mission. Your team will execute it.'}
          </p>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Task input */}
          <div>
            <label className="text-xs font-semibold text-white/35 uppercase tracking-wider mb-1.5 block">Mission</label>
            <textarea
              autoFocus
              rows={3}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStart() }}
              placeholder="What do you want your team to build, write, or research?"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/80 outline-none focus:border-purple-500/50 placeholder:text-white/20 resize-none leading-relaxed"
            />
            <p className="text-xs text-white/20 mt-1">Ctrl+Enter to brief the team</p>
          </div>

          {/* Agent roster */}
          {agentNodes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-white/35 uppercase tracking-wider mb-2">
                Your Team — {agentNodes.length} agent{agentNodes.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-2">
                {agentNodes.map((n) => (
                  <AgentBriefCard key={n.id} agentData={n.data as AgentNodeData} />
                ))}
              </div>
            </div>
          )}

          {/* Existing project badge */}
          {isExistingProject && (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5">
              <FolderOpen size={14} className="text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-300">{pendingRun.presetProjectName}</p>
                <p className="text-xs text-white/30 font-mono truncate">{pendingRun.presetProjectPath}</p>
              </div>
            </div>
          )}

          {/* Save options — collapsible secondary control */}
          {!isExistingProject && (
            <div>
              <button
                onClick={() => setShowSaveOptions((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/55 transition-colors"
              >
                {showSaveOptions ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {mode === 'project' ? `Save as project: ${projectName || '(unnamed)'}` : 'Save options (temporary by default)'}
              </button>

              {showSaveOptions && (
                <div className="mt-3 space-y-2">
                  <button
                    onClick={() => setMode('temporary')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      mode === 'temporary' || mode === null
                        ? 'border-purple-500/40 bg-purple-500/8'
                        : 'border-white/8 bg-white/2 hover:bg-white/4'
                    }`}
                  >
                    <Clock size={13} className={mode === 'temporary' || mode === null ? 'text-purple-300' : 'text-white/30'} />
                    <div>
                      <p className="text-xs font-medium text-white/75">Temporary</p>
                      <p className="text-xs text-white/30">Discarded when run closes</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setMode('project')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      mode === 'project'
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-white/8 bg-white/2 hover:bg-white/4'
                    }`}
                  >
                    <FolderOpen size={13} className={mode === 'project' ? 'text-emerald-300' : 'text-white/30'} />
                    <div>
                      <p className="text-xs font-medium text-white/75">Save as Project</p>
                      <p className="text-xs text-white/30">Files kept permanently</p>
                    </div>
                  </button>

                  {mode === 'project' && (
                    <div className="space-y-2 pt-1 pl-1">
                      <input
                        autoFocus
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                        placeholder="Project name"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-emerald-500/50 placeholder:text-white/20"
                      />
                      <input
                        value={basePath}
                        onChange={(e) => setBasePath(e.target.value)}
                        placeholder={defaultProjectsPath || 'Save location (optional)'}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/60 outline-none focus:border-emerald-500/50 placeholder:text-white/20 font-mono"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/6 bg-white/2">
          <button
            onClick={() => setPendingRun(null)}
            className="text-sm text-white/35 hover:text-white/65 px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {starting
              ? 'Briefing team...'
              : <><Play size={12} fill="currentColor" />{isExistingProject ? 'Continue Mission' : 'Brief the Team'}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
