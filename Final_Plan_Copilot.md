# Final Plan — Copilot's Domain: Dashboard UI & API Routes

> **Assignee:** Copilot
> **Parallel with:** Final_Plan_Claude.md and Final_Plan_Antigravity.md
> **Prerequisite for:** Final_Plan_Finalize.md
> **Source:** Final_Plan.md (UI/frontend items only)

---

## File Boundaries

### ✅ Files Copilot MAY touch
```
core/interfaces/dashboard/static/          ← ALL JS, CSS, HTML
core/interfaces/dashboard/static/index.html
core/interfaces/dashboard/static/css/
core/interfaces/dashboard/static/js/
core/interfaces/dashboard/static/games/
core/interfaces/dashboard/static/assets/
core/interfaces/dashboard/server.py        ← FastAPI routes + middleware
core/interfaces/dashboard/*_routes.py      ← all existing and new route files
core/interfaces/dashboard/smarter_than_ai_routes.py
data/prompts/                              ← prompt library storage (create if needed)
data/arena/                                ← arena history storage (create if needed)
data/preferences/                          ← UI preferences storage (create if needed)
```

### 🚫 Files Copilot must NOT touch
```
core/orchestrator/          ← Claude's domain
core/providers/             ← Claude's domain
core/memory/                ← Claude's domain
core/security/              ← Claude's domain
core/forge/                 ← Claude's domain
core/workers/               ← Claude's domain
core/nexus_core.py          ← Claude's domain
apps/                       ← Antigravity's domain
*.bat                       ← Antigravity's domain
```

### 📥 What Copilot assumes Claude provides
The following backend methods will exist after Claude's plan completes. Copilot's routes call them but does not implement them:
- `nexus.provider_manager.get_provider_stats()` → circuit breaker state
- `nexus.provider_manager.budget_tracker.get_budget_pct()` → spend percentage
- `EpisodicMemory.retrieve_relevant()` → already wired in nexus, but toggle endpoint needed
- `MemoryAPI` helper class in `core/memory/memory_api.py`
- `AgentRunner.resume()` → for resume button
- `TaskScheduler` in `core/orchestrator/scheduler.py` → for scheduler UI

These will be **stubbed with placeholder returns** in Copilot's routes during parallel development and replaced during Finalize.

---

## Implementation Order

---

### PHASE 1 — Security & Foundation

#### P-1 🔴 Dashboard Authentication
**Files:** `core/interfaces/dashboard/server.py`, new `core/interfaces/dashboard/auth.py`

Add optional single-user PIN/password authentication:
- Read `DASHBOARD_PASSWORD` from `.env`. If not set, auth is completely skipped (dev mode).
- If set: add a `POST /api/auth/login` endpoint that accepts `{"password": "..."}` and returns a session token (UUID stored in memory)
- Add FastAPI middleware that checks for `Authorization: Bearer {token}` header or `auth_token` cookie on all non-auth routes
- Serve a minimal `login.html` page (served at `/login`) when auth fails — no framework, just a plain form
- Add a **Logout** button to the dashboard nav
- Session expires after 24 hours

**Note:** If `DASHBOARD_PASSWORD` is unset, the middleware is skipped entirely — no performance impact in dev mode.

#### P-2 🔴 Fix Wildcard CORS
**File:** `core/interfaces/dashboard/server.py`

Replace:
```python
allow_origins=["*"]
```
With:
```python
import os
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080").split(",")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, ...)
```

#### P-3 🟠 API Rate Limiting
**File:** `core/interfaces/dashboard/server.py`

Add `slowapi` rate limiting:
```python
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

# Per-route limits:
# Chat routes: 30/minute
# Forge routes: 5/minute
# Agent routes: 10/minute
# Memory routes: 60/minute
# Game routes: 60/minute
```

Add a `RateLimitExceeded` handler that returns a clean JSON error with a `retry_after` field.

---

### PHASE 2 — Global Dashboard UX

#### P-4 🟠 Global Command Palette (`Ctrl+K`)
**File:** `core/interfaces/dashboard/static/js/command-palette.js` (new), `index.html`

A floating modal activated by `Ctrl+K` / `Cmd+K`:
- Fuzzy search input (search as you type)
- Results sections: Tabs, Recent Threads, Tools, Agents, Settings
- Keyboard navigation (↑↓ arrows, Enter to select, Escape to close)
- Each result type has an icon and subtitle
- Navigating to a tab: calls the existing `switchTab(tabId)` function
- Navigating to a thread: opens chat + loads that thread

