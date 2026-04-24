import { useCallback, useEffect, useState, type ReactNode } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { v4 as uuidv4 } from "uuid";
import {
  Play,
  Sparkles,
  RefreshCw,
  GitPullRequest,
  StopCircle,
  Undo2,
  Redo2,
  ChevronsRight,
  X,
} from "lucide-react";
import { useWorkflowStore } from "../../stores/workflowStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type {
  WorkflowNode,
  WorkflowEdge,
  ReviewGateData,
  StartNodeData,
  EndNodeData,
  EdgeContextMode,
  ModelConfig,
} from "../../types";
import { newAgentNodeData, getProviderColor } from "../../lib/defaults";
import ModelPicker from "../shared/ModelPicker";
import AgentNode from "./AgentNode";
import LoopGroupNode, { LOOP_GROUP_W, LOOP_GROUP_H } from "./LoopGroupNode";
import ReviewGateNode from "./ReviewGateNode";
import StartNode from "./StartNode";
import EndNode from "./EndNode";
import DataEdge from "./DataEdge";

const NODE_TYPES = {
  agent: AgentNode,
  loop_group: LoopGroupNode,
  review_gate: ReviewGateNode,
  start: StartNode,
  end: EndNode,
};

const EDGE_TYPES = {
  data: DataEdge,
};

function getModeStyle(mode: EdgeContextMode) {
  if (mode === 'previous') return { stroke: 'rgba(245,158,11,0.55)', strokeDasharray: '6 3', strokeWidth: 1.8 }
  if (mode === 'none')     return { stroke: 'rgba(148,163,184,0.28)', strokeDasharray: '2 5', strokeWidth: 1.5 }
  return { stroke: 'rgba(139,92,246,0.55)', strokeWidth: 1.8 }
}

function toRFNode(n: WorkflowNode): RFNode {
  const base: RFNode = {
    id: n.id,
    type: n.type === 'loop' ? 'loop_group' : n.type,
    position: n.position,
    data: n.data as Record<string, unknown>,
  }
  if (n.parentId) {
    base.parentId = n.parentId
    base.extent = 'parent'
  }
  if (n.type === 'loop') {
    base.style = { width: LOOP_GROUP_W, height: LOOP_GROUP_H }
  }
  return base
}

function toRFEdge(e: WorkflowEdge): RFEdge {
  const mode: EdgeContextMode = (e.contextMode as EdgeContextMode) ?? 'full'
  return {
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: 'data',
    data: { contextMode: mode },
    style: getModeStyle(mode),
    animated: false,
  }
}

