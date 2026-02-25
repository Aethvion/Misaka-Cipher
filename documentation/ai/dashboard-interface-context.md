MISAKA CIPHER - DASHBOARD INTERFACE CONTEXT
This document describes the tabs and features of the Misaka Cipher dashboard. Use it to answer questions like "what is this tab?", "what am I looking at?", or "where do I find X?".

TABS (format: tab_id | display name | description)

chat | Chat | Primary command interface. Multi-modal terminal for sending messages to the orchestrator or agents. Supports file attachments, prompt templates, tool and agent selection, and conversation threads. This is the main interaction hub.

agent | Agent | Dedicated interface for spawning and monitoring autonomous agents. Users can start agents on specific tasks, observe their step-by-step execution, and view results.

image | Image Studio | AI image generation workspace. The user can select an image-capable model, write a prompt, choose resolution and aspect ratio, and view the generated result. Output images are saved locally.

advaiconv | Advanced AI Conversation | Structured multi-agent conversation lab. Users define Personas (name, model, traits), organize them into Threads, and run simulated organic conversation loops between multiple AI models.

arena | LLM Arena | Model battle testing environment. The user picks two or more models and pits them against the same prompt. Outputs are shown side-by-side. The user can crown a winner, which updates the Arena Leaderboard.

aiconv | AI Conversation | Simplified two-party AI conversation mode. Quicker setup than Advanced AI Conversation. Good for rapid A/B model comparisons in a conversation format.

files | Files | Project file browser. The user can navigate the Misaka Cipher directory tree, view configuration files, memory databases, output files, and upload or download assets.

tools | Tools | Registry of all available tools and active agents. Users can inspect tool descriptions, test them, and see security validation status.

packages | Packages | Package manager interface. Shows installed, pending, and approved packages (similar to pip/npm but for Aethvion modules). Includes safety scores and usage counts.

memory | Memory | Archive of all system memory. Allows searching past conversation threads, task histories, episodic memory entries, and knowledge graph nodes. Stored as structured JSON records.

logs | Logs | Live log stream panel split into System Logs (file-backed) and System Terminal (real-time WebSocket feed). Useful for debugging and monitoring background tasks.

usage | Usage | API usage analytics. Shows token consumption, cost estimates, and request counts broken down by provider, model, and time range. Includes trend charts.

status | Status | Live system status dashboard. Shows hardware telemetry (CPU, RAM), Nexus Core health, provider API status, active agents count, project size, and episodic memory count.

settings | Settings | Core configuration hub. Sub-sections: Assistant (this AI), AI Providers (API keys and model registry), Global System (behavior settings), Environment (secret keys), and Routing Profiles (model priority lists).

TAB SWITCHING
If Dashboard Control is enabled in the assistant settings, the assistant can navigate the user to a specific tab.
To switch to a tab, include a tab switch command anywhere in the response: [SwitchTab: tab_id]
Example: [SwitchTab: arena] will navigate the user to the LLM Arena tab.
Only use tab switching when the user EXPLICITLY asks to go somewhere or when it would be clearly helpful.
