/**
 * bone-tool.js — Bone creation and editing tool for Specter Editor
 */
import { state, getBone, selectBone, markDirty } from '../state.js';
import { canvasToScreen, screenToCanvas, computeBoneWorld } from '../engine/renderer.js';

let svg = null;
let activeTool = 'select';  // select | add | delete
let dragBoneId = null;
let dragProperty = null;  // 'head' | 'tail'
let isDragging = false;
let dragStart = { x: 0, y: 0 };

const HEAD_R = 7;
const TAIL_R = 5;

export function boneToolActivate(svgEl) {
  svg = svgEl;
  svg.classList.add('interactive');
  svg.addEventListener('mousedown', onMouseDown);
  svg.addEventListener('mousemove', onMouseMove);
  svg.addEventListener('mouseup', onMouseUp);
  svg.addEventListener('contextmenu', e => e.preventDefault());
  drawBones();
}

export function boneToolDeactivate() {
  if (!svg) return;
  svg.classList.remove('interactive');
  svg.removeEventListener('mousedown', onMouseDown);
  svg.removeEventListener('mousemove', onMouseMove);
  svg.removeEventListener('mouseup', onMouseUp);
  clearOverlay();
  svg = null;
}

export function setBoneTool(tool) {
  activeTool = tool;
  if (!svg) return;
  svg.style.cursor = tool === 'add' ? 'crosshair' : 'default';
}

// ── Drawing ────────────────────────────────────────────────────────
export function drawBones() {
  if (!svg) return;
  clearOverlay();
  const bones = state.model?.bones;
  if (!bones?.length) return;

  for (const bone of bones) {
    const wt = computeBoneWorld(bone);
    const headScr = canvasToScreen(wt.x, wt.y);
    const rot = wt.rotation * Math.PI / 180;
    const tailX = wt.x + Math.cos(rot) * bone.length;
    const tailY = wt.y + Math.sin(rot) * bone.length;
    const tailScr = canvasToScreen(tailX, tailY);

    const isSelected = state.selectedBoneId === bone.id;
    const color = bone.color || '#7c6ff7';

    // Bone shaft (diamond shape)
    const dx = tailScr.x - headScr.x;
    const dy = tailScr.y - headScr.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const w = 5;

    const tipFrac = 0.2;
    const tx = headScr.x + dx * tipFrac;
    const ty = headScr.y + dy * tipFrac;

    const diamond = createSvgEl('polygon');
    diamond.setAttribute('points', [
      `${headScr.x},${headScr.y}`,
      `${tx + nx * w},${ty + ny * w}`,
      `${tailScr.x},${tailScr.y}`,
      `${tx - nx * w},${ty - ny * w}`,
    ].join(' '));
    diamond.setAttribute('fill', isSelected ? '#00d9ff' : color);
    diamond.setAttribute('fill-opacity', '0.6');
    diamond.setAttribute('stroke', isSelected ? 'white' : color);
    diamond.setAttribute('stroke-width', isSelected ? '2' : '1');
    diamond.setAttribute('class', `ov-bone-shape${isSelected ? ' selected' : ''}`);
    diamond.dataset.boneId = bone.id;
    diamond.style.cursor = 'pointer';
    svg.appendChild(diamond);

    // Head dot
    const head = createSvgEl('circle');
    head.setAttribute('cx', headScr.x);
    head.setAttribute('cy', headScr.y);
    head.setAttribute('r', HEAD_R);
    head.setAttribute('class', `ov-bone-head${isSelected ? ' selected' : ''}`);
    head.setAttribute('fill', color);
    head.setAttribute('stroke', 'white');
    head.setAttribute('stroke-width', '1.5');
    head.dataset.boneId = bone.id;
    head.dataset.part = 'head';
    svg.appendChild(head);

    // Bone name
    const midX = (headScr.x + tailScr.x) / 2;
    const midY = (headScr.y + tailScr.y) / 2 - 8;
    const label = createSvgEl('text');
    label.setAttribute('x', midX);
    label.setAttribute('y', midY);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', isSelected ? '#00d9ff' : 'rgba(255,255,255,0.6)');
    label.setAttribute('font-size', '10');
    label.setAttribute('font-family', 'Inter, sans-serif');
    label.setAttribute('pointer-events', 'none');
    label.textContent = bone.name;
    svg.appendChild(label);
  }
}

