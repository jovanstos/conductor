import { TriangleAlert, Terminal, Trash2 } from 'lucide-react'
import { useRunStore } from '../../stores/runStore'
import { respondToolConfirmation } from '../../lib/tauri'

export default function ToolConfirmModal() {
  const { currentRun, toolConfirmRequest, _setToolConfirmRequest } = useRunStore()

  if (!toolConfirmRequest || !currentRun) return null

  const isShell = toolConfirmRequest.toolName === 'run_shell_command'

  async function respond(approved: boolean) {
    if (!currentRun || !toolConfirmRequest) return
    // Capture before clearing so the modal disappears immediately (prevents double-clicks)
    const runId = currentRun.id
    const { toolCallId } = toolConfirmRequest
    _setToolConfirmRequest(null)
    try {
      await respondToolConfirmation(runId, toolCallId, approved)
    } catch (e) {
      // If the invoke failed the backend is already gone (run cancelled); nothing to do
      console.error('respondToolConfirmation failed:', e)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0e0e14] border border-amber-500/30 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
            {isShell
              ? <Terminal size={20} className="text-amber-400" />
              : <Trash2 size={20} className="text-amber-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-200">Permission required</p>
            <p className="text-xs text-white/50 mt-0.5">
              An agent wants to {isShell ? 'run a shell command' : 'delete a file'}.
            </p>
            <div className="mt-3 bg-black/40 border border-white/8 rounded-lg px-3 py-2.5">
              <p className="text-xs text-white/35 mb-1 uppercase tracking-wide font-medium">
                {isShell ? 'Command' : 'File'}
              </p>
              <pre className="text-xs text-amber-200/80 font-mono whitespace-pre-wrap leading-relaxed">
                {toolConfirmRequest.description}
              </pre>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <TriangleAlert size={11} className="text-amber-500/60 shrink-0" />
              <p className="text-xs text-white/35">
                {isShell
                  ? 'This will execute code on your system. Only allow if you trust this agent.'
                  : 'This will permanently delete the file. This cannot be undone.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            onClick={() => respond(false)}
            className="flex-1 text-sm text-white/50 hover:text-white/80 border border-white/10 hover:border-white/25 py-2 rounded-xl transition-colors"
          >
            Deny
          </button>
          <button
            onClick={() => respond(true)}
            className="flex-1 text-sm font-semibold text-amber-900 bg-amber-400 hover:bg-amber-300 py-2 rounded-xl transition-colors"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  )
}
