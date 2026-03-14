"""
auto_bones.py — AI-assisted bone placement for VTuber models.
"""
import json
import uuid
from typing import Optional


# Standard VTuber bone templates
HUMANOID_SKELETON = [
    {"name": "Root",     "parent": None,    "x": 0,     "y": 200,   "rot": 0,   "len": 50},
    {"name": "Body",     "parent": "Root",  "x": 0,     "y": -120,  "rot": 0,   "len": 120},
    {"name": "Neck",     "parent": "Body",  "x": 0,     "y": -140,  "rot": 0,   "len": 60},
    {"name": "Head",     "parent": "Neck",  "x": 0,     "y": -80,   "rot": 0,   "len": 100},
    {"name": "HairL",    "parent": "Head",  "x": -60,   "y": -60,   "rot": -20, "len": 80},
    {"name": "HairR",    "parent": "Head",  "x": 60,    "y": -60,   "rot": 20,  "len": 80},
    {"name": "EyeL",     "parent": "Head",  "x": -50,   "y": -30,   "rot": 0,   "len": 30},
    {"name": "EyeR",     "parent": "Head",  "x": 50,    "y": -30,   "rot": 0,   "len": 30},
    {"name": "BrowL",    "parent": "Head",  "x": -50,   "y": -60,   "rot": 0,   "len": 30},
    {"name": "BrowR",    "parent": "Head",  "x": 50,    "y": -60,   "rot": 0,   "len": 30},
    {"name": "Mouth",    "parent": "Head",  "x": 0,     "y": 30,    "rot": 0,   "len": 40},
    {"name": "ArmL",     "parent": "Body",  "x": -100,  "y": -80,   "rot": -10, "len": 100},
    {"name": "ArmR",     "parent": "Body",  "x": 100,   "y": -80,   "rot": 10,  "len": 100},
]

BONE_COLORS = {
    "Root": "#ff6b6b", "Body": "#ffa94d", "Neck": "#ffe066", "Head": "#69db7c",
    "Hair": "#74c0fc", "Eye": "#a9e34b", "Brow": "#63e6be",
    "Mouth": "#ff8787", "Arm": "#da77f2", "default": "#7c6ff7",
}


def _color_for_bone(name: str) -> str:
    for key, color in BONE_COLORS.items():
        if key.lower() in name.lower():
            return color
    return BONE_COLORS["default"]


def _build_bones_from_template(template: list, canvas_cx: float = 1024,
                                canvas_cy: float = 1024) -> list:
    """Convert a flat template list to proper bone dicts with UUIDs."""
    name_to_id: dict[str, str] = {}
    bones = []

    for b in template:
        bone_id = uuid.uuid4().hex[:12]
        name_to_id[b["name"]] = bone_id

        parent_id = name_to_id.get(b["parent"]) if b["parent"] else None

        bones.append({
            "id": bone_id,
            "name": b["name"],
            "parentId": parent_id,
            "position": {"x": b["x"] + canvas_cx, "y": b["y"] + canvas_cy},
            "rotation": b.get("rot", 0),
            "length": b.get("len", 80),
            "color": _color_for_bone(b["name"]),
            "visible": True,
        })

    return bones


def suggest_bones(layers: list, provider=None, model_id: str = "",
                  style: str = "humanoid") -> list:
    """
    Suggest a bone hierarchy for the given layers.

    style: "humanoid" (standard template), "custom" (AI-generated), "minimal" (head+body only)

    Returns a list of bone dicts ready to insert into the model.
    """
    if style == "minimal":
        template = [t for t in HUMANOID_SKELETON
                    if t["name"] in ("Root", "Body", "Neck", "Head")]
        return _build_bones_from_template(template)

    if style == "humanoid" or not provider:
        return _build_bones_from_template(HUMANOID_SKELETON)

    # AI-custom mode
    return _ai_suggest_bones(layers, provider, model_id)


