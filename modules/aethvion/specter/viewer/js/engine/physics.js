/**
 * physics.js — Simple spring physics simulation for hair, accessories, etc.
 * Applies to bones in physics_groups based on input parameters.
 */
import { state } from '../state.js';

// Per-bone physics runtime state
const physBones = {};  // boneId → { pos: {x,y}, vel: {x,y}, targetPos: {x,y} }

export function initPhysics() {
  physBones.length = 0;
  Object.keys(physBones).forEach(k => delete physBones[k]);
  if (!state.model?.physics_groups) return;

  for (const group of state.model.physics_groups) {
    for (const boneId of group.bones) {
      const wt = state.boneWorldTransforms[boneId];
      if (!wt) continue;
      physBones[boneId] = {
        pos: { x: wt.x, y: wt.y },
        vel: { x: 0, y: 0 },
        group,
      };
    }
  }
}

export function updatePhysics(dt) {
  if (!state.model?.physics_groups) return;

  for (const group of state.model.physics_groups) {
    const settings = group.settings ?? {};
    const gravity = settings.gravity ?? 0.3;
    const damping = settings.damping ?? 0.15;
    const momentum = settings.momentum ?? 0.8;
    const wind = settings.wind ?? 0;

    // Input parameter influence
    const inputVal = state.paramValues[group.input] ?? 0;

    for (const boneId of group.bones) {
      const ph = physBones[boneId];
      if (!ph) continue;

      const wt = state.boneWorldTransforms[boneId];
      if (!wt) continue;

      // Target is the bone's current driven position
      const targetX = wt.x + inputVal * 5;
      const targetY = wt.y;

      // Spring force toward target
      const springX = (targetX - ph.pos.x) * (1 - momentum);
      const springY = (targetY - ph.pos.y) * (1 - momentum);

      // Apply forces
      ph.vel.x = (ph.vel.x + springX + wind * dt) * (1 - damping);
      ph.vel.y = (ph.vel.y + springY + gravity * dt) * (1 - damping);

      ph.pos.x += ph.vel.x;
      ph.pos.y += ph.vel.y;

      // Apply back to bone world transform
      wt.x = ph.pos.x;
      wt.y = ph.pos.y;
    }
  }
}

export function resetPhysics() {
  for (const [boneId, ph] of Object.entries(physBones)) {
    const wt = state.boneWorldTransforms[boneId];
    if (wt) {
      ph.pos = { x: wt.x, y: wt.y };
      ph.vel = { x: 0, y: 0 };
    }
  }
}