Implementation: pure JS, no framework. Use a simple fuzzy match function (score by character sequence match). Overlay with `position: fixed; z-index: 9999`.

#### P-5 🟠 Notification System
**File:** `core/interfaces/dashboard/static/js/notifications.js` (new), new `core/interfaces/dashboard/notifications_routes.py`

Backend: `GET /api/notifications` returns unread notifications. `POST /api/notifications/{id}/read` marks as read.
Notification store: `data/notifications/pending.json` — Claude's backend writes here when agent tasks complete, budget alerts trigger, etc.

Frontend:
- 🔔 bell icon in top nav with unread count badge
- Clicking opens a dropdown list of recent notifications
- Each notification has: icon, title, timestamp, optional action button
- Poll `GET /api/notifications` every 10 seconds
- Browser `Notification` API for desktop popups (ask permission on first notification)

#### P-6 🟡 Customisable Tab Order and Pinning
**File:** `core/interfaces/dashboard/static/js/sidebar.js` (new or extend existing), `index.html`

- ★ pin icon on each tab item (visible on hover)
- Pinned tabs always appear at the top of the sidebar, separated by a divider
- Drag-to-reorder within pinned and unpinned sections
- Save to `localStorage` key `"aethvion_tab_prefs"` as `{pinned: [...], order: [...]}`
- Restore on page load

#### P-7 🟡 Keyboard Shortcuts
**File:** `core/interfaces/dashboard/static/js/keyboard-shortcuts.js` (new)

Register global `keydown` handlers:
| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open command palette |
| `Ctrl+N` | New chat thread |
| `Ctrl+Enter` | Send message (chat input focused) |
| `Ctrl+/` | Focus chat input |
| `Alt+1..9` | Switch to tab N in sidebar |
| `?` (when input not focused) | Open shortcut reference modal |

Show a `?` shortcut reference modal listing all shortcuts. Accessible from nav footer.

#### P-8 🟡 Dark/Light Theme Toggle
**File:** `core/interfaces/dashboard/static/css/themes.css` (new), existing CSS files

Add a ☀️/🌙 toggle button to the top nav.
Define a `[data-theme="light"]` CSS override on `:root` covering all `--var` custom properties.
Save preference to `localStorage`. Apply on page load before render (to avoid flash).

---

### PHASE 3 — Chat Improvements

#### P-9 🟠 Message Editing and Regeneration
**File:** `core/interfaces/dashboard/static/js/chat.js`, `core/interfaces/dashboard/static/css/chat.css`

- Show a ✏️ pencil icon on user message hover
- Clicking opens an inline edit textarea pre-filled with the original message
- On save: re-run inference from that point, discard subsequent messages in thread
- Show a 🔄 regenerate icon on AI message hover — re-runs the last inference with the same input

Backend: `POST /api/chat/edit` with `{thread_id, message_id, new_content}` — removes all messages after this point and re-queues inference.

#### P-10 🟠 File & Image Attachments
**File:** `core/interfaces/dashboard/static/js/chat.js`, `core/interfaces/dashboard/chat_routes.py`

Add a 📎 button next to the chat input:
- Supports: images (PNG, JPG, GIF, WebP), text files (.txt, .md, .py, .js, .json), PDFs
- Images: shown as thumbnails in chat bubble; sent as base64 vision input for supported models (GPT-4o, Gemini, Claude)
- Text/code files: shown as a file chip; content extracted and prepended to message
- PDFs: extract text via `pdfminer.six` (backend route `POST /api/files/extract`)
- Non-vision models receive text extraction only; vision models receive the image

File size limit: 10 MB. Show error if exceeded.

#### P-11 🟡 Thread Export
**File:** `core/interfaces/dashboard/chat_routes.py`, `static/js/chat.js`

Add `GET /api/chat/export/{thread_id}?format={markdown|json|txt}`:
- **Markdown:** `# Thread: {title}\n\n**User:** ...\n\n**Assistant:** ...` with timestamps
- **JSON:** raw thread data
- **Plain text:** stripped version

Add **Export** button in thread header dropdown menu. Triggers download via `Blob` + `URL.createObjectURL`.

