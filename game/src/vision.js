// CURTAIN CALL — M2 vision: guard perception, cheap -> expensive.
// game-ai: (1) squared distance vs VIEW_DIST, (2) cone dot-product,
// (3) raycast to TWO sample points (head/chest) vs walls + low cover.
// One clear sample point is enough to see — a thin cover over the center
// ray alone does not hide the player. Pure functions, no DOM, no state.
import CONFIG from './config.js';

// Shared cone check (M12): one sensor, used by guards (canSee) and
// security cameras (camera.js) alike — the same cheap -> expensive
// order (range, cone, 2-point raycast) for both. origin: { x, y },
// dir: normalized facing, target: { x, y, r }.
export function coneCheck(origin, dir, target, blockers, viewDist, halfAngleDeg) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distSq = dx * dx + dy * dy;
  if (distSq > viewDist * viewDist) {
    return { seen: false, reason: 'out-of-range' };
  }
  const dist = Math.sqrt(distSq) || 1;
  const cosHalf = Math.cos((halfAngleDeg * Math.PI) / 180);
  const dot = (dx / dist) * dir.x + (dy / dist) * dir.y;
  if (dot < cosHalf) {
    return { seen: false, reason: 'outside-cone' };
  }
  // Two sample points, offset perpendicular to the sight line by half
  // the player radius: either clear ray means the player is seen.
  const px = -dy / dist;
  const py = dx / dist;
  const off = target.r * 0.5;
  for (const s of [1, -1]) {
    const tx = target.x + px * off * s;
    const ty = target.y + py * off * s;
    if (!segmentBlocked(origin.x, origin.y, tx, ty, blockers)) {
      return { seen: true, reason: 'seen' };
    }
  }
  return { seen: false, reason: 'blocked' };
}

// guard: { x, y, dir } — dir normalized. player: { x, y, r }.
// blockers: rects that stop sight (walls + covers).
// Returns { seen, reason } — reason is for debug/HUD, not gameplay.
export function canSee(guard, player, blockers) {
  return coneCheck(
    guard, guard.dir, player, blockers,
    CONFIG.VIEW_DIST, CONFIG.VIEW_HALF_ANGLE_DEG,
  );
}

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
