import { create } from 'zustand'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { v4 as uuidv4 } from 'uuid'
import type { ModelConfig, StudioMessage, StudioSessionState, StudioChunkPayload } from '../types'
import { DEFAULT_MODEL } from '../lib/defaults'

const FINAL_MARKER = '[STUDIO_FINAL_DOCUMENT]'

const WRAP_UP_COMMAND =
  `[SYSTEM COMMAND: The user has indicated the brainstorming session is complete. ` +
  `Stop asking questions. Review the entire conversation and generate a comprehensive, ` +
  `highly detailed final plan/document. Begin your response with exactly: ` +
  `${FINAL_MARKER} — then write the full document in beautiful, structured Markdown. ` +
  `Be thorough, specific, and immediately actionable.]`

interface StudioStore {
  messages: StudioMessage[]
  model: ModelConfig
  sessionState: StudioSessionState
  finalDocument: string
  isStreaming: boolean
  streamingText: string
  error: string | null

  sendMessage: (content: string) => Promise<void>
  generateFinalDocument: () => Promise<void>
  newSession: () => void
  setModel: (model: ModelConfig) => void

  _sessionId: string
  _unlisten: UnlistenFn | null
  _attachChunkListener: (sessionId: string) => Promise<void>
  _detachListeners: () => void
}

export const useStudioStore = create<StudioStore>()((set, get) => ({
  messages: [],
  model: { ...DEFAULT_MODEL },
  sessionState: 'idle',
  finalDocument: '',
  isStreaming: false,
  streamingText: '',
  error: null,
  _sessionId: uuidv4(),
  _unlisten: null,

  setModel: (model) => set({ model }),

  newSession: () => {
    get()._detachListeners()
    set({
      messages: [],
      sessionState: 'idle',
      finalDocument: '',
      isStreaming: false,
      streamingText: '',
      error: null,
      _sessionId: uuidv4(),
    })
  },

  _attachChunkListener: async (sessionId: string) => {
    const unlisten = await listen<StudioChunkPayload>(
      `conductor://studio/${sessionId}/chunk`,
      (e) => set((s) => ({ streamingText: s.streamingText + e.payload.chunk })),
    )
    set({ _unlisten: unlisten })
  },

  _detachListeners: () => {
    const { _unlisten } = get()
    if (_unlisten) {
      _unlisten()
      set({ _unlisten: null })
    }
  },

  sendMessage: async (content: string) => {
    const { model, messages, _sessionId, sessionState, isStreaming } = get()
    if (isStreaming) return

    const userMsg: StudioMessage = { id: uuidv4(), role: 'user', content }
    const newMessages = [...messages, userMsg]

    set({
      messages: newMessages,
      isStreaming: true,
      streamingText: '',
      error: null,
      sessionState: sessionState === 'idle' ? 'brainstorming' : sessionState,
    })

    await get()._attachChunkListener(_sessionId)

    try {
      const llmMessages = newMessages.map((m) => ({ role: m.role, content: m.content }))
      const fullText = await invoke<string>('studio_chat_turn', {
        sessionId: _sessionId,
        messages: llmMessages,
        model,
      })

      const isFinalDoc = fullText.trimStart().startsWith(FINAL_MARKER)

      if (isFinalDoc) {
        const doc = fullText.trimStart().slice(FINAL_MARKER.length).trim()
        const noticeMsg: StudioMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: "I have everything I need to create your plan. Generating your document now...",
        }
        set({
          messages: [...newMessages, noticeMsg],
          finalDocument: doc,
          sessionState: 'finished',
          isStreaming: false,
          streamingText: '',
        })
      } else {
        const assistantMsg: StudioMessage = { id: uuidv4(), role: 'assistant', content: fullText }
        set({
          messages: [...newMessages, assistantMsg],
          isStreaming: false,
          streamingText: '',
        })
      }
    } catch (e) {
      set({ isStreaming: false, streamingText: '', error: String(e) })
    } finally {
      get()._detachListeners()
    }
  },

  generateFinalDocument: async () => {
    const { model, messages, _sessionId, isStreaming } = get()
    if (isStreaming) return

    set({ sessionState: 'generating_final', isStreaming: true, streamingText: '', error: null })

    await get()._attachChunkListener(_sessionId)

    try {
      const llmMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: WRAP_UP_COMMAND },
      ]
      const fullText = await invoke<string>('studio_chat_turn', {
        sessionId: _sessionId,
        messages: llmMessages,
        model,
      })

      const markerIdx = fullText.indexOf(FINAL_MARKER)
      const doc =
        markerIdx >= 0 ? fullText.slice(markerIdx + FINAL_MARKER.length).trim() : fullText

      set({
        finalDocument: doc,
        sessionState: 'finished',
        isStreaming: false,
        streamingText: '',
      })
    } catch (e) {
      set({
        sessionState: 'brainstorming',
        isStreaming: false,
        streamingText: '',
        error: String(e),
      })
    } finally {
      get()._detachListeners()
    }
  },
}))
