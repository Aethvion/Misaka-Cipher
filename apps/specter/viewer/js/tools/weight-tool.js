/**
 * weight-tool.js — Weight painting tool for Specter Editor
 * Paints per-vertex bone weights on the selected layer with a brush.
 */
import { state, getSelectedLayer, getWeights, markDirty } from '../state.js';
import { canvasToScreen, screenToCanvas } from '../engine/renderer.js';

let svg = null;
let isPainting = false;
let brushCursor = null;

export function weightToolActivate(svgEl) {
  svg = svgEl;
  svg.classList.add('interactive');
  svg.style.cursor = 'none';

  // Create brush cursor
  brushCursor = createSvgEl('circle');
  brushCursor.setAttribute('r', state.brushRadius);
  brushCursor.setAttribute('fill', 'rgba(124,111,247,0.1)');
  brushCursor.setAttribute('stroke', 'rgba(124,111,247,0.7)');
  brushCursor.setAttribute('stroke-width', '1.5');
  brushCursor.setAttribute('pointer-events', 'none');
  svg.appendChild(brushCursor);

  svg.addEventListener('mousedown', onMouseDown);
  svg.addEventListener('mousemove', onMouseMove);
  svg.addEventListener('mouseup', onMouseUp);
  svg.addEventListener('mouseleave', () => { brushCursor.setAttribute('cx', -9999); });

  // Show brush overlay
  document.getElementById('weightBrushOverlay').style.display = 'flex';
  drawWeightVerts();
}

export function weightToolDeactivate() {
  if (!svg) return;
  svg.classList.remove('interactive');
  svg.style.cursor = '';
  svg.removeEventListener('mousedown', onMouseDown);
  svg.removeEventListener('mousemove', onMouseMove);
  svg.removeEventListener('mouseup', onMouseUp);
  clearOverlay();
  document.getElementById('weightBrushOverlay').style.display = 'none';
  svg = null;
}

// ── Drawing ────────────────────────────────────────────────────────
export function drawWeightVerts() {
  if (!svg) return;
  clearOverlaySafe();

  // Re-add brush cursor
  if (!brushCursor.parentNode) svg.appendChild(brushCursor);

  const layer = getSelectedLayer();
  if (!layer?.mesh?.vertices?.length) return;

  const boneId = state.activePaintBoneId;
  const weights = boneId ? (state.model.weights?.[layer.id]?.[boneId] ?? []) : [];

  for (let i = 0; i < layer.mesh.vertices.length; i++) {
    const v = layer.mesh.vertices[i];
    const p = canvasToScreen(v[0], v[1]);
    const w = weights[i] ?? 0;

    const circle = createSvgEl('circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', 4);
    circle.setAttribute('fill', weightColor(w));
    circle.setAttribute('stroke', 'rgba(0,0,0,0.4)');
    circle.setAttribute('stroke-width', '0.8');
    circle.setAttribute('class', 'ov-weight-vert');
    circle.dataset.idx = i;
    svg.appendChild(circle);
  }

  // Triangles (dim)
  for (const tri of layer.mesh.triangles) {
    const [a, b, c] = tri;
    const verts = layer.mesh.vertices;
    if (a >= verts.length || b >= verts.length || c >= verts.length) continue;
    const pa = canvasToScreen(verts[a][0], verts[a][1]);
    const pb = canvasToScreen(verts[b][0], verts[b][1]);
    const pc = canvasToScreen(verts[c][0], verts[c][1]);
    const path = createSvgEl('path');
    path.setAttribute('d', `M${pa.x},${pa.y} L${pb.x},${pb.y} L${pc.x},${pc.y} Z`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(255,255,255,0.08)');
    path.setAttribute('stroke-width', '0.5');
    path.setAttribute('pointer-events', 'none');
    svg.insertBefore(path, brushCursor);
  }

  svg.appendChild(brushCursor);
}

// ── Mouse Events ───────────────────────────────────────────────────
function onMouseDown(e) {
  if (e.button !== 0) return;
  isPainting = true;
  paint(e);
}

function onMouseMove(e) {
  const pos = svgPos(e);
  brushCursor.setAttribute('cx', pos.x);
  brushCursor.setAttribute('cy', pos.y);
  brushCursor.setAttribute('r', state.brushRadius);

  if (isPainting) paint(e);
}

function onMouseUp() { isPainting = false; }

function paint(e) {
  const layer = getSelectedLayer();
  if (!layer?.mesh?.vertices?.length || !state.activePaintBoneId) return;

  const pos = svgPos(e);
  const canvasCenter = screenToCanvas(pos.x, pos.y);
  const boneId = state.activePaintBoneId;
  const brushR = state.brushRadius / state.viewScale;  // Convert brush radius to canvas space
  const strength = state.brushStrength;
  const mode = state.brushMode;

  const ws = getWeights(layer.id, boneId);
  if (!ws) return;

  const verts = layer.mesh.vertices;
  let changed = false;

  for (let i = 0; i < verts.length; i++) {
    const dx = verts[i][0] - canvasCenter.x;
    const dy = verts[i][1] - canvasCenter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > brushR) continue;

    // Falloff: 1 at center, 0 at edge
    const falloff = 1 - dist / brushR;
    const amount = strength * falloff * 0.08;  // small increments

    if (mode === 'add') {
      ws[i] = Math.min(1, (ws[i] ?? 0) + amount);
    } else if (mode === 'subtract') {
      ws[i] = Math.max(0, (ws[i] ?? 0) - amount);
    } else if (mode === 'smooth') {
      const neighbors = getNeighborWeights(layer, i, boneId);
      if (neighbors.length > 0) {
        const avg = neighbors.reduce((s, w) => s + w, 0) / neighbors.length;
        ws[i] = ws[i] + (avg - ws[i]) * amount * 10;
      }
    }
    changed = true;
  }

  if (changed) {
    normalizeVertexWeights(layer.id, verts.length);
    markDirty();
    drawWeightVerts();
  }
}

