import { create } from 'zustand'
import type { ModelConfig } from '../types'
import { DEFAULT_MODEL } from '../lib/defaults'
import * as tauri from '../lib/tauri'

type ProviderStatus = { provider: string; hasKey: boolean }

interface SettingsStore {
  providerStatuses: ProviderStatus[]
  defaultModel: ModelConfig
  ollamaUrl: string
  isOpen: boolean
  defaultProjectsPath: string

  loadProviderStatuses: () => Promise<void>
  loadConfig: () => Promise<void>
  saveApiKey: (provider: string, key: string) => Promise<void>
  deleteApiKey: (provider: string) => Promise<void>
  setDefaultModel: (model: ModelConfig) => void
  setOllamaUrl: (url: string) => void
  setDefaultProjectsPath: (path: string) => Promise<void>
  openSettings: () => void
  closeSettings: () => void
}

const platformDefaultPath =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
    ? 'C:/Users/user/conductor_projects'
    : '~/conductor_projects'

export const useSettingsStore = create<SettingsStore>()((set) => ({
  providerStatuses: [
    { provider: 'anthropic', hasKey: false },
    { provider: 'openai', hasKey: false },
    { provider: 'ollama', hasKey: false },
  ],
  defaultModel: { ...DEFAULT_MODEL },
  ollamaUrl: 'http://localhost:11434',
  isOpen: false,
  defaultProjectsPath: platformDefaultPath,

  loadConfig: async () => {
    const cfg = await tauri.loadConfig()
    if (cfg.defaultProjectsPath) {
      set({ defaultProjectsPath: cfg.defaultProjectsPath })
    }
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

  setDefaultModel: (model) => set({ defaultModel: model }),
  setOllamaUrl: (url) => set({ ollamaUrl: url }),
  openSettings: () => set({ isOpen: true }),
  closeSettings: () => set({ isOpen: false }),
}))
