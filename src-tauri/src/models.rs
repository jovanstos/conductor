use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelConfig {
    pub(crate) provider: String,
    pub(crate) model_id: String,
    pub(crate) api_key_ref: Option<String>,
    pub(crate) base_url: Option<String>,
    pub(crate) max_tokens: u32,
    pub(crate) temperature: f64,
    #[serde(default)]
    pub(crate) simple_tool_format: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowNode {
    pub(crate) id: String,
    #[serde(rename = "type")]
    pub(crate) node_type: String,
    pub(crate) position: Position,
    pub(crate) data: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) extent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Position {
    pub(crate) x: f64,
    pub(crate) y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowEdge {
    pub(crate) id: String,
    pub(crate) source_node_id: String,
    pub(crate) target_node_id: String,
    pub(crate) context_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowSettings {
    pub(crate) default_model: ModelConfig,
    pub(crate) input_mode: String,
    pub(crate) save_history: bool,
    #[serde(default)]
    pub(crate) workspace_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Workflow {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    pub(crate) nodes: Vec<WorkflowNode>,
    pub(crate) edges: Vec<WorkflowEdge>,
    pub(crate) settings: WorkflowSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentNodeData {
    pub(crate) name: String,
    pub(crate) role_description: String,
    pub(crate) system_prompt: String,
    pub(crate) model: ModelConfig,
    pub(crate) context_mode: String,
    pub(crate) max_tokens: u32,
    pub(crate) template_id: Option<String>,
    #[serde(default)]
    pub(crate) tools_enabled: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoopNodeData {
    pub(crate) target_node_id: String,
    pub(crate) reviewer_node_id: String,
    pub(crate) max_retries: u32,
    pub(crate) exit_condition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReviewGateData {
    pub(crate) message: String,
    pub(crate) allow_edit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceConfig {
    pub(crate) mode: String,
    pub(crate) workspace_path: String,
    pub(crate) project_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Run {
    pub(crate) id: String,
    pub(crate) workflow_id: String,
    pub(crate) started_at: String,
    pub(crate) completed_at: Option<String>,
    pub(crate) status: String,
    pub(crate) input: String,
    pub(crate) steps: Vec<RunStep>,
    pub(crate) final_output: Option<String>,
    pub(crate) workspace_config: Option<WorkspaceConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunStep {
    pub(crate) node_id: String,
    pub(crate) node_name: String,
    pub(crate) attempt: u32,
    pub(crate) started_at: String,
    pub(crate) completed_at: Option<String>,
    pub(crate) status: String,
    pub(crate) input: String,
    pub(crate) output: String,
    pub(crate) tokens_used: Option<u32>,
    pub(crate) error: Option<String>,
    pub(crate) files_written: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Template {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) category: String,
    pub(crate) description: String,
    pub(crate) system_prompt: String,
    pub(crate) suggested_model: Option<String>,
    pub(crate) is_built_in: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ApiMessage {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ToolDef {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ToolCall {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) arguments: serde_json::Value,
}

#[derive(Debug)]
pub(crate) enum LlmTurnResult {
    Text { content: String, tokens_used: Option<u32> },
    ToolCalls { tool_calls: Vec<ToolCall>, preceding_text: Option<String> },
}

#[derive(Debug, Clone)]
pub(crate) struct ToolPermissionConfig {
    pub(crate) denied_paths: Vec<String>,
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

// ── Chamber types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChamberAgentConfig {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) system_prompt: String,
    pub(crate) model: ModelConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChamberRunConfig {
    pub(crate) mode: String,
    pub(crate) context: String,
    pub(crate) rubric: String,
    pub(crate) roster: Vec<ChamberAgentConfig>,
    pub(crate) rounds: Option<u32>,
    pub(crate) review_gate_enabled: bool,
}

// ── Mission types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MissionGoal {
    pub(crate) id: String,
    pub(crate) text: String,
    pub(crate) added_at: String,
    pub(crate) completed_at: Option<String>,
    pub(crate) status: String,
    pub(crate) priority: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkLogEntry {
    pub(crate) id: String,
    pub(crate) timestamp: String,
    pub(crate) entry_type: String,
    pub(crate) content: String,
    pub(crate) agent_name: Option<String>,
    pub(crate) template_id: Option<String>,
    pub(crate) goal_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tokens_used: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MissionEscalation {
    pub(crate) id: String,
    pub(crate) from: String,
    pub(crate) message: String,
    pub(crate) urgency: String,
    pub(crate) escalation_type: String,
    #[serde(default)]
    pub(crate) options: Vec<String>,
    pub(crate) created_at: String,
    pub(crate) resolved_at: Option<String>,
    pub(crate) response: Option<String>,
    pub(crate) status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MissionSubAgent {
    pub(crate) id: String,
    pub(crate) template_id: String,
    pub(crate) template_name: String,
    pub(crate) task: String,
    pub(crate) status: String,
    pub(crate) started_at: String,
    pub(crate) completed_at: Option<String>,
    pub(crate) output: Option<String>,
    pub(crate) error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) run_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Mission {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) goals: Vec<MissionGoal>,
    pub(crate) run_mode: String,
    pub(crate) cycle_period_minutes: u32,
    pub(crate) manager_model: ModelConfig,
    pub(crate) manager_system_prompt: String,
    #[serde(default)]
    pub(crate) allow_manager_goals: bool,
    #[serde(default)]
    pub(crate) auto_briefing: bool,
    pub(crate) status: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    pub(crate) started_at: Option<String>,
    pub(crate) work_log: Vec<WorkLogEntry>,
    pub(crate) active_escalation: Option<MissionEscalation>,
    pub(crate) workspace_path: Option<String>,
    #[serde(default)]
    pub(crate) active_sub_agents: Vec<MissionSubAgent>,
    #[serde(default)]
    pub(crate) chat_log: Vec<MissionChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MissionChatMessage {
    pub(crate) id: String,
    pub(crate) role: String,
    pub(crate) content: String,
    pub(crate) timestamp: String,
}

#[derive(Debug)]
pub(crate) enum GateResponse {
    Approve,
    Reject { feedback: String },
    Edit { content: String },
}

// ── Config types ──

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CustomHostConfigData {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) base_url: String,
    pub(crate) models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppConfig {
    pub(crate) default_projects_path: Option<String>,
    #[serde(default)]
    pub(crate) custom_hosts: Vec<CustomHostConfigData>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OllamaModelInfo {
    pub(crate) parameter_size: Option<String>,
    pub(crate) parameter_billions: Option<f64>,
    pub(crate) family: Option<String>,
    pub(crate) quantization: Option<String>,
}
