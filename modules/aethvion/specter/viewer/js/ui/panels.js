/**
 * panels.js — UI panel management: layers, bones, params, inspector
 */
import { state, selectLayer, selectBone, getSelectedLayer, getSelectedBone, markDirty } from '../state.js';
import * as api from '../api.js';
import { drawBones } from '../tools/bone-tool.js';
import { loadModel, refreshLayerTexture, captureBoneBindPoses } from '../engine/renderer.js';

// ── Layer Panel ────────────────────────────────────────────────────
export function renderLayerPanel() {
  const container = document.getElementById('layerList');
  if (!container) return;
  container.innerHTML = '';

  const layers = state.model?.layers ?? [];
  const sorted = [...layers].sort((a, b) => (b.order || 0) - (a.order || 0));

  for (const layer of sorted) {
    const item = document.createElement('div');
    item.className = `layer-item${layer.id === state.selectedLayerId ? ' selected' : ''}`;
    item.draggable = true;

    const thumbSrc = state.modelId
      ? `/api/model/${state.modelId}/texture/${layer.texture.replace('textures/', '')}`
      : '';

    item.innerHTML = `
      <img class="layer-thumb" src="${thumbSrc}" onerror="this.style.opacity='0.2'" />
      <div class="layer-info">
        <div class="layer-name">${layer.name}</div>
        <div class="layer-type">${layer.type} · ${layer.mesh?.vertices?.length ?? 0} verts</div>
      </div>
      <div class="layer-actions">
        <button class="layer-vis-btn" title="${layer.visible ? 'Hide' : 'Show'}">
          <i class="fa-solid fa-${layer.visible ? 'eye' : 'eye-slash'}"></i>
        </button>
      </div>
    `;

    item.querySelector('.layer-vis-btn').addEventListener('click', e => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      markDirty();
      renderLayerPanel();
    });

    item.addEventListener('click', () => {
      selectLayer(layer.id);
      renderLayerPanel();
      renderInspector();
    });

    // Drag-to-reorder
    item.addEventListener('dragstart', e => { e.dataTransfer.setData('layerId', layer.id); });
    item.addEventListener('dragover', e => { e.preventDefault(); item.style.opacity = '0.5'; });
    item.addEventListener('dragleave', () => { item.style.opacity = ''; });
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.style.opacity = '';
      const fromId = e.dataTransfer.getData('layerId');
      if (fromId !== layer.id) reorderLayers(fromId, layer.id);
    });

    container.appendChild(item);
  }
}

function reorderLayers(fromId, toId) {
  const layers = state.model?.layers;
  if (!layers) return;
  const fromLayer = layers.find(l => l.id === fromId);
  const toLayer = layers.find(l => l.id === toId);
  if (!fromLayer || !toLayer) return;
  const tmp = fromLayer.order;
  fromLayer.order = toLayer.order;
  toLayer.order = tmp;
  markDirty();
  renderLayerPanel();
}

// ── Bone Panel ────────────────────────────────────────────────────
export function renderBonePanel() {
  const container = document.getElementById('boneTree');
  if (!container) return;
  container.innerHTML = '';

  const bones = state.model?.bones ?? [];
  const roots = bones.filter(b => !b.parentId);
  for (const b of roots) {
    renderBoneNode(b, bones, container);
  }
}

function renderBoneNode(bone, allBones, parentEl, depth = 0) {
  const item = document.createElement('div');
  item.className = `bone-item${bone.id === state.selectedBoneId ? ' selected' : ''}`;
  item.style.paddingLeft = `${6 + depth * 14}px`;

  item.innerHTML = `
    <div class="bone-dot" style="background:${bone.color || '#7c6ff7'}"></div>
    <div class="bone-name">${bone.name}</div>
  `;

  item.addEventListener('click', () => {
    selectBone(bone.id);
    renderBonePanel();
    renderInspector();
    if (state.mode === 'weights') {
      state.activePaintBoneId = bone.id;
      import('../tools/weight-tool.js').then(m => m.redrawWeights());
    }
    if (state.mode === 'bones') {
      drawBones();
    }
  });

  parentEl.appendChild(item);

  const children = allBones.filter(b => b.parentId === bone.id);
  if (children.length > 0) {
    const childContainer = document.createElement('div');
    for (const child of children) {
      renderBoneNode(child, allBones, childContainer, depth + 1);
    }
    parentEl.appendChild(childContainer);
  }
}

