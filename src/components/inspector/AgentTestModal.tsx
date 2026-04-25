import { X } from 'lucide-react'
import type { AgentNodeData } from '../../types'

export default function AgentTestModal({
  data,
  onClose,
}: {
  data: AgentNodeData
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-[#111115] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
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

        <div className="p-6 space-y-4">
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-4">
            <p className="text-sm font-semibold text-purple-300 mb-1">Agent testing has moved</p>
            <p className="text-xs text-white/50 leading-relaxed">
              Agents are now agentic workers that operate on your local file system.
              To test this agent, add it to a workflow, select a target directory, and run the workflow.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">System Prompt</p>
            <pre className="text-xs text-white/45 whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto rounded-lg bg-white/3 border border-white/6 px-3 py-2.5">
              {data.systemPrompt || '(no system prompt set)'}
            </pre>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-white/6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-white/8 hover:bg-white/12 text-white/70 text-xs font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
