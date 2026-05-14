use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::agents::{exec_agent, ExecCtx};
use crate::llm::{
    build_assistant_tool_call_message, build_simple_tool_results, build_tool_result_messages,
    effective_max_tokens, llm_call_with_tools, safe_truncate,
};
use crate::models::LlmTurnResult;
use crate::models::{
    AgentNodeData, ApiMessage, Mission, MissionChatMessage, MissionEscalation, MissionGoal,
    MissionSubAgent, Run, ToolDef, ToolPermissionConfig, WorkspaceConfig, WorkLogEntry,
};
use crate::storage::{load_json, now, save_json};
use crate::studio::{studio_anthropic_stream, studio_openai_compat_stream};
use crate::templates::built_in_templates;
use crate::tools::execute_tool;
use crate::AppState;
use crate::RunHandle;

pub(crate) struct MissionHandle {
    pub(crate) cancel: Arc<AtomicBool>,
}

pub(crate) fn missions_dir(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("missions")
}

pub(crate) fn load_mission(data_dir: &PathBuf, id: &str) -> Result<Mission, String> {
    load_json(&missions_dir(data_dir).join(format!("{}.json", id)))
}

pub(crate) fn save_mission_to_disk(data_dir: &PathBuf, mission: &Mission) -> Result<(), String> {
    save_json(&missions_dir(data_dir).join(format!("{}.json", mission.id)), mission)
}

pub(crate) fn append_log(mission: &mut Mission, entry_type: &str, content: &str, agent_name: Option<&str>, template_id: Option<&str>, goal_id: Option<&str>) -> WorkLogEntry {
    append_log_with_tokens(mission, entry_type, content, agent_name, template_id, goal_id, None)
}

pub(crate) fn append_log_with_tokens(mission: &mut Mission, entry_type: &str, content: &str, agent_name: Option<&str>, template_id: Option<&str>, goal_id: Option<&str>, tokens_used: Option<u32>) -> WorkLogEntry {
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

pub(crate) fn manager_tool_definitions() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "dispatch_agent".into(),
            description: "Dispatch a specialist agent to complete a specific task in the shared workspace. The agent will have full file system access and return its output when done. You can dispatch multiple agents in sequence.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "template_id": { "type": "string", "description": "The agent template ID to use (e.g. 'software-planner', 'full-stack-developer')" },
                    "task": { "type": "string", "description": "The specific task for this agent to complete. Be precise and actionable." },
                    "context": { "type": "string", "description": "Additional context, background, or constraints the agent should know" }
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
                    "message": { "type": "string", "description": "Your question, request, or update for the human. Be specific about what you need." },
                    "context": { "type": "string", "description": "Relevant context to help the human understand the situation" }
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
                    "goal_id": { "type": "string", "description": "The ID of the goal to mark complete" },
                    "summary": { "type": "string", "description": "Brief summary of how the goal was achieved and what was produced" }
                },
                "required": ["goal_id", "summary"]
            }),
        },
        ToolDef {
            name: "add_note".into(),
            description: "Add an observation, decision rationale, or important context note to your work log. Use this to record things you'll need to remember in future cycles.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "note": { "type": "string", "description": "The observation or note to record" } },
                "required": ["note"]
            }),
        },
        ToolDef {
            name: "create_goal".into(),
            description: "Create a new goal for this mission. Use when you identify something that needs to be accomplished that isn't already a goal. Only available when the human has enabled Manager goal creation.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "goal_text": { "type": "string", "description": "The goal to add — be specific and measurable" },
                    "priority": { "type": "string", "enum": ["high", "normal", "low"], "description": "Priority level for this goal" },
                    "rationale": { "type": "string", "description": "Why this goal is needed to fulfill the mission" }
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
                    "question": { "type": "string", "description": "The question to ask the human. Be specific and clear." },
                    "context": { "type": "string", "description": "Relevant context to help the human understand why you're asking" },
                    "options": { "type": "array", "items": { "type": "string" }, "description": "2-5 specific options for the human to choose from", "minItems": 2, "maxItems": 5 }
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
                    "name": { "type": "string", "description": "A descriptive job title for this agent (e.g. 'Database Migration Specialist', 'Legal Contract Reviewer')" },
                    "system_prompt": { "type": "string", "description": "The agent's full instructions: role, objective, approach, and output format. Write this like a job description + brief — be specific about what expertise they bring and exactly what to produce." },
                    "task": { "type": "string", "description": "The specific task for this agent to complete" },
                    "context": { "type": "string", "description": "Additional background, constraints, or relevant prior work the agent should know about" }
                },
                "required": ["name", "system_prompt", "task"]
            }),
        },
        ToolDef {
            name: "wait".into(),
            description: "End this cycle without dispatching agents. Use when all work is in progress, you're waiting for something, or there is genuinely nothing to do right now.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "reason": { "type": "string", "description": "Why you're waiting and what you're waiting for" } },
                "required": ["reason"]
            }),
        },
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

