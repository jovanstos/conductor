import { useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'

export default function SettingsPanel() {
  const { closeSettings, providerStatuses, saveApiKey, deleteApiKey } = useSettingsStore()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[560px] max-h-[80vh] bg-[#141418] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white/85">Settings</h2>
          <button
            onClick={closeSettings}
            className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* API Keys section */}
          <section>
            <h3 className="text-sm font-semibold text-white/70 mb-3">API Keys</h3>
            <p className="text-xs text-white/35 mb-4">
              Keys are stored locally and never sent anywhere except the respective provider.
            </p>
            <div className="space-y-3">
              {providerStatuses
                .filter((p) => p.provider !== 'ollama')
                .map((p) => (
                  <ApiKeyRow
                    key={p.provider}
                    provider={p.provider}
                    hasKey={p.hasKey}
                    onSave={(key) => saveApiKey(p.provider, key)}
                    onDelete={() => deleteApiKey(p.provider)}
                  />
                ))}
            </div>
          </section>

          {/* Ollama section */}
          <section>
            <h3 className="text-sm font-semibold text-white/70 mb-3">Ollama (Local)</h3>
            <OllamaSettings />
          </section>
        </div>

        <div className="px-6 py-4 border-t border-white/8">
          <button
            onClick={closeSettings}
            className="bg-purple-600 hover:bg-purple-500 text-white text-sm px-5 py-2 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function ApiKeyRow({
  provider,
  hasKey,
  onSave,
  onDelete,
}: {
  provider: string
  hasKey: boolean
  onSave: (key: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const providerLabel: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
  }

  async function handleSave() {
    if (!value.trim()) return
    setSaving(true)
    await onSave(value.trim())
    setSaving(false)
    setValue('')
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-3 bg-white/4 rounded-xl px-4 py-3">
      <div className={`w-2 h-2 rounded-full ${hasKey ? 'bg-green-500' : 'bg-white/20'}`} />
      <span className="text-sm text-white/70 w-24">{providerLabel[provider] ?? provider}</span>

      {editing ? (
        <>
          <input
            type="password"
            autoFocus
            placeholder="Paste API key..."
            className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white/80 outline-none focus:border-purple-500/50"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-md transition-colors"
          >
            {saving ? '...' : 'Save'}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-white/30 hover:text-white/60 text-xs"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-xs text-white/30">
            {hasKey ? '••••••••••••••••' : 'Not configured'}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-white/40 hover:text-white/70 border border-white/10 px-3 py-1 rounded-md transition-colors"
          >
            {hasKey ? 'Update' : 'Add key'}
          </button>
          {hasKey && (
            <button
              onClick={onDelete}
              className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          )}
        </>
      )}
    </div>
  )
}

function OllamaSettings() {
  const { ollamaUrl, setOllamaUrl } = useSettingsStore()
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/35">
        Ollama runs locally. Make sure it's running before using local models.
      </p>
      <div className="flex items-center gap-3">
        <label className="text-[10px] text-white/40 uppercase tracking-wider w-20">Base URL</label>
        <input
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/75 outline-none focus:border-purple-500/50"
          value={ollamaUrl}
          onChange={(e) => setOllamaUrl(e.target.value)}
          placeholder="http://localhost:11434"
        />
      </div>
    </div>
  )
}
