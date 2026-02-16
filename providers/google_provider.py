"""
Misaka Cipher - Google AI Provider
Google Generative AI (Gemini) implementation
"""

import os
from typing import Iterator, Optional
import google.generativeai as genai
from .base_provider import BaseProvider, ProviderResponse, ProviderConfig
from utils.logger import get_logger

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
        
        genai.configure(api_key=api_key)
        
        # Initialize model
        self.model = genai.GenerativeModel(config.model)
        
        logger.info(f"Initialized Google AI provider with model: {config.model}")
    
    def generate(
        self,
        prompt: str,
        trace_id: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> ProviderResponse:
        """Generate response using Google AI."""
        try:
            logger.debug(f"[{trace_id}] Generating with Google AI model {self.config.model}")
            
            # Configure generation
            generation_config = {
                'temperature': temperature,
            }
            if max_tokens:
                generation_config['max_output_tokens'] = max_tokens
            
            # Generate response
            response = self.model.generate_content(
                prompt,
                generation_config=generation_config,
                **kwargs
            )
            
            # Record success
            self.record_success()
            
            logger.info(f"[{trace_id}] Successfully generated response with Google AI")
            
            return ProviderResponse(
                content=response.text,
                model=self.config.model,
                provider="google_ai",
                trace_id=trace_id,
                metadata={
                    'finish_reason': response.candidates[0].finish_reason.name if response.candidates else None,
                    'safety_ratings': [
                        {
                            'category': rating.category.name,
                            'probability': rating.probability.name
                        }
                        for rating in response.candidates[0].safety_ratings
                    ] if response.candidates else [],
                    'usage': {
                        'prompt_token_count': getattr(response.usage_metadata, 'prompt_token_count', None),
                        'candidates_token_count': getattr(response.usage_metadata, 'candidates_token_count', None),
                        'total_tokens': getattr(response.usage_metadata, 'total_token_count', None)
                    } if hasattr(response, 'usage_metadata') and response.usage_metadata else {}
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
            generation_config = {
                'temperature': temperature,
            }
            if max_tokens:
                generation_config['max_output_tokens'] = max_tokens
            
            # Stream response
            response = self.model.generate_content(
                prompt,
                generation_config=generation_config,
                stream=True,
                **kwargs
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
            list(genai.list_models())
            return True
        except Exception as e:
            logger.warning(f"Google AI credential validation failed: {str(e)}")
            return False
