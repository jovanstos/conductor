## Usage & Copyright

This repository is intended strictly for showcase purposes.

#### Ownership & Rights

All code and design assets within this repository are the property of Jovan Stosic.

### Restrictions

- No Repurposing: I do not grant permission for this code, design, or any associated assets to be repurposed, redistributed, or used as a template for other personal or commercial websites.
- No Unauthorized Use: Please do not download, clone, or fork this repository with the intent of claiming the work as your own or using it for your own personal site.

I kindly ask that you respect the integrity of this work. Thank you!

---

# Conductor

**Orchestrate AI agents that work directly on your computer. Build pipelines, run them on real files, and get real work done.**

Conductor is a desktop AI agent management platform. Add API keys from any provider, build multi-step agent pipelines, and point them at a folder on your machine. Agents read, write, and modify real files while you watch them work in real time.

Three modes in one app:

- **Conductor** — Build and run agent pipelines. Chain agents in sequence, add feedback loops, set human review gates. Agents operate directly on your local file system. Schedule pipelines to run automatically on a timer.
- **Chamber** — Multi-agent deep thinking. Have models compete, debate, or collaborate on the same task simultaneously. Get a ranked result with live streaming output.
- **Studio** — Structured idea refinement. Talk through any idea with an expert AI, then generate a polished, formatted document — agent system prompt, project plan, design doc, research brief, or anything else.

Built with Tauri 2, React 19, and Rust. Fully local. No cloud dependency. No subscription. Your API keys stay on your machine.

---

## What it does

### Conductor tab

The main tab. Where you build and run your agent workforce.

**Pipeline builder**
- Create workflows from the sidebar, pick from starter templates or start blank
- Each workflow is a sequential pipeline — agents run in order, each passing its output to the next
- Add agents with **+ Add Agent**, add review loops with **+ Add Loop**
- Reorder steps with the up/down arrows on each card
- Delete steps with the trash icon

**Agent cards**
- Each agent shows its name, model, context mode, tools enabled, and live status
- Status pills: `IDLE` · `RUNNING` (with animated pulse) · `DONE` (green) · `ERROR` (red)
- Running agents stream their output live inside the card
- Token count and duration shown when an agent completes
- Click the **⚙ Configure** button on any card to open the full agent config panel

**Agent configuration (slide-in panel)**
- Name, role description, system prompt
- Model picker — Anthropic, OpenAI, Ollama local models, or any custom OpenAI-compatible endpoint
- Context mode: `Full chain` (sees all prior output) / `Previous only` / `None`
- Tool access: enable/disable each tool per agent
- Template library: 24 built-in production-grade agent templates

**Loop groups**
- Amber-bordered loop cards contain a Worker agent and a Reviewer agent
- Click **⚙ Configure** on a loop to open a tabbed config: **Worker** tab · **Reviewer** tab · **Loop** settings
- Each tab is a full agent editor — change the name, model, prompt, tools independently for worker and reviewer
- Set max retries (how many revision cycles before the loop exits regardless)
- The Reviewer's output must end with `APPROVED` to exit the loop cleanly, or `NEEDS REVISION` to send the Worker back for another pass

**Running a workflow**
1. Type a task in the toolbar input
2. Pick a workspace folder (the folder agents will read/write files in)
3. Click **Run** — agents execute in sequence, streaming output live
4. A run drawer slides up from the bottom showing the full execution timeline, tool calls, file writes, and token counts
5. Click **Results** when done to see the final output

**Scheduling**
- Click **Schedule** in the toolbar to open the schedule panel
- Set a repeat interval: minutes, hours, daily at a specific time, or weekly on specific days
- Provide a default task input for scheduled runs
- Enable the schedule — it runs automatically while the app is open
- Active schedules appear in the sidebar below the workflow list with their next run time

**Security sandbox**
All file operations are enforced in Rust using canonicalized path resolution. Agents cannot escape the workspace directory. Shell commands and file deletions require explicit human approval via a blocking modal before executing.

---

### Chamber tab

Multi-agent thinking room. Three formats:

