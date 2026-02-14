"""
Misaka Cipher - Memory API Routes
FastAPI routes for memory management and visualization
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from pathlib import Path
import json
import asyncio

from utils import get_logger
from memory import get_episodic_memory, get_knowledge_graph

logger = get_logger("web.memory_routes")

# Create router
router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("/overview")
async def get_memory_overview():
    """
    Get comprehensive memory overview.
    Returns Permanent Memory (Core Insights) and Thread Memory.
    """
    try:
        # 1. Fetch Permanent Memory (Core Insights)
        kg = get_knowledge_graph()
        permanent_memory = []
        
        try:
            # Iterate graph nodes to find core insights
            for node, data in kg.graph.nodes(data=True):
                if data.get('node_type') == 'core_insight':
                    permanent_memory.append({
                        "id": node,
                        "summary": data.get('summary', 'No summary'),
                        "created_at": data.get('created', ''),
                        "confidence": data.get('confidence', 0.0),
                        "tags": data.get('tags', [])
                    })
        except Exception as e:
            logger.error(f"Error fetching permanent memory: {e}")
            
        # 2. Fetch Thread Memory
        episodic = get_episodic_memory()
        threads_memory = []
        
        # Path to threads directory
        workspace = Path(__file__).parent.parent
        threads_dir = workspace / "memory" / "storage" / "threads"
        
        if threads_dir.exists():
            # Get all thread JSON files
            thread_files = sorted(threads_dir.glob("thread-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            
            for thread_file in thread_files:
                try:
                    with open(thread_file, 'r') as f:
                        thread_data = json.load(f)
                        
                    task_ids = thread_data.get('task_ids', [])
                    thread_memories = []
                    
                    # Fetch memories for each task_id (trace_id)
                    for task_id in task_ids:
                        memories = episodic.get_by_trace_id(task_id)
                        for mem in memories:
                            thread_memories.append({
                                "memory_id": mem.memory_id,
                                "trace_id": mem.trace_id,
                                "event_type": mem.event_type,
                                "summary": mem.summary,
                                "content": mem.content,
                                "timestamp": mem.timestamp,
                                "domain": mem.domain
                            })
                            
                    # Sort memories by timestamp
                    thread_memories.sort(key=lambda x: x['timestamp'], reverse=True)
                    
                    threads_memory.append({
                        "id": thread_data.get('id'),
                        "title": thread_data.get('title', 'Untitled Thread'),
                        "updated_at": thread_data.get('updated_at'),
                        "memory_count": len(thread_memories),
                        "memories": thread_memories
                    })
                    
                except Exception as e:
                    logger.warning(f"Error reading thread file {thread_file}: {e}")
                    continue
        
        return {
            "permanent": permanent_memory,
            "threads": threads_memory
        }

    except Exception as e:
        logger.error(f"Error generating memory overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))