// ── Mouse Events ───────────────────────────────────────────────────
function onMouseDown(e) {
  if (e.button !== 0) return;
  const pos = svgPos(e);

  if (activeTool === 'add') {
    const canvasPos = screenToCanvas(pos.x, pos.y);
    addBone(canvasPos.x, canvasPos.y);
    return;
  }

  // Hit test bones
  const hit = hitTestBone(pos);
  if (hit) {
    const { boneId, part } = hit;
    selectBone(boneId);

    if (activeTool === 'delete') {
      deleteBone(boneId);
      return;
    }

    dragBoneId = boneId;
    dragProperty = part;
    isDragging = true;
    dragStart = pos;
    drawBones();
  } else {
    selectBone(null);
    drawBones();
  }

  // Emit selection event
  document.dispatchEvent(new CustomEvent('boneSelected', { detail: { boneId: state.selectedBoneId } }));
}

function onMouseMove(e) {
  if (!isDragging || !dragBoneId) return;
  const pos = svgPos(e);
  const canvasPos = screenToCanvas(pos.x, pos.y);
  const bone = getBone(dragBoneId);
  if (!bone) return;

  if (dragProperty === 'head') {
    bone.position.x = canvasPos.x;
    bone.position.y = canvasPos.y;
  }

  drawBones();
  markDirty();
}

function onMouseUp() {
  isDragging = false;
  dragBoneId = null;
}

// ── Operations ────────────────────────────────────────────────────
function addBone(cx, cy) {
  const parentId = state.selectedBoneId || null;
  const id = Math.random().toString(36).slice(2, 14);
  const bone = {
    id,
    name: `Bone${(state.model.bones?.length ?? 0) + 1}`,
    parentId,
    position: { x: cx, y: cy },
    rotation: -90,
    length: 80,
    color: '#7c6ff7',
    visible: true,
  };

  if (!state.model.bones) state.model.bones = [];
  state.model.bones.push(bone);
  selectBone(id);
  drawBones();
  markDirty();

  document.dispatchEvent(new CustomEvent('bonesChanged'));
  document.dispatchEvent(new CustomEvent('boneSelected', { detail: { boneId: id } }));
}

function deleteBone(boneId) {
  if (!state.model.bones) return;
  state.model.bones = state.model.bones.filter(b => b.id !== boneId);
  // Orphan children (set parent to null)
  for (const b of state.model.bones) {
    if (b.parentId === boneId) b.parentId = null;
  }
  if (state.selectedBoneId === boneId) selectBone(null);
  drawBones();
  markDirty();
  document.dispatchEvent(new CustomEvent('bonesChanged'));
}

// ── Helpers ────────────────────────────────────────────────────────
function hitTestBone(screenPos) {
  const bones = state.model?.bones ?? [];
  for (const bone of bones) {
    const wt = computeBoneWorld(bone);
    const headScr = canvasToScreen(wt.x, wt.y);
    const d = Math.hypot(screenPos.x - headScr.x, screenPos.y - headScr.y);
    if (d <= HEAD_R + 3) return { boneId: bone.id, part: 'head' };

    // Check shaft hit
    const rot = wt.rotation * Math.PI / 180;
    const tailX = wt.x + Math.cos(rot) * bone.length;
    const tailY = wt.y + Math.sin(rot) * bone.length;
    const tailScr = canvasToScreen(tailX, tailY);
    if (distToSegment(screenPos, headScr, tailScr) <= 6) {
      return { boneId: bone.id, part: 'shaft' };
    }
  }
  return null;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
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

export { drawBones as redrawBones };