| Format | How it works |
|---|---|
| **Blind Audition** | All agents generate solutions in parallel, then each scores all solutions anonymously. Highest average score wins. |
| **War Room** | Two agents debate: one proposes, one critiques, back and forth for N rounds until the solution is hardened. |
| **Syndicate** | Agents contribute sequentially by specialty, each building on the previous output to produce a single unified document. |

**How to use**
1. Choose a format
2. Add agents from templates or build custom ones — each gets its own name, system prompt, and model
3. Set the task/context and (for Audition) a scoring rubric
4. Click Run — watch every agent stream output live in the Arena
5. Read the Ledger panel for final rankings, scores, and the winning output
6. Copy or save results to file

---

### Studio tab

Structured idea refinement, not a generic chat. Studio uses expert-tuned system prompts to guide you through a productive conversation and generate a polished final document.

**Five goal types**
| Type | What it produces |
|---|---|
| **Agent Prompt** | A production-ready system prompt you can paste into any AI agent |
| **Project Plan** | Structured plan with goals, milestones, risks, and timeline |
| **Design Doc** | Technical or product design document with alternatives and trade-offs |
| **Research Brief** | Focused research question with methodology and success criteria |
| **Free Form** | Open-ended idea exploration and summary |

**How a session works**
1. Pick a goal type from the template list
2. Click **Start Session** — the AI opens with a targeted first question
3. Answer back and forth — the AI asks 2-3 focused questions per message, pushes back on vague answers, and probes for what matters
4. When you have enough context, click **Generate Document** — the AI produces a comprehensive, formatted document
5. The document renders with full Markdown formatting (headers, bold, code blocks, lists)
6. Download as `.md` or copy to clipboard

**Session management**
- All sessions are saved locally and listed in the sidebar
- Switch between sessions any time
- Hover a session to reveal the delete button (with confirmation)
- While the AI is streaming: a blue banner shows "AI is responding" with a **Stop** button to cancel mid-response

**Message features**
- Hover any message to reveal **Copy** and **Edit** buttons
- Edit (pencil icon) is available on your own messages — puts the text back into the editor for revision
- The AI's responses render full Markdown so code, headers, and lists display properly

---

## API connections

Conductor calls AI providers directly from the Rust backend. Keys are stored locally.

| Provider | Key required | Models |
|---|---|---|
| **Anthropic** | Yes | Claude Opus 4.7 · Claude Sonnet 4.6 · Claude Haiku 4.5 |
| **OpenAI** | Yes | GPT-4o · GPT-4o mini |
| **Ollama** | No — local, auto-detected | Any model you've pulled (`ollama pull llama3.2`) |
| **Custom** | Optional | Any OpenAI-compatible endpoint (Groq, Together, LM Studio, OpenRouter…) |

**Adding keys (Settings → API Connections)**
- Each provider shows a colored status card with a glow when connected
- Click **Add Key** → paste → optionally **Test Key** to verify → **Save Key**
- Keys can be removed at any time

