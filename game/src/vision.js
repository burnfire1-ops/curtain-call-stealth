// CURTAIN CALL — M2 vision: guard perception, cheap -> expensive.
// game-ai: (1) squared distance vs VIEW_DIST, (2) cone dot-product,
// (3) raycast to TWO sample points (head/chest) vs walls + low cover.
// One clear sample point is enough to see — a thin cover over the center
// ray alone does not hide the player. Pure functions, no DOM, no state.
import CONFIG from './config.js';

// Segment vs circle (M13): does the segment P1->P2 come within r
// of (cx, cy)? Used for smoke blocking a sight line and for a laser
// beam touching the player. Closest-point-on-segment test; a segment
// that starts inside the circle counts as a hit.
export function segmentHitsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 1e-9) {
    t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  const ddx = cx - px;
  const ddy = cy - py;
  return ddx * ddx + ddy * ddy < r * r;
}

// Shared cone check (M12): one sensor, used by guards (canSee) and
// security cameras (camera.js) alike — the same cheap -> expensive
// order (range, cone, 2-point raycast) for both. origin: { x, y },
// dir: normalized facing, target: { x, y, r }.
// M13 smoke: `smoke` is an array of clouds { x, y, r } — a sight ray
// that crosses a cloud is blocked, exactly like a wall. Smoke is
// vision-blocking only: it never feeds the laser trip check.
export function coneCheck(origin, dir, target, blockers, viewDist, halfAngleDeg, smoke = []) {
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
    if (segmentBlocked(origin.x, origin.y, tx, ty, blockers)) continue;
    if (smoke.some((c) => segmentHitsCircle(origin.x, origin.y, tx, ty, c.x, c.y, c.r))) {
      continue;
    }
    return { seen: true, reason: 'seen' };
  }
  return { seen: false, reason: 'blocked' };
}

// guard: { x, y, dir } — dir normalized. player: { x, y, r }.
// blockers: rects that stop sight (walls + covers).
// smoke: M13 clouds { x, y, r } that stop sight like a wall.
// Returns { seen, reason } — reason is for debug/HUD, not gameplay.
export function canSee(guard, player, blockers, smoke = []) {
  return coneCheck(
    guard, guard.dir, player, blockers,
    CONFIG.VIEW_DIST, CONFIG.VIEW_HALF_ANGLE_DEG, smoke,
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
