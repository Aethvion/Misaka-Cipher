import os
import sys
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import shutil
from datetime import datetime

# Add workspace root to path
WORKSPACE_ROOT = Path(__file__).parent.parent.parent
sys.path.append(str(WORKSPACE_ROOT))

from core.utils import get_logger

logger = get_logger("AethvionPhoto")

app = FastAPI(
    title="Aethvion Photo — Image Forge",
    description="Professional Image Editing Service",
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
DATA_DIR = WORKSPACE_ROOT / "data" / "image"
PROJECTS_DIR = DATA_DIR / "projects"
UPLOADS_DIR = DATA_DIR / "uploads"

for d in [PROJECTS_DIR, UPLOADS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Mount Viewer (will be implemented next)
VIEWER_DIR = APP_DIR / "viewer"
if VIEWER_DIR.exists():
    app.mount("/viewer", StaticFiles(directory=str(VIEWER_DIR)), name="viewer")

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
            "projects": PROJECTS_DIR.exists(),
            "uploads": UPLOADS_DIR.exists()
        }
    }

@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...)):
    """Upload an image to the workspace."""
    try:
        ext = Path(file.filename).suffix.lower()
        if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
            raise HTTPException(status_code=400, detail="Unsupported file format")
        
        filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        save_path = UPLOADS_DIR / filename
        
        with save_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {
            "filename": filename,
            "url": f"/api/files/uploads/{filename}",
            "size": save_path.stat().st_size
        }
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/remove-bg")
async def remove_background(filename: str = Form(...)):
    """Remove background using rembg."""
    try:
        input_path = UPLOADS_DIR / filename
        if not input_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        output_filename = f"nobg_{filename}"
        output_path = UPLOADS_DIR / output_filename
        
        # Integration with rembg
        try:
            from rembg import remove
            from PIL import Image
            import io
            
            with input_path.open("rb") as i:
                input_data = i.read()
                output_data = remove(input_data)
                
                with output_path.open("wb") as o:
                    o.write(output_data)
                    
            return {
                "success": True,
                "original": filename,
                "processed": output_filename,
                "url": f"/api/files/uploads/{output_filename}"
            }
        except ImportError:
            logger.warning("rembg not installed, skipping actual processing")
            return {"success": False, "error": "rembg not installed"}
            
    except Exception as e:
        logger.error(f"Background removal failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PHOTO_PORT", 8083))
    uvicorn.run(app, host="0.0.0.0", port=port)
