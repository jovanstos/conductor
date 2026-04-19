import { v4 as uuidv4 } from 'uuid'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useRunStore } from '../../stores/runStore'
import type { WorkflowNode, AgentNodeData, LoopNodeData, ReviewGateData } from '../../types'
import { newAgentNodeData } from '../../lib/defaults'

export default function WorkflowListView() {
  const { currentWorkflow, addNode, removeNode, setSelectedNode, selectedNodeId } = useWorkflowStore()
  const { currentRun } = useRunStore()

  if (!currentWorkflow) return null

  const { nodes, edges } = currentWorkflow

  // Topological sort for display order
  const ordered = topoSort(nodes, edges)
  const inner = innerNodeIds(nodes)

  function addAgent() {
    addNode({ id: uuidv4(), type: 'agent', position: { x: 200, y: 200 }, data: newAgentNodeData() })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {ordered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <p className="text-sm text-white/30">No nodes yet. Add an agent to get started.</p>
          </div>
        ) : (
          ordered
            .filter((id) => !inner.has(id))
            .map((id) => {
              const node = nodes.find((n) => n.id === id)
              if (!node) return null
              const step = currentRun?.steps.filter((s) => s.nodeId === id).at(-1)
              return (
                <ListRow
                  key={id}
                  node={node}
                  status={step?.status ?? 'idle'}
                  output={step?.output}
                  selected={selectedNodeId === id}
                  onSelect={() => setSelectedNode(id)}
                  onDelete={() => removeNode(id)}
                  innerNodes={nodes}
                />
              )
            })
        )}
      </div>

      {/* Add node toolbar */}
      <div className="border-t border-white/5 px-4 py-2.5 flex gap-2">
        <AddBtn onClick={addAgent} label="+ Agent" />
        <AddBtn
          onClick={() =>
            addNode({
              id: uuidv4(),
              type: 'loop',
              position: { x: 200, y: 200 },
              data: { targetNodeId: '', reviewerNodeId: '', maxRetries: 3, exitCondition: 'reviewer_approves' } satisfies LoopNodeData,
            })
          }
          label="↻ Loop"
        />
        <AddBtn
          onClick={() =>
            addNode({
              id: uuidv4(),
              type: 'review_gate',
              position: { x: 200, y: 200 },
              data: { message: 'Review and approve to continue.', allowEdit: true } satisfies ReviewGateData,
            })
          }
          label="◉ Gate"
        />
      </div>
    </div>
  )
}

function ListRow({
  node,
  status,
  output,
  selected,
  onSelect,
  onDelete,
  innerNodes,
}: {
  node: WorkflowNode
  status: string
  output?: string
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  innerNodes: WorkflowNode[]
}) {
  const { type } = node

  const icon = type === 'agent' ? '✦' : type === 'loop' ? '↻' : '◉'
  const accentColor =
    type === 'agent'
      ? 'border-l-purple-500/40'
      : type === 'loop'
        ? 'border-l-amber-500/40'
        : 'border-l-blue-500/40'

  const statusColor =
    status === 'done'
      ? 'text-green-400'
      : status === 'running'
        ? 'text-purple-400 animate-pulse'
        : status === 'error'
          ? 'text-red-400'
          : 'text-white/20'

  function getName(): string {
    if (type === 'agent') return (node.data as AgentNodeData).name
    if (type === 'loop') {
      const d = node.data as LoopNodeData
      const t = innerNodes.find((n) => n.id === d.targetNodeId)
      const r = innerNodes.find((n) => n.id === d.reviewerNodeId)
      const tName = (t?.data as { name?: string })?.name ?? '?'
      const rName = (r?.data as { name?: string })?.name ?? '?'
      return `Loop: ${tName} → ${rName}`
    }
    return 'Review Gate'
  }

  function getSubtitle(): string {
    if (type === 'agent') return (node.data as AgentNodeData).roleDescription
    if (type === 'loop') return `Max ${(node.data as LoopNodeData).maxRetries} retries`
    return (node.data as ReviewGateData).message.slice(0, 60) + '...'
  }

  return (
    <div
      className={`border border-white/8 border-l-2 ${accentColor} rounded-lg overflow-hidden cursor-pointer transition-all ${
        selected ? 'bg-[#1a1a24] border-white/15' : 'bg-[#141418] hover:bg-[#18181e]'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="text-sm text-white/40">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/80 font-medium truncate">{getName()}</p>
          <p className="text-[11px] text-white/35 truncate">{getSubtitle()}</p>
        </div>
        <span className={`text-[10px] font-mono ${statusColor}`}>{status}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-white/15 hover:text-red-400 text-xs transition-colors ml-1"
        >
          ✕
        </button>
      </div>

      {output && (
        <div className="px-3 pb-2.5 border-t border-white/5">
          <p className="text-[11px] text-white/40 leading-relaxed line-clamp-3 pt-2">{output}</p>
        </div>
      )}
    </div>
  )
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="bg-white/5 hover:bg-white/8 border border-white/10 text-white/45 hover:text-white/70 text-xs px-3 py-1.5 rounded-md transition-colors"
    >
      {label}
    </button>
  )
}

function topoSort(nodes: WorkflowNode[], edges: { sourceNodeId: string; targetNodeId: string }[]): string[] {
  const indegree = new Map(nodes.map((n) => [n.id, 0]))
  const adj = new Map(nodes.map((n) => [n.id, [] as string[]]))
  for (const e of edges) {
    adj.get(e.sourceNodeId)?.push(e.targetNodeId)
    indegree.set(e.targetNodeId, (indegree.get(e.targetNodeId) ?? 0) + 1)
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id)
  const result: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    result.push(id)
    for (const nb of adj.get(id) ?? []) {
      const deg = (indegree.get(nb) ?? 1) - 1
      indegree.set(nb, deg)
      if (deg === 0) queue.push(nb)
    }
  }
  return result
}

function innerNodeIds(nodes: WorkflowNode[]): Set<string> {
  const set = new Set<string>()
  for (const n of nodes) {
    if (n.type === 'loop') {
      const d = n.data as LoopNodeData
      set.add(d.targetNodeId)
      set.add(d.reviewerNodeId)
    }
  }
  return set
}
