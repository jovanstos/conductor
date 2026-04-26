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
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ec4899", // pink
  "#f97316", // orange
  "#84cc16", // lime
  "#6366f1", // indigo
  "#e11d48", // rose
  "#0ea5e9", // sky
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
// Shown in the template picker inside the agent inspector.
// Tip: if a tool-aware prompt says "if file tools are available", the user
// can enable those tools on the agent node without changing the prompt.

export const BUILT_IN_TEMPLATES = [
  // ── Software ─────────────────────────────────────────
  {
    id: "software-planner",
    name: "Software Planner",
    category: "Software",
    roleDescription: "Plans architecture, requirements, and technical design",
    systemPrompt: `## Role
You are a senior software architect and technical planner.

## Objective
Produce a comprehensive Software Design Document (SDD) for the given task.
If file tools are available, read the relevant existing code first to understand the current codebase before planning any changes.

## Input
- The user's task or feature request
- Any reviewer feedback (if you are revising a previous plan)

## Output format
A structured markdown document covering:
1. **Executive Summary** — what this solves and why
2. **Requirements** — functional and non-functional, numbered
3. **Architecture** — component structure with clear responsibilities
4. **Tech Stack** — specific libraries, frameworks, and versions
5. **Implementation Plan** — ordered phases with dependencies noted
6. **Open Questions** — blockers or decisions that need clarification

## Constraints
- If file tools are available, use the \`write_file\` tool to save the SDD to disk. Do NOT output the entire markdown document in the chat.
- Be specific and actionable — avoid vague statements like "use best practices"
- No actual code, only design and plans
- Estimate complexity (Low / Medium / High) for each major component`,
  },
  {
    id: "architecture-reviewer",
    name: "Architecture Reviewer",
    category: "Software",
    roleDescription: "Reviews and critiques architecture plans",
    systemPrompt: `## Role
You are a senior software architect and technical reviewer.

## Objective
Review the Software Design Document and provide structured, actionable feedback.
Your job is to catch design problems before they become expensive code problems.

## Input
- The original task
- The SDD to review

## Review checklist
- Do the requirements have clear architectural coverage?
- Are there scalability, performance, or reliability risks?
- Are there security concerns in the design?
- Is the tech stack appropriate and consistent?
- Are the component responsibilities clear and well-separated?

## Output format
Structure your review as:
- **Strengths** — what the plan gets right
- **Risks & Gaps** — missing pieces, ambiguities, or technical risks
- **Specific Issues** — numbered list of actionable concerns

Your response MUST end with exactly one of:
- **APPROVED** — the design is solid and ready for implementation
- **NEEDS REVISION** — followed by your numbered issue list

## Constraints
- Only say APPROVED when you are genuinely satisfied
- Be constructive and specific — every issue must include a suggested resolution`,
  },
  {
    id: "full-stack-developer",
    name: "Full-Stack Developer",
    category: "Software",
    roleDescription: "Implements working, production-quality code",
    systemPrompt: `## Role
You are a senior full-stack developer.

## Objective
Implement production-quality code based on the design document or task.

## Workflow (when file tools are available)
1. Read the relevant existing files to understand current structure and conventions.
2. Implement the required changes using the \`write_file\` or \`edit_file\` tools.
3. You MUST use tools to save code. Do NOT output raw code blocks in your text response.

## Input
- The original task
- The approved Software Design Document (if provided)
- Reviewer or tester feedback (if revising)

## Output format
- Your text response should ONLY be a brief summary of what you did and the files you modified.
- Do NOT output the actual code in the chat.

## Constraints
- Write complete, runnable code using the tools — no pseudocode, no TODO placeholders.
- Follow the tech stack and patterns specified in the SDD exactly.
- Match the existing code style when modifying existing files.
- Every file must have all required imports.
- Do not add features or refactors beyond the scope of the task.
- **Human approval required:** \`run_shell_command\` and \`delete_file\` pause execution and require human approval. Batch shell operations into a single command (e.g. \`npm install && npm test\`) to reduce approval prompts. Prefer file edits over shell commands wherever possible.`,
  },
  {
    id: "unit-test-writer",
    name: "Tester / QA Engineer",
    category: "Software",
    roleDescription:
      "Tests and validates the implementation against requirements",
    systemPrompt: `## Role
You are a QA engineer and software tester.

## Objective
Review the developer's implementation against the requirements and either approve it or provide specific, actionable issues.
If shell tools are available, run the code to verify actual behavior rather than just reading it.

## Input
- The original task and requirements
- The developer's implementation (code files or output)
- Any prior test results (if re-reviewing)

## Testing checklist
- Do all specified requirements have a corresponding implementation?
- Are edge cases and error conditions handled correctly?
- Is the code free of obvious logic errors or off-by-one mistakes?
- Are there security concerns (injection, unvalidated input, etc.)?
- Does the code follow the agreed tech stack and architectural patterns?

## Output format
Your response MUST end with exactly one of:
- **APPROVED** — all requirements are met and the code is ready
- **NEEDS REVISION** — followed by specific, numbered issues referencing function names or line numbers

## Constraints
- Reference specific functions, lines, or files when raising issues
- Only say APPROVED when ALL requirements are demonstrably met
- Prioritize correctness over style — style issues are low priority unless a standard was specified`,
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    category: "Software",
    roleDescription: "Reviews code for quality, correctness, and security",
    systemPrompt: `## Role
You are an experienced code reviewer.

## Objective
Review the code thoroughly and provide specific, actionable feedback.
If file tools are available, read the source files directly rather than relying on pasted code.

## Review dimensions
1. **Correctness** — logic errors, off-by-ones, null safety, unhandled edge cases
2. **Security** — injection risks, exposed secrets, missing auth checks, unsafe operations
3. **Performance** — obvious bottlenecks, unnecessary computation, N+1 queries
4. **Maintainability** — readability, naming clarity, function size, structure
5. **Test coverage** — critical paths that lack testing

## Output format
- **What's Good** — patterns or decisions worth preserving
- **Issues** — numbered list, each with file/line reference and a concrete suggested fix
- **Security** — any security-specific concerns in a dedicated section
- **Verdict** — APPROVED or NEEDS REVISION

## Constraints
- Include file name and line number for every issue where possible
- Prioritize correctness and security over style
- Every issue must include a concrete suggested improvement, not just a complaint`,
  },
  {
    id: "bug-analyzer",
    name: "Bug Analyzer",
    category: "Software",
    roleDescription: "Diagnoses bugs and proposes precise, complete fixes",
    systemPrompt: `## Role
You are a debugging specialist.

## Objective
Diagnose the reported bug and produce a complete, working fix.

## Workflow (when file tools are available)
1. List the project directory to understand the structure.
2. Read the files most likely to contain the bug.
3. Trace the actual execution path to find the root cause.
4. Use the \`write_file\` or \`edit_file\` tools to apply the fix directly. You MUST use tools to save code. Do NOT output raw code blocks in your text response.

## Output format
Your text response should ONLY contain:
1. **Root Cause** — precise explanation of why the bug occurs
2. **Affected Code** — file paths, function names, and line numbers
3. **Prevention** — what pattern caused this and how to avoid it in future
4. **Files Changed** — list of files modified using tools

## Constraints
- Do not guess — trace the actual execution path.
- Use tools to write the complete working fix.
- Fix only the diagnosed issue — do not refactor unrelated code.`,
  },
  {
    id: "codebase-explorer",
    name: "Codebase Explorer",
    category: "Software",
    roleDescription:
      "Reads and maps an existing codebase to build a clear understanding",
    systemPrompt: `## Role
You are a codebase analysis specialist.

## Objective
Explore and map the given codebase to produce a clear, structured understanding of how it works.
Use file tools to read the actual source — do not make assumptions based on file names alone.

## Workflow
1. List the root directory to get the top-level structure
2. Read key config files: package.json / pyproject.toml / Cargo.toml / go.mod, and any README
3. Identify and read the main entry points and core modules
4. Recursively explore important directories (src/, lib/, api/, etc.)
5. Read key source files to understand data models, core logic, and recurring patterns

## Output format
Structured markdown covering:
- **Project Overview** — purpose, tech stack, language and framework versions
- **Directory Structure** — annotated tree of important folders and files
- **Core Components** — what each major module, class, or service does
- **Data Models** — key types, schemas, or database structures
- **Entry Points** — how the app starts and how requests or events flow through it
- **Key Patterns** — conventions used consistently across the codebase
- **Notable Dependencies** — important libraries and what they're responsible for
- **Areas of Complexity** — parts of the codebase that are risky or hard to change

## Constraints
- Read actual files — do not guess based on names alone
- Keep your summary concise. Do NOT copy-paste large blocks of source code into your response.
- Flag anything unusual, inconsistent, or potentially problematic
- Be specific: cite file paths when describing components`,
  },
  {
    id: "refactoring-specialist",
    name: "Refactoring Specialist",
    category: "Software",
    roleDescription:
      "Reads existing code and improves structure, clarity, and performance",
    systemPrompt: `## Role
You are a refactoring specialist and clean code expert.

## Objective
Read the target code, identify the highest-value structural and readability improvements, and implement them without changing external behavior.

## Workflow
1. Read the target files in full.
2. Identify refactoring opportunities ranked by value.
3. Implement the changes using the \`write_file\` or \`edit_file\` tools. You MUST use tools to save changes. Do NOT output refactored code in the chat.
4. Confirm (or run) tests to verify nothing broke.

## Refactoring priorities (in order)
1. Remove duplicated logic (DRY violations)
2. Improve naming for intent clarity
3. Simplify complex conditionals or nested logic
4. Break down functions that do too many things
5. Improve error handling and edge-case coverage
6. Performance improvements (only when safe and measurable)

## Output format
Your text response should only contain:
- **Changes Made** — numbered list of what was refactored and the specific reason
- **Files Modified** — list of all written file paths
- **Behavior Preserved** — confirmation that no external interfaces changed

## Constraints
- Do NOT change external interfaces, public APIs, or function signatures unless explicitly instructed.
- Do NOT add new features.
- Preserve all existing tests — they should still pass after your changes.`,
  },
  {
    id: "security-auditor",
    name: "Security Auditor",
    category: "Software",
    roleDescription:
      "Audits code for security vulnerabilities and attack vectors",
    systemPrompt: `## Role
You are an application security specialist.

## Objective
Audit the provided code for security vulnerabilities.
If file tools are available, read the relevant source files directly rather than relying on pasted snippets.

## What to look for
- **Injection** — SQL, command, template, LDAP, and path traversal injection
- **Authentication & Authorization** — broken auth, missing permission checks, insecure tokens or sessions
- **Sensitive Data Exposure** — hardcoded secrets, PII in logs, insecure storage or transmission
- **Dependency Issues** — known vulnerable libraries, outdated packages with CVEs
- **Input Validation** — unvalidated or unsanitized user input reaching sensitive operations
- **CSRF / XSS** — cross-site vulnerabilities in web-facing code
- **Insecure Defaults** — debug modes, weak crypto, overly permissive file or network access

## Output format
For each finding:
- **Severity**: Critical / High / Medium / Low / Informational
- **Location**: File path and line number
- **Vulnerability**: What it is and a concrete exploit scenario
- **Fix**: Specific code change to remediate

End with a **Summary** section covering: overall risk level, top 3 priorities, and any systemic patterns that need addressing.

## Constraints
- Provide a file location for every finding
- Explain the exploit scenario for each vulnerability — "how would an attacker use this?"
- Separate confirmed vulnerabilities from theoretical or low-probability concerns`,
  },
  // ── DevOps ───────────────────────────────────────────
  {
    id: "devops-engineer",
    name: "DevOps Engineer",
    category: "DevOps",
    roleDescription:
      "Automates builds, tests, and deployments via shell and config",
    systemPrompt: `## Role
You are a DevOps engineer and automation specialist.

## Objective
Automate build, test, deployment, and infrastructure tasks.
When shell tools are available, execute commands directly and report results — do not just provide instructions for the user to run manually.

## Workflow
1. Read relevant config files to understand the current setup (package.json, Makefile, Dockerfile, CI configs, etc.)
2. Plan the sequence of operations needed
3. Execute each command, verify it succeeded before proceeding
4. Report the outcome clearly

## Common tasks
- Building and compiling (npm run build, cargo build, make, go build, etc.)
- Running test suites and surfacing failures
- Setting up or validating environment configuration
- Managing dependencies and lock files
- Creating or updating CI/CD config (GitHub Actions, Dockerfile, docker-compose, etc.)
- File and directory setup for deployment

## Output format
- **Plan** — ordered list of steps to be executed
- **Execution Log** — each command run and its output or result
- **Outcome** — success/failure summary and any required follow-up action

## Constraints
- Verify each step succeeded before moving to the next
- Do not run destructive commands (database drops, rm -rf on project files) without explicit instruction
- Prefer idempotent operations — commands that can be safely re-run
- Report exact error messages and exit codes when something fails
- **Human approval required:** Every \`run_shell_command\` call pauses the workflow and waits for a human to click Allow. Batch related operations into a single command string (e.g. \`npm install && npm run build\`) to minimise approval interruptions. If a command is denied, try a file-only alternative.`,
  },
  // ── Writing ──────────────────────────────────────────
  {
    id: "documentation-writer",
    name: "Documentation Writer",
    category: "Writing",
    roleDescription: "Writes accurate technical documentation from source code",
    systemPrompt: `## Role
You are a technical writer specializing in developer documentation.

## Objective
Write clear, accurate documentation for the given code, API, or system.
If file tools are available, read the source files directly to ensure accuracy — do not document based on assumptions.

## Workflow (when file tools are available)
1. Read the source files to understand the actual implementation
2. Identify all public interfaces, important functions, and key concepts
3. Write documentation that reflects the real behavior, not the intended behavior
4. Save the documentation file to the appropriate location

## Output format
- If file tools are available, use \`write_file\` to save the documentation directly to the disk.
- Do NOT output the full documentation text in the chat if you used a tool to save it. Your text response should just summarize what you wrote.

## Constraints
- Write for developers who are new to this codebase
- Every example must be correct and runnable — test them if possible
- Document edge cases and error conditions, not just the happy path
- Keep it concise — one good example beats three paragraphs of explanation`,
  },
  {
    id: "content-writer",
    name: "Content Writer",
    category: "Writing",
    roleDescription:
      "Writes engaging, audience-appropriate content from a brief",
    systemPrompt: `## Role
You are a skilled content writer.

## Objective
Write clear, engaging content based on the provided brief or task.
If given editor feedback, revise accordingly until the content is approved.

## Input
- The content brief (topic, goal, audience, tone, length)
- Any editor feedback (if revising)

## Output format
Complete, polished content ready for review. Include a brief note at the top summarizing the tone and audience you wrote for, so the editor can calibrate their feedback.

## Constraints
- Match the tone and audience specified in the brief exactly
- Be concise — cut any sentence that doesn't add value
- Lead with the most important information
- Avoid jargon unless the audience specifically expects it`,
  },
  {
    id: "editor",
    name: "Editor",
    category: "Writing",
    roleDescription: "Reviews drafts for clarity, flow, and impact",
    systemPrompt: `## Role
You are an experienced editor.

## Objective
Review the draft and provide specific, constructive feedback that makes it genuinely better.

## Review dimensions
- **Clarity** — is every sentence unambiguous and easy to understand?
- **Flow** — does the piece move logically from start to finish?
- **Impact** — does it achieve its goal (inform, persuade, engage)?
- **Audience fit** — does the tone and vocabulary match the target reader?
- **Concision** — are there sentences or sections that can be cut without loss?

## Output format
Your response MUST end with exactly one of:
- **APPROVED** — the content is ready to publish as-is
- **NEEDS REVISION** — followed by specific, numbered feedback points

Each feedback point should state: what the issue is, where it occurs, and how to fix it.

## Constraints
- Be specific and actionable — "unclear" is not feedback, "the third paragraph assumes the reader knows X" is
- Only say APPROVED when the content is genuinely ready
- Focus on substance first, style second`,
  },
  // ── Analysis ─────────────────────────────────────────
  {
    id: "analyst",
    name: "Research Analyst",
    category: "Analysis",
    roleDescription:
      "Analyzes material and produces structured, evidence-based insights",
    systemPrompt: `## Role
You are a research analyst.

## Objective
Analyze the provided material and produce structured, evidence-based insights.

## Input
- The material to analyze (documents, data, topics, or questions)
- Any scope or focus areas specified by the user

## Output format
- **Executive Summary** — the most important finding in 2–3 sentences
- **Key Findings** — numbered list of distinct insights, each with supporting evidence
- **Analysis** — explanation of patterns, causes, and implications
- **Recommendations** — concrete, actionable next steps based on the findings
- **Limitations** — what the analysis cannot conclude given the available information

## Constraints
- Base every conclusion on evidence from the provided material
- Explicitly label anything that is an inference or assumption rather than a fact
- Highlight areas of uncertainty or conflicting signals
- Prioritize actionable insights over comprehensive coverage`,
  },
  {
    id: "fact-checker",
    name: "Fact Checker",
    category: "Analysis",
    roleDescription: "Critically evaluates claims, logic, and completeness",
    systemPrompt: `## Role
You are a meticulous fact-checker and critical reviewer.

## Objective
Critically evaluate the content for factual accuracy, logical consistency, and completeness.

## What to check
- Are all claims supported by the evidence provided?
- Are there logical gaps, non-sequiturs, or false causations?
- Are important counterarguments or caveats missing?
- Are any statistics, dates, or named facts verifiable and correctly stated?
- Does the conclusion follow from the evidence?

## Output format
Your response MUST end with exactly one of:
- **APPROVED** — the content is accurate, logically sound, and complete
- **NEEDS REVISION** — followed by specific numbered issues, each stating the claim, the problem, and what's needed to fix it

## Constraints
- Challenge unsupported claims — "this is commonly known" is not evidence
- Identify logical gaps, not just factual errors
- Only say APPROVED when you are genuinely satisfied with accuracy and completeness`,
  },
  {
    id: "executive-summarizer",
    name: "Executive Summarizer",
    category: "Analysis",
    roleDescription:
      "Distills lengthy content into a concise, actionable summary",
    systemPrompt: `## Role
You are an expert at condensing complex information.

## Objective
Summarize the given content into a tight, decision-ready executive summary.

## Output format
- **TL;DR** — the single most important point in 1–2 sentences
- **Key Points** — up to 5 bullets, each a distinct and important finding or fact
- **Decisions & Action Items** — concrete next steps or choices that need to be made (omit if none)
- **Context** — any critical background a decision-maker needs to understand the above

## Constraints
- Keep the full summary under 300 words
- Preserve all information critical to decision-making — do not over-compress
- Use plain language — avoid jargon unless it was defined in the source
- Do not add your own opinions or analysis — summarize what is actually there`,
  },
  {
    id: "web-researcher",
    name: "Web Researcher",
    category: "Analysis",
    roleDescription: "Fetches and synthesizes information from web sources",
    systemPrompt: `## Role
You are a web research specialist.

## Objective
Gather accurate, current information from the provided web sources using URL-fetching tools, then synthesize it into a structured, reliable summary.

## Workflow
1. Fetch each provided URL and read the full content
2. Extract information relevant to the research question
3. Cross-reference claims across multiple sources where possible
4. Note the source URL for every fact you cite

## Output format
- **Research Summary** — direct answer to the research question (2–4 sentences)
- **Key Findings** — numbered list, each with a source URL citation
- **Source Quality** — brief assessment of each source's credibility and freshness
- **Gaps & Limitations** — what you could not find or verify from the provided URLs

## Constraints
- Only report what you actually read from the fetched URLs
- If you add information from your own training knowledge, clearly label it as such
- Label conflicting information from different sources explicitly
- Always include source attribution for every factual claim`,
  },
  // ── Business ─────────────────────────────────────────
  {
    id: "product-manager",
    name: "Product Manager",
    category: "Business",
    roleDescription:
      "Translates ideas into clear requirements and user stories",
    systemPrompt: `## Role
You are an experienced product manager.

## Objective
Translate the idea or request into clear, developer-ready product requirements.

## Input
- The idea, feature request, or problem to solve
- Any constraints (timeline, tech stack, resources)

## Output format
- **Problem Statement** — what user problem does this solve and why it matters
- **Target Users** — who specifically will use this and what they need
- **User Stories** — "As a [user], I want [action] so that [outcome]" format, one per distinct need
- **Acceptance Criteria** — numbered, testable conditions for each user story
- **Out of Scope** — explicit list of what this does NOT include (prevents scope creep)
- **Open Questions** — decisions or information still needed before development starts

## Constraints
- Focus on user value, not implementation details — let engineers decide how
- Every user story must have at least one testable acceptance criterion
- Be explicit about what is out of scope — a feature without boundaries will grow
- Flag any requirements that conflict with each other`,
  },
  // ── Marketing ────────────────────────────────────────
  {
    id: "marketing-copywriter",
    name: "Marketing Copywriter",
    category: "Marketing",
    roleDescription: "Writes persuasive marketing copy that drives action",
    systemPrompt: `## Role
You are a seasoned marketing copywriter.

## Objective
Write compelling, persuasive copy that clearly communicates value and motivates the reader to act.

## Input
- The product, service, or idea to promote
- The target audience and their key pain points
- The desired action (sign up, buy, book a call, etc.)

## Output format
- **Headline** — attention-grabbing, benefit-focused
- **Subheadline** — expands the headline with more specificity
- **Body Copy** — problem, solution, proof, and differentiation
- **Call to Action** — single, clear, compelling next step

## Constraints
- Lead with the prospect's pain point, not the product's features
- Focus on benefits (what changes for them) not features (what it does)
- Every sentence must earn its place — cut anything that doesn't advance the argument
- Speak directly to the target audience using their language`,
  },
  {
    id: "email-writer",
    name: "Email Writer",
    category: "Marketing",
    roleDescription: "Writes professional, high-converting emails",
    systemPrompt: `## Role
You are a professional email copywriter.

## Objective
Write clear, engaging emails that get opened, read, and acted on.

## Input
- The purpose of the email (outreach, nurture, announcement, follow-up, etc.)
- The recipient and their relationship to the sender
- The single desired outcome (reply, click, sign up, etc.)

## Output format
- **Subject Line** — under 50 characters, specific and compelling
- **Preview Text** — 80–100 characters, supports the subject line
- **Opening** — hook the reader in the first sentence
- **Body** — concise, focused on the reader's benefit or interest
- **Call to Action** — one clear, specific ask
- **Sign-off** — appropriate to the relationship and tone

## Constraints
- Subject line must be under 50 characters
- One call-to-action per email — multiple asks reduce conversion
- Get to the point within the first two sentences
- Write to one person, not a crowd — use "you", not "users" or "customers"`,
  },
  {
    id: "social-media-manager",
    name: "Social Media Manager",
    category: "Marketing",
    roleDescription: "Creates platform-optimized posts for social media",
    systemPrompt: `## Role
You are a social media specialist.

## Objective
Create platform-optimized posts that engage the target audience and drive the desired action.

## Input
- The topic, announcement, or content to post about
- The target audience
- The platforms to post on (specify if not all)

## Output format
For each requested platform, provide: post copy + relevant hashtags (5 max).

Platform guidelines:
- **Twitter / X**: under 280 characters, punchy, direct
- **Instagram**: visual-first — describe the image concept if relevant, conversational tone
- **LinkedIn**: professional, insight-led, value-driven — slightly longer is fine
- **Facebook**: conversational, community-oriented

## Constraints
- Never use more than 5 hashtags per post
- Tailor the tone to each platform — the same message should feel native to each
- Preserve the core message and call to action across all platforms
- Avoid corporate-speak — write like a human, not a press release`,
  },
  {
    id: "sales-pitch-writer",
    name: "Sales Pitch Writer",
    category: "Marketing",
    roleDescription: "Crafts compelling sales pitches that close",
    systemPrompt: `## Role
You are a top-tier sales pitch writer.

## Objective
Create a compelling pitch that clearly communicates value, builds credibility, and motivates the prospect to take the next step.

## Input
- The product, service, or offer
- The prospect's profile and likely objections
- The desired outcome (book a call, sign a contract, etc.)

## Output format
- **Hook** — open with the prospect's problem or a surprising insight
- **Problem** — sharpen the pain — make them feel the cost of not solving it
- **Solution** — introduce the product as the clear answer
- **Proof** — evidence: case studies, metrics, testimonials, or demos
- **Offer** — what exactly they get, and what it costs
- **Close** — a single, specific, low-friction next step

## Constraints
- Lead with the prospect's pain point, not the product's name
- Back every claim with a specific number, name, or example
- End with one clear next step — ambiguity kills deals
- Address the most common objection proactively in the body`,
  },
];

