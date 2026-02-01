"""
Misaka Cipher - Tool Validator
Validates generated tools for security and compliance
"""

import ast
from typing import Tuple, List, Set
from pathlib import Path

from utils import get_logger, validate_tool_name

logger = get_logger(__name__)


# Whitelist of permitted imports
PERMITTED_IMPORTS = {
    # Standard library - safe modules only
    'json',
    'math',
    'datetime',
    'time',
    'typing',
    'dataclasses',
    'collections',
    'itertools',
    'functools',
    're',
    'string',
    'decimal',
    'fractions',
    'statistics',
    'random',
    'uuid',
    'hashlib',
    'base64',
    'urllib.parse',
    
    # Custom whitelist can be extended
}

# Forbidden operations (AST node types)
FORBIDDEN_OPERATIONS = {
    # File system operations
    'open',
    'file',
    'read',
    'write',
    
    # System operations
    'os',
    'sys',
    'subprocess',
    'eval',
    'exec',
    'compile',
    '__import__',
    
    # Network operations (unless explicitly whitelisted)
    'socket',
    'urllib.request',
    'http',
    'requests',
}


class ToolValidator:
    """
    Validates generated tool code for:
    - Aethvion naming compliance
    - Syntax correctness
    - Import whitelist adherence
    - Sandbox restrictions (no file/system ops)
    """
    
    def __init__(self, strict_mode: bool = True):
        """
        Initialize validator.
        
        Args:
            strict_mode: If True, enforce all security restrictions
        """
        self.strict_mode = strict_mode
        logger.info(f"Tool Validator initialized (strict_mode: {strict_mode})")
    
    def validate_tool(self, code: str, tool_name: str) -> Tuple[bool, List[str]]:
        """
        Validate tool code.
        
        Args:
            code: Python code to validate
            tool_name: Expected tool name (Aethvion format)
            
        Returns:
            (is_valid, error_messages)
        """
        errors = []
        
        # 1. Validate Aethvion naming
        is_valid, naming_error = validate_tool_name(tool_name)
        if not is_valid:
            errors.append(f"Aethvion naming violation: {naming_error}")
        
        # 2. Validate syntax
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            errors.append(f"Syntax error: {str(e)}")
            return False, errors
        
        # 3. Validate imports
        import_errors = self._validate_imports(tree)
        errors.extend(import_errors)
        
        # 4. Validate no forbidden operations
        if self.strict_mode:
            forbidden_errors = self._validate_no_forbidden_ops(tree, code)
            errors.extend(forbidden_errors)
        
        # 5. Validate tool name exists in code
        if not self._tool_name_exists_in_code(tree, tool_name):
            errors.append(f"Tool name '{tool_name}' not found in code")
        
        is_valid = len(errors) == 0
        
        if is_valid:
            logger.info(f"Tool validation passed: {tool_name}")
        else:
            logger.warning(f"Tool validation failed: {tool_name} - {len(errors)} errors")
        
        return is_valid, errors
    
    def _validate_imports(self, tree: ast.AST) -> List[str]:
        """Validate all imports are whitelisted."""
        errors = []
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module = alias.name.split('.')[0]
                    if module not in PERMITTED_IMPORTS:
                        errors.append(
                            f"Import not permitted: {alias.name}. "
                            f"Allowed: {', '.join(sorted(PERMITTED_IMPORTS))}"
                        )
            
            elif isinstance(node, ast.ImportFrom):
                module = node.module.split('.')[0] if node.module else None
                if module and module not in PERMITTED_IMPORTS:
                    errors.append(
                        f"Import not permitted: from {node.module}. "
                        f"Allowed: {', '.join(sorted(PERMITTED_IMPORTS))}"
                    )
        
        return errors
    
    def _validate_no_forbidden_ops(self, tree: ast.AST, code: str) -> List[str]:
        """Validate no forbidden operations (filesystem, exec, etc)."""
        errors = []
        
        # Check for forbidden function calls
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func_name = None
                
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node, ast.Attribute):
                    func_name = node.func.attr if hasattr(node.func, 'attr') else None
                
                if func_name and func_name in FORBIDDEN_OPERATIONS:
                    errors.append(
                        f"Forbidden operation: {func_name}() - "
                        f"File system and system calls are not permitted"
                    )
        
        # Check for 'open(' in raw code as additional safety
        if 'open(' in code:
            errors.append("Forbidden operation: file operations not permitted")
        
        return errors
    
    def _tool_name_exists_in_code(self, tree: ast.AST, tool_name: str) -> bool:
        """Check if tool name exists as function or class in code."""
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                if node.name == tool_name:
                    return True
            elif isinstance(node, ast.ClassDef):
                if node.name == tool_name:
                    return True
        
        return False
    
    def add_permitted_import(self, module: str):
        """
        Add a module to the permitted imports whitelist.
        
        Args:
            module: Module name to whitelist
        """
        PERMITTED_IMPORTS.add(module)
        logger.info(f"Added to import whitelist: {module}")
    
    def remove_permitted_import(self, module: str):
        """
        Remove a module from the permitted imports whitelist.
        
        Args:
            module: Module name to remove
        """
        if module in PERMITTED_IMPORTS:
            PERMITTED_IMPORTS.remove(module)
            logger.info(f"Removed from import whitelist: {module}")
