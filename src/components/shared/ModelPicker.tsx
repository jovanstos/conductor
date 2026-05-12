import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Zap } from 'lucide-react'
import type { ModelConfig, ModelProvider, OllamaModelInfo } from '../../types'
import { ANTHROPIC_MODELS, OPENAI_MODELS, getProviderColor } from '../../lib/defaults'
import { useSettingsStore } from '../../stores/settingsStore'
import { invoke } from '@tauri-apps/api/core'
import { getOllamaModelInfo } from '../../lib/tauri'

const CLOUD_PROVIDERS: { id: ModelProvider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
]

// Auto-enable simple tool format for models < 8B (they reliably can't do native function calling)
const AUTO_ENABLE_THRESHOLD_B = 8

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
  const [ollamaInfo, setOllamaInfo] = useState<OllamaModelInfo | null>(null)
  const [customModel, setCustomModel] = useState('')
  const { providerStatuses, customHosts } = useSettingsStore()

  // Fetch Ollama model info whenever the selected Ollama model changes
  useEffect(() => {
    if (value.provider !== 'ollama' || !value.modelId) {
      setOllamaInfo(null)
      return
    }
    const base = value.baseUrl ?? 'http://localhost:11434'
    getOllamaModelInfo(value.modelId, base)
      .then((info) => setOllamaInfo(info))
      .catch(() => setOllamaInfo(null))
  }, [value.provider, value.modelId, value.baseUrl])

  function handleToggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const dropH = Math.min(420, spaceBelow - 8)
      if (spaceBelow >= 120) {
        setDropdownStyle({ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight: dropH, zIndex: 9999 })
      } else {
        setDropdownStyle({ position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width, maxHeight: Math.min(420, rect.top - 8), zIndex: 9999 })
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

  function handleOllamaModelSelect(name: string) {
    // We don't have size info for the NEW model yet (effect fires after onChange),
    // so we optimistically select and let the effect update simpleToolFormat if needed.
    onChange({ ...value, provider: 'ollama', modelId: name })
    setOpen(false)
  }

  // When Ollama info loads, auto-enable simple format for very small models
  useEffect(() => {
    if (value.provider !== 'ollama' || !ollamaInfo) return
    const size = ollamaInfo.parameterBillions
    if (size !== null && size < AUTO_ENABLE_THRESHOLD_B && !value.simpleToolFormat) {
      onChange({ ...value, simpleToolFormat: true })
    }
  }, [ollamaInfo])

  const providerStatus = providerStatuses.find((p) => p.provider === value.provider)
  const customHostStatus = value.provider === 'custom'
    ? customHosts.find((h) => 'custom_' + h.id === value.apiKeyRef)
    : undefined
  const currentHasKey = value.provider === 'custom'
    ? (customHostStatus?.hasKey ?? false)
    : (providerStatus?.hasKey ?? value.provider === 'ollama')

  // Size hint text for the toggle
  const sizeHint = (() => {
    if (value.provider !== 'ollama' || !ollamaInfo?.parameterBillions) return null
    const b = ollamaInfo.parameterBillions
    if (b < AUTO_ENABLE_THRESHOLD_B) return { text: `${b}B — auto-enabled (small model)`, color: 'var(--c-amber)' }
    if (b < 14) return { text: `${b}B — recommended for this size`, color: 'var(--c-amber)' }
    return { text: `${b}B — optional, model may support native calling`, color: 'var(--c-text-3)' }
  })()

  const dropdownContent = (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
      <div
        style={{ ...dropdownStyle, background: 'var(--c-elevated)', border: '1px solid var(--c-border)', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        className="overflow-hidden overflow-y-auto"
      >
        {/* Cloud providers */}
        {CLOUD_PROVIDERS.map((p) => {
          const models = p.id === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS
          const status = providerStatuses.find((s) => s.provider === p.id)
          return (
            <div key={p.id}>
              <div className="px-3 py-2 flex items-center gap-2 sticky top-0" style={{ background: 'var(--c-surface)' }}>
                <ProviderDot provider={p.id} hasKey={status?.hasKey ?? false} />
                <span className="text-xs text-white/40 uppercase tracking-wider">{p.label}</span>
                {!status?.hasKey && <span className="text-xs text-amber-400/60 ml-auto">no key</span>}
              </div>
              {models.map((m) => (
                <button key={m.id}
                  onClick={() => { onChange({ ...value, provider: p.id, modelId: m.id, apiKeyRef: undefined, baseUrl: undefined, simpleToolFormat: false }); setOpen(false) }}
                  className="w-full text-left px-4 py-2.5 transition-colors text-sm"
                  style={{ color: value.modelId === m.id && value.provider === p.id ? 'var(--c-accent)' : 'var(--c-text-2)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-card)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )
        })}

        {/* Ollama */}
        <div>
          <div className="px-3 py-2 flex items-center gap-2 sticky top-0" style={{ background: 'var(--c-surface)' }}>
            <ProviderDot provider="ollama" hasKey={ollamaModels.length > 0} />
            <span className="text-xs text-white/40 uppercase tracking-wider">Ollama (local)</span>
            {ollamaLoading && <span className="text-xs text-white/30 ml-auto">scanning…</span>}
            {!ollamaLoading && ollamaModels.length === 0 && <span className="text-xs text-amber-400/50 ml-auto">not detected</span>}
            {!ollamaLoading && ollamaModels.length > 0 && <span className="text-xs text-green-400/60 ml-auto">{ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''}</span>}
          </div>
          {ollamaModels.map((name) => (
            <button key={name}
              onClick={() => handleOllamaModelSelect(name)}
              className={`w-full text-left px-4 py-2.5 hover:bg-white/6 transition-colors text-sm font-mono ${
                value.modelId === name && value.provider === 'ollama' ? 'text-orange-300' : 'text-white/65'
              }`}
            >
              {name}
            </button>
          ))}
          {/* Custom model input */}
          <div className="px-3 py-3 border-t border-white/5">
            <p className="text-sm font-semibold text-white/25 mb-2 uppercase tracking-wider">Custom model name</p>
            <div className="flex gap-2">
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
                className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white/70 outline-none focus:border-orange-500/40 placeholder:text-white/20 font-mono"
              />
              <button
                onClick={() => {
                  if (!customModel.trim()) return
                  onChange({ ...value, provider: 'ollama', modelId: customModel.trim() })
                  setCustomModel('')
                  setOpen(false)
                }}
                className="text-sm bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/20 px-3 py-1.5 rounded transition-colors"
              >
                Use
              </button>
            </div>
          </div>
        </div>

        {/* Custom Connections */}
        {customHosts.map((host) => (
          <div key={host.id}>
            <div className="px-3 py-2 flex items-center gap-2 sticky top-0" style={{ background: 'var(--c-surface)' }}>
              <ProviderDot provider="custom" hasKey={host.hasKey} />
              <span className="text-xs text-white/40 uppercase tracking-wider">{host.name}</span>
              {!host.hasKey && <span className="text-xs text-amber-400/60 ml-auto">no key</span>}
              {host.hasKey && <span className="text-xs text-purple-400/60 ml-auto">custom</span>}
            </div>
            {host.models.length === 0 && (
              <p className="px-4 py-2.5 text-sm text-white/25 italic">No models — add them in Settings</p>
            )}
            {host.models.map((modelId) => (
              <button key={modelId}
                onClick={() => { onChange({ ...value, provider: 'custom', modelId, apiKeyRef: 'custom_' + host.id, baseUrl: host.baseUrl }); setOpen(false) }}
                className={`w-full text-left px-4 py-2.5 hover:bg-white/6 transition-colors text-sm font-mono ${
                  value.provider === 'custom' && value.modelId === modelId && value.apiKeyRef === 'custom_' + host.id
                    ? 'text-purple-300' : 'text-white/65'
                }`}
              >
                {modelId}
              </button>
            ))}
          </div>
        ))}

        {/* Settings: temperature, tokens, simple tool format */}
        <div className="px-4 py-4 border-t border-white/8 space-y-4 bg-white/2">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <label className="text-sm font-semibold text-white/35 w-20">Creativity</label>
              <input type="range" min={0} max={1} step={0.05} value={value.temperature}
                onChange={(e) => onChange({ ...value, temperature: Number(e.target.value) })}
                className="flex-1 accent-purple-500" />
              <span className="text-sm text-white/50 w-6 text-right">{value.temperature}</span>
            </div>
            <p className="text-xs text-white/20 pl-0.5">Low = focused & predictable · High = creative & varied</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-white/35 w-20">Max length</label>
            <input type="number" value={value.maxTokens} min={256} max={16384}
              onChange={(e) => onChange({ ...value, maxTokens: Number(e.target.value) })}
              className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white/70 outline-none" />
          </div>

          {/* Simple tool format toggle */}
          <div className="pt-1 border-t border-white/5">
            <div className="flex items-center gap-3">
              <Zap size={13} style={{ color: value.simpleToolFormat ? 'var(--c-amber)' : 'var(--c-text-dim)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: value.simpleToolFormat ? 'var(--c-amber)' : 'var(--c-text-2)' }}>
                  Simple tool format
                </p>
                {sizeHint ? (
                  <p className="text-xs mt-0.5 truncate" style={{ color: sizeHint.color }}>{sizeHint.text}</p>
                ) : (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-dim)' }}>
                    {value.provider === 'ollama' || value.provider === 'custom'
                      ? 'Use for local models that struggle with native tool calling'
                      : 'Not needed for API models (Anthropic/OpenAI support native tools)'}
                  </p>
                )}
              </div>
              <button
                onClick={() => onChange({ ...value, simpleToolFormat: !value.simpleToolFormat })}
                className="relative shrink-0 w-10 h-5 rounded-full transition-all"
                style={{
                  background: value.simpleToolFormat ? 'rgba(245,158,11,0.3)' : 'var(--c-elevated)',
                  border: `1px solid ${value.simpleToolFormat ? 'rgba(245,158,11,0.5)' : 'var(--c-border)'}`,
                }}
              >
                <span
                  className="absolute top-0.5 rounded-full transition-all"
                  style={{
                    width: '14px', height: '14px',
                    background: value.simpleToolFormat ? 'var(--c-amber)' : 'var(--c-text-3)',
                    left: value.simpleToolFormat ? 'calc(100% - 16px)' : '2px',
                  }}
                />
              </button>
            </div>
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
        className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors text-left"
        style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', color: 'var(--c-text-1)' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-accent-border)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)' }}
      >
        <ProviderDot provider={value.provider} hasKey={currentHasKey} />
        <span className="flex-1 truncate">{value.modelId}</span>
        {value.simpleToolFormat && (
          <Zap size={12} style={{ color: 'var(--c-amber)', flexShrink: 0 }} />
        )}
        {open ? <ChevronUp size={14} className="text-white/25" /> : <ChevronDown size={14} className="text-white/25" />}
      </button>
      {open && createPortal(dropdownContent, document.body)}
    </div>
  )
}

function ProviderDot({ provider, hasKey }: { provider: ModelProvider; hasKey: boolean }) {
  const color = hasKey ? getProviderColor(provider) : 'var(--c-text-dim)'
  return (
    <div className="w-3 h-3 rounded-full shrink-0"
      style={{ background: color, boxShadow: hasKey ? `0 0 8px ${color}88` : 'none' }} />
  )
}
