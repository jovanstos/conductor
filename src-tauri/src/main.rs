// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod workspace_fs;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;
use uuid::Uuid;

// ─────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelConfig {
    provider: String,
    model_id: String,
    api_key_ref: Option<String>,
    base_url: Option<String>,
    max_tokens: u32,
    temperature: f64,
    #[serde(default)]
    simple_tool_format: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowNode {
    id: String,
    #[serde(rename = "type")]
    node_type: String,
    position: Position,
    data: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    extent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Position {
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowEdge {
    id: String,
    source_node_id: String,
    target_node_id: String,
    context_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowSettings {
    default_model: ModelConfig,
    input_mode: String,
    save_history: bool,
    #[serde(default)]
    workspace_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Workflow {
    id: String,
    name: String,
    description: String,
    created_at: String,
    updated_at: String,
    nodes: Vec<WorkflowNode>,
    edges: Vec<WorkflowEdge>,
    settings: WorkflowSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentNodeData {
    name: String,
    role_description: String,
    system_prompt: String,
    model: ModelConfig,
    context_mode: String,
    max_tokens: u32,
    template_id: Option<String>,
    // List of enabled tool names; empty = no tools (legacy single-shot path)
    #[serde(default)]
    tools_enabled: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoopNodeData {
    target_node_id: String,
    reviewer_node_id: String,
    max_retries: u32,
    exit_condition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewGateData {
    message: String,
    allow_edit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceConfig {
    mode: String,
    workspace_path: String,
    project_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Run {
    id: String,
    workflow_id: String,
    started_at: String,
    completed_at: Option<String>,
    status: String,
    input: String,
    steps: Vec<RunStep>,
    final_output: Option<String>,
    workspace_config: Option<WorkspaceConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunStep {
    node_id: String,
    node_name: String,
    attempt: u32,
    started_at: String,
    completed_at: Option<String>,
    status: String,
    input: String,
    output: String,
    tokens_used: Option<u32>,
    error: Option<String>,
    files_written: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Template {
    id: String,
    name: String,
    category: String,
    description: String,
    system_prompt: String,
    suggested_model: Option<String>,
    is_built_in: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ApiMessage {
    role: String,
    content: String,
}

// ─────────────────────────────────────────────
// Tool types
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ToolDef {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ToolCall {
    id: String,
    name: String,
    arguments: serde_json::Value,
}

#[derive(Debug)]
enum LlmTurnResult {
    Text { content: String, tokens_used: Option<u32> },
    ToolCalls { tool_calls: Vec<ToolCall>, preceding_text: Option<String> },
}

#[derive(Debug, Clone)]
struct ToolPermissionConfig {
    denied_paths: Vec<String>,
}

impl Default for ToolPermissionConfig {
    fn default() -> Self {
        Self {
            denied_paths: vec![
                "~/.ssh".into(),
                "~/.gnupg".into(),
                "/etc/passwd".into(),
                "/etc/shadow".into(),
            ],
        }
    }
}

// ─────────────────────────────────────────────
// HTTP API types
// ─────────────────────────────────────────────

#[derive(Deserialize)]
struct AnthropicError {
    error: AnthropicErrorDetail,
}

#[derive(Deserialize)]
struct AnthropicErrorDetail {
    #[serde(rename = "type")]
    error_type: String,
    message: String,
}

// ─────────────────────────────────────────────
// App state
// ─────────────────────────────────────────────

struct AppState {
    data_dir: PathBuf,
    active_runs:   Mutex<HashMap<String, RunHandle>>,
    // Chamber
    chamber_runs:  Mutex<HashMap<String, ChamberRunHandle>>,
    chamber_gates: Mutex<HashMap<String, oneshot::Sender<ChamberGateResult>>>,
    // Missions
    active_missions: Mutex<HashMap<String, MissionHandle>>,
    mission_escalation_senders: Mutex<HashMap<String, oneshot::Sender<String>>>,
    mission_briefing_senders: Mutex<HashMap<String, oneshot::Sender<Option<String>>>>,
}

struct ChamberRunHandle {
    cancel: Arc<AtomicBool>,
}

struct ChamberGateResult {
    action: String, // "approve" | "cancel"
}

struct RunHandle {
    cancel_flag: Arc<AtomicBool>,
    gate_senders: Mutex<HashMap<String, oneshot::Sender<GateResponse>>>,
    tool_confirm_senders: Mutex<HashMap<String, oneshot::Sender<bool>>>,
}

#[derive(Debug)]
enum GateResponse {
    Approve,
    Reject { feedback: String },
    Edit { content: String },
}

impl AppState {
    fn workflows_dir(&self) -> PathBuf { self.data_dir.join("workflows") }
    fn runs_dir(&self) -> PathBuf { self.data_dir.join("runs") }
    fn templates_dir(&self) -> PathBuf { self.data_dir.join("templates") }
    fn keys_file(&self) -> PathBuf { self.data_dir.join("keys.json") }
}

// ─────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────

fn load_json<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Result<T, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("Read {}: {}", path.display(), e))?;
    serde_json::from_str(&text).map_err(|e| format!("Parse {}: {}", path.display(), e))
}

fn save_json<T: Serialize>(path: &PathBuf, data: &T) -> Result<(), String> {
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| format!("Mkdir: {}", e))?;
    }
    let text = serde_json::to_string_pretty(data).map_err(|e| format!("Serialize: {}", e))?;
    std::fs::write(path, text).map_err(|e| format!("Write {}: {}", path.display(), e))
}

fn now() -> String { chrono::Utc::now().to_rfc3339() }

// ─────────────────────────────────────────────
// API key storage
// ─────────────────────────────────────────────

type KeysMap = HashMap<String, String>;

fn load_keys(path: &PathBuf) -> KeysMap {
    if !path.exists() { return HashMap::new(); }
    load_json(path).unwrap_or_default()
}

fn save_keys(path: &PathBuf, keys: &KeysMap) -> Result<(), String> {
    save_json(path, keys)
}


fn effective_max_tokens(provider: &str, model_id: &str, requested: u32) -> u32 {
    let cap: u32 = match provider {
        "anthropic" => {
            if model_id.contains("opus") { 32_000 }
            else if model_id.contains("sonnet") { 64_000 }
            else if model_id.contains("haiku") { 16_000 }
            else { 8_192 }
        }
        "openai" => {
            if model_id.contains("gpt-4o") { 16_384 } else { 4_096 }
        }
        _ => {
            if requested == 0 || requested >= 100_000 { 32_768 } else { return requested; }
        }
    };
    if requested == 0 || requested >= 100_000 { cap } else { requested.min(cap) }
}


// ─────────────────────────────────────────────
// Tool-aware LLM calls (non-streaming, for agentic loop)
// ─────────────────────────────────────────────

const TOOL_EDIT_INSTRUCTIONS: &str = r#"

## How to use your tools

You have file system tools available. Use them purposefully:
- `list_directory` / `read_file` — explore files and read their content. `read_file` automatically extracts text from PDF, DOCX, PPTX, and XLSX files — just call it on the file path like any other file.
- `write_file` — create new files (plans, specs, code, etc.)
- `edit_file` — make targeted changes to existing files (replace an exact string)
- `run_shell_command` — run commands like tests, builds, installs
- `delete_file` — permanently delete a file
- `fetch_url` — download and read content from a URL

## Security sandbox

You are running inside a strict security sandbox:
- All file paths are restricted to the workspace directory. You cannot access files outside it.
- `run_shell_command` and `delete_file` require explicit human approval before executing. The workflow will PAUSE and wait for the user to click Allow or Deny. You will receive an error if the user denies.
- To minimise approval interruptions, batch related shell operations into a single `run_shell_command` call rather than making many separate calls.
- If a command is denied, try an alternative approach that does not require shell execution.

## Critical output rule

Your TEXT RESPONSE is the primary output that gets passed to the next agent in the workflow. It must be complete and self-contained.

After doing your research and any file operations, write a detailed text response that covers:
- Everything the next agent needs to know to continue
- Your analysis, plan, decisions, and reasoning
- A summary of any files you created or modified, with their key contents

If you created files, mention them and their key contents in your text — do not assume the next agent will find or read them.

**Do NOT stop after tool calls without writing a full text response.** The tool calls are for gathering information and creating artifacts. Your text is the handoff.
"#;

// ─────────────────────────────────────────────
// Document text extraction
// ─────────────────────────────────────────────

/// Extract text from a tag like `<w:t>text</w:t>` or `<a:t>text</a:t>`.
fn extract_xml_tagged_text(xml: &str, tag: &str) -> String {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let mut result = String::new();
    let mut remaining = xml;
    while let Some(start) = remaining.find(&open) {
        remaining = &remaining[start + open.len()..];
        if let Some(end) = remaining.find(&close) {
            let fragment = &remaining[..end];
            // Decode basic XML entities
            let decoded = fragment
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&apos;", "'");
            if !decoded.trim().is_empty() {
                result.push_str(decoded.trim());
                result.push(' ');
            }
            remaining = &remaining[end + close.len()..];
        } else {
            break;
        }
    }
    result.trim().to_string()
}

fn extract_docx_text(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| format!("Cannot open: {}", e))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "File is not a valid DOCX archive".to_string())?;
    let mut xml = String::new();
    zip.by_name("word/document.xml")
        .map_err(|_| "Missing word/document.xml — may not be a valid DOCX".to_string())?
        .read_to_string(&mut xml)
        .map_err(|e| format!("Cannot read document.xml: {}", e))?;
    let text = extract_xml_tagged_text(&xml, "w:t");
    if text.is_empty() { Err("No text content found in DOCX".to_string()) } else { Ok(text) }
}

fn extract_pptx_text(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| format!("Cannot open: {}", e))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "File is not a valid PPTX archive".to_string())?;
    let mut all_text = String::new();
    let count = zip.len();
    for i in 0..count {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
            let mut xml = String::new();
            entry.read_to_string(&mut xml).ok();
            let slide_text = extract_xml_tagged_text(&xml, "a:t");
            if !slide_text.is_empty() {
                all_text.push_str(&slide_text);
                all_text.push('\n');
            }
        }
    }
    if all_text.is_empty() { Err("No text content found in PPTX".to_string()) } else { Ok(all_text.trim().to_string()) }
}

fn extract_xlsx_text(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| format!("Cannot open: {}", e))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "File is not a valid XLSX archive".to_string())?;

    // Collect shared strings (inline text values in XLSX)
    let shared: Vec<String> = if let Ok(mut entry) = zip.by_name("xl/sharedStrings.xml") {
        let mut xml = String::new();
        entry.read_to_string(&mut xml).ok();
        // Each shared string is wrapped in <si><t>...</t></si>; extract all <t> values in order
        let raw = extract_xml_tagged_text(&xml, "t");
        raw.split_whitespace().map(|s| s.to_string()).collect()
    } else {
        vec![]
    };

    // Read sheet 1 and emit a readable TSV-like output
    let mut sheet_xml = String::new();
    if let Ok(mut entry) = zip.by_name("xl/worksheets/sheet1.xml") {
        entry.read_to_string(&mut sheet_xml).ok();
    } else {
        return Err("No sheet data found in XLSX".to_string());
    }

    // Build rows: each <row> contains <c> cells; <v> is value index into shared strings (type t="s")
    // For simplicity: just concatenate all <v> and inline <t> values
    let values = extract_xml_tagged_text(&sheet_xml, "v");
    let inline = extract_xml_tagged_text(&sheet_xml, "is");

    let mut result = String::new();
    if !shared.is_empty() {
        result.push_str("Spreadsheet text content:\n");
        result.push_str(&shared.join("  "));
    } else if !values.is_empty() {
        result.push_str("Spreadsheet values:\n");
        result.push_str(&values);
    }
    if !inline.is_empty() {
        if !result.is_empty() { result.push('\n'); }
        result.push_str(&inline);
    }
    if result.is_empty() { Err("No text content found in XLSX".to_string()) } else { Ok(result) }
}

/// Auto-detect file type and return extracted text content.
/// For plain text files, reads as UTF-8. For PDF/DOCX/PPTX/XLSX, extracts text automatically.
fn extract_text_from_file(path: &Path) -> Result<String, String> {
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "pdf" => pdf_extract::extract_text(path)
            .map_err(|e| format!("PDF extraction failed: {}", e)),
        "docx" | "doc" => extract_docx_text(path),
        "pptx" | "ppt" => extract_pptx_text(path),
        "xlsx" | "xls" => extract_xlsx_text(path),
        _ => std::fs::read_to_string(path)
            .map_err(|e| format!("Cannot read '{}': {}", path.display(), e)),
    }
}

fn tool_definitions(enabled_names: &[String]) -> Vec<ToolDef> {
    let all: Vec<ToolDef> = vec![
        ToolDef {
            name: "read_file".into(),
            description: "Read the text contents of a file. Supports plain text, PDF (.pdf), Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) — text is extracted automatically. Use this before editing to see current content.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string", "description": "Absolute or relative file path" } },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "write_file".into(),
            description: "Write content to a file, creating or overwriting it entirely. Prefer edit_file for partial changes.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string", "description": "Complete file content to write" }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDef {
            name: "edit_file".into(),
            description: "Replace an exact string in a file. Token-efficient for partial edits. old_str must match exactly (whitespace included) and must appear exactly once in the file. WARNING: old_str must match EXACTLY, including all indentation, leading/trailing spaces, and newlines. If it fails, use read_file first to copy the exact text.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "old_str": { "type": "string", "description": "Exact string to replace. Must be unique in the file." },
                    "new_str": { "type": "string", "description": "Replacement string" }
                },
                "required": ["path", "old_str", "new_str"]
            }),
        },
        ToolDef {
            name: "list_directory".into(),
            description: "List files and folders in a directory. To list the current root project folder, pass '.' or the absolute path.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string", "description": "Directory path to list. Use '.' for root." } },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "search_files".into(),
            description: "Search for text in files under a directory. Returns matching lines with file paths and line numbers.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Root directory to search under" },
                    "pattern": { "type": "string", "description": "Text to search for (case-insensitive)" },
                    "file_glob": { "type": "string", "description": "Optional file extension filter, e.g. '*.rs' or '*.ts'" }
                },
                "required": ["path", "pattern"]
            }),
        },
        ToolDef {
            name: "create_directory".into(),
            description: "Create a directory and all parent directories as needed.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "delete_file".into(),
            description: "Delete a file permanently. User will be asked to confirm.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "move_file".into(),
            description: "Move or rename a file.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "src": { "type": "string", "description": "Source file path" },
                    "dst": { "type": "string", "description": "Destination file path" }
                },
                "required": ["src", "dst"]
            }),
        },
        ToolDef {
            name: "run_shell_command".into(),
            description: "Execute a shell command. User will be asked to confirm before running.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "Shell command to execute" },
                    "working_dir": { "type": "string", "description": "Working directory (optional, defaults to workspace)" }
                },
                "required": ["command"]
            }),
        },
        ToolDef {
            name: "fetch_url".into(),
            description: "Fetch the text content of a URL.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "url": { "type": "string" } },
                "required": ["url"]
            }),
        },
    ];
    // Empty list means all tools enabled (no restriction)
    if enabled_names.is_empty() {
        return all;
    }
    all.into_iter()
        .filter(|d| enabled_names.iter().any(|n| n == &d.name))
        .collect()
}

fn tools_to_anthropic(defs: &[ToolDef]) -> serde_json::Value {
    serde_json::json!(defs.iter().map(|d| serde_json::json!({
        "name": d.name,
        "description": d.description,
        "input_schema": d.parameters
    })).collect::<Vec<_>>())
}

fn tools_to_openai(defs: &[ToolDef]) -> serde_json::Value {
    serde_json::json!(defs.iter().map(|d| serde_json::json!({
        "type": "function",
        "function": { "name": d.name, "description": d.description, "parameters": d.parameters }
    })).collect::<Vec<_>>())
}

async fn call_anthropic_with_tools(
    model_id: &str,
    api_key: &str,
    system: &str,
    messages: &[serde_json::Value],
    max_tokens: u32,
    temperature: f64,
    tools: &[ToolDef],
) -> Result<LlmTurnResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let mut body = serde_json::json!({
        "model": model_id,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
    });
    if !tools.is_empty() {
        body["tools"] = tools_to_anthropic(tools);
        body["tool_choice"] = serde_json::json!({ "type": "auto" });
    }
    if (temperature - 1.0).abs() > 1e-9 {
        body["temperature"] = serde_json::json!(temperature);
    }

    for attempt in 1..=3u32 {
        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await;

        match resp {
            Err(e) => {
                if attempt == 3 { return Err(format!("Request failed: {}", e)); }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
            Ok(r) => {
                let status = r.status();
                let raw = r.text().await.map_err(|e| format!("Read response: {}", e))?;
                if status.as_u16() == 503 || status.as_u16() == 529 {
                    if attempt == 3 { return Err(format!("API unavailable ({})", status)); }
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                    continue;
                }
                if !status.is_success() {
                    if let Ok(err) = serde_json::from_str::<AnthropicError>(&raw) {
                        return Err(format!("{}: {}", err.error.error_type, err.error.message));
                    }
                    return Err(format!("API {} — {}", status, &raw[..raw.len().min(400)]));
                }
                let val: serde_json::Value = serde_json::from_str(&raw)
                    .map_err(|e| format!("Parse: {}", e))?;

                let content = val["content"].as_array()
                    .ok_or_else(|| "No content array in response".to_string())?;

                let mut tool_calls: Vec<ToolCall> = vec![];
                let mut text_parts: Vec<String> = vec![];
                for block in content {
                    match block.get("type").and_then(|t| t.as_str()) {
                        Some("tool_use") => {
                            let id = block["id"].as_str().unwrap_or("").to_string();
                            let name = block["name"].as_str().unwrap_or("").to_string();
                            let arguments = block["input"].clone();
                            tool_calls.push(ToolCall { id, name, arguments });
                        }
                        Some("text") => {
                            if let Some(t) = block["text"].as_str() {
                                if !t.is_empty() { text_parts.push(t.to_string()); }
                            }
                        }
                        _ => {}
                    }
                }

                if !tool_calls.is_empty() {
                    let preceding_text = if text_parts.is_empty() { None } else { Some(text_parts.join("")) };
                    return Ok(LlmTurnResult::ToolCalls { tool_calls, preceding_text });
                }

                let tokens = val.pointer("/usage/output_tokens")
                    .and_then(|v| v.as_u64()).map(|n| n as u32);
                let text = text_parts.join("");
                // Empty text is valid — agent may have completed all work via tool calls
                return Ok(LlmTurnResult::Text { content: text, tokens_used: tokens });
            }
        }
    }
    Err("Retry loop exhausted".into())
}

async fn call_openai_compat_with_tools(
    url: &str,
    auth_token: Option<&str>,
    model_id: &str,
    system: &str,
    messages: &[serde_json::Value],
    max_tokens: u32,
    temperature: f64,
    tools: &[ToolDef],
    timeout_secs: u64,
) -> Result<LlmTurnResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let mut all_messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "system", "content": system })
    ];
    all_messages.extend_from_slice(messages);

    let mut body = serde_json::json!({
        "model": model_id,
        "messages": all_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    });
    if !tools.is_empty() {
        body["tools"] = tools_to_openai(tools);
        body["tool_choice"] = serde_json::json!("auto");
    }

    let mut req = client.post(url).header("content-type", "application/json").json(&body);
    if let Some(token) = auth_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let resp = req.send().await.map_err(|e| format!("Request failed: {}", e))?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| format!("Read response: {}", e))?;
    if !status.is_success() {
        return Err(format!("API {} — {}", status, &raw[..raw.len().min(400)]));
    }

    let val: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("Parse: {}", e))?;
    let tokens = val.pointer("/usage/completion_tokens")
        .and_then(|v| v.as_u64()).map(|n| n as u32);
    let message = &val["choices"][0]["message"];

    if let Some(tool_calls_val) = message.get("tool_calls").filter(|v| v.is_array()) {
        if let Some(tc_arr) = tool_calls_val.as_array() {
            if !tc_arr.is_empty() {
                let tool_calls: Vec<ToolCall> = tc_arr.iter().filter_map(|tc| {
                    let id = tc["id"].as_str()?.to_string();
                    let name = tc["function"]["name"].as_str()?.to_string();
                    let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");
                    let arguments = serde_json::from_str(args_str).unwrap_or(serde_json::json!({}));
                    Some(ToolCall { id, name, arguments })
                }).collect();
                if !tool_calls.is_empty() {
                    let preceding_text = message["content"].as_str()
                        .filter(|s| !s.is_empty()).map(|s| s.to_string());
                    return Ok(LlmTurnResult::ToolCalls { tool_calls, preceding_text });
                }
            }
        }
    }

    let text = message["content"].as_str().unwrap_or("").to_string();
    // Empty text is valid — agent may have completed all work via tool calls
    Ok(LlmTurnResult::Text { content: text, tokens_used: tokens })
}

// ── Simple tool format helpers ────────────────────────────────────────
// Used for small local models that can't reliably use native function calling.
// The model is told to output <tool_call>{...}</tool_call> blocks instead.

fn tools_to_simple_prompt(tools: &[ToolDef]) -> String {
    let tool_list = tools.iter().map(|t| {
        // Collect required params
        let required: Vec<&str> = t.parameters["required"]
            .as_array()
            .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
            .unwrap_or_default();

        let props = t.parameters["properties"].as_object()
            .map(|obj| {
                obj.iter().map(|(k, v)| {
                    let desc = v["description"].as_str().unwrap_or("");
                    let req = if required.contains(&k.as_str()) { ", required" } else { ", optional" };
                    format!("  - {} (string{}): {}", k, req, desc)
                }).collect::<Vec<_>>().join("\n")
            })
            .unwrap_or_default();

        format!("**{}**: {}\n{}", t.name, t.description, props)
    }).collect::<Vec<_>>().join("\n\n");

    format!(
        "\n\n## HOW TO CALL TOOLS\n\
        To use a tool, output a JSON block wrapped in <tool_call> tags. Use this EXACT format:\n\
        <tool_call>{{\"name\": \"tool_name\", \"args\": {{\"param\": \"value\"}}}}</tool_call>\n\
        You may include multiple <tool_call> blocks in one response.\n\
        Only use tool names listed below. Do not invent tools.\n\n\
        ## Available Tools\n{}", tool_list
    )
}

