// M4 tests — written FIRST (TDD RED), before any M4 production code.
// HUD logic (timer, props, GHOST/SPOTTED rank), screen transitions,
// audio without AudioContext (guard clause, no throw), feel events,
// world detections/caughtBy/lastNoise.
// Run: node --test tests/m4.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime, worstSuspicion, propsSummary, guardStates, winRank,
  lastNoiseText, LEGEND,
} from '../game/src/hud.js';
import { transition } from '../game/src/screens.js';
import { createAudio, footstepGain } from '../game/src/audio.js';
import {
  createFeel, addShake, triggerAlert, triggerProp, triggerCaught,
  drainAudio, shakeOffset,
} from '../game/src/feel.js';
import { createWorld, step } from '../game/src/world.js';
import { createGuard } from '../game/src/guard.js';

function stepN(world, input, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) step(world, input, dt);
}
const IDLE = { x: 0, y: 0, run: false };

// --- hud.js: timer ---

test('hud: formatTime renders mm:ss, flooring the seconds', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(87.4), '01:27');
  assert.equal(formatTime(600), '10:00');
  assert.equal(formatTime(3599.9), '59:59');
});

// --- hud.js: worst suspicion / guard states / props ---

test('hud: worstSuspicion picks the guard with the highest suspicion', () => {
  const guards = [
    { name: 'USHER 1', state: 'patrol', suspicion: 0.2 },
    { name: 'USHER 2', state: 'suspicious', suspicion: 0.7 },
    { name: 'USHER 3', state: 'patrol', suspicion: 0 },
  ];
  const worst = worstSuspicion(guards);
  assert.equal(worst.name, 'USHER 2');
  assert.equal(worst.state, 'suspicious');
  assert.equal(worst.suspicion, 0.7);
});

test('hud: worstSuspicion returns null for an empty guard list', () => {
  assert.equal(worstSuspicion([]), null);
});

test('hud: propsSummary counts taken props and keeps names in order', () => {
  const summary = propsSummary([
    { id: 'tiara', name: 'Star Tiara', taken: true },
    { id: 'mask', name: 'Golden Mask', taken: false },
    { id: 'violin', name: "Lead's Violin", taken: true },
  ]);
  assert.equal(summary.taken, 2);
  assert.equal(summary.total, 3);
  assert.deepEqual(
    summary.items.map((i) => [i.name, i.taken]),
    [['Tiara', true], ['Mask', false], ['Violin', true]],
  );
});

test('hud: guardStates lists all five ushers in order', () => {
  const states = guardStates([
    { name: 'USHER 1', state: 'patrol' },
    { name: 'USHER 2', state: 'suspicious' },
    { name: 'USHER 3', state: 'chase' },
    { name: 'USHER 4', state: 'search' },
    { name: 'USHER 5', state: 'patrol' },
  ]);
  assert.deepEqual(
    states.map((s) => `${s.name}:${s.state}`),
    ['USHER 1:patrol', 'USHER 2:suspicious', 'USHER 3:chase', 'USHER 4:search', 'USHER 5:patrol'],
  );
});

test('hud: LEGEND names all four readability rules', () => {
  assert.match(LEGEND, /LIGHT=danger/);
  assert.match(LEGEND, /DARK=safe/);
  assert.match(LEGEND, /CARPET=silent/);
  assert.match(LEGEND, /RUNNING on wood=noisy/);
});

// --- hud.js: win rank ---

test('hud: winRank is GHOST with zero detections, SPOTTED otherwise', () => {
  assert.equal(winRank(0), 'GHOST');
  assert.equal(winRank(1), 'SPOTTED');
  assert.equal(winRank(3), 'SPOTTED');
});

// --- hud.js: last noise ---

test('hud: lastNoiseText is silent before any run, then names floor + radius', () => {
  assert.match(lastNoiseText({ lastNoise: null }), /silent/);
  assert.match(
    lastNoiseText({ lastNoise: { floor: 'wood', radius: 140 } }),
    /wood.*140/,
  );
  assert.match(
    lastNoiseText({ lastNoise: { floor: 'carpet', radius: 40 } }),
    /carpet.*40/,
  );
});

