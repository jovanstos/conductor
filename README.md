## Usage & Copyright

This repository is intended strictly for showcase purposes.

All code and design assets are the property of Jovan Stosic. No permission is granted to repurpose, redistribute, fork, or use this code as a template. Please respect the integrity of this work.

---

# Conductor

**Orchestrate AI agents that work directly on your computer.**

Conductor is a desktop AI agent platform. Add API keys from any provider, build multi-step agent pipelines, and point them at a folder on your machine. Agents read, write, and modify real files while you watch them work in real time.

Three modes in one app:

- **Conductor** — Build and run agent pipelines. Chain agents in sequence, add feedback loops, set human review gates, schedule automatic runs.
- **Chamber** — Multi-agent deep thinking. Have models compete, debate, or collaborate on the same task simultaneously and get a ranked result.
- **Studio** — Structured idea refinement. Talk through any idea with an expert AI, then generate a polished, formatted document.

Built with Tauri 2, React 19, and Rust. Fully local. No cloud dependency. No subscription.

---

## Conductor tab

The main tab. Build and run your agent workforce.

**Pipelines** — Create workflows from the sidebar. Add agents with **+ Add Agent**, add review loops with **+ Add Loop**, reorder with up/down arrows, delete with the trash icon.

**Agent cards** — Each card shows name, model, tools, and live status. Running agents stream output live. Token count and duration appear on completion. Click **⚙ Configure** to open the full agent config panel.

**Agent config panel** — Set the name, system prompt, model (Anthropic / OpenAI / Ollama / custom endpoint), context mode, and which tools the agent can use. Pick from 24 built-in agent templates.

**Loop groups** — Amber-bordered cards containing a Worker and Reviewer. Click **⚙ Configure** on a loop to open a three-tab editor: **Worker**, **Reviewer**, and **Loop** settings. The Reviewer must end its response with `APPROVED` to exit the loop or `NEEDS REVISION` to send the Worker back.

**Running a workflow** — Type a task, pick a workspace folder, click **Run**. A run drawer slides up showing the full execution timeline, tool calls, file writes, and token counts.

**Scheduling** — Click **Schedule** in the toolbar to set a repeat interval (minutes, hours, daily, or weekly), provide a default task, and enable it. Active schedules appear in the sidebar with the next run time.

**Security sandbox** — All file operations are enforced in Rust. Agents cannot escape the workspace directory. Shell commands and file deletions require explicit approval via a blocking modal.

---

## Chamber tab

Multi-agent thinking room. Three formats:

| Format | How it works |
|---|---|
| **Blind Audition** | All agents generate in parallel, then each scores all solutions anonymously. Highest average wins. |
| **War Room** | Two agents debate: one proposes, one critiques, for N rounds until the answer is hardened. |
| **Syndicate** | Agents contribute sequentially by specialty, each building on the previous output. |

Add agents from templates or build custom ones with their own name, system prompt, and model. Watch them stream live in the Arena, then read the Ledger for final rankings and the winning output.

---

## Studio tab

Not a generic chat. Studio uses expert-tuned system prompts to guide productive conversations and generate polished final documents.

| Goal type | Output |
|---|---|
| **Agent Prompt** | Production-ready system prompt for any AI agent |
| **Project Plan** | Structured plan with goals, milestones, risks, timeline |
| **Design Doc** | Technical design with alternatives and trade-offs |
| **Research Brief** | Focused research question with methodology and success criteria |
| **Free Form** | Open-ended idea exploration and summary |

Pick a goal type, start a session, converse with the AI, then click **Generate Document** to produce a full formatted document. All sessions are saved locally, listed in the sidebar, and can be deleted. While the AI is streaming a **Stop** button cancels mid-response. Hover any message to copy or edit it.

---

## API connections

Keys are stored locally and called directly from the Rust backend.

| Provider | Key required | Models |
|---|---|---|
| **Anthropic** | Yes | Claude Opus 4.7 · Sonnet 4.6 · Haiku 4.5 |
| **OpenAI** | Yes | GPT-4o · GPT-4o mini |
| **Ollama** | No — local, auto-detected | Any model you've pulled (`ollama pull llama3.2`) |
| **Custom** | Optional | Any OpenAI-compatible endpoint (Groq, Together, LM Studio, OpenRouter…) |

Open **Settings → API Connections**. Each provider shows a colored glow card when connected. Click **Add Key**, paste your key, optionally **Test Key**, then **Save**. Set your **Default Model** in Settings — it appears in the nav bar and auto-fills when you add new agents.

---

## Agent tools

| Tool | Category | Requires approval |
|---|---|---|
| Read / Write / Edit File | Filesystem | No |
| List Directory · Search Files · Create Directory · Move File | Filesystem | No |
| Delete File | Filesystem | **Yes — blocking modal** |
| Run Shell Command | Shell | **Yes — blocking modal** |
| Fetch URL | Web | No |

