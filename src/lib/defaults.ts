import { v4 as uuidv4 } from "uuid";
import type {
  ModelConfig,
  WorkflowSettings,
  Workflow,
  AgentNodeData,
} from "../types";

export const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#f97316', // orange — Anthropic brand
  openai:    '#d1d5db', // near-white — OpenAI brand
  ollama:    '#3b82f6', // blue — Ollama brand
  custom:    '#8b5cf6', // purple — fallback
}

export function getProviderColor(provider: string | undefined): string {
  return PROVIDER_COLORS[provider ?? ''] ?? PROVIDER_COLORS.custom
}

export const DEFAULT_MODEL: ModelConfig = {
  provider: "anthropic",
  modelId: "claude-sonnet-4-6",
  maxTokens: 999999,
  temperature: 1.0,
};

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  defaultModel: DEFAULT_MODEL,
  inputMode: "text",
  saveHistory: true,
};

export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
];

export const OPENAI_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
];

export const OLLAMA_MODELS = [
  { id: 'llama3.2', name: 'Llama 3.2' },
  { id: 'mistral', name: 'Mistral' },
  { id: 'codellama', name: 'Code Llama' },
  { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
];

export function newWorkflow(name: string): Workflow {
  const startId = uuidv4()
  const endId = uuidv4()
  return {
    id: uuidv4(),
    name,
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: 'start', position: { x: 60, y: 200 }, data: {} },
      { id: endId, type: 'end', position: { x: 700, y: 200 }, data: {} },
    ],
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
  {
    id: "fact-checker",
    name: "Fact Checker",
    category: "Analysis",
    roleDescription: "Critically evaluates claims and research",
    systemPrompt: `## Role\nYou are a meticulous fact-checker and critical reviewer.\n\n## Objective\nCritically evaluate the content for accuracy, logical consistency, and completeness.\n\n## Output format\nYour response MUST end with either:\n- "APPROVED" if the content is accurate and complete\n- "NEEDS REVISION" followed by specific numbered issues\n\n## Constraints\n- Challenge unsupported claims\n- Identify logical gaps or errors\n- Only APPROVED when genuinely satisfied`,
  },
  {
    id: "executive-summarizer",
    name: "Executive Summarizer",
    category: "Analysis",
    roleDescription: "Distills lengthy content into key points",
    systemPrompt: `## Role\nYou are an expert at condensing complex information.\n\n## Objective\nSummarize the given content into a clear, concise executive summary.\n\n## Output format\nTL;DR (2 sentences) · Key Points (5 bullets max) · Action Items (if any).\n\n## Constraints\n- Keep it under 300 words\n- Preserve all critical information\n- Use plain language`,
  },
  {
    id: "marketing-copywriter",
    name: "Marketing Copywriter",
    category: "Marketing",
    roleDescription: "Writes persuasive marketing copy",
    systemPrompt: `## Role\nYou are a seasoned marketing copywriter.\n\n## Objective\nWrite compelling, persuasive copy that drives action.\n\n## Output format\nHeadline · Subheadline · Body copy · Call to action.\n\n## Constraints\n- Focus on benefits, not features\n- Speak directly to the target audience\n- Every sentence must earn its place`,
  },
  {
    id: "email-writer",
    name: "Email Writer",
    category: "Marketing",
    roleDescription: "Writes professional and engaging emails",
    systemPrompt: `## Role\nYou are a professional email copywriter.\n\n## Objective\nWrite clear, engaging emails that get responses.\n\n## Output format\nSubject line · Preview text · Body · Sign-off.\n\n## Constraints\n- Subject line under 50 characters\n- Get to the point quickly\n- One clear call-to-action per email`,
  },
  {
    id: "social-media-manager",
    name: "Social Media Manager",
    category: "Marketing",
    roleDescription: "Creates engaging social media posts",
    systemPrompt: `## Role\nYou are a social media specialist.\n\n## Objective\nCreate platform-optimized posts that engage the target audience.\n\n## Output format\nFor each platform requested: post copy + relevant hashtags (5 max).\n\n## Constraints\n- Twitter/X: under 280 characters\n- Instagram: visual-first, conversational\n- LinkedIn: professional, value-driven\n- Never use more than 5 hashtags`,
  },
  {
    id: "editor",
    name: "Editor",
    category: "Writing",
    roleDescription: "Refines drafts for clarity and impact",
    systemPrompt: `## Role\nYou are an experienced editor.\n\n## Objective\nReview the draft and provide clear, actionable feedback to improve it.\n\n## Output format\nYour response MUST end with either:\n- "APPROVED" if the content is ready to publish\n- "NEEDS REVISION" followed by specific numbered feedback\n\n## Constraints\n- Focus on clarity, flow, and impact\n- Be constructive and specific\n- Only APPROVED when genuinely satisfied`,
  },
  {
    id: "sales-pitch-writer",
    name: "Sales Pitch Writer",
    category: "Marketing",
    roleDescription: "Crafts compelling sales pitches",
    systemPrompt: `## Role\nYou are a top-tier sales pitch writer.\n\n## Objective\nCreate a compelling pitch that clearly communicates value and motivates action.\n\n## Output format\nHook · Problem · Solution · Proof · Offer · Close.\n\n## Constraints\n- Lead with the prospect's pain point\n- Back claims with specifics\n- End with a clear next step`,
  },
];

