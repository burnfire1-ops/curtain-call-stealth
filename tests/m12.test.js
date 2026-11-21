// M12 tests — coin distraction + security cameras.
// Coin: 3 per run, C throws toward the mouse (facing fallback in
// main.js, DOM-only), 200px max, 0.35s flight, guards in a 200px
// radius investigate the landing point (Suspicious -> Search 2s ->
// Patrol) via the existing FSM. Cameras: fixed sensors with a
// +/-50 deg sine sweep, the same cone check as guards, suspicion on
// the same meter, 1.0 raises the building alarm (all guards chase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { createWorld, step, throwCoin } from '../game/src/world.js';
import { createCamera, stepCamera, cameraSees } from '../game/src/camera.js';
import { createGuard, stepGuard } from '../game/src/guard.js';
import { cameraStates, cameraStatesShort, worstSuspicion } from '../game/src/hud.js';
import { drainAudio } from '../game/src/feel.js';

function stepN(world, input, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) step(world, input, dt);
}

const IDLE = { x: 0, y: 0, run: false };

// Park guard 1 facing east on the bottom row, stationary patrol, so
// a coin test can watch one guard in isolation. The player stands
// behind it (west), unseen.
function parkGuard1(world, x = 300, y = 520) {
  const g = world.guards[0];
  g.x = x; g.y = y; g.dir = { x: 1, y: 0 };
  g.waypoints = [{ x, y }, { x, y }];
  world.player.x = x - 100; world.player.y = y;
  return g;
}

// --- coin: throw ---

test('coin: throwCoin spends one coin and starts a flight to the aim', () => {
  const w = createWorld();
  w.player.x = 200; w.player.y = 520;
  assert.equal(w.coins, 3, 'a run starts with 3 coins');
  assert.equal(throwCoin(w, 300, 520), true);
  assert.equal(w.coins, 2);
  assert.equal(w.coinFlight.x1, 300, 'lands on the aim inside 200px');
  assert.equal(w.coinFlight.y1, 520);
});

test('coin: the landing is clamped to 200px from the player', () => {
  const w = createWorld();
  w.player.x = 200; w.player.y = 520;
  assert.equal(throwCoin(w, 700, 520), true, 'a 500px aim is allowed');
  assert.equal(w.coinFlight.x1, 400, 'but it lands 200px out');
  assert.equal(w.coinFlight.y1, 520);
});

test('coin: the landing is clamped inside the walls', () => {
  const w = createWorld();
  w.player.x = 80; w.player.y = 520; // spawn, by the west wall
  assert.equal(throwCoin(w, -500, 520), true);
  assert.equal(w.coinFlight.x1, CONFIG.WALL, 'never inside the wall');
  assert.equal(w.coinFlight.y1, 520);
});

test('coin: the flight lands after 0.35s — ring at the point + a clink', () => {
  const w = createWorld();
  w.player.x = 200; w.player.y = 520;
  throwCoin(w, 400, 520);
  stepN(w, IDLE, 0.3);
  assert.ok(w.coinFlight, 'still flying at 0.3s');
  stepN(w, IDLE, 0.1);
  assert.equal(w.coinFlight, null, 'landed by 0.4s');
  assert.ok(w.coinRing, 'a landing ring appears');
  assert.equal(w.coinRing.x, 400);
  assert.equal(w.coinRing.y, 520);
  assert.ok(drainAudio(w.feel).includes('coin'), 'landing clinks once');
});

// --- coin: investigation ---

test('coin: a guard in earshot turns suspicious toward the landing point', () => {
  const w = createWorld();
  const g = parkGuard1(w);
  throwCoin(w, 400, 520);
  stepN(w, IDLE, 0.4);
  assert.equal(g.state, 'suspicious', `guard state ${g.state}`);
  assert.deepEqual(g.lastKnown, { x: 400, y: 520 });
});

