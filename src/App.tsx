import { useEffect, useState } from "react";
import { Play, Square, AlertTriangle, X, Sparkles, Swords } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useWorkflowStore } from "./stores/workflowStore";
import { useRunStore } from "./stores/runStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useRun } from "./hooks/useRun";
import Sidebar from "./components/Sidebar";
import NewWorkflowModal from "./components/workflow/NewWorkflowModal";
import WorkflowCanvas from "./components/canvas/WorkflowCanvas";
import Inspector from "./components/inspector/Inspector";
import RunDrawer from "./components/run/RunDrawer";
import RunHistoryDrawer from "./components/run/RunHistoryDrawer";
import ReviewGateModal from "./components/run/ReviewGateModal";
import ToolConfirmModal from "./components/run/ToolConfirmModal";
import ResultModal from "./components/run/ResultModal";
import SettingsPanel from "./components/settings/SettingsPanel";
import ChamberView from "./components/chamber/ChamberView";
import WorkspaceBar from "./components/workspace/WorkspaceBar";
// TODO
// Create new prompt creator tab to help users work out ideas and prompt structures
// Make it so agents can read pdfs and other doc types

type MainTab = "workflow" | "chamber";

const SIDEBAR_DEFAULT = 200;
const INSPECTOR_DEFAULT = 300;
const DRAWER_DEFAULT = 280;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function App() {
  const {
    loadWorkflows,
    currentWorkflow,
    taskInput,
    setTaskInput,
    setWorkspacePath,
  } = useWorkflowStore();
  const {
    cancelRun,
    startRun,
    isRunning,
    currentRun,
    gateInfo,
    toolConfirmRequest,
    showResultModal,
  } = useRunStore();
  const {
    loadProviderStatuses,
    loadConfig,
    isOpen: settingsOpen,
    theme,
  } = useSettingsStore();

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT);
  const [drawerHeight, setDrawerHeight] = useState(DRAWER_DEFAULT);
  const [runError, setRunError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>("workflow");
  const [isStarting, setIsStarting] = useState(false);

  useRun(currentRun?.id);

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    loadWorkflows();
    loadProviderStatuses();
    loadConfig();
  }, [loadWorkflows, loadProviderStatuses, loadConfig]);

  async function handleRun() {
    if (!currentWorkflow || !taskInput.trim() || isRunning || isStarting)
      return;

    const agents = currentWorkflow.nodes.filter((n) => n.type === "agent");
    if (agents.length === 0) {
      setRunError("Add at least one Agent node to the canvas first.");
      return;
    }

    const badLoop = currentWorkflow.nodes.find((n) => {
      if (n.type !== "loop") return false;
      const d = n.data as import("./types").LoopNodeData;
      return !d.targetNodeId || !d.reviewerNodeId;
    });
    if (badLoop) {
      setRunError(
        "A Loop node isn't fully configured — click it to assign a Worker and Reviewer.",
      );
      return;
    }

    // Ensure we have a workspace — open picker if not set
    let workspace = currentWorkflow.settings?.workspacePath;
    if (!workspace) {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Workspace Directory",
      });
      if (!selected || typeof selected !== "string") return;
      setWorkspacePath(selected);
      workspace = selected;
    }

    setRunError(null);
    setIsStarting(true);
    try {
      await startRun(currentWorkflow.id, taskInput, workspace);
    } catch (e: unknown) {
      const msg = String(e);
      if (msg.includes("WORKSPACE_REQUIRED")) {
        setRunError("Please select a workspace directory before running.");
      } else {
        setRunError(msg);
      }
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--c-base)", color: "var(--c-text-1)" }}
    >
      {/* ── Sidebar ── */}
      <div className="shrink-0 h-full" style={{ width: sidebarWidth }}>
        <Sidebar />
      </div>

      <DragHandle
        direction="h"
        onDelta={(d) => setSidebarWidth((w) => clamp(w + d, 140, 380))}
      />

      {/* ── Center column ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Tab bar */}
        <div
          className="h-12 shrink-0 flex items-center border-b"
          style={{
            borderColor: "var(--c-border-subtle)",
            background: "var(--c-surface)",
          }}
        >
          <div className="flex items-center h-full px-3 gap-0.5">
            <TabButton
              active={activeTab === "workflow"}
              onClick={() => setActiveTab("workflow")}
              icon={<Sparkles size={13} />}
              label="Workflow"
            />
            <TabButton
              active={activeTab === "chamber"}
              onClick={() => setActiveTab("chamber")}
              icon={<Swords size={13} />}
              label="Chamber"
              accent="amber"
            />
          </div>

          {/* Workflow task bar — only on workflow tab */}
          {activeTab === "workflow" && currentWorkflow && (
            <div className="ml-auto flex items-center gap-2 px-4">
              <span
                className="text-sm truncate max-w-[160px]"
                style={{ color: "var(--c-text-3)" }}
              >
                {currentWorkflow.name}
              </span>
              <div
                className="w-px h-4 mx-1"
                style={{ background: "var(--c-border)" }}
              />
              <input
                className="w-56 rounded-lg px-3 py-1.5 text-sm outline-none transition-colors"
                style={{
                  background: "var(--c-input)",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-text-1)",
                }}
                placeholder="Describe your task..."
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRun()}
                disabled={isRunning || isStarting}
              />
              {isRunning ? (
                <button
                  onClick={cancelRun}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors border border-red-500/20"
                >
                  <Square size={11} fill="currentColor" /> Stop
                </button>
              ) : (
                <button
                  onClick={handleRun}
                  disabled={!taskInput.trim() || isStarting}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
                >
                  <Play size={11} fill="currentColor" />
                  {isStarting ? "Starting…" : "Run"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Workspace anchor bar — visible on workflow tab whenever a workflow is open */}
        {activeTab === "workflow" && <WorkspaceBar />}

        {/* Error toast */}
        {runError && activeTab === "workflow" && (
          <div
            className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs z-20 border"
            style={{
              background: "rgba(239,68,68,0.08)",
              borderColor: "rgba(239,68,68,0.2)",
              color: "rgb(252,165,165)",
            }}
          >
            <AlertTriangle size={13} className="shrink-0" />
            <span className="flex-1">{runError}</span>
            <button
              onClick={() => setRunError(null)}
              style={{ color: "rgba(252,165,165,0.5)" }}
              className="hover:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Main content */}
        {activeTab === "chamber" ? (
          <div className="flex-1 overflow-hidden">
            <ChamberView />
          </div>
        ) : (
          <>
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-hidden">
                {!currentWorkflow ? <EmptyState /> : <WorkflowCanvas />}
              </div>
              {currentWorkflow && (
                <>
                  <DragHandle
                    direction="h"
                    onDelta={(d) =>
                      setInspectorWidth((w) => clamp(w - d, 220, 520))
                    }
                  />
                  <div
                    className="shrink-0 h-full"
                    style={{ width: inspectorWidth }}
                  >
                    <Inspector />
                  </div>
                </>
              )}
            </div>
            {currentRun && (
              <>
                <DragHandle
                  direction="v"
                  onDelta={(d) => setDrawerHeight((h) => clamp(h - d, 80, 600))}
                />
                <RunDrawer height={drawerHeight} />
              </>
            )}
          </>
        )}
      </div>

      {showHistory && currentWorkflow && (
        <RunHistoryDrawer
          workflowId={currentWorkflow.id}
          onClose={() => setShowHistory(false)}
        />
      )}
      {gateInfo && <ReviewGateModal />}
      {toolConfirmRequest && <ToolConfirmModal />}
      {showResultModal && <ResultModal />}
      {settingsOpen && <SettingsPanel />}
    </div>
  );
}

// ── Tab button ──────────────────────────────────────────────────────
function TabButton({
  active,
  onClick,
  icon,
  label,
  accent = "purple",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent?: "purple" | "amber";
}) {
  const activeStyle =
    accent === "amber"
      ? { color: "rgb(252,176,69)", background: "rgba(245,158,11,0.1)" }
      : { color: "var(--c-text-1)", background: "var(--c-surface-alt)" };

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium transition-all"
      style={active ? activeStyle : { color: "var(--c-text-3)" }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Drag handle ─────────────────────────────────────────────────────
function DragHandle({
  direction,
  onDelta,
}: {
  direction: "h" | "v";
  onDelta: (d: number) => void;
}) {
  const isH = direction === "h";

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    let prev = isH ? e.clientX : e.clientY;
    function onMove(ev: MouseEvent) {
      const curr = isH ? ev.clientX : ev.clientY;
      onDelta(curr - prev);
      prev = curr;
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.body.style.cursor = isH ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`group shrink-0 flex items-center justify-center transition-colors z-10 ${
        isH
          ? "w-1 h-full cursor-col-resize hover:bg-purple-500/10"
          : "h-1 w-full cursor-row-resize hover:bg-purple-500/10"
      }`}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`rounded-full transition-colors group-hover:bg-purple-400/30 ${
          isH ? "w-px h-8" : "h-px w-8"
        }`}
        style={{ background: "var(--c-border-subtle)" }}
      />
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────
function EmptyState() {
  const [showModal, setShowModal] = useState(false);
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center gap-5 text-center p-8">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(168,85,247,0.1)" }}
      >
        <Sparkles size={24} className="text-purple-400/70" />
      </div>
      <div className="max-w-xs">
        <p
          className="text-base font-semibold mb-2"
          style={{ color: "var(--c-text-1)" }}
        >
          Build your AI workforce
        </p>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--c-text-3)" }}
        >
          Create a workflow, fill it with AI agents, and point it at a
          directory. Agents read and write files directly on your machine.
        </p>
      </div>
      <button
        onClick={() => setShowModal(true)}
        className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
      >
        New Workflow
      </button>
      {showModal && <NewWorkflowModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
