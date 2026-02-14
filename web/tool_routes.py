"""
Misaka Cipher - Tool Registry API Routes
FastAPI routes for tool management operations
"""

from fastapi import APIRouter, HTTPException
from utils import get_logger
from forge import ToolForge, get_tool_registry

logger = get_logger("web.tool_routes")

# Create router
router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("/list")
async def list_tools():
    """List all registered tools."""
    try:
        registry = get_tool_registry()
        tools = registry.list_tools()
        return {
            "count": len(tools),
            "tools": [
                {
                    "name": t.get('name', 'unknown'),
                    "domain": t.get('domain', 'unknown'),
                    "description": t.get('description', ''),
                    "parameters": t.get('parameters', {}),
                    "created_at": t.get('created_at'),
                    "file_path": t.get('file_path')
                }
                for t in tools
            ]
        }
    except Exception as e:
        logger.error(f"Error listing tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{tool_name}")
async def delete_tool(tool_name: str):
    """Delete a tool and its associated file."""
    try:
        registry = get_tool_registry()
        
        if not registry.tool_exists(tool_name):
            raise HTTPException(status_code=404, detail=f"Tool {tool_name} not found")
            
        success = registry.unregister(tool_name, delete_file=True)
        
        if success:
            logger.info(f"Tool {tool_name} deleted via API")
            return {"success": True, "message": f"Tool {tool_name} deleted successfully"}
        else:
            return {"success": False, "message": f"Failed to delete tool {tool_name}"}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tool {tool_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
