"""
Misaka Cipher - Base Agent
Abstract base class for all agents
"""

from abc import ABC, abstractmethod
from typing import Optional
from datetime import datetime
import time

from .agent_spec import AgentSpec
from .agent_result import AgentResult
from nexus_core import NexusCore, Request
from utils import get_logger, get_trace_manager


class BaseAgent(ABC):
    """
    Abstract base class for all Misaka Cipher agents.
    
    All agents must:
    - Follow Aethvion naming: [Domain]_[Action]_[Object]
    - Route all requests through Nexus Core
    - Execute statelessly (no persistent state between runs)
    - Clean up resources after execution
    """
    
    def __init__(self, spec: AgentSpec, nexus: NexusCore, trace_id: str):
        """
        Initialize agent.
        
        Args:
            spec: Agent specification
            nexus: NexusCore instance for routing requests
            trace_id: Unique Trace_ID for this agent
        """
        self.spec = spec
        self.nexus = nexus
        self.trace_id = trace_id
        self.name = spec.name
        
        # Execution state
        self.started_at = None
        self.completed_at = None
        self.iterations_count = 0
        
        # Logger
        self.logger = get_logger(f"factory.{self.name}")
        
        self.logger.info(f"[{self.trace_id}] Agent initialized: {self.name}")
    
    @abstractmethod
    def execute(self) -> AgentResult:
        """
        Execute agent task.
        
        Must be implemented by all agent subclasses.
        
        Returns:
            AgentResult with execution outcome
        """
        pass
    
    def call_nexus(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> str:
        """
        Make a request through Nexus Core.
        
        Args:
            prompt: Prompt to send
            temperature: Override temperature (uses spec default if None)
            max_tokens: Override max tokens (uses spec default if None)
            
        Returns:
            Response content from Nexus Core
        """
        self.logger.debug(f"[{self.trace_id}] Agent {self.name} calling Nexus Core")
        
        request = Request(
            prompt=prompt,
            request_type="agent_call",
            metadata={
                'agent_name': self.name,
                'agent_trace_id': self.trace_id,
                'iteration': self.iterations_count
            },
            temperature=temperature or self.spec.temperature,
            max_tokens=max_tokens or self.spec.max_tokens
        )
        
        response = self.nexus.route_request(request)
        
        if response.success:
            self.logger.debug(
                f"[{self.trace_id}] Agent {self.name} received response "
                f"(provider: {response.provider})"
            )
            return response.content
        else:
            self.logger.error(
                f"[{self.trace_id}] Agent {self.name} Nexus call failed: "
                f"{response.error}"
            )
            raise RuntimeError(f"Nexus Core request failed: {response.error}")
    
    def log(self, message: str, level: str = "info"):
        """
        Log a message with agent context.
        
        Args:
            message: Message to log
            level: Log level (debug, info, warning, error)
        """
        log_func = getattr(self.logger, level.lower(), self.logger.info)
        log_func(f"[{self.trace_id}] {self.name}: {message}")
    
    def run(self) -> AgentResult:
        """
        Run the agent with timing and error handling.
        
        Returns:
            AgentResult
        """
        self.started_at = datetime.now().isoformat()
        start_time = time.time()
        
        self.logger.info(f"[{self.trace_id}] Agent {self.name} starting execution")
        
        try:
            result = self.execute()
            duration = time.time() - start_time
            result.duration_seconds = duration
            
            self.logger.info(
                f"[{self.trace_id}] Agent {self.name} completed successfully "
                f"({duration:.2f}s, {result.iterations} iterations)"
            )
            
            return result
            
        except Exception as e:
            duration = time.time() - start_time
            self.logger.error(
                f"[{self.trace_id}] Agent {self.name} failed: {str(e)} "
                f"({duration:.2f}s)"
            )
            
            return AgentResult(
                content="",
                agent_name=self.name,
                trace_id=self.trace_id,
                success=False,
                started_at=self.started_at,
                duration_seconds=duration,
                error=str(e),
                iterations=self.iterations_count
            )
        
        finally:
            self.cleanup()
    
    def cleanup(self):
        """
        Clean up agent resources.
        
        Called automatically after execution.
        Override in subclasses if additional cleanup needed.
        """
        self.completed_at = datetime.now().isoformat()
        self.logger.debug(f"[{self.trace_id}] Agent {self.name} cleanup complete")
    
    def __str__(self) -> str:
        """String representation."""
        return f"{self.__class__.__name__}({self.name}, trace={self.trace_id})"
