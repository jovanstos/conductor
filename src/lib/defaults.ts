import { v4 as uuidv4 } from "uuid";
import type {
  ModelConfig,
  WorkflowSettings,
  Workflow,
  AgentNodeData,
  ToolNameId,
} from "../types";

export const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#f97316", // orange — Anthropic brand
  openai: "#d1d5db", // near-white — OpenAI brand
  ollama: "#3b82f6", // blue — Ollama brand
  custom: "#8b5cf6", // purple — fallback
};

const CUSTOM_HOST_PALETTE = [
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#f97316",
  "#84cc16",
  "#6366f1",
  "#e11d48",
  "#0ea5e9",
];

export function pickHostColor(index: number): string {
  return CUSTOM_HOST_PALETTE[index % CUSTOM_HOST_PALETTE.length];
}

export function getProviderColor(provider: string | undefined): string {
  return PROVIDER_COLORS[provider ?? ""] ?? PROVIDER_COLORS.custom;
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
  workspacePath: undefined,
};

export const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-7", name: "Claude Opus 4.7" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
];

export const OPENAI_MODELS = [
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gpt-4o-mini", name: "GPT-4o mini" },
];

export const OLLAMA_MODELS = [
  { id: "llama3.2", name: "Llama 3.2" },
  { id: "mistral", name: "Mistral" },
  { id: "codellama", name: "Code Llama" },
  { id: "qwen2.5-coder", name: "Qwen 2.5 Coder" },
];

export function newWorkflow(name: string): Workflow {
  const startId = uuidv4();
  const endId = uuidv4();
  return {
    id: uuidv4(),
    name,
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: "start", position: { x: 60, y: 200 }, data: {} },
      { id: endId, type: "end", position: { x: 700, y: 200 }, data: {} },
    ],
    edges: [],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

