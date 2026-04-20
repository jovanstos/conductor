import { useCallback, useEffect, type ReactNode } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
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
} from "lucide-react";
import { useWorkflowStore } from "../../stores/workflowStore";
import type {
  WorkflowNode,
  WorkflowEdge,
  LoopNodeData,
  ReviewGateData,
  StartNodeData,
  EndNodeData,
} from "../../types";
import { newAgentNodeData } from "../../lib/defaults";
import AgentNode from "./AgentNode";
import LoopNode from "./LoopNode";
import ReviewGateNode from "./ReviewGateNode";
import StartNode from "./StartNode";
import EndNode from "./EndNode";
import ButtonEdge from "./ButtonEdge";

const NODE_TYPES = {
  agent: AgentNode,
  loop: LoopNode,
  review_gate: ReviewGateNode,
  start: StartNode,
  end: EndNode,
};

const EDGE_TYPES = {
  default: ButtonEdge,
};

function toRFNode(n: WorkflowNode): RFNode {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data as Record<string, unknown>,
  };
}

const EDGE_STYLE = {
  stroke: "rgba(139,92,246,0.45)",
  strokeWidth: 2,
} as const;

const EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  color: "rgba(139,92,246,0.6)",
  width: 14,
  height: 14,
} as const;

function toRFEdge(e: WorkflowEdge): RFEdge {
  return {
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    style: EDGE_STYLE,
    markerEnd: EDGE_MARKER,
    animated: false,
  };
}

export default function WorkflowCanvas() {
  const {
    currentWorkflow,
    updateNode,
    addNode,
    removeNode,
    addEdge: storeAddEdge,
    removeEdge,
    setSelectedNode,
    undo,
    redo,
    canUndo,
    canRedo,
    copySelectedNode,
    pasteNode,
  } = useWorkflowStore();

  const [rfNodes, setRfNodes, onRFNodesChange] = useNodesState<RFNode>(
    currentWorkflow?.nodes.map(toRFNode) ?? [],
  );
  const [rfEdges, setRfEdges, onRFEdgesChange] = useEdgesState<RFEdge>(
    currentWorkflow?.edges.map(toRFEdge) ?? [],
  );

  // Sync store → RF when any node data or edge changes
  useEffect(() => {
    setRfNodes(currentWorkflow?.nodes.map(toRFNode) ?? []);
    setRfEdges(currentWorkflow?.edges.map(toRFEdge) ?? []);
  }, [currentWorkflow?.nodes, currentWorkflow?.edges, setRfNodes, setRfEdges]);

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y/Ctrl+Shift+Z redo, Ctrl+C copy, Ctrl+V paste
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
        contextMode: "full",
      };
      storeAddEdge(newEdge);
      setRfEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: newEdge.id,
            style: EDGE_STYLE,
            markerEnd: EDGE_MARKER,
          },
          eds,
        ),
      );
    },
    [storeAddEdge, setRfEdges],
  );

  function addAgentNode() {
    const id = uuidv4();
    addNode({
      id,
      type: "agent",
      position: {
        x: 300 + (rfNodes.length % 3) * 240,
        y: 160 + Math.floor(rfNodes.length / 3) * 200,
      },
      data: newAgentNodeData(),
    });
  }

  function addLoopNode() {
    addNode({
      id: uuidv4(),
      type: "loop",
      position: {
        x: 300 + (rfNodes.length % 3) * 240,
        y: 160 + Math.floor(rfNodes.length / 3) * 200,
      },
      data: {
        targetNodeId: "",
        reviewerNodeId: "",
        maxRetries: 3,
        exitCondition: "reviewer_approves",
      } satisfies LoopNodeData,
    });
  }

  function addReviewGate() {
    addNode({
      id: uuidv4(),
      type: "review_gate",
      position: {
        x: 300 + (rfNodes.length % 3) * 240,
        y: 160 + Math.floor(rfNodes.length / 3) * 200,
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
            ? Math.max(...rfNodes.map((n) => n.position.x)) + 240
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
          title="Add Loop"
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
      </div>

      <div className="absolute top-3 right-3 z-10">
        <p className="text-xs text-white/25">
          IN ● = receives data &nbsp;·&nbsp; ● OUT = sends data &nbsp;·&nbsp; drag OUT → IN to connect
        </p>
      </div>

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        style={{ background: "#0f0f12" }}
        deleteKeyCode={["Backspace", "Delete"]}
        minZoom={0.3}
        maxZoom={2}
        elevateEdgesOnSelect
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
                : n.type === "loop"
                  ? "rgba(245,158,11,0.4)"
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