**Default model**
- Set in Settings → Default Model
- Shown in the top navigation bar at all times
- Auto-applied when you add a new agent to a pipeline

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React 19 + TypeScript 5.8 |
| Styling | Tailwind CSS v4 (Obsidian theme) |
| State management | Zustand v5 |
| Icons | [Lucide React](https://lucide.dev) |
| Build tool | Vite 7 |
| HTTP / AI calls | reqwest (Rust, streaming SSE) |
| Concurrency | tokio (Rust async runtime) |
| File system | walkdir, zip, dunce (Rust) |
| Dialogs | tauri-plugin-dialog |

---

## Prerequisites

- **Windows 10/11**, macOS 12+, or Linux (Ubuntu 22.04+)
- **Node.js** 18+ — [nodejs.org](https://nodejs.org)
- **Rust** stable — [rustup.rs](https://rustup.rs)
- **Tauri prerequisites** — [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
  - Windows: Visual Studio C++ Build Tools + WebView2
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1`, `libssl`, `libayatana-appindicator3`

---

## Development setup

```bash
# 1. Clone
git clone <repo-url>
cd conductor

# 2. Install JS dependencies
npm install

# 3. Start dev server (Vite + Tauri hot reload)
npm run tauri dev
```

First `tauri dev` takes a few minutes while Cargo compiles Rust dependencies. Subsequent starts are fast.

> **Hot reload:** React/TypeScript changes reload instantly. Rust changes trigger a recompile (~5–15 seconds).

### Project structure

```
conductor/
├── src/                              # React / TypeScript frontend
│   ├── App.tsx                       # Root layout, tab navigation, global error handling
│   ├── components/
│   │   ├── conductor/                # Pipeline UI
│   │   │   ├── ConductorView.tsx     # Main Conductor tab layout + secondary toolbar
│   │   │   ├── WorkflowSidebar.tsx   # Workflow list + active schedules
│   │   │   ├── PipelineView.tsx      # Agent pipeline builder + run toolbar
│   │   │   ├── AgentCard.tsx         # Live agent card (status, output, tools, tokens)
│   │   │   ├── AgentConfigPanel.tsx  # Slide-in config for agents and loop groups
│   │   │   └── SchedulePanel.tsx     # Per-workflow schedule configuration
│   │   ├── chamber/                  # Multi-agent Chamber tab
│   │   │   ├── ChamberView.tsx
│   │   │   ├── ChamberConfigPane.tsx
│   │   │   ├── ChamberArena.tsx
│   │   │   └── ChamberLedger.tsx
│   │   ├── studio/                   # Studio idea refinement tab
│   │   │   ├── StudioView.tsx        # Chat UI, template picker, session management
│   │   │   └── MarkdownRenderer.tsx  # Lightweight markdown renderer (no deps)
│   │   ├── run/                      # Workflow execution UI
│   │   │   ├── RunDrawer.tsx         # Live execution timeline
│   │   │   ├── ReviewGateModal.tsx   # Human checkpoint modal
│   │   │   ├── ToolConfirmModal.tsx  # Shell/delete approval modal
│   │   │   └── ResultModal.tsx       # Final output display
│   │   ├── settings/
│   │   │   └── SettingsPanel.tsx     # API keys, default model, workspace folder
│   │   ├── workflow/
│   │   │   └── NewWorkflowModal.tsx  # Workflow creation with template picker
│   │   └── shared/
│   │       └── ModelPicker.tsx       # Provider + model + temp + tokens selector
│   ├── stores/
│   │   ├── workflowStore.ts          # Workflow CRUD, pipeline ops, undo/redo
│   │   ├── runStore.ts               # Run lifecycle, gate state, tool confirmations
│   │   ├── chamberStore.ts           # Chamber config, run state, live streams
│   │   ├── studioStore.ts            # Sessions (localStorage), chat, streaming, cancel
│   │   └── settingsStore.ts          # API key status, default model, custom hosts
│   ├── hooks/
│   │   └── useRun.ts                 # Attaches Tauri event listeners for workflow runs
│   ├── lib/
│   │   ├── tauri.ts                  # All invoke() wrappers + event helpers
│   │   ├── pipelineUtils.ts          # Graph ↔ pipeline: ordered steps, add/remove/move
│   │   └── defaults.ts               # Models, 24 agent templates, 5 workflow factories
│   └── types/index.ts                # All shared TypeScript types
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                   # Tauri commands, workflow engine, security sandbox,
│   │   │                             # Chamber engine, Studio streaming
│   │   └── workspace_fs.rs           # File system ops, directory tree
│   ├── capabilities/default.json     # Tauri permission grants
│   └── tauri.conf.json               # App config, window size, bundle settings
│
└── package.json
```

### Useful dev commands

```bash
# Type-check without building
npx tsc --noEmit

# Check Rust without full compile
cd src-tauri && cargo check

# Run Rust tests
cd src-tauri && cargo test
```

### Where data lives

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\com.jovan.conductor\` |
| macOS | `~/Library/Application Support/com.jovan.conductor/` |
| Linux | `~/.local/share/com.jovan.conductor/` |

Subdirectories: `workflows/`, `runs/`, `templates/`, `config.json`, `keys.json`

Studio sessions are stored in browser `localStorage` (scoped to the app's WebView origin).

---

## Production build

```bash
npm run tauri build
```

Output in `src-tauri/target/release/bundle/`:

| Platform | Format | Location |
|---|---|---|
| Windows | `.msi` + `.exe` | `bundle/msi/`, `bundle/nsis/` |
| macOS | `.dmg` + `.app` | `bundle/dmg/`, `bundle/macos/` |
| Linux | `.deb`, `.rpm`, `.AppImage` | `bundle/deb/`, `bundle/rpm/`, `bundle/appimage/` |

No Node.js or Rust required on end-user machines. WebView is provided by the OS (WebView2 on Windows, WebKit on macOS/Linux).

---

## Agent tools

All tools are enabled by default per agent. Restrict them in the agent config panel.

| Tool | Category | Requires approval |
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

---

## Agent context modes

| Mode | What the agent sees |
|---|---|
| `Full chain` | Original task + every prior agent's output in order |
| `Previous only` | Original task + the immediately preceding agent's output |
| `None` | Only the original task — fresh, unbiased perspective |

---

## Built-in workflow templates

| Template | Agents | Description |
|---|---|---|
| **Software Factory** | Planner · Reviewer · Developer · Tester | Plan → gate → implement → test loop |
| **Bug Fix Pipeline** | Explorer · Analyzer · Developer · Reviewer | Diagnose → fix → review loop |
| **Content Factory** | Writer · Editor · Polish | Write → edit loop → final copyedit |
| **Research Lab** | Analyst · Fact Checker · Writer | Research → verify loop → report |
| **Marketing Campaign** | Copywriter · Editor · Social · Email | Approved copy → social → email |

---

## Built-in agent templates (24)

| Template | Category |
|---|---|
| Software Planner, Architecture Reviewer, Full-Stack Developer, Tester/QA, Code Reviewer, Bug Analyzer, Codebase Explorer, Refactoring Specialist, Security Auditor | Software |
| DevOps Engineer | DevOps |
| Documentation Writer, Content Writer, Editor | Writing |
| Research Analyst, Fact Checker, Executive Summarizer, Web Researcher | Analysis |
| Product Manager | Business |
| Marketing Copywriter, Email Writer, Social Media Manager, Sales Pitch Writer | Marketing |

---

## Troubleshooting

**Agents return API key errors**
Open Settings → click **Test Key** next to your key. Common causes: trailing whitespace when pasting, expired key, quota exceeded, wrong key for the selected model.

**"No workspace" prompt appears when I click Run**
The workflow has no workspace directory set. Click the folder button in the toolbar or just press Run — the folder picker opens automatically.

**Agent gets a `SECURITY VIOLATION` error**
The agent tried to access a path outside the workspace. This is the security sandbox working correctly. Check the agent's system prompt — it may be using an absolute path.

**Shell command approval modal appears**
Read the command in the red box carefully before clicking Allow. Click Deny if you don't recognize it — the agent will handle the refusal.

**Loop doesn't exit even though I want it to**
The Reviewer must end its response with exactly `APPROVED` (all caps). If the Reviewer's system prompt doesn't include this requirement, open the loop config → Reviewer tab → update the prompt to include the approval format.

**Studio "Generate Document" produces empty output**
The model didn't follow the output format. Switch to a stronger model (Claude Sonnet or GPT-4o) in the model picker and try again.

**Ollama agents fail immediately**
Ollama is not running. Run `ollama serve` in a terminal, confirm your model is pulled (`ollama list`), then retry.

**Chamber shows 0.0 scores**
The scoring LLM call failed. Check that the agent's model is configured and reachable. Open the browser DevTools console for error details.

---

## Ollama (local models)

1. Install Ollama from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull llama3.2`
3. Run: `ollama serve`
4. In Conductor, Ollama is auto-detected — no key needed
5. Select Ollama as the provider in any agent's model picker or in Settings → Default Model

---

## Custom API connections

1. Settings → **Custom Connections** → **Add Connection**
2. Enter a name, base URL (e.g. `https://api.groq.com/openai/v1`), and model IDs
3. Add the API key for that endpoint
4. Select the custom connection in any agent's model picker

Supported: Groq, Together AI, LM Studio, OpenRouter, Mistral, any OpenAI-compatible endpoint.

---

## License

All rights reserved. See the Usage & Copyright section at the top of this file.
