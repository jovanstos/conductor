import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { X, Zap, ChevronDown, ChevronRight, Plus, Play, Code2, Search, PenLine, BookOpen, ClipboardList, TestTube2, Megaphone, Wrench, AlertTriangle } from 'lucide-react'
import type { WorkflowNode, AgentNodeData, Template, ToolNameId } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { BUILT_IN_TEMPLATES, getRoleInfo, TOOL_REGISTRY, TOOL_GROUPS, TOOL_PRESETS, type RoleCategory } from '../../lib/defaults'
import { getTemplates, saveTemplate, deleteTemplate } from '../../lib/tauri'
import ModelPicker from '../shared/ModelPicker'
import AgentTestModal from './AgentTestModal'

function RoleIcon({ category, size = 16, className = '' }: { category: RoleCategory; size?: number; className?: string }): ReactNode {
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

  // Custom template save state
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

  function toggleTool(id: ToolNameId) {
    const next = toolsEnabled.includes(id) ? toolsEnabled.filter((t) => t !== id) : [...toolsEnabled, id]
    saveTools(next)
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
      <div className={`flex items-center gap-3 p-3 rounded-xl border ${roleInfo.borderColor} ${roleInfo.bgColor}/30`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${roleInfo.bgColor}`}>
          <RoleIcon category={roleInfo.category} size={18} className={roleInfo.textColor} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white/85 truncate">{name || 'New Agent'}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full ${roleInfo.bgColor} ${roleInfo.textColor} font-medium`}>
            {roleInfo.label}
          </span>
        </div>
      </div>

      {!hasPrompt && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2.5">
          <p className="text-xs text-amber-300/80 leading-relaxed">
            No instructions yet. Load a template to get started quickly, or write your own system prompt.
          </p>
        </div>
      )}

      {/* Template picker */}
      <div>
        <button
          onClick={() => setShowTemplates((v) => !v)}
          className="w-full flex items-center justify-between bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/25 text-purple-300/80 text-xs px-3 py-2 rounded-lg transition-colors"
        >
          <span className="flex items-center gap-1.5"><Zap size={12} /> Load a template</span>
          {showTemplates ? <ChevronDown size={12} className="text-white/30" /> : <ChevronRight size={12} className="text-white/30" />}
        </button>

        {showTemplates && (
          <div className="mt-1 bg-[#0f0f14] border border-white/8 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            {/* User templates */}
            {userTemplates.length > 0 && (
              <div>
                <p className="px-3 py-1.5 text-xs text-white/30 font-semibold uppercase tracking-widest bg-white/3 sticky top-0">
                  My Templates
                </p>
                {userTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-1 border-b border-white/4 hover:bg-white/6 transition-colors"
                  >
                    <button
                      onClick={() => applyTemplate(t)}
                      className="flex-1 text-left px-3 py-2"
                    >
                      <p className="text-sm text-white/80">{t.name}</p>
                      <p className="text-xs text-white/35">{t.description}</p>
                    </button>
                    <button
                      onClick={() => handleDeleteUserTemplate(t.id)}
                      className="px-1 text-white/20 hover:text-red-400 transition-colors shrink-0"
                      title="Delete template"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Built-in templates */}
            {categories.map((cat) => (
              <div key={cat}>
                <p className="px-3 py-1.5 text-xs text-white/30 font-semibold uppercase tracking-widest bg-white/3 sticky top-0">
                  {cat}
                </p>
                {BUILT_IN_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="w-full text-left px-3 py-2 hover:bg-white/6 transition-colors border-b border-white/4 last:border-0"
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
        <p className="text-xs text-white/30 mb-1.5">
          The full instruction set for this employee. Templates above give you a great starting point.
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
          className="w-full text-left text-xs text-white/30 hover:text-white/55 flex items-center gap-1.5 transition-colors"
        >
          <Plus size={12} className="inline mr-1" /> Save as template
        </button>
      )}

      {showSaveForm && (
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Save as template</p>
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
              className="flex-1 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-40 text-white text-xs py-1.5 rounded-lg transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveForm(false)}
              className="text-xs text-white/30 hover:text-white/60 px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Advanced section */}
      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="w-full text-left text-xs text-white/30 hover:text-white/50 flex items-center gap-1.5 transition-colors"
      >
        {showAdvanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Advanced settings
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-3 border-l border-white/8">
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
            <p className="text-xs text-white/30 mt-1.5 leading-relaxed">
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
            <p className="text-xs text-white/25 mt-1">
              Controls how long the agent's response can be. Default (8096) works well for most tasks.
            </p>
          </Field>
        </div>
      )}

      {/* Tools section */}
      <div className="pt-2 border-t border-white/5">
        <button
          onClick={() => setShowTools((v) => !v)}
          className="w-full flex items-center justify-between text-xs text-white/35 hover:text-white/55 transition-colors mb-1"
        >
          <span className="flex items-center gap-1.5">
            <Wrench size={11} />
            Tools
            {toolsEnabled.length > 0 && (
              <span className="bg-purple-500/20 text-purple-300 text-xs px-1.5 py-0.5 rounded-full">
                {toolsEnabled.length} active
              </span>
            )}
          </span>
          {showTools ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {showTools && (
          <div className="space-y-2">
            {/* Preset buttons */}
            <div className="flex flex-wrap gap-1">
              {TOOL_PRESETS.map((preset) => {
                const active = preset.tools.length === toolsEnabled.length && preset.tools.every((t) => toolsEnabled.includes(t))
                return (
                  <button
                    key={preset.id}
                    onClick={() => saveTools(preset.tools as ToolNameId[])}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                      active
                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                        : 'bg-white/4 border-white/10 text-white/40 hover:border-white/25 hover:text-white/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>

            {/* Per-group checkboxes */}
            <div className="space-y-2">
              {TOOL_GROUPS.map((group) => {
                const groupTools = TOOL_REGISTRY.filter((t) => t.group === group.id)
                return (
                  <div key={group.id}>
                    <p className="text-xs font-semibold text-white/25 uppercase tracking-wider mb-1">{group.label}</p>
                    <div className="space-y-0.5">
                      {groupTools.map((tool) => {
                        const checked = toolsEnabled.includes(tool.id)
                        return (
                          <label key={tool.id} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTool(tool.id)}
                              className="w-3 h-3 accent-purple-500 cursor-pointer"
                            />
                            <span className="text-xs text-white/55 group-hover:text-white/75 transition-colors flex items-center gap-1 flex-1">
                              {tool.label}
                              {tool.requiresConfirmation && (
                                <span className="text-xs text-amber-400/60 flex items-center gap-0.5 ml-1">
                                  <AlertTriangle size={10} /> asks permission
                                </span>
                              )}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {toolsEnabled.length > 0 && (
              <p className="text-xs text-white/25 leading-relaxed">
                When tools are active the agent reads files on demand — no large context injections.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Test agent button */}
      <div className="pt-2 border-t border-white/5">
        <button
          onClick={() => setShowTestModal(true)}
          className="w-full text-xs text-purple-400/60 hover:text-purple-400/90 hover:bg-purple-500/8 border border-purple-500/15 hover:border-purple-500/30 rounded-lg py-2 transition-colors"
        >
          <Play size={11} className="inline mr-1.5" fill="currentColor" />Test this agent
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
      <p className="text-xs font-semibold text-white/35 uppercase tracking-wider mb-1.5">{label}</p>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/75 outline-none focus:border-purple-500/50 transition-colors'

const selectCls =
  'w-full bg-[#141418] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/75 outline-none focus:border-purple-500/50 transition-colors'

const optionStyle = { background: '#141418', color: 'rgba(255,255,255,0.75)' }
