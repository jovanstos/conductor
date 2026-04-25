// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod workspace_fs;

use std::{
    collections::HashMap,
    path::PathBuf,
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

#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    system: &'a str,
    messages: &'a [ApiMessage],
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
    usage: Option<AnthropicUsage>,
}

#[derive(Deserialize)]
struct AnthropicContentBlock {
    text: String,
}

#[derive(Deserialize)]
struct AnthropicUsage {
    output_tokens: Option<u32>,
}

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

#[derive(Serialize)]
struct OpenAIRequest<'a> {
    model: &'a str,
    messages: Vec<ApiMessage>,
    max_tokens: u32,
    temperature: f64,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
    usage: Option<OpenAIUsage>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: ApiMessage,
}

#[derive(Deserialize)]
struct OpenAIUsage {
    completion_tokens: Option<u32>,
}

// ─────────────────────────────────────────────
// App state
// ─────────────────────────────────────────────

struct AppState {
    data_dir: PathBuf,
    active_runs: Mutex<HashMap<String, RunHandle>>,
    // Chamber
    chamber_runs:  Mutex<HashMap<String, ChamberRunHandle>>,
    chamber_gates: Mutex<HashMap<String, oneshot::Sender<ChamberGateResult>>>,
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

// ─────────────────────────────────────────────
// LLM call implementations (legacy, non-tool)
// ─────────────────────────────────────────────

async fn call_anthropic(
    model_id: &str,
    api_key: &str,
    system: &str,
    messages: &[ApiMessage],
    max_tokens: u32,
    temperature: f64,
) -> Result<(String, Option<u32>), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let body = AnthropicRequest {
        model: model_id,
        max_tokens,
        system,
        messages,
        temperature: if (temperature - 1.0).abs() > 1e-9 { Some(temperature) } else { None },
    };

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
                    return Err(format!("API {} — {}", status, &raw[..raw.len().min(200)]));
                }
                let parsed: AnthropicResponse = serde_json::from_str(&raw)
                    .map_err(|e| format!("Parse: {} | raw: {}", e, &raw[..raw.len().min(200)]))?;
                let text = parsed.content.into_iter().next()
                    .map(|b| b.text)
                    .ok_or_else(|| "Empty response".to_string())?;
                let tokens = parsed.usage.and_then(|u| u.output_tokens);
                return Ok((text, tokens));
            }
        }
    }
    Err("Retry loop exhausted".to_string())
}

async fn call_openai(
    model_id: &str,
    api_key: &str,
    system: &str,
    messages: &[ApiMessage],
    max_tokens: u32,
    temperature: f64,
) -> Result<(String, Option<u32>), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;
    let mut all = vec![ApiMessage { role: "system".into(), content: system.into() }];
    all.extend_from_slice(messages);
    let body = OpenAIRequest { model: model_id, messages: all, max_tokens, temperature };
    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| format!("Read response: {}", e))?;
    if !status.is_success() {
        return Err(format!("OpenAI {} — {}", status, &raw[..raw.len().min(200)]));
    }
    let parsed: OpenAIResponse = serde_json::from_str(&raw).map_err(|e| format!("Parse: {}", e))?;
    let text = parsed.choices.into_iter().next()
        .map(|c| c.message.content)
        .ok_or_else(|| "Empty response".to_string())?;
    let tokens = parsed.usage.and_then(|u| u.completion_tokens);
    Ok((text, tokens))
}

async fn call_ollama(
    model_id: &str,
    base_url: &str,
    system: &str,
    messages: &[ApiMessage],
    max_tokens: u32,
    temperature: f64,
) -> Result<(String, Option<u32>), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;
    let mut all = vec![ApiMessage { role: "system".into(), content: system.into() }];
    all.extend_from_slice(messages);
    let body = OpenAIRequest { model: model_id, messages: all, max_tokens, temperature };
    let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
    let resp = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request: {}", e))?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| format!("Read response: {}", e))?;
    if !status.is_success() {
        return Err(format!("Ollama {} — {}", status, &raw[..raw.len().min(200)]));
    }
    let parsed: OpenAIResponse = serde_json::from_str(&raw).map_err(|e| format!("Parse: {}", e))?;
    let text = parsed.choices.into_iter().next()
        .map(|c| c.message.content)
        .ok_or_else(|| "Empty response".to_string())?;
    Ok((text, None))
}