// ── Param Panel ────────────────────────────────────────────────────
export function renderParamPanel() {
  const container = document.getElementById('paramList');
  if (!container) return;
  container.innerHTML = '';

  const params = state.model?.parameters ?? {};
  for (const [id, def] of Object.entries(params)) {
    const val = state.paramValues[id] ?? def.default ?? 0;
    const row = document.createElement('div');
    row.className = 'param-row';
    row.innerHTML = `
      <div class="param-label">
        <span>${def.name}</span>
        <span>${val.toFixed(2)}</span>
      </div>
      <input type="range" class="param-slider"
        min="${def.min}" max="${def.max}" step="0.01" value="${val}"
        data-param="${id}" />
    `;
    row.querySelector('input').addEventListener('input', e => {
      state.paramValues[id] = parseFloat(e.target.value);
      e.target.previousElementSibling.querySelector('span:last-child').textContent =
        parseFloat(e.target.value).toFixed(2);
    });
    container.appendChild(row);
  }
}

// ── Inspector ──────────────────────────────────────────────────────
export function renderInspector() {
  const el = document.getElementById('inspector');
  if (!el) return;

  const mode = state.mode;

  if (mode === 'generate') { el.innerHTML = ''; return; }

  if (mode === 'edit' || mode === 'mesh') {
    renderLayerInspector(el);
  } else if (mode === 'bones') {
    renderBoneInspector(el);
  } else if (mode === 'weights') {
    renderWeightInspector(el);
  } else if (mode === 'physics') {
    renderPhysicsInspector(el);
  } else if (mode === 'preview' || mode === 'live') {
    renderPreviewInspector(el);
  }
}

