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
