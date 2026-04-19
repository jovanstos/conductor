import { v4 as uuidv4 } from "uuid";
import type {
  ModelConfig,
  WorkflowSettings,
  Workflow,
  AgentNodeData,
} from "../types";

export const DEFAULT_MODEL: ModelConfig = {
  provider: "anthropic",
  modelId: "claude-sonnet-4-6",
  maxTokens: 8096,
  temperature: 1.0,
};

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  defaultModel: DEFAULT_MODEL,
  inputMode: "text",
  saveHistory: true,
};

export const ANTHROPIC_MODELS = [
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    description: "Most capable",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    description: "Balanced",
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    description: "Fast & efficient",
  },
];

export const OPENAI_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", description: "Most capable" },
  { id: "gpt-4o-mini", name: "GPT-4o mini", description: "Fast & cheap" },
];

export const OLLAMA_MODELS = [
  { id: "gemma4:e4b", name: "Gemma4:e4b", description: "Google" },
  { id: "llama3.2", name: "Llama 3.2", description: "Meta" },
  { id: "mistral", name: "Mistral", description: "Fast" },
  { id: "codellama", name: "Code Llama", description: "Code focused" },
  { id: "qwen2.5-coder", name: "Qwen 2.5 Coder", description: "Code focused" },
];

export function newWorkflow(name: string): Workflow {
  return {
    id: uuidv4(),
    name,
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [],
    edges: [],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

// Shown in the template picker inside the agent inspector
export const BUILT_IN_TEMPLATES = [
  {
    id: "software-planner",
    name: "Software Planner",
    category: "Software",
    roleDescription: "Plans the architecture and requirements",
    systemPrompt: `## Role\nYou are a senior software architect.\n\n## Objective\nProduce a comprehensive Software Design Document for the given task.\n\n## Output format\nMarkdown with: Executive Summary, Requirements, Architecture, Tech Stack, Open Questions.\n\n## Constraints\n- Be specific and actionable\n- No actual code, only plans`,
  },
  {
    id: "architecture-reviewer",
    name: "Architecture Reviewer",
    category: "Software",
    roleDescription: "Reviews and critiques architecture plans",
    systemPrompt: `## Role\nYou are a senior software architect reviewer.\n\n## Objective\nReview the SDD and give structured feedback.\n\n## Output format\nEnd your response with "APPROVED" or "NEEDS REVISION" + numbered feedback.\n\n## Constraints\n- Only say APPROVED when genuinely satisfied`,
  },
  {
    id: "full-stack-developer",
    name: "Full-Stack Developer",
    category: "Software",
    roleDescription: "Implements working, production-quality code",
    systemPrompt: `## Role\nYou are a senior full-stack developer.\n\n## Objective\nImplement production-quality code from the design document.\n\n## Output format\nComplete code files with imports.\n\n## Constraints\n- Complete runnable code — not pseudocode\n- Follow the SDD tech stack`,
  },
  {
    id: "unit-test-writer",
    name: "Tester / QA Engineer",
    category: "Software",
    roleDescription: "Tests and validates the implementation",
    systemPrompt: `## Role\nYou are a QA engineer.\n\n## Objective\nReview the developer's code against requirements.\n\n## Output format\nEnd with "APPROVED" or "NEEDS REVISION" + specific issues.\n\n## Constraints\n- Reference specific functions or lines\n- Only APPROVED when all requirements are met`,
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    category: "Software",
    roleDescription: "Reviews code for quality and correctness",
    systemPrompt: `## Role\nYou are an experienced code reviewer.\n\n## Objective\nReview the code and give actionable feedback.\n\n## Output format\nWhat's Good · Improvements · Security · Final Verdict.\n\n## Constraints\n- Specific and actionable\n- Prioritize correctness over style`,
  },
  {
    id: "documentation-writer",
    name: "Documentation Writer",
    category: "Writing",
    roleDescription: "Writes clear technical documentation",
    systemPrompt: `## Role\nYou are a technical writer.\n\n## Objective\nWrite clear documentation for the provided code or system.\n\n## Output format\nMarkdown: Overview, Installation, Usage, API Reference.\n\n## Constraints\n- Write for developers new to the codebase\n- Include practical examples`,
  },
  {
    id: "bug-analyzer",
    name: "Bug Analyzer",
    category: "Software",
    roleDescription: "Diagnoses bugs and proposes fixes",
    systemPrompt: `## Role\nYou are a debugging specialist.\n\n## Objective\nDiagnose the bug and propose a working fix.\n\n## Output format\nRoot Cause · Affected Code · Proposed Fix (with code) · Prevention.\n\n## Constraints\n- Precise root cause\n- Provide a complete working fix`,
  },
  {
    id: "product-manager",
    name: "Product Manager",
    category: "Business",
    roleDescription: "Defines requirements and user stories",
    systemPrompt: `## Role\nYou are an experienced product manager.\n\n## Objective\nTranslate the idea into clear product requirements.\n\n## Output format\nProblem Statement · Target Users · User Stories · Acceptance Criteria · Out of Scope.\n\n## Constraints\n- Focus on user value\n- Stories must be testable`,
  },
  {
    id: "content-writer",
    name: "Content Writer",
    category: "Writing",
    roleDescription: "Writes engaging content and copy",
    systemPrompt: `## Role\nYou are an experienced content writer.\n\n## Objective\nWrite engaging, clear content for the given brief.\n\n## Output format\nFormatted content ready to use.\n\n## Constraints\n- Match the requested tone and audience\n- Be concise and engaging`,
  },
  {
    id: "analyst",
    name: "Research Analyst",
    category: "Analysis",
    roleDescription: "Analyzes data and produces insights",
    systemPrompt: `## Role\nYou are a research analyst.\n\n## Objective\nAnalyze the given material and produce structured insights.\n\n## Output format\nExecutive Summary · Key Findings (numbered) · Recommendations.\n\n## Constraints\n- Evidence-based conclusions only\n- Highlight uncertainty where it exists`,
  },
];

export function newAgentNodeData(
  overrides?: Partial<AgentNodeData>,
): AgentNodeData {
  return {
    name: "New Agent",
    roleDescription: "Completes its part of the workflow",
    systemPrompt:
      "## Role\nYou are a helpful AI agent.\n\n## Objective\nComplete the given task concisely and accurately.\n\n## Output format\nPlain text response.\n\n## Constraints\n- Be specific and actionable",
    model: { ...DEFAULT_MODEL },
    contextMode: "full_chain",
    maxTokens: 8096,
    ...overrides,
  };
}

// The built-in Software Factory workflow
export function softwareFactoryWorkflow(): Workflow {
  const plannerId = uuidv4();
  const planReviewerId = uuidv4();
  const plannerLoopId = uuidv4();
  const reviewGateId = uuidv4();
  const developerId = uuidv4();
  const testerId = uuidv4();
  const devLoopId = uuidv4();

  return {
    id: uuidv4(),
    name: "Software Factory",
    description:
      "Plans, develops, and tests software from a single description",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: plannerId,
        type: "agent",
        position: { x: 80, y: 80 },
        data: {
          name: "Planner",
          roleDescription: "Plans the architecture and requirements",
          systemPrompt: `## Role
You are a senior software architect and technical planner.

## Objective
Produce a comprehensive Software Design Document (SDD) for the given task.

## Input
You will receive:
- The user's original task
- Any prior reviewer feedback (if revising)

## Output format
A structured markdown document with: Executive Summary, Requirements, Architecture, Component Breakdown, Tech Stack, and Open Questions.

## Constraints
- Be specific and actionable
- Do not write actual code, only plans
- Keep responses focused`,
          model: { ...DEFAULT_MODEL },
          contextMode: "full_chain",
          maxTokens: 2048,
          templateId: "software-planner",
        } satisfies AgentNodeData,
      },
      {
        id: planReviewerId,
        type: "agent",
        position: { x: 80, y: 260 },
        data: {
          name: "Plan Reviewer",
          roleDescription: "Reviews the architecture plan",
          systemPrompt: `## Role
You are a senior software architect reviewer.

## Objective
Review the Software Design Document and provide structured feedback.

## Input
You will receive:
- The original task
- The SDD to review

## Output format
Your response MUST end with either:
- "APPROVED" if the design is ready to proceed
- "NEEDS REVISION" followed by specific, numbered feedback points

## Constraints
- Only say APPROVED when genuinely satisfied
- Be constructive and specific`,
          model: { ...DEFAULT_MODEL },
          contextMode: "full_chain",
          maxTokens: 1024,
          templateId: "architecture-reviewer",
        } satisfies AgentNodeData,
      },
      {
        id: plannerLoopId,
        type: "loop",
        position: { x: 360, y: 160 },
        data: {
          targetNodeId: plannerId,
          reviewerNodeId: planReviewerId,
          maxRetries: 2,
          exitCondition: "reviewer_approves",
        },
      },
      {
        id: reviewGateId,
        type: "review_gate",
        position: { x: 580, y: 160 },
        data: {
          message:
            "Review the Software Design Document. Approve to proceed to implementation, or provide feedback to revise.",
          allowEdit: true,
        },
      },
      {
        id: developerId,
        type: "agent",
        position: { x: 800, y: 80 },
        data: {
          name: "Developer",
          roleDescription: "Implements the approved design",
          systemPrompt: `## Role
You are a senior full-stack developer.

## Objective
Implement working, production-quality code based on the approved Software Design Document.

## Input
You will receive:
- The original task
- The approved SDD
- Tester feedback (if revising)

## Output format
Complete, working code files with clear file structure and all imports listed.

## Constraints
- Write complete, runnable code — not pseudocode
- Follow the tech stack specified in the SDD
- Do not add features beyond the SDD scope`,
          model: { ...DEFAULT_MODEL },
          contextMode: "full_chain",
          maxTokens: 4096,
          templateId: "full-stack-developer",
        } satisfies AgentNodeData,
      },
      {
        id: testerId,
        type: "agent",
        position: { x: 800, y: 260 },
        data: {
          name: "Tester",
          roleDescription: "Tests the implementation against requirements",
          systemPrompt: `## Role
You are a QA engineer specializing in software testing.

## Objective
Review the developer's implementation and either approve it or provide specific issues.

## Input
You will receive:
- The original task
- The SDD (requirements)
- The developer's code

## Output format
Your response MUST end with either:
- "APPROVED" if the code meets all requirements
- "NEEDS REVISION" followed by specific bugs, missing features, and edge cases

## Constraints
- Reference specific line numbers or function names
- Only say APPROVED when all requirements are met`,
          model: { ...DEFAULT_MODEL },
          contextMode: "full_chain",
          maxTokens: 1024,
          templateId: "unit-test-writer",
        } satisfies AgentNodeData,
      },
      {
        id: devLoopId,
        type: "loop",
        position: { x: 1060, y: 160 },
        data: {
          targetNodeId: developerId,
          reviewerNodeId: testerId,
          maxRetries: 3,
          exitCondition: "reviewer_approves",
        },
      },
    ],
    edges: [
      {
        id: uuidv4(),
        sourceNodeId: plannerLoopId,
        targetNodeId: reviewGateId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: reviewGateId,
        targetNodeId: devLoopId,
        contextMode: "full",
      },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}
