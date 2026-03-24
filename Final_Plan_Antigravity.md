# Final Plan — Antigravity's Domain: Standalone Apps & Scripts

> **Assignee:** Antigravity
> **Parallel with:** Final_Plan_Claude.md and Final_Plan_Copilot.md
> **Prerequisite for:** Final_Plan_Finalize.md
> **Source:** Final_Plan.md (apps/ and standalone items only)

---

## File Boundaries

### ✅ Files Antigravity MAY touch
```
apps/                          ← ALL subdirectories and files
apps/code/                     ← Code IDE app
apps/vtuber/                   ← VTuber / Specter engine
apps/audio_editor/             ← Audio editor app
apps/photo/                    ← Photo editor app
apps/finance/                  ← Finance app
apps/tracking/                 ← Synapse motion tracking
apps/notes/                    ← NEW — create this
apps/tasks/                    ← NEW — create this
apps/transcriber/               ← NEW — create this
apps/canvas/                   ← NEW — create this (optional, lower priority)
apps/flashcards/               ← NEW — create this (optional, lower priority)
*.bat                          ← All root-level launcher scripts
localmodels/                   ← Model manifest files only (not the .gguf files themselves)
```

### 🚫 Files Antigravity must NOT touch
```
core/                          ← Claude's and Copilot's domain
core/interfaces/dashboard/     ← Copilot's domain
data/                          ← Shared runtime data (read-only is OK; don't restructure)
```

### 📝 Communication pattern
Each new app Antigravity creates must expose a **minimal REST API** on its own port so the Finalize plan can surface it in the main dashboard. Use this pattern for every new app:

```python
# At the bottom of each app's server file:
# AETHVION_INTEGRATION:
# Port: 808X
# GET /api/health → {"status": "ok", "app": "aethvion-notes"}
# GET /api/status → {"version": "1.0", "features": [...]}
```

Also create a `{app_name}_launcher.bat` for every new app following the existing pattern.

---

## Implementation Order

---

### PHASE 1 — Code IDE Improvements

#### A-1 🟠 Multi-File AI Context
**File:** `apps/code/code_server.py`, `apps/code/static/js/editor.js`

Current behaviour: the AI receives a flat file tree as context. Large projects overwhelm the context window.

**Fix:**
1. Add a Python AST parser utility in `apps/code/ast_context.py`:
   - For `.py` files: parse `import` and `from ... import` statements → list referenced local files
   - For `.js`/`.ts` files: parse `import` and `require()` statements
2. When building AI context: include currently open file + files it imports (depth 1)
3. Add a 📌 **Pin File** button in the file tree. Pinned files are always included in context regardless of open state
4. Show a **Context Budget** indicator: "Using 3,240 / 8,000 tokens" in the IDE header

#### A-2 🟠 Git Integration
**File:** `apps/code/code_server.py`, `apps/code/static/js/git-panel.js` (new)

Add a **Source Control** panel (collapsible sidebar pane):
- `GET /api/git/status` → runs `git status --porcelain` in the workspace directory, returns changed files
- `GET /api/git/diff?file={path}` → runs `git diff {path}`, returns unified diff text
- `POST /api/git/commit` with `{"message": "..."}` → runs `git add -A && git commit -m ...`
- `GET /api/git/log?n=20` → runs `git log --oneline -20`
- `POST /api/git/checkout` with `{"branch": "..."}` → `git checkout {branch}`

Frontend:
- Changed files list with M/A/D/? status badges
- Click a file to view its diff in a read-only Monaco diff editor (use `monaco.editor.createDiffEditor`)
- Inline diff gutter markers in the main editor (green = added lines, red = removed lines)
- Commit message input + Commit button

#### A-3 🟡 Diff View Before AI Applies Changes
**File:** `apps/code/code_server.py`, `apps/code/static/js/editor.js`

When the AI rewrites a file (via chat or any AI action):
1. Instead of immediately saving, stage the new content in memory
2. Open a split diff view: left = original, right = proposed
3. Show **Apply** and **Discard** buttons
4. Only write to disk on **Apply**

