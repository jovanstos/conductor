// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
// Domain types (mirror of TypeScript SSD types)
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
struct Run {
    id: String,
    workflow_id: String,
    started_at: String,
    completed_at: Option<String>,
    status: String,
    input: String,
    steps: Vec<RunStep>,
    final_output: Option<String>,
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
}

struct RunHandle {
    cancel_flag: Arc<AtomicBool>,
    gate_senders: Mutex<HashMap<String, oneshot::Sender<GateResponse>>>,
}

#[derive(Debug)]
enum GateResponse {
    Approve,
    Reject { feedback: String },
    Edit { content: String },
}

impl AppState {
    fn workflows_dir(&self) -> PathBuf {
        self.data_dir.join("workflows")
    }
    fn runs_dir(&self) -> PathBuf {
        self.data_dir.join("runs")
    }
    fn templates_dir(&self) -> PathBuf {
        self.data_dir.join("templates")
    }
    fn keys_file(&self) -> PathBuf {
        self.data_dir.join("keys.json")
    }
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

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

// ─────────────────────────────────────────────
// API key storage (JSON file)
// ─────────────────────────────────────────────

type KeysMap = HashMap<String, String>;

fn load_keys(path: &PathBuf) -> KeysMap {
    if !path.exists() {
        return HashMap::new();
    }
    load_json(path).unwrap_or_default()
}

fn save_keys(path: &PathBuf, keys: &KeysMap) -> Result<(), String> {
    save_json(path, keys)
}

// ─────────────────────────────────────────────
// LLM call implementations
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
                if attempt == 3 {
                    return Err(format!("Request failed: {}", e));
                }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
            Ok(r) => {
                let status = r.status();
                let raw = r.text().await.map_err(|e| format!("Read response: {}", e))?;

                if status.as_u16() == 503 || status.as_u16() == 529 {
                    if attempt == 3 {
                        return Err(format!("API unavailable ({})", status));
                    }
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

                let text = parsed
                    .content
                    .into_iter()
                    .next()
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

    let parsed: OpenAIResponse =
        serde_json::from_str(&raw).map_err(|e| format!("Parse: {}", e))?;

    let text = parsed
        .choices
        .into_iter()
        .next()
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

    let parsed: OpenAIResponse =
        serde_json::from_str(&raw).map_err(|e| format!("Parse: {}", e))?;
    let text = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| "Empty response".to_string())?;
    Ok((text, None))
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
            let key = model
                .api_key_ref
                .as_deref()
                .and_then(|r| load_keys(keys_file).remove(r))
                .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
                .ok_or_else(|| "No Anthropic API key configured".to_string())?;
            call_anthropic(&model.model_id, &key, system, messages, max_tokens, model.temperature).await
        }
        "openai" => {
            let key = model
                .api_key_ref
                .as_deref()
                .and_then(|r| load_keys(keys_file).remove(r))
                .or_else(|| std::env::var("OPENAI_API_KEY").ok())
                .ok_or_else(|| "No OpenAI API key configured".to_string())?;
            call_openai(&model.model_id, &key, system, messages, max_tokens, model.temperature).await
        }
        "ollama" => {
            let base = model.base_url.as_deref().unwrap_or("http://localhost:11434");
            call_ollama(&model.model_id, base, system, messages, max_tokens, model.temperature).await
        }
        p => Err(format!("Unsupported provider: {}", p)),
    }
}

// Per-model max_tokens caps (avoids API 400 errors when user sets "unlimited")
fn effective_max_tokens(provider: &str, model_id: &str, requested: u32) -> u32 {
    let cap: u32 = match provider {
        "anthropic" => {
            if model_id.contains("opus") { 32_000 }
            else if model_id.contains("sonnet") { 64_000 }
            else if model_id.contains("haiku") { 16_000 }
            else { 8_192 }
        }
        "openai" => {
            if model_id.contains("gpt-4o") { 16_384 }
            else { 4_096 }
        }
        _ => {
            // Ollama and custom: only cap absurd sentinel values
            if requested == 0 || requested >= 100_000 { 32_768 } else { return requested; }
        }
    };
    if requested == 0 || requested >= 100_000 { cap } else { requested.min(cap) }
}

