import { useState, useRef, useEffect } from "react";
import { Send, X, MessageSquare, RefreshCw } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { missionChatTurn, listenToMissionChat } from "../../lib/tauri";
import type { MissionChatMessage } from "../../types";

const QUICK_PROMPTS = [
  "What are you working on right now?",
  "Give me a status update on all goals.",
  "What is blocking you?",
  "What have you accomplished so far?",
];

export default function MissionChatPanel({
  missionId,
  missionName,
  onClose,
}: {
  missionId: string;
  missionName: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<MissionChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || isStreaming) return;

    setInput("");
    setError(null);

    const userMsg: MissionChatMessage = {
      id: uuidv4(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsStreaming(true);
    setStreamingText("");

    // Attach chunk listener
    unlistenRef.current?.();
    const unlisten = await listenToMissionChat(missionId, (chunk) => {
      setStreamingText((prev) => prev + chunk);
    });
    unlistenRef.current = unlisten;

    try {
      const fullResponse = await missionChatTurn(missionId, content, messages);

      const managerMsg: MissionChatMessage = {
        id: uuidv4(),
        role: "manager",
        content: fullResponse,
        timestamp: new Date().toISOString(),
      };
      setMessages([...newMessages, managerMsg]);
      setStreamingText("");
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStreaming(false);
      unlistenRef.current?.();
      unlistenRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden border-l"
      style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}
    >
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: "var(--c-border)" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: "var(--c-accent-dim)",
            border: "1px solid var(--c-accent-border)",
          }}
        >
          <MessageSquare size={15} style={{ color: "var(--c-accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-bold truncate"
            style={{ color: "var(--c-text-1)" }}
          >
            Chat with Manager
          </p>
          <p className="text-xs truncate" style={{ color: "var(--c-text-3)" }}>
            {missionName}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-colors"
          style={{ color: "var(--c-text-3)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--c-text-1)";
            e.currentTarget.style.background = "var(--c-elevated)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--c-text-3)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <div className="text-center py-4">
            <p className="text-sm mb-4" style={{ color: "var(--c-text-3)" }}>
              Talk directly to your Manager Agent. Ask for a status update, give
              new instructions, or just check in.
            </p>
            <div className="space-y-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    background: "var(--c-card)",
                    color: "var(--c-text-2)",
                    border: "1px solid var(--c-border)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      "var(--c-accent-border)";
                    e.currentTarget.style.color = "var(--c-accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--c-border)";
                    e.currentTarget.style.color = "var(--c-text-2)";
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[88%] rounded-xl px-3 py-2.5 text-sm leading-relaxed"
              style={{
                background:
                  msg.role === "user" ? "var(--c-accent-dim)" : "var(--c-card)",
                color:
                  msg.role === "user" ? "var(--c-accent)" : "var(--c-text-1)",
                border: `1px solid ${msg.role === "user" ? "var(--c-accent-border)" : "var(--c-border)"}`,
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.role === "manager" && (
                <p
                  className="text-xs font-semibold mb-1"
                  style={{ color: "var(--c-text-3)" }}
                >
                  Manager Agent
                </p>
              )}
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {isStreaming && (streamingText || !streamingText) && (
          <div className="flex justify-start">
            <div
              className="max-w-[88%] rounded-xl px-3 py-2.5 text-sm leading-relaxed"
              style={{
                background: "var(--c-card)",
                color: "var(--c-text-1)",
                border: "1px solid var(--c-border)",
                whiteSpace: "pre-wrap",
              }}
            >
              <p
                className="text-xs font-semibold mb-1"
                style={{ color: "var(--c-text-3)" }}
              >
                Manager Agent
              </p>
              {streamingText ? (
                <span className="cursor-blink">{streamingText}</span>
              ) : (
                <span
                  className="flex items-center gap-1.5"
                  style={{ color: "var(--c-text-3)" }}
                >
                  <RefreshCw size={12} className="animate-spin" />
                  Thinking…
                </span>
              )}
            </div>
          </div>
        )}

        {error && (
          <div
            className="rounded-xl px-3 py-2 text-xs"
            style={{
              background: "var(--c-red-dim)",
              color: "var(--c-red)",
              border: "1px solid rgba(239,68,68,0.3)",
            }}
          >
            {error}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 pb-4">
        <div
          className="flex items-end gap-2 rounded-xl border px-3 py-2.5"
          style={{
            background: "var(--c-card)",
            borderColor: isStreaming
              ? "var(--c-border)"
              : "var(--c-accent-border)",
            opacity: isStreaming ? 0.6 : 1,
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming ? "Manager is responding…" : "Message your Manager…"
            }
            rows={1}
            disabled={isStreaming}
            className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
            style={{
              color: "var(--c-text-1)",
              minHeight: "22px",
              maxHeight: "100px",
            }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 100) + "px";
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all"
            style={{
              background:
                input.trim() && !isStreaming
                  ? "var(--c-accent)"
                  : "var(--c-border)",
              color:
                input.trim() && !isStreaming ? "#000" : "var(--c-text-dim)",
            }}
          >
            <Send size={13} />
          </button>
        </div>
        <p
          className="text-xs mt-1.5 text-center"
          style={{ color: "var(--c-text-dim)" }}
        >
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
