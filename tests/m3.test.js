// M3 tests — written FIRST (TDD RED), before any M3 production code.
// Level (3 wings, props on optional branches), real light map, floor
// noise, multi-guard world, footstep rings, guard collision.
// Run: node --test tests/m3.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import {
  buildLevel, lightAt, floorAt, goalReachable, pacingProblems,
} from '../game/src/level.js';
import { noiseRadiusAt } from '../game/src/detection.js';
import { createGuard, stepGuard } from '../game/src/guard.js';
import { createWorld, step, isSeenByGuard } from '../game/src/world.js';

function stepN(world, input, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) step(world, input, dt);
}
const IDLE = { x: 0, y: 0, run: false };

// --- level.js: structure ---

test('level: 3 wings, 5 ushers, 3 props, exit, spawn', () => {
  const level = buildLevel();
  assert.equal(level.guards.length, 5);
  assert.deepEqual(
    level.guards.map((g) => g.name),
    ['USHER 1', 'USHER 2', 'USHER 3', 'USHER 4', 'USHER 5'],
  );
  assert.equal(level.props.length, 3);
  assert.deepEqual(level.props.map((p) => p.id), ['tiara', 'mask', 'violin']);
  assert.deepEqual(level.exit, { x: 860, y: 40, w: 60, h: 60 });
  assert.deepEqual(level.spawn, { x: 80, y: 520 });
  assert.ok(level.lightPools.length >= 3, 'needs foyer + stage + vault light pools');
  assert.ok(level.carpetZones.length >= 2, 'needs auditorium + backstage carpet');
});

// --- level.js: reachability (level-design Pattern 3, goal_reachable) ---

test('level: goal_reachable — exit without any prop, each prop, each prop back to exit', () => {
  const level = buildLevel();
  assert.equal(
    goalReachable(level, level.spawn, { x: 890, y: 70 }), true,
    'exit must be reachable without props (no soft-lock)',
  );
  for (const prop of level.props) {
    assert.equal(
      goalReachable(level, level.spawn, prop), true,
      `${prop.id} must be reachable`,
    );
    assert.equal(
      goalReachable(level, prop, { x: 890, y: 70 }), true,
      `${prop.id} branch must rejoin the main path to the exit`,
    );
  }
});

test('level: goal_reachable negative control — a point inside a cover is unreachable', () => {
  const level = buildLevel();
  // (400,100) sits inside curtain A (380,60,40,160).
  assert.equal(goalReachable(level, level.spawn, { x: 400, y: 100 }), false);
});

// --- level.js: pacing (level-design Pattern 2) ---

test('level: pacing beats — opens with teach, rest before climax, no long high run', () => {
  const level = buildLevel();
  const problems = pacingProblems(level.beats);
  assert.equal(problems.length, 0, JSON.stringify(problems));
  assert.equal(level.beats[0].type, 'teach');
});

// --- level.js: light map + floor ---

test('level: lightAt — 1.0 inside pools, 0.35 in dark wings', () => {
  assert.equal(lightAt(400, 300), 1.0, 'foyer pool');
  assert.equal(lightAt(500, 90), 1.0, 'stage pool');
  assert.equal(lightAt(860, 70), 1.0, 'vault/exit pool');
  assert.equal(lightAt(80, 520), 0.35, 'dark foyer floor');
  assert.equal(lightAt(500, 450), 0.35, 'dark auditorium carpet');
  assert.equal(lightAt(800, 450), 0.35, 'dark backstage floor');
});

test('level: floorAt — carpet in auditorium seats + backstage runner, wood elsewhere', () => {
  assert.equal(floorAt(500, 450), 'carpet');
  assert.equal(floorAt(880, 500), 'carpet');
  assert.equal(floorAt(200, 500), 'wood');
  assert.equal(floorAt(500, 90), 'wood', 'stage is wood');
});

// --- detection.js: noise ---

test('detection: noise radius — running on wood 140, on carpet 40, walking silent', () => {
  assert.equal(noiseRadiusAt(200, 500, true), 140);
  assert.equal(noiseRadiusAt(500, 450, true), 40);
  assert.equal(noiseRadiusAt(200, 500, false), 0);
  assert.equal(noiseRadiusAt(500, 450, false), 0);
});

// --- world.js: multi-guard ---

test('world: 5 guards with names, guard alias kept for M1/M2 callers', () => {
  const w = createWorld();
  assert.equal(w.guards.length, 5);
  assert.deepEqual(
    w.guards.map((g) => g.name),
    ['USHER 1', 'USHER 2', 'USHER 3', 'USHER 4', 'USHER 5'],
  );
  assert.equal(w.guard, w.guards[0]);
  assert.equal(w.props.length, 3);
  assert.deepEqual(w.rings, []);
  assert.equal(w.noiseRing, null);
});

test('world: guards independent — suspicion on guard A does not move guard B', () => {
  const w = createWorld();
  // Player in the lit foyer pool at (350,300), in guard 1's cone once it
  // patrols within range, far from the other four guards.
  w.player.x = 350;
  w.player.y = 300;
  stepN(w, IDLE, 1);
  assert.ok(w.guards[0].suspicion > 0.5, `guard 1 suspicion ${w.guards[0].suspicion}`);
  assert.equal(w.guards[1].suspicion, 0, 'guard 2 must not share suspicion');
  assert.equal(w.guards[1].state, 'patrol');
  assert.equal(w.guards[2].suspicion, 0);
  assert.equal(w.guards[3].suspicion, 0);
  assert.equal(w.guards[4].suspicion, 0);
  assert.equal(w.exposure, w.guards[0].suspicion, 'exposure is the max suspicion');
});

