// CURTAIN CALL — M2 detection: suspicion meter 0..1 per guard.
// Rises while the player is seen (faster when close / running / in light),
// decays while unseen. Thresholds live in config.js; the FSM in guard.js
// reads them. Pure functions, no DOM, no state.
import CONFIG from './config.js';
import { lightAt as levelLightAt, floorAt } from './level.js';

// M3: the real light map lives in level.js (stage pools vs dark wings).
// Re-exported here so M2 callers (updateSuspicion, tests) keep importing
// lightAt from detection.js. Binary: 1.0 in a pool, 0.35 in the dark.
export { levelLightAt as lightAt };

// Noise radius of a running player at (x, y): wood is loud, carpet is
// quiet, walking is silent. Guards inside the radius hear the noise.
// M14: `level` is the active job's level (default Job 1).
export function noiseRadiusAt(x, y, running, level) {
  if (!running) return 0;
  return floorAt(x, y, level) === 'carpet'
    ? CONFIG.NOISE_RUN_CARPET
    : CONFIG.NOISE_RUN_WOOD;
}

// Suspicion gained per second while seen. Closer = faster; running = louder.
export function fillRate(dist, running, light) {
  const clamped = Math.min(Math.max(dist, 0), CONFIG.VIEW_DIST);
  const proximity = 1 + (1 - clamped / CONFIG.VIEW_DIST);
  return (
    CONFIG.SUSPICION_FILL_BASE *
    proximity *
    (running ? CONFIG.SUSPICION_RUN_MULT : 1) *
    light
  );
}

// ctx: { dist, running, x, y, level? } — player position feeds lightAt
// (M3); `level` is the active job's level (M14, default Job 1).
export function updateSuspicion(suspicion, seen, ctx, dt) {
  if (seen) {
    const rate = fillRate(ctx.dist, ctx.running, levelLightAt(ctx.x, ctx.y, ctx.level));
    return Math.min(1, suspicion + rate * dt);
  }
  return Math.max(0, suspicion - CONFIG.SUSPICION_DECAY * dt);
}
