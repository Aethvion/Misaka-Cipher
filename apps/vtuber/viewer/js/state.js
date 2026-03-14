/**
 * state.js — Global application state for Specter Editor
 */
export const state = {
  // Current model data
  model: null,          // Full model JSON
  modelId: null,        // Server-side model ID (or null for unsaved)
  isDirty: false,       // Unsaved changes

  // Active selections
  selectedLayerId: null,
  selectedBoneId: null,
  selectedVertices: new Set(),  // vertex indices for mesh editor

  // Active mode & tool
  mode: 'generate',     // generate | edit | mesh | bones | weights | physics | preview | live
  activeTool: 'select', // select | add | delete | move | paint | ...

  // Viewport
  viewX: 0, viewY: 0, viewScale: 1,
  canvasW: 800, canvasH: 600,

  // Bone display transforms (computed each frame)
  boneWorldTransforms: {},  // boneId → { x, y, rotation, scaleX, scaleY }

  // Parameter values (runtime, may differ from model.parameters)
  paramValues: {},

  // Animation playback
  isPlaying: false,
  currentAnim: 'idle',
  animTime: 0,

  // Weight painting
  activePaintBoneId: null,
  brushRadius: 60,
  brushStrength: 0.5,
  brushMode: 'add',   // add | subtract | smooth

  // Generate
  conceptId: null,
  conceptPipeline: 'sheet',
  uploadedFile: null,

  // Texture cache: layerId → HTMLImageElement
  textureCache: {},

  // Physics runtime
  physicsState: {},   // boneId → { pos, vel, ... }
};

export function setMode(mode) {
  state.mode = mode;
}

export function selectLayer(id) {
  state.selectedLayerId = id;
  state.selectedVertices.clear();
}

export function selectBone(id) {
  state.selectedBoneId = id;
}

export function markDirty() {
  state.isDirty = true;
  document.title = `Specter — ${state.model?.name || 'Untitled'} *`;
}

export function markClean() {
  state.isDirty = false;
  document.title = `Specter — ${state.model?.name || 'Untitled'}`;
}

export function getLayer(id) {
  return state.model?.layers?.find(l => l.id === id) ?? null;
}

export function getBone(id) {
  return state.model?.bones?.find(b => b.id === id) ?? null;
}

export function getSelectedLayer() {
  return state.selectedLayerId ? getLayer(state.selectedLayerId) : null;
}

export function getSelectedBone() {
  return state.selectedBoneId ? getBone(state.selectedBoneId) : null;
}

export function getParam(id) {
  return state.paramValues[id] ?? state.model?.parameters?.[id]?.default ?? 0;
}

export function setParam(id, value) {
  const def = state.model?.parameters?.[id];
  if (!def) return;
  state.paramValues[id] = Math.max(def.min, Math.min(def.max, value));
}

export function resetParams() {
  state.paramValues = {};
  if (state.model?.parameters) {
    for (const [id, def] of Object.entries(state.model.parameters)) {
      state.paramValues[id] = def.default ?? 0;
    }
  }
}

/** Get or create weights for a layer/bone pair. Returns Float32Array. */
export function getWeights(layerId, boneId) {
  const layer = getLayer(layerId);
  if (!layer) return null;
  const nVerts = layer.mesh?.vertices?.length ?? 0;

  if (!state.model.weights) state.model.weights = {};
  if (!state.model.weights[layerId]) state.model.weights[layerId] = {};
  if (!state.model.weights[layerId][boneId]) {
    state.model.weights[layerId][boneId] = new Array(nVerts).fill(0);
  }
  return state.model.weights[layerId][boneId];
}
