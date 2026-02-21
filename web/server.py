"""
Misaka Cipher - FastAPI Web Server
REST API and WebSocket server for web dashboard
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from pathlib import Path
import asyncio
import json
import logging
import sys
from datetime import datetime

from nexus_core import NexusCore
from factory import AgentFactory
from forge import ToolForge
from orchestrator import MasterOrchestrator
from utils import get_logger
from web.package_routes import router as package_router
from web.task_routes import router as task_router
from web.tool_routes import router as tool_router
from web.memory_routes import router as memory_router
from web.registry_routes import router as registry_router
from web.usage_routes import router as usage_router
from web.arena_routes import router as arena_router

logger = get_logger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Misaka Cipher - Nexus Portal",
    description="Autonomous AI Orchestration System",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include package management routes
app.include_router(package_router)

# Include task queue routes
app.include_router(task_router)

# Include tool registry routes
app.include_router(tool_router)

# Include memory routes
app.include_router(memory_router)

# Include registry routes
app.include_router(registry_router)

# Include usage routes
app.include_router(usage_router)

# Include arena routes
app.include_router(arena_router)

# Include image routes
from web.image_routes import router as image_router
app.include_router(image_router)

# Include research routes
from web.advanced_aiconv_routes import router as adv_aiconv_router
app.include_router(adv_aiconv_router)

# Global instances (initialized on startup)
orchestrator: Optional[MasterOrchestrator] = None
nexus: Optional[NexusCore] = None
factory: Optional[AgentFactory] = None
forge: Optional[ToolForge] = None
main_event_loop = None

# WebSocket connection manager
class ConnectionManager:
    """Manages WebSocket connections."""
    
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {
            'chat': [],
            'logs': [],
            'agents': []
        }
    
    async def connect(self, websocket: WebSocket, channel: str):
        """Connect a new WebSocket client."""
        await websocket.accept()
        if channel not in self.active_connections:
            self.active_connections[channel] = []
        self.active_connections[channel].append(websocket)
        # logger.info(f"WebSocket connected to {channel} (total: {len(self.active_connections[channel])})")
    
    def disconnect(self, websocket: WebSocket, channel: str):
        """Disconnect a WebSocket client."""
        if channel in self.active_connections and websocket in self.active_connections[channel]:
            self.active_connections[channel].remove(websocket)
            # logger.info(f"WebSocket disconnected from {channel} (remaining: {len(self.active_connections[channel])})")
    
    async def broadcast(self, message: dict, channel: str):
        """Broadcast message to all clients on a channel."""
        if channel not in self.active_connections:
            return
        
        disconnected = []
        for connection in self.active_connections[channel]:
            try:
                await connection.send_json(message)
            except Exception as e:
                # Only log real errors, not just disconnects (which might show as various things)
                logger.error(f"Error broadcasting to {channel}: {type(e).__name__}: {e}")
                disconnected.append(connection)
        
        # Remove disconnected clients
        for conn in disconnected:
            self.disconnect(conn, channel)

manager = ConnectionManager()


# WebSocket Log Handler
class WebSocketLogHandler(logging.Handler):
    """Custom handler to pipe logs to WebSocket."""
    
    def emit(self, record):
        try:
            # Skip filtered logs here as well to save bandwidth?
            # Or let frontend handle it. Let's filter obvious noise here.
            msg = self.format(record)
            
            # Simple pre-filter for Uvicorn access logs which are very noisy
            if "GET /api/system/status" in msg or "GET /api/workspace/files" in msg:
                return
                
            log_entry = {
                "type": "log",
                "level": record.levelname,
                "message": msg,
                "source": record.name,
                "timestamp": datetime.now().isoformat()
            }
            
            # Broadcast thread-safely
            if main_event_loop and main_event_loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(log_entry, "logs"),
                    main_event_loop
                )
        except Exception:
            self.handleError(record)


# Request/Response models
class ChatMessage(BaseModel):
    """Chat message from user."""
    message: str
    trace_id: Optional[str] = None
    thread_id: Optional[str] = None


class ChatResponse(BaseModel):
    """Chat response from orchestrator."""
    response: str
    trace_id: str
    actions_taken: List[str]
    tools_forged: List[str]
    agents_spawned: List[str]
    execution_time: float
    success: bool
    model_id: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None


class MemorySearchRequest(BaseModel):
    """Memory search request."""
    query: str
    domain: Optional[str] = None
    limit: int = 10


# Startup/Shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize system on startup."""
    global orchestrator, nexus, factory, forge, main_event_loop
    
    logger.info("Initializing Misaka Cipher Web Server...")
    
    # Capture main loop for thread-safe broadcasting
    main_event_loop = asyncio.get_running_loop()
    
    # Attach WebSocket Log Handler to Root Logger
    root_logger = logging.getLogger()
    ws_handler = WebSocketLogHandler()
    ws_handler.setLevel(logging.INFO)
    formatter = logging.Formatter('%(message)s') # Simplified format for UI
    ws_handler.setFormatter(formatter)
    root_logger.addHandler(ws_handler)
    
    logger.info("✓ WebSocket Log Streamer attached")
    
    try:
        # Initialize Nexus Core
        nexus = NexusCore()
        nexus.initialize()
        app.state.nexus = nexus
        logger.info("✓ Nexus Core initialized")
        
        # Initialize Factory
        factory = AgentFactory(nexus)
        logger.info("✓ Factory initialized")
        
        # Initialize Forge
        forge = ToolForge(nexus)
        logger.info("✓ Forge initialized")
        
        # Initialize Orchestrator
        orchestrator = MasterOrchestrator(nexus, factory, forge)
        
        # Set up step broadcasting callback
        def broadcast_step_callback(step_data: Dict):
            """Thread-safe callback for orchestrator steps."""
            if main_event_loop:
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(step_data, "chat"),
                    main_event_loop
                )
        
        orchestrator.set_step_callback(broadcast_step_callback)
        logger.info("✓ Master Orchestrator initialized (with step broadcasting)")
        
        # Start background workers
        from workers.package_installer import get_installer_worker
        installer_worker = get_installer_worker()
        installer_worker.start()
        logger.info("✓ Package Installer Worker started")
        
        # Initialize and start task queue manager
        from orchestrator.task_queue import get_task_queue_manager
        task_manager = get_task_queue_manager(orchestrator, max_workers=4)
        await task_manager.start()
        logger.info("✓ Task Queue Manager started (4 workers)")
        
        logger.info("Misaka Cipher Web Server ready!")
        
    except Exception as e:
        logger.error(f"Startup failed: {str(e)}", exc_info=True)
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Shutting down Misaka Cipher Web Server...")


