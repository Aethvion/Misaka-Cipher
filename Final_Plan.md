# Aethvion Suite — Final Improvement Plan

> **Process:** Three AI collaborators reviewed the full codebase independently and produced separate plans.
> This document synthesises all three — authored in order by **Copilot → Antigravity → Claude**.
> Claude reviewed last and serves as the final editor: correcting oversights, resolving disagreements,
> adding missing context from active development, and producing the master priority table.
>
> **Source plans:** `Copilot_Plan.md` · `Antigravity_Plan.md` · `Claude_Plan.md`
> **Codebase version at time of review:** v11

---

## How to Read This Document

Priority labels used throughout:

| Label | Meaning |
|-------|---------|
| 🔴 **Critical** | Broken, placeholder, or security issue — fix before anything else |
| 🟠 **High** | Major improvement, broad impact, relatively achievable |
| 🟡 **Medium** | Good quality-of-life or feature expansion |
| 🟢 **Low / Fun** | Polish, delight, or experimental — worth doing when the above is solid |

Items marked with 🤝 were independently suggested by **2 or more** AI collaborators — convergence signals higher confidence.

---

## Part 1 — Critical: Fix What Is Broken or Fake

*All three collaborators flagged these independently. They represent gaps between what the UI promises and what actually works.*

### 1.1 🔴 Intelligence Firewall — Complete Local Inference 🤝
**Identified by: Claude + Copilot**
The `core/security/firewall.py` scanner is explicitly marked as a placeholder. It detects PII patterns with regex but then routes everything to cloud with a warning. It is not doing real intent scanning.

**Fix:** Load a small local model (Llama 3.2 1B or Phi-4 mini — already on disk) specifically for firewall classification. Run a fast binary yes/no: "Does this input contain harmful intent, PII, or credentials?" before every external API call. No large model needed. Also: run the same scanner on Tool Forge output before registration to prevent generated code from embedding secrets (Copilot 1.4).

**Why this matters:** The firewall is the platform's privacy and safety claim. While it's a placeholder, that claim is false.

### 1.2 🔴 Memory Retrieval — Wire It to Chat 🤝
**Identified by: All three collaborators**
ChromaDB is running, episodic memories are stored, the Memory tab browser works — but memory is never injected into actual chat context. The Nexus Core routing has a TODO comment where this should happen.

**Fix:** Before every chat inference call, run a vector similarity search (top 3 results, relevance threshold 0.6+) and prepend a short `Relevant context:` block to the system prompt. Make this toggleable per thread. Use configurable embedding models so users can swap `all-MiniLM-L6-v2` for a larger/better model (Copilot 4.1).

### 1.3 🔴 Local Model GPU Offload — CUDA Build
**Identified by: Claude**
`llama-cpp-python` 0.3.17 is installed CPU-only despite an RTX 4090 (24 GB VRAM) being present. This is a 10–50x speed difference. All local models are currently impractical for real use.

**Fix:** Install CUDA Toolkit from developer.nvidia.com/cuda-downloads, then:
```
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python==0.3.17 --force-reinstall --no-cache-dir
```
Also consider adding an **Ollama provider** as a parallel path that handles GPU automatically (see §2.4).

### 1.4 🔴 Package Manager — Complete or Hide It
**Identified by: Claude**
The packages panel exists in the UI but is internally flagged as unstable. A half-working package manager that can corrupt the Python environment is actively dangerous.

**Fix:** Either complete it with a safe sandboxed install flow and dependency conflict detection, or remove it from the sidebar until it's ready. Do not ship broken tools as visible features.

### 1.5 🔴 Dashboard Authentication
**Identified by: Copilot**
The dashboard has no login gate. Anyone on the same LAN can read memory, trigger agents, and access API-key-adjacent data.

**Fix:** Add an optional single-user PIN/password auth layer. Session cookie, configurable via `DASHBOARD_PASSWORD` in `.env`. If the variable is unset, auth is skipped (developer mode). Keep it simple — no database, no user management.

---

## Part 2 — Core System Improvements

### 2.1 🟠 Agent System: Native Tool Calling 🤝
**Identified by: Claude + Copilot**
The current agent format (free-text `ACTION: {json}` parsed with `raw_decode`) is fragile and has caused repeated production errors. The real solution is using the provider's native function/tool calling API — Gemini, OpenAI, and Anthropic all support it.

