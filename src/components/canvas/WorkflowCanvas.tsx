import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type Node as RFNode,
  type Edge as RFEdge,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { v4 as uuidv4 } from 'uuid'
import { useWorkflowStore } from '../../stores/workflowStore'
import type { WorkflowNode, WorkflowEdge, LoopNodeData, ReviewGateData } from '../../types'
import { newAgentNodeData } from '../../lib/defaults'
import AgentNode from './AgentNode'
import LoopNode from './LoopNode'
import ReviewGateNode from './ReviewGateNode'

const NODE_TYPES = { agent: AgentNode, loop: LoopNode, review_gate: ReviewGateNode }

function toRFNode(n: WorkflowNode): RFNode {
  return { id: n.id, type: n.type, position: n.position, data: n.data as Record<string, unknown> }
}

function toRFEdge(e: WorkflowEdge): RFEdge {
  return {
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    style: { stroke: 'rgba(139,92,246,0.5)', strokeWidth: 2 },
    animated: false,
  }
}

export default function WorkflowCanvas() {
  const { currentWorkflow, updateNode, addNode, removeNode, addEdge: storeAddEdge, removeEdge, setSelectedNode } =
    useWorkflowStore()

  const [rfNodes, setRfNodes, onRFNodesChange] = useNodesState<RFNode>(
    currentWorkflow?.nodes.map(toRFNode) ?? [],
  )
  const [rfEdges, setRfEdges, onRFEdgesChange] = useEdgesState<RFEdge>(
    currentWorkflow?.edges.map(toRFEdge) ?? [],
  )

  // Ghost edges: dashed amber lines from each loop node to its inner agents
  const ghostEdges = useMemo<RFEdge[]>(() => {
    if (!currentWorkflow) return []
    return currentWorkflow.nodes
      .filter((n) => n.type === 'loop')
      .flatMap((loopNode) => {
        const d = loopNode.data as LoopNodeData
        const edges: RFEdge[] = []
        if (d.targetNodeId) {
          edges.push({
            id: `__loop-target-${loopNode.id}`,
            source: loopNode.id,
            target: d.targetNodeId,
            style: { stroke: 'rgba(245,158,11,0.45)', strokeDasharray: '5 4', strokeWidth: 1.5 },
            label: 'works',
            labelStyle: { fontSize: 9, fill: 'rgba(245,158,11,0.6)', fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0f0f12', fillOpacity: 0.8 },
            selectable: false,
            deletable: false,
            focusable: false,
            type: 'default',
          })
        }
        if (d.reviewerNodeId) {
          edges.push({
            id: `__loop-reviewer-${loopNode.id}`,
            source: loopNode.id,
            target: d.reviewerNodeId,
            style: { stroke: 'rgba(245,158,11,0.25)', strokeDasharray: '5 4', strokeWidth: 1.5 },
            label: 'reviews',
            labelStyle: { fontSize: 9, fill: 'rgba(245,158,11,0.5)', fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0f0f12', fillOpacity: 0.8 },
            selectable: false,
            deletable: false,
            focusable: false,
            type: 'default',
          })
        }
        return edges
      })
  }, [currentWorkflow?.nodes])

  // Sync store → RF when workflow changes
  useEffect(() => {
    setRfNodes(currentWorkflow?.nodes.map(toRFNode) ?? [])
    setRfEdges(currentWorkflow?.edges.map(toRFEdge) ?? [])
  }, [currentWorkflow?.id, currentWorkflow?.nodes.length, currentWorkflow?.edges.length, setRfNodes, setRfEdges])

  const handleNodesChange = useCallback(
    (changes: NodeChange<RFNode>[]) => {
      onRFNodesChange(changes)
      changes.forEach((c) => {
        if (c.type === 'position' && c.position) {
          updateNode(c.id, { position: c.position })
        }
        if (c.type === 'remove') {
          removeNode(c.id)
        }
      })
    },
    [onRFNodesChange, updateNode, removeNode],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<RFEdge>[]) => {
      onRFEdgesChange(changes)
      changes.forEach((c) => {
        if (c.type === 'remove' && !c.id.startsWith('__loop-')) removeEdge(c.id)
      })
    },
    [onRFEdgesChange, removeEdge],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      const newEdge: WorkflowEdge = {
        id: uuidv4(),
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        contextMode: 'full',
      }
      storeAddEdge(newEdge)
      setRfEdges((eds) =>
        addEdge(
          { ...connection, id: newEdge.id, style: { stroke: 'rgba(139,92,246,0.5)', strokeWidth: 2 } },
          eds,
        ),
      )
    },
    [storeAddEdge, setRfEdges],
  )

  function addAgentNode() {
    const id = uuidv4()
    addNode({
      id,
      type: 'agent',
      position: { x: 80 + (rfNodes.length % 4) * 220, y: 80 + Math.floor(rfNodes.length / 4) * 180 },
      data: newAgentNodeData(),
    })
  }

  function addLoopNode() {
    addNode({
      id: uuidv4(),
      type: 'loop',
      position: { x: 80 + (rfNodes.length % 4) * 220, y: 80 + Math.floor(rfNodes.length / 4) * 180 },
      data: { targetNodeId: '', reviewerNodeId: '', maxRetries: 3, exitCondition: 'reviewer_approves' } satisfies LoopNodeData,
    })
  }

  function addReviewGate() {
    addNode({
      id: uuidv4(),
      type: 'review_gate',
      position: { x: 80 + (rfNodes.length % 4) * 220, y: 80 + Math.floor(rfNodes.length / 4) * 180 },
      data: { message: 'Review the output and decide how to proceed.', allowEdit: true } satisfies ReviewGateData,
    })
  }

  const allEdges = [...rfEdges, ...ghostEdges]

  return (
    <div className="w-full h-full relative">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5">
        <ToolbarBtn onClick={addAgentNode} title="Add Agent" icon="✦" label="Agent" color="purple" />
        <ToolbarBtn onClick={addLoopNode} title="Add Loop" icon="↻" label="Loop" color="amber" />
        <ToolbarBtn onClick={addReviewGate} title="Add Review Gate" icon="◉" label="Gate" color="blue" />
      </div>

      <div className="absolute top-3 right-3 z-10">
        <p className="text-[10px] text-white/20">
          Click a node to edit · Drag output → input to connect · Delete/Backspace to remove
        </p>
      </div>

      <ReactFlow
        nodes={rfNodes}
        edges={allEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        style={{ background: '#0f0f12' }}
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background color="rgba(255,255,255,0.03)" variant={BackgroundVariant.Dots} gap={24} />
        <Controls
          className="!bg-[#1a1a22] !border-white/10 [&>button]:!bg-[#1a1a22] [&>button]:!border-white/10 [&>button]:!text-white/50"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-[#0a0a0d] !border-white/5"
          nodeColor={(n) =>
            n.type === 'loop' ? 'rgba(245,158,11,0.4)' : n.type === 'review_gate' ? 'rgba(96,165,250,0.4)' : 'rgba(168,85,247,0.4)'
          }
          maskColor="rgba(0,0,0,0.6)"
        />
      </ReactFlow>
    </div>
  )
}

function ToolbarBtn({
  onClick,
  title,
  icon,
  label,
  color,
}: {
  onClick: () => void
  title: string
  icon: string
  label: string
  color: 'purple' | 'amber' | 'blue'
}) {
  const colors = {
    purple: 'border-purple-500/30 hover:border-purple-500/60 text-purple-300/70 hover:text-purple-300',
    amber: 'border-amber-500/30 hover:border-amber-500/60 text-amber-300/70 hover:text-amber-300',
    blue: 'border-blue-500/30 hover:border-blue-500/60 text-blue-300/70 hover:text-blue-300',
  }
  return (
    <button
      onClick={onClick}
      title={title}
      className={`bg-[#1a1a22] border ${colors[color]} text-[11px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}
