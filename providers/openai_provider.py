"""
Misaka Cipher - OpenAI Provider
OpenAI GPT implementation (fallback provider)
"""

import os
from typing import Iterator, Optional
from openai import OpenAI
from .base_provider import BaseProvider, ProviderResponse, ProviderConfig
from utils.logger import get_logger

logger = get_logger(__name__)


class OpenAIProvider(BaseProvider):
    """
    OpenAI (GPT) provider implementation.
    
    First fallback provider for Misaka Cipher system.
    """
    
    def __init__(self, config: ProviderConfig):
        """Initialize OpenAI provider."""
        super().__init__(config)
        
        # Get API key
        api_key = os.getenv(config.api_key) if config.api_key.startswith('$') else config.api_key
        
        # Initialize client
        self.client = OpenAI(
            api_key=api_key,
            timeout=config.timeout
        )
        
        logger.info(f"Initialized OpenAI provider with model: {config.model}")
    
    def generate(
        self,
        prompt: str,
        trace_id: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> ProviderResponse:
        """Generate response using OpenAI."""
        try:
            logger.debug(f"[{trace_id}] Generating with OpenAI model {self.config.model}")
            
            # Build messages
            messages = [{"role": "user", "content": prompt}]
            
            # Generate response
            response = self.client.chat.completions.create(
                model=self.config.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )
            
            # Record success
            self.record_success()
            
            logger.info(f"[{trace_id}] Successfully generated response with OpenAI")
            
            return ProviderResponse(
                content=response.choices[0].message.content,
                model=self.config.model,
                provider="openai",
                trace_id=trace_id,
                metadata={
                    'finish_reason': response.choices[0].finish_reason,
                    'usage': {
                        'prompt_tokens': response.usage.prompt_tokens,
                        'completion_tokens': response.usage.completion_tokens,
                        'total_tokens': response.usage.total_tokens
                    }
                }
            )
            
        except Exception as e:
            logger.error(f"[{trace_id}] OpenAI generation failed: {str(e)}")
            self.record_failure()
            
            return ProviderResponse(
                content="",
                model=self.config.model,
                provider="openai",
                trace_id=trace_id,
                error=str(e)
            )
    
    def stream(
        self,
        prompt: str,
        trace_id: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Iterator[str]:
        """Stream response using OpenAI."""
        try:
            logger.debug(f"[{trace_id}] Streaming with OpenAI model {self.config.model}")
            
            # Build messages
            messages = [{"role": "user", "content": prompt}]
            
            # Stream response
            stream = self.client.chat.completions.create(
                model=self.config.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
                **kwargs
            )
            
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
            
            # Record success
            self.record_success()
            logger.info(f"[{trace_id}] Successfully streamed response with OpenAI")
            
        except Exception as e:
            logger.error(f"[{trace_id}] OpenAI streaming failed: {str(e)}")
            self.record_failure()
            yield f"Error: {str(e)}"
    
    def validate_credentials(self) -> bool:
        """Validate OpenAI API credentials."""
        try:
            # Try to list models as a validation check
            self.client.models.list()
            return True
        except Exception as e:
            logger.warning(f"OpenAI credential validation failed: {str(e)}")
            return False
