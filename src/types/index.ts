export type ModelProvider = 'anthropic' | 'openai' | 'ollama' | 'custom'

export type ModelConfig = {
  provider: ModelProvider
  modelId: string
  apiKeyRef?: string
  baseUrl?: string
  maxTokens: number
  temperature: number
}

export type NodeType = 'agent' | 'loop' | 'review_gate' | 'decision' | 'merge'

export type AgentNodeData = {
  name: string
  roleDescription: string
  systemPrompt: string
  model: ModelConfig
  contextMode: 'none' | 'previous' | 'full_chain'
  maxTokens: number
  templateId?: string
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
  data: AgentNodeData | LoopNodeData | ReviewGateData
}

export type WorkflowEdge = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  contextMode: 'full' | 'summary' | 'structured'
}

export type WorkflowSettings = {
  defaultModel: ModelConfig
  inputMode: 'text' | 'file'
  saveHistory: boolean
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

// Tauri event payloads
export type StepStartedPayload = { nodeId: string; nodeName: string; attempt: number }
export type StepDonePayload = { nodeId: string; output: string; tokensUsed?: number }
export type StepErrorPayload = { nodeId: string; error: string }
export type StepChunkPayload = { nodeId: string; chunk: string }
export type GatePausedPayload = { nodeId: string; output: string; message: string }
export type CompletedPayload = { finalOutput: string }
