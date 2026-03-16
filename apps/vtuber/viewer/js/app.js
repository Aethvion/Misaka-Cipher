/**
 * app.js — Aethvion VTuber main application entry point
 */
import { state, setMode, selectLayer, selectBone, resetParams, markDirty, markClean } from './state.js';
import * as api from './api.js';
import {
  initRenderer, loadModel, fitToScreen, setZoom, panBy,
  canvasToScreen, screenToCanvas, captureBoneBindPoses,
} from './engine/renderer.js';
import {
  meshToolActivate, meshToolDeactivate, setMeshTool, drawMesh,
} from './tools/mesh-tool.js';
import {
  boneToolActivate, boneToolDeactivate, setBoneTool, drawBones,
} from './tools/bone-tool.js';
import {
  weightToolActivate, weightToolDeactivate,
} from './tools/weight-tool.js';
import {
  renderLayerPanel, renderBonePanel, renderParamPanel, renderInspector,
  showLoading, hideLoading, toast, setStatus,
} from './ui/panels.js';

// ── Init ───────────────────────────────────────────────────────────
const canvas = document.getElementById('mainCanvas');
const overlaysvg = document.getElementById('overlaysvg');

const pixiApp = initRenderer(canvas);
window._pixiApp = pixiApp;

// Populate provider/model selectors
api.getProviders().then(data => {
  const chatSel = document.getElementById('chatModelSel');
  const imgSel  = document.getElementById('imageModelSel');
  for (const m of data.chat_models ?? []) {
    chatSel.innerHTML += `<option value="${m.id}">${m.id} (${m.provider})</option>`;
  }
  for (const m of data.image_models ?? []) {
    imgSel.innerHTML += `<option value="${m.id}">${m.id} (${m.provider})</option>`;
  }
}).catch(() => {});

// ── Mode switching ─────────────────────────────────────────────────
const modeToolbar = {
  generate: [],
  edit:    ['select', 'sep', 'move'],
  mesh:    ['select', 'add', 'delete', 'sep', 'move'],
  bones:   ['select', 'add', 'delete', 'sep', 'move'],
  weights: ['paint', 'smooth', 'erase'],
  physics: [],
  preview: ['play'],
  live:    [],
};

const toolIcons = {
  select: { icon: 'fa-arrow-pointer',      label: 'Select' },
  add:    { icon: 'fa-circle-plus',         label: 'Add' },
  delete: { icon: 'fa-circle-minus',        label: 'Delete' },
  move:   { icon: 'fa-up-down-left-right',  label: 'Move' },
  paint:  { icon: 'fa-paint-brush',         label: 'Paint' },
  smooth: { icon: 'fa-droplet',             label: 'Smooth' },
  erase:  { icon: 'fa-eraser',              label: 'Erase' },
  play:   { icon: 'fa-play',               label: 'Play' },
};

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchMode(btn.dataset.mode);
  });
});

function switchMode(mode) {
  const prev = state.mode;
  setMode(mode);

  // Deactivate previous mode tools
  if (prev === 'mesh')    meshToolDeactivate();
  if (prev === 'bones')   boneToolDeactivate();
  if (prev === 'weights') weightToolDeactivate();
  if (prev === 'live')    stopLiveTracking();

  // Clear overlay
  while (overlaysvg.firstChild) overlaysvg.removeChild(overlaysvg.firstChild);
  overlaysvg.classList.remove('interactive');

  // Update mode buttons
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  // Show/hide generate panel
  const genPanel = document.getElementById('generatePanel');
  genPanel.classList.toggle('active', mode === 'generate');

  // Show/hide playback controls
  document.getElementById('playbackControls').style.display =
    (mode === 'preview' || mode === 'live') ? 'flex' : 'none';

  // Activate mode tools
  if (mode === 'mesh')    { meshToolActivate(overlaysvg); }
  if (mode === 'bones')   { boneToolActivate(overlaysvg); }
  if (mode === 'weights') { weightToolActivate(overlaysvg); }
  if (mode === 'live')    { initLiveTracking(); }

  // Rebuild toolbar
  buildToolBar(mode);

  // Render inspector
  renderInspector();

  state.isPlaying = (mode === 'preview' || mode === 'live');

  // Fix 9: Contextual mode hints in status bar
  const modeHints = {
    generate: 'Choose a pipeline and generate a character — or upload your own image.',
    edit:     'Select a layer to inspect and transform it. Drag layers to reorder.',
    mesh:     'Select · Add · Delete vertices. Click canvas in Add mode to place new vertices.',
    bones:    'Select · Add · Delete bones. Click canvas in Add mode to place a bone.',
    weights:  'Select a bone in the Bones panel, then paint influence on the mesh.',
    physics:  'Add physics groups and tune gravity, momentum, and damping per group.',
    preview:  'Play animations in real time. Use the inspector to switch clips.',
    live:     'Connect live face/motion tracking to drive your model parameters.',
  };
  if (state.model || mode === 'generate') setStatus(modeHints[mode] ?? 'Ready');
}

