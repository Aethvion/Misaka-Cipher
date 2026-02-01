"""
Misaka Cipher - Generic Agent
Default implementation of BaseAgent for general-purpose tasks
"""

from datetime import datetime
from .base_agent import BaseAgent
from .agent_result import AgentResult


class GenericAgent(BaseAgent):
    """
    Generic agent for general-purpose tasks.
    
    Executes a single prompt from the context and returns the result.
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
        if instructions:
            prompt = f"{instructions}\n\n{prompt}"
        
        self.log(f"Executing prompt (length: {len(prompt)} chars)")
        
        try:
            # Call Nexus Core
            self.iterations_count = 1
            response = self.call_nexus(prompt)
            
            self.log(f"Received response (length: {len(response)} chars)")
            
            return AgentResult(
                content=response,
                agent_name=self.name,
                trace_id=self.trace_id,
                success=True,
                started_at=started_at,
                iterations=self.iterations_count,
                metadata={
                    'prompt_length': len(prompt),
                    'response_length': len(response)
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
