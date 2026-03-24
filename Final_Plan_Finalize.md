# Final Plan — Finalize: Integration & Connection Layer

> **Assignee:** Any single agent (Claude recommended — heavy on backend wiring)
> **Prerequisite:** Final_Plan_Claude.md, Final_Plan_Copilot.md, and Final_Plan_Antigravity.md must all be completed first
> **Purpose:** Connect the pieces the three parallel plans built but kept isolated from each other

---

## What This Plan Does

The three parallel plans were intentionally kept in separate file domains to allow simultaneous execution without conflicts. Each plan built its piece independently, using stubs and placeholder calls where cross-domain integration was needed.

This plan:
1. Removes all stubs and replaces them with real connections
2. Wires backend capabilities to frontend UI
3. Connects standalone apps to the main dashboard
4. Handles anything that genuinely touches multiple domains
5. Completes security hardening end-to-end
6. Tests that the full system works together

---

## Before Starting This Plan

Verify all three parallel plans are complete:
- [ ] `Final_Plan_Claude.md` — all C-X items checked
- [ ] `Final_Plan_Copilot.md` — all P-X items checked
- [ ] `Final_Plan_Antigravity.md` — all A-X items checked

Run a quick health check:
```bash
python -m pytest core/tests/ -x --tb=short          # Claude's tests
curl http://localhost:8080/api/status               # Copilot's dashboard
curl http://localhost:8083/api/health               # Code IDE
curl http://localhost:8085/api/health               # Notes app
curl http://localhost:8086/api/health               # Tasks app
curl http://localhost:8087/api/health               # Transcriber
```

---

## Integration Tasks

---

### SECTION 1 — Backend → Dashboard Connections

#### F-1 🔴 Wire Memory Toggle to Chat UI
**Touches:** `core/nexus_core.py` (Claude) + `core/interfaces/dashboard/chat_routes.py` (Copilot)

Claude's plan wires memory retrieval into Nexus Core and reads a `memory_enabled` flag from thread metadata.
Copilot's plan builds the chat UI with a per-thread toggle.

**Connect:**
1. Add `PATCH /api/chat/threads/{id}/settings` route with `{"memory_enabled": bool}` — persists to thread metadata
2. Ensure the chat UI toggle (built by Copilot) calls this endpoint
3. Add a small 🧠 indicator in the chat header when memory context was injected (uses the `memory_injected` flag on responses)
4. Test: create a memory, start a new thread, ask something related — confirm the memory appears as context

#### F-2 🔴 Surface Ollama Models in Model Selector
**Touches:** `core/providers/ollama_provider.py` (Claude) + `core/interfaces/dashboard/server.py` + model selector JS (Copilot)

Claude's `OllamaProvider.list_models()` returns available model names from the running Ollama instance.

**Connect:**
1. Add route `GET /api/providers/ollama/models` that calls `provider_manager.get_ollama_models()` (returns empty list if Ollama not running)
2. In the model selector JS: after loading GGUF models and cloud models, also call this endpoint and append results with an "🦙 Ollama: " prefix
3. Auto-refresh on model selector open (Ollama user may pull new models at any time)
4. Show Ollama connection status in the status panel: `🟢 Ollama running (7 models)` / `⚫ Ollama not detected`

#### F-3 🔴 Wire Budget Banner to Budget Tracker
**Touches:** `core/providers/budget_tracker.py` (Claude) + `index.html` budget banner element (Copilot)

Copilot's plan adds a `budget-warning-banner` HTML element to `index.html`. Claude's plan adds `BudgetTracker.get_budget_pct()`.

**Connect:**
1. Add route `GET /api/providers/budget` → `{"pct": 0.83, "spent_usd": 16.60, "limit_usd": 20.0, "over_budget": false}`
2. In the dashboard JS startup: call this endpoint and show/hide the banner
3. Poll every 5 minutes
4. Banner text: `⚠️ You've used 83% of your $20.00 monthly budget. $3.40 remaining.`
5. Over-budget state: `🛑 Monthly budget exceeded. Cloud requests are paused. Reset in settings.`

