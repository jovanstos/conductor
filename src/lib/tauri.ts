import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  Workflow,
  Run,
  Template,
  ModelConfig,
  LLMMessage,
  FileEntry,
  DirEntry,
  ProjectEntry,
  StepStartedPayload,
  StepDonePayload,
  StepErrorPayload,
  StepChunkPayload,
  GatePausedPayload,
  CompletedPayload,
  ToolCallStartedPayload,
  ToolCallDonePayload,
  ToolConfirmRequestPayload,
} from '../types'

// Workflow CRUD
export const getWorkflows = () => invoke<Workflow[]>('get_workflows')
export const saveWorkflow = (workflow: Workflow) => invoke<void>('save_workflow', { workflow })
export const deleteWorkflow = (id: string) => invoke<void>('delete_workflow', { id })

// Run management
export const startRun = (
  workflowId: string,
  input: string,
  workspaceMode?: string,
  projectName?: string,
  basePath?: string,
) => invoke<string>('start_run', { workflowId, input, workspaceMode, projectName, basePath })
export const cancelRun = (runId: string) => invoke<void>('cancel_run', { runId })
export const getRun = (runId: string) => invoke<Run | null>('get_run', { runId })
export const getRunsForWorkflow = (workflowId: string) =>
  invoke<Run[]>('get_runs_for_workflow', { workflowId })

// Review gate resume
export const resumeGate = (
  runId: string,
  nodeId: string,
  action: 'approve' | 'reject' | 'edit',
  content?: string,
) => invoke<void>('resume_gate', { runId, nodeId, action, content })

// LLM call
export const callLlm = (model: ModelConfig, system: string, messages: LLMMessage[]) =>
  invoke<string>('call_llm', { model, system, messages })

// API key management
export const saveApiKey = (provider: string, key: string) =>
  invoke<void>('save_api_key', { provider, key })
export const deleteApiKey = (provider: string) => invoke<void>('delete_api_key', { provider })
export const hasApiKey = (provider: string) => invoke<boolean>('has_api_key', { provider })

// Templates
export const getTemplates = () => invoke<Template[]>('get_templates')
export const saveTemplate = (template: Template) => invoke<void>('save_template', { template })
export const deleteTemplate = (id: string) => invoke<void>('delete_template', { id })

// File input
export const readTextFile = (path: string) => invoke<string>('read_text_file', { path })

// Workspace / filesystem
export const readWorkspaceManifest = (workspacePath: string) =>
  invoke<FileEntry[]>('read_workspace_manifest', { workspacePath })
export const writeWorkspaceFiles = (workspacePath: string, files: FileEntry[]) =>
  invoke<void>('write_workspace_files', { workspacePath, files })
export const deleteWorkspace = (workspacePath: string) =>
  invoke<void>('delete_workspace', { workspacePath })
export const zipAndSaveWorkspace = (workspacePath: string, destinationPath: string) =>
  invoke<void>('zip_and_save_workspace', { workspacePath, destinationPath })
export const listProjects = (basePath?: string) =>
  invoke<ProjectEntry[]>('list_projects', { basePath })
export const validateApiKey = (provider: string) =>
  invoke<string>('validate_api_key', { provider })
export const openProject = (projectPath: string) =>
  invoke<FileEntry[]>('open_project', { projectPath })
export const openProjectTree = (projectPath: string) =>
  invoke<DirEntry[]>('open_project_tree', { projectPath })

// App config
export type AppConfig = { defaultProjectsPath?: string }
export const loadConfig = () => invoke<AppConfig>('load_config')
export const saveConfig = (config: AppConfig) => invoke<void>('save_config', { config })

// File save
export const writeTextFile = (path: string, content: string) =>
  invoke<void>('write_text_file', { path, content })
export const importWorkflow = (json: string) =>
  invoke<Workflow>('import_workflow', { json })

// Tool confirmation response
export const respondToolConfirmation = (runId: string, toolCallId: string, approved: boolean) =>
  invoke<void>('respond_tool_confirmation', { runId, toolCallId, approved })

// Tauri event listeners for run lifecycle
export type RunEventHandlers = {
  onStepStarted?: (payload: StepStartedPayload) => void
  onStepDone?: (payload: StepDonePayload) => void
  onStepError?: (payload: StepErrorPayload) => void
  onStepChunk?: (payload: StepChunkPayload) => void
  onGatePaused?: (payload: GatePausedPayload) => void
  onCompleted?: (payload: CompletedPayload) => void
  onCancelled?: () => void
  onToolCallStarted?: (payload: ToolCallStartedPayload) => void
  onToolCallDone?: (payload: ToolCallDonePayload) => void
  onToolConfirmRequest?: (payload: ToolConfirmRequestPayload) => void
}

export async function listenToRun(
  runId: string,
  handlers: RunEventHandlers,
): Promise<() => void> {
  const unlisteners: UnlistenFn[] = await Promise.all([
    handlers.onStepStarted
      ? listen<StepStartedPayload>(`conductor://run/${runId}/step_started`, (e) =>
          handlers.onStepStarted!(e.payload),
        )
      : Promise.resolve<UnlistenFn>(() => {}),

    handlers.onStepDone
      ? listen<StepDonePayload>(`conductor://run/${runId}/step_done`, (e) =>
          handlers.onStepDone!(e.payload),
        )
      : Promise.resolve<UnlistenFn>(() => {}),

    handlers.onStepError
      ? listen<StepErrorPayload>(`conductor://run/${runId}/step_error`, (e) =>
          handlers.onStepError!(e.payload),
        )
      : Promise.resolve<UnlistenFn>(() => {}),

    handlers.onStepChunk
      ? listen<StepChunkPayload>(`conductor://run/${runId}/step_chunk`, (e) =>
          handlers.onStepChunk!(e.payload),
        )
      : Promise.resolve<UnlistenFn>(() => {}),

    handlers.onGatePaused
      ? listen<GatePausedPayload>(`conductor://run/${runId}/gate_paused`, (e) =>
          handlers.onGatePaused!(e.payload),
        )
      : Promise.resolve<UnlistenFn>(() => {}),

    handlers.onCompleted
      ? listen<CompletedPayload>(`conductor://run/${runId}/completed`, (e) =>
          handlers.onCompleted!(e.payload),
        )
      : Promise.resolve<UnlistenFn>(() => {}),

    handlers.onCancelled
      ? listen<void>(`conductor://run/${runId}/cancelled`, () => handlers.onCancelled!())
      : Promise.resolve<UnlistenFn>(() => {}),

    handlers.onToolCallStarted
      ? listen<ToolCallStartedPayload>(`conductor://run/${runId}/tool_call_started`, (e) =>
          handlers.onToolCallStarted!(e.payload),
        )
      : Promise.resolve<UnlistenFn>(() => {}),

    handlers.onToolCallDone
      ? listen<ToolCallDonePayload>(`conductor://run/${runId}/tool_call_done`, (e) =>
          handlers.onToolCallDone!(e.payload),
        )
      : Promise.resolve<UnlistenFn>(() => {}),

    handlers.onToolConfirmRequest
      ? listen<ToolConfirmRequestPayload>(`conductor://run/${runId}/tool_confirm_request`, (e) =>
          handlers.onToolConfirmRequest!(e.payload),
        )
      : Promise.resolve<UnlistenFn>(() => {}),
  ])

  return () => unlisteners.forEach((u) => u())
}
