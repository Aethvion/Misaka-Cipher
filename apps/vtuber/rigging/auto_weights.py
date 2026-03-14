"""
auto_weights.py — Automatic weight assignment using distance-based and
layer-name heuristics.
"""
import math
from typing import Optional


def assign_weights(layers: list, bones: list) -> dict:
    """
    Assign bone weights to all layers using heuristic rules.

    Returns weights dict: { layerId: { boneId: [w0, w1, ...] } }
    Weights per vertex across bones sum to 1.0.
    """
    weights: dict = {}

    for layer in layers:
        layer_id = layer["id"]
        name = layer.get("name", "").lower()
        mesh = layer.get("mesh", {})
        verts = mesh.get("vertices", [])
        if not verts or not bones:
            continue

        # Determine which bones influence this layer
        influencing = _get_influencing_bones(name, bones)
        if not influencing:
            # Fallback: bind to root bone
            root = next((b for b in bones if not b.get("parentId")), bones[0])
            influencing = [root]

        layer_weights: dict = {}
        for bone in influencing:
            bone_id = bone["id"]
            layer_weights[bone_id] = _distance_weights(verts, bone, influencing)

        weights[layer_id] = layer_weights

    return weights


def _get_influencing_bones(layer_name: str, bones: list) -> list:
    """
    Heuristic: map layer name to relevant bones.
    """
    name = layer_name.lower()

    # Direct name matches
    keyword_map = [
        (["head", "face", "skull"],       ["Head", "Neck"]),
        (["hair", "bang", "ahoge"],       ["HairL", "HairR", "Head"]),
        (["eye", "pupil", "iris"],        ["EyeL", "EyeR", "Head"]),
        (["brow", "eyebrow"],             ["BrowL", "BrowR", "Head"]),
        (["mouth", "lip", "teeth"],       ["Mouth", "Head"]),
        (["nose"],                        ["Head"]),
        (["ear"],                         ["Head"]),
        (["neck", "collar"],              ["Neck", "Body"]),
        (["body", "torso", "chest"],      ["Body"]),
        (["arm", "hand", "finger"],       ["ArmL", "ArmR", "Body"]),
        (["accessory", "ribbon", "bow"],  ["Head"]),
        (["tail"],                        ["Root", "Body"]),
        (["wing"],                        ["Body"]),
    ]

    for keywords, bone_names in keyword_map:
        if any(kw in name for kw in keywords):
            matched = [b for b in bones
                       if any(bn.lower() in b["name"].lower() for bn in bone_names)]
            if matched:
                return matched

    # Default: return all bones (will be normalized by distance)
    return bones


def _distance_weights(vertices: list, bone: dict, all_bones: list) -> list:
    """
    Compute per-vertex weight for a single bone using inverse-distance weighting
    relative to all influencing bones.
    """
    bx = bone["position"]["x"]
    by = bone["position"]["y"]

    weights = []
    for v in vertices:
        # Distance from vertex to this bone's position
        dx = v[0] - bx
        dy = v[1] - by
        dist = math.sqrt(dx * dx + dy * dy) + 1e-6

        # Compute distances to all bones for normalization
        total = 0.0
        own_inv = 1.0 / dist

        for b in all_bones:
            bdx = v[0] - b["position"]["x"]
            bdy = v[1] - b["position"]["y"]
            bdist = math.sqrt(bdx * bdx + bdy * bdy) + 1e-6
            total += 1.0 / bdist

        w = own_inv / total if total > 0 else 0.0
        weights.append(round(w, 4))

    return weights


def smooth_weights(weights: dict, layers: dict, iterations: int = 2) -> dict:
    """
    Smooth weights by averaging with neighboring vertices.
    layers: dict of layerId -> layer dict (with mesh)
    """
    smoothed: dict = {}
    for layer_id, bone_weights in weights.items():
        layer = layers.get(layer_id)
        if not layer:
            smoothed[layer_id] = bone_weights
            continue

        mesh = layer.get("mesh", {})
        verts = mesh.get("vertices", [])
        tris = mesh.get("triangles", [])
        if not verts or not tris:
            smoothed[layer_id] = bone_weights
            continue

        # Build adjacency
        adjacency: list[set] = [set() for _ in verts]
        for tri in tris:
            a, b, c = tri
            adjacency[a].update([b, c])
            adjacency[b].update([a, c])
            adjacency[c].update([a, b])

        new_bone_weights: dict = {}
        for bone_id, ws in bone_weights.items():
            ws_arr = list(ws)
            for _ in range(iterations):
                new_ws = []
                for i, w in enumerate(ws_arr):
                    neighbors = adjacency[i]
                    if neighbors:
                        avg = (w + sum(ws_arr[n] for n in neighbors)) / (len(neighbors) + 1)
                    else:
                        avg = w
                    new_ws.append(avg)
                ws_arr = new_ws
            new_bone_weights[bone_id] = [round(w, 4) for w in ws_arr]

        smoothed[layer_id] = new_bone_weights

    # Re-normalize so per-vertex weights across all bones sum to 1
    return normalize_weights(smoothed)


def normalize_weights(weights: dict) -> dict:
    """Ensure per-vertex weights across all bones sum to 1 for each layer."""
    normalized: dict = {}
    for layer_id, bone_weights in weights.items():
        if not bone_weights:
            normalized[layer_id] = bone_weights
            continue

        bone_ids = list(bone_weights.keys())
        n_verts = len(next(iter(bone_weights.values()), []))

        new_bw: dict = {bid: [] for bid in bone_ids}
        for vi in range(n_verts):
            total = sum(bone_weights[bid][vi] for bid in bone_ids
                        if vi < len(bone_weights[bid]))
            for bid in bone_ids:
                w = bone_weights[bid][vi] if vi < len(bone_weights[bid]) else 0.0
                new_bw[bid].append(round(w / total, 4) if total > 0 else 0.0)

        normalized[layer_id] = new_bw

    return normalized
