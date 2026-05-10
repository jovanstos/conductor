import { useEffect, useState } from 'react'
import { Cpu, Swords, Lightbulb, Settings, AlertTriangle, X, Briefcase } from 'lucide-react'
import { useWorkflowStore } from './stores/workflowStore'
import { useRunStore } from './stores/runStore'
import { useSettingsStore } from './stores/settingsStore'
import { useRun } from './hooks/useRun'
import ConductorView from './components/conductor/ConductorView'
import ManagerView from './components/manager/ManagerView'
import ChamberView from './components/chamber/ChamberView'
import StudioView from './components/studio/StudioView'
import SettingsPanel from './components/settings/SettingsPanel'
import ReviewGateModal from './components/run/ReviewGateModal'
import ToolConfirmModal from './components/run/ToolConfirmModal'
import ResultModal from './components/run/ResultModal'

type MainTab = 'conductor' | 'manager' | 'studio' | 'chamber'

export default function App() {
  const { loadWorkflows } = useWorkflowStore()
  const { loadProviderStatuses, loadConfig, openSettings, isOpen: settingsOpen, defaultModel } = useSettingsStore()
  const { currentRun, gateInfo, toolConfirmRequest, showResultModal } = useRunStore()
  const [activeTab, setActiveTab] = useState<MainTab>('conductor')
  const [globalError, setGlobalError] = useState<string | null>(null)

  useRun(currentRun?.id)

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light')
    loadWorkflows()
    loadProviderStatuses()
    loadConfig()
  }, [loadWorkflows, loadProviderStatuses, loadConfig])

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--c-base)', color: 'var(--c-text-1)' }}>
      {/* ── Top nav bar ── */}
      <header
        className="shrink-0 flex items-center px-4 gap-0 border-b"
        style={{ height: '56px', background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 pr-6 mr-3 border-r" style={{ borderColor: 'var(--c-border)' }}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-border)' }}
          >
            <Cpu size={16} style={{ color: 'var(--c-accent)' }} />
          </div>
          <span className="text-base font-bold tracking-tight" style={{ color: 'var(--c-text-1)', fontFamily: 'var(--font-mono)' }}>
            CONDUCTOR
          </span>
        </div>

        {/* Tabs — ordered: Conductor → Manager → Studio → Chamber */}
        <nav className="flex items-center gap-1.5">
          <TabBtn active={activeTab === 'conductor'} onClick={() => setActiveTab('conductor')} icon={<Cpu size={16} />}       label="Conductor" color="blue" />
          <TabBtn active={activeTab === 'manager'}   onClick={() => setActiveTab('manager')}   icon={<Briefcase size={16} />} label="Manager"   color="green" />
          <TabBtn active={activeTab === 'studio'}    onClick={() => setActiveTab('studio')}    icon={<Lightbulb size={16} />} label="Studio"    color="purple" />
          <TabBtn active={activeTab === 'chamber'}   onClick={() => setActiveTab('chamber')}   icon={<Swords size={16} />}    label="Chamber"   color="amber" />
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {defaultModel && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--c-accent)', boxShadow: '0 0 6px var(--c-accent)' }} />
              {defaultModel.modelId}
            </div>
          )}
          {currentRun?.status === 'running' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--c-accent-dim)', color: 'var(--c-accent)', border: '1px solid var(--c-accent-border)' }}>
              <span className="pulse-accent w-2 h-2 rounded-full inline-block" style={{ background: 'var(--c-accent)' }} />
              <span className="font-mono-accent">RUNNING</span>
            </div>
          )}
          <button
            onClick={openSettings}
            className="h-9 px-4 flex items-center gap-2 rounded-lg transition-colors text-sm font-medium"
            style={{ color: 'var(--c-text-2)', background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-text-1)'; e.currentTarget.style.borderColor = 'var(--c-accent-border)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-2)'; e.currentTarget.style.borderColor = 'var(--c-border)' }}
          >
            <Settings size={16} /> Settings
          </button>
        </div>
      </header>

      {/* ── Global error toast ── */}
      {globalError && (
        <div className="mx-4 mt-2 flex items-center gap-2 px-4 py-2.5 rounded text-sm z-20 shrink-0 border"
          style={{ background: 'var(--c-red-dim)', borderColor: 'rgba(255,68,68,0.25)', color: '#ff8888' }}>
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">{globalError}</span>
          <button onClick={() => setGlobalError(null)} style={{ color: 'rgba(255,136,136,0.5)' }}><X size={14} /></button>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'conductor' && <ConductorView onError={setGlobalError} />}
        {activeTab === 'manager'   && <ManagerView />}
        {activeTab === 'studio'    && <StudioView />}
        {activeTab === 'chamber'   && <ChamberView />}
      </main>

      {/* ── Modals ── */}
      {gateInfo && <ReviewGateModal />}
      {toolConfirmRequest && <ToolConfirmModal />}
      {showResultModal && <ResultModal />}
      {settingsOpen && <SettingsPanel />}
    </div>
  )
}

function TabBtn({
  active, onClick, icon, label, color,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  color: 'blue' | 'amber' | 'purple' | 'green'
}) {
  const colors = {
    blue:   { color: 'var(--c-accent)',  bg: 'var(--c-accent-dim)',  border: 'var(--c-accent-border)' },
    green:  { color: 'var(--c-green)',   bg: 'var(--c-green-dim)',   border: 'rgba(34,197,94,0.35)' },
    amber:  { color: 'var(--c-amber)',   bg: 'var(--c-amber-dim)',   border: 'rgba(251,146,60,0.35)' },
    purple: { color: 'var(--c-purple)',  bg: 'var(--c-purple-dim)',  border: 'rgba(192,132,252,0.35)' },
  }
  const c = colors[color]

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold transition-all"
      style={active
        ? { color: c.color, background: c.bg, border: `1px solid ${c.border}` }
        : { color: 'var(--c-text-3)', border: '1px solid transparent' }
      }
      onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'var(--c-text-1)'; e.currentTarget.style.background = 'var(--c-card)' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--c-text-3)'; e.currentTarget.style.background = 'transparent' } }}
    >
      {icon}
      {label}
    </button>
  )
}