export type RoleCategory = 'developer' | 'reviewer' | 'writer' | 'researcher' | 'planner' | 'tester' | 'marketer' | 'default'

export interface RoleInfo {
  category: RoleCategory
  label: string
  borderColor: string
  bgColor: string
  textColor: string
  dotColor: string
}

export function getRoleInfo(name: string, roleDescription: string): RoleInfo {
  const text = `${name} ${roleDescription}`.toLowerCase()
  if (/develop|engineer|cod|implement|build|program/.test(text))
    return { category: 'developer', label: 'Developer', borderColor: 'border-blue-500/40', bgColor: 'bg-blue-500/15', textColor: 'text-blue-400', dotColor: 'bg-blue-400' }
  if (/review|check|critic|audit|verif/.test(text))
    return { category: 'reviewer', label: 'Reviewer', borderColor: 'border-amber-500/40', bgColor: 'bg-amber-500/15', textColor: 'text-amber-400', dotColor: 'bg-amber-400' }
  if (/writ|edit|content|copy|draft|author|document/.test(text))
    return { category: 'writer', label: 'Writer', borderColor: 'border-emerald-500/40', bgColor: 'bg-emerald-500/15', textColor: 'text-emerald-400', dotColor: 'bg-emerald-400' }
  if (/research|analys|fact|data|investigat/.test(text))
    return { category: 'researcher', label: 'Researcher', borderColor: 'border-cyan-500/40', bgColor: 'bg-cyan-500/15', textColor: 'text-cyan-400', dotColor: 'bg-cyan-400' }
  if (/plan|architect|design|strateg|roadmap|product|manag/.test(text))
    return { category: 'planner', label: 'Planner', borderColor: 'border-purple-500/40', bgColor: 'bg-purple-500/15', textColor: 'text-purple-400', dotColor: 'bg-purple-400' }
  if (/test|qa|quality|bug|debug/.test(text))
    return { category: 'tester', label: 'Tester', borderColor: 'border-rose-500/40', bgColor: 'bg-rose-500/15', textColor: 'text-rose-400', dotColor: 'bg-rose-400' }
  if (/market|sales|social|campaign|promot/.test(text))
    return { category: 'marketer', label: 'Marketer', borderColor: 'border-orange-500/40', bgColor: 'bg-orange-500/15', textColor: 'text-orange-400', dotColor: 'bg-orange-400' }
  return { category: 'default', label: 'Agent', borderColor: 'border-purple-500/30', bgColor: 'bg-purple-500/12', textColor: 'text-purple-400', dotColor: 'bg-purple-400' }
}

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
    maxTokens: 999999,
    ...overrides,
  };
}