# Static files (dashboard)
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


# Preferences API
class PreferenceUpdate(BaseModel):
    key: str
    value: Any

@app.get("/api/preferences")
async def get_preferences():
    """Get all user preferences."""
    try:
        from workspace.preferences_manager import get_preferences_manager
        prefs = get_preferences_manager()
        return prefs.get_all()
    except Exception as e:
        logger.error(f"Failed to get preferences: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/preferences/get")
async def get_preference_value(key: str):
    """Get a specific preference value."""
    try:
        from workspace.preferences_manager import get_preferences_manager
        prefs = get_preferences_manager()
        value = prefs.get(key)
        return {"key": key, "value": value}
    except Exception as e:
        logger.error(f"Failed to get preference {key}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/preferences")
async def update_preferences(updates: Dict[str, Any]):
    """Update multiple preferences."""
    try:
        from workspace.preferences_manager import get_preferences_manager
        prefs = get_preferences_manager()
        prefs.update(updates)
        return {"status": "success", "preferences": prefs.get_all()}
    except Exception as e:
        logger.error(f"Failed to update preferences: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/preferences/{key}")
async def set_preference(key: str, update: PreferenceUpdate):
    """Set a specific preference key."""
    try:
        from workspace.preferences_manager import get_preferences_manager
        prefs = get_preferences_manager()
        # Verify key matches body (though body is authoritative here)
        prefs.set(update.key, update.value)
        return {"status": "success", "key": key, "value": update.value}
    except Exception as e:
        logger.error(f"Failed to set preference {key}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Routes
@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve main dashboard."""
    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    else:
        return HTMLResponse("""
        <html>
            <head><title>Misaka Cipher</title></head>
            <body>
                <h1>Misaka Cipher - Nexus Portal</h1>
                <p>Dashboard under construction. Static files not found.</p>
                <p>API available at: <a href="/docs">/docs</a></p>
            </body>
        </html>
        """)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "components": {
            "orchestrator": orchestrator is not None,
            "nexus": nexus is not None and nexus._initialized,
            "factory": factory is not None,
            "forge": forge is not None
        }
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(message: ChatMessage):
    """
    Send message to Master Orchestrator.
    
    The orchestrator will analyze intent and autonomously coordinate
    Factory, Forge, and Memory Tier as needed.
    """
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
@app.post("/api/chat", response_model=ChatResponse)
async def chat(message: ChatMessage):
    """
    Send message to Master Orchestrator.
    
    The orchestrator will analyze intent and autonomously coordinate
    Factory, Forge, and Memory Tier as needed.
    """
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
    try:
        # Submit task to queue for persistence
        from orchestrator.task_queue import get_task_queue_manager
        task_manager = get_task_queue_manager()
        
        # Use provided thread_id or default
        thread_id = message.thread_id or "default"
        
        # Submit task
        task_id = await task_manager.submit_task(
            prompt=message.message,
            thread_id=thread_id
        )
        
        # Poll for result (timeout after 60s)
        # We need to wait because this API endpoint expects a synchronous-like response
        # In the future, clients should use /api/tasks/submit and poll manually
        start_time = datetime.now()
        while (datetime.now() - start_time).total_seconds() < 60:
            task = task_manager.get_task(task_id)
            if task and task.status == "completed":
                result_dict = task.result
                
                # Broadcast to WebSocket clients (if not already done by worker)
                # Worker doesn't broadcast yet, so we do it here? 
                # Actually, duplicate broadcast might be annoying.
                # But since the worker logic doesn't broadcast to "chat" channel explicitly in the simplified version...
                # Let's keep the broadcast here for now to ensure UI updates if they listen to WS.
                # However, the worker MIGHT be updated later to broadcast.
                
                # Construct response
                return ChatResponse(
                    response=result_dict.get('response'),
                    trace_id=task.id,
                    actions_taken=result_dict.get('actions_taken', []),
                    tools_forged=result_dict.get('tools_forged', []),
                    agents_spawned=result_dict.get('agents_spawned', []),
                    execution_time=result_dict.get('execution_time', 0),
                    success=result_dict.get('success', True),
                    model_id=result_dict.get('model_id'),
                    usage=result_dict.get('usage')
                )
                
            elif task and task.status == "failed":
                raise HTTPException(status_code=500, detail=f"Task execution failed: {task.error}")
                
            await asyncio.sleep(0.5)
            
        # Timeout
        raise HTTPException(status_code=504, detail="Task execution timed out")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat endpoint error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/system/status")
async def get_system_status():
    """Get lightweight system status (Nexus, Agents, Tools, Vitals)."""
    if not nexus:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        status = nexus.get_status()
        
        # System Vitals (CPU/RAM)
        vitals = {
            "cpu_percent": 0,
            "ram_percent": 0,
            "ram_used_gb": 0,
            "ram_total_gb": 0
        }
        
        try:
            import psutil
            vitals["cpu_percent"] = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            vitals["ram_percent"] = mem.percent
            vitals["ram_used_gb"] = round(mem.used / (1024**3), 1)
            vitals["ram_total_gb"] = round(mem.total / (1024**3), 1)
        except ImportError:
            pass
            
        # Daily Usage
        try:
            from workspace.usage_tracker import get_usage_tracker
            tracker = get_usage_tracker()
            usage_today = tracker.get_today_summary()
        except ImportError:
            usage_today = {"tokens": 0, "cost": 0.0}
        
        return {
            "nexus": {
                "initialized": status['initialized'],
                "active_traces": status['active_traces'],
                "firewall": status['firewall'],
                "providers": status['providers']
            },
            "factory": {
                "active_agents": factory.registry.get_active_count(),
                "total_agents": len(factory.registry.get_all_agents())
            },
            "forge": {
                "total_tools": len(forge.registry.list_tools())
            },
            "vitals": vitals,
            "usage_today": usage_today
        }
    except Exception as e:
        logger.error(f"System status error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/system/telemetry/sync")
async def sync_system_telemetry():
    """Calculate heavy metrics (Disk, DB) and save to static JSON."""
    try:
        # Calculate Disk Usage (Project & DB)
        project_size = 0
        db_size = 0
        
        try:
            root_dir = Path(__file__).parent.parent
            for path in root_dir.rglob('*'):
                if path.is_file():
                    size = path.stat().st_size
                    project_size += size
                    if 'chroma' in str(path) or '.db' in path.name:
                        db_size += size
        except Exception:
            pass 

        # Memory/Episodic Count
        episodic_count = 0
        if orchestrator and hasattr(orchestrator, 'episodic_memory') and hasattr(orchestrator.episodic_memory, 'collection'):
            episodic_count = orchestrator.episodic_memory.collection.count()

        # Construct Metrics Data
        metrics = {
            "system": {
                "project_size_bytes": project_size,
                "db_size_bytes": db_size,
                "last_sync": datetime.now().isoformat()
            },
            "memory": {
                "episodic_count": episodic_count
            }
        }

        # Save to static asset
        metrics_path = Path(__file__).parent / "static" / "assets" / "system-metrics.json"
        metrics_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(metrics_path, 'w') as f:
            json.dump(metrics, f, indent=2)
            
        return metrics

    except Exception as e:
        logger.error(f"Telemetry sync error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/active")
async def get_active_agents():
    """Get list of currently active agents."""
    if not factory:
        raise HTTPException(status_code=503, detail="Factory not initialized")
    
    agents = factory.registry.get_all_agents()
    return {
        "count": len(agents),
        "agents": agents
    }


@app.post("/api/memory/search")
async def search_memory(request: MemorySearchRequest):
    """Search episodic memory."""
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
    try:
        results = orchestrator.query_memory(
            query=request.query,
            trace_id="WEB_SEARCH",
            domain=request.domain
        )
        
        # Convert MemoryEntry objects to dicts
        serialized_results = []
        for r in results[:request.limit]:
            try:
                serialized_results.append({
                    "memory_id": r.memory_id if hasattr(r, 'memory_id') else str(r),
                    "summary": r.summary if hasattr(r, 'summary') else str(r),
                    "domain": r.domain if hasattr(r, 'domain') else "unknown",
                    "timestamp": r.timestamp if hasattr(r, 'timestamp') else datetime.now().isoformat(),
                    "event_type": r.event_type if hasattr(r, 'event_type') else "unknown"
                })
            except Exception:
                # Skip problematic entries
                continue
        
        return {
            "count": len(serialized_results),
            "results": serialized_results
        }
    except Exception as e:
        logger.error(f"Memory search error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/workspace/files")
async def list_workspace_files(domain: Optional[str] = None):
    """List output files in workspace."""
    try:
        from workspace import get_workspace_manager
        
        workspace = get_workspace_manager()
        outputs = workspace.list_outputs(domain=domain)
        
        return {
            "count": len(outputs),
            "files": [output.to_dict() for output in outputs]
        }
    except Exception as e:
        logger.error(f"Workspace file listing error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/workspace/files/{domain}/{filename}")
async def download_workspace_file(domain: str, filename: str):
    """Download a specific file from workspace."""
    try:
        from workspace import get_workspace_manager
        
        workspace = get_workspace_manager()
        file_path = workspace.get_output_path(domain, filename)
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {domain}/{filename}")
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type="application/octet-stream"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File download error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/traces/{trace_id}")
async def get_trace_details(trace_id: str):
    """Get details for a specific trace ID."""
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
    # Search memories for this trace
    from memory import get_episodic_memory
    episodic = get_episodic_memory()
    
    memories = episodic.get_by_trace_id(trace_id)
    
    if not memories:
        raise HTTPException(status_code=404, detail=f"No data found for trace {trace_id}")
    
    return {
        "trace_id": trace_id,
        "memory_count": len(memories),
        "memories": [
            {
                "memory_id": m.memory_id,
                "summary": m.summary,
                "event_type": m.event_type,
                "timestamp": m.timestamp,
                "domain": m.domain
            }
            for m in memories
        ]
    }


# WebSocket endpoints
@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """WebSocket for bidirectional chat."""
    await manager.connect(websocket, "chat")
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            
            if "message" in data:
                # Process through orchestrator in thread pool to avoid blocking
                result = await asyncio.to_thread(orchestrator.process_message, data["message"])
                
                # Send response
                await websocket.send_json({
                    "type": "response",
                    "trace_id": result.trace_id,
                    "response": result.response,
                    "actions": result.actions_taken,
                    "success": result.success
                })
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, "chat")


@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    """WebSocket for real-time log streaming."""
    await manager.connect(websocket, "logs")
    try:
        while True:
            # Keep connection alive with periodic heartbeat
            await asyncio.sleep(10)
            try:
                await websocket.send_json({"type": "heartbeat", "timestamp": datetime.now().isoformat()})
            except (RuntimeError, WebSocketDisconnect):
                break
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, "logs")


@app.websocket("/ws/agents")
async def websocket_agents(websocket: WebSocket):
    """WebSocket for active agents updates."""
    await manager.connect(websocket, "agents")
    try:
        while True:
            # Send active agents every 2 seconds
            agents = factory.registry.get_all_agents()
            await websocket.send_json({
                "type": "agents_update",
                "count": len(agents),
                "agents": agents,
                "timestamp": datetime.now().isoformat()
            })
            await asyncio.sleep(2)
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, "agents")


# Utility function to broadcast logs (called from orchestrator/agents)
async def broadcast_log(message: str, level: str = "info"):
    """Broadcast log message to WebSocket clients."""
    await manager.broadcast({
        "type": "log",
        "level": level,
        "message": message,
        "timestamp": datetime.now().isoformat()
    }, "logs")
