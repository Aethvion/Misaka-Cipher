
import sys
from pathlib import Path
from datetime import datetime

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

from forge.tool_registry import ToolRegistry

# Initialize registry
registry = ToolRegistry()

print("Registering standard tools...")

# Data_Save_File
registry.register({
    "name": "Data_Save_File",
    "domain": "Data",
    "action": "Save",
    "object": "File",
    "description": "Save content to a file in the workspace. Use this to persist reports, code, or data.",
    "file_path": str(Path("C:/Aethvion/MisakaCipher/tools/standard/file_ops.py").absolute()),
    "trace_id": "SYSTEM_INIT",
    "created_at": datetime.now().isoformat(),
    "parameters": {
        "filename": {"type": "str", "description": "Name of the file"},
        "content": {"type": "str", "description": "Content to write"},
        "domain": {"type": "str", "description": "Domain/subdirectory", "default": "general"},
        "encoding": {"type": "str", "description": "File encoding", "default": "utf-8"}
    }
})

# Data_Read_File
registry.register({
    "name": "Data_Read_File",
    "domain": "Data",
    "action": "Read",
    "object": "File",
    "description": "Read content from a file in the workspace.",
    "file_path": str(Path("C:/Aethvion/MisakaCipher/tools/standard/file_ops.py").absolute()),
    "trace_id": "SYSTEM_INIT",
    "created_at": datetime.now().isoformat(),
    "parameters": {
        "filename": {"type": "str", "description": "Name of the file"},
        "domain": {"type": "str", "description": "Domain/subdirectory", "default": "general"}
    }
})

print("Standard tools registered successfully.")