export default function WorkflowCanvas() {
  const {
    currentWorkflow,
    updateNode,
    addNode,
    addLoopGroup,
    removeNode,
    addEdge: storeAddEdge,
    removeEdge,
    setSelectedNode,
    setAllAgentModels,
    undo,
    redo,
    canUndo,
    canRedo,
    copySelectedNode,
    pasteNode,
  } = useWorkflowStore();

  const { defaultModel, setDefaultModel } = useSettingsStore();

  const [rfNodes, setRfNodes, onRFNodesChange] = useNodesState<RFNode>(
    currentWorkflow?.nodes.map(toRFNode) ?? [],
  );
  const [rfEdges, setRfEdges, onRFEdgesChange] = useEdgesState<RFEdge>(
    currentWorkflow?.edges.map(toRFEdge) ?? [],
  );

  // Sync store → RF on workflow change
  useEffect(() => {
    setRfNodes(currentWorkflow?.nodes.map(toRFNode) ?? []);
    setRfEdges(currentWorkflow?.edges.map(toRFEdge) ?? []);
  }, [currentWorkflow?.nodes, currentWorkflow?.edges, setRfNodes, setRfEdges]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          redo();
        } else if (e.key === "c") {
          e.preventDefault();
          copySelectedNode();
        } else if (e.key === "v") {
          e.preventDefault();
          pasteNode();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo, copySelectedNode, pasteNode]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<RFNode>[]) => {
      onRFNodesChange(changes);
      changes.forEach((c) => {
        if (c.type === "position" && c.position) {
          updateNode(c.id, { position: c.position });
        }
        if (c.type === "remove") {
          removeNode(c.id);
        }
      });
    },
    [onRFNodesChange, updateNode, removeNode],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<RFEdge>[]) => {
      onRFEdgesChange(changes);
      changes.forEach((c) => {
        if (c.type === "remove") removeEdge(c.id);
      });
    },
    [onRFEdgesChange, removeEdge],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const newEdge: WorkflowEdge = {
        id: uuidv4(),
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        contextMode: "full",
      };
      storeAddEdge(newEdge);
      setRfEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: newEdge.id,
            type: 'data',
            data: { contextMode: 'full' },
            style: getModeStyle('full'),
          },
          eds,
        ),
      );
    },
    [storeAddEdge, setRfEdges],
  );

  // Prevent connecting to/from child nodes of loop groups, self-loops, and End→Start
  const isValidConnection = useCallback(
    (connection: Connection | RFEdge): boolean => {
      if (connection.source === connection.target) return false
      const nodes = currentWorkflow?.nodes ?? []
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      // Child nodes (inside a loop group) cannot have external connections
      if (sourceNode?.parentId || targetNode?.parentId) return false
      // Prevent obvious End→Start cycle
      if (sourceNode?.type === 'end' && targetNode?.type === 'start') return false
      return true
    },
    [currentWorkflow?.nodes],
  )

  function addAgentNode() {
    const id = uuidv4();
    addNode({
      id,
      type: "agent",
      position: {
        x: 300 + (rfNodes.length % 3) * 300,
        y: 160 + Math.floor(rfNodes.length / 3) * 220,
      },
      data: newAgentNodeData({ model: { ...defaultModel } }),
    });
  }

  function addLoopNode() {
    const groupId = uuidv4();
    const workerId = uuidv4();
    const reviewerId = uuidv4();
    addLoopGroup({
      groupId,
      workerId,
      reviewerId,
      position: {
        x: 300 + (rfNodes.length % 3) * 300,
        y: 160 + Math.floor(rfNodes.length / 3) * 300,
      },
    });
  }

  function addReviewGate() {
    addNode({
      id: uuidv4(),
      type: "review_gate",
      position: {
        x: 300 + (rfNodes.length % 3) * 300,
        y: 160 + Math.floor(rfNodes.length / 3) * 220,
      },
      data: {
        message: "Review the output and decide how to proceed.",
        allowEdit: true,
      } satisfies ReviewGateData,
    });
  }

  function addStartNode() {
    addNode({
      id: uuidv4(),
      type: "start",
      position: { x: 60, y: 200 },
      data: {} satisfies StartNodeData,
    });
  }

  function addEndNode() {
    addNode({
      id: uuidv4(),
      type: "end",
      position: {
        x:
          rfNodes.length > 0
            ? Math.max(...rfNodes.map((n) => n.position.x)) + 280
            : 700,
        y: 200,
      },
      data: {} satisfies EndNodeData,
    });
  }

  return (
    <div className="w-full h-full relative">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5 flex-wrap">
        <ToolbarBtn
          onClick={addStartNode}
          title="Add Start node"
          icon={<Play size={11} fill="currentColor" />}
          label="Start"
          color="emerald"
        />
        <ToolbarBtn
          onClick={addAgentNode}
          title="Add Agent"
          icon={<Sparkles size={11} />}
          label="Agent"
          color="purple"
        />
        <ToolbarBtn
          onClick={addLoopNode}
          title="Add Loop (creates worker + reviewer inside)"
          icon={<RefreshCw size={11} />}
          label="Loop"
          color="amber"
        />
        <ToolbarBtn
          onClick={addReviewGate}
          title="Add Review Gate"
          icon={<GitPullRequest size={11} />}
          label="Gate"
          color="blue"
        />
        <ToolbarBtn
          onClick={addEndNode}
          title="Add End node"
          icon={<StopCircle size={11} />}
          label="End"
          color="indigo"
        />
        <div className="w-px bg-white/10 mx-0.5 self-stretch" />
        <ToolbarBtn
          onClick={undo}
          title="Undo (Ctrl+Z)"
          icon={<Undo2 size={11} />}
          label="Undo"
          color="gray"
          disabled={!canUndo}
        />
        <ToolbarBtn
          onClick={redo}
          title="Redo (Ctrl+Y)"
          icon={<Redo2 size={11} />}
          label="Redo"
          color="gray"
          disabled={!canRedo}
        />
        <div className="w-px bg-white/10 mx-0.5 self-stretch" />
        <ModelDefaultControl
          defaultModel={defaultModel}
          onModelChange={setDefaultModel}
          onApplyToAll={() => setAllAgentModels(defaultModel)}
          agentCount={currentWorkflow?.nodes.filter((n) => n.type === 'agent').length ?? 0}
        />
      </div>

      <div className="absolute top-3 right-3 z-10">
        <p className="text-xs text-white/20">
          right-click edge to change context mode · drag <span className="font-mono">ctx →</span> to connect
        </p>
      </div>

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        style={{ background: "#0f0f12" }}
        deleteKeyCode={["Backspace", "Delete"]}
        minZoom={0.2}
        maxZoom={2}
        elevateEdgesOnSelect
        elevateNodesOnSelect={false}
      >
        <Background
          color="rgba(255,255,255,0.03)"
          variant={BackgroundVariant.Dots}
          gap={24}
        />
        <Controls
          className="!bg-[#1a1a22] !border-white/10 [&>button]:!bg-[#1a1a22] [&>button]:!border-white/10 [&>button]:!text-white/50"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-[#0a0a0d] !border-white/5"
          nodeColor={(n) =>
            n.type === "start"
              ? "rgba(52,211,153,0.5)"
              : n.type === "end"
                ? "rgba(99,102,241,0.5)"
                : n.type === "loop_group"
                  ? "rgba(245,158,11,0.35)"
                  : n.type === "review_gate"
                    ? "rgba(96,165,250,0.4)"
                    : "rgba(168,85,247,0.4)"
          }
          maskColor="rgba(0,0,0,0.6)"
        />
      </ReactFlow>
    </div>
  );
}