function buildToolBar(mode) {
  const bar = document.getElementById('toolBar');
  bar.innerHTML = '';

  const tools = modeToolbar[mode] ?? [];
  if (!tools.length) return;

  for (const tool of tools) {
    if (tool === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'tool-separator';
      bar.appendChild(sep);
      continue;
    }
    const info = toolIcons[tool];
    const btn = document.createElement('button');
    btn.className = `tool-btn${state.activeTool === tool ? ' active' : ''}`;
    btn.title = info.label;
    btn.innerHTML = `<i class="fa-solid ${info.icon}"></i>`;
    btn.addEventListener('click', () => {
      state.activeTool = tool;
      bar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyToolToMode(mode, tool);
    });
    bar.appendChild(btn);
  }

  // Auto-select first tool
  bar.querySelector('.tool-btn')?.click();
}

function applyToolToMode(mode, tool) {
  if (mode === 'mesh') {
    const m = tool === 'add' ? 'add' : tool === 'delete' ? 'delete' : 'select';
    setMeshTool(m);
  }
  if (mode === 'bones') {
    const m = tool === 'add' ? 'add' : tool === 'delete' ? 'delete' : 'select';
    setBoneTool(m);
  }
  if (mode === 'weights') {
    state.brushMode = tool === 'smooth' ? 'smooth' : tool === 'erase' ? 'subtract' : 'add';
    document.getElementById('brushMode').value = state.brushMode;
  }
}

// ── Viewport controls ──────────────────────────────────────────────
let isPanning = false;
let panStart = { x: 0, y: 0 };

const host = document.getElementById('canvasHost');

// Fix 1: Zoom-to-cursor — zoom towards the pointer position, not the origin
host.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = host.getBoundingClientRect();
  const cursorX = e.clientX - rect.left;
  const cursorY = e.clientY - rect.top;

  // Canvas point under cursor before zoom
  const canvasX = (cursorX - state.viewX) / state.viewScale;
  const canvasY = (cursorY - state.viewY) / state.viewScale;

  const factor   = e.deltaY < 0 ? 1.1 : 0.9;
  const newScale = Math.max(0.05, Math.min(10, state.viewScale * factor));

  // Adjust viewX/Y so the canvas point stays under the cursor
  state.viewX = cursorX - canvasX * newScale;
  state.viewY = cursorY - canvasY * newScale;

  setZoom(newScale);
  if (state.mode === 'mesh') drawMesh();
  if (state.mode === 'bones') drawBones();
}, { passive: false });

host.addEventListener('mousedown', e => {
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }
});

// Fix 3: Canvas cursor coordinates shown in bottom status bar
host.addEventListener('mousemove', e => {
  const rect = host.getBoundingClientRect();
  const c = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
  const coordEl = document.getElementById('cursorCoords');
  if (coordEl) coordEl.textContent = `X: ${Math.round(c.x)}  Y: ${Math.round(c.y)}`;
});
host.addEventListener('mouseleave', () => {
  const coordEl = document.getElementById('cursorCoords');
  if (coordEl) coordEl.textContent = '';
});

window.addEventListener('mousemove', e => {
  if (isPanning) {
    panBy(e.clientX - panStart.x, e.clientY - panStart.y);
    panStart = { x: e.clientX, y: e.clientY };
    if (state.mode === 'mesh') drawMesh();
    if (state.mode === 'bones') drawBones();
  }
});