function renderLayerInspector(el) {
  const layer = getSelectedLayer();
  if (!layer) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:12px;padding:10px;">Select a layer</p>';
    return;
  }

  el.innerHTML = `
    <div class="inspector-section">
      <div class="inspector-title">Layer</div>
      <div class="inspector-row">
        <label>Name</label>
        <input class="inspector-input" id="inpLayerName" value="${layer.name}" />
      </div>
      <div class="inspector-row">
        <label>Opacity</label>
        <input class="inspector-input" type="range" min="0" max="1" step="0.01"
          id="inpLayerOpacity" value="${layer.opacity ?? 1}" />
      </div>
      <div class="inspector-row">
        <label>Order Z</label>
        <input class="inspector-input" type="number" id="inpLayerZ" value="${layer.order || 0}" style="width:60px;" />
      </div>
    </div>
    <div class="inspector-section">
      <div class="inspector-title">Transform</div>
      <div class="inspector-row">
        <label>X / Y</label>
        <input class="inspector-input" type="number" id="inpTX" value="${layer.transform?.x || 0}" style="width:56px;" />
        <input class="inspector-input" type="number" id="inpTY" value="${layer.transform?.y || 0}" style="width:56px;" />
      </div>
      <div class="inspector-row">
        <label>Rotation</label>
        <input class="inspector-input" type="number" id="inpTRot" value="${layer.transform?.rotation || 0}" />
      </div>
    </div>
    <div class="inspector-section">
      <div class="inspector-title">Mesh</div>
      <div style="font-size:11px;color:var(--text-dim);">${layer.mesh?.vertices?.length ?? 0} vertices · ${layer.mesh?.triangles?.length ?? 0} triangles</div>
      <div class="inspector-row full" style="margin-top:6px;">
        <label>Auto mesh density</label>
        <select class="inspector-input" id="meshDensityInsp">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="ai">AI adaptive</option>
        </select>
      </div>
      <button class="btn-secondary" id="btnAutoMesh" style="margin-top:4px;">
        <i class="fa-solid fa-bezier-curve"></i> Regenerate Mesh
      </button>
    </div>
    <div class="inspector-section">
      <div class="inspector-title">Background</div>
      <button class="btn-secondary" id="btnRemoveBg"><i class="fa-solid fa-eraser"></i> Remove BG</button>
      <button class="btn-secondary" id="btnRestoreBg" style="margin-top:4px;"><i class="fa-solid fa-rotate-left"></i> Restore BG</button>
    </div>
  `;

  el.querySelector('#inpLayerName').addEventListener('change', e => {
    layer.name = e.target.value; markDirty(); renderLayerPanel();
  });
  el.querySelector('#inpLayerOpacity').addEventListener('input', e => {
    layer.opacity = parseFloat(e.target.value); markDirty();
  });
  el.querySelector('#inpLayerZ').addEventListener('change', e => {
    layer.order = parseInt(e.target.value); markDirty(); renderLayerPanel();
  });
  el.querySelector('#inpTX').addEventListener('change', e => {
    if (!layer.transform) layer.transform = {};
    layer.transform.x = parseFloat(e.target.value); markDirty();
  });
  el.querySelector('#inpTY').addEventListener('change', e => {
    if (!layer.transform) layer.transform = {};
    layer.transform.y = parseFloat(e.target.value); markDirty();
  });
  el.querySelector('#inpTRot').addEventListener('change', e => {
    if (!layer.transform) layer.transform = {};
    layer.transform.rotation = parseFloat(e.target.value); markDirty();
  });
  el.querySelector('#btnAutoMesh').addEventListener('click', async () => {
    if (!state.modelId) return toast('Save model first', 'error');
    const density = el.querySelector('#meshDensityInsp').value;
    showLoading('Generating mesh...');
    try {
      const res = await api.autoMesh(state.modelId, layer.id, density);
      layer.mesh = res.mesh;
      markDirty();
      await loadModel(state.model, state.modelId);
      renderLayerPanel();
      renderInspector();
      toast('Mesh updated', 'success');
    } catch(e) { toast(e.message, 'error'); }
    hideLoading();
  });
  el.querySelector('#btnRemoveBg').addEventListener('click', async () => {
    if (!state.modelId) return toast('Save model first', 'error');
    showLoading('Removing background...');
    try {
      const res = await api.removeLayerBg(state.modelId, layer.id);
      layer.texture = res.texture.replace(/^\/api\/model\/[^/]+\/texture\//, 'textures/');
      refreshLayerTexture(layer, state.modelId);
      toast('Background removed', 'success');
    } catch(e) { toast(e.message, 'error'); }
    hideLoading();
  });
  el.querySelector('#btnRestoreBg').addEventListener('click', async () => {
    if (!state.modelId) return toast('Save model first', 'error');
    showLoading('Restoring...');
    try {
      await api.restoreLayerBg(state.modelId, layer.id);
      refreshLayerTexture(layer, state.modelId);
      toast('Background restored', 'success');
    } catch(e) { toast(e.message, 'error'); }
    hideLoading();
  });
}