fn parse_simple_tool_calls(text: &str) -> (String, Vec<ToolCall>) {
    let mut tool_calls: Vec<ToolCall> = vec![];
    let mut remaining = text.to_string();
    let mut counter = 0u32;

    while let Some(start) = remaining.find("<tool_call>") {
        let after_open = &remaining[start + "<tool_call>".len()..];
        if let Some(end) = after_open.find("</tool_call>") {
            let json_str = &after_open[..end];
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(name) = val["name"].as_str() {
                    counter += 1;
                    let arguments = val["args"].clone();
                    tool_calls.push(ToolCall {
                        id: format!("simple_{}", counter),
                        name: name.to_string(),
                        arguments: if arguments.is_null() { serde_json::json!({}) } else { arguments },
                    });
                }
            }
            // Remove this block from remaining text
            let full_block_len = start + "<tool_call>".len() + end + "</tool_call>".len();
            remaining = format!("{}{}", &remaining[..start], &remaining[full_block_len..]);
        } else {
            break; // Unclosed tag — stop
        }
    }

    let preceding = remaining.trim().to_string();
    (preceding, tool_calls)
}

fn build_simple_tool_results(tool_calls: &[ToolCall], results: &[(String, bool)]) -> Vec<serde_json::Value> {
    let parts: Vec<String> = tool_calls.iter().zip(results.iter())
        .map(|(tc, (content, is_error))| {
            let prefix = if *is_error { "ERROR" } else { "OK" };
            format!("[{}] {}: {}", prefix, tc.name, content)
        })
        .collect();
    vec![serde_json::json!({ "role": "user", "content": parts.join("\n\n") })]
}

// ─────────────────────────────────────────────

async fn llm_call_with_tools(
    model: &ModelConfig,
    system: &str,
    messages: &[serde_json::Value],
    keys_file: &PathBuf,
    tools: &[ToolDef],
) -> Result<LlmTurnResult, String> {
    let max_tokens = effective_max_tokens(&model.provider, &model.model_id, model.max_tokens);

    // Simple tool format: inject tool schema into system prompt, send no tool defs,
    // then parse <tool_call> blocks from the text response.
    if model.simple_tool_format && !tools.is_empty() {
        let augmented_system = format!("{}{}", system, tools_to_simple_prompt(tools));
        // Call as plain text (no tool definitions)
        let text_result = llm_call_text(model, &augmented_system, messages, keys_file, max_tokens).await?;
        let (preceding, parsed_calls) = parse_simple_tool_calls(&text_result.0);
        if !parsed_calls.is_empty() {
            return Ok(LlmTurnResult::ToolCalls {
                tool_calls: parsed_calls,
                preceding_text: if preceding.is_empty() { None } else { Some(preceding) },
            });
        }
        return Ok(LlmTurnResult::Text { content: text_result.0, tokens_used: text_result.1 });
    }

    // Local/Ollama models benefit from a much longer timeout — they can be slow thinkers.
    let timeout_secs: u64 = match model.provider.as_str() {
        "ollama" | "custom" => 1800, // 30 minutes for local models
        _ => 300,                     // 5 minutes for API providers
    };

    match model.provider.as_str() {
        "anthropic" => {
            let key = model.api_key_ref.as_deref()
                .and_then(|r| load_keys(keys_file).remove(r))
                .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
                .ok_or_else(|| "No Anthropic API key — open Settings (⚙) to add one.".to_string())?;
            call_anthropic_with_tools(&model.model_id, &key, system, messages, max_tokens, model.temperature, tools).await
        }
        "openai" => {
            let key = model.api_key_ref.as_deref()
                .and_then(|r| load_keys(keys_file).remove(r))
                .or_else(|| std::env::var("OPENAI_API_KEY").ok())
                .ok_or_else(|| "No OpenAI API key — open Settings (⚙) to add one.".to_string())?;
            call_openai_compat_with_tools("https://api.openai.com/v1/chat/completions", Some(&key), &model.model_id, system, messages, max_tokens, model.temperature, tools, timeout_secs).await
        }
        "ollama" => {
            let base = model.base_url.as_deref().unwrap_or("http://localhost:11434");
            let url = format!("{}/v1/chat/completions", base.trim_end_matches('/'));
            call_openai_compat_with_tools(&url, None, &model.model_id, system, messages, max_tokens, model.temperature, tools, timeout_secs).await
        }
        "custom" => {
            let base = model.base_url.as_deref().unwrap_or("http://localhost:8080");
            let url = format!("{}/v1/chat/completions", base.trim_end_matches('/'));
            let key = model.api_key_ref.as_deref().and_then(|r| load_keys(keys_file).remove(r));
            call_openai_compat_with_tools(&url, key.as_deref(), &model.model_id, system, messages, max_tokens, model.temperature, tools, timeout_secs).await
        }
        p => Err(format!("Unsupported provider: {}", p)),
    }
}

// Plain text call — used by simple_tool_format path and briefing (no tool defs sent)
async fn llm_call_text(
    model: &ModelConfig,
    system: &str,
    messages: &[serde_json::Value],
    keys_file: &PathBuf,
    max_tokens: u32,
) -> Result<(String, Option<u32>), String> {
    let timeout_secs: u64 = match model.provider.as_str() {
        "ollama" | "custom" => 1800,
        _ => 300,
    };
    match model.provider.as_str() {
        "anthropic" => {
            let key = model.api_key_ref.as_deref()
                .and_then(|r| load_keys(keys_file).remove(r))
                .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
                .ok_or_else(|| "No Anthropic API key".to_string())?;
            let r = call_anthropic_with_tools(&model.model_id, &key, system, messages, max_tokens, model.temperature, &[]).await?;
            Ok(match r { LlmTurnResult::Text { content, tokens_used } => (content, tokens_used), _ => ("".into(), None) })
        }
        _ => {
            let (url, key) = match model.provider.as_str() {
                "openai" => {
                    let key = model.api_key_ref.as_deref()
                        .and_then(|r| load_keys(keys_file).remove(r))
                        .or_else(|| std::env::var("OPENAI_API_KEY").ok());
                    ("https://api.openai.com/v1/chat/completions".to_string(), key)
                }
                "ollama" => {
                    let base = model.base_url.as_deref().unwrap_or("http://localhost:11434");
                    (format!("{}/v1/chat/completions", base.trim_end_matches('/')), None)
                }
                _ => {
                    let base = model.base_url.as_deref().unwrap_or("http://localhost:8080");
                    let k = model.api_key_ref.as_deref().and_then(|r| load_keys(keys_file).remove(r));
                    (format!("{}/v1/chat/completions", base.trim_end_matches('/')), k)
                }
            };
            let r = call_openai_compat_with_tools(&url, key.as_deref(), &model.model_id, system, messages, max_tokens, model.temperature, &[], timeout_secs).await?;
            Ok(match r { LlmTurnResult::Text { content, tokens_used } => (content, tokens_used), _ => ("".into(), None) })
        }
    }
}

// ─────────────────────────────────────────────
// Tool execution helpers
// ─────────────────────────────────────────────

/// Build the raw (un-canonicalized) candidate path from an agent-supplied string.
/// Relative paths are joined to the workspace root; absolute paths are taken as-is.
fn resolve_path(path: &str, workspace_path: Option<&str>) -> PathBuf {
    let p = PathBuf::from(path);
    if p.is_absolute() {
        p
    } else if let Some(ws) = workspace_path {
        if path == "." || path == "./" || path.is_empty() {
            PathBuf::from(ws)
        } else {
            PathBuf::from(ws).join(p)
        }
    } else {
        p
    }
}

fn platform_home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Canonicalize a path that may not yet exist on disk.
/// Works by walking up to the deepest existing ancestor, canonicalizing it,
/// then re-appending the non-existent suffix.  Resolves all symlinks.
fn canonicalize_or_parent(path: &Path) -> std::io::Result<PathBuf> {
    if path.exists() {
        return dunce::canonicalize(path);
    }
    let mut current = path.to_path_buf();
    let mut suffix: Vec<std::ffi::OsString> = Vec::new();
    loop {
        match current.file_name() {
            Some(name) => suffix.push(name.to_os_string()),
            None => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("No existing ancestor found for '{}'", path.display()),
                ))
            }
        }
        current = match current.parent() {
            Some(p) => p.to_path_buf(),
            None => return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Reached filesystem root without finding an existing directory",
            )),
        };
        if current.exists() {
            let mut canonical = dunce::canonicalize(&current)?;
            for component in suffix.into_iter().rev() {
                canonical.push(component);
            }
            return Ok(canonical);
        }
    }
}

/// Jail check: resolve both paths with full canonicalization (symlinks included),
/// then enforce that the target is strictly inside the workspace.
/// Returns the canonical target path on success so callers can use it directly.
fn jail_path(path: &Path, workspace: &str) -> Result<PathBuf, String> {
    let ws_canon = dunce::canonicalize(workspace)
        .map_err(|e| format!("Cannot access workspace '{}': {}", workspace, e))?;

    let path_canon = canonicalize_or_parent(path)
        .map_err(|e| format!("Cannot resolve path '{}': {}", path.display(), e))?;

    if !path_canon.starts_with(&ws_canon) {
        return Err(format!(
            "SECURITY VIOLATION: '{}' is outside the workspace. Access denied.",
            path_canon.display()
        ));
    }
    Ok(path_canon)
}

/// Secondary deny-list check (belt-and-suspenders on top of jail_path).
fn check_denied(path: &Path, permissions: &ToolPermissionConfig) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    let home = platform_home();
    for denied in &permissions.denied_paths {
        let expanded = denied.replace('~', &home.to_string_lossy());
        if path_str.starts_with(&expanded) {
            return Err(format!("Access to '{}' is denied by policy", path.display()));
        }
    }
    Ok(())
}

fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes { return s; }
    let mut idx = max_bytes;
    while idx > 0 && !s.is_char_boundary(idx) { idx -= 1; }
    &s[..idx]
}

fn format_args_preview(args: &serde_json::Value) -> String {
    if let Some(obj) = args.as_object() {
        obj.iter()
            .take(2)
            .map(|(k, v)| {
                let val = match v {
                    serde_json::Value::String(s) => safe_truncate(s, 60).to_string(),
                    other => safe_truncate(&other.to_string(), 60).to_string(),
                };
                format!("{}: {}", k, val)
            })
            .collect::<Vec<_>>()
            .join(", ")
    } else {
        safe_truncate(&args.to_string(), 80).to_string()
    }
}

fn build_assistant_tool_call_message(
    tool_calls: &[ToolCall],
    provider: &str,
    preceding_text: Option<&str>,
) -> serde_json::Value {
    match provider {
        "anthropic" => {
            let mut content: Vec<serde_json::Value> = vec![];
            if let Some(text) = preceding_text {
                if !text.is_empty() {
                    content.push(serde_json::json!({ "type": "text", "text": text }));
                }
            }
            for tc in tool_calls {
                content.push(serde_json::json!({
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.name,
                    "input": tc.arguments
                }));
            }
            serde_json::json!({ "role": "assistant", "content": content })
        }
        _ => {
            let tc_list: Vec<serde_json::Value> = tool_calls.iter().map(|tc| serde_json::json!({
                "id": tc.id,
                "type": "function",
                "function": { "name": tc.name, "arguments": tc.arguments.to_string() }
            })).collect();
            serde_json::json!({
                "role": "assistant",
                "content": preceding_text.unwrap_or(""),
                "tool_calls": tc_list
            })
        }
    }
}

fn build_tool_result_messages(
    tool_calls: &[ToolCall],
    results: &[(String, bool)],
    provider: &str,
) -> Vec<serde_json::Value> {
    match provider {
        "anthropic" => {
            let parts: Vec<serde_json::Value> = tool_calls.iter().zip(results.iter())
                .map(|(tc, (content, is_error))| {
                    let mut part = serde_json::json!({
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": content
                    });
                    if *is_error { part["is_error"] = serde_json::json!(true); }
                    part
                })
                .collect();
            vec![serde_json::json!({ "role": "user", "content": parts })]
        }
        _ => {
            tool_calls.iter().zip(results.iter())
                .map(|(tc, (content, _))| serde_json::json!({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": content
                }))
                .collect()
        }
    }
}

async fn request_tool_confirmation(
    app: &AppHandle,
    run_id: &str,
    node_id: &str,
    agent_name: &str,
    tool_call_id: &str,
    tool_name: &str,
    command: &str,
    state: &Arc<AppState>,
) -> Result<bool, String> {
    let (tx, rx) = oneshot::channel::<bool>();
    {
        let runs = state.active_runs.lock().unwrap();
        if let Some(handle) = runs.get(run_id) {
            handle.tool_confirm_senders.lock().unwrap()
                .insert(tool_call_id.to_string(), tx);
        } else {
            return Err("Run no longer active".into());
        }
    }
    let _ = app.emit(
        &format!("conductor://run/{}/tool_confirm_request", run_id),
        serde_json::json!({
            "nodeId": node_id,
            "agentName": agent_name,
            "toolCallId": tool_call_id,
            "toolName": tool_name,
            "command": command,
        }),
    );
    rx.await.map_err(|_| "Confirmation channel closed (run cancelled)".into())
}

async fn execute_tool(
    tc: &ToolCall,
    workspace_path: Option<&str>,
    enabled_tools: &[String],
    permissions: &ToolPermissionConfig,
    app: &AppHandle,
    run_id: &str,
    node_id: &str,
    agent_name: &str,
    state: &Arc<AppState>,
) -> Result<String, String> {
    // Empty list = full access (no restriction); non-empty = explicit allowlist
    if !enabled_tools.is_empty() && !enabled_tools.iter().any(|n| n == &tc.name) {
        return Err(format!("Tool '{}' is not enabled for this agent", tc.name));
    }
    let args = &tc.arguments;

    // Require a workspace for all file-system tools
    let ws = workspace_path.ok_or_else(|| {
        "No workspace directory is set. Select a workspace before running file tools.".to_string()
    });

    match tc.name.as_str() {
        "read_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            let content = extract_text_from_file(&canonical)
                .map_err(|e| format!("Cannot read '{}': {}", path, e))?;
            if content.len() > 200_000 {
                Ok(format!("{}...\n[truncated — file is {} bytes]", safe_truncate(&content, 200_000), content.len()))
            } else {
                Ok(content)
            }
        }

        "write_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let content = args["content"].as_str().ok_or("missing content")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            if let Some(parent) = canonical.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
            }
            std::fs::write(&canonical, content)
                .map_err(|e| format!("Cannot write '{}': {}", path, e))?;
            Ok(format!("Written {} bytes to {}", content.len(), path))
        }

        "edit_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let old_str = args["old_str"].as_str().ok_or("missing old_str")?;
            let new_str = args["new_str"].as_str().ok_or("missing new_str")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            let current = std::fs::read_to_string(&canonical)
                .map_err(|e| format!("Cannot read '{}': {}", path, e))?;
            if !current.contains(old_str) {
                let snippet = safe_truncate(&current, 600);
                return Err(format!(
                    "old_str not found in '{}'.\n\nFile content (first 600 chars):\n{}\n\nUse read_file to see the exact content, then retry with a string that matches exactly (including whitespace and newlines).",
                    path, snippet
                ));
            }
            let count = current.matches(old_str).count();
            if count > 1 {
                return Err(format!(
                    "old_str matches {} times in '{}'. Provide a more specific string that appears exactly once.",
                    count, path
                ));
            }
            let updated = current.replacen(old_str, new_str, 1);
            std::fs::write(&canonical, &updated)
                .map_err(|e| format!("Cannot write '{}': {}", path, e))?;
            Ok(format!("Edited {} — replaced {} chars with {} chars", path, old_str.len(), new_str.len()))
        }

        "list_directory" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            let mut entries: Vec<String> = std::fs::read_dir(&canonical)
                .map_err(|e| format!("Cannot list '{}': {}", path, e))?
                .filter_map(|e| e.ok())
                .map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    if e.path().is_dir() { format!("{}/", name) } else { name }
                })
                .collect();
            entries.sort();
            if entries.is_empty() { Ok("(empty directory)".into()) } else { Ok(entries.join("\n")) }
        }

        "search_files" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let pattern = args["pattern"].as_str().ok_or("missing pattern")?;
            let file_glob = args["file_glob"].as_str().unwrap_or("");
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            let pattern_lower = pattern.to_lowercase();
            let mut matches: Vec<String> = vec![];

            for entry in walkdir::WalkDir::new(&canonical)
                .max_depth(20)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
            {
                if matches.len() >= 100 { break; }
                let fname = entry.file_name().to_string_lossy().to_string();
                if !file_glob.is_empty() {
                    let glob = file_glob.trim();
                    let hit = if let Some(ext) = glob.strip_prefix("*.") {
                        fname.ends_with(&format!(".{}", ext))
                    } else if glob.starts_with('*') {
                        fname.ends_with(&glob[1..])
                    } else {
                        fname == glob
                    };
                    if !hit { continue; }
                }
                if entry.metadata().map(|m| m.len()).unwrap_or(0) > 1_000_000 { continue; }
                let content = match std::fs::read_to_string(entry.path()) {
                    Ok(c) => c, Err(_) => continue,
                };
                for (lineno, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(&pattern_lower) {
                        let rel = entry.path().strip_prefix(&canonical)
                            .unwrap_or(entry.path())
                            .to_string_lossy().replace('\\', "/");
                        matches.push(format!("{}:{}: {}", rel, lineno + 1, line.trim()));
                        if matches.len() >= 100 { break; }
                    }
                }
            }

            if matches.is_empty() {
                Ok(format!("No matches found for '{}'", pattern))
            } else {
                let mut result = matches.join("\n");
                if matches.len() == 100 { result.push_str("\n[results capped at 100 matches]"); }
                Ok(result)
            }
        }

        "create_directory" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            std::fs::create_dir_all(&canonical)
                .map_err(|e| format!("Cannot create '{}': {}", path, e))?;
            Ok(format!("Created directory: {}", path))
        }

        "delete_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            let confirmed = request_tool_confirmation(
                app, run_id, node_id, agent_name, &tc.id, "delete_file",
                path, state,
            ).await?;
            if !confirmed { return Err("File deletion rejected by user.".into()); }
            std::fs::remove_file(&canonical)
                .map_err(|e| format!("Cannot delete '{}': {}", path, e))?;
            Ok(format!("Deleted: {}", path))
        }

        "move_file" => {
            let src = args["src"].as_str().ok_or("missing src")?;
            let dst = args["dst"].as_str().ok_or("missing dst")?;
            let src_r = resolve_path(src, workspace_path);
            let dst_r = resolve_path(dst, workspace_path);
            let ws_str = ws?;
            let src_c = jail_path(&src_r, ws_str)?;
            let dst_c = jail_path(&dst_r, ws_str)?;
            check_denied(&src_c, permissions)?;
            check_denied(&dst_c, permissions)?;
            std::fs::rename(&src_c, &dst_c)
                .map_err(|e| format!("Cannot move '{}' to '{}': {}", src, dst, e))?;
            Ok(format!("Moved {} → {}", src, dst))
        }

        "run_shell_command" => {
            let command = args["command"].as_str().ok_or("missing command")?;
            let confirmed = request_tool_confirmation(
                app, run_id, node_id, agent_name, &tc.id, "run_shell_command",
                command, state,
            ).await?;
            if !confirmed { return Err("Shell command rejected by user.".into()); }

            let working_dir = args["working_dir"].as_str()
                .map(|d| resolve_path(d, workspace_path))
                .or_else(|| workspace_path.map(PathBuf::from));

            let mut cmd = if cfg!(target_os = "windows") {
                let mut c = tokio::process::Command::new("cmd");
                c.args(["/C", command]); c
            } else {
                let mut c = tokio::process::Command::new("sh");
                c.args(["-c", command]); c
            };
            if let Some(dir) = &working_dir {
                if dir.exists() { cmd.current_dir(dir); }
            }

            let output = cmd.output().await
                .map_err(|e| format!("Failed to execute command: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let exit_code = output.status.code().unwrap_or(-1);
            let mut result = format!("Exit code: {}\n", exit_code);
            if !stdout.is_empty() { result.push_str(&format!("stdout:\n{}\n", stdout)); }
            if !stderr.is_empty() { result.push_str(&format!("stderr:\n{}\n", stderr)); }
            if result.len() > 50_000 {
                result.truncate(50_000);
                result.push_str("\n[output truncated at 50KB]");
            }
            Ok(result)
        }

        "fetch_url" => {
            let url = args["url"].as_str().ok_or("missing url")?;
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .map_err(|e| format!("HTTP client: {}", e))?;
            let text = client.get(url).send().await
                .map_err(|e| format!("Fetch failed: {}", e))?
                .text().await
                .map_err(|e| format!("Read body: {}", e))?;
            if text.len() > 50_000 {
                Ok(format!("{}...\n[truncated at 50KB]", safe_truncate(&text, 50_000)))
            } else {
                Ok(text)
            }
        }

        name => Err(format!("Unknown tool: {}", name)),
    }
}

// ─────────────────────────────────────────────
// Workflow executor
// ─────────────────────────────────────────────

struct ExecCtx {
    input: String,
    chain: Vec<(String, String)>,
}

impl ExecCtx {
    fn build_message(&self, context_mode: &str) -> String {
        match context_mode {
            "none" => format!("Task: {}", self.input),
            "previous" => {
                if let Some((name, out)) = self.chain.last() {
                    format!("Task: {}\n\nOutput from {}:\n{}", self.input, name, out)
                } else {
                    format!("Task: {}", self.input)
                }
            }
            _ => {
                let mut msg = format!("Task: {}", self.input);
                for (name, out) in &self.chain {
                    msg.push_str(&format!("\n\nOutput from {}:\n{}", name, out));
                }
                msg
            }
        }
    }
}

