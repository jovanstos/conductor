## Usage & Copyright

This repository is intended strictly for showcase purposes.

#### Ownership & Rights

All code and design assets within this repository are the property of Jovan Stosic.

### Restrictions

- No Repurposing: I do not grant permission for this code, design, or any associated assets to be repurposed, redistributed, or used as a template for other personal or commercial websites.

- No Unauthorized Use: Please do not download, clone, or fork this repository with the intent of claiming the work as your own or using it for your own personal site.

I kindly ask that you respect the integrity of this work. If you find the code helpful for learning, I encourage you to use it as inspiration to build something unique of your own rather than copying this implementation. Thank you!

---

# Conductor

**Local AI agents that work directly on your computer. Chain them together. Run any task, start to finish.**

Conductor is an agent-first desktop platform for building and running multi-agent AI workflows. Three modes of operation in a single app:

- **Workflow Canvas** — a visual, node-based pipeline builder where specialist AI agents read, write, and modify real files on your local machine, handing work to each other in sequence with configurable loops, human review gates, and a strict security sandbox.
- **The Chamber** — a multi-agent thinking room where models compete, debate, or collaborate on the same task simultaneously, with live streaming output, peer scoring, and a ranked final result.
- **Studio** — an interactive brainstorming space where you talk through any idea with an AI consultant, refine it collaboratively, and generate a comprehensive, downloadable plan document.

Built with Tauri 2, React 19, and Rust — fully local, no cloud dependency, no subscription. Your API keys stay on your machine.

---

## What it does

### Workflow Canvas

- **Visual pipeline builder** — drag-and-drop nodes onto a canvas, connect them left-to-right, build arbitrarily complex agent pipelines
- **Agent nodes** — each agent has its own name, role description, system prompt, model, and context mode; load from the built-in template library or write your own
- **Full tool access by default** — every agent can read, write, edit, search, and create files, run shell commands, and fetch URLs out of the box; restrict specific tools per-agent in the inspector's Advanced section
- **Loop nodes** — wire a worker agent and a reviewer agent into a feedback loop; the loop exits when the reviewer approves or max retries is reached
- **Review gates** — pause execution mid-run for human inspection; review the files your agents created in the workspace, then approve to continue or send feedback back to the worker
- **Start / End nodes** — anchor points for task input and final output capture
- **Workspace anchoring** — every workflow is anchored to a real directory on your machine; the workspace bar is always visible so you know exactly where agents are operating; click it to change the directory at any time
- **Security sandbox** — all file operations are restricted to the workspace via canonicalized path checks (symlink-safe); shell commands and file deletions require explicit human approval before executing

### The Chamber

- **Blind Audition** — all agents generate solutions simultaneously (true parallel execution); each then acts as an impartial judge and scores every solution against the rubric; highest average score wins
- **War Room** — two agents debate for a configurable number of rounds: a Proposer generates/revises, a Critic finds flaws, back and forth until the solution is hardened
- **Syndicate** — agents contribute sequentially by specialty, each building on the previous agent's work to produce a single unified document
- **Live streaming arena** — see every agent's output stream in real time, side by side, with status indicators (Thinking / Typing / Critiquing / Done)
- **Review gate** — optionally pause between the generation and scoring phases for human inspection before scoring begins
- **Ranked ledger** — final scores, rankings, and the winning output displayed in the results panel; copy or save to file with one click

### Studio

- **Blank-page cure** — describe any idea in plain language (a trip to plan, a product to build, a goal to reach) and Studio handles the rest
- **Collaborative AI consultant** — Studio asks 1–2 focused questions at a time to draw out scope, constraints, goals, and resources; when you ask *it* a question it answers directly with its own recommendation and reasoning, rather than deflecting
- **Self-aware pacing** — Studio decides when it has enough context and generates the final document on its own, or you can trigger it any time with the "Generate Document" button
- **Comprehensive plan output** — the final document is rendered in clean Markdown with full heading hierarchy, bullet lists, tables, and code blocks; readable in-app
- **One-click download** — save the plan as a `.txt` file to your machine for use anywhere

### Shared capabilities

