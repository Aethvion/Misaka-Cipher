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
        model: Optional[str] = None,
        **kwargs
    ) -> ProviderResponse:
        """Generate response using Google AI."""
        try:
            # For Google AI, the model is bound at init time via genai.GenerativeModel.
            # The model param is accepted to prevent kwargs conflicts.
            active_model = model if model else self.config.model
            logger.debug(f"[{trace_id}] Generating with Google AI model {active_model}")
            
            # Extract system prompt if provided
            system_prompt = kwargs.pop('system_prompt', None)
            
            # Use specific model instance if requested, otherwise default
            if active_model != self.config.model or system_prompt:
                 model_kwargs = {}
                 if system_prompt:
                     model_kwargs['system_instruction'] = system_prompt
                 gen_model = genai.GenerativeModel(active_model, **model_kwargs)
            else:
                 gen_model = self.model
            
            # Remove 'model' from kwargs to prevent passing to generate_content
            kwargs.pop('model', None)
            # Remove unsupported kwargs that might have been passed generically
            kwargs.pop('json_mode', None)
            
            # Configure generation
            generation_config = {
                'temperature': temperature,
            }
            if max_tokens:
                generation_config['max_output_tokens'] = max_tokens
            
            # Generate response
            response = gen_model.generate_content(
                prompt,
                generation_config=generation_config,
                **kwargs
            )
            
            # Record success
            self.record_success()
            
            logger.info(f"[{trace_id}] Successfully generated response with Google AI")
            
            # Extract usage
            usage_meta = {
                'prompt_token_count': getattr(response.usage_metadata, 'prompt_token_count', None),
                'candidates_token_count': getattr(response.usage_metadata, 'candidates_token_count', None),
                'total_tokens': getattr(response.usage_metadata, 'total_token_count', None)
            } if hasattr(response, 'usage_metadata') and response.usage_metadata else {}

            return ProviderResponse(
                content=response.text,
                model=active_model,
                provider="google_ai",
                trace_id=trace_id,
                metadata={
                    'model': active_model,
                    'finish_reason': response.candidates[0].finish_reason.name if response.candidates else None,
                    'safety_ratings': [
                        {
                            'category': rating.category.name,
                            'probability': rating.probability.name
                        }
                        for rating in response.candidates[0].safety_ratings
                    ] if response.candidates else [],
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

            # Get image model
            # Note: This requires a version of google-generativeai that supports Imagen
            try:
                from google.generativeai import ImageGenerationModel
                img_model = ImageGenerationModel(active_model, api_key=self.config.api_key)
            except ImportError:
                 return ProviderResponse(
                    content="",
                    model=active_model,
                    provider="google_ai",
                    trace_id=trace_id,
                    error="Google Generative AI SDK does not support ImageGenerationModel. Please update the package."
                )

            # Map aspect ratio parameters
            # app.js sends 'aspect_ratios' as list, need to pick one or default.
            # But the API arg here is `aspect_ratio` (string).
            # The kwargs might contain 'aspect_ratio' from the frontend if we passed it.
            aspect_ratio = kwargs.get('aspect_ratio', '1:1')

            # Generate
            response = img_model.generate_images(
                prompt=prompt,
                number_of_images=n,
                aspect_ratio=aspect_ratio,
                safety_filter="block_only_high",
            )
            
            # The response.images are PIL Images. 
            # We will pass them in metadata to be saved by the route handler.
            # We can't pickle them easily if we were passing across processes, but within same process it's fine.
            # Alternatively, convert to bytes here.
            
            import io
            image_bytes_list = []
            for img in response.images:
                img_byte_arr = io.BytesIO()
                img.save(img_byte_arr, format='PNG')
                image_bytes_list.append(img_byte_arr.getvalue())

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