#### P-12 🟡 Thread Search and Archive
**File:** `core/interfaces/dashboard/chat_routes.py`, `static/js/chat.js`

- `GET /api/chat/search?q={query}` — search across all thread titles and message content
- `POST /api/chat/threads/{id}/archive` — set `archived: true` on thread
- Add a 🔍 search icon to the thread list header → opens inline search box
- Add **Archive** option to thread context menu (right-click or ⋯ menu)
- Show an "Archived" section at the bottom of the thread list (collapsed by default)

#### P-13 🟡 Response Bookmarking
**File:** `core/interfaces/dashboard/static/js/chat.js`, chat routes

- ⭐ icon on AI message hover
- `POST /api/chat/bookmark/{thread_id}/{message_id}` — toggles bookmark flag on message
- Add a **Starred** sub-tab in the chat panel showing all bookmarked messages across all threads
- Each starred item links back to the original thread and message

#### P-14 🟡 Conversation Branching
**File:** `core/interfaces/dashboard/static/js/chat.js`, chat routes

- **Branch** button on AI message hover
- `POST /api/chat/branch` with `{thread_id, branch_from_message_id}` — creates a new thread cloned up to that point
- Thread sidebar shows a tree icon (🌿) on branched threads with the parent thread name as a subtitle

---

### PHASE 4 — Model & Provider UI

#### P-15 🟡 Model Capability Tags
**File:** `core/config/suggested_apimodels.json`, `core/config/suggested_localmodels.json`, `static/js/model-selector.js`

Add `"tags": ["vision", "code", "long-context", "reasoning", "cheap"]` to each model entry.

In the model selector dropdowns, render tags as small coloured pills next to the model name:
- `vision` → blue
- `code` → green
- `reasoning` → purple
- `long-context` → teal
- `cheap` → gold

#### P-16 🟡 Auto-Routing Transparency
**File:** `core/interfaces/dashboard/static/js/chat.js`, chat routes

