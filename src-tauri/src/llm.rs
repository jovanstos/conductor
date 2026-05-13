use std::path::PathBuf;

use crate::models::{LlmTurnResult, ModelConfig, ToolCall, ToolDef};
use crate::storage::load_keys;

pub(crate) const TOOL_EDIT_INSTRUCTIONS: &str = r#"

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

#[derive(serde::Deserialize)]
pub(crate) struct AnthropicError {
    pub(crate) error: AnthropicErrorDetail,
}

#[derive(serde::Deserialize)]
pub(crate) struct AnthropicErrorDetail {
    #[serde(rename = "type")]
    pub(crate) error_type: String,
    pub(crate) message: String,
}

pub(crate) fn effective_max_tokens(provider: &str, model_id: &str, requested: u32) -> u32 {
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

pub(crate) fn tools_to_anthropic(defs: &[ToolDef]) -> serde_json::Value {
    serde_json::json!(defs.iter().map(|d| serde_json::json!({
        "name": d.name,
        "description": d.description,
        "input_schema": d.parameters
    })).collect::<Vec<_>>())
}

pub(crate) fn tools_to_openai(defs: &[ToolDef]) -> serde_json::Value {
    serde_json::json!(defs.iter().map(|d| serde_json::json!({
        "type": "function",
        "function": { "name": d.name, "description": d.description, "parameters": d.parameters }
    })).collect::<Vec<_>>())
}

pub(crate) async fn call_anthropic_with_tools(
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
                return Ok(LlmTurnResult::Text { content: text, tokens_used: tokens });
            }
        }
    }
    Err("Retry loop exhausted".into())
}

pub(crate) async fn call_openai_compat_with_tools(
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
    Ok(LlmTurnResult::Text { content: text, tokens_used: tokens })
}

pub(crate) fn tools_to_simple_prompt(tools: &[ToolDef]) -> String {
    let tool_list = tools.iter().map(|t| {
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

pub(crate) fn parse_simple_tool_calls(text: &str) -> (String, Vec<ToolCall>) {
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
            let full_block_len = start + "<tool_call>".len() + end + "</tool_call>".len();
            remaining = format!("{}{}", &remaining[..start], &remaining[full_block_len..]);
        } else {
            break;
        }
    }

    let preceding = remaining.trim().to_string();
    (preceding, tool_calls)
}

pub(crate) fn build_simple_tool_results(tool_calls: &[ToolCall], results: &[(String, bool)]) -> Vec<serde_json::Value> {
    let parts: Vec<String> = tool_calls.iter().zip(results.iter())
        .map(|(tc, (content, is_error))| {
            let prefix = if *is_error { "ERROR" } else { "OK" };
            format!("[{}] {}: {}", prefix, tc.name, content)
        })
        .collect();
    vec![serde_json::json!({ "role": "user", "content": parts.join("\n\n") })]
}

pub(crate) async fn llm_call_with_tools(
    model: &ModelConfig,
    system: &str,
    messages: &[serde_json::Value],
    keys_file: &PathBuf,
    tools: &[ToolDef],
) -> Result<LlmTurnResult, String> {
    let max_tokens = effective_max_tokens(&model.provider, &model.model_id, model.max_tokens);

    if model.simple_tool_format && !tools.is_empty() {
        let augmented_system = format!("{}{}", system, tools_to_simple_prompt(tools));
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

    let timeout_secs: u64 = match model.provider.as_str() {
        "ollama" | "custom" => 1800,
        _ => 300,
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

pub(crate) async fn llm_call_text(
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

pub(crate) fn build_assistant_tool_call_message(
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

pub(crate) fn build_tool_result_messages(
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

pub(crate) fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes { return s; }
    let mut idx = max_bytes;
    while idx > 0 && !s.is_char_boundary(idx) { idx -= 1; }
    &s[..idx]
}

pub(crate) fn format_args_preview(args: &serde_json::Value) -> String {
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