function renderBoneInspector(el) {
  const bone = getSelectedBone();

  el.innerHTML = `
    <div class="inspector-section">
      <div class="inspector-title">Auto Rig</div>
      <div class="inspector-row full">
        <label>Bone style</label>
        <select class="inspector-input" id="boneStyleInsp">
          <option value="humanoid">Humanoid</option>
          <option value="minimal">Minimal</option>
          <option value="custom">AI custom</option>
        </select>
      </div>
      <button class="btn-secondary" id="btnAutoBonesInsp" style="margin-top:4px;">
        <i class="fa-solid fa-bone"></i> Generate Bones
      </button>
      <button class="btn-secondary" id="btnAutoWeightsInsp" style="margin-top:4px;">
        <i class="fa-solid fa-weight-hanging"></i> Auto Weights
      </button>
    </div>
    ${bone ? `
    <div class="inspector-section">
      <div class="inspector-title">Bone: ${bone.name}</div>
      <div class="inspector-row">
        <label>Name</label>
        <input class="inspector-input" id="inpBoneName" value="${bone.name}" />
      </div>
      <div class="inspector-row">
        <label>Length</label>
        <input class="inspector-input" type="number" id="inpBoneLen" value="${bone.length}" />
      </div>
      <div class="inspector-row">
        <label>Rotation</label>
        <input class="inspector-input" type="number" id="inpBoneRot" value="${bone.rotation ?? 0}" />
      </div>
      <div class="inspector-row">
        <label>Color</label>
        <input class="inspector-input" type="color" id="inpBoneColor" value="${bone.color || '#7c6ff7'}" />
      </div>
      <div class="inspector-row">
        <label>X / Y</label>
        <input class="inspector-input" type="number" id="inpBoneX" value="${bone.position?.x || 0}" style="width:56px;" />
        <input class="inspector-input" type="number" id="inpBoneY" value="${bone.position?.y || 0}" style="width:56px;" />
      </div>
    </div>` : '<p style="color:var(--text-muted);font-size:12px;padding:10px;">Select a bone to edit</p>'}
  `;

  el.querySelector('#btnAutoBonesInsp').addEventListener('click', async () => {
    if (!state.modelId) return toast('Save model first', 'error');
    const style = el.querySelector('#boneStyleInsp').value;
    showLoading('Generating bones...');
    try {
      const res = await api.autoBones(state.modelId, style);
      state.model.bones = res.bones;
      state.model.bone_params = res.bone_params;
      captureBoneBindPoses();
      renderBonePanel();
      renderInspector();
      drawBones();
      toast('Bones generated', 'success');
    } catch(e) { toast(e.message, 'error'); }
    hideLoading();
  });

  el.querySelector('#btnAutoWeightsInsp').addEventListener('click', async () => {
    if (!state.modelId) return toast('Save model first', 'error');
    showLoading('Calculating weights...');
    try {
      const res = await api.autoWeights(state.modelId);
      state.model.weights = res.weights;
      toast('Weights assigned', 'success');
    } catch(e) { toast(e.message, 'error'); }
    hideLoading();
  });

  if (bone) {
    el.querySelector('#inpBoneName').addEventListener('change', e => {
      bone.name = e.target.value; markDirty(); renderBonePanel(); drawBones();
    });
    el.querySelector('#inpBoneLen').addEventListener('change', e => {
      bone.length = parseFloat(e.target.value); markDirty(); drawBones();
    });
    el.querySelector('#inpBoneRot').addEventListener('change', e => {
      bone.rotation = parseFloat(e.target.value); markDirty(); drawBones();
    });
    el.querySelector('#inpBoneColor').addEventListener('change', e => {
      bone.color = e.target.value; markDirty(); drawBones();
    });
    el.querySelector('#inpBoneX').addEventListener('change', e => {
      if (!bone.position) bone.position = {x:0,y:0};
      bone.position.x = parseFloat(e.target.value); markDirty(); drawBones();
    });
    el.querySelector('#inpBoneY').addEventListener('change', e => {
      if (!bone.position) bone.position = {x:0,y:0};
      bone.position.y = parseFloat(e.target.value); markDirty(); drawBones();
    });
  }
}

