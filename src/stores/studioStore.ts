import { create } from 'zustand'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { v4 as uuidv4 } from 'uuid'
import type {
  ModelConfig, StudioMessage, StudioSessionState, StudioChunkPayload,
  StudioSession, StudioTemplateId
} from '../types'
import { DEFAULT_MODEL } from '../lib/defaults'

const FINAL_MARKER = '[STUDIO_FINAL_DOCUMENT]'

// ── Improved system prompts ───────────────────────────────────────────
const TEMPLATE_SYSTEM_PROMPTS: Record<StudioTemplateId, string> = {
  agent_prompt: `You are an elite AI prompt engineer with deep expertise in LLM behavior, prompt construction, and agent design. Your job is to help the user craft a production-quality system prompt for an AI agent through an iterative conversation.

BEHAVIOR:
- Start by asking what the agent does and who it serves. Be concise.
- Ask 2-3 targeted questions per message — never more.
- Probe for: role, goals, constraints, output format, tone, tools available, edge cases, failure modes.
- Challenge vague answers: "be helpful" is not enough — push for specifics.
- Once you have enough detail (usually 4-6 exchanges), offer to generate the final prompt.

DOCUMENT FORMAT (when generating):
Produce a complete, structured system prompt the user can paste directly into their agent:
\`\`\`
## Role
[Who the agent is]

## Objective
[What it must accomplish]

## Instructions
[Step-by-step behavior rules]

## Output Format
[Exact format required]

## Constraints
[Hard rules — what it must never do]

## Examples (if applicable)
[Input → Output examples]
\`\`\`

Begin by asking: "What does this agent need to do, and what's the most important thing it must get right?"`,

  project_plan: `You are a seasoned product and project manager who turns vague ideas into structured, executable plans. You ask sharp questions to expose what people haven't thought through yet.

BEHAVIOR:
- Ask 2-3 questions per message — focused on what matters most right now.
- Probe for: the real goal (not just stated goal), success metrics, timeline, resources, risks, dependencies, what's out of scope.
- Push back on unrealistic timelines or vague scope — that's where projects die.
- Identify the 3 most dangerous assumptions in their plan.

DOCUMENT FORMAT (when generating):
\`\`\`
# Project Plan: [Name]

## Executive Summary
[1-paragraph overview]

## Goals & Success Metrics
[Numbered list with measurable outcomes]

## Scope
### In Scope
### Out of Scope

## Milestones & Timeline
[Phase | Deliverable | Date]

## Resources & Team
## Risks & Mitigations
## Open Questions
\`\`\`

Begin by asking: "What's the one outcome that would make this project a clear success, and what's your timeline?"`,

  design_doc: `You are a senior staff engineer and technical writer. You help teams think through system design decisions before they write a single line of code, exposing gaps and trade-offs they haven't considered.

BEHAVIOR:
- Ask 2-3 questions per message, focused on the most critical unknowns.
- Probe for: the problem statement (not just the solution), constraints, scale, alternatives considered, data model, API surface, failure modes, rollout strategy.
- Challenge assumptions: "why not just use X?" forces clearer thinking.
- Identify technical risks and missing decisions.

DOCUMENT FORMAT (when generating):
\`\`\`
# Design Document: [Title]
**Status:** Draft | **Author:** [User] | **Date:** [Date]

## Overview
## Problem Statement
## Goals & Non-Goals
## Proposed Solution
## System Design / Architecture
## Data Model
## API / Interface Design
## Alternatives Considered
## Trade-offs & Risks
## Implementation Plan
## Open Questions
\`\`\`

Begin by asking: "What problem are you solving, and what's the most technically uncertain part of your proposed solution?"`,

  research_brief: `You are a rigorous research strategist. You help people define sharp, answerable research questions and design approaches that will actually produce useful insights — not just busywork.

BEHAVIOR:
- Ask 2-3 questions per message.
- Probe for: the core question, what decisions this research will inform, what's already known, methodology options, timeline, success criteria.
- Challenge scope creep — most research briefs try to answer too many things.
- Push for specificity: "understand the market" is not a research question.

DOCUMENT FORMAT (when generating):
\`\`\`
# Research Brief: [Title]

## Research Question
[Single, specific, answerable question]

## Context & Motivation
## What We Already Know
## What We Need to Discover
## Research Approach & Methods
## Success Criteria
## Timeline & Resources
## How Findings Will Be Used
\`\`\`

Begin by asking: "What specific decision will this research help you make, and by when do you need the answer?"`,

  free_form: `You are a sharp, candid thinking partner. Your job is to help the user examine their idea from every angle, stress-test it, and refine it into something clear, solid, and actionable.

BEHAVIOR:
- Ask 2-3 focused questions per message.
- Probe: what is it, why does it matter, who benefits, what's the core assumption, what could go wrong, what's the simplest version, what makes it different.
- Be honest — point out logical gaps or weak assumptions directly but constructively.
- Look for the 20% of the idea that does 80% of the value.

DOCUMENT FORMAT (when generating):
\`\`\`
# [Idea Title]

## The Core Idea
## Why It Matters
## Key Assumptions
## Strengths
## Risks & Challenges
## Simplified Version (MVP)
## Next Steps
\`\`\`

Begin by asking: "Tell me your idea in 2-3 sentences — what is it and why do you care about it?"`,
}