// ── Built-in agent templates ─────────────────────────────
export const BUILT_IN_TEMPLATES = [
  // ── SOFTWARE (Kept for backwards compatibility / Devs) ──
  {
    id: "software-planner",
    name: "Software Planner",
    category: "Software",
    roleDescription: "Plans architecture and technical design",
    systemPrompt: `## Role\nYou are a senior software architect.\n\n## Objective\nProduce a Software Design Document.\n\n## Constraints\n- If file tools are available, use \`write_file\` to save the SDD to disk. Do NOT output the entire markdown document in the chat.\n- No actual code, only plans.`,
  },
  {
    id: "architecture-reviewer",
    name: "Architecture Reviewer",
    category: "Software",
    roleDescription: "Reviews and critiques architecture plans",
    systemPrompt: `## Role\nYou are a technical reviewer.\n\n## Objective\nReview the SDD.\n\n## Output format\nEnd with "APPROVED" or "NEEDS REVISION".`,
  },
  {
    id: "full-stack-developer",
    name: "Full-Stack Developer",
    category: "Software",
    roleDescription: "Implements working, production-quality code",
    systemPrompt: `## Role\nYou are a senior full-stack developer.\n\n## Workflow\n1. Read relevant files\n2. Use \`write_file\` or \`edit_file\` tools to implement changes.\n3. You MUST use tools to save code. Do NOT output raw code blocks in your text response.\n\n## Constraints\n- Your text response should ONLY be a brief summary of what you did.\n- Complete runnable code — not pseudocode.`,
  },
  {
    id: "unit-test-writer",
    name: "Tester / QA Engineer",
    category: "Software",
    roleDescription: "Tests and validates the implementation",
    systemPrompt: `## Role\nYou are a QA engineer.\n\n## Objective\nReview the implementation.\n\n## Output format\nEnd with "APPROVED" or "NEEDS REVISION" + specific issues.`,
  },

  // ── DIGITAL JANITOR (Personal Admin) ──
  {
    id: "file-scanner",
    name: "Directory Scout",
    category: "Organization",
    roleDescription: "Scans and categorizes messy folders",
    systemPrompt: `## Role
You are a highly organized digital assistant.

## Objective
Scan the target directory and categorize the mess.

## Workflow
1. Use the \`list_directory\` tool to see what files exist.
2. Group the files by implied project, date, or type (e.g., "Taxes", "Memes", "School Docs").

## Constraints
- Do not move anything yet. Just output a clear, bulleted list of what you found and how it should be grouped logically.`,
  },
  {
    id: "folder-architect",
    name: "Folder Architect",
    category: "Organization",
    roleDescription: "Designs a clean, logical folder structure",
    systemPrompt: `## Role
You are a master of digital feng shui.

## Objective
Read the Scout's list of messy files and propose a clean, logical folder structure.

## Output Format
Create a specific "Move Plan" (e.g., "Create /Taxes_2024 and move [file1, file2] there").

## Constraints
- Do NOT use tools. Just output text. The user will review this plan before the Mover executes it.`,
  },
  {
    id: "file-mover",
    name: "The Mover",
    category: "Organization",
    roleDescription: "Executes folder creation and moves files",
    systemPrompt: `## Role
  You are the execution arm of the Digital Janitor team.

  ## Objective
  Execute the approved "Move Plan" flawlessly.

  ## Workflow
  1. Use the \`create_directory\` tool to make any required folders.
  2. Use the \`move_file\` tool to move the files into their new homes.

  ## Constraints
  - You MUST use tools to do this work. 
  - Do not output code or scripts. Use the filesystem tools directly.
  - If a file doesn't exist, skip it gracefully.`,
  },
  {
    id: "clutter-finder",
    name: "Clutter Finder",
    category: "Organization",
    roleDescription:
      "Scans folders for duplicates, old versions, and junk files",
    systemPrompt: `## Role
    You are a meticulous data archivist.

    ## Objective
    Scan the user's directories to identify digital clutter that is safe to delete.

    ## Workflow
    1. Use \`list_directory\` to deeply scan the target folder.
    2. Identify files that look like duplicates (e.g., "document(1).pdf"), outdated temp files, or unused assets.
    3. Output a structured, bulleted "Purge List" in the chat for the user to review.

    ## Constraints
    - Do NOT use the \`delete_file\` tool yourself. Only output the list of recommended deletions. The user will manually approve or a follow-up agent will handle the deletion.
    - Be conservative. If you are not sure if a file is junk, do not list it.`,
  },

  // ── EXAM PREP ENGINE (Student) ──
  {
    id: "knowledge-extractor",
    name: "Knowledge Librarian",
    category: "Education",
    roleDescription: "Extracts core concepts from local notes",
    systemPrompt: `## Role
  You are a master researcher.

  ## Objective
  Scan the local directory for study materials (notes, outlines, text files) and extract the core concepts.

  ## Workflow
  1. Use \`list_directory\` to find study materials.
  2. Use \`read_file\` to read them. Do not read files larger than 10,000 characters at once.
  3. Summarize the core concepts, definitions, and themes into a tight text response.`,
  },
  {
    id: "study-guide-creator",
    name: "Study Guide Architect",
    category: "Education",
    roleDescription: "Drafts a markdown study guide",
    systemPrompt: `## Role
  You are an expert tutor.

  ## Objective
  Take the extracted knowledge and format it into a beautiful, easy-to-read Study Guide.

  ## Workflow
  1. Write the guide.
  2. You MUST use the \`write_file\` tool to save it as \`Study_Guide.md\` in the target directory.

  ## Constraints
  - Do NOT output the full guide in the chat. Use the tool to save it, and just reply "Study guide saved successfully."`,
  },
  {
    id: "quiz-generator",
    name: "Quizmaster",
    category: "Education",
    roleDescription: "Generates practice tests from study guides",
    systemPrompt: `## Role
    You are a tough but fair professor.

    ## Objective
    Create a multiple-choice practice test based on the Study Guide.

    ## Workflow
    1. Use \`write_file\` to create \`Practice_Test.md\`.
    2. Use \`write_file\` to create \`Answer_Key.md\`.

    ## Constraints
    - You MUST use tools to save the files. 
    - Ensure the questions actually test comprehension, not just rote memorization.`,
  },
  {
    id: "concept-translator",
    name: "Concept Translator",
    category: "Education",
    roleDescription: "Breaks down complex academic readings into simple terms",
    systemPrompt: `## Role
    You are an expert, patient tutor who excels at the Feynman Technique.

    ## Objective
    Read dense academic papers, complex articles, or confusing homework assignments and break them down so a beginner can understand them.

    ## Workflow
    1. Use \`list_directory\` and \`read_file\` to read the difficult material. 
    2. Translate the core concepts into plain, accessible language using analogies.
    3. You MUST use the \`write_file\` tool to save your explanation as \`Simplified_Notes.md\`.

    ## Constraints
    - Do NOT output the full explanation in the chat. Use the tool to save it.
    - Never use academic jargon to explain academic jargon. Always use everyday analogies.`,
  },

  // ── CREATOR'S ECHO (Creative) ──
  {
    id: "content-miner",
    name: "Content Miner",
    category: "Creative",
    roleDescription: "Finds the best hooks in raw drafts",
    systemPrompt: `## Role
    You are a viral content strategist.

    ## Objective
    Find a local draft, script, or blog post and extract the 3 most interesting "hooks" or concepts.

    ## Workflow
    1. Use \`list_directory\` and \`read_file\` to read the user's raw content.
    2. Output a text summary of the best angles for social media.`,
  },
  {
    id: "social-repurposer",
    name: "Social Repurposer",
    category: "Creative",
    roleDescription: "Drafts multi-platform social media posts",
    systemPrompt: `## Role
    You are a master social media copywriter.

    ## Objective
    Take the Content Miner's hooks and draft:
    1. A 5-part Twitter Thread
    2. A professional LinkedIn post
    3. A punchy Instagram caption

    ## Constraints
    - Tailor the tone perfectly for each specific platform. Output the drafts as plain text for the editor to review.`,
  },
  {
    id: "social-formatter",
    name: "Asset Packager",
    category: "Creative",
    roleDescription: "Saves formatted posts to disk",
    systemPrompt: `## Role
    You are a social media manager's assistant.

    ## Objective
    Take the approved social media posts and save them to disk.

    ## Workflow
    1. Use \`create_directory\` to make a folder called \`Social_Assets\`.
    2. Use \`write_file\` to save the Twitter, LinkedIn, and Instagram posts as separate \`.txt\` files inside that folder.

    ## Constraints
    - You MUST use tools to save the files. Do not output the posts in the chat.`,
  },

  // ── LIFE ADMIN (Productivity) ──
  {
    id: "inbox-sorter",
    name: "Inbox Sorter",
    category: "Productivity",
    roleDescription: "Identifies tasks in messy documents",
    systemPrompt: `## Role
    You are an elite executive assistant.

    ## Objective
    Read messy local files (meeting notes, raw text, emails) and identify actionable tasks, deadlines, and financial amounts.

    ## Workflow
    1. Use \`list_directory\` and \`read_file\` to process the user's messy inbox folder.
    2. Output a structured summary of what needs to be done, paid, or scheduled.`,
  },
  {
    id: "task-processor",
    name: "Task Processor",
    category: "Productivity",
    roleDescription: "Generates CSVs and Action Plans",
    systemPrompt: `## Role
    You are a highly efficient operations manager.

    ## Objective
    Take the Sorter's messy task list and turn it into professional documents.

    ## Workflow
    1. If there are finances, use \`write_file\` to create \`Expenses.csv\`.
    2. Use \`write_file\` to create \`Weekly_Action_Plan.md\` with check-boxes.

    ## Constraints
    - You MUST use tools to save the files. Do not output raw CSV data in the chat.`,
  },
  {
    id: "resume-tailorer",
    name: "Resume Tailorer",
    category: "Productivity",
    roleDescription:
      "Tailors your resume and writes cover letters for specific jobs",
    systemPrompt: `## Role
    You are an elite career coach and executive recruiter.

    ## Objective
    Take the user's base resume and a target job description, then rewrite the resume to highlight the most relevant skills and draft a compelling cover letter.

    ## Workflow
    1. Use \`read_file\` to read the user's base resume and the job description.
    2. Use \`write_file\` to save the tailored resume as \`Tailored_Resume.md\`.
    3. Use \`write_file\` to save the cover letter as \`Cover_Letter.md\`.

    ## Constraints
    - You MUST use tools to save the files. Do not output the resume or cover letter in the chat.
    - Never invent experience or lie. Only emphasize, reorder, or rephrase the user's actual experience to match the job's keywords.`,
  },
  {
    id: "itinerary-architect",
    name: "Itinerary Architect",
    category: "Productivity",
    roleDescription:
      "Turns messy notes into structured schedules and timelines",
    systemPrompt: `## Role
    You are a master project manager and event planner.

    ## Objective
    Read a brain-dump of tasks, locations, or ideas, and organize them into a strictly formatted chronological schedule or project timeline.

    ## Workflow
    1. Use \`read_file\` to read the user's messy notes.
    2. Structure the information chronologically (e.g., Day-by-Day or Hour-by-Hour).
    3. You MUST use the \`write_file\` tool to save the schedule as \`Schedule.md\`.

    ## Constraints
    - You MUST use tools to save the file. Do not output the schedule in the chat.
    - Estimate logical durations for tasks if the user forgot to provide them, but add a "?" so they know it is an estimate.`,
  },
  // ── (General Editor used across loops) ──
  {
    id: "editor",
    name: "Editor",
    category: "Writing",
    roleDescription: "Reviews drafts for clarity, flow, and impact",
    systemPrompt: `## Role\nYou are an experienced editor.\n\n## Objective\nReview the draft and provide specific, constructive feedback.\n\n## Output format\nEnd with exactly "APPROVED" or "NEEDS REVISION".`,
  },
  {
    id: "ghostwriter",
    name: "Ghostwriter",
    category: "Writing",
    roleDescription: "Expands rough outlines into polished, full-length drafts",
    systemPrompt: `## Role
    You are a highly adaptable ghostwriter.

    ## Objective
    Take the user's rough notes, bullet points, or half-finished thoughts and expand them into a complete, well-written draft (e.g., an essay, blog post, or newsletter).

    ## Workflow
    1. Use \`read_file\` to read the user's outline or notes.
    2. Expand the ideas into fluid, engaging prose matching the requested tone.
    3. You MUST use the \`write_file\` tool to save the draft as \`Draft.md\`.

    ## Constraints
    - Do NOT output the full essay in the chat. Use the tool to save it, and simply reply with a summary of the tone and structure you used.
    - Fill in logical gaps gracefully, but do not invent fake statistics or quotes.`,
  },
];

