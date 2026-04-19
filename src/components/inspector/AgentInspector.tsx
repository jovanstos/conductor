import { useState, useEffect } from 'react'
import type { WorkflowNode, AgentNodeData } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'
import { BUILT_IN_TEMPLATES } from '../../lib/defaults'
import ModelPicker from '../shared/ModelPicker'

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

  useEffect(() => {
    setName(d.name)
    setRole(d.roleDescription)
    setPrompt(d.systemPrompt)
    setContextMode(d.contextMode)
    setMaxTokens(d.maxTokens)
    setShowTemplates(false)
  }, [node.id])

  function save(patch?: Partial<AgentNodeData>) {
    updateNode(node.id, {
      data: { ...d, name, roleDescription: role, systemPrompt: prompt, contextMode, maxTokens, ...patch },
    })
  }

  function applyTemplate(t: typeof BUILT_IN_TEMPLATES[number]) {
    setName(t.name)
    setRole(t.roleDescription)
    setPrompt(t.systemPrompt)
    updateNode(node.id, {
      data: { ...d, name: t.name, roleDescription: t.roleDescription, systemPrompt: t.systemPrompt },
    })
    setShowTemplates(false)
  }

  // Group templates by category
  const categories = [...new Set(BUILT_IN_TEMPLATES.map((t) => t.category))]

  return (
    <div className="space-y-4">
      {/* Template picker */}
      <div>
        <button
          onClick={() => setShowTemplates((v) => !v)}
          className="w-full flex items-center justify-between bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/25 text-purple-300/80 text-xs px-3 py-2 rounded-lg transition-colors"
        >
          <span>⚡ Load a template</span>
          <span className="text-white/30">{showTemplates ? '▲' : '▼'}</span>
        </button>

        {showTemplates && (
          <div className="mt-1 bg-[#0f0f14] border border-white/8 rounded-xl overflow-hidden">
            {categories.map((cat) => (
              <div key={cat}>
                <p className="px-3 py-1.5 text-[9px] text-white/25 uppercase tracking-widest bg-white/3">
                  {cat}
                </p>
                {BUILT_IN_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="w-full text-left px-3 py-2 hover:bg-white/6 transition-colors border-b border-white/4 last:border-0"
                  >
                    <p className="text-sm text-white/80">{t.name}</p>
                    <p className="text-[10px] text-white/35">{t.roleDescription}</p>
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
        <p className="text-[10px] text-white/25 mb-1.5">
          This is the full instruction set for this agent. Templates above give you a great starting point.
        </p>
        <textarea
          className={`${inputCls} h-52 resize-y font-mono text-[11px] leading-relaxed`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => save()}
        />
      </Field>

      {/* Advanced section */}
      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="w-full text-left text-[10px] text-white/30 hover:text-white/50 flex items-center gap-1.5 transition-colors"
      >
        <span>{showAdvanced ? '▼' : '▶'}</span>
        Advanced settings
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-3 border-l border-white/8">
          <Field label="Context from prior agents">
            <select
              className={inputCls}
              value={contextMode}
              onChange={(e) => {
                const v = e.target.value as AgentNodeData['contextMode']
                setContextMode(v)
                save({ contextMode: v })
              }}
            >
              <option value="full_chain">Full chain — sees all prior outputs</option>
              <option value="previous">Previous node only</option>
              <option value="none">None — only sees the original task</option>
            </select>
          </Field>

          <Field label="Max output tokens">
            <input
              type="number"
              className={inputCls}
              value={maxTokens}
              min={256}
              max={32000}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              onBlur={() => save()}
            />
            <p className="text-[10px] text-white/25 mt-1">Higher = longer responses. Default 8096 is fine for most uses.</p>
          </Field>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1.5">{label}</p>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/75 outline-none focus:border-purple-500/50 transition-colors'
