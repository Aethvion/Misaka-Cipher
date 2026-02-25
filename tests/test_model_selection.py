
import pytest
import asyncio
from unittest.mock import MagicMock, patch
from core.providers.provider_manager import ProviderManager, ProviderStatus, ProviderConfig
from core.nexus_core import Request

# Mock classes for testing
class MockProvider:
    def __init__(self, config: ProviderConfig):
        self.name = config.name
        self.config = config
        self.status = ProviderStatus.ONLINE # Needs to be ONLINE for selection
        self.is_healthy = True
    
    async def generate(self, prompt, model=None, **kwargs):
        return MagicMock(
            success=True,
            content=f"Response from {self.name} using model {model}", 
            model=model, 
            provider=self.name,
            metadata={}
        )

    def health_check(self):
        return ProviderStatus.ONLINE

@pytest.mark.asyncio
async def test_provider_initialization_with_split_config():
    """Test that provider manager initializes with split chat/agent configs."""
    
    # Mock providers.yaml content (Base config)
    mock_yaml_config = {
        "providers": {
            "provider_a": {"name": "provider_a"},
            "provider_b": {"name": "provider_b"}
        }
    }

    # Mock model_registry.json content (Overrides)
    mock_registry = {
        "providers": {
            "provider_a": {
                "active": False,
                "chat_config": {"active": True, "priority": 1},
                "agent_config": {"active": False, "priority": 10},
                "models": {"model-a": "a-1"}
            },
            "provider_b": {
                "active": False,
                "chat_config": {"active": False, "priority": 10},
                "agent_config": {"active": True, "priority": 1},
                "models": {"model-b": "b-1"}
            }
        },
        "routing_strategy": {}
    }
    
    with patch("yaml.safe_load", return_value=mock_yaml_config), \
         patch("json.load", return_value=mock_registry), \
         patch("builtins.open", MagicMock()), \
         patch.object(ProviderManager, 'PROVIDER_CLASSES', {
             'provider_a': MockProvider,
             'provider_b': MockProvider
         }):
        
        manager = ProviderManager()
        
        # Chat: Provider A (P1) > Provider B (Inactive/P10)
        assert "provider_a" in manager.chat_priority_order
        assert "provider_b" not in manager.chat_priority_order
        
        # Agent: Provider B (P1) > Provider A (Inactive/P10)
        assert "provider_b" in manager.agent_priority_order
        assert "provider_a" not in manager.agent_priority_order

@pytest.mark.asyncio
async def test_specific_model_override():
    """Test that specific model selection overrides partial active state."""
    
    mock_yaml_config = {
        "providers": {
            "provider_disabled": {"name": "provider_disabled"}
        }
    }

    mock_registry = {
        "providers": {
            "provider_disabled": {
                "active": False,
                "chat_config": {"active": False, "priority": 99},
                "agent_config": {"active": False, "priority": 99},
                "models": {"disabled-model": "disabled-1"}
            }
        },
        "routing_strategy": {}
    }
    
    with patch("yaml.safe_load", return_value=mock_yaml_config), \
         patch("json.load", return_value=mock_registry), \
         patch("builtins.open", MagicMock()), \
         patch.object(ProviderManager, 'PROVIDER_CLASSES', {
             'provider_disabled': MockProvider
         }):
        
        manager = ProviderManager()
        
        # Verify it's NOT in priority lists
        assert "provider_disabled" not in manager.chat_priority_order
        
        # Verify model map
        assert manager.model_to_provider_map.get("disabled-1") == "provider_disabled"
        
        # Test Call with specific model
        response = await manager.call_with_failover(
            prompt="test",
            trace_id="test-id",
            model="disabled-1"
        )
        
        assert response.provider == "provider_disabled"
        assert response.model == "disabled-1"

@pytest.mark.asyncio
async def test_chat_vs_agent_routing():
    """Test that requests are routed based on request_type."""
    
    mock_yaml_config = {
        "providers": {
            "chat_provider": {"name": "chat_provider"},
            "agent_provider": {"name": "agent_provider"}
        }
    }

    mock_registry = {
        "providers": {
            "chat_provider": {
                "chat_config": {"active": True, "priority": 1},
                "agent_config": {"active": False, "priority": 99},
                "models": {"chat-model": "c-1"}
            },
            "agent_provider": {
                "chat_config": {"active": False, "priority": 99},
                "agent_config": {"active": True, "priority": 1},
                "models": {"agent-model": "a-1"}
            }
        },
        "routing_strategy": {}
    }
    
    with patch("yaml.safe_load", return_value=mock_yaml_config), \
         patch("json.load", return_value=mock_registry), \
         patch("builtins.open", MagicMock()), \
         patch.object(ProviderManager, 'PROVIDER_CLASSES', {
             'chat_provider': MockProvider,
             'agent_provider': MockProvider
         }):
        
        manager = ProviderManager()
        
        # Test Chat Request
        # Should pick chat_provider
        chat_response = await manager.call_with_failover(
            prompt="test",
            trace_id="t1",
            request_type="generation" 
        )
        assert chat_response.provider == "chat_provider"
        
        # Test Agent Request
        # Should pick agent_provider
        agent_response = await manager.call_with_failover(
            prompt="test",
            trace_id="t2",
            request_type="agent_call"
        )
        assert agent_response.provider == "agent_provider"
