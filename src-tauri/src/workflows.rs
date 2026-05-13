use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::agents::{exec_agent, exec_loop, exec_review_gate, ExecCtx};
use crate::llm::AnthropicError;
use crate::models::{
    AgentNodeData, AppConfig, GateResponse, LoopNodeData, OllamaModelInfo,
    ReviewGateData, Run, Template, Workflow, WorkflowNode, WorkspaceConfig,
};
use crate::storage::{load_json, load_keys, now, save_json};
use crate::templates::built_in_templates;
use crate::AppState;
use crate::RunHandle;

fn cleanup(state: &AppState, run_id: &str) {
    state.active_runs.lock().unwrap().remove(run_id);
}

pub(crate) fn topological_order(nodes: &[WorkflowNode], edges: &[crate::models::WorkflowEdge]) -> Vec<String> {
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

pub(crate) fn inner_node_ids(nodes: &[WorkflowNode]) -> std::collections::HashSet<String> {
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

pub(crate) async fn execute_workflow(
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

// ── Tauri commands ──

#[tauri::command]
pub(crate) fn get_workflows(state: State<'_, Arc<AppState>>) -> Vec<Workflow> {
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
pub(crate) fn save_workflow(workflow: Workflow, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    save_json(&state.workflows_dir().join(format!("{}.json", workflow.id)), &workflow)
}

#[tauri::command]
pub(crate) fn delete_workflow(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let path = state.workflows_dir().join(format!("{}.json", id));
    if path.exists() { std::fs::remove_file(&path).map_err(|e| format!("Delete: {}", e)) } else { Ok(()) }
}

#[tauri::command]
pub(crate) async fn start_run(
    workflow_id: String,
    input: String,
    workspace_path: Option<String>,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let wf_path = state.workflows_dir().join(format!("{}.json", workflow_id));
    let workflow: Workflow = load_json(&wf_path)?;

    let resolved_ws = workspace_path
        .or_else(|| workflow.settings.workspace_path.clone())
        .filter(|p| !p.is_empty());

    if resolved_ws.is_none() {
        return Err("WORKSPACE_REQUIRED".to_string());
    }
    let ws_path = resolved_ws.unwrap();

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
pub(crate) fn cancel_run(run_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let runs = state.active_runs.lock().unwrap();
    if let Some(handle) = runs.get(&run_id) {
        handle.cancel_flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn get_run(run_id: String, state: State<'_, Arc<AppState>>) -> Option<Run> {
    load_json(&state.runs_dir().join(format!("{}.json", run_id))).ok()
}

#[tauri::command]
pub(crate) fn get_runs_for_workflow(workflow_id: String, state: State<'_, Arc<AppState>>) -> Vec<Run> {
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
pub(crate) fn resume_gate(
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
pub(crate) fn respond_tool_confirmation(
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
pub(crate) fn save_api_key(provider: String, key: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let path = state.keys_file();
    let mut keys = load_keys(&path);
    keys.insert(provider, key);
    crate::storage::save_keys(&path, &keys)
}

#[tauri::command]
pub(crate) fn delete_api_key(provider: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let path = state.keys_file();
    let mut keys = load_keys(&path);
    keys.remove(&provider);
    crate::storage::save_keys(&path, &keys)
}

#[tauri::command]
pub(crate) fn has_api_key(provider: String, state: State<'_, Arc<AppState>>) -> bool {
    load_keys(&state.keys_file()).contains_key(&provider)
}

#[tauri::command]
pub(crate) fn get_templates(state: State<'_, Arc<AppState>>) -> Vec<Template> {
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
pub(crate) fn save_template(template: Template, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    save_json(&state.templates_dir().join(format!("{}.json", template.id)), &template)
}

#[tauri::command]
pub(crate) fn delete_template(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if built_in_templates().iter().any(|t| t.id == id) {
        return Err("Cannot delete built-in templates".into());
    }
    let path = state.templates_dir().join(format!("{}.json", id));
    if path.exists() { std::fs::remove_file(&path).map_err(|e| format!("Delete: {}", e)) } else { Ok(()) }
}

#[tauri::command]
pub(crate) fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Read '{}': {}", path, e))
}

#[tauri::command]
pub(crate) fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
    }
    std::fs::write(&path, content).map_err(|e| format!("write: {}", e))
}

#[tauri::command]
pub(crate) async fn get_ollama_models(base_url: Option<String>) -> Vec<String> {
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

#[tauri::command]
pub(crate) async fn get_ollama_model_info(model_id: String, base_url: Option<String>) -> OllamaModelInfo {
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

#[tauri::command]
pub(crate) async fn validate_custom_host(host_id: String, base_url: String, state: State<'_, Arc<AppState>>) -> Result<String, String> {
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
pub(crate) async fn validate_api_key(provider: String, state: State<'_, Arc<AppState>>) -> Result<String, String> {
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
pub(crate) fn import_workflow(json: String, state: State<'_, Arc<AppState>>) -> Result<Workflow, String> {
    let mut wf: Workflow = serde_json::from_str(&json).map_err(|e| format!("Invalid workflow JSON: {}", e))?;
    wf.id = Uuid::new_v4().to_string();
    wf.name = format!("{} (imported)", wf.name);
    wf.created_at = now();
    wf.updated_at = now();
    save_json(&state.workflows_dir().join(format!("{}.json", wf.id)), &wf)?;
    Ok(wf)
}

#[tauri::command]
pub(crate) fn load_config(state: State<'_, Arc<AppState>>) -> Result<AppConfig, String> {
    let path = state.data_dir.join("config.json");
    if !path.exists() { return Ok(AppConfig::default()); }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn save_config(config: AppConfig, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let path = state.data_dir.join("config.json");
    let raw = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}
