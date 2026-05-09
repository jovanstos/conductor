import { useState, useEffect } from 'react'
import { X, ChevronDown, ChevronRight, Zap, Shield, ShieldAlert } from 'lucide-react'
import type { WorkflowNode, AgentNodeData, LoopNodeData, Template, ToolNameId } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { BUILT_IN_TEMPLATES, TOOL_REGISTRY, TOOL_GROUPS } from '../../lib/defaults'
import { getTemplates, saveTemplate, deleteTemplate } from '../../lib/tauri'
import ModelPicker from '../shared/ModelPicker'

const CONTEXT_OPTIONS = [
  { value: 'full_chain', label: 'Full chain', desc: 'Sees all prior agent outputs' },
  { value: 'previous',   label: 'Previous',   desc: 'Sees only the prior agent output' },
  { value: 'none',       label: 'None',        desc: 'Only sees the original task' },
] as const

export default function AgentConfigPanel({
  node,
  onClose,
}: {
  node: WorkflowNode
  onClose: () => void
}) {
  const { updateNode, getChildNodes } = useWorkflowStore()

  if (node.type === 'loop') {
    return <LoopConfigPanel node={node} onClose={onClose} />
  }

  if (node.type === 'review_gate') {
    return <ReviewGateConfigPanel node={node} onClose={onClose} />
  }

  const d = node.data as AgentNodeData
  return <AgentEditor node={node} d={d} onClose={onClose} />
}

