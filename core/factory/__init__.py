"""
Misaka Cipher - Factory Package
Agent spawning and lifecycle management
"""

from .agent_spec import AgentSpec
from .agent_result import AgentResult
from .base_agent import BaseAgent
from .generic_agent import GenericAgent
from .agent_registry import AgentRegistry, get_agent_registry
from .agent_factory import AgentFactory
from .agent_templates import AgentTemplates, get_template

__all__ = [
    # Specifications
    'AgentSpec',
    'AgentResult',
    
    # Base Classes
    'BaseAgent',
    'GenericAgent',
    
    # Registry
    'AgentRegistry',
    'get_agent_registry',
    
    # Factory
    'AgentFactory',
    
    # Templates
    'AgentTemplates',
    'get_template',
]