#### F-4 🟠 Wire Provider Circuit State to Status Panel
**Touches:** `core/providers/provider_manager.py` (Claude) + status panel JS (Copilot)

Claude's plan adds `get_provider_stats()` returning state + latency + failure counts.

**Connect:**
1. Add route `GET /api/providers/stats` → per-provider dict `{state, avg_latency_ms, failure_count, last_error}`
2. Status panel shows each provider card with: coloured circuit state badge (`🟢 CLOSED` / `🟡 HALF-OPEN` / `🔴 OPEN`), last 5 latencies as sparkline, failure count
3. "Reset Circuit" button per provider → `POST /api/providers/{name}/reset-circuit`

#### F-5 🟠 Wire Routing Reason to Chat
**Touches:** `core/nexus_core.py` (Claude) + `chat.js` routing annotation (Copilot)

Add `routing_reason: str` to the `NexusResponse` object (e.g., "Selected Gemini Flash — low complexity, cost-optimised routing").
Copilot's chat JS already has the rendering code waiting for this field.

**Connect:**
1. Ensure `NexusCore.process_request()` returns `routing_reason` in its response
2. The annotation appears under AI responses in the chat UI

#### F-6 🟠 Agent Resume Button — End-to-End
**Touches:** `core/orchestrator/agent_runner.py` (Claude) + agents panel JS (Copilot)

Claude's plan adds `AgentRunner.resume()` and `AgentWorkspaceManager.list_resumable_threads()`.
Copilot's agents panel has a Resume button stub.

**Connect:**
1. Add route `GET /api/agents/resumable/{workspace_id}` → calls `list_resumable_threads()`
2. Add route `POST /api/agents/resume` with `{workspace_id, thread_id, model_id}` → calls `AgentRunner.resume()` and starts execution
3. Agents panel: when loading a workspace, call the resumable endpoint. Show a `↩️ Resume` badge on threads with incomplete tasks. Clicking triggers the resume flow.

#### F-7 🟠 Agent Ask-User — End-to-End
**Touches:** `core/orchestrator/agent_tools.py` (Claude) + agents panel JS (Copilot)

Claude's `ask_user` tool posts an event to the SSE stream and blocks waiting for a response.
Copilot's plan adds `POST /api/agents/respond/{thread_id}`.

**Connect:**
1. Ensure the SSE stream emits an event type `ask_user` with `{"question": "..."}` when the tool is called
2. The agents panel JS handles `ask_user` events: pauses the "thinking" UI, renders a text input + submit button inline in the step log
3. User types answer → JS calls `POST /api/agents/respond/{thread_id}` with `{"answer": "..."}`
4. The blocking `ask_user()` tool implementation unblocks and returns the answer to the agent

#### F-8 🟠 Scheduled Tasks — UI to Backend
**Touches:** `core/orchestrator/scheduler.py` (Claude) + Settings panel (Copilot)

Claude's plan creates `TaskScheduler` with full persistence.
Copilot builds a placeholder scheduler UI section in Settings.