function AgentEditor({
  node,
  d,
  onClose,
}: {
  node: WorkflowNode
  d: AgentNodeData
  onClose: () => void
}) {
  const { updateNode } = useWorkflowStore()
  const [name, setName] = useState(d.name)
  const [role, setRole] = useState(d.roleDescription)
  const [prompt, setPrompt] = useState(d.systemPrompt)
  const [contextMode, setContextMode] = useState(d.contextMode)
  const [toolsEnabled, setToolsEnabled] = useState<ToolNameId[]>(d.toolsEnabled ?? [])
  const [model, setModel] = useState(d.model)
  const [showTemplates, setShowTemplates] = useState(false)
  const [userTemplates, setUserTemplates] = useState<Template[]>([])
  const [saveName, setSaveName] = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)

  useEffect(() => {
    setName(d.name); setRole(d.roleDescription); setPrompt(d.systemPrompt)
    setContextMode(d.contextMode); setToolsEnabled(d.toolsEnabled ?? []); setModel(d.model)
  }, [node.id])

  useEffect(() => {
    if (showTemplates) {
      getTemplates().then((all) => setUserTemplates(all.filter((t) => !t.isBuiltIn))).catch(() => {})
    }
  }, [showTemplates])

  function save(patch?: Partial<AgentNodeData>) {
    updateNode(node.id, {
      data: { ...d, name, roleDescription: role, systemPrompt: prompt, contextMode, toolsEnabled, model, ...patch },
    })
  }

  function saveToolsUpdate(next: ToolNameId[]) {
    setToolsEnabled(next)
    updateNode(node.id, { data: { ...d, name, roleDescription: role, systemPrompt: prompt, contextMode, toolsEnabled: next, model } })
  }

  const allToolIds = TOOL_REGISTRY.map((t) => t.id) as ToolNameId[]
  const isFullAccess = toolsEnabled.length === 0
  const isChecked = (id: ToolNameId) => isFullAccess || toolsEnabled.includes(id)

  function toggleTool(id: ToolNameId) {
    if (isFullAccess) {
      saveToolsUpdate(allToolIds.filter((t) => t !== id))
    } else {
      const next = toolsEnabled.includes(id)
        ? toolsEnabled.filter((t) => t !== id)
        : [...toolsEnabled, id]
      saveToolsUpdate(allToolIds.every((t) => next.includes(t)) ? [] : (next as ToolNameId[]))
    }
  }

  function applyTemplate(t: { name: string; roleDescription?: string; description?: string; systemPrompt: string }) {
    const roleDesc = t.roleDescription ?? t.description ?? ''
    setName(t.name); setRole(roleDesc); setPrompt(t.systemPrompt)
    updateNode(node.id, { data: { ...d, name: t.name, roleDescription: roleDesc, systemPrompt: t.systemPrompt } })
    setShowTemplates(false)
  }

  async function handleSaveTemplate() {
    if (!saveName.trim()) return
    const template: Template = {
      id: crypto.randomUUID(), name: saveName.trim(),
      category: 'My Templates', description: role, systemPrompt: prompt, isBuiltIn: false,
    }
    await saveTemplate(template)
    setUserTemplates((prev) => [...prev, template])
    setShowSaveForm(false); setSaveName('')
  }

  const byCategory = BUILT_IN_TEMPLATES.reduce<Record<string, typeof BUILT_IN_TEMPLATES>>((acc, t) => {
    ;(acc[t.category] = acc[t.category] ?? []).push(t)
    return acc
  }, {})

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--c-surface)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--c-border)' }}>
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--c-accent)', boxShadow: '0 0 6px var(--c-accent)' }} />
        <span className="text-sm font-semibold font-mono-accent truncate" style={{ color: 'var(--c-text-1)' }}>
          {name || 'Agent'}
        </span>
        <button onClick={onClose} className="ml-auto p-1 rounded transition-colors" style={{ color: 'var(--c-text-3)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--c-text-1)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--c-text-3)')}>
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Templates */}
        <div>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="w-full flex items-center gap-2 text-xs font-semibold tracking-widest uppercase mb-2"
            style={{ color: showTemplates ? 'var(--c-green)' : 'var(--c-text-3)' }}
          >
            {showTemplates ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Templates
          </button>
          {showTemplates && (
            <div className="space-y-2">
              {userTemplates.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-3)' }}>My Templates</p>
                  {userTemplates.map((t) => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2 rounded text-xs mb-1 transition-colors"
                      style={{ background: 'var(--c-card)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
              {Object.entries(byCategory).map(([cat, templates]) => (
                <div key={cat}>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-3)' }}>{cat}</p>
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2 rounded text-xs mb-1 transition-colors"
                      style={{ background: 'var(--c-card)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
                      {t.name}
                    </button>
                  ))}
                </div>
              ))}
              {showSaveForm ? (
                <div className="flex gap-2 mt-2">
                  <input value={saveName} onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Template name"
                    className="flex-1 conductor-input rounded px-2 py-1 text-xs" />
                  <button onClick={handleSaveTemplate} className="px-3 py-1 rounded text-xs"
                    style={{ background: 'var(--c-accent-dim)', color: 'var(--c-accent)', border: '1px solid var(--c-accent-border)' }}>
                    Save
                  </button>
                  <button onClick={() => setShowSaveForm(false)} className="px-2 py-1 rounded text-xs"
                    style={{ color: 'var(--c-text-3)' }}>✕</button>
                </div>
              ) : (
                <button onClick={() => setShowSaveForm(true)} className="text-xs w-full text-left px-3 py-2 rounded transition-colors"
                  style={{ color: 'var(--c-text-3)', border: '1px dashed var(--c-border)' }}>
                  + Save current as template
                </button>
              )}
            </div>
          )}
        </div>

        {/* Name */}
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => save()} className="w-full conductor-input px-3 py-2.5 text-sm" />
        </Field>

        {/* Role */}
        <Field label="Role">
          <input value={role} onChange={(e) => setRole(e.target.value)}
            onBlur={() => save()} placeholder="Describe what this agent does…"
            className="w-full conductor-input px-3 py-2.5 text-sm" />
        </Field>

        {/* System prompt */}
        <Field label="System Prompt">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onBlur={() => save()}
            rows={8}
            className="w-full conductor-input rounded px-3 py-2 text-sm resize-y leading-relaxed"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', minHeight: '160px' }} />
        </Field>

        {/* Model */}
        <Field label="Model">
          <ModelPicker value={model} onChange={(m) => { setModel(m); updateNode(node.id, { data: { ...d, name, roleDescription: role, systemPrompt: prompt, contextMode, toolsEnabled, model: m } }) }} />
        </Field>

        {/* Context */}
        <Field label="Context Mode">
          <div className="grid grid-cols-3 gap-1">
            {CONTEXT_OPTIONS.map((opt) => (
              <button key={opt.value}
                onClick={() => { setContextMode(opt.value); save({ contextMode: opt.value }) }}
                className="px-2 py-2 rounded text-xs text-center transition-all"
                style={contextMode === opt.value
                  ? { background: 'var(--c-accent-dim)', color: 'var(--c-accent)', border: '1px solid var(--c-accent-border)' }
                  : { background: 'var(--c-card)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
            {CONTEXT_OPTIONS.find((o) => o.value === contextMode)?.desc}
          </p>
        </Field>

        {/* Tools */}
        <Field label="Tools">
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                {isFullAccess ? 'Full tool access' : `${toolsEnabled.length} tool${toolsEnabled.length !== 1 ? 's' : ''} enabled`}
              </span>
              {!isFullAccess && (
                <button onClick={() => saveToolsUpdate([])} className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                  Enable all
                </button>
              )}
            </div>
            {TOOL_GROUPS.map((group) => {
              const groupTools = TOOL_REGISTRY.filter((t) => t.group === group.id)
              return (
                <div key={group.id} className="mb-3">
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-3)' }}>{group.label}</p>
                  {groupTools.map((tool) => {
                    const checked = isChecked(tool.id as ToolNameId)
                    const isDangerous = tool.requiresConfirmation
                    return (
                      <button key={tool.id} onClick={() => toggleTool(tool.id as ToolNameId)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs mb-0.5 transition-colors"
                        style={{ background: checked ? 'var(--c-card)' : 'transparent', border: '1px solid transparent' }}>
                        <div className="w-3.5 h-3.5 rounded flex items-center justify-center"
                          style={{ background: checked ? (isDangerous ? 'var(--c-amber)' : 'var(--c-green)') : 'var(--c-border)', flexShrink: 0 }}>
                          {checked && <span style={{ color: '#000', fontSize: '8px' }}>✓</span>}
                        </div>
                        <span style={{ color: checked ? 'var(--c-text-1)' : 'var(--c-text-3)', flexGrow: 1, textAlign: 'left' }}>
                          {tool.label}
                        </span>
                        {isDangerous && checked && (
                          <ShieldAlert size={10} style={{ color: 'var(--c-amber)', flexShrink: 0 }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </Field>
      </div>
    </div>
  )
}

type LoopTab = 'settings' | 'worker' | 'reviewer'

function LoopConfigPanel({ node, onClose }: { node: WorkflowNode; onClose: () => void }) {
  const { updateNode, getChildNodes } = useWorkflowStore()
  const d = node.data as LoopNodeData
  const [maxRetries, setMaxRetries] = useState(d.maxRetries)
  const [activeTab, setActiveTab] = useState<LoopTab>('worker')
  const children = getChildNodes(node.id)
  const worker = children.find((c) => c.id === d.targetNodeId)
  const reviewer = children.find((c) => c.id === d.reviewerNodeId)

  function saveLoop(patch?: Partial<LoopNodeData>) {
    updateNode(node.id, { data: { ...d, maxRetries, ...patch } })
  }

  const workerData = worker?.data as AgentNodeData | undefined
  const reviewerData = reviewer?.data as AgentNodeData | undefined

  const TABS: { id: LoopTab; label: string; color: string; accentColor: string }[] = [
    { id: 'worker',   label: workerData?.name   ?? 'Worker',   color: 'var(--c-green)', accentColor: 'rgba(74,222,128,0.15)' },
    { id: 'reviewer', label: reviewerData?.name ?? 'Reviewer', color: 'var(--c-amber)', accentColor: 'var(--c-amber-dim)' },
    { id: 'settings', label: 'Loop',                           color: 'var(--c-loop)',  accentColor: 'var(--c-loop-dim)' },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--c-surface)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--c-border)' }}>
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--c-loop)', boxShadow: '0 0 6px var(--c-loop)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--c-text-1)' }}>Loop Group</span>
        <button onClick={onClose} className="ml-auto w-7 h-7 flex items-center justify-center rounded" style={{ color: 'var(--c-text-3)' }}>
          <X size={15} />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 px-3 py-2 shrink-0 border-b" style={{ borderColor: 'var(--c-border-subtle)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-1.5 rounded text-xs font-semibold transition-all"
            style={activeTab === tab.id
              ? { background: tab.accentColor, color: tab.color, border: `1px solid ${tab.color}55` }
              : { color: 'var(--c-text-3)', border: '1px solid transparent' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'settings' && (
          <div className="overflow-y-auto h-full p-4 space-y-4">
            <Field label="Max Retries">
              <input
                type="number" value={maxRetries} min={1} max={10}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                onBlur={() => saveLoop()}
                className="w-full conductor-input px-3 py-2.5 text-sm"
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--c-text-3)' }}>
                How many times the worker can revise before the loop exits regardless.
              </p>
            </Field>
            <div className="rounded-lg p-3 text-sm leading-relaxed" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
              <p className="font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>How loops work</p>
              The Worker runs the task. The Reviewer evaluates the output — if it ends with <span className="font-mono-accent" style={{ color: 'var(--c-green)' }}>APPROVED</span>, the loop exits. If it ends with <span className="font-mono-accent" style={{ color: 'var(--c-amber)' }}>NEEDS REVISION</span>, the Worker revises and tries again.
            </div>
          </div>
        )}

        {activeTab === 'worker' && worker && (
          <AgentEditor node={worker} d={worker.data as AgentNodeData} onClose={onClose} />
        )}

        {activeTab === 'reviewer' && reviewer && (
          <AgentEditor node={reviewer} d={reviewer.data as AgentNodeData} onClose={onClose} />
        )}

        {activeTab === 'worker' && !worker && (
          <div className="p-4 text-sm" style={{ color: 'var(--c-text-3)' }}>Worker agent not found.</div>
        )}
        {activeTab === 'reviewer' && !reviewer && (
          <div className="p-4 text-sm" style={{ color: 'var(--c-text-3)' }}>Reviewer agent not found.</div>
        )}
      </div>
    </div>
  )
}

function ReviewGateConfigPanel({ node, onClose }: { node: WorkflowNode; onClose: () => void }) {
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--c-surface)' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--c-border)' }}>
        <div className="w-2 h-2 rounded-full" style={{ background: 'var(--c-blue)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>Review Gate</span>
        <button onClick={onClose} className="ml-auto p-1 rounded" style={{ color: 'var(--c-text-3)' }}>
          <X size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
          Pauses the workflow at this point and waits for human approval before continuing. You can approve, reject, or edit the output before the next agent runs.
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-2)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