def _ai_suggest_bones(layers: list, provider, model_id: str) -> list:
    """Ask the LLM to suggest a custom bone hierarchy based on the layer list."""
    layer_names = [l.get("name", l.get("id", "?")) for l in layers]

    prompt = f"""You are a VTuber rigging expert.
I have a 2D character with these layers (parts): {json.dumps(layer_names)}

Design a bone hierarchy for this character. The canvas is 2048x2048 with the origin
at (1024, 1024) — the center of the canvas. Bones are positioned in canvas coordinates.

Rules:
- Always have a "Root" bone at the center-bottom of the character
- Body, Neck, Head form the spine chain
- Hair, ear, accessory bones are children of Head
- Eye and mouth bones are children of Head
- Arm/hand bones are children of Body
- Positions are in canvas space (0-2048), y increases downward

Respond ONLY with valid JSON:
{{
  "bones": [
    {{"name": "Root", "parent": null, "x": 1024, "y": 1300, "rotation": 0, "length": 50}},
    {{"name": "Body", "parent": "Root", "x": 1024, "y": 1150, "rotation": 0, "length": 120}},
    ...
  ]
}}
"""
    try:
        resp = provider.chat(prompt, model=model_id)
        text = resp.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)
        raw_bones = data.get("bones", [])
    except Exception:
        return _build_bones_from_template(HUMANOID_SKELETON)

    # Build with UUIDs
    name_to_id: dict[str, str] = {}
    bones = []
    for b in raw_bones:
        bone_id = uuid.uuid4().hex[:12]
        name = b.get("name", f"Bone{len(bones)}")
        name_to_id[name] = bone_id
        parent_name = b.get("parent")
        parent_id = name_to_id.get(parent_name) if parent_name else None

        bones.append({
            "id": bone_id,
            "name": name,
            "parentId": parent_id,
            "position": {"x": b.get("x", 1024), "y": b.get("y", 1024)},
            "rotation": b.get("rotation", 0),
            "length": b.get("length", 80),
            "color": _color_for_bone(name),
            "visible": True,
        })

    return bones if bones else _build_bones_from_template(HUMANOID_SKELETON)


def suggest_bone_params(bones: list, parameters: dict,
                        provider=None, model_id: str = "") -> list:
    """
    Suggest bone-to-parameter bindings (bone_params) based on bone names and params.
    Returns a list of bone_param dicts.
    """
    bindings = []

    # Heuristic auto-binding
    head_bone = next((b for b in bones if "head" in b["name"].lower()), None)
    neck_bone = next((b for b in bones if "neck" in b["name"].lower()), None)
    body_bone = next((b for b in bones if "body" in b["name"].lower()), None)
    eye_l_bone = next((b for b in bones if "eyel" in b["name"].lower() or
                       (b["name"].lower().startswith("eye") and "l" in b["name"].lower())), None)
    eye_r_bone = next((b for b in bones if "eyer" in b["name"].lower() or
                       (b["name"].lower().startswith("eye") and "r" in b["name"].lower())), None)

    def bind(bone, param_id, prop, keyframes):
        if bone and param_id in parameters:
            bindings.append({
                "id": uuid.uuid4().hex[:12],
                "boneId": bone["id"],
                "paramId": param_id,
                "property": prop,
                "keyframes": keyframes,
            })

    # Head angle X (left-right)
    bind(head_bone or neck_bone, "ParamAngleX", "rotation",
         [{"param_value": -30, "bone_value": -25},
          {"param_value": 0, "bone_value": 0},
          {"param_value": 30, "bone_value": 25}])

    # Head angle Y (up-down) via position
    bind(head_bone or neck_bone, "ParamAngleY", "position_y",
         [{"param_value": -30, "bone_value": -20},
          {"param_value": 0, "bone_value": 0},
          {"param_value": 30, "bone_value": 20}])

    # Body angle Z (tilt)
    bind(body_bone, "ParamAngleZ", "rotation",
         [{"param_value": -30, "bone_value": -10},
          {"param_value": 0, "bone_value": 0},
          {"param_value": 30, "bone_value": 10}])

    # Breathing
    bind(body_bone, "ParamBreath", "scale_y",
         [{"param_value": 0, "bone_value": 1.0},
          {"param_value": 1, "bone_value": 1.03}])

    # Eye open L
    bind(eye_l_bone, "ParamEyeOpenL", "scale_y",
         [{"param_value": 0, "bone_value": 0.1},
          {"param_value": 1, "bone_value": 1.0}])

    # Eye open R
    bind(eye_r_bone, "ParamEyeOpenR", "scale_y",
         [{"param_value": 0, "bone_value": 0.1},
          {"param_value": 1, "bone_value": 1.0}])

    return bindings