async fn exec_agent(
    data: &AgentNodeData,
    node_id: &str,
    attempt: u32,
    ctx: &mut ExecCtx,
    run_id: &str,
    run: &mut Run,
    state: &Arc<AppState>,
    app: &AppHandle,
    cancel: &Arc<AtomicBool>,
    extra_context: Option<&str>,
    workspace_path: Option<&str>,
) -> Result<String, String> {
    if cancel.load(Ordering::Relaxed) { return Err("__cancelled__".into()); }

    let _ = app.emit(
        &format!("conductor://run/{}/step_started", run_id),
        serde_json::json!({ "nodeId": node_id, "nodeName": data.name, "attempt": attempt }),
    );

    let mut user_msg = ctx.build_message(&data.context_mode);
    if let Some(extra) = extra_context {
        user_msg.push_str(&format!("\n\n{}", extra));
    }

    let tool_defs = tool_definitions(&data.tools_enabled);

    let mut system_prompt = data.system_prompt.clone();

    // Inject workspace location and file tree so the agent knows where it operates
    if let Some(ws_path) = workspace_path {
        system_prompt.push_str(&format!(
            "\n\n## Workspace Location\nYour absolute working directory is: `{}`\nUse this absolute path or relative paths (like '.') with your tools.",
            ws_path
        ));
        if let Ok(files) = workspace_fs::read_manifest_internal(ws_path) {
            if !files.is_empty() {
                let tree = files.iter().map(|f| f.path.clone()).collect::<Vec<_>>().join("\n");
                user_msg = format!("Project file tree:\n{}\n\n{}", tree, user_msg);
            }
        }
    }
    system_prompt.push_str(TOOL_EDIT_INSTRUCTIONS);

    let mut step = RunStep {
        node_id: node_id.into(),
        node_name: data.name.clone(),
        attempt,
        started_at: now(),
        completed_at: None,
        status: "running".into(),
        input: user_msg.clone(),
        output: String::new(),
        tokens_used: None,
        error: None,
        files_written: vec![],
    };

    // ── Agentic tool loop (single execution path for all models) ──
    let mut messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": user_msg })
    ];
    let mut total_tokens: Option<u32> = None;
    let mut files_written: Vec<String> = vec![];
    let permissions = ToolPermissionConfig::default();
    let provider = data.model.provider.clone();

    // Accumulates all text produced across the entire loop (preceding texts + final response).
    // This becomes the chain output so subsequent agents have the full narrative.
    let mut accumulated_text = String::new();
    // Tracks read-only iterations with no writes; triggers forced output after the limit.
    let mut read_only_streak = 0u32;
    // After this many consecutive read-only iterations, strip tools and demand text output.
    const READ_LIMIT: u32 = 4;

    let tool_loop_result: Result<String, String> = 'tool_loop: {
        for _iteration in 0..20u32 {
            if cancel.load(Ordering::Relaxed) {
                break 'tool_loop Err("__cancelled__".into());
            }

            // If the agent has been reading without producing anything, force it to write output.
            let (call_tools, call_messages) = if read_only_streak >= READ_LIMIT {
                let mut msgs = messages.clone();
                msgs.push(serde_json::json!({
                    "role": "user",
                    "content": "You have done enough research. Do NOT call any more tools. \
                    Write your complete, detailed output as a text response right now. \
                    Include everything the next agent needs to know."
                }));
                (false, msgs) // no tools → forces text response
            } else {
                (true, messages.clone())
            };

            let turn = match llm_call_with_tools(
                &data.model, &system_prompt, &call_messages, &state.keys_file(),
                if call_tools { &tool_defs } else { &[] }
            ).await {
                Ok(t) => t,
                Err(e) => break 'tool_loop Err(e),
            };

            match turn {
                LlmTurnResult::Text { content, tokens_used } => {
                    total_tokens = tokens_used;
                    if !content.is_empty() {
                        if !accumulated_text.is_empty() {
                            accumulated_text.push('\n');
                        }
                        accumulated_text.push_str(&content);
                        let _ = app.emit(
                            &format!("conductor://run/{}/step_chunk", run_id),
                            serde_json::json!({ "nodeId": node_id, "chunk": content }),
                        );
                    }
                    break 'tool_loop Ok(accumulated_text.clone());
                }

                LlmTurnResult::ToolCalls { tool_calls, preceding_text } => {
                    // Collect any narrative the agent wrote before calling tools
                    if let Some(ref text) = preceding_text {
                        if !text.is_empty() {
                            if !accumulated_text.is_empty() {
                                accumulated_text.push('\n');
                            }
                            accumulated_text.push_str(text);
                            let _ = app.emit(
                                &format!("conductor://run/{}/step_chunk", run_id),
                                serde_json::json!({ "nodeId": node_id, "chunk": text }),
                            );
                        }
                    }

                    if data.model.simple_tool_format {
                        // In simple mode the full text (with embedded <tool_call> blocks) is the assistant turn
                        let full = preceding_text.as_deref().unwrap_or("").to_string();
                        messages.push(serde_json::json!({ "role": "assistant", "content": full }));
                    } else {
                        messages.push(build_assistant_tool_call_message(
                            &tool_calls, &provider, preceding_text.as_deref()
                        ));
                    }

                    let mut had_write = false;
                    let mut results: Vec<(String, bool)> = vec![];

                    for tc in &tool_calls {
                        let args_preview = format_args_preview(&tc.arguments);
                        let _ = app.emit(
                            &format!("conductor://run/{}/tool_call_started", run_id),
                            serde_json::json!({
                                "nodeId": node_id,
                                "toolCallId": tc.id,
                                "toolName": tc.name,
                                "argsPreview": args_preview,
                            }),
                        );

                        let result = execute_tool(
                            tc, workspace_path, &data.tools_enabled,
                            &permissions, app, run_id, node_id, &data.name, state,
                        ).await;

                        let (content, is_error) = match result {
                            Ok(s) => (s, false),
                            Err(e) => (format!("Error: {}", e), true),
                        };

                        // ✨ Append an audit log of the tool call so the next agent sees it
                        let status = if is_error { "FAILED" } else { "SUCCESS" };
                        let audit_log = format!("\n> [System Log: Agent ran `{}` with args `{}` -> {}]", tc.name, args_preview, status);
                        if !accumulated_text.is_empty() {
                            accumulated_text.push('\n');
                        }
                        accumulated_text.push_str(&audit_log);

                        if !is_error && (tc.name == "write_file" || tc.name == "edit_file") {
                            had_write = true;
                            if let Some(p) = tc.arguments.get("path").and_then(|v| v.as_str()) {
                                files_written.push(p.to_string());
                            }
                        }

                        let preview = safe_truncate(&content, 300).to_string();
                        let _ = app.emit(
                            &format!("conductor://run/{}/tool_call_done", run_id),
                            serde_json::json!({
                                "nodeId": node_id,
                                "toolCallId": tc.id,
                                "toolName": tc.name,
                                "resultPreview": preview,
                                "isError": is_error,
                            }),
                        );

                        results.push((content, is_error));
                    }

                    // Track whether this iteration produced any writes
                    if had_write {
                        read_only_streak = 0;
                    } else {
                        read_only_streak += 1;
                    }

                    let result_msgs = if data.model.simple_tool_format {
                        build_simple_tool_results(&tool_calls, &results)
                    } else {
                        build_tool_result_messages(&tool_calls, &results, &provider)
                    };
                    messages.extend(result_msgs);
                }
            }
        }

        // Exhausted iterations — use whatever text was accumulated rather than erroring.
        // The agent did produce content (via preceding texts), just never concluded cleanly.
        if !accumulated_text.is_empty() {
            Ok(accumulated_text.clone())
        } else if !files_written.is_empty() {
            Ok(String::new()) // build_effective_output will fill in from files
        } else {
            Err("Agent did not produce any output".into())
        }
    };

    // Finalize step regardless of outcome
    step.completed_at = Some(now());
    match tool_loop_result {
        Ok(text_output) => {
            let effective_output = build_effective_output(&text_output, &files_written, workspace_path);
            step.status = "done".into();
            step.output = effective_output.clone();
            step.tokens_used = total_tokens;
            step.files_written = files_written.clone();
            run.steps.push(step);
            let _ = save_json(&state.runs_dir().join(format!("{}.json", run_id)), run);
            let _ = app.emit(
                &format!("conductor://run/{}/step_done", run_id),
                serde_json::json!({
                    "nodeId": node_id, "output": effective_output,
                    "tokensUsed": total_tokens, "filesWritten": files_written,
                }),
            );
            ctx.chain.push((data.name.clone(), effective_output.clone()));
            Ok(effective_output)
        }
        Err(e) => {
            step.status = "error".into();
            step.error = Some(e.clone());
            run.steps.push(step);
            let _ = save_json(&state.runs_dir().join(format!("{}.json", run_id)), run);
            let _ = app.emit(
                &format!("conductor://run/{}/step_error", run_id),
                serde_json::json!({ "nodeId": node_id, "error": e }),
            );
            Err(e)
        }
    }
}

fn is_approved(review: &str) -> bool {
    let upper = review.to_uppercase();
    upper.contains("APPROVED") && !upper.contains("NOT APPROVED")
}

/// Build the rich output string stored in the step and passed via the context chain.
///
/// Combines the agent's text narrative with the full contents of any files it created.
/// Subsequent agents receive this as context — they get both the reasoning AND the artifacts
/// without needing `read_file` themselves.
fn build_effective_output(text: &str, files_written: &[String], workspace_path: Option<&str>) -> String {
    if files_written.is_empty() {
        return text.to_string();
    }

    let mut parts: Vec<String> = Vec::new();
    if !text.is_empty() {
        parts.push(text.to_string());
    }

    let mut file_sections: Vec<String> = Vec::new();
    for path_str in files_written {
        let full_path = {
            let p = std::path::Path::new(path_str);
            if p.is_absolute() {
                p.to_path_buf()
            } else if let Some(ws) = workspace_path {
                std::path::Path::new(ws).join(p)
            } else {
                p.to_path_buf()
            }
        };
        if let Ok(content) = std::fs::read_to_string(&full_path) {
            file_sections.push(format!("--- {} ---\n{}", path_str, content));
        } else {
            file_sections.push(format!("--- {} --- (file not readable)", path_str));
        }
    }

    if !file_sections.is_empty() {
        let header = format!("Files created/modified: {}", files_written.join(", "));
        parts.push(header);
        parts.extend(file_sections);
    }

    parts.join("\n\n")
}

async fn exec_loop(
    data: &LoopNodeData,
    node_map: &HashMap<String, WorkflowNode>,
    ctx: &mut ExecCtx,
    run_id: &str,
    run: &mut Run,
    state: &Arc<AppState>,
    app: &AppHandle,
    cancel: &Arc<AtomicBool>,
    workspace_path: Option<&str>,
) -> Result<String, String> {
    let target = node_map.get(&data.target_node_id)
        .ok_or_else(|| format!("Loop target '{}' not found", data.target_node_id))?;
    let reviewer = node_map.get(&data.reviewer_node_id)
        .ok_or_else(|| format!("Loop reviewer '{}' not found", data.reviewer_node_id))?;

    let target_data: AgentNodeData = serde_json::from_value(target.data.clone())
        .map_err(|e| format!("Loop target data: {}", e))?;
    let reviewer_data: AgentNodeData = serde_json::from_value(reviewer.data.clone())
        .map_err(|e| format!("Loop reviewer data: {}", e))?;

    let chain_len_before = ctx.chain.len();
    let mut last_output = String::new();
    let mut extra_ctx: Option<String> = None;

    for attempt in 1..=data.max_retries {
        if cancel.load(Ordering::Relaxed) { return Err("__cancelled__".into()); }
        ctx.chain.truncate(chain_len_before);

        last_output = exec_agent(
            &target_data, &target.id, attempt, ctx,
            run_id, run, state, app, cancel, extra_ctx.as_deref(), workspace_path,
        ).await?;

        let chain_len_after_worker = ctx.chain.len();

        let review = exec_agent(
            &reviewer_data, &reviewer.id, attempt, ctx,
            run_id, run, state, app, cancel, None, workspace_path,
        ).await?;

        ctx.chain.truncate(chain_len_after_worker);

        let approved = is_approved(&review);
        if approved && data.exit_condition == "reviewer_approves" { break; }

        extra_ctx = Some(format!(
            "Your previous output:\n{}\n\nFeedback from {}:\n{}",
            last_output, reviewer_data.name, review
        ));
    }
    Ok(last_output)
}

async fn exec_review_gate(
    data: &ReviewGateData,
    node_id: &str,
    ctx: &ExecCtx,
    run_id: &str,
    run: &mut Run,
    state: &Arc<AppState>,
    app: &AppHandle,
) -> Result<String, String> {
    let last_output = ctx.chain.last().map(|(_, o)| o.clone()).unwrap_or_default();
    run.status = "paused".into();
    let _ = save_json(&state.runs_dir().join(format!("{}.json", run_id)), run);
    let _ = app.emit(
        &format!("conductor://run/{}/gate_paused", run_id),
        serde_json::json!({ "nodeId": node_id, "output": last_output, "message": data.message }),
    );
    let (tx, rx) = oneshot::channel::<GateResponse>();
    {
        let runs = state.active_runs.lock().unwrap();
        if let Some(handle) = runs.get(run_id) {
            handle.gate_senders.lock().unwrap().insert(node_id.to_string(), tx);
        }
    }
    match rx.await {
        Ok(GateResponse::Approve) => { run.status = "running".into(); Ok(last_output) }
        Ok(GateResponse::Reject { feedback }) => { run.status = "running".into(); Err(format!("__gate_rejected__:{}", feedback)) }
        Ok(GateResponse::Edit { content }) => { run.status = "running".into(); Ok(content) }
        Err(_) => Err("Gate channel closed (run cancelled)".into()),
    }
}

fn topological_order(nodes: &[WorkflowNode], edges: &[WorkflowEdge]) -> Vec<String> {
    let mut indegree: HashMap<&str, usize> = nodes.iter().map(|n| (n.id.as_str(), 0)).collect();
    let mut adj: HashMap<&str, Vec<&str>> = nodes.iter().map(|n| (n.id.as_str(), vec![])).collect();
    for e in edges {
        adj.entry(e.source_node_id.as_str()).or_default().push(e.target_node_id.as_str());
        *indegree.entry(e.target_node_id.as_str()).or_insert(0) += 1;
    }
    let mut queue: std::collections::VecDeque<&str> =
        indegree.iter().filter(|(_, &d)| d == 0).map(|(&id, _)| id).collect();
    let mut order = Vec::new();
    while let Some(id) = queue.pop_front() {
        order.push(id.to_string());
        if let Some(neighbors) = adj.get(id) {
            for &nb in neighbors {
                let deg = indegree.get_mut(nb).unwrap();
                *deg -= 1;
                if *deg == 0 { queue.push_back(nb); }
            }
        }
    }
    order
}

fn inner_node_ids(nodes: &[WorkflowNode]) -> std::collections::HashSet<String> {
    let mut set = std::collections::HashSet::new();
    for n in nodes {
        if n.node_type == "loop" {
            if let Ok(data) = serde_json::from_value::<LoopNodeData>(n.data.clone()) {
                set.insert(data.target_node_id);
                set.insert(data.reviewer_node_id);
            }
        }
    }
    set
}

async fn execute_workflow(
    workflow: Workflow,
    input: String,
    run_id: String,
    state: Arc<AppState>,
    app: AppHandle,
    workspace_config: Option<WorkspaceConfig>,
) {
    let cancel = {
        let runs = state.active_runs.lock().unwrap();
        runs.get(&run_id)
            .map(|h| h.cancel_flag.clone())
            .unwrap_or_else(|| Arc::new(AtomicBool::new(false)))
    };

    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let workspace_path_owned = workspace_config.as_ref().map(|w| w.workspace_path.clone());

    let mut run: Run = match load_json(&state.runs_dir().join(format!("{}.json", &run_id))) {
        Ok(r) => r,
        Err(_) => Run {
            id: run_id.clone(),
            workflow_id: workflow.id.clone(),
            started_at: now(),
            completed_at: None,
            status: "running".into(),
            input: input.clone(),
            steps: vec![],
            final_output: None,
            workspace_config,
        },
    };

    let node_map: HashMap<String, WorkflowNode> =
        workflow.nodes.iter().map(|n| (n.id.clone(), n.clone())).collect();
    let order = topological_order(&workflow.nodes, &workflow.edges);
    let inner = inner_node_ids(&workflow.nodes);

    let mut ctx = ExecCtx { input, chain: vec![] };
    let mut final_output = String::new();
    let ws = workspace_path_owned.as_deref();

    for node_id in &order {
        if inner.contains(node_id) { continue; }
        if cancel.load(Ordering::Relaxed) {
            run.status = "cancelled".into();
            run.completed_at = Some(now());
            let _ = save_json(&state.runs_dir().join(format!("{}.json", &run_id)), &run);
            let _ = app.emit(&format!("conductor://run/{}/cancelled", &run_id), serde_json::json!({}));
            cleanup(&state, &run_id);
            return;
        }

        let node = match node_map.get(node_id) { Some(n) => n.clone(), None => continue };

        let result = match node.node_type.as_str() {
            "agent" => match serde_json::from_value::<AgentNodeData>(node.data.clone()) {
                Ok(data) => exec_agent(&data, &node.id, 1, &mut ctx, &run_id, &mut run, &state, &app, &cancel, None, ws).await,
                Err(e) => Err(format!("Agent data: {}", e)),
            },
            "loop" => match serde_json::from_value::<LoopNodeData>(node.data.clone()) {
                Ok(data) => exec_loop(&data, &node_map, &mut ctx, &run_id, &mut run, &state, &app, &cancel, ws).await,
                Err(e) => Err(format!("Loop data: {}", e)),
            },
            "review_gate" => match serde_json::from_value::<ReviewGateData>(node.data.clone()) {
                Ok(data) => exec_review_gate(&data, &node.id, &ctx, &run_id, &mut run, &state, &app).await,
                Err(e) => Err(format!("Gate data: {}", e)),
            },
            "start" => Ok(ctx.input.clone()),
            "end" => Ok(ctx.chain.last().map(|(_, o)| o.clone()).unwrap_or_else(|| ctx.input.clone())),
            t => Err(format!("Unknown node type: {}", t)),
        };

        match result {
            Ok(output) => { final_output = output; }
            Err(e) if e == "__cancelled__" => {
                run.status = "cancelled".into();
                run.completed_at = Some(now());
                let _ = save_json(&state.runs_dir().join(format!("{}.json", &run_id)), &run);
                let _ = app.emit(&format!("conductor://run/{}/cancelled", &run_id), serde_json::json!({}));
                cleanup(&state, &run_id);
                return;
            }
            Err(e) => {
                run.status = "failed".into();
                run.completed_at = Some(now());
                let _ = save_json(&state.runs_dir().join(format!("{}.json", &run_id)), &run);
                let _ = app.emit(
                    &format!("conductor://run/{}/step_error", &run_id),
                    serde_json::json!({ "nodeId": node_id, "error": e }),
                );
                cleanup(&state, &run_id);
                return;
            }
        }
    }

    run.status = "completed".into();
    run.completed_at = Some(now());
    run.final_output = Some(final_output.clone());
    let _ = save_json(&state.runs_dir().join(format!("{}.json", &run_id)), &run);
    let _ = app.emit(
        &format!("conductor://run/{}/completed", &run_id),
        serde_json::json!({ "finalOutput": final_output }),
    );
    cleanup(&state, &run_id);
}

fn cleanup(state: &AppState, run_id: &str) {
    state.active_runs.lock().unwrap().remove(run_id);
}

// ─────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────

#[tauri::command]
fn get_workflows(state: State<'_, Arc<AppState>>) -> Vec<Workflow> {
    let dir = state.workflows_dir();
    if !dir.exists() { return vec![]; }
    std::fs::read_dir(&dir).ok().into_iter().flatten()
        .filter_map(|e| {
            let path = e.ok()?.path();
            if path.extension()?.to_str()? == "json" { load_json::<Workflow>(&path).ok() } else { None }
        })
        .collect()
}

#[tauri::command]
fn save_workflow(workflow: Workflow, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    save_json(&state.workflows_dir().join(format!("{}.json", workflow.id)), &workflow)
}

#[tauri::command]
fn delete_workflow(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let path = state.workflows_dir().join(format!("{}.json", id));
    if path.exists() { std::fs::remove_file(&path).map_err(|e| format!("Delete: {}", e)) } else { Ok(()) }
}

#[tauri::command]
async fn start_run(
    workflow_id: String,
    input: String,
    workspace_path: Option<String>,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let wf_path = state.workflows_dir().join(format!("{}.json", workflow_id));
    let workflow: Workflow = load_json(&wf_path)?;

    // Resolve workspace: explicit arg overrides the workflow's saved setting.
    let resolved_ws = workspace_path
        .or_else(|| workflow.settings.workspace_path.clone())
        .filter(|p| !p.is_empty());

    if resolved_ws.is_none() {
        return Err("WORKSPACE_REQUIRED".to_string());
    }
    let ws_path = resolved_ws.unwrap();

    // Ensure the workspace directory exists (create if the user typed a new path)
    std::fs::create_dir_all(&ws_path)
        .map_err(|e| format!("Cannot create workspace directory '{}': {}", ws_path, e))?;

    let run_id = Uuid::new_v4().to_string();
    let workspace_config = Some(WorkspaceConfig {
        mode: "workspace".into(),
        workspace_path: ws_path,
        project_name: None,
    });

    let run = Run {
        id: run_id.clone(),
        workflow_id,
        started_at: now(),
        completed_at: None,
        status: "running".into(),
        input: input.clone(),
        steps: vec![],
        final_output: None,
        workspace_config: workspace_config.clone(),
    };

    std::fs::create_dir_all(state.runs_dir()).map_err(|e| format!("Mkdir runs: {}", e))?;
    save_json(&state.runs_dir().join(format!("{}.json", run_id)), &run)?;

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut runs = state.active_runs.lock().unwrap();
        runs.insert(run_id.clone(), RunHandle {
            cancel_flag: cancel_flag.clone(),
            gate_senders: Mutex::new(HashMap::new()),
            tool_confirm_senders: Mutex::new(HashMap::new()),
        });
    }

    let state_arc = Arc::clone(&*state);
    let run_id_clone = run_id.clone();
    tokio::spawn(async move {
        execute_workflow(workflow, input, run_id_clone, state_arc, app, workspace_config).await;
    });

    Ok(run_id)
}

