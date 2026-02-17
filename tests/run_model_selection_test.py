"""
Tests for model selection logic with split chat/agent configurations.
Tests verify:
1. Priority list separation (chat vs agent)
2. Specific model override (even with disabled providers)
3. Request-type based routing
"""

import unittest
from unittest.mock import MagicMock, patch, mock_open
import sys
import os
import json

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from providers.provider_manager import ProviderManager, ProviderStatus, ProviderConfig
from providers.base_provider import ProviderResponse


class MockProvider:
    """A simple mock provider that returns predictable responses."""
    def __init__(self, config: ProviderConfig):
        self.name = config.name
        self.config = config
        self._status = ProviderStatus.HEALTHY
        self._consecutive_failures = 0
    
    @property
    def status(self):
        return self._status
    
    @property
    def is_healthy(self):
        return self._status == ProviderStatus.HEALTHY
    
    def generate(self, prompt, trace_id="", model=None, **kwargs):
        return ProviderResponse(
            content=f"Response from {self.name}",
            model=model or self.config.model or "default-model",
            provider=self.name,
            trace_id=trace_id,
            metadata={}
        )

    def health_check(self):
        return ProviderStatus.HEALTHY
    
    def record_success(self):
        self._consecutive_failures = 0
        self._status = ProviderStatus.HEALTHY
    
    def record_failure(self):
        self._consecutive_failures += 1


# Helper: create a pre-configured ProviderManager without real file I/O
def create_test_manager(yaml_providers, registry_data, provider_classes_map):
    """
    Creates a ProviderManager with mocked file I/O.
    
    Args:
        yaml_providers: dict of provider configs for the YAML (providers.yaml)
        registry_data: dict for the full model_registry.json content
        provider_classes_map: dict mapping provider name -> class (e.g. MockProvider)
    """
    yaml_content = {"providers": yaml_providers}
    
    # We need json.load to return registry_data and yaml.safe_load to return yaml_content
    with patch("yaml.safe_load", return_value=yaml_content), \
         patch("json.load", return_value=registry_data), \
         patch("builtins.open", mock_open()), \
         patch.dict(ProviderManager.PROVIDER_CLASSES, provider_classes_map, clear=True):
        
        manager = ProviderManager()
    
    return manager


class TestSplitConfiguration(unittest.TestCase):
    """Test that chat_config and agent_config create separate priority lists."""
    
    def test_split_priority_lists(self):
        """Provider A active for chat, Provider B active for agent."""
        yaml_providers = {
            "provider_a": {"name": "provider_a", "model": "model-a"},
            "provider_b": {"name": "provider_b", "model": "model-b"}
        }
        registry = {
            "providers": {
                "provider_a": {
                    "chat_config": {"active": True, "priority": 1},
                    "agent_config": {"active": False, "priority": 10},
                    "models": {"model-a": {"id": "model-a-v1"}}
                },
                "provider_b": {
                    "chat_config": {"active": False, "priority": 10},
                    "agent_config": {"active": True, "priority": 1},
                    "models": {"model-b": {"id": "model-b-v1"}}
                }
            },
            "routing_strategy": {}
        }
        
        manager = create_test_manager(yaml_providers, registry, {
            'provider_a': MockProvider,
            'provider_b': MockProvider
        })
        
        print(f"  Chat priority: {manager.chat_priority_order}")
        print(f"  Agent priority: {manager.agent_priority_order}")
        print(f"  Providers: {list(manager.providers.keys())}")
        
        # Chat: only Provider A should be active
        self.assertIn("provider_a", manager.chat_priority_order)
        self.assertNotIn("provider_b", manager.chat_priority_order)
        
        # Agent: only Provider B should be active
        self.assertIn("provider_b", manager.agent_priority_order)
        self.assertNotIn("provider_a", manager.agent_priority_order)
        
        # Both providers should be initialized (even inactive ones)
        self.assertIn("provider_a", manager.providers)
        self.assertIn("provider_b", manager.providers)
        
        print("  PASS OK")


