use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, State};

use crate::models::{ApiMessage, ModelConfig};
use crate::storage::load_keys;
use crate::AppState;

pub(crate) const STUDIO_SYSTEM_PROMPT: &str = r#"You are Studio — a brilliant strategist, creative partner, and expert planner embedded in Conductor AI. Think of yourself as the smartest person in the room who genuinely wants to help the user build something great.

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
pub(crate) async fn studio_chat_turn(
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

pub(crate) async fn studio_provider_stream(
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

pub(crate) async fn studio_anthropic_stream(
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

pub(crate) async fn studio_openai_compat_stream(
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