function renderWeightInspector(el) {
  const bones = state.model?.bones ?? [];
  const activeBoneId = state.activePaintBoneId;

  el.innerHTML = `
    <div class="inspector-section">
      <div class="inspector-title">Paint Bone</div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;">Select a bone to paint weights for it.</div>
      <div id="weightBoneList" style="display:flex;flex-direction:column;gap:3px;"></div>
    </div>
    <div class="inspector-section">
      <div class="inspector-title">Brush</div>
      <div class="inspector-row">
        <label>Radius</label>
        <input class="inspector-input" type="range" min="10" max="200" id="inspBrushR" value="${state.brushRadius}" />
      </div>
      <div class="inspector-row">
        <label>Strength</label>
        <input class="inspector-input" type="range" min="1" max="100" id="inspBrushS" value="${state.brushStrength * 100}" />
      </div>
      <div class="inspector-row full">
        <label>Mode</label>
        <select class="inspector-input" id="inspBrushMode">
          <option value="add" ${state.brushMode==='add'?'selected':''}>Add</option>
          <option value="subtract" ${state.brushMode==='subtract'?'selected':''}>Subtract</option>
          <option value="smooth" ${state.brushMode==='smooth'?'selected':''}>Smooth</option>
        </select>
      </div>
    </div>
    <div class="inspector-section">
      <button class="btn-secondary" id="btnAutoWeightsW">
        <i class="fa-solid fa-weight-hanging"></i> Auto Weights
      </button>
    </div>
  `;

  const boneList = el.querySelector('#weightBoneList');
  for (const bone of bones) {
    const btn = document.createElement('button');
    btn.className = `btn-secondary${bone.id === activeBoneId ? ' active' : ''}`;
    btn.style.justifyContent = 'flex-start';
    btn.style.gap = '6px';
    btn.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${bone.color||'#7c6ff7'};display:inline-block;"></span>${bone.name}`;
    if (bone.id === activeBoneId) btn.style.borderColor = 'var(--accent)';
    btn.addEventListener('click', () => {
      state.activePaintBoneId = bone.id;
      import('../tools/weight-tool.js').then(m => m.redrawWeights());
      renderWeightInspector(el);
    });
    boneList.appendChild(btn);
  }

  el.querySelector('#inspBrushR').addEventListener('input', e => {
    state.brushRadius = parseInt(e.target.value);
    document.getElementById('brushRadius').value = state.brushRadius;
  });
  el.querySelector('#inspBrushS').addEventListener('input', e => {
    state.brushStrength = parseInt(e.target.value) / 100;
    document.getElementById('brushStrength').value = parseInt(e.target.value);
  });
  el.querySelector('#inspBrushMode').addEventListener('change', e => {
    state.brushMode = e.target.value;
    document.getElementById('brushMode').value = state.brushMode;
  });

  el.querySelector('#btnAutoWeightsW').addEventListener('click', async () => {
    if (!state.modelId) return toast('Save model first', 'error');
    showLoading('Calculating weights...');
    try {
      const res = await api.autoWeights(state.modelId);
      state.model.weights = res.weights;
      import('../tools/weight-tool.js').then(m => m.redrawWeights());
      toast('Weights assigned', 'success');
    } catch(e) { toast(e.message, 'error'); }
    hideLoading();
  });
}