**Connect:**
1. Add routes: `GET /api/scheduler/tasks`, `POST /api/scheduler/tasks`, `DELETE /api/scheduler/tasks/{id}`, `PATCH /api/scheduler/tasks/{id}/toggle`
2. The Settings scheduler panel calls these routes
3. Start the scheduler on server startup: in `core/main.py` (find the TODO comment Claude left)
4. Scheduler output `→ notification`: calls `POST /api/notifications` (Copilot's notification endpoint) on task completion
5. Scheduler output `→ discord`: calls Discord worker

#### F-9 🟡 Multi-Agent UI
**Touches:** `core/orchestrator/agent_bus.py` (Claude) + agents panel JS (Copilot)

Claude's `AgentBus` handles inter-agent messages.

**Connect:**
1. Add `GET /api/agents/bus/messages` → last 50 bus messages
2. In the agents panel, when multiple threads are active in the same workspace: show an "Agent Communications" log section at the bottom listing bus messages in real-time (poll every 2s or extend SSE to include bus events)

---

### SECTION 2 — App → Dashboard Integration

Each standalone app Antigravity built needs to appear in the main dashboard.

#### F-10 🟠 Register New Apps in Ports Panel
**Touches:** `apps/*/` (Antigravity) + `core/interfaces/dashboard/server.py` (Copilot)

The ports panel already shows running services. For each new app:

1. Add a `KNOWN_APPS` dict to server.py:
```python
KNOWN_APPS = {
    "notes": {"name": "Aethvion Notes", "port": 8085, "launcher": "notes_launcher.bat"},
    "tasks": {"name": "Aethvion Tasks", "port": 8086, "launcher": "tasks_launcher.bat"},
    "transcriber": {"name": "Aethvion Transcriber", "port": 8087, "launcher": "transcriber_launcher.bat"},
}
```
2. The ports panel auto-discovers running apps by calling `GET http://localhost:{port}/api/health` for each
3. Show status: 🟢 Running / ⚫ Stopped, with a **Launch** button for stopped apps
4. **Launch** button: calls `POST /api/apps/launch/{app_name}` → runs the `.bat` via `subprocess.Popen`

#### F-11 🟠 Notes App — AI Question Answering
**Touches:** `apps/notes/notes_server.py` (Antigravity stub) + `core/providers/` (Claude)

Antigravity created a stub at `POST /api/notes/{id}/ask`. Connect it:
1. Notes server calls `http://localhost:8080/api/chat/quick` (a new lightweight route on Copilot's server) with `{prompt, context}` where context = the note's full text
2. Or alternatively: import and call the provider directly from the notes app (simpler, but couples the app to core)
3. **Recommended approach:** Proxy through the main dashboard API to keep the notes app decoupled

Add `POST /api/chat/quick` to Copilot's routes: accepts `{prompt, context, model}`, returns `{response}` — no thread persistence. Simple single-shot inference call.

#### F-12 🟠 Tasks App — AI Prioritisation
**Touches:** `apps/tasks/tasks_server.py` (Antigravity stub) + providers (Claude)

Connect `POST /api/tasks/prioritise`:
1. Fetch all incomplete tasks from `data/tasks/tasks.json`
2. Call `POST /api/chat/quick` (from F-11) with: "Given these tasks with deadlines and descriptions, rank them by priority today. Return a JSON array of task IDs in priority order: {tasks_json}"
3. Update task order in the response

#### F-13 🟠 Transcriber App — AI Summarisation
**Touches:** `apps/transcriber/transcriber_server.py` (Antigravity stub) + providers (Claude)

Connect `POST /api/transcribe/summarise/{job_id}`:
1. Load transcript from `data/transcriptions/{job_id}.json`
2. Call `POST /api/chat/quick` with prompt: "Summarise this meeting transcript. Return JSON: {summary, action_items: [{owner, task, deadline}], key_decisions: [...]}"
3. Save results back to the transcription record
4. Also call `POST /api/notes` (Notes API) to save the meeting notes automatically (if Notes app is running)

---

### SECTION 3 — Voice-First Conversation Loop

#### F-14 🟠 Voice Mode — End-to-End
**Touches:** `core/providers/` (Claude) + chat UI (Copilot) + `apps/audio_editor/` (Antigravity)

This is the most complex integration: STT → chat → streaming TTS.

**Architecture:**
```
User speaks → Whisper STT (local) → text → NexusCore → response text
                                                            ↓
                                           Kokoro TTS (local) → audio chunks → browser
```

**Connect:**
1. Add route `GET /api/audio/tts/stream` that accepts `?text=...&voice=...` and streams Kokoro audio as chunked binary (WAV/PCM)
2. Chat voice mode (Copilot built the UI toggle):
   - On voice mode enable: request microphone permission; start Whisper STT recording
   - On silence detection (500ms gap): send audio to `POST /api/audio/stt` → returns text
   - Auto-submit to chat
   - When response arrives: break into sentences at `.`, `!`, `?`
   - Feed sentences one-by-one to `GET /api/audio/tts/stream`
   - Play audio immediately as chunks arrive (Web Audio API / `<audio>` source)
3. Kokoro TTS is already installed at `localmodels/audio/` — use the existing `AudioProvider` or `TTS` class in the audio system

**Performance target:** First audio byte within 1.5 seconds of response text arriving.

---

### SECTION 4 — VTuber Integrations

#### F-15 🟡 VTuber Lip-Sync with TTS
**Touches:** `apps/vtuber/` (Antigravity) + TTS system (rooted in core)

When TTS audio is playing (from voice mode or any TTS call), the VTuber character mouth should animate in sync.

**Connect:**
1. The TTS stream route (F-14) should emit phoneme markers alongside audio chunks
2. A lightweight phoneme extractor: map audio amplitude envelope to jaw bone weight (simplified lip-sync — not perfect but convincing)
3. The VTuber WebSocket (Specter) accepts a `phoneme` event: `{bone: "jaw", weight: 0.0–1.0}`
4. Tie the TTS stream playback amplitude to jaw weight updates at 30fps

#### F-16 🟡 Desktop Pet Notification Bridge
**Touches:** `apps/desktop_pet/` or `apps/vtuber/` (Antigravity) + notification system (Copilot)

Antigravity's desktop pet polls `GET http://localhost:8080/api/notifications`.
Copilot's notification system writes to `data/notifications/pending.json`.

**Connect:**
1. Ensure the polling endpoint is accessible without auth (or that the desktop pet includes auth headers)
2. When a notification is received: pet character animates (wave built into Antigravity's sprite sheet)
3. Pet calls `POST http://localhost:8080/api/audio/tts/quick` to speak the notification text aloud
4. After speaking: mark notification as read via `POST /api/notifications/{id}/read`

---

### SECTION 5 — Code IDE ↔ Agents

#### F-17 🟡 Hand-Off to Agents from Code IDE
**Touches:** `apps/code/code_server.py` (Antigravity) + agent routes (Copilot/Claude)

The Code IDE should have a "🤖 Hand off to Agent" button that sends context to the main Agents workspace.

**Connect:**
1. Add route `POST /api/agents/create-from-ide` on the main dashboard server:
   - Accepts `{file_path, file_content, task_description, workspace_path, model_id}`
   - Creates a new agent thread with the file pre-staged in the workspace
   - Returns `{thread_id, workspace_id}`
2. Code IDE button (add to `apps/code/static/js/editor.js`): opens a small dialog for task description, then calls `POST http://localhost:8080/api/agents/create-from-ide`
3. Shows a toast: "Handed off to Agent. View in dashboard →" with a direct link

---

### SECTION 6 — Persona & Achievement System

#### F-18 🟡 Achievement System — End-to-End
**Touches:** multiple places — track events server-side, display client-side

Add `core/gamification/achievements.py` (new small file):
```python
ACHIEVEMENTS = {
    "first_message": {"title": "Hello World", "description": "Sent your first message", "icon": "💬"},
    "first_agent": {"title": "Architect", "description": "Ran your first agent task", "icon": "🤖"},
    "first_tool": {"title": "Forged", "description": "Generated your first tool", "icon": "⚒️"},
    "all_providers": {"title": "Omnivore", "description": "Configured all 5 providers", "icon": "🌐"},
    "100_messages": {"title": "Chatterbox", "description": "Sent 100 messages", "icon": "🗣️"},
    "first_local": {"title": "On Device", "description": "Used a local model", "icon": "🖥️"},
    "memory_master": {"title": "Remembers", "description": "Stored 50 memories", "icon": "🧠"},
    "game_champion": {"title": "Champion", "description": "Won a game against AI", "icon": "🏆"},
    "budget_saver": {"title": "Budget Savvy", "description": "Used only local models for a full day", "icon": "💰"},
}
```

Track progress in `data/gamification/achievements.json`.

Call `achievements.check(event_type, context)` at key points:
- After each chat message → checks `first_message`, `100_messages`
- After agent task completes → checks `first_agent`
- After tool generation → checks `first_tool`
- After provider configured → checks `all_providers`
- On startup if all local day → checks `budget_saver`

When a new achievement unlocks: emit a notification (uses Copilot's notification system) + trigger a pop-up animation (a brief badge slides in from top-right).

Copilot's trophy modal (built in P-28) calls `GET /api/achievements` to display the full list.

#### F-19 🟡 Daily AI Briefing — End-to-End
**Touches:** `core/orchestrator/scheduler.py` (Claude) + TTS (from F-14) + memory (Claude) + notifications (Copilot)

Wire up the daily briefing as a scheduled task:

1. Create a default scheduled task in `data/config/scheduled_tasks.json`:
```json
{
  "id": "daily_briefing",
  "name": "Daily Briefing",
  "cron": "0 8 * * *",
  "enabled": false,
  "agent_task": "BRIEFING",
  "output": "notification"
}
```

2. Add a special case in the scheduler for `"BRIEFING"` task type:
   - Fetch top 3 recent memories from `EpisodicMemory`
   - Fetch pending agent tasks
   - Fetch budget status
   - Optionally fetch weather (DuckDuckGo instant answer for weather)
   - Compose a short briefing text
   - Post as a notification
   - If voice mode has ever been used: also call the TTS route to play it aloud

3. Add a **Daily Briefing** toggle in Settings with a time picker.

---

### SECTION 7 — System Hardening

#### F-20 🔴 Pre-flight Startup Checks
**Touches:** `core/main.py` + routes

Add a `core/startup_checks.py` module:
```python
def run_preflight() -> list[CheckResult]:
    checks = [
        check_python_version(),        # >= 3.10
        check_api_keys(),              # which providers have keys
        check_local_models(),          # which GGUFs exist
        check_gpu_support(),           # llama-cpp-python GPU flag
        check_ollama(),                # is Ollama running
        check_port_available(8080),    # dashboard port
        check_chromadb(),              # can connect to memory DB
        check_disk_space(),            # warn if < 2GB free
    ]
    return checks
```

Print colour-coded summary to console on startup:
```
Aethvion Suite v11 — Pre-flight Check
✅ Python 3.10.11 — OK
✅ API Keys: Gemini ✓ OpenAI ✓ Anthropic ✓ Grok ✗
⚠️  GPU: llama-cpp-python is CPU-only. Performance will be limited.
✅ Local Models: 6 GGUF models found
⚫ Ollama: Not running (optional)
✅ Port 8080: Available
✅ ChromaDB: Connected
✅ Disk Space: 234 GB free
```

Expose as `GET /api/status/preflight` for Copilot's status bar (P-31).

Abort on truly critical failures (e.g., port 8080 already in use).

#### F-21 🟠 Hot-Reload Config
**Touches:** `core/config/settings_manager.py` + settings panel (Copilot)

Copilot built a **Reload Config** button in Settings calling `POST /api/config/reload`.

Implement the endpoint:
1. Re-read `aethvion.yaml`, `providers.yaml`, `memory.yaml` from disk
2. Re-initialise `ProviderManager` with new provider configs
3. Update `BudgetTracker` budget limits
4. Log all changed values
5. Return `{"reloaded": true, "changes": ["providers.yaml: timeout 30 → 60"]}`

Optional: add `watchdog` file watcher that triggers reload automatically on YAML changes.

#### F-22 🟠 Authentication — Final Wiring
**Touches:** `core/interfaces/dashboard/server.py` (Copilot auth middleware) + app API calls

Copilot's auth middleware protects the dashboard routes. Ensure:
1. The app-to-dashboard API calls (Notes `ask`, Tasks `prioritise`, etc.) include auth headers when `DASHBOARD_PASSWORD` is set
2. The desktop pet's notification polling includes the auth token
3. The Code IDE's agent hand-off call includes auth
4. Add `GET /api/auth/token` for internal app-to-app calls that returns a long-lived service token (separate from the user session token)

---

### SECTION 8 — Package Manager Decision

#### F-23 🔴 Package Manager — Final Call
**Touches:** `core/interfaces/dashboard/static/` sidebar, any package manager routes

As identified in Final_Plan.md, the package manager is flagged internally as unstable.

Decision to make during Finalize:
- **Option A (Recommended):** Remove from the sidebar nav. Add an `<!-- DISABLED: packages-panel -->` comment in index.html. Leave the files in place but inaccessible. Revisit in a future version.
- **Option B:** Complete it with: sandboxed `pip install` in a subprocess, dependency conflict detection via `pip check`, rollback via `pip uninstall` on failure, safety scoring via PyPI metadata.

If choosing Option B, the sandboxing from C-14 (Tool Forge subprocess isolation) can be reused.

---

## Final Verification Checklist

After all integrations are complete:

**Core Flows:**
- [ ] Send a message → memory retrieved and shown in context → `memory_injected` indicator visible
- [ ] Ask about something from a previous session → correct memory surfaced
- [ ] Select an Ollama model → response generated → streams correctly
- [ ] Circuit breaker: disconnect a provider → system fails over → circuit opens → status panel shows OPEN
- [ ] Budget: trigger 80% threshold → warning banner appears
- [ ] Create a scheduled task → it fires at the right time → notification appears

**Agent Flows:**
- [ ] Start an agent task → agent calls `ask_user` → chat panel shows question → answer submitted → agent continues
- [ ] Stop server mid-task → restart → Resume button appears → task continues from last step
- [ ] One agent delegates to another via `delegate_to_agent` → sub-agent completes → parent receives result

**App Integration:**
- [ ] Notes app running → open note → ask AI question → answer generated using note context
- [ ] Transcriber → upload audio → transcript generated → AI summary produced → auto-saved to Notes
- [ ] Code IDE → "Hand off to Agent" → agent tab opens with file context pre-loaded
- [ ] Desktop pet → agent task completes → pet waves → notification spoken aloud

**Voice Flow:**
- [ ] Enable voice mode → speak → STT captures → message sent → response generated → TTS plays → VTuber mouth moves

**System:**
- [ ] Startup: pre-flight summary printed to console
- [ ] All new apps discoverable in the Ports panel
- [ ] Auth enabled → login screen appears → logged-in session works → logout clears session
- [ ] `POST /api/config/reload` → YAML changes picked up without restart

---

## Summary Checklist

- [ ] F-1 Memory toggle end-to-end (backend flag ↔ chat UI)
- [ ] F-2 Ollama models in model selector
- [ ] F-3 Budget banner wired to BudgetTracker
- [ ] F-4 Provider circuit state in status panel
- [ ] F-5 Routing reason in chat annotations
- [ ] F-6 Agent resume — end-to-end
- [ ] F-7 Agent ask_user — end-to-end
- [ ] F-8 Scheduled tasks — UI to backend
- [ ] F-9 Multi-agent bus in agents panel
- [ ] F-10 New apps in ports panel + launch buttons
- [ ] F-11 Notes AI question answering (unstub)
- [ ] F-12 Tasks AI prioritisation (unstub)
- [ ] F-13 Transcriber AI summary → auto-save to Notes
- [ ] F-14 Voice conversation loop (STT → chat → TTS)
- [ ] F-15 VTuber lip-sync with TTS output
- [ ] F-16 Desktop pet notification bridge
- [ ] F-17 Code IDE → Agent hand-off
- [ ] F-18 Achievement system end-to-end
- [ ] F-19 Daily briefing — scheduler + TTS + memory
- [ ] F-20 Pre-flight startup checks
- [ ] F-21 Hot-reload config
- [ ] F-22 Authentication final wiring
- [ ] F-23 Package manager decision (hide or complete)
