from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
import json
import os
import shutil
from pathlib import Path
import asyncio

from core.utils import get_logger, utcnow_iso
from core.utils.paths import EXPLANATIONS, WS_OUTPUTS
from core.orchestrator.agent_runner import AgentRunner
from core.ai.call_contexts import CallSource

logger = get_logger("web.explained_routes")
router = APIRouter(prefix="/api/explained", tags=["explained"])

# In-memory task tracking for status polling
ACTIVE_TASKS = {} # task_id -> {status, thread_id, html, error, topic, display_title, step, logs: []}

class ExplainedRequest(BaseModel):
    topic: str
    model_id: str = "auto"
    thread_id: Optional[str] = None

@router.post("/generate")
async def generate_explanation(req: ExplainedRequest, request: Request, background_tasks: BackgroundTasks):
    nexus = getattr(request.app.state, 'nexus', None)
    if not nexus: raise HTTPException(503, "System not initialized")
    
    task_id = str(uuid.uuid4())
    thread_id = req.thread_id or f"expl-{uuid.uuid4().hex[:8]}"
    
    # Setup thread directory
    thread_dir = EXPLANATIONS / thread_id
    thread_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize task state
    ACTIVE_TASKS[task_id] = {
        "status": "running",
        "thread_id": thread_id,
        "topic": req.topic,
        "display_title": req.topic[:30] + "..." if len(req.topic) > 30 else req.topic,
        "step": "Analyzing Topic...",
        "logs": [],
        "html": None,
        "error": None
    }
    
    # Run in background
    background_tasks.add_task(run_explained_agent, task_id, thread_id, req, nexus)
    
    return {"task_id": task_id, "thread_id": thread_id}

@router.get("/status/{task_id}")
async def get_task_status(task_id: str):
    if task_id not in ACTIVE_TASKS:
        raise HTTPException(404, "Task not found")
    return ACTIVE_TASKS[task_id]

@router.get("/thread/{thread_id}")
async def get_thread_result(thread_id: str):
    thread_dir = EXPLANATIONS / thread_id
    index_path = thread_dir / "index.html"
    meta_path = thread_dir / "meta.json"
    if not index_path.exists():
        raise HTTPException(404, f"Result not found for {thread_id}")
    
    html = index_path.read_text(encoding="utf-8")
    meta = {}
    if meta_path.exists():
        try: meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except: pass

    return {
        "html": html, 
        "thread_id": thread_id, 
        "display_title": meta.get("display_title", thread_id),
        "topic": meta.get("topic", "")
    }

@router.delete("/thread/{thread_id}")
async def delete_thread(thread_id: str):
    thread_dir = EXPLANATIONS / thread_id
    if thread_dir.exists():
        try:
            shutil.rmtree(thread_dir)
            return {"status": "success"}
        except Exception as e:
            raise HTTPException(500, f"Delete failed: {str(e)}")
    raise HTTPException(404, "Not found")

@router.get("/thread/{thread_id}/raw")
async def get_thread_raw_html(thread_id: str):
    from fastapi.responses import HTMLResponse
    thread_dir = EXPLANATIONS / thread_id
    index_path = thread_dir / "index.html"
    if not index_path.exists():
        return HTMLResponse("<html><body><p>Preparing immersion...</p></body></html>")
    
    html = index_path.read_text(encoding="utf-8")
    return HTMLResponse(content=html)

async def run_explained_agent(task_id: str, thread_id: str, req: ExplainedRequest, nexus):
    thread_dir = EXPLANATIONS / thread_id
    
    # Save/Update meta
    meta_path = thread_dir / "meta.json"
    meta = {
        "topic": req.topic,
        "updated_at": utcnow_iso(),
        "model_id": req.model_id
    }
    
    # Try to generate a short display title if it's new
    if not req.thread_id:
        # Simplistic "Title Case" slug for now, but we'll let Agent do it
        meta["display_title"] = req.topic[:25] + ("..." if len(req.topic) > 25 else "")
        meta["created_at"] = meta["updated_at"]
        # Increment ID logic - count existing folders
        try:
            total = len([d for d in EXPLANATIONS.iterdir() if d.is_dir()])
            meta["display_id"] = total
        except: meta["display_id"] = 0
    else:
        try:
            old_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            meta["created_at"] = old_meta.get("created_at", meta["updated_at"])
            meta["display_title"] = old_meta.get("display_title", req.topic[:25])
            meta["display_id"] = old_meta.get("display_id", 0)
        except: 
            meta["created_at"] = meta["updated_at"]
            meta["display_id"] = 0

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=4)
    
    task_prompt = f"Build or update a stunning visual explanation for: {req.topic}"
    if req.thread_id:
        task_prompt += f" (Existing instruction update: {req.topic})"

    system_prompt_override = f"""You are a master of visual communication.
Your goal is to build a STUNNING, THEMATIC single-file HTML website explaining: {req.topic}

IMPORTANT:
1. Always choose a matching theme (Minecraft, Elden Ring, Sci-Fi, etc).
2. Content ONLY: No footers, no social links, no 'Built by' credits.
3. Interactive: Include JS for dynamic elements.
4. Single File: All assets (CSS/JS) embedded in index.html.

At the very end of your response (after the file writing), provide a short, punchy TITLE for this explanation (max 4 words) in a separate line starting with 'TITLE: '."""

    class ExplainedRunner(AgentRunner):
        def _get_system_prompt(self):
            return system_prompt_override + "\n\n" + super()._get_system_prompt()

    def step_cb(event):
        task_data = ACTIVE_TASKS[task_id]
        event_type = event.get("type")
        
        detail = event.get("title") or event.get("detail", "")
        if event_type == "thinking":
            task_data["step"] = event.get("content", "Processing...")
            task_data["logs"].append({"type": "step", "msg": task_data["step"]})
        elif event_type == "write_file":
            path = event.get("path")
            task_data["logs"].append({"type": "action", "msg": f"Writing {path}..."})
            if path == "index.html":
                try:
                    p = thread_dir / "index.html"
                    if p.exists():
                        task_data["html"] = p.read_text(encoding="utf-8")
                except: pass
        elif event_type == "search_web":
            task_data["logs"].append({"type": "action", "msg": f"Searching: {event.get('query')}..."})
        elif event_type == "done":
            task_data["logs"].append({"type": "step", "msg": "Complete!"})

    try:
        runner = ExplainedRunner(
            task=task_prompt,
            workspace_path=str(thread_dir),
            nexus=nexus,
            step_callback=step_cb,
            model_id=req.model_id if req.model_id != "auto" else None,
            trace_id=task_id
        )
        
        full_result = await asyncio.to_thread(runner.run)
        
        # Extract title from agent result if found
        for line in full_result.splitlines():
            if line.strip().startswith("TITLE:"):
                stitle = line.replace("TITLE:", "").strip()
                if stitle:
                    meta["display_title"] = stitle
                    ACTIVE_TASKS[task_id]["display_title"] = stitle
                    break
        
        # Update meta again with the new title
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=4)

        index_path = thread_dir / "index.html"
        if index_path.exists():
            html = index_path.read_text(encoding="utf-8")
            ACTIVE_TASKS[task_id]["html"] = html
            ACTIVE_TASKS[task_id]["status"] = "completed"
        else:
            ACTIVE_TASKS[task_id]["status"] = "failed"
            ACTIVE_TASKS[task_id]["error"] = "Agent failed to produce index.html"
            
    except Exception as e:
        logger.error(f"Explained agent failed: {e}")
        ACTIVE_TASKS[task_id]["status"] = "failed"
        ACTIVE_TASKS[task_id]["error"] = str(e)
