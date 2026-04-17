"""
core/companions/companion_routes.py
═════════════════════════════════════
Unified entry point that registers FastAPI routers for all companions
discovered by the CompanionRegistry.
"""

from fastapi import APIRouter
from core.companions.registry import CompanionRegistry
from core.companions.companion_engine import make_companion_router
from core.utils.logger import get_logger

logger = get_logger(__name__)

# List of routers to be collected by server.py
routers: list[APIRouter] = []

def register_all():
    """Build and register routers for every discovered companion."""
    global routers
    routers = []
    
    # Load all companions from core/configs and data/ (custom)
    CompanionRegistry.load_all()
    all_configs = CompanionRegistry.list_companions()
    
    for cfg in all_configs:
        try:
            router = make_companion_router(cfg)
            routers.append(router)
            logger.info(f"Companion Engine: registered '{cfg.id}' at {cfg.route_prefix}")
        except Exception as e:
            logger.error(f"Companion Engine: failed to register '{cfg.id}': {e}", exc_info=True)

# Register on module import
register_all()
