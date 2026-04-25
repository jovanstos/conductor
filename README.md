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

**Build your AI workforce. Chain agents together. Run any task, start to finish.**

Conductor is a local-first desktop application for building and running multi-agent AI workflows. Two modes of operation in a single app:

- **Workflow Canvas** — a visual, node-based pipeline builder where specialist AI agents hand work to each other in sequence, with configurable loops, review gates, and real file output to disk.
- **The Chamber** — a multi-agent arena where agents compete, debate, or collaborate on the same task simultaneously, with live streaming output, peer scoring, and a ranked final result.

Built with Tauri 2, React 19, and Rust — fully local, no cloud dependency, no subscription. Your API keys stay on your machine.

---

## What it does

### Workflow Canvas

- **Visual pipeline builder** — drag-and-drop nodes onto a canvas, connect them left-to-right, build arbitrarily complex agent pipelines
- **Agent nodes** — each agent has its own name, role description, system prompt, model, tools, and context mode; load from the built-in template library or save your own
- **Loop nodes** — wire a worker agent and a reviewer agent into a feedback loop; the loop exits when the reviewer approves or max retries is reached
- **Review gates** — pause execution mid-run for human inspection; approve, reject, provide feedback, or edit the output before continuing
- **Start / End nodes** — anchor points for task input and final output capture
- **File system tools** — agents can read, write, edit, search, and create files on your local machine; shell command execution and URL fetching also available
- **Persistent project workspaces** — agents write real files to a named project folder you choose; pick up where you left off
- **Existing project integration** — point Conductor at any folder and agents receive the full file tree as context before making changes
- **Default model preference** — set a preferred LLM once in the toolbar; all new agents use it automatically, and one click applies it to every agent in the current workflow

### The Chamber

- **Blind Audition** — all agents generate solutions simultaneously (true parallel execution); each then acts as an impartial judge and scores every solution against the rubric; highest average score wins
- **War Room** — two agents debate for a configurable number of rounds: a Proposer generates/revises, a Critic finds flaws, back and forth until the solution is hardened
- **Syndicate** — agents contribute sequentially by specialty, each building on the previous agent's work to produce a single unified document
- **Live streaming arena** — see every agent's output stream in real time, side by side, with status indicators (Thinking / Typing / Critiquing / Done)
- **Review gate** — optionally pause between the generation and scoring phases for human inspection before scoring begins
- **Ranked ledger** — final scores, rankings, and the winning output displayed in the results panel; copy or save to file with one click

### Shared capabilities

- **Multi-provider support** — Anthropic (Claude 4.x), OpenAI (GPT-4o), Ollama (local models), and any custom OpenAI-compatible API endpoint
- **23 built-in agent templates** — covering Software, DevOps, Writing, Analysis, Business, and Marketing roles; all with production-quality system prompts
- **5 ready-to-run workflow templates** — Software Factory, Bug Fix Pipeline, Content Factory, Research Lab, Marketing Campaign; each pre-wires the right agents and tools
- **Native file dialogs** — save outputs as `.txt` or `.md`, export projects as `.zip`, browse folders — all through OS-native dialogs

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
| File system | walkdir, zip (Rust) |
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
│   ├── App.tsx                     # Root layout, tab switching, run trigger
│   ├── components/
│   │   ├── canvas/                 # WorkflowCanvas, node components, DataEdge
│   │   ├── chamber/                # ChamberView, ChamberConfigPane, ChamberArena, ChamberLedger
│   │   ├── inspector/              # Agent inspector, template picker, test modal
│   │   ├── run/                    # RunDrawer, modals (start, gate, tool confirm, result, history)
│   │   ├── projects/               # ProjectView (file browser + run launcher)
│   │   ├── settings/               # SettingsPanel (API keys, custom hosts, projects folder)
│   │   ├── shared/                 # ModelPicker (portal-based, escape-hatch from overflow clipping)
│   │   └── Sidebar.tsx             # Workflow list + project list
│   ├── stores/
│   │   ├── workflowStore.ts        # Workflow CRUD, canvas state, undo/redo, copy/paste
│   │   ├── runStore.ts             # Run lifecycle, gate state, tool confirmations
│   │   ├── chamberStore.ts         # Chamber config, run state, live streams, event listeners
│   │   └── settingsStore.ts        # API key status, default model (localStorage), project path
│   ├── hooks/
│   │   └── useRun.ts               # Attaches all workflow run event listeners
│   ├── lib/
│   │   ├── tauri.ts                # All invoke() wrappers + event listeners
│   │   └── defaults.ts             # Models, 23 built-in templates, agentFromTemplate(), 5 workflow factories
│   └── types/index.ts              # All shared TypeScript types (workflow, run, chamber)
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                 # Tauri commands, workflow engine, Chamber engine (3 modes)
│   │   └── workspace_fs.rs         # File system ops, manifest builder, file-block parser
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

