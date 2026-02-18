# Misaka Cipher (M.I.S.A.K.A.)
**Multitask Intelligence & Strategic Analysis Kernel Architecture**

<div align="center">

### 🚀 A Self-Evolving Agentic AI System

**Not Just a Chatbot — A Forge for Autonomous Software Creation**

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-active-success.svg)](https://github.com/MarcelvanDuijnDev/MisakaCipher)

[📚 Documentation](/documentation/) | [🚀 Getting Started](/documentation/human/Getting_Started.md) | [🤖 AI Docs](/documentation/ai/) | [💬 Discussions](https://github.com/MarcelvanDuijnDev/MisakaCipher/discussions)

</div>

---

## 🎯 The Vision: Infinite Sessions, Infinite Possibilities

Misaka Cipher is designed for **autonomous, long-running goal achievement**. Unlike traditional AI assistants that handle discrete tasks, this system can work continuously—from hours to days to weeks—until complex objectives are fully realized.

**From Simple to Ambitious:**
- 🎨 "Build a fractal visualization tool" → System works until complete
- 🏢 "Design a fully functioning e-commerce business" → System iterates autonomously until production-ready
- ♾️ "Infinite sessions" where the AI creates, validates, and evolves its own tools to expand capabilities

### 🧬 Self-Evolution at the Core

**The system doesn't just execute—it evolves:**
- 🔧 **Creates its own tools** when capabilities are missing
- 🤖 **Spawns specialized agents** for complex subtasks  
- 🧠 **Learns from every interaction** through multi-tiered memory
- 📈 **Compounds capabilities** exponentially over time

---

## 💡 Why Misaka Cipher? The Competitive Advantage

### Hybrid Intelligence Strategy: Cost-Efficient, Maximum Quality

Traditional AI systems use expensive cloud models for everything. Misaka Cipher is smarter:

**Intelligence Routing:**
- 💰 **Low-Cost/High-Volume Tasks** → Local models (near-zero cost)
  - Reading massive file structures
  - Batch data processing
  - Repetitive analysis
  
- 🧠 **High-Intelligence/High-Cost Tasks** → Premium cloud models (Gemini Pro, GPT-4)
  - Architectural decisions
  - Complex reasoning
  - Strategic planning

**Result:** 90% cost reduction while maintaining premium quality where it matters.

### Wrapper Support + Model Advancement = Exponential Progress

As AI models improve (GPT-5, Gemini 3, Claude Opus 4), Misaka Cipher **automatically benefits**:
- ✅ Consistent interface regardless of model
- ✅ Automatic failover to best available provider
- ✅ Future-proof architecture
- ✅ Cost optimization through smart routing

**Each model improvement compounds with the system's self-evolution** for exponential capability growth.

---

## 🏗️ System Purpose

Misaka Cipher is a modular, self-evolving strategic kernel capable of autonomous tool generation, multi-agent delegation, and high-tier strategic analysis. The system prioritizes data sovereignty, operational transparency, and adaptive intelligence.

---

## 🏛️ Core Architecture: The Four Pillars

### 1. **Nexus Core** - The Orchestration Brain
The absolute single point of entry for all operations. Every request flows through Nexus Core.

* **Centralized Orchestration:** All requests route through `nexus_core.py`
* **Traceability:** Every transaction assigned unique `Trace_ID` for complete auditability
* **Provider Abstraction:** Unified interface supporting Google Gemini (Primary), OpenAI GPT-4o, and xAI Grok
* **Failover Logic:** Automated multi-provider failover sequence
* **Intelligence Firewall:** Pre-flight scanning for PII/credentials

### 2. **The Factory** - Agent Spawning Engine
Dynamic creation of transient, stateless worker agents for specialized tasks.

* **On-Demand Spawning:** Creates agents only when needed
* **Lifecycle Management:** Agents self-terminate after task completion
* **Aethvion Naming:** `[Domain]_[Action]_[Object]` standard
* **Resource Limits:** Configurable concurrent agent caps

### 3. **The Forge** - Tool Generation Pipeline
**The Revolutionary Component:** The system autonomously writes its own Python tools.

* **Self-Registration:** Generated tools saved to `tools/generated/` and registered in `tools/registry.json`
* **API Awareness:** Automatically injects available API keys (Google, OpenAI, Grok) for immediate functionality
* **Validation Pipeline:** Security scanning, syntax checking, Aethvion compliance
* **Self-Improving:** Failed tools automatically regenerated with improvements

### 4. **The Memory Tier** - Knowledge Persistence
Multi-tiered memory architecture for learning and context retention.

* **Episodic Memory:** Vector-based interaction logs (ChromaDB with semantic embeddings)
* **Core Insights:** Recursive summarization into high-level facts  
* **Knowledge Graph:** NetworkX-based relationship mapping between Domains, Tools, and Agents
* **Persistent Learning:** Every interaction makes the system smarter

---

## 🚀 Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/MarcelvanDuijnDev/MisakaCipher.git
cd MisakaCipher

# Install dependencies
pip install -r requirements.txt

# Configure API keys
cp .env.example .env
# Edit .env and add at least GOOGLE_AI_API_KEY
```

### Launch Options

**Web Dashboard (Default):**
```bash
python main.py
# Access at http://localhost:8000
```

**Interactive CLI:**
```bash
python main.py --cli
```

**Verification Tests:**
```bash
python main.py --test
```

---

## 📖 Documentation

### 👥 For Humans
Comprehensive guides for users and developers:

- **[System Overview](/documentation/human/README_Overview.md)** - Understand the "vibe" and philosophy
- **[Getting Started Guide](/documentation/human/Getting_Started.md)** - Installation, setup, and first steps
  - Why Misaka Cipher exists
  - Value proposition explained
  - Practical examples and use cases
  - Best practices

### 🤖 For AI Agents
Machine-readable specifications for autonomous operation:

- **[SYSTEM_SPEC.md](/documentation/ai/SYSTEM_SPEC.md)** - Complete technical specification
  - Directory structure
  - Data flow architecture
  - API touchpoints
  - Configuration details
  
- **[AGENT_MISSION.md](/documentation/ai/AGENT_MISSION.md)** - Reasoning constraints and routing rules
  - Primary directives
  - Cost-aware model selection
  - Security-first routing
  - Intelligent routing rules
  
- **[EVOLUTION_LOGIC.md](/documentation/ai/EVOLUTION_LOGIC.md)** - Tool creation and validation mechanism
  - The Forge pipeline (4 phases)
  - How system "knows" a tool is ready
  - Self-improvement mechanism
  - Quality metrics

---

## 🎨 Example Use Cases

### Simple: Generate a Tool
```
User: "Create a tool that counts words in text files"
System:
1. Analyzes requirements
2. Generates Python code
3. Validates security and compliance
4. Registers tool: Text_Analysis_WordCount
Result: Tool available system-wide immediately
```

### Intermediate: Spawn an Agent
```
User: "Analyze all Python files for security vulnerabilities"
System:
1. Spawns Code_Analysis_Security agent
2. Agent scans repository
3. Routes analysis to appropriate model
4. Stores findings in memory
5. Returns structured report
Result: Complete security audit, automatically executed
```

### Advanced: Autonomous Goal Achievement
```
User: "Build a complete fractal visualization tool"
System (over hours):
1. Designs architecture (Pro model)
2. Forges Math_Calculate_Mandelbrot tool
3. Forges Image_Generate_Fractal tool  
4. Creates UI with visualization controls
5. Writes documentation
6. Runs tests and validates
Result: Production-ready fractal tool, tested and documented
```

---

## 🛡️ Security: Intelligence Firewall

Built-in security layer that protects sensitive data:

* **Pre-Flight Scanning:** Regex-based detection of PII/credentials before external API calls
* **Smart Routing:** Automatically routes sensitive data to local processing (when available)
* **No Data Leakage:** Blocked requests never leave the system
* **Complete Audit Trail:** Every decision logged with Trace_ID

---

## 🔧 Technical Stack

* **Language:** Python 3.10+
* **Vector Database:** ChromaDB (semantic memory)
* **Graph Engine:** NetworkX (knowledge relationships)
* **Persistence:** JSON (no SQLite dependency)
* **Web Framework:** Flask + Socket.IO (real-time dashboard)
* **Providers:** Google AI (Gemini), OpenAI (GPT), xAI (Grok)
* **Local Models (Roadmap):** Ollama, vLLM integration planned

---
## 📁 Directory Structure

```
MisakaCipher/
├── main.py                 # Entry point (CLI/Web/Test modes)
├── cli.py                  # Interactive command-line interface
├── nexus_core.py           # Central orchestration hub [SINGLE POINT OF ENTRY]
│
├── documentation/          # 📚 Comprehensive documentation
│   ├── human/              # 👥 User-facing guides
│   │   ├── README_Overview.md
│   │   └── Getting_Started.md
│   └── ai/                 # 🤖 Machine-readable specs
│       ├── SYSTEM_SPEC.md
│       ├── AGENT_MISSION.md
│       └── EVOLUTION_LOGIC.md
│
├── config/                 # ⚙️ Configuration files
│   ├── providers.yaml      # Provider settings & failover
│   ├── model_registry.json # Model definitions & routing [KEY FILE]
│   ├── security.yaml       # Intelligence Firewall rules
│   ├── memory.yaml         # Memory tier configuration
│   └── aethvion.yaml       # Framework standards
│
├── orchestrator/           # 🎯 Master Orchestrator
│   ├── master_orchestrator.py  # Autonomous coordination
│   ├── intent_analyzer.py      # User intent detection
│   └── task_queue.py           # Task queueing system
│
├── factory/                # 🏭 Agent spawning engine
│   ├── agent_factory.py    # Main spawning logic
│   ├── base_agent.py       # Agent base class
│   └── generic_agent.py    # Generic agent implementation
│
├── forge/                  # ⚒️ Tool generation pipeline
│   ├── tool_forge.py       # Main forging engine
│   ├── code_generator.py   # Python code generation
│   ├── tool_validator.py   # Validation & security
│   └── tool_registry.py    # Tool registration
│
├── memory/                 # 🧠 Multi-tiered memory
│   ├── episodic_memory.py  # Vector-based storage (ChromaDB)
│   ├── knowledge_graph.py  # Relationship mapping (NetworkX)
│   └── storage/            # Persistent storage
│
├── providers/              # 🔌 Provider abstraction
│   ├── provider_manager.py # Coordination & failover
│   ├── google_provider.py  # Google AI (Gemini)
│   ├── openai_provider.py  # OpenAI (GPT)
│   └── grok_provider.py    # xAI (Grok)
│
├── security/               # 🛡️ Intelligence Firewall
│   ├── firewall.py         # Main firewall coordination
│   ├── scanner.py          # PII/credential detection
│   └── router.py           # Routing decision logic
│
├── tools/                  # 🔧 Tool registry
│   ├── standard/           # Core system tools
│   ├── generated/          # AI-created tools [DYNAMIC]
│   └── registry.json       # Tool metadata
│
├── web/                    # 🌐 Web dashboard
│   ├── server.py           # Flask + SocketIO server
│   ├── static/             # Frontend assets
│   └── templates/          # HTML templates
│
├── tests/                  # ✅ Test suite
└── WorkFolder/             # 📂 AI output directory
```

---

## 🎯 Key Features

### 🔄 Self-Evolution
- **Autonomous Tool Creation:** Missing capabilities? System forges new tools
- **Intelligent Agent Spawning:** Complex tasks? System creates specialized agents
- **Persistent Learning:** Every interaction stored and analyzed
- **Exponential Growth:** Tool library expands organically

### 💰 Cost Optimization
- **Smart Model Routing:** Right model for right task
- **Local Processing:** High-volume tasks at near-zero cost (roadmap)
- **Batch Operations:** Reduce API calls through intelligent batching
- **Progressive Complexity:** Start cheap, escalate only if needed

### 🛡️ Security First
- **Pre-flight Scanning:** PII/credentials never leave system
- **Automatic Sanitization:** Sensitive data routed to local processing
- **Complete Auditability:** Every request tracked with Trace_ID
- **No External Leakage:** Blocked requests rejected before API call

### 🔌 Multi-Provider Support
- **Google AI:** Gemini 2.0 Flash (fast), Gemini 1.5 Pro (complex), Imagen 3 (images)
- **OpenAI:** GPT-4o (premium), GPT-4o-mini (fast), DALL-E 3 (images)
- **xAI:** Grok-3 Mini Fast (cost-effective)
- **Local (Roadmap):** Ollama, vLLM for unlimited local processing

---

## 🌟 Philosophy: The Forge Metaphor

Think of Misaka Cipher as a **digital forge** where:
- 🔥 Raw ideas are the **ore**
- 🔨 The AI is the **blacksmith**
- ⚒️ Generated tools are the **forged implements**
- 📈 Each tool makes the next creation easier
- ♾️ The forge itself becomes more capable over time

**This is not just automation—it's evolution.**

---

## 🗺️ Roadmap

### ✅ Current (Sprint 3+)
- Core orchestration (Nexus)
- Agent spawning (Factory)
- Tool generation (Forge)
- Multi-tiered memory
- Multi-provider support
- Intelligence Firewall
- Web dashboard
- Comprehensive documentation

### 🔄 Near-Term (3 Months)
- Local model integration (Ollama/vLLM)
- Advanced multi-agent coordination
- Tool validation improvements
- Enhanced memory retrieval
- Automated tool testing

### 🌟 Long-Term Vision
- True infinite sessions (weeks-long autonomous work)
- Self-improving architecture (system refactors itself)
- Cross-domain expertise (single system handles diverse fields)
- Human-AI collaboration tools (pair programming at scale)

**Ultimate Goal:**
```
Give Misaka Cipher a goal of any complexity
→ System autonomously breaks it down
→ Forges necessary tools
→ Spawns required agents
→ Learns from execution
→ Iterates until complete
→ Delivers production-ready result

No human intervention needed.
```

---

## 🤝 Contributing

We welcome contributions! Whether you're:
- 🐛 Reporting bugs
- 💡 Suggesting features
- 🔧 Improving tools
- 📚 Enhancing documentation
- 🧪 Adding tests

Check out our [Contributing Guidelines](CONTRIBUTING.md) (coming soon) and join the discussion!

---

## 📝 License

[MIT License](LICENSE) - Feel free to use, modify, and distribute.

---

## 🔗 Links

- **Documentation:** [/documentation/](/documentation/)
- **Human Docs:** [Getting Started](/documentation/human/Getting_Started.md)
- **AI Docs:** [System Spec](/documentation/ai/SYSTEM_SPEC.md)
- **Issues:** [GitHub Issues](https://github.com/MarcelvanDuijnDev/MisakaCipher/issues)
- **Discussions:** [GitHub Discussions](https://github.com/MarcelvanDuijnDev/MisakaCipher/discussions)

---

## 💬 Support

Need help? Have questions?

1. 📖 Check the [Getting Started Guide](/documentation/human/Getting_Started.md)
2. 🔍 Search [existing issues](https://github.com/MarcelvanDuijnDev/MisakaCipher/issues)
3. 💬 Start a [discussion](https://github.com/MarcelvanDuijnDev/MisakaCipher/discussions)
4. 🐛 [Open an issue](https://github.com/MarcelvanDuijnDev/MisakaCipher/issues/new)

---

<div align="center">

**Built with ❤️ for autonomous AI evolution**

*"Every tool forged is a permanent upgrade to the system."*

[⭐ Star us on GitHub](https://github.com/MarcelvanDuijnDev/MisakaCipher) | [📣 Share on Twitter](https://twitter.com/intent/tweet?text=Check%20out%20Misaka%20Cipher%20-%20A%20self-evolving%20AI%20system!&url=https://github.com/MarcelvanDuijnDev/MisakaCipher)

</div>

---

## 🎮 Web Dashboard Features

Access the dashboard at `http://localhost:8000` after launching with `python main.py`:

### Thread Settings
Each conversation thread has configurable settings via the **▶ SETTINGS** toggle:

* **CTX (Context Mode):**
  * `None`: No history (pure one-shot)
  * `Smart` (Default): Sliding window of last N message pairs
  * `Full`: Entire conversation history (high token usage)
  
* **WIN (Window Size):** Number of recent message pairs to include (default: 5)

* **CHAT (Chat Only):** When enabled, AI acts as pure chatbot without executing tools/commands

---

**Ready to start forging?** 🔥

```bash
git clone https://github.com/MarcelvanDuijnDev/MisakaCipher.git
cd MisakaCipher
pip install -r requirements.txt
python main.py --cli
```

**Let's build something autonomous! 🚀**
