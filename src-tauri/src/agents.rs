use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use crate::models::{
    AgentNodeData, GateResponse, LoopNodeData, LlmTurnResult, ReviewGateData, Run, RunStep,
    ToolPermissionConfig, WorkflowNode,
};
use crate::llm::{
    build_assistant_tool_call_message, build_simple_tool_results, build_tool_result_messages,
    format_args_preview, llm_call_with_tools, safe_truncate, TOOL_EDIT_INSTRUCTIONS,
};
use crate::storage::{now, save_json};
use crate::tools::{execute_tool, tool_definitions};
use crate::AppState;

pub(crate) struct ExecCtx {
    pub(crate) input: String,
    pub(crate) chain: Vec<(String, String)>,
}

impl ExecCtx {
    pub(crate) fn build_message(&self, context_mode: &str) -> String {
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

pub(crate) fn is_approved(review: &str) -> bool {
    let upper = review.to_uppercase();
    upper.contains("APPROVED") && !upper.contains("NOT APPROVED")
}

pub(crate) fn build_effective_output(text: &str, files_written: &[String], workspace_path: Option<&str>) -> String {
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

pub(crate) async fn exec_agent(
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

    if let Some(ws_path) = workspace_path {
        system_prompt.push_str(&format!(
            "\n\n## Workspace Location\nYour absolute working directory is: `{}`\nUse this absolute path or relative paths (like '.') with your tools.",
            ws_path
        ));
        if let Ok(files) = crate::workspace_fs::read_manifest_internal(ws_path) {
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

    let mut messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": user_msg })
    ];
    let mut total_tokens: Option<u32> = None;
    let mut files_written: Vec<String> = vec![];
    let permissions = ToolPermissionConfig::default();
    let provider = data.model.provider.clone();

    let mut accumulated_text = String::new();
    let mut read_only_streak = 0u32;
    const READ_LIMIT: u32 = 8;

    let tool_loop_result: Result<String, String> = 'tool_loop: {
        for _iteration in 0..20u32 {
            if cancel.load(Ordering::Relaxed) {
                break 'tool_loop Err("__cancelled__".into());
            }

            let (call_tools, call_messages) = if read_only_streak >= READ_LIMIT {
                let mut msgs = messages.clone();
                msgs.push(serde_json::json!({
                    "role": "user",
                    "content": "You have read enough. Stop reading and take action now: \
                    use write_file to save your deliverable to disk, then respond with a \
                    brief text summary of what you wrote. Do not keep reading — write the file."
                }));
                (true, msgs)
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

        if !accumulated_text.is_empty() {
            Ok(accumulated_text.clone())
        } else if !files_written.is_empty() {
            Ok(String::new())
        } else {
            Err("Agent did not produce any output".into())
        }
    };

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

pub(crate) async fn exec_loop(
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

pub(crate) async fn exec_review_gate(
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