The nexus core already returns a `trace_id`. Extend the chat response to include a `routing_reason: str` field (Claude's backend should add this to the response — add a stub for now).

Display as a subtle `ℹ️ Via Gemini Flash — low complexity, cost-optimised` annotation below the response, in muted text. Clicking expands to show full trace info.

#### P-17 🟡 Rate Limit Visibility
**File:** `static/js/chat.js`

When a request is pending for >3 seconds, show a subtle status indicator in the chat input area: `⏳ Waiting for provider...`

When the server returns a `429` status, show: `⏱️ Rate limited — retrying in {retry_after}s`

---

### PHASE 5 — Memory UI

#### P-18 🟡 Memory Timeline View
**File:** `core/interfaces/dashboard/static/js/memory.js`, `memory_routes.py`

Add a **Timeline** view toggle in the Memory tab:
- `GET /api/memory/timeline?days=30` (calls `MemoryAPI.get_timeline()` from Claude's plan)
- Renders a chronological strip — one row per day, bubbles for memory count
- Click a day row to expand and show memories from that day
- Filter by namespace dropdown (calls `GET /api/memory/namespaces`)

#### P-19 🟡 Memory Editing and Deletion
**File:** Memory tab JS + routes

- Edit ✏️ and delete 🗑️ buttons on each memory card
- Inline edit: click → textarea appears, Save/Cancel buttons
- Delete: confirm modal → `DELETE /api/memory/{memory_id}`
- `PATCH /api/memory/{memory_id}` with `{"text": "..."}` to update

#### P-20 🟡 Memory Export/Import
**File:** Memory tab, routes

- **Export All** button → `GET /api/memory/export` → downloads `memories.json`
- **Import** button → file picker → `POST /api/memory/import` (Claude's MemoryAPI handles deduplication)

---

### PHASE 6 — Image Generation

#### P-21 🟡 Image Generation Gallery
**File:** `core/interfaces/dashboard/static/js/image.js`, image routes

Every generated image is saved to `data/images/{timestamp}_{hash}.png` with metadata in `data/images/index.json` (prompt, model, cost, timestamp).

Add a **Gallery** view below the generation panel:
- Grid of image thumbnails with prompts shown on hover
- Click → full-size lightbox with prompt, model used, timestamp, cost
- **Re-run** button re-populates the prompt and regenerates
- **Download** button
- Paginate: 20 per page

---

### PHASE 7 — Arena

#### P-22 🟡 Arena ELO Leaderboard
**File:** `core/interfaces/dashboard/arena_routes.py` (new or extend), `static/js/arena.js`

After each battle, record result to `data/arena/history.json`. Calculate ELO:
```
K = 32
expected_A = 1 / (1 + 10^((rating_B - rating_A) / 400))
new_rating_A = rating_A + K * (result - expected_A)  # result: 1=win, 0.5=draw, 0=loss
```

Store ratings in `data/arena/ratings.json`.

Add a **Leaderboard** tab inside the Arena panel showing:
- Provider/model name
- Current ELO rating
- Win/Loss/Draw counts
- Average response quality score
- Last battle date

#### P-23 🟡 Arena Human Judge Mode
**File:** `static/js/arena.js`

Add a **Judge Mode** toggle. When enabled:
- Both responses are shown without provider labels (anonymised as "Response A" and "Response B")
- User clicks "A is better" or "B is better" or "Draw"
- Result recorded + ELO updated
- Labels revealed after judging

---

### PHASE 8 — Prompt Library

#### P-24 🟡 Prompt Library
**File:** `core/interfaces/dashboard/prompt_library_routes.py` (new), `static/js/prompt-library.js`, `static/css/prompt-library.css`

Backend:
- `GET /api/prompts` — list all saved prompts
- `POST /api/prompts` — save `{name, category, content, tags}`
- `DELETE /api/prompts/{id}`
- Store in `data/prompts/library.json`

Frontend:
- `/` slash-command in chat input: typing `/` opens a floating autocomplete showing prompt names
- Selecting a prompt replaces the input with its content
- Separate **Prompt Library** panel accessible from sidebar (or modal)
- Filter by category. Import/export as JSON.

Ship 15 built-in templates covering: summarise, translate, explain code, write tests, review PR, brainstorm, simplify, debug, write email, create outline, compare options, explain like I'm 5, devil's advocate, extract action items, meeting notes.

---

### PHASE 9 — Games

#### P-25 🟡 "Are You Smarter Than AI?" — Mode Expansions
**File:** `core/interfaces/dashboard/smarter_than_ai_routes.py`, `static/games/smarter_than_ai/`

- **Auto-advance:** After judge completes, 5-second countdown then auto-start next round (skip button for impatient users)
- **Answer reveal:** AI answers shown as "🔒 Locked" until round ends; reveal simultaneously with correct answer
- **Clear between rounds:** When new round starts, clear question text, category, and answer boxes immediately (before "Game Master is thinking...")
- **Lenient grading:** Update judge prompt to explicitly accept articles ("The Bishop" = "Bishop"), alternate spellings, and partial matches
- **Subject packs:** Category selector when creating a show
- **Streak bonuses:** +50 points for 3 consecutive correct answers
- **Persistent scores:** Save results to `data/games/smarter_than_ai_history.json`

#### P-26 🟡 Chess Game
**Files:** `static/games/chess/` (new), `core/interfaces/dashboard/chess_routes.py` (new)

Integrate `chess.js` (game logic) and `chessboard.js` (board UI):
- Difficulty: Easy (random legal moves), Medium (minimax depth 3 in JS worker), Hard (LLM picks moves with commentary)
- Clock/timer display
- Move history sidebar
- Elo tracking per session in `data/games/chess_history.json`

#### P-27 🟡 Debate Arena Game
**Files:** `static/games/debate/` (new), `core/interfaces/dashboard/debate_routes.py` (new)

- User picks a topic
- Two configured providers argue FOR and AGAINST
- Responses stream in side-by-side
- User votes; provider wins tracked in `data/games/debate_history.json`

#### P-28 🟡 Persistent Player Profiles
**File:** `core/interfaces/dashboard/player_profile_routes.py` (new), `static/js/player-profile.js`

`data/games/player_profile.json`: `{display_name, scores_by_game: {}, wins_vs_models: {}, achievements: []}`

Trophy/profile icon in the top nav → opens profile modal.

#### P-29 🟢 Story Builder Game
**Files:** `static/games/story_builder/` (new), `core/interfaces/dashboard/story_routes.py` (new)

- Genre selector
- Alternating paragraphs (user → AI → user → ...)
- AI writes using the active provider
- Final AI rating + optional image generation of cover art
- Save completed stories to `data/games/stories/`

---

### PHASE 10 — Polish

#### P-30 🟡 Misaka Cipher Idle Animations
**File:** `core/interfaces/dashboard/static/css/misaka.css` (new or extend), `static/js/misaka.js`

CSS sprite sheet animation for the chibi:
- **Idle:** subtle breathing (scale Y 0.98–1.0 cycle, 3s)
- **Thinking:** slow head bob, eyes half-closed, `...` bubble
- **Error:** eyebrows raised, `!` bubble for 2s
- **Success:** brief sparkle effect

#### P-31 🟡 Pre-flight Status on Dashboard Load
**File:** `core/interfaces/dashboard/static/js/startup.js` (new)

On page load, call `GET /api/status/preflight` (backend stub for now, Finalize wires it).
Show a compact status bar in the top nav: `✅ 4/4 providers OK · ⚠️ GPU: CPU mode · ✅ Memory online`
Click to expand → the existing status panel.

#### P-32 🟢 Seasonal Themes + Easter Eggs
**File:** `core/interfaces/dashboard/static/css/themes/` (new directory)

Seasonal CSS overrides auto-applied by date. Add 3 starter themes: `spring.css`, `halloween.css`, `winter.css`.

Easter eggs:
- Konami code (`↑↑↓↓←→←→BA`) → triggers a 3-second fullscreen animation
- Ask "what are you?" in any chat → detected by the client, triggers a special lore response overlay
- Hidden "LEGENDARY" difficulty in Arena (hold Shift while clicking "Start Battle") → 3 providers simultaneously

---

## Contracts for Other Plans

| What | Where | Who uses it |
|------|-------|-------------|
| `POST /api/notifications` (write endpoint) | `notifications_routes.py` | Claude writes notifications here |
| `GET /api/agents/ask-user/{thread_id}` | agent routes | Claude's `ask_user` tool waits here |
| `POST /api/agents/respond/{thread_id}` | agent routes | User sends answer for `ask_user` |
| Auth middleware pattern | `server.py` | Finalize — all routes protected |
| `routing_reason` field rendering in chat | `chat.js` | Claude provides the field |
| Budget banner HTML element (id=`budget-warning-banner`) | `index.html` | Finalize shows/hides it |
| Provider stats UI (circuit state, latency) | status panel | Finalize wires real data |
| Model selector shows Ollama models | model selector JS | Finalize populates from `GET /api/ollama/models` |
| Agent resume button (thread list) | agents panel JS | Finalize wires to Claude's `AgentRunner.resume()` |

---

## Summary Checklist

- [ ] P-1 Dashboard authentication (PIN/password + session)
- [ ] P-2 Fix CORS wildcard
- [ ] P-3 API rate limiting (slowapi)
- [ ] P-4 Global command palette (Ctrl+K)
- [ ] P-5 Notification bell + backend store
- [ ] P-6 Tab pinning and reordering
- [ ] P-7 Keyboard shortcuts
- [ ] P-8 Dark/light theme toggle
- [ ] P-9 Message editing + regeneration
- [ ] P-10 File & image attachments
- [ ] P-11 Thread export (MD/JSON/TXT)
- [ ] P-12 Thread search + archive
- [ ] P-13 Response bookmarking (starred messages)
- [ ] P-14 Conversation branching
- [ ] P-15 Model capability tags
- [ ] P-16 Auto-routing transparency annotation
- [ ] P-17 Rate limit visibility indicator
- [ ] P-18 Memory timeline view
- [ ] P-19 Memory edit + delete UI
- [ ] P-20 Memory export/import
- [ ] P-21 Image generation gallery
- [ ] P-22 Arena ELO leaderboard
- [ ] P-23 Arena human judge mode
- [ ] P-24 Prompt library (UI + routes + 15 built-in templates)
- [ ] P-25 Smarter Than AI: auto-advance, answer reveal, lenient grading, streaks
- [ ] P-26 Chess game
- [ ] P-27 Debate Arena game
- [ ] P-28 Persistent player profiles
- [ ] P-29 Story Builder game
- [ ] P-30 Misaka Cipher idle animations
- [ ] P-31 Pre-flight status bar on load
- [ ] P-32 Seasonal themes + easter eggs
