import type { ReactNode } from 'react'
import { Sparkles, Settings, PenLine, FlaskConical, Wrench, Megaphone, X, ArrowRight } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { softwareFactoryWorkflow, contentFactoryWorkflow, researchLabWorkflow, bugFixWorkflow, marketingCampaignWorkflow } from '../../lib/defaults'
import * as tauri from '../../lib/tauri'

type StarterIcon = 'blank' | 'software' | 'content' | 'research' | 'bugfix' | 'marketing'

const STARTERS: { id: string; iconKey: StarterIcon; name: string; description: string; agentCount: number; color: string; iconBg: string; iconColor: string }[] = [
  {
    id: 'blank', iconKey: 'blank',
    name: 'Blank Canvas',
    description: 'Start with an empty workflow. Add AI agents and connect them however you like.',
    agentCount: 0,
    color: 'border-white/10 hover:border-white/20',
    iconBg: 'bg-white/8', iconColor: 'text-white/50',
  },
  {
    id: 'software-factory', iconKey: 'software',
    name: 'Software Factory',
    description: 'Planner, reviewer, developer, and tester. Describe what to build — the team handles the rest.',
    agentCount: 4,
    color: 'border-purple-500/25 hover:border-purple-500/50',
    iconBg: 'bg-purple-500/12', iconColor: 'text-purple-300',
  },
  {
    id: 'bug-fix', iconKey: 'bugfix',
    name: 'Bug Fix Pipeline',
    description: 'Reads your codebase, diagnoses the bug, implements a fix, and verifies it with a code review loop.',
    agentCount: 4,
    color: 'border-rose-500/25 hover:border-rose-500/50',
    iconBg: 'bg-rose-500/12', iconColor: 'text-rose-300',
  },
  {
    id: 'content-factory', iconKey: 'content',
    name: 'Content Factory',
    description: 'Writer and editor that iterate until the content is polished and publish-ready.',
    agentCount: 3,
    color: 'border-emerald-500/25 hover:border-emerald-500/50',
    iconBg: 'bg-emerald-500/12', iconColor: 'text-emerald-300',
  },
  {
    id: 'research-lab', iconKey: 'research',
    name: 'Research Lab',
    description: 'Researcher and fact-checker that dig deep, then produce a verified polished report.',
    agentCount: 3,
    color: 'border-blue-500/25 hover:border-blue-500/50',
    iconBg: 'bg-blue-500/12', iconColor: 'text-blue-300',
  },
  {
    id: 'marketing-campaign', iconKey: 'marketing',
    name: 'Marketing Campaign',
    description: 'Reviewed copy, platform-optimized social posts, and a campaign email — all from one brief.',
    agentCount: 4,
    color: 'border-orange-500/25 hover:border-orange-500/50',
    iconBg: 'bg-orange-500/12', iconColor: 'text-orange-300',
  },
]

const STARTER_ICON: Record<StarterIcon, ReactNode> = {
  blank: <Sparkles size={18} />,
  software: <Settings size={18} />,
  bugfix: <Wrench size={18} />,
  content: <PenLine size={18} />,
  research: <FlaskConical size={18} />,
  marketing: <Megaphone size={18} />,
}

export default function NewWorkflowModal({ onClose }: { onClose: () => void }) {
  const { createWorkflow, loadWorkflows, setCurrentWorkflow } = useWorkflowStore()
  const { defaultModel } = useSettingsStore()

  async function handleSelect(id: string) {
    if (id === 'blank') {
      await createWorkflow('New Workflow')
    } else {
      const wf =
        id === 'software-factory'    ? softwareFactoryWorkflow(defaultModel) :
        id === 'bug-fix'             ? bugFixWorkflow(defaultModel) :
        id === 'content-factory'     ? contentFactoryWorkflow(defaultModel) :
        id === 'research-lab'        ? researchLabWorkflow(defaultModel) :
        id === 'marketing-campaign'  ? marketingCampaignWorkflow(defaultModel) :
        null
      if (!wf) return
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
            <p className="text-xs text-white/35 mt-0.5">Choose a starting template or begin from scratch</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/25 hover:text-white/60 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Starter cards */}
        <div className="p-6 space-y-2.5">
          {STARTERS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelect(s.id)}
              className={`w-full flex items-start gap-4 p-4 rounded-xl border bg-white/2 hover:bg-white/5 transition-all text-left ${s.color}`}
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${s.iconBg} ${s.iconColor}`}
              >
                {STARTER_ICON[s.iconKey]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-white/90">{s.name}</p>
                  {s.agentCount > 0 && (
                    <span className="text-xs text-white/30 bg-white/6 px-2 py-0.5 rounded-full">
                      {s.agentCount} agents
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/45 leading-relaxed">{s.description}</p>
              </div>
              <ArrowRight size={16} className="text-white/20 shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
