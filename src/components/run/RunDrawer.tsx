import { useState, useEffect, useRef } from "react";
import {
  FolderOpen,
  Clock,
  Download,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Pause,
  ArrowRight,
  Square,
  Wrench,
  Check,
} from "lucide-react";
import { useRunStore } from "../../stores/runStore";
import * as tauri from "../../lib/tauri";
import type { RunStep, ToolCallRecord } from "../../types";

function ToolCallBadge({ tc }: { tc: ToolCallRecord }) {
  const [expanded, setExpanded] = useState(false);

  const isRunning = tc.status === "running";
  const isError = tc.isError;

  return (
    <div
      className="rounded px-3 py-2"
      style={{
        background: isRunning
          ? "var(--c-accent-glow)"
          : isError
            ? "var(--c-red-dim)"
            : "var(--c-card)",
        border: `1px solid ${isRunning ? "var(--c-accent-border)" : isError ? "rgba(248,113,113,0.25)" : "var(--c-border)"}`,
      }}
    >
      <div className="flex items-center gap-2">
        <Wrench
          size={12}
          style={{
            color: isRunning
              ? "var(--c-green)"
              : isError
                ? "var(--c-red)"
                : "var(--c-text-3)",
            flexShrink: 0,
          }}
        />
        <span
          className="text-xs font-mono-accent flex-1 truncate"
          style={{ color: "var(--c-text-2)" }}
        >
          {tc.toolName}
          {tc.argsPreview && (
            <span style={{ color: "var(--c-text-3)" }}>({tc.argsPreview})</span>
          )}
        </span>
        {isRunning && (
          <span className="flex gap-0.5 shrink-0">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="w-1 h-1 rounded-full animate-bounce"
                style={{
                  background: "var(--c-green)",
                  animationDelay: `${d}ms`,
                }}
              />
            ))}
          </span>
        )}
        {tc.status === "done" && !isError && (
          <Check size={12} style={{ color: "var(--c-green)", flexShrink: 0 }} />
        )}
        {isError && (
          <span className="text-xs shrink-0" style={{ color: "var(--c-red)" }}>
            Error
          </span>
        )}
        {tc.status !== "running" && tc.resultPreview && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ color: "var(--c-text-3)", flexShrink: 0 }}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>
      {expanded && tc.resultPreview && (
        <pre
          className="mt-2 text-xs whitespace-pre-wrap leading-relaxed border-t pt-2"
          style={{
            color: "var(--c-text-2)",
            borderColor: "var(--c-border)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {tc.resultPreview}
        </pre>
      )}
    </div>
  );
}

