// M1 tests — written FIRST (TDD RED), before any production code.
// World logic only: DOM-free. Run: node --test tests/world.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { createWorld, step, isSeenByGuard } from '../game/src/world.js';
import { mulberry32 } from '../game/src/random.js';

function stepN(world, input, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) step(world, input, dt);
}

const IDLE = { x: 0, y: 0, run: false };

test('player moves right with input', () => {
  const w = createWorld();
  const x0 = w.player.x;
  step(w, { x: 1, y: 0, run: false }, 0.5);
  assert.ok(Math.abs(w.player.x - (x0 + CONFIG.PLAYER_SPEED * 0.5)) < 1,
    `expected x ~ ${x0 + CONFIG.PLAYER_SPEED * 0.5}, got ${w.player.x}`);
  assert.equal(w.player.y, 520);
});

test('player diagonal movement is normalized (not sqrt2 faster)', () => {
  const w = createWorld();
  // Center of the room, guard parked far away facing off, so the run is
  // not cut short by a wall or by being caught mid-test.
  w.player.x = 400; w.player.y = 200;
  w.guard.x = 700; w.guard.y = 100; w.guard.dir = { x: 0, y: -1 };
  w.guard.waypoints = [{ x: 700, y: 100 }, { x: 700, y: 100 }];
  const { x: x0, y: y0 } = w.player;
  step(w, { x: 1, y: 1, run: false }, 0.5);
  const dx = w.player.x - x0;
  const dy = w.player.y - y0;
  const dist = Math.hypot(dx, dy);
  assert.ok(Math.abs(dist - CONFIG.PLAYER_SPEED * 0.5) < 1, `diagonal dist ${dist}`);
});

test('run (Shift) is faster than walk', () => {
  const a = createWorld();
  const b = createWorld();
  step(a, { x: 1, y: 0, run: false }, 0.5);
  step(b, { x: 1, y: 0, run: true }, 0.5);
  const walkDist = a.player.x - 80;
  const runDist = b.player.x - 80;
  assert.ok(runDist > walkDist, `run ${runDist} should exceed walk ${walkDist}`);
  assert.ok(Math.abs(runDist - CONFIG.RUN_SPEED * 0.5) < 1, `run dist ${runDist}`);
});

test('player cannot pass through a curtain cover', () => {
  const w = createWorld();
  // Cover A sits at x 380..420, y 60..220. Player left of it, moving right.
  w.player.x = 360;
  w.player.y = 100;
  stepN(w, { x: 1, y: 0, run: false }, 1);
  assert.ok(w.player.x <= 380 - CONFIG.PLAYER_R + 0.5,
    `player x ${w.player.x} passed through cover`);
  assert.ok(w.player.x > 360, 'player should have moved right up to the cover');
});

test('player cannot pass through the outer wall', () => {
  const w = createWorld();
  w.player.x = 40;
  w.player.y = 520;
  stepN(w, { x: -1, y: 0, run: false }, 1);
  assert.ok(w.player.x >= 20 + CONFIG.PLAYER_R - 0.5,
    `player x ${w.player.x} passed through outer wall`);
});

test('guard patrols between waypoints and turns around', () => {
  const w = createWorld();
  assert.equal(w.guard.wpIndex, 1, 'guard should head to waypoint 1 first');
  const xStart = w.guard.x;
  stepN(w, IDLE, 3);
  assert.ok(w.guard.x > xStart + 100, `guard x ${w.guard.x} did not advance`);
  // Keep stepping until it reaches the far waypoint and turns back.
  let turned = false;
  for (let i = 0; i < 200; i++) {
    step(w, IDLE, 0.05);
    if (w.guard.wpIndex === 0) { turned = true; break; }
  }
  assert.ok(turned, 'guard never reached far waypoint / turned around');
  const xAtTurn = w.guard.x;
  stepN(w, IDLE, 1);
  assert.ok(w.guard.x < xAtTurn, 'guard should move left after turning around');
});

test('win when player reaches the exit', () => {
  const w = createWorld();
  w.player.x = 890;
  w.player.y = 70;
  step(w, IDLE, 0.1);
  assert.equal(w.status, 'won');
});

test('caught when guard touches player during chase (suspicion -> chase -> touch)', () => {
  const w = createWorld();
  // Guard at (300,300) facing right; player in open floor at (450,300).
  w.guard.x = 300; w.guard.y = 300; w.guard.dir = { x: 1, y: 0 };
  w.player.x = 450; w.player.y = 300;
  assert.equal(isSeenByGuard(w), true, 'player should be seen in open cone');
  // M2 replaces the M1 grace timer: suspicion fills, guard turns suspicious
  // (~0.3s), then chases (~0.6s); caught only on touch during the chase.
  stepN(w, IDLE, 0.4);
  assert.equal(w.guard.state, 'suspicious', `state ${w.guard.state}, suspicion ${w.guard.suspicion}`);
  assert.ok(w.guard.suspicion >= CONFIG.SUSPICIOUS_AT);
  stepN(w, IDLE, 0.5); // t = 0.9s
  assert.equal(w.guard.state, 'chase', `state ${w.guard.state}`);
  assert.equal(w.status, 'playing', 'not caught yet — guard still closing in');
  stepN(w, IDLE, 2);
  assert.equal(w.status, 'lost', 'guard touched the player during the chase');
});

test('no detection when a cover blocks line of sight', () => {
  const w = createWorld();
  w.guard.x = 300; w.guard.y = 300; w.guard.dir = { x: 1, y: 0 };
  w.player.x = 450; w.player.y = 300;
  // Extra curtain directly between guard and player.
  w.covers.push({ x: 360, y: 280, w: 40, h: 40 });
  assert.equal(isSeenByGuard(w), false, 'cover should block sight');
  stepN(w, IDLE, 1);
  assert.equal(w.status, 'playing');
  assert.equal(w.exposure, 0);
});

test('no detection outside the cone (behind the guard)', () => {
  const w = createWorld();
  w.guard.x = 300; w.guard.y = 300; w.guard.dir = { x: 1, y: 0 };
  w.player.x = 300; w.player.y = 420; // behind guard, within view distance
  assert.equal(isSeenByGuard(w), false, 'player behind guard should not be seen');
  stepN(w, IDLE, 1);
  assert.equal(w.status, 'playing');
});

test('exposure decays when the player leaves the cone', () => {
  const w = createWorld();
  w.guard.x = 300; w.guard.y = 300; w.guard.dir = { x: 1, y: 0 };
  w.player.x = 450; w.player.y = 300;
  stepN(w, IDLE, 0.3);
  const exposed = w.exposure;
  assert.ok(exposed > 0.2, `exposure ${exposed} should have built up`);
  w.player.x = 300; w.player.y = 420; // step out of the cone
  stepN(w, IDLE, 0.5);
  assert.ok(w.exposure < exposed, `exposure ${w.exposure} should decay`);
  assert.equal(w.status, 'playing');
});

test('seeded RNG: same seed repeats, different seed differs', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(7);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.notEqual(c(), seqA[0]);
});
