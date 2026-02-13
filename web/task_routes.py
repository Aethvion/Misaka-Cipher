"""
Misaka Cipher - Task Queue API Routes
REST API endpoints for task queue management
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from orchestrator.task_queue import get_task_queue_manager

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskSubmitRequest(BaseModel):
    """Request to submit a new task."""
    prompt: str
    thread_id: Optional[str] = "default"
    thread_title: Optional[str] = None


class TaskResponse(BaseModel):
    """Task response."""
    task_id: str
    status: str
    message: str


@router.post("/submit", response_model=TaskResponse)
async def submit_task(request: TaskSubmitRequest):
    """
    Submit a new task to the queue.
    
    The task will be executed asynchronously by a worker.
    """
    try:
        task_manager = get_task_queue_manager()
        task_id = await task_manager.submit_task(
            prompt=request.prompt,
            thread_id=request.thread_id,
            thread_title=request.thread_title
        )
        
        return TaskResponse(
            task_id=task_id,
            status="queued",
            message=f"Task {task_id} submitted successfully"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{task_id}")
async def get_task_status(task_id: str):
    """Get status of a specific task."""
    try:
        task_manager = get_task_queue_manager()
        task = task_manager.get_task(task_id)
        
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        
        return task.to_dict()
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/thread/{thread_id}")
async def get_thread_tasks(thread_id: str):
    """Get all tasks for a specific thread."""
    try:
        task_manager = get_task_queue_manager()
        thread = task_manager.get_thread(thread_id)
        
        if not thread:
            raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found")
        
        tasks = task_manager.get_thread_tasks(thread_id)
        
        return {
            'thread': thread.to_dict(),
            'tasks': [task.to_dict() for task in tasks]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/queue/status")
async def get_queue_status():
    """Get overall queue status."""
    try:
        task_manager = get_task_queue_manager()
        return task_manager.get_status()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/threads")
async def list_threads():
    """List all chat threads."""
    try:
        task_manager = get_task_queue_manager()
        return {
            'threads': [thread.to_dict() for thread in task_manager.threads.values()]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ThreadModeRequest(BaseModel):
    mode: str  # "auto" or "chat_only"


@router.delete("/thread/{thread_id}")
async def delete_thread(thread_id: str):
    """Delete a thread."""
    try:
        task_manager = get_task_queue_manager()
        success = task_manager.delete_thread(thread_id)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found")
            
        return {"status": "success", "message": f"Thread {thread_id} deleted"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/thread/{thread_id}/mode")
async def set_thread_mode(thread_id: str, request: ThreadModeRequest):
    """Set thread execution mode."""
    try:
        task_manager = get_task_queue_manager()
        success = task_manager.set_thread_mode(thread_id, request.mode)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found or invalid mode")
            
        return {"status": "success", "mode": request.mode}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/debug/persistence")
async def debug_persistence():
    """Debug endpoint to inspect loaded tasks and threads."""
    try:
        task_manager = get_task_queue_manager()
        return {
            "threads_count": len(task_manager.threads),
            "tasks_count": len(task_manager.tasks),
            "thread_ids": list(task_manager.threads.keys()),
            "task_ids": list(task_manager.tasks.keys()),
            "threads_raw": [t.to_dict() for t in task_manager.threads.values()]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ThreadCreateRequest(BaseModel):
    thread_id: str
    title: Optional[str] = None


@router.post("/thread/create")
async def create_thread(request: ThreadCreateRequest):
    """Explicitly create a new thread."""
    try:
        task_manager = get_task_queue_manager()
        success = task_manager.create_thread(request.thread_id, request.title)
        
        if not success:
            return {"status": "exists", "message": f"Thread {request.thread_id} already exists"}
            
        return {"status": "success", "message": f"Thread {request.thread_id} created"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
