import { useState } from 'react'
import type { ModelConfig, ModelProvider } from '../../types'
import { ANTHROPIC_MODELS, OPENAI_MODELS, OLLAMA_MODELS } from '../../lib/defaults'
import { useSettingsStore } from '../../stores/settingsStore'

const PROVIDERS: { id: ModelProvider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'ollama', label: 'Ollama' },
]

function modelsForProvider(provider: ModelProvider) {
  if (provider === 'anthropic') return ANTHROPIC_MODELS
  if (provider === 'openai') return OPENAI_MODELS
  return OLLAMA_MODELS
}

export default function ModelPicker({
  value,
  onChange,
}: {
  value: ModelConfig
  onChange: (model: ModelConfig) => void
}) {
  const [open, setOpen] = useState(false)
  const { providerStatuses } = useSettingsStore()

  const providerStatus = providerStatuses.find((p) => p.provider === value.provider)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 bg-white/5 border border-white/10 hover:border-white/20 rounded-lg px-3 py-2 text-sm text-white/75 transition-colors text-left"
      >
        <ProviderDot provider={value.provider} hasKey={providerStatus?.hasKey ?? false} />
        <span className="flex-1 truncate">{value.modelId}</span>
        <span className="text-white/25 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a22] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
          {PROVIDERS.map((p) => {
            const models = modelsForProvider(p.id)
            const status = providerStatuses.find((s) => s.provider === p.id)

            return (
              <div key={p.id}>
                <div className="px-3 py-1.5 bg-white/3 flex items-center gap-2">
                  <ProviderDot provider={p.id} hasKey={status?.hasKey ?? false} />
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">{p.label}</span>
                </div>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onChange({ ...value, provider: p.id, modelId: m.id })
                      setOpen(false)
                    }}
                    className={`w-full text-left px-4 py-2 hover:bg-white/6 transition-colors ${
                      value.modelId === m.id && value.provider === p.id
                        ? 'text-purple-300'
                        : 'text-white/65'
                    }`}
                  >
                    <span className="text-sm">{m.name}</span>
                    <span className="ml-2 text-[11px] text-white/30">{m.description}</span>
                  </button>
                ))}
              </div>
            )
          })}

          {/* Temperature and tokens */}
          <div className="px-3 py-3 border-t border-white/5 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-[10px] text-white/35 w-20">Temperature</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={value.temperature}
                onChange={(e) => onChange({ ...value, temperature: Number(e.target.value) })}
                className="flex-1 accent-purple-500"
              />
              <span className="text-[11px] text-white/50 w-6 text-right">{value.temperature}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[10px] text-white/35 w-20">Max tokens</label>
              <input
                type="number"
                value={value.maxTokens}
                min={256}
                max={8192}
                onChange={(e) => onChange({ ...value, maxTokens: Number(e.target.value) })}
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProviderDot({ provider, hasKey }: { provider: ModelProvider; hasKey: boolean }) {
  const colors: Record<ModelProvider, string> = {
    anthropic: '#a78bfa',
    openai: '#34d399',
    ollama: '#fb923c',
    custom: '#60a5fa',
  }
  return (
    <div
      className="w-2 h-2 rounded-full shrink-0"
      style={{ background: hasKey ? colors[provider] : 'rgba(255,255,255,0.15)' }}
    />
  )
}
