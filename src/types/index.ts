export type ModelProvider = 'anthropic' | 'openai' | 'ollama' | 'custom'

export type ModelConfig = {
  provider: ModelProvider
  modelId: string
  apiKeyRef?: string
  baseUrl?: string
  maxTokens: number
  temperature: number
}

export type CustomHostConfig = {
  id: string
  name: string
  baseUrl: string
  models: string[]
  color: string
}

export type NodeType = 'agent' | 'loop' | 'review_gate' | 'start' | 'end' | 'decision' | 'merge'

export type StartNodeData = { label?: string }
export type EndNodeData = { label?: string }

export type ToolNameId =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'list_directory'
  | 'search_files'
  | 'create_directory'
  | 'delete_file'
  | 'move_file'
  | 'fetch_url'
  | 'run_shell_command'

export type AgentNodeData = {
  name: string
  roleDescription: string
  systemPrompt: string
  model: ModelConfig
  contextMode: 'none' | 'previous' | 'full_chain'
  maxTokens: number
  templateId?: string
  toolsEnabled?: ToolNameId[]
}

export type LoopNodeData = {
  targetNodeId: string
  reviewerNodeId: string
  maxRetries: number
  exitCondition: 'reviewer_approves' | 'max_retries'
}

export type ReviewGateData = {
  message: string
  allowEdit: boolean
}

export type WorkflowNode = {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: AgentNodeData | LoopNodeData | ReviewGateData | StartNodeData | EndNodeData
  parentId?: string
  extent?: 'parent'
}

export type EdgeContextMode = 'full' | 'previous' | 'none'

export type WorkflowEdge = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  sourceHandle?: string
  targetHandle?: string
  contextMode: EdgeContextMode
}

// ── Mission types ─────────────────────────────────────────

export type MissionStatus = 'idle' | 'running' | 'paused' | 'escalating' | 'briefing' | 'completed'
export type MissionRunMode = 'goal_driven' | 'event_driven'
export type MissionGoalStatus = 'active' | 'in_progress' | 'completed' | 'cancelled'

export type MissionGoal = {
  id: string
  text: string
  addedAt: string
  completedAt?: string
  status: MissionGoalStatus
  priority: 'high' | 'normal' | 'low'
}

export type WorkLogEntryType =
  | 'cycle_start'
  | 'briefing'
  | 'manager_decision'
  | 'manager_tool'
  | 'agent_dispatched'
  | 'agent_completed'
  | 'agent_error'
  | 'escalation_created'
  | 'escalation_resolved'
  | 'goal_completed'
  | 'note'
  | 'error'
  | 'stopped'

export type WorkLogEntry = {
  id: string
  timestamp: string
  entryType: WorkLogEntryType
  content: string
  agentName?: string
  templateId?: string
  goalId?: string
  tokensUsed?: number
}

export type MissionEscalationType = 'question' | 'choice'

export type MissionEscalation = {
  id: string
  from: string
  message: string
  urgency: 'high' | 'info'
  escalationType: MissionEscalationType
  options: string[]   // for 'choice' type: the options to present
  createdAt: string
  resolvedAt?: string
  response?: string
  status: 'pending' | 'resolved'
}

export type MissionSubAgent = {
  id: string
  templateId: string
  templateName: string
  task: string
  status: 'running' | 'completed' | 'error'
  startedAt: string
  completedAt?: string
  output?: string
  error?: string
  runId?: string
}

export type MissionBriefing = {
  briefingId: string
  plan: string
}

export type Mission = {
  id: string
  name: string
  description: string
  goals: MissionGoal[]
  runMode: MissionRunMode
  cyclePeriodMinutes: number
  managerModel: ModelConfig
  managerSystemPrompt: string
  allowManagerGoals: boolean
  autoBriefing: boolean
  status: MissionStatus
  createdAt: string
  updatedAt: string
  startedAt?: string
  workLog: WorkLogEntry[]
  activeEscalation?: MissionEscalation
  workspacePath?: string
  activeSubAgents: MissionSubAgent[]
  chatLog: MissionChatMessage[]
}

export type MissionChatMessage = {
  id: string
  role: 'user' | 'manager'
  content: string
  timestamp: string
}

// Mission event payloads
export type MissionStatusPayload     = { missionId: string; status: MissionStatus }
export type MissionLogPayload        = { missionId: string; entry: WorkLogEntry }
export type MissionEscalationPayload = { missionId: string; escalation: MissionEscalation }
export type MissionAgentPayload      = { missionId: string; agent: MissionSubAgent }
export type MissionGoalPayload       = { missionId: string; goalId: string; status: MissionGoalStatus }
export type MissionChatChunkPayload  = { missionId: string; chunk: string }
export type MissionBriefingPayload   = { missionId: string; briefingId: string; plan: string }

export type ScheduleInterval = 'minutes' | 'hours' | 'daily' | 'weekly'