pub(crate) fn build_manager_context(mission: &Mission) -> String {
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

pub(crate) async fn run_agent_data_for_mission(
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

pub(crate) async fn run_sub_agent_for_mission(
    template_id: &str,
    task: &str,
    context: &str,
    mission_id: &str,
    agent_dispatch_id: &str,
    manager_model: &crate::models::ModelConfig,
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

pub(crate) async fn execute_mission_cycle(
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

    let briefing_prompt = "State your plan for this cycle in 2 sentences: \
        sentence 1 — which goal you are working on; \
        sentence 2 — which agent you will dispatch (use exact template_id from the list) and what task you will give them. \
        Write plain English only. No JSON. No IDs. No preamble. No questions.";

    let brief_turn = llm_call_with_tools(
        &manager_model,
        &system_prompt,
        &[serde_json::json!({ "role": "user", "content": briefing_prompt })],
        &data_dir.join("keys.json"),
        &[],
    ).await?;

    let plan_text = match brief_turn {
        LlmTurnResult::Text { content, .. } => content,
        LlmTurnResult::ToolCalls { preceding_text, .. } => preceding_text.unwrap_or_else(|| "Ready to begin.".into()),
    };

    let brief_entry = append_log(&mut mission, "briefing", &format!("Manager's plan: {}", plan_text), None, None, None);
    let _ = app.emit(
        &format!("conductor://mission/{}/log", mission_id),
        serde_json::json!({ "missionId": mission_id, "entry": brief_entry }),
    );

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

    let cycle_content = match &redirect_text {
        Some(r) => format!("{}\n\n## CEO Directive\n{}", cycle_prompt, r),
        None => cycle_prompt.to_string(),
    };

    let mut messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": cycle_content }),
    ];

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
                    // Merge user-added goals before the final cycle save
                    if let Ok(disk) = load_mission(data_dir, mission_id) {
                        let mem_ids: std::collections::HashSet<String> =
                            mission.goals.iter().map(|g| g.id.clone()).collect();
                        for disk_goal in disk.goals {
                            if !mem_ids.contains(&disk_goal.id) {
                                mission.goals.push(disk_goal);
                            }
                        }
                    }
                    save_mission_to_disk(data_dir, &mission).ok();
                }
                break;
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

                // Merge any goals added externally (e.g. by the user via UI) since this
                // cycle loaded the mission. We only ADD missing goals — we never overwrite
                // status changes the manager already made in-memory this cycle.
                if let Ok(disk) = load_mission(data_dir, mission_id) {
                    let mem_ids: std::collections::HashSet<String> =
                        mission.goals.iter().map(|g| g.id.clone()).collect();
                    for disk_goal in disk.goals {
                        if !mem_ids.contains(&disk_goal.id) {
                            mission.goals.push(disk_goal);
                        }
                    }
                }

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

                            let run_result = run_sub_agent_for_mission(
                                &template_id, &task, &context,
                                mission_id, &agent_dispatch_id,
                                &manager_model, workspace.as_deref(),
                                state, app, cancel,
                            ).await;

                            if let Some(sa) = mission.active_sub_agents.iter_mut().find(|s| s.id == agent_dispatch_id) {
                                sa.completed_at = Some(now());
                                match &run_result {
                                    Ok((out, _)) => { sa.status = "completed".into(); sa.output = Some(safe_truncate(out, 500).to_string()); }
                                    Err(e)       => { sa.status = "error".into(); sa.error = Some(e.clone()); }
                                }
                            }
                            if let Some(sa) = mission.active_sub_agents.iter().find(|s| s.id == agent_dispatch_id) {
                                let _ = app.emit(
                                    &format!("conductor://mission/{}/agent_status", mission_id),
                                    serde_json::json!({ "missionId": mission_id, "agent": sa }),
                                );
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
                            if let Some(sa) = mission.active_sub_agents.iter().find(|s| s.id == agent_dispatch_id) {
                                let _ = app.emit(
                                    &format!("conductor://mission/{}/agent_status", mission_id),
                                    serde_json::json!({ "missionId": mission_id, "agent": sa }),
                                );
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
                                        &mut mission, "goal_created",
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

                        tool_name => {
                            let dummy_run_id = format!("mission_mgr_{}", mission_id);
                            let result = execute_tool(
                                tc,
                                workspace.as_deref(),
                                &[],
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

pub(crate) async fn run_mission_loop(
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

        let (run_mode, cycle_minutes) = match load_mission(&data_dir, &mission_id) {
            Ok(m) => (m.run_mode.clone(), m.cycle_period_minutes),
            Err(_) => break,
        };

        let sleep_secs = if run_mode == "goal_driven" {
            (cycle_minutes as u64).max(1) * 60
        } else {
            30u64
        };

        let mut slept = 0u64;
        while slept < sleep_secs {
            if cancel.load(Ordering::Relaxed) { break; }
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            slept += 5;
        }
    }

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

// ── Tauri commands ──

#[tauri::command]
pub(crate) fn list_missions(state: State<'_, Arc<AppState>>) -> Vec<Mission> {
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
pub(crate) fn get_mission(id: String, state: State<'_, Arc<AppState>>) -> Option<Mission> {
    load_mission(&state.data_dir, &id).ok()
}

#[tauri::command]
pub(crate) fn save_mission(mission: Mission, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    std::fs::create_dir_all(missions_dir(&state.data_dir))
        .map_err(|e| format!("Mkdir missions: {}", e))?;
    save_mission_to_disk(&state.data_dir, &mission)
}

#[tauri::command]
pub(crate) fn delete_mission(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
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
pub(crate) async fn start_mission(
    mission_id: String,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<(), String> {
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
pub(crate) fn stop_mission(mission_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut missions = state.active_missions.lock().unwrap();
    if let Some(handle) = missions.remove(&mission_id) {
        handle.cancel.store(true, Ordering::Relaxed);
        {
            let mut senders = state.mission_escalation_senders.lock().unwrap();
            let keys: Vec<String> = senders.keys().filter(|k| k.starts_with(&mission_id)).cloned().collect();
            for k in keys { senders.remove(&k); }
        }
        {
            let mut senders = state.mission_briefing_senders.lock().unwrap();
            let keys: Vec<String> = senders.keys().cloned().collect();
            for k in keys { senders.remove(&k); }
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn approve_mission_briefing(
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
pub(crate) fn respond_to_mission_escalation(
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
pub(crate) fn add_mission_goal(
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
pub(crate) fn delete_mission_goal(
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
pub(crate) fn complete_mission_goal(
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

#[tauri::command]
pub(crate) async fn mission_chat_turn(
    mission_id: String,
    user_message: String,
    chat_history: Vec<MissionChatMessage>,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let mission = load_mission(&state.data_dir, &mission_id)?;

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

    let mut messages: Vec<serde_json::Value> = chat_history.iter().map(|m| {
        serde_json::json!({
            "role": if m.role == "user" { "user" } else { "assistant" },
            "content": m.content
        })
    }).collect();
    messages.push(serde_json::json!({ "role": "user", "content": user_message }));

    let model = &mission.manager_model;
    let max_tokens = effective_max_tokens(&model.provider, &model.model_id, 2048);
    let cancel = Arc::new(AtomicBool::new(false));

    let keys_file = state.data_dir.join("keys.json");
    let chat_session_id = format!("chat_{}", mission_id);

    let response = match model.provider.as_str() {
        "anthropic" => {
            let key = crate::storage::load_keys(&keys_file).remove("anthropic")
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
                "custom" => {
                    let base = model.base_url.clone().unwrap_or_default();
                    format!("{}/v1/chat/completions", base.trim_end_matches('/'))
                }
                p => return Err(format!("Unsupported provider: {}", p)),
            };
            let key = if model.provider == "openai" || model.provider == "custom" {
                let k = model.api_key_ref.clone().unwrap_or_else(|| model.provider.clone());
                crate::storage::load_keys(&keys_file).remove(&k)
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
