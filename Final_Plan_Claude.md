# Final Plan — Claude's Domain: Backend Architecture

> **Assignee:** Claude
> **Parallel with:** Final_Plan_Copilot.md and Final_Plan_Antigravity.md
> **Prerequisite for:** Final_Plan_Finalize.md
> **Source:** Final_Plan.md (backend items only)

---

## File Boundaries

### ✅ Files Claude MAY touch
```
core/orchestrator/          ← agent runner, task queue, orchestrator, scheduler
core/providers/             ← all provider classes, provider manager, failover
core/memory/                ← ChromaDB wrapper, episodic memory, history manager
core/security/              ← firewall scanner, intelligence router
core/forge/                 ← tool code generator, validator, registry
core/workers/               ← discord worker, background workers
core/factory/               ← agent factory, agent specs, base agent
core/nexus_core.py          ← central routing hub (memory injection hook)
core/config/                ← YAML configs (providers.yaml, aethvion.yaml, etc.)
core/utils/                 ← shared utilities
```

### 🚫 Files Claude must NOT touch
```
core/interfaces/            ← Copilot's domain
apps/                       ← Antigravity's domain
*.bat                       ← Antigravity's domain
core/main.py                ← Finalize domain (startup sequence)
```

### 📤 What Claude exposes for others
After completing this plan, the following must be documented in `core/interfaces/dashboard/server.py` comments (not implemented — just noted for Finalize/Copilot):
- `GET /api/memory/search?q=...` — memory retrieval endpoint (for UI toggle)
- `GET /api/providers/health` — extended health with circuit state + latency
- `GET /api/providers/budget` — current spend vs budget
- `POST /api/scheduler/task` — create scheduled task
- `WebSocket /ws/agent/{thread_id}` — agent coordination bus
- `GET /api/ollama/models` — list available Ollama models

---

## Implementation Order

Work in this order — each item builds on the previous.

---

### PHASE 1 — Providers (foundation everything else needs)

#### C-1 🔴 Ollama Provider
**File:** `core/providers/ollama_provider.py` (new)
**Register in:** `core/providers/provider_manager.py`

Create an `OllamaProvider` class matching the existing provider interface:
- `generate(prompt, model, temperature, max_tokens, **kwargs) -> ProviderResponse`
- `stream(prompt, model, temperature, max_tokens, **kwargs) -> Iterator[str]`
- `health_check() -> bool`
- `list_models() -> list[str]` — calls `GET http://localhost:11434/api/tags`

API calls:
- Generation: `POST http://localhost:11434/api/generate` with `{"model": ..., "prompt": ..., "stream": false}`
- Chat: `POST http://localhost:11434/api/chat` with `{"model": ..., "messages": [...], "stream": false}`
- Streaming: same endpoints with `"stream": true`, read newline-delimited JSON chunks

Auto-detect: on `ProviderManager` startup, attempt `GET http://localhost:11434/api/tags`. If it responds, register `OllamaProvider` and log all available model names. If not running, skip silently.

Config in `core/config/providers.yaml`:
```yaml
ollama:
  base_url: "http://localhost:11434"
  timeout: 120
  enabled: true
```

#### C-2 🔴 Circuit Breaker for Providers
**File:** `core/providers/circuit_breaker.py` (new)
**Used in:** `core/providers/provider_manager.py`

Implement a `CircuitBreaker` class with three states: `CLOSED` (normal), `OPEN` (failing, skip this provider), `HALF_OPEN` (test one request).

Rules:
- Opens after 5 consecutive failures
- Stays open for 60 seconds
- Half-open: allow one request; if it succeeds → close, if it fails → reopen

Each provider in `ProviderManager` gets its own `CircuitBreaker` instance. Before calling any provider, check its breaker state. Log state transitions.

Store per-provider: `last_10_latencies: deque[float]`, `failure_count: int`, `last_error: str`, `last_error_time: datetime`.

Expose on `ProviderManager`:
```python
def get_provider_stats(self) -> dict:
    # Returns dict of provider_name → {state, failure_count, avg_latency_ms, last_error}
```

#### C-3 🟠 Cost Budget Tracking
**File:** `core/providers/budget_tracker.py` (new)
**Used in:** `core/providers/provider_manager.py`

Track cumulative token costs per provider per month. Load/save to `data/usage/budget.json`.

```python
class BudgetTracker:
    def record(self, provider: str, input_tokens: int, output_tokens: int, model: str): ...
    def get_monthly_spend(self) -> float:  # USD
    def get_budget_limit(self) -> float:  # from aethvion.yaml monthly_budget_usd
    def is_over_budget(self) -> bool:
    def get_budget_pct(self) -> float:  # 0.0–1.0
```