**Fix:** Define agent tools as JSON schemas. Let the LLM return structured tool calls. No regex parsing, no format errors. This eliminates the entire class of "LLM returned malformed JSON" bugs.

### 2.2 🟠 Agent System: More Tools 🤝
**Identified by: Claude + Antigravity + Copilot**
The agent currently supports: read file, write file, list directory, shell command. The following tools would dramatically expand usefulness:
- `web_search` — search the web
- `read_url` — fetch and read a webpage
- `ask_user` — pause mid-task and ask the human a clarifying question
- `run_python` — execute a sandboxed Python snippet
- `remember` / `recall` — write to and query the Memory Tier
- `create_file_from_template` — scaffold boilerplate code

> **Antigravity note:** Full browser automation via Playwright is a powerful addition enabling agents to research, scrape, and interact with web UIs. Worth implementing as a separate `browser_agent` tool rather than embedding in every agent.

### 2.3 🟠 Agent Persistence — Persist and Resume 🤝
**Identified by: Claude + Copilot**
Agents start fresh every time. The `AgentState` JSON state file is in place but there's no UI mechanism to resume a partially completed task after a restart.

**Fix:** Add a "Resume Task" button on existing agent threads that have a `_state.json` present. The `AgentRunner` already loads state on init — the gap is the UI surface and a `persistent=True` flag in the agent spec.

### 2.4 🟠 Ollama Integration as a Provider 🤝
**Identified by: Claude + Copilot**
Ollama is the dominant local model runner on Windows. It handles GPU offload automatically, supports 100+ models, and doesn't require rebuilding Python packages. Adding an `OllamaProvider` would:
- Bypass the llama-cpp-python CUDA build problem entirely
- Let users switch models without restarting the server
- Support architectures that llama-cpp-python struggles with (MoE, large context)

The API is simple REST (`/api/chat`, `/api/generate`). This is a 1–2 day addition with very high impact.

### 2.5 🟠 Streaming Responses — End-to-End
**Identified by: Copilot**
Streaming is partially in place (the agent runner uses it, which solved the Gemini 500 errors) but it's not consistently wired through the chat UI. Responses should render token-by-token as they arrive.

**Fix:** Wire SSE streaming end-to-end for all providers in the chat pipeline. The agent runner already demonstrates the correct pattern (`call_with_failover_stream`). Apply the same to all chat calls.

### 2.6 🟠 Knowledge Base / RAG Panel 🤝
**Identified by: Claude + Copilot**
ChromaDB is running but there is no UI for feeding documents into it. Users can't use Aethvion as a personal knowledge assistant over their own documents.

**Fix:** Add a **Knowledge Base** panel:
- Upload PDFs, Markdown, text files
- Auto-chunk and embed into ChromaDB
- Tag by namespace/project so memories don't mix
- All chat threads can optionally query the knowledge base before responding

This is the highest-value use case for local AI and the infrastructure is 80% already there.

### 2.7 🟠 Circuit Breaker for Providers
**Identified by: Copilot**
If a provider returns 5 consecutive errors, the system keeps retrying instead of backing off. This causes cascading failures and unexpected API costs.

**Fix:** Implement a per-provider circuit breaker (closed → open → half-open). Expose breaker state in the status panel header.

### 2.8 🟠 Cost Budget Alerts
**Identified by: Copilot**
No budget guardrails exist. A runaway agent or loop can generate unexpected API costs with no warning.

**Fix:** Add a configurable `monthly_budget_usd` in `aethvion.yaml`. Show a dashboard banner at 80% and 100% of budget. Optionally block new cloud requests when over budget.

### 2.9 🟠 Tool Forge: Validation Sandbox + TDD Loop 🤝
**Identified by: Antigravity + Copilot**
The Forge generates tools that work for simple cases but often fails on complex logic or external imports. Generated tools have no tests and run with full process privileges.

**Fix (Antigravity approach + Copilot extension):**
1. Decomposition phase: LLM writes function signatures + docstrings first, then fills implementations
2. Auto-generate a pytest unit test alongside each tool
3. Run the test in an isolated subprocess before registering
4. If test fails, send traceback back to LLM for self-correction (up to 3 attempts)
5. Add a **Preview** button — show generated code + security scan report before committing

