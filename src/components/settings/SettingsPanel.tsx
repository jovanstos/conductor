import { useState } from 'react'
import { X, FolderOpen, Check, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { open as openFolderDialog } from '@tauri-apps/plugin-dialog'
import { useSettingsStore } from '../../stores/settingsStore'
import { validateApiKey, validateCustomHost } from '../../lib/tauri'
import type { CustomHostConfig } from '../../types'
import { pickHostColor } from '../../lib/defaults'
import { v4 as uuidv4 } from 'uuid'

function ProjectsFolderSettings() {
  const { defaultProjectsPath, setDefaultProjectsPath } = useSettingsStore()
  const [saving, setSaving] = useState(false)

  async function handleBrowse() {
    const selected = await openFolderDialog({ directory: true, multiple: false, title: 'Choose Projects Folder' })
    if (!selected) return
    const path = typeof selected === 'string' ? selected : selected[0]
    if (!path) return
    setSaving(true)
    await setDefaultProjectsPath(path.replace(/\\/g, '/'))
    setSaving(false)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-white/35">
        Where Conductor saves project files. Existing projects in this folder appear in the sidebar.
      </p>
      <div className="bg-white/4 rounded-xl px-4 py-3 flex items-center gap-3">
        <span className="flex-1 text-xs text-white/50 font-mono truncate" title={defaultProjectsPath}>
          {defaultProjectsPath}
        </span>
        <button
          onClick={handleBrowse}
          disabled={saving}
          className="text-xs text-white/40 hover:text-white/70 border border-white/10 px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 shrink-0 flex items-center gap-1.5"
        >
          {saving ? '...' : <><FolderOpen size={12} className="inline mr-1" />Browse</>}
        </button>
      </div>
    </div>
  )
}

export default function SettingsPanel() {
  const { closeSettings, providerStatuses, saveApiKey, deleteApiKey, customHosts } = useSettingsStore()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[560px] max-h-[80vh] bg-[#141418] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white/85">Settings</h2>
          <button
            onClick={closeSettings}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            <X size={16} />
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

          {/* Custom Connections section */}
          <section>
            <h3 className="text-sm font-semibold text-white/70 mb-3">Custom Connections</h3>
            <CustomHostsSettings hosts={customHosts} />
          </section>

          {/* Projects folder */}
          <section>
            <h3 className="text-sm font-semibold text-white/70 mb-3">Default Projects Folder</h3>
            <ProjectsFolderSettings />
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
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

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
    setTestResult(null)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const msg = await validateApiKey(provider)
      setTestResult({ ok: true, msg })
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-white/4 rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full shrink-0 ${hasKey ? 'bg-green-500' : 'bg-white/20'}`} />
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
            {hasKey && (
              <button
                onClick={handleTest}
                disabled={testing}
                className="text-xs text-white/35 hover:text-white/60 border border-white/10 hover:border-white/20 px-3 py-1 rounded-md transition-colors disabled:opacity-40"
              >
                {testing ? 'Testing...' : 'Test'}
              </button>
            )}
            <button
              onClick={() => { setEditing(true); setTestResult(null) }}
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
      {testResult && (
        <p className={`text-xs pl-5 ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
          {testResult.ok ? <Check size={11} className="inline mr-1" /> : <X size={11} className="inline mr-1" />}{testResult.msg}
        </p>
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
        <label className="text-xs text-white/40 uppercase tracking-wider w-20">Base URL</label>
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

type CustomHostEntry = CustomHostConfig & { hasKey: boolean }

function CustomHostsSettings({ hosts }: { hosts: CustomHostEntry[] }) {
  const { saveCustomHost } = useSettingsStore()
  const [showForm, setShowForm] = useState(false)
  const [editingHost, setEditingHost] = useState<CustomHostConfig | null>(null)

  function startEdit(host: CustomHostConfig) {
    setEditingHost({ ...host })
    setShowForm(true)
  }

  function startAdd() {
    setEditingHost(null)
    setShowForm(true)
  }

  async function handleSave(host: CustomHostConfig) {
    await saveCustomHost(host)
    setShowForm(false)
    setEditingHost(null)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/35">
        Connect to any OpenAI-compatible API endpoint — DeepSeek, Groq, Together AI, OpenRouter, LiteLLM, and more.
      </p>
      {hosts.map((host) => (
        <CustomHostRow key={host.id} host={host} onEdit={() => startEdit(host)} />
      ))}
      {showForm ? (
        <CustomHostForm
          initial={editingHost}
          hostsCount={hosts.length}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingHost(null) }}
        />
      ) : (
        <button
          onClick={startAdd}
          className="flex items-center gap-1.5 text-xs text-purple-400/70 hover:text-purple-400 border border-purple-500/20 hover:border-purple-500/40 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={12} />
          Add connection
        </button>
      )}
    </div>
  )
}

function CustomHostRow({ host, onEdit }: { host: CustomHostEntry; onEdit: () => void }) {
  const { deleteCustomHost, saveCustomHostKey, deleteCustomHostKey } = useSettingsStore()
  const [expanded, setExpanded] = useState(false)
  const [editingKey, setEditingKey] = useState(false)
  const [keyValue, setKeyValue] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSaveKey() {
    if (!keyValue.trim()) return
    setSavingKey(true)
    await saveCustomHostKey(host.id, keyValue.trim())
    setSavingKey(false)
    setKeyValue('')
    setEditingKey(false)
    setTestResult(null)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const msg = await validateCustomHost(host.id, host.baseUrl)
      setTestResult({ ok: true, msg })
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-white/4 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full shrink-0 ${host.hasKey ? 'bg-purple-500' : 'bg-white/20'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/75 font-medium truncate">{host.name}</p>
          <p className="text-xs text-white/35 font-mono truncate">{host.baseUrl}</p>
        </div>
        <span className="text-xs text-white/25 shrink-0">
          {host.models.length} model{host.models.length !== 1 ? 's' : ''}
        </span>
        <button onClick={onEdit} className="text-xs text-white/35 hover:text-white/60 border border-white/10 px-2 py-1 rounded-md transition-colors">
          Edit
        </button>
        <button onClick={() => deleteCustomHost(host.id)} className="text-red-400/50 hover:text-red-400 transition-colors">
          <Trash2 size={13} />
        </button>
        <button onClick={() => setExpanded((v) => !v)} className="text-white/30 hover:text-white/60">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/6 px-4 py-3 space-y-2">
          {/* Key management */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 w-16">API Key</span>
            {editingKey ? (
              <>
                <input
                  type="password"
                  autoFocus
                  placeholder="Paste API key..."
                  className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white/80 outline-none focus:border-purple-500/50"
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                />
                <button
                  onClick={handleSaveKey}
                  disabled={savingKey || !keyValue.trim()}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-md transition-colors"
                >
                  {savingKey ? '...' : 'Save'}
                </button>
                <button onClick={() => setEditingKey(false)} className="text-white/30 hover:text-white/60 text-xs">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-xs text-white/30">
                  {host.hasKey ? '••••••••••••••••' : 'Not configured'}
                </span>
                {host.hasKey && (
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className="text-xs text-white/35 hover:text-white/60 border border-white/10 hover:border-white/20 px-3 py-1 rounded-md transition-colors disabled:opacity-40"
                  >
                    {testing ? 'Testing...' : 'Test'}
                  </button>
                )}
                <button
                  onClick={() => { setEditingKey(true); setTestResult(null) }}
                  className="text-xs text-white/40 hover:text-white/70 border border-white/10 px-3 py-1 rounded-md transition-colors"
                >
                  {host.hasKey ? 'Update' : 'Add key'}
                </button>
                {host.hasKey && (
                  <button onClick={() => deleteCustomHostKey(host.id)} className="text-xs text-red-400/60 hover:text-red-400 transition-colors">
                    Remove
                  </button>
                )}
              </>
            )}
          </div>
          {testResult && (
            <p className={`text-xs pl-0 ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.ok ? <Check size={11} className="inline mr-1" /> : <X size={11} className="inline mr-1" />}{testResult.msg}
            </p>
          )}
          {/* Model list */}
          {host.models.length > 0 && (
            <div className="pt-1">
              <p className="text-xs text-white/30 mb-1">Models</p>
              <div className="flex flex-wrap gap-1">
                {host.models.map((m) => (
                  <span key={m} className="text-xs bg-white/6 text-white/50 font-mono px-2 py-0.5 rounded">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CustomHostForm({
  initial,
  hostsCount,
  onSave,
  onCancel,
}: {
  initial: CustomHostConfig | null
  hostsCount: number
  onSave: (host: CustomHostConfig) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '')
  const [modelsText, setModelsText] = useState(initial?.models.join('\n') ?? '')
  const [color, setColor] = useState(initial?.color ?? pickHostColor(hostsCount))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim() || !baseUrl.trim()) return
    setSaving(true)
    const models = modelsText.split(/[\n,]/).map((m) => m.trim()).filter(Boolean)
    await onSave({
      id: initial?.id ?? uuidv4(),
      name: name.trim(),
      baseUrl: baseUrl.trim().replace(/\/$/, ''),
      models,
      color,
    })
    setSaving(false)
  }

  return (
    <div className="bg-white/4 rounded-xl px-4 py-4 space-y-3 border border-purple-500/20">
      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">
        {initial ? 'Edit connection' : 'New connection'}
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <label className="text-xs text-white/40 w-20">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. DeepSeek"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/80 outline-none focus:border-purple-500/50"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-white/40 w-20">Base URL</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.deepseek.com"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/80 font-mono outline-none focus:border-purple-500/50"
          />
        </div>
        <div className="flex gap-3">
          <label className="text-xs text-white/40 w-20 pt-1.5">Models</label>
          <div className="flex-1">
            <textarea
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              placeholder={'deepseek-chat\ndeepseek-reasoner'}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/80 font-mono outline-none focus:border-purple-500/50 resize-none"
            />
            <p className="text-xs text-white/25 mt-1">One model ID per line (or comma-separated)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-white/40 w-20">Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-xs text-white/30 font-mono">{color}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !baseUrl.trim()}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs px-4 py-1.5 rounded-md transition-colors"
        >
          {saving ? '...' : 'Save'}
        </button>
        <button onClick={onCancel} className="text-xs text-white/35 hover:text-white/60 border border-white/10 px-3 py-1.5 rounded-md transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