Add to `aethvion.yaml`:
```yaml
budget:
  monthly_budget_usd: 20.0
  warn_at_pct: 0.8
  block_at_pct: 1.0
```

Integrate into `call_with_failover`: after every successful cloud call, call `budget_tracker.record(...)`. If `is_over_budget()`, raise a `BudgetExceededError` before making the API call.

---

### PHASE 2 — Memory (used by chat and agents)

#### C-4 🔴 Memory Retrieval — Wire to Nexus Core
**File:** `core/nexus_core.py` and `core/memory/episodic_memory.py`

Add a `retrieve_relevant(query: str, top_k: int = 3, threshold: float = 0.6) -> list[dict]` method to `EpisodicMemory`. Filter results below the threshold score.

In `NexusCore.process_request()`, before dispatching to the provider:
1. If `request.context_mode != "chat_only"` or the thread has memory enabled → call `retrieve_relevant(request.message)`
2. If results found, prepend to the system prompt:
```
Relevant memories:
- [timestamp] {memory_text}
- [timestamp] {memory_text}
```
3. Store a `memory_injected: bool` flag on the response for the UI to show

Per-thread memory toggle: read from thread metadata key `"memory_enabled"` (default `True`). The API for toggling is a Finalize/Copilot concern.

#### C-5 🟡 Memory Quality Improvements
**File:** `core/memory/episodic_memory.py`

- Make the embedding model configurable from `memory.yaml`: `embedding_model: "all-MiniLM-L6-v2"`
- Add importance scoring (1–10) at store time: quick LLM call "Rate the importance of this information for future recall (1–10, integer only):" — use the fastest available provider
- Add namespace support to the memory schema: store `namespace: str` with each entry (defaults to thread_id)
- `retrieve_relevant()` accepts optional `namespace` parameter to scope search
- Memory importance boosts retrieval ranking: `final_score = similarity_score * (0.5 + importance/20)`

#### C-6 🟡 Memory Timeline and Tagging Support
**File:** `core/memory/episodic_memory.py`

Add new query methods for the UI (Copilot will build the frontend):
```python
def get_timeline(self, days: int = 30) -> dict[str, list]:
    # Returns {date_str: [memory entries]} grouped by day

def get_namespaces(self) -> list[str]:
    # Returns all distinct namespaces

def update_memory(self, memory_id: str, new_text: str): ...
def delete_memory(self, memory_id: str): ...
def export_all(self) -> list[dict]: ...
def import_memories(self, memories: list[dict]): ...
```

Add API routes in `core/interfaces/dashboard/server.py` — wait, that's Copilot's file. Instead, add a `MemoryAPI` helper class in `core/memory/memory_api.py` with these methods that Copilot's routes can call.

---

### PHASE 3 — Security (firewall)

#### C-7 🔴 Intelligence Firewall — Real Local Inference
**File:** `core/security/firewall.py` and `core/security/local_classifier.py` (new)

Create `LocalClassifier` that loads a small GGUF model (Llama 3.2 1B preferred) via llama-cpp-python:

```python
class LocalClassifier:
    def __init__(self, model_path: Path):
        # Load model with n_ctx=256, n_gpu_layers=-1 if CUDA available

    def classify_intent(self, text: str) -> ClassificationResult:
        # Returns: {harmful: bool, pii_detected: bool, credential_detected: bool, confidence: float}
        # Single LLM call with a binary prompt, max_tokens=10
```

Prompt template:
```
Classify this text. Reply with JSON only: {"harmful": false, "pii": false, "credentials": false}

Text: {text[:500]}
```

In `firewall.py`:
- Replace the placeholder with `LocalClassifier.classify_intent()`
- Keep regex patterns as a fast first-pass filter (still useful for speed)
- If local model isn't loaded, log a warning and allow through (graceful degradation)
- Also run `classify_intent()` on Tool Forge generated code before registration

Model selection logic:
1. Try `localmodels/gguf/Llama-3.2-1B-Instruct-Q4_K_M.gguf`
2. Fall back to smallest available GGUF in `localmodels/gguf/`
3. If no models found, log warning and operate in regex-only mode

#### C-8 🟠 Secrets Scanning for Forge Output
**File:** `core/forge/tool_forge.py` and `core/security/firewall.py`

In `ToolForge`, before registering any generated tool:
1. Call `firewall.scan_code(generated_source: str) -> ScanResult`
2. `scan_code` runs: regex patterns for common secret formats (API keys, passwords, tokens) + the `LocalClassifier` on the first 1000 chars
3. If `credential_detected=True`, refuse registration and return an error explaining why

---

### PHASE 4 — Agent System

#### C-9 🟠 Agent Native Tool Calling
**File:** `core/orchestrator/agent_runner.py`