### 2.10 🟡 Voice-First Conversation Mode
**Identified by: Claude**
The Audio tab has TTS and STT but they're separate from chat. Switching between them breaks conversational flow.

**Fix:** Add a 🎙️ **Voice Mode** toggle in the chat header. When enabled: STT captures speech → submits to chat → response streams to TTS (sentence-by-sentence using Kokoro for low latency) → auto-plays. No tab switching. All existing infrastructure — the gap is just the continuous loop.

### 2.11 🟡 Scheduled Automations / Cron Tasks 🤝
**Identified by: Claude + Antigravity + Copilot**
The TaskQueue exists, agents run tasks — but everything is manually triggered. All three collaborators independently identified this as a high-value expansion.

**Fix:** Add a simple scheduler in the Settings tab. Users define: trigger (time/interval), agent task description, output destination (dashboard notification, Discord, file). Example: every morning at 08:00, run an agent that summarises market data and posts to Discord. The execution infrastructure is already there.

### 2.12 🟡 Multi-Agent Coordination
**Identified by: Antigravity + Copilot**
Agents can't communicate with each other or split work. The `advaiconv-panel` does multi-persona but not true multi-agent task delegation.

**Fix:** Implement a shared message bus between agents. Add a `delegate_to_agent(agent_name, subtask)` tool. Show inter-agent communication in the workspace log. Start simple — two coordinating agents (Architect + Builder) is already very powerful.

### 2.13 🟡 Discord Worker — Complete the Logic
**Identified by: Claude**
`core/workers/discord_worker.py` has a prominent TODO: the "should I reach out?" decision logic is stubbed. The Settings tab has Discord configuration but it doesn't do anything meaningful.

**Fix:** Implement a real decision via the orchestrator: check for pending agent completions, memory items flagged as important, or explicitly triggered notifications, and send them to the configured Discord channel.

---

## Part 3 — Dashboard & UX

### 3.1 🟠 Global Command Palette (`Ctrl+K`)
**Identified by: Copilot**
With 25+ tabs, there's no fast way to navigate. A `Ctrl+K` command palette with fuzzy search over tabs, tools, agents, memory entries, and settings would dramatically improve daily usability.

### 3.2 🟠 Notification System
**Identified by: Copilot**
No way to know when a background task (agent, forge job) finishes. A 🔔 notification bell in the nav bar with browser `Notification` API for desktop alerts would make background tasks practical.

### 3.3 🟡 Message Editing and Regeneration
**Identified by: Copilot**
Users can't edit a sent message or regenerate an AI response — a fundamental chat UX feature.

**Fix:** Edit icon on user messages; editing re-runs inference from that point. Regenerate button on AI messages.

### 3.4 🟡 File & Image Attachments in Chat
**Identified by: Copilot**
No way to attach files or images. Vision models (GPT-4o, Gemini, Claude) support this natively.

**Fix:** Add a 📎 button. Send images as vision input to supported models. For non-vision models, extract and include text content. Show thumbnails inline in chat.

### 3.5 🟡 Chat: Thread Export, Search, Archive 🤝
**Identified by: Claude + Copilot**
No search across threads, no export, no archive (only delete).

**Fix:** Global thread search by keyword. Export as Markdown/JSON/plaintext. Archive flag (hides without deleting).

### 3.6 🟡 Response Bookmarking / Starring
**Identified by: Copilot**
Useful AI responses disappear into thread history. ⭐ bookmark icon on messages. Starred messages appear in a **Starred** sub-tab. Optionally auto-save to Memory Tier as high-importance entries.

### 3.7 🟡 Conversation Branching
**Identified by: Copilot**
A **Branch** button at any assistant message creates a fork. Branches shown as a tree in the thread sidebar.

### 3.8 🟡 Customisable Tabs — Pin and Reorder
**Identified by: Copilot**
With 25+ tabs, the sidebar is overwhelming. Drag-to-reorder + ★ pin for frequently used tabs, saved to `preferences.json`.

