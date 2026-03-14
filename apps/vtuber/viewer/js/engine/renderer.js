/**
 * renderer.js — PIXI.js rendering engine for Specter
 * Handles mesh display, deformation (LBS), and viewport management.
 */
import { state } from '../state.js';

let app = null;
let stage = null;
let meshContainer = null;
let boneContainer = null;

// Map: layerId → PIXI.SimpleMesh
const meshMap = new Map();
// Original (bind-pose) vertex positions per layer
const bindVerts = new Map();

// ── Init ───────────────────────────────────────────────────────────
export function initRenderer(canvasEl) {
  app = new PIXI.Application({
    view: canvasEl,
    width: canvasEl.parentElement.clientWidth,
    height: canvasEl.parentElement.clientHeight,
    backgroundColor: 0x050709,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  stage = app.stage;
  stage.sortableChildren = true;

  // Main container that is panned/zoomed
  meshContainer = new PIXI.Container();
  meshContainer.sortableChildren = true;
  meshContainer.zIndex = 0;
  stage.addChild(meshContainer);

  // Fit model canvas
  state.viewX = app.screen.width / 2;
  state.viewY = app.screen.height / 2;
  applyViewport();

  app.ticker.add(renderLoop);

  window.addEventListener('resize', () => resizeRenderer());
  return app;
}

function resizeRenderer() {
  if (!app) return;
  const host = document.getElementById('canvasHost');
  app.renderer.resize(host.clientWidth, host.clientHeight);
}

// ── Viewport ───────────────────────────────────────────────────────
export function applyViewport() {
  if (!meshContainer) return;
  meshContainer.x = state.viewX;
  meshContainer.y = state.viewY;
  meshContainer.scale.set(state.viewScale);
}

export function setZoom(scale) {
  state.viewScale = Math.max(0.05, Math.min(10, scale));
  applyViewport();
  document.getElementById('zoomLabel').textContent = `${Math.round(state.viewScale * 100)}%`;
}

export function panBy(dx, dy) {
  state.viewX += dx;
  state.viewY += dy;
  applyViewport();
}

export function fitToScreen() {
  if (!app || !state.model) return;
  const cw = state.model.canvas?.width || 2048;
  const ch = state.model.canvas?.height || 2048;
  const sw = app.screen.width;
  const sh = app.screen.height;
  const scale = Math.min(sw / cw, sh / ch) * 0.85;
  state.viewX = sw / 2 - (cw / 2) * scale;
  state.viewY = sh / 2 - (ch / 2) * scale;
  state.viewScale = scale;
  applyViewport();
  setZoom(state.viewScale);
}

// ── Model Loading ──────────────────────────────────────────────────
export async function loadModel(model, modelId) {
  clearMeshes();
  if (!model || !model.layers) return;

  // Sort by order (z-index)
  const sorted = [...model.layers].sort((a, b) => (a.order || 0) - (b.order || 0));

  for (const layer of sorted) {
    if (!layer.visible) continue;
    await addLayerMesh(layer, modelId);
  }

  fitToScreen();
}

export async function addLayerMesh(layer, modelId) {
  if (!layer.mesh?.vertices?.length) return;

  const texUrl = modelId
    ? `/api/model/${modelId}/texture/${layer.texture.replace('textures/', '')}`
    : null;

  let texture = PIXI.Texture.EMPTY;
  if (texUrl) {
    try {
      texture = await PIXI.Assets.load(texUrl);
    } catch { /* use empty */ }
  }

  const { flatVerts, flatUVs, flatIndices } = meshToFlat(layer.mesh);

  const mesh = new PIXI.SimpleMesh(
    texture,
    new Float32Array(flatVerts),
    new Float32Array(flatUVs),
    new Uint16Array(flatIndices),
    PIXI.DRAW_MODES.TRIANGLES,
  );
  mesh.zIndex = layer.order || 0;
  mesh.alpha = layer.opacity ?? 1;

  meshContainer.addChild(mesh);
  meshMap.set(layer.id, mesh);
  bindVerts.set(layer.id, new Float32Array(flatVerts));
}

export function removeLayerMesh(layerId) {
  const mesh = meshMap.get(layerId);
  if (mesh) { mesh.destroy(); meshMap.delete(layerId); }
  bindVerts.delete(layerId);
}

export function clearMeshes() {
  for (const [, mesh] of meshMap) mesh.destroy();
  meshMap.clear();
  bindVerts.clear();
  if (meshContainer) meshContainer.removeChildren();
}

export function refreshLayerTexture(layer, modelId) {
  const mesh = meshMap.get(layer.id);
  if (!mesh) return;
  const texUrl = `/api/model/${modelId}/texture/${layer.texture.replace('textures/', '')}`;
  PIXI.Assets.load(texUrl).then(tex => { mesh.texture = tex; }).catch(() => {});
}

// ── Deformation (Linear Blend Skinning) ───────────────────────────
export function deformAllLayers() {
  if (!state.model) return;
  for (const layer of state.model.layers) {
    deformLayer(layer);
  }
}

function deformLayer(layer) {
  const mesh = meshMap.get(layer.id);
  const orig = bindVerts.get(layer.id);
  if (!mesh || !orig) return;

  const weights = state.model.weights?.[layer.id];
  const bones = state.model.bones;
  if (!weights || !bones?.length) {
    mesh.vertices.set(orig);
    return;
  }

  const n = orig.length / 2;
  const deformed = new Float32Array(orig.length);

  for (let i = 0; i < n; i++) {
    const ox = orig[i * 2];
    const oy = orig[i * 2 + 1];
    let dx = 0, dy = 0, totalW = 0;

    for (const [boneId, ws] of Object.entries(weights)) {
      const w = ws[i] ?? 0;
      if (w <= 0) continue;
      const wt = state.boneWorldTransforms[boneId];
      const bt = getBoneBindTransform(boneId);
      if (!wt || !bt) continue;

      // Delta rotation
      const dRot = (wt.rotation - bt.rotation) * Math.PI / 180;
      const cos = Math.cos(dRot), sin = Math.sin(dRot);

      // Offset from bone bind position
      const rx = ox - bt.x;
      const ry = oy - bt.y;

      // Apply rotation around bind pos, then add world delta
      dx += w * (bt.x + rx * cos - ry * sin + (wt.x - bt.x));
      dy += w * (bt.y + rx * sin + ry * cos + (wt.y - bt.y));
      totalW += w;
    }

    if (totalW > 0.01) {
      deformed[i * 2]     = dx;
      deformed[i * 2 + 1] = dy;
    } else {
      deformed[i * 2]     = ox;
      deformed[i * 2 + 1] = oy;
    }
  }

  mesh.vertices.set(deformed);
}

// Store bind transforms per bone (set when model loads)
const boneBindTransforms = new Map();

export function captureBoneBindPoses() {
  boneBindTransforms.clear();
  if (!state.model?.bones) return;
  for (const bone of state.model.bones) {
    boneBindTransforms.set(bone.id, computeBoneWorld(bone));
  }
  // Copy into state for external access
  for (const [id, t] of boneBindTransforms) {
    if (!state.boneWorldTransforms[id]) state.boneWorldTransforms[id] = { ...t };
  }
}

function getBoneBindTransform(boneId) {
  return boneBindTransforms.get(boneId) ?? null;
}

/** Compute world transform for a bone from its hierarchy. */
export function computeBoneWorld(bone) {
  if (!bone) return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

  if (!bone.parentId) {
    return {
      x: bone.position.x,
      y: bone.position.y,
      rotation: bone.rotation ?? 0,
      scaleX: 1, scaleY: 1,
    };
  }

  const parent = state.model.bones.find(b => b.id === bone.parentId);
  if (!parent) return { x: bone.position.x, y: bone.position.y, rotation: bone.rotation ?? 0, scaleX: 1, scaleY: 1 };

  const pw = computeBoneWorld(parent);
  const pRot = pw.rotation * Math.PI / 180;
  const cos = Math.cos(pRot), sin = Math.sin(pRot);

  // Bone position is relative to parent's tail (parent.position + parent.length along rotation)
  const tailX = pw.x + Math.cos(pRot) * parent.length;
  const tailY = pw.y + Math.sin(pRot) * parent.length;

  const localX = bone.position.x - parent.position.x;
  const localY = bone.position.y - parent.position.y;

  return {
    x: tailX + localX,
    y: tailY + localY,
    rotation: pw.rotation + (bone.rotation ?? 0),
    scaleX: pw.scaleX,
    scaleY: pw.scaleY,
  };
}

/** Update bone world transforms from bone_params + paramValues. */
export function updateBoneTransforms() {
  if (!state.model?.bones) return;

  // Reset to bind poses
  for (const bone of state.model.bones) {
    state.boneWorldTransforms[bone.id] = { ...computeBoneWorld(bone) };
  }

  // Apply parameter bindings
  const boneParams = state.model.bone_params ?? [];
  for (const bp of boneParams) {
    const paramVal = state.paramValues[bp.paramId] ?? 0;
    const wt = state.boneWorldTransforms[bp.boneId];
    if (!wt) continue;

    // Interpolate keyframes
    const kf = bp.keyframes ?? [];
    const delta = interpolateKeyframes(kf, paramVal);

    switch (bp.property) {
      case 'rotation':    wt.rotation  += delta; break;
      case 'position_x':  wt.x        += delta; break;
      case 'position_y':  wt.y        += delta; break;
      case 'scale_x':     wt.scaleX   *= (1 + delta); break;
      case 'scale_y':     wt.scaleY   *= (1 + delta); break;
    }
  }
}

function interpolateKeyframes(keyframes, paramValue) {
  if (!keyframes?.length) return 0;
  if (keyframes.length === 1) return keyframes[0].bone_value;

  // Find surrounding keyframes
  const sorted = [...keyframes].sort((a, b) => a.param_value - b.param_value);

  if (paramValue <= sorted[0].param_value) return sorted[0].bone_value;
  if (paramValue >= sorted[sorted.length - 1].param_value) return sorted[sorted.length - 1].bone_value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (paramValue >= a.param_value && paramValue <= b.param_value) {
      const t = (paramValue - a.param_value) / (b.param_value - a.param_value);
      return a.bone_value + t * (b.bone_value - a.bone_value);
    }
  }
  return 0;
}

// ── Render Loop ────────────────────────────────────────────────────
function renderLoop(delta) {
  if (!state.model) return;

  if (state.isPlaying) {
    updateAnimation(delta);
  }

  updateBoneTransforms();
  deformAllLayers();
}

// ── Animation ─────────────────────────────────────────────────────
export function updateAnimation(delta) {
  const anim = state.model.animations?.[state.currentAnim];
  if (!anim) return;

  const dt = delta / 60;  // seconds
  state.animTime += dt;

  const t = anim.loop
    ? state.animTime % (anim.duration || 3)
    : Math.min(state.animTime, anim.duration || 3);

  for (const [paramId, track] of Object.entries(anim.tracks ?? {})) {
    const def = state.model.parameters?.[paramId];
    if (!def) continue;

    let value = 0;
    if (track.type === 'sine') {
      value = (Math.sin(t * (track.speed ?? 1) * Math.PI * 2 + (track.offset ?? 0)) + 1) / 2
               * (track.amplitude ?? 1);
    } else if (track.type === 'blink') {
      const interval = track.interval ?? 4;
      const blinkPhase = (t % interval) / interval;
      value = blinkPhase > 0.9 ? 1 - Math.abs((blinkPhase - 0.95) / 0.05) : 1;
    } else if (track.type === 'fixed') {
      value = track.value ?? 0;
    }

    // Remap value from [0,1] to [min,max]
    state.paramValues[paramId] = def.min + value * (def.max - def.min);
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function meshToFlat(mesh) {
  const flatVerts = mesh.vertices.flat();
  const flatUVs = mesh.uvs.flat();
  const flatIndices = mesh.triangles.flat();
  return { flatVerts, flatUVs, flatIndices };
}

// Convert canvas coordinates → screen coordinates
export function canvasToScreen(cx, cy) {
  return {
    x: cx * state.viewScale + state.viewX,
    y: cy * state.viewScale + state.viewY,
  };
}

// Convert screen coordinates → canvas coordinates
export function screenToCanvas(sx, sy) {
  return {
    x: (sx - state.viewX) / state.viewScale,
    y: (sy - state.viewY) / state.viewScale,
  };
}

export { app, meshMap, bindVerts };
