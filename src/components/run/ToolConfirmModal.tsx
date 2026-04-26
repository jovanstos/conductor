import { Terminal, Trash2, ShieldAlert, X, Check } from 'lucide-react'
import { useRunStore } from '../../stores/runStore'
import { respondToolConfirmation } from '../../lib/tauri'

export default function ToolConfirmModal() {
  const { currentRun, toolConfirmRequest, _setToolConfirmRequest } = useRunStore()

  if (!toolConfirmRequest || !currentRun) return null

  const isShell = toolConfirmRequest.toolName === 'run_shell_command'

  async function respond(approved: boolean) {
    if (!currentRun || !toolConfirmRequest) return
    const runId = currentRun.id
    const { toolCallId } = toolConfirmRequest
    _setToolConfirmRequest(null)
    try {
      await respondToolConfirmation(runId, toolCallId, approved)
    } catch (e) {
      console.error('respondToolConfirmation failed:', e)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0d0d12] border border-red-500/30 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/6">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isShell ? 'bg-red-500/15' : 'bg-amber-500/15'
          }`}>
            {isShell
              ? <Terminal size={20} className="text-red-400" />
              : <Trash2 size={20} className="text-amber-400" />
            }
          </div>
          <div>
            <p className={`text-sm font-bold ${isShell ? 'text-red-300' : 'text-amber-300'}`}>
              {isShell ? 'Shell Execution Request' : 'File Deletion Request'}
            </p>
            <p className="text-xs text-white/40 mt-0.5">
              Agent <span className="text-white/65 font-medium">{toolConfirmRequest.agentName}</span> is asking permission
            </p>
          </div>
          <div className="ml-auto">
            <ShieldAlert size={16} className={isShell ? 'text-red-500/60' : 'text-amber-500/60'} />
          </div>
        </div>

        {/* Command box */}
        <div className="px-5 py-4">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">
            {isShell ? 'Command to execute' : 'File to delete'}
          </p>
          <div className={`rounded-xl border px-4 py-3 font-mono text-sm leading-relaxed break-all ${
            isShell
              ? 'bg-red-950/20 border-red-500/20 text-red-200/85'
              : 'bg-amber-950/20 border-amber-500/20 text-amber-200/85'
          }`}>
            {toolConfirmRequest.command}
          </div>

          {/* Risk note */}
          <div className="flex items-start gap-2 mt-3">
            <ShieldAlert size={12} className={`mt-0.5 shrink-0 ${isShell ? 'text-red-500/50' : 'text-amber-500/50'}`} />
            <p className="text-xs text-white/35 leading-relaxed">
              {isShell
                ? 'This will run code directly on your computer. Only allow if you recognise this command and trust this agent.'
                : 'This will permanently delete the file from your workspace. This cannot be undone.'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={() => respond(false)}
            className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white border border-white/12 hover:border-white/25 py-2.5 rounded-xl transition-colors"
          >
            <X size={14} />Deny
          </button>
          <button
            onClick={() => respond(true)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-bold py-2.5 rounded-xl transition-colors ${
              isShell
                ? 'bg-red-500/80 hover:bg-red-500 text-white'
                : 'bg-amber-500/80 hover:bg-amber-500 text-black'
            }`}
          >
            <Check size={14} />Allow
          </button>
        </div>
      </div>
    </div>
  )
}