### 3.9 🟡 Keyboard Shortcuts
**Identified by: Copilot**
Most interactions require a mouse. Standard shortcuts: new thread, send message, tab switching. `?` shortcut reference accessible from the nav.

### 3.10 🟡 Auto-Routing Transparency
**Identified by: Copilot**
The auto-router's logic is opaque. A `routing_reason` annotation ("Selected Gemini Flash — low complexity, cost-optimised") under AI responses would build trust in the system.

### 3.11 🟡 Model Capability Tags
**Identified by: Copilot**
Model selectors show names but not capabilities. Enrich `suggested_models.json` with tags: `vision`, `code`, `long-context`, `reasoning`. Show as coloured badges.

### 3.12 🟡 Rate Limit Visibility
**Identified by: Claude**
No UI indication when a request is queued due to rate limiting vs. genuinely slow. A "queued (rate limit)" status prevents users from thinking the system is broken.

### 3.13 🟡 Image Generation Gallery
**Identified by: Claude**
Images generate but disappear. A local gallery (prompt → image pairs) with cost tracking and ability to re-run or iterate.

### 3.14 🟡 Arena: ELO Leaderboard + Human Judge Mode 🤝
**Identified by: Claude + Copilot**
Arena battles produce results but no persistent ranking. Add ELO rating per provider in `data/arena/history.json`. Human Judge mode: both responses shown without labels, user picks the better one.

> **Claude correction:** The Arena tab already provides side-by-side comparison — Copilot's "Provider Comparison Mode" is already implemented. The actual gap is persistence and ELO, not the comparison itself.

### 3.15 🟡 Prompt Library / Templates 🤝
**Identified by: Claude + Copilot**
A `/` slash-command shortcut in chat + a named library with categories. Import/export as JSON. Ship 20 built-in templates.

### 3.16 🟢 Customisable Dashboard Home (Widgets)
**Identified by: Copilot**
The home screen is a static landing page. A widget grid — recent chats, active agents, memory stats, system health, cost today — would make it a functional hub.

### 3.17 🟢 Dark/Light Theme Toggle
**Identified by: Copilot**
CSS custom properties are already used. A light theme + toggle saves to `localStorage`.

---

## Part 4 — App-Specific Improvements

### Code IDE (Port 8083)

**4.1 🟠 Multi-File AI Context** (Copilot)
Smart context selection: open file + AST-detected imports. Users can 📌 pin additional files. Prevents context window overflow on large projects.

**4.2 🟠 Git Integration** (Copilot)
Git branch shown in status bar but no operations exposed. Add `status`, `diff`, `commit`, `log`, `checkout branch`. Show a Source Control panel with inline diff gutter markers in Monaco.

**4.3 🟡 Diff View Before AI Applies Changes** (Claude)
When AI rewrites a file, you just get the new version. Side-by-side before/after diff with Approve/Reject prevents accidental overwrites.

**4.4 🟡 AI Code Review on Save** (Copilot)
Optional toggle: saving a file triggers a quick AI review posting inline annotations as Monaco markers.

**4.5 🟡 Hand-Off to Agents** (Claude)
A "Hand off to Agent" button that sends the current file + task description to the Agents workspace. The two systems are currently isolated.

**4.6 🟡 Persistent Terminal (xterm.js)** (Copilot)
Current terminal doesn't maintain session state. A true persistent shell with multiple tabs + AI-suggested commands with Approve/Deny gate.

**4.7 🟢 Background Dev Agent** (Antigravity — unique idea)
A background agent that monitors the active editor. On save: proactively analyses for bugs, runs linting, generates unit tests into a split pane. More powerful than inline ghost text and fits Aethvion's agent architecture naturally.

---

### Audio App

**4.8 🟠 Audio Effect Presets** (Copilot)
Named preset chains for common workflows (podcast cleanup, voice-over, music mastering). Save/load custom presets.

**4.9 🟡 AI Transcript + Chapter Markers** (Copilot)
After recording/importing: transcribe via Whisper → LLM segments into chapters → chapter markers added to timeline as cue points.

**4.10 🟡 Export Format Options** (Copilot)
MP3, OGG, FLAC, WAV with configurable bitrate via `pydub`/`ffmpeg`.

