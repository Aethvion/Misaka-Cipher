"""
core/companions/engine/streaming.py
═════════════════════════════════════
Stream-time text utilities shared by all companions.
"""
from __future__ import annotations
import re


def clean_memory_tags(text: str) -> str:
    """
    Strip <memory_update> blocks (complete or partial) and any bare JSON memory
    blobs the model emits without the XML wrapper.

    [Emotion:] and [Mood:] tags are intentionally NOT stripped here — they must
    reach the client so the UI can update the companion avatar / mood indicator.
    The client-side cleanStreamingDisplay() handles removing them from visible text.
    """
    # Complete blocks
    text = re.sub(
        r"<memory_update>.*?</memory_update>", "", text, flags=re.IGNORECASE | re.DOTALL
    )
    # Partial/open block — discard from opening tag to end of string
    text = re.sub(r"<memory_update>[\s\S]*$", "", text, flags=re.IGNORECASE)
    # Bare JSON blobs (model emits without XML wrapper)
    _keys = r'"(?:user_info|recent_observations|base_info|synthesis_notes)"'
    text = re.sub(r"\n?\{[^{]*" + _keys + r"[\s\S]*?\}", "", text)
    text = re.sub(r"\n\{[^{]*" + _keys + r"[\s\S]*$", "", text)
    text = re.sub(
        r',?\s*"(?:user_info|recent_observations|base_info|synthesis_notes)"[\s\S]*', "", text
    )
    return text


def build_nexus_capabilities() -> str:
    """
    Read the live Nexus registry and return a formatted capabilities block
    suitable for injection into a companion's system prompt.
    Returns empty string if Nexus is unavailable or has no modules.
    """
    try:
        from core.nexus import nexus_manager
        registry = nexus_manager.get_registry()
        modules = registry.get("modules", [])
        if not modules:
            return ""
        lines = [
            'NEXUS CAPABILITIES — use [tool:nexus module="<id>" cmd="<command>" ...] syntax:'
        ]
        for mod in modules:
            mod_id = mod.get("id", "?")
            mod_name = mod.get("name", mod_id)
            requires_auth = mod.get("requires_auth", False)
            is_authorized = mod.get("is_authorized", True)
            commands = mod.get("available_commands", {})
            auth_note = ""
            if requires_auth and not is_authorized:
                auth_note = " [NOT AUTHORIZED — do NOT attempt to call this module]"
            elif requires_auth:
                auth_note = " [authorized]"
            lines.append(f"  Module: {mod_id} ({mod_name}){auth_note}")
            for cmd, desc in commands.items():
                lines.append(f'    → cmd="{cmd}" — {desc}')
        lines.append('  Example: [tool:nexus module="screen_capture" cmd="take_screenshot"]')
        return "\n".join(lines)
    except Exception:
        return ""


def get_greeting_period(hour: int) -> str:
    if 5 <= hour < 12:
        return "Morning"
    if 12 <= hour < 17:
        return "Afternoon"
    if 17 <= hour < 22:
        return "Evening"
    return "Late Night"
