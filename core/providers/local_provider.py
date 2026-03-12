"""
Misaka Cipher - Local Provider
Implementation for local LLMs using llama-cpp-python
"""

import os
from pathlib import Path
from typing import Dict, Optional, Iterator, Any, List
from .base_provider import BaseProvider, ProviderResponse, ProviderConfig, ProviderStatus
from core.utils.logger import get_logger

logger = get_logger(__name__)

# Lazy import for llama-cpp-python
Llama = None

class LocalProvider(BaseProvider):
    """
    Provider implementation for local models using llama-cpp-python.
    """
    
    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.llm = None
        self.current_model_path = None
        
        # Determine base directory for models
        # project_root / LocalModels
        self.base_dir = Path(__file__).parent.parent.parent / "LocalModels"
        if not self.base_dir.exists():
            self.base_dir.mkdir(parents=True, exist_ok=True)

    def _ensure_llama(self, model_id: str, **kwargs):
        """Ensure the llama-cpp-python model is loaded."""
        global Llama
        if Llama is None:
            try:
                from llama_cpp import Llama as LlamaClass
                Llama = LlamaClass
            except ImportError:
                logger.error("llama-cpp-python not installed. Please install it to use local models.")
                raise ImportError("llama-cpp-python not installed")

        # Resolve model path
        model_path = self.base_dir / model_id
        if not model_path.exists():
            # Support .gguf extension if not provided
            if not model_id.endswith(".gguf"):
                model_path = self.base_dir / f"{model_id}.gguf"
        
        if not model_path.exists():
            logger.error(f"Local model not found at {model_path}")
            raise FileNotFoundError(f"Local model not found: {model_path}")

        # Check if we need to (re)load the model
        if self.llm is None or self.current_model_path != str(model_path):
            logger.info(f"Loading local model from {model_path}...")
            # Unload old model if exists
            self.llm = None
            
            # Load new model
            self.llm = Llama(
                model_path=str(model_path),
                n_ctx=kwargs.get('n_ctx', 2048),
                n_threads=kwargs.get('n_threads', os.cpu_count()),
                verbose=False
            )
            self.current_model_path = str(model_path)
            logger.info(f"Local model loaded successfully")

    def generate(
        self,
        prompt: str,
        trace_id: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        model: Optional[str] = None,
        **kwargs
    ) -> ProviderResponse:
        try:
            model_id = model or self.config.model
            self._ensure_llama(model_id, **kwargs)
            
            response = self.llm(
                prompt,
                max_tokens=max_tokens or 512,
                temperature=temperature,
                stop=kwargs.get('stop', None),
                echo=False
            )
            
            content = response['choices'][0]['text']
            
            return ProviderResponse(
                content=content,
                model=model_id,
                provider="local",
                trace_id=trace_id,
                metadata={'usage': response.get('usage', {})}
            )
            
        except Exception as e:
            logger.error(f"Local model generation failed: {str(e)}")
            return ProviderResponse(
                content="",
                model=model or self.config.model,
                provider="local",
                trace_id=trace_id,
                error=str(e)
            )

    def generate_image(self, *args, **kwargs) -> ProviderResponse:
        return ProviderResponse(content="", model="", provider="local", trace_id="", error="Local image generation not supported yet")

    def generate_speech(self, *args, **kwargs) -> ProviderResponse:
        return ProviderResponse(content="", model="", provider="local", trace_id="", error="Local speech generation not supported yet")

    def transcribe(self, *args, **kwargs) -> ProviderResponse:
        return ProviderResponse(content="", model="", provider="local", trace_id="", error="Local transcription not supported yet")

    def stream(
        self,
        prompt: str,
        trace_id: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Iterator[str]:
        try:
            model_id = kwargs.get('model') or self.config.model
            self._ensure_llama(model_id, **kwargs)
            
            stream = self.llm(
                prompt,
                max_tokens=max_tokens or 512,
                temperature=temperature,
                stop=kwargs.get('stop', None),
                stream=True
            )
            
            for chunk in stream:
                text = chunk['choices'][0]['text']
                if text:
                    yield text
                    
        except Exception as e:
            logger.error(f"Local model streaming failed: {str(e)}")
            yield f" [LOCAL ERROR: {str(e)}] "

    def validate_credentials(self) -> bool:
        # Local provider doesn't need credentials, just check if base_dir exists
        return self.base_dir.exists()
