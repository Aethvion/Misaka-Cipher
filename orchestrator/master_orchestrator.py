"""
Misaka Cipher - Master Orchestrator
Autonomous coordinator for Factory, Forge, and Memory Tier
"""

from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime

from nexus_core import NexusCore, Request, Response
from factory import AgentFactory, AgentSpec
from forge import ToolForge
from memory import get_episodic_memory, get_knowledge_graph
from utils import get_logger, generate_trace_id

from .intent_analyzer import IntentAnalyzer, IntentAnalysis, IntentType

logger = get_logger(__name__)


@dataclass
class ActionPlan:
    """Plan for executing user request."""
    trace_id: str
    intent: IntentAnalysis
    actions: List[str]  # Sequence of actions to take
    requires_forge: bool = False
    forge_description: Optional[str] = None
    requires_factory: bool = False
    agent_spec: Optional[AgentSpec] = None
    requires_memory: bool = False
    memory_query: Optional[str] = None
    direct_response: Optional[str] = None


@dataclass
class ExecutionResult:
    """Result of orchestrator execution."""
    trace_id: str
    success: bool
    response: str
    actions_taken: List[str]
    tools_forged: List[str]
    agents_spawned: List[str]
    memories_queried: int
    execution_time: float
    error: Optional[str] = None


