import os
import json
from pathlib import Path
from workspace.usage_tracker import get_usage_tracker

PROJECT_ROOT = Path("c:/Aethvion/Misaka-Cipher")
EXCLUDE_DIRS = {'.git', 'node_modules', '.venv', 'venv', '__pycache__', '.gemini', 'data'}

def get_file_counts() -> str:
    """Return a summary of all file types and their counts in the project."""
    counts = {}
    for root, dirs, files in os.walk(PROJECT_ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for file in files:
            ext = Path(file).suffix.lower()
            if ext:
                counts[ext] = counts.get(ext, 0) + 1
            else:
                counts['no_extension'] = counts.get('no_extension', 0) + 1
    
    summary = ["File Counts by Extension:"]
    for ext, count in sorted(counts.items(), key=lambda item: item[1], reverse=True):
        summary.append(f"- {ext}: {count}")
    return "\n".join(summary)

def get_project_size() -> str:
    """Return the total size of the project directory in megabytes."""
    total_size = 0
    for root, dirs, files in os.walk(PROJECT_ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for file in files:
            fp = os.path.join(root, file)
            if not os.path.islink(fp):
                try:
                    total_size += os.path.getsize(fp)
                except Exception:
                    pass
    
    mb = round(total_size / (1024 * 1024), 2)
    return f"Total Project Size (excluding ignored dirs): {mb} MB"

def get_token_usage() -> str:
    """Return the monetary cost and token usage for today and all-time."""
    tracker = get_usage_tracker()
    today = tracker.get_today_summary()
    total = tracker.get_summary()
    
    return f"""Token Usage & Cost:
--- TODAY ---
Tokens: {today.get('tokens', 0)}
Cost: ${today.get('cost', 0.0):.6f}

--- ALL-TIME ---
Total Calls: {total.get('total_calls', 0)}
Total Tokens: {total.get('total_tokens', 0)}
Total Cost: ${total.get('total_cost', 0.0):.6f}
"""

def get_system_map() -> str:
    """Returns a textual map/overview of the Misaka Cipher architecture directories."""
    return """Misaka Cipher Architectural Map:
- /cli_modules: Python files handling the terminal/command-line interface menus.
- /config: JSON registry files (settings.json, model_registry.json) for system state.
- /core: System retrieval utilities and core intelligence hooks.
- /docs (or /documentation): Architecture and prompt specs.
- /factory: Agent Factory (creation and tracking of sub-agents).
- /forge: Tool Forge (dynamic python tool generation and registry).
- /memory: Knowledge graph and Episodic memory SQLite vector databases.
- /providers: LLM API wrappers (Google, OpenAI, Grok, Local).
- /web: FastAPI backend routes.
  - /web/static: Frontend HTML, JS modules, CSS sheets, and Images.
- /workspace: Task tracking, git integration, and usage metrics.
- cli.py: The root terminal execution script.
- standalone_fastapi.py: The root web server script.
"""

def search_scripts(keyword: str) -> str:
    """Searches .py and .js files for a particular exact keyword and returns matching files."""
    matches = []
    for root, dirs, files in os.walk(PROJECT_ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for file in files:
            if file.endswith('.py') or file.endswith('.js'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        if keyword.lower() in f.read().lower():
                            matches.append(os.path.relpath(path, PROJECT_ROOT))
                except Exception:
                    pass
                    
    if not matches:
        return f"No scripts found containing '{keyword}'."
    return "Found keyword in these files:\n" + "\n".join(matches)

# List of tools formatted for OpenAI/Gemini tool calling
ASSISTANT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_file_counts",
            "description": "Returns counts of all file extensions (.json, .py, .js, etc) in the project.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_project_size",
            "description": "Returns the total byte size of the project in MB.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_token_usage",
            "description": "Returns money spent and LLM tokens used today and all-time.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_system_map",
            "description": "Returns a directory layout and description of the Misaka Cipher Architecture.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_scripts",
            "description": "Searches inside all python and javascript files for a keyword.",
            "parameters": {
                "type": "object", 
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "The term or variable to search for."
                    }
                },
                "required": ["keyword"]
            }
        }
    }
]

ASSISTANT_TOOL_MAP = {
    "get_file_counts": get_file_counts,
    "get_project_size": get_project_size,
    "get_token_usage": get_token_usage,
    "get_system_map": get_system_map,
    "search_scripts": search_scripts
}
