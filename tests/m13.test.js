// M13 tests — smoke + lasers + alarm stages + minimap + score.
// Smoke: 2 per run, X throws like a coin (mouse aim, 200px max,
// 0.35s flight), silent 4s cloud that blocks cones but never
// investigates and never blocks a laser. Lasers: 2 tripwires,
// ON 1.6s / OFF 1.6s, crossing live trips +0.6 (TRIPPED! flash),
// two trips reach the alarm. Alarm stages map the worst suspicion
// to CALM/UNEASY/HUNTED/ALARM. Minimap: pure projection. Score:
// props x300 + GHOST +500 + time bonus (max +200, full <=60s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { createWorld, step, throwCoin, throwSmoke } from '../game/src/world.js';
import { createLaser, stepLaser, laserTripsPlayer } from '../game/src/laser.js';
import { canSee, segmentHitsCircle } from '../game/src/vision.js';
import { createCamera, cameraSees } from '../game/src/camera.js';
import {
  alarmStage, timeBonus, scoreBreakdown, propsChecklistLine,
  guardStatesShort, propsSummary, minimapRect, projectToMinimap,
} from '../game/src/hud.js';
import { drainAudio } from '../game/src/feel.js';
import { railRect } from '../game/src/hud.js';

function stepN(world, input, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) step(world, input, dt);
}

const IDLE = { x: 0, y: 0, run: false };

// Park guard 1 facing east on the bottom row, stationary patrol, so
// a smoke test can watch one guard in isolation. The player stands
// behind it (west), unseen.
function parkGuard1(world, x = 300, y = 520) {
  const g = world.guards[0];
  g.x = x; g.y = y; g.dir = { x: 1, y: 0 };
  g.waypoints = [{ x, y }, { x, y }];
  world.player.x = x - 100; world.player.y = y;
  return g;
}

// Park every guard far south-west, facing away, so only a laser can
// trip — the alarm test then proves the laser alone did it.
function laserWorld() {
  const w = createWorld();
  w.guards.forEach((g, i) => {
    g.x = 100 + i * 30; g.y = 500; g.dir = { x: -1, y: 0 };
    g.waypoints = [{ x: g.x, y: g.y }, { x: g.x, y: g.y }];
  });
  return w;
}

// --- smoke: throw ---

test('smoke: throwSmoke spends one smoke and starts a flight to the aim', () => {
  const w = createWorld();
  w.player.x = 200; w.player.y = 520;
  assert.equal(w.smokes, 2, 'a run starts with 2 smokes');
  assert.equal(throwSmoke(w, 300, 520), true);
  assert.equal(w.smokes, 1);
  assert.equal(w.smokeFlight.x1, 300, 'lands on the aim inside 200px');
  assert.equal(w.smokeFlight.y1, 520);
});

test('smoke: the landing is clamped to 200px and inside the walls', () => {
  const w = createWorld();
  w.player.x = 200; w.player.y = 520;
  assert.equal(throwSmoke(w, 700, 520), true, 'a 500px aim is allowed');
  assert.equal(w.smokeFlight.x1, 400, 'but it lands 200px out');
  w.player.x = 80; w.player.y = 520;
  stepN(w, IDLE, 0.6); // cooldown done, first smoke landed
  assert.equal(throwSmoke(w, -500, 520), true);
  assert.equal(w.smokeFlight.x1, CONFIG.WALL, 'never inside the wall');
});

test('smoke: the flight lands after 0.35s — a cloud appears, then dies at 4s', () => {
  const w = createWorld();
  w.player.x = 200; w.player.y = 520;
  throwSmoke(w, 400, 520);
  stepN(w, IDLE, 0.3);
  assert.ok(w.smokeFlight, 'still flying at 0.3s');
  stepN(w, IDLE, 0.1);
  assert.equal(w.smokeFlight, null, 'landed by 0.4s');
  assert.equal(w.smokeClouds.length, 1, 'one cloud appears');
  assert.equal(w.smokeClouds[0].x, 400);
  assert.equal(w.smokeClouds[0].r, CONFIG.SMOKE_CLOUD_R);
  assert.ok(drainAudio(w.feel).includes('smoke'), 'landing puffs once');
  assert.equal(w.coinRing, null, 'smoke makes no coin ring and no noise');
  stepN(w, IDLE, 4.1);
  assert.equal(w.smokeClouds.length, 0, 'the cloud is gone after 4s');
});