The default model preference is stored in `localStorage` in the embedded WebView (survives app restarts, no backend changes required).

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
2. **Create a workflow** — click `+ New Workflow` in the sidebar, pick a template or start blank.
3. **Set your default model** — the model selector in the canvas toolbar sets the model for all new agents; click **Apply to all** to update every existing agent in the current workflow.
4. **Build the pipeline** — add nodes from the toolbar, connect them by dragging from one node's output handle to the next node's input handle.
5. **Configure each agent** — click a node to open the inspector. Set the name, system prompt, and model; load a built-in template as a starting point; enable file or shell tools if the agent needs to read/write files.
6. **Run** — type a task in the header bar and press Run. Choose Temporary (discarded on close) or Project (saved to disk).

### Node types

| Node | Purpose |
|---|---|
| **Start** | Entry point — passes the task input downstream |
| **Agent** | Calls an LLM with a system prompt and accumulated context |
| **Loop** | Worker ↔ Reviewer feedback loop; exits on approval or max retries |
| **Review Gate** | Human checkpoint — approve, reject, or edit before continuing |
| **End** | Captures and displays the final output |

### Agent context modes

| Mode | What the agent sees |
|---|---|
| `none` | Only the original task input |
| `previous` | Task input + the immediately preceding agent's output |
| `full_chain` | Task input + every preceding agent's output in order |

### Agent tools

| Tool | Group | Requires confirmation |
|---|---|---|
| Read File | Filesystem | No |
| Write File | Filesystem | No |
| Edit File | Filesystem | No |
| List Directory | Filesystem | No |
| Search Files | Filesystem | No |
| Create Directory | Filesystem | No |
| Move / Rename File | Filesystem | No |
| Delete File | Filesystem | **Yes** |
| Run Shell Command | Shell | **Yes** |
| Fetch URL | Web | No |

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

1. In Settings, set **Default Projects Folder** to the directory containing your code.
2. Projects appear in the **My Projects** section of the sidebar.
3. Click a project to open the file browser.
4. Click **▶ Run with agents** — select a workflow, enter a task, and start.

Agents with file tools enabled receive the project's full file tree as context and can read, modify, and create files directly on disk. Agents without tools receive the file tree as read-only context in their prompt.

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

**The Chamber doesn't score / shows 0.0**
The scoring LLM call failed silently. Check the console for errors and confirm the agent's model is configured and reachable. If using Ollama, ensure the server is running.

**File dialogs do nothing when clicked**
Capabilities may not be compiled in. Run `npm run tauri build` (production) or confirm `cargo check` passes cleanly and restart `npm run tauri dev`.

**Ollama agents fail immediately**
Ollama is not running. Execute `ollama serve` in a terminal, then retry. Confirm the model is pulled: `ollama list`.

**Model picker dropdown is invisible or clipped**
The picker uses a React portal with `position: fixed` coordinates — it should always render above other content. If it doesn't appear, resize the window slightly to force a layout recalculation.

**Canvas is blank after opening a workflow**
ReactFlow initialisation timing issue on slow machines. Resize the window slightly or close and reopen the workflow from the sidebar.

---

## License

All rights reserved. See the Usage & Copyright section at the top of this file.