**4.11 🟢 AI Music Generation** (Copilot)
Text description → music via MusicGen or a cloud API. Generated audio drops into a new timeline track.

---

### VTuber / Specter Engine

**4.12 🟠 Live Tracking Integration** (Copilot)
Specter and Synapse tracking are separate. A **Connect Tracking** button that auto-discovers the running Synapse instance would make real-time face tracking seamless.

**4.13 🟡 AI Lip-Sync with TTS** 🤝 (Claude + Copilot + Antigravity)
All three collaborators independently identified this. Wire TTS audio through phoneme extraction to drive mouth animations in sync with speech. Misaka Cipher should speak her own responses while the character animates. One of the most visible "feel" improvements possible.

**4.14 🟢 Desktop Pet Mode** (Antigravity — most creative idea)
A transparent always-on-top OS overlay where the VTuber character sits on the taskbar, reacts to active windows, and announces completed agent tasks via TTS. Ambitious but unique to Aethvion.

---

### Photo App

**4.15 🟠 Layer Blend Modes** (Copilot)
10 standard blend modes (Multiply, Screen, Overlay, etc.) in the canvas compositor.

**4.16 🟡 AI Inpainting** (Copilot)
Selection tool + **Fill with AI** using Stable Diffusion inpainting or DALL-E edit endpoint.

**4.17 🟡 Non-Destructive Adjustment Layers** (Copilot)
Brightness/Contrast, Hue/Saturation, Curves — stackable, non-destructive, toggleable.

---

### Finance App

**4.18 🟠 Real Market Data** (Copilot)
Integrate `yfinance` or Alpha Vantage free tier for live prices with configurable refresh.

**4.19 🟡 Budget Tracking & Categories** (Copilot)
Income/expense entry with category tags. Monthly summary charts. CSV export.

**4.20 🟡 AI Financial Advisor Chat** (Copilot)
A chat panel context-aware of the user's actual portfolio and spending data — grounded answers, not generic advice.

---

## Part 5 — Games

### Expansions to Existing Games

**5.1 🟠 AI Explains Its Moves (All Games)** (Copilot)
An **AI Commentary** toggle across all games — after each AI move, a speech bubble shows its reasoning. Uses the active provider for real-time explanation.

**5.2 🟡 "Are You Smarter Than AI?" — Mode Expansions** (Claude)
Team mode (humans vs AI team), subject packs (specific knowledge domains), difficulty progression, streak bonuses for consecutive correct answers.

**5.3 🟡 Debate Arena** (Copilot)
Two AI providers argue opposite sides of a user-chosen topic. User votes on the winner. Provider scores tracked over time — a fun way to compare reasoning styles.

**5.4 🟡 Twenty Questions** (Copilot)
AI asks ≤20 yes/no questions to guess what the user is thinking. Chain-of-thought visible in an expandable panel. Confidence percentage after each answer.

**5.5 🟡 Story Builder / Collaborative Fiction** 🤝 (Claude + Copilot)
User writes one sentence, AI writes the next, alternating. Genre selectable. At the end, AI rates the story and optionally generates a cover image using the existing image generation.

**5.6 🟡 Chess with AI Opponent** (Copilot)
`chess.js` + `chessboard.js`. Difficulty levels: Easy (random), Medium (minimax), Hard (LLM commentary). Track Elo across sessions.

**5.7 🟡 Code Golf / Programming Puzzle** (Claude — unique idea)
AI generates a programming challenge. Player writes code in Monaco (using existing IDE). AI judge evaluates correctness and scores by brevity/elegance. Unique to Aethvion because it already has code execution.

**5.8 🟡 Dungeon Crawler (Text RPG)** (Copilot)
LLM as dynamic game master: rooms, enemies, items generated in real-time. Player has stats. Save/load to Memory. ASCII art maps.

**5.9 🟡 Persistent Player Profiles** (Claude + Copilot)
All-time scores per game, win/loss vs AI models, streaks, "most beaten model" stats. Saved to local JSON.

**5.10 🟢 Wordle Clone with AI Analysis** (Copilot)
Classic Wordle + AI hints + AI optimal solver on demand.

---

## Part 6 — New Standalone Apps

