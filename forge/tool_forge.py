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
from .validators import ToolValidator
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
        self.validator = ToolValidator(strict_mode=True)
        
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
            # 1. Analyze description
            spec = self.analyze_description(description, trace_id)
            spec.trace_id = trace_id
            
            if implementation_hints:
                spec.implementation_hints.update(implementation_hints)
            
            logger.info(f"[{trace_id}] Tool spec generated: {spec.name}")
            
            # 2. Generate code
            code = self.generator.generate(spec)
            
            logger.info(f"[{trace_id}] Code generated ({len(code)} chars)")
            
            # 3. Validate
            is_valid, errors = self.validator.validate_tool(code, spec.name)
            
            if not is_valid:
                error_msg = "; ".join(errors)
                logger.error(f"[{trace_id}] Tool validation failed: {error_msg}")
                raise ValueError(f"Tool validation failed: {error_msg}")
            
            logger.info(f"[{trace_id}] Tool validation passed")
            
            # 4. Save to file
            file_path = self.tools_dir / spec.file_name
            with open(file_path, 'w') as f:
                f.write(code)
            
            logger.info(f"[{trace_id}] Tool saved: {file_path}")
            
            # 5. Register
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