test('coin: the guard investigates — suspicious, walks over, looks 2s, patrols', () => {
  const w = createWorld();
  const g = parkGuard1(w);
  throwCoin(w, 400, 520);
  stepN(w, IDLE, 0.4);
  assert.equal(g.state, 'suspicious');
  // The clink rings for 0.5s and a suspicious guard keeps listening
  // while it rings, so the walk starts ~0.8s after the landing.
  stepN(w, IDLE, 1.0);
  assert.equal(g.state, 'search', `guard should walk to the coin, got ${g.state}`);
  stepN(w, IDLE, 2.0);
  assert.ok(Math.abs(g.x - 400) < 15, `guard x ${g.x} should be at the coin`);
  assert.equal(g.state, 'search', 'still looking around at the point');
  stepN(w, IDLE, 2.0);
  assert.equal(g.state, 'patrol', `guard should give up and patrol, got ${g.state}`);
});

test('coin: cooldown blocks a second throw for 0.5s, then allows it', () => {
  const w = createWorld();
  w.player.x = 200; w.player.y = 520;
  assert.equal(throwCoin(w, 400, 520), true);
  assert.equal(throwCoin(w, 400, 520), false, 'cooling down');
  assert.equal(w.coins, 2, 'a blocked throw spends nothing');
  stepN(w, IDLE, 0.4);
  assert.equal(throwCoin(w, 400, 520), false, 'still cooling down at 0.4s');
  stepN(w, IDLE, 0.2);
  assert.equal(throwCoin(w, 400, 520), true, 'cooldown done at 0.6s');
  assert.equal(w.coins, 1);
});

test('coin: empty coins — the 4th throw does nothing, the count never goes negative', () => {
  const w = createWorld();
  w.player.x = 200; w.player.y = 520;
  for (let i = 0; i < 3; i++) {
    assert.equal(throwCoin(w, 400, 520), true, `throw ${i + 1} should work`);
    stepN(w, IDLE, 0.6);
  }
  assert.equal(w.coins, 0);
  assert.equal(throwCoin(w, 400, 520), false);
  assert.equal(w.coins, 0);
});

test('guard: a chasing guard ignores a coin — lastKnown stays the player', () => {
  const g = createGuard({
    x: 300, y: 300,
    waypoints: [{ x: 300, y: 300 }, { x: 500, y: 300 }],
  });
  g.state = 'chase'; g.stateTime = 0.5; g.suspicion = 1;
  g.lastKnown = { x: 450, y: 300 };
  stepGuard(g, {
    seen: false, dist: 150, player: { x: 450, y: 300 },
    running: false, heard: { x: 309, y: 441, coin: true }, blockers: [],
  }, 0.05);
  assert.deepEqual(g.lastKnown, { x: 450, y: 300 },
    'a coin must never redirect a chase onto the coin itself');
  assert.equal(g.state, 'chase');
});

// --- camera: cone + sweep ---

test('camera: the teal cone sees ahead, not behind, not past a cover', () => {
  const cam = createCamera({ name: 'CAM 1', x: 520, y: 60, baseAngleDeg: 90 });
  const none = [];
  assert.equal(
    cameraSees(cam, { x: 520, y: 150, r: 12 }, none).seen, true,
    'dead south, in range, in cone',
  );
  assert.equal(
    cameraSees(cam, { x: 520, y: 30, r: 12 }, none).seen, false,
    'north of the camera is behind it',
  );
  assert.equal(
    cameraSees(cam, { x: 650, y: 60, r: 12 }, none).seen, false,
    'due east is outside the south-facing cone',
  );
  assert.equal(
    cameraSees(cam, { x: 520, y: 300, r: 12 }, none).seen, false,
    '240px is past the 180px range',
  );
  const cover = [{ x: 480, y: 100, w: 80, h: 20 }];
  assert.equal(
    cameraSees(cam, { x: 520, y: 150, r: 12 }, cover).seen, false,
    'a cover between camera and player blocks the cone',
  );
});