// Normalize all bone weights at each vertex so they sum to 1
function normalizeVertexWeights(layerId, nVerts) {
  const layerWeights = state.model.weights?.[layerId];
  if (!layerWeights) return;

  const boneIds = Object.keys(layerWeights);
  for (let vi = 0; vi < nVerts; vi++) {
    const total = boneIds.reduce((s, bid) => s + (layerWeights[bid]?.[vi] ?? 0), 0);
    if (total > 0) {
      for (const bid of boneIds) {
        if (layerWeights[bid]?.[vi] !== undefined) {
          layerWeights[bid][vi] /= total;
        }
      }
    }
  }
}

function getNeighborWeights(layer, vertIdx, boneId) {
  const tris = layer.mesh.triangles;
  const neighborIdx = new Set();
  for (const [a, b, c] of tris) {
    if (a === vertIdx) { neighborIdx.add(b); neighborIdx.add(c); }
    if (b === vertIdx) { neighborIdx.add(a); neighborIdx.add(c); }
    if (c === vertIdx) { neighborIdx.add(a); neighborIdx.add(b); }
  }
  const ws = state.model.weights?.[layer.id]?.[boneId] ?? [];
  return [...neighborIdx].map(i => ws[i] ?? 0);
}

// ── Helpers ────────────────────────────────────────────────────────
function weightColor(w) {
  // Blue (0) → Green (0.5) → Red (1)
  if (w <= 0) return 'rgba(0,100,200,0.8)';
  if (w >= 1) return 'rgba(255,50,50,0.95)';
  if (w < 0.5) {
    const t = w * 2;
    const g = Math.round(100 + 155 * t);
    return `rgba(0,${g},${Math.round(200 * (1 - t))},0.85)`;
  } else {
    const t = (w - 0.5) * 2;
    const r = Math.round(255 * t);
    return `rgba(${r},${Math.round(230 * (1 - t) + 50)},0,0.85)`;
  }
}

function svgPos(e) {
  const rect = svg.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function createSvgEl(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function clearOverlay() {
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  brushCursor = null;
}

function clearOverlaySafe() {
  if (!svg) return;
  const children = [...svg.childNodes];
  for (const child of children) {
    if (child !== brushCursor) svg.removeChild(child);
  }
}

export { drawWeightVerts as redrawWeights };
