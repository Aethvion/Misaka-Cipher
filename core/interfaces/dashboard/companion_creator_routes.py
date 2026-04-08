"""
Aethvion Suite - Custom Companion Creator Routes
API endpoints for creating, listing, and deleting custom companions.

Custom companions are stored in data/companions/custom/<id>/config.json.
They use the generic companion template (generic_companion_routes.py) at runtime.
A server restart is required after creation to register the new routes.
"""

import json
import re
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/companion-creator", tags=["companion-creator"])

_ROOT = Path(__file__).parent.parent.parent.parent
_CUSTOM_DIR = _ROOT / "data" / "companions" / "custom"
_CUSTOM_DIR.mkdir(parents=True, exist_ok=True)


# ── Schema ─────────────────────────────────────────────────────────────────────

class CompanionCreateRequest(BaseModel):
    name: str
    description: str
    personality: str
    speech_style: str
    quirks: list[str] = []
    likes: list[str] = []
    dislikes: list[str] = []
    default_model: str = "gemini-1.5-flash"
    accent_color: str = "#6366f1"       # CSS hex colour for the avatar
    avatar_symbol: str = "✦"            # Single char / emoji shown in CSS avatar
    expressions: list[str] = []         # custom expression names (optional)
    moods: list[str] = []               # custom mood names (optional)


class CompanionUpdateRequest(CompanionCreateRequest):
    pass


# ── Helpers ────────────────────────────────────────────────────────────────────

def _slug(name: str) -> str:
    """Turn a display name into a safe ID slug."""
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = s.strip("_")
    return s or "companion"


def _list_custom_companions() -> list[dict]:
    configs = []
    for config_file in sorted(_CUSTOM_DIR.glob("*/config.json")):
        try:
            configs.append(json.loads(config_file.read_text(encoding="utf-8")))
        except Exception as e:
            logger.warning(f"Could not read {config_file}: {e}")
    return configs


def _load_config(companion_id: str) -> dict:
    path = _CUSTOM_DIR / companion_id / "config.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Companion '{companion_id}' not found")
    return json.loads(path.read_text(encoding="utf-8"))


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/list")
async def list_companions():
    """Return all custom companion configs."""
    return {"companions": _list_custom_companions()}


@router.get("/{companion_id}")
async def get_companion(companion_id: str):
    """Return a single companion config."""
    return _load_config(companion_id)


@router.post("/create")
async def create_companion(req: CompanionCreateRequest):
    """
    Create a new custom companion.
    Returns the generated ID and a note to restart the server.
    """
    base_slug = _slug(req.name)
    companion_id = base_slug

    # Avoid collision with built-in companions
    builtin_ids = {"misaka_cipher", "axiom", "lyra"}
    if companion_id in builtin_ids or (_CUSTOM_DIR / companion_id).exists():
        companion_id = f"{base_slug}_{uuid.uuid4().hex[:4]}"

    companion_dir = _CUSTOM_DIR / companion_id
    companion_dir.mkdir(parents=True, exist_ok=True)
    (companion_dir / "history").mkdir(exist_ok=True)

    expressions = req.expressions or ["default", "happy", "thinking", "focused", "error"]
    moods       = req.moods       or ["calm", "happy", "reflective", "intense"]

    config = {
        "id":            companion_id,
        "name":          req.name,
        "description":   req.description,
        "personality":   req.personality,
        "speech_style":  req.speech_style,
        "quirks":        req.quirks,
        "likes":         req.likes,
        "dislikes":      req.dislikes,
        "default_model": req.default_model,
        "accent_color":  req.accent_color,
        "avatar_symbol": req.avatar_symbol,
        "expressions":   expressions,
        "moods":         moods,
        "route_prefix":  f"/api/custom/{companion_id}",
        "type":          "custom",
    }

    config_path = companion_dir / "config.json"
    config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")

    # Write initial base_info.json
    base_info = {
        "name":          req.name,
        "core_identity": req.description,
        "personality":   req.personality,
        "speech_style":  req.speech_style,
        "quirks":        req.quirks,
        "likes":         req.likes,
        "dislikes":      req.dislikes,
        "autonomy_level": "Medium",
    }
    (companion_dir / "base_info.json").write_text(
        json.dumps(base_info, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # Write initial memory.json
    from datetime import datetime
    (companion_dir / "memory.json").write_text(
        json.dumps({
            "user_info": {},
            "recent_observations": [],
            "synthesis_notes": [],
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }, indent=2),
        encoding="utf-8"
    )

    logger.info(f"Custom companion created: {companion_id} ({req.name})")
    return {
        "success": True,
        "id":      companion_id,
        "name":    req.name,
        "message": f"Companion '{req.name}' created. Restart Aethvion Suite to activate the chat endpoint.",
    }


@router.put("/{companion_id}")
async def update_companion(companion_id: str, req: CompanionUpdateRequest):
    """Update an existing custom companion's config."""
    existing = _load_config(companion_id)
    companion_dir = _CUSTOM_DIR / companion_id

    expressions = req.expressions or existing.get("expressions", ["default", "happy", "thinking"])
    moods       = req.moods       or existing.get("moods", ["calm", "happy", "reflective"])

    config = {
        **existing,
        "name":          req.name,
        "description":   req.description,
        "personality":   req.personality,
        "speech_style":  req.speech_style,
        "quirks":        req.quirks,
        "likes":         req.likes,
        "dislikes":      req.dislikes,
        "default_model": req.default_model,
        "accent_color":  req.accent_color,
        "avatar_symbol": req.avatar_symbol,
        "expressions":   expressions,
        "moods":         moods,
    }

    (companion_dir / "config.json").write_text(
        json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # Update base_info.json too
    base_info_path = companion_dir / "base_info.json"
    if base_info_path.exists():
        base_info = json.loads(base_info_path.read_text(encoding="utf-8"))
    else:
        base_info = {}

    base_info.update({
        "name":          req.name,
        "core_identity": req.description,
        "personality":   req.personality,
        "speech_style":  req.speech_style,
        "quirks":        req.quirks,
        "likes":         req.likes,
        "dislikes":      req.dislikes,
    })
    base_info_path.write_text(json.dumps(base_info, indent=2, ensure_ascii=False), encoding="utf-8")

    return {"success": True, "id": companion_id, "message": "Config updated. Restart to apply changes."}


@router.delete("/{companion_id}")
async def delete_companion(companion_id: str):
    """Delete a custom companion (cannot delete built-ins)."""
    builtin_ids = {"misaka_cipher", "axiom", "lyra"}
    if companion_id in builtin_ids:
        raise HTTPException(status_code=403, detail="Cannot delete built-in companions.")

    companion_dir = _CUSTOM_DIR / companion_id
    if not companion_dir.exists():
        raise HTTPException(status_code=404, detail=f"Companion '{companion_id}' not found.")

    import shutil
    shutil.rmtree(companion_dir)
    logger.info(f"Custom companion deleted: {companion_id}")
    return {"success": True, "message": f"Companion '{companion_id}' deleted."}
