import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useChamberStore } from '../../stores/chamberStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { BUILT_IN_TEMPLATES } from '../../lib/defaults'
import ModelPicker from '../shared/ModelPicker'
import type { ChamberMode, ChamberAgent } from '../../types'

const MODES: { id: ChamberMode; label: string; icon: string; description: string }[] = [
  {
    id: 'audition',
    label: 'Blind Audition',
    icon: '🏆',
    description: 'Agents generate independent solutions, then anonymously score each other. Best score wins.',
  },
  {
    id: 'war_room',
    label: 'War Room',
    icon: '⚔️',
    description: 'Two agents debate: one proposes, one critiques. Iterates until the solution is hardened.',
  },
  {
    id: 'syndicate',
    label: 'Syndicate',
    icon: '🔗',
    description: 'Agents act in sequence by specialty, each building on the previous. Produces a unified document.',
  },
]

export default function ChamberConfigPane({ onRun }: { onRun: () => void }) {
  const {
    mode, setMode,
    context, setContext,
    rubric, setRubric,
    roster, addAgent, removeAgent, updateAgent,
    rounds, setRounds,
    reviewGateEnabled, setReviewGateEnabled,
    runStatus,
  } = useChamberStore()

  const { defaultModel } = useSettingsStore()
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)

  const isRunning = runStatus === 'running' || runStatus === 'paused'

  function addBlankAgent() {
    addAgent({
      id: uuidv4(),
      name: 'New Agent',
      systemPrompt: '## Role\nYou are a helpful AI agent.\n\n## Objective\nComplete the given task accurately.',
      model: { ...defaultModel },
    })
  }

  function addFromTemplate(templateId: string) {
    const tpl = BUILT_IN_TEMPLATES.find((t) => t.id === templateId)
    if (!tpl) return
    addAgent({
      id: uuidv4(),
      name: tpl.name,
      systemPrompt: tpl.systemPrompt,
      model: { ...defaultModel },
    })
    setShowTemplatePicker(false)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0e0e13] border-r border-white/6">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/6 shrink-0">
        <p className="text-sm font-bold text-white/85">Configure</p>
        <p className="text-xs text-white/30 mt-0.5">Set up the chamber and start a run</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">

        {/* Mode Selector */}
        <section>
          <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
            Format
          </label>
          <div className="space-y-1.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => !isRunning && setMode(m.id)}
                disabled={isRunning}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                  mode === m.id
                    ? 'border-amber-500/40 bg-amber-500/8 text-white/90'
                    : 'border-white/6 bg-white/2 text-white/50 hover:border-white/15 hover:text-white/70'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{m.icon}</span>
                  <span className="text-xs font-semibold">{m.label}</span>
                </div>
                {mode === m.id && (
                  <p className="text-xs text-white/35 mt-1 pl-6 leading-relaxed">{m.description}</p>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* War Room rounds */}
        {mode === 'war_room' && (
          <section>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Debate Rounds
            </label>
            <div className="flex items-center gap-2">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => !isRunning && setRounds(n)}
                  disabled={isRunning}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    rounds === n
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-white/8 text-white/40 hover:border-white/20'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-white/25 mt-1.5">Propose → Critique cycles before the final output</p>
          </section>
        )}

        {/* Context */}
        <section>
          <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
            Task / Context
          </label>
          <textarea
            value={context}
            onChange={(e) => !isRunning && setContext(e.target.value)}
            disabled={isRunning}
            placeholder="Describe the task, question, or problem for the agents to work on..."
            rows={4}
            className="w-full bg-white/4 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white/75 placeholder:text-white/20 outline-none focus:border-white/20 resize-none transition-colors leading-relaxed"
          />
        </section>

        {/* Rubric (Audition only) */}
        {mode === 'audition' && (
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                Scoring Rubric
              </label>
              <Info size={11} className="text-white/20" />
            </div>
            <textarea
              value={rubric}
              onChange={(e) => !isRunning && setRubric(e.target.value)}
              disabled={isRunning}
              placeholder="Define the criteria for a good answer. e.g. Clarity, Correctness, Practicality, Conciseness..."
              rows={3}
              className="w-full bg-white/4 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white/75 placeholder:text-white/20 outline-none focus:border-white/20 resize-none transition-colors leading-relaxed"
            />
          </section>
        )}

        {/* Review Gate */}
        <section>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => !isRunning && setReviewGateEnabled(!reviewGateEnabled)}
              className={`w-8 h-4.5 rounded-full relative transition-colors cursor-pointer ${
                reviewGateEnabled ? 'bg-amber-500/70' : 'bg-white/10'
              }`}
              style={{ height: '18px', width: '32px' }}
            >
              <div
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${
                  reviewGateEnabled ? 'left-4' : 'left-0.5'
                }`}
              />
            </div>
            <span className="text-xs font-semibold text-white/50">Review gate before synthesis</span>
          </label>
          <p className="text-xs text-white/25 mt-1 pl-10 leading-relaxed">
            Pause for human review after generation, before scoring or merging outputs.
          </p>
        </section>

        {/* Roster */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Roster ({roster.length})
            </label>
            {mode === 'war_room' && (
              <span className="text-xs text-amber-400/50">Requires exactly 2 agents</span>
            )}
          </div>

          {roster.length === 0 && (
            <div className="text-xs text-white/25 py-3 text-center border border-dashed border-white/8 rounded-xl">
              No agents added yet
            </div>
          )}

          <div className="space-y-2">
            {roster.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                expanded={expandedAgent === agent.id}
                onToggle={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                onUpdate={(patch) => updateAgent(agent.id, patch)}
                onRemove={() => removeAgent(agent.id)}
                disabled={isRunning}
              />
            ))}
          </div>

          {/* Add Agent */}
          {!isRunning && (
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={addBlankAgent}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/12 text-xs text-white/35 hover:border-white/25 hover:text-white/60 transition-colors"
              >
                <Plus size={12} /> Blank Agent
              </button>
              <button
                onClick={() => setShowTemplatePicker((v) => !v)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/12 text-xs text-white/35 hover:border-amber-500/30 hover:text-amber-300/60 transition-colors"
              >
                <Plus size={12} /> From Template
              </button>
            </div>
          )}

          {/* Template picker dropdown */}
          {showTemplatePicker && (
            <div className="mt-2 bg-[#1a1a22] border border-white/10 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              {Array.from(new Set(BUILT_IN_TEMPLATES.map((t) => t.category))).map((cat) => (
                <div key={cat}>
                  <div className="px-3 py-1.5 bg-white/3 text-xs text-white/35 uppercase tracking-wider font-semibold">
                    {cat}
                  </div>
                  {BUILT_IN_TEMPLATES.filter((t) => t.category === cat).map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => addFromTemplate(tpl.id)}
                      className="w-full text-left px-3 py-2 hover:bg-white/6 transition-colors"
                    >
                      <p className="text-xs text-white/70 font-medium">{tpl.name}</p>
                      <p className="text-xs text-white/30 truncate">{tpl.roleDescription}</p>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Run button */}
      <div className="px-4 py-3 border-t border-white/6 shrink-0">
        <button
          onClick={onRun}
          disabled={isRunning || roster.length === 0 || !context.trim()}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isRunning ? (
            <><div className="w-3 h-3 rounded-full border-2 border-amber-300/40 border-t-amber-300 animate-spin" />Running...</>
          ) : (
            <>⚡ Open the Chamber</>
          )}
        </button>
      </div>
    </div>
  )
}

function AgentCard({
  agent, expanded, onToggle, onUpdate, onRemove, disabled,
}: {
  agent: ChamberAgent
  expanded: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<ChamberAgent>) => void
  onRemove: () => void
  disabled: boolean
}) {
  return (
    <div className="border border-white/8 rounded-xl overflow-hidden bg-white/2">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggle} className="flex-1 flex items-center gap-2 text-left min-w-0">
          <span className="text-xs font-medium text-white/70 truncate">{agent.name}</span>
          <span className="text-xs text-white/25 truncate hidden sm:block">{agent.model.modelId}</span>
          {expanded ? <ChevronUp size={12} className="text-white/25 shrink-0 ml-auto" /> : <ChevronDown size={12} className="text-white/25 shrink-0 ml-auto" />}
        </button>
        {!disabled && (
          <button onClick={onRemove} className="text-white/20 hover:text-red-400 transition-colors shrink-0">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-white/6">
          <div className="pt-2.5">
            <label className="text-xs text-white/30 mb-1 block">Name</label>
            <input
              value={agent.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              disabled={disabled}
              className="w-full bg-white/5 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-white/70 outline-none focus:border-white/20"
            />
          </div>
          <div>
            <label className="text-xs text-white/30 mb-1 block">System Prompt</label>
            <textarea
              value={agent.systemPrompt}
              onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
              disabled={disabled}
              rows={4}
              className="w-full bg-white/5 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-white/70 outline-none focus:border-white/20 resize-none leading-relaxed font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-white/30 mb-1 block">Model</label>
            <ModelPicker
              value={agent.model}
              onChange={(m) => onUpdate({ model: m })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
