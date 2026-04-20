"""
Aethvion Suite - Custom Companion Creator Routes
API endpoints for creating, listing, and deleting custom companions.

Custom companions are stored in data/companions/custom/<id>/config.json.
They use the generic companion template (generic_companion_routes.py) at runtime.
A server restart is required after creation to register the new routes.
"""

import json
import os
import re
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.utils.logger import get_logger
from core.utils.paths import COMPANIONS

logger = get_logger(__name__)
router = APIRouter(prefix="/api/companion-creator", tags=["companion-creator"])

_CUSTOM_DIR = COMPANIONS
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

_SAFE_ID_RE = re.compile(r"^[a-z0-9_]{1,64}$")


def _validate_companion_id(companion_id: str) -> None:
    """Raise 400 if *companion_id* is not a safe slug (blocks path traversal)."""
    if not _SAFE_ID_RE.match(companion_id):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid companion ID {companion_id!r}. "
                "IDs must contain only lowercase letters, digits, and underscores."
            ),
        )


def _atomic_write_json(path: Path, data: dict | list) -> None:
    """Write a JSON value atomically via a temp file + rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, str(path))
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


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
    _validate_companion_id(companion_id)
    path = _CUSTOM_DIR / companion_id / "config.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Companion '{companion_id}' not found")
    return json.loads(path.read_text(encoding="utf-8"))


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/list")
async def list_companions():
    """Return all custom companion configs."""
    return {"companions": _list_custom_companions()}


@router.get("/{companion_id}/memory")
async def get_companion_memory(companion_id: str):
    """Return the base_info.json and memory.json for a custom companion."""
    _validate_companion_id(companion_id)
    companion_dir = _CUSTOM_DIR / companion_id
    if not companion_dir.exists():
        raise HTTPException(status_code=404, detail=f"Custom companion '{companion_id}' not found.")

    base_info_path = companion_dir / "base_info.json"
    memory_path    = companion_dir / "memory.json"

    base_info = {}
    if base_info_path.exists():
        with open(base_info_path, "r", encoding="utf-8") as f:
            base_info = json.load(f)

    memory = {}
    if memory_path.exists():
        with open(memory_path, "r", encoding="utf-8") as f:
            memory = json.load(f)

    return {"base_info": base_info, "memory": memory}


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
    _atomic_write_json(config_path, config)

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
    _atomic_write_json(companion_dir / "base_info.json", base_info)

    # Write initial memory.json
    _atomic_write_json(companion_dir / "memory.json", {
        "user_info": {},
        "recent_observations": [],
        "synthesis_notes": [],
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })

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

    _atomic_write_json(companion_dir / "config.json", config)

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
    _atomic_write_json(base_info_path, base_info)

    return {"success": True, "id": companion_id, "message": "Config updated. Restart to apply changes."}


@router.delete("/{companion_id}")
async def delete_companion(companion_id: str):
    """Delete a custom companion (cannot delete built-ins)."""
    _validate_companion_id(companion_id)
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