function ModelDefaultControl({
  defaultModel,
  onModelChange,
  onApplyToAll,
  agentCount,
}: {
  defaultModel: ModelConfig
  onModelChange: (m: ModelConfig) => void
  onApplyToAll: () => void
  agentCount: number
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleApply() {
    if (agentCount === 0) return
    setConfirmOpen(true)
  }

  function confirmApply() {
    onApplyToAll()
    setConfirmOpen(false)
  }

  return (
    <div className="flex items-center gap-1">
      {/* Model selector button */}
      <div className="relative">
        <button
          onClick={() => setPickerOpen((o) => !o)}
          title="Default model — used for new agents"
          className="bg-[#1a1a22] border border-white/10 hover:border-white/20 text-xs px-2.5 py-1.5 rounded-lg text-white/50 hover:text-white/70 flex items-center gap-1.5 transition-colors"
        >
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: getProviderColor(defaultModel.provider) }}
          />
          <span className="max-w-[120px] truncate font-mono">{defaultModel.modelId}</span>
        </button>
        {pickerOpen && (
          <div className="absolute top-full left-0 mt-1 w-72 z-50">
            <ModelPicker
              value={defaultModel}
              onChange={(m) => { onModelChange(m); setPickerOpen(false) }}
            />
          </div>
        )}
        {/* click-away overlay */}
        {pickerOpen && (
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
        )}
      </div>

      {/* Apply to all button */}
      <button
        onClick={handleApply}
        disabled={agentCount === 0}
        title={`Apply current model to all ${agentCount} agents in this workflow`}
        className="bg-[#1a1a22] border border-white/10 hover:border-purple-500/40 text-xs px-2.5 py-1.5 rounded-lg text-white/40 hover:text-purple-300 flex items-center gap-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronsRight size={11} />
        Apply to all
      </button>

      {/* Confirm dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#141418] border border-white/10 rounded-2xl w-80 p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white/85">Apply model to all agents?</p>
                <p className="text-xs text-white/40 mt-1 leading-relaxed">
                  This will set all {agentCount} agent{agentCount !== 1 ? 's' : ''} to{' '}
                  <span className="font-mono text-white/60">{defaultModel.modelId}</span>.
                </p>
              </div>
              <button onClick={() => setConfirmOpen(false)} className="text-white/25 hover:text-white/60 transition-colors shrink-0">
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 text-xs py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmApply}
                className="flex-1 text-xs py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition-colors font-medium"
              >
                Apply to all {agentCount}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolbarBtn({
  onClick,
  title,
  icon,
  label,
  color,
  disabled,
}: {
  onClick: () => void;
  title: string;
  icon: ReactNode;
  label: string;
  color: "purple" | "amber" | "blue" | "emerald" | "indigo" | "gray";
  disabled?: boolean;
}) {
  const colors = {
    purple:
      "border-purple-500/30 hover:border-purple-500/60 text-purple-300/70 hover:text-purple-300",
    amber:
      "border-amber-500/30 hover:border-amber-500/60 text-amber-300/70 hover:text-amber-300",
    blue: "border-blue-500/30 hover:border-blue-500/60 text-blue-300/70 hover:text-blue-300",
    emerald:
      "border-emerald-500/30 hover:border-emerald-500/60 text-emerald-300/70 hover:text-emerald-300",
    indigo:
      "border-indigo-500/30 hover:border-indigo-500/60 text-indigo-300/70 hover:text-indigo-300",
    gray: "border-white/10 hover:border-white/25 text-white/30 hover:text-white/60",
  };
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`bg-[#1a1a22] border ${colors[color]} text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
