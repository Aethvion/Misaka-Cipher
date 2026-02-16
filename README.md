# Misaka Cipher (M.I.S.A.K.A.)
**Multitask Intelligence & Strategic Analysis Kernel Architecture** *Operating within the A.E.G.I.S. Framework*

---

## 1. System Purpose
Misaka Cipher is a modular, self-evolving strategic kernel designed for **Aethvion**. It functions as a central orchestrator capable of autonomous tool generation, multi-agent delegation, and high-tier strategic analysis. The system prioritizes data sovereignty, operational transparency, and adaptive intelligence.

## 2. Core Architecture: The Nexus Portal
The foundation of the system is the **Nexus Core** (`nexus_core.py`), which serves as the absolute single point of entry for all operations.

* **Centralized Orchestration:** All requests route through `nexus_core.py`.
* **Traceability:** Every transaction is assigned a unique `Trace_ID` (e.g., `MCTR-20260201...`) to facilitate deep auditing.
* **Provider Abstraction:** Unified interface supporting Google Gemini (Primary), OpenAI GPT-4o, and xAI Grok.
* **Failover Logic:** Automated failover sequence defined in `config/providers.yaml`.

## 3. Scalability Design: The Factory & The Forge

### The Factory (Worker Spawning)
A dynamic spawning engine (`factory/`) that creates transient, stateless worker agents.
* **Lifecycle:** Agents are initialized for a single objective and terminated upon completion.
* **Naming Convention:** `[Domain]_[Action]_[Object]`.

### The Forge (Tool Generation)
An autonomous pipeline (`forge/tool_forge.py`) where the system writes its own valid Python tools.
* **Self-Registration:** Generated tools are saved to `tools/generated/` and registered in `tools/registry.json`.
* **API Awareness:** The Forge injects available environment API keys (Google, OpenAI, Grok) into generated tools to ensure immediate functionality.

## 4. Web Dashboard
A local Flask-based interface (`web/`) for system management.
* **Real-time Monitoring:** WebSocket updates for Chat, Logs, and Agents.
* **Dynamic Layout:** Configurable panels for System Logs and Active Agents.
* **Memory Explorer:** Visual interface for browsing Memory and Knowledge Graphs.

## 5. Memory Systems
The system uses a multi-tiered memory architecture persisted via **ChromaDB** and **JSON**.

* **Episodic Memory:**  
  * **Storage:** Vector-based (ChromaDB).
  * **Function:** Stores raw interaction logs with semantic embeddings for retrieval.
* **Core Insights:**  
  * **Storage:** JSON / ChromaDB Metadata.
  * **Function:** Recursive summarization of episodic memories into high-level facts.
* **Knowledge Graph:**  
  * **Storage:** NetworkX graph persisted to `memory/storage/knowledge_graph.json`.
  * **Function:** Maps relationships between Domains, Tools, and Agents.
  * *(Note: "Thread Memory" is a logical view of Episodic Memory grouped by Trace ID)*

## 6. Security: Intelligence Firewall
* **Pre-Flight Scanning:** Regex-based `ContentScanner` checks prompts for PII/Credentials before they leave the system.
* **Routing:** `RequestRouter` manages traffic flow. 
* **Local Fallback:** (Roadmap) Planned integration with Ollama/vLLM for fully offline sensitive processing.

## 7. Technical Stack & Requirements
* **Language:** Python 3.10+
* **Vector Database:** ChromaDB
* **Graph Engine:** NetworkX
* **Persistence:** JSON (No SQLite dependency)
* **Web Framework:** Flask + Socket.IO

## 8. Directory Structure
```
MisakaCipher/
├── cli.py              # Command-line interface entry point
├── nexus_core.py       # Main orchestration logic
├── config/             # YAML configuration files
├── factory/            # Agent spawning logic
├── forge/              # Tool generation engine
├── memory/             # Episodic (Chroma) & Graph (NetworkX) systems
├── web/                # Web dashboard
│   ├── static/         # Frontend assets (JS/CSS)
│   └── templates/      # HTML templates
├── tools/              # Tool registry
│   ├── generated/      # AI-created tools
│   └── standard/       # Core tools
└── workspace/          # User files and output artifacts
```
