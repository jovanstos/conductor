import { create } from 'zustand'
import type { ModelConfig, CustomHostConfig } from '../types'
import { DEFAULT_MODEL } from '../lib/defaults'
import * as tauri from '../lib/tauri'

type ProviderStatus = { provider: string; hasKey: boolean }
export type CustomHostEntry = CustomHostConfig & { hasKey: boolean }
export type AppTheme = 'dark' | 'light'

interface SettingsStore {
  providerStatuses: ProviderStatus[]
  defaultModel: ModelConfig
  ollamaUrl: string
  isOpen: boolean
  defaultProjectsPath: string
  customHosts: CustomHostEntry[]
  theme: AppTheme

  loadProviderStatuses: () => Promise<void>
  loadConfig: () => Promise<void>
  saveApiKey: (provider: string, key: string) => Promise<void>
  deleteApiKey: (provider: string) => Promise<void>
  setDefaultModel: (model: ModelConfig) => void
  setOllamaUrl: (url: string) => void
  setDefaultProjectsPath: (path: string) => Promise<void>
  openSettings: () => void
  closeSettings: () => void
  loadCustomHosts: () => Promise<void>
  saveCustomHost: (host: CustomHostConfig) => Promise<void>
  deleteCustomHost: (id: string) => Promise<void>
  saveCustomHostKey: (hostId: string, key: string) => Promise<void>
  deleteCustomHostKey: (hostId: string) => Promise<void>
  setTheme: (theme: AppTheme) => void
}

const platformDefaultPath =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
    ? 'C:/Users/user/conductor_projects'
    : '~/conductor_projects'

function loadStoredModel(): ModelConfig {
  try {
    const raw = localStorage.getItem('conductor_defaultModel')
    return raw ? (JSON.parse(raw) as ModelConfig) : { ...DEFAULT_MODEL }
  } catch {
    return { ...DEFAULT_MODEL }
  }
}

function loadStoredTheme(): AppTheme {
  try {
    const raw = localStorage.getItem('conductor_theme')
    return raw === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  providerStatuses: [
    { provider: 'anthropic', hasKey: false },
    { provider: 'openai', hasKey: false },
    { provider: 'ollama', hasKey: false },
  ],
  defaultModel: loadStoredModel(),
  theme: loadStoredTheme(),
  ollamaUrl: 'http://localhost:11434',
  isOpen: false,
  defaultProjectsPath: platformDefaultPath,
  customHosts: [],

  loadConfig: async () => {
    const cfg = await tauri.loadConfig()
    if (cfg.defaultProjectsPath) {
      set({ defaultProjectsPath: cfg.defaultProjectsPath })
    }
    await get().loadCustomHosts()
  },

  setDefaultProjectsPath: async (path: string) => {
    set({ defaultProjectsPath: path })
    const current = await tauri.loadConfig().catch(() => ({}))
    await tauri.saveConfig({ ...current, defaultProjectsPath: path })
  },

  loadProviderStatuses: async () => {
    const [anthropic, openai] = await Promise.all([
      tauri.hasApiKey('anthropic'),
      tauri.hasApiKey('openai'),
    ])
    set({
      providerStatuses: [
        { provider: 'anthropic', hasKey: anthropic },
        { provider: 'openai', hasKey: openai },
        { provider: 'ollama', hasKey: true }, // Ollama needs no key
      ],
    })
  },

  saveApiKey: async (provider, key) => {
    await tauri.saveApiKey(provider, key)
    set((s) => ({
      providerStatuses: s.providerStatuses.map((p) =>
        p.provider === provider ? { ...p, hasKey: true } : p,
      ),
    }))
  },

  deleteApiKey: async (provider) => {
    await tauri.deleteApiKey(provider)
    set((s) => ({
      providerStatuses: s.providerStatuses.map((p) =>
        p.provider === provider ? { ...p, hasKey: false } : p,
      ),
    }))
  },

  loadCustomHosts: async () => {
    const cfg = await tauri.loadConfig().catch(() => ({} as tauri.AppConfig))
    const hosts = cfg.customHosts ?? []
    const hostsWithKeys = await Promise.all(
      hosts.map(async (h) => ({
        ...h,
        hasKey: await tauri.hasApiKey('custom_' + h.id),
      }))
    )
    set({ customHosts: hostsWithKeys })
  },

  saveCustomHost: async (host) => {
    const cfg = await tauri.loadConfig().catch(() => ({} as tauri.AppConfig))
    const existing = cfg.customHosts ?? []
    const idx = existing.findIndex((h) => h.id === host.id)
    if (idx >= 0) {
      existing[idx] = host
    } else {
      existing.push(host)
    }
    await tauri.saveConfig({ ...cfg, customHosts: existing })
    const hostsWithKeys = await Promise.all(
      existing.map(async (h) => ({
        ...h,
        hasKey: await tauri.hasApiKey('custom_' + h.id),
      }))
    )
    set({ customHosts: hostsWithKeys })
  },

  deleteCustomHost: async (id) => {
    const cfg = await tauri.loadConfig().catch(() => ({} as tauri.AppConfig))
    const filtered = (cfg.customHosts ?? []).filter((h) => h.id !== id)
    await tauri.saveConfig({ ...cfg, customHosts: filtered })
    await tauri.deleteApiKey('custom_' + id).catch(() => {})
    set((s) => ({ customHosts: s.customHosts.filter((h) => h.id !== id) }))
  },

  saveCustomHostKey: async (hostId, key) => {
    await tauri.saveApiKey('custom_' + hostId, key)
    set((s) => ({
      customHosts: s.customHosts.map((h) =>
        h.id === hostId ? { ...h, hasKey: true } : h,
      ),
    }))
  },

  deleteCustomHostKey: async (hostId) => {
    await tauri.deleteApiKey('custom_' + hostId)
    set((s) => ({
      customHosts: s.customHosts.map((h) =>
        h.id === hostId ? { ...h, hasKey: false } : h,
      ),
    }))
  },

  setDefaultModel: (model) => {
    try { localStorage.setItem('conductor_defaultModel', JSON.stringify(model)) } catch { /* ignore */ }
    set({ defaultModel: model })
  },

  setTheme: (theme) => {
    try { localStorage.setItem('conductor_theme', theme) } catch { /* ignore */ }
    document.documentElement.classList.remove('dark', 'light')
    document.documentElement.classList.add(theme)
    set({ theme })
  },
  setOllamaUrl: (url) => set({ ollamaUrl: url }),
  openSettings: () => set({ isOpen: true }),
  closeSettings: () => set({ isOpen: false }),
}))
