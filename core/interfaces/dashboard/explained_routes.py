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
ACTIVE_TASKS = {} # task_id -> {status, thread_id, html, error, topic, step, logs: []}

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
    if not index_path.exists():
        raise HTTPException(404, "Result not found")
    
    html = index_path.read_text(encoding="utf-8")
    return {"html": html, "thread_id": thread_id}

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
    if not meta_path.exists():
        meta["created_at"] = meta["updated_at"]
    else:
        try:
            old_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            meta["created_at"] = old_meta.get("created_at", meta["updated_at"])
        except: meta["created_at"] = meta["updated_at"]

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=4)
    
    task_prompt = f"Build or update a stunning visual explanation for: {req.topic}"
    if req.thread_id:
        task_prompt += f" (Existing instruction update: {req.topic})"

    system_prompt_override = f"""You are a master of visual communication and thematic web design.
Your goal is to build a STUNNING, FULLY INTERACTIVE single-file HTML website explaining: {req.topic}

THEMATIC STYLE:
- Analyze the topic and choose a visual style (e.g., Elden Ring theme, Minecraft theme).
- Use matching Google Fonts, custom color palettes, and thematic motifs.

CLEAN CONTENT POLICY (CRITICAL):
- DO NOT include footer credits like 'Built with...', 'Developed by...', or copyright notices.
- DO NOT include social media links or placeholder icons for social platforms.
- DO NOT include meta-text about the Aethvion system or current date/time.
- Focus ONLY on the explanation content and its thematic presentation.

REQUIREMENTS:
1. Research: Use search_web for deep information.
2. Design: Solid backgrounds, glassmorphism, smooth animations.
3. Architecture: Hero, Key Concepts, Deep Dive, Summary.
4. Interactivity: JS-driven dynamic elements.
5. Single File: All code (HTML, CSS, JS) must be in index.html.

Call 'done' with a summary after writing index.html."""

    class ExplainedRunner(AgentRunner):
        def _get_system_prompt(self):
            return system_prompt_override + "\n\n" + super()._get_system_prompt()

    def step_cb(event):
        task_data = ACTIVE_TASKS[task_id]
        event_type = event.get("type")
        
        # Log management
        detail = event.get("title") or event.get("detail", "")
        if event_type == "thinking":
            task_data["step"] = event.get("content", "Processing...")
            task_data["logs"].append({"type": "step", "msg": task_data["step"]})
        elif event_type == "write_file":
            path = event.get("path")
            task_data["logs"].append({"type": "action", "msg": f"Writing {path}..."})
            # Real-time HTML capture
            if path == "index.html":
                try:
                    p = thread_dir / "index.html"
                    if p.exists():
                        task_data["html"] = p.read_text(encoding="utf-8")
                except: pass
        elif event_type == "search_web":
            task_data["logs"].append({"type": "action", "msg": f"Searching: {event.get('query')}..."})
        elif event_type == "done":
            task_data["logs"].append({"type": "step", "msg": "Generation Complete!"})

        # Cap logs
        if len(task_data["logs"]) > 50:
            task_data["logs"] = task_data["logs"][-50:]

    try:
        runner = ExplainedRunner(
            task=task_prompt,
            workspace_path=str(thread_dir),
            nexus=nexus,
            step_callback=step_cb,
            model_id=req.model_id if req.model_id != "auto" else None,
            trace_id=task_id
        )
        
        await asyncio.to_thread(runner.run)
        
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