window.addEventListener('mouseup', e => {
  if (e.button === 1 || (e.button === 0 && e.altKey)) isPanning = false;
});

document.getElementById('btnZoomIn').addEventListener('click', () => setZoom(state.viewScale * 1.25));
document.getElementById('btnZoomOut').addEventListener('click', () => setZoom(state.viewScale * 0.8));
document.getElementById('btnZoomFit').addEventListener('click', fitToScreen);

// ── Modals ─────────────────────────────────────────────────────────

/** Show a non-blocking name-input dialog. Resolves with the entered name or null on cancel. */
function showNameModal(title = 'Model Name', placeholder = 'e.g. My VTuber', defaultVal = '') {
  return new Promise(resolve => {
    const overlay = document.getElementById('vtNameModal');
    const input   = document.getElementById('vtNameInput');
    const okBtn   = document.getElementById('vtNameOk');
    const canBtn  = document.getElementById('vtNameCancel');
    const titleEl = document.getElementById('vtNameModalTitle');

    titleEl.textContent = title;
    input.placeholder   = placeholder;
    input.value         = defaultVal;
    overlay.style.display = 'flex';

    const prevFocus = document.activeElement;
    requestAnimationFrame(() => { input.focus(); input.select(); });

    const cleanup = () => {
      overlay.style.display = 'none';
      okBtn.removeEventListener('click', handleOk);
      canBtn.removeEventListener('click', handleCan);
      document.removeEventListener('keydown', handleKey);
      if (prevFocus?.focus) prevFocus.focus();
    };
    const handleOk  = () => { const v = input.value.trim(); cleanup(); resolve(v || null); };
    const handleCan = () => { cleanup(); resolve(null); };
    const handleKey = e => {
      if (e.key === 'Enter')  { e.preventDefault(); handleOk(); }
      if (e.key === 'Escape') { handleCan(); }
      if (e.key === 'Tab')    { e.preventDefault(); /* only one input */ }
    };
    okBtn.addEventListener('click', handleOk);
    canBtn.addEventListener('click', handleCan);
    document.addEventListener('keydown', handleKey);
    overlay.addEventListener('click', e => { if (e.target === overlay) handleCan(); }, { once: true });
  });
}

/** Show a non-blocking confirmation dialog. Calls onConfirm if user confirms. */
function showVtConfirm(title, body, onConfirm, { confirmLabel = 'Delete', icon = 'fa-triangle-exclamation' } = {}) {
  const overlay  = document.getElementById('vtConfirmModal');
  const titleEl  = document.getElementById('vtConfirmTitle');
  const bodyEl   = document.getElementById('vtConfirmBody');
  const iconEl   = document.getElementById('vtConfirmIcon');
  const okBtn    = document.getElementById('vtConfirmOk');
  const canBtn   = document.getElementById('vtConfirmCancel');

  titleEl.textContent  = title;
  bodyEl.textContent   = body;
  okBtn.textContent    = confirmLabel;
  iconEl.className     = `fa-solid ${icon}`;
  overlay.style.display = 'flex';

  const prevFocus = document.activeElement;
  requestAnimationFrame(() => canBtn.focus());

  const close = () => {
    overlay.style.display = 'none';
    okBtn.removeEventListener('click', handleOk);
    canBtn.removeEventListener('click', handleCan);
    document.removeEventListener('keydown', handleKey);
    if (prevFocus?.focus) prevFocus.focus();
  };
  const handleOk  = () => { close(); onConfirm(); };
  const handleCan = () => { close(); };
  const handleKey = e => {
    if (e.key === 'Escape') { handleCan(); return; }
    if (e.key === 'Enter')  { handleOk();  return; }
    if (e.key === 'Tab')    { e.preventDefault(); document.activeElement === okBtn ? canBtn.focus() : okBtn.focus(); }
  };
  okBtn.addEventListener('click', handleOk);
  canBtn.addEventListener('click', handleCan);
  document.addEventListener('keydown', handleKey);
  overlay.addEventListener('click', e => { if (e.target === overlay) handleCan(); }, { once: true });
}