class TestSpecificModelOverride(unittest.TestCase):
    """Test that specifying a model directly overrides active/priority settings."""
    
    def test_disabled_provider_with_specific_model(self):
        """A fully disabled provider should still respond if its model is explicitly selected."""
        yaml_providers = {
            "my_provider": {"name": "my_provider", "model": "default-model"}
        }
        registry = {
            "providers": {
                "my_provider": {
                    "chat_config": {"active": False, "priority": 99},
                    "agent_config": {"active": False, "priority": 99},
                    "models": {"special-model": {"id": "special-model-v1"}}
                }
            },
            "routing_strategy": {}
        }
        
        manager = create_test_manager(yaml_providers, registry, {
            'my_provider': MockProvider
        })
        
        print(f"  Chat priority: {manager.chat_priority_order}")
        print(f"  Providers: {list(manager.providers.keys())}")
        print(f"  Model map: {manager.model_to_provider_map}")
        
        # Provider should NOT be in any priority list
        self.assertNotIn("my_provider", manager.chat_priority_order)
        self.assertNotIn("my_provider", manager.agent_priority_order)
        
        # But model map should have the mapping
        self.assertEqual(
            manager.model_to_provider_map.get("special-model-v1"), 
            "my_provider"
        )
        
        # Provider should still be initialized
        self.assertIn("my_provider", manager.providers)
        
        # Call with specific model should work
        response = manager.call_with_failover(
            prompt="test",
            trace_id="test-override",
            model="special-model-v1"
        )
        
        self.assertEqual(response.provider, "my_provider")
        self.assertEqual(response.model, "special-model-v1")
        self.assertTrue(response.success)
        
        print("  PASS OK")


class TestRequestTypeRouting(unittest.TestCase):
    """Test that chat and agent requests use their respective priority lists."""
    
    def test_chat_uses_chat_priority(self):
        """Chat requests should use chat_priority_order."""
        yaml_providers = {
            "chat_prov": {"name": "chat_prov", "model": "chat-m"},
            "agent_prov": {"name": "agent_prov", "model": "agent-m"}
        }
        registry = {
            "providers": {
                "chat_prov": {
                    "chat_config": {"active": True, "priority": 1},
                    "agent_config": {"active": False, "priority": 99},
                    "models": {"cm": {"id": "chat-model-v1"}}
                },
                "agent_prov": {
                    "chat_config": {"active": False, "priority": 99},
                    "agent_config": {"active": True, "priority": 1},
                    "models": {"am": {"id": "agent-model-v1"}}
                }
            },
            "routing_strategy": {}
        }
        
        manager = create_test_manager(yaml_providers, registry, {
            'chat_prov': MockProvider,
            'agent_prov': MockProvider
        })
        
        print(f"  Chat priority: {manager.chat_priority_order}")
        print(f"  Agent priority: {manager.agent_priority_order}")
        print(f"  Providers: {list(manager.providers.keys())}")
        
        # Chat request should use chat_prov
        chat_resp = manager.call_with_failover(
            prompt="test",
            trace_id="t-chat",
            request_type="generation"
        )
        self.assertEqual(chat_resp.provider, "chat_prov")
        
        # Agent request should use agent_prov
        agent_resp = manager.call_with_failover(
            prompt="test",
            trace_id="t-agent",
            request_type="agent_call"
        )
        self.assertEqual(agent_resp.provider, "agent_prov")
        
        print("  PASS OK")


class TestModelToProviderMap(unittest.TestCase):
    """Test that the model-to-provider map is correctly built."""
    
    def test_model_map_populated(self):
        """All models from all providers should be in the map."""
        yaml_providers = {
            "prov_x": {"name": "prov_x", "model": "x-default"},
            "prov_y": {"name": "prov_y", "model": "y-default"}
        }
        registry = {
            "providers": {
                "prov_x": {
                    "chat_config": {"active": True, "priority": 1},
                    "agent_config": {"active": True, "priority": 2},
                    "models": {
                        "model-x1": {"id": "x1-id"},
                        "model-x2": {"id": "x2-id"}
                    }
                },
                "prov_y": {
                    "chat_config": {"active": True, "priority": 2},
                    "agent_config": {"active": True, "priority": 1},
                    "models": {
                        "model-y1": {"id": "y1-id"}
                    }
                }
            },
            "routing_strategy": {}
        }
        
        manager = create_test_manager(yaml_providers, registry, {
            'prov_x': MockProvider,
            'prov_y': MockProvider
        })
        
        print(f"  Model map: {manager.model_to_provider_map}")
        
        self.assertEqual(manager.model_to_provider_map["x1-id"], "prov_x")
        self.assertEqual(manager.model_to_provider_map["x2-id"], "prov_x")
        self.assertEqual(manager.model_to_provider_map["y1-id"], "prov_y")
        
        print("  PASS OK")


if __name__ == "__main__":
    print("=" * 60)
    print("  Model Selection Test Suite")
    print("=" * 60)
    unittest.main(verbosity=2)
