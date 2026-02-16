"""
Misaka Cipher - Usage Routes
API endpoints for the Usage Dashboard
"""

from fastapi import APIRouter, HTTPException
from typing import Optional

from utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("/summary")
async def get_usage_summary():
    """Get aggregated usage statistics."""
    try:
        from workspace.usage_tracker import get_usage_tracker
        tracker = get_usage_tracker()
        return tracker.get_summary()
    except Exception as e:
        logger.error(f"Failed to get usage summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_usage_history(limit: int = 100):
    """Get recent usage entries."""
    try:
        from workspace.usage_tracker import get_usage_tracker
        tracker = get_usage_tracker()
        return {"entries": tracker.get_history(limit=limit)}
    except Exception as e:
        logger.error(f"Failed to get usage history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hourly")
async def get_hourly_breakdown(hours: int = 24):
    """Get hourly token/call breakdown for charts."""
    try:
        from workspace.usage_tracker import get_usage_tracker
        tracker = get_usage_tracker()
        return {"hours": tracker.get_hourly_breakdown(hours=hours)}
    except Exception as e:
        logger.error(f"Failed to get hourly breakdown: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tools")
async def get_tool_usage():
    """Get tool usage statistics from the tool registry."""
    try:
        from forge.tool_registry import get_tool_registry
        registry = get_tool_registry()
        tools = registry.list_tools()

        # Sort by usage count (if tracked)
        tool_list = []
        for tool in tools:
            tool_list.append({
                "name": tool.get("name", "unknown"),
                "domain": tool.get("domain", ""),
                "usage_count": tool.get("usage_count", 0),
                "last_used": tool.get("last_used"),
                "created": tool.get("created"),
                "file_path": tool.get("file_path", "")
            })

        # Most used first
        tool_list.sort(key=lambda x: x["usage_count"], reverse=True)

        return {"tools": tool_list}
    except Exception as e:
        logger.error(f"Failed to get tool usage: {e}")
        raise HTTPException(status_code=500, detail=str(e))
