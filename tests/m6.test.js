// M6 tests — written FIRST (TDD RED), before any M6 production code.
// Parent playtest found: USHER 2 stuck at spawn (waypoint overlapping
// curtain A) + all patrols starting in sync, so a naive diagonal player
// won GHOST in 9.9s with exposure 0. Fix: U2 waypoints clear of the
// curtain + U2/U3/U4 staggered (start east, facing west).
// Run: node --test tests/m6.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { buildLevel } from '../game/src/level.js';
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

// --- fix 1: USHER 2 must actually walk (was stuck at x=420 forever) ---

test('m6: USHER 2 walks — moves more than 50px within 3s of patrol', () => {
  const world = createWorld();
  const u2 = world.guards[1];
  const startX = u2.x;
  stepN(world, IDLE, 3);
  assert.ok(
    Math.abs(u2.x - startX) > 50,
    `USHER 2 stuck: x ${startX} -> ${u2.x} after 3s (was 420 -> 420 before fix)`,
  );
});

// --- fix 2: patrol phases staggered, not all starting west facing east ---

test('m6: patrol staggered — U2/U4 start east facing west, U1/U5 start west facing east', () => {
  const world = createWorld();
  const [u1, u2, u3, u4, u5] = world.guards;
  // East starters (waypoint 1 of their route), facing back west.
  assert.equal(u2.x, 620, 'USHER 2 must start at its east waypoint');
  assert.equal(u2.dir.x, -1, 'USHER 2 must start facing west');
  assert.equal(u4.x, 900, 'USHER 4 must start at its east waypoint');
  assert.equal(u4.dir.x, -1, 'USHER 4 must start facing west');
  // M7: USHER 3 stagger REVERTED by parent decision (it broke the
  // Foyer teach contract) — U3 starts west facing east again.
  assert.equal(u3.x, 420, 'USHER 3 must start at its west waypoint (M7 revert)');
  assert.equal(u3.dir.x, 1, 'USHER 3 must start facing east (M7 revert)');
  // West starters unchanged.
  assert.equal(u1.dir.x, 1, 'USHER 1 still starts facing east');
  assert.equal(u5.dir.x, 1, 'USHER 5 still starts facing east');
  // Not all in sync: east starters are not at the west end.
  assert.ok(u2.x !== u1.x && u4.x !== u1.x);
});

// --- fix 1 geometry: no guard spawns overlapping a cover (the U2 bug) ---

test('m6: no guard spawns overlapping a cover', () => {
  const level = buildLevel();
  for (const guard of level.guards) {
    for (const cover of level.covers) {
      assert.equal(
        circleHitsRect(guard.x, guard.y, CONFIG.GUARD_R, cover),
        false,
        `${guard.name} spawns overlapping ${cover.kind} cover at (${cover.x},${cover.y})`,
      );
    }
  }
});

test('m6: every patrol waypoint is clear of every cover (guard radius)', () => {
  const level = buildLevel();
  for (const guard of level.guards) {
    for (const wp of guard.waypoints) {
      for (const cover of level.covers) {
        assert.equal(
          circleHitsRect(wp.x, wp.y, CONFIG.GUARD_R, cover),
          false,
          `${guard.name} waypoint (${wp.x},${wp.y}) overlaps ${cover.kind} cover`,
        );
      }
    }
  }
});