async fn call_openai_compat_nonstream(
    url: &str,
    auth_token: Option<&str>,
    model_id: &str,
    system: &str,
    messages: &[ApiMessage],
    max_tokens: u32,
    temperature: f64,
) -> Result<(String, Option<u32>), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;
    let mut all = vec![ApiMessage { role: "system".into(), content: system.into() }];
    all.extend_from_slice(messages);
    let body = OpenAIRequest { model: model_id, messages: all, max_tokens, temperature };
    let mut req = client.post(url).header("content-type", "application/json").json(&body);
    if let Some(token) = auth_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }
    let resp = req.send().await.map_err(|e| format!("Request failed: {}", e))?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| format!("Read response: {}", e))?;
    if !status.is_success() {
        return Err(format!("API {} — {}", status, &raw[..raw.len().min(200)]));
    }
    let parsed: OpenAIResponse = serde_json::from_str(&raw).map_err(|e| format!("Parse: {}", e))?;
    let text = parsed.choices.into_iter().next()
        .map(|c| c.message.content)
        .ok_or_else(|| "Empty response".to_string())?;
    let tokens = parsed.usage.and_then(|u| u.completion_tokens);
    Ok((text, tokens))
}

async fn llm_call(
    model: &ModelConfig,
    system: &str,
    messages: &[ApiMessage],
    keys_file: &PathBuf,
) -> Result<(String, Option<u32>), String> {
    let max_tokens = effective_max_tokens(&model.provider, &model.model_id, model.max_tokens);
    match model.provider.as_str() {
        "anthropic" => {
            let key = model.api_key_ref.as_deref()
                .and_then(|r| load_keys(keys_file).remove(r))
                .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
                .ok_or_else(|| "No Anthropic API key configured".to_string())?;
            call_anthropic(&model.model_id, &key, system, messages, max_tokens, model.temperature).await
        }
        "openai" => {
            let key = model.api_key_ref.as_deref()
                .and_then(|r| load_keys(keys_file).remove(r))
                .or_else(|| std::env::var("OPENAI_API_KEY").ok())
                .ok_or_else(|| "No OpenAI API key configured".to_string())?;
            call_openai(&model.model_id, &key, system, messages, max_tokens, model.temperature).await
        }
        "ollama" => {
            let base = model.base_url.as_deref().unwrap_or("http://localhost:11434");
            call_ollama(&model.model_id, base, system, messages, max_tokens, model.temperature).await
        }
        "custom" => {
            let base = model.base_url.as_deref().unwrap_or("http://localhost:8080");
            let url = format!("{}/v1/chat/completions", base.trim_end_matches('/'));
            let key = model.api_key_ref.as_deref().and_then(|r| load_keys(keys_file).remove(r));
            call_openai_compat_nonstream(&url, key.as_deref(), &model.model_id, system, messages, max_tokens, model.temperature).await
        }
        p => Err(format!("Unsupported provider: {}", p)),
    }
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
// Streaming LLM calls (legacy, no tools)
// ─────────────────────────────────────────────

async fn call_anthropic_stream(
    model_id: &str,
    api_key: &str,
    system: &str,
    messages: &[ApiMessage],
    max_tokens: u32,
    temperature: f64,
    app: &AppHandle,
    run_id: &str,
    node_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<(String, Option<u32>), String> {
    use futures_util::StreamExt;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;
    let mut body = serde_json::json!({
        "model": model_id, "max_tokens": max_tokens,
        "system": system, "messages": messages, "stream": true
    });
    if (temperature - 1.0).abs() > 1e-9 {
        body["temperature"] = serde_json::json!(temperature);
    }
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let raw = resp.text().await.unwrap_or_default();
        if let Ok(err) = serde_json::from_str::<AnthropicError>(&raw) {
            return Err(format!("{}: {}", err.error.error_type, err.error.message));
        }
        return Err(format!("API {} — {}", status, &raw[..raw.len().min(200)]));
    }
    let mut byte_stream = resp.bytes_stream();
    let mut full_output = String::new();
    let mut line_buf = String::new();
    let mut output_tokens: Option<u32> = None;
    while let Some(chunk) = byte_stream.next().await {
        if cancel.load(Ordering::Relaxed) { return Err("__cancelled__".into()); }
        let bytes = chunk.map_err(|e| format!("Stream error: {}", e))?;
        line_buf.push_str(&String::from_utf8_lossy(&bytes));
        loop {
            match line_buf.find('\n') {
                None => break,
                Some(pos) => {
                    let line = line_buf[..pos].trim_end_matches('\r').to_string();
                    line_buf = line_buf[pos + 1..].to_string();
                    if let Some(data) = line.strip_prefix("data: ") {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                            match val.get("type").and_then(|v| v.as_str()) {
                                Some("content_block_delta") => {
                                    if let Some(text) = val.pointer("/delta/text").and_then(|v| v.as_str()) {
                                        if !text.is_empty() {
                                            full_output.push_str(text);
                                            let _ = app.emit(
                                                &format!("conductor://run/{}/step_chunk", run_id),
                                                serde_json::json!({ "nodeId": node_id, "chunk": text }),
                                            );
                                        }
                                    }
                                }
                                Some("message_delta") => {
                                    output_tokens = val.pointer("/usage/output_tokens")
                                        .and_then(|v| v.as_u64()).map(|n| n as u32);
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }
    if full_output.is_empty() { return Err("Empty response from Anthropic".into()); }
    Ok((full_output, output_tokens))
}

async fn call_openai_compat_stream(
    url: &str,
    auth_token: Option<&str>,
    model_id: &str,
    system: &str,
    messages: &[ApiMessage],
    max_tokens: u32,
    temperature: f64,
    app: &AppHandle,
    run_id: &str,
    node_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<(String, Option<u32>), String> {
    use futures_util::StreamExt;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;
    let mut all = vec![ApiMessage { role: "system".into(), content: system.into() }];
    all.extend_from_slice(messages);
    let body = serde_json::json!({
        "model": model_id, "messages": all,
        "max_tokens": max_tokens, "temperature": temperature, "stream": true
    });
    let mut req = client.post(url).header("content-type", "application/json").json(&body);
    if let Some(token) = auth_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }
    let resp = req.send().await.map_err(|e| format!("Request failed: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let raw = resp.text().await.unwrap_or_default();
        return Err(format!("API {} — {}", status, &raw[..raw.len().min(200)]));
    }
    let mut byte_stream = resp.bytes_stream();
    let mut full_output = String::new();
    let mut line_buf = String::new();
    let mut output_tokens: Option<u32> = None;
    while let Some(chunk) = byte_stream.next().await {
        if cancel.load(Ordering::Relaxed) { return Err("__cancelled__".into()); }
        let bytes = chunk.map_err(|e| format!("Stream error: {}", e))?;
        line_buf.push_str(&String::from_utf8_lossy(&bytes));
        loop {
            match line_buf.find('\n') {
                None => break,
                Some(pos) => {
                    let line = line_buf[..pos].trim_end_matches('\r').to_string();
                    line_buf = line_buf[pos + 1..].to_string();
                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed == "data: [DONE]" { continue; }
                    if let Some(data) = trimmed.strip_prefix("data: ") {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(text) = val.pointer("/choices/0/delta/content").and_then(|v| v.as_str()) {
                                if !text.is_empty() {
                                    full_output.push_str(text);
                                    let _ = app.emit(
                                        &format!("conductor://run/{}/step_chunk", run_id),
                                        serde_json::json!({ "nodeId": node_id, "chunk": text }),
                                    );
                                }
                            }
                            if let Some(tokens) = val.pointer("/usage/completion_tokens").and_then(|v| v.as_u64()) {
                                output_tokens = Some(tokens as u32);
                            }
                        }
                    }
                }
            }
        }
    }
    if full_output.is_empty() { return Err("Empty response from model".into()); }
    Ok((full_output, output_tokens))
}

async fn llm_call_streaming(
    model: &ModelConfig,
    system: &str,
    messages: &[ApiMessage],
    keys_file: &PathBuf,
    app: &AppHandle,
    run_id: &str,
    node_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<(String, Option<u32>), String> {
    let max_tokens = effective_max_tokens(&model.provider, &model.model_id, model.max_tokens);
    match model.provider.as_str() {
        "anthropic" => {
            let key = model.api_key_ref.as_deref()
                .and_then(|r| load_keys(keys_file).remove(r))
                .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
                .ok_or_else(|| "No Anthropic API key — open Settings (⚙) to add one.".to_string())?;
            call_anthropic_stream(&model.model_id, &key, system, messages, max_tokens, model.temperature, app, run_id, node_id, cancel).await
        }
        "openai" => {
            let key = model.api_key_ref.as_deref()
                .and_then(|r| load_keys(keys_file).remove(r))
                .or_else(|| std::env::var("OPENAI_API_KEY").ok())
                .ok_or_else(|| "No OpenAI API key — open Settings (⚙) to add one.".to_string())?;
            call_openai_compat_stream("https://api.openai.com/v1/chat/completions", Some(&key), &model.model_id, system, messages, max_tokens, model.temperature, app, run_id, node_id, cancel).await
        }
        "ollama" => {
            let base = model.base_url.as_deref().unwrap_or("http://localhost:11434");
            let url = format!("{}/v1/chat/completions", base.trim_end_matches('/'));
            call_openai_compat_stream(&url, None, &model.model_id, system, messages, max_tokens, model.temperature, app, run_id, node_id, cancel).await
        }
        "custom" => {
            let base = model.base_url.as_deref().unwrap_or("http://localhost:8080");
            let url = format!("{}/v1/chat/completions", base.trim_end_matches('/'));
            let key = model.api_key_ref.as_deref().and_then(|r| load_keys(keys_file).remove(r));
            call_openai_compat_stream(&url, key.as_deref(), &model.model_id, system, messages, max_tokens, model.temperature, app, run_id, node_id, cancel).await
        }
        p => Err(format!("Unsupported provider: {}", p)),
    }
}

// ─────────────────────────────────────────────
// Tool-aware LLM calls (non-streaming, for agentic loop)
// ─────────────────────────────────────────────

const TOOL_EDIT_INSTRUCTIONS: &str = r#"

## How to use your tools

You have file system tools available. Use them purposefully:
- `list_directory` / `read_file` — explore and understand the codebase. Limit yourself to reading what you actually need.
- `write_file` — create new files (plans, specs, code, etc.)
- `edit_file` — make targeted changes to existing files (replace an exact string)
- `run_shell_command` — run commands like tests, builds, installs

## Critical output rule

Your TEXT RESPONSE is the primary output that gets passed to the next agent in the workflow. It must be complete and self-contained.

After doing your research and any file operations, write a detailed text response that covers:
- Everything the next agent needs to know to continue
- Your analysis, plan, decisions, and reasoning
- A summary of any files you created or modified, with their key contents

If you created files, mention them and their key contents in your text — do not assume the next agent will find or read them.

**Do NOT stop after tool calls without writing a full text response.** The tool calls are for gathering information and creating artifacts. Your text is the handoff.
"#;

fn tool_definitions(enabled_names: &[String]) -> Vec<ToolDef> {
    let all: Vec<ToolDef> = vec![
        ToolDef {
            name: "read_file".into(),
            description: "Read the full contents of a file. Use this before editing to see current content.".into(),
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
) -> Result<LlmTurnResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
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

async fn llm_call_with_tools(
    model: &ModelConfig,
    system: &str,
    messages: &[serde_json::Value],
    keys_file: &PathBuf,
    tools: &[ToolDef],
) -> Result<LlmTurnResult, String> {
    let max_tokens = effective_max_tokens(&model.provider, &model.model_id, model.max_tokens);
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
            call_openai_compat_with_tools("https://api.openai.com/v1/chat/completions", Some(&key), &model.model_id, system, messages, max_tokens, model.temperature, tools).await
        }
        "ollama" => {
            let base = model.base_url.as_deref().unwrap_or("http://localhost:11434");
            let url = format!("{}/v1/chat/completions", base.trim_end_matches('/'));
            call_openai_compat_with_tools(&url, None, &model.model_id, system, messages, max_tokens, model.temperature, tools).await
        }
        "custom" => {
            let base = model.base_url.as_deref().unwrap_or("http://localhost:8080");
            let url = format!("{}/v1/chat/completions", base.trim_end_matches('/'));
            let key = model.api_key_ref.as_deref().and_then(|r| load_keys(keys_file).remove(r));
            call_openai_compat_with_tools(&url, key.as_deref(), &model.model_id, system, messages, max_tokens, model.temperature, tools).await
        }
        p => Err(format!("Unsupported provider: {}", p)),
    }
}

// ─────────────────────────────────────────────
// Tool execution helpers
// ─────────────────────────────────────────────

fn resolve_path(path: &str, workspace_path: Option<&str>) -> PathBuf {
    let p = PathBuf::from(path);
    if p.is_absolute() {
        p
    } else if let Some(ws) = workspace_path {
        // Safely catch "." or empty paths and return the clean workspace root
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

fn check_path_allowed(path: &PathBuf, permissions: &ToolPermissionConfig) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    let home = platform_home();
    for denied in &permissions.denied_paths {
        let expanded = denied.replace('~', &home.to_string_lossy());
        if path_str.starts_with(&expanded) {
            return Err(format!("Access to '{}' is denied", path.display()));
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
    tool_call_id: &str,
    tool_name: &str,
    description: &str,
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
            "toolCallId": tool_call_id,
            "toolName": tool_name,
            "description": description,
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
    state: &Arc<AppState>,
) -> Result<String, String> {
    if !enabled_tools.iter().any(|n| n == &tc.name) {
        return Err(format!("Tool '{}' is not enabled for this agent", tc.name));
    }
    let args = &tc.arguments;

    match tc.name.as_str() {
        "read_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let resolved = resolve_path(path, workspace_path);
            check_path_allowed(&resolved, permissions)?;
            let content = std::fs::read_to_string(&resolved)
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
            let resolved = resolve_path(path, workspace_path);
            check_path_allowed(&resolved, permissions)?;
            if let Some(parent) = resolved.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
            }
            std::fs::write(&resolved, content)
                .map_err(|e| format!("Cannot write '{}': {}", path, e))?;
            Ok(format!("Written {} bytes to {}", content.len(), path))
        }

        "edit_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let old_str = args["old_str"].as_str().ok_or("missing old_str")?;
            let new_str = args["new_str"].as_str().ok_or("missing new_str")?;
            let resolved = resolve_path(path, workspace_path);
            check_path_allowed(&resolved, permissions)?;
            let current = std::fs::read_to_string(&resolved)
                .map_err(|e| format!("Cannot read '{}': {}", path, e))?;
            if !current.contains(old_str) {
                // Give the agent a snippet so it can see what the file actually contains
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
            std::fs::write(&resolved, &updated)
                .map_err(|e| format!("Cannot write '{}': {}", path, e))?;
            Ok(format!("Edited {} — replaced {} chars with {} chars", path, old_str.len(), new_str.len()))
        }

        "list_directory" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let resolved = resolve_path(path, workspace_path);
            let mut entries: Vec<String> = std::fs::read_dir(&resolved)
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
            let resolved = resolve_path(path, workspace_path);
            let pattern_lower = pattern.to_lowercase();
            let mut matches: Vec<String> = vec![];

            for entry in walkdir::WalkDir::new(&resolved)
                .max_depth(20)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
            {
                if matches.len() >= 100 { break; }
                let fname = entry.file_name().to_string_lossy().to_string();
                if !file_glob.is_empty() {
                    let glob = file_glob.trim();
                    let matches = if let Some(ext) = glob.strip_prefix("*.") {
                        // "*.ts" → must end with ".ts" (dot-inclusive to avoid false matches)
                        fname.ends_with(&format!(".{}", ext))
                    } else if glob.starts_with('*') {
                        // "*foo" → suffix match
                        fname.ends_with(&glob[1..])
                    } else {
                        // exact filename match (e.g. ".gitignore")
                        fname == glob
                    };
                    if !matches { continue; }
                }
                if entry.metadata().map(|m| m.len()).unwrap_or(0) > 1_000_000 { continue; }
                let content = match std::fs::read_to_string(entry.path()) {
                    Ok(c) => c, Err(_) => continue,
                };
                for (lineno, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(&pattern_lower) {
                        let rel = entry.path().strip_prefix(&resolved)
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
            let resolved = resolve_path(path, workspace_path);
            check_path_allowed(&resolved, permissions)?;
            std::fs::create_dir_all(&resolved)
                .map_err(|e| format!("Cannot create '{}': {}", path, e))?;
            Ok(format!("Created directory: {}", path))
        }

        "delete_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let resolved = resolve_path(path, workspace_path);
            check_path_allowed(&resolved, permissions)?;
            let confirmed = request_tool_confirmation(
                app, run_id, node_id, &tc.id, "delete_file",
                &format!("Delete file: {}", path), state,
            ).await?;
            if !confirmed { return Err("File deletion rejected by user".into()); }
            std::fs::remove_file(&resolved)
                .map_err(|e| format!("Cannot delete '{}': {}", path, e))?;
            Ok(format!("Deleted: {}", path))
        }

        "move_file" => {
            let src = args["src"].as_str().ok_or("missing src")?;
            let dst = args["dst"].as_str().ok_or("missing dst")?;
            let src_r = resolve_path(src, workspace_path);
            let dst_r = resolve_path(dst, workspace_path);
            check_path_allowed(&src_r, permissions)?;
            check_path_allowed(&dst_r, permissions)?;
            std::fs::rename(&src_r, &dst_r)
                .map_err(|e| format!("Cannot move '{}' to '{}': {}", src, dst, e))?;
            Ok(format!("Moved {} → {}", src, dst))
        }

        "run_shell_command" => {
            let command = args["command"].as_str().ok_or("missing command")?;
            let confirmed = request_tool_confirmation(
                app, run_id, node_id, &tc.id, "run_shell_command",
                &format!("Run command: {}", command), state,
            ).await?;
            if !confirmed { return Err("Shell command rejected by user".into()); }

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
    let use_tools = !tool_defs.is_empty();

    let mut system_prompt = data.system_prompt.clone();

    if use_tools {
        // Tool path: inject only the file tree (paths), not file contents — agents read on demand
        if let Some(ws_path) = workspace_path {
            // Tell the agent exactly where it lives on the hard drive
            system_prompt.push_str(&format!(
                "\n\n## Workspace Location\nYour absolute working directory is: `{}`\nYou can use this absolute path or relative paths (like '.') for your tools.",
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
    } else {
        // Legacy path: inject full workspace manifest (file contents)
        if let Some(ws_path) = workspace_path {
            if let Ok(files) = workspace_fs::read_manifest_internal(ws_path) {
                if !files.is_empty() {
                    let manifest = workspace_fs::build_workspace_manifest(&files);
                    user_msg = format!("{}\n\n{}", manifest, user_msg);
                }
            }
            system_prompt.push_str(workspace_fs::FILE_OUTPUT_INSTRUCTIONS);
        }
    }

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

    // ── Legacy single-shot streaming path (no tools) ──
    if !use_tools {
        let messages = vec![ApiMessage { role: "user".into(), content: user_msg.clone() }];
        match llm_call_streaming(&data.model, &system_prompt, &messages, &state.keys_file(), app, run_id, node_id, cancel).await {
            Ok((output, tokens)) => {
                let files_written = if let Some(ws_path) = workspace_path {
                    let blocks = workspace_fs::parse_file_blocks(&output);
                    if !blocks.is_empty() {
                        workspace_fs::write_files_internal(ws_path, blocks).unwrap_or_default()
                    } else { vec![] }
                } else { vec![] };

                step.completed_at = Some(now());
                step.status = "done".into();
                step.output = output.clone();
                step.tokens_used = tokens;
                step.files_written = files_written.clone();
                run.steps.push(step);
                let _ = save_json(&state.runs_dir().join(format!("{}.json", run_id)), run);
                let _ = app.emit(
                    &format!("conductor://run/{}/step_done", run_id),
                    serde_json::json!({
                        "nodeId": node_id, "output": output,
                        "tokensUsed": tokens, "filesWritten": files_written,
                    }),
                );
                ctx.chain.push((data.name.clone(), output.clone()));
                return Ok(output);
            }
            Err(e) => {
                step.completed_at = Some(now());
                step.status = "error".into();
                step.error = Some(e.clone());
                run.steps.push(step);
                let _ = save_json(&state.runs_dir().join(format!("{}.json", run_id)), run);
                let _ = app.emit(
                    &format!("conductor://run/{}/step_error", run_id),
                    serde_json::json!({ "nodeId": node_id, "error": e }),
                );
                return Err(e);
            }
        }
    }

    // ── Agentic tool loop ──
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

                    messages.push(build_assistant_tool_call_message(
                        &tool_calls, &provider, preceding_text.as_deref()
                    ));

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
                            &permissions, app, run_id, node_id, state,
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

                    let result_msgs = build_tool_result_messages(&tool_calls, &results, &provider);
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
            // If files were written, include their contents in the output so subsequent
            // agents (and the final result) have full access to the created work.
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
    workspace_mode: Option<String>,
    project_name: Option<String>,
    base_path: Option<String>,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let wf_path = state.workflows_dir().join(format!("{}.json", workflow_id));
    let workflow: Workflow = load_json(&wf_path)?;
    let run_id = Uuid::new_v4().to_string();

    let workspace_config = if let Some(ref mode) = workspace_mode {
        let ws_path = workspace_fs::create_run_workspace(
            run_id.clone(), mode.clone(), project_name.clone(), base_path.clone(),
        )?;
        Some(WorkspaceConfig { mode: mode.clone(), workspace_path: ws_path, project_name })
    } else { None };

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
async fn call_llm(
    model: ModelConfig,
    system: String,
    messages: Vec<ApiMessage>,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let (text, _) = llm_call(&model, &system, &messages, &state.keys_file()).await?;
    Ok(text)
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

// ─────────────────────────────────────────────
// Built-in templates
// ─────────────────────────────────────────────

fn built_in_templates() -> Vec<Template> {
    vec![
        Template { id: "software-planner".into(), name: "Software Planner".into(), category: "Software".into(), description: "Plans software architecture and requirements".into(), system_prompt: "## Role\nYou are a senior software architect.\n\n## Objective\nProduce a Software Design Document for the given task.\n\n## Output format\nMarkdown with: Executive Summary, Requirements, Architecture, Tech Stack, Open Questions.\n\n## Constraints\n- Specific and actionable\n- No actual code, only plans".into(), suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true },
        Template { id: "architecture-reviewer".into(), name: "Architecture Reviewer".into(), category: "Software".into(), description: "Reviews software architecture plans".into(), system_prompt: "## Role\nYou are a senior software architect reviewer.\n\n## Objective\nReview the SDD and provide structured feedback.\n\n## Output format\nEnd with \"APPROVED\" or \"NEEDS REVISION\" + numbered feedback.\n\n## Constraints\n- Only APPROVED when genuinely satisfied".into(), suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true },
        Template { id: "full-stack-developer".into(), name: "Full-Stack Developer".into(), category: "Software".into(), description: "Implements working application code".into(), system_prompt: "## Role\nYou are a senior full-stack developer.\n\n## Objective\nImplement production-quality code from the design document.\n\n## Output format\nComplete code files with imports.\n\n## Constraints\n- Complete runnable code — not pseudocode\n- Follow the SDD tech stack".into(), suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true },
        Template { id: "unit-test-writer".into(), name: "Unit Test Writer".into(), category: "Software".into(), description: "Reviews implementation and writes test findings".into(), system_prompt: "## Role\nYou are a QA engineer.\n\n## Objective\nReview the implementation against requirements.\n\n## Output format\nEnd with \"APPROVED\" or \"NEEDS REVISION\" + specific issues.\n\n## Constraints\n- Reference line numbers and functions\n- Only APPROVED when all requirements met".into(), suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true },
        Template { id: "code-reviewer".into(), name: "Code Reviewer".into(), category: "Software".into(), description: "Reviews code for quality and correctness".into(), system_prompt: "## Role\nYou are an experienced code reviewer.\n\n## Objective\nReview the code and give constructive feedback.\n\n## Output format\nWhat's Good · Improvements · Security · Final Verdict (APPROVED / NEEDS REVISION).\n\n## Constraints\n- Specific and actionable\n- Prioritize correctness over style".into(), suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true },
        Template { id: "documentation-writer".into(), name: "Documentation Writer".into(), category: "Software".into(), description: "Writes clear technical documentation".into(), system_prompt: "## Role\nYou are a technical writer.\n\n## Objective\nWrite clear documentation for the provided code.\n\n## Output format\nMarkdown: Overview, Installation, Usage, API Reference, Configuration.\n\n## Constraints\n- For developers new to the codebase\n- Include practical examples".into(), suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true },
        Template { id: "bug-analyzer".into(), name: "Bug Analyzer".into(), category: "Software".into(), description: "Analyzes and diagnoses software bugs".into(), system_prompt: "## Role\nYou are a debugging specialist.\n\n## Objective\nDiagnose the bug and propose a fix.\n\n## Output format\nRoot Cause · Affected Code · Proposed Fix (with code) · Prevention.\n\n## Constraints\n- Precise root cause\n- Working code fix".into(), suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true },
        Template { id: "product-manager".into(), name: "Product Manager".into(), category: "Software".into(), description: "Defines product requirements and user stories".into(), system_prompt: "## Role\nYou are an experienced product manager.\n\n## Objective\nTranslate the idea into clear product requirements.\n\n## Output format\nProblem Statement · Target Users · User Stories (Given/When/Then) · Acceptance Criteria · Out of Scope.\n\n## Constraints\n- Focus on user value\n- Atomic and testable stories".into(), suggested_model: Some("claude-sonnet-4-6".into()), is_built_in: true },
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
    use futures_util::StreamExt;

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
            for sub in &["workflows", "runs", "templates"] {
                let _ = std::fs::create_dir_all(data_dir.join(sub));
            }
            app.manage(Arc::new(AppState {
                data_dir,
                active_runs:   Mutex::new(HashMap::new()),
                chamber_runs:  Mutex::new(HashMap::new()),
                chamber_gates: Mutex::new(HashMap::new()),
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
            call_llm,
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
            workspace_fs::create_run_workspace,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