export type WorkflowSchedule = {
  enabled: boolean
  interval: ScheduleInterval
  intervalValue: number
  time?: string
  days?: number[]
  task: string
  nextRunAt?: string
  lastRunAt?: string
}

export type WorkflowSettings = {
  defaultModel: ModelConfig
  inputMode: 'text' | 'file'
  saveHistory: boolean
  workspacePath?: string
  schedule?: WorkflowSchedule
}

export type Workflow = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  settings: WorkflowSettings
}

export type RunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export type ToolCallStatus = 'running' | 'done' | 'error'

export type ToolCallRecord = {
  toolCallId: string
  toolName: string
  argsPreview: string
  status: ToolCallStatus
  resultPreview?: string
  isError?: boolean
}

export type RunStep = {
  nodeId: string
  nodeName: string
  attempt: number
  startedAt: string
  completedAt?: string
  status: StepStatus
  input: string
  output: string
  tokensUsed?: number
  error?: string
  filesWritten?: string[]
  toolCalls?: ToolCallRecord[]
}

export type Run = {
  id: string
  workflowId: string
  startedAt: string
  completedAt?: string
  status: RunStatus
  input: string
  steps: RunStep[]
  finalOutput?: string
  workspaceConfig?: WorkspaceConfig
}

export type Template = {
  id: string
  name: string
  category: string
  description: string
  systemPrompt: string
  suggestedModel?: string
  isBuiltIn: boolean
}

export type LLMMessage = {
  role: 'user' | 'assistant'
  content: string
}

// ── Workspace / filesystem types ────────────────────
export type WorkspaceMode = 'temporary' | 'project' | 'existing'

export type FileEntry = {
  path: string    // relative path within workspace e.g. "src/main.py"
  content: string
}

export type DirEntry = {
  name: string
  path: string      // relative path from project root
  isDir: boolean
  children: DirEntry[]
  content?: string  // text content for files; undefined for dirs / binary
}

export type WorkspaceConfig = {
  mode: WorkspaceMode
  workspacePath: string
  projectName?: string
}

export type ProjectEntry = {
  name: string
  path: string
  lastModified: string
}

// ── Updated run types ────────────────────────────────
// (re-declare here so RunStep and Run pick up new fields)

// Tauri event payloads
export type StepStartedPayload = { nodeId: string; nodeName: string; attempt: number }
export type StepDonePayload = { nodeId: string; output: string; tokensUsed?: number; filesWritten?: string[] }
export type StepErrorPayload = { nodeId: string; error: string }
export type StepChunkPayload = { nodeId: string; chunk: string }
export type GatePausedPayload = { nodeId: string; output: string; message: string }
export type CompletedPayload = { finalOutput: string }
export type ToolCallStartedPayload = { nodeId: string; toolCallId: string; toolName: string; argsPreview: string }
export type ToolCallDonePayload = { nodeId: string; toolCallId: string; toolName: string; resultPreview: string; isError: boolean }
export type ToolConfirmRequestPayload = { nodeId: string; agentName: string; toolCallId: string; toolName: string; command: string }

// ── Studio types ──────────────────────────────────────

export type StudioMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type StudioPhase = 'idle' | 'explore' | 'refine' | 'finished'
export type StudioSessionState = 'idle' | 'brainstorming' | 'generating_final' | 'finished'

export type StudioTemplateId =
  | 'agent_prompt'
  | 'project_plan'
  | 'design_doc'
  | 'research_brief'
  | 'free_form'

export type StudioSession = {
  id: string
  title: string
  templateId: StudioTemplateId
  createdAt: string
  messages: StudioMessage[]
  finalDocument: string
}

export type StudioChunkPayload = { chunk: string }

// ── Chamber types ─────────────────────────────────────

export type ChamberMode = 'audition' | 'war_room' | 'syndicate'
export type ChamberRunStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'cancelled'
export type ChamberAgentStatus = 'waiting' | 'thinking' | 'typing' | 'critiquing' | 'done' | 'error'

export type ChamberAgent = {
  id: string
  name: string
  systemPrompt: string
  model: ModelConfig
}

export type ChamberResult = {
  agentId: string
  agentName: string
  output: string
  score?: number
  rank?: number
}

// Tauri event payloads for Chamber
export type ChamberAgentStatusPayload = { agentId: string; agentName: string; status: ChamberAgentStatus }
export type ChamberAgentChunkPayload  = { agentId: string; chunk: string }
export type ChamberAgentDonePayload   = { agentId: string; output: string }
export type ChamberPhasePayload       = { label: string; description: string }
export type ChamberGatePausedPayload  = { message: string; phase: string; outputs: { agentId: string; agentName: string; output: string }[] }
export type ChamberCompletedPayload   = { results: ChamberResult[]; finalOutput: string; winnerId?: string }
export type ChamberErrorPayload       = { message: string }