#[tauri::command]
fn cancel_run(run_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let runs = state.active_runs.lock().unwrap();
    if let Some(handle) = runs.get(&run_id) {
        handle.cancel_flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
fn get_run(run_id: String, state: State<'_, Arc<AppState>>) -> Option<Run> {
    load_json(&state.runs_dir().join(format!("{}.json", run_id))).ok()
}

#[tauri::command]
fn get_runs_for_workflow(workflow_id: String, state: State<'_, Arc<AppState>>) -> Vec<Run> {
    let dir = state.runs_dir();
    if !dir.exists() { return vec![]; }
    let mut runs: Vec<Run> = std::fs::read_dir(&dir).ok().into_iter().flatten()
        .filter_map(|e| {
            let path = e.ok()?.path();
            if path.extension()?.to_str()? == "json" {
                let r: Run = load_json(&path).ok()?;
                if r.workflow_id == workflow_id { Some(r) } else { None }
            } else { None }
        })
        .collect();
    runs.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    runs
}

#[tauri::command]
fn resume_gate(
    run_id: String,
    node_id: String,
    action: String,
    content: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let runs = state.active_runs.lock().unwrap();
    let handle = runs.get(&run_id).ok_or_else(|| format!("No active run: {}", run_id))?;
    let mut senders = handle.gate_senders.lock().unwrap();
    let tx = senders.remove(&node_id).ok_or_else(|| format!("No gate at node: {}", node_id))?;
    let response = match action.as_str() {
        "approve" => GateResponse::Approve,
        "reject" => GateResponse::Reject { feedback: content.unwrap_or_default() },
        "edit" => GateResponse::Edit { content: content.unwrap_or_default() },
        _ => return Err(format!("Unknown gate action: {}", action)),
    };
    tx.send(response).map_err(|_| "Send gate response failed".to_string())
}

#[tauri::command]
fn respond_tool_confirmation(
    run_id: String,
    tool_call_id: String,
    approved: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let runs = state.active_runs.lock().unwrap();
    let handle = runs.get(&run_id).ok_or_else(|| format!("No active run: {}", run_id))?;
    let mut senders = handle.tool_confirm_senders.lock().unwrap();
    let tx = senders.remove(&tool_call_id)
        .ok_or_else(|| format!("No pending confirmation for: {}", tool_call_id))?;
    tx.send(approved).map_err(|_| "Send confirmation failed".to_string())
}

#[tauri::command]
fn save_api_key(provider: String, key: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let path = state.keys_file();
    let mut keys = load_keys(&path);
    keys.insert(provider, key);
    save_keys(&path, &keys)
}

#[tauri::command]
fn delete_api_key(provider: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let path = state.keys_file();
    let mut keys = load_keys(&path);
    keys.remove(&provider);
    save_keys(&path, &keys)
}

#[tauri::command]
fn has_api_key(provider: String, state: State<'_, Arc<AppState>>) -> bool {
    load_keys(&state.keys_file()).contains_key(&provider)
}

#[tauri::command]
fn get_templates(state: State<'_, Arc<AppState>>) -> Vec<Template> {
    let mut all = built_in_templates();
    let dir = state.templates_dir();
    if dir.exists() {
        let user: Vec<Template> = std::fs::read_dir(&dir).ok().into_iter().flatten()
            .filter_map(|e| {
                let path = e.ok()?.path();
                if path.extension()?.to_str()? == "json" { load_json(&path).ok() } else { None }
            })
            .collect();
        all.extend(user);
    }
    all
}

#[tauri::command]
fn save_template(template: Template, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    save_json(&state.templates_dir().join(format!("{}.json", template.id)), &template)
}

#[tauri::command]
fn delete_template(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if built_in_templates().iter().any(|t| t.id == id) {
        return Err("Cannot delete built-in templates".into());
    }
    let path = state.templates_dir().join(format!("{}.json", id));
    if path.exists() { std::fs::remove_file(&path).map_err(|e| format!("Delete: {}", e)) } else { Ok(()) }
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Read '{}': {}", path, e))
}

#[tauri::command]
async fn get_ollama_models(base_url: Option<String>) -> Vec<String> {
    let base = base_url.as_deref().unwrap_or("http://localhost:11434");
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(3)).build() {
        Ok(c) => c, Err(_) => return vec![],
    };
    let Ok(resp) = client.get(&format!("{}/api/tags", base.trim_end_matches('/'))).send().await else { return vec![]; };
    let Ok(data) = resp.json::<serde_json::Value>().await else { return vec![]; };
    data["models"].as_array()
        .map(|arr| arr.iter().filter_map(|m| m["name"].as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaModelInfo {
    parameter_size: Option<String>,   // e.g. "7.2B", "13.0B"
    parameter_billions: Option<f64>,  // e.g. 7.2, 13.0
    family: Option<String>,
    quantization: Option<String>,
}

#[tauri::command]
async fn get_ollama_model_info(model_id: String, base_url: Option<String>) -> OllamaModelInfo {
    let base = base_url.as_deref().unwrap_or("http://localhost:11434");
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(_) => return OllamaModelInfo { parameter_size: None, parameter_billions: None, family: None, quantization: None },
    };
    let Ok(resp) = client
        .post(&format!("{}/api/show", base.trim_end_matches('/')))
        .json(&serde_json::json!({ "name": model_id }))
        .send().await
    else {
        return OllamaModelInfo { parameter_size: None, parameter_billions: None, family: None, quantization: None };
    };
    let Ok(data) = resp.json::<serde_json::Value>().await else {
        return OllamaModelInfo { parameter_size: None, parameter_billions: None, family: None, quantization: None };
    };
    let details = &data["details"];
    let parameter_size = details["parameter_size"].as_str().map(str::to_string);
    let parameter_billions = parameter_size.as_deref().and_then(|s| {
        let s = s.trim_end_matches('B').trim_end_matches('b');
        s.parse::<f64>().ok()
    });
    OllamaModelInfo {
        parameter_size,
        parameter_billions,
        family: details["family"].as_str().map(str::to_string),
        quantization: details["quantization_level"].as_str().map(str::to_string),
    }
}

// ─────────────────────────────────────────────
// Built-in templates
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Built-in templates
// ─────────────────────────────────────────────

fn built_in_templates() -> Vec<Template> {
    // All templates end with a COMPLETED SUMMARY block so the Manager Agent
    // can parse results and decide next steps without reading full file contents.
    let summary_footer = "\n\n## COMPLETED SUMMARY (MANDATORY — always end with this)\nStatus: [Done / Partial / Blocked]\nWhat was accomplished: [1-2 sentences]\nFiles created or modified: [paths or \"none\"]\nNext recommended action: [what should happen next]";

    vec![
        // ── SOFTWARE ──
        Template {
            id: "software-planner".into(), name: "Software Planner".into(),
            category: "Software".into(),
            description: "Plans architecture, requirements, and technical design for any software task".into(),
            system_prompt: format!("## Role\nYou are a senior software architect with 15 years of experience designing scalable systems.\n\n## Objective\nProduce a comprehensive Software Design Document (SDD) for the given task. Read any existing code first.\n\n## Workflow\n1. Use `list_directory` and `read_file` to understand the existing codebase.\n2. Identify what needs to be built or changed.\n3. Write the SDD covering: architecture, data models, API contracts, implementation steps, risks.\n4. Use `write_file` to save as `SDD.md`.\n5. Output a concise text summary of the key design decisions.\n\n## Output Rules\n- Save the full document to disk. Your text response should be a summary.\n- Be specific: real function names, real file paths, real data shapes.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "architecture-reviewer".into(), name: "Architecture Reviewer".into(),
            category: "Software".into(),
            description: "Reviews architecture plans and design documents for flaws and gaps".into(),
            system_prompt: format!("## Role\nYou are a principal engineer who reviews design documents before implementation begins.\n\n## Objective\nReview the Software Design Document (SDD) in the workspace and provide a verdict.\n\n## Workflow\n1. Use `read_file` to read the SDD or design document.\n2. Evaluate: technical soundness, missing edge cases, scalability, security risks, over-engineering.\n3. Provide specific, numbered feedback.\n\n## Output Format\nEnd your response with exactly one of:\n- APPROVED — if the design is solid and implementation can begin.\n- NEEDS REVISION — followed by a numbered list of required changes.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "full-stack-developer".into(), name: "Full-Stack Developer".into(),
            category: "Software".into(),
            description: "Implements features and fixes bugs with production-quality code".into(),
            system_prompt: format!("## Role\nYou are a senior full-stack developer. You write clean, tested, production-ready code.\n\n## Workflow\n1. Use `list_directory` and `read_file` to understand the codebase structure.\n2. Implement the requested changes using `write_file` or `edit_file`.\n3. Write complete, runnable code — never pseudocode or placeholders.\n4. After implementing, summarize what you changed and why.\n\n## Rules\n- Always read existing code before writing new code.\n- Match the existing code style, naming conventions, and patterns.\n- If you're unsure about a requirement, implement the most reasonable interpretation and note your assumption.\n- Use `write_file` for new files, `edit_file` for targeted changes to existing files.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "unit-test-writer".into(), name: "Tester / QA Engineer".into(),
            category: "Software".into(),
            description: "Reviews implementations and writes tests to validate correctness".into(),
            system_prompt: format!("## Role\nYou are a QA engineer who ensures code quality through testing and review.\n\n## Workflow\n1. Use `read_file` to read the implementation files.\n2. Review for: logic errors, uncovered edge cases, missing error handling, security issues.\n3. If the task asks for tests: write test files using `write_file`.\n4. Provide your verdict.\n\n## Output Format\nEnd with exactly:\n- APPROVED — code is correct, no significant issues.\n- NEEDS REVISION — followed by a numbered list of specific issues with file paths and line references where possible.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "code-reviewer".into(), name: "Code Reviewer".into(),
            category: "Software".into(),
            description: "Reviews pull requests and code changes for quality and correctness".into(),
            system_prompt: format!("## Role\nYou are a meticulous code reviewer focused on code quality, security, and maintainability.\n\n## Workflow\n1. Use `list_directory` to find changed or relevant files.\n2. Use `read_file` to read the code.\n3. Review for: correctness, security vulnerabilities, performance issues, code smells, unclear naming, missing docs.\n4. Provide concrete, actionable feedback with specific line references.\n\n## Output Format\nEnd with APPROVED or NEEDS REVISION with numbered issues.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "bug-analyzer".into(), name: "Bug Analyzer".into(),
            category: "Software".into(),
            description: "Diagnoses bugs, finds root causes, and proposes fixes".into(),
            system_prompt: format!("## Role\nYou are a debugging expert who finds root causes, not just symptoms.\n\n## Workflow\n1. Use `read_file` to read error logs, stack traces, or the described bug behavior.\n2. Use `list_directory` and `read_file` to explore the relevant code paths.\n3. Identify the root cause — not just where the error appears, but WHY it occurs.\n4. Propose a precise fix with the exact code changes needed.\n5. Optionally use `edit_file` to apply the fix directly.\n\n## Output\nExplain the root cause clearly. If you applied a fix, describe exactly what you changed.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "codebase-explorer".into(), name: "Codebase Explorer".into(),
            category: "Software".into(),
            description: "Maps an unfamiliar codebase and produces a navigation guide".into(),
            system_prompt: format!("## Role\nYou are a technical analyst who helps teams understand unfamiliar codebases quickly.\n\n## Workflow\n1. Use `list_directory` recursively to map the project structure.\n2. Use `read_file` on key files: entry points, config files, main modules.\n3. Identify: architecture pattern, tech stack, key abstractions, data flow, external dependencies.\n4. Use `write_file` to save your analysis as `Codebase_Map.md`.\n\n## Output\nA clear mental model of how the codebase is organized so a new developer can get oriented fast.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "security-auditor".into(), name: "Security Auditor".into(),
            category: "Software".into(),
            description: "Audits code for security vulnerabilities and unsafe patterns".into(),
            system_prompt: format!("## Role\nYou are an application security engineer specializing in finding exploitable vulnerabilities.\n\n## Workflow\n1. Use `list_directory` and `read_file` to scan the codebase.\n2. Look for: SQL injection, XSS, CSRF, insecure deserialization, hardcoded secrets, path traversal, improper auth.\n3. Document each finding with: severity (Critical/High/Medium/Low), file path, description, and remediation.\n4. Use `write_file` to save as `Security_Audit.md`.\n\n## Output\nA prioritized list of vulnerabilities. Be specific — include file paths, line numbers, and example exploits where helpful.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },

        // ── ORGANIZATION ──
        Template {
            id: "file-scanner".into(), name: "Directory Scout".into(),
            category: "Organization".into(),
            description: "Scans directories and categorizes files for reorganization".into(),
            system_prompt: format!("## Role\nYou are a digital organization specialist.\n\n## Workflow\n1. Use `list_directory` to scan the target folder (and subdirectories if needed).\n2. Categorize what you find by type, project, date, or purpose.\n3. Identify clutter, duplicates, and things that belong elsewhere.\n\n## Output\nA clear, bulleted inventory with grouping suggestions. Do NOT move or delete anything — just analyze and report.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "folder-architect".into(), name: "Folder Architect".into(),
            category: "Organization".into(),
            description: "Designs and implements a clean folder structure".into(),
            system_prompt: format!("## Role\nYou are a master of digital organization.\n\n## Workflow\n1. Read the task description and any file inventory provided.\n2. Design a logical folder structure.\n3. Use `create_directory` to create the folders.\n4. Use `move_file` to organize files into the new structure.\n\n## Rules\n- Create descriptive folder names.\n- Never delete files — only move them.\n- If you're unsure where something goes, create an `_Unsorted` folder.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "file-mover".into(), name: "File Organizer".into(),
            category: "Organization".into(),
            description: "Executes a file organization plan using move and create operations".into(),
            system_prompt: format!("## Role\nYou are the execution arm for file organization — precise and methodical.\n\n## Workflow\n1. Read the organization plan from the task or from a file in the workspace.\n2. Use `create_directory` to create required folders.\n3. Use `move_file` to move each file to its destination.\n4. Skip any file that doesn't exist — log it and continue.\n\n## Rules\n- Do NOT delete anything.\n- Use exact paths from the plan.\n- Report any files you couldn't move and why.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "clutter-finder".into(), name: "Clutter Finder".into(),
            category: "Organization".into(),
            description: "Finds duplicate files, old versions, and junk to clean up".into(),
            system_prompt: format!("## Role\nYou are a meticulous data archivist who finds digital waste.\n\n## Workflow\n1. Use `list_directory` to scan the target folder deeply.\n2. Identify: duplicate-looking names (e.g., `file (1).pdf`), temp files, build artifacts, empty folders, old versions.\n3. Output a structured purge list with reasoning for each item.\n\n## Rules\n- Do NOT delete anything yourself. List candidates only.\n- Be conservative — if unsure, exclude it.\n- Group findings by confidence: \"Safe to delete\" / \"Review before deleting\".{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },

        // ── WRITING ──
        Template {
            id: "ghostwriter".into(), name: "Ghostwriter".into(),
            category: "Writing".into(),
            description: "Writes polished long-form content from outlines or rough notes".into(),
            system_prompt: format!("## Role\nYou are a versatile ghostwriter who adapts to any voice and format.\n\n## Workflow\n1. Use `read_file` to read the outline, notes, or brief.\n2. Write a complete, polished draft in the requested format (article, blog post, report, email, etc.).\n3. Use `write_file` to save the draft.\n4. Summarize the tone, structure, and word count in your text response.\n\n## Rules\n- Match the requested tone exactly.\n- No filler phrases like \"In conclusion...\" or \"It is worth noting...\".\n- Never invent facts or statistics. If you need a placeholder, mark it [VERIFY].{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "editor".into(), name: "Editor".into(),
            category: "Writing".into(),
            description: "Reviews and edits drafts for clarity, flow, and impact".into(),
            system_prompt: format!("## Role\nYou are a sharp, experienced editor.\n\n## Workflow\n1. Use `read_file` to read the draft.\n2. Evaluate: clarity, structure, tone, grammar, pacing, impact.\n3. Either rewrite the draft in-place using `edit_file` / `write_file`, or provide specific line-by-line notes.\n4. Give your verdict.\n\n## Output Format\nEnd with:\n- APPROVED — draft is publication-ready.\n- NEEDS REVISION — with numbered, specific issues.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "documentation-writer".into(), name: "Documentation Writer".into(),
            category: "Writing".into(),
            description: "Writes clear technical documentation, READMEs, and API docs".into(),
            system_prompt: format!("## Role\nYou write technical documentation that developers actually want to read.\n\n## Workflow\n1. Use `list_directory` and `read_file` to understand what needs documenting.\n2. Write documentation covering: purpose, setup, usage, examples, API reference (if applicable).\n3. Use `write_file` to save the docs.\n\n## Rules\n- Lead with working examples, not abstract descriptions.\n- Use headers, code blocks, and bullet points liberally.\n- Assume the reader is competent but unfamiliar with this specific project.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "content-writer".into(), name: "Content Writer".into(),
            category: "Writing".into(),
            description: "Creates engaging marketing copy, blog posts, and web content".into(),
            system_prompt: format!("## Role\nYou are a skilled content marketer who creates content that converts.\n\n## Workflow\n1. Read the brief or any reference materials with `read_file`.\n2. Write the requested content: hook-driven opening, strong body, clear CTA.\n3. Save with `write_file`.\n\n## Rules\n- Write for humans, not search engines.\n- Every paragraph must earn its place.\n- Short sentences. Strong verbs. No corporate jargon.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },

        // ── ANALYSIS ──
        Template {
            id: "research-analyst".into(), name: "Research Analyst".into(),
            category: "Analysis".into(),
            description: "Researches topics by reading files and synthesizing findings".into(),
            system_prompt: format!("## Role\nYou are a rigorous research analyst who synthesizes information into actionable insights.\n\n## Workflow\n1. Use `list_directory` and `read_file` to read all available source materials.\n2. Use `fetch_url` if specific URLs are provided to research online sources.\n3. Synthesize findings: identify patterns, contradictions, gaps, and key insights.\n4. Use `write_file` to save your research report as `Research_Report.md`.\n\n## Rules\n- Distinguish clearly between facts and inferences.\n- Cite your sources (file paths or URLs).\n- Lead with the most important finding.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "fact-checker".into(), name: "Fact Checker".into(),
            category: "Analysis".into(),
            description: "Verifies claims, finds inconsistencies, and flags unsubstantiated statements".into(),
            system_prompt: format!("## Role\nYou are a rigorous fact-checker.\n\n## Workflow\n1. Use `read_file` to read the document to check.\n2. For each claim: assess if it is verifiable, internally consistent, and well-supported.\n3. Use `fetch_url` to verify specific facts if URLs are provided.\n4. Output a structured fact-check report.\n\n## Output Format\nFor each flagged item:\n- Claim: [exact quote]\n- Status: [Verified / Unverified / False / Needs Clarification]\n- Notes: [explanation]{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "executive-summarizer".into(), name: "Executive Summarizer".into(),
            category: "Analysis".into(),
            description: "Condenses long documents into crisp executive summaries".into(),
            system_prompt: format!("## Role\nYou write executive summaries that busy decision-makers can act on in under 2 minutes.\n\n## Workflow\n1. Use `read_file` to read the source document(s).\n2. Extract: the core problem, proposed solution, key findings, risks, and recommended action.\n3. Write a summary of 150-300 words maximum.\n4. Use `write_file` to save as `Executive_Summary.md`.\n\n## Rules\n- No filler. Every sentence carries weight.\n- Lead with the recommendation, not the background.\n- Use bullet points for key findings.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "web-researcher".into(), name: "Web Researcher".into(),
            category: "Analysis".into(),
            description: "Fetches and synthesizes information from web URLs".into(),
            system_prompt: format!("## Role\nYou are a web researcher who extracts signal from online sources.\n\n## Workflow\n1. Use `fetch_url` to retrieve content from the provided URLs.\n2. Read and synthesize the information.\n3. Extract key facts, quotes, and data points relevant to the task.\n4. Use `write_file` to save your findings as `Web_Research.md`.\n\n## Rules\n- Attribute every claim to its source URL.\n- Note any paywalls or access issues.\n- Focus on what's relevant to the task, not everything you found.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },

        // ── PRODUCTIVITY ──
        Template {
            id: "inbox-sorter".into(), name: "Inbox Sorter".into(),
            category: "Productivity".into(),
            description: "Processes messy notes and emails into actionable task lists".into(),
            system_prompt: format!("## Role\nYou are an elite executive assistant with a talent for making sense of chaos.\n\n## Workflow\n1. Use `list_directory` and `read_file` to process all inbox files.\n2. Extract: tasks (with owners and deadlines), decisions needed, information items, financial amounts.\n3. Output a structured summary categorized by priority and type.\n\n## Rules\n- Capture everything, miss nothing.\n- Flag any ambiguous items as [CLARIFY NEEDED].\n- Use dates where mentioned; otherwise use \"ASAP\" or \"When possible\".{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "task-processor".into(), name: "Task Processor".into(),
            category: "Productivity".into(),
            description: "Converts task lists into structured action plans and CSV exports".into(),
            system_prompt: format!("## Role\nYou are a highly efficient operations manager who turns lists into plans.\n\n## Workflow\n1. Read the task list from the context or from files using `read_file`.\n2. Structure tasks into a priority-ordered action plan.\n3. Use `write_file` to save `Action_Plan.md` with checkboxes.\n4. If financial data is present, also save `Expenses.csv`.\n\n## Rules\n- Each task: Who does it, what exactly, by when.\n- Group related tasks together.\n- Surface blockers clearly.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "itinerary-architect".into(), name: "Itinerary Architect".into(),
            category: "Productivity".into(),
            description: "Turns notes and requirements into structured schedules and timelines".into(),
            system_prompt: format!("## Role\nYou are a master planner who brings order to chaos.\n\n## Workflow\n1. Use `read_file` to read the notes, requirements, or constraints.\n2. Organize into a chronological schedule or timeline.\n3. Use `write_file` to save as `Schedule.md` or `Timeline.md`.\n\n## Rules\n- Be specific with times and dates.\n- Flag conflicts or tight transitions.\n- Add buffer time where estimates are uncertain, noted with \"(estimate)\".{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "resume-tailorer".into(), name: "Resume Tailorer".into(),
            category: "Productivity".into(),
            description: "Tailors resumes and writes cover letters for specific job postings".into(),
            system_prompt: format!("## Role\nYou are an elite career coach and former executive recruiter.\n\n## Workflow\n1. Use `read_file` to read the base resume and the job description.\n2. Rewrite the resume to highlight the most relevant experience for this specific role.\n3. Write a compelling cover letter that tells a story, not just repeats the resume.\n4. Use `write_file` to save `Tailored_Resume.md` and `Cover_Letter.md`.\n\n## Rules\n- Use keywords from the job description naturally.\n- Never invent experience. Only reframe and emphasize what's real.\n- The cover letter should open with a hook, not \"I am writing to apply for...\".{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },

        // ── EDUCATION ──
        Template {
            id: "knowledge-extractor".into(), name: "Knowledge Librarian".into(),
            category: "Education".into(),
            description: "Reads study materials and extracts key concepts and themes".into(),
            system_prompt: format!("## Role\nYou are a master researcher and educator.\n\n## Workflow\n1. Use `list_directory` to find study materials in the workspace.\n2. Use `read_file` to read notes, textbooks, and documents.\n3. Extract: core concepts, definitions, relationships between ideas, common misconceptions.\n4. Output a structured summary organized by topic.\n\n## Rules\n- Prioritize depth over breadth.\n- Note which concepts appear most frequently across materials — those are the most important.\n- Flag anything that seems contradicted by other sources.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "study-guide-creator".into(), name: "Study Guide Architect".into(),
            category: "Education".into(),
            description: "Creates comprehensive study guides from extracted knowledge".into(),
            system_prompt: format!("## Role\nYou are an expert tutor who creates study materials that actually work.\n\n## Workflow\n1. Read the knowledge summary or source materials using `read_file`.\n2. Organize into a study guide: overview, key concepts (with definitions), common misconceptions, worked examples, memory aids.\n3. Use `write_file` to save as `Study_Guide.md`.\n\n## Rules\n- Use headers and bullet points for scannability.\n- Include \"Quick Check\" questions throughout to test understanding.\n- Bold the most important terms.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "quiz-generator".into(), name: "Quizmaster".into(),
            category: "Education".into(),
            description: "Generates practice tests and answer keys from study guides".into(),
            system_prompt: format!("## Role\nYou are a tough but fair professor who writes excellent exam questions.\n\n## Workflow\n1. Use `read_file` to read the study guide or source material.\n2. Create 10-20 questions spanning different difficulty levels.\n3. Use `write_file` to save `Practice_Test.md` (questions only) and `Answer_Key.md` (questions + full explanations).\n\n## Rules\n- Test comprehension and application, not just memorization.\n- Include a mix of: multiple choice, short answer, and scenario-based questions.\n- Each answer key entry should explain WHY the answer is correct.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "concept-translator".into(), name: "Concept Translator".into(),
            category: "Education".into(),
            description: "Explains complex topics in simple, accessible language with analogies".into(),
            system_prompt: format!("## Role\nYou are an expert who uses the Feynman Technique — if you can't explain it simply, you don't understand it.\n\n## Workflow\n1. Use `read_file` to read the complex material.\n2. Translate every concept into plain language a curious 16-year-old could follow.\n3. Use real-world analogies, not more jargon.\n4. Use `write_file` to save as `Simplified_Guide.md`.\n\n## Rules\n- Never explain jargon with more jargon.\n- Every analogy must be accurate, not just memorable.\n- Include a \"Common Misconceptions\" section.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },

        // ── CREATIVE ──
        Template {
            id: "content-miner".into(), name: "Content Miner".into(),
            category: "Creative".into(),
            description: "Extracts the best hooks, angles, and ideas from raw content".into(),
            system_prompt: format!("## Role\nYou are a creative director who finds the gold in rough material.\n\n## Workflow\n1. Use `list_directory` and `read_file` to find and read the raw content.\n2. Identify: the 3 strongest hooks, the most shareable moments, the angles that will resonate on social.\n3. Output a structured analysis with direct quotes from the source and the angle you'd pitch each for.\n\n## Rules\n- Be specific — quote the exact sentences that have the most impact.\n- Think platform: what lands on Twitter is different from LinkedIn.\n- Rank your hooks from strongest to weakest.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "social-repurposer".into(), name: "Social Repurposer".into(),
            category: "Creative".into(),
            description: "Repurposes content into platform-native social media posts".into(),
            system_prompt: format!("## Role\nYou are a social media expert who makes content feel native to each platform.\n\n## Workflow\n1. Read the source content or hooks from the context.\n2. Write:\n   - Twitter/X Thread (5-8 tweets, hook → content → CTA)\n   - LinkedIn post (professional, insight-driven, 150-300 words)\n   - Instagram caption (visual-first, punchy, with hashtag suggestions)\n3. Use `write_file` to save all three.\n\n## Rules\n- Twitter: short sentences, line breaks, no corporate speak.\n- LinkedIn: insights over promotion, end with a question.\n- Instagram: emotive, visual language, 3-5 relevant hashtags.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
        Template {
            id: "social-formatter".into(), name: "Asset Packager".into(),
            category: "Creative".into(),
            description: "Packages and saves finalized content to organized folders".into(),
            system_prompt: format!("## Role\nYou are a production coordinator who gets content ready for publishing.\n\n## Workflow\n1. Read the finalized content from the context or from workspace files.\n2. Use `create_directory` to create `Social_Assets/` folder if it doesn't exist.\n3. Use `write_file` to save each piece as a separate file with a clear filename.\n4. Create a `Publishing_Checklist.md` listing each file and its intended platform.\n\n## Rules\n- Filenames must be clear: `twitter_thread.txt`, `linkedin_post.txt`, `instagram_caption.txt`.\n- Never truncate or abbreviate content when saving.{}", summary_footer),
            suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true,
        },
    ]
}

// ─────────────────────────────────────────────
// API key validation
// ─────────────────────────────────────────────

#[tauri::command]
async fn validate_custom_host(host_id: String, base_url: String, state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let keys = load_keys(&state.keys_file());
    let key_name = format!("custom_{}", host_id);
    let api_key = keys.get(&key_name).cloned()
        .ok_or_else(|| "No API key configured for this host".to_string())?;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build()
        .map_err(|e| format!("HTTP client: {}", e))?;
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let resp = client.get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    if resp.status().is_success() {
        Ok("Connected successfully".into())
    } else {
        Err(format!("Connection test failed (HTTP {})", resp.status()))
    }
}

#[tauri::command]
async fn validate_api_key(provider: String, state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let keys = load_keys(&state.keys_file());
    let api_key = match provider.as_str() {
        "anthropic" => keys.get("anthropic").cloned().or_else(|| std::env::var("ANTHROPIC_API_KEY").ok()),
        "openai" => keys.get("openai").cloned().or_else(|| std::env::var("OPENAI_API_KEY").ok()),
        _ => return Err(format!("Unknown provider: {}", provider)),
    }.ok_or_else(|| "No API key configured.".to_string())?;

    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    match provider.as_str() {
        "anthropic" => {
            let body = serde_json::json!({ "model": "claude-haiku-4-5-20251001", "max_tokens": 1, "messages": [{"role": "user", "content": "hi"}] });
            let resp = client.post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &api_key).header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json").json(&body).send().await
                .map_err(|e| format!("Request failed: {}", e))?;
            let status = resp.status();
            if status.is_success() || status.as_u16() == 529 { Ok("Key is valid".into()) }
            else {
                let raw = resp.text().await.unwrap_or_default();
                if let Ok(err) = serde_json::from_str::<AnthropicError>(&raw) {
                    Err(format!("{}: {}", err.error.error_type, err.error.message))
                } else { Err(format!("Invalid key (HTTP {})", status)) }
            }
        }
        "openai" => {
            let body = serde_json::json!({ "model": "gpt-4o-mini", "max_tokens": 1, "messages": [{"role": "user", "content": "hi"}] });
            let resp = client.post("https://api.openai.com/v1/chat/completions")
                .header("Authorization", format!("Bearer {}", api_key))
                .header("content-type", "application/json").json(&body).send().await
                .map_err(|e| format!("Request failed: {}", e))?;
            if resp.status().is_success() { Ok("Key is valid".into()) }
            else { Err(format!("Invalid key (HTTP {})", resp.status())) }
        }
        _ => Err("Unknown provider".into()),
    }
}

#[tauri::command]
fn import_workflow(json: String, state: State<'_, Arc<AppState>>) -> Result<Workflow, String> {
    let mut wf: Workflow = serde_json::from_str(&json).map_err(|e| format!("Invalid workflow JSON: {}", e))?;
    wf.id = Uuid::new_v4().to_string();
    wf.name = format!("{} (imported)", wf.name);
    wf.created_at = now();
    wf.updated_at = now();
    save_json(&state.workflows_dir().join(format!("{}.json", wf.id)), &wf)?;
    Ok(wf)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
    }
    std::fs::write(&path, content).map_err(|e| format!("write: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CustomHostConfigData {
    id: String,
    name: String,
    base_url: String,
    models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    default_projects_path: Option<String>,
    #[serde(default)]
    custom_hosts: Vec<CustomHostConfigData>,
}

#[tauri::command]
fn load_config(state: State<'_, Arc<AppState>>) -> Result<AppConfig, String> {
    let path = state.data_dir.join("config.json");
    if !path.exists() { return Ok(AppConfig::default()); }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(config: AppConfig, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let path = state.data_dir.join("config.json");
    let raw = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────
// The Chamber — multi-agent arena
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChamberAgentConfig {
    id: String,
    name: String,
    system_prompt: String,
    model: ModelConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChamberRunConfig {
    mode: String,               // "audition" | "war_room" | "syndicate"
    context: String,
    rubric: String,
    roster: Vec<ChamberAgentConfig>,
    rounds: Option<u32>,        // for war_room (default 3)
    review_gate_enabled: bool,
}

// ── Helpers for emitting chamber events ──────

fn emit_chamber_phase(app: &AppHandle, run_id: &str, label: &str, description: &str) {
    let _ = app.emit(
        &format!("conductor://chamber/{}/phase", run_id),
        serde_json::json!({ "label": label, "description": description }),
    );
}

fn emit_chamber_agent_status(app: &AppHandle, run_id: &str, agent_id: &str, agent_name: &str, status: &str) {
    let _ = app.emit(
        &format!("conductor://chamber/{}/agent_status", run_id),
        serde_json::json!({ "agentId": agent_id, "agentName": agent_name, "status": status }),
    );
}

fn emit_chamber_agent_done(app: &AppHandle, run_id: &str, agent_id: &str, output: &str) {
    let _ = app.emit(
        &format!("conductor://chamber/{}/agent_done", run_id),
        serde_json::json!({ "agentId": agent_id, "output": output }),
    );
}

// ── Chamber-scoped LLM call (streams agent_chunk events) ──

async fn chamber_llm_call(
    agent: &ChamberAgentConfig,
    messages: &[ApiMessage],
    keys_file: &std::path::PathBuf,
    app: &AppHandle,
    run_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<String, String> {
    chamber_provider_stream(&agent.model, &agent.system_prompt, messages, keys_file, app, run_id, &agent.id, cancel).await
}

async fn chamber_provider_stream(
    model: &ModelConfig,
    system: &str,
    messages: &[ApiMessage],
    keys_file: &std::path::PathBuf,
    app: &AppHandle,
    run_id: &str,
    agent_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<String, String> {
    let api_key: Option<String> = if model.provider == "anthropic" || model.provider == "openai" || model.provider == "custom" {
        let key_name = model.api_key_ref.clone().unwrap_or_else(|| model.provider.clone());
        load_keys(keys_file).remove(&key_name)
    } else {
        None
    };

    let url = match model.provider.as_str() {
        "anthropic" => "https://api.anthropic.com/v1/messages".to_string(),
        "openai"    => "https://api.openai.com/v1/chat/completions".to_string(),
        "ollama"    => {
            let base = model.base_url.clone().unwrap_or_else(|| "http://localhost:11434".to_string());
            format!("{}/v1/chat/completions", base.trim_end_matches('/'))
        }
        "custom"    => model.base_url.clone().unwrap_or_default(),
        p           => return Err(format!("Unsupported provider: {}", p)),
    };

    if cancel.load(Ordering::Relaxed) {
        return Err("Cancelled".into());
    }

    // Route to provider-specific streaming
    if model.provider == "anthropic" {
        let key = api_key.ok_or("No Anthropic API key")?;
        chamber_anthropic_stream(&url, &key, &model.model_id, system, messages, model.max_tokens, model.temperature, app, run_id, agent_id, cancel).await
    } else {
        let url_with_chat = if model.provider == "ollama" {
            url
        } else {
            url
        };
        chamber_openai_compat_stream(&url_with_chat, api_key.as_deref(), &model.model_id, system, messages, model.max_tokens, model.temperature, app, run_id, agent_id, cancel).await
    }
}

async fn chamber_anthropic_stream(
    url: &str,
    api_key: &str,
    model_id: &str,
    system: &str,
    messages: &[ApiMessage],
    max_tokens: u32,
    temperature: f64,
    app: &AppHandle,
    run_id: &str,
    agent_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<String, String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model_id,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system,
        "messages": messages,
        "stream": true,
    });

    let resp = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic error {}: {}", status, text));
    }

    let mut stream = resp.bytes_stream();
    let mut full_text = String::new();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) { return Err("Cancelled".into()); }
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" { break; }
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                    if v.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                        if let Some(text) = v.pointer("/delta/text").and_then(|t| t.as_str()) {
                            full_text.push_str(text);
                            let _ = app.emit(
                                &format!("conductor://chamber/{}/agent_chunk", run_id),
                                serde_json::json!({ "agentId": agent_id, "chunk": text }),
                            );
                        }
                    }
                }
            }
        }
    }

    Ok(full_text)
}

async fn chamber_openai_compat_stream(
    url: &str,
    api_key: Option<&str>,
    model_id: &str,
    system: &str,
    messages: &[ApiMessage],
    max_tokens: u32,
    temperature: f64,
    app: &AppHandle,
    run_id: &str,
    agent_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<String, String> {
    use futures_util::StreamExt;

    let mut openai_messages = vec![
        serde_json::json!({ "role": "system", "content": system })
    ];
    for m in messages {
        openai_messages.push(serde_json::json!({ "role": m.role, "content": m.content }));
    }

    let body = serde_json::json!({
        "model": model_id,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": openai_messages,
        "stream": true,
    });

    let client = reqwest::Client::new();
    let mut req = client.post(url).header("content-type", "application/json");
    if let Some(key) = api_key {
        req = req.bearer_auth(key);
    }

    let resp = req.json(&body).send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let mut stream = resp.bytes_stream();
    let mut full_text = String::new();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) { return Err("Cancelled".into()); }
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" { break; }
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(text) = v.pointer("/choices/0/delta/content").and_then(|t| t.as_str()) {
                        full_text.push_str(text);
                        let _ = app.emit(
                            &format!("conductor://chamber/{}/agent_chunk", run_id),
                            serde_json::json!({ "agentId": agent_id, "chunk": text }),
                        );
                    }
                }
            }
        }
    }

    Ok(full_text)
}

// ── Helpers ──────────────────────────────────

/// Parses a JSON score object from an LLM response.
/// Handles markdown fences (```json ... ```), leading/trailing prose, and
/// numeric scores stored as JSON numbers or strings.
/// Returns a map of uppercase letter → score clamped to 1.0–10.0.
fn parse_score_json(response: &str) -> HashMap<char, f64> {
    // Strip markdown fences
    let cleaned = response
        .replace("```json", "")
        .replace("```", "")
        .trim()
        .to_string();

    // Find the outermost {...}
    let (start, end) = match (cleaned.find('{'), cleaned.rfind('}')) {
        (Some(s), Some(e)) if s < e => (s, e),
        _ => return HashMap::new(),
    };
    let json_str = &cleaned[start..=end];

    match serde_json::from_str::<serde_json::Value>(json_str) {
        Ok(serde_json::Value::Object(map)) => map
            .iter()
            .filter_map(|(k, v)| {
                // Key must be a single uppercase letter A-Z
                let label = k.trim().to_uppercase().chars().next()?;
                if !label.is_ascii_alphabetic() { return None; }
                let score: f64 = match v {
                    serde_json::Value::Number(n) => n.as_f64()?,
                    serde_json::Value::String(s) => {
                        // Handle "8/10", "8.5", " 9 " etc.
                        let clean: String = s.chars()
                            .take_while(|c| c.is_ascii_digit() || *c == '.')
                            .collect();
                        clean.trim().parse().ok()?
                    }
                    _ => return None,
                };
                Some((label, score.clamp(1.0, 10.0)))
            })
            .collect(),
        _ => HashMap::new(),
    }
}

// ── Mode executors ───────────────────────────

async fn exec_chamber_audition(
    run_id: &str,
    config: &ChamberRunConfig,
    state: &Arc<AppState>,
    app: &AppHandle,
    cancel: &Arc<AtomicBool>,
) -> Result<serde_json::Value, String> {
    let keys_file = state.keys_file();

    // Phase 1: Parallel generation
    emit_chamber_phase(app, run_id, "generation", "All agents generating solutions simultaneously...");
    for a in &config.roster {
        emit_chamber_agent_status(app, run_id, &a.id, &a.name, "waiting");
    }

    let handles: Vec<_> = config.roster.iter().map(|agent| {
        let app_c      = app.clone();
        let rid        = run_id.to_string();
        let kf         = keys_file.clone();
        let ag         = agent.clone();
        let ctx        = config.context.clone();
        let cancel_c   = cancel.clone();
        tokio::spawn(async move {
            emit_chamber_agent_status(&app_c, &rid, &ag.id, &ag.name, "thinking");
            let msgs = vec![ApiMessage { role: "user".to_string(), content: ctx }];
            let result = chamber_llm_call(&ag, &msgs, &kf, &app_c, &rid, &cancel_c).await;
            match &result {
                Ok(out)  => {
                    emit_chamber_agent_status(&app_c, &rid, &ag.id, &ag.name, "done");
                    emit_chamber_agent_done(&app_c, &rid, &ag.id, out);
                }
                Err(_)   => emit_chamber_agent_status(&app_c, &rid, &ag.id, &ag.name, "error"),
            }
            (ag.id.clone(), ag.name.clone(), result)
        })
    }).collect();

    let join_results = futures_util::future::join_all(handles).await;
    let mut outputs: Vec<(String, String, String)> = Vec::new(); // (id, name, output)
    for jr in join_results {
        match jr {
            Ok((id, name, Ok(out)))  => outputs.push((id, name, out)),
            Ok((_id, name, Err(e)))  => return Err(format!("Agent '{}' failed: {}", name, e)),
            Err(e)                   => return Err(format!("Task error: {}", e)),
        }
    }

    if cancel.load(Ordering::Relaxed) { return Err("Cancelled".into()); }

    // Optional review gate before scoring
    if config.review_gate_enabled {
        emit_chamber_phase(app, run_id, "review_gate", "Paused for human review");
        let gate_outputs: Vec<serde_json::Value> = outputs.iter()
            .map(|(id, name, out)| serde_json::json!({ "agentId": id, "agentName": name, "output": out }))
            .collect();
        let _ = app.emit(
            &format!("conductor://chamber/{}/gate_paused", run_id),
            serde_json::json!({ "message": "Review agent outputs before scoring begins.", "phase": "generation", "outputs": gate_outputs }),
        );
        // Wait for resume
        let (tx, rx) = oneshot::channel::<ChamberGateResult>();
        { state.chamber_gates.lock().unwrap().insert(run_id.to_string(), tx); }
        match rx.await {
            Ok(r) if r.action == "cancel" => return Err("Cancelled by user".into()),
            _ => {}
        }
    }

    // Phase 2: Scoring — each agent acts as an impartial judge scoring ALL solutions
    if outputs.len() >= 2 {
        emit_chamber_phase(app, run_id, "scoring", "Agents scoring all solutions...");

        let labels: Vec<char> = (0..outputs.len()).map(|i| (b'A' + i as u8) as char).collect();
        let label_list: String = labels.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ");

        let mut score_totals: HashMap<String, f64> = outputs.iter().map(|(id, _, _)| (id.clone(), 0.0)).collect();
        let mut score_counts: HashMap<String, u32>  = outputs.iter().map(|(id, _, _)| (id.clone(), 0)).collect();

        let rubric_text = if config.rubric.trim().is_empty() {
            "Quality, correctness, clarity, and practical usefulness.".to_string()
        } else {
            config.rubric.clone()
        };

        // Build the solutions block once — reused for every scorer
        let solutions_text: String = outputs.iter().enumerate()
            .map(|(i, (_, _, out))| format!("### Solution {}\n{}", labels[i], out))
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");

        for scorer in &config.roster {
            emit_chamber_agent_status(app, run_id, &scorer.id, &scorer.name, "critiquing");

            let scoring_prompt = format!(
                "You are an impartial judge evaluating solutions to a task.\n\n\
                 TASK:\n{}\n\n\
                 RUBRIC:\n{}\n\n\
                 SOLUTIONS:\n\n{}\n\n\
                 ---\n\
                 Score every solution above from 1 to 10 based strictly on the rubric.\n\
                 Respond with ONLY a JSON object — no explanation, no markdown, no extra text.\n\
                 Use this exact format: {{\"A\": <score>, \"B\": <score>, ...}}\n\
                 Required keys: {}\n\
                 Your JSON:",
                config.context, rubric_text, solutions_text, label_list
            );

            // Override the agent's persona with a neutral judge — prevents role-bleed into scoring
            let judge_agent = ChamberAgentConfig {
                id:            scorer.id.clone(),
                name:          scorer.name.clone(),
                system_prompt: "You are an objective, impartial judge. \
                                Output only the requested JSON object, nothing else.".to_string(),
                model:         scorer.model.clone(),
            };

            let msgs = vec![ApiMessage { role: "user".to_string(), content: scoring_prompt }];
            let score_resp = chamber_llm_call(&judge_agent, &msgs, &keys_file, app, run_id, cancel)
                .await
                .unwrap_or_default();

            emit_chamber_agent_status(app, run_id, &scorer.id, &scorer.name, "done");

            // Parse JSON scores — robust: strips markdown fences, finds {…}, uses serde_json
            for (label, score) in parse_score_json(&score_resp) {
                let idx = label as u8 - b'A';
                if let Some((agent_id, _, _)) = outputs.get(idx as usize) {
                    *score_totals.entry(agent_id.clone()).or_insert(0.0) += score;
                    *score_counts.entry(agent_id.clone()).or_insert(0)   += 1;
                }
            }
        }

        // Average scores (round to 1 decimal)
        let avg_scores: HashMap<String, f64> = score_totals.iter()
            .map(|(id, total)| {
                let count = score_counts.get(id).copied().unwrap_or(1).max(1) as f64;
                let avg   = (total / count * 10.0).round() / 10.0;
                (id.clone(), avg)
            })
            .collect();

        // Build results sorted by score descending
        let mut results: Vec<serde_json::Value> = outputs.iter().map(|(id, name, out)| {
            let score = avg_scores.get(id).copied().unwrap_or(0.0);
            serde_json::json!({ "agentId": id, "agentName": name, "output": out, "score": score })
        }).collect();
        results.sort_by(|a, b| {
            b["score"].as_f64().unwrap_or(0.0)
                .partial_cmp(&a["score"].as_f64().unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let winner_id    = results[0]["agentId"].as_str().unwrap_or("").to_string();
        let final_output = results[0]["output"].as_str().unwrap_or("").to_string();

        return Ok(serde_json::json!({
            "results": results,
            "finalOutput": final_output,
            "winnerId": winner_id,
        }));
    }

    // Single agent — no scoring needed
    let (id, name, out) = &outputs[0];
    Ok(serde_json::json!({
        "results": [{ "agentId": id, "agentName": name, "output": out }],
        "finalOutput": out,
        "winnerId": id,
    }))
}

async fn exec_chamber_war_room(
    run_id: &str,
    config: &ChamberRunConfig,
    state: &Arc<AppState>,
    app: &AppHandle,
    cancel: &Arc<AtomicBool>,
) -> Result<serde_json::Value, String> {
    if config.roster.len() < 2 {
        return Err("War Room requires at least 2 agents (Proposer + Critic).".into());
    }
    let keys_file = state.keys_file();
    let proposer = &config.roster[0];
    let critic   = &config.roster[1];
    let rounds   = config.rounds.unwrap_or(3).max(1).min(10);

    let mut proposal    = String::new();
    let mut critique    = String::new();
    let mut all_results = Vec::new();

    for round in 0..rounds {
        if cancel.load(Ordering::Relaxed) { return Err("Cancelled".into()); }

        // Proposer generates / improves
        let round_label = format!("round-{}", round + 1);
        let round_desc  = format!("Round {}/{} — {} proposing", round + 1, rounds, proposer.name);
        emit_chamber_phase(app, run_id, &round_label, &round_desc);
        emit_chamber_agent_status(app, run_id, &proposer.id, &proposer.name, "thinking");

        let proposer_content = if round == 0 {
            config.context.clone()
        } else {
            format!(
                "ORIGINAL TASK:\n{}\n\nYOUR PREVIOUS PROPOSAL:\n{}\n\nCRITIQUE:\n{}\n\n\
                 Revise your proposal to address every point in the critique.",
                config.context, proposal, critique
            )
        };
        let proposer_msgs = vec![ApiMessage { role: "user".to_string(), content: proposer_content }];
        proposal = chamber_llm_call(proposer, &proposer_msgs, &keys_file, app, run_id, cancel).await?;
        emit_chamber_agent_status(app, run_id, &proposer.id, &proposer.name, "done");
        emit_chamber_agent_done(app, run_id, &proposer.id, &proposal);

        all_results.push(serde_json::json!({
            "agentId": proposer.id,
            "agentName": proposer.name,
            "output": proposal,
        }));

        if round == rounds - 1 { break; }

        // Critic reviews
        emit_chamber_agent_status(app, run_id, &critic.id, &critic.name, "critiquing");
        let critic_content = format!(
            "TASK:\n{}\n\nPROPOSAL TO CRITIQUE:\n{}\n\n\
             Find every flaw, gap, risk, or ambiguity in this proposal. \
             Be specific and actionable. The proposer will revise based on your critique.",
            config.context, proposal
        );
        let critic_msgs = vec![ApiMessage { role: "user".to_string(), content: critic_content }];
        critique = chamber_llm_call(critic, &critic_msgs, &keys_file, app, run_id, cancel).await?;
        emit_chamber_agent_status(app, run_id, &critic.id, &critic.name, "done");
        emit_chamber_agent_done(app, run_id, &critic.id, &critique);

        all_results.push(serde_json::json!({
            "agentId": critic.id,
            "agentName": critic.name,
            "output": critique,
        }));
    }

    Ok(serde_json::json!({
        "results": all_results,
        "finalOutput": proposal,
    }))
}

async fn exec_chamber_syndicate(
    run_id: &str,
    config: &ChamberRunConfig,
    state: &Arc<AppState>,
    app: &AppHandle,
    cancel: &Arc<AtomicBool>,
) -> Result<serde_json::Value, String> {
    let keys_file   = state.keys_file();
    let mut document = String::new();
    let mut results  = Vec::new();

    emit_chamber_phase(app, run_id, "syndicate", "Agents contributing in sequence...");

    for (_i, agent) in config.roster.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) { return Err("Cancelled".into()); }

        emit_chamber_agent_status(app, run_id, &agent.id, &agent.name, "thinking");

        let content = if document.is_empty() {
            format!("TASK:\n{}", config.context)
        } else {
            format!(
                "TASK:\n{}\n\nDOCUMENT SO FAR (contributed by previous agents):\n{}\n\n\
                 Continue, extend, or refine the document based on your specialty. \
                 Produce the complete updated document.",
                config.context, document
            )
        };

        let msgs = vec![ApiMessage { role: "user".to_string(), content }];
        document = chamber_llm_call(agent, &msgs, &keys_file, app, run_id, cancel).await?;
        emit_chamber_agent_status(app, run_id, &agent.id, &agent.name, "done");
        emit_chamber_agent_done(app, run_id, &agent.id, &document);

        results.push(serde_json::json!({
            "agentId":   agent.id,
            "agentName": agent.name,
            "output":    document,
        }));
    }

    Ok(serde_json::json!({
        "results": results,
        "finalOutput": document,
    }))
}

async fn execute_chamber(
    run_id: String,
    config: ChamberRunConfig,
    state: Arc<AppState>,
    app: AppHandle,
    cancel: Arc<AtomicBool>,
) {
    let result = match config.mode.as_str() {
        "audition" => exec_chamber_audition(&run_id, &config, &state, &app, &cancel).await,
        "war_room" => exec_chamber_war_room(&run_id, &config, &state, &app, &cancel).await,
        "syndicate"=> exec_chamber_syndicate(&run_id, &config, &state, &app, &cancel).await,
        m          => Err(format!("Unknown chamber mode: {}", m)),
    };

    state.chamber_runs.lock().unwrap().remove(&run_id);

    match result {
        Ok(payload) => {
            let _ = app.emit(&format!("conductor://chamber/{}/completed", run_id), payload);
        }
        Err(e) if e == "Cancelled" || e == "Cancelled by user" => {
            let _ = app.emit(&format!("conductor://chamber/{}/cancelled", run_id), serde_json::json!({}));
        }
        Err(e) => {
            let _ = app.emit(
                &format!("conductor://chamber/{}/error", run_id),
                serde_json::json!({ "message": e }),
            );
        }
    }
}

// ── Tauri commands ───────────────────────────

#[tauri::command]
async fn start_chamber_run(
    config: ChamberRunConfig,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let run_id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));

    state.chamber_runs.lock().unwrap().insert(
        run_id.clone(),
        ChamberRunHandle { cancel: cancel.clone() },
    );

    let state_arc = Arc::clone(&*state);
    let rid       = run_id.clone();

    tokio::spawn(async move {
        execute_chamber(rid, config, state_arc, app, cancel).await;
    });

    Ok(run_id)
}

#[tauri::command]
async fn cancel_chamber_run(run_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut runs = state.chamber_runs.lock().unwrap();
    if let Some(h) = runs.remove(&run_id) {
        h.cancel.store(true, Ordering::Relaxed);
    }
    // Also unblock any waiting gate
    let mut gates = state.chamber_gates.lock().unwrap();
    if let Some(tx) = gates.remove(&run_id) {
        let _ = tx.send(ChamberGateResult { action: "cancel".to_string() });
    }
    Ok(())
}

#[tauri::command]
async fn resume_chamber_run(
    run_id: String,
    action: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut gates = state.chamber_gates.lock().unwrap();
    if let Some(tx) = gates.remove(&run_id) {
        let _ = tx.send(ChamberGateResult { action });
    }
    Ok(())
}

// ─────────────────────────────────────────────
// Studio – interactive brainstorming & document generation
// ─────────────────────────────────────────────

const STUDIO_SYSTEM_PROMPT: &str = r#"You are Studio — a brilliant strategist, creative partner, and expert planner embedded in Conductor AI. Think of yourself as the smartest person in the room who genuinely wants to help the user build something great.

Your goal: Through real conversation, help the user transform a raw idea into a comprehensive, bulletproof plan.

## How to Behave — This Is a Collaboration, Not an Interview

You are NOT just a question-asking machine. You are a thinking partner. The conversation should feel like two sharp people hashing out an idea together.

**When the user gives you information:** Engage with it. React to what's interesting or tricky about it. Share a relevant observation, surface a non-obvious implication, or point out a risk they may not have considered — THEN ask 1-2 focused questions to go deeper.

**When the user asks YOU a question or asks for your opinion:** ANSWER IT. Give your actual expert take. Share your recommendation, explain your reasoning, offer options with trade-offs. Do not dodge the question by redirecting back to them. If they ask "what do you think?" or "what would you recommend?" — tell them. You have opinions and they are valuable.

**When the user seems uncertain:** Step in. Offer your best-guess recommendation for that specific decision, briefly explain why, and move the conversation forward. Say things like "Based on what you've told me, I'd go with X because Y — does that feel right?" You are allowed to have a point of view.

**Pacing:** Ask 1-2 questions per turn. Never more. Give the user room to think and respond. If a single good question is better than two, ask one.

**Tone:** Warm, direct, and analytically sharp. Excited about the idea. Like a brilliant friend who also happens to be an expert.

## When to Generate the Final Document

Generate the final plan when ANY of these are true:
- You have enough context across 4-8 exchanges to write a truly comprehensive, specific plan.
- The user signals they are ready (short confirmations, "that's everything", "sounds good").
- You receive an explicit system command to generate it.
- You've covered scope, goals, constraints, timeline, and key decisions — and further questions won't add meaningful value.

## How to Generate the Final Document (when YOU decide it is time)

- Start your response with exactly this marker on its own line: [STUDIO_FINAL_DOCUMENT]
- Immediately write the full document. No preamble, no announcement — just the document.

## Final Document Requirements

The document MUST be:
- Written in clean, structured Markdown with clear headings and sections
- Comprehensive — cover every angle the conversation surfaced
- Immediately actionable — specific enough that someone could hand it to a team and start work today
- Well-organized with headers, bullet points, and tables where useful
- Specific — real names, real numbers, real steps. No vague platitudes.

This document is the deliverable. Make it exceptional."#;

#[tauri::command]
async fn studio_chat_turn(
    session_id: String,
    messages: Vec<ApiMessage>,
    model: ModelConfig,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let keys_file = state.data_dir.join("keys.json");
    let cancel = Arc::new(AtomicBool::new(false));
    studio_provider_stream(&model, &messages, &keys_file, &app, &session_id, &cancel).await
}

async fn studio_provider_stream(
    model: &ModelConfig,
    messages: &[ApiMessage],
    keys_file: &PathBuf,
    app: &AppHandle,
    session_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<String, String> {
    let api_key: Option<String> =
        if model.provider == "anthropic" || model.provider == "openai" || model.provider == "custom" {
            let key_name = model.api_key_ref.clone().unwrap_or_else(|| model.provider.clone());
            load_keys(keys_file).remove(&key_name)
        } else {
            None
        };

    if cancel.load(Ordering::Relaxed) {
        return Err("Cancelled".into());
    }

    if model.provider == "anthropic" {
        let key = api_key.ok_or("No Anthropic API key")?;
        studio_anthropic_stream(
            "https://api.anthropic.com/v1/messages",
            &key,
            &model.model_id,
            STUDIO_SYSTEM_PROMPT,
            messages,
            model.max_tokens,
            model.temperature,
            app,
            session_id,
            cancel,
        )
        .await
    } else {
        let url = match model.provider.as_str() {
            "openai" => "https://api.openai.com/v1/chat/completions".to_string(),
            "ollama" => {
                let base = model
                    .base_url
                    .clone()
                    .unwrap_or_else(|| "http://localhost:11434".to_string());
                format!("{}/v1/chat/completions", base.trim_end_matches('/'))
            }
            "custom" => model.base_url.clone().unwrap_or_default(),
            p => return Err(format!("Unsupported provider: {}", p)),
        };
        studio_openai_compat_stream(
            &url,
            api_key.as_deref(),
            &model.model_id,
            STUDIO_SYSTEM_PROMPT,
            messages,
            model.max_tokens,
            model.temperature,
            app,
            session_id,
            cancel,
        )
        .await
    }
}

async fn studio_anthropic_stream(
    url: &str,
    api_key: &str,
    model_id: &str,
    system: &str,
    messages: &[ApiMessage],
    max_tokens: u32,
    temperature: f64,
    app: &AppHandle,
    session_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<String, String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model_id,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system,
        "messages": messages,
        "stream": true,
    });

    let resp = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic error {}: {}", status, text));
    }

    let mut stream = resp.bytes_stream();
    let mut full_text = String::new();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Err("Cancelled".into());
        }
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    break;
                }
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                    if v.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                        if let Some(text) = v.pointer("/delta/text").and_then(|t| t.as_str()) {
                            full_text.push_str(text);
                            let _ = app.emit(
                                &format!("conductor://studio/{}/chunk", session_id),
                                serde_json::json!({ "chunk": text }),
                            );
                        }
                    }
                }
            }
        }
    }

    Ok(full_text)
}

async fn studio_openai_compat_stream(
    url: &str,
    api_key: Option<&str>,
    model_id: &str,
    system: &str,
    messages: &[ApiMessage],
    max_tokens: u32,
    temperature: f64,
    app: &AppHandle,
    session_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<String, String> {
    use futures_util::StreamExt;

    let mut openai_messages = vec![serde_json::json!({ "role": "system", "content": system })];
    for m in messages {
        openai_messages.push(serde_json::json!({ "role": m.role, "content": m.content }));
    }

    let body = serde_json::json!({
        "model": model_id,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": openai_messages,
        "stream": true,
    });

    let client = reqwest::Client::new();
    let mut req = client.post(url).header("content-type", "application/json");
    if let Some(key) = api_key {
        req = req.bearer_auth(key);
    }

    let resp = req.json(&body).send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let mut stream = resp.bytes_stream();
    let mut full_text = String::new();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Err("Cancelled".into());
        }
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    break;
                }
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(text) = v
                        .pointer("/choices/0/delta/content")
                        .and_then(|t| t.as_str())
                    {
                        full_text.push_str(text);
                        let _ = app.emit(
                            &format!("conductor://studio/{}/chunk", session_id),
                            serde_json::json!({ "chunk": text }),
                        );
                    }
                }
            }
        }
    }

    Ok(full_text)
}

// ─────────────────────────────────────────────
// Mission system — Manager Agent orchestration
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MissionGoal {
    id: String,
    text: String,
    added_at: String,
    completed_at: Option<String>,
    status: String, // "active" | "in_progress" | "completed" | "cancelled"
    priority: String, // "high" | "normal" | "low"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkLogEntry {
    id: String,
    timestamp: String,
    entry_type: String,
    content: String,
    agent_name: Option<String>,
    template_id: Option<String>,
    goal_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tokens_used: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MissionEscalation {
    id: String,
    from: String,
    message: String,
    urgency: String,           // "high" | "info"
    escalation_type: String,   // "question" | "choice"
    #[serde(default)]
    options: Vec<String>,      // for "choice" type
    created_at: String,
    resolved_at: Option<String>,
    response: Option<String>,
    status: String,            // "pending" | "resolved"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MissionSubAgent {
    id: String,
    template_id: String,
    template_name: String,
    task: String,
    status: String, // "running" | "completed" | "error"
    started_at: String,
    completed_at: Option<String>,
    output: Option<String>,
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    run_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Mission {
    id: String,
    name: String,
    description: String,
    goals: Vec<MissionGoal>,
    run_mode: String,
    cycle_period_minutes: u32,
    manager_model: ModelConfig,
    manager_system_prompt: String,
    #[serde(default)]
    allow_manager_goals: bool,
    #[serde(default)]
    auto_briefing: bool,
    status: String,
    created_at: String,
    updated_at: String,
    started_at: Option<String>,
    work_log: Vec<WorkLogEntry>,
    active_escalation: Option<MissionEscalation>,
    workspace_path: Option<String>,
    #[serde(default)]
    active_sub_agents: Vec<MissionSubAgent>,
    #[serde(default)]
    chat_log: Vec<MissionChatMessage>,
}

struct MissionHandle {
    cancel: Arc<AtomicBool>,
}

// ── Manager tool definitions ──────────────────

fn manager_tool_definitions() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "dispatch_agent".into(),
            description: "Dispatch a specialist agent to complete a specific task in the shared workspace. The agent will have full file system access and return its output when done. You can dispatch multiple agents in sequence.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "template_id": {
                        "type": "string",
                        "description": "The agent template ID to use (e.g. 'software-planner', 'full-stack-developer')"
                    },
                    "task": {
                        "type": "string",
                        "description": "The specific task for this agent to complete. Be precise and actionable."
                    },
                    "context": {
                        "type": "string",
                        "description": "Additional context, background, or constraints the agent should know"
                    }
                },
                "required": ["template_id", "task"]
            }),
        },
        ToolDef {
            name: "escalate_to_human".into(),
            description: "Send a message to the human (CEO) and wait for their response. Use this when you need a decision, approval, clarification, or something only the human can provide. The mission will pause until they respond.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Your question, request, or update for the human. Be specific about what you need."
                    },
                    "context": {
                        "type": "string",
                        "description": "Relevant context to help the human understand the situation"
                    }
                },
                "required": ["message"]
            }),
        },
        ToolDef {
            name: "complete_goal".into(),
            description: "Mark a goal as completed when all its success criteria have been met.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "goal_id": {
                        "type": "string",
                        "description": "The ID of the goal to mark complete"
                    },
                    "summary": {
                        "type": "string",
                        "description": "Brief summary of how the goal was achieved and what was produced"
                    }
                },
                "required": ["goal_id", "summary"]
            }),
        },
        ToolDef {
            name: "add_note".into(),
            description: "Add an observation, decision rationale, or important context note to your work log. Use this to record things you'll need to remember in future cycles.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "note": {
                        "type": "string",
                        "description": "The observation or note to record"
                    }
                },
                "required": ["note"]
            }),
        },
        ToolDef {
            name: "create_goal".into(),
            description: "Create a new goal for this mission. Use when you identify something that needs to be accomplished that isn't already a goal. Only available when the human has enabled Manager goal creation.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "goal_text": {
                        "type": "string",
                        "description": "The goal to add — be specific and measurable"
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["high", "normal", "low"],
                        "description": "Priority level for this goal"
                    },
                    "rationale": {
                        "type": "string",
                        "description": "Why this goal is needed to fulfill the mission"
                    }
                },
                "required": ["goal_text", "priority", "rationale"]
            }),
        },
        ToolDef {
            name: "ask_human_choice".into(),
            description: "Ask the human (CEO) a question and present specific options for them to choose from. Use when you need a decision between defined alternatives. The human can pick one of your options or type a custom answer.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The question to ask the human. Be specific and clear."
                    },
                    "context": {
                        "type": "string",
                        "description": "Relevant context to help the human understand why you're asking"
                    },
                    "options": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "2-5 specific options for the human to choose from",
                        "minItems": 2,
                        "maxItems": 5
                    }
                },
                "required": ["question", "options"]
            }),
        },
        ToolDef {
            name: "create_agent".into(),
            description: "Create and dispatch a custom specialist agent when no built-in template is a good fit. You define the agent's name, expertise, and full system prompt — think of it as hiring someone specifically for this task. The agent gets full file system access and returns its output when done.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "A descriptive job title for this agent (e.g. 'Database Migration Specialist', 'Legal Contract Reviewer')"
                    },
                    "system_prompt": {
                        "type": "string",
                        "description": "The agent's full instructions: role, objective, approach, and output format. Write this like a job description + brief — be specific about what expertise they bring and exactly what to produce."
                    },
                    "task": {
                        "type": "string",
                        "description": "The specific task for this agent to complete"
                    },
                    "context": {
                        "type": "string",
                        "description": "Additional background, constraints, or relevant prior work the agent should know about"
                    }
                },
                "required": ["name", "system_prompt", "task"]
            }),
        },
        ToolDef {
            name: "wait".into(),
            description: "End this cycle without dispatching agents. Use when all work is in progress, you're waiting for something, or there is genuinely nothing to do right now.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Why you're waiting and what you're waiting for"
                    }
                },
                "required": ["reason"]
            }),
        },

        // ── Direct filesystem / web tools ──────────────────────────────────────
        // Read-only reconnaissance — manager LOOKS, agents WRITE
        ToolDef {
            name: "read_file".into(),
            description: "Read a file. Use once for orientation before dispatching. Do not call repeatedly.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "list_directory".into(),
            description: "List a directory. One call to understand workspace state.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "search_files".into(),
            description: "Search for text across workspace files.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "pattern": { "type": "string" },
                    "file_glob": { "type": "string" }
                },
                "required": ["path", "pattern"]
            }),
        },
        ToolDef {
            name: "fetch_url".into(),
            description: "Fetch text from a URL.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "url": { "type": "string" } },
                "required": ["url"]
            }),
        },
    ]
}