function stepDurationMs(step: RunStep): number | null {
  if (!step.completedAt) return null;
  return (
    new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
  );
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function RunDrawer({ height }: { height: number }) {
  const {
    currentRun,
    isRunning,
    isPaused,
    gateInfo,
    clearRun,
    openResultModal,
    cancelRun,
  } = useRunStore();
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRunning && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [currentRun?.steps.length, currentRun?.steps.at(-1)?.output, isRunning]);

  if (!currentRun) return null;

  const steps = currentRun.steps;
  const isDone = currentRun.status === "completed";
  const isFailed = currentRun.status === "failed";
  const isCancelled = currentRun.status === "cancelled";
  const isFinished = isDone || isFailed || isCancelled;
  const activeStep = steps.find((s) => s.status === "running");
  const doneCount = steps.filter((s) => s.status === "done").length;
  const ws = currentRun.workspaceConfig;
  const totalFilesWritten = steps.reduce(
    (n, s) => n + (s.filesWritten?.length ?? 0),
    0,
  );

  async function handleDiscard() {
    if (!ws) {
      clearRun();
      return;
    }
    if (ws.mode === "temporary") {
      try {
        await tauri.deleteWorkspace(ws.workspacePath);
      } catch {
        /* ignore */
      }
      clearRun();
    } else {
      setDiscardConfirm(true);
    }
  }

  async function handleDiscardConfirmed() {
    if (!ws) return;
    if (ws.mode === "temporary") {
      try {
        await tauri.deleteWorkspace(ws.workspacePath);
      } catch {
        /* ignore */
      }
    }
    setDiscardConfirm(false);
    clearRun();
  }

  async function handleExportZip() {
    if (!ws) return;
    setSaving(true);
    try {
      const { save: saveDialog } = await import("@tauri-apps/plugin-dialog");
      const dest = await saveDialog({
        defaultPath: `${ws.projectName ?? "project"}.zip`,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });
      if (!dest) {
        setSaving(false);
        return;
      }
      await tauri.zipAndSaveWorkspace(ws.workspacePath, dest);
      setSaveMsg("Exported!");
      setTimeout(() => setSaveMsg(null), 4000);
    } catch (e) {
      setSaveMsg(`Error: ${String(e)}`);
    }
    setSaving(false);
  }

  const statusBg = isDone
    ? "var(--c-green-dim)"
    : isFailed
      ? "var(--c-red-dim)"
      : isCancelled
        ? "var(--c-card)"
        : isPaused
          ? "var(--c-accent-dim)"
          : "var(--c-accent-glow)";
  const statusBorder = isDone
    ? "rgba(74,222,128,0.25)"
    : isFailed
      ? "rgba(248,113,113,0.25)"
      : isCancelled
        ? "var(--c-border)"
        : isPaused
          ? "var(--c-accent-border)"
          : "var(--c-accent-border)";
  const dotColor = isDone
    ? "var(--c-green)"
    : isFailed
      ? "var(--c-red)"
      : isCancelled
        ? "var(--c-text-3)"
        : "var(--c-accent)";
  const statusColor = isDone
    ? "var(--c-green)"
    : isFailed
      ? "var(--c-red)"
      : isCancelled
        ? "var(--c-text-3)"
        : "var(--c-accent)";

  return (
    <div
      className="shrink-0 flex flex-col overflow-hidden"
      style={{
        height,
        background: "var(--c-base)",
        borderTop: "1px solid var(--c-border)",
      }}
    >
      {/* Status bar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 shrink-0 border-b"
        style={{ background: statusBg, borderColor: statusBorder }}
      >
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${isRunning || isPaused ? "pulse-green" : ""}`}
          style={{ background: dotColor }}
        />

        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold font-mono-accent"
            style={{ color: statusColor }}
          >
            {isDone
              ? "COMPLETED"
              : isFailed
                ? "FAILED"
                : isCancelled
                  ? "CANCELLED"
                  : isPaused
                    ? "PAUSED — REVIEW NEEDED"
                    : activeStep
                      ? `${activeStep.nodeName.toUpperCase()} RUNNING`
                      : "STARTING…"}
          </p>
          {ws && (
            <p
              className="text-xs truncate mt-0.5 flex items-center gap-1.5"
              style={{ color: "var(--c-text-3)" }}
            >
              {ws.mode === "project" || ws.mode === "existing" ? (
                <>
                  <FolderOpen size={11} className="shrink-0" />
                  {ws.projectName ?? "project"}
                </>
              ) : (
                <>
                  <Clock size={11} className="shrink-0" />
                  temporary
                </>
              )}
              {totalFilesWritten > 0 && (
                <span style={{ color: "var(--c-green)" }}>
                  · {totalFilesWritten} file{totalFilesWritten !== 1 ? "s" : ""}{" "}
                  written
                </span>
              )}
            </p>
          )}
        </div>

        {steps.length > 0 && !isPaused && (
          <span
            className="text-xs font-mono-accent shrink-0"
            style={{ color: "var(--c-text-3)" }}
          >
            {doneCount}/{steps.length}
          </span>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {isDone && currentRun.finalOutput && (
            <button
              onClick={openResultModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
              style={{ background: "var(--c-green)", color: "#000" }}
            >
              Results <ArrowRight size={12} />
            </button>
          )}
          {isFinished && ws && (
            <>
              {ws.mode === "project" || ws.mode === "existing" ? (
                <>
                  <button
                    onClick={handleExportZip}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors disabled:opacity-40"
                    style={{
                      background: "var(--c-card)",
                      color: "var(--c-text-2)",
                      border: "1px solid var(--c-border)",
                    }}
                  >
                    {saving ? (
                      "…"
                    ) : (
                      <>
                        <Download size={12} />
                        Export
                      </>
                    )}
                  </button>
                  <button
                    onClick={clearRun}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs"
                    style={{
                      color: "var(--c-green)",
                      border: "1px solid rgba(0,255,136,0.2)",
                    }}
                  >
                    <FolderOpen size={12} />
                    Keep
                  </button>
                  <button
                    onClick={handleDiscard}
                    className="text-xs"
                    style={{ color: "var(--c-text-3)" }}
                  >
                    Discard
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDiscard}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs"
                  style={{
                    background: "var(--c-card)",
                    color: "var(--c-text-2)",
                    border: "1px solid var(--c-border)",
                  }}
                >
                  <X size={12} />
                  Dismiss
                </button>
              )}
            </>
          )}
          {isRunning && (
            <button
              onClick={cancelRun}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs"
              style={{
                background: "var(--c-red-dim)",
                color: "var(--c-red)",
                border: "1px solid rgba(255,68,68,0.25)",
              }}
            >
              <Square size={11} fill="currentColor" />
              Stop
            </button>
          )}
          {!ws && isFinished && (
            <button onClick={clearRun} style={{ color: "var(--c-text-3)" }}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {saveMsg && (
        <div
          className="mx-3 mt-2 shrink-0 px-3 py-2 rounded text-xs"
          style={{
            background: "var(--c-green-dim)",
            color: "var(--c-green)",
            border: "1px solid rgba(0,255,136,0.2)",
          }}
        >
          {saveMsg}
        </div>
      )}

      {discardConfirm && (
        <div
          className="mx-3 mt-2 shrink-0 rounded px-4 py-3 flex items-center gap-3"
          style={{
            background: "var(--c-red-dim)",
            border: "1px solid rgba(255,68,68,0.25)",
          }}
        >
          <div className="flex-1">
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--c-red)" }}
            >
              Delete project files?
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: "rgba(255,68,68,0.6)" }}
            >
              This will permanently delete all files at {ws?.workspacePath}.
              Cannot be undone.
            </p>
          </div>
          <button
            onClick={handleDiscardConfirmed}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: "var(--c-red)", color: "#fff" }}
          >
            Delete
          </button>
          <button
            onClick={() => setDiscardConfirm(false)}
            className="text-xs"
            style={{ color: "var(--c-text-3)" }}
          >
            Cancel
          </button>
        </div>
      )}

      {isPaused && gateInfo && (
        <div
          className="mx-3 mt-2 shrink-0 rounded px-4 py-3 flex items-center gap-3"
          style={{
            background: "var(--c-blue-dim)",
            border: "1px solid rgba(68,136,255,0.25)",
          }}
        >
          <Pause
            size={16}
            style={{ color: "var(--c-blue)", flexShrink: 0 }}
            className="animate-pulse"
          />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--c-blue)" }}
            >
              Review panel is open
            </p>
            <p
              className="text-xs line-clamp-1 mt-0.5"
              style={{ color: "rgba(68,136,255,0.6)" }}
            >
              {gateInfo.message ||
                "Check the review popup and click Approve to continue."}
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div ref={timelineRef} className="flex-1 overflow-y-auto px-3 py-3">
        {steps.length === 0 ? (
          <div className="flex items-center gap-2 h-full justify-center">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{
                  background: "var(--c-green)",
                  animationDelay: `${d}ms`,
                }}
              />
            ))}
            <span className="text-xs ml-1" style={{ color: "var(--c-text-3)" }}>
              Starting…
            </span>
          </div>
        ) : (
          <div className="space-y-0">
            {steps.map((step, i) => (
              <TimelineEntry
                key={`${step.nodeId}-${step.attempt}`}
                step={step}
                isLast={i === steps.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineEntry({ step, isLast }: { step: RunStep; isLast: boolean }) {
  const [showOutput, setShowOutput] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  const isRunning = step.status === "running";
  const isDone = step.status === "done";
  const isError = step.status === "error";

  useEffect(() => {
    if (isRunning && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [step.output, isRunning]);

  const durationMs = stepDurationMs(step);
  const hasFiles = (step.filesWritten?.length ?? 0) > 0;
  const hasOutput = !isRunning && (step.output || step.error);
  const promptChars = step.input?.length ?? 0;

  const dotColor = isRunning
    ? "var(--c-green)"
    : isDone
      ? "var(--c-green)"
      : isError
        ? "var(--c-red)"
        : "var(--c-border)";
  const dotOpacity = isDone ? 0.6 : 1;

  return (
    <div className="flex gap-3">
      {/* Spine */}
      <div className="flex flex-col items-center shrink-0 w-5">
        <div
          className={`w-3 h-3 rounded-full border shrink-0 mt-1.5 ${isRunning ? "pulse-accent" : ""}`}
          style={{
            borderColor: dotColor,
            background: isRunning
              ? "var(--c-accent-glow)"
              : isDone
                ? "var(--c-green-dim)"
                : isError
                  ? "var(--c-red-dim)"
                  : "var(--c-card)",
            opacity: dotOpacity,
          }}
        />
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{ background: "var(--c-border)" }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <span
            className="text-xs font-semibold font-mono-accent"
            style={{
              color: isRunning
                ? "var(--c-green)"
                : isDone
                  ? "var(--c-text-1)"
                  : isError
                    ? "var(--c-red)"
                    : "var(--c-text-2)",
            }}
          >
            {step.nodeName}
          </span>
          {step.attempt > 1 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono-accent"
              style={{
                background: "var(--c-amber-dim)",
                color: "var(--c-amber)",
                border: "1px solid rgba(255,170,0,0.2)",
              }}
            >
              rev {step.attempt}
            </span>
          )}
          {isRunning && (
            <span className="flex gap-0.5">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="w-1 h-1 rounded-full animate-bounce"
                  style={{
                    background: "var(--c-green)",
                    animationDelay: `${d}ms`,
                  }}
                />
              ))}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {durationMs !== null && (
              <span
                className="text-xs font-mono-accent"
                style={{ color: "var(--c-text-3)" }}
              >
                {fmtDuration(durationMs)}
              </span>
            )}
            {step.tokensUsed != null && (
              <span
                className="text-xs font-mono-accent"
                style={{ color: "var(--c-text-dim)" }}
              >
                {step.tokensUsed.toLocaleString()}t
              </span>
            )}
          </div>
        </div>

        {/* Live streaming */}
        {isRunning && step.output && (
          <div
            ref={streamRef}
            className="mt-2 max-h-28 overflow-y-auto rounded px-3 py-2"
            style={{
              background: "var(--c-card)",
              border: "1px solid rgba(0,255,136,0.15)",
            }}
          >
            <pre
              className="text-xs whitespace-pre-wrap leading-relaxed"
              style={{
                color: "var(--c-text-2)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {step.output}
            </pre>
          </div>
        )}

        {/* Tool calls */}
        {(step.toolCalls?.length ?? 0) > 0 && (
          <div className="mt-2 space-y-1">
            {step.toolCalls!.map((tc) => (
              <ToolCallBadge key={tc.toolCallId} tc={tc} />
            ))}
          </div>
        )}

        {/* Files written */}
        {hasFiles && (
          <div className="mt-2">
            <button
              onClick={() => setShowFiles((v) => !v)}
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--c-green)" }}
            >
              <FolderOpen size={12} />
              {step.filesWritten!.length} file
              {step.filesWritten!.length !== 1 ? "s" : ""} written
              {showFiles ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {showFiles && (
              <div
                className="mt-1.5 rounded p-2 space-y-0.5"
                style={{
                  background: "var(--c-card)",
                  border: "1px solid var(--c-border)",
                }}
              >
                {step.filesWritten!.map((f) => (
                  <p
                    key={f}
                    className="text-xs truncate font-mono-accent"
                    style={{ color: "var(--c-green)" }}
                  >
                    {f}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Output */}
        {hasOutput && (
          <div className="mt-2">
            {showOutput ? (
              <>
                <div
                  className="max-h-48 overflow-y-auto rounded px-3 py-2 mb-1"
                  style={{
                    background: "var(--c-card)",
                    border: "1px solid var(--c-border)",
                  }}
                >
                  <pre
                    className="text-xs whitespace-pre-wrap leading-relaxed"
                    style={{
                      color: isError ? "var(--c-red)" : "var(--c-text-2)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {isError ? step.error : step.output}
                  </pre>
                </div>
                <button
                  onClick={() => setShowOutput(false)}
                  className="text-xs flex items-center gap-1"
                  style={{ color: "var(--c-text-3)" }}
                >
                  <ChevronUp size={11} />
                  Collapse
                </button>
              </>
            ) : (
              <>
                <p
                  className="text-xs line-clamp-2 leading-relaxed"
                  style={{
                    color: isError ? "var(--c-red)" : "var(--c-text-3)",
                  }}
                >
                  {isError ? step.error : step.output}
                </p>
                {((step.output?.length ?? 0) > 80 || isError) && (
                  <button
                    onClick={() => setShowOutput(true)}
                    className="text-xs flex items-center gap-1 mt-1"
                    style={{ color: "var(--c-text-3)" }}
                  >
                    <ChevronDown size={11} />
                    View output
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Prompt */}
        {promptChars > 0 && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowPrompt((v) => !v)}
              className="text-xs flex items-center gap-1"
              style={{ color: "var(--c-text-dim)" }}
            >
              {showPrompt ? (
                <ChevronUp size={11} />
              ) : (
                <ChevronRight size={11} />
              )}
              Prompt ({promptChars.toLocaleString()} chars)
            </button>
            {showPrompt && (
              <div
                className="mt-1 max-h-48 overflow-y-auto rounded px-3 py-2"
                style={{
                  background: "var(--c-card)",
                  border: "1px solid var(--c-border)",
                }}
              >
                <pre
                  className="text-xs whitespace-pre-wrap leading-relaxed"
                  style={{
                    color: "var(--c-text-3)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {step.input}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
