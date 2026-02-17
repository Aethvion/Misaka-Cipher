"""
Misaka Cipher - Registry Routes
API endpoints for managing the Model Registry (config/model_registry.json)
"""

import json
from pathlib import Path
from typing import Dict, Any
from fastapi import APIRouter, HTTPException

from utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/registry", tags=["registry"])

REGISTRY_PATH = Path(__file__).parent.parent / "config" / "model_registry.json"


def _load_registry() -> Dict[str, Any]:
    """Load model registry from disk."""
    try:
        if REGISTRY_PATH.exists():
            with open(REGISTRY_PATH, 'r') as f:
                return json.load(f)
        return {"providers": {}, "routing_strategy": {}}
    except Exception as e:
        logger.error(f"Failed to load model registry: {e}")
        return {"providers": {}, "routing_strategy": {}}


def _save_registry(data: Dict[str, Any]) -> None:
    """Save model registry to disk."""
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REGISTRY_PATH, 'w') as f:
        json.dump(data, f, indent=4)
    logger.info("Model registry saved to disk")


@router.get("")
async def get_registry():
    """Get the full model registry."""
    try:
        registry = _load_registry()
        return registry
    except Exception as e:
        logger.error(f"Failed to get registry: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def update_registry(updates: Dict[str, Any]):
    """Update the model registry (full replace)."""
    try:
        _save_registry(updates)
        return {"status": "success", "registry": updates}
    except Exception as e:
        logger.error(f"Failed to update registry: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/provider/{provider_name}")
async def update_provider(provider_name: str, updates: Dict[str, Any]):
    """Update a single provider's settings."""
    try:
        registry = _load_registry()
        providers = registry.get("providers", {})
        
        if provider_name not in providers:
            raise HTTPException(status_code=404, detail=f"Provider '{provider_name}' not found")
        
        # Update only the fields provided
        for key, value in updates.items():
            providers[provider_name][key] = value
        
        registry["providers"] = providers
        _save_registry(registry)
        
        return {"status": "success", "provider": provider_name, "config": providers[provider_name]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update provider {provider_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== Model CRUD =====

@router.post("/provider/{provider_name}/models")
async def add_model(provider_name: str, model_data: Dict[str, Any]):
    """Add a model to a provider."""
    try:
        registry = _load_registry()
        providers = registry.get("providers", {})

        if provider_name not in providers:
            raise HTTPException(status_code=404, detail=f"Provider '{provider_name}' not found")

        model_key = model_data.get("key")
        if not model_key:
            raise HTTPException(status_code=400, detail="Model 'key' is required")

        models = providers[provider_name].setdefault("models", {})
        if model_key in models:
            raise HTTPException(status_code=409, detail=f"Model '{model_key}' already exists")

        # Build model entry (strip the key field, it's used as the dict key)
        entry = {k: v for k, v in model_data.items() if k != "key"}
        models[model_key] = entry

        _save_registry(registry)
        logger.info(f"Added model '{model_key}' to provider '{provider_name}'")
        return {"status": "success", "provider": provider_name, "model_key": model_key, "model": entry}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/provider/{provider_name}/models/{model_key}")
async def update_model(provider_name: str, model_key: str, model_data: Dict[str, Any]):
    """Update a model within a provider."""
    try:
        registry = _load_registry()
        providers = registry.get("providers", {})

        if provider_name not in providers:
            raise HTTPException(status_code=404, detail=f"Provider '{provider_name}' not found")

        models = providers[provider_name].get("models", {})
        if model_key not in models:
            raise HTTPException(status_code=404, detail=f"Model '{model_key}' not found")

        # Merge updates into existing model
        for k, v in model_data.items():
            models[model_key][k] = v

        _save_registry(registry)
        logger.info(f"Updated model '{model_key}' for provider '{provider_name}'")
        return {"status": "success", "provider": provider_name, "model_key": model_key, "model": models[model_key]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/provider/{provider_name}/models/{model_key}")
async def delete_model(provider_name: str, model_key: str):
    """Remove a model from a provider."""
    try:
        registry = _load_registry()
        providers = registry.get("providers", {})

        if provider_name not in providers:
            raise HTTPException(status_code=404, detail=f"Provider '{provider_name}' not found")

        models = providers[provider_name].get("models", {})
        if model_key not in models:
            raise HTTPException(status_code=404, detail=f"Model '{model_key}' not found")

        del models[model_key]
        _save_registry(registry)
        logger.info(f"Deleted model '{model_key}' from provider '{provider_name}'")
        return {"status": "success", "provider": provider_name, "model_key": model_key}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/chat")
async def get_chat_models():
    """Get flat list of all chat-capable models for the dropdown."""
    try:
        registry = _load_registry()
        chat_models = []

        for provider_name, config in registry.get("providers", {}).items():
            models = config.get("models", {})
            for model_key, model_info in models.items():
                if isinstance(model_info, str):
                    # Legacy format: just a model ID string
                    chat_models.append({"id": model_info, "provider": provider_name})
                    continue

                capabilities = model_info.get("capabilities", [])
                # Skip image-only models
                if capabilities and all(c in ("image_generation",) for c in capabilities):
                    continue

                chat_models.append({
                    "id": model_info.get("id", model_key),
                    "provider": provider_name,
                    "capabilities": capabilities,
                    "input_cost_per_1m_tokens": model_info.get("input_cost_per_1m_tokens", 0),
                    "output_cost_per_1m_tokens": model_info.get("output_cost_per_1m_tokens", 0),
                    "description": model_info.get("description", model_info.get("notes", "")),
                })

        # Sort by model ID
        chat_models.sort(key=lambda m: m["id"])
        return {"models": chat_models}
    except Exception as e:
        logger.error(f"Failed to get chat models: {e}")
        raise HTTPException(status_code=500, detail=str(e))