// ── Manager context builder ───────────────────

fn build_manager_context(mission: &Mission) -> String {
    // Format goals with their IDs very explicitly so the Manager can reference them
    let goals_text = if mission.goals.is_empty() {
        "No goals set yet. Ask the human to define the mission goals.".to_string()
    } else {
        mission.goals.iter().map(|g| {
            let status_label = match g.status.as_str() {
                "completed"   => "[DONE]",
                "in_progress" => "[IN PROGRESS]",
                "cancelled"   => "[CANCELLED]",
                _             => "[ACTIVE]",
            };
            // Make goal_id prominent — the Manager needs this exact string for complete_goal
            format!("{status} goal_id=\"{id}\"\n    Text: {text}\n    Priority: {priority}",
                status = status_label, id = g.id, text = g.text, priority = g.priority)
        }).collect::<Vec<_>>().join("\n\n")
    };

    let active_goals: Vec<&MissionGoal> = mission.goals.iter()
        .filter(|g| g.status == "active" || g.status == "in_progress")
        .collect();

    let recent_log = if mission.work_log.is_empty() {
        "No history yet — this is the first cycle.".to_string()
    } else {
        let recent: Vec<_> = mission.work_log.iter().rev().take(25).collect();
        recent.iter().rev().map(|e| {
            format!("[{}] {}: {}", e.timestamp.chars().take(19).collect::<String>(), e.entry_type, e.content)
        }).collect::<Vec<_>>().join("\n")
    };

    let templates_text = built_in_templates().iter()
        .map(|t| format!("  • {} (template_id: '{}') — {}", t.name, t.id, t.description))
        .collect::<Vec<_>>()
        .join("\n");

    let workspace_text = mission.workspace_path.as_deref()
        .map(|p| format!("Shared workspace directory: `{}`\nAll agents you dispatch will read/write files here.", p))
        .unwrap_or_else(|| "No workspace set. If agents need to create files, escalate to the human to set a workspace.".to_string());

    let goal_tool_note = if mission.allow_manager_goals {
        "- create_goal: Define a new goal when you identify something the mission needs to accomplish"
    } else {
        "(Goal creation is managed by the human — you cannot add goals, only work toward existing ones)"
    };

    format!(r#"You are the Manager Agent for mission: "{name}".
Mission description: {description}

## YOUR ROLE — READ THIS FIRST
You are a MANAGER. You dispatch agents. You review their output. You complete goals.
You do NOT write code. You do NOT implement features. You do NOT explore files in loops.
When there is work to do, you dispatch an agent. That is the entire job.

## HARD RULES
1. Active goals present → dispatch an agent this cycle. No exceptions. "Planning" is not progress.
2. Direct file tools (read_file, list_directory, search_files) are for ONE orientation check only. Never call them more than once per cycle, never on the same path twice.
3. NEVER write code files, Python scripts, HTML, or any implementation yourself. Those are for developer agents.
4. NEVER use escalate_to_human or ask_human_choice to ask about project scope, what to build, or goal definition. The mission description tells you what to build — figure it out and dispatch.
5. After an agent completes work that satisfies a goal → call complete_goal in the SAME cycle.
6. Use exact template_id strings from the Available Agent Templates list below when calling dispatch_agent.

## Active Goals (use goal_id exactly as shown when calling complete_goal)
{goals}

{workspace}

## Available Agent Templates
{templates}

## Recent Work Log
{log}

## YOUR TOOLS

**dispatch_agent(template_id, task, context)** — Your PRIMARY tool. Run a specialist agent to do the actual work. Give them a clear, specific task. Agents have full file system access.

**create_agent(name, system_prompt, task, context?)** — When no template fits, create a custom agent. You write their role and instructions. Use this rather than doing complex work yourself.

**complete_goal(goal_id, summary)** — Call this IMMEDIATELY when agent output satisfies a goal. Use the exact goal_id. Do NOT wait for the next cycle.

**escalate_to_human(message, context)** — Only when you genuinely cannot make a decision yourself.

**ask_human_choice(question, context, options)** — Present specific choices when the human must decide.

**add_note(note)** — Log a short observation. Not a substitute for action.

{goal_tool_note}

**wait(reason)** — Only when ALL active work is in-flight and there is truly nothing to start.

**read_file / list_directory / search_files / fetch_url** — Read-only orientation. One call per cycle max. Never for implementation — agents handle all writing.

## WHAT TO DO THIS CYCLE
1. Glance at the work log — did any agent complete work that satisfies a goal? → complete_goal NOW.
2. Pick the highest-priority active goal.
3. Dispatch the right agent for it with a specific, actionable task description.
4. If the agent just returned output → evaluate it, complete the goal if done, dispatch the next agent.
5. Do not loop on the same files. Do not re-read. Move forward.

Active goals still needing work: {active_count}"#,
        name = mission.name,
        description = mission.description,
        goals = goals_text,
        workspace = workspace_text,
        templates = templates_text,
        log = recent_log,
        active_count = active_goals.len(),
    )
}

