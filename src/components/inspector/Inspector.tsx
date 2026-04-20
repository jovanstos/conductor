import { X } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflowStore'
import type { WorkflowNode, AgentNodeData, LoopNodeData, ReviewGateData } from '../../types'
import AgentInspector from './AgentInspector'

export default function Inspector() {
  const { currentWorkflow, selectedNodeId, setSelectedNode } = useWorkflowStore()

  const selectedNode = currentWorkflow?.nodes.find((n) => n.id === selectedNodeId)

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
    loop: 'Loop Node',
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

function LoopInspector({ node }: { node: WorkflowNode }) {
  const { currentWorkflow, updateNode } = useWorkflowStore()
  const d = node.data as LoopNodeData
  const agentNodes = currentWorkflow?.nodes.filter((n) => n.type === 'agent') ?? []

  const sameAgent = d.targetNodeId && d.reviewerNodeId && d.targetNodeId === d.reviewerNodeId
  const missingTarget = !d.targetNodeId
  const missingReviewer = !d.reviewerNodeId
  const noAgents = agentNodes.length === 0

  return (
    <div className="space-y-4">
      {/* What is a loop — plain language */}
      <div className="bg-white/3 rounded-lg px-3 py-2.5 text-[11px] text-white/40 leading-relaxed">
        A loop has one agent do work, then another agent review it. If the reviewer isn't satisfied, the worker tries again — up to the max retries you set.
      </div>

      {/* Validation banner */}
      {noAgents ? (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2.5 text-[11px] text-amber-300/80 leading-relaxed">
          No agents in this workflow yet. Add Agent nodes to the canvas first, then assign them here.
        </div>
      ) : sameAgent ? (
        <div className="bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2.5 text-[11px] text-red-300/80">
          Worker and reviewer can't be the same agent. Assign two different agents.
        </div>
      ) : (missingTarget || missingReviewer) ? (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2.5 text-[11px] text-amber-300/80">
          {missingTarget && missingReviewer ? 'Assign both a worker and a reviewer to run this loop.' : missingTarget ? 'Assign a worker agent.' : 'Assign a reviewer agent.'}
        </div>
      ) : null}

      <Field label="Worker — does the task">
        <select
          className={`${selectCls} ${missingTarget ? 'border-amber-500/40' : ''}`}
          value={d.targetNodeId}
          onChange={(e) => updateNode(node.id, { data: { ...d, targetNodeId: e.target.value } })}
        >
          <option style={optStyle} value="">— select agent —</option>
          {agentNodes.map((n) => (
            <option style={optStyle} key={n.id} value={n.id}>
              {(n.data as AgentNodeData).name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Reviewer — approves or requests changes">
        <select
          className={`${selectCls} ${missingReviewer ? 'border-amber-500/40' : ''}`}
          value={d.reviewerNodeId}
          onChange={(e) => updateNode(node.id, { data: { ...d, reviewerNodeId: e.target.value } })}
        >
          <option style={optStyle} value="">— select agent —</option>
          {agentNodes.map((n) => (
            <option style={optStyle} key={n.id} value={n.id}>
              {(n.data as AgentNodeData).name}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-white/25 mt-1">
          Reviewer's output must include the word "APPROVED" to exit early.
        </p>
      </Field>

      <Field label="Max attempts">
        <input
          type="number"
          className={inputCls}
          value={d.maxRetries}
          min={1}
          max={10}
          onChange={(e) => updateNode(node.id, { data: { ...d, maxRetries: Number(e.target.value) } })}
        />
        <p className="text-[10px] text-white/25 mt-1">
          How many times the worker can try before giving up.
        </p>
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
      </Field>
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