- **Multi-provider support** — Anthropic (Claude 4.x), OpenAI (GPT-4o), Ollama (local models), and any custom OpenAI-compatible API endpoint
- **24 built-in agent templates** — covering Software, DevOps, Writing, Analysis, Business, and Marketing roles; all with production-quality system prompts tuned for agentic file-system work
- **5 ready-to-run workflow templates** — Software Factory, Bug Fix Pipeline, Content Factory, Research Lab, Marketing Campaign; each pre-wires the right agents with full tool access
- **Native file dialogs** — save outputs as `.txt` or `.md`, export workspaces as `.zip`, browse folders — all through OS-native dialogs

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Canvas | [@xyflow/react](https://reactflow.dev) |
| Icons | [Lucide React](https://lucide.dev) |
| State management | Zustand v5 |
| Build tool | Vite 7 |
| HTTP / AI calls | reqwest (Rust, streaming SSE) |
| Concurrency | tokio (Rust async runtime) |
| File system | walkdir, zip, dunce (Rust) |
| Dialogs | tauri-plugin-dialog |

---

## Prerequisites

### System requirements

- **Windows 10/11**, macOS 12+, or Linux (tested on Ubuntu 22.04+)
- **Node.js** 18 or newer — [nodejs.org](https://nodejs.org)
- **Rust** (stable toolchain) — [rustup.rs](https://rustup.rs)
- **Tauri system dependencies** — follow [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
  - Windows: Microsoft Visual Studio C++ Build Tools + WebView2
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1`, `libssl`, `libayatana-appindicator3`

### API keys (at least one required)

Conductor calls AI providers directly from the Rust backend. You need at least one key configured in Settings before running agents.

| Provider | Where to get a key |
|---|---|
| Anthropic | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI | [platform.openai.com](https://platform.openai.com) |
| Ollama | No key needed — install [Ollama](https://ollama.com) and pull a model |
| Custom | Any OpenAI-compatible endpoint — add it in Settings → Custom Connections |

---

## Development setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd conductor

# 2. Install JavaScript dependencies
npm install

# 3. Start the dev server (Vite + Tauri hot reload)
npm run tauri dev
```

The first `tauri dev` takes a few minutes while Cargo downloads and compiles Rust dependencies. Subsequent starts are fast.

> **Hot reload:** React/TypeScript changes reload instantly. Rust changes (`src-tauri/src/`) trigger a recompile — typically 5–15 seconds.

### Project structure

```
conductor/
├── src/                            # React / TypeScript frontend
│   ├── App.tsx                     # Root layout, tab switching, workspace-aware run trigger
│   ├── components/
│   │   ├── canvas/                 # WorkflowCanvas, node components, DataEdge
│   │   ├── chamber/                # ChamberView, ChamberConfigPane, ChamberArena, ChamberLedger
│   │   ├── studio/                 # StudioView (chat, streaming, markdown renderer, download)
│   │   ├── inspector/              # Agent inspector, template picker, tool access controls
│   │   ├── run/                    # RunDrawer, modals (gate, tool confirm, result, history)
│   │   ├── workspace/              # WorkspaceBar (path anchor, directory picker)
│   │   ├── projects/               # ProjectView (file browser + workspace launcher)
│   │   ├── settings/               # SettingsPanel (API keys, custom hosts, projects folder)
│   │   ├── shared/                 # ModelPicker
│   │   └── Sidebar.tsx             # Workflow list + project list
│   ├── stores/
│   │   ├── workflowStore.ts        # Workflow CRUD, canvas state, undo/redo, workspace path
│   │   ├── runStore.ts             # Run lifecycle, gate state, tool confirmations
│   │   ├── chamberStore.ts         # Chamber config, run state, live streams, event listeners
│   │   ├── studioStore.ts          # Studio session state, chat history, streaming, document
│   │   └── settingsStore.ts        # API key status, default model (localStorage), project path
│   ├── hooks/
│   │   └── useRun.ts               # Attaches all workflow run event listeners
│   ├── lib/
│   │   ├── tauri.ts                # All invoke() wrappers + event listeners
│   │   └── defaults.ts             # Models, 24 built-in templates, agentFromTemplate(), 5 workflow factories
│   └── types/index.ts              # All shared TypeScript types (workflow, run, chamber)
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                 # Tauri commands, workflow engine, security jail, Chamber engine, Studio streaming
│   │   └── workspace_fs.rs         # File system ops, directory tree builder
│   ├── capabilities/
│   │   └── default.json            # Tauri permission grants
│   └── tauri.conf.json             # App config (name, window size, bundle targets)
│
└── package.json
```

### Useful dev commands

```bash
# Type-check the frontend without building
npx tsc --noEmit

# Check Rust without full compile
cd src-tauri && cargo check

# Run Rust tests
cd src-tauri && cargo test
```

### Where data is stored

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\com.jovan.conductor\` |
| macOS | `~/Library/Application Support/com.jovan.conductor/` |
| Linux | `~/.local/share/com.jovan.conductor/` |

Subdirectories: `workflows/`, `runs/`, `templates/`, `config.json`, `keys.json`

> API keys are stored in `keys.json` inside the app data directory, scoped to your OS user account. For a production-hardened deployment, replace this with the OS keychain via `tauri-plugin-keychain`.

---

## Production build

```bash
npm run tauri build
```

Output is placed in `src-tauri/target/release/bundle/`:

| Platform | Output format | Location |
|---|---|---|
| Windows | `.msi` + `.exe` | `bundle/msi/` and `bundle/nsis/` |
| macOS | `.dmg` + `.app` | `bundle/dmg/` and `bundle/macos/` |
| Linux | `.deb`, `.rpm`, `.AppImage` | `bundle/deb/`, `bundle/rpm/`, `bundle/appimage/` |

The installer is self-contained — no Node.js or Rust required on end-user machines. The WebView is provided by the OS (Edge WebView2 on Windows, WebKit on macOS/Linux).

### Platform notes

**Windows** — WebView2 ships with Windows 11 and most Windows 10 installs. For older machines use the NSIS installer, which can bundle the WebView2 bootstrapper. To suppress SmartScreen warnings, sign the `.exe` with an EV certificate via `bundle.windows.certificateThumbprint` in `tauri.conf.json`.

**macOS** — Distribution outside the App Store requires a Developer ID certificate (`bundle.macOS.signingIdentity`) and notarization for Gatekeeper.

No environment variables are baked into the binary. API keys are entered at runtime and stored locally.

---

## Workflow Canvas — usage

1. **Add an API key** — open Settings (bottom of the sidebar), paste your key, click Save, then Test.
2. **Create a workflow** — click `+ New Workflow` in the sidebar, pick a starter template or start blank.
3. **Set your workspace directory** — the workspace bar below the tab bar shows where agents will read and write files. Click it to select a folder, or the Run button will prompt you automatically if none is set.
4. **Build the pipeline** — add nodes from the toolbar, connect them by dragging from one node's output handle to the next node's input handle.
5. **Configure each agent** — click a node to open the inspector. Set the name, system prompt, and model; load a built-in template as a starting point. All tools are enabled by default — expand **Advanced: Restrict tool access** to limit specific tools if needed.
6. **Run** — type a task in the header bar and press **Run**. If a workspace directory isn't set, a folder picker opens automatically first.

### Node types

| Node | Purpose |
|---|---|
| **Start** | Entry point — passes the task input downstream |
| **Agent** | Calls an LLM with a system prompt and accumulated context; operates directly on the workspace |
| **Loop** | Worker ↔ Reviewer feedback loop; exits on approval or max retries |
| **Review Gate** | Human checkpoint — open your workspace, review what was created, then approve to continue or send feedback back to the worker |
| **End** | Captures and displays the final output |

### Agent context modes

| Mode | What the agent sees |
|---|---|
| `none` | Only the original task input |
| `previous` | Task input + the immediately preceding agent's output |
| `full_chain` | Task input + every preceding agent's output in order |

### Agent tools

All tools are enabled by default. Use the **Advanced: Restrict tool access** section in the agent inspector to limit an agent to a subset.

| Tool | Group | Requires human approval |
|---|---|---|
| Read File | Filesystem | No |
| Write File | Filesystem | No |
| Edit File | Filesystem | No |
| List Directory | Filesystem | No |
| Search Files | Filesystem | No |
| Create Directory | Filesystem | No |
| Move / Rename File | Filesystem | No |
| Delete File | Filesystem | **Yes — blocking modal** |
| Run Shell Command | Shell | **Yes — blocking modal** |
| Fetch URL | Web | No |

### Security sandbox

All file operations are enforced in Rust using canonicalized path resolution (`dunce::canonicalize`), which resolves symlinks before checking workspace containment. An agent cannot escape the workspace directory through `../` sequences or symbolic links — any path that resolves outside the workspace is rejected with a security error before touching disk.

Shell commands and file deletions always pause execution and surface a blocking approval modal in the UI showing the agent's name, the exact command or file path, and Allow / Deny buttons. The Rust backend holds a `oneshot` channel open until the user responds.

### Built-in workflow templates

| Template | Agents | What it does |
|---|---|---|
| **Software Factory** | Software Planner · Architecture Reviewer · Full-Stack Developer · Tester / QA Engineer | Plan → review (human gate) → implement → test loop |
| **Bug Fix Pipeline** | Codebase Explorer · Bug Analyzer · Full-Stack Developer · Code Reviewer | Read codebase → diagnose → fix → review loop |
| **Content Factory** | Content Writer · Editor · Final Polish | Write → edit loop → final copyedit |
| **Research Lab** | Research Analyst · Fact Checker · Documentation Writer | Research → fact-check loop → polished report |
| **Marketing Campaign** | Marketing Copywriter · Editor · Social Media Manager · Email Writer | Approved copy → social posts → campaign email |

### Built-in agent templates

| Template | Category |
|---|---|
| Software Planner, Architecture Reviewer, Full-Stack Developer, Tester / QA Engineer, Code Reviewer, Bug Analyzer, Codebase Explorer, Refactoring Specialist, Security Auditor | Software |
| DevOps Engineer | DevOps |
| Documentation Writer, Content Writer, Editor | Writing |
| Research Analyst, Fact Checker, Executive Summarizer, Web Researcher | Analysis |
| Product Manager | Business |
| Marketing Copywriter, Email Writer, Social Media Manager, Sales Pitch Writer | Marketing |

---

## Studio — usage

Switch to the **Studio** tab (lightbulb icon) at the top of the main area.

### How a session works

1. **Describe your idea** — type anything into the input field and press Enter or Send. It can be rough: "I want to plan a ski trip" or "I need to build a user authentication system" or "I'm thinking about starting a newsletter."
2. **Collaborate** — Studio asks 1–2 targeted questions per turn to uncover goals, constraints, timeline, audience, and resources. If you are unsure about something, ask Studio for its opinion — it will give you a direct recommendation with reasoning, not just another question back.
3. **Keep going until it feels complete** — typically 4–8 exchanges is enough for a solid plan. Studio will tell you when it thinks it has enough context, or it may generate the document on its own if it is confident.
4. **Generate the document** — click **Done with plan — Generate Document** at any time to trigger final document generation, regardless of where the conversation is.
5. **Read and download** — the final plan renders in-app as formatted Markdown. Click **Download .txt** to save it to your machine.
6. **Start over** — click **New Session** to clear everything and begin fresh.

### Tips

- You do not need a polished prompt to start. The more rough and unfiltered the better — that is what Studio is for.
- If Studio asks a question you are not sure about, say so and ask what it would recommend. It will give you its expert take and move forward.
- The model picker in the top-right corner of Studio lets you switch providers mid-session without losing your conversation.

---

## The Chamber — usage

Switch to The Chamber tab at the top of the main area.

### 1. Choose a format

| Format | Best for |
|---|---|
| **Blind Audition** | Getting the best answer by having agents compete and score each other |
| **War Room** | Stress-testing a proposal through adversarial debate |
| **Syndicate** | Building a comprehensive document where each agent contributes their specialty |

### 2. Build your roster

- Click **From Template** to add an agent from the built-in template library, or **Blank Agent** for a custom one.
- Expand any agent card to edit its name, system prompt, and model independently.
- War Room requires exactly 2 agents (Proposer + Critic). Blind Audition and Syndicate support any number.

> The Chamber uses direct LLM calls for idea generation and debate — it is intentionally separate from the file-system agentic workflow. Chamber agents do not have file-system tools or workspace access.

### 3. Set context and rubric

- **Task / Context** — the prompt all agents work on.
- **Scoring Rubric** (Audition only) — the criteria agents use to judge each other. If left blank, defaults to quality, correctness, clarity, and practical usefulness.
- **Debate Rounds** (War Room only) — number of propose → critique cycles (2–5).
- **Review gate** — optionally pause after generation so you can inspect outputs before scoring or merging begins.

### 4. Run and watch

The Arena streams every agent's output live. Status indicators show what each agent is doing at any moment. When scoring runs (Audition mode), each agent independently judges all solutions using a neutral system prompt — no role-bleed, no self-exclusion ambiguity — and scores are averaged into a final ranking.

### 5. Read the Ledger

The right panel shows the final rankings with averaged scores (Audition), the complete debate transcript (War Room), or the final unified document (Syndicate). Copy to clipboard or save to a `.md` / `.txt` file via native OS dialog.

---

## Working with existing projects

1. In Settings, set **Default Projects Folder** to the directory containing your projects.
2. Projects appear in the **My Projects** section of the sidebar.
3. Click a project to open the file browser.
4. Click **▶ Run with agents** — select a workflow. The project's path becomes the workflow's workspace directory automatically.
5. Type a task in the header bar and press **Run**.

Agents receive the project's file tree as context and can read, modify, and create files directly on disk, all within the security sandbox.

---

## Ollama (local models)

1. Install Ollama from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull llama3.2` (or `codellama`, `qwen2.5-coder`, etc.)
3. Ensure Ollama is running: `ollama serve`
4. In Conductor Settings, confirm the base URL is `http://localhost:11434`
5. Select **Ollama** as the provider when configuring an agent or picking a default model

Ollama requires no API key. Models are detected automatically when the picker opens.

---

## Custom API connections

Conductor supports any OpenAI-compatible API endpoint:

1. Open Settings → **Custom Connections** → click **+**
2. Enter a name, base URL (e.g. `https://openrouter.ai/api/v1`), and the model IDs you want available
3. Paste the API key for that endpoint
4. Select the connection when choosing a model in any agent or the default model picker

---

## Troubleshooting

**App opens but workflows don't save**
The app data directory couldn't be created. Verify `%APPDATA%` is writable (Windows) or `~/.local/share` (Linux).

**Agents return errors about the API key**
Open Settings → click **Test** next to your key. Common causes: trailing whitespace in the pasted key, expired key, quota exceeded, or wrong key for the selected model (e.g. an OpenAI key used for an Anthropic model).

**Run button says "No workspace" or immediately shows folder picker**
The current workflow has no workspace directory set. Click the workspace bar below the tab bar, or just press Run — the folder picker opens automatically.

**Agent gets a "SECURITY VIOLATION" error**
The agent tried to access a path outside its workspace directory. This is the sandbox working correctly. Check the agent's system prompt or tool arguments — it may be using an absolute path that points outside the workspace.

**Shell command approval modal appears and I'm not sure what to allow**
Read the exact command shown in the red box before clicking Allow. If you don't recognise it, click Deny — the agent will receive an error and can try an alternative approach.

**Studio says "Generate Document" but the document is empty or shows raw `[STUDIO_FINAL_DOCUMENT]` text**
The model did not follow the output format. This occasionally happens with smaller or fine-tuned models. Switch to a stronger model (Claude Sonnet or GPT-4o) and start a new session.

**The Chamber doesn't score / shows 0.0**
The scoring LLM call failed silently. Check the console for errors and confirm the agent's model is configured and reachable. If using Ollama, ensure the server is running.

**File dialogs do nothing when clicked**
Capabilities may not be compiled in. Run `npm run tauri build` (production) or confirm `cargo check` passes cleanly and restart `npm run tauri dev`.

**Ollama agents fail immediately**
Ollama is not running. Execute `ollama serve` in a terminal, then retry. Confirm the model is pulled: `ollama list`.

**Canvas is blank after opening a workflow**
ReactFlow initialisation timing issue on slow machines. Resize the window slightly or close and reopen the workflow from the sidebar.

---

## License

All rights reserved. See the Usage & Copyright section at the top of this file.