const TEMPLATE_LABELS: Record<StudioTemplateId, string> = {
  agent_prompt:   'Agent Prompt',
  project_plan:   'Project Plan',
  design_doc:     'Design Doc',
  research_brief: 'Research Brief',
  free_form:      'Free Form',
}

const WRAP_UP_COMMAND =
  `[SYSTEM COMMAND: The brainstorming is complete. Review the entire conversation carefully. ` +
  `Generate a comprehensive, production-ready final document based on everything discussed. ` +
  `Start your response with exactly: ${FINAL_MARKER} — then write the full document in structured Markdown. ` +
  `Be thorough, specific, and immediately actionable. Use the format described in your instructions.]`

const SESSIONS_KEY = 'conductor_studio_sessions'

function loadSessions(): StudioSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveSessions(sessions: StudioSession[]) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)) } catch { /* ignore */ }
}

interface StudioStore {
  sessions: StudioSession[]
  currentSessionId: string
  currentTemplate: StudioTemplateId | null

  messages: StudioMessage[]
  model: ModelConfig
  sessionState: StudioSessionState
  finalDocument: string
  isStreaming: boolean
  streamingText: string
  error: string | null

  sendMessage: (content: string) => Promise<void>
  generateFinalDocument: () => Promise<void>
  cancelStream: () => void
  newSession: () => void
  selectSession: (id: string) => void
  deleteSession: (id: string) => void
  editMessage: (id: string, newContent: string) => void
  setModel: (model: ModelConfig) => void
  setTemplate: (id: StudioTemplateId) => void

  _sessionId: string
  _cancelled: boolean
  _unlisten: UnlistenFn | null
  _attachChunkListener: (sessionId: string) => Promise<void>
  _detachListeners: () => void
  _persistCurrentSession: (patch?: Partial<StudioSession>) => void
}

function makeNewSession(templateId: StudioTemplateId = 'free_form'): StudioSession {
  return {
    id: uuidv4(),
    title: TEMPLATE_LABELS[templateId],
    templateId,
    createdAt: new Date().toISOString(),
    messages: [],
    finalDocument: '',
  }
}

const initialSessions = loadSessions()
const initialSession = initialSessions.length > 0
  ? initialSessions[initialSessions.length - 1]
  : makeNewSession()

