"""
Misaka Cipher - Provider Manager
Orchestrates multi-provider failover and routing
"""

import yaml
import json
from pathlib import Path
from typing import Dict, List, Optional
from .base_provider import BaseProvider, ProviderResponse, ProviderConfig, ProviderStatus
from .google_provider import GoogleAIProvider
from .openai_provider import OpenAIProvider
from .grok_provider import GrokProvider
from utils.logger import get_logger

logger = get_logger(__name__)


class ProviderManager:
    """
    Manages multiple LLM providers with automatic failover.
    
    Priority: Google AI (Primary) → OpenAI (Fallback) → Grok (Tertiary)
    """
    
    PROVIDER_CLASSES = {
        'google_ai': GoogleAIProvider,
        'openai': OpenAIProvider,
        'grok': GrokProvider
    }
    
    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize provider manager.
        
        Args:
            config_path: Path to providers.yaml
        """
        self.providers: Dict[str, BaseProvider] = {}
        self.priority_order: List[str] = []
        self.config = {}
        
        # Load configuration
        if config_path is None:
            workspace = Path(__file__).parent.parent
            config_path = workspace / "config" / "providers.yaml"
        
        self._load_config(config_path)
        self._initialize_providers()
        
        logger.info("Provider Manager initialized with providers: " + 
                   ", ".join(self.priority_order))
    
    def _load_config(self, config_path: Path):
        """Load provider configuration from YAML."""
        with open(config_path, 'r') as f:
            data = yaml.safe_load(f)
            self.config = data.get('providers', {})
            self.failover_config = data.get('failover', {})
            
        # Load Overrides from model_registry.json
        self._load_registry_overrides()

    def _load_registry_overrides(self):
        """Load overrides from model_registry.json if present."""
        # Find registry file
        workspace = Path(__file__).parent.parent
        registry_path = workspace / "config" / "model_registry.json"
        
        if not registry_path.exists():
            return
            
        try:
            with open(registry_path, 'r') as f:
                registry = json.load(f)
            
            registry_providers = registry.get('providers', {})
            
            self.chat_priority_order = []
            self.agent_priority_order = []
            
            # Temporary lists for sorting
            chat_providers = []
            agent_providers = []
            
            self.model_to_provider_map = {}
            
            for name, reg_config in registry_providers.items():
                if name in self.config:
                    # Parse Chat Config
                    chat_config = reg_config.get('chat_config', {})
                    if chat_config.get('active', False):
                        chat_providers.append((name, chat_config.get('priority', 99)))
                        
                    # Parse Agent Config
                    agent_config = reg_config.get('agent_config', {})
                    if agent_config.get('active', False):
                        agent_providers.append((name, agent_config.get('priority', 99)))

                    # Build Model Map
                    models = reg_config.get('models', {})
                    for model_key, model_data in models.items():
                        model_id = model_data.get('id')
                        if model_id:
                            self.model_to_provider_map[model_id] = name

                    logger.info(f"Loaded registry overrides for {name}")
            
            # Sort and store
            chat_providers.sort(key=lambda x: x[1])
            self.chat_priority_order = [p[0] for p in chat_providers]
            
            agent_providers.sort(key=lambda x: x[1])
            self.agent_priority_order = [p[0] for p in agent_providers]
            
            logger.info(f"Chat Priority: {self.chat_priority_order}")
            logger.info(f"Agent Priority: {self.agent_priority_order}")
                    
        except Exception as e:
            logger.error(f"Failed to load model registry overrides: {str(e)}")
            # Fallback to default behavior if failed
            self.chat_priority_order = self.priority_order
            self.agent_priority_order = self.priority_order

    def _initialize_providers(self):
        """Initialize all providers (regardless of active status)."""
        # We need to initialize ALL providers so they can be used if specifically requested
        # even if they are not in the active priority lists.
        
        for name, config in self.config.items():
            try:
                # Initialize unless explicitly disabled in YAML (system level disable)
                # But for now, we trust YAML enabled flag as "system enabled"
                # and registry as "user enabled".
                # Actually, let's just initialize everything in config.
                
                provider_class = self.PROVIDER_CLASSES.get(name)
                if not provider_class:
                    logger.warning(f"Unknown provider: {name}")
                    continue
                
                provider_config = ProviderConfig(
                    name=config.get('name', name),
                    model=config.get('model'),
                    api_key=config.get('api_key_env', ''),
                    endpoint=config.get('endpoint', ''),
                    timeout=config.get('timeout', 30),
                    max_retries=config.get('max_retries', 3),
                    fallback_models=config.get('fallback_models', [])
                )
                
                self.providers[name] = provider_class(provider_config)
                # self.priority_order.append(name) # Legacy
                
                logger.info(f"Initialized provider: {name}")
                
            except Exception as e:
                logger.error(f"Failed to initialize provider {name}: {str(e)}")
    
    def get_provider(self, name: str) -> Optional[BaseProvider]:
        """
        Get a specific provider by name.
        
        Args:
            name: Provider name (google_ai, openai, grok)
            
        Returns:
            Provider instance or None if not found
        """
        return self.providers.get(name)
    
    def call_with_failover(
        self,
        prompt: str,
        trace_id: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        preferred_provider: Optional[str] = None,
        model: Optional[str] = None,
        request_type: str = "generation",
        **kwargs
    ) -> ProviderResponse:
        """
        Call providers with automatic failover.
        
        Args:
            prompt: Input prompt
            trace_id: Trace ID for this request
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            preferred_provider: Preferred provider to try first
            model: Specific model ID to use (overrides ALL routing)
            request_type: "generation" (Chat) or "agent_call" (Agent)
            **kwargs: Additional provider-specific parameters
            
        Returns:
            ProviderResponse from first successful provider
        """
        provider_order = []
        
        # 1. Specific Model Override
        if model and model != "auto":
            # Find which provider owns this model
            # This is a bit inefficient, we might want a reverse lookup map later.
            target_provider_name = None
            
            # Check registry first (if loaded)
            # We don't have direct access to registry dict here easily without reloading.
            # Let's check instantiated providers.
            pass # We'll do it inside loop or map it.
            
            # Temporary Hack: Hardcoded mapping or search?
            # Better: Provider classes should know their models?
            # Or we look at config.
            
            # Let's try to find provider for the model
            found_provider_name = None
            for p_name, p_instance in self.providers.items():
                # This check depends on provider implementation
                # BaseProvider doesn't have list of models.
                # But we can try to guess or use the registry if we cached it.
                # For now, let's look at `model_registry.json` again? No, too slow.
                # Let's assume we can pass the provider name if known, OR
                # we iterate all providers and see who claims it?
                pass

            # Update: The frontend sends model ID (e.g., 'gemini-2.0-flash').
            # We need to find the provider for this ID.
            # We'll reload registry map for lookup or cache it in __init__
            # For now, let's just cheat and look at known prefixes or reload registry lightly?
            # No, let's cache registry mapping in _load_registry_overrides.
            
            if hasattr(self, 'model_to_provider_map'):
                 target_provider_name = self.model_to_provider_map.get(model)
            
            if target_provider_name and target_provider_name in self.providers:
                provider_order = [target_provider_name]
                logger.info(f"[{trace_id}] Model '{model}' forced provider: {target_provider_name}")
            else:
                logger.warning(f"[{trace_id}] Model '{model}' not found in map, falling back to auto")
        
        # 2. Select Priority List based on Type
        if not provider_order:
            if request_type == "agent_call" or "agent" in request_type:
                provider_order = self.agent_priority_order.copy()
                logger.info(f"[{trace_id}] Using AGENT priority: {provider_order}")
            else:
                provider_order = self.chat_priority_order.copy()
                logger.info(f"[{trace_id}] Using CHAT priority: {provider_order}")
        
        # 3. Apply Preferred Provider (if valid and in order)
        if preferred_provider and preferred_provider in provider_order:
            provider_order.remove(preferred_provider)
            provider_order.insert(0, preferred_provider)
            
        last_error = None
        
        # Check if ALL providers in the order are OFFLINE - if so, reset them
        # This prevents permanent lockout from temporary failures
        all_offline = all(
            self.providers.get(name) and self.providers[name].status == ProviderStatus.OFFLINE
            for name in provider_order
            if self.providers.get(name)
        )
        if all_offline and provider_order:
            logger.warning(f"[{trace_id}] All providers are OFFLINE, resetting status to retry")
            for name in provider_order:
                provider = self.providers.get(name)
                if provider:
                    provider._consecutive_failures = 0
                    provider._status = ProviderStatus.HEALTHY
        
        # Try each provider in order
        for provider_name in provider_order:
            provider = self.providers.get(provider_name)
            if not provider:
                continue
            
            # Skip if provider is offline
            if provider.status == ProviderStatus.OFFLINE:
                logger.warning(f"[{trace_id}] Skipping offline provider: {provider_name}")
                continue
            
            logger.info(f"[{trace_id}] Attempting request with provider: {provider_name}")
            
            try:
                # If a specific model was requested, pass it
                current_model = model if (model and model != "auto") else None
                
                response = provider.generate(
                    prompt=prompt,
                    trace_id=trace_id,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    model=current_model, # Pass specific model if set
                    **kwargs
                )
                
                # Check if successful
                if response.success:
                    logger.info(f"[{trace_id}] Request successful with provider: {provider_name}")
                    
                    # Log usage
                    try:
                        from workspace.usage_tracker import get_usage_tracker
                        tracker = get_usage_tracker()
                        tracker.log_api_call(
                            provider=response.provider,
                            model=response.model,
                            prompt=prompt,
                            response_content=response.content,
                            trace_id=trace_id,
                            success=True,
                            metadata=response.metadata or {}
                        )
                    except Exception as usage_err:
                        logger.debug(f"[{trace_id}] Usage tracking failed (non-critical): {usage_err}")
                    
                    return response
                
                last_error = response.error
                logger.warning(f"[{trace_id}] Provider {provider_name} returned error: {last_error}")
                
            except Exception as e:
                last_error = str(e)
                logger.error(f"[{trace_id}] Provider {provider_name} raised exception: {last_error}")
        
        # All providers failed
        logger.error(f"[{trace_id}] All providers failed. Last error: {last_error}")
        
        return ProviderResponse(
            content="",
            model="none",
            provider="none",
            trace_id=trace_id,
            error=f"All providers failed. Last error: {last_error}"
        )
    
    def health_check_all(self) -> Dict[str, ProviderStatus]:
        """
        Run health checks on all providers.
        
        Returns:
            Dictionary of provider name to status
        """
        results = {}
        for name, provider in self.providers.items():
            status = provider.health_check()
            results[name] = status
            logger.info(f"Provider {name} status: {status.value}")
        
        return results
    
    def get_status_summary(self) -> Dict:
        """Get summary of all provider statuses."""
        return {
            'providers': {
                name: {
                    'status': provider.status.value,
                    'model': provider.config.model,
                    'is_healthy': provider.is_healthy
                }
                for name, provider in self.providers.items()
            },
            'chat_priority': getattr(self, 'chat_priority_order', []),
            'agent_priority': getattr(self, 'agent_priority_order', [])
        }

    def get_global_max_retries(self) -> int:
        """Get the maximum retries from the highest priority active provider."""
        # Check Agent priority first as this is usually called by Factory
        if hasattr(self, 'agent_priority_order') and self.agent_priority_order:
             primary = self.agent_priority_order[0]
             return self.config.get(primary, {}).get('max_retries', 3)
             
        if hasattr(self, 'chat_priority_order') and self.chat_priority_order:
             primary = self.chat_priority_order[0]
             return self.config.get(primary, {}).get('max_retries', 3)
             
        return 3
