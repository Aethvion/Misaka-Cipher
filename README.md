# Misaka Cipher (M.I.S.A.K.A.)
**Multitask Intelligence & Strategic Analysis Kernel Architecture**

<div align="center">

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-experimental-orange.svg)](https://github.com/Aethvion/Misaka-Cipher)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[📚 Documentation](/documentation/) | [🚀 Getting Started](/documentation/human/getting-started.md) | [💬 Discussions](https://github.com/Aethvion/Misaka-Cipher/discussions)

---

<img align="center" width="124px" src="https://raw.githubusercontent.com/Aethvion/Misaka-Cipher/refs/heads/main/core/interfaces/dashboard/static/misakacipher/chibi1/misakacipher_chibi_tablet.png?token=GHSAT0AAAAAADOWOOHABZTRDRRBYQFJLPBK2NANUXQ">

### ⚠️ STATUS: EXPERIMENTAL — EARLY DEVELOPMENT ⚠️

*This project is actively being built. Many features described are partially implemented or planned. Expect rough edges.*
*The documentation is generated so expect some errors.*

---
</div>

## 🎯 What Is Misaka Cipher?

Misaka Cipher is a **self-hosted AI assistant platform** with a web dashboard. It connects to cloud AI providers (Google Gemini, OpenAI, xAI Grok) and provides a structured environment for running chat threads, generating tools, and spawning agents — all from a local server you control.

**The long-term goal** is an autonomous system that can work toward complex goals by creating its own tools and delegating to specialized agents. That vision is the direction — not the current state.

---

## ✅ What Works Right Now

These features are functional in the current build:

### 💬 Chat & Threads
- Multi-provider chat (Google, OpenAI, Grok) with automatic failover
- Persistent conversation threads with configurable context modes (none / smart / full)
- Per-message model selection or **auto-routing** (LLM picks the best model from your enabled pool)
- Thread memory: task JSONs stored on disk, model used + routing reasoning recorded

### 🤖 Agent Mode
- Basic agent spawning for analysis and execution tasks
- Intent detection routes messages to chat or agent execution
- Step-by-step execution visible in the System Terminal panel

### ⚒️ Tool Forge
- AI can generate Python tools and register them for reuse
- Generated tools are saved locally and available in subsequent sessions
- Works for simple, well-scoped tool requests — complex multi-file generation is hit or miss

### 🧠 Memory
- Episodic memory stored in ChromaDB (vector search)
- Every conversation stored as a task JSON with model, routing, and usage metadata
- Memory can be queried in subsequent sessions

### 📊 Dashboard Tabs (Working)
| Tab | Status | Notes |
|-----|--------|-------|
| Chat | ✅ Working | Threads, context, model selection, auto routing |
| Agent | ✅ Working | Basic agent execution with terminal output |
| Image Studio | ✅ Working | Imagen 3 / DALL-E 3 image generation |
| LLM Arena | ✅ Working | Side-by-side model comparison |
| AI Conversation | ✅ Working | Two-party model conversation |
| Advanced AI Conversation | ✅ Working | Multi-persona conversation threads |
| Files | ✅ Working | Browse workspace files |
| Tools | ✅ Working | View registered tools and agents |
| Memory | ✅ Working | Browse task history and episodic memory |
| Usage | ✅ Working | Token usage, cost tracking, and detailed granular queries |
| Logs | ✅ Working | Live log stream |
| Status | ✅ Working | System and provider health |
| Settings | ✅ Working | Providers, routing profiles, environment config |
| Packages | 🧪 Experimental | Package install with safety scoring — unstable |
| Assistant | 🛡️ Beta | Advanced in-dashboard AI assistant with tool-calling and feature awareness |

---

## ⚠️ What Doesn't Work Yet (or Is Rough)

Be aware of these limitations before you dive in:

- **Autonomous long-running tasks:** The system cannot reliably work toward a complex goal over hours or days without supervision. Agent execution works for single well-defined tasks, not multi-step plans.
- **Self-improvement:** The system does not meaningfully "learn" or improve itself between sessions. Memory is stored but not yet deeply integrated into decision-making.
- **Local model support:** Ollama/vLLM integration is not implemented. All inference goes to cloud providers (costs real money).
- **Tool forge reliability:** Simple tools generate fine. Anything requiring external libraries, complex logic, or multi-file output is unreliable.
- **90% cost reduction claim from older docs:** Not realistic in current form. All calls go to cloud APIs. Cost depends entirely on your usage and model choices.
- **Production-readiness:** This is a personal/research project. It is not hardened for production use.

---

## 🏗️ Architecture Overview

The system is structured around four components:

| Component | Role | Status |
|-----------|------|--------|
| **Nexus Core** | Single entry point — routes all requests, manages trace IDs | ✅ Stable |
| **The Factory** | Spawns transient worker agents for complex tasks | 🧪 Works for basic tasks |
| **The Forge** | Generates Python tools autonomously | 🧪 Works for simple tools |
| **Memory Tier** | ChromaDB episodic memory + knowledge graph | ✅ Stores data, retrieval basic |

**Providers supported:** Google AI (Gemini), OpenAI (GPT-4o family), xAI (Grok)

**Intelligence Firewall:** PII/credential scanning before any external API call — blocks sensitive data from leaving.

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/Aethvion/Misaka-Cipher.git
cd Misaka-Cipher

# Install dependencies (uses pyproject.toml)
pip install -e ".[memory]"

# Copy and fill in your API keys
copy .env.example .env
# edit .env — add GOOGLE_AI_API_KEY / OPENAI_API_KEY / GROK_API_KEY
```

### Launch

**One-click (Windows):**  
Double-click `Start_Misaka_Cipher.bat` — it creates the virtual environment, installs dependencies, and starts the dashboard automatically. It also includes a **Smart Tab** check to prevent opening duplicate browser tabs.

**Manual:**
```bash
python -m core.main          # web dashboard (default)
python -m core.main --cli    # interactive CLI
python -m core.main --test   # run verification tests
```
Open [http://localhost:8000](http://localhost:8000) after launch.

---

## 📁 Directory Structure

```
Misaka-Cipher/
├── Start_Misaka_Cipher.bat     # One-click install + launch
├── pyproject.toml              # All dependencies + project metadata
├── nexus_core.py               # Shim → core/nexus_core.py
│
├── core/                       # All Python source code
│   ├── main.py                 # Entry point (web / CLI / test modes)
│   ├── cli.py                  # Interactive CLI interface
│   ├── nexus_core.py           # Central orchestration hub
│   ├── system_retrieval.py
│   │
│   ├── config/                 # Configuration files (YAML/JSON)
│   ├── factory/                # Agent spawning engine
│   ├── forge/                  # Tool generation pipeline
│   ├── memory/                 # Episodic memory + knowledge graph
│   ├── orchestrator/           # Master orchestrator + task queue
│   ├── providers/              # Google / OpenAI / Grok adapters
│   ├── security/               # Intelligence Firewall
│   ├── workers/                # Background workers
│   ├── workspace/              # Usage tracker, package manager
│   └── interfaces/
│       ├── dashboard/          # Web dashboard (FastAPI + static files)
│       └── cli_modules/        # CLI module implementations
│
├── data/                       # Runtime data — never committed
│   ├── logs/                   # Application logs
│   ├── memory/storage/         # ChromaDB vector store + graph files
│   ├── outputfiles/            # AI-generated output files
│   └── workspace/              # packages.json, user_preferences.json
│
├── tools/                      # Tool registry
│   ├── standard/               # Built-in tools
│   └── generated/              # AI-forged tools (gitignored)
│
├── tests/                      # Test suite
└── documentation/              # Docs
    ├── human/                  # User-facing guides
    └── ai/                     # Machine-readable specs
```

---

## 🗺️ Roadmap

### ✅ Done
- Multi-provider chat with failover and auto-routing
- Persistent threads and task memory
- Tool forge (basic)
- Agent spawning (basic)
- Intelligence Firewall
- Web dashboard with 13+ tabs
- API usage tracking with cost estimates
- LLM Arena, Image Studio, Advanced AI Conversation
- Routing profiles with configurable model pools

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
git clone https://github.com/Aethvion/Misaka-Cipher.git
cd Misaka-Cipher
pip install -e ".[memory]"
cp .env.example .env  # or: copy .env.example .env  (Windows)
```

---

## 📝 License

[MIT License](LICENSE)

---

## 🔗 Links

- **Docs:** [/documentation/](/documentation/)
- **Issues:** [GitHub Issues](https://github.com/Aethvion/Misaka-Cipher/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Aethvion/Misaka-Cipher/discussions)

---

<div align="center">

*An experimental AI platform — building toward something real, one sprint at a time.*

[⭐ Star on GitHub](https://github.com/Aethvion/Misaka-Cipher)

</div>