// ── Keyboard Shortcuts Overlay ─────────────────────────────────────
function openKbdOverlay() {
  const ov = document.getElementById('kbdOverlay');
  if (ov) ov.style.display = 'flex';
}
function closeKbdOverlay() {
  const ov = document.getElementById('kbdOverlay');
  if (ov) ov.style.display = 'none';
}
document.getElementById('btnKbdHelp').addEventListener('click', openKbdOverlay);
document.getElementById('kbdClose').addEventListener('click', closeKbdOverlay);
document.getElementById('kbdOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('kbdOverlay')) closeKbdOverlay();
});

// ── Empty canvas state helper ──────────────────────────────────────
function syncEmptyState() {
  const el = document.getElementById('emptyCanvasState');
  if (el) el.style.display = state.model ? 'none' : 'flex';
}

// ── File operations ────────────────────────────────────────────────
document.getElementById('btnNewModel').addEventListener('click', async () => {
  const name = await showNameModal('New Model', 'e.g. My VTuber', 'Untitled');
  if (!name) return;
  showLoading('Creating model...');
  try {
    const res = await api.createModel(name);
    await openModel(res.model_id, res.model);
    toast(`Model "${name}" created`, 'success');
  } catch (e) { toast(e.message, 'error'); }
  hideLoading();
});

document.getElementById('btnOpenModel').addEventListener('click', () => {
  document.getElementById('fileInput').accept = '.vtuber';
  document.getElementById('fileInput').click();
});

document.getElementById('btnSaveModel').addEventListener('click', saveCurrentModel);

