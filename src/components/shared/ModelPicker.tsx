import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ModelConfig, ModelProvider } from '../../types'
import { ANTHROPIC_MODELS, OPENAI_MODELS, getProviderColor } from '../../lib/defaults'
import { useSettingsStore } from '../../stores/settingsStore'
import { invoke } from '@tauri-apps/api/core'

const CLOUD_PROVIDERS: { id: ModelProvider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
]

export default function ModelPicker({
  value,
  onChange,
}: {
  value: ModelConfig
  onChange: (model: ModelConfig) => void
}) {
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaLoading, setOllamaLoading] = useState(false)
  const [customModel, setCustomModel] = useState('')
  const { providerStatuses, customHosts } = useSettingsStore()

  function handleToggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      // Prefer opening downward; if not enough room, flip upward
      const spaceBelow = window.innerHeight - rect.bottom
      const dropH = Math.min(384, spaceBelow - 8) // max-h-96 = 384px
      if (spaceBelow >= 120) {
        setDropdownStyle({
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          maxHeight: dropH,
          zIndex: 9999,
        })
      } else {
        setDropdownStyle({
          position: 'fixed',
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left,
          width: rect.width,
          maxHeight: Math.min(384, rect.top - 8),
          zIndex: 9999,
        })
      }
    }
    setOpen((o) => !o)
  }

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
  const customHostStatus = value.provider === 'custom'
    ? customHosts.find((h) => 'custom_' + h.id === value.apiKeyRef)
    : undefined
  const currentHasKey = value.provider === 'custom'
    ? (customHostStatus?.hasKey ?? false)
    : (providerStatus?.hasKey ?? value.provider === 'ollama')

  const dropdownContent = (
    <>
      {/* click-away backdrop */}
      <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
      <div
        style={dropdownStyle}
        className="bg-[#1a1a22] border border-white/10 rounded-xl shadow-2xl overflow-hidden overflow-y-auto"
      >
          {/* Cloud providers */}
          {CLOUD_PROVIDERS.map((p) => {
            const models = p.id === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS
            const status = providerStatuses.find((s) => s.provider === p.id)
            return (
              <div key={p.id}>
                <div className="px-3 py-1.5 bg-white/3 flex items-center gap-2 sticky top-0">
                  <ProviderDot provider={p.id} hasKey={status?.hasKey ?? false} />
                  <span className="text-xs text-white/40 uppercase tracking-wider">{p.label}</span>
                  {!status?.hasKey && <span className="text-xs text-amber-400/60 ml-auto">no key</span>}
                </div>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { onChange({ ...value, provider: p.id, modelId: m.id, apiKeyRef: undefined, baseUrl: undefined }); setOpen(false) }}
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
              <span className="text-xs text-white/40 uppercase tracking-wider">Ollama (local)</span>
              {ollamaLoading && <span className="text-xs text-white/30 ml-auto">scanning...</span>}
              {!ollamaLoading && ollamaModels.length === 0 && (
                <span className="text-xs text-amber-400/50 ml-auto">not detected</span>
              )}
              {!ollamaLoading && ollamaModels.length > 0 && (
                <span className="text-xs text-green-400/60 ml-auto">{ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''}</span>
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
              <p className="text-xs font-semibold text-white/25 mb-1.5 uppercase tracking-wider">Custom model name</p>
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

          {/* Custom Connections */}
          {customHosts.map((host) => (
            <div key={host.id}>
              <div className="px-3 py-1.5 bg-white/3 flex items-center gap-2 sticky top-0">
                <ProviderDot provider="custom" hasKey={host.hasKey} />
                <span className="text-xs text-white/40 uppercase tracking-wider">{host.name}</span>
                {!host.hasKey && <span className="text-xs text-amber-400/60 ml-auto">no key</span>}
                {host.hasKey && <span className="text-xs text-purple-400/60 ml-auto">custom</span>}
              </div>
              {host.models.length === 0 && (
                <p className="px-4 py-2 text-xs text-white/25 italic">No models — add them in Settings</p>
              )}
              {host.models.map((modelId) => (
                <button
                  key={modelId}
                  onClick={() => {
                    onChange({ ...value, provider: 'custom', modelId, apiKeyRef: 'custom_' + host.id, baseUrl: host.baseUrl })
                    setOpen(false)
                  }}
                  className={`w-full text-left px-4 py-2 hover:bg-white/6 transition-colors text-sm font-mono ${
                    value.provider === 'custom' && value.modelId === modelId && value.apiKeyRef === 'custom_' + host.id
                      ? 'text-purple-300' : 'text-white/65'
                  }`}
                >
                  {modelId}
                </button>
              ))}
            </div>
          ))}

          {/* Temperature and tokens */}
          <div className="px-3 py-3 border-t border-white/8 space-y-3 bg-white/2">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <label className="text-xs font-semibold text-white/35 w-20">Creativity</label>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={value.temperature}
                  onChange={(e) => onChange({ ...value, temperature: Number(e.target.value) })}
                  className="flex-1 accent-purple-500"
                />
                <span className="text-xs text-white/50 w-6 text-right">{value.temperature}</span>
              </div>
              <p className="text-xs text-white/20 pl-0.5">
                Low = focused & predictable · High = creative & varied
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-white/35 w-20">Max length</label>
              <input
                type="number" value={value.maxTokens} min={256} max={16384}
                onChange={(e) => onChange({ ...value, maxTokens: Number(e.target.value) })}
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 outline-none"
              />
            </div>
          </div>
        </div>
      </>
  )

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="w-full flex items-center gap-2 bg-white/5 border border-white/10 hover:border-white/20 rounded-lg px-3 py-2 text-sm text-white/75 transition-colors text-left"
      >
        <ProviderDot provider={value.provider} hasKey={currentHasKey} />
        <span className="flex-1 truncate">{value.modelId}</span>
        {open ? <ChevronUp size={12} className="text-white/25" /> : <ChevronDown size={12} className="text-white/25" />}
      </button>
      {open && createPortal(dropdownContent, document.body)}
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