// --- smoke: vision blocking ---

test('vision: segmentHitsCircle — through, past, and starting inside', () => {
  assert.equal(segmentHitsCircle(0, 0, 100, 0, 50, 0, 10), true, 'through the centre');
  assert.equal(segmentHitsCircle(0, 0, 100, 0, 50, 30, 10), false, '30px off the line');
  assert.equal(segmentHitsCircle(0, 0, 100, 0, 50, 9, 10), true, '9px off the line, inside r');
  assert.equal(segmentHitsCircle(50, 0, 100, 0, 50, 0, 10), true, 'starts inside the circle');
  assert.equal(segmentHitsCircle(0, 0, 10, 0, 50, 0, 10), false, 'segment ends before the circle');
});

test('smoke: a cloud between guard and player blocks the cone', () => {
  const guard = { x: 300, y: 300, dir: { x: 1, y: 0 } };
  const player = { x: 400, y: 300, r: 12 };
  assert.equal(canSee(guard, player, []).seen, true, 'clear line sees');
  const cloud = [{ x: 350, y: 300, r: 90 }];
  assert.equal(canSee(guard, player, [], cloud).seen, false, 'cloud on the line blocks');
  const offLine = [{ x: 350, y: 100, r: 90 }];
  assert.equal(canSee(guard, player, [], offLine).seen, true, 'cloud off the line does not');
});

test('smoke: a cloud blocks a camera cone too', () => {
  const cam = createCamera({ name: 'CAM 1', x: 520, y: 60, baseAngleDeg: 90 });
  const player = { x: 520, y: 150, r: 12 };
  assert.equal(cameraSees(cam, player, []).seen, true, 'clear cone sees');
  assert.equal(
    cameraSees(cam, player, [], [{ x: 520, y: 105, r: 90 }]).seen, false,
    'cloud on the cone blocks the camera',
  );
});

test('smoke: silent — a guard near a landing smoke does not investigate', () => {
  const w = createWorld();
  const g = parkGuard1(w);
  throwSmoke(w, 400, 520);
  stepN(w, IDLE, 1.5);
  assert.equal(g.state, 'patrol', `guard state ${g.state} — smoke must not call it`);
  assert.equal(g.lastKnown, null, 'no noise point is remembered');
});

// --- smoke: shared cooldown + empty ---

test('smoke: the 0.5s throw cooldown is shared with the coin', () => {
  const w = createWorld();
  w.player.x = 200; w.player.y = 520;
  assert.equal(throwCoin(w, 400, 520), true);
  assert.equal(throwSmoke(w, 400, 520), false, 'cooling down after a coin');
  assert.equal(w.smokes, 2, 'a blocked throw spends nothing');
  stepN(w, IDLE, 0.6);
  assert.equal(throwSmoke(w, 400, 520), true, 'cooldown done at 0.6s');
  assert.equal(w.smokes, 1);
});

test('smoke: empty smokes — the 3rd throw does nothing, the count never goes negative', () => {
  const w = createWorld();
  w.player.x = 200; w.player.y = 520;
  for (let i = 0; i < 2; i++) {
    assert.equal(throwSmoke(w, 400, 520), true, `throw ${i + 1} should work`);
    stepN(w, IDLE, 0.6);
  }
  assert.equal(w.smokes, 0);
  assert.equal(throwSmoke(w, 400, 520), false);
  assert.equal(w.smokes, 0);
});

// --- laser: pulse + trip ---

test('laser: the beam pulses ON 1.6s / OFF 1.6s', () => {
  const laser = createLaser({ name: 'LASER 1', x1: 0, y1: 0, x2: 100, y2: 0 });
  assert.equal(laser.on, true, 'starts live');
  stepLaser(laser, 1.5);
  assert.equal(laser.on, true, 'still live at 1.5s');
  stepLaser(laser, 0.2);
  assert.equal(laser.on, false, 'down after 1.6s');
  stepLaser(laser, 1.5);
  assert.equal(laser.on, false, 'still down at 3.1s');
  stepLaser(laser, 0.2);
  assert.equal(laser.on, true, 'live again after 3.2s');
});

