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
from core.utils.logger import get_logger

logger = get_logger(__name__)


class ProviderManager:
    """
    Manages multiple LLM providers with profile-based routing.
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
        self.model_to_provider_map: Dict[str, str] = {}
        self.model_descriptor_map: Dict[str, Dict] = {}
        self.auto_routing_config: Dict = {}
        
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
            
            self.model_to_provider_map = {}
            
            for name, reg_config in registry_providers.items():
                if name in self.config:
                    # Build Model Map (model_id -> provider_name)
                    models = reg_config.get('models', {})
                    for model_id, model_data in models.items():
                        if model_id:
                            self.model_to_provider_map[model_id] = name
                            # Also store full descriptor for Auto routing
                            self.model_descriptor_map[model_id] = {
                                'provider': name,
                                'description': model_data.get('description', '') if isinstance(model_data, dict) else '',
                                'capabilities': model_data.get('capabilities', []) if isinstance(model_data, dict) else [],
                            }

                    logger.info(f"Loaded registry models for {name}")
            
            # Load Profiles
            profiles = registry.get('profiles', {})
            chat_profiles = profiles.get('chat_profiles', {})
            agent_profiles = profiles.get('agent_profiles', {})
            
            # Default profiles
            self.chat_priority_order = chat_profiles.get('default', [])
            self.agent_priority_order = agent_profiles.get('default', [])

            # Load Auto Routing config — seed from model_descriptor_map if not yet configured
            raw_auto = registry.get('auto_routing', {})
            if raw_auto:
                self.auto_routing_config = raw_auto
            else:
                # Auto-seed: all chat-capable models enabled, first chat model as picker
                chat_models = [
                    mid for mid, info in self.model_descriptor_map.items()
                    if 'chat' in info.get('capabilities', [])
                ]
                default_picker = chat_models[0] if chat_models else ''
                seeded_pool = {mid: {'enabled': True} for mid in chat_models}
                self.auto_routing_config = {
                    'chat': {'route_picker': default_picker, 'models': seeded_pool},
                    'agent': {'route_picker': default_picker, 'models': seeded_pool},
                }
                logger.info(f"[AUTO ROUTING] No config found — seeded {len(chat_models)} models, picker: '{default_picker}'")

            logger.info(f"Chat Priority: {self.chat_priority_order}")
            logger.info(f"Agent Priority: {self.agent_priority_order}")
                    
        except Exception as e:
            logger.error(f"Failed to load model registry overrides: {str(e)}")
            # Fallback to default behavior if failed
            self.chat_priority_order = []
            self.agent_priority_order = []
            self.model_descriptor_map = {}
            self.auto_routing_config = {}

    def reload_config(self):
        """Reload configuration from disk and update active providers."""
        logger.info("Reloading provider configuration...")
        
        # 1. Reload registry overrides (Priorities, Model Maps)
        self._load_registry_overrides()
        
        # 2. Update active provider instances with new config
        workspace = Path(__file__).parent.parent
        registry_path = workspace / "config" / "model_registry.json"
        
        if not registry_path.exists():
            return
            
        try:
            with open(registry_path, 'r') as f:
                registry = json.load(f)
            
            for name, reg_config in registry.get('providers', {}).items():
                if name in self.providers:
                    provider = self.providers[name]
                    
                    # Update Max Retries
                    if 'retries_per_step' in reg_config:
                        provider.config.max_retries = int(reg_config['retries_per_step'])
                        logger.debug(f"Updated {name} max_retries to {provider.config.max_retries}")
                        
                    # We could also update specific model configs here if we tracked them per-provider
                    
            logger.info("Provider configuration reload complete")
            
        except Exception as e:
            logger.error(f"Failed to reload provider config: {e}")

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
                    fallback_models=config.get('fallback_models', [])
                )
                
                self.providers[name] = provider_class(provider_config)
                
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
        source: str = "chat",
        **kwargs
    ) -> ProviderResponse:
        """
        Call providers with automatic failover and profile-based routing.
        """
        model_order = []
        is_agent = request_type == "agent_call" or "agent" in request_type

        # Extract auto-routing metadata placeholder (set later if AUTO mode runs)
        auto_routing_meta: dict = {}

        # 1. Profile Routing & Specific Models
        if model:
            if model == "auto":
                # Description-aware Auto Complexity Routing using configured profile
                logger.info(f"[{trace_id}] AUTO mode: description-aware routing")

                profile_type = 'agent' if is_agent else 'chat'
                auto_profile = self.auto_routing_config.get(profile_type, {})

                # Build candidate pool from enabled models in auto_routing config
                pool_config = auto_profile.get('models', {})
                if pool_config:
                    candidate_pool = [
                        mid for mid, cfg in pool_config.items()
                        if cfg.get('enabled', True) and mid in self.model_to_provider_map
                    ]
                else:
                    # Fallback: use default profile order
                    candidate_pool = (
                        self.agent_priority_order.copy() if is_agent
                        else self.chat_priority_order.copy()
                    )

                if not candidate_pool:
                    logger.warning(f"[{trace_id}] AUTO: no enabled models in pool, using full descriptor map")
                    candidate_pool = [
                        mid for mid, info in self.model_descriptor_map.items()
                        if 'chat' in info.get('capabilities', [])
                    ]

                # Configured route picker (falls back to first candidate)
                configured_picker = auto_profile.get('route_picker', '')
                route_picker = configured_picker if configured_picker in self.model_to_provider_map else (
                    candidate_pool[0] if candidate_pool else None
                )

                # Build descriptor lines
                descriptor_lines = []
                for mid in candidate_pool:
                    info = self.model_descriptor_map.get(mid, {})
                    desc = info.get('description', '').strip()
                    descriptor_lines.append(f"- {mid}: {desc}" if desc else f"- {mid}")

                chosen = None
                routing_reason = ''
                if route_picker and len(candidate_pool) > 1 and any(': ' in l for l in descriptor_lines):
                    routing_prompt = (
                        f"You are a model router. The user wants to send a message to the best-fit AI model.\n"
                        f"Select the single best model from the list below for the user's message.\n"
                        f"You may also use natural language hints in the message like 'use the most complex model', "
                        f"'use a claude model', or 'use the fastest model' — respect those if present.\n"
                        f"Return ONLY valid JSON with exactly two fields, no markdown, no code fences:\n"
                        f"{{\"model\": \"<exact_model_id_from_list>\", \"reason\": \"<one sentence why>\"}}\n\n"
                        f"Available models:\n" + "\n".join(descriptor_lines) + "\n\n"
                        f"User message (first 800 chars): {prompt[:800]}"
                    )
                    try:
                        routing_response = self.call_with_failover(
                            prompt=routing_prompt,
                            trace_id=f"{trace_id}-router",
                            temperature=0.0,
                            model=route_picker,
                            request_type="generation",
                            source="auto_router"
                        )
                        if routing_response.success:
                            raw_content = routing_response.content.strip()
                            # Try JSON parse first
                            try:
                                import json as _json
                                parsed = _json.loads(raw_content)
                                raw_model = str(parsed.get('model', '')).strip().strip('"').split()[0]
                                routing_reason = str(parsed.get('reason', '')).strip()
                            except Exception:
                                # Fallback: treat as plain model ID string
                                raw_model = raw_content.strip('\"').strip("'").split()[0]
                                routing_reason = ''
                            if raw_model in candidate_pool:
                                chosen = raw_model
                                logger.info(f"[{trace_id}] AUTO router ({route_picker}) chose: '{chosen}' reason: '{routing_reason}'")
                            else:
                                logger.warning(f"[{trace_id}] Router returned unknown model '{raw_model}', using pool order")
                        else:
                            logger.warning(f"[{trace_id}] Router call failed, using pool order")
                    except Exception as router_err:
                        logger.error(f"[{trace_id}] Router exception: {router_err}")

                if chosen:
                    model_order = [chosen] + [m for m in candidate_pool if m != chosen]
                else:
                    model_order = candidate_pool

                # Capture routing metadata as a local (NOT in kwargs — would leak to provider.generate)
                auto_routing_meta = {
                    'route_picker': route_picker or '',
                    'routed_to': chosen or (candidate_pool[0] if candidate_pool else ''),
                    'routing_reason': routing_reason,
                }

            
            elif model.startswith("profile:"):
                # Profile selected from UI dropdown (e.g., profile:chat:default)
                parts = model.split(":")
                if len(parts) >= 3:
                    p_type, p_name = parts[1], parts[2]
                    profiles = {}
                    if hasattr(self, 'registry') and isinstance(self.registry, dict):
                        profiles = self.registry.get('profiles', {})
                    
                    target_dict = profiles.get(f"{p_type}_profiles", {})
                    if p_name in target_dict:
                        model_order = target_dict[p_name].copy()
                        logger.info(f"[{trace_id}] Using Profile '{p_name}' ({p_type}): {model_order}")
                    else:
                        logger.warning(f"[{trace_id}] Requested profile '{p_name}' not found. Falling back to default.")
            else:
                # Specific Model Override
                model_order = [model]
                logger.info(f"[{trace_id}] Specific Model requested: {model}")
        
        # 2. Select Default Priority List if nothing else matched
        if not model_order:
            if is_agent:
                model_order = self.agent_priority_order.copy()
                logger.info(f"[{trace_id}] Using DEFAULT AGENT priority: {model_order}")
            else:
                model_order = self.chat_priority_order.copy()
                logger.info(f"[{trace_id}] Using DEFAULT CHAT priority: {model_order}")
        
        # Ensure we have something
        if not model_order:
             logger.error(f"[{trace_id}] CRITICAL: No model routing order could be established.")
             return ProviderResponse(
                 content="", model="none", provider="none", trace_id=trace_id, 
                 error="No model routing configured."
             )

        last_error = None
        
        # Check if ALL mapped providers in the order are OFFLINE - if so, reset them
        # This prevents permanent lockout from temporary failures
        mapped_providers = [
            self.model_to_provider_map.get(m) for m in model_order 
            if hasattr(self, 'model_to_provider_map')
        ]
        
        all_offline = all(
            self.providers.get(name) and self.providers[name].status == ProviderStatus.OFFLINE
            for name in mapped_providers
            if name
        )
        if all_offline and mapped_providers:
            logger.warning(f"[{trace_id}] All requested providers are OFFLINE, resetting status to retry")
            for name in mapped_providers:
                if not name: continue
                provider = self.providers.get(name)
                if provider:
                    provider._consecutive_failures = 0
                    provider._status = ProviderStatus.HEALTHY
        
        # Try each model in order
        for model_id in model_order:
            target_provider_name = None
            if hasattr(self, 'model_to_provider_map'):
                target_provider_name = self.model_to_provider_map.get(model_id)
            
            if not target_provider_name:
                logger.warning(f"[{trace_id}] Skipping model '{model_id}', no mapped provider found.")
                continue
                
            provider = self.providers.get(target_provider_name)
            if not provider:
                continue
            
            # Skip if provider is offline
            if provider.status == ProviderStatus.OFFLINE:
                logger.warning(f"[{trace_id}] Skipping offline provider: {target_provider_name}")
                continue
            
            logger.info(f"[{trace_id}] Attempting request with model: {model_id} via {target_provider_name}")
            
            try:
                response = provider.generate(
                    prompt=prompt,
                    trace_id=trace_id,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    model=model_id, # Pass specific model
                    **kwargs
                )
                
                # Check if successful
                if response.success:
                    logger.info(f"[{trace_id}] Request successful with provider: {target_provider_name}")

                    # Log usage
                    try:
                        from core.workspace.usage_tracker import get_usage_tracker
                        tracker = get_usage_tracker()
                        # Attach auto-routing metadata if this was an AUTO routed call
                        log_meta = {**(response.metadata or {}), **auto_routing_meta}
                        if auto_routing_meta:
                            log_meta['routed_model'] = model_id
                        tracker.log_api_call(
                            provider=response.provider,
                            model=response.model,
                            prompt=prompt,
                            response_content=response.content,
                            trace_id=trace_id,
                            success=True,
                            metadata=log_meta,
                            source=source
                        )
                    except Exception as usage_err:
                        logger.debug(f"[{trace_id}] Usage tracking failed (non-critical): {usage_err}")

                    return response
                
                last_error = response.error
                logger.warning(f"[{trace_id}] Provider {target_provider_name} returned error: {last_error}")
                
            except Exception as e:
                last_error = str(e)
                logger.error(f"[{trace_id}] Provider {target_provider_name} raised exception: {last_error}")
        
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