function renderPhysicsInspector(el) {
  const groups = state.model?.physics_groups ?? [];
  const bones = state.model?.bones ?? [];
  const params = state.model?.parameters ?? {};

  el.innerHTML = `
    <div class="inspector-section">
      <div class="inspector-title">Physics Groups</div>
      <button class="btn-secondary" id="btnAddPhysics"><i class="fa-solid fa-plus"></i> Add Group</button>
    </div>
    <div id="physicsList" style="display:flex;flex-direction:column;gap:8px;margin-top:4px;"></div>
  `;

  const list = el.querySelector('#physicsList');
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const s = g.settings ?? {};
    const div = document.createElement('div');
    div.className = 'inspector-section';
    div.innerHTML = `
      <div class="inspector-title">${g.name}</div>
      <div class="inspector-row">
        <label>Input</label>
        <select class="inspector-input" data-gi="${gi}" data-field="input">
          ${Object.entries(params).map(([id, def]) => `<option value="${id}" ${g.input===id?'selected':''}>${def.name}</option>`).join('')}
        </select>
      </div>
      <div class="inspector-row"><label>Gravity</label>
        <input class="inspector-input" type="range" min="0" max="2" step="0.05" data-gi="${gi}" data-field="gravity" value="${s.gravity??0.3}" /></div>
      <div class="inspector-row"><label>Momentum</label>
        <input class="inspector-input" type="range" min="0" max="1" step="0.01" data-gi="${gi}" data-field="momentum" value="${s.momentum??0.8}" /></div>
      <div class="inspector-row"><label>Damping</label>
        <input class="inspector-input" type="range" min="0" max="1" step="0.01" data-gi="${gi}" data-field="damping" value="${s.damping??0.15}" /></div>
      <button class="btn-danger" data-gi="${gi}" style="margin-top:4px;width:100%;">Remove</button>
    `;
    div.querySelectorAll('input[type="range"]').forEach(inp => {
      inp.addEventListener('input', e => {
        const gIdx = parseInt(e.target.dataset.gi);
        const field = e.target.dataset.field;
        if (!groups[gIdx].settings) groups[gIdx].settings = {};
        groups[gIdx].settings[field] = parseFloat(e.target.value);
        markDirty();
      });
    });
    div.querySelector('select').addEventListener('change', e => {
      const gIdx = parseInt(e.target.dataset.gi);
      groups[gIdx].input = e.target.value; markDirty();
    });
    div.querySelector('.btn-danger').addEventListener('click', () => {
      groups.splice(gi, 1);
      renderPhysicsInspector(el); markDirty();
    });
    list.appendChild(div);
  }

  el.querySelector('#btnAddPhysics').addEventListener('click', () => {
    const hairBones = bones.filter(b => b.name.toLowerCase().includes('hair')).map(b => b.id);
    groups.push({
      id: Math.random().toString(36).slice(2, 14),
      name: `Physics ${groups.length + 1}`,
      input: Object.keys(params)[0] || '',
      bones: hairBones,
      settings: { gravity: 0.3, momentum: 0.8, damping: 0.15, wind: 0 },
    });
    renderPhysicsInspector(el); markDirty();
  });
}

function renderPreviewInspector(el) {
  const anims = state.model?.animations ?? {};
  el.innerHTML = `
    <div class="inspector-section">
      <div class="inspector-title">Animation</div>
      <div class="inspector-row full">
        <label>Clip</label>
        <select class="inspector-input" id="animSelect">
          ${Object.entries(anims).map(([id, a]) => `<option value="${id}" ${state.currentAnim===id?'selected':''}>${a.name || id}</option>`).join('')}
        </select>
      </div>
      <div class="inspector-row">
        <label>Loop</label>
        <input type="checkbox" id="animLoop" ${anims[state.currentAnim]?.loop ? 'checked' : ''} />
      </div>
    </div>
    <div class="inspector-section">
      <div class="inspector-title">Background</div>
      <div class="inspector-row full">
        <label>Color</label>
        <input type="color" class="inspector-input" id="bgColor" value="#080a12" />
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
        <input type="checkbox" id="greenScreen" /> Greenscreen
      </label>
    </div>
  `;

  el.querySelector('#animSelect').addEventListener('change', e => {
    state.currentAnim = e.target.value;
    state.animTime = 0;
    document.getElementById('animName').textContent = e.target.value;
  });
  el.querySelector('#bgColor').addEventListener('input', e => {
    const hex = e.target.value;
    const c = parseInt(hex.slice(1), 16);
    if (window._pixiApp) window._pixiApp.renderer.background.color = c;
  });
  el.querySelector('#greenScreen').addEventListener('change', e => {
    const color = e.target.checked ? 0x00ff00 : 0x080a12;
    if (window._pixiApp) window._pixiApp.renderer.background.color = color;
  });
}

// ── Utils ──────────────────────────────────────────────────────────
export function showLoading(msg = 'Working...') {
  document.getElementById('loadingMsg').textContent = msg;
  document.getElementById('loadingOverlay').style.display = 'flex';
}

export function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

export function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function setStatus(msg) {
  const el = document.getElementById('statusMsg');
  if (el) el.textContent = msg;
}
