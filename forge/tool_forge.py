"""
Misaka Cipher - Tool Forge
Core tool generation engine
"""

import json
from pathlib import Path
from typing import Optional, Dict, Any

from .tool_spec import ToolSpec, ParameterSpec
from .tool_registry import get_tool_registry
from .code_generator import CodeGenerator
from .tool_validator import ToolValidator, ValidationResult
from nexus_core import NexusCore, Request
from utils import get_logger, get_trace_manager

logger = get_logger(__name__)


class ToolForge:
    """
    The Forge - Autonomous tool generation system.
    
    Generates tools from natural language descriptions:
    1. Analyze description via Nexus Core
    2. Extract domain, action, object
    3. Generate Python code
    4. Validate Aethvion compliance and security
    5. Register tool
    """
    
    def __init__(self, nexus: NexusCore, tools_dir: Optional[Path] = None):
        """
        Initialize Tool Forge.
        
        Args:
            nexus: NexusCore instance for analysis
            tools_dir: Directory to save generated tools
        """
        self.nexus = nexus
        self.trace_manager = get_trace_manager()
        self.registry = get_tool_registry()
        self.generator = CodeGenerator()
        self.validator = ToolValidator()
        
        # Tools directory
        if tools_dir is None:
            workspace = Path(__file__).parent.parent
            tools_dir = workspace / "tools" / "generated"
        
        self.tools_dir = Path(tools_dir)
        self.tools_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Tool Forge initialized (tools_dir: {self.tools_dir})")
    
    def generate_tool(
        self,
        description: str,
        implementation_hints: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate a tool from description.
        
        Args:
            description: Natural language tool description
            implementation_hints: Optional implementation guidance
            
        Returns:
            Tool information dict
            
        Raises:
            ValueError: If tool generation fails validation
        """
        # Generate Trace_ID for this tool generation
        trace_id = self.trace_manager.start_trace(metadata={
            'operation': 'tool_generation',
            'description': description
        })
        
        logger.info(f"[{trace_id}] Starting tool generation: {description[:100]}...")
        
        try:
            # 1. Analyze description (extract spec)
            spec = self.analyze_description(description, trace_id)
            spec.trace_id = trace_id
            
            if implementation_hints:
                spec.implementation_hints.update(implementation_hints)
            
            logger.info(f"[{trace_id}] Tool spec generated: {spec.name}")
            
            # 2. Generate implementation (NEW - real code via Nexus)
            implementation_code = self.generate_implementation(spec, trace_id)
            spec.implementation_hints['code'] = implementation_code
            
            logger.info(f"[{trace_id}] Implementation code generated ({len(implementation_code)} chars)")
            
            # 3. Generate code file
            code = self.generator.generate(spec)
            
            logger.info(f"[{trace_id}] Tool file generated ({len(code)} chars)")
            
            # 4. Validate (with self-healing if needed)
            validation = self.validator.validate(code, spec)
            
            if not validation.success:
                error_msg = "; ".join(validation.errors)
                logger.warning(f"[{trace_id}] Initial validation failed: {error_msg}")
                logger.info(f"[{trace_id}] Attempting self-heal...")
                
                try:
                    # Self-heal the implementation
                    fixed_implementation = self.self_heal_tool(
                        broken_code=implementation_code,
                        error=error_msg,
                        spec=spec,
                        trace_id=trace_id
                    )
                    
                    # Update spec with fixed code
                    spec.implementation_hints['code'] = fixed_implementation
                    
                    # Regenerate tool file with fixed code
                    code = self.generator.generate(spec)
                    
                    logger.info(f"[{trace_id}] Tool regenerated with healed implementation")
                    
                except Exception as heal_error:
                    logger.error(f"[{trace_id}] Self-heal failed: {str(heal_error)}")
                    raise ValueError(f"Tool validation failed and self-heal unsuccessful: {error_msg}")
            
            if validation.warnings:
                warnings_msg = "; ".join(validation.warnings)
                logger.warning(f"[{trace_id}] Tool validation warnings: {warnings_msg}")
            
            logger.info(f"[{trace_id}] Tool validation passed")
            
            # 5. Save to file
            file_path = self.tools_dir / spec.file_name
            with open(file_path, 'w') as f:
                f.write(code)
            
            logger.info(f"[{trace_id}] Tool saved: {file_path}")
            
            # 6. Register
            tool_info = {
                **spec.to_dict(),
                'file_path': str(file_path),
                'code_length': len(code),
                'validation_status': 'passed'
            }
            
            self.registry.register(tool_info)
            
            logger.info(f"[{trace_id}] Tool registered: {spec.name}")
            
            # Log to Memory Tier
            self._log_to_memory(spec, trace_id, file_path)
            
            # Complete trace
            self.trace_manager.end_trace(trace_id)
            
            logger.info(
                f"[{trace_id}] Tool generation complete: {spec.name} "
                f"(registry: {self.registry.get_tool_count()} tools)"
            )
            
            return tool_info
            
        except Exception as e:
            logger.error(f"[{trace_id}] Tool generation failed: {str(e)}")
            self.trace_manager.end_trace(trace_id)
            raise
    
    def analyze_description(self, description: str, trace_id: str) -> ToolSpec:
        """
        Analyze tool description using Nexus Core.
        
        Args:
            description: Natural language description
            trace_id: Trace ID for logging
            
        Returns:
            ToolSpec extracted from description
        """
        # Load allowed domains and actions from config
        from utils.validators import ALLOWED_DOMAINS, ALLOWED_ACTIONS
        
        analysis_prompt = f"""Analyze this tool request and extract structured information.

Tool Request: {description}

Extract:
1. Domain - Choose from: {', '.join(ALLOWED_DOMAINS)}
2. Action - Choose from: {', '.join(ALLOWED_ACTIONS)}
3. Object - What the tool operates on (PascalCase, e.g., "StockPrice", "UserData")
4. Description - Clear one-line description
5. Parameters - List of parameters needed (name, type, description, required)
6. Return Type - What the tool returns (str, int, dict, list, bool, etc.)
7. Implementation Type - "function" or "class"

Return ONLY valid JSON in this exact format:
{{
  "domain": "...",
  "action": "...",
  "object": "...",
  "description": "...",
  "parameters": [
    {{"name": "...", "type": "str", "description": "...", "required": true}}
  ],
  "return_type": "str",
  "implementation_type": "function"
}}

Be precise. Choose the most appropriate domain and action from the allowed lists."""
        
        logger.debug(f"[{trace_id}] Sending analysis prompt to Nexus Core")
        
        request = Request(
            prompt=analysis_prompt,
            request_type="forge_analysis",
            metadata={'tool_description': description},
            temperature=0.1  # Low temperature for structured output
        )
        
        response = self.nexus.route_request(request)
        
        if not response.success:
            raise RuntimeError(f"Nexus Core analysis failed: {response.error}")
        
        logger.debug(f"[{trace_id}] Analysis response received")
        
        # Parse JSON response
        try:
            # Extract JSON from response (may have markdown code blocks)
            content = response.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            data = json.loads(content)
            
            # Build ToolSpec
            parameters = [
                ParameterSpec(**param) for param in data.get('parameters', [])
            ]
            
            spec = ToolSpec(
                domain=data['domain'],
                action=data['action'],
                object=data['object'],
                description=data['description'],
                parameters=parameters,
                return_type=data.get('return_type', 'Any'),
                implementation_type=data.get('implementation_type', 'function')
            )
            
            return spec
            
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"[{trace_id}] Failed to parse analysis response: {str(e)}")
            logger.error(f"[{trace_id}] Response content: {response.content[:500]}")
            raise ValueError(f"Failed to parse tool specification: {str(e)}")
    
    def generate_implementation(self, spec: ToolSpec, trace_id: str) -> str:
        """
        Generate actual implementation code using Nexus Core.
        
        This is Phase 2 of tool generation - generates working Python code
        based on the tool specification extracted in Phase 1.
        
        Args:
            spec: Tool specification with parameters and description
            trace_id: Trace ID for logging
            
        Returns:
            Python implementation code (function body)
        """
        # Build detailed prompt for code generation
        params_desc = "\n".join([
            f"  - {p.name} ({p.type}): {p.description}"
            for p in spec.parameters
        ])
        
        prompt = f"""Generate a complete, working Python implementation for this tool.

Tool Name: {spec.name}
Domain: {spec.domain}
Description: {spec.description}
Action: {spec.action}
Object: {spec.object}

Parameters:
{params_desc if params_desc else "  (none)"}

Return Type: {spec.return_type}

REQUIREMENTS:
1. Write ONLY the function body code (the implementation inside the function)
2. Use proper Python syntax with error handling
3. Include necessary imports at the top if needed (requests, json, pathlib, etc.)
4. Return the correct type: {spec.return_type}
5. Make it production-ready, not a placeholder
6. Add helpful comments for complex logic
7. Handle edge cases and errors gracefully

IMPORTANT: Do NOT include the function definition line (def {spec.name}...) - only the body.
If you need imports, put them at the very top as separate lines.

Example format:
```
# Import statements (if needed)
import requests
import json

# Function body
try:
    # Actual implementation here
    result = do_something()
    return result
except Exception as e:
    logger.error(f"Error: {{e}}")
    return {{"error": str(e)}}
```
"""
        
        logger.info(f"[{trace_id}] Requesting implementation from Nexus for {spec.name}")
        
        # Call Nexus to generate code
        request = Request(
            content=prompt,
            trace_id=trace_id,
            context={'operation': 'code_generation', 'tool': spec.name}
        )
        
        response = self.nexus.call(request)
        implementation = response.content.strip()
        
        # Clean up code fences if Nexus wrapped it
        if implementation.startswith('```'):
            lines = implementation.split('\n')
            # Remove first line if it's just ```python or ```
            if lines[0].strip().startswith('```'):
                lines = lines[1:]
            # Remove last line if it's just ```
            if lines and lines[-1].strip() == '```':
                lines = lines[:-1]
            implementation = '\n'.join(lines).strip()
        
        logger.info(f"[{trace_id}] Implementation generated ({len(implementation)} chars)")
        
        return implementation
    
    def self_heal_tool(
        self,
        broken_code: str,
        error: str,
        spec: ToolSpec,
        trace_id: str,
        max_attempts: int = 3
    ) -> str:
        """
        Autonomously fix a broken tool.
        
        This is the self-healing loop - analyzes errors and regenerates
        tool implementations until validation passes.
        
        Args:
            broken_code: The code that failed validation
            error: Error message from validation
            spec: Tool specification
            trace_id: Trace ID for logging
            max_attempts: Maximum fix attempts (default: 3)
            
        Returns:
            Fixed Python code
            
        Raises:
            ValueError: If tool cannot be fixed after max_attempts
        """
        logger.warning(f"[{trace_id}] Starting self-heal for {spec.name}: {error}")
        
        current_code = broken_code
        
        for attempt in range(1, max_attempts + 1):
            logger.info(f"[{trace_id}] Self-heal attempt {attempt}/{max_attempts}")
            
            # Build fix prompt
            fix_prompt = f"""Fix this broken Python tool implementation.

Tool: {spec.name}
Domain: {spec.domain}
Description: {spec.description}

ERROR: {error}

BROKEN CODE:
```python
{current_code}
```

REQUIREMENTS:
1. Fix the error mentioned above
2. Ensure proper syntax and imports
3. Match the tool specification exactly
4. Return type: {spec.return_type}
5. Parameters: {[p.name + ': ' + p.type for p in spec.parameters]}

Return ONLY the corrected Python code (function body + imports if needed).
Do NOT include the function definition line.
"""
            
            # Call Nexus to fix
            request = Request(
                content=fix_prompt,
                trace_id=trace_id,
                context={'operation': 'tool_healing', 'attempt': attempt}
            )
            
            response = self.nexus.call(request)
            fixed_code = response.content.strip()
            
            # Clean code fences
            if fixed_code.startswith('```'):
                lines = fixed_code.split('\n')
                if lines[0].strip().startswith('```'):
                    lines = lines[1:]
                if lines and lines[-1].strip() == '```':
                    lines = lines[:-1]
                fixed_code = '\n'.join(lines).strip()
            
            logger.info(f"[{trace_id}] Fixed code generated ({len(fixed_code)} chars)")
            
            # Validate the fix
            validation = self.validator.validate(fixed_code, spec)
            
            if validation.success:
                logger.info(f"[{trace_id}] ✓ Self-heal successful on attempt {attempt}")
                return fixed_code
            else:
                # Still broken, log and try again
                error = "; ".join(validation.errors)
                logger.warning(f"[{trace_id}] Attempt {attempt} failed: {error}")
                current_code = fixed_code  # Use this version for next attempt
        
        # Failed all attempts
        raise ValueError(
            f"Could not fix {spec.name} after {max_attempts} attempts. "
            f"Last error: {error}"
        )
    

    def get_tool_count(self) -> int:
        """Get number of registered tools."""
        return self.registry.get_tool_count()
    
    def list_tools(self, domain: Optional[str] = None):
        """List all registered tools."""
        return self.registry.list_tools(domain)
    
    def search_tools(self, query: str):
        """Search tools by name or description."""
        return self.registry.search_tools(query)
    
    def _log_to_memory(self, spec: ToolSpec, trace_id: str, file_path: Path):
        """
        Log tool creation to Memory Tier.
        
        Args:
            spec: Tool specification
            trace_id: Trace ID for this generation
            file_path: Path to generated tool file
        """
        try:
            # Import here to avoid circular dependencies
            from memory import (
                get_episodic_memory,
                get_knowledge_graph,
                EpisodicMemory,
                generate_memory_id
            )
            from datetime import datetime
            
            # Create episodic memory
            memory = EpisodicMemory(
                memory_id=generate_memory_id(),
                trace_id=trace_id,
                timestamp=datetime.now().isoformat(),
                event_type='tool_forge',
                domain=spec.domain,
                summary=f"Generated {spec.name} tool",
                content=f"Tool '{spec.name}' created: {spec.description}",
                metadata={
                    'tool_name': spec.name,
                    'tool_file': str(file_path),
                    'parameters': [p.name for p in spec.parameters],
                    'return_type': spec.return_type
                }
            )
            
            # Store in episodic memory
            memory_store = get_episodic_memory()
            memory_store.store(memory)
            
            logger.debug(f"[{trace_id}] Tool logged to episodic memory")
            
            # Add to knowledge graph
            kg = get_knowledge_graph()
            
            # Add tool node and link to domain
            kg.add_tool(
                tool_name=spec.name,
                domain=spec.domain,
                metadata={
                    'type': spec.implementation_type,
                    'description': spec.description
                }
            )
            
            # Add trace ID node
            kg.add_trace_id(
                trace_id=trace_id,
                event_type='tool_forge'
            )
            
            # Link tool to trace
            kg.link_tool_to_trace(spec.name, trace_id)
            
            # Save graph
            kg.save()
            
            logger.debug(f"[{trace_id}] Tool linked in knowledge graph")
            
        except Exception as e:
            # Don't fail tool generation if memory logging fails
            logger.warning(f"[{trace_id}] Memory logging failed: {str(e)}")