class MasterOrchestrator:
    """
    Master Orchestrator - Autonomous coordinator for Misaka Cipher.
    
    Analyzes user intents and autonomously decides when to:
    - Spawn specialized agents (Factory)
    - Generate missing tools (Forge)
    - Query knowledge base (Memory Tier)
    - Provide direct responses (Nexus Core)
    
    Acts as a Supervisor Agent that coordinates subsystems without
    requiring explicit user menu selection.
    """
    
    def __init__(self, nexus: NexusCore, factory: AgentFactory, forge: ToolForge):
        """
        Initialize Master Orchestrator.
        
        Args:
            nexus: NexusCore instance for AI routing
            factory: AgentFactory for spawning agents
            forge: ToolForge for generating tools
        """
        self.nexus = nexus
        self.factory = factory
        self.forge = forge
        self.intent_analyzer = IntentAnalyzer(nexus)
        
        # Memory tier (lazy loaded)
        self.episodic_memory = get_episodic_memory()
        self.knowledge_graph = get_knowledge_graph()
        
        # Execution tracking
        self.current_trace_id: Optional[str] = None
        self.execution_history: List[ExecutionResult] = []
        
        logger.info("Master Orchestrator initialized")
    
    def process_message(self, user_message: str) -> ExecutionResult:
        """
        Process user message end-to-end.
        
        Args:
            user_message: User's input message
            
        Returns:
            ExecutionResult with complete execution details
        """
        start_time = datetime.now()
        trace_id = generate_trace_id()
        self.current_trace_id = trace_id
        
        logger.info(f"[{trace_id}] Processing message: {user_message[:50]}...")
        
        try:
            # Step 1: Analyze intent
            intent = self.intent_analyzer.analyze(user_message, trace_id)
            logger.info(f"[{trace_id}] Intent: {intent.intent_type.value} (confidence: {intent.confidence:.2f})")
            
            # Step 2: Create action plan
            plan = self.decide_action(intent, trace_id)
            logger.info(f"[{trace_id}] Action plan: {', '.join(plan.actions)}")
            
            # Step 3: Execute plan
            result = self.execute_plan(plan)
            
            # Calculate execution time
            execution_time = (datetime.now() - start_time).total_seconds()
            result.execution_time = execution_time
            
            # Store result
            self.execution_history.append(result)
            
            logger.info(f"[{trace_id}] Execution completed in {execution_time:.2f}s")
            return result
            
        except Exception as e:
            logger.error(f"[{trace_id}] Orchestrator error: {str(e)}", exc_info=True)
            
            execution_time = (datetime.now() - start_time).total_seconds()
            return ExecutionResult(
                trace_id=trace_id,
                success=False,
                response=f"Orchestrator error: {str(e)}",
                actions_taken=["error"],
                tools_forged=[],
                agents_spawned=[],
                memories_queried=0,
                execution_time=execution_time,
                error=str(e)
            )
    
    def decide_action(self, intent: IntentAnalysis, trace_id: str) -> ActionPlan:
        """
        Decide what actions to take based on intent.
        
        Args:
            intent: Analyzed user intent
            trace_id: Trace ID for this execution
            
        Returns:
            ActionPlan with sequence of actions
        """
        actions = []
        plan = ActionPlan(
            trace_id=trace_id,
            intent=intent,
            actions=actions
        )
        
        # Route based on intent type
        if intent.intent_type == IntentType.CHAT:
            actions.append("direct_response")
            plan.direct_response = self._generate_chat_response(intent)
        
        elif intent.intent_type == IntentType.SYSTEM:
            actions.append("system_status")
            plan.direct_response = self._get_system_status()
        
        elif intent.intent_type == IntentType.QUERY:
            actions.append("query_memory")
            plan.requires_memory = True
            plan.memory_query = intent.prompt
        
        elif intent.intent_type == IntentType.CREATE:
            actions.append("forge_tool")
            plan.requires_forge = True
            plan.forge_description = intent.prompt
        
        elif intent.intent_type in [IntentType.ANALYZE, IntentType.EXECUTE]:
            # Check if tool exists
            if intent.requires_tool and intent.tool_name:
                tool_exists = self._check_tool_exists(intent.tool_name)
                if not tool_exists:
                    actions.append("forge_tool")
                    plan.requires_forge = True
                    plan.forge_description = f"Create {intent.tool_name} for {intent.prompt}"
            
            # Spawn agent
            actions.append("spawn_agent")
            plan.requires_factory = True
            plan.agent_spec = self._build_agent_spec(intent)
        
        else:
            # Unknown intent - try to have a conversation
            actions.append("direct_response")
            plan.direct_response = self._generate_chat_response(intent)
        
        return plan
    
    def execute_plan(self, plan: ActionPlan) -> ExecutionResult:
        """
        Execute an action plan.
        
        Args:
            plan: ActionPlan to execute
            
        Returns:
            ExecutionResult with outcomes
        """
        actions_taken = []
        tools_forged = []
        agents_spawned = []
        memories_queried = 0
        response_parts = []
        
        try:
            # Execute actions in sequence
            for action in plan.actions:
                if action == "forge_tool":
                    tool_result = self.call_forge(plan.forge_description, plan.trace_id)
                    tools_forged.append(tool_result.get('tool_name', 'unknown'))
                    response_parts.append(f"✓ Forged tool: {tool_result.get('tool_name')}")
                    actions_taken.append("forge_tool")
                
                elif action == "spawn_agent":
                    agent_result = self.call_factory(plan.agent_spec, plan.trace_id)
                    agents_spawned.append(agent_result.get('agent_name', 'unknown'))
                    response_parts.append(f"✓ Spawned agent: {agent_result.get('agent_name')}")
                    response_parts.append(f"\nAgent Output:\n{agent_result.get('output', 'No output')}")
                    actions_taken.append("spawn_agent")
                
                elif action == "query_memory":
                    memory_results = self.query_memory(plan.memory_query, plan.trace_id)
                    memories_queried = len(memory_results)
                    response_parts.append(self._format_memory_results(memory_results))
                    actions_taken.append("query_memory")
                
                elif action == "system_status":
                    response_parts.append(plan.direct_response)
                    actions_taken.append("system_status")
                
                elif action == "direct_response":
                    response_parts.append(plan.direct_response)
                    actions_taken.append("direct_response")
            
            # Combine responses
            final_response = "\n\n".join(response_parts)
            
            return ExecutionResult(
                trace_id=plan.trace_id,
                success=True,
                response=final_response,
                actions_taken=actions_taken,
                tools_forged=tools_forged,
                agents_spawned=agents_spawned,
                memories_queried=memories_queried,
                execution_time=0  # Filled by process_message
            )
            
        except Exception as e:
            logger.error(f"[{plan.trace_id}] Plan execution failed: {str(e)}", exc_info=True)
            return ExecutionResult(
                trace_id=plan.trace_id,
                success=False,
                response=f"Execution failed: {str(e)}",
                actions_taken=actions_taken,
                tools_forged=tools_forged,
                agents_spawned=agents_spawned,
                memories_queried=memories_queried,
                execution_time=0,
                error=str(e)
            )
    
    def call_factory(self, spec: AgentSpec, trace_id: str) -> Dict[str, Any]:
        """
        Spawn an agent via Factory.
        
        Args:
            spec: Agent specification
            trace_id: Trace ID
            
        Returns:
            Dictionary with agent execution results
        """
        logger.info(f"[{trace_id}] Spawning agent: {spec.to_name()}")
        
        # Spawn agent
        agent = self.factory.spawn_agent(spec)
        
        # Execute agent
        result = agent.execute()
        
        return {
            'agent_name': agent.name,
            'trace_id': agent.trace_id,
            'output': result.output,
            'success': result.success,
            'duration': result.duration
        }
    
    def call_forge(self, description: str, trace_id: str) -> Dict[str, Any]:
        """
        Generate a tool via Forge.
        
        Args:
            description: Tool description
            trace_id: Trace ID
            
        Returns:
            Dictionary with tool generation results
        """
        logger.info(f"[{trace_id}] Forging tool from description: {description[:50]}...")
        
        # Generate tool
        result = self.forge.generate_tool(description)
        
        return {
            'tool_name': result.tool_spec.name,
            'domain': result.tool_spec.domain,
            'file_path': result.file_path,
            'trace_id': result.trace_id,
            'success': result.validation.is_valid
        }
    
    def query_memory(self, query: str, trace_id: str, domain: str = None) -> List[Dict]:
        """
        Query episodic memory.
        
        Args:
            query: Search query
            trace_id: Trace ID
            domain: Optional domain filter
            
        Returns:
            List of memory results
        """
        logger.info(f"[{trace_id}] Querying memory: {query[:50]}...")
        
        # Search episodic memory
        results = self.episodic_memory.search(query, k=5, domain=domain)
        
        return [
            {
                'memory_id': m.memory_id,
                'summary': m.summary,
                'trace_id': m.trace_id,
                'timestamp': m.timestamp,
                'domain': m.domain,
                'event_type': m.event_type
            }
            for m in results
        ]
    
    def _check_tool_exists(self, tool_name: str) -> bool:
        """Check if a tool exists in the registry."""
        tools = self.knowledge_graph.get_tools_by_domain(None)  # All tools
        return any(t == tool_name for t in tools)
    
    def _build_agent_spec(self, intent: IntentAnalysis) -> AgentSpec:
        """Build AgentSpec from intent."""
        return AgentSpec(
            domain=intent.domain or "General",
            action=intent.action or "Execute",
            object=intent.object or "Task",
            context={
                'prompt': intent.prompt,
                'parameters': intent.parameters
            },
            description=f"{intent.action} {intent.object}" if intent.action and intent.object else "Execute task",
            temperature=0.7
        )
    
    def _generate_chat_response(self, intent: IntentAnalysis) -> str:
        """Generate direct chat response via Nexus Core."""
        request = Request(
            prompt=intent.prompt,
            request_type="generation",
            temperature=0.7
        )
        
        response = self.nexus.route_request(request)
        
        if response.success:
            return response.content
        else:
            return f"I encountered an error: {response.error}"
    
    def _get_system_status(self) -> str:
        """Get system status summary."""
        status = self.nexus.get_status()
        
        # Format status
        providers_healthy = sum(1 for p in status['providers']['providers'].values() if p['is_healthy'])
        total_providers = len(status['providers']['providers'])
        
        return f"""**System Status**

**Nexus Core**: {'✓ Operational' if status['initialized'] else '✗ Not initialized'}
**Active Traces**: {status['active_traces']}
**Firewall**: {'ACTIVE' if status['firewall'].get('enabled') else 'DISABLED'}
**Providers**: {providers_healthy}/{total_providers} healthy

**The Factory**: {len(self.factory.registry.get_all_agents())} agents (all time)
**The Forge**: {len(self.forge.registry.list_tools())} tools registered
**Memory Tier**: {self.episodic_memory.collection.count() if hasattr(self.episodic_memory, 'collection') else 0} episodic memories

System operational and ready."""
    
    def _format_memory_results(self, results: List[Dict]) -> str:
        """Format memory search results."""
        if not results:
            return "No memories found matching your query."
        
        formatted = [f"**Found {len(results)} memories:**\n"]
        
        for i, mem in enumerate(results, 1):
            formatted.append(
                f"{i}. **{mem['summary']}**\n"
                f"   Domain: {mem['domain']} | Event: {mem['event_type']}\n"
                f"   Trace ID: {mem['trace_id']}\n"
            )
        
        return "\n".join(formatted)
