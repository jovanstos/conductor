import { useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflowStore'
import type { WorkflowNode, LoopNodeData, ReviewGateData } from '../../types'
import AgentInspector from './AgentInspector'

export default function Inspector() {
  const { currentWorkflow, selectedNodeId, setSelectedNode } = useWorkflowStore()
  const selectedNode = currentWorkflow?.nodes.find((n) => n.id === selectedNodeId)
  const parentNode   = selectedNode?.parentId
    ? currentWorkflow?.nodes.find((n) => n.id === selectedNode.parentId)
    : null

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--c-surface)', borderLeft: '1px solid var(--c-border-subtle)' }}>
      {/* Header */}
      <div className="px-4 h-12 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--c-border-subtle)' }}>
        <p className="text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>
          {selectedNode ? nodeTypeLabel(selectedNode.type) : 'Workflow'}
        </p>
        {selectedNode && (
          <button
            onClick={() => setSelectedNode(null)}
            className="transition-colors p-1 rounded"
            style={{ color: 'var(--c-text-dim)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--c-text-2)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--c-text-dim)')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {parentNode && (
          <button
            className="flex items-center gap-1.5 text-xs mb-4 -mt-1 transition-colors"
            style={{ color: 'rgba(251,191,36,0.6)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(251,191,36,0.9)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(251,191,36,0.6)')}
            onClick={() => setSelectedNode(parentNode.id)}
          >
            <ArrowLeft size={12} /> Back to Loop
          </button>
        )}

        {!selectedNode ? (
          <WorkflowSettings />
        ) : selectedNode.type === 'agent' ? (
          <AgentInspector node={selectedNode} />
        ) : selectedNode.type === 'loop' ? (
          <LoopInspector node={selectedNode} />
        ) : selectedNode.type === 'review_gate' ? (
          <GateInspector node={selectedNode} />
        ) : (
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>No editor for this node type.</p>
        )}
      </div>
    </div>
  )
}

function nodeTypeLabel(type: string): string {
  const map: Record<string, string> = { agent: 'Agent', loop: 'Loop', review_gate: 'Gate' }
  return map[type] ?? 'Node'
}

function WorkflowSettings() {
  const { currentWorkflow, updateWorkflowMeta } = useWorkflowStore()
  if (!currentWorkflow) return (
    <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Select a node on the canvas to edit it.</p>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-dim)' }}>
        Select a node to configure it, or edit workflow details below.
      </p>
      <Field label="Name">
        <input className={iCls} value={currentWorkflow.name} onChange={(e) => updateWorkflowMeta({ name: e.target.value })} />
      </Field>
      <Field label="Description">
        <textarea
          className={`${iCls} h-20 resize-none`}
          value={currentWorkflow.description}
          onChange={(e) => updateWorkflowMeta({ description: e.target.value })}
        />
      </Field>
    </div>
  )
}

type LoopTab = 'loop' | 'worker' | 'reviewer'

function LoopInspector({ node }: { node: WorkflowNode }) {
  const { currentWorkflow, updateNode, setSelectedNode } = useWorkflowStore()
  const d = node.data as LoopNodeData
  const [activeTab, setActiveTab] = useState<LoopTab>('loop')
  const workerNode   = currentWorkflow?.nodes.find((n) => n.id === d.targetNodeId)
  const reviewerNode = currentWorkflow?.nodes.find((n) => n.id === d.reviewerNodeId)

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--c-input)' }}>
        {(['loop', 'worker', 'reviewer'] as LoopTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 text-xs py-1.5 rounded-lg transition-all font-medium capitalize"
            style={activeTab === tab
              ? { background: 'var(--c-surface)', color: 'var(--c-text-1)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
              : { color: 'var(--c-text-3)' }
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'loop' && (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed rounded-xl px-3 py-2.5" style={{ color: 'var(--c-text-3)', background: 'var(--c-input)' }}>
            The worker runs the task. The reviewer checks it. If not satisfied, the worker tries again — up to the max you set.
          </p>
          <Field label="Max attempts">
            <input type="number" className={iCls} value={d.maxRetries} min={1} max={10}
              onChange={(e) => updateNode(node.id, { data: { ...d, maxRetries: Number(e.target.value) } })} />
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-dim)' }}>How many times the worker can try before giving up.</p>
          </Field>
          <Field label="Exit condition">
            <select className={sCls} value={d.exitCondition}
              onChange={(e) => updateNode(node.id, { data: { ...d, exitCondition: e.target.value as LoopNodeData['exitCondition'] } })}>
              <option value="reviewer_approves">Stop as soon as reviewer approves</option>
              <option value="max_retries">Always run all attempts</option>
            </select>
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-dim)' }}>Reviewer must include "APPROVED" to exit early.</p>
          </Field>
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setActiveTab('worker'); workerNode && setSelectedNode(workerNode.id) }}
              className="flex-1 text-xs py-2 rounded-xl transition-colors border border-purple-500/20 text-purple-400/60 hover:border-purple-500/40 hover:text-purple-400">
              Edit Worker
            </button>
            <button onClick={() => { setActiveTab('reviewer'); reviewerNode && setSelectedNode(reviewerNode.id) }}
              className="flex-1 text-xs py-2 rounded-xl transition-colors border border-sky-500/20 text-sky-400/60 hover:border-sky-500/40 hover:text-sky-400">
              Edit Reviewer
            </button>
          </div>
        </div>
      )}

      {activeTab === 'worker' && (
        workerNode ? <AgentInspector node={workerNode} /> : <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Worker not found.</p>
      )}
      {activeTab === 'reviewer' && (
        reviewerNode ? <AgentInspector node={reviewerNode} /> : <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Reviewer not found.</p>
      )}
    </div>
  )
}

function GateInspector({ node }: { node: WorkflowNode }) {
  const { updateNode } = useWorkflowStore()
  const d = node.data as ReviewGateData
  return (
    <div className="space-y-4">
      <Field label="Message shown to reviewer">
        <textarea className={`${iCls} h-24 resize-none`} value={d.message}
          onChange={(e) => updateNode(node.id, { data: { ...d, message: e.target.value } })} />
      </Field>
      <Field label="Options">
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--c-text-2)' }}>
          <input type="checkbox" checked={d.allowEdit}
            onChange={(e) => updateNode(node.id, { data: { ...d, allowEdit: e.target.checked } })}
            className="accent-purple-500" />
          Allow editing the output before continuing
        </label>
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>{label}</p>
      {children}
    </div>
  )
}

// These classes rely on CSS vars defined in index.css
const iCls = 'w-full rounded-xl px-3 py-2 text-sm outline-none transition-colors conductor-input'
const sCls = 'w-full rounded-xl px-3 py-2 text-sm outline-none transition-colors conductor-input'
