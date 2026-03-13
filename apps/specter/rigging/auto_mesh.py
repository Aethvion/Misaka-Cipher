"""
auto_mesh.py — AI-assisted and algorithmic mesh generation per layer.
"""
import json
import math
from typing import Optional


def generate_grid_mesh(width: int, height: int,
                       cx: float, cy: float,
                       cols: int = 4, rows: int = 4) -> dict:
    """
    Generate a regular grid mesh for a layer.
    Returns {"vertices": [[x,y],...], "uvs": [[u,v],...], "triangles": [[i,i,i],...]}
    """
    verts, uvs = [], []
    for r in range(rows + 1):
        for c in range(cols + 1):
            u = c / cols
            v = r / rows
            x = cx - width / 2 + u * width
            y = cy - height / 2 + v * height
            verts.append([x, y])
            uvs.append([u, v])

    tris = []
    for r in range(rows):
        for c in range(cols):
            i = r * (cols + 1) + c
            tris.append([i, i + 1, i + cols + 1])
            tris.append([i + 1, i + cols + 2, i + cols + 1])

    return {"vertices": verts, "uvs": uvs, "triangles": tris}


def generate_quad_mesh(width: int, height: int, cx: float, cy: float) -> dict:
    """Simple 4-vertex quad."""
    hw, hh = width / 2, height / 2
    verts = [[cx - hw, cy - hh], [cx + hw, cy - hh],
             [cx + hw, cy + hh], [cx - hw, cy + hh]]
    uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]
    tris = [[0, 1, 2], [0, 2, 3]]
    return {"vertices": verts, "uvs": uvs, "triangles": tris}


def generate_mesh_for_layer(layer: dict, provider=None, model_id: str = "",
                             density: str = "medium") -> dict:
    """
    Generate an appropriate mesh for a layer.
    density: "low" (quad), "medium" (4x4 grid), "high" (8x8 grid), "ai" (AI-suggested)

    If density == "ai" and a provider is given, asks the LLM to suggest a custom mesh
    with more vertices around important regions (eyes, mouth, etc.).
    Returns updated mesh dict.
    """
    tex_size = layer.get("texture_size", {"width": 200, "height": 200})
    w, h = tex_size["width"], tex_size["height"]
    transform = layer.get("transform", {})
    cx = transform.get("x", 0) + 1024
    cy = transform.get("y", 0) + 1024

    if density == "low":
        return generate_quad_mesh(w, h, cx, cy)

    if density == "high":
        return generate_grid_mesh(w, h, cx, cy, cols=8, rows=8)

    if density == "ai" and provider:
        return _ai_mesh(layer, provider, model_id, w, h, cx, cy)

    # Default: medium grid
    return generate_grid_mesh(w, h, cx, cy, cols=4, rows=4)


def _ai_mesh(layer: dict, provider, model_id: str,
             w: int, h: int, cx: float, cy: float) -> dict:
    """
    Ask the LLM to suggest important sub-regions of a part and generate a
    denser mesh around those regions.
    """
    part_name = layer.get("name", "unknown")
    prompt = f"""You are a VTuber rigging assistant.
I have a character part called "{part_name}" with dimensions {w}x{h} pixels.

Suggest up to 6 important sub-regions (in normalized 0-1 UV coordinates) where extra
mesh density would help with deformation (e.g. around eyes, eyebrows, mouth corners).

Respond ONLY with valid JSON in this exact format:
{{
  "regions": [
    {{"name": "...", "u": 0.5, "v": 0.3, "radius": 0.15}},
    ...
  ]
}}

If this part does not need special regions (e.g. a simple accessory), return {{"regions": []}}.
"""
    try:
        resp = provider.chat(prompt, model=model_id)
        text = resp.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)
        regions = data.get("regions", [])
    except Exception:
        regions = []

    return _build_adaptive_mesh(w, h, cx, cy, regions)


def _build_adaptive_mesh(w: int, h: int, cx: float, cy: float,
                          regions: list, base_cols: int = 4, base_rows: int = 4) -> dict:
    """
    Build a mesh with denser vertices around specified UV regions.
    Falls back to a uniform grid if no regions are provided.
    """
    if not regions:
        return generate_grid_mesh(w, h, cx, cy, base_cols, base_rows)

    # Start with base grid, add extra vertices near each region
    base = generate_grid_mesh(w, h, cx, cy, base_cols, base_rows)
    extra_verts = list(base["vertices"])
    extra_uvs = list(base["uvs"])

    hw, hh = w / 2, h / 2
    existing = set((round(v[0], 1), round(v[1], 1)) for v in extra_verts)

    for region in regions:
        ru, rv = region.get("u", 0.5), region.get("v", 0.5)
        rr = region.get("radius", 0.15)
        # Add a ring of 8 extra vertices around this region
        for i in range(8):
            angle = 2 * math.pi * i / 8
            du = rr * 0.5 * math.cos(angle)
            dv = rr * 0.5 * math.sin(angle)
            u = max(0, min(1, ru + du))
            v = max(0, min(1, rv + dv))
            x = cx - hw + u * w
            y = cy - hh + v * h
            key = (round(x, 1), round(y, 1))
            if key not in existing:
                existing.add(key)
                extra_verts.append([x, y])
                extra_uvs.append([u, v])

    # Retriangulate using simple fan triangulation from base grid
    # For simplicity, keep base triangles and add center-point fans for regions
    tris = list(base["triangles"])
    base_count = len(base["vertices"])

    for region_start in range(base_count, len(extra_verts), 8):
        region_verts = list(range(region_start, min(region_start + 8, len(extra_verts))))
        if len(region_verts) >= 3:
            for i in range(len(region_verts)):
                a = region_verts[i]
                b = region_verts[(i + 1) % len(region_verts)]
                # Find nearest base vert as the third point
                ax, ay = extra_verts[a]
                cx_vert = sum(extra_verts[v][0] for v in region_verts) / len(region_verts)
                cy_vert = sum(extra_verts[v][1] for v in region_verts) / len(region_verts)
                # Find nearest base vertex to center
                nearest = min(range(base_count),
                              key=lambda vi: (extra_verts[vi][0] - cx_vert) ** 2 +
                                             (extra_verts[vi][1] - cy_vert) ** 2)
                tris.append([a, b, nearest])

    return {"vertices": extra_verts, "uvs": extra_uvs, "triangles": tris}