// ── Mission storage helpers ───────────────────

fn missions_dir(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("missions")
}

fn load_mission(data_dir: &PathBuf, id: &str) -> Result<Mission, String> {
    load_json(&missions_dir(data_dir).join(format!("{}.json", id)))
}

fn save_mission_to_disk(data_dir: &PathBuf, mission: &Mission) -> Result<(), String> {
    save_json(&missions_dir(data_dir).join(format!("{}.json", mission.id)), mission)
}

fn append_log(mission: &mut Mission, entry_type: &str, content: &str, agent_name: Option<&str>, template_id: Option<&str>, goal_id: Option<&str>) -> WorkLogEntry {
    append_log_with_tokens(mission, entry_type, content, agent_name, template_id, goal_id, None)
}

fn append_log_with_tokens(mission: &mut Mission, entry_type: &str, content: &str, agent_name: Option<&str>, template_id: Option<&str>, goal_id: Option<&str>, tokens_used: Option<u32>) -> WorkLogEntry {
    let entry = WorkLogEntry {
        id: Uuid::new_v4().to_string(),
        timestamp: now(),
        entry_type: entry_type.to_string(),
        content: content.to_string(),
        agent_name: agent_name.map(str::to_string),
        template_id: template_id.map(str::to_string),
        goal_id: goal_id.map(str::to_string),
        tokens_used,
    };
    mission.work_log.push(entry.clone());
    if mission.work_log.len() > 200 {
        mission.work_log.drain(0..50);
    }
    entry
}