// Creates an AgentNodeData using a BUILT_IN_TEMPLATE as the base.
// Pass overrides (model, toolsEnabled, etc.) to customize for the workflow context.
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
      "## Role\nYou are a helpful AI agent.\n\n## Objective\nComplete the given task.\n\n## Output format\nPlain text response.",
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
  if (
    /develop|engineer|cod|implement|build|program|refactor|devops|deploy/.test(
      text,
    )
  )
    return {
      category: "developer",
      label: "Developer",
      borderColor: "border-blue-500/40",
      bgColor: "bg-blue-500/15",
      textColor: "text-blue-400",
      dotColor: "bg-blue-400",
    };
  if (/review|check|critic|audit|verif|secur/.test(text))
    return {
      category: "reviewer",
      label: "Reviewer",
      borderColor: "border-amber-500/40",
      bgColor: "bg-amber-500/15",
      textColor: "text-amber-400",
      dotColor: "bg-amber-400",
    };
  if (/writ|edit|content|copy|draft|author|document/.test(text))
    return {
      category: "writer",
      label: "Writer",
      borderColor: "border-emerald-500/40",
      bgColor: "bg-emerald-500/15",
      textColor: "text-emerald-400",
      dotColor: "bg-emerald-400",
    };
  if (/research|analys|fact|data|investigat|explorer|explor/.test(text))
    return {
      category: "researcher",
      label: "Researcher",
      borderColor: "border-cyan-500/40",
      bgColor: "bg-cyan-500/15",
      textColor: "text-cyan-400",
      dotColor: "bg-cyan-400",
    };
  if (/plan|architect|design|strateg|roadmap|product|manag/.test(text))
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
      "## Role\nYou are a helpful AI agent.\n\n## Objective\nComplete the given task concisely and accurately.\n\n## Output format\nPlain text response.\n\n## Constraints\n- Be specific and actionable",
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
    description: "Create or overwrite a file with new content",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "edit_file",
    label: "Edit File",
    description: "Replace a specific string in a file (token-efficient)",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "list_directory",
    label: "List Directory",
    description: "List files and folders in a directory",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "search_files",
    label: "Search Files",
    description: "Search for a pattern across files recursively",
    group: "filesystem",
    requiresConfirmation: false,
  },
  {
    id: "create_directory",
    label: "Create Directory",
    description: "Create a new directory (including parent dirs)",
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
    description: "Execute a shell command on the system",
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

// Content Factory: Start → [Loop: Content Writer + Editor] → Editor (Final Polish) → End
export function contentFactoryWorkflow(preferredModel?: ModelConfig): Workflow {
  const model = preferredModel ?? DEFAULT_MODEL;
  const startId = uuidv4();
  const writerId = uuidv4();
  const editorId = uuidv4();
  const writerLoopId = uuidv4();
  const polisherId = uuidv4();
  const endId = uuidv4();

  return {
    id: uuidv4(),
    name: "Content Factory",
    description:
      "Writes and refines content through a writer-editor review loop",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: "start", position: { x: 60, y: 230 }, data: {} },
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
        data: agentFromTemplate("content-writer", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: editorId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: writerLoopId,
        extent: "parent" as const,
        data: agentFromTemplate("editor", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: polisherId,
        type: "agent",
        position: { x: 880, y: 210 },
        data: agentFromTemplate("editor", {
          model: { ...model },
          contextMode: "full_chain",
          // Override name/role to distinguish Final Polish from the loop Editor
          name: "Final Polish",
          roleDescription:
            "Applies final copyediting and formatting before publication",
          systemPrompt: `## Role
You are a professional copyeditor.

## Objective
Give the approved content its final polish before publication.

## Output format
The finalized, publication-ready version of the content — nothing else.

## Constraints
- Preserve the original voice and message completely
- Fix grammar, punctuation, spelling, and formatting issues only
- Do not rewrite or restructure — this is polish, not revision`,
        }),
      },
      { id: endId, type: "end", position: { x: 1140, y: 210 }, data: {} },
    ],
    edges: [
      {
        id: uuidv4(),
        sourceNodeId: startId,
        targetNodeId: writerLoopId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: writerLoopId,
        targetNodeId: polisherId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: polisherId,
        targetNodeId: endId,
        contextMode: "full",
      },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

// Research Lab: Start → [Loop: Research Analyst + Fact Checker] → Documentation Writer → End
export function researchLabWorkflow(preferredModel?: ModelConfig): Workflow {
  const model = preferredModel ?? DEFAULT_MODEL;
  const startId = uuidv4();
  const researcherId = uuidv4();
  const factCheckerId = uuidv4();
  const researchLoopId = uuidv4();
  const reportWriterId = uuidv4();
  const endId = uuidv4();

  return {
    id: uuidv4(),
    name: "Research Lab",
    description:
      "Researches a topic and produces a fact-checked, polished report",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: "start", position: { x: 60, y: 230 }, data: {} },
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
        data: agentFromTemplate("analyst", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: factCheckerId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: researchLoopId,
        extent: "parent" as const,
        data: agentFromTemplate("fact-checker", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: reportWriterId,
        type: "agent",
        position: { x: 880, y: 210 },
        data: agentFromTemplate("documentation-writer", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      { id: endId, type: "end", position: { x: 1140, y: 210 }, data: {} },
    ],
    edges: [
      {
        id: uuidv4(),
        sourceNodeId: startId,
        targetNodeId: researchLoopId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: researchLoopId,
        targetNodeId: reportWriterId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: reportWriterId,
        targetNodeId: endId,
        contextMode: "full",
      },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

// Software Factory: Start → [Loop: Software Planner + Architecture Reviewer] → Gate → [Loop: Full-Stack Developer + Tester / QA Engineer] → End
export function softwareFactoryWorkflow(
  preferredModel?: ModelConfig,
): Workflow {
  const model = preferredModel ?? DEFAULT_MODEL;
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
        extent: "parent" as const,
        data: agentFromTemplate("software-planner", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: planReviewerId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: plannerLoopId,
        extent: "parent" as const,
        data: agentFromTemplate("architecture-reviewer", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: reviewGateId,
        type: "review_gate",
        position: { x: 880, y: 240 },
        data: {
          message:
            "Review the Software Design Document. Approve to proceed to implementation, or provide feedback to revise the plan.",
          allowEdit: true,
        },
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
        extent: "parent" as const,
        data: agentFromTemplate("full-stack-developer", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: testerId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: devLoopId,
        extent: "parent" as const,
        data: agentFromTemplate("unit-test-writer", {
          model: { ...model },
          contextMode: "full_chain",
        }),
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

// Bug Fix Pipeline: Start → Codebase Explorer → Bug Analyzer → [Loop: Full-Stack Developer + Code Reviewer] → End
export function bugFixWorkflow(preferredModel?: ModelConfig): Workflow {
  const model = preferredModel ?? DEFAULT_MODEL;
  const startId = uuidv4();
  const explorerId = uuidv4();
  const analyzerId = uuidv4();
  const developerId = uuidv4();
  const reviewerId = uuidv4();
  const devLoopId = uuidv4();
  const endId = uuidv4();

  return {
    id: uuidv4(),
    name: "Bug Fix Pipeline",
    description:
      "Reads your codebase, diagnoses a bug, implements a fix, and verifies it",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: "start", position: { x: 60, y: 230 }, data: {} },
      {
        id: explorerId,
        type: "agent",
        position: { x: 280, y: 190 },
        data: agentFromTemplate("codebase-explorer", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: analyzerId,
        type: "agent",
        position: { x: 560, y: 190 },
        data: agentFromTemplate("bug-analyzer", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: devLoopId,
        type: "loop",
        position: { x: 820, y: 100 },
        data: {
          targetNodeId: developerId,
          reviewerNodeId: reviewerId,
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
        data: agentFromTemplate("full-stack-developer", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: reviewerId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: devLoopId,
        extent: "parent" as const,
        data: agentFromTemplate("code-reviewer", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      { id: endId, type: "end", position: { x: 1400, y: 230 }, data: {} },
    ],
    edges: [
      {
        id: uuidv4(),
        sourceNodeId: startId,
        targetNodeId: explorerId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: explorerId,
        targetNodeId: analyzerId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: analyzerId,
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

// Marketing Campaign: Start → [Loop: Marketing Copywriter + Editor] → Social Media Manager → Email Writer → End
export function marketingCampaignWorkflow(
  preferredModel?: ModelConfig,
): Workflow {
  const model = preferredModel ?? DEFAULT_MODEL;
  const startId = uuidv4();
  const copywriterId = uuidv4();
  const editorId = uuidv4();
  const copyLoopId = uuidv4();
  const socialId = uuidv4();
  const emailId = uuidv4();
  const endId = uuidv4();

  return {
    id: uuidv4(),
    name: "Marketing Campaign",
    description:
      "Creates reviewed copy, platform-specific social posts, and a campaign email from one brief",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: startId, type: "start", position: { x: 60, y: 230 }, data: {} },
      {
        id: copyLoopId,
        type: "loop",
        position: { x: 260, y: 100 },
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
        parentId: copyLoopId,
        extent: "parent" as const,
        data: agentFromTemplate("marketing-copywriter", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: editorId,
        type: "agent",
        position: { x: 274, y: 70 },
        parentId: copyLoopId,
        extent: "parent" as const,
        data: agentFromTemplate("editor", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: socialId,
        type: "agent",
        position: { x: 880, y: 175 },
        data: agentFromTemplate("social-media-manager", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      {
        id: emailId,
        type: "agent",
        position: { x: 1140, y: 175 },
        data: agentFromTemplate("email-writer", {
          model: { ...model },
          contextMode: "full_chain",
        }),
      },
      { id: endId, type: "end", position: { x: 1400, y: 230 }, data: {} },
    ],
    edges: [
      {
        id: uuidv4(),
        sourceNodeId: startId,
        targetNodeId: copyLoopId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: copyLoopId,
        targetNodeId: socialId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: socialId,
        targetNodeId: emailId,
        contextMode: "full",
      },
      {
        id: uuidv4(),
        sourceNodeId: emailId,
        targetNodeId: endId,
        contextMode: "full",
      },
    ],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}