test('laser: crossing a live beam trips +0.6 with a TRIPPED! flash', () => {
  const w = laserWorld();
  w.player.x = 800; w.player.y = 280; // on LASER 1 (y=290), clear of the crate
  assert.equal(w.lasers[0].on, true);
  step(w, IDLE, 0.05);
  assert.equal(w.laserSuspicion, 0.6, 'one trip adds 0.6');
  assert.equal(w.exposure, 0.6, 'the laser feeds the shared meter');
  assert.ok(w.feel.laserFlash > 0, 'TRIPPED! flash fires');
  assert.ok(drainAudio(w.feel).includes('laser'), 'trip zaps once');
});

test('laser: crossing while OFF is safe', () => {
  const w = laserWorld();
  w.player.x = 800; w.player.y = 280;
  w.lasers[0].on = false;
  w.lasers[0].phaseT = 0;
  step(w, IDLE, 0.1);
  assert.equal(w.laserSuspicion, 0, 'no trip while the beam is down');
  assert.equal(w.feel.laserFlash, 0, 'no flash either');
});

test('laser: one trip per crossing — standing in the beam does not re-trip', () => {
  const laser = createLaser({ name: 'LASER 1', x1: 660, y1: 290, x2: 940, y2: 290 });
  const player = { x: 800, y: 280, r: 12 };
  assert.equal(laserTripsPlayer(laser, player), true, 'first touch trips');
  assert.equal(laserTripsPlayer(laser, player), false, 'still standing in it — no re-trip');
  assert.equal(laserTripsPlayer(laser, { x: 800, y: 200, r: 12 }), false, 'stepping off resets');
  assert.equal(laserTripsPlayer(laser, player), true, 'crossing again trips again');
});

test('laser: the trip decays, it does not re-fire while standing in the beam', () => {
  const w = laserWorld();
  w.player.x = 800; w.player.y = 280;
  step(w, IDLE, 0.05);
  assert.equal(w.laserSuspicion, 0.6);
  stepN(w, IDLE, 0.3);
  assert.ok(Math.abs(w.laserSuspicion - 0.3) < 0.06,
    `suspicion ${w.laserSuspicion} should decay from one trip only`);
});

test('laser: smoke does NOT block a laser trip', () => {
  const w = laserWorld();
  w.player.x = 800; w.player.y = 280;
  w.smokeClouds = [{ x: 800, y: 290, r: 90, age: 0 }];
  step(w, IDLE, 0.05);
  assert.equal(w.laserSuspicion, 0.6, 'a cloud on the beam changes nothing');
});

test('laser: two trips in one ON window reach the alarm — all guards chase', () => {
  const w = laserWorld();
  w.player.x = 800; w.player.y = 280;
  step(w, IDLE, 0.05);
  assert.equal(w.laserSuspicion, 0.6, 'first trip');
  w.player.x = 700; w.player.y = 260; // off the beam (30px clear)
  step(w, IDLE, 0.05);
  w.player.x = 800; w.player.y = 280; // back on the beam, same ON window
  step(w, IDLE, 0.05);
  assert.ok(w.laserSuspicion >= 1, `laser meter ${w.laserSuspicion} must hit 1.0`);
  assert.equal(w.alarm.active, true, 'the laser alarm raises');
  assert.ok(w.guards.every((g) => g.state === 'chase'),
    'every guard must chase on a laser alarm');
  assert.equal(w.detections, 6, 'one detection per guard forced into chase');
});

// --- alarm stages ---

test('hud: alarmStage maps the worst suspicion to CALM/UNEASY/HUNTED/ALARM', () => {
  assert.equal(alarmStage(0, false), 'CALM');
  assert.equal(alarmStage(0.34, false), 'CALM');
  assert.equal(alarmStage(0.35, false), 'UNEASY');
  assert.equal(alarmStage(0.59, false), 'UNEASY');
  assert.equal(alarmStage(0.6, false), 'HUNTED');
  assert.equal(alarmStage(0.94, false), 'HUNTED');
  assert.equal(alarmStage(0.95, false), 'ALARM');
  assert.equal(alarmStage(1, false), 'ALARM');
  assert.equal(alarmStage(0, true), 'ALARM', 'an active alarm overrides the meter');
});