// ── Sub-agent execution ───────────────────────

// Shared execution core — runs any AgentNodeData as a mission sub-agent
async fn run_agent_data_for_mission(
    data: AgentNodeData,
    task: &str,
    context: &str,
    mission_id: &str,
    agent_dispatch_id: &str,
    workspace_path: Option<&str>,
    state: &Arc<AppState>,
    app: &AppHandle,
    cancel: &Arc<AtomicBool>,
) -> Result<(String, Option<u32>), String> {
    let user_message = if context.trim().is_empty() {
        task.to_string()
    } else {
        format!("## Task\n{}\n\n## Context\n{}", task, context)
    };

    let sub_run_id = format!("mission_{}_{}", mission_id, agent_dispatch_id);
    {
        let mut runs = state.active_runs.lock().unwrap();
        runs.insert(sub_run_id.clone(), RunHandle {
            cancel_flag: cancel.clone(),
            gate_senders: Mutex::new(HashMap::new()),
            tool_confirm_senders: Mutex::new(HashMap::new()),
        });
    }

    let mut ctx = ExecCtx { input: user_message.clone(), chain: vec![] };
    let mut run = Run {
        id: sub_run_id.clone(),
        workflow_id: format!("mission_{}", mission_id),
        started_at: now(),
        completed_at: None,
        status: "running".into(),
        input: user_message.clone(),
        steps: vec![],
        final_output: None,
        workspace_config: workspace_path.map(|p| WorkspaceConfig {
            mode: "workspace".into(),
            workspace_path: p.to_string(),
            project_name: None,
        }),
    };

    let result = exec_agent(
        &data,
        agent_dispatch_id,
        1,
        &mut ctx,
        &sub_run_id,
        &mut run,
        state,
        app,
        cancel,
        None,
        workspace_path,
    ).await;

    state.active_runs.lock().unwrap().remove(&sub_run_id);

    let tokens = run.steps.iter()
        .filter_map(|s| s.tokens_used)
        .reduce(|a, b| a + b);

    result.map(|output| (output, tokens))
}

// Dispatch a built-in template agent
async fn run_sub_agent_for_mission(
    template_id: &str,
    task: &str,
    context: &str,
    mission_id: &str,
    agent_dispatch_id: &str,
    manager_model: &ModelConfig,
    workspace_path: Option<&str>,
    state: &Arc<AppState>,
    app: &AppHandle,
    cancel: &Arc<AtomicBool>,
) -> Result<(String, Option<u32>), String> {
    let templates = built_in_templates();
    let template = templates.iter().find(|t| t.id == template_id)
        .ok_or_else(|| format!("Template '{}' not found. Available: {}", template_id,
            templates.iter().map(|t| t.id.as_str()).collect::<Vec<_>>().join(", ")))?;

    let data = AgentNodeData {
        name: template.name.clone(),
        role_description: template.description.clone(),
        system_prompt: template.system_prompt.clone(),
        model: manager_model.clone(),
        context_mode: "none".into(),
        max_tokens: manager_model.max_tokens,
        template_id: Some(template_id.into()),
        tools_enabled: vec![],
    };

    run_agent_data_for_mission(data, task, context, mission_id, agent_dispatch_id, workspace_path, state, app, cancel).await
}

// ── Mission execution cycle ───────────────────

async fn execute_mission_cycle(
    mission_id: &str,
    data_dir: &PathBuf,
    state: &Arc<AppState>,
    app: &AppHandle,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("__cancelled__".into());
    }

    let mut mission = load_mission(data_dir, mission_id)
        .map_err(|e| format!("Failed to load mission: {}", e))?;

    let cycle_num = mission.work_log.iter().filter(|e| e.entry_type == "cycle_start").count() + 1;

    let cycle_entry = append_log(
        &mut mission,
        "cycle_start",
        &format!("Manager cycle #{} starting", cycle_num),
        None, None, None
    );
    let _ = app.emit(
        &format!("conductor://mission/{}/log", mission_id),
        serde_json::json!({ "missionId": mission_id, "entry": cycle_entry }),
    );
    save_mission_to_disk(data_dir, &mission).ok();

    let system_prompt = build_manager_context(&mission);
    let allow_goals = mission.allow_manager_goals;
    let tool_defs: Vec<ToolDef> = manager_tool_definitions()
        .into_iter()
        .filter(|t| t.name != "create_goal" || allow_goals)
        .collect();
    let manager_model = mission.manager_model.clone();
    let workspace = mission.workspace_path.clone();

    let cycle_prompt = if mission.work_log.iter().any(|e| e.entry_type == "agent_completed") {
        "Agent work has been completed. STEP 1: Check if any completed work satisfies an active goal — if so, call complete_goal NOW with the exact goal_id. STEP 2: Dispatch the next agent toward the next active goal. Do not read files in a loop. Do not write summaries. Dispatch and complete goals."
    } else {
        "You have active goals. Dispatch an agent NOW to start working on the highest-priority goal. Pick a template, write a specific task description, and call dispatch_agent. Do not read files first. Do not plan. Act."
    };

    // ── Briefing step: Manager states its plan before acting ──────────
    let briefing_prompt = "State your plan for this cycle in 2 sentences: \
        sentence 1 — which goal you are working on; \
        sentence 2 — which agent you will dispatch (use exact template_id from the list) and what task you will give them. \
        Write plain English only. No JSON. No IDs. No preamble. No questions.";

    let brief_turn = llm_call_with_tools(
        &manager_model,
        &system_prompt,
        &[serde_json::json!({ "role": "user", "content": briefing_prompt })],
        &data_dir.join("keys.json"),
        &[], // text-only, no tools
    ).await?;

    let plan_text = match brief_turn {
        LlmTurnResult::Text { content, .. } => content,
        LlmTurnResult::ToolCalls { preceding_text, .. } => preceding_text.unwrap_or_else(|| "Ready to begin.".into()),
    };

    // Log briefing to work log
    let brief_entry = append_log(&mut mission, "briefing", &format!("Manager's plan: {}", plan_text), None, None, None);
    let _ = app.emit(
        &format!("conductor://mission/{}/log", mission_id),
        serde_json::json!({ "missionId": mission_id, "entry": brief_entry }),
    );

    // If not auto_briefing, wait for human approval before acting
    let redirect_text: Option<String> = if !mission.auto_briefing {
        let briefing_id = Uuid::new_v4().to_string();

        mission.status = "briefing".into();
        save_mission_to_disk(data_dir, &mission).ok();
        let _ = app.emit(
            &format!("conductor://mission/{}/status", mission_id),
            serde_json::json!({ "missionId": mission_id, "status": "briefing" }),
        );
        let _ = app.emit(
            &format!("conductor://mission/{}/briefing", mission_id),
            serde_json::json!({ "missionId": mission_id, "briefingId": briefing_id, "plan": plan_text }),
        );

        let (tx, rx) = oneshot::channel::<Option<String>>();
        { state.mission_briefing_senders.lock().unwrap().insert(briefing_id, tx); }

        match rx.await {
            Ok(redirect) => {
                mission = load_mission(data_dir, mission_id)
                    .map_err(|e| format!("Failed to reload mission: {}", e))?;
                mission.status = "running".into();
                save_mission_to_disk(data_dir, &mission).ok();
                let _ = app.emit(
                    &format!("conductor://mission/{}/status", mission_id),
                    serde_json::json!({ "missionId": mission_id, "status": "running" }),
                );
                redirect
            }
            Err(_) => return Err("__cancelled__".into()),
        }
    } else {
        None
    };

    // Briefing is informational for the human — do NOT inject it into the cycle context.
    // The model's cycle starts fresh so the briefing text can't corrupt tool call arguments.
    let cycle_content = match &redirect_text {
        Some(r) => format!("{}\n\n## CEO Directive\n{}", cycle_prompt, r),
        None => cycle_prompt.to_string(),
    };

    let mut messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": cycle_content }),
    ];

    // Manager tool loop
    for _iteration in 0..10u32 {
        if cancel.load(Ordering::Relaxed) {
            return Err("__cancelled__".into());
        }

        let turn = llm_call_with_tools(
            &manager_model,
            &system_prompt,
            &messages,
            &data_dir.join("keys.json"),
            &tool_defs,
        ).await?;

        match turn {
            LlmTurnResult::Text { content, .. } => {
                if !content.is_empty() {
                    let entry = append_log(
                        &mut mission, "manager_decision",
                        &format!("Manager: {}", content), None, None, None,
                    );
                    let _ = app.emit(
                        &format!("conductor://mission/{}/log", mission_id),
                        serde_json::json!({ "missionId": mission_id, "entry": entry }),
                    );
                    save_mission_to_disk(data_dir, &mission).ok();
                }
                break; // Manager finished thinking
            }

            LlmTurnResult::ToolCalls { tool_calls, preceding_text } => {
                if let Some(ref text) = preceding_text {
                    if !text.is_empty() {
                        let entry = append_log(&mut mission, "manager_decision",
                            &format!("Manager: {}", text), None, None, None);
                        let _ = app.emit(
                            &format!("conductor://mission/{}/log", mission_id),
                            serde_json::json!({ "missionId": mission_id, "entry": entry }),
                        );
                    }
                }

                if manager_model.simple_tool_format {
                    let full = preceding_text.as_deref().unwrap_or("").to_string();
                    messages.push(serde_json::json!({ "role": "assistant", "content": full }));
                } else {
                    messages.push(build_assistant_tool_call_message(
                        &tool_calls, &manager_model.provider, preceding_text.as_deref(),
                    ));
                }

                let mut results: Vec<(String, bool)> = vec![];

                for tc in &tool_calls {
                    let tool_result: (String, bool) = match tc.name.as_str() {

                        "dispatch_agent" => {
                            let template_id = tc.arguments["template_id"].as_str().unwrap_or("").to_string();
                            let task = tc.arguments["task"].as_str().unwrap_or("").to_string();
                            let context = tc.arguments["context"].as_str().unwrap_or("").to_string();
                            let agent_dispatch_id = Uuid::new_v4().to_string();
                            let sub_run_id = format!("mission_{}_{}", mission_id, agent_dispatch_id);
                            let templates = built_in_templates();
                            let template_name = templates.iter()
                                .find(|t| t.id == template_id)
                                .map(|t| t.name.clone())
                                .unwrap_or_else(|| template_id.clone());

                            // Record dispatch
                            let sub_agent = MissionSubAgent {
                                id: agent_dispatch_id.clone(),
                                template_id: template_id.clone(),
                                template_name: template_name.clone(),
                                task: task.clone(),
                                status: "running".into(),
                                started_at: now(),
                                completed_at: None,
                                output: None,
                                error: None,
                                run_id: Some(sub_run_id),
                            };
                            mission.active_sub_agents.push(sub_agent.clone());

                            let dispatch_entry = append_log(
                                &mut mission, "agent_dispatched",
                                &format!("Dispatched {} to: {}", template_name, task),
                                Some(&template_name), Some(&template_id), None,
                            );
                            let _ = app.emit(
                                &format!("conductor://mission/{}/log", mission_id),
                                serde_json::json!({ "missionId": mission_id, "entry": dispatch_entry }),
                            );
                            let _ = app.emit(
                                &format!("conductor://mission/{}/agent_status", mission_id),
                                serde_json::json!({ "missionId": mission_id, "agent": sub_agent }),
                            );
                            save_mission_to_disk(data_dir, &mission).ok();

                            // Run the agent
                            let run_result = run_sub_agent_for_mission(
                                &template_id, &task, &context,
                                mission_id, &agent_dispatch_id,
                                &manager_model, workspace.as_deref(),
                                state, app, cancel,
                            ).await;

                            // Update sub-agent record
                            if let Some(sa) = mission.active_sub_agents.iter_mut().find(|s| s.id == agent_dispatch_id) {
                                sa.completed_at = Some(now());
                                match &run_result {
                                    Ok((out, _)) => { sa.status = "completed".into(); sa.output = Some(safe_truncate(out, 500).to_string()); }
                                    Err(e)       => { sa.status = "error".into(); sa.error = Some(e.clone()); }
                                }
                            }

                            match run_result {
                                Ok((output, tokens)) => {
                                    let token_note = tokens.map(|t| format!(" ({} tokens)", t)).unwrap_or_default();
                                    let done_entry = append_log_with_tokens(
                                        &mut mission, "agent_completed",
                                        &format!("{} completed task{}", template_name, token_note),
                                        Some(&template_name), Some(&template_id), None,
                                        tokens,
                                    );
                                    let _ = app.emit(
                                        &format!("conductor://mission/{}/log", mission_id),
                                        serde_json::json!({ "missionId": mission_id, "entry": done_entry }),
                                    );
                                    save_mission_to_disk(data_dir, &mission).ok();
                                    let truncated = safe_truncate(&output, 4000).to_string();
                                    (format!("Agent '{}' completed task.\n\nOutput:\n{}", template_name, truncated), false)
                                }
                                Err(e) => {
                                    let err_entry = append_log(
                                        &mut mission, "agent_error",
                                        &format!("{} failed: {}", template_name, e),
                                        Some(&template_name), Some(&template_id), None,
                                    );
                                    let _ = app.emit(
                                        &format!("conductor://mission/{}/log", mission_id),
                                        serde_json::json!({ "missionId": mission_id, "entry": err_entry }),
                                    );
                                    save_mission_to_disk(data_dir, &mission).ok();
                                    (format!("Agent '{}' failed: {}", template_name, e), true)
                                }
                            }
                        }

                        "create_agent" => {
                            let name = tc.arguments["name"].as_str().unwrap_or("Custom Agent").to_string();
                            let system_prompt = tc.arguments["system_prompt"].as_str().unwrap_or("").to_string();
                            let task = tc.arguments["task"].as_str().unwrap_or("").to_string();
                            let context = tc.arguments["context"].as_str().unwrap_or("").to_string();
                            let agent_dispatch_id = Uuid::new_v4().to_string();
                            let sub_run_id = format!("mission_{}_{}", mission_id, agent_dispatch_id);

                            let sub_agent = MissionSubAgent {
                                id: agent_dispatch_id.clone(),
                                template_id: "custom".into(),
                                template_name: name.clone(),
                                task: task.clone(),
                                status: "running".into(),
                                started_at: now(),
                                completed_at: None,
                                output: None,
                                error: None,
                                run_id: Some(sub_run_id),
                            };
                            mission.active_sub_agents.push(sub_agent.clone());

                            let dispatch_entry = append_log(
                                &mut mission, "agent_dispatched",
                                &format!("Hired custom agent '{}' for: {}", name, task),
                                Some(&name), Some("custom"), None,
                            );
                            let _ = app.emit(
                                &format!("conductor://mission/{}/log", mission_id),
                                serde_json::json!({ "missionId": mission_id, "entry": dispatch_entry }),
                            );
                            let _ = app.emit(
                                &format!("conductor://mission/{}/agent_status", mission_id),
                                serde_json::json!({ "missionId": mission_id, "agent": sub_agent }),
                            );
                            save_mission_to_disk(data_dir, &mission).ok();

                            let data = AgentNodeData {
                                name: name.clone(),
                                role_description: format!("Custom agent created by Manager for this mission"),
                                system_prompt: system_prompt.clone(),
                                model: manager_model.clone(),
                                context_mode: "none".into(),
                                max_tokens: manager_model.max_tokens,
                                template_id: None,
                                tools_enabled: vec![],
                            };

                            let run_result = run_agent_data_for_mission(
                                data, &task, &context,
                                mission_id, &agent_dispatch_id,
                                workspace.as_deref(),
                                state, app, cancel,
                            ).await;

                            if let Some(sa) = mission.active_sub_agents.iter_mut().find(|s| s.id == agent_dispatch_id) {
                                sa.completed_at = Some(now());
                                match &run_result {
                                    Ok((out, _)) => { sa.status = "completed".into(); sa.output = Some(safe_truncate(out, 500).to_string()); }
                                    Err(e)       => { sa.status = "error".into(); sa.error = Some(e.clone()); }
                                }
                            }

                            match run_result {
                                Ok((output, tokens)) => {
                                    let token_note = tokens.map(|t| format!(" ({} tokens)", t)).unwrap_or_default();
                                    let done_entry = append_log_with_tokens(
                                        &mut mission, "agent_completed",
                                        &format!("{} completed task{}", name, token_note),
                                        Some(&name), Some("custom"), None,
                                        tokens,
                                    );
                                    let _ = app.emit(
                                        &format!("conductor://mission/{}/log", mission_id),
                                        serde_json::json!({ "missionId": mission_id, "entry": done_entry }),
                                    );
                                    save_mission_to_disk(data_dir, &mission).ok();
                                    let truncated = safe_truncate(&output, 4000).to_string();
                                    (format!("Custom agent '{}' completed task.\n\nOutput:\n{}", name, truncated), false)
                                }
                                Err(e) => {
                                    let err_entry = append_log(
                                        &mut mission, "agent_error",
                                        &format!("{} failed: {}", name, e),
                                        Some(&name), Some("custom"), None,
                                    );
                                    let _ = app.emit(
                                        &format!("conductor://mission/{}/log", mission_id),
                                        serde_json::json!({ "missionId": mission_id, "entry": err_entry }),
                                    );
                                    save_mission_to_disk(data_dir, &mission).ok();
                                    (format!("Custom agent '{}' failed: {}", name, e), true)
                                }
                            }
                        }

                        "escalate_to_human" => {
                            let message = tc.arguments["message"].as_str().unwrap_or("").to_string();
                            let context_msg = tc.arguments["context"].as_str().unwrap_or("").to_string();
                            let full_message = if context_msg.is_empty() {
                                message.clone()
                            } else {
                                format!("{}\n\nContext: {}", message, context_msg)
                            };

                            let escalation = MissionEscalation {
                                id: Uuid::new_v4().to_string(),
                                from: "manager".to_string(),
                                message: full_message.clone(),
                                urgency: "high".to_string(),
                                escalation_type: "question".to_string(),
                                options: vec![],
                                created_at: now(),
                                resolved_at: None,
                                response: None,
                                status: "pending".to_string(),
                            };
                            let esc_id = escalation.id.clone();
                            mission.active_escalation = Some(escalation.clone());
                            mission.status = "escalating".to_string();

                            let esc_entry = append_log(
                                &mut mission, "escalation_created",
                                &format!("Manager escalated to human: {}", full_message),
                                None, None, None,
                            );
                            save_mission_to_disk(data_dir, &mission).ok();

                            let _ = app.emit(
                                &format!("conductor://mission/{}/log", mission_id),
                                serde_json::json!({ "missionId": mission_id, "entry": esc_entry }),
                            );
                            let _ = app.emit(
                                &format!("conductor://mission/{}/escalation", mission_id),
                                serde_json::json!({ "missionId": mission_id, "escalation": escalation }),
                            );

                            // Create oneshot and wait for human response
                            let (tx, rx) = oneshot::channel::<String>();
                            {
                                let mut senders = state.mission_escalation_senders.lock().unwrap();
                                senders.insert(esc_id.clone(), tx);
                            }

                            // Await human response (blocking)
                            match rx.await {
                                Ok(response) => {
                                    // Update mission with response
                                    if let Ok(mut m) = load_mission(data_dir, mission_id) {
                                        if let Some(esc) = &mut m.active_escalation {
                                            esc.response = Some(response.clone());
                                            esc.resolved_at = Some(now());
                                            esc.status = "resolved".to_string();
                                        }
                                        m.status = "running".to_string();
                                        let res_entry = append_log(
                                            &mut m, "escalation_resolved",
                                            &format!("Human responded: {}", response),
                                            None, None, None,
                                        );
                                        save_mission_to_disk(data_dir, &m).ok();
                                        let _ = app.emit(
                                            &format!("conductor://mission/{}/log", mission_id),
                                            serde_json::json!({ "missionId": mission_id, "entry": res_entry }),
                                        );
                                        let _ = app.emit(
                                            &format!("conductor://mission/{}/status", mission_id),
                                            serde_json::json!({ "missionId": mission_id, "status": "running" }),
                                        );
                                        mission = m;
                                    }
                                    (format!("Human responded: {}", response), false)
                                }
                                Err(_) => ("Escalation channel closed — mission may be stopping".to_string(), true),
                            }
                        }

                        "complete_goal" => {
                            let goal_id = tc.arguments["goal_id"].as_str().unwrap_or("").to_string();
                            let summary = tc.arguments["summary"].as_str().unwrap_or("Goal completed").to_string();
                            let mut found = false;

                            for g in &mut mission.goals {
                                if g.id == goal_id {
                                    g.status = "completed".to_string();
                                    g.completed_at = Some(now());
                                    found = true;
                                    break;
                                }
                            }

                            if found {
                                let entry = append_log(
                                    &mut mission, "goal_completed",
                                    &format!("Goal completed: {}", summary),
                                    None, None, Some(&goal_id),
                                );
                                let _ = app.emit(
                                    &format!("conductor://mission/{}/log", mission_id),
                                    serde_json::json!({ "missionId": mission_id, "entry": entry }),
                                );
                                let _ = app.emit(
                                    &format!("conductor://mission/{}/goal_update", mission_id),
                                    serde_json::json!({ "missionId": mission_id, "goalId": goal_id, "status": "completed" }),
                                );
                                save_mission_to_disk(data_dir, &mission).ok();
                                (format!("Goal '{}' marked as completed. Summary: {}", goal_id, summary), false)
                            } else {
                                (format!("Goal '{}' not found", goal_id), true)
                            }
                        }

                        "add_note" => {
                            let note = tc.arguments["note"].as_str().unwrap_or("").to_string();
                            let entry = append_log(
                                &mut mission, "note",
                                &format!("Note: {}", note), None, None, None,
                            );
                            let _ = app.emit(
                                &format!("conductor://mission/{}/log", mission_id),
                                serde_json::json!({ "missionId": mission_id, "entry": entry }),
                            );
                            save_mission_to_disk(data_dir, &mission).ok();
                            (format!("Note recorded: {}", note), false)
                        }

                        "create_goal" => {
                            if !mission.allow_manager_goals {
                                (format!("Goal creation is disabled for this mission. Only the human can add goals."), true)
                            } else {
                                let goal_text = tc.arguments["goal_text"].as_str().unwrap_or("").to_string();
                                let priority = tc.arguments["priority"].as_str().unwrap_or("normal").to_string();
                                let rationale = tc.arguments["rationale"].as_str().unwrap_or("").to_string();

                                if goal_text.trim().is_empty() {
                                    ("Goal text cannot be empty".to_string(), true)
                                } else {
                                    let new_goal = MissionGoal {
                                        id: Uuid::new_v4().to_string(),
                                        text: goal_text.clone(),
                                        added_at: now(),
                                        completed_at: None,
                                        status: "active".to_string(),
                                        priority: priority.clone(),
                                    };
                                    let goal_id = new_goal.id.clone();
                                    mission.goals.push(new_goal);

                                    let entry = append_log(
                                        &mut mission, "goal_completed",
                                        &format!("Manager created new goal: \"{}\" ({}). Rationale: {}", goal_text, priority, rationale),
                                        None, None, Some(&goal_id),
                                    );
                                    let _ = app.emit(
                                        &format!("conductor://mission/{}/log", mission_id),
                                        serde_json::json!({ "missionId": mission_id, "entry": entry }),
                                    );
                                    let _ = app.emit(
                                        &format!("conductor://mission/{}/goal_update", mission_id),
                                        serde_json::json!({ "missionId": mission_id, "action": "added", "text": goal_text }),
                                    );
                                    save_mission_to_disk(data_dir, &mission).ok();
                                    (format!("Goal created: \"{}\" (priority: {})", goal_text, priority), false)
                                }
                            }
                        }

                        "ask_human_choice" => {
                            let question = tc.arguments["question"].as_str().unwrap_or("").to_string();
                            let context_msg = tc.arguments["context"].as_str().unwrap_or("").to_string();
                            let options: Vec<String> = tc.arguments["options"]
                                .as_array()
                                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                                .unwrap_or_default();

                            let full_message = if context_msg.is_empty() {
                                question.clone()
                            } else {
                                format!("{}\n\nContext: {}", question, context_msg)
                            };

                            let escalation = MissionEscalation {
                                id: Uuid::new_v4().to_string(),
                                from: "manager".to_string(),
                                message: full_message.clone(),
                                urgency: "high".to_string(),
                                escalation_type: "choice".to_string(),
                                options: options.clone(),
                                created_at: now(),
                                resolved_at: None,
                                response: None,
                                status: "pending".to_string(),
                            };
                            let esc_id = escalation.id.clone();
                            mission.active_escalation = Some(escalation.clone());
                            mission.status = "escalating".to_string();

                            let esc_entry = append_log(
                                &mut mission, "escalation_created",
                                &format!("Manager asking for choice: {} [Options: {}]", full_message, options.join(", ")),
                                None, None, None,
                            );
                            save_mission_to_disk(data_dir, &mission).ok();

                            let _ = app.emit(
                                &format!("conductor://mission/{}/log", mission_id),
                                serde_json::json!({ "missionId": mission_id, "entry": esc_entry }),
                            );
                            let _ = app.emit(
                                &format!("conductor://mission/{}/escalation", mission_id),
                                serde_json::json!({ "missionId": mission_id, "escalation": escalation }),
                            );

                            let (tx, rx) = oneshot::channel::<String>();
                            {
                                let mut senders = state.mission_escalation_senders.lock().unwrap();
                                senders.insert(esc_id.clone(), tx);
                            }

                            match rx.await {
                                Ok(response) => {
                                    if let Ok(mut m) = load_mission(data_dir, mission_id) {
                                        if let Some(esc) = &mut m.active_escalation {
                                            esc.response = Some(response.clone());
                                            esc.resolved_at = Some(now());
                                            esc.status = "resolved".to_string();
                                        }
                                        m.status = "running".to_string();
                                        let res_entry = append_log(
                                            &mut m, "escalation_resolved",
                                            &format!("Human chose: {}", response),
                                            None, None, None,
                                        );
                                        save_mission_to_disk(data_dir, &m).ok();
                                        let _ = app.emit(
                                            &format!("conductor://mission/{}/log", mission_id),
                                            serde_json::json!({ "missionId": mission_id, "entry": res_entry }),
                                        );
                                        let _ = app.emit(
                                            &format!("conductor://mission/{}/status", mission_id),
                                            serde_json::json!({ "missionId": mission_id, "status": "running" }),
                                        );
                                        mission = m;
                                    }
                                    (format!("Human chose: {}", response), false)
                                }
                                Err(_) => ("Choice request channel closed".to_string(), true),
                            }
                        }

                        "wait" => {
                            let reason = tc.arguments["reason"].as_str().unwrap_or("Waiting").to_string();
                            let entry = append_log(
                                &mut mission, "note",
                                &format!("Manager waiting: {}", reason), None, None, None,
                            );
                            let _ = app.emit(
                                &format!("conductor://mission/{}/log", mission_id),
                                serde_json::json!({ "missionId": mission_id, "entry": entry }),
                            );
                            save_mission_to_disk(data_dir, &mission).ok();
                            (format!("Waiting: {}", reason), false)
                        }

                        // Direct filesystem / web tools — route to the shared tool executor
                        tool_name => {
                            let dummy_run_id = format!("mission_mgr_{}", mission_id);
                            let result = execute_tool(
                                tc,
                                workspace.as_deref(),
                                &[], // empty = all tools allowed (we control the list via manager_tool_definitions)
                                &ToolPermissionConfig::default(),
                                app,
                                &dummy_run_id,
                                "manager",
                                "Manager",
                                state,
                            ).await;
                            match result {
                                Ok(output) => {
                                    let preview = safe_truncate(&output, 300).to_string();
                                    let entry = append_log(
                                        &mut mission, "manager_tool",
                                        &format!("Manager used {}: {}", tool_name, preview),
                                        None, None, None,
                                    );
                                    let _ = app.emit(
                                        &format!("conductor://mission/{}/log", mission_id),
                                        serde_json::json!({ "missionId": mission_id, "entry": entry }),
                                    );
                                    save_mission_to_disk(data_dir, &mission).ok();
                                    (output, false)
                                }
                                Err(e) => (format!("Tool '{}' error: {}", tool_name, e), true),
                            }
                        }
                    };

                    results.push(tool_result);
                }

                let result_msgs = if manager_model.simple_tool_format {
                    build_simple_tool_results(&tool_calls, &results)
                } else {
                    build_tool_result_messages(&tool_calls, &results, &manager_model.provider)
                };
                messages.extend(result_msgs);
            }
        }
    }

    Ok(())
}