All tools are enabled by default per agent. Restrict them in the agent config panel.

---

## Agent context modes

| Mode | What the agent sees |
|---|---|
| `Full chain` | Original task + every prior agent's output |
| `Previous only` | Original task + the immediately preceding agent's output |
| `None` | Only the original task |

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| Frontend | React 19 + TypeScript 5.8 |
| Styling | Tailwind CSS v4 |
| State | Zustand v5 |
| Build | Vite 7 |
| HTTP / AI calls | reqwest (Rust, streaming SSE) |
| Concurrency | tokio (Rust async runtime) |

---

## Dev setup

**Prerequisites:** Node.js 18+, Rust stable, Tauri prerequisites ([tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/))

```bash
git clone <repo-url>
cd conductor
npm install
npm run tauri dev
```

First run takes a few minutes for Cargo to compile. Subsequent starts are fast. React changes reload instantly; Rust changes trigger a ~5–15 second recompile.

```bash
npx tsc --noEmit          # type-check without building
cd src-tauri && cargo check   # check Rust without full compile
npm run tauri build        # production build → src-tauri/target/release/bundle/
```

**Data location**

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\com.jovan.conductor\` |
| macOS | `~/Library/Application Support/com.jovan.conductor/` |
| Linux | `~/.local/share/com.jovan.conductor/` |

Subdirectories: `workflows/`, `runs/`, `templates/`, `config.json`, `keys.json`. Studio sessions are in browser `localStorage`.

---

## Built-in workflow templates

| Template | Agents | What it does |
|---|---|---|
| **Software Factory** | Planner · Reviewer · Developer · Tester | Plan → review gate → implement → test loop |
| **Bug Fix Pipeline** | Explorer · Analyzer · Developer · Reviewer | Diagnose → fix → review loop |
| **Content Factory** | Writer · Editor · Polish | Write → edit loop → final copyedit |
| **Research Lab** | Analyst · Fact Checker · Writer | Research → verify loop → report |
| **Marketing Campaign** | Copywriter · Editor · Social · Email | Approved copy → social → email |

---

## Built-in agent templates (24)

| Category | Templates |
|---|---|
| **Software** | Software Planner, Architecture Reviewer, Full-Stack Developer, Tester/QA, Code Reviewer, Bug Analyzer, Codebase Explorer, Refactoring Specialist, Security Auditor |
| **DevOps** | DevOps Engineer |
| **Writing** | Documentation Writer, Content Writer, Editor |
| **Analysis** | Research Analyst, Fact Checker, Executive Summarizer, Web Researcher |
| **Business** | Product Manager |
| **Marketing** | Marketing Copywriter, Email Writer, Social Media Manager, Sales Pitch Writer |

---

## Troubleshooting

**API key errors** — Open Settings → **Test Key**. Common causes: trailing whitespace, expired key, quota exceeded, wrong key for the selected model.

**"No workspace" prompt** — The workflow has no workspace set. Click the folder button in the toolbar or press Run — the picker opens automatically.

**`SECURITY VIOLATION` error** — The agent tried to access a path outside the workspace (sandbox working correctly). Check the agent's system prompt for hardcoded absolute paths.

**Shell command approval modal** — Read the command carefully before clicking Allow. Click Deny if you don't recognize it — the agent will handle the refusal gracefully.

**Loop doesn't exit** — The Reviewer must end its response with exactly `APPROVED` (all caps). Open the loop config → Reviewer tab → update the prompt to include the approval format.

**Studio "Generate Document" is empty** — The model didn't follow the output format. Switch to a stronger model (Claude Sonnet or GPT-4o) in the model picker and try again.

**Ollama agents fail immediately** — Run `ollama serve` in a terminal and confirm the model is pulled (`ollama list`), then retry.

**Chamber shows 0.0 scores** — The scoring LLM call failed. Check the agent's model is configured and reachable. Open browser DevTools for error details.

---

## Ollama (local models)

1. Install from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull llama3.2`
3. Run: `ollama serve`
4. In Conductor, Ollama is auto-detected — no key needed
5. Select Ollama as the provider in any agent config or in Settings → Default Model

## Custom API connections

1. Settings → **Custom Connections** → **Add Connection**
2. Enter a name, base URL (e.g. `https://api.groq.com/openai/v1`), and model IDs
3. Add the API key for that endpoint
4. Select it in any agent's model picker

Supported: Groq, Together AI, LM Studio, OpenRouter, Mistral, or any OpenAI-compatible endpoint.

---

## License

All rights reserved. See the Usage & Copyright section at the top.