### 6.1 🟠 Aethvion Notes — AI-Powered Notebook (Copilot)
Markdown editor with live preview. Notes auto-stored as high-importance memories. `[[wiki-link]]` inter-note linking. AI answers questions based on your notes. Backlinks panel. Export to PDF/HTML.

> **Claude's note:** The most practical new app. Combined with the Knowledge Base RAG (§2.6), it creates a complete personal knowledge system — the highest-value use case for local AI.

### 6.2 🟡 Aethvion Tasks — AI Task Manager (Copilot)
Tasks with due dates, priorities, tags. AI auto-prioritises backlog. Natural language task creation. Pomodoro timer. Agent integration: click a task → spawn agent to help complete it.

### 6.3 🟡 Aethvion Transcriber (Copilot)
Drop in audio (MP4/MP3/WAV) or record live. Whisper transcription. AI generates: summary, action items, key decisions, speaker labels. Export as Markdown meeting notes. Auto-saves to Memory Tier.

### 6.4 🟢 Aethvion Canvas — AI Whiteboard (Copilot)
Infinite canvas: sticky notes, freehand drawing, arrows, shapes. Right-click → **Expand with AI** adds related ideas. Auto-cluster with colour-coding. Export SVG/PNG.

### 6.5 🟢 Aethvion Flashcards — Spaced Repetition (Copilot)
Paste text → AI generates a flashcard deck. SM-2 spaced repetition. AI hint mode. Track retention statistics.

---

## Part 7 — Technical Foundation

### Security

**7.1 🔴 Fix Wildcard CORS** (Copilot + Claude)
`allow_origins=["*"]` is dangerous for LAN/cloud deployments. Read allowed origins from `aethvion.yaml`, default to `["http://localhost:8080"]`. `CORS_ORIGINS` env var for override.

**7.2 🟠 API Route Rate Limiting** (Copilot)
No rate limits on any FastAPI route. Add `slowapi` or an in-memory token bucket. Per-route limits configurable in `aethvion.yaml`.

**7.3 🟡 HTTPS/TLS Support** (Copilot)
`--tls` flag loading cert + key from `.env`. For LAN or cloud deployments.

**7.4 🟡 Audit Log Export** (Copilot)
Trace IDs created per-request but not searchable from the UI. Add a sub-tab in Usage: filter by date/provider/trace ID, CSV export.

### Architecture

**7.5 🟠 Pre-flight Startup Checks** (Copilot)
Before server starts: colour-coded summary (✅/⚠️/❌) for Python version, API keys, port conflicts, missing model files. Abort cleanly with actionable messages.

**7.6 🟠 Hot-Reload Config** (Copilot)
Config changes require full restart. Add `POST /api/config/reload` + a **Reload Config** button in Settings. Optional `watchdog` auto-reload.

**7.7 🟡 Consistent Frontend Error Handling** (Claude)
API endpoints return `{"success": false, "detail": "..."}` but the frontend reads `data.detail`, `data.error`, `data.message` inconsistently. A shared `apiPost()` helper with consistent error extraction would reduce bugs across all panels.

**7.8 🟡 Plugin / Extension System** (Copilot)
Files in `core/plugins/` implementing an `AethvionPlugin` interface auto-discovered on startup. Documented with a sample plugin.

### Developer Experience

**7.9 🟠 Docker / Docker Compose** (Copilot)
No Dockerfile exists. Multi-stage build for `core` + optional apps. Cross-platform deployment unlocked.

**7.10 🟠 Linux / macOS Launch Scripts** (Copilot)
Only `.bat` scripts. Equivalent `.sh` scripts + a `Makefile` with `make start`, `make test`, `make lint`.

**7.11 🟠 CI Pipeline (GitHub Actions)** (Copilot)
`pytest` on push/PR, `ruff` lint, Python 3.10 + 3.11. MockProvider class so tests don't call real APIs.

**7.12 🟡 Development Server Hot-Reload** (Copilot)
`--dev` flag → Uvicorn `--reload`, watch `core/`, detailed error pages.

**7.13 🟡 Test Coverage Reporting** (Copilot)
`pytest-cov`, HTML reports, gate CI at >60% coverage.

### Documentation