// ── Mission outer loop ────────────────────────

async fn run_mission_loop(
    mission_id: String,
    data_dir: PathBuf,
    state: Arc<AppState>,
    app: AppHandle,
    cancel: Arc<AtomicBool>,
) {
    loop {
        if cancel.load(Ordering::Relaxed) { break; }

        let cycle_result = execute_mission_cycle(
            &mission_id, &data_dir, &state, &app, &cancel,
        ).await;

        match cycle_result {
            Ok(()) => {}
            Err(ref e) if e == "__cancelled__" => break,
            Err(e) => {
                // Log error but keep running
                if let Ok(mut mission) = load_mission(&data_dir, &mission_id) {
                    let entry = append_log(&mut mission, "error", &format!("Cycle error: {}", e), None, None, None);
                    let _ = app.emit(
                        &format!("conductor://mission/{}/log", &mission_id),
                        serde_json::json!({ "missionId": &mission_id, "entry": entry }),
                    );
                    save_mission_to_disk(&data_dir, &mission).ok();
                }
            }
        }

        if cancel.load(Ordering::Relaxed) { break; }

        // Load mission to get current run_mode and cycle period
        let (run_mode, cycle_minutes) = match load_mission(&data_dir, &mission_id) {
            Ok(m) => (m.run_mode.clone(), m.cycle_period_minutes),
            Err(_) => break,
        };

        // Sleep between cycles
        let sleep_secs = if run_mode == "goal_driven" {
            (cycle_minutes as u64).max(1) * 60
        } else {
            // Event-driven: short poll interval
            30u64
        };

        // Sleep in small chunks to remain cancellable
        let mut slept = 0u64;
        while slept < sleep_secs {
            if cancel.load(Ordering::Relaxed) { break; }
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            slept += 5;
        }
    }

    // Mission stopped
    if let Ok(mut mission) = load_mission(&data_dir, &mission_id) {
        mission.status = "idle".into();
        let entry = append_log(&mut mission, "stopped", "Mission stopped", None, None, None);
        save_mission_to_disk(&data_dir, &mission).ok();
        let _ = app.emit(
            &format!("conductor://mission/{}/status", &mission_id),
            serde_json::json!({ "missionId": &mission_id, "status": "idle" }),
        );
        let _ = app.emit(
            &format!("conductor://mission/{}/log", &mission_id),
            serde_json::json!({ "missionId": &mission_id, "entry": entry }),
        );
    }
    state.active_missions.lock().unwrap().remove(&mission_id);
}

// ── Mission Tauri commands ────────────────────

#[tauri::command]
fn list_missions(state: State<'_, Arc<AppState>>) -> Vec<Mission> {
    let dir = missions_dir(&state.data_dir);
    if !dir.exists() { return vec![]; }
    let mut missions: Vec<Mission> = std::fs::read_dir(&dir).ok().into_iter().flatten()
        .filter_map(|e| {
            let path = e.ok()?.path();
            if path.extension()?.to_str()? == "json" { load_json::<Mission>(&path).ok() } else { None }
        })
        .collect();
    missions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    missions
}

#[tauri::command]
fn get_mission(id: String, state: State<'_, Arc<AppState>>) -> Option<Mission> {
    load_mission(&state.data_dir, &id).ok()
}

#[tauri::command]
fn save_mission(mission: Mission, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    std::fs::create_dir_all(missions_dir(&state.data_dir))
        .map_err(|e| format!("Mkdir missions: {}", e))?;
    save_mission_to_disk(&state.data_dir, &mission)
}

#[tauri::command]
fn delete_mission(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    // Stop if running
    {
        let mut missions = state.active_missions.lock().unwrap();
        if let Some(handle) = missions.remove(&id) {
            handle.cancel.store(true, Ordering::Relaxed);
        }
    }
    let path = missions_dir(&state.data_dir).join(format!("{}.json", id));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Delete: {}", e))
    } else {
        Ok(())
    }
}

#[tauri::command]
async fn start_mission(
    mission_id: String,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<(), String> {
    // Check not already running
    {
        let missions = state.active_missions.lock().unwrap();
        if missions.contains_key(&mission_id) {
            return Err("Mission is already running".into());
        }
    }

    let mut mission = load_mission(&state.data_dir, &mission_id)?;
    mission.status = "running".into();
    mission.started_at = Some(now());
    mission.updated_at = now();
    save_mission_to_disk(&state.data_dir, &mission)?;

    let _ = app.emit(
        &format!("conductor://mission/{}/status", mission_id),
        serde_json::json!({ "missionId": &mission_id, "status": "running" }),
    );

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut missions = state.active_missions.lock().unwrap();
        missions.insert(mission_id.clone(), MissionHandle { cancel: cancel.clone() });
    }

    let state_arc = Arc::clone(&*state);
    let data_dir = state.data_dir.clone();
    let mid = mission_id.clone();

    tokio::spawn(async move {
        run_mission_loop(mid, data_dir, state_arc, app, cancel).await;
    });

    Ok(())
}

#[tauri::command]
fn stop_mission(mission_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut missions = state.active_missions.lock().unwrap();
    if let Some(handle) = missions.remove(&mission_id) {
        handle.cancel.store(true, Ordering::Relaxed);
        // Unblock any pending escalation
        {
            let mut senders = state.mission_escalation_senders.lock().unwrap();
            let keys: Vec<String> = senders.keys().filter(|k| k.starts_with(&mission_id)).cloned().collect();
            for k in keys { senders.remove(&k); }
        }
        // Unblock any pending briefing approval
        {
            let mut senders = state.mission_briefing_senders.lock().unwrap();
            let keys: Vec<String> = senders.keys().cloned().collect(); // briefing_id keys — drop all, mission is stopping
            for k in keys { senders.remove(&k); }
        }
    }
    Ok(())
}

#[tauri::command]
fn approve_mission_briefing(
    briefing_id: String,
    redirect: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut senders = state.mission_briefing_senders.lock().unwrap();
    if let Some(tx) = senders.remove(&briefing_id) {
        let _ = tx.send(redirect);
        Ok(())
    } else {
        Err("Briefing not found or already approved".into())
    }
}

#[tauri::command]
fn respond_to_mission_escalation(
    _mission_id: String,
    escalation_id: String,
    response: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut senders = state.mission_escalation_senders.lock().unwrap();
    if let Some(tx) = senders.remove(&escalation_id) {
        let _ = tx.send(response);
        Ok(())
    } else {
        Err("Escalation not found or already resolved".into())
    }
}

#[tauri::command]
fn add_mission_goal(
    mission_id: String,
    goal_text: String,
    priority: String,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<Mission, String> {
    let mut mission = load_mission(&state.data_dir, &mission_id)?;
    let goal = MissionGoal {
        id: Uuid::new_v4().to_string(),
        text: goal_text.clone(),
        added_at: now(),
        completed_at: None,
        status: "active".into(),
        priority: priority.clone(),
    };
    mission.goals.push(goal);
    mission.updated_at = now();
    save_mission_to_disk(&state.data_dir, &mission)?;
    let _ = app.emit(
        &format!("conductor://mission/{}/goal_update", mission_id),
        serde_json::json!({ "missionId": &mission_id, "action": "added", "text": goal_text }),
    );
    Ok(mission)
}

#[tauri::command]
fn delete_mission_goal(
    mission_id: String,
    goal_id: String,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<Mission, String> {
    let mut mission = load_mission(&state.data_dir, &mission_id)?;
    mission.goals.retain(|g| g.id != goal_id);
    mission.updated_at = now();
    save_mission_to_disk(&state.data_dir, &mission)?;
    let _ = app.emit(
        &format!("conductor://mission/{}/goal_update", mission_id),
        serde_json::json!({ "missionId": &mission_id, "action": "deleted", "goalId": goal_id }),
    );
    Ok(mission)
}

#[tauri::command]
fn complete_mission_goal(
    mission_id: String,
    goal_id: String,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<Mission, String> {
    let mut mission = load_mission(&state.data_dir, &mission_id)?;
    for g in &mut mission.goals {
        if g.id == goal_id {
            g.status = "completed".into();
            g.completed_at = Some(now());
            break;
        }
    }
    mission.updated_at = now();
    save_mission_to_disk(&state.data_dir, &mission)?;
    let _ = app.emit(
        &format!("conductor://mission/{}/goal_update", mission_id),
        serde_json::json!({ "missionId": &mission_id, "goalId": goal_id, "status": "completed" }),
    );
    Ok(mission)
}

// ─────────────────────────────────────────────
// Mission chat — live conversation with Manager
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MissionChatMessage {
    id: String,
    role: String, // "user" | "manager"
    content: String,
    timestamp: String,
}

#[tauri::command]
async fn mission_chat_turn(
    mission_id: String,
    user_message: String,
    chat_history: Vec<MissionChatMessage>,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let mission = load_mission(&state.data_dir, &mission_id)?;

    // Build context: mission state + conversation history
    let mission_context = build_manager_context(&mission);

    let chat_system = format!(r#"{context}

---

## CHAT MODE — The human (CEO) is talking to you directly.

You are in a live conversation with the CEO. Respond conversationally and helpfully:
- Give a clear, concise status update on what you've been doing
- Answer their question directly
- If they give you new instructions, acknowledge them and incorporate them
- You can describe your current plan and what you'll do next
- Keep responses focused — this is a quick check-in, not a full report

Be direct and human. You're the manager checking in with your boss."#,
        context = mission_context
    );

    // Convert chat history to LLM messages
    let mut messages: Vec<serde_json::Value> = chat_history.iter().map(|m| {
        serde_json::json!({
            "role": if m.role == "user" { "user" } else { "assistant" },
            "content": m.content
        })
    }).collect();
    messages.push(serde_json::json!({ "role": "user", "content": user_message }));

    let model = &mission.manager_model;
    let max_tokens = effective_max_tokens(&model.provider, &model.model_id, 2048); // shorter for chat
    let cancel = Arc::new(AtomicBool::new(false));

    // Stream response with chat-scoped events
    let keys_file = state.data_dir.join("keys.json");
    let chat_session_id = format!("chat_{}", mission_id);

    let response = match model.provider.as_str() {
        "anthropic" => {
            let key = load_keys(&keys_file).remove("anthropic")
                .ok_or("No Anthropic API key configured")?;
            studio_anthropic_stream(
                "https://api.anthropic.com/v1/messages",
                &key, &model.model_id, &chat_system,
                &messages.iter().map(|m| ApiMessage {
                    role: m["role"].as_str().unwrap_or("user").to_string(),
                    content: m["content"].as_str().unwrap_or("").to_string(),
                }).collect::<Vec<_>>(),
                max_tokens, model.temperature, &app, &chat_session_id, &cancel,
            ).await
        }
        _ => {
            let url = match model.provider.as_str() {
                "openai" => "https://api.openai.com/v1/chat/completions".to_string(),
                "ollama" => {
                    let base = model.base_url.clone().unwrap_or_else(|| "http://localhost:11434".to_string());
                    format!("{}/v1/chat/completions", base.trim_end_matches('/'))
                }
                "custom" => model.base_url.clone().unwrap_or_default(),
                p => return Err(format!("Unsupported provider: {}", p)),
            };
            let key = if model.provider == "openai" || model.provider == "custom" {
                let k = model.api_key_ref.clone().unwrap_or_else(|| model.provider.clone());
                load_keys(&keys_file).remove(&k)
            } else { None };

            studio_openai_compat_stream(
                &url, key.as_deref(), &model.model_id, &chat_system,
                &messages.iter().map(|m| ApiMessage {
                    role: m["role"].as_str().unwrap_or("user").to_string(),
                    content: m["content"].as_str().unwrap_or("").to_string(),
                }).collect::<Vec<_>>(),
                max_tokens, model.temperature, &app, &chat_session_id, &cancel,
            ).await
        }
    }?;

    Ok(response)
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────

fn main() {
    #[cfg(debug_assertions)]
    { dotenvy::dotenv().ok(); }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
            for sub in &["workflows", "runs", "templates", "missions"] {
                let _ = std::fs::create_dir_all(data_dir.join(sub));
            }
            app.manage(Arc::new(AppState {
                data_dir,
                active_runs:   Mutex::new(HashMap::new()),
                chamber_runs:  Mutex::new(HashMap::new()),
                chamber_gates: Mutex::new(HashMap::new()),
                active_missions: Mutex::new(HashMap::new()),
                mission_escalation_senders: Mutex::new(HashMap::new()),
                mission_briefing_senders: Mutex::new(HashMap::new()),
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_workflows,
            save_workflow,
            delete_workflow,
            start_run,
            cancel_run,
            get_run,
            get_runs_for_workflow,
            resume_gate,
            respond_tool_confirmation,
            save_api_key,
            delete_api_key,
            has_api_key,
            get_templates,
            save_template,
            delete_template,
            read_text_file,
            get_ollama_models,
            validate_api_key,
            validate_custom_host,
            workspace_fs::read_workspace_manifest,
            workspace_fs::write_workspace_files,
            workspace_fs::delete_workspace,
            workspace_fs::zip_and_save_workspace,
            workspace_fs::list_projects,
            workspace_fs::open_project,
            workspace_fs::open_project_tree,
            load_config,
            save_config,
            write_text_file,
            import_workflow,
            start_chamber_run,
            cancel_chamber_run,
            resume_chamber_run,
            studio_chat_turn,
            list_missions,
            get_mission,
            save_mission,
            delete_mission,
            start_mission,
            stop_mission,
            respond_to_mission_escalation,
            add_mission_goal,
            complete_mission_goal,
            delete_mission_goal,
            mission_chat_turn,
            approve_mission_briefing,
            get_ollama_model_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