// --- minimap ---

test('hud: projectToMinimap maps world corners and centre to the panel', () => {
  const rect = minimapRect();
  assert.deepEqual(projectToMinimap(0, 0), { x: rect.x, y: rect.y });
  assert.deepEqual(projectToMinimap(960, 600), { x: rect.x + rect.w, y: rect.y + rect.h });
  assert.deepEqual(projectToMinimap(480, 300),
    { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
});

test('hud: the minimap sits inside the rail, clear of the playfield', () => {
  const rect = minimapRect();
  const rail = railRect();
  assert.ok(rect.x >= rail.x, 'minimap starts at or right of the rail edge');
  assert.ok(rect.x + rect.w <= rail.x + rail.w, 'minimap ends inside the rail');
  assert.ok(rect.y >= rail.y && rect.y + rect.h <= rail.y + rail.h,
    'minimap inside the rail (y)');
  assert.ok(rect.x >= CONFIG.VIEW_WIDTH, 'minimap never covers the playfield');
});

// --- score ---

test('hud: timeBonus is +200 up to 60s, then -2/s, floored at 0', () => {
  assert.equal(timeBonus(0), 200);
  assert.equal(timeBonus(60), 200);
  assert.equal(timeBonus(61), 198);
  assert.equal(timeBonus(87.4), 145, '200 - 2*27.4 = 145.2, floored');
  assert.equal(timeBonus(160), 0);
  assert.equal(timeBonus(300), 0);
});

test('hud: scoreBreakdown — props 300 each, GHOST 500, time bonus, spotted count', () => {
  const base = (taken, detections, time) => ({
    props: [
      { taken: taken > 0 }, { taken: taken > 1 }, { taken: taken > 2 },
    ],
    detections, time,
  });
  assert.deepEqual(scoreBreakdown(base(0, 0, 30)),
    { props: 0, ghost: 500, time: 200, total: 700, spotted: 0 });
  assert.deepEqual(scoreBreakdown(base(2, 0, 87.4)),
    { props: 600, ghost: 500, time: 145, total: 1245, spotted: 0 });
  assert.deepEqual(scoreBreakdown(base(3, 1, 200)),
    { props: 900, ghost: 0, time: 0, total: 900, spotted: 1 });
});

// --- roster + checklist ---

test('hud: guardStatesShort adds tile distances with a player position', () => {
  const out = guardStatesShort([
    { name: 'CORVIN', state: 'chase', x: 100, y: 140 },
    { name: 'MIRA', state: 'suspicious', x: 260, y: 100 },
    { name: 'OTTO', state: 'patrol' },
    { name: 'SELMA', state: 'patrol' },
    { name: 'IVO', state: 'patrol' },
    { name: 'PETRA', state: 'patrol' },
  ], { x: 100, y: 100 });
  assert.equal(out, 'CORVIN CHASE 1t · MIRA SUSPICIOUS 4t · 4 PATROL');
});

test('hud: guardStatesShort distLimit keeps distances for the 3 nearest only', () => {
  const out = guardStatesShort([
    { name: 'CORVIN', state: 'chase', x: 360, y: 0 },
    { name: 'MIRA', state: 'suspicious', x: 40, y: 0 },
    { name: 'OTTO', state: 'search', x: 200, y: 0 },
    { name: 'SELMA', state: 'chase', x: 80, y: 0 },
    { name: 'IVO', state: 'patrol' },
    { name: 'PETRA', state: 'patrol' },
  ], { x: 0, y: 0 }, 3);
  assert.equal(out, 'CORVIN CHASE · MIRA SUSPICIOUS 1t · OTTO SEARCH 5t · SELMA CHASE 2t · 2 PATROL');
});

test('hud: the objective checklist marks taken props with a check', () => {
  const line = propsChecklistLine(propsSummary([
    { id: 'tiara', name: 'Star Tiara', taken: true },
    { id: 'mask', name: 'Golden Mask', taken: true },
    { id: 'violin', name: "Lead's Violin", taken: false },
  ]));
  assert.equal(line, 'Props 2/3 ✓ Tiara ✓ Mask ○ Violin');
});