Use Monaco's built-in `createDiffEditor` API. The diff view slides in from the right side of the editor area.

#### A-4 🟡 AI Code Review on Save
**File:** `apps/code/code_server.py`

Add an opt-in toggle in IDE settings: "AI review on save".
When enabled:
- On `POST /api/files/save`, trigger a background review call
- Prompt: "Review this code for bugs, style issues, and improvements. Return a JSON array: [{line, severity, message}]"
- `severity`: `"error"`, `"warning"`, `"info"`
- Apply results as Monaco editor decorations (squiggles + hover messages)
- A small count badge: `⚠️ 2 warnings · ℹ️ 1 suggestion` appears in the status bar

#### A-5 🟡 Persistent Terminal with xterm.js
**File:** `apps/code/code_server.py`, `apps/code/static/js/terminal.js`

Replace the current basic terminal with `xterm.js`:
- True persistent shell session (backend: `subprocess.Popen` with `pty` on Unix, `winpty` on Windows)
- WebSocket connection: `ws://localhost:8083/ws/terminal/{session_id}`
- Multiple terminal tabs (+ button to open new tab)
- Terminal history preserved across tab switches
- Terminal font matches the editor font (Fira Code)

---

### PHASE 2 — Audio App Improvements

#### A-6 🟠 Audio Effect Presets
**File:** `apps/audio_editor/` (relevant server + frontend files)

Add named preset effect chains:
```json
{
  "Podcast Cleanup": ["noise_reduction", "normalize", "eq_voice", "limiter"],
  "Music Mastering": ["eq_full", "compressor", "stereo_widener", "limiter"],
  "Voice-Over": ["eq_voice", "de_esser", "compressor", "normalize"],
  "Raw Recording": [],
  "Broadcast Standard": ["loudness_normalize_lufs", "limiter"]
}
```

Frontend: a **Presets** dropdown above the effects chain. Selecting a preset adds/replaces effects. A **Save Preset** button lets users name and save the current chain.

Presets stored in `data/audio/presets.json`.

#### A-7 🟡 AI Transcript and Chapter Markers
**File:** `apps/audio_editor/audio_server.py` (or equivalent)

After recording or importing audio:
- **AI Analyse** button triggers: transcribe via Whisper → send transcript to LLM → LLM returns `[{time_offset_ms, chapter_title}]` JSON
- Chapter markers added to the timeline as labelled cue points (vertical lines with label)
- Transcript shown in a collapsible panel to the right of the timeline
- Clicking a transcript segment seeks to that timestamp

Backend endpoint: `POST /api/audio/analyse` — runs async, streams progress via SSE.

#### A-8 🟡 Export Format Options
**File:** `apps/audio_editor/audio_server.py`

Current export is limited. Add `POST /api/audio/export` with `{format: "mp3"|"ogg"|"flac"|"wav", quality: "low"|"medium"|"high"}`:
- Use `pydub` for conversion: `AudioSegment.from_file(...).export(..., format=..., bitrate=...)`
- MP3: 128/192/320 kbps options
- FLAC/WAV: lossless, quality = sample rate choice (44.1kHz / 48kHz)
- Show a progress bar during export

---

### PHASE 3 — VTuber / Specter Improvements

#### A-9 🟠 Live Tracking — One-Click Connect
**File:** `apps/vtuber/` (Specter UI files)

Currently connecting the Specter VTuber engine to the Synapse tracking module requires manual steps.