Replace the `ACTION: {json}` free-text parsing pattern with provider-native function/tool calling where available.

Define tool schemas as JSON Schema objects:
```python
TOOL_SCHEMAS = {
    "read_file": {"type": "function", "function": {"name": "read_file", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    "write_file": {...},
    "list_dir": {...},
    "run_shell": {...},
    "web_search": {...},
    "read_url": {...},
    "ask_user": {...},
    "run_python": {...},
    "remember": {...},
    "recall": {...},
    "set_plan": {...},
    "mark_done": {...},
    "add_note": {...},
}
```

Provider-specific tool calling:
- **Gemini:** `tools=[{"function_declarations": [...]}]` parameter in generation config
- **OpenAI/Grok:** `tools=[{"type": "function", "function": {...}}]` in chat completion
- **Anthropic:** `tools=[{"name": ..., "description": ..., "input_schema": {...}}]`
- **Local/Ollama:** Fall back to the existing `ACTION:` JSON format (these don't support tool calling)

Detection: check `provider.__class__.__name__` to select the right calling convention.

Keep the existing `ACTION:` parser as a fallback for providers that don't support tool calling.

#### C-10 🟠 More Agent Tools
**File:** `core/orchestrator/agent_tools.py` (new — extract tool implementations here)

Implement:
```python
def web_search(query: str) -> str:
    # DuckDuckGo instant answer API (no key needed):
    # GET https://api.duckduckgo.com/?q={query}&format=json&no_html=1
    # Return formatted top results

def read_url(url: str, max_chars: int = 8000) -> str:
    # requests.get(url) + BeautifulSoup to extract text
    # Strip scripts, styles, nav. Return clean text truncated to max_chars.

def ask_user(question: str) -> str:
    # Post a question event to the agent's SSE stream
    # Block the agent iteration until a response arrives via POST /api/agents/respond/{thread_id}
    # The UI (Copilot's domain) renders a text box when this event arrives

def run_python(code: str, timeout: int = 10) -> str:
    # subprocess.run(['python', '-c', code], capture_output=True, timeout=timeout)
    # Return stdout + stderr, truncated to 2000 chars
    # Restrict: no file writes outside workspace, no network (use subprocess resource limits)

def remember(content: str, importance: int = 5) -> str:
    # Write to EpisodicMemory with given importance
    # Returns confirmation string

def recall(query: str, top_k: int = 3) -> str:
    # Query EpisodicMemory.retrieve_relevant()
    # Return formatted results as string
```

Register all tools in `AgentRunner.__init__` and include them in the tool schema list.

#### C-11 🟠 Agent Persistence — Backend
**File:** `core/orchestrator/agent_runner.py` and `core/orchestrator/agent_workspace_manager.py` (if exists, else `core/memory/agent_workspace_manager.py`)

Add to `AgentRunner`:
```python
@classmethod
def resume(cls, thread_id: str, workspace: Path, model_id: str, nexus) -> "AgentRunner":
    # Load existing _state.json for this thread
    # Reconstruct runner with state, mark as resuming
    # Returns runner ready to continue from last step

def can_resume(thread_id: str, workspace: Path) -> bool:
    # Returns True if _state.json exists and task is not marked complete
```

Add to `AgentWorkspaceManager` (or create it):
```python
def list_resumable_threads(self, workspace_id: str) -> list[dict]:
    # Returns threads that have a _state.json with incomplete tasks
    # [{thread_id, task_summary, last_step, step_count, timestamp}]
```

The API endpoint to trigger resume is Copilot's concern — expose the method here.

#### C-12 🟡 Multi-Agent Coordination — Backend
**File:** `core/orchestrator/agent_bus.py` (new)

Simple in-memory message bus:
```python
class AgentBus:
    _instance = None  # singleton

    def post(self, from_agent: str, to_agent: str, message: str): ...
    def receive(self, agent_id: str, timeout: float = 30.0) -> Optional[str]: ...
    def broadcast(self, from_agent: str, message: str): ...
    def list_agents(self) -> list[str]: ...  # active agent thread IDs
```

Add a `delegate_to_agent(agent_name: str, task: str)` tool to `agent_tools.py`:
- Posts the task to the bus
- Spawns a new `AgentRunner` with the delegated task
- Returns the sub-agent's thread_id so the parent can poll for results

---

### PHASE 5 — Scheduling

#### C-13 🟡 Scheduled Automations — Backend
**File:** `core/orchestrator/scheduler.py` (new)

```python
class TaskScheduler:
    def add_task(self, task_id: str, cron_expr: str, agent_task: str,
                 workspace_id: str, model_id: str,
                 output: Literal["notification", "discord", "file"],
                 output_target: str = "") -> bool:

    def remove_task(self, task_id: str): ...
    def list_tasks(self) -> list[dict]: ...
    def start(self): ...  # starts background thread
    def stop(self): ...
```

Use `croniter` library for cron expression parsing. On trigger: spawn `AgentRunner` with the task, collect output, route to the configured output destination.

Persist tasks to `data/config/scheduled_tasks.json`.

Start the scheduler in `core/main.py` — leave a TODO comment: `# TODO: Finalize — start scheduler here after nexus is ready`

---

### PHASE 6 — Tool Forge Improvements

#### C-14 🟠 Tool Forge: TDD Validation Loop
**File:** `core/forge/tool_forge.py` and `core/forge/forge_validator.py`

After code generation:
1. **Decomposition phase:** Before generating the full tool, ask the LLM to produce function signatures + docstrings only. Review these for completeness, then request implementations.
2. **Test generation:** Ask LLM: "Write a pytest unit test for this tool. Focus on the happy path and one edge case."
3. **Sandboxed test run:** `subprocess.run(['python', '-m', 'pytest', test_file, '-x', '--tb=short'], timeout=30, cwd=workspace)`
4. **Self-correction loop:** If test fails, send the traceback back to the LLM: "The test failed. Here is the error: {traceback}. Fix the implementation." Retry up to 3 times.
5. **Dry-run mode:** Add `dry_run=True` parameter to `generate_tool()`. When True, return `{code, test, scan_result}` without registering.

#### C-15 🟡 Tool Versioning
**File:** `core/forge/tool_registry.py`

Keep last 5 versions per tool. Store as `{tool_name}_v{n}.py`. New field `version: int` on tool metadata. `get_history(tool_name) -> list[dict]` returns all versions with timestamps.

---

### PHASE 7 — Discord Worker

#### C-16 🟡 Discord Worker — Complete Logic
**File:** `core/workers/discord_worker.py`

Replace the TODO stub with real decision logic:
```python
async def _should_reach_out(self) -> list[NotificationItem]:
    items = []
    # 1. Check for completed agent tasks since last check
    items += self._get_completed_agent_tasks()
    # 2. Check for high-importance memory items flagged in last 24h
    items += self._get_important_memories()
    # 3. Check for budget alerts from BudgetTracker
    items += self._get_budget_alerts()
    return items
```

Format notifications as Discord embeds. Include thread links where applicable.

---

## Contracts for Other Plans

The following are **outputs** this plan produces that other plans depend on. Document these clearly in code comments.

| What | Where | Who uses it |
|------|-------|-------------|
| `OllamaProvider` registered in `ProviderManager` | `core/providers/` | Finalize (surfaces in UI model selector) |
| `ProviderManager.get_provider_stats()` | `core/providers/provider_manager.py` | Finalize (wires to status panel) |
| `BudgetTracker.get_budget_pct()` | `core/providers/budget_tracker.py` | Finalize (wires to dashboard banner) |
| `EpisodicMemory.retrieve_relevant()` | `core/memory/episodic_memory.py` | Nexus Core (already wired in C-4) |
| `MemoryAPI` helper class | `core/memory/memory_api.py` | Copilot (timeline/edit routes) |
| `AgentRunner.resume()` | `core/orchestrator/agent_runner.py` | Finalize (Resume button API) |
| `AgentBus` | `core/orchestrator/agent_bus.py` | Finalize (multi-agent UI) |
| `TaskScheduler` | `core/orchestrator/scheduler.py` | Finalize (scheduler UI) |
| `LocalClassifier` | `core/security/local_classifier.py` | Internal only |
| `ask_user` tool event format | `core/orchestrator/agent_tools.py` | Copilot (renders question box in agent UI) |

---

## Summary Checklist

- [ ] C-1 Ollama provider + auto-detect
- [ ] C-2 Circuit breaker (per-provider state machine)
- [ ] C-3 Budget tracker + BudgetExceededError
- [ ] C-4 Memory retrieval wired to Nexus Core
- [ ] C-5 Memory quality (importance scoring, namespaces)
- [ ] C-6 Memory timeline/edit/export methods
- [ ] C-7 Intelligence Firewall — LocalClassifier with real GGUF
- [ ] C-8 Secrets scanning on Forge output
- [ ] C-9 Agent native tool calling (provider-specific schemas)
- [ ] C-10 New agent tools (web_search, read_url, ask_user, run_python, remember, recall)
- [ ] C-11 Agent resume — backend methods
- [ ] C-12 Agent bus — multi-agent coordination backend
- [ ] C-13 Task scheduler — cron-based backend
- [ ] C-14 Tool Forge TDD validation loop
- [ ] C-15 Tool versioning
- [ ] C-16 Discord worker — complete decision logic
