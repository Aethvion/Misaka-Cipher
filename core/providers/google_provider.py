"""
Misaka Cipher - Google AI Provider
Google Generative AI (Gemini) implementation
"""

import os
from typing import Iterator, Optional
from google import genai
from google.genai import types
from .base_provider import BaseProvider, ProviderResponse, ProviderConfig
from core.utils.logger import get_logger

logger = get_logger(__name__)


class GoogleAIProvider(BaseProvider):
    """
    Google AI (Gemini) provider implementation.
    
    Primary provider for Misaka Cipher system.
    """
    
    def __init__(self, config: ProviderConfig):
        """Initialize Google AI provider."""
        super().__init__(config)
        
        # Configure API - read from environment variable
        api_key = os.getenv(config.api_key, config.api_key)
        if not api_key:
            logger.error(f"Google AI API key not found in environment: {config.api_key}")
        
        # New SDK uses a client-based approach
        self.client = genai.Client(api_key=api_key)
        
        logger.info(f"Initialized Google AI provider with model: {config.model}")
    
    def generate(
        self,
        prompt: str,
        trace_id: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        model: Optional[str] = None,
        **kwargs
    ) -> ProviderResponse:
        """Generate response using Google AI."""
        try:
            active_model = model if model else self.config.model
            logger.debug(f"[{trace_id}] Generating with Google AI model {active_model}")
            
            # Extract system prompt if provided
            system_prompt = kwargs.pop('system_prompt', None)
            
            # Configure generation
            config_params = {
                'temperature': temperature,
            }
            if max_tokens:
                config_params['max_output_tokens'] = max_tokens
            if system_prompt:
                config_params['system_instruction'] = system_prompt
            
            # Remove unsupported kwargs
            kwargs.pop('json_mode', None)
            kwargs.pop('model', None)

            # Generate response via client
            response = self.client.models.generate_content(
                model=active_model,
                contents=prompt,
                config=types.GenerateContentConfig(**config_params)
            )
            
            # Record success
            self.record_success()
            
            logger.info(f"[{trace_id}] Successfully generated response with Google AI")
            
            # Extract usage
            usage_meta = {
                'prompt_token_count': response.usage_metadata.prompt_token_count if response.usage_metadata else None,
                'candidates_token_count': response.usage_metadata.candidates_token_count if response.usage_metadata else None,
                'total_tokens': response.usage_metadata.total_token_count if response.usage_metadata else None
            } if hasattr(response, 'usage_metadata') and response.usage_metadata else {}

            return ProviderResponse(
                content=response.text,
                model=active_model,
                provider="google_ai",
                trace_id=trace_id,
                metadata={
                    'model': active_model,
                    'finish_reason': response.candidates[0].finish_reason if response.candidates else None,
                    'usage': usage_meta
                }
            )
            
        except Exception as e:
            logger.error(f"[{trace_id}] Google AI generation failed: {str(e)}")
            self.record_failure()
            
            return ProviderResponse(
                content="",
                model=self.config.model,
                provider="google_ai",
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
        """Stream response using Google AI."""
        try:
            logger.debug(f"[{trace_id}] Streaming with Google AI model {self.config.model}")
            
            # Configure generation
            config_params = {
                'temperature': temperature,
            }
            if max_tokens:
                config_params['max_output_tokens'] = max_tokens
            
            # Stream response
            response = self.client.models.generate_content_stream(
                model=self.config.model,
                contents=prompt,
                config=types.GenerateContentConfig(**config_params)
            )
            
            for chunk in response:
                if chunk.text:
                    yield chunk.text
            
            # Record success
            self.record_success()
            logger.info(f"[{trace_id}] Successfully streamed response with Google AI")
            
        except Exception as e:
            logger.error(f"[{trace_id}] Google AI streaming failed: {str(e)}")
            self.record_failure()
            yield f"Error: {str(e)}"
    
    def validate_credentials(self) -> bool:
        """Validate Google AI API credentials."""
        try:
            # Try to list models as a validation check
            self.client.models.list(config={'page_size': 1})
            return True
        except Exception as e:
            logger.warning(f"Google AI credential validation failed: {str(e)}")
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
        """Generate image using Google AI."""
        try:
            active_model = model if model else "imagen-3.0-generate-002"
            logger.debug(f"[{trace_id}] Generating image with Google AI model {active_model}")

            aspect_ratio = kwargs.get('aspect_ratio', '1:1')

            # Generate via new SDK
            response = self.client.models.generate_image(
                model=active_model,
                prompt=prompt,
                config=types.GenerateImageConfig(
                    number_of_images=n,
                    aspect_ratio=aspect_ratio,
                    safety_filter="BLOCK_ONLY_HIGH"
                )
            )
            
            import io
            image_bytes_list = []
            for img in response.generated_images:
                image_bytes_list.append(img.image.image_bytes)

            self.record_success()
            logger.info(f"[{trace_id}] Successfully generated {len(image_bytes_list)} images with Google AI")

            return ProviderResponse(
                content=f"Generated {len(image_bytes_list)} images",
                model=active_model,
                provider="google_ai",
                trace_id=trace_id,
                metadata={
                    'images': image_bytes_list,
                    'format': 'png'
                }
            )

        except Exception as e:
            logger.error(f"[{trace_id}] Google AI image generation failed: {str(e)}")
            self.record_failure()
            return ProviderResponse(
                content="",
                model=active_model,
                provider="google_ai",
                trace_id=trace_id,
                error=str(e)
            )