**Fix:** Add a **🔗 Connect Tracking** button in the Specter control panel.
When clicked:
1. Try `GET http://localhost:8082/api/status` (Synapse's status endpoint)
2. If running: establish WebSocket connection to `ws://localhost:8082/ws/tracking`
3. Subscribe to face pose events and map them to rig bone transforms
4. Show connection status indicator: 🟢 Live Tracking / 🔴 Not Connected

If Synapse isn't running: show a "Start Synapse first" message with a launch button that opens `synapse_launcher.bat`.

#### A-10 🟡 Expression Presets
**File:** `apps/vtuber/static/` (Specter control UI)

Add a panel of expression trigger buttons:
- 😊 Happy · 😢 Sad · 😲 Surprised · 🤔 Thinking · 😐 Neutral · 😄 Excited · 😤 Focused

Each button blends the character to a predefined bone pose state over 0.3 seconds.
Add a **+ Add Preset** button: capture current pose as a new named preset, saved to `data/vtuber/expression_presets.json`.

#### A-11 🟡 Background Scene Management
**File:** `apps/vtuber/static/`

Add a background layer panel:
- Presets: Solid colour (colour picker), Gradient (start/end colour), Chroma-key green, Studio dark
- **Upload Background** button: supports PNG/JPG/GIF (animated GIF for looping backgrounds)
- **Upload Video Loop** button: short .mp4 plays on loop behind the character
- Backgrounds stored in `data/vtuber/backgrounds/`

---

### PHASE 4 — Photo App Improvements

#### A-12 🟠 Layer Blend Modes
**File:** `apps/photo/` (canvas compositor)

Implement the 10 standard blend modes in the HTML Canvas compositor:
- Normal, Multiply, Screen, Overlay, Darken, Lighten, Colour Dodge, Colour Burn, Hard Light, Soft Light

Use the existing Canvas 2D `ctx.globalCompositeOperation` property — these are all built-in to the browser canvas API (no math required, just set the correct mode string).

Add a **Blend Mode** dropdown in the layer panel, next to the opacity slider.

#### A-13 🟡 Non-Destructive Adjustment Layers
**File:** `apps/photo/`

Add a special layer type: **Adjustment Layer**. Types: Brightness/Contrast, Hue/Saturation, Curves (simple S-curve), Colour Balance.

Adjustment layers render on top of pixel layers and modify the composite output without changing source pixel data. Toggling an adjustment layer's visibility shows before/after instantly.

Implementation: render pixel layers to an off-screen canvas, apply CSS filter or Canvas ImageData manipulation for adjustments, then composite to the visible canvas.

#### A-14 🟡 AI Inpainting (Fill Selection)
**File:** `apps/photo/photo_server.py`, `apps/photo/static/`

Add a selection tool:
- **Rectangular marquee** — click and drag
- **Lasso** — freehand polygon

With a selection active, a **🪄 Fill with AI** button appears:
- Sends selection bounds + surrounding context (base64 cropped region) to `POST /api/photo/inpaint`
- Backend calls DALL-E edit endpoint or a local inpainting model
- Result composited back into the canvas at the selection bounds

---

### PHASE 5 — Finance App Improvements

#### A-15 🟠 Real Market Data Integration
**File:** `apps/finance/finance_server.py`

Integrate `yfinance` for live market data:
```python
import yfinance as yf
ticker = yf.Ticker("AAPL")
info = ticker.info  # current price, PE ratio, etc.
hist = ticker.history(period="1mo")  # OHLCV history
```

- `GET /api/finance/quote/{symbol}` → current price, change, change%
- `GET /api/finance/history/{symbol}?period=1d|1mo|3mo|1y` → OHLCV data for charting
- Configurable auto-refresh interval (default: 60 seconds)
- Cache responses in memory for 30 seconds to avoid rate-limiting

#### A-16 🟡 Budget Tracking & Categories
**File:** `apps/finance/`

Add income/expense transaction entry:
- Fields: amount, category (dropdown), description, date
- Categories: Food, Transport, Housing, Entertainment, Income, Other (+ custom)
- Monthly summary charts using Chart.js (already likely present):
  - Pie: spending by category
  - Bar: income vs expenses by month
- Export to CSV: `GET /api/finance/export?month={YYYY-MM}`
- Store transactions in `data/finance/transactions.json`

#### A-17 🟡 Net Worth Timeline
**File:** `apps/finance/`

Track portfolio value + cash balance at end of each day. Store snapshots in `data/finance/networth_history.json`.
Display a line chart of net worth over time.
Add milestone markers (configurable thresholds: first $1k, $10k, etc.) shown as vertical lines on the chart.

---

### PHASE 6 — New Apps

#### A-18 🟠 Aethvion Notes — AI-Powered Notebook
**Directory:** `apps/notes/` (new)
**Port:** 8085
**Launcher:** `notes_launcher.bat`

A Markdown note-taking app deeply integrated with the memory system.

**Backend** (`apps/notes/notes_server.py`):
- FastAPI app on port 8085
- `GET /api/notes` — list all notes (id, title, created, updated, tags)
- `GET /api/notes/{id}` — full note content
- `POST /api/notes` — create `{title, content, tags}`
- `PUT /api/notes/{id}` — update
- `DELETE /api/notes/{id}`
- `GET /api/notes/search?q={query}` — full-text search across notes
- `GET /api/notes/backlinks/{id}` — find all notes that link to this one
- `POST /api/notes/{id}/ask` — AI answers a question about this note (stub — Finalize wires to Claude's providers)
- Store notes in `data/notes/` as individual `.md` files + `data/notes/index.json`

**Frontend** (`apps/notes/static/`):
- Three-pane layout: sidebar (note list + search), editor (Monaco with Markdown mode), preview (rendered HTML)
- Live Markdown preview (split or toggle view)
- `[[wiki-link]]` syntax: clicking a link navigates to that note; red link if note doesn't exist (click to create)
- Backlinks panel at the bottom of the editor
- Tag filtering in the sidebar
- Export note as PDF (print-to-PDF via browser) or HTML

#### A-19 🟡 Aethvion Tasks — AI Task Manager
**Directory:** `apps/tasks/` (new)
**Port:** 8086
**Launcher:** `tasks_launcher.bat`

**Backend** (`apps/tasks/tasks_server.py`):
- `GET/POST /api/tasks` — list/create tasks
- `PATCH /api/tasks/{id}` — update (status, priority, due date)
- `DELETE /api/tasks/{id}`
- `POST /api/tasks/natural` — parse natural language: "Call Alice tomorrow at 3pm" → creates task with inferred due date
- `POST /api/tasks/prioritise` — AI re-orders backlog by deadline + importance (stub for Finalize)
- Store in `data/tasks/tasks.json`

**Frontend:**
- Kanban view (Todo / In Progress / Done columns, drag to move)
- List view with sort by priority / due date
- Pomodoro timer: 25-min focus sessions, 5-min breaks, visible in header
- Quick add: press `N` → inline task creation
- Natural language input: "Remind me to review PR by Friday" → creates task

#### A-20 🟡 Aethvion Transcriber
**Directory:** `apps/transcriber/` (new)
**Port:** 8087
**Launcher:** `transcriber_launcher.bat`

**Backend** (`apps/transcriber/transcriber_server.py`):
- `POST /api/transcribe/upload` — accepts audio/video file, runs Whisper (local), streams progress via SSE
- `POST /api/transcribe/summarise/{job_id}` — sends transcript to LLM for summary + action items (stub for Finalize)
- Store transcriptions in `data/transcriptions/{job_id}.json`
- Use `whisper` Python package (model configurable: tiny/base/small/medium)

**Frontend:**
- Drop zone for audio/video files (MP3, MP4, WAV, M4A, WEBM)
- Live transcription progress bar
- Transcript display with timestamps, click to seek (for audio playback)
- AI-generated summary panel: Summary / Action Items / Key Decisions tabs
- Export as Markdown meeting notes (includes date, duration, summary, full transcript)

#### A-21 🟢 Aethvion Canvas — AI Whiteboard (Optional)
**Directory:** `apps/canvas/` (new)
**Port:** 8088
**Launcher:** `canvas_launcher.bat`

If time permits. A collaborative-style infinite canvas:
- Sticky notes, freehand drawing (SVG paths), arrows, shapes, text blocks
- Infinite pan + zoom canvas (HTML Canvas or SVG-based)
- Right-click sticky note → **Expand with AI** → calls AI to generate 3–5 related ideas as new stickies
- Auto-cluster: AI groups related sticky notes with colour-coding
- Export as PNG (screenshot) or SVG

#### A-22 🟢 Aethvion Flashcards (Optional)
**Directory:** `apps/flashcards/` (new)
**Port:** 8089
**Launcher:** `flashcards_launcher.bat`

If time permits:
- Paste any text/document → `POST /api/flashcards/generate` → AI returns `[{front, back}]` array
- SM-2 spaced repetition scheduler (standard algorithm, pure Python)
- Study session: show front → flip → rate (Again / Hard / Good / Easy)
- Track retention stats per deck in `data/flashcards/`

---

### PHASE 7 — Desktop Pet Mode

#### A-23 🟢 Desktop Pet Mode
**Directory:** `apps/vtuber/` (extend existing), or `apps/desktop_pet/` (new)

Create a lightweight always-on-top transparent window variant of the Specter VTuber.

**Implementation approach (Windows):**
- Use `tkinter` with `wm_attributes('-transparentcolor', ...)` or a `pywebview` window with transparent background + `topmost=True`
- The VTuber character renders in a small floating window (~200×300px)
- Character sits at the bottom-right of the screen by default; draggable
- Idle animations: breathing, blinking, occasional look-around

**Notification behaviour:**
- Listens on `GET http://localhost:8080/api/notifications` every 15s (the endpoint Copilot creates)
- When a new notification arrives: character waves, speech bubble appears with notification text
- Uses the local TTS (Kokoro) to read the notification aloud (short form)

**Launcher:** `desktop_pet_launcher.bat`

Controls:
- Right-click context menu: Hide, Change Expression, Settings, Quit

---

## Contracts for Other Plans

| What | Where | Who uses it |
|------|-------|-------------|
| Notes API `POST /api/notes/{id}/ask` stub | `apps/notes/notes_server.py` | Finalize wires to Claude's providers |
| Tasks API `POST /api/tasks/prioritise` stub | `apps/tasks/tasks_server.py` | Finalize wires to Claude's providers |
| Transcriber `POST /api/transcribe/summarise` stub | `apps/transcriber/transcriber_server.py` | Finalize wires to Claude's providers |
| Desktop pet notification poll URL | `apps/desktop_pet/` or `apps/vtuber/` | Reads from Copilot's notification endpoint |
| VTuber TTS hook | `apps/vtuber/` | Finalize wires to Kokoro TTS output |
| Tracking WebSocket address | `apps/vtuber/` | Finalize ensures Synapse is auto-started |
| `GET /api/health` on each new app | All new apps | Finalize registers them in the dashboard ports panel |
| All `.bat` launchers follow consistent format | `*.bat` | Finalize — dashboard can launch apps from the ports panel |

---

## Summary Checklist

**Code IDE:**
- [ ] A-1 Multi-file AI context (AST-based + pin files)
- [ ] A-2 Git integration (status, diff, commit, log, checkout)
- [ ] A-3 AI diff view before applying changes
- [ ] A-4 AI code review on save
- [ ] A-5 Persistent terminal with xterm.js

**Audio App:**
- [ ] A-6 Effect presets (built-in + custom)
- [ ] A-7 AI transcript + chapter markers
- [ ] A-8 Export format options (MP3/OGG/FLAC/WAV)

**VTuber / Specter:**
- [ ] A-9 One-click live tracking connect
- [ ] A-10 Expression presets panel
- [ ] A-11 Background scene management

**Photo App:**
- [ ] A-12 Layer blend modes (10 standard)
- [ ] A-13 Non-destructive adjustment layers
- [ ] A-14 AI inpainting (selection + fill)

**Finance App:**
- [ ] A-15 Real market data (yfinance)
- [ ] A-16 Budget tracking + category charts
- [ ] A-17 Net worth timeline

**New Apps:**
- [ ] A-18 Aethvion Notes (port 8085)
- [ ] A-19 Aethvion Tasks (port 8086)
- [ ] A-20 Aethvion Transcriber (port 8087)
- [ ] A-21 Aethvion Canvas (port 8088) — optional
- [ ] A-22 Aethvion Flashcards (port 8089) — optional
- [ ] A-23 Desktop Pet Mode
