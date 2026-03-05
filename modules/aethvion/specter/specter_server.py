import os
import sys
import uuid
import uvicorn
from dotenv import load_dotenv

# Add project root to sys.path for core imports
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Literal
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from core.providers.provider_manager import ProviderManager
from pipelines.simple_pipeline import SimplePipeline
from pipelines.sheet_pipeline import SheetPipeline
from pipelines.local_pipeline import LocalPipeline

app = FastAPI(title="Specter Rigging Engine")
pm = ProviderManager()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIEWER_DIR = os.path.join(BASE_DIR, "viewer")
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_google_provider_and_model(chat_model: Optional[str] = None):
    """Always return the Google AI provider and a resolved model ID."""
    provider = pm.get_provider("google_ai")
    if not provider:
        raise ValueError("Google AI provider not initialized.")
    model_id = chat_model or provider.config.model
    # If caller passed a non-google model_id, fall back to default
    if model_id and pm.model_to_provider_map.get(model_id) != "google_ai":
        model_id = provider.config.model
    return provider, model_id


def _get_image_provider_and_model(image_model: Optional[str] = None):
    """Return the best available image provider and model ID."""
    image_provider = None
    target_model = None

    if image_model:
        provider_name = pm.model_to_provider_map.get(image_model)
        if provider_name:
            image_provider = pm.get_provider(provider_name)
            target_model = image_model

    if not image_provider:
        image_provider = pm.get_provider_for_capability("IMAGE")
    if not image_provider:
        image_provider = pm.get_provider("openai") or pm.get_provider("google_ai")
    if not image_provider:
        raise ValueError("No viable image provider found.")

    if not target_model:
        target_model = "imagen-3.0-generate-002" if image_provider.config.name == "google_ai" else "dall-e-3"

    return image_provider, target_model


# ---------------------------------------------------------------------------
# API: List Models
# ---------------------------------------------------------------------------

@app.get("/api/models")
async def list_models():
    models = []
    if os.path.exists(MODELS_DIR):
        for entry in os.scandir(MODELS_DIR):
            if entry.is_dir():
                config_path = os.path.join(entry.path, "avatar.specter.json")
                if os.path.exists(config_path):
                    # Count texture assets
                    tex_dir = os.path.join(entry.path, "textures")
                    asset_count = 0
                    if os.path.exists(tex_dir):
                        asset_count = len([f for f in os.listdir(tex_dir) if f.endswith(".png")])
                    models.append({
                        "id": entry.name,
                        "name": entry.name.replace("_", " ").title(),
                        "path": f"/models/{entry.name}/avatar.specter.json",
                        "asset_count": asset_count
                    })
    return models


@app.get("/api/provider-models")
async def get_provider_models():
    chat_models, image_models = [], []
    for model_id, info in pm.model_descriptor_map.items():
        caps = [c.upper() for c in info.get('capabilities', [])]
        entry = {"id": model_id, "provider": info.get('provider'), "description": info.get('description', '')}
        if "CHAT" in caps:
            chat_models.append(entry)
        if "IMAGE" in caps:
            image_models.append(entry)
    return JSONResponse({"chat_models": chat_models, "image_models": image_models})


# ---------------------------------------------------------------------------
# API: Simple Pipeline — Upload image to rig
# ---------------------------------------------------------------------------

@app.post("/api/simple/upload-and-rig")
async def simple_upload_and_rig(
    file: UploadFile = File(...),
    chat_model: Optional[str] = Form(None),
    instructions: Optional[str] = Form(None),
):
    """Simple mode: user uploads an image, we vision-slice and rig it."""
    uid = uuid.uuid4().hex[:8]
    model_name = f"simple_{file.filename.split('.')[0]}_{uid}"
    output_dir = os.path.join(MODELS_DIR, model_name)
    os.makedirs(output_dir, exist_ok=True)

    upload_path = os.path.join(output_dir, "upload.png")
    with open(upload_path, "wb") as f:
        f.write(await file.read())

    try:
        provider, model_id = _get_google_provider_and_model(chat_model)
        pipeline = SimplePipeline(provider, model_id)
        rig_path = pipeline.generate_rig_from_image(upload_path, output_dir, model_name, instructions)
        return JSONResponse({"status": "success", "model_id": model_name, "path": f"/models/{model_name}/avatar.specter.json"})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# API: Sheet Pipeline — Phase 1: generate concept
