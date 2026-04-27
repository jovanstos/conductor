import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { X, Zap, ChevronDown, ChevronRight, Plus, Play, Code2, Search, PenLine, BookOpen, ClipboardList, TestTube2, Megaphone, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react'
import type { WorkflowNode, AgentNodeData, Template, ToolNameId } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { BUILT_IN_TEMPLATES, getRoleInfo, TOOL_REGISTRY, TOOL_GROUPS, type RoleCategory } from '../../lib/defaults'
import { getTemplates, saveTemplate, deleteTemplate } from '../../lib/tauri'
import ModelPicker from '../shared/ModelPicker'
import AgentTestModal from './AgentTestModal'

function RoleIcon({ category, size = 18, className = '' }: { category: RoleCategory; size?: number; className?: string }): ReactNode {
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

const CONTEXT_MODE_HELP: Record<string, string> = {
  full_chain: 'Sees everything every prior agent wrote — great for a final editor or report writer.',
  previous: 'Sees only the output from the immediately preceding agent — good for focused review steps.',
  none: 'Only sees the original task description — use for a fresh, unbiased perspective.',
}

export default function AgentInspector({ node }: { node: WorkflowNode }) {
  const { updateNode } = useWorkflowStore()
  const d = node.data as AgentNodeData

  const [name, setName] = useState(d.name)
  const [role, setRole] = useState(d.roleDescription)
  const [prompt, setPrompt] = useState(d.systemPrompt)
  const [contextMode, setContextMode] = useState(d.contextMode)
  const [maxTokens, setMaxTokens] = useState(d.maxTokens)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showTestModal, setShowTestModal] = useState(false)
  const [toolsEnabled, setToolsEnabled] = useState<ToolNameId[]>(d.toolsEnabled ?? [])

  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveCategory, setSaveCategory] = useState('My Templates')
  const [userTemplates, setUserTemplates] = useState<Template[]>([])

  useEffect(() => {
    setName(d.name)
    setRole(d.roleDescription)
    setPrompt(d.systemPrompt)
    setContextMode(d.contextMode)
    setMaxTokens(d.maxTokens)
    setToolsEnabled(d.toolsEnabled ?? [])
    setShowTemplates(false)
    setShowSaveForm(false)
  }, [node.id])

  useEffect(() => {
    if (showTemplates) {
      getTemplates().then((all) => setUserTemplates(all.filter((t) => !t.isBuiltIn))).catch(() => {})
    }
  }, [showTemplates])

  function save(patch?: Partial<AgentNodeData>) {
    updateNode(node.id, {
      data: { ...d, name, roleDescription: role, systemPrompt: prompt, contextMode, maxTokens, toolsEnabled, ...patch },
    })
  }

  function saveTools(next: ToolNameId[]) {
    setToolsEnabled(next)
    updateNode(node.id, { data: { ...d, name, roleDescription: role, systemPrompt: prompt, contextMode, maxTokens, toolsEnabled: next } })
  }

  const allToolIds = TOOL_REGISTRY.map((t) => t.id) as ToolNameId[]
  const isFullAccess = toolsEnabled.length === 0
  const isChecked = (id: ToolNameId) => isFullAccess || toolsEnabled.includes(id)

  function toggleTool(id: ToolNameId) {
    if (isFullAccess) {
      saveTools(allToolIds.filter((t) => t !== id))
    } else {
      const next = toolsEnabled.includes(id)
        ? toolsEnabled.filter((t) => t !== id)
        : [...toolsEnabled, id]
      saveTools(allToolIds.every((t) => next.includes(t)) ? [] : (next as ToolNameId[]))
    }
  }

  function applyTemplate(t: Template | typeof BUILT_IN_TEMPLATES[number]) {
    const roleDesc = 'roleDescription' in t ? t.roleDescription : t.description
    setName(t.name)
    setRole(roleDesc)
    setPrompt(t.systemPrompt)
    updateNode(node.id, {
      data: { ...d, name: t.name, roleDescription: roleDesc, systemPrompt: t.systemPrompt },
    })
    setShowTemplates(false)
  }

  async function handleSaveTemplate() {
    if (!saveName.trim()) return
    const template: Template = {
      id: crypto.randomUUID(),
      name: saveName.trim(),
      category: saveCategory.trim() || 'My Templates',
      description: role,
      systemPrompt: prompt,
      isBuiltIn: false,
    }
    await saveTemplate(template)
    setUserTemplates((prev) => [...prev, template])
    setShowSaveForm(false)
    setSaveName('')
  }

  async function handleDeleteUserTemplate(id: string) {
    await deleteTemplate(id)
    setUserTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  const hasPrompt = prompt.trim().length > 0
  const categories = [...new Set(BUILT_IN_TEMPLATES.map((t) => t.category))]
  const roleInfo = getRoleInfo(name, role)

  return (
    <div className="space-y-4">
      {/* Persona header */}
      <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${roleInfo.borderColor} ${roleInfo.bgColor}/30`}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${roleInfo.bgColor}`}>
          <RoleIcon category={roleInfo.category} size={20} className={roleInfo.textColor} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-white/85 truncate">{name || 'New Agent'}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full ${roleInfo.bgColor} ${roleInfo.textColor} font-medium`}>
            {roleInfo.label}
          </span>
        </div>
      </div>

      {!hasPrompt && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-300/80 leading-relaxed">
            No instructions yet. Load a template to get started quickly, or write your own system prompt.
          </p>
        </div>
      )}

      {/* Template picker */}
      <div>
        <button
          onClick={() => setShowTemplates((v) => !v)}
          className="w-full flex items-center justify-between bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/25 text-purple-300/80 text-sm px-4 py-2.5 rounded-lg transition-colors"
        >
          <span className="flex items-center gap-2"><Zap size={14} /> Load a template</span>
          {showTemplates ? <ChevronDown size={14} className="text-white/30" /> : <ChevronRight size={14} className="text-white/30" />}
        </button>

        {showTemplates && (
          <div className="mt-1 bg-[#0f0f14] border border-white/8 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            {userTemplates.length > 0 && (
              <div>
                <p className="px-3 py-2 text-xs text-white/30 font-semibold uppercase tracking-widest bg-white/3 sticky top-0">
                  My Templates
                </p>
                {userTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-1 border-b border-white/4 hover:bg-white/6 transition-colors"
                  >
                    <button
                      onClick={() => applyTemplate(t)}
                      className="flex-1 text-left px-4 py-2.5"
                    >
                      <p className="text-sm text-white/80">{t.name}</p>
                      <p className="text-xs text-white/35">{t.description}</p>
                    </button>
                    <button
                      onClick={() => handleDeleteUserTemplate(t.id)}
                      className="px-2 text-white/20 hover:text-red-400 transition-colors shrink-0"
                      title="Delete template"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {categories.map((cat) => (
              <div key={cat}>
                <p className="px-3 py-2 text-xs text-white/30 font-semibold uppercase tracking-widest bg-white/3 sticky top-0">
                  {cat}
                </p>
                {BUILT_IN_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/6 transition-colors border-b border-white/4 last:border-0"
                  >
                    <p className="text-sm text-white/80">{t.name}</p>
                    <p className="text-xs text-white/35">{t.roleDescription}</p>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <Field label="Agent name">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => save()}
          placeholder="e.g. Developer, Planner, Reviewer"
        />
      </Field>

      <Field label="Role (shown on the canvas card)">
        <input
          className={inputCls}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          onBlur={() => save()}
          placeholder="e.g. Writes the implementation"
        />
      </Field>

      <Field label="AI model">
        <ModelPicker
          value={d.model}
          onChange={(model) => updateNode(node.id, { data: { ...d, model } })}
        />
      </Field>

      <Field label="System prompt">
        <p className="text-sm text-white/30 mb-2">
          The full instruction set for this agent. Templates above give you a great starting point.
        </p>
        <textarea
          className={`${inputCls} h-52 resize-y font-mono text-xs leading-relaxed`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => save()}
        />
      </Field>

      {/* Save as template */}
      {hasPrompt && !showSaveForm && (
        <button
          onClick={() => { setSaveName(name); setShowSaveForm(true) }}
          className="w-full text-left text-sm text-white/30 hover:text-white/55 flex items-center gap-2 transition-colors"
        >
          <Plus size={14} className="inline" /> Save as template
        </button>
      )}

      {showSaveForm && (
        <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-white/40 uppercase tracking-wider">Save as template</p>
          <input
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
            placeholder="Template name"
            className={inputCls}
          />
          <input
            value={saveCategory}
            onChange={(e) => setSaveCategory(e.target.value)}
            placeholder="Category (e.g. My Templates)"
            className={inputCls}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveTemplate}
              disabled={!saveName.trim()}
              className="flex-1 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-40 text-white text-sm py-2 rounded-lg transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveForm(false)}
              className="text-sm text-white/30 hover:text-white/60 px-3 py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Advanced section */}
      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="w-full text-left text-sm text-white/30 hover:text-white/50 flex items-center gap-2 transition-colors"
      >
        {showAdvanced ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        Advanced settings
      </button>

      {showAdvanced && (
        <div className="space-y-4 pl-4 border-l border-white/8">
          <Field label="Context from prior agents">
            <select
              className={selectCls}
              value={contextMode}
              onChange={(e) => {
                const v = e.target.value as AgentNodeData['contextMode']
                setContextMode(v)
                save({ contextMode: v })
              }}
            >
              <option style={optionStyle} value="full_chain">Full chain — sees all prior outputs</option>
              <option style={optionStyle} value="previous">Previous agent only</option>
              <option style={optionStyle} value="none">None — only sees the original task</option>
            </select>
            <p className="text-sm text-white/30 mt-2 leading-relaxed">
              {CONTEXT_MODE_HELP[contextMode]}
            </p>
          </Field>

          <Field label="Max output length">
            <input
              type="number"
              className={inputCls}
              value={maxTokens}
              min={256}
              max={32000}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              onBlur={() => save()}
            />
            <p className="text-sm text-white/25 mt-1.5">
              Controls how long the agent's response can be. Default (8096) works well for most tasks.
            </p>
          </Field>
        </div>
      )}

      {/* Tool access section */}
      <div className="pt-2 border-t border-white/5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isFullAccess ? (
              <ShieldCheck size={15} className="text-emerald-400" />
            ) : (
              <ShieldAlert size={15} className="text-amber-400" />
            )}
            <span className="text-sm font-semibold text-white/50">Tool Access</span>
            {isFullAccess ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                Full Access
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-400 border border-amber-500/25">
                Restricted · {toolsEnabled.length}/{allToolIds.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowTools((v) => !v)}
            className="text-sm text-white/30 hover:text-white/55 flex items-center gap-1.5 transition-colors"
          >
            {showTools ? 'Hide' : 'Restrict'}
            {showTools ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>

        {!showTools && isFullAccess && (
          <p className="text-sm text-white/25 leading-relaxed">
            All tools are enabled. The agent can read, write, run commands, and fetch URLs.
            Click <em>Restrict</em> to limit access.
          </p>
        )}

        {showTools && (
          <div className="space-y-3">
            {!isFullAccess && (
              <button
                onClick={() => saveTools([])}
                className="text-sm text-emerald-400/70 hover:text-emerald-400 transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck size={14} /> Reset to Full Access
              </button>
            )}
            {TOOL_GROUPS.map((group) => {
              const groupTools = TOOL_REGISTRY.filter((t) => t.group === group.id)
              return (
                <div key={group.id}>
                  <p className="text-xs font-semibold text-white/25 uppercase tracking-wider mb-1.5">{group.label}</p>
                  <div className="space-y-1">
                    {groupTools.map((tool) => (
                      <label key={tool.id} className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={isChecked(tool.id)}
                          onChange={() => toggleTool(tool.id)}
                          className="w-4 h-4 accent-purple-500 cursor-pointer"
                        />
                        <span className="text-sm text-white/55 group-hover:text-white/75 transition-colors flex items-center gap-1.5 flex-1">
                          {tool.label}
                          {tool.requiresConfirmation && (
                            <span className="text-xs text-amber-400/60 flex items-center gap-0.5 ml-1">
                              <AlertTriangle size={12} /> asks permission
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Test agent button */}
      <div className="pt-2 border-t border-white/5">
        <button
          onClick={() => setShowTestModal(true)}
          className="w-full text-sm text-purple-400/60 hover:text-purple-400/90 hover:bg-purple-500/8 border border-purple-500/15 hover:border-purple-500/30 rounded-lg py-2.5 transition-colors"
        >
          <Play size={13} className="inline mr-2" fill="currentColor" />Test this agent
        </button>
      </div>

      {showTestModal && (
        <AgentTestModal data={d} onClose={() => setShowTestModal(false)} />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-white/35 uppercase tracking-wider mb-2">{label}</p>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/75 outline-none focus:border-purple-500/50 transition-colors'

const selectCls =
  'w-full bg-[#141418] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/75 outline-none focus:border-purple-500/50 transition-colors'

const optionStyle = { background: '#141418', color: 'rgba(255,255,255,0.75)' }
