import { useState, useRef, useEffect } from 'react'
import {
  Send, Plus, Download, FileText, ChevronRight,
  Zap, Map, BookOpen, Search, FileQuestion, Sparkles, Copy, Check,
  ArrowRight, Square, Trash2, Edit3
} from 'lucide-react'
import { useStudioStore } from '../../stores/studioStore'
import type { StudioTemplateId, StudioMessage } from '../../types'
import ModelPicker from '../shared/ModelPicker'
import MarkdownRenderer from './MarkdownRenderer'

// ── Templates ────────────────────────────────────────────────────────
const TEMPLATES: { id: StudioTemplateId; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'agent_prompt',   label: 'Agent Prompt',   icon: <Zap size={15} />,         description: 'Craft a production-ready system prompt for an AI agent' },
  { id: 'project_plan',   label: 'Project Plan',   icon: <Map size={15} />,         description: 'Build a structured, executable project plan' },
  { id: 'design_doc',     label: 'Design Doc',     icon: <BookOpen size={15} />,    description: 'Write a technical or product design document' },
  { id: 'research_brief', label: 'Research Brief', icon: <Search size={15} />,      description: 'Define a sharp, answerable research question' },
  { id: 'free_form',      label: 'Free Form',      icon: <FileQuestion size={15} />, description: 'Open-ended idea refinement and thinking' },
]

const PHASES = [
  { id: 'explore',  label: 'Explore' },
  { id: 'refine',   label: 'Refine' },
  { id: 'finished', label: 'Document' },
] as const

