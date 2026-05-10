import { useState } from 'react'
import { AlertTriangle, Send, MessageSquare } from 'lucide-react'
import { useMissionStore } from '../../stores/missionStore'

export default function EscalationModal() {
  const { activeEscalation, currentMissionId, respondToEscalation, dismissEscalation } = useMissionStore()
  const [customAnswer, setCustomAnswer] = useState('')
  const [sending, setSending] = useState(false)

  if (!activeEscalation || !currentMissionId) return null

  const isChoice = activeEscalation.escalationType === 'choice'
  const hasOptions = isChoice && activeEscalation.options.length > 0

  async function handleRespond(response: string) {
    if (!response.trim() || sending || !currentMissionId || !activeEscalation) return
    setSending(true)
    try {
      await respondToEscalation(currentMissionId, activeEscalation.id, response.trim())
      setCustomAnswer('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-[580px] max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-accent-border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-6 py-4 border-b shrink-0"
          style={{ background: 'var(--c-accent-dim)', borderColor: 'var(--c-accent-border)' }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 pulse-accent"
            style={{ background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}
          >
            {isChoice
              ? <MessageSquare size={20} style={{ color: 'var(--c-accent)' }} />
              : <AlertTriangle size={20} style={{ color: 'var(--c-accent)' }} />
            }
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: 'var(--c-accent)' }}>
              {isChoice ? 'Manager Needs a Decision' : 'Manager Needs Your Input'}
            </p>
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
              Mission paused · Waiting for CEO response
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Message */}
          <div
            className="rounded-xl px-5 py-4 mb-5"
            style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-3)' }}>
              From: Manager Agent
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-1)' }}>
              {activeEscalation.message}
            </p>
          </div>

          {/* Choice options */}
          {hasOptions && (
            <div className="space-y-2 mb-4">
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--c-text-2)' }}>
                Choose an option:
              </p>
              {activeEscalation.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => handleRespond(option)}
                  disabled={sending}
                  className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                  style={{
                    background: 'var(--c-card)',
                    color: 'var(--c-text-1)',
                    border: '1px solid var(--c-border)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--c-accent-dim)'
                    e.currentTarget.style.borderColor = 'var(--c-accent-border)'
                    e.currentTarget.style.color = 'var(--c-accent)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--c-card)'
                    e.currentTarget.style.borderColor = 'var(--c-border)'
                    e.currentTarget.style.color = 'var(--c-text-1)'
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold mr-3"
                    style={{ background: 'var(--c-elevated)', color: 'var(--c-text-3)' }}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  {option}
                </button>
              ))}

              <div className="flex items-center gap-3 mt-4">
                <div className="flex-1 h-px" style={{ background: 'var(--c-border)' }} />
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>or type your own answer</span>
                <div className="flex-1 h-px" style={{ background: 'var(--c-border)' }} />
              </div>
            </div>
          )}

          {/* Text input (always for questions, optional for choices) */}
          <div className="space-y-3">
            {!isChoice && (
              <label className="block text-sm font-semibold" style={{ color: 'var(--c-text-2)' }}>
                Your response
              </label>
            )}
            <textarea
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              placeholder={isChoice ? 'Or type a custom answer…' : 'Type your answer or decision here…'}
              rows={isChoice ? 2 : 4}
              autoFocus={!isChoice}
              className="w-full conductor-input px-4 py-3 text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) handleRespond(customAnswer)
              }}
            />
            <p className="text-xs" style={{ color: 'var(--c-text-dim)' }}>
              Ctrl+Enter to send · The Manager will continue with your response as context
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 justify-end px-6 py-4 border-t shrink-0"
          style={{ borderColor: 'var(--c-border)' }}
        >
          <button
            onClick={dismissEscalation}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ color: 'var(--c-text-3)', background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
          >
            Dismiss
          </button>
          {customAnswer.trim() && (
            <button
              onClick={() => handleRespond(customAnswer)}
              disabled={sending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--c-accent)', color: '#000' }}
            >
              <Send size={14} />
              {sending ? 'Sending…' : 'Send to Manager'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
