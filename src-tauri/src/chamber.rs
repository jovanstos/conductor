use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::models::{ApiMessage, ChamberAgentConfig, ChamberRunConfig};
use crate::storage::load_keys;
use crate::AppState;

pub(crate) struct ChamberRunHandle {
    pub(crate) cancel: Arc<AtomicBool>,
}

pub(crate) struct ChamberGateResult {
    pub(crate) action: String,
}

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
    model: &crate::models::ModelConfig,
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

    if model.provider == "anthropic" {
        let key = api_key.ok_or("No Anthropic API key")?;
        chamber_anthropic_stream(&url, &key, &model.model_id, system, messages, model.max_tokens, model.temperature, app, run_id, agent_id, cancel).await
    } else {
        chamber_openai_compat_stream(&url, api_key.as_deref(), &model.model_id, system, messages, model.max_tokens, model.temperature, app, run_id, agent_id, cancel).await
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

fn parse_score_json(response: &str) -> HashMap<char, f64> {
    let cleaned = response
        .replace("```json", "")
        .replace("```", "")
        .trim()
        .to_string();

    let (start, end) = match (cleaned.find('{'), cleaned.rfind('}')) {
        (Some(s), Some(e)) if s < e => (s, e),
        _ => return HashMap::new(),
    };
    let json_str = &cleaned[start..=end];

    match serde_json::from_str::<serde_json::Value>(json_str) {
        Ok(serde_json::Value::Object(map)) => map
            .iter()
            .filter_map(|(k, v)| {
                let label = k.trim().to_uppercase().chars().next()?;
                if !label.is_ascii_alphabetic() { return None; }
                let score: f64 = match v {
                    serde_json::Value::Number(n) => n.as_f64()?,
                    serde_json::Value::String(s) => {
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

async fn exec_chamber_audition(
    run_id: &str,
    config: &ChamberRunConfig,
    state: &Arc<AppState>,
    app: &AppHandle,
    cancel: &Arc<AtomicBool>,
) -> Result<serde_json::Value, String> {
    let keys_file = state.keys_file();

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
    let mut outputs: Vec<(String, String, String)> = Vec::new();
    for jr in join_results {
        match jr {
            Ok((id, name, Ok(out)))  => outputs.push((id, name, out)),
            Ok((_id, name, Err(e)))  => return Err(format!("Agent '{}' failed: {}", name, e)),
            Err(e)                   => return Err(format!("Task error: {}", e)),
        }
    }

    if cancel.load(Ordering::Relaxed) { return Err("Cancelled".into()); }

    if config.review_gate_enabled {
        emit_chamber_phase(app, run_id, "review_gate", "Paused for human review");
        let gate_outputs: Vec<serde_json::Value> = outputs.iter()
            .map(|(id, name, out)| serde_json::json!({ "agentId": id, "agentName": name, "output": out }))
            .collect();
        let _ = app.emit(
            &format!("conductor://chamber/{}/gate_paused", run_id),
            serde_json::json!({ "message": "Review agent outputs before scoring begins.", "phase": "generation", "outputs": gate_outputs }),
        );
        let (tx, rx) = oneshot::channel::<ChamberGateResult>();
        { state.chamber_gates.lock().unwrap().insert(run_id.to_string(), tx); }
        match rx.await {
            Ok(r) if r.action == "cancel" => return Err("Cancelled by user".into()),
            _ => {}
        }
    }

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

            for (label, score) in parse_score_json(&score_resp) {
                let idx = label as u8 - b'A';
                if let Some((agent_id, _, _)) = outputs.get(idx as usize) {
                    *score_totals.entry(agent_id.clone()).or_insert(0.0) += score;
                    *score_counts.entry(agent_id.clone()).or_insert(0)   += 1;
                }
            }
        }

        let avg_scores: HashMap<String, f64> = score_totals.iter()
            .map(|(id, total)| {
                let count = score_counts.get(id).copied().unwrap_or(1).max(1) as f64;
                let avg   = (total / count * 10.0).round() / 10.0;
                (id.clone(), avg)
            })
            .collect();

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

#[tauri::command]
pub(crate) async fn start_chamber_run(
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
pub(crate) async fn cancel_chamber_run(run_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut runs = state.chamber_runs.lock().unwrap();
    if let Some(h) = runs.remove(&run_id) {
        h.cancel.store(true, Ordering::Relaxed);
    }
    let mut gates = state.chamber_gates.lock().unwrap();
    if let Some(tx) = gates.remove(&run_id) {
        let _ = tx.send(ChamberGateResult { action: "cancel".to_string() });
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn resume_chamber_run(
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