test('world: isSeenByGuard is true when ANY guard sees the player', () => {
  const w = createWorld();
  // Player in guard 3's cone on the carpet, unseen by guard 1.
  w.guards[2].x = 420;
  w.guards[2].y = 520;
  w.guards[2].dir = { x: 1, y: 0 };
  w.player.x = 500;
  w.player.y = 520;
  assert.equal(isSeenByGuard(w), true);
});

// --- world.js: noise ---

test('world: running on wood is heard — nearby guard turns suspicious toward the noise', () => {
  const w = createWorld();
  // Guard 1 patrols y=300; player runs on wood below-left, unseen
  // (behind the guard's cone), closing in from the left.
  w.player.x = 250;
  w.player.y = 400;
  stepN(w, { x: -1, y: 0, run: true }, 0.5);
  assert.equal(w.guards[0].state, 'suspicious', `guard 1 state ${w.guards[0].state}`);
  assert.ok(w.guards[0].lastKnown !== null, 'guard should have a last-known noise point');
  assert.equal(w.guards[0].lastKnown.y, 400, 'lastKnown should be the noise point');
  assert.ok(
    w.guards[0].lastKnown.x >= 130 && w.guards[0].lastKnown.x <= 250,
    `lastKnown x ${w.guards[0].lastKnown.x} should track the runner`,
  );
});

test('world: running on carpet is quiet — guard 40px+ away does not hear it', () => {
  const w = createWorld();
  w.player.x = 500;
  w.player.y = 450;
  stepN(w, { x: -1, y: 0, run: true }, 0.3);
  assert.equal(
    w.guards[2].state, 'patrol',
    `guard 3 state ${w.guards[2].state} — carpet run must stay quiet`,
  );
  assert.equal(w.guards[2].suspicion, 0);
});

// --- world.js: footstep rings ---

test('world: guard footsteps emit fading rings', () => {
  const w = createWorld();
  assert.equal(w.rings.length, 0);
  stepN(w, IDLE, 2);
  assert.ok(w.rings.length > 0, 'patrolling guards should leave footstep rings');
  assert.ok(
    w.rings.every((r) => r.age < CONFIG.RING_FADE_S),
    'no ring may outlive its fade',
  );
  stepN(w, IDLE, 2);
  assert.ok(
    w.rings.length > 0 && w.rings.length < 40,
    `rings pruned, got ${w.rings.length}`,
  );
});

// --- guard.js: collision ---

test('guard: patrol cannot pass through a cover — guard stops at its edge', () => {
  const g = createGuard({
    x: 300, y: 300,
    waypoints: [{ x: 300, y: 300 }, { x: 500, y: 300 }],
  });
  const cover = [{ x: 380, y: 280, w: 40, h: 40 }];
  // Walk the guard into the cover for 3s (70px/s would carry it 210px).
  for (let i = 0; i < 60; i++) {
    stepGuard(g, {
      seen: false, dist: 500, player: { x: 0, y: 0 },
      running: false, blockers: cover,
    }, 0.05);
  }
  assert.ok(g.x < 380, `guard x ${g.x} passed through the cover`);
  assert.ok(g.x > 340, `guard x ${g.x} should have walked up to the cover edge`);
  assert.equal(g.wpIndex, 1, 'guard still heads for the far waypoint');
});

test('guard: search behind a cover times out instead of sticking forever', () => {
  const g = createGuard({
    x: 300, y: 300,
    waypoints: [{ x: 300, y: 300 }, { x: 700, y: 300 }],
  });
  const cover = [{ x: 380, y: 280, w: 40, h: 40 }];
  g.state = 'search';
  g.stateTime = 0.5; // past MIN_STATE_TIME
  g.searchTimeLeft = CONFIG.SEARCH_TIME;
  g.lastKnown = { x: 500, y: 300 }; // behind the cover
  const unseen = {
    seen: false, dist: 500, player: { x: 0, y: 0 },
    running: false, blockers: cover,
  };
  for (let i = 0; i < 100; i++) stepGuard(g, unseen, 0.05);
  assert.equal(g.state, 'patrol', `guard stuck in search at ${g.x},${g.y}`);
});

// --- world.js: props + teach beat ---

test('world: walking onto a prop picks it up; pickup alone does not win', () => {
  const w = createWorld();
  assert.equal(w.props.filter((p) => p.taken).length, 0);
  w.player.x = 70;
  w.player.y = 90; // Star Tiara
  step(w, IDLE, 0.05);
  assert.equal(w.props[0].taken, true, 'tiara should be picked up');
  assert.equal(w.status, 'playing', 'pickup alone does not win');
});

test('world: Foyer teach — walking (no run) along the bottom crosses the Foyer unseen', () => {
  const w = createWorld();
  stepN(w, { x: 1, y: 0, run: false }, 2.1);
  assert.ok(w.player.x >= 355, `player x ${w.player.x} did not cross the Foyer`);
  assert.equal(w.status, 'playing');
  assert.equal(w.exposure, 0, 'teach path must stay unseen');
});