// ─────────────────────────────────────────────
// Streaming LLM calls (token-by-token via SSE)
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
        "model": model_id,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
        "stream": true
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
        if cancel.load(Ordering::Relaxed) {
            return Err("__cancelled__".into());
        }
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

    if full_output.is_empty() {
        return Err("Empty response from Anthropic".into());
    }
    Ok((full_output, output_tokens))
}

// Used for both OpenAI and Ollama (same SSE format)
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
        "model": model_id,
        "messages": all,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": true
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
        if cancel.load(Ordering::Relaxed) {
            return Err("__cancelled__".into());
        }
        let bytes = chunk.map_err(|e| format!("Stream error: {}", e))?;
        line_buf.push_str(&String::from_utf8_lossy(&bytes));

        loop {
            match line_buf.find('\n') {
                None => break,
                Some(pos) => {
                    let line = line_buf[..pos].trim_end_matches('\r').to_string();
                    line_buf = line_buf[pos + 1..].to_string();

                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed == "data: [DONE]" {
                        continue;
                    }

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

    if full_output.is_empty() {
        return Err("Empty response from model".into());
    }
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
        p => Err(format!("Unsupported provider: {}", p)),
    }
}

// ─────────────────────────────────────────────
// Workflow executor
// ─────────────────────────────────────────────

struct ExecCtx {
    input: String,
    chain: Vec<(String, String)>, // (node_name, output)
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
) -> Result<String, String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("__cancelled__".into());
    }

    let _ = app.emit(
        &format!("conductor://run/{}/step_started", run_id),
        serde_json::json!({ "nodeId": node_id, "nodeName": data.name, "attempt": attempt }),
    );

    let mut user_msg = ctx.build_message(&data.context_mode);
    if let Some(extra) = extra_context {
        user_msg.push_str(&format!("\n\n{}", extra));
    }

    let messages = vec![ApiMessage { role: "user".into(), content: user_msg.clone() }];

    let mut step = RunStep {
        node_id: node_id.into(),
        node_name: data.name.clone(),
        attempt,
        started_at: now(),
        completed_at: None,
        status: "running".into(),
        input: user_msg,
        output: String::new(),
        tokens_used: None,
        error: None,
    };

    match llm_call_streaming(&data.model, &data.system_prompt, &messages, &state.keys_file(), app, run_id, node_id, cancel).await {
        Ok((output, tokens)) => {
            step.completed_at = Some(now());
            step.status = "done".into();
            step.output = output.clone();
            step.tokens_used = tokens;
            run.steps.push(step);
            let _ = save_json(&state.runs_dir().join(format!("{}.json", run_id)), run);

            let _ = app.emit(
                &format!("conductor://run/{}/step_done", run_id),
                serde_json::json!({ "nodeId": node_id, "output": output, "tokensUsed": tokens }),
            );

            ctx.chain.push((data.name.clone(), output.clone()));
            Ok(output)
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
            Err(e)
        }
    }
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
) -> Result<String, String> {
    let target = node_map
        .get(&data.target_node_id)
        .ok_or_else(|| format!("Loop target '{}' not found", data.target_node_id))?;
    let reviewer = node_map
        .get(&data.reviewer_node_id)
        .ok_or_else(|| format!("Loop reviewer '{}' not found", data.reviewer_node_id))?;

    let target_data: AgentNodeData = serde_json::from_value(target.data.clone())
        .map_err(|e| format!("Loop target data: {}", e))?;
    let reviewer_data: AgentNodeData = serde_json::from_value(reviewer.data.clone())
        .map_err(|e| format!("Loop reviewer data: {}", e))?;

    let mut last_output = String::new();
    let mut extra_ctx: Option<String> = None;

    for attempt in 1..=data.max_retries {
        if cancel.load(Ordering::Relaxed) {
            return Err("__cancelled__".into());
        }

        // Run target (inject feedback from previous iteration if any)
        let extra = extra_ctx.as_deref();
        last_output = exec_agent(
            &target_data,
            &target.id,
            attempt,
            ctx,
            run_id,
            run,
            state,
            app,
            cancel,
            extra,
        )
        .await?;

        // Run reviewer
        let review = exec_agent(
            &reviewer_data,
            &reviewer.id,
            attempt,
            ctx,
            run_id,
            run,
            state,
            app,
            cancel,
            None,
        )
        .await?;

        // Check for early exit on reviewer approval
        let approved = review.to_uppercase().contains("APPROVED");
        if approved && data.exit_condition == "reviewer_approves" {
            break;
        }

        // Prepare feedback for next iteration
        extra_ctx = Some(format!("Feedback from {}:\n{}", reviewer_data.name, review));
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
        serde_json::json!({
            "nodeId": node_id,
            "output": last_output,
            "message": data.message,
        }),
    );

    // Create channel and wait for frontend to resume
    let (tx, rx) = oneshot::channel::<GateResponse>();
    {
        let runs = state.active_runs.lock().unwrap();
        if let Some(handle) = runs.get(run_id) {
            let mut senders = handle.gate_senders.lock().unwrap();
            senders.insert(node_id.to_string(), tx);
        }
    }

    match rx.await {
        Ok(GateResponse::Approve) => {
            run.status = "running".into();
            Ok(last_output)
        }
        Ok(GateResponse::Reject { feedback }) => {
            run.status = "running".into();
            // Treat rejection as an error to bubble up — caller decides what to do
            Err(format!("__gate_rejected__:{}", feedback))
        }
        Ok(GateResponse::Edit { content }) => {
            run.status = "running".into();
            Ok(content)
        }
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
                if *deg == 0 {
                    queue.push_back(nb);
                }
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
) {
    let cancel = {
        let runs = state.active_runs.lock().unwrap();
        runs.get(&run_id)
            .map(|h| h.cancel_flag.clone())
            .unwrap_or_else(|| Arc::new(AtomicBool::new(false)))
    };

    // Give the frontend ~200ms to register all event listeners before emitting the first step
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

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
        },
    };

    let node_map: HashMap<String, WorkflowNode> =
        workflow.nodes.iter().map(|n| (n.id.clone(), n.clone())).collect();
    let order = topological_order(&workflow.nodes, &workflow.edges);
    let inner = inner_node_ids(&workflow.nodes);

    let mut ctx = ExecCtx { input, chain: vec![] };
    let mut final_output = String::new();

    for node_id in &order {
        if inner.contains(node_id) {
            continue; // Handled by loop nodes
        }

        if cancel.load(Ordering::Relaxed) {
            run.status = "cancelled".into();
            run.completed_at = Some(now());
            let _ = save_json(&state.runs_dir().join(format!("{}.json", &run_id)), &run);
            let _ = app.emit(&format!("conductor://run/{}/cancelled", &run_id), serde_json::json!({}));
            cleanup(&state, &run_id);
            return;
        }

        let node = match node_map.get(node_id) {
            Some(n) => n.clone(),
            None => continue,
        };

        let result = match node.node_type.as_str() {
            "agent" => {
                match serde_json::from_value::<AgentNodeData>(node.data.clone()) {
                    Ok(data) => {
                        exec_agent(&data, &node.id, 1, &mut ctx, &run_id, &mut run, &state, &app, &cancel, None).await
                    }
                    Err(e) => Err(format!("Agent data: {}", e)),
                }
            }
            "loop" => {
                match serde_json::from_value::<LoopNodeData>(node.data.clone()) {
                    Ok(data) => {
                        exec_loop(&data, &node_map, &mut ctx, &run_id, &mut run, &state, &app, &cancel).await
                    }
                    Err(e) => Err(format!("Loop data: {}", e)),
                }
            }
            "review_gate" => {
                match serde_json::from_value::<ReviewGateData>(node.data.clone()) {
                    Ok(data) => {
                        exec_review_gate(&data, &node.id, &ctx, &run_id, &mut run, &state, &app).await
                    }
                    Err(e) => Err(format!("Gate data: {}", e)),
                }
            }
            t => Err(format!("Unknown node type: {}", t)),
        };

        match result {
            Ok(output) => {
                final_output = output;
            }
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
    let mut runs = state.active_runs.lock().unwrap();
    runs.remove(run_id);
}

// ─────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────

#[tauri::command]
fn get_workflows(state: State<'_, Arc<AppState>>) -> Vec<Workflow> {
    let dir = state.workflows_dir();
    if !dir.exists() {
        return vec![];
    }
    std::fs::read_dir(&dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| {
            let path = e.ok()?.path();
            if path.extension()?.to_str()? == "json" {
                load_json::<Workflow>(&path).ok()
            } else {
                None
            }
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
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Delete: {}", e))
    } else {
        Ok(())
    }
}

#[tauri::command]
async fn start_run(
    workflow_id: String,
    input: String,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let wf_path = state.workflows_dir().join(format!("{}.json", workflow_id));
    let workflow: Workflow = load_json(&wf_path)?;

    let run_id = Uuid::new_v4().to_string();
    let run = Run {
        id: run_id.clone(),
        workflow_id,
        started_at: now(),
        completed_at: None,
        status: "running".into(),
        input: input.clone(),
        steps: vec![],
        final_output: None,
    };

    std::fs::create_dir_all(state.runs_dir()).map_err(|e| format!("Mkdir runs: {}", e))?;
    save_json(&state.runs_dir().join(format!("{}.json", run_id)), &run)?;

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut runs = state.active_runs.lock().unwrap();
        runs.insert(
            run_id.clone(),
            RunHandle {
                cancel_flag: cancel_flag.clone(),
                gate_senders: Mutex::new(HashMap::new()),
            },
        );
    }

    let state_arc = Arc::clone(&*state);
    let run_id_clone = run_id.clone();
    tokio::spawn(async move {
        execute_workflow(workflow, input, run_id_clone, state_arc, app).await;
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
    if !dir.exists() {
        return vec![];
    }
    let mut runs: Vec<Run> = std::fs::read_dir(&dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| {
            let path = e.ok()?.path();
            if path.extension()?.to_str()? == "json" {
                let r: Run = load_json(&path).ok()?;
                if r.workflow_id == workflow_id { Some(r) } else { None }
            } else {
                None
            }
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
    let tx = senders
        .remove(&node_id)
        .ok_or_else(|| format!("No gate waiting at node: {}", node_id))?;

    let response = match action.as_str() {
        "approve" => GateResponse::Approve,
        "reject" => GateResponse::Reject { feedback: content.unwrap_or_default() },
        "edit" => GateResponse::Edit { content: content.unwrap_or_default() },
        _ => return Err(format!("Unknown gate action: {}", action)),
    };

    tx.send(response).map_err(|_| "Send gate response failed".to_string())
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
        let user: Vec<Template> = std::fs::read_dir(&dir)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(|e| {
                let path = e.ok()?.path();
                if path.extension()?.to_str()? == "json" {
                    load_json(&path).ok()
                } else {
                    None
                }
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
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Delete: {}", e))
    } else {
        Ok(())
    }
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Read '{}': {}", path, e))
}

#[tauri::command]
async fn get_ollama_models(base_url: Option<String>) -> Vec<String> {
    let base = base_url.as_deref().unwrap_or("http://localhost:11434");
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build() {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let Ok(resp) = client
        .get(&format!("{}/api/tags", base.trim_end_matches('/')))
        .send()
        .await else { return vec![]; };
    let Ok(data) = resp.json::<serde_json::Value>().await else { return vec![]; };
    data["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

// ─────────────────────────────────────────────
// Built-in templates
// ─────────────────────────────────────────────

fn built_in_templates() -> Vec<Template> {
    vec![
        Template {
            id: "software-planner".into(),
            name: "Software Planner".into(),
            category: "Software".into(),
            description: "Plans software architecture and requirements".into(),
            system_prompt: "## Role\nYou are a senior software architect.\n\n## Objective\nProduce a Software Design Document for the given task.\n\n## Output format\nMarkdown with: Executive Summary, Requirements, Architecture, Tech Stack, Open Questions.\n\n## Constraints\n- Specific and actionable\n- No actual code, only plans".into(),
            suggested_model: Some("claude-sonnet-4-6".into()),
            is_built_in: true,
        },
        Template {
            id: "architecture-reviewer".into(),
            name: "Architecture Reviewer".into(),
            category: "Software".into(),
            description: "Reviews software architecture plans".into(),
            system_prompt: "## Role\nYou are a senior software architect reviewer.\n\n## Objective\nReview the SDD and provide structured feedback.\n\n## Output format\nEnd with \"APPROVED\" or \"NEEDS REVISION\" + numbered feedback.\n\n## Constraints\n- Only APPROVED when genuinely satisfied".into(),
            suggested_model: Some("claude-sonnet-4-6".into()),
            is_built_in: true,
        },
        Template {
            id: "full-stack-developer".into(),
            name: "Full-Stack Developer".into(),
            category: "Software".into(),
            description: "Implements working application code".into(),
            system_prompt: "## Role\nYou are a senior full-stack developer.\n\n## Objective\nImplement production-quality code from the design document.\n\n## Output format\nComplete code files with imports.\n\n## Constraints\n- Complete runnable code — not pseudocode\n- Follow the SDD tech stack".into(),
            suggested_model: Some("claude-sonnet-4-6".into()),
            is_built_in: true,
        },
        Template {
            id: "unit-test-writer".into(),
            name: "Unit Test Writer".into(),
            category: "Software".into(),
            description: "Reviews implementation and writes test findings".into(),
            system_prompt: "## Role\nYou are a QA engineer.\n\n## Objective\nReview the implementation against requirements.\n\n## Output format\nEnd with \"APPROVED\" or \"NEEDS REVISION\" + specific issues.\n\n## Constraints\n- Reference line numbers and functions\n- Only APPROVED when all requirements met".into(),
            suggested_model: Some("claude-sonnet-4-6".into()),
            is_built_in: true,
        },
        Template {
            id: "code-reviewer".into(),
            name: "Code Reviewer".into(),
            category: "Software".into(),
            description: "Reviews code for quality and correctness".into(),
            system_prompt: "## Role\nYou are an experienced code reviewer.\n\n## Objective\nReview the code and give constructive feedback.\n\n## Output format\nWhat's Good · Improvements · Security · Final Verdict (APPROVED / NEEDS REVISION).\n\n## Constraints\n- Specific and actionable\n- Prioritize correctness over style".into(),
            suggested_model: Some("claude-sonnet-4-6".into()),
            is_built_in: true,
        },
        Template {
            id: "documentation-writer".into(),
            name: "Documentation Writer".into(),
            category: "Software".into(),
            description: "Writes clear technical documentation".into(),
            system_prompt: "## Role\nYou are a technical writer.\n\n## Objective\nWrite clear documentation for the provided code.\n\n## Output format\nMarkdown: Overview, Installation, Usage, API Reference, Configuration.\n\n## Constraints\n- For developers new to the codebase\n- Include practical examples".into(),
            suggested_model: Some("claude-sonnet-4-6".into()),
            is_built_in: true,
        },
        Template {
            id: "bug-analyzer".into(),
            name: "Bug Analyzer".into(),
            category: "Software".into(),
            description: "Analyzes and diagnoses software bugs".into(),
            system_prompt: "## Role\nYou are a debugging specialist.\n\n## Objective\nDiagnose the bug and propose a fix.\n\n## Output format\nRoot Cause · Affected Code · Proposed Fix (with code) · Prevention.\n\n## Constraints\n- Precise root cause\n- Working code fix".into(),
            suggested_model: Some("claude-sonnet-4-6".into()),
            is_built_in: true,
        },
        Template {
            id: "product-manager".into(),
            name: "Product Manager".into(),
            category: "Software".into(),
            description: "Defines product requirements and user stories".into(),
            system_prompt: "## Role\nYou are an experienced product manager.\n\n## Objective\nTranslate the idea into clear product requirements.\n\n## Output format\nProblem Statement · Target Users · User Stories (Given/When/Then) · Acceptance Criteria · Out of Scope.\n\n## Constraints\n- Focus on user value\n- Atomic and testable stories".into(),
            suggested_model: Some("claude-sonnet-4-6".into()),
            is_built_in: true,
        },
    ]
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────

fn main() {
    #[cfg(debug_assertions)]
    {
        dotenvy::dotenv().ok();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

            for sub in &["workflows", "runs", "templates"] {
                let _ = std::fs::create_dir_all(data_dir.join(sub));
            }

            app.manage(Arc::new(AppState {
                data_dir,
                active_runs: Mutex::new(HashMap::new()),
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
            call_llm,
            save_api_key,
            delete_api_key,
            has_api_key,
            get_templates,
            save_template,
            delete_template,
            read_text_file,
            get_ollama_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
