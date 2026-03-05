import os
import sys
import uvicorn
import webbrowser
from dotenv import load_dotenv

# Add project root to sys.path for core imports
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from auto_rigger import AutoRigger

app = FastAPI(title="Specter Rigging Engine")

# Enable CORS for embedding
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIEWER_DIR = os.path.join(BASE_DIR, "viewer")
MODELS_DIR = os.path.join(BASE_DIR, "models")

@app.get("/api/models")
async def list_models():
    """List available avatar models."""
    models = []
    if os.path.exists(MODELS_DIR):
        for entry in os.scandir(MODELS_DIR):
            if entry.is_dir():
                config_path = os.path.join(entry.path, "avatar.specter.json")
                if os.path.exists(config_path):
                    models.append({
                        "id": entry.name,
                        "name": entry.name.replace("_", " ").title(),
                        "path": f"/models/{entry.name}/avatar.specter.json"
                    })
    return models

@app.post("/api/auto-rig")
async def auto_rig(file: UploadFile = File(...)):
    """Upload an image and auto-rig it using AI."""
    temp_path = os.path.join(MODELS_DIR, f"temp_{file.filename}")
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    with open(temp_path, "wb") as f:
        f.write(await file.read())
    
    try:
        rigger = AutoRigger()
        model_name = file.filename.split('.')[0] or "auto_rigged"
        rigger.process_model(temp_path, model_name)
        
        return JSONResponse({
            "status": "success",
            "model_id": model_name,
            "path": f"/models/{model_name}/avatar.specter.json"
        })
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

class GenerateRigRequest(BaseModel):
    prompt: str

@app.post("/api/generate-rig")
async def generate_rig_api(request: GenerateRigRequest):
    """Generate an avatar from a prompt and auto-rig it."""
    import uuid
    uid = uuid.uuid4().hex[:8]
    temp_path = os.path.join(MODELS_DIR, f"temp_gen_{uid}.png")
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    try:
        rigger = AutoRigger()
        model_name = f"generated_avatar_{uid}"
        
        # Generate the avatar image
        rigger.generate_avatar(request.prompt, temp_path)
        
        # Process and rig
        rigger.process_model(temp_path, model_name)
        
        return JSONResponse({
            "status": "success",
            "model_id": model_name,
            "path": f"/models/{model_name}/avatar.specter.json"
        })
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

# Mount static files (Viewer and Models)
app.mount("/viewer", StaticFiles(directory=VIEWER_DIR), name="viewer")
app.mount("/models", StaticFiles(directory=MODELS_DIR), name="models")

@app.get("/favicon.ico")
async def favicon():
    return JSONResponse({"status": "ok"})

@app.get("/", response_class=HTMLResponse)
async def get_index():
    with open(os.path.join(VIEWER_DIR, "index.html"), "r") as f:
        return f.read()

@app.get("/api/models")
async def list_models():
    """List available avatar models."""
    models = []
    if os.path.exists(MODELS_DIR):
        for entry in os.scandir(MODELS_DIR):
            if entry.is_dir():
                config_path = os.path.join(entry.path, "avatar.specter.json")
                if os.path.exists(config_path):
                    models.append({
                        "id": entry.name,
                        "name": entry.name.replace("_", " ").title(),
                        "path": f"/models/{entry.name}/avatar.specter.json"
                    })
    return models

def launch():
    port = 8001
    url = f"http://localhost:{port}"
    print(f"🚀 Specter Engine starting at {url}")
    # webbrowser.open(url) # Uncomment to auto-open
    uvicorn.run(app, host="0.0.0.0", port=port)

if __name__ == "__main__":
    launch()
