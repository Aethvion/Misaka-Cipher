"""
core/companions/companion_routes.py
═════════════════════════════════════
Singleton dynamic router for ALL Aethvion companions.
Handles routing for built-in and custom companions via path parameters.
"""

from typing import List, Optional, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core.companions.registry import CompanionRegistry
from core.companions.companion_engine import CompanionEngine
from core.companions.engine.memory import CompanionMemory
from core.companions.engine.history import CompanionHistory
from core.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/companions", tags=["companions"])

# ── Models ──────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage]

class InitiateRequest(BaseModel):
    trigger: str = "startup"

# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_cfg(companion_id: str):
    cfg = CompanionRegistry.get_companion(companion_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Companion '{companion_id}' not found")
    return cfg

# ── Routes ──────────────────────────────────────────────────────────────────

@router.get("/list")
async def list_companions():
    """List all registered companions (built-in and custom)."""
    return {"companions": CompanionRegistry.list_companions()}

@router.get("/{companion_id}/config")
async def get_config(companion_id: str):
    """Get the raw configuration for a companion."""
    return _get_cfg(companion_id)._raw_config

@router.get("/{companion_id}/expressions")
async def get_expressions(companion_id: str):
    """Get valid expressions for a companion."""
    return _get_cfg(companion_id).expressions

@router.get("/{companion_id}/memory")
async def get_memory(companion_id: str):
    """Get current memory/identity state."""
    cfg = _get_cfg(companion_id)
    memory = CompanionMemory(cfg.data_dir, cfg._raw_config.get("personality_defaults", {}))
    return memory.load()

@router.get("/{companion_id}/history")
async def get_history(companion_id: str, offset: int = 0, limit: int = 3):
    """Get conversation history."""
    cfg = _get_cfg(companion_id)
    history = CompanionHistory(cfg.history_dir, cfg.name)
    return history.load_days(offset, limit)

@router.post("/{companion_id}/initiate")
async def initiate(companion_id: str, request: InitiateRequest):
    """Trigger a conversation opening."""
    cfg = _get_cfg(companion_id)
    return await CompanionEngine.initiate_response(cfg, request.trigger)

@router.post("/{companion_id}/chat")
async def chat(companion_id: str, request: ChatRequest):
    """Send a message to the companion."""
    cfg = _get_cfg(companion_id)
    return await CompanionEngine.chat_response(cfg, request.message, request.history)

@router.post("/{companion_id}/reset")
async def reset(companion_id: str):
    """Reset companion memory and history."""
    cfg = _get_cfg(companion_id)
    memory = CompanionMemory(cfg.data_dir, cfg._raw_config.get("personality_defaults", {}))
    history = CompanionHistory(cfg.history_dir, cfg.name)
    history.clear()
    memory.reset()
    memory.initialize()
    return {"status": "reset_successful"}