export function agentFromTemplate(
  templateId: string,
  overrides?: Partial<AgentNodeData>,
): AgentNodeData {
  const tpl = BUILT_IN_TEMPLATES.find((t) => t.id === templateId);
  return {
    name: tpl?.name ?? "Agent",
    roleDescription:
      tpl?.roleDescription ?? "Completes its part of the workflow",
    systemPrompt:
      tpl?.systemPrompt ??
      "## Role\nYou are a helpful AI.\n\n## Objective\nComplete the given task.",
    model: { ...DEFAULT_MODEL },
    contextMode: "full_chain",
    maxTokens: 999999,
    toolsEnabled: [],
    templateId,
    ...overrides,
  };
}

export type RoleCategory =
  | "developer"
  | "reviewer"
  | "writer"
  | "researcher"
  | "planner"
  | "tester"
  | "marketer"
  | "organization"
  | "education"
  | "productivity"
  | "default";

export interface RoleInfo {
  category: RoleCategory;
  label: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
  dotColor: string;
}

export function getRoleInfo(name: string, roleDescription: string): RoleInfo {
  const text = `${name} ${roleDescription}`.toLowerCase();

  if (/janitor|organize|mover|scout|architect|clean|sort/.test(text))
    return {
      category: "organization",
      label: "Organizer",
      borderColor: "border-teal-500/40",
      bgColor: "bg-teal-500/15",
      textColor: "text-teal-400",
      dotColor: "bg-teal-400",
    };
  if (/student|exam|quiz|tutor|study|librarian/.test(text))
    return {
      category: "education",
      label: "Education",
      borderColor: "border-yellow-500/40",
      bgColor: "bg-yellow-500/15",
      textColor: "text-yellow-400",
      dotColor: "bg-yellow-400",
    };
  if (/admin|task|processor|schedule|inbox/.test(text))
    return {
      category: "productivity",
      label: "Admin",
      borderColor: "border-indigo-500/40",
      bgColor: "bg-indigo-500/15",
      textColor: "text-indigo-400",
      dotColor: "bg-indigo-400",
    };
  if (/develop|engineer|cod|implement|build|program/.test(text))
    return {
      category: "developer",
      label: "Developer",
      borderColor: "border-blue-500/40",
      bgColor: "bg-blue-500/15",
      textColor: "text-blue-400",
      dotColor: "bg-blue-400",
    };
  if (/review|check|critic|audit|verif/.test(text))
    return {
      category: "reviewer",
      label: "Reviewer",
      borderColor: "border-amber-500/40",
      bgColor: "bg-amber-500/15",
      textColor: "text-amber-400",
      dotColor: "bg-amber-400",
    };
  if (/writ|edit|content|copy|draft|format/.test(text))
    return {
      category: "writer",
      label: "Writer",
      borderColor: "border-emerald-500/40",
      bgColor: "bg-emerald-500/15",
      textColor: "text-emerald-400",
      dotColor: "bg-emerald-400",
    };
  if (/research|analys|fact|investigat|miner/.test(text))
    return {
      category: "researcher",
      label: "Researcher",
      borderColor: "border-cyan-500/40",
      bgColor: "bg-cyan-500/15",
      textColor: "text-cyan-400",
      dotColor: "bg-cyan-400",
    };
  if (/plan|design|strateg|product|manag/.test(text))
    return {
      category: "planner",
      label: "Planner",
      borderColor: "border-purple-500/40",
      bgColor: "bg-purple-500/15",
      textColor: "text-purple-400",
      dotColor: "bg-purple-400",
    };
  if (/test|qa|quality|bug|debug/.test(text))
    return {
      category: "tester",
      label: "Tester",
      borderColor: "border-rose-500/40",
      bgColor: "bg-rose-500/15",
      textColor: "text-rose-400",
      dotColor: "bg-rose-400",
    };
  if (/market|sales|social|campaign|promot/.test(text))
    return {
      category: "marketer",
      label: "Marketer",
      borderColor: "border-orange-500/40",
      bgColor: "bg-orange-500/15",
      textColor: "text-orange-400",
      dotColor: "bg-orange-400",
    };

  return {
    category: "default",
    label: "Agent",
    borderColor: "border-purple-500/30",
    bgColor: "bg-purple-500/12",
    textColor: "text-purple-400",
    dotColor: "bg-purple-400",
  };
}

