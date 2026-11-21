// CURTAIN CALL — M2 vision: guard perception, cheap -> expensive.
// game-ai: (1) squared distance vs VIEW_DIST, (2) cone dot-product,
// (3) raycast to TWO sample points (head/chest) vs walls + low cover.
// One clear sample point is enough to see — a thin cover over the center
// ray alone does not hide the player. Pure functions, no DOM, no state.
import CONFIG from './config.js';

const COS_HALF_ANGLE = Math.cos(
  (CONFIG.VIEW_HALF_ANGLE_DEG * Math.PI) / 180,
);

// Segment vs axis-aligned rect (slab method). True when the segment
// touches or crosses the rect — used for line of sight.
export function segmentBlocked(x1, y1, x2, y2, rects) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (const r of rects) {
    let tmin = 0;
    let tmax = 1;
    for (const [p, d, lo, hi] of [
      [x1, dx, r.x, r.x + r.w],
      [y1, dy, r.y, r.y + r.h],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (p < lo || p > hi) { tmin = 1; tmax = 0; break; }
      } else {
        let t0 = (lo - p) / d;
        let t1 = (hi - p) / d;
        if (t0 > t1) [t0, t1] = [t1, t0];
        tmin = Math.max(tmin, t0);
        tmax = Math.min(tmax, t1);
        if (tmin > tmax) break;
      }
    }
    if (tmin <= tmax) return true;
  }
  return false;
}

// guard: { x, y, dir } — dir normalized. player: { x, y, r }.
// blockers: rects that stop sight (walls + covers).
// Returns { seen, reason } — reason is for debug/HUD, not gameplay.
export function canSee(guard, player, blockers) {
  const dx = player.x - guard.x;
  const dy = player.y - guard.y;
  const distSq = dx * dx + dy * dy;
  if (distSq > CONFIG.VIEW_DIST * CONFIG.VIEW_DIST) {
    return { seen: false, reason: 'out-of-range' };
  }
  const dist = Math.sqrt(distSq) || 1;
  const dot = (dx / dist) * guard.dir.x + (dy / dist) * guard.dir.y;
  if (dot < COS_HALF_ANGLE) {
    return { seen: false, reason: 'outside-cone' };
  }
  // Two sample points, offset perpendicular to the sight line by half
  // the player radius: either clear ray means the player is seen.
  const px = -dy / dist;
  const py = dx / dist;
  const off = player.r * 0.5;
  for (const s of [1, -1]) {
    const tx = player.x + px * off * s;
    const ty = player.y + py * off * s;
    if (!segmentBlocked(guard.x, guard.y, tx, ty, blockers)) {
      return { seen: true, reason: 'seen' };
    }
  }
  return { seen: false, reason: 'blocked' };
}
