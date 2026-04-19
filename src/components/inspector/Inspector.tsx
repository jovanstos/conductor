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
            className="text-white/20 hover:text-white/50 text-xs"
          >
            ✕
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

  return (
    <div className="space-y-4">
      <Field label="Target node (does the work)">
        <select
          className={inputCls}
          value={d.targetNodeId}
          onChange={(e) => updateNode(node.id, { data: { ...d, targetNodeId: e.target.value } })}
        >
          <option value="">— select —</option>
          {agentNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {(n.data as AgentNodeData).name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Reviewer node (evaluates)">
        <select
          className={inputCls}
          value={d.reviewerNodeId}
          onChange={(e) => updateNode(node.id, { data: { ...d, reviewerNodeId: e.target.value } })}
        >
          <option value="">— select —</option>
          {agentNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {(n.data as AgentNodeData).name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Max retries">
        <input
          type="number"
          className={inputCls}
          value={d.maxRetries}
          min={1}
          max={10}
          onChange={(e) => updateNode(node.id, { data: { ...d, maxRetries: Number(e.target.value) } })}
        />
      </Field>

      <Field label="Exit condition">
        <select
          className={inputCls}
          value={d.exitCondition}
          onChange={(e) =>
            updateNode(node.id, { data: { ...d, exitCondition: e.target.value as LoopNodeData['exitCondition'] } })
          }
        >
          <option value="reviewer_approves">Exit when reviewer approves</option>
          <option value="max_retries">Always run max retries</option>
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