export function newAgentNodeData(
  overrides?: Partial<AgentNodeData>,
): AgentNodeData {
  return {
    name: "New Agent",
    roleDescription: "Completes its part of the workflow",
    systemPrompt:
      "## Role\nYou are a helpful AI agent.\n\n## Objective\nComplete the given task.\n\n## Constraints\n- Be specific and actionable",
    model: { ...DEFAULT_MODEL },
    contextMode: "full_chain",
    maxTokens: 999999,
    toolsEnabled: [],
    ...overrides,
  };
}

// ── Tool registry ────────────────────────────────────────
export type ToolGroup = "filesystem" | "shell" | "web";
export type ToolRegistryEntry = {
  id: ToolNameId;
  label: string;
  description: string;
  group: ToolGroup;
  requiresConfirmation: boolean;
};

export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  {
    id: "read_file",
    label: "Read File",
    description: "Read the contents of a file",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "write_file",
    label: "Write File",
    description: "Create or overwrite a file",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "edit_file",
    label: "Edit File",
    description: "Replace a specific string in a file",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "list_directory",
    label: "List Directory",
    description: "List files and folders",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "search_files",
    label: "Search Files",
    description: "Search for a pattern across files",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "create_directory",
    label: "Create Directory",
    description: "Create a new directory",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "move_file",
    label: "Move / Rename File",
    description: "Move or rename a file or directory",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "delete_file",
    label: "Delete File",
    description: "Permanently delete a file",
    group: "filesystem",
    requiresConfirmation: true,
  },
  {
    id: "run_shell_command",
    label: "Run Shell Command",
    description: "Execute a shell command",
    group: "shell",
    requiresConfirmation: true,
  },
  {
    id: "fetch_url",
    label: "Fetch URL",
    description: "Download and read content from a URL",
    group: "web",
    requiresConfirmation: false,
  },
];

