import { useRef, useEffect, useState } from 'react'
import { Send, Sparkles, Download, Plus, FileText, AlertTriangle, X } from 'lucide-react'
import { useStudioStore } from '../../stores/studioStore'
import ModelPicker from '../shared/ModelPicker'
import type { StudioMessage } from '../../types'

export default function StudioView() {
  const {
    messages,
    model,
    sessionState,
    finalDocument,
    isStreaming,
    streamingText,
    error,
    sendMessage,
    generateFinalDocument,
    newSession,
    setModel,
  } = useStudioStore()

  const [input, setInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    await sendMessage(text)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleDownload() {
    const blob = new Blob([finalDocument], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `studio-plan-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (sessionState === 'finished') {
    return (
      <div className="flex flex-col h-full" style={{ background: 'var(--c-base)' }}>
        {/* Document header */}
        <div
          className="shrink-0 h-14 flex items-center justify-between px-5 border-b"
          style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-surface)' }}
        >
          <div className="flex items-center gap-2.5">
            <FileText size={16} style={{ color: 'rgb(45,212,191)' }} />
            <span className="text-base font-semibold" style={{ color: 'var(--c-text-1)' }}>
              Your Plan
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors border"
              style={{
                background: 'rgba(45,212,191,0.08)',
                borderColor: 'rgba(45,212,191,0.2)',
                color: 'rgb(45,212,191)',
              }}
            >
              <Download size={14} />
              Download .txt
            </button>
            <button
              onClick={newSession}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors border"
              style={{
                background: 'var(--c-surface-alt)',
                borderColor: 'var(--c-border)',
                color: 'var(--c-text-2)',
              }}
            >
              <Plus size={14} />
              New Session
            </button>
          </div>
        </div>

        {/* Document body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-8">
            <MarkdownDoc content={finalDocument} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--c-base)' }}>
      {/* Header bar */}
      <div
        className="shrink-0 h-14 flex items-center justify-between px-4 border-b"
        style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-surface)' }}
      >
        <div className="flex items-center gap-2.5">
          <Sparkles size={16} style={{ color: 'rgb(45,212,191)' }} />
          <span className="text-base font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Studio
          </span>
          {sessionState === 'generating_final' && (
            <span
              className="text-sm px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(45,212,191,0.1)', color: 'rgb(45,212,191)' }}
            >
              Generating document…
            </span>
          )}
        </div>
        <div className="w-56">
          <ModelPicker value={model} onChange={setModel} />
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto">
        {sessionState === 'idle' ? (
          <EmptyState />
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isStreaming && streamingText && (
              <StreamingBubble text={streamingText} />
            )}
            {isStreaming && !streamingText && (
              <ThinkingBubble />
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div
          className="mx-4 mb-2 flex items-center gap-2 px-4 py-3 rounded-xl text-sm border"
          style={{
            background: 'rgba(239,68,68,0.08)',
            borderColor: 'rgba(239,68,68,0.2)',
            color: 'rgb(252,165,165)',
          }}
        >
          <AlertTriangle size={15} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => useStudioStore.getState().newSession()}
            style={{ color: 'rgba(252,165,165,0.5)' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Input area */}
      <div
        className="shrink-0 border-t px-4 py-3.5 space-y-2.5"
        style={{ borderColor: 'var(--c-border-subtle)', background: 'var(--c-surface)' }}
      >
        <div className="flex gap-2.5 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              sessionState === 'idle'
                ? 'Describe your idea, project, or goal — Studio will help you build it out…'
                : 'Your message…'
            }
            disabled={isStreaming}
            rows={2}
            className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            style={{
              background: 'var(--c-input)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-text-1)',
              maxHeight: 120,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="h-11 w-11 flex items-center justify-center rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            style={{ background: 'rgba(45,212,191,0.15)', color: 'rgb(45,212,191)' }}
          >
            <Send size={16} />
          </button>
        </div>

        {sessionState !== 'idle' && (
          <div className="flex justify-end">
            <button
              onClick={generateFinalDocument}
              disabled={isStreaming || messages.length === 0}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(45,212,191,0.1)', color: 'rgb(45,212,191)' }}
            >
              <FileText size={14} />
              Done with plan — Generate Document
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center gap-6 text-center p-8 pt-24">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(45,212,191,0.1)' }}
      >
        <Sparkles size={28} style={{ color: 'rgba(45,212,191,0.7)' }} />
      </div>
      <div className="max-w-sm">
        <p className="text-lg font-semibold mb-3" style={{ color: 'var(--c-text-1)' }}>
          Turn any idea into a bulletproof plan
        </p>
        <p className="text-base leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Tell Studio your raw idea — a trip to plan, a project to build, a goal to reach. Studio
          will ask the right questions to draw out all the details, then generate a comprehensive
          document you can act on immediately.
        </p>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: StudioMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
        style={
          isUser
            ? { background: 'rgba(45,212,191,0.12)', color: 'var(--c-text-1)' }
            : { background: 'var(--c-surface)', color: 'var(--c-text-1)', border: '1px solid var(--c-border-subtle)' }
        }
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
        style={{ background: 'var(--c-surface)', color: 'var(--c-text-1)', border: '1px solid var(--c-border-subtle)' }}
      >
        <p className="whitespace-pre-wrap">
          {text}
          <span className="inline-block w-1.5 h-3.5 ml-0.5 rounded-sm animate-pulse" style={{ background: 'rgb(45,212,191)' }} />
        </p>
      </div>
    </div>
  )
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div
        className="rounded-2xl px-4 py-3.5 flex items-center gap-2"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-subtle)' }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              background: 'rgb(45,212,191)',
              opacity: 0.6,
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function MarkdownDoc({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('# ')) {
      elements.push(
        <h1
          key={i}
          className="text-2xl font-bold mt-8 mb-3 pb-2 border-b"
          style={{ color: 'var(--c-text-1)', borderColor: 'var(--c-border-subtle)' }}
        >
          {renderInline(line.slice(2))}
        </h1>,
      )
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--c-text-1)' }}>
          {renderInline(line.slice(3))}
        </h2>,
      )
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-lg font-semibold mt-4 mb-2" style={{ color: 'var(--c-text-2)' }}>
          {renderInline(line.slice(4))}
        </h3>,
      )
    } else if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={i} className="text-base font-semibold mt-3 mb-1.5" style={{ color: 'var(--c-text-2)' }}>
          {renderInline(line.slice(5))}
        </h4>,
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 my-2.5 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="text-base leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      )
      continue
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 my-2.5 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="text-base leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      )
      continue
    } else if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      elements.push(
        <hr key={i} className="my-6" style={{ borderColor: 'var(--c-border-subtle)' }} />,
      )
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={i}
          className="border-l-2 pl-4 my-3 text-base italic"
          style={{ borderColor: 'rgb(45,212,191)', color: 'var(--c-text-3)' }}
        >
          {renderInline(line.slice(2))}
        </blockquote>,
      )
    } else if (line.startsWith('```')) {
      const langLine = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre
          key={`code-${i}`}
          className="my-4 rounded-xl p-4 text-sm font-mono overflow-x-auto"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-subtle)', color: 'var(--c-text-2)' }}
        >
          {langLine && (
            <div className="mb-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
              {langLine}
            </div>
          )}
          {codeLines.join('\n')}
        </pre>,
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(
        <p key={i} className="text-base leading-relaxed my-1.5" style={{ color: 'var(--c-text-2)' }}>
          {renderInline(line)}
        </p>,
      )
    }

    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold" style={{ color: 'var(--c-text-1)' }}>
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={i}
          className="rounded px-1.5 py-0.5 text-sm font-mono"
          style={{ background: 'rgba(45,212,191,0.1)', color: 'rgb(45,212,191)' }}
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}
