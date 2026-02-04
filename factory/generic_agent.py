"""
Misaka Cipher - Generic Agent
Default implementation of BaseAgent for general-purpose tasks
"""

import re
import sys
import io
import traceback
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from datetime import datetime
import importlib.util
from .base_agent import BaseAgent
from .agent_result import AgentResult

from tools.standard.file_ops import WORKSPACE_ROOT

# Add workspace root to path for tool imports
sys.path.append(str(Path(__file__).parent.parent))


class GenericAgent(BaseAgent):
    """
    Generic agent for general-purpose tasks.
    
    Executes a single prompt from the context and returns the result.
    Capability: Can execute generated Python code if present.
    """
    
    def execute(self) -> AgentResult:
        """
        Execute the agent task.
        
        Expected context:
            - prompt: The prompt to execute
            - instructions: Optional additional instructions
        
        Returns:
            AgentResult with response
        """
        started_at = datetime.now().isoformat()
        
        # Get prompt from context
        prompt = self.spec.context.get('prompt')
        if not prompt:
            self.log("No prompt provided in context", level="error")
            return AgentResult(
                content="",
                agent_name=self.name,
                trace_id=self.trace_id,
                success=False,
                started_at=started_at,
                error="No prompt provided in agent context"
            )
        
        # Add instructions if provided
        instructions = self.spec.context.get('instructions', '')
        
        # Inject tool awareness
        if self.context.get('available_tools'):
            tools_desc = "\n".join([f"- {t['name']}: {t.get('description', 'No description')}" for t in self.context['available_tools']])
            tool_instructions = (
                "\n\nSYSTEM: You have access to the following tools via Python code. "
                "To use them, you MUST write executable Python code blocks.\n"
                f"{tools_desc}\n"
                "Standard tools (save/read files) are available to import from 'tools.standard.file_ops'.\n"
                "Global 'WORK_FOLDER' (Path object) is available for direct file access.\n"
                "IMPORTANT: All Custom Tools (like Finance_*, System_*, etc.) are PRE-LOADED as global functions/classes.\n"
                "DO NOT import them. Just call them directly by name (e.g., `Finance_Analyze_Stockrisk(...)`).\n"
                "Example: `from tools.standard.file_ops import data_save_file` (Standard tools MUST be imported)."
            )
            instructions += tool_instructions
            
        if instructions:
            prompt = f"{instructions}\n\n{prompt}"
        
        self.log(f"Executing prompt (length: {len(prompt)} chars)")
        
        try:
            # Call Nexus Core
            self.iterations_count = 1
            response = self.call_nexus(prompt)
            
            self.log(f"Received response (length: {len(response)} chars)")
            
            # Check for code execution
            execution_output = None
            # Check for code execution
            execution_output = self._execute_code(response)
            if execution_output:
                self.log("Detected code block, executing...")
                response += f"\n\n--- EXECUTION OUTPUT ---\n{execution_output}"
            
            # Legacy check for string match removed, logic moved to _execute_code
            found_code = execution_output is not None
            
            return AgentResult(
                content=response,
                agent_name=self.name,
                trace_id=self.trace_id,
                success=True,
                started_at=started_at,
                iterations=self.iterations_count,
                metadata={
                    'prompt_length': len(prompt),
                    'response_length': len(response),
                    'executed_code': execution_output is not None
                }
            )
            
        except Exception as e:
            self.log(f"Execution failed: {str(e)}", level="error")
            return AgentResult(
                content="",
                agent_name=self.name,
                trace_id=self.trace_id,
                success=False,
                started_at=started_at,
                error=str(e),
                iterations=self.iterations_count
            )

    def _execute_code(self, response_text: str) -> str:
        """
        Extract and execute Python code blocks from response.
        
        Args:
            response_text: LLM response containing markdown code blocks
            
        Returns:
            Captured stdout/stderr from execution
        """
        # Extract code blocks (python or generic)
        code_blocks = re.findall(r"```(?:python)?(.*?)```", response_text, re.DOTALL)
        if not code_blocks:
            return None
            
        # Combine all blocks
        full_code = "\n".join(code_blocks)
        
        # Prepare execution environment
        output_buffer = io.StringIO()
        
        # Safe globals with tool imports pre-loaded
        exec_globals = {
            "__name__": "__agent_exec__",
            "datetime": datetime,
            "Path": Path,
            "print": print,
            "WORK_FOLDER": WORKSPACE_ROOT,  # Injected workspace root
        }
        
        # Dynamically import available tools into globals
        if self.context.get('available_tools'):
            for tool in self.context['available_tools']:
                try:
                    tool_name = tool['name']
                    # Assuming tool['file_path'] exists
                    if 'file_path' in tool:
                        spec = importlib.util.spec_from_file_location(tool_name, tool['file_path'])
                        if spec and spec.loader:
                            module = importlib.util.module_from_spec(spec)
                            spec.loader.exec_module(module)
                            
                            # If tool key class/func matches name, import it directly
                            if hasattr(module, tool_name):
                                exec_globals[tool_name] = getattr(module, tool_name)
                            else:
                                # Start searching for snake_case equivalent or just the module
                                exec_globals[tool_name] = module
                                
                            self.log(f"Injected tool {tool_name} into execution context")
                except Exception as e:
                    self.log(f"Failed to inject tool {tool.get('name')}: {str(e)}", level="warning")
        
        try:
            # Redirect stdout/stderr to capture output
            with redirect_stdout(output_buffer), redirect_stderr(output_buffer):
                self.log(f"DEBUG: Executing code block:\n{full_code}")
                self.log(f"DEBUG: Available globals: {list(exec_globals.keys())}")
                exec(full_code, exec_globals)
            
            output = output_buffer.getvalue()
            if not output.strip():
                return "Code executed successfully (no output)."
            return output
            
        except Exception:
            error_trace = traceback.format_exc()
            self.log(f"Code execution error: {error_trace}", level="error")
            return f"Code execution failed:\n{error_trace}"