test('camera: the sweep stays inside base +/-50 deg and actually moves', () => {
  const cam = createCamera({ name: 'CAM 1', x: 520, y: 60, baseAngleDeg: 90 });
  const base = Math.PI / 2;
  const amp = (CONFIG.CAM_SWEEP_DEG * Math.PI) / 180;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 600; i++) {
    stepCamera(cam, false, { dist: 500, running: false, x: 0, y: 0 }, 0.05);
    min = Math.min(min, cam.angle);
    max = Math.max(max, cam.angle);
    assert.ok(Math.abs(cam.dir.x - Math.cos(cam.angle)) < 1e-9, 'dir follows angle');
  }
  assert.ok(min >= base - amp - 1e-9 && max <= base + amp + 1e-9,
    `sweep ${min.toFixed(2)}..${max.toFixed(2)} escaped base +/-50 deg`);
  assert.ok(max - min > 1.5 * amp, 'the sweep must actually travel');
});

test('camera: suspicion fills while seen, decays while unseen', () => {
  const cam = createCamera({ name: 'CAM 1', x: 520, y: 60, baseAngleDeg: 90 });
  const ctx = { dist: 80, running: false, x: 520, y: 140 };
  stepCamera(cam, true, ctx, 0.2);
  assert.ok(cam.suspicion > 0.5, `suspicion ${cam.suspicion} should fill fast up close`);
  assert.equal(cam.state, 'spotted');
  stepCamera(cam, false, ctx, 0.5);
  assert.ok(cam.suspicion < 0.3, `suspicion ${cam.suspicion} should decay unseen`);
  assert.equal(cam.state, 'sweep');
});

// --- alarm ---

// Park every guard far south-west, facing away, so only a camera can
// see the player — the alarm test then proves the camera alone did it.
function alarmWorld() {
  const w = createWorld();
  w.guards.forEach((g, i) => {
    g.x = 100 + i * 30; g.y = 500; g.dir = { x: -1, y: 0 };
    g.waypoints = [{ x: g.x, y: g.y }, { x: g.x, y: g.y }];
  });
  w.player.x = 520; w.player.y = 140; // lit stage pool, dead south of CAM 1
  return w;
}

function stepUntilAlarm(world, maxSteps = 40) {
  for (let i = 0; i < maxSteps && !world.alarm.active; i++) {
    step(world, IDLE, 0.05);
  }
  return world.alarm.active;
}

test('alarm: a camera at suspicion 1.0 raises the alarm — all guards chase the player', () => {
  const w = alarmWorld();
  assert.equal(stepUntilAlarm(w), true, 'the camera must fill to 1.0 and alarm');
  assert.ok(w.guards.every((g) => g.state === 'chase'),
    'every guard must chase on alarm');
  assert.ok(w.guards.every((g) => g.lastKnown
    && g.lastKnown.x === 520 && g.lastKnown.y === 140),
  'lastKnown must be the player position at the alarm');
  assert.equal(w.detections, 6, 'one detection per guard forced into chase');
});

test('alarm: it clears after 3s unseen, and no guard keeps chasing', () => {
  const w = alarmWorld();
  assert.equal(stepUntilAlarm(w), true);
  w.player.x = 80; w.player.y = 520; // spawn — out of every camera cone
  stepN(w, IDLE, 3.5);
  assert.equal(w.alarm.active, false, 'alarm must clear after 3s unseen');
  assert.ok(w.guards.every((g) => g.state !== 'chase'),
    'no guard may still chase after the alarm clears');
});

// --- HUD ---

test('hud: camera roster formats like the guard roster', () => {
  assert.equal(
    cameraStatesShort(cameraStates([
      { name: 'CAM 1', state: 'sweep' },
      { name: 'CAM 2', state: 'spotted' },
    ])),
    'CAM 1 SWEEP · CAM 2 SPOTTED',
  );
});

test('hud: worstSuspicion counts a camera — the meter is shared', () => {
  const worst = worstSuspicion([
    { name: 'USHER 1', state: 'patrol', suspicion: 0.2 },
    { name: 'CAM 1', state: 'spotted', suspicion: 0.8 },
  ]);
  assert.equal(worst.name, 'CAM 1', 'the camera is the worst suspicion here');
});
