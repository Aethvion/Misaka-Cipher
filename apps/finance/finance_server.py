import os
import sys
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import uvicorn
import shutil
import json
from datetime import datetime

# Add workspace root to path
WORKSPACE_ROOT = Path(__file__).parent.parent.parent
sys.path.append(str(WORKSPACE_ROOT))
from core.utils.port_manager import PortManager
from core.utils import get_logger

logger = get_logger("AethvionFinance")

app = FastAPI(
    title="Aethvion Finance — Financial Hub",
    description="Professional Financial Tracking & Analysis",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories
APP_DIR = Path(__file__).parent
DATA_DIR = WORKSPACE_ROOT / "data" / "finance"
PROJECTS_DIR = DATA_DIR / "projects"

for d in [PROJECTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Mount Viewer
VIEWER_DIR = APP_DIR / "viewer"
@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = VIEWER_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Aethvion Finance</h1><p>Viewer not found.</p>", status_code=404)

if VIEWER_DIR.exists():
    (VIEWER_DIR / "css").mkdir(parents=True, exist_ok=True)
    (VIEWER_DIR / "js").mkdir(parents=True, exist_ok=True)
    app.mount("/css", StaticFiles(directory=str(VIEWER_DIR / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(VIEWER_DIR / "js")), name="js")

class StatusResponse(BaseModel):
    status: str
    version: str
    uptime: str
    directories: Dict[str, bool]

@app.get("/api/status", response_model=StatusResponse)
async def get_status():
    return {
        "status": "online",
        "version": "1.0.0",
        "uptime": datetime.now().isoformat(),
        "directories": {
            "projects": PROJECTS_DIR.exists()
        }
    }

class ProjectSave(BaseModel):
    name: str
    data: str # JSON string

@app.post("/api/save-project")
async def save_project(project: ProjectSave):
    """Save an .aethfinance project to the server."""
    try:
        filename = project.name.replace(" ", "_").replace("/", "_").replace("\\", "_")
        if not filename.endswith(".aethfinance"):
            filename += ".aethfinance"
        
        save_path = PROJECTS_DIR / filename
        save_path.write_text(project.data, encoding="utf-8")
        
        return {
            "success": True,
            "filename": filename,
            "path": str(save_path)
        }
    except Exception as e:
        logger.error(f"Save project failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects")
async def list_projects():
    """List all saved projects on the server."""
    try:
        projects = []
        for p in PROJECTS_DIR.glob("*.aethfinance"):
            stats = p.stat()
            projects.append({
                "name": p.stem,
                "filename": p.name,
                "size": stats.st_size,
                "modified": datetime.fromtimestamp(stats.st_mtime).isoformat()
            })
        return {"projects": sorted(projects, key=lambda x: x['modified'], reverse=True)}
    except Exception as e:
        logger.error(f"List projects failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/load-project/{filename}")
async def load_project(filename: str):
    """Load a specific project from the server."""
    try:
        path = PROJECTS_DIR / filename
        if not path.exists():
            raise HTTPException(status_code=404, detail="Project not found")
        return {"data": path.read_text(encoding="utf-8")}
    except Exception as e:
        logger.error(f"Load project failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    base_port = int(os.getenv("FINANCE_PORT", 8085))
    port = PortManager.bind_port("Aethvion Finance", base_port)
    logger.info(f"💰 Aethvion Finance Service → http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
