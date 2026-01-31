"""
Misaka Cipher - Provider Manager
Orchestrates multi-provider failover and routing
"""

import yaml
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
    
    def _initialize_providers(self):
        """Initialize all enabled providers."""
        # Sort providers by priority
        provider_list = [
            (name, config)
            for name, config in self.config.items()
            if config.get('enabled', False)
        ]
        provider_list.sort(key=lambda x: x[1].get('priority', 999))
        
        # Initialize each provider
        for name, config in provider_list:
            try:
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
                self.priority_order.append(name)
                
                logger.info(f"Initialized provider: {name} (priority {config.get('priority')})")
                
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
            **kwargs: Additional provider-specific parameters
            
        Returns:
            ProviderResponse from first successful provider
        """
        # Determine provider order
        provider_order = self.priority_order.copy()
        
        # If preferred provider specified, try it first
        if preferred_provider and preferred_provider in provider_order:
            provider_order.remove(preferred_provider)
            provider_order.insert(0, preferred_provider)
        
        last_error = None
        
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
                response = provider.generate(
                    prompt=prompt,
                    trace_id=trace_id,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    **kwargs
                )
                
                # Check if successful
                if response.success:
                    logger.info(f"[{trace_id}] Request successful with provider: {provider_name}")
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
            'priority_order': self.priority_order
        }
