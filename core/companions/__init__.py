"""
core/companions
═══════════════
Companion registry for Aethvion Suite.

A "companion" is a persistent AI persona with its own identity, memory,
expression system, and chat endpoint.  Misaka Cipher is the first companion.

To add a new companion
──────────────────────
1.  Add a CompanionConfig entry to COMPANIONS in registry.py.
2.  Create the data directories: data/companions/<id>/ (memory + history).
3.  Add expression images to:  static/companions/<id>/expressions/
4.  Create a routes file:       core/interfaces/dashboard/<id>_routes.py
    — Import COMPANIONS[<id>] for config values.
    — Register it in server.py.
5.  Add a nav button + panel to index.html under the Companions category.
"""

from .registry import CompanionConfig, COMPANIONS, get_companion

__all__ = ["CompanionConfig", "COMPANIONS", "get_companion"]