**7.14 🟡 Interactive Onboarding Tour** (Copilot)
First-visit tour using a JS tour library (`driver.js`). Highlights key UI elements. Skip always visible. Relaunchable from Settings.

**7.15 🟡 Architecture Diagram** (Copilot)
A `docs/architecture.svg` (Mermaid.js) showing data flow: NexusCore → Orchestrator → Factory/Forge/Memory → Providers. Embed in README.

**7.16 🟢 CHANGELOG.md** (Copilot)
Create following Keep a Changelog format. The version log in `system-status.json` is internal — a proper CHANGELOG is for external readability.

---

## Part 8 — Fun & Personality

### 8.1 🟠 Persona Progression & Unlock System (Antigravity — unique idea)
Gamify daily use: earn "Sync Points" for successful agent tasks, game wins, configured providers, etc. Points unlock new UI themes, TTS voice profiles, and persona system prompts. Creates a sense of investment and progression. Antigravity's most inventive idea and fits Aethvion's personality strongly.

### 8.2 🟡 Daily AI Briefing 🤝 (Copilot + Antigravity)
Opt-in daily briefing at a configured time. Misaka Cipher summarises: weather, top 3 memory items from yesterday, pending agent tasks, a random fact. Dashboard notification + optional TTS. Ties directly into Scheduled Automations (§2.11).

### 8.3 🟡 AI Achievement System (Copilot + Antigravity)
Hidden achievements for milestones: first conversation, first tool generated, first agent run, 100 messages, all providers configured. Shown in a trophy modal. Purely cosmetic but rewarding.

### 8.4 🟡 Misaka Cipher Idle Animations (Copilot)
The chibi sprite is static. CSS sprite sheet idle animations: breathing, blinking, head-turn. Thinking animation during inference. Error expression on failure.

### 8.5 🟢 Desktop Pet Mode (Antigravity — most creative idea)
A transparent OS overlay where the VTuber character lives on the desktop, reacts to activity, and announces completed agent tasks via TTS. Ambitious but genuinely unique to Aethvion.

### 8.6 🟢 Federated Aethvion Instances (Antigravity — ambitious)
Connect with friends who run Aethvion Suite. Share conversations and agent results.

> **Claude's note:** Interesting idea but needs careful security design before implementation. Cross-instance communication could expose memory or API keys if not properly isolated. Recommend: start with read-only sharing (conversation export/share) before any cross-instance agent execution.

### 8.7 🟢 Seasonal Themes & Easter Eggs (Copilot)
CSS overrides for seasonal events in `themes/`. Easter eggs: Konami code animation, "what are you?" lore response, hidden LEGENDARY Arena difficulty with 3 providers simultaneously.

---

## Master Priority Table

