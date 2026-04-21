import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown, ChevronUp, Play, Loader2 } from 'lucide-react'
import type { AgentNodeData } from '../../types'
import { callLlm } from '../../lib/tauri'

export default function AgentTestModal({
  data,
  onClose,
}: {
  data: AgentNodeData
  onClose: () => void
}) {
  const [testInput, setTestInput] = useState('')
  const [output, setOutput] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  async function handleTest() {
    if (!testInput.trim() || loading) return
    setOutput(null)
    setError(null)
    setElapsedMs(null)
    setLoading(true)
    const start = Date.now()
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - start), 100)

    try {
      const result = await callLlm(
        data.model,
        data.systemPrompt || 'You are a helpful assistant.',
        [{ role: 'user', content: testInput }],
      )
      setOutput(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      setElapsedMs(Date.now() - start)
      setLoading(false)
    }
  }

  function fmtMs(ms: number) {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-[#111115] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
          <div>
            <p className="text-sm font-semibold text-white/85">Test Agent</p>
            <p className="text-xs text-white/35 mt-0.5">{data.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-white/35 hover:text-white/70 hover:bg-white/6 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* System prompt preview */}
          <div>
            <button
              onClick={() => setShowPrompt((v) => !v)}
              className="text-xs text-purple-400/60 hover:text-purple-400/90 transition-colors"
            >
              {showPrompt
                ? <><ChevronUp size={11} className="inline mr-1" />Hide system prompt</>
                : <><ChevronDown size={11} className="inline mr-1" />Preview system prompt</>
              }
            </button>
            {showPrompt && (
              <pre className="mt-2 text-xs text-white/35 whitespace-pre-wrap break-words leading-relaxed max-h-36 overflow-y-auto rounded-lg bg-purple-500/5 border border-purple-500/10 px-3 py-2">
                {data.systemPrompt || '(no system prompt set)'}
              </pre>
            )}
          </div>

          {/* Input */}
          <div>
            <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-1.5">Test Input</p>
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/75 outline-none focus:border-purple-500/50 transition-colors resize-none placeholder:text-white/20"
              rows={3}
              placeholder="Type a message to send to this agent..."
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleTest()
              }}
              disabled={loading}
            />
            <p className="text-xs text-white/20 mt-1">Ctrl+Enter to send</p>
          </div>

          {/* Output */}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-white/35 animate-pulse">
              <Loader2 size={12} className="animate-spin" />
              <span>Thinking{elapsedMs != null ? ` · ${fmtMs(elapsedMs)}` : '...'}</span>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {output != null && !loading && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-white/30 uppercase tracking-wider">Response</p>
                {elapsedMs != null && (
                  <span className="text-xs text-white/25">{fmtMs(elapsedMs)}</span>
                )}
              </div>
              <pre className="text-xs text-white/65 whitespace-pre-wrap break-words leading-relaxed max-h-64 overflow-y-auto rounded-lg bg-white/3 border border-white/6 px-3 py-2.5">
                {output}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/6 flex justify-end">
          <button
            onClick={handleTest}
            disabled={!testInput.trim() || loading}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {loading
              ? <><Loader2 size={12} className="inline mr-1.5 animate-spin" />Testing...</>
              : <><Play size={12} className="inline mr-1.5" fill="currentColor" />Test</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
