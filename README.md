<div align="center">

# Aethvion Suite

**The Integrated Neural Foundation for Autonomous Agents**

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-experimental-orange.svg)](https://github.com/Aethvion/Aethvion-Suite)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[📚 Documentation](/core/documentation/) | [🚀 Getting Started](/core/documentation/human/getting-started.md) | [💬 Discussions](https://github.com/Aethvion/Aethvion-Suite/discussions)

<img width="124px" src="https://raw.githubusercontent.com/Aethvion/Aethvion-Suite/refs/heads/main/core/interfaces/dashboard/static/misakacipher/chibi1/misakacipher_chibi_tablet.png">

*A self-hosted AI platform with a 25+ tab dashboard, multi-provider chat, agent spawning, tool generation, and a growing suite of integrated apps — all running locally.*

⚠️ **EXPERIMENTAL — EARLY DEVELOPMENT** · Actively being built. Expect rough edges and partially-implemented features.

</div>

---

## 🖼️ Showcase

<div align="center">

<img src="assets/showcase/AethvionSuite_HomeScreen.png" alt="Aethvion Suite Home Screen" width="100%">

</div>

<br>

<div align="center">

| | |
|:---:|:---:|
| <img src="assets/showcase/MisakaCipher_Chat.png" alt="Misaka Cipher Chat Interface" width="100%"> | <img src="assets/showcase/AethvionSuite_Photo.png" alt="Aethvion Suite Photo App" width="100%"> |
| **Misaka Cipher** · Multi-provider AI chat with threads, auto-routing, and context modes | **Photo App** · AI-powered image generation and editing |
| <img src="assets/showcase/AethvionSuite_Audio.png" alt="Aethvion Suite Audio Tab" width="100%"> | <img src="assets/showcase/AethvionSuite_Code.png" alt="Aethvion Suite Code App" width="100%"> |
| **Audio** · Text-to-speech and speech-to-text | **Code** · AI-assisted code generation and display |
| <img src="assets/showcase/AethvionSuite_LocalModels.png" alt="Aethvion Suite Local Models" width="100%"> | <img src="assets/showcase/AethvionSuite_DriveInfo.png" alt="Aethvion Suite Drive Info" width="100%"> |
| **Local Models** · Model configuration and provider settings | **Drive Info** · System storage and drive information |

<br>

<img src="assets/showcase/MisakaCipher_UsagePage.png" alt="Aethvion Suite Usage Page" width="100%">

**Usage & Cost Tracking** · Token usage, cost estimates, and granular query breakdowns

</div>

---

## 🎯 What Is Aethvion Suite?

Aethvion Suite is a **self-hosted AI assistant platform** and application hub. It connects to cloud AI providers (Google Gemini, OpenAI, xAI Grok, Anthropic Claude) and provides a structured environment for running chat threads, generating tools, and spawning agents — all from a local server you control.

The core system features **Misaka Cipher**, a specialized chat interface and assistant kernel backed by four core components:

| Component | Role | Status |
|-----------|------|--------|
| **Nexus Core** | Single entry point — routes all requests, manages trace IDs | ✅ Stable |
| **The Factory** | Spawns transient worker agents for complex tasks | 🧪 Works for basic tasks |
| **The Forge** | Generates Python tools autonomously | 🧪 Works for simple tools |
| **Memory Tier** | ChromaDB episodic memory + knowledge graph | ✅ Storage stable, retrieval in progress |

**Providers:** Google AI (Gemini) · OpenAI (GPT-4o) · xAI (Grok) · Anthropic (Claude)

**Intelligence Firewall:** PII/credential scanning before any external API call — blocks sensitive data from leaving.

---

## 🚀 Quick Start

```bash
# Clone and install
git clone https://github.com/Aethvion/Aethvion-Suite.git
cd Aethvion-Suite
pip install -e ".[memory]"

# Configure API keys
copy .env.example .env
# edit .env — add GOOGLE_AI_API_KEY / OPENAI_API_KEY / GROK_API_KEY / ANTHROPIC_API_KEY
```

**One-click (Windows):** Double-click `Start_Aethvion_Suite.bat` — creates the virtual environment, installs dependencies, and opens the dashboard automatically.

**Manual:**
```bash
python -m core.main          # web dashboard (default)
python -m core.main --cli    # interactive CLI
python -m core.main --test   # run verification tests
```

Open [http://localhost:8080](http://localhost:8080) after launch.

---

## ✅ What Works Right Now

### 💬 Chat & Threads
- Multi-provider chat (Google, OpenAI, Grok, Anthropic) with automatic failover
- Persistent conversation threads with configurable context modes (none / smart / full)
- Per-message model selection or **auto-routing** (LLM picks the best model from your enabled pool)
- Collapsible, flush-edge chat UI with persistent layout state memory

### 🤖 Agent Mode
- Basic agent spawning for analysis and execution tasks
- Intent detection routes messages to chat or agent execution
- Step-by-step execution visible in the System Terminal panel

### ⚒️ Tool Forge
- AI can generate Python tools and register them for reuse
- Generated tools are saved locally and available in subsequent sessions

### 🧠 Memory
- Episodic memory stored in ChromaDB (vector search)
- Every conversation stored as a task JSON with model, routing, and usage metadata

### 🎙️ Audio
- Text-to-speech and speech-to-text support
- Configurable voice and audio output settings

### 🎮 Games
- Built-in games: Logic Quest, Blackjack, Sudoku, Word Search, Checkers (vs AI)
- Leaderboard to track scores across sessions

### 🎭 VTuber & 📊 Tracking
- **Aethvion VTuber:** Visualization and animation engine — rigging, real-time deformation
- **Aethvion Tracking:** Motion tracking via WebSocket, streams parameters to VTuber

### 🔌 Nexus Module
- Peripheral plugin hub — screen capture, webcam, Spotify, weather, system info
- Registry-driven architecture for adding new integrations

### 📊 Dashboard Tabs (25+)

| Tab | Status | Notes |
|-----|--------|-------|
| Chat | ✅ Working | Threads, context, model selection, auto routing |
| Image | ✅ Working | Imagen 3 / DALL-E 3 image generation |
| Audio | ✅ Working | Text-to-speech and speech-to-text |
| Arena | ✅ Working | Side-by-side model comparison |
| AI Conversations | ✅ Working | Two-party model conversation |
| Advanced AI Conversation | ✅ Working | Multi-persona conversation threads |
| Leaderboards | ✅ Working | Game scores and rankings |
| Logic Quest | 🎮 Game | AI-powered logic puzzles |
| Blackjack | 🎮 Game | Classic card game |
| Sudoku | 🎮 Game | Sudoku puzzles |
| Word Search | 🎮 Game | Word search puzzles |
| Checkers (vs AI) | 🎮 Game | Checkers against an AI opponent |
| Misaka Cipher | ✅ Working | Main hub: output files, screenshots, camera, uploads |
| Tools | ✅ Working | View registered tools and agents |
| Packages | 🧪 Experimental | Package install with safety scoring — unstable |
| Memory | ✅ Working | Browse task history and episodic memory |
| Misaka Memory | ✅ Working | Dedicated episodic memory browser |
| Aethvion VTuber | ✅ Working | Character animation and visualization engine |
| Aethvion Tracking | ✅ Working | Motion tracking module |
| Logs | ✅ Working | Live log stream |
| Documentation | ✅ Working | In-dashboard documentation viewer |
| Usage | ✅ Working | Token usage, cost tracking, and detailed granular queries |
| Status | ✅ Working | System and provider health |
| Port Manager | ✅ Working | View and manage active service ports |
| Settings | ✅ Working | Providers, routing profiles, Discord, assistant, environment config |

---

## ⚠️ What Doesn't Work Yet (or Is Rough)

- **Autonomous long-running tasks:** Agent execution works for single well-defined tasks, not multi-step plans over hours or days.
- **Self-improvement:** Memory is stored but not yet deeply integrated into decision-making.
- **Local model support:** Ollama/vLLM integration is not implemented. All inference goes to cloud providers (costs real money).
- **Tool forge reliability:** Simple tools generate fine. Anything requiring external libraries or complex multi-file output is unreliable.
- **Production-readiness:** This is a personal/research project, not hardened for production use.

---

## 📁 Directory Structure

```
Aethvion-Suite/
├── Start_Aethvion_Suite.bat     # One-click install + launch
├── pyproject.toml              # All dependencies + project metadata
│
├── core/                       # All Python source code
│   ├── main.py                 # Entry point (web / CLI / test modes)
│   ├── nexus_core.py           # Central orchestration hub
│   ├── config/                 # Configuration files (YAML/JSON)
│   ├── factory/                # Agent spawning engine
│   ├── forge/                  # Tool generation pipeline
│   ├── memory/                 # Episodic memory + knowledge graph
│   ├── nexus/                  # Nexus manager (peripheral plugin system)
│   ├── orchestrator/           # Master orchestrator + task queue
│   ├── providers/              # Google / OpenAI / Grok / Anthropic adapters
│   ├── security/               # Intelligence Firewall
│   ├── utils/                  # Shared utilities
│   ├── workers/                # Background workers
│   ├── workspace/              # Usage tracker, package manager
│   └── interfaces/
│       ├── dashboard/          # Web dashboard (FastAPI + static files)
│       └── cli_modules/        # CLI module implementations
│
├── apps/                       # User applications
│   ├── audio/                  # Audio processing
│   ├── code/                   # Code generation/execution
│   ├── driveinfo/              # Drive information
│   ├── finance/                # Finance tracking
│   ├── photo/                  # Photo editing/processing
│   ├── tracking/               # Motion tracking module
│   └── vtuber/                 # Character animation & visualization engine
│
├── data/                       # Runtime data — never committed
├── tools/                      # Tool registry (standard + AI-generated)
├── tests/                      # Test suite
└── assets/                     # Static assets (character sprites, showcase images)
```

---

## 🗺️ Roadmap

### ✅ Done
- Multi-provider chat with failover and auto-routing
- Persistent threads and task memory
- Tool forge and agent spawning
- Intelligence Firewall
- Web dashboard with 25+ tabs
- API usage tracking with cost estimates
- LLM Arena, Image Studio, Advanced AI Conversation
- Routing profiles with configurable model pools
- Discord integration (bot worker, message mirroring, dashboard controls)
- Audio tab (TTS and STT)
- Games suite with leaderboards
- Aethvion VTuber and Tracking
- Nexus peripheral module
- Documentation viewer, Port Manager, and in-dashboard assistant

### 🔄 In Progress / Near-Term
- Improved agent reliability for multi-step goals
- Better memory integration in decision making
- Tool forge validation improvements
- Local model support (Ollama)

### 🌟 Long-Term Vision
- Reliable autonomous multi-step goal execution
- Self-improving architecture (system modifies itself)
- True infinite sessions with human-in-the-loop checkpoints

---

## 🤝 Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/Aethvion/Aethvion-Suite.git
cd Aethvion-Suite
pip install -e ".[memory]"
cp .env.example .env  # or: copy .env.example .env  (Windows)
```

---

## 📝 License

[MIT License](LICENSE)

---

## 🔗 Links

- **Docs:** [/core/documentation/](/core/documentation/)
- **Issues:** [GitHub Issues](https://github.com/Aethvion/Aethvion-Suite/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Aethvion/Aethvion-Suite/discussions)

---

<div align="center">

*An experimental AI platform — building toward something real, one sprint at a time.*

[⭐ Star on GitHub](https://github.com/Aethvion/Aethvion-Suite)

</div>
