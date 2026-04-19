## Usage & Copyright

This repository is intended strictly for showcase purposes.

#### Ownership & Rights

All code and design assets within this repository are the property of Jovan Stosic.

### Restrictions

- No Repurposing: I do not grant permission for this code, design, or any associated assets to be repurposed, redistributed, or used as a template for other personal or commercial websites.

- No Unauthorized Use: Please do not download, clone, or fork this repository with the intent of claiming the work as your own or using it for your own personal site.

I kindly ask that you respect the integrity of this work. If you find the code helpful for learning, I encourage you to use it as inspiration to build something unique of your own rather than copying this implementation. Thank you!

---

# ✦ Conductor

**Build your AI workforce. Chain agents together. Run any task, start to finish.**

Conductor is a desktop application for building and running multi-agent AI workflows through a visual canvas. Think of it as an automation studio where every node on the canvas is a specialist AI employee — you define what it does, what model it uses, and how it connects to the others. Point agents at existing projects, let them collaborate through loops and review gates, and watch them produce real files on disk.

Built with Tauri 2, React 19, and Rust — fully local, no cloud dependency, no subscription. Your API keys stay on your machine.

---

## What it does

- **Visual workflow canvas** — drag-and-drop nodes, connect them left-to-right (output → input), build pipelines of any complexity
- **Agent nodes** — each agent has its own role, system prompt, model, and context settings; load from built-in templates or save your own
- **Loop nodes** — wire a worker agent and a reviewer agent into a feedback loop with configurable max retries and exit conditions
- **Review gates** — pause execution mid-run for human review, approve, reject, or edit before continuing
- **Start / End nodes** — bookmarks that anchor where task input enters and where final output is captured
- **Persistent project workspaces** — agents write real files to a named project folder; come back later and continue where you left off
- **Existing project integration** — point Conductor at any folder on your machine and agents read the full file tree as context before making changes
- **Multi-provider support** — Anthropic (Claude), OpenAI (GPT-4o), and Ollama (local models) all work out of the box
- **Native file dialogs** — save results as `.txt` or `.md`, export projects as `.zip`, browse for project folders — all through native OS dialogs

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Canvas | [@xyflow/react](https://reactflow.dev) |
| State management | Zustand v5 |
| Build tool | Vite 7 |
| HTTP (AI calls) | reqwest (Rust, streaming) |
| File system | walkdir, zip (Rust) |
| Dialogs | tauri-plugin-dialog |

---

## Prerequisites

You need all of the following installed before you can run or build Conductor.

### System requirements

- **Windows 10/11**, macOS 12+, or Linux (tested on Ubuntu 22.04+)
- **Node.js** 18 or newer — [nodejs.org](https://nodejs.org)
- **Rust** (stable toolchain) — [rustup.rs](https://rustup.rs)
- **Tauri system dependencies** — follow the platform guide at [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
  - Windows: Microsoft Visual Studio C++ Build Tools + WebView2
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1`, `libssl`, `libayatana-appindicator3` (see Tauri docs)

### API keys (at least one)

Conductor makes direct calls from the Rust backend to the AI providers. You need at least one key configured in Settings before running agents.

| Provider | Where to get a key |
|---|---|
| Anthropic | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI | [platform.openai.com](https://platform.openai.com) |
| Ollama | No key needed — just install [Ollama](https://ollama.com) and pull a model |

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

The first `tauri dev` will take a few minutes while Cargo downloads and compiles all Rust dependencies. Subsequent starts are much faster.

> **Hot reload:** Frontend (React/TypeScript) changes reload instantly. Changes to Rust files (`src-tauri/src/`) trigger a Rust recompile — typically 5–15 seconds.

### Project structure

```
conductor/
├── src/                        # React / TypeScript frontend
│   ├── App.tsx                 # Root layout, run trigger, validation
│   ├── components/
│   │   ├── canvas/             # WorkflowCanvas + all node components
│   │   ├── inspector/          # Right panel — node config editors
│   │   ├── run/                # RunDrawer, RunStartModal, ResultModal, ReviewGateModal
│   │   ├── projects/           # ProjectView (file browser + run launcher)
│   │   ├── settings/           # SettingsPanel (API keys, model, project folder)
│   │   └── Sidebar.tsx         # Workflow list + project list
│   ├── stores/
│   │   ├── workflowStore.ts    # Workflow CRUD, canvas selection
│   │   ├── runStore.ts         # Run lifecycle, gate state, pending run config
│   │   └── settingsStore.ts    # API key status, default model, project path
│   ├── lib/
│   │   ├── tauri.ts            # All invoke() wrappers + event listeners
│   │   └── defaults.ts         # Default models, built-in templates, factory workflows
│   └── types/index.ts          # All shared TypeScript types
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs             # All Tauri commands, workflow execution engine
│   │   └── workspace_fs.rs     # File system ops, manifest builder, file-block parser
│   ├── capabilities/
│   │   └── default.json        # Tauri permission grants (dialog, opener, core)
│   └── tauri.conf.json         # App config (name, window size, bundle targets)
│
└── package.json
```

### Useful dev commands

```bash
# Type-check the frontend without building
npx tsc --noEmit

# Check Rust code without full compile
cd src-tauri && cargo check

# Run Rust tests (if any)
cd src-tauri && cargo test
```

### Where data is stored (dev)

Conductor stores all persistent data in the OS app data directory:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\com.jovan.conductor\` |
| macOS | `~/Library/Application Support/com.jovan.conductor/` |
| Linux | `~/.local/share/com.jovan.conductor/` |

Subdirectories: `workflows/`, `runs/`, `templates/`, `config.json`, `keys.json`

> API keys are stored in `keys.json` in plaintext inside the app data dir. This is scoped to your OS user account. For a production-hardened deployment, consider replacing this with the OS keychain via `tauri-plugin-keychain`.

---

## Production build

### Build a native installer

```bash
# Builds the frontend then packages the Tauri app
npm run tauri build
```

Output is placed in `src-tauri/target/release/bundle/`:

| Platform | Output format | Location |
|---|---|---|
| Windows | `.msi` installer + `.exe` | `bundle/msi/` and `bundle/nsis/` |
| macOS | `.dmg` + `.app` | `bundle/dmg/` and `bundle/macos/` |
| Linux | `.deb`, `.rpm`, `.AppImage` | `bundle/deb/`, `bundle/rpm/`, `bundle/appimage/` |

The build produces a self-contained installer — no runtime or Node.js required on the end-user machine. The WebView is provided by the OS (Edge WebView2 on Windows, WebKit on macOS/Linux).

### Windows-specific notes

- WebView2 is bundled with Windows 11 and most Windows 10 installs. If targeting older machines, use the NSIS installer (`bundle/nsis/`) which can bundle the WebView2 bootstrapper.
- Code signing: to avoid SmartScreen warnings on Windows, sign the `.exe` with an EV certificate. Add the signing config to `tauri.conf.json` under `bundle.windows.certificateThumbprint`.

### macOS-specific notes

- For distribution outside the App Store you need a Developer ID certificate from Apple. Add `bundle.macOS.signingIdentity` to `tauri.conf.json`.
- Notarization is required for Gatekeeper to allow the app on other machines.

### Environment variables at build time

No environment variables are baked into the binary. API keys are entered by the user at runtime through the Settings panel and stored locally.

---

## Configuring agents

Once the app is running, the typical flow is:

1. **Add an API key** — open Settings (bottom of the sidebar), paste your Anthropic or OpenAI key, click Save, then Test to verify it works.
2. **Create a workflow** — click `+ New workflow` in the sidebar, pick a template or start blank.
3. **Add agents to the canvas** — use the toolbar at the top of the canvas. Connect nodes by dragging from the right handle (output) of one node to the left handle (input) of the next.
4. **Configure each agent** — click a node to open the inspector panel on the right. Set the name, role description, system prompt, and model. Load a built-in template as a starting point.
5. **Describe your task** — type in the task bar at the top and press Run (or Enter).
6. **Choose where to save** — pick Temporary (discarded on close) or Project (saved to disk permanently).

### Node types

| Node | Purpose |
|---|---|
| **Start** | Entry point — passes the task input downstream |
| **Agent** | Calls an LLM with a system prompt and the current context |
| **Loop** | Runs a Worker agent repeatedly, checked by a Reviewer agent, until approved or max retries |
| **Review Gate** | Pauses the run for human review before continuing |
| **End** | Captures the final output |

### Context modes (per agent)

| Mode | What the agent sees |
|---|---|
| `none` | Only the original task input |
| `previous` | Task input + the output of the immediately preceding agent |
| `full_chain` | Task input + every previous agent's output in order |

---

## Working with existing projects

1. In Settings, set **Default Projects Folder** to the directory containing your code (click Browse to use the native folder picker).
2. Your projects appear in the **My Projects** section of the sidebar.
3. Click a project to open it — you'll see a file browser with all readable files.
4. Click **▶ Run with agents** — pick a workflow if none is selected, enter a task, and start.

Agents automatically receive the full file tree as context (filenames + contents, up to 100k characters before switching to names-only mode). They are also instructed to output complete files in fenced code blocks, which Conductor parses and writes back to the project directory automatically.

---

## Ollama (local models)

1. Install Ollama from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull llama3.2` (or `codellama`, `qwen2.5-coder`, etc.)
3. Make sure Ollama is running (`ollama serve`)
4. In Conductor's Settings, verify the Ollama base URL is `http://localhost:11434`
5. When configuring an agent, select **Ollama** as the provider and pick the model

Ollama requires no API key.

---

## Troubleshooting

**App opens but workflows don't save**
The app data directory couldn't be created. Check that `%APPDATA%` is writable on Windows or `~/.local/share` on Linux.

**Agents return errors about the API key**
Open Settings → click **Test** next to your key. The test makes a real minimal call to the provider. Common causes: key copied with extra whitespace, key expired or over quota, wrong key for the selected model.

**File dialogs do nothing when clicked**
You are running a dev build where capabilities haven't been compiled in yet. Run `npm run tauri build` (production) or ensure `cargo check` passes cleanly and restart `npm run tauri dev`.

**Ollama agents fail immediately**
Ollama may not be running. Run `ollama serve` in a terminal, then retry. Also confirm the model is pulled: `ollama list`.

**Canvas is blank after opening a workflow**
This is a ReactFlow initialisation timing issue on very slow machines. Resize the window slightly to trigger a re-render, or close and reopen the workflow from the sidebar.

---

## License

All rights reserved. See the Usage & Copyright section at the top of this file.