document.getElementById('btnExport').addEventListener('click', async () => {
  if (!state.modelId) return toast('No model to export', 'error');
  await saveCurrentModel();
  showLoading('Exporting...');
  try {
    const blob = await api.exportModel(state.modelId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${state.modelId}.vtuber`; a.click();
    URL.revokeObjectURL(url);
    toast('Exported!', 'success');
  } catch (e) { toast(e.message, 'error'); }
  hideLoading();
});

document.getElementById('fileInput').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';

  if (file.name.endsWith('.vtuber')) {
    showLoading('Importing...');
    try {
      const res = await api.importModel(file);
      await openModel(res.model_id, res.model);
      toast('Model imported', 'success');
    } catch (ex) { toast(ex.message, 'error'); }
    hideLoading();
  } else {
    // Image → add as layer or start generate
    if (state.model && state.modelId) {
      showLoading('Adding layer...');
      try {
        const res = await api.addLayer(state.modelId, file, file.name.replace(/\.[^.]+$/, ''));
        state.model.layers.push(res.layer);
        await loadModel(state.model, state.modelId);
        renderLayerPanel();
        toast('Layer added', 'success');
      } catch (ex) { toast(ex.message, 'error'); }
      hideLoading();
    }
  }
});

async function saveCurrentModel() {
  if (!state.modelId || !state.model) return;
  showLoading('Saving...');
  try {
    await api.saveModel(state.modelId, state.model);
    markClean();
    toast('Saved', 'success');
  } catch (e) { toast(e.message, 'error'); }
  hideLoading();
}

// ── Add layer button ────────────────────────────────────────────────
document.getElementById('btnAddLayer').addEventListener('click', () => {
  if (!state.model) return toast('Create a model first', 'error');
  document.getElementById('fileInput').accept = 'image/*';
  document.getElementById('fileInput').click();
});

document.getElementById('btnDeleteLayer').addEventListener('click', () => {
  if (!state.selectedLayerId || !state.model) return;
  const layer = state.model.layers.find(l => l.id === state.selectedLayerId);
  const name  = layer?.name || 'this layer';
  showVtConfirm(
    'Delete Layer',
    `Delete "${name}"? This cannot be undone.`,
    () => {
      state.model.layers = state.model.layers.filter(l => l.id !== state.selectedLayerId);
      selectLayer(null);
      loadModel(state.model, state.modelId);
      renderLayerPanel();
      markDirty();
      toast('Layer deleted', 'info');
    },
    { confirmLabel: 'Delete', icon: 'fa-trash' }
  );
});

// ── Add bone button ────────────────────────────────────────────────
document.getElementById('btnAddBone').addEventListener('click', () => {
  if (!state.model) return toast('Create a model first', 'error');
  if (state.mode !== 'bones') switchMode('bones');
  setBoneTool('add');
  toast('Click on the canvas to place a bone', 'info');
});

document.getElementById('btnDeleteBone').addEventListener('click', () => {
  if (!state.selectedBoneId || !state.model) return;
  const bone = state.model.bones.find(b => b.id === state.selectedBoneId);
  const name = bone?.name || 'this bone';
  showVtConfirm(
    'Delete Bone',
    `Delete "${name}"? Child bones will be unparented.`,
    () => {
      state.model.bones = state.model.bones.filter(b => b.id !== state.selectedBoneId);
      selectBone(null);
      renderBonePanel();
      drawBones();
      markDirty();
      toast('Bone deleted', 'info');
    },
    { confirmLabel: 'Delete', icon: 'fa-bone' }
  );
});

// ── Events from tools ──────────────────────────────────────────────
document.addEventListener('bonesChanged', () => {
  renderBonePanel();
  captureBoneBindPoses();
});

document.addEventListener('boneSelected', () => {
  renderBonePanel();
  renderInspector();
});

// ── Playback ───────────────────────────────────────────────────────
document.getElementById('btnPlayPause').addEventListener('click', () => {
  state.isPlaying = !state.isPlaying;
  state.animTime = state.isPlaying ? state.animTime : 0;
  const icon = document.querySelector('#btnPlayPause i');
  icon.className = `fa-solid fa-${state.isPlaying ? 'pause' : 'play'}`;
});

// ── Weight brush controls ──────────────────────────────────────────
document.getElementById('brushRadius').addEventListener('input', e => {
  state.brushRadius = parseInt(e.target.value);
});
document.getElementById('brushStrength').addEventListener('input', e => {
  state.brushStrength = parseInt(e.target.value) / 100;
});
document.getElementById('brushMode').addEventListener('change', e => {
  state.brushMode = e.target.value;
});

// ── Generate tab ───────────────────────────────────────────────────
const pipelinePills = document.querySelectorAll('#pipelinePills .pill');
pipelinePills.forEach(pill => {
  pill.addEventListener('click', () => {
    pipelinePills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    state.conceptPipeline = pill.dataset.val;
    const isUpload = pill.dataset.val === 'simple';
    document.getElementById('uploadPanel').style.display = isUpload ? 'flex' : 'none';
    document.getElementById('promptPanel').style.display = isUpload ? 'none' : 'flex';
  });
});

// Upload zone
const uploadZone = document.getElementById('uploadZone');
const uploadInput = document.getElementById('uploadImageInput');
const uploadPreview = document.getElementById('uploadPreview');

uploadZone.addEventListener('click', () => uploadInput.click());
uploadInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  state.uploadedFile = file;
  const url = URL.createObjectURL(file);
  uploadPreview.src = url; uploadPreview.style.display = 'block';
});
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = 'var(--accent)'; });
uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.style.borderColor = '';
  const file = e.dataTransfer.files?.[0];
  if (file) { state.uploadedFile = file; const url = URL.createObjectURL(file); uploadPreview.src = url; uploadPreview.style.display = 'block'; }
});

document.getElementById('btnGenerateConcept').addEventListener('click', async () => {
  const pipeline = state.conceptPipeline;
  const chatModel = document.getElementById('chatModelSel').value;
  const imageModel = document.getElementById('imageModelSel').value;
  const instructions = document.getElementById('genInstructions').value;
  const meshDensity = document.getElementById('meshDensity').value;
  const boneStyle = document.getElementById('boneStyle').value;

  if (pipeline === 'simple') {
    // Upload mode: directly auto-rig
    if (!state.uploadedFile) return toast('Please upload an image first', 'error');
    showLoading('Auto-rigging from image...');
    try {
      const res = await api.generateFromUpload(state.uploadedFile, {
        chatModel, instructions, meshDensity, boneStyle,
      });
      await openModel(res.model_id, res.model);
      toast('Model generated!', 'success');
    } catch (e) { toast(e.message, 'error'); }
    hideLoading();
    return;
  }

  // Sheet / Local: generate concept first
  const prompt = document.getElementById('genPrompt').value.trim();
  if (!prompt) return toast('Enter a prompt first', 'error');

  showLoading('Generating concept...');
  try {
    const res = await api.generateConcept({ prompt, pipeline, imageModel, chatModel });
    state.conceptId = res.concept_id;

    const img = document.getElementById('conceptImg');
    img.src = res.concept_url;
    document.getElementById('conceptPreview').style.display = 'block';
    toast('Concept generated! Click "Rig It!" to continue.', 'success');
  } catch (e) { toast(e.message, 'error'); }
  hideLoading();
});

document.getElementById('btnRigConcept').addEventListener('click', async () => {
  if (!state.conceptId) return toast('Generate a concept first', 'error');
  const chatModel = document.getElementById('chatModelSel').value;
  const instructions = document.getElementById('genInstructions').value;
  const meshDensity = document.getElementById('meshDensity').value;
  const boneStyle = document.getElementById('boneStyle').value;
  const pipeline = state.conceptPipeline;

  showLoading('Rigging model...');
  try {
    const res = await api.generateRig({
      conceptId: state.conceptId,
      pipeline, chatModel, instructions, meshDensity, boneStyle,
    });
    await openModel(res.model_id, res.model);
    document.getElementById('conceptPreview').style.display = 'none';
    toast('Model rigged successfully!', 'success');
  } catch (e) { toast(e.message, 'error'); }
  hideLoading();
});

// ── Open a model ───────────────────────────────────────────────────
async function openModel(modelId, model) {
  state.modelId = modelId;
  state.model = model;
  state.isDirty = false;
  markClean();

  resetParams();
  captureBoneBindPoses();

  await loadModel(model, modelId);

  renderLayerPanel();
  renderBonePanel();
  renderParamPanel();
  renderInspector();

  document.title = `Aethvion VTuber — ${model.name || 'Untitled'}`;
  setStatus(`Model "${model.name}" loaded — ${model.layers?.length ?? 0} layers, ${model.bones?.length ?? 0} bones`);
  syncEmptyState();

  // Switch to edit mode
  switchMode('edit');
}

// ── Keyboard shortcuts ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  const editable = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
  if (editable) return;

  // ? — show shortcuts overlay
  if (e.key === '?') { e.preventDefault(); openKbdOverlay(); return; }
  // Esc — close overlays if open
  if (e.key === 'Escape') {
    if (document.getElementById('kbdOverlay').style.display !== 'none') { closeKbdOverlay(); return; }
    if (document.getElementById('vtConfirmModal').style.display !== 'none') return; // handled inside modal
    if (document.getElementById('vtNameModal').style.display   !== 'none') return; // handled inside modal
  }

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 's') { e.preventDefault(); saveCurrentModel(); return; }
    if (e.key === 'z') { e.preventDefault(); toast('Undo not yet implemented', 'info'); return; }
  }

  switch (e.key) {
    case 'g': switchMode('generate'); break;
    case 'e': switchMode('edit');     break;
    case 'm': switchMode('mesh');     break;
    case 'b': switchMode('bones');    break;
    case 'w': switchMode('weights');  break;
    case 'p': switchMode('preview');  break;
    case 'f': fitToScreen();          break;
    case 'Delete':
    case 'Backspace':
      if (state.mode === 'bones' && state.selectedBoneId) {
        const bone = state.model.bones.find(b => b.id === state.selectedBoneId);
        showVtConfirm('Delete Bone', `Delete "${bone?.name || 'bone'}"?`, () => {
          state.model.bones = state.model.bones.filter(b => b.id !== state.selectedBoneId);
          selectBone(null); renderBonePanel(); drawBones(); markDirty();
        }, { confirmLabel: 'Delete', icon: 'fa-bone' });
      }
      break;
  }
});

// ── Live Tracking ─────────────────────────────────────────────────
let _trackingWs            = null;
let _trackingReconnectTimer = null;
let _trackingWsUrl         = 'ws://localhost:8082/ws/tracking';

/**
 * Discover the tracking server URL then open the WebSocket.
 * @param {string|null} overrideUrl  – if provided, skip discovery
 */
async function initLiveTracking(overrideUrl = null) {
  if (overrideUrl) {
    _trackingWsUrl = overrideUrl;
  } else {
    try {
      const info = await fetch('/api/tracking/info').then(r => r.json());
      _trackingWsUrl = info.ws_url || _trackingWsUrl;
    } catch { /* keep default */ }
  }

  // Pre-fill the URL input if the inspector is visible
  const urlEl = document.getElementById('liveTrackingUrl');
  if (urlEl && !urlEl.value) urlEl.value = _trackingWsUrl;

  _openTrackingWs();
}

function _openTrackingWs() {
  if (_trackingWs) { _trackingWs.close(); _trackingWs = null; }
  clearTimeout(_trackingReconnectTimer);

  _setLiveStatus('connecting', 'Connecting…');
  setStatus(`Connecting to tracking server at ${_trackingWsUrl}…`);

  const ws = new WebSocket(_trackingWsUrl);
  _trackingWs = ws;

  ws.onopen = () => {
    if (ws !== _trackingWs) return;
    _setLiveStatus('connected', 'Connected');
    setStatus('Live tracking active — face/motion data driving model parameters.');
  };

  ws.onmessage = event => {
    if (ws !== _trackingWs) return;
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'params') _applyTrackingParams(msg.params);
    } catch { /* ignore malformed packets */ }
  };

  ws.onerror = () => {
    if (ws !== _trackingWs) return;
    _setLiveStatus('error', 'Connection failed');
    setStatus('Cannot reach Tracking Engine — make sure it is running (port 8082).');
  };

  ws.onclose = () => {
    if (ws !== _trackingWs) return;
    _trackingWs = null;
    if (state.mode === 'live') {
      _setLiveStatus('error', 'Disconnected — retrying…');
      setStatus('Tracking disconnected — retrying in 3 s…');
      _trackingReconnectTimer = setTimeout(_openTrackingWs, 3000);
    }
  };
}

/** Stop the tracking WebSocket and cancel any reconnect. */
function stopLiveTracking() {
  clearTimeout(_trackingReconnectTimer);
  if (_trackingWs) { _trackingWs.close(); _trackingWs = null; }
  _setLiveStatus('', 'Disconnected');
}

/** Apply a tracking parameter dict to the model's paramValues. */
function _applyTrackingParams(params) {
  if (!state.model) return;
  const modelParams = state.model.parameters ?? {};
  for (const [key, raw] of Object.entries(params)) {
    const val = Number(raw);
    const def = modelParams[key];
    state.paramValues[key] = def
      ? Math.max(def.min, Math.min(def.max, val))
      : val;
  }

  // Update the live parameter display in the inspector
  const display = document.getElementById('liveParamDisplay');
  if (display) {
    display.textContent = Object.entries(params)
      .map(([k, v]) => `${k.padEnd(20)}${Number(v).toFixed(3)}`)
      .join('\n');
  }
}

/** Update the live status dot + text + connect button in the inspector. */
function _setLiveStatus(dotClass, text) {
  const dot = document.getElementById('liveStatusDot');
  const txt = document.getElementById('liveStatusText');
  const btn = document.getElementById('btnLiveConnect');

  if (dot) dot.className = `live-dot${dotClass ? ' ' + dotClass : ''}`;

  if (txt) {
    txt.textContent = text;
    txt.className   = dotClass === 'connected' ? 'live-status-online'
                    : dotClass === 'error'     ? 'live-status-error'
                    :                            'live-status-offline';
  }

  if (btn) {
    const isActive = dotClass === 'connected' || dotClass === 'connecting';
    btn.innerHTML = isActive
      ? '<i class="fa-solid fa-stop" aria-hidden="true"></i> Disconnect'
      : '<i class="fa-solid fa-satellite-dish" aria-hidden="true"></i> Connect';
  }
}

// Inspector Connect button dispatches this event; app.js owns the WS
document.addEventListener('liveConnectRequest', e => {
  if (_trackingWs) {
    stopLiveTracking();
  } else {
    initLiveTracking(e.detail?.url || null);
  }
});

// ── Start in generate mode ────────────────────────────────────────
switchMode('generate');
setStatus('Ready — Create a new model or generate a character to get started.');
