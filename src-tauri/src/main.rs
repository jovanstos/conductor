// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agents;
mod chamber;
mod llm;
mod manager;
mod models;
mod storage;
mod studio;
mod templates;
mod tools;
mod workflows;
mod workspace_fs;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;

use tauri::Manager;
use tokio::sync::oneshot;

use chamber::{ChamberGateResult, ChamberRunHandle};
use manager::MissionHandle;
use models::GateResponse;

pub(crate) struct AppState {
    pub(crate) data_dir: PathBuf,
    pub(crate) active_runs:   Mutex<HashMap<String, RunHandle>>,
    pub(crate) chamber_runs:  Mutex<HashMap<String, ChamberRunHandle>>,
    pub(crate) chamber_gates: Mutex<HashMap<String, oneshot::Sender<ChamberGateResult>>>,
    pub(crate) active_missions: Mutex<HashMap<String, MissionHandle>>,
    pub(crate) mission_escalation_senders: Mutex<HashMap<String, oneshot::Sender<String>>>,
    pub(crate) mission_briefing_senders: Mutex<HashMap<String, oneshot::Sender<Option<String>>>>,
}

pub(crate) struct RunHandle {
    pub(crate) cancel_flag: Arc<AtomicBool>,
    pub(crate) gate_senders: Mutex<HashMap<String, oneshot::Sender<GateResponse>>>,
    pub(crate) tool_confirm_senders: Mutex<HashMap<String, oneshot::Sender<bool>>>,
}

impl AppState {
    pub(crate) fn workflows_dir(&self) -> PathBuf { self.data_dir.join("workflows") }
    pub(crate) fn runs_dir(&self) -> PathBuf { self.data_dir.join("runs") }
    pub(crate) fn templates_dir(&self) -> PathBuf { self.data_dir.join("templates") }
    pub(crate) fn keys_file(&self) -> PathBuf { self.data_dir.join("keys.json") }
}

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
            workflows::get_workflows,
            workflows::save_workflow,
            workflows::delete_workflow,
            workflows::start_run,
            workflows::cancel_run,
            workflows::get_run,
            workflows::get_runs_for_workflow,
            workflows::resume_gate,
            workflows::respond_tool_confirmation,
            workflows::save_api_key,
            workflows::delete_api_key,
            workflows::has_api_key,
            workflows::get_templates,
            workflows::save_template,
            workflows::delete_template,
            workflows::read_text_file,
            workflows::get_ollama_models,
            workflows::validate_api_key,
            workflows::validate_custom_host,
            workspace_fs::read_workspace_manifest,
            workspace_fs::write_workspace_files,
            workspace_fs::delete_workspace,
            workspace_fs::zip_and_save_workspace,
            workspace_fs::list_projects,
            workspace_fs::open_project,
            workspace_fs::open_project_tree,
            workflows::load_config,
            workflows::save_config,
            workflows::write_text_file,
            workflows::import_workflow,
            chamber::start_chamber_run,
            chamber::cancel_chamber_run,
            chamber::resume_chamber_run,
            studio::studio_chat_turn,
            manager::list_missions,
            manager::get_mission,
            manager::save_mission,
            manager::delete_mission,
            manager::start_mission,
            manager::stop_mission,
            manager::respond_to_mission_escalation,
            manager::add_mission_goal,
            manager::complete_mission_goal,
            manager::delete_mission_goal,
            manager::mission_chat_turn,
            manager::approve_mission_briefing,
            workflows::get_ollama_model_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