| Item | Impact | Effort | When |
|------|--------|--------|------|
| 🔴 Intelligence Firewall — real local model | Very High | Medium | **Now** |
| 🔴 Memory retrieval wired to chat | Very High | Medium | **Now** |
| 🔴 Local model GPU offload (CUDA build) | Very High | Low | **Now** |
| 🔴 Package manager — complete or hide | High | Low | **Now** |
| 🔴 Dashboard authentication | High | Low | **Now** |
| 🔴 Fix Wildcard CORS | High | Very Low | **Now** |
| 🟠 Agent native tool calling API | Very High | High | Soon |
| 🟠 Ollama provider | High | Medium | Soon |
| 🟠 Knowledge Base / RAG UI | High | Medium | Soon |
| 🟠 Voice-first conversation loop | High | Low | Soon |
| 🟠 Circuit breaker for providers | High | Low | Soon |
| 🟠 Cost budget alerts | High | Low | Soon |
| 🟠 Tool Forge TDD + sandbox | High | Medium | Soon |
| 🟠 Global command palette (Ctrl+K) | High | Medium | Soon |
| 🟠 Notification system | High | Low | Soon |
| 🟠 Agent: more tools (web, python, ask_user) | High | Medium | Soon |
| 🟠 Streaming end-to-end in chat | Medium | Medium | Soon |
| 🟡 Agent persistence / resume | Medium | Medium | Next |
| 🟡 Multi-agent coordination | High | High | Next |
| 🟡 Scheduled automations | High | Medium | Next |
| 🟡 Chat: edit messages + regenerate | High | Low | Next |
| 🟡 File & image attachments in chat | High | Medium | Next |
| 🟡 Chat thread search / export / archive | Medium | Low | Next |
| 🟡 Model capability tags | Medium | Low | Next |
| 🟡 Code IDE: diff view, git, multi-file context | Medium | Medium | Next |
| 🟡 Audio: presets, transcript, export formats | Medium | Medium | Next |
| 🟡 VTuber: live tracking + lip-sync | High | High | Next |
| 🟡 Finance: real market data, budget | Medium | Low | Next |
| 🟡 Arena: ELO leaderboard + human judge | Medium | Low | Next |
| 🟡 Prompt library | Medium | Low | Next |
| 🟡 Persistent game profiles | Low | Low | Next |
| 🟡 Chess, Debate Arena, Story Builder | Medium | Medium | Later |
| 🟡 Aethvion Notes app | High | High | Later |
| 🟡 Aethvion Tasks app | Medium | High | Later |
| 🟡 Aethvion Transcriber | Medium | Medium | Later |
| 🟡 Persona progression / unlock system | Medium | Medium | Later |
| 🟡 Achievement system | Low | Low | Later |
| 🟡 Daily AI briefing | Medium | Low | Later |
| 🟡 Docker + CI pipeline + cross-platform | Medium | Medium | Later |
| 🟡 Pre-flight startup checks | Medium | Low | Later |
| 🟢 Desktop pet mode | High (fun) | Very High | Future |
| 🟢 Federated Aethvion instances | High (fun) | Very High | Future |
| 🟢 AI whiteboard / canvas | Medium | High | Future |
| 🟢 Flashcards / spaced repetition | Low | Medium | Future |
| 🟢 Background Dev Agent (IDE) | Medium | Medium | Future |
| 🟢 Seasonal themes, easter eggs, animations | Low | Low | Anytime |

---

## Points of Convergence — All Three Plans Agreed

These items were identified independently by multiple collaborators. Highest confidence:

1. **Memory must be wired to chat responses** — not just stored, never surfaced
2. **Ollama as a provider** — GPU-friendly, user-friendly, 100+ models, no build required
3. **Scheduled automations** — the execution stack exists, just needs a trigger layer
4. **Multi-agent coordination** — natural evolution of the existing agent system
5. **VTuber lip-sync with TTS** — makes the whole experience feel alive
6. **Knowledge Base / RAG** — highest-value use case for local AI, infrastructure mostly there
7. **Tool Forge needs TDD + sandboxing** — currently unreliable for anything complex

---

## Claude's Final Editorial Notes

**What Copilot got right:** The most thorough and structured plan. Particularly strong on security hardening, developer experience, and app-specific depth. The CORS/auth gap and cost budget alerts are genuinely important and easy to overlook.

**What Copilot got wrong:**
- The Arena tab already provides side-by-side provider comparison. The gap is persistence and ELO, not the comparison itself.
- Streaming is already used correctly in the agent runner. The pattern exists and works — it just needs consistent application to chat.
- No mention of the Intelligence Firewall being a placeholder — the most significant oversight given it's the platform's stated privacy claim.

**What Antigravity got right:** The most creative and systems-thinking plan. Desktop Pets, Persona Progression, and Federated Instances are genuinely original. The IDE Background Dev Agent framing is architecturally stronger for Aethvion than inline ghost text.

**What Antigravity missed:** Depth on specifics. Strong on concepts, light on implementation detail. The Federated Instances idea needs a security design before it's buildable.

**Overall assessment:** Aethvion Suite has genuinely impressive scope. The risk is feature breadth outpacing depth — 25+ panels exist but several are stubs or disconnected from backend capabilities. The most valuable near-term work is making what's already built actually work: memory retrieval in chat, the firewall using a real local model, GPU offload, and agent reliability via native tool calling. Get those right, and the platform becomes the coherent, trustworthy system it's trying to be. Then the fun stuff — desktop pets, voice conversations, the knowledge base — will have a solid foundation to build on.

---

*Final_Plan.md — synthesised from Copilot_Plan.md · Antigravity_Plan.md · Claude_Plan.md*
*Final editorial pass: Claude Sonnet 4.6 — March 2026*
