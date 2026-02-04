"""
Misaka Cipher - Standard File Operations
"""

import os
from pathlib import Path
from typing import Optional, Union

# Define workspace root
WORKSPACE_ROOT = Path("C:/Aethvion/MisakaCipher/WorkFolder")

def data_save_file(filename: str, content: Union[str, bytes], domain: str = "general", encoding: str = "utf-8") -> str:
    """
    Save content to a file in the workspace.
    
    Args:
        filename: Name of the file (e.g., report.txt)
        content: String content or bytes to write
        domain: Domain subdirectory (default: general)
        encoding: File encoding (default: utf-8)
        
    Returns:
        Absolute path to the saved file
    """
    try:
        # Sanitize inputs
        clean_domain = "".join(c for c in domain if c.isalnum() or c in ('_', '-'))
        clean_filename = "".join(c for c in filename if c.isalnum() or c in ('_', '-', '.'))
        
        # Create directory
        file_dir = WORKSPACE_ROOT / clean_domain
        file_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = file_dir / clean_filename
        
        # Write file
        mode = 'w' if isinstance(content, str) else 'wb'
        final_encoding = encoding if isinstance(content, str) else None
        
        with open(file_path, mode, encoding=final_encoding) as f:
            f.write(content)
            
        return str(file_path)
        
    except Exception as e:
        return f"Error saving file: {str(e)}"

def data_read_file(filename: str, domain: str = "general") -> str:
    """
    Read content from a file in the workspace.
    
    Args:
        filename: Name of the file
        domain: Domain subdirectory
        
    Returns:
        File content
    """
    try:
        # Sanitize inputs
        clean_domain = "".join(c for c in domain if c.isalnum() or c in ('_', '-'))
        clean_filename = "".join(c for c in filename if c.isalnum() or c in ('_', '-', '.'))
        
        file_path = WORKSPACE_ROOT / clean_domain / clean_filename
        
        if not file_path.exists():
            return f"Error: File not found at {file_path}"
            
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
            
    except Exception as e:
        return f"Error reading file: {str(e)}"