// --- screens.js: transitions ---

test('screens: start + Enter -> play, other keys stay on start', () => {
  assert.deepEqual(transition('start', 'Enter'), { screen: 'play' });
  assert.deepEqual(transition('start', 'KeyR'), { screen: 'start' });
  assert.deepEqual(transition('start', 'KeyP'), { screen: 'start' });
});

test('screens: play + P pauses, paused + P resumes, P does nothing on win/lose', () => {
  assert.deepEqual(transition('play', 'KeyP'), { screen: 'paused' });
  assert.deepEqual(transition('paused', 'KeyP'), { screen: 'play' });
  assert.deepEqual(transition('win', 'KeyP'), { screen: 'win' });
  assert.deepEqual(transition('lose', 'KeyP'), { screen: 'lose' });
});

test('screens: R restarts from play, paused, win and lose; Enter restarts from win/lose', () => {
  assert.deepEqual(transition('play', 'KeyR'), { screen: 'play', action: 'restart' });
  assert.deepEqual(transition('paused', 'KeyR'), { screen: 'play', action: 'restart' });
  assert.deepEqual(transition('win', 'KeyR'), { screen: 'play', action: 'restart' });
  assert.deepEqual(transition('lose', 'KeyR'), { screen: 'play', action: 'restart' });
  assert.deepEqual(transition('win', 'Enter'), { screen: 'play', action: 'restart' });
  assert.deepEqual(transition('lose', 'Enter'), { screen: 'play', action: 'restart' });
  // Enter on play/paused is not a restart (movement keys only).
  assert.deepEqual(transition('play', 'Enter'), { screen: 'play' });
});

// --- audio.js: no AudioContext, no throw ---

test('audio: every method is a no-op that does not throw without AudioContext', () => {
  const audio = createAudio();
  assert.equal(audio.isReady(), false);
  assert.doesNotThrow(() => {
    audio.unlock();
    audio.footstep(50, 'wood');
    audio.footstep(300, 'carpet');
    audio.setTension(0.9);
    audio.alarm();
    audio.thud();
    audio.propChime();
    audio.win();
    audio.lose();
    audio.toggleMute();
    audio.toggleMute();
  });
  assert.equal(audio.isReady(), false);
});

test('audio: mute toggle flips and reports the state even with no audio', () => {
  const audio = createAudio();
  assert.equal(audio.isMuted(), false);
  assert.equal(audio.toggleMute(), true);
  assert.equal(audio.isMuted(), true);
  assert.equal(audio.toggleMute(), false);
});

test('audio: footstepGain is 1 up close, 0 beyond earshot, 0.5 halfway', () => {
  assert.equal(footstepGain(0), 1);
  assert.equal(footstepGain(200), 0.5);
  assert.equal(footstepGain(400), 0);
  assert.equal(footstepGain(900), 0);
});

// --- feel.js: events + shake ---

test('feel: alert queues an alarm sound and shows "!" above the guard', () => {
  const feel = createFeel();
  const guard = createGuard({ x: 100, y: 100, waypoints: [{ x: 0, y: 0 }, { x: 200, y: 0 }] });
  triggerAlert(feel, guard);
  assert.equal(feel.alerts.length, 1);
  assert.equal(feel.alerts[0].guard, guard);
  assert.deepEqual(drainAudio(feel), ['alarm']);
  assert.deepEqual(drainAudio(feel), [], 'drain clears the queue');
});

test('feel: prop pickup flashes and queues a chime', () => {
  const feel = createFeel();
  triggerProp(feel);
  assert.equal(feel.propFlash, 1);
  assert.deepEqual(drainAudio(feel), ['prop']);
});

test('feel: caught shakes hard and queues the caught sound', () => {
  const feel = createFeel();
  triggerCaught(feel);
  assert.ok(feel.shake > 0.5, 'caught shake must be strong');
  assert.deepEqual(drainAudio(feel), ['caught']);
});