# ---------------------------------------------------------------------------

class GenerateConceptRequest(BaseModel):
    prompt: str
    image_model: Optional[str] = None
    pipeline: Literal["simple", "sheet", "local"] = "sheet"


@app.post("/api/generate-concept")
async def generate_concept_api(request: GenerateConceptRequest):
    """Generate the first-stage concept image (Sprite Sheet for sheet mode)."""
    uid = uuid.uuid4().hex[:8]
    model_name = f"concept_{uid}"
    output_dir = os.path.join(MODELS_DIR, model_name)
    os.makedirs(output_dir, exist_ok=True)
    concept_path = os.path.join(output_dir, "concept.png")

    try:
        if request.pipeline == "local":
            provider, model_id = _get_google_provider_and_model()
            local_url = os.getenv("LOCAL_SD_URL", "http://127.0.0.1:7860")
            pip = LocalPipeline(provider, model_id, backend="a1111", base_url=local_url)
            if not pip.check_connection():
                return JSONResponse({"status": "error", "message": f"Local SD server not reachable at {local_url}. Make sure it's running."}, status_code=503)
            pip.generate_concept(request.prompt, concept_path)
        else:
            # Both simple & sheet use the online image provider for concept generation
            image_provider, image_model = _get_image_provider_and_model(request.image_model)
            provider, model_id = _get_google_provider_and_model()
            pip = SheetPipeline(provider, image_provider, model_id, image_model)
            pip.generate_concept(request.prompt, concept_path)

        return JSONResponse({
            "status": "success",
            "concept_id": model_name,
            "concept_path": f"/models/{model_name}/concept.png",
            "pipeline": request.pipeline
        })
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# API: Phase 2 — generate rig from concept
# ---------------------------------------------------------------------------

class GenerateRigRequest(BaseModel):
    concept_path: str   # e.g. /models/concept_abc/concept.png
    pipeline: Literal["simple", "sheet", "local"] = "sheet"
    chat_model: Optional[str] = None
    instructions: Optional[str] = None


@app.post("/api/generate-rig-modular")
async def generate_rig_modular_api(request: GenerateRigRequest):
    """Phase 2: Slice and rig the concept image using the selected pipeline."""
    try:
        parts = request.concept_path.split('/')
        model_name = parts[2] if len(parts) >= 3 else f"rigged_{uuid.uuid4().hex[:8]}"
        output_dir = os.path.join(MODELS_DIR, model_name)
        concept_abs = os.path.join(output_dir, "concept.png")

        if not os.path.exists(concept_abs):
            return JSONResponse({"status": "error", "message": "Concept image not found."}, status_code=404)

        provider, model_id = _get_google_provider_and_model(request.chat_model)

        if request.pipeline == "sheet":
            # SheetPipeline needs image provider but we don't generate new images in phase 2
            image_provider, image_model = _get_image_provider_and_model()
            pip = SheetPipeline(provider, image_provider, model_id, image_model)
            rig_path = pip.generate_rig_from_sheet(concept_abs, output_dir, model_name, request.instructions)

        elif request.pipeline == "local":
            local_url = os.getenv("LOCAL_SD_URL", "http://127.0.0.1:7860")
            pip = LocalPipeline(provider, model_id, backend="a1111", base_url=local_url)
            rig_path = pip.generate_rig_from_concept(concept_abs, output_dir, model_name, request.instructions)

        else:
            # simple mode: re-use the uploaded / concept image as-is
            pip = SimplePipeline(provider, model_id)
            rig_path = pip.generate_rig_from_image(concept_abs, output_dir, model_name, request.instructions)

        return JSONResponse({"status": "success", "model_id": model_name, "path": f"/models/{model_name}/avatar.specter.json"})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# API: Remove Background (non-destructive, per layer)
