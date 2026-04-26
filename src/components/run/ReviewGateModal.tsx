import { useState } from 'react'
import { GitPullRequest, X, Check, FolderOpen } from 'lucide-react'
import { useRunStore } from '../../stores/runStore'
import { useWorkflowStore } from '../../stores/workflowStore'

export default function ReviewGateModal() {
  const { gateInfo, resumeGate } = useRunStore()
  const { currentWorkflow } = useWorkflowStore()
  const [feedback, setFeedback] = useState('')

  if (!gateInfo) return null

  const workspacePath = currentWorkflow?.settings?.workspacePath

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[540px] bg-[#141418] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-white/8">
          <div className="flex items-center gap-3 mb-1">
            <span className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400">
              <GitPullRequest size={14} />
            </span>
            <h2 className="text-base font-semibold text-white/85">Human Review Required</h2>
          </div>
          <p className="text-sm text-white/45 ml-10 leading-relaxed">{gateInfo.message}</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Instruction */}
          <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-4">
            <p className="text-sm text-white/70 leading-relaxed">
              The agents have finished this phase. Open your workspace directory, review what was created or modified, and decide whether to continue.
            </p>
          </div>

          {/* Workspace path */}
          {workspacePath && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-white/4 border border-white/8 rounded-lg">
              <FolderOpen size={13} className="text-emerald-400 shrink-0" />
              <span className="text-xs font-mono text-white/55 truncate">{workspacePath}</span>
            </div>
          )}

          {/* Feedback — required to reject */}
          <div>
            <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">
              Rejection reason <span className="text-red-400/60 normal-case font-normal">— required to send back for revision</span>
            </p>
            <textarea
              className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/70 outline-none focus:border-red-500/40 resize-none placeholder:text-white/20 leading-relaxed"
              placeholder="Describe what needs to change. This will be sent to the worker agent as feedback."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-white/8 flex items-center gap-3 justify-end">
          <button
            onClick={() => resumeGate('reject', feedback)}
            disabled={!feedback.trim()}
            title={!feedback.trim() ? 'Describe what needs to change before rejecting' : undefined}
            className="flex items-center gap-1.5 bg-white/6 hover:bg-white/10 border border-white/10 text-white/60 text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/6"
          >
            <X size={13} />Send Back for Revision
          </button>
          <button
            onClick={() => resumeGate('approve')}
            className="flex items-center gap-1.5 bg-green-600/80 hover:bg-green-500 text-white text-sm px-5 py-2 rounded-lg transition-colors font-medium"
          >
            <Check size={13} />Looks Good — Continue
          </button>
        </div>
      </div>
    </div>
  )
}
