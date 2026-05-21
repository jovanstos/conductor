import { useState } from "react";
import {
  X,
  FolderOpen,
  Check,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Link,
  Server,
  Key,
  Cpu,
} from "lucide-react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../../stores/settingsStore";
import { validateApiKey } from "../../lib/tauri";
import type { CustomHostConfig } from "../../types";
import { pickHostColor, ANTHROPIC_MODELS } from "../../lib/defaults";
import { v4 as uuidv4 } from "uuid";
import ModelPicker from "../shared/ModelPicker";

// ── Provider config ──────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    color: "var(--c-anthropic)",
    glow: "glow-anthropic",
    dimColor: "rgba(249,115,22,0.15)",
    borderColor: "rgba(249,115,22,0.4)",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/keys",
    description: "Powers Claude models (Opus, Sonnet, Haiku)",
    models: ANTHROPIC_MODELS.map((m) => m.name),
  },
  {
    id: "openai",
    name: "OpenAI",
    color: "var(--c-openai)",
    glow: "glow-openai",
    dimColor: "rgba(16,185,129,0.15)",
    borderColor: "rgba(16,185,129,0.4)",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    description: "Powers GPT-4o and GPT-4o mini",
    models: ["GPT-4o", "GPT-4o mini"],
  },
] as const;

