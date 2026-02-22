# Misaka Cipher - Web Interface Context

This document explains the various tabs and pages of the Misaka Cipher web interface. Use this information to guide the user when they ask questions like "How does this page work?", "What am I looking at?", or "Where can I find X?".

## Main Application Tabs

1. **Nexus Core (Id: `tab-chat`)**
   - **Description**: The primary command interface for multi-modal interactions. This is the main chat terminal where the user can issue direct commands to the system or attached agents.
   - **Features**: Supports file attachments, prompt templates, tool/agent selection, system stats overview in the header, and viewing of conversation threads.
   
2. **LLM Arena (Id: `tab-arena`)**
   - **Description**: A competitive testing environment for AI models.
   - **Features**: The user can pit two distinct models against the same prompt simultaneously to compare their outputs. They can then crown a winner, which updates the local Arena Leaderboard statistics.

3. **Image Studio (Id: `tab-image`)**
   - **Description**: A dedicated workspace for AI image generation. 
   - **Features**: Includes prompt inputs, size selections, and a gallery of previously generated images.

4. **Advanced AI Conv (Id: `tab-aiconv`)**
   - **Description**: A specialized lab for simulating multi-agent dialogs and creating structured conversation workflows.
   - **Features**: Users can build custom "Personas" with specific LLMs and traits, then place them into structured "Threads" to simulate organic conversation loops.

## Data & Dashboard Tabs

5. **Usage Dashboard (Id: `tab-usage`)**
   - **Description**: Displays analytics on API calls, token consumption, and estimated costs grouped by provider, model, and time range. Features multiple charts (Timeline, Models, Providers).

6. **System Status (Id: `tab-status`)**
   - **Description**: A live operational dashboard showing hardware telemetry (CPU, RAM, Disk), API endpoint health/latency, and current system uptime metrics.

7. **Tools & Agents (Id: `tab-tools`)**
   - **Description**: A registry of all active tools and autonomous agents available to the system. Users can view their descriptions, test their functionality, and see their security validation status.

8. **Package Registry (Id: `tab-packages`)**
   - **Description**: The package manager interface (similar to PIP or NPM but for Aethvion modules). Displays installed, pending, and approved packages, along with usage counts and safety scores.

9. **File Manager (Id: `tab-files`)**
   - **Description**: A structured browser for navigating the Misaka Cipher project directory. Enables users to view configuration files, memory storage, logs, and upload/download assets.

10. **Memory & History (Id: `tab-memory`)**
    - **Description**: The central archive of all system memory. Allows searching through past conversation threads, task queues, and advanced AI conversation histories stored as raw JSON.

11. **Settings (Id: `tab-settings`)**
    - **Description**: The core configuration hub. 
    - **Features**: Users can configure API keys for various providers (OpenAI, Google, Grok, Local), adjust system behaviors, manage safety/validation rules, and configure the Misaka Assistant itself.