# ---------------------------------------------------------------------------

class RemoveBgRequest(BaseModel):
    model_id: str
    layer_id: str   # The part name e.g. "head"


@app.post("/api/remove-background")
async def remove_background_api(request: RemoveBgRequest):
    """
    Apply background removal to a single layer texture.
    Non-destructive: saves output as {layer_id}_nobg.png and updates the
    avatar.specter.json texture pointer. _raw.png is NEVER modified.
    """
    import json
    from pipelines.utils import remove_background

    model_dir = os.path.join(MODELS_DIR, request.model_id)
    tex_dir   = os.path.join(model_dir, "textures")
    raw_path  = os.path.join(tex_dir, f"{request.layer_id}_raw.png")
    nobg_path = os.path.join(tex_dir, f"{request.layer_id}_nobg.png")

    # Source must exist (_raw preferred, fall back to .png for older models)
    if not os.path.exists(raw_path):
        raw_path = os.path.join(tex_dir, f"{request.layer_id}.png")
    if not os.path.exists(raw_path):
        return JSONResponse({"status": "error", "message": "Source texture not found."}, status_code=404)

    try:
        # Generate nobg — never touch raw
        remove_background(raw_path, nobg_path)

        # Update the rig JSON to point this part at the nobg texture
        rig_path = os.path.join(model_dir, "avatar.specter.json")
        if os.path.exists(rig_path):
            with open(rig_path, "r", encoding="utf-8") as f:
                config = json.load(f)
            for part in config.get("parts", []):
                if part["id"] == request.layer_id:
                    # Store the original texture path the first time so restore can find it
                    if "original_texture" not in part:
                        part["original_texture"] = part.get("texture", f"textures/{request.layer_id}.png")
                    part["texture"] = f"textures/{request.layer_id}_nobg.png"
                    break
            with open(rig_path, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=4)

        return JSONResponse({
            "status": "success",
            "active": "nobg",
            "texture": f"/models/{request.model_id}/textures/{request.layer_id}_nobg.png"
        })
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.post("/api/restore-background")
async def restore_background_api(request: RemoveBgRequest):
    """
    Restore the original (raw) texture for a layer.
    Updates the rig JSON pointer back to _raw.png. The _nobg.png is kept on disk.
    """
    import json

    model_dir = os.path.join(MODELS_DIR, request.model_id)
    tex_dir   = os.path.join(model_dir, "textures")
    raw_path  = os.path.join(tex_dir, f"{request.layer_id}_raw.png")

    if not os.path.exists(raw_path):
        raw_path = os.path.join(tex_dir, f"{request.layer_id}.png")
    if not os.path.exists(raw_path):
        return JSONResponse({"status": "error", "message": "Raw texture not found."}, status_code=404)

    try:
        rig_path = os.path.join(model_dir, "avatar.specter.json")
        restore_tex = f"textures/{request.layer_id}_raw.png"  # fallback
        if os.path.exists(rig_path):
            with open(rig_path, "r", encoding="utf-8") as f:
                config = json.load(f)
            for part in config.get("parts", []):
                if part["id"] == request.layer_id:
                    # Use stored original if available (preserves the real original name)
                    restore_tex = part.get("original_texture", restore_tex)
                    part["texture"] = restore_tex
                    # Remove the helper key so it doesn't clutter the file
                    part.pop("original_texture", None)
                    break
            with open(rig_path, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=4)

        # Derive the web-accessible URL from the relative path stored in JSON
        tex_url = f"/models/{request.model_id}/{restore_tex}"
        return JSONResponse({
            "status": "success",
            "active": "raw",
            "texture": tex_url
        })
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)




# ---------------------------------------------------------------------------
# API: Per-layer Bone / Rig Regeneration
# ---------------------------------------------------------------------------

