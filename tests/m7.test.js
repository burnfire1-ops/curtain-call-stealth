// M7 tests — written FIRST (TDD RED), before any M7 production code.
// Parent decision (final): revert stagger U3 ONLY (back to start west,
// facing east) + add USHER 6 patrolling the top strip (y=60, x 500-900)
// to close the top-wall highway the naive probe exploited (M6 §4.2:
// the strip is geometrically immune to horizontal cones from y=120/200).
// Run: node --test tests/m7.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { buildLevel } from '../game/src/level.js';
import { canSee } from '../game/src/vision.js';
import { createWorld, step } from '../game/src/world.js';

function stepN(world, input, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) step(world, input, dt);
}
const IDLE = { x: 0, y: 0, run: false };

// Circle vs axis-aligned rect (same rule as world.js circleHitsRect).
function circleHitsRect(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// --- decision 2: USHER 6 guards the top strip ---

test('m7: level has 6 ushers incl. USHER 6 on the top strip (y=60, x 500-900)', () => {
  const level = buildLevel();
  assert.equal(level.guards.length, 6);
  assert.deepEqual(
    level.guards.map((g) => g.name),
    ['USHER 1', 'USHER 2', 'USHER 3', 'USHER 4', 'USHER 5', 'USHER 6'],
  );
  const u6 = level.guards[5];
  assert.deepEqual(u6.waypoints, [{ x: 500, y: 60 }, { x: 900, y: 60 }]);
  // West starter like U1/U5: starts at the west waypoint, facing east.
  assert.equal(u6.x, 500, 'USHER 6 must start at its west waypoint');
  assert.equal(u6.y, 60);
  // No dir override in the spec — createGuard's default east applies.
  assert.equal(u6.dir, undefined, 'no dir override in the spec');
  assert.deepEqual(
    createWorld().guards[5].dir, { x: 1, y: 0 },
    'USHER 6 must start facing east (createGuard default)',
  );
});

test('m7: USHER 6 walks — moves more than 50px within 3s of patrol', () => {
  const world = createWorld();
  assert.equal(world.guards.length, 6, 'needs the 6th guard first');
  const u6 = world.guards[5];
  const startX = u6.x;
  stepN(world, IDLE, 3);
  assert.ok(
    u6.x - startX > 50,
    `USHER 6 stuck or walking west: x ${startX} -> ${u6.x} after 3s`,
  );
});

test('m7: USHER 6 sees a player ahead of it on the top strip (the highway case)', () => {
  const world = createWorld();
  assert.equal(world.guards.length, 6, 'needs the 6th guard first');
  const u6 = world.guards[5];
  const blockers = world.walls.concat(world.covers);
  // Guard on its route, facing east; player on the top wall ahead of it.
  u6.x = 700; u6.y = 60; u6.dir = { x: 1, y: 0 };
  world.player.x = 800; world.player.y = 32; // hugging the top wall
  assert.equal(
    canSee(u6, world.player, blockers).seen, true,
    'player on the top wall ahead of USHER 6 must be seen',
  );
  world.player.x = 800; world.player.y = 60; // same strip, same line
  assert.equal(
    canSee(u6, world.player, blockers).seen, true,
    'player on the strip ahead of USHER 6 must be seen',
  );
  // Negative control: player BEHIND the guard is not seen.
  world.player.x = 600; world.player.y = 60;
  assert.equal(
    canSee(u6, world.player, blockers).seen, false,
    'player behind USHER 6 must not be seen',
  );
});

test('m7: USHER 6 route is clear of covers and does not seal the exit', () => {
  const level = buildLevel();
  const u6 = level.guards[5];
  assert.ok(u6, 'needs the 6th guard first');
  // Spawn + both waypoints clear of every cover (guard radius).
  for (const p of [{ x: u6.x, y: u6.y }, ...u6.waypoints]) {
    for (const cover of level.covers) {
      assert.equal(
        circleHitsRect(p.x, p.y, CONFIG.GUARD_R, cover),
        false,
        `USHER 6 point (${p.x},${p.y}) overlaps ${cover.kind} cover`,
      );
    }
  }
  // The east waypoint (900,60) sits inside the exit rect (860,40,60,60),
  // but the exit stays enterable: a player circle at the exit's
  // south-west corner (870,90) must not overlap the guard standing there.
  const dist = Math.hypot(870 - 900, 90 - 60);
  assert.ok(
    dist >= CONFIG.GUARD_R + CONFIG.PLAYER_R,
    `exit sealed: guard at east waypoint is ${dist}px from the entry corner`,
  );
});

// --- decision 1: revert stagger U3 ONLY (U2/U4 stagger stays) ---

test('m7: USHER 3 reverted — starts west (420,520) facing east', () => {
  const world = createWorld();
  const u3 = world.guards[2];
  assert.equal(u3.x, 420, 'USHER 3 must start at its west waypoint again');
  assert.equal(u3.y, 520);
  assert.equal(u3.dir.x, 1, 'USHER 3 must start facing east again');
});

test('m7: stagger U2/U4 kept — still start east facing west', () => {
  const world = createWorld();
  const [, u2, , u4] = world.guards;
  assert.equal(u2.x, 620, 'USHER 2 stagger must stay');
  assert.equal(u2.dir.x, -1, 'USHER 2 must still start facing west');
  assert.equal(u4.x, 900, 'USHER 4 stagger must stay');
  assert.equal(u4.dir.x, -1, 'USHER 4 must still start facing west');
});