export const TOOL_GROUPS: { id: ToolGroup; label: string }[] = [
  { id: "filesystem", label: "File System" },
  { id: "shell", label: "Shell" },
  { id: "web", label: "Web" },
];

// ── Workflow templates ───────────────────────────────────

// 1. Software Factory (Kept for Devs)
export function softwareFactoryWorkflow(
  preferredModel?: ModelConfig,
): Workflow {
  const model = preferredModel ?? DEFAULT_MODEL;
  const startId = uuidv4(),
    plannerId = uuidv4(),
    planReviewerId = uuidv4(),
    plannerLoopId = uuidv4(),
    reviewGateId = uuidv4(),
    developerId = uuidv4(),
    testerId = uuidv4(),
    devLoopId = uuidv4(),
    endId = uuidv4();
  return {
    id: uuidv4(),
    name: "Software Factory",
    description: "Plans, develops, and tests software",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: "start", position: { x: 60, y: 270 }, data: {} },
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
        extent: "parent",
        data: agentFromTemplate("software-planner", {
          model: { ...model },
          toolsEnabled: ["write_file", "list_directory"] as ToolNameId[],
        }),
      },
      {
        id: planReviewerId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: plannerLoopId,
        extent: "parent",
        data: agentFromTemplate("architecture-reviewer", {
          model: { ...model },
        }),
      },
      {
        id: reviewGateId,
        type: "review_gate",
        position: { x: 880, y: 240 },
        data: { message: "Review the plan.", allowEdit: true },
      },
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
        extent: "parent",
        data: agentFromTemplate("full-stack-developer", {
          model: { ...model },
          toolsEnabled: [
            "read_file",
            "write_file",
            "edit_file",
            "list_directory",
          ] as ToolNameId[],
        }),
      },
      {
        id: testerId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: devLoopId,
        extent: "parent",
        data: agentFromTemplate("unit-test-writer", { model: { ...model } }),
      },
      { id: endId, type: "end", position: { x: 1720, y: 270 }, data: {} },
    ],
    edges: [
      {
        id: uuidv4(),
        sourceNodeId: startId,
        targetNodeId: plannerLoopId,
        contextMode: "full",
      },
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
      {
        id: uuidv4(),
        sourceNodeId: devLoopId,
        targetNodeId: endId,
        contextMode: "full",
      },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

// 2. Digital Janitor (Personal Admin)
export function digitalJanitorWorkflow(preferredModel?: ModelConfig): Workflow {
  const model = preferredModel ?? DEFAULT_MODEL;
  const startId = uuidv4(),
    scoutId = uuidv4(),
    architectId = uuidv4(),
    gateId = uuidv4(),
    moverId = uuidv4(),
    endId = uuidv4();
  return {
    id: uuidv4(),
    name: "Digital Janitor",
    description:
      "Scans messy folders and organizes files into a clean structure",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: "start", position: { x: 60, y: 150 }, data: {} },
      {
        id: scoutId,
        type: "agent",
        position: { x: 250, y: 150 },
        data: agentFromTemplate("file-scanner", {
          model: { ...model },
          toolsEnabled: ["list_directory", "read_file"] as ToolNameId[],
        }),
      },
      {
        id: architectId,
        type: "agent",
        position: { x: 500, y: 150 },
        data: agentFromTemplate("folder-architect", { model: { ...model } }),
      },
      {
        id: gateId,
        type: "review_gate",
        position: { x: 750, y: 150 },
        data: {
          message:
            "Review the proposed folder structure before the files are moved.",
          allowEdit: true,
        },
      },
      {
        id: moverId,
        type: "agent",
        position: { x: 1000, y: 150 },
        data: agentFromTemplate("file-mover", {
          model: { ...model },
          toolsEnabled: ["create_directory", "move_file"] as ToolNameId[],
        }),
      },
      { id: endId, type: "end", position: { x: 1250, y: 150 }, data: {} },
    ],
    edges: [
      {
        id: uuidv4(),
        sourceNodeId: startId,
        targetNodeId: scoutId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: scoutId,
        targetNodeId: architectId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: architectId,
        targetNodeId: gateId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: gateId,
        targetNodeId: moverId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: moverId,
        targetNodeId: endId,
        contextMode: "full",
      },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

// 3. Exam Prep Engine (Education)
export function examPrepWorkflow(preferredModel?: ModelConfig): Workflow {
  const model = preferredModel ?? DEFAULT_MODEL;
  const startId = uuidv4(),
    extractorId = uuidv4(),
    guideLoopId = uuidv4(),
    guideCreatorId = uuidv4(),
    reviewerId = uuidv4(),
    quizId = uuidv4(),
    endId = uuidv4();
  return {
    id: uuidv4(),
    name: "Exam Prep Engine",
    description: "Turns notes into a study guide and practice test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: "start", position: { x: 60, y: 250 }, data: {} },
      {
        id: extractorId,
        type: "agent",
        position: { x: 250, y: 250 },
        data: agentFromTemplate("knowledge-extractor", {
          model: { ...model },
          toolsEnabled: ["list_directory", "read_file"] as ToolNameId[],
        }),
      },
      {
        id: guideLoopId,
        type: "loop",
        position: { x: 500, y: 150 },
        data: {
          targetNodeId: guideCreatorId,
          reviewerNodeId: reviewerId,
          maxRetries: 2,
          exitCondition: "reviewer_approves",
        },
      },
      {
        id: guideCreatorId,
        type: "agent",
        position: { x: 30, y: 70 },
        parentId: guideLoopId,
        extent: "parent",
        data: agentFromTemplate("study-guide-creator", {
          model: { ...model },
          toolsEnabled: ["write_file"] as ToolNameId[],
        }),
      },
      {
        id: reviewerId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: guideLoopId,
        extent: "parent",
        data: agentFromTemplate("editor", { model: { ...model } }),
      },
      {
        id: quizId,
        type: "agent",
        position: { x: 1100, y: 250 },
        data: agentFromTemplate("quiz-generator", {
          model: { ...model },
          toolsEnabled: ["write_file"] as ToolNameId[],
        }),
      },
      { id: endId, type: "end", position: { x: 1350, y: 250 }, data: {} },
    ],
    edges: [
      {
        id: uuidv4(),
        sourceNodeId: startId,
        targetNodeId: extractorId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: extractorId,
        targetNodeId: guideLoopId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: guideLoopId,
        targetNodeId: quizId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: quizId,
        targetNodeId: endId,
        contextMode: "full",
      },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

// 4. Creator's Echo (Creative Content)
export function creatorsEchoWorkflow(preferredModel?: ModelConfig): Workflow {
  const model = preferredModel ?? DEFAULT_MODEL;
  const startId = uuidv4(),
    minerId = uuidv4(),
    repurposerLoopId = uuidv4(),
    copywriterId = uuidv4(),
    editorId = uuidv4(),
    formatterId = uuidv4(),
    endId = uuidv4();
  return {
    id: uuidv4(),
    name: "Creator's Echo",
    description:
      "Turns long-form content into a packaged week of social media posts",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: "start", position: { x: 60, y: 250 }, data: {} },
      {
        id: minerId,
        type: "agent",
        position: { x: 250, y: 250 },
        data: agentFromTemplate("content-miner", {
          model: { ...model },
          toolsEnabled: ["list_directory", "read_file"] as ToolNameId[],
        }),
      },
      {
        id: repurposerLoopId,
        type: "loop",
        position: { x: 500, y: 150 },
        data: {
          targetNodeId: copywriterId,
          reviewerNodeId: editorId,
          maxRetries: 2,
          exitCondition: "reviewer_approves",
        },
      },
      {
        id: copywriterId,
        type: "agent",
        position: { x: 30, y: 70 },
        parentId: repurposerLoopId,
        extent: "parent",
        data: agentFromTemplate("social-repurposer", { model: { ...model } }),
      },
      {
        id: editorId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: repurposerLoopId,
        extent: "parent",
        data: agentFromTemplate("editor", { model: { ...model } }),
      },
      {
        id: formatterId,
        type: "agent",
        position: { x: 1100, y: 250 },
        data: agentFromTemplate("social-formatter", {
          model: { ...model },
          toolsEnabled: ["create_directory", "write_file"] as ToolNameId[],
        }),
      },
      { id: endId, type: "end", position: { x: 1350, y: 250 }, data: {} },
    ],
    edges: [
      {
        id: uuidv4(),
        sourceNodeId: startId,
        targetNodeId: minerId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: minerId,
        targetNodeId: repurposerLoopId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: repurposerLoopId,
        targetNodeId: formatterId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: formatterId,
        targetNodeId: endId,
        contextMode: "full",
      },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

// 5. Life Admin Assistant (Productivity)
export function lifeAdminWorkflow(preferredModel?: ModelConfig): Workflow {
  const model = preferredModel ?? DEFAULT_MODEL;
  const startId = uuidv4(),
    sorterId = uuidv4(),
    processorId = uuidv4(),
    endId = uuidv4();
  return {
    id: uuidv4(),
    name: "Life Admin Assistant",
    description:
      "Processes messy notes and receipts into Action Plans and CSVs",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: "start", position: { x: 60, y: 150 }, data: {} },
      {
        id: sorterId,
        type: "agent",
        position: { x: 300, y: 150 },
        data: agentFromTemplate("inbox-sorter", {
          model: { ...model },
          toolsEnabled: ["list_directory", "read_file"] as ToolNameId[],
        }),
      },
      {
        id: processorId,
        type: "agent",
        position: { x: 600, y: 150 },
        data: agentFromTemplate("task-processor", {
          model: { ...model },
          toolsEnabled: ["write_file"] as ToolNameId[],
        }),
      },
      { id: endId, type: "end", position: { x: 900, y: 150 }, data: {} },
    ],
    edges: [
      {
        id: uuidv4(),
        sourceNodeId: startId,
        targetNodeId: sorterId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: sorterId,
        targetNodeId: processorId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: processorId,
        targetNodeId: endId,
        contextMode: "full",
      },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}
