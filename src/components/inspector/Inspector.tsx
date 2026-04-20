import { useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflowStore'
import type { WorkflowNode, LoopNodeData, ReviewGateData } from '../../types'
import AgentInspector from './AgentInspector'

export default function Inspector() {
  const { currentWorkflow, selectedNodeId, setSelectedNode } = useWorkflowStore()

  const selectedNode = currentWorkflow?.nodes.find((n) => n.id === selectedNodeId)
  const parentNode = selectedNode?.parentId
    ? currentWorkflow?.nodes.find((n) => n.id === selectedNode.parentId)
    : null

  return (
    <div className="w-full h-full bg-[#0a0a0d] border-l border-white/5 flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
        <p className="text-[10px] text-white/30 uppercase tracking-widest">
          {selectedNode ? nodeTypeLabel(selectedNode.type) : 'Inspector'}
        </p>
        {selectedNode && (
          <button
            onClick={() => setSelectedNode(null)}
            className="text-white/20 hover:text-white/50"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Breadcrumb for child nodes inside a loop group */}
        {parentNode && (
          <button
            className="flex items-center gap-1.5 text-[10px] text-amber-400/50 hover:text-amber-400/80 transition-colors mb-4 -mt-1"
            onClick={() => setSelectedNode(parentNode.id)}
          >
            <ArrowLeft size={10} />
            Back to Loop Group
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
          <p className="text-sm text-white/30">No editor for this node type.</p>
        )}
      </div>
    </div>
  )
}

function nodeTypeLabel(type: string): string {
  const map: Record<string, string> = {
    agent: 'Agent Node',
    loop: 'Loop Group',
    review_gate: 'Review Gate',
  }
  return map[type] ?? 'Node'
}

function WorkflowSettings() {
  const { currentWorkflow, updateWorkflowMeta } = useWorkflowStore()
  if (!currentWorkflow) return <p className="text-sm text-white/30">Select a node to edit it.</p>

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-white/25">Select a node on the canvas to edit it, or update workflow settings below.</p>
      <div>
        <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1.5">Workflow name</p>
        <input
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/75 outline-none focus:border-purple-500/50"
          value={currentWorkflow.name}
          onChange={(e) => updateWorkflowMeta({ name: e.target.value })}
        />
      </div>
      <div>
        <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1.5">Description</p>
        <textarea
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/75 outline-none focus:border-purple-500/50 h-20 resize-none"
          value={currentWorkflow.description}
          onChange={(e) => updateWorkflowMeta({ description: e.target.value })}
        />
      </div>
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
      <div className="flex gap-1 bg-white/4 rounded-lg p-1">
        {(['loop', 'worker', 'reviewer'] as LoopTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-[10px] py-1.5 rounded-md transition-colors capitalize ${
              activeTab === tab
                ? 'bg-amber-500/20 text-amber-300/90 font-medium'
                : 'text-white/35 hover:text-white/60'
            }`}
          >
            {tab === 'loop' ? 'Loop' : tab === 'worker' ? 'Worker' : 'Reviewer'}
          </button>
        ))}
      </div>

      {activeTab === 'loop' && (
        <div className="space-y-4">
          <div className="bg-white/3 rounded-lg px-3 py-2.5 text-[11px] text-white/40 leading-relaxed">
            The worker runs the task. The reviewer checks it. If the reviewer isn't satisfied, the worker tries again — up to the max you set.
          </div>

          <Field label="Max attempts">
            <input
              type="number"
              className={inputCls}
              value={d.maxRetries}
              min={1}
              max={10}
              onChange={(e) => updateNode(node.id, { data: { ...d, maxRetries: Number(e.target.value) } })}
            />
            <p className="text-[10px] text-white/25 mt-1">How many times the worker can try before giving up.</p>
          </Field>

          <Field label="Exit condition">
            <select
              className={selectCls}
              value={d.exitCondition}
              onChange={(e) =>
                updateNode(node.id, { data: { ...d, exitCondition: e.target.value as LoopNodeData['exitCondition'] } })
              }
            >
              <option style={optStyle} value="reviewer_approves">Stop as soon as reviewer approves</option>
              <option style={optStyle} value="max_retries">Always run all attempts</option>
            </select>
            <p className="text-[10px] text-white/25 mt-1">
              Reviewer must include "APPROVED" in its response to exit early.
            </p>
          </Field>

          <div className="border-t border-white/5 pt-3">
            <p className="text-[10px] text-white/25 mb-2">Quick access</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setActiveTab('worker'); workerNode && setSelectedNode(workerNode.id) }}
                className="flex-1 text-[10px] py-2 rounded-lg border border-purple-500/20 text-purple-300/50 hover:border-purple-500/40 hover:text-purple-300/80 transition-colors"
              >
                Edit Worker →
              </button>
              <button
                onClick={() => { setActiveTab('reviewer'); reviewerNode && setSelectedNode(reviewerNode.id) }}
                className="flex-1 text-[10px] py-2 rounded-lg border border-sky-500/20 text-sky-300/50 hover:border-sky-500/40 hover:text-sky-300/80 transition-colors"
              >
                Edit Reviewer →
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'worker' && (
        workerNode
          ? <AgentInspector node={workerNode} />
          : <p className="text-[11px] text-white/30">Worker agent not found.</p>
      )}

      {activeTab === 'reviewer' && (
        reviewerNode
          ? <AgentInspector node={reviewerNode} />
          : <p className="text-[11px] text-white/30">Reviewer agent not found.</p>
      )}
    </div>
  )
}

function GateInspector({ node }: { node: WorkflowNode }) {
  const { updateNode } = useWorkflowStore()
  const d = node.data as ReviewGateData

  return (
    <div className="space-y-4">
      <Field label="Gate message">
        <textarea
          className={`${inputCls} h-24 resize-none`}
          value={d.message}
          onChange={(e) => updateNode(node.id, { data: { ...d, message: e.target.value } })}
        />
      </Field>

      <Field label="Options">
        <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
          <input
            type="checkbox"
            checked={d.allowEdit}
            onChange={(e) => updateNode(node.id, { data: { ...d, allowEdit: e.target.checked } })}
            className="accent-purple-500"
          />
          Allow user to manually edit the output
        </label>
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1.5">{label}</p>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/75 outline-none focus:border-purple-500/50 transition-colors'

const selectCls =
  'w-full bg-[#141418] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/75 outline-none focus:border-purple-500/50 transition-colors'

const optStyle = { background: '#141418', color: 'rgba(255,255,255,0.75)' }
