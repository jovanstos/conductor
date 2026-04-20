import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ModelConfig, ModelProvider } from '../../types'
import { ANTHROPIC_MODELS, OPENAI_MODELS, getProviderColor } from '../../lib/defaults'
import { useSettingsStore } from '../../stores/settingsStore'
import { invoke } from '@tauri-apps/api/core'

const PROVIDERS: { id: ModelProvider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'ollama', label: 'Ollama (local)' },
]

export default function ModelPicker({
  value,
  onChange,
}: {
  value: ModelConfig
  onChange: (model: ModelConfig) => void
}) {
  const [open, setOpen] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaLoading, setOllamaLoading] = useState(false)
  const [customModel, setCustomModel] = useState('')
  const { providerStatuses } = useSettingsStore()

  useEffect(() => {
    if (!open) return
    setOllamaLoading(true)
    const base = value.provider === 'ollama' ? (value.baseUrl ?? 'http://localhost:11434') : 'http://localhost:11434'
    invoke<string[]>('get_ollama_models', { baseUrl: base })
      .then((models) => setOllamaModels(models))
      .catch(() => setOllamaModels([]))
      .finally(() => setOllamaLoading(false))
  }, [open])

  const providerStatus = providerStatuses.find((p) => p.provider === value.provider)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 bg-white/5 border border-white/10 hover:border-white/20 rounded-lg px-3 py-2 text-sm text-white/75 transition-colors text-left"
      >
        <ProviderDot provider={value.provider} hasKey={providerStatus?.hasKey ?? value.provider === 'ollama'} />
        <span className="flex-1 truncate">{value.modelId}</span>
        {open ? <ChevronUp size={12} className="text-white/25" /> : <ChevronDown size={12} className="text-white/25" />}
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a22] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden max-h-96 overflow-y-auto">
          {/* Cloud providers */}
          {PROVIDERS.filter(p => p.id !== 'ollama').map((p) => {
            const models = p.id === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS
            const status = providerStatuses.find((s) => s.provider === p.id)
            return (
              <div key={p.id}>
                <div className="px-3 py-1.5 bg-white/3 flex items-center gap-2 sticky top-0">
                  <ProviderDot provider={p.id} hasKey={status?.hasKey ?? false} />
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">{p.label}</span>
                  {!status?.hasKey && <span className="text-[9px] text-amber-400/60 ml-auto">no key</span>}
                </div>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { onChange({ ...value, provider: p.id, modelId: m.id }); setOpen(false) }}
                    className={`w-full text-left px-4 py-2 hover:bg-white/6 transition-colors text-sm ${
                      value.modelId === m.id && value.provider === p.id ? 'text-purple-300' : 'text-white/65'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )
          })}

          {/* Ollama */}
          <div>
            <div className="px-3 py-1.5 bg-white/3 flex items-center gap-2 sticky top-0">
              <ProviderDot provider="ollama" hasKey={ollamaModels.length > 0} />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Ollama (local)</span>
              {ollamaLoading && <span className="text-[9px] text-white/30 ml-auto">scanning...</span>}
              {!ollamaLoading && ollamaModels.length === 0 && (
                <span className="text-[9px] text-amber-400/50 ml-auto">not detected</span>
              )}
              {!ollamaLoading && ollamaModels.length > 0 && (
                <span className="text-[9px] text-green-400/60 ml-auto">{ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            {ollamaModels.map((name) => (
              <button
                key={name}
                onClick={() => { onChange({ ...value, provider: 'ollama', modelId: name }); setOpen(false) }}
                className={`w-full text-left px-4 py-2 hover:bg-white/6 transition-colors text-sm font-mono ${
                  value.modelId === name && value.provider === 'ollama' ? 'text-orange-300' : 'text-white/65'
                }`}
              >
                {name}
              </button>
            ))}
            {/* Custom model input */}
            <div className="px-3 py-2 border-t border-white/5">
              <p className="text-[9px] text-white/25 mb-1.5 uppercase tracking-wider">Custom model name</p>
              <div className="flex gap-1.5">
                <input
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customModel.trim()) {
                      onChange({ ...value, provider: 'ollama', modelId: customModel.trim() })
                      setCustomModel('')
                      setOpen(false)
                    }
                  }}
                  placeholder="e.g. gemma3:4b"
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 outline-none focus:border-orange-500/40 placeholder:text-white/20 font-mono"
                />
                <button
                  onClick={() => {
                    if (!customModel.trim()) return
                    onChange({ ...value, provider: 'ollama', modelId: customModel.trim() })
                    setCustomModel('')
                    setOpen(false)
                  }}
                  className="text-xs bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/20 px-2 py-1 rounded transition-colors"
                >
                  Use
                </button>
              </div>
            </div>
          </div>

          {/* Temperature and tokens */}
          <div className="px-3 py-3 border-t border-white/8 space-y-3 bg-white/2">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <label className="text-[10px] text-white/35 w-20">Creativity</label>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={value.temperature}
                  onChange={(e) => onChange({ ...value, temperature: Number(e.target.value) })}
                  className="flex-1 accent-purple-500"
                />
                <span className="text-[11px] text-white/50 w-6 text-right">{value.temperature}</span>
              </div>
              <p className="text-[9px] text-white/20 pl-0.5">
                Low = focused & predictable · High = creative & varied
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[10px] text-white/35 w-20">Max length</label>
              <input
                type="number" value={value.maxTokens} min={256} max={16384}
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
  return (
    <div
      className="w-2 h-2 rounded-full shrink-0"
      style={{ background: hasKey ? getProviderColor(provider) : 'rgba(255,255,255,0.15)' }}
    />
  )
}
