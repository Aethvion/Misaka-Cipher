"""
core/companions/companion_routes.py
═════════════════════════════════════
Unified dynamic router for all Aethvion companions.
"""

from typing import List, Optional, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.companions.registry import CompanionRegistry
from core.companions.companion_engine import CompanionEngine
from core.companions.engine.memory import CompanionMemory
from core.companions.engine.history import CompanionHistory

router = APIRouter(prefix="/api/companions", tags=["companions"])

class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage]

class InitiateRequest(BaseModel):
    trigger: str = "startup"

def _get_cfg(cid: str):
    if not (cfg := CompanionRegistry.get_companion(cid)):
        raise HTTPException(status_code=404, detail=f"Companion '{cid}' not found")
    return cfg

@router.get("/list")
async def list_companions():
    return {"companions": CompanionRegistry.list_companions()}

@router.get("/{companion_id}/memory")
async def get_memory(companion_id: str):
    cfg = _get_cfg(companion_id)
    memory = CompanionMemory(cfg.data_dir, cfg._raw_config.get("personality_defaults", {}))
    return memory.load()

@router.get("/{companion_id}/history")
async def get_history(companion_id: str, offset: int = 0, limit: int = 3):
    cfg = _get_cfg(companion_id)
    history = CompanionHistory(cfg.history_dir, cfg.name)
    return history.load_days(offset, limit)

@router.post("/{companion_id}/initiate")
async def initiate(companion_id: str, request: InitiateRequest):
    return await CompanionEngine.initiate_response(_get_cfg(companion_id), request.trigger)

@router.post("/{companion_id}/chat")
async def chat(companion_id: str, request: ChatRequest):
    return await CompanionEngine.chat_response(_get_cfg(companion_id), request.message, request.history)

@router.post("/{companion_id}/reset")
async def reset(companion_id: str):
    cfg = _get_cfg(companion_id)
    CompanionHistory(cfg.history_dir, cfg.name).clear()
    memory = CompanionMemory(cfg.data_dir, cfg._raw_config.get("personality_defaults", {}))
    memory.reset(); memory.initialize()
    return {"status": "reset_successful"}

@router.post("/{companion_id}/upload-context")
async def upload_context(companion_id: str, file: Any = None):
    return {"filename": "uploaded_file.txt", "url": "/static/uploads/uploaded_file.txt", "is_image": False}

@router.get("/{companion_id}/expressions")
async def get_expressions(companion_id: str):
    return _get_cfg(companion_id).expressions