export const useStudioStore = create<StudioStore>()((set, get) => ({
  sessions: initialSessions.length > 0 ? initialSessions : [],
  currentSessionId: initialSession.id,
  currentTemplate: initialSession.templateId ?? null,

  messages: initialSession.messages,
  model: { ...DEFAULT_MODEL },
  sessionState: initialSession.finalDocument ? 'finished' : initialSession.messages.length > 0 ? 'brainstorming' : 'idle',
  finalDocument: initialSession.finalDocument,
  isStreaming: false,
  streamingText: '',
  error: null,
  _sessionId: uuidv4(),
  _cancelled: false,
  _unlisten: null,

  setModel: (model) => set({ model }),

  setTemplate: (id) => {
    const { sessions, currentSessionId } = get()
    const current = sessions.find((s) => s.id === currentSessionId)
    if (current && current.messages.length === 0) {
      const updated = { ...current, templateId: id, title: TEMPLATE_LABELS[id] }
      const newSessions = sessions.map((s) => s.id === currentSessionId ? updated : s)
      saveSessions(newSessions)
      set({ sessions: newSessions, currentTemplate: id })
    } else {
      set({ currentTemplate: id })
    }
  },

  cancelStream: () => {
    get()._detachListeners()
    set({
      _cancelled: true,
      isStreaming: false,
      streamingText: '',
      sessionState: 'brainstorming',
    })
  },

  newSession: () => {
    get()._detachListeners()
    const session = makeNewSession('free_form')
    const { sessions } = get()
    const newSessions = [...sessions, session]
    saveSessions(newSessions)
    set({
      sessions: newSessions,
      currentSessionId: session.id,
      currentTemplate: null,
      messages: [],
      sessionState: 'idle',
      finalDocument: '',
      isStreaming: false,
      streamingText: '',
      error: null,
      _cancelled: false,
      _sessionId: uuidv4(),
    })
  },

  selectSession: (id) => {
    get()._detachListeners()
    const { sessions } = get()
    const session = sessions.find((s) => s.id === id)
    if (!session) return
    set({
      currentSessionId: id,
      currentTemplate: session.templateId ?? null,
      messages: session.messages,
      sessionState: session.finalDocument ? 'finished' : session.messages.length > 0 ? 'brainstorming' : 'idle',
      finalDocument: session.finalDocument,
      isStreaming: false,
      streamingText: '',
      error: null,
      _cancelled: false,
      _sessionId: uuidv4(),
    })
  },

  deleteSession: (id) => {
    const { sessions, currentSessionId } = get()
    const newSessions = sessions.filter((s) => s.id !== id)
    saveSessions(newSessions)

    if (currentSessionId === id) {
      // Switch to another session or create fresh
      if (newSessions.length > 0) {
        const next = newSessions[newSessions.length - 1]
        set({
          sessions: newSessions,
          currentSessionId: next.id,
          currentTemplate: next.templateId ?? null,
          messages: next.messages,
          sessionState: next.finalDocument ? 'finished' : next.messages.length > 0 ? 'brainstorming' : 'idle',
          finalDocument: next.finalDocument,
          isStreaming: false,
          streamingText: '',
          error: null,
          _cancelled: false,
          _sessionId: uuidv4(),
        })
      } else {
        const fresh = makeNewSession('free_form')
        set({
          sessions: [fresh],
          currentSessionId: fresh.id,
          currentTemplate: null,
          messages: [],
          sessionState: 'idle',
          finalDocument: '',
          isStreaming: false,
          streamingText: '',
          error: null,
          _cancelled: false,
          _sessionId: uuidv4(),
        })
        saveSessions([fresh])
      }
    } else {
      set({ sessions: newSessions })
    }
  },

  editMessage: (id, newContent) => {
    const { messages, sessions, currentSessionId } = get()
    const updated = messages.map((m) => m.id === id ? { ...m, content: newContent } : m)
    set({ messages: updated })
    const updatedSessions = sessions.map((s) =>
      s.id === currentSessionId ? { ...s, messages: updated } : s
    )
    saveSessions(updatedSessions)
    set({ sessions: updatedSessions })
  },

  _persistCurrentSession: (patch) => {
    const { sessions, currentSessionId, messages, finalDocument } = get()
    const updated = sessions.map((s) =>
      s.id === currentSessionId ? { ...s, messages, finalDocument, ...patch } : s
    )
    saveSessions(updated)
    set({ sessions: updated })
  },

  _attachChunkListener: async (sessionId: string) => {
    const unlisten = await listen<StudioChunkPayload>(
      `conductor://studio/${sessionId}/chunk`,
      (e) => {
        if (!get()._cancelled) {
          set((s) => ({ streamingText: s.streamingText + e.payload.chunk }))
        }
      },
    )
    set({ _unlisten: unlisten })
  },

  _detachListeners: () => {
    const { _unlisten } = get()
    if (_unlisten) { _unlisten(); set({ _unlisten: null }) }
  },

  sendMessage: async (content: string) => {
    const { model, messages, _sessionId, sessionState, isStreaming, currentTemplate, sessions, currentSessionId } = get()
    if (isStreaming) return

    set({ _cancelled: false })

    const userMsg: StudioMessage = { id: uuidv4(), role: 'user', content }
    const newMessages = [...messages, userMsg]

    // First message: update session title
    if (messages.length === 0) {
      const existingSession = sessions.find((s) => s.id === currentSessionId)
      if (existingSession && existingSession.messages.length === 0) {
        const title = content.slice(0, 50) + (content.length > 50 ? '…' : '')
        const updatedSessions = sessions.map((s) =>
          s.id === currentSessionId ? { ...s, title } : s
        )
        saveSessions(updatedSessions)
        set({ sessions: updatedSessions })
      }
    }

    set({
      messages: newMessages,
      isStreaming: true,
      streamingText: '',
      error: null,
      sessionState: sessionState === 'idle' ? 'brainstorming' : sessionState,
    })

    await get()._attachChunkListener(_sessionId)

    const tmpl = currentTemplate ?? 'free_form'
    const systemPrompt = TEMPLATE_SYSTEM_PROMPTS[tmpl]

    // Inject system prompt into first message
    const apiMessages = messages.length === 0
      ? [{ role: 'user' as const, content: `<system>\n${systemPrompt}\n</system>\n\n${content}` }]
      : newMessages.map((m) => ({ role: m.role, content: m.content }))

    try {
      const fullText = await invoke<string>('studio_chat_turn', {
        sessionId: _sessionId,
        messages: apiMessages,
        model,
      })

      if (get()._cancelled) {
        set({ _cancelled: false })
        return
      }

      const isFinalDoc = fullText.trimStart().startsWith(FINAL_MARKER)

      if (isFinalDoc) {
        const doc = fullText.trimStart().slice(FINAL_MARKER.length).trim()
        const noticeMsg: StudioMessage = {
          id: uuidv4(), role: 'assistant',
          content: 'Your document is ready. See below.',
        }
        const finalMessages = [...newMessages, noticeMsg]
        set({ messages: finalMessages, finalDocument: doc, sessionState: 'finished', isStreaming: false, streamingText: '' })
        get()._persistCurrentSession({ messages: finalMessages, finalDocument: doc })
      } else {
        const assistantMsg: StudioMessage = { id: uuidv4(), role: 'assistant', content: fullText }
        const finalMessages = [...newMessages, assistantMsg]
        set({ messages: finalMessages, isStreaming: false, streamingText: '' })
        get()._persistCurrentSession({ messages: finalMessages })
      }
    } catch (e) {
      if (!get()._cancelled) {
        set({ isStreaming: false, streamingText: '', error: String(e) })
      } else {
        set({ isStreaming: false, streamingText: '', _cancelled: false })
      }
    } finally {
      get()._detachListeners()
    }
  },

  generateFinalDocument: async () => {
    const { model, messages, _sessionId, isStreaming } = get()
    if (isStreaming) return

    set({ sessionState: 'generating_final', isStreaming: true, streamingText: '', error: null, _cancelled: false })
    await get()._attachChunkListener(_sessionId)

    try {
      const llmMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: WRAP_UP_COMMAND },
      ]
      const fullText = await invoke<string>('studio_chat_turn', {
        sessionId: _sessionId, messages: llmMessages, model,
      })

      if (get()._cancelled) {
        set({ sessionState: 'brainstorming', isStreaming: false, streamingText: '', _cancelled: false })
        return
      }

      const markerIdx = fullText.indexOf(FINAL_MARKER)
      const doc = markerIdx >= 0 ? fullText.slice(markerIdx + FINAL_MARKER.length).trim() : fullText

      set({ finalDocument: doc, sessionState: 'finished', isStreaming: false, streamingText: '' })
      get()._persistCurrentSession({ finalDocument: doc })
    } catch (e) {
      if (!get()._cancelled) {
        set({ sessionState: 'brainstorming', isStreaming: false, streamingText: '', error: String(e) })
      } else {
        set({ sessionState: 'brainstorming', isStreaming: false, streamingText: '', _cancelled: false })
      }
    } finally {
      get()._detachListeners()
    }
  },
}))
