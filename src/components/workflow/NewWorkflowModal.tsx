import { useWorkflowStore } from '../../stores/workflowStore'
import { softwareFactoryWorkflow } from '../../lib/defaults'
import * as tauri from '../../lib/tauri'

const STARTERS = [
  {
    id: 'blank',
    icon: '✦',
    name: 'Blank Canvas',
    description: 'Start with an empty workflow. Add AI agents and connect them however you like.',
    agentCount: 0,
    color: 'border-white/10 hover:border-white/20',
    iconBg: 'bg-white/8',
  },
  {
    id: 'software-factory',
    icon: '⚙',
    name: 'Software Factory',
    description:
      'A complete AI team: planner, reviewer, developer, and tester. Describe what you want to build — they handle the rest.',
    agentCount: 4,
    color: 'border-purple-500/25 hover:border-purple-500/50',
    iconBg: 'bg-purple-500/12',
  },
]

export default function NewWorkflowModal({ onClose }: { onClose: () => void }) {
  const { createWorkflow, loadWorkflows, setCurrentWorkflow } = useWorkflowStore()

  async function handleSelect(id: string) {
    if (id === 'blank') {
      await createWorkflow('New Workflow')
    } else if (id === 'software-factory') {
      const wf = softwareFactoryWorkflow()
      await tauri.saveWorkflow(wf)
      await loadWorkflows()
      setCurrentWorkflow(wf)
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-xl bg-[#0e0e13] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
          <div>
            <p className="text-base font-bold text-white/90">New Workflow</p>
            <p className="text-xs text-white/35 mt-0.5">Choose how you'd like to start</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/25 hover:text-white/60 text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Starter cards */}
        <div className="p-6 space-y-3">
          {STARTERS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelect(s.id)}
              className={`w-full flex items-start gap-4 p-4 rounded-xl border bg-white/2 hover:bg-white/5 transition-all text-left ${s.color}`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${s.iconBg}`}
              >
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-white/90">{s.name}</p>
                  {s.agentCount > 0 && (
                    <span className="text-[10px] text-white/30 bg-white/6 px-2 py-0.5 rounded-full">
                      {s.agentCount} agents included
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/45 leading-relaxed">{s.description}</p>
              </div>
              <span className="text-white/20 text-lg shrink-0 mt-1">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