export default function SettingsPanel() {
  const {
    closeSettings,
    providerStatuses,
    saveApiKey,
    deleteApiKey,
    customHosts,
    saveCustomHost,
    deleteCustomHost,
    saveCustomHostKey,
    deleteCustomHostKey,
    defaultModel,
    setDefaultModel,
    defaultProjectsPath,
    setDefaultProjectsPath,
  } = useSettingsStore();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-[620px] max-h-[88vh] rounded-xl flex flex-col shadow-2xl overflow-hidden"
        style={{
          background: "var(--c-surface)",
          border: "1px solid var(--c-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--c-border)" }}
        >
          <div>
            <h2
              className="text-lg font-bold"
              style={{ color: "var(--c-text-1)" }}
            >
              Settings
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--c-text-3)" }}>
              API keys, default model, workspace
            </p>
          </div>
          <button
            onClick={closeSettings}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--c-text-3)", background: "var(--c-card)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--c-text-1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--c-text-3)";
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── API Keys ── */}
          <Section
            title="API Connections"
            icon={<Key size={16} />}
            description="Connect your AI providers. Keys are stored locally and never leave your machine."
          >
            <div className="space-y-3">
              {PROVIDERS.map((p) => {
                const status = providerStatuses.find(
                  (s) => s.provider === p.id,
                );
                return (
                  <ApiKeyRow
                    key={p.id}
                    provider={p.id}
                    name={p.name}
                    color={p.color}
                    dimColor={p.dimColor}
                    borderColor={p.borderColor}
                    glowClass={p.glow}
                    placeholder={p.placeholder}
                    description={p.description}
                    models={p.models}
                    hasKey={status?.hasKey ?? false}
                    onSave={(key) => saveApiKey(p.id, key)}
                    onDelete={() => deleteApiKey(p.id)}
                  />
                );
              })}

              {/* Ollama */}
              <OllamaRow />
            </div>
          </Section>

          {/* ── Custom Connections ── */}
          <Section
            title="Custom Connections"
            icon={<Link size={16} />}
            description="Add any OpenAI-compatible API endpoint (LM Studio, Groq, Together, etc.)"
          >
            <CustomHostsSection
              hosts={customHosts}
              onSaveHost={saveCustomHost}
              onDeleteHost={deleteCustomHost}
              onSaveKey={saveCustomHostKey}
              onDeleteKey={deleteCustomHostKey}
            />
          </Section>

          {/* ── Default Model ── */}
          <Section
            title="Default Model"
            icon={<Cpu size={16} />}
            description="This model is pre-selected every time you add a new agent. Change it once, applies everywhere."
          >
            <div className="space-y-3">
              <div
                className="p-3 rounded-lg"
                style={{
                  background: "var(--c-accent-dim)",
                  border: "1px solid var(--c-accent-border)",
                }}
              >
                <p
                  className="text-sm font-medium mb-2"
                  style={{ color: "var(--c-accent)" }}
                >
                  Current default:{" "}
                  <span className="font-bold">{defaultModel.modelId}</span>
                </p>
                <ModelPicker value={defaultModel} onChange={setDefaultModel} />
              </div>
            </div>
          </Section>

          {/* ── Workspace ── */}
          <Section
            title="Workspace"
            icon={<FolderOpen size={16} />}
            description="Default folder where new workflows save their files."
          >
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{
                background: "var(--c-card)",
                border: "1px solid var(--c-border)",
              }}
            >
              <span
                className="flex-1 text-sm font-mono-accent truncate"
                style={{ color: "var(--c-text-2)" }}
              >
                {defaultProjectsPath}
              </span>
              <button
                onClick={async () => {
                  const selected = await openFolderDialog({
                    directory: true,
                    multiple: false,
                    title: "Choose Projects Folder",
                  });
                  if (!selected) return;
                  const path =
                    typeof selected === "string" ? selected : selected[0];
                  if (path)
                    await setDefaultProjectsPath(path.replace(/\\/g, "/"));
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
                style={{
                  background: "var(--c-elevated)",
                  color: "var(--c-text-1)",
                  border: "1px solid var(--c-border)",
                }}
              >
                <FolderOpen size={14} /> Browse
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────
function Section({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="px-6 py-5"
      style={{ borderBottom: "1px solid var(--c-border-subtle)" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: "var(--c-accent)" }}>{icon}</span>
        <h3
          className="text-base font-semibold"
          style={{ color: "var(--c-text-1)" }}
        >
          {title}
        </h3>
      </div>
      {description && (
        <p className="text-sm mb-4" style={{ color: "var(--c-text-3)" }}>
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

// ── API Key Row ──────────────────────────────────────────────────────
function ApiKeyRow({
  provider,
  name,
  color,
  dimColor,
  borderColor,
  glowClass,
  placeholder,
  description,
  models,
  hasKey,
  onSave,
  onDelete,
}: {
  provider: string;
  name: string;
  color: string;
  dimColor: string;
  borderColor: string;
  glowClass: string;
  placeholder: string;
  description: string;
  models: readonly string[];
  hasKey: boolean;
  onSave: (key: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "err" | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(value.trim());
      setValue("");
      setEditing(false);
      setTestResult(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!value.trim()) return;
    setTesting(true);
    try {
      await validateApiKey(provider);
      setTestResult("ok");
    } catch {
      setTestResult("err");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all ${hasKey ? glowClass : ""}`}
      style={{
        background: hasKey ? dimColor : "var(--c-card)",
        border: `1px solid ${hasKey ? borderColor : "var(--c-border)"}`,
      }}
    >
      {/* Provider header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm"
          style={{
            background: dimColor,
            color,
            border: `1px solid ${borderColor}`,
          }}
        >
          {name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-base font-semibold"
              style={{ color: "var(--c-text-1)" }}
            >
              {name}
            </span>
            {hasKey ? (
              <span
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: dimColor,
                  color,
                  border: `1px solid ${borderColor}`,
                }}
              >
                <CheckCircle2 size={11} />
                Connected
              </span>
            ) : (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(248,113,113,0.15)",
                  color: "var(--c-red)",
                  border: "1px solid rgba(248,113,113,0.3)",
                }}
              >
                Not connected
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--c-text-3)" }}>
            {description} · {models.join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasKey && !editing && (
            <button
              onClick={() => {
                setEditing(true);
                setTestResult(null);
              }}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors"
              style={{
                background: "var(--c-elevated)",
                color: "var(--c-text-2)",
                border: "1px solid var(--c-border)",
              }}
            >
              Replace key
            </button>
          )}
          {hasKey && (
            <button
              onClick={onDelete}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--c-red)", background: "var(--c-red-dim)" }}
              title="Remove key"
            >
              <Trash2 size={14} />
            </button>
          )}
          {!hasKey && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: color, color: "#000" }}
            >
              <Key size={13} /> Add Key
            </button>
          )}
        </div>
      </div>

      {/* Key input form */}
      {editing && (
        <div
          className="px-4 pb-4 space-y-3"
          style={{
            borderTop: `1px solid ${borderColor}`,
            paddingTop: "12px",
            marginTop: "0",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          <p
            className="text-sm font-medium"
            style={{ color: "var(--c-text-2)" }}
          >
            Paste your API key below. It's stored locally and encrypted on your
            machine.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="password"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setTestResult(null);
                }}
                placeholder={placeholder}
                className="w-full conductor-input px-3 py-2.5 text-sm font-mono-accent"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
              />
            </div>
          </div>

          {testResult === "ok" && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--c-green)" }}
            >
              <CheckCircle2 size={14} /> Key is valid!
            </div>
          )}
          {testResult === "err" && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--c-red)" }}
            >
              <AlertCircle size={14} /> Key rejected by {name} — check it's
              correct.
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!value.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
              style={{ background: color, color: "#000" }}
            >
              <Check size={14} /> {saving ? "Saving…" : "Save Key"}
            </button>
            <button
              onClick={handleTest}
              disabled={!value.trim() || testing}
              className="px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-40"
              style={{
                background: "var(--c-elevated)",
                color: "var(--c-text-2)",
                border: "1px solid var(--c-border)",
              }}
            >
              {testing ? "Testing…" : "Test Key"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setValue("");
                setTestResult(null);
              }}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ color: "var(--c-text-3)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ollama row ───────────────────────────────────────────────────────
function OllamaRow() {
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3 glow-ollama"
      style={{
        background: "rgba(59,130,246,0.12)",
        border: "1px solid rgba(59,130,246,0.35)",
      }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm"
        style={{
          background: "rgba(59,130,246,0.2)",
          color: "var(--c-ollama)",
          border: "1px solid rgba(59,130,246,0.4)",
        }}
      >
        O
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-base font-semibold"
            style={{ color: "var(--c-text-1)" }}
          >
            Ollama
          </span>
          <span
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: "rgba(59,130,246,0.15)",
              color: "var(--c-ollama)",
              border: "1px solid rgba(59,130,246,0.35)",
            }}
          >
            <Server size={11} />
            No key needed
          </span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: "var(--c-text-3)" }}>
          Local models via Ollama · Auto-detected at localhost:11434 · Llama,
          Mistral, Qwen, and more
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="text-xs font-mono-accent px-2 py-1 rounded"
          style={{
            background: "rgba(74,222,128,0.15)",
            color: "var(--c-green)",
            border: "1px solid rgba(74,222,128,0.25)",
          }}
        >
          ● Auto-connect
        </span>
      </div>
    </div>
  );
}

// ── Custom Hosts Section ─────────────────────────────────────────────
function CustomHostsSection({
  hosts,
  onSaveHost,
  onDeleteHost,
  onSaveKey,
  onDeleteKey,
}: {
  hosts: any[];
  onSaveHost: (h: CustomHostConfig) => Promise<void>;
  onDeleteHost: (id: string) => Promise<void>;
  onSaveKey: (id: string, key: string) => Promise<void>;
  onDeleteKey: (id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newModels, setNewModels] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!newName.trim() || !newUrl.trim()) return;
    setAdding(true);
    await onSaveHost({
      id: uuidv4(),
      name: newName.trim(),
      baseUrl: newUrl.trim(),
      models: newModels
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      color: pickHostColor(hosts.length),
    });
    setNewName("");
    setNewUrl("");
    setNewModels("");
    setShowAdd(false);
    setAdding(false);
  }

  return (
    <div className="space-y-2">
      {hosts.map((host) => (
        <CustomHostRow
          key={host.id}
          host={host}
          expanded={expandedId === host.id}
          onToggle={() =>
            setExpandedId(expandedId === host.id ? null : host.id)
          }
          onDelete={() => onDeleteHost(host.id)}
          onSaveKey={(k) => onSaveKey(host.id, k)}
          onDeleteKey={() => onDeleteKey(host.id)}
        />
      ))}

      {showAdd ? (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            background: "var(--c-card)",
            border: "1px solid var(--c-border)",
          }}
        >
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--c-text-1)" }}
          >
            Add custom connection
          </p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (e.g. Groq, LM Studio)"
            className="w-full conductor-input px-3 py-2.5 text-sm"
          />
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="Base URL (e.g. https://api.groq.com/openai/v1)"
            className="w-full conductor-input px-3 py-2.5 text-sm"
          />
          <input
            value={newModels}
            onChange={(e) => setNewModels(e.target.value)}
            placeholder="Model IDs, comma-separated (e.g. llama3-70b-8192)"
            className="w-full conductor-input px-3 py-2.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newUrl.trim() || adding}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: "var(--c-accent)", color: "#000" }}
            >
              <Check size={14} /> {adding ? "Adding…" : "Add Connection"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ color: "var(--c-text-3)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm transition-all"
          style={{
            background: "var(--c-card)",
            color: "var(--c-text-3)",
            border: "1px dashed var(--c-border)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--c-accent)";
            e.currentTarget.style.color = "var(--c-accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--c-border)";
            e.currentTarget.style.color = "var(--c-text-3)";
          }}
        >
          <Plus size={15} /> Add Connection (LM Studio, Groq, Together…)
        </button>
      )}
    </div>
  );
}

function CustomHostRow({
  host,
  expanded,
  onToggle,
  onDelete,
  onSaveKey,
  onDeleteKey,
}: {
  host: any;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSaveKey: (k: string) => Promise<void>;
  onDeleteKey: () => Promise<void>;
}) {
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);

  const color = host.color ?? "var(--c-custom)";

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--c-card)",
        border: "1px solid var(--c-border)",
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
          style={{
            background: color + "22",
            color,
            border: `1px solid ${color}55`,
          }}
        >
          {host.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--c-text-1)" }}
          >
            {host.name}
          </p>
          <p className="text-xs truncate" style={{ color: "var(--c-text-3)" }}>
            {host.baseUrl}
          </p>
        </div>
        {host.hasKey ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(74,222,128,0.15)",
              color: "var(--c-green)",
              border: "1px solid rgba(74,222,128,0.25)",
            }}
          >
            Connected
          </span>
        ) : (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: "var(--c-red-dim)", color: "var(--c-red)" }}
          >
            No key
          </span>
        )}
        <button
          onClick={onToggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg"
          style={{ color: "var(--c-text-3)" }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={onDelete}
          className="w-8 h-8 flex items-center justify-center rounded-lg"
          style={{ color: "var(--c-red)" }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {expanded && (
        <div
          className="px-4 pb-4 space-y-2"
          style={{
            borderTop: "1px solid var(--c-border-subtle)",
            paddingTop: "12px",
          }}
        >
          {host.models.length > 0 && (
            <p className="text-xs" style={{ color: "var(--c-text-3)" }}>
              Models: {host.models.join(", ")}
            </p>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="password"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder="API key (if required)"
                className="w-full conductor-input px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={async () => {
                setSaving(true);
                await onSaveKey(keyValue);
                setKeyValue("");
                setSaving(false);
              }}
              disabled={!keyValue.trim() || saving}
              className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--c-accent)", color: "#000" }}
            >
              {saving ? "…" : "Save"}
            </button>
            {host.hasKey && (
              <button
                onClick={onDeleteKey}
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  color: "var(--c-red)",
                  background: "var(--c-red-dim)",
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