class RegenerateBonesRequest(BaseModel):
    model_id: str
    layer_id: Optional[str] = None   # None = regenerate all layers
    instructions: Optional[str] = None
    chat_model: Optional[str] = None


@app.post("/api/regenerate-bones")
async def regenerate_bones_api(request: RegenerateBonesRequest):
    """Ask the LLM to regenerate physics/bone mappings for one or all layers."""
    import json
    from pipelines.utils import generate_rig

    rig_path = os.path.join(MODELS_DIR, request.model_id, "avatar.specter.json")
    if not os.path.exists(rig_path):
        return JSONResponse({"status": "error", "message": "Model not found."}, status_code=404)

    try:
        with open(rig_path, "r", encoding="utf-8") as f:
            config = json.load(f)

        provider, model_id = _get_google_provider_and_model(request.chat_model)

        # Filter to just the target layer if specified
        parts = config.get("parts", [])
        if request.layer_id:
            target_parts = [p for p in parts if p["id"] == request.layer_id]
            if not target_parts:
                return JSONResponse({"status": "error", "message": f"Layer '{request.layer_id}' not found."}, status_code=404)
        else:
            target_parts = parts

        # Get fresh rig logic from AI for these parts
        new_config = generate_rig(target_parts, provider, model_id, request.instructions)

        if request.layer_id:
            # Merge: keep existing params/mappings for OTHER layers, replace only current layer's entries
            layer_params = new_config.get("params", {})
            layer_mappings = [m for m in new_config.get("mappings", []) if m.get("layer") == request.layer_id]
            layer_anims = new_config.get("animations", {})

            # Remove old mappings for this layer
            existing_mappings = [m for m in config.get("mappings", []) if m.get("layer") != request.layer_id]
            # Remove old params that target this layer (params named with layer id)
            existing_params = {k: v for k, v in config.get("params", {}).items()
                               if request.layer_id.lower() not in k.lower()}

            config["params"] = {**existing_params, **layer_params}
            config["mappings"] = existing_mappings + layer_mappings
            # Merge animations
            config.setdefault("animations", {}).update(layer_anims)
        else:
            # Full replacement
            config["params"] = new_config.get("params", config.get("params", {}))
            config["mappings"] = new_config.get("mappings", config.get("mappings", []))
            config["animations"] = new_config.get("animations", config.get("animations", {}))

        with open(rig_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4)

        return JSONResponse({"status": "success", "message": f"Regenerated bones for '{request.layer_id or 'all layers'}'"})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# API: Save Layer Order
# ---------------------------------------------------------------------------

class SaveLayerOrderRequest(BaseModel):
    model_id: str
    layers: list  # [{id, z}, ...]


@app.post("/api/save-layer-order")
async def save_layer_order(request: SaveLayerOrderRequest):
    """Persist updated z-index values from the UI back to the avatar.specter.json."""
    import json
    rig_path = os.path.join(MODELS_DIR, request.model_id, "avatar.specter.json")
    if not os.path.exists(rig_path):
        return JSONResponse({"status": "error", "message": "Model not found."}, status_code=404)

    try:
        with open(rig_path, "r") as f:
            config = json.load(f)

        z_map = {item["id"]: item["z"] for item in request.layers}
        for part in config.get("parts", []):
            if part["id"] in z_map:
                part["z"] = z_map[part["id"]]

        with open(rig_path, "w") as f:
            json.dump(config, f, indent=4)

        return JSONResponse({"status": "success"})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------

app.mount("/viewer", StaticFiles(directory=VIEWER_DIR), name="viewer")
app.mount("/models", StaticFiles(directory=MODELS_DIR), name="models")


@app.get("/favicon.ico")
async def favicon():
    return JSONResponse({"status": "ok"})


@app.get("/", response_class=HTMLResponse)
async def get_index():
    with open(os.path.join(VIEWER_DIR, "index.html"), "r", encoding="utf-8") as f:
        return f.read()


def launch():
    port = 8001
    print(f"🚀 Specter Engine starting at http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    launch()
