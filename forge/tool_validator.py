"""
Misaka Cipher - Tool Validator
Validates generated tools for syntax, imports, and basic functionality
"""

import ast
import importlib.util
import sys
from typing import Tuple, List, Optional, Any
from pathlib import Path
from dataclasses import dataclass

from .tool_spec import ToolSpec
from utils import get_logger

logger = get_logger(__name__)


@dataclass
class ValidationResult:
    """Result of tool validation."""
    success: bool
    errors: List[str]
    warnings: List[str] = None
    
    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []


class ToolValidator:
    """
    Validates generated tools before registration.
    
    Validation steps:
    1. Syntax check (AST parsing)
    2. Import verification
    3. Function signature validation
    4. Optional: Basic execution test
    """
    
    def __init__(self):
        """Initialize Tool Validator."""
        logger.info("Tool Validator initialized")
    
    def validate(self, code: str, spec: ToolSpec) -> ValidationResult:
        """
        Comprehensive tool validation.
        
        Args:
            code: Generated Python code
            spec: Tool specification
            
        Returns:
            ValidationResult with success status and any errors
        """
        errors = []
        warnings = []
        
        # Step 1: Syntax validation
        syntax_valid, syntax_errors = self._validate_syntax(code)
        if not syntax_valid:
            errors.extend(syntax_errors)
            # If syntax fails, can't continue
            return ValidationResult(success=False, errors=errors, warnings=warnings)
        
        # Step 2: Import validation
        import_valid, import_errors = self._validate_imports(code)
        if not import_valid:
            # Imports failing is a warning, not fatal
            warnings.extend(import_errors)
        
        # Step 3: Function signature validation
        sig_valid, sig_errors = self._validate_signature(code, spec)
        if not sig_valid:
            errors.extend(sig_errors)
        
        success = len(errors) == 0
        return ValidationResult(success=success, errors=errors, warnings=warnings)
    
    def _validate_syntax(self, code: str) -> Tuple[bool, List[str]]:
        """
        Validate Python syntax using AST.
        
        Returns:
            (is_valid, errors)
        """
        try:
            ast.parse(code)
            return True, []
        except SyntaxError as e:
            error_msg = f"Syntax error at line {e.lineno}: {e.msg}"
            logger.error(f"Syntax validation failed: {error_msg}")
            return False, [error_msg]
        except Exception as e:
            error_msg = f"AST parsing failed: {str(e)}"
            logger.error(f"Syntax validation failed: {error_msg}")
            return False, [error_msg]
    
    def _validate_imports(self, code: str) -> Tuple[bool, List[str]]:
        """
        Validate that all imports are available.
        
        This is best-effort, some imports might work in production
        but not during validation (e.g., missing dev dependencies).
        
        Returns:
            (is_valid, errors)
        """
        errors = []
        
        try:
            tree = ast.parse(code)
        except:
            # Syntax error, already caught in _validate_syntax
            return True, []
        
        # Extract all imports
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if not self._check_import(alias.name):
                        errors.append(f"Import not available: {alias.name}")
            
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ''
                if module and not self._check_import(module):
                    errors.append(f"Import not available: {module}")
        
        # Warnings only, not fatal
        is_valid = True
        if errors:
            logger.warning(f"Import validation found missing modules: {errors}")
        
        return is_valid, errors
    
    def _check_import(self, module_name: str) -> bool:
        """Check if a module can be imported."""
        try:
            # Try to find the module spec
            spec = importlib.util.find_spec(module_name)
            return spec is not None
        except (ImportError, ModuleNotFoundError, ValueError):
            return False
        except Exception as e:
            logger.debug(f"Import check failed for {module_name}: {e}")
            return False
    
    def _validate_signature(self, code: str, spec: ToolSpec) -> Tuple[bool, List[str]]:
        """
        Validate function signature matches spec.
        
        Checks:
        - Function with correct name exists
        - Parameters match spec (name and count)
        
        Returns:
            (is_valid, errors)
        """
        errors = []
        
        try:
            tree = ast.parse(code)
        except:
            # Syntax error, already handled
            return True, []
        
        # Find the function definition
        function_found = False
        
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == spec.name:
                function_found = True
                
                # Check parameters
                expected_params = [p.name for p in spec.parameters]
                actual_params = [arg.arg for arg in node.args.args]
                
                # Compare parameter names
                if set(expected_params) != set(actual_params):
                    missing = set(expected_params) - set(actual_params)
                    extra = set(actual_params) - set(expected_params)
                    
                    if missing:
                        errors.append(f"Missing parameters: {', '.join(missing)}")
                    if extra:
                        errors.append(f"Extra parameters: {', '.join(extra)}")
                
                break
        
        if not function_found:
            errors.append(f"Function '{spec.name}' not found in generated code")
        
        is_valid = len(errors) == 0
        return is_valid, errors
    
    def test_execution(
        self,
        code: str,
        spec: ToolSpec,
        test_args: Optional[dict] = None
    ) -> Tuple[bool, Optional[Any], Optional[str]]:
        """
        Test tool execution with sample inputs (optional).
        
        WARNING: This executes arbitrary code - use with caution!
        Only call this if you trust the Nexus Core output.
        
        Args:
            code: Generated Python code
            spec: Tool specification
            test_args: Test arguments to pass
            
        Returns:
            (success, result, error_message)
        """
        if test_args is None:
            # Can't test without arguments
            return True, None, None
        
        try:
            # Create a module from the code
            namespace = {}
            exec(code, namespace)
            
            # Get the function
            tool_func = namespace.get(spec.name)
            if not tool_func:
                return False, None, f"Function {spec.name} not found after execution"
            
            # Call with test args
            result = tool_func(**test_args)
            
            logger.info(f"Execution test passed for {spec.name}")
            return True, result, None
            
        except Exception as e:
            error_msg = f"Execution test failed: {str(e)}"
            logger.warning(f"{spec.name}: {error_msg}")
            return False, None, error_msg