test('feel: shake decays to zero and the offset returns to rest', () => {
  const feel = createFeel();
  addShake(feel, 0.5);
  // 2s of updates at 60Hz must drain the trauma (decay 1.2/s).
  for (let i = 0; i < 120; i++) {
    // update() is a method on the feel object (see feel.js).
    feel.update(1 / 60);
  }
  assert.equal(feel.shake, 0);
  assert.deepEqual(shakeOffset(feel), { x: 0, y: 0 });
});

test('feel: shake offset is bounded and zero when there is no trauma', () => {
  const feel = createFeel();
  assert.deepEqual(shakeOffset(feel), { x: 0, y: 0 });
  addShake(feel, 1);
  const off = shakeOffset(feel);
  assert.ok(Math.abs(off.x) <= 12 && Math.abs(off.y) <= 8, 'offset stays inside max bounds');
});

// --- world.js: detections / caughtBy / lastNoise (M4 additions) ---

test('world: detections counts each chase entry once, not every frame in chase', () => {
  const world = createWorld();
  world.player.x = 350;
  world.player.y = 300; // inside USHER 1's lit cone
  stepN(world, IDLE, 1.0);
  assert.equal(world.guards[0].state, 'chase');
  assert.equal(world.detections, 1, 'first chase entry counts once');
  stepN(world, IDLE, 0.5);
  assert.equal(world.detections, 1, 'staying in chase must not recount');
});

test('world: a second chase after recovery counts as a second detection', () => {
  const world = createWorld();
  world.player.x = 350;
  world.player.y = 300;
  stepN(world, IDLE, 1.0);
  assert.equal(world.detections, 1);
  // Hide at the spawn corner (80,520): out of every cone and far from
  // the search spot, so the guard can actually give up and recover.
  world.player.x = 80;
  world.player.y = 520;
  stepN(world, IDLE, 6.0);
  assert.equal(world.guards[0].state, 'patrol', 'guard must recover to patrol');
  assert.equal(world.detections, 1, 'recovery must not add a detection');
  // Step back into the cone: put the player 60px in front of the guard
  // (wherever it recovered to) — a fresh chase is a fresh detection.
  const g = world.guards[0];
  world.player.x = g.x + g.dir.x * 60;
  world.player.y = g.y + g.dir.y * 60;
  stepN(world, IDLE, 1.5);
  assert.equal(world.guards[0].state, 'chase');
  assert.equal(world.detections, 2);
});

test('world: being caught names the catching usher and shakes', () => {
  const world = createWorld();
  world.player.x = 350;
  world.player.y = 300;
  // Wait (simulated) until the chasing guard touches the idle player.
  for (let i = 0; i < 200 && world.status === 'playing'; i++) step(world, IDLE, 0.05);
  assert.equal(world.status, 'lost');
  assert.equal(world.caughtBy, 'USHER 1');
  assert.ok(world.feel.shake > 0, 'caught must shake');
});

test('world: running records the last noise (floor + radius); walking does not', () => {
  const world = createWorld();
  assert.equal(world.lastNoise, null);
  stepN(world, IDLE, 0.5);
  assert.equal(world.lastNoise, null, 'walking is silent');
  // Run on wood (250,400 is outside both carpet zones).
  world.player.x = 250;
  world.player.y = 400;
  stepN(world, { x: -1, y: 0, run: true }, 0.5);
  assert.deepEqual(world.lastNoise, { floor: 'wood', radius: 140 });
  // Run on carpet (500,400 is inside the auditorium carpet zone).
  world.player.x = 500;
  world.player.y = 400;
  stepN(world, { x: 1, y: 0, run: true }, 0.5);
  assert.deepEqual(world.lastNoise, { floor: 'carpet', radius: 40 });
});

test('world: prop pickup flashes the feel prop indicator', () => {
  const world = createWorld();
  const tiara = world.props[0];
  world.player.x = tiara.x;
  world.player.y = tiara.y;
  step(world, IDLE, 0.05);
  assert.equal(tiara.taken, true);
  assert.equal(world.feel.propFlash, 1);
  assert.deepEqual(drainAudio(world.feel), ['prop']);
});
