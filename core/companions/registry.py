"""
core/companions/registry.py
═══════════════════════════
Central registry for all companions in Aethvion Suite.
Now fully data-driven. It loads JSON templates from core/companions/configs/
and associates them with active storage in data/companions/.
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Dict, List, Any

# Project root
_ROOT = Path(__file__).parent.parent.parent
_CONFIG_DIR = Path(__file__).parent / "configs"
_DATA_ROOT = _ROOT / "data" / "companions"


@dataclass
class CompanionConfig:
    """
    Metadata for a companion, loaded from JSON.
    """
    id: str
    name: str
    description: str
    route_prefix: str
    static_dir: str
    avatar_prefix: str
    data_dir: Path
    history_dir: Path
    expressions: List[str] = field(default_factory=list)
    moods: List[str] = field(default_factory=list)
    default_expression: str = "default"
    default_model: str = "gemini-1.5-flash"
    
    # Internal raw config for the engine
    _raw_config: Dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def from_json(cls, path: Path) -> "CompanionConfig":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        cid = data["id"]
        meta = data.get("meta", {})
        behavior = data.get("behavior", {})
        
        # Ensure data dir exists
        data_dir = _DATA_ROOT / cid
        history_dir = data_dir / "history"
        
        return cls(
            id=cid,
            name=data["name"],
            description=data["description"],
            route_prefix=meta.get("route_prefix", f"/api/{cid}"),
            static_dir=meta.get("static_dir", f"companions/{cid}/expressions"),
            avatar_prefix=meta.get("avatar_prefix", f"{cid}_"),
            data_dir=data_dir,
            history_dir=history_dir,
            expressions=behavior.get("expressions", []),
            moods=behavior.get("moods", []),
            default_expression=behavior.get("default_expression", "default"),
            _raw_config=data
        )


class CompanionRegistry:
    """Manages the lifecycle and discovery of companions."""
    
    _companions: Dict[str, CompanionConfig] = {}
    _loaded = False

    @classmethod
    def load_all(cls):
        """Scan config dir and data dir for .json files and register them."""
        cls._companions = {}
        
        # 1. Load core templates
        if _CONFIG_DIR.exists():
            for file in _CONFIG_DIR.glob("*.json"):
                try:
                    cfg = CompanionConfig.from_json(file)
                    cls._companions[cfg.id] = cfg
                except Exception as e:
                    print(f"Error loading companion template {file.name}: {e}")
        
        # 2. Load custom companions from data (overrides templates with same ID)
        if _DATA_ROOT.exists():
            for c_dir in _DATA_ROOT.iterdir():
                if not c_dir.is_dir():
                    continue
                config_file = c_dir / "config.json"
                if config_file.exists():
                    try:
                        cfg = CompanionConfig.from_json(config_file)
                        cls._companions[cfg.id] = cfg
                    except Exception as e:
                        print(f"Error loading companion state {c_dir.name}: {e}")
        
        cls._loaded = True

    @classmethod
    def get_companion(cls, companion_id: str) -> Optional[CompanionConfig]:
        if not cls._loaded:
            cls.load_all()
        return cls._companions.get(companion_id)

    @classmethod
    def list_companions(cls) -> List[CompanionConfig]:
        if not cls._loaded:
            cls.load_all()
        return list(cls._companions.values())


def get_companion(companion_id: str) -> Optional[CompanionConfig]:
    """Return a CompanionConfig by ID, or None if not found."""
    return COMPANIONS.get(companion_id)
