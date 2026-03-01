import os
import uvicorn
import webbrowser
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

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

# Mount static files (Viewer and Models)
app.mount("/viewer", StaticFiles(directory=VIEWER_DIR), name="viewer")
app.mount("/models", StaticFiles(directory=MODELS_DIR), name="models")

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