// Content Factory: Start → [Loop: Writer + Editor] → Final Polish → End
export function contentFactoryWorkflow(): Workflow {
  const startId = uuidv4();
  const writerId = uuidv4();
  const editorId = uuidv4();
  const writerLoopId = uuidv4();
  const polisherId = uuidv4();
  const endId = uuidv4();

  return {
    id: uuidv4(),
    name: "Content Factory",
    description: "Writes and refines content through a writer-editor loop",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: 'start', position: { x: 60, y: 230 }, data: {} },
      {
        id: writerLoopId,
        type: "loop",
        position: { x: 260, y: 100 },
        data: {
          targetNodeId: writerId,
          reviewerNodeId: editorId,
          maxRetries: 3,
          exitCondition: "reviewer_approves",
        },
      },
      {
        id: writerId,
        type: "agent",
        position: { x: 30, y: 70 },
        parentId: writerLoopId,
        extent: "parent" as const,
        data: {
          name: "Writer",
          roleDescription: "Drafts engaging content",
          systemPrompt: `## Role\nYou are a skilled content writer.\n\n## Objective\nWrite a polished draft based on the task. If given editor feedback, revise accordingly.\n\n## Output format\nComplete draft content, ready for review.\n\n## Constraints\n- Match the tone and audience specified\n- Be clear, concise, and engaging`,
          model: { ...DEFAULT_MODEL },
          contextMode: "full_chain",
          maxTokens: 999999,
          templateId: "content-writer",
        } satisfies AgentNodeData,
      },
      {
        id: editorId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: writerLoopId,
        extent: "parent" as const,
        data: {
          name: "Editor",
          roleDescription: "Reviews and improves the draft",
          systemPrompt: `## Role\nYou are an experienced editor.\n\n## Objective\nReview the writer's draft and provide detailed, constructive feedback.\n\n## Output format\nYour response MUST end with either:\n- "APPROVED" if the content is ready to publish\n- "NEEDS REVISION" followed by specific numbered feedback points\n\n## Constraints\n- Focus on clarity, flow, and impact\n- Be specific and actionable\n- Only APPROVED when genuinely satisfied`,
          model: { ...DEFAULT_MODEL },
          contextMode: "full_chain",
          maxTokens: 999999,
          templateId: "editor",
        } satisfies AgentNodeData,
      },
      {
        id: polisherId,
        type: "agent",
        position: { x: 880, y: 210 },
        data: {
          name: "Final Polish",
          roleDescription: "Applies final polish and formatting",
          systemPrompt: `## Role\nYou are a professional copyeditor.\n\n## Objective\nGive the approved content its final polish.\n\n## Output format\nThe finalized, publication-ready version of the content.\n\n## Constraints\n- Preserve the original message and voice\n- Fix any remaining grammar, style, or formatting issues`,
          model: { ...DEFAULT_MODEL },
          contextMode: "full_chain",
          maxTokens: 999999,
        } satisfies AgentNodeData,
      },
      { id: endId, type: 'end', position: { x: 1140, y: 210 }, data: {} },
    ],
    edges: [
      { id: uuidv4(), sourceNodeId: startId, targetNodeId: writerLoopId, contextMode: "full" },
      { id: uuidv4(), sourceNodeId: writerLoopId, targetNodeId: polisherId, contextMode: "full" },
      { id: uuidv4(), sourceNodeId: polisherId, targetNodeId: endId, contextMode: "full" },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

// Research Lab: Start → [Loop: Researcher + Fact Checker] → Report Writer → End
export function researchLabWorkflow(): Workflow {
  const startId = uuidv4();
  const researcherId = uuidv4();
  const factCheckerId = uuidv4();
  const researchLoopId = uuidv4();
  const reportWriterId = uuidv4();
  const endId = uuidv4();

  return {
    id: uuidv4(),
    name: "Research Lab",
    description: "Researches a topic and produces a fact-checked report",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: 'start', position: { x: 60, y: 230 }, data: {} },
      {
        id: researchLoopId,
        type: "loop",
        position: { x: 260, y: 100 },
        data: {
          targetNodeId: researcherId,
          reviewerNodeId: factCheckerId,
          maxRetries: 2,
          exitCondition: "reviewer_approves",
        },
      },
      {
        id: researcherId,
        type: "agent",
        position: { x: 30, y: 70 },
        parentId: researchLoopId,
        extent: "parent" as const,
        data: {
          name: "Researcher",
          roleDescription: "Gathers and synthesizes information",
          systemPrompt: `## Role\nYou are a thorough research analyst.\n\n## Objective\nResearch the topic and synthesize key information. If given feedback, revise your research.\n\n## Output format\nStructured research with: Overview, Key Facts, Supporting Evidence, Open Questions.\n\n## Constraints\n- Evidence-based claims only\n- Acknowledge uncertainty clearly`,
          model: { ...DEFAULT_MODEL },
          contextMode: "full_chain",
          maxTokens: 999999,
          templateId: "analyst",
        } satisfies AgentNodeData,
      },
      {
        id: factCheckerId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: researchLoopId,
        extent: "parent" as const,
        data: {
          name: "Fact Checker",
          roleDescription: "Critically evaluates the research",
          systemPrompt: `## Role\nYou are a critical fact-checker.\n\n## Objective\nCritically evaluate the research for accuracy, completeness, and logical consistency.\n\n## Output format\nYour response MUST end with either:\n- "APPROVED" if the research is solid and complete\n- "NEEDS REVISION" followed by specific numbered issues\n\n## Constraints\n- Challenge unsupported claims\n- Identify gaps in coverage\n- Only APPROVED when genuinely satisfied`,
          model: { ...DEFAULT_MODEL },
          contextMode: "full_chain",
          maxTokens: 999999,
          templateId: "fact-checker",
        } satisfies AgentNodeData,
      },
      {
        id: reportWriterId,
        type: "agent",
        position: { x: 880, y: 210 },
        data: {
          name: "Report Writer",
          roleDescription: "Turns research into a polished report",
          systemPrompt: `## Role\nYou are a professional report writer.\n\n## Objective\nTransform the verified research into a polished, readable report.\n\n## Output format\nMarkdown report: Executive Summary · Introduction · Findings · Analysis · Conclusions · Recommendations.\n\n## Constraints\n- Clear, professional tone\n- Accessible to non-experts\n- Actionable conclusions`,
          model: { ...DEFAULT_MODEL },
          contextMode: "full_chain",
          maxTokens: 999999,
          templateId: "documentation-writer",
        } satisfies AgentNodeData,
      },
      { id: endId, type: 'end', position: { x: 1140, y: 210 }, data: {} },
    ],
    edges: [
      { id: uuidv4(), sourceNodeId: startId, targetNodeId: researchLoopId, contextMode: "full" },
      { id: uuidv4(), sourceNodeId: researchLoopId, targetNodeId: reportWriterId, contextMode: "full" },
      { id: uuidv4(), sourceNodeId: reportWriterId, targetNodeId: endId, contextMode: "full" },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

// Software Factory: Start → [Loop: Planner + Reviewer] → Gate → [Loop: Developer + Tester] → End
export function softwareFactoryWorkflow(): Workflow {
  const startId = uuidv4();
  const plannerId = uuidv4();
  const planReviewerId = uuidv4();
  const plannerLoopId = uuidv4();
  const reviewGateId = uuidv4();
  const developerId = uuidv4();
  const testerId = uuidv4();
  const devLoopId = uuidv4();
  const endId = uuidv4();

  return {
    id: uuidv4(),
    name: "Software Factory",
    description:
      "Plans, develops, and tests software from a single description",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: 'start', position: { x: 60, y: 270 }, data: {} },
      // Plan loop group
      {
        id: plannerLoopId,
        type: "loop",
        position: { x: 260, y: 140 },
        data: {
          targetNodeId: plannerId,
          reviewerNodeId: planReviewerId,
          maxRetries: 2,
          exitCondition: "reviewer_approves",
        },
      },
      {
        id: plannerId,
        type: "agent",
        position: { x: 30, y: 70 },
        parentId: plannerLoopId,
        extent: "parent" as const,
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
          maxTokens: 999999,
          templateId: "software-planner",
        } satisfies AgentNodeData,
      },
      {
        id: planReviewerId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: plannerLoopId,
        extent: "parent" as const,
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
          maxTokens: 999999,
          templateId: "architecture-reviewer",
        } satisfies AgentNodeData,
      },
      {
        id: reviewGateId,
        type: "review_gate",
        position: { x: 880, y: 240 },
        data: {
          message:
            "Review the Software Design Document. Approve to proceed to implementation, or provide feedback to revise.",
          allowEdit: true,
        },
      },
      // Dev loop group
      {
        id: devLoopId,
        type: "loop",
        position: { x: 1100, y: 140 },
        data: {
          targetNodeId: developerId,
          reviewerNodeId: testerId,
          maxRetries: 3,
          exitCondition: "reviewer_approves",
        },
      },
      {
        id: developerId,
        type: "agent",
        position: { x: 30, y: 70 },
        parentId: devLoopId,
        extent: "parent" as const,
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
          maxTokens: 999999,
          templateId: "full-stack-developer",
        } satisfies AgentNodeData,
      },
      {
        id: testerId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: devLoopId,
        extent: "parent" as const,
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
          maxTokens: 999999,
          templateId: "unit-test-writer",
        } satisfies AgentNodeData,
      },
      { id: endId, type: 'end', position: { x: 1720, y: 270 }, data: {} },
    ],
    edges: [
      { id: uuidv4(), sourceNodeId: startId, targetNodeId: plannerLoopId, contextMode: "full" },
      { id: uuidv4(), sourceNodeId: plannerLoopId, targetNodeId: reviewGateId, contextMode: "full" },
      { id: uuidv4(), sourceNodeId: reviewGateId, targetNodeId: devLoopId, contextMode: "full" },
      { id: uuidv4(), sourceNodeId: devLoopId, targetNodeId: endId, contextMode: "full" },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}