export default function StudioView() {
  const {
    sessions, currentSessionId, messages, model, sessionState, finalDocument,
    isStreaming, streamingText, error,
    sendMessage, generateFinalDocument, cancelStream,
    newSession, setModel, selectSession, deleteSession, editMessage,
    setTemplate, currentTemplate,
  } = useStudioStore()

  const [input, setInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const isIdle        = sessionState === 'idle'
  const isFinished    = sessionState === 'finished'
  const isBrainstorming = sessionState === 'brainstorming'
  const isGenerating  = sessionState === 'generating_final'

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  function handleSend() {
    if (!input.trim() || isStreaming) return
    sendMessage(input.trim())
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function handleCopyDoc() {
    navigator.clipboard.writeText(finalDocument)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const title = currentSession?.title ?? 'studio-document'
    const blob = new Blob([finalDocument], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleConfirmDelete(id: string) {
    deleteSession(id)
    setDeletingId(null)
  }

  const currentPhase = isFinished ? 'finished' : (isBrainstorming || isGenerating)
    ? (messages.length < 6 ? 'explore' : 'refine')
    : 'idle'

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--c-base)' }}>

      {/* ── Left sidebar: session history ── */}
      <div className="shrink-0 flex flex-col overflow-hidden border-r" style={{ width: '210px', background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <div className="flex items-center gap-2 px-3 pt-4 pb-2 shrink-0">
          <span className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--c-text-3)' }}>Sessions</span>
          <button
            onClick={() => newSession()}
            className="ml-auto flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium transition-colors"
            style={{ color: 'var(--c-accent)', background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}
            title="New session"
          >
            <Plus size={12} /> New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-2">
          {sessions.length === 0 ? (
            <p className="px-4 py-3 text-xs" style={{ color: 'var(--c-text-dim)' }}>No sessions yet</p>
          ) : (
            [...sessions].reverse().map((s) => {
              const isActive = s.id === currentSessionId
              const tmpl = TEMPLATES.find((t) => t.id === s.templateId)
              const isConfirmingDelete = deletingId === s.id

              return (
                <div
                  key={s.id}
                  className="group relative"
                  style={{
                    background: isActive ? 'var(--c-card)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--c-accent)' : '3px solid transparent',
                  }}
                >
                  {isConfirmingDelete ? (
                    <div className="px-3 py-2.5">
                      <p className="text-xs mb-2" style={{ color: 'var(--c-red)' }}>Delete this session?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmDelete(s.id)}
                          className="flex-1 py-1 rounded text-xs font-medium"
                          style={{ background: 'var(--c-red)', color: '#fff' }}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="flex-1 py-1 rounded text-xs"
                          style={{ background: 'var(--c-elevated)', color: 'var(--c-text-2)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => selectSession(s.id)}
                      className="w-full text-left px-3 py-2.5 pr-8 transition-all"
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span style={{ color: isActive ? 'var(--c-accent)' : 'var(--c-text-3)', lineHeight: 1, flexShrink: 0 }}>
                          {tmpl?.icon}
                        </span>
                        <span className="text-xs font-medium truncate" style={{ color: isActive ? 'var(--c-text-1)' : 'var(--c-text-2)' }}>
                          {s.title}
                        </span>
                      </div>
                      <p className="text-xs pl-4" style={{ color: 'var(--c-text-dim)' }}>
                        {new Date(s.createdAt).toLocaleDateString()}
                        {s.finalDocument && <span style={{ color: 'var(--c-accent)' }}> · doc</span>}
                      </p>
                    </button>
                  )}

                  {/* Delete button — shown on hover */}
                  {!isConfirmingDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingId(s.id) }}
                      className="absolute right-2 top-2.5 w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--c-text-3)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-red)'; e.currentTarget.style.background = 'var(--c-red-dim)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-3)'; e.currentTarget.style.background = 'transparent' }}
                      title="Delete session"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <div className="shrink-0 flex items-center gap-4 px-6 py-3 border-b" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--c-text-1)' }}>
              {currentSession ? currentSession.title : 'Studio'}
            </p>
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Idea refinement & document generation</p>
          </div>

          {/* Phase indicator */}
          {!isIdle && (
            <div className="flex items-center gap-1 ml-4">
              {PHASES.map((phase, idx) => {
                const isActive = currentPhase === phase.id
                const phaseIdx = PHASES.findIndex((p) => p.id === phase.id)
                const currentIdx = PHASES.findIndex((p) => p.id === currentPhase)
                const isPast = currentIdx > phaseIdx
                return (
                  <div key={phase.id} className="flex items-center gap-1">
                    <div
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: isActive ? 'var(--c-accent-dim)' : 'transparent',
                        color: isActive ? 'var(--c-accent)' : isPast ? 'var(--c-text-3)' : 'var(--c-text-dim)',
                        border: isActive ? '1px solid var(--c-accent-border)' : '1px solid transparent',
                      }}
                    >
                      {isPast ? '✓ ' : ''}{phase.label}
                    </div>
                    {idx < PHASES.length - 1 && (
                      <ChevronRight size={10} style={{ color: 'var(--c-text-dim)' }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="ml-auto">
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="text-xs px-2.5 py-1.5 rounded-lg transition-all"
              style={{ background: 'var(--c-card)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
            >
              {model.modelId}
            </button>
          </div>
        </div>

        {/* Model picker */}
        {showModelPicker && (
          <div className="shrink-0 px-6 py-3 border-b" style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}>
            <ModelPicker value={model} onChange={(m) => { setModel(m); setShowModelPicker(false) }} />
          </div>
        )}

        {/* ── Idle: template picker ── */}
        {isIdle && (
          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-12">
            <div className="max-w-xl w-full">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}>
                  <Sparkles size={18} style={{ color: 'var(--c-accent)' }} />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>What are you working on?</p>
                  <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Choose a goal and the AI will guide you through it</p>
                </div>
              </div>

              <div className="space-y-2 mb-8">
                {TEMPLATES.map((tmpl) => {
                  const isSelected = currentTemplate === tmpl.id
                  return (
                    <button
                      key={tmpl.id}
                      onClick={() => setTemplate(tmpl.id)}
                      className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-all"
                      style={{
                        background: isSelected ? 'var(--c-accent-dim)' : 'var(--c-card)',
                        border: `1px solid ${isSelected ? 'var(--c-accent-border)' : 'var(--c-border)'}`,
                      }}
                    >
                      <span style={{ color: isSelected ? 'var(--c-accent)' : 'var(--c-text-3)', flexShrink: 0 }}>
                        {tmpl.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: isSelected ? 'var(--c-accent)' : 'var(--c-text-1)' }}>
                          {tmpl.label}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>{tmpl.description}</p>
                      </div>
                      {isSelected && <ArrowRight size={14} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />}
                    </button>
                  )
                })}
              </div>

              {currentTemplate && (
                <button
                  onClick={() => sendMessage(`Let's work on: ${TEMPLATES.find((t) => t.id === currentTemplate)?.label}. ${TEMPLATES.find((t) => t.id === currentTemplate)?.description}.`)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all"
                  style={{ background: 'var(--c-accent)', color: '#fff' }}
                >
                  <Sparkles size={15} /> Start Session
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Active: chat view ── */}
        {!isIdle && !isFinished && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onEdit={(newContent) => editMessage(msg.id, newContent)}
                />
              ))}

              {/* Streaming response */}
              {isStreaming && streamingText && (
                <div className="flex justify-start">
                  <div
                    className="max-w-[82%] rounded-xl px-4 py-3 text-sm cursor-blink"
                    style={{ background: 'var(--c-card)', color: 'var(--c-text-1)', border: '1px solid var(--c-border)' }}
                  >
                    <MarkdownRenderer content={streamingText} />
                  </div>
                </div>
              )}

              {/* Generating doc indicator */}
              {isGenerating && !streamingText && (
                <div className="flex justify-start">
                  <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
                    style={{ background: 'var(--c-card)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
                    <span className="pulse-accent w-2 h-2 rounded-full inline-block" style={{ background: 'var(--c-accent)' }} />
                    Generating your document…
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
                  style={{ background: 'var(--c-red-dim)', color: 'var(--c-red)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  {error}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* ── Input area ── */}
            <div className="px-6 pb-5 shrink-0 space-y-2">
              {/* Streaming banner — clear signal that AI is running */}
              {isStreaming && (
                <div
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm"
                  style={{ background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="pulse-accent w-2 h-2 rounded-full inline-block" style={{ background: 'var(--c-accent)' }} />
                    <span className="font-medium" style={{ color: 'var(--c-accent)' }}>AI is responding — your input is paused</span>
                  </div>
                  <button
                    onClick={cancelStream}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
                    style={{ background: 'var(--c-red-dim)', color: 'var(--c-red)', border: '1px solid rgba(239,68,68,0.3)' }}
                  >
                    <Square size={11} fill="currentColor" /> Stop
                  </button>
                </div>
              )}

              <div
                className="flex items-end gap-2 rounded-xl border px-4 py-3"
                style={{
                  background: 'var(--c-card)',
                  borderColor: isStreaming ? 'var(--c-border)' : 'var(--c-accent-border)',
                  opacity: isStreaming ? 0.5 : 1,
                }}
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isStreaming ? 'Waiting for AI…' : 'Your response…'}
                  rows={1}
                  disabled={isStreaming}
                  className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
                  style={{ color: 'var(--c-text-1)', minHeight: '24px', maxHeight: '120px' }}
                  onInput={(e) => {
                    const t = e.currentTarget
                    t.style.height = 'auto'
                    t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-all"
                  style={{
                    background: input.trim() && !isStreaming ? 'var(--c-accent)' : 'var(--c-border)',
                    color: input.trim() && !isStreaming ? '#fff' : 'var(--c-text-dim)',
                  }}
                >
                  <Send size={14} />
                </button>
              </div>

              {isBrainstorming && messages.length >= 2 && !isStreaming && (
                <button
                  onClick={generateFinalDocument}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'var(--c-green-dim)', color: 'var(--c-green)', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  <FileText size={14} /> Generate Document
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Finished: document view ── */}
        {isFinished && finalDocument && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center gap-2 px-6 py-3 border-b"
              style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
              <FileText size={14} style={{ color: 'var(--c-green)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--c-text-1)' }}>Final Document</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleCopyDoc}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{ background: 'var(--c-card)', color: copied ? 'var(--c-green)' : 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--c-green-dim)', color: 'var(--c-green)', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  <Download size={12} /> Download .md
                </button>
                <button
                  onClick={() => newSession()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--c-card)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
                >
                  <Plus size={12} /> New Session
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                <MarkdownRenderer content={finalDocument} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Message bubble with copy + edit ─────────────────────────────────
function MessageBubble({ msg, onEdit }: { msg: StudioMessage; onEdit: (content: string) => void }) {
  const [hovering, setHovering] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(msg.content)
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'

  function handleCopy() {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleSaveEdit() {
    if (editValue.trim()) {
      onEdit(editValue.trim())
    }
    setEditing(false)
  }

  function handleCancelEdit() {
    setEditValue(msg.content)
    setEditing(false)
  }

  if (editing && isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] w-full">
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full conductor-input px-4 py-3 text-sm leading-relaxed resize-none"
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit() }
              if (e.key === 'Escape') handleCancelEdit()
            }}
          />
          <div className="flex gap-2 mt-2 justify-end">
            <button onClick={handleSaveEdit}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--c-accent)', color: '#fff' }}>
              Save
            </button>
            <button onClick={handleCancelEdit}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--c-card)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="relative max-w-[82%]">
        <div
          className="rounded-xl px-4 py-3 text-sm select-text"
          style={{
            background: isUser ? 'var(--c-accent-dim)' : 'var(--c-card)',
            color: isUser ? 'var(--c-accent)' : 'var(--c-text-1)',
            border: `1px solid ${isUser ? 'var(--c-accent-border)' : 'var(--c-border)'}`,
            userSelect: 'text',
          }}
        >
          {isUser ? (
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>{msg.content}</p>
          ) : (
            <MarkdownRenderer content={msg.content} />
          )}
        </div>

        {/* Hover actions */}
        {hovering && (
          <div
            className={`absolute top-1 ${isUser ? 'left-0 -translate-x-full pr-1.5' : 'right-0 translate-x-full pl-1.5'} flex items-center gap-1`}
          >
            <button
              onClick={handleCopy}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ background: 'var(--c-elevated)', color: copied ? 'var(--c-green)' : 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
              title="Copy"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
            {isUser && (
              <button
                onClick={() => setEditing(true)}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ background: 'var(--c-elevated)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
                title="Edit message"
              >
                <Edit3 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
