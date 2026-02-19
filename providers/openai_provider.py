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
        
        # Get API key - read from environment variable
        api_key = os.getenv(config.api_key, config.api_key)
        if not api_key:
            logger.warning(f"OpenAI API key not found in environment: {config.api_key}")
        
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
        model: Optional[str] = None,
        **kwargs
    ) -> ProviderResponse:
        """Generate response using OpenAI."""
        try:
            # Use explicit model override or fall back to config
            active_model = model if model else self.config.model
            logger.debug(f"[{trace_id}] Generating with OpenAI model {active_model}")
            
            # Build messages
            messages = [{"role": "user", "content": prompt}]
            
            # Remove 'model' from kwargs if present to avoid duplicate
            kwargs.pop('model', None)
            
            # Generate response
            response = self.client.chat.completions.create(
                model=active_model,
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
                model=active_model,
                provider="openai",
                trace_id=trace_id,
                metadata={
                    'model': active_model,
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
                model=active_model,
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
            return False

    def generate_image(
        self,
        prompt: str,
        trace_id: str,
        model: Optional[str] = None,
        n: int = 1,
        size: str = "1024x1024",
        quality: str = "standard",
        **kwargs
    ) -> ProviderResponse:
        """Generate image using OpenAI."""
        try:
            active_model = model if model else "dall-e-3"
            logger.debug(f"[{trace_id}] Generating image with OpenAI model {active_model}")

            # Generate
            # DALL-E 3 requires specific sizes, 1024x1024 is standard.
            # quality: standard or hd
            
            # Map size from app.js '1024x1024' to API inputs
            # OpenAI API takes 'size' param directly.
            
            response = self.client.images.generate(
                model=active_model,
                prompt=prompt,
                n=n,
                size=size,
                quality=quality,
                response_format="b64_json",
                user=trace_id
            )
            
            import base64
            image_bytes_list = []
            for img_data in response.data:
                if img_data.b64_json:
                    image_bytes_list.append(base64.b64decode(img_data.b64_json))
            
            self.record_success()
            logger.info(f"[{trace_id}] Successfully generated {len(image_bytes_list)} images with OpenAI")

            return ProviderResponse(
                content=f"Generated {len(image_bytes_list)} images",
                model=active_model,
                provider="openai",
                trace_id=trace_id,
                metadata={
                    'images': image_bytes_list,
                    'format': 'png' # OpenAI returns PNG by default for b64_json
                }
            )

        except Exception as e:
            logger.error(f"[{trace_id}] OpenAI image generation failed: {str(e)}")
            self.record_failure()
            return ProviderResponse(
                content="",
                model=active_model,
                provider="openai",
                trace_id=trace_id,
                error=str(e)
            )
