/**
 * mesh-tool.js — Mesh editing tool for Specter Editor
 * Allows viewing, adding, moving, and deleting mesh vertices per layer.
 */
import { state, getSelectedLayer, markDirty } from '../state.js';
import { canvasToScreen, screenToCanvas } from '../engine/renderer.js';

let svg = null;
let activeTool = 'select';  // select | add | delete
let dragVertIdx = -1;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let origVertPos = { x: 0, y: 0 };

const VERT_R = 5;

export function meshToolActivate(svgEl) {
  svg = svgEl;
  svg.classList.add('interactive');
  svg.addEventListener('mousedown', onMouseDown);
  svg.addEventListener('mousemove', onMouseMove);
  svg.addEventListener('mouseup', onMouseUp);
  svg.addEventListener('contextmenu', e => e.preventDefault());
  drawMesh();
}

export function meshToolDeactivate() {
  if (!svg) return;
  svg.classList.remove('interactive');
  svg.removeEventListener('mousedown', onMouseDown);
  svg.removeEventListener('mousemove', onMouseMove);
  svg.removeEventListener('mouseup', onMouseUp);
  clearOverlay();
  svg = null;
}

export function setMeshTool(tool) {
  activeTool = tool;
  svg.style.cursor = tool === 'add' ? 'crosshair' : tool === 'delete' ? 'not-allowed' : 'default';
}

// ── Drawing ────────────────────────────────────────────────────────
export function drawMesh() {
  if (!svg) return;
  clearOverlay();
  const layer = getSelectedLayer();
  if (!layer?.mesh?.vertices?.length) return;

  const { vertices, triangles } = layer.mesh;

  // Draw triangles
  for (const [a, b, c] of triangles) {
    if (a >= vertices.length || b >= vertices.length || c >= vertices.length) continue;
    const pa = canvasToScreen(vertices[a][0], vertices[a][1]);
    const pb = canvasToScreen(vertices[b][0], vertices[b][1]);
    const pc = canvasToScreen(vertices[c][0], vertices[c][1]);
    const path = createSvgEl('path');
    path.setAttribute('d', `M${pa.x},${pa.y} L${pb.x},${pb.y} L${pc.x},${pc.y} Z`);
    path.setAttribute('class', 'ov-tri-line');
    svg.appendChild(path);
  }

  // Draw vertices
  for (let i = 0; i < vertices.length; i++) {
    const p = canvasToScreen(vertices[i][0], vertices[i][1]);
    const circle = createSvgEl('circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', VERT_R);
    circle.setAttribute('class', `ov-vert${state.selectedVertices.has(i) ? ' selected' : ''}`);
    circle.dataset.idx = i;
    svg.appendChild(circle);
  }
}

// ── Mouse Events ───────────────────────────────────────────────────
function onMouseDown(e) {
  if (e.button !== 0) return;
  const pos = svgPos(e);
  const canvasPos = screenToCanvas(pos.x, pos.y);
  const layer = getSelectedLayer();
  if (!layer?.mesh) return;

  if (activeTool === 'add') {
    addVertex(layer, canvasPos.x, canvasPos.y);
    return;
  }

  // Check if clicking on a vertex
  const idx = hitTestVertex(layer, pos);
  if (idx >= 0) {
    if (activeTool === 'delete') {
      deleteVertex(layer, idx);
      return;
    }
    // select + drag
    if (!e.shiftKey) state.selectedVertices.clear();
    state.selectedVertices.add(idx);
    dragVertIdx = idx;
    isDragging = true;
    dragStart = { x: pos.x, y: pos.y };
    origVertPos = { x: layer.mesh.vertices[idx][0], y: layer.mesh.vertices[idx][1] };
    drawMesh();
  } else {
    if (!e.shiftKey) {
      state.selectedVertices.clear();
      drawMesh();
    }
  }
}

function onMouseMove(e) {
  if (!isDragging || dragVertIdx < 0) return;
  const pos = svgPos(e);
  const dx = (pos.x - dragStart.x) / state.viewScale;
  const dy = (pos.y - dragStart.y) / state.viewScale;

  const layer = getSelectedLayer();
  if (!layer?.mesh) return;

  // Move all selected vertices
  for (const idx of state.selectedVertices) {
    layer.mesh.vertices[idx][0] = origVertPos.x + (idx === dragVertIdx ? dx : dx);
    layer.mesh.vertices[idx][1] = origVertPos.y + (idx === dragVertIdx ? dy : dy);
  }

  drawMesh();
  markDirty();
}

function onMouseUp() {
  if (isDragging) {
    isDragging = false;
    dragVertIdx = -1;
  }
}

// ── Operations ────────────────────────────────────────────────────
function addVertex(layer, cx, cy) {
  const verts = layer.mesh.vertices;
  const uvs = layer.mesh.uvs;
  const tris = layer.mesh.triangles;

  // UV from canvas position
  const texW = layer.texture_size?.width || 200;
  const texH = layer.texture_size?.height || 200;
  const tx = layer.transform || {};
  const bx = (tx.x || 0) + 1024 - texW / 2;
  const by = (tx.y || 0) + 1024 - texH / 2;
  const u = Math.max(0, Math.min(1, (cx - bx) / texW));
  const v = Math.max(0, Math.min(1, (cy - by) / texH));

  const newIdx = verts.length;
  verts.push([cx, cy]);
  uvs.push([u, v]);

  // Connect to nearest 2 vertices to form triangles
  if (newIdx >= 2) {
    // Find 2 nearest
    const dists = verts.slice(0, newIdx).map((v2, i) => ({
      i,
      d: Math.hypot(cx - v2[0], cy - v2[1]),
    })).sort((a, b) => a.d - b.d);

    if (dists.length >= 2) {
      tris.push([newIdx, dists[0].i, dists[1].i]);
    }
  }

  drawMesh();
  markDirty();
}

function deleteVertex(layer, idx) {
  const verts = layer.mesh.vertices;
  const uvs = layer.mesh.uvs;

  verts.splice(idx, 1);
  uvs.splice(idx, 1);

  // Remove triangles using this vertex and remap higher indices
  layer.mesh.triangles = layer.mesh.triangles
    .filter(t => !t.includes(idx))
    .map(t => t.map(vi => vi > idx ? vi - 1 : vi));

  state.selectedVertices.delete(idx);
  drawMesh();
  markDirty();
}

// ── Helpers ────────────────────────────────────────────────────────
function hitTestVertex(layer, screenPos) {
  const verts = layer.mesh.vertices;
  for (let i = 0; i < verts.length; i++) {
    const p = canvasToScreen(verts[i][0], verts[i][1]);
    const d = Math.hypot(screenPos.x - p.x, screenPos.y - p.y);
    if (d <= VERT_R + 2) return i;
  }
  return -1;
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
}

// Export mesh tool's draw so the renderer can call it after updates
export { drawMesh as redrawMesh };
