// M2 tests — written FIRST (TDD RED), before any M2 production code.
// Vision (cheap->expensive), suspicion meter, guard FSM.
// Run: node --test tests/m2.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { canSee, segmentBlocked } from '../game/src/vision.js';
import { lightAt, fillRate, updateSuspicion } from '../game/src/detection.js';
import { createGuard, stepGuard } from '../game/src/guard.js';

function stepGuardN(guard, perception, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) stepGuard(guard, perception, dt);
}

// Guard at (300,300) facing right, waypoints along y=300; player in open floor.
function guardFixture() {
  return createGuard({
    x: 300, y: 300,
    waypoints: [{ x: 300, y: 300 }, { x: 700, y: 300 }],
    speed: CONFIG.GUARD_SPEED,
  });
}
function seenAt(x, y, dist, running = false) {
  return { seen: true, dist, player: { x, y }, running };
}
function unseen(dist = 500) {
  return { seen: false, dist, player: { x: 0, y: 0 }, running: false };
}

// --- vision.js ---

test('vision: seen in open cone, reason seen', () => {
  const g = { x: 300, y: 300, r: 14, dir: { x: 1, y: 0 } };
  const p = { x: 450, y: 300, r: 12 };
  const r = canSee(g, p, []);
  assert.equal(r.seen, true);
  assert.equal(r.reason, 'seen');
});

test('vision: out of range -> out-of-range', () => {
  const g = { x: 300, y: 300, r: 14, dir: { x: 1, y: 0 } };
  const p = { x: 300 + CONFIG.VIEW_DIST + 50, y: 300, r: 12 };
  const r = canSee(g, p, []);
  assert.equal(r.seen, false);
  assert.equal(r.reason, 'out-of-range');
});

test('vision: behind the guard -> outside-cone', () => {
  const g = { x: 300, y: 300, r: 14, dir: { x: 1, y: 0 } };
  const p = { x: 300, y: 420, r: 12 };
  const r = canSee(g, p, []);
  assert.equal(r.seen, false);
  assert.equal(r.reason, 'outside-cone');
});

test('vision: wall between guard and player -> blocked', () => {
  const g = { x: 300, y: 300, r: 14, dir: { x: 1, y: 0 } };
  const p = { x: 450, y: 300, r: 12 };
  const cover = [{ x: 360, y: 280, w: 40, h: 40 }];
  const r = canSee(g, p, cover);
  assert.equal(r.seen, false);
  assert.equal(r.reason, 'blocked');
});

test('vision: 2-point raycast — thin cover over the center ray only still seen', () => {
  const g = { x: 300, y: 300, r: 14, dir: { x: 1, y: 0 } };
  const p = { x: 450, y: 300, r: 12 };
  // Cover spans y 297..303, close to the player (x 420..440): it blocks
  // the center ray (y=300), but the edge rays (±6px at the player) have
  // already spread ~5px off-axis there, so they pass clear of it.
  // (A cover at x=360 would NOT work as a fixture: the edge rays have
  // only spread ~2.4px by then and genuinely pass through it.)
  const thin = [{ x: 420, y: 297, w: 20, h: 6 }];
  const r = canSee(g, p, thin);
  assert.equal(r.seen, true, 'one clear sample point is enough to see');
  assert.equal(r.reason, 'seen');
  // Same cover widened to block both edge rays -> blocked.
  const wide = [{ x: 360, y: 280, w: 40, h: 40 }];
  assert.equal(canSee(g, p, wide).seen, false);
});

test('vision: segmentBlocked slab test', () => {
  const rects = [{ x: 360, y: 280, w: 40, h: 40 }];
  assert.equal(segmentBlocked(300, 300, 450, 300, rects), true);
  assert.equal(segmentBlocked(300, 300, 300, 420, rects), false);
  assert.equal(segmentBlocked(300, 300, 450, 300, []), false);
});

// --- detection.js ---

test('detection: lightAt is a real map — 1.0 in light pools, 0.35 in dark wings (M3)', () => {
  // Foyer pool (330,260,160,80), stage pool (440,40,180,110), vault pool (780,20,160,100).
  assert.equal(lightAt(400, 300), 1.0, 'foyer pool');
  assert.equal(lightAt(500, 90), 1.0, 'stage pool');
  assert.equal(lightAt(860, 70), 1.0, 'vault/exit pool');
  assert.equal(lightAt(80, 520), 0.35, 'dark foyer floor');
  assert.equal(lightAt(500, 450), 0.35, 'dark auditorium carpet');
});

test('detection: suspicion fills faster close than far', () => {
  // ctx position is lit (stage pool, 500,90) so the absolute assertion
  // measures proximity, not the dark-wing multiplier.
  const close = updateSuspicion(0, true, { dist: 50, running: false, x: 500, y: 90 }, 0.2);
  const far = updateSuspicion(0, true, { dist: 150, running: false, x: 500, y: 90 }, 0.2);
  assert.ok(close > far, `close ${close} should exceed far ${far}`);
  assert.ok(close > 0.5, `close ${close} should be substantial after 0.2s`);
});

test('detection: running fills faster than walking at the same distance', () => {
  const walk = updateSuspicion(0, true, { dist: 100, running: false, x: 0, y: 0 }, 0.2);
  const run = updateSuspicion(0, true, { dist: 100, running: true, x: 0, y: 0 }, 0.2);
  assert.ok(run > walk, `run ${run} should exceed walk ${walk}`);
});

test('detection: suspicion decays when unseen and floors at 0', () => {
  const decayed = updateSuspicion(0.8, false, { dist: 500, running: false, x: 0, y: 0 }, 0.5);
  assert.ok(decayed < 0.8 && decayed >= 0, `decayed ${decayed}`);
  assert.equal(updateSuspicion(0.1, false, { dist: 500, running: false, x: 0, y: 0 }, 0.5), 0);
});

test('detection: suspicion caps at 1.0', () => {
  assert.equal(updateSuspicion(0.9, true, { dist: 30, running: true, x: 0, y: 0 }, 1), 1.0);
});

test('detection: fillRate is positive and grows with proximity', () => {
  assert.ok(fillRate(30, false, 1) > fillRate(150, false, 1));
  assert.ok(fillRate(150, false, 1) > 0);
});

// --- guard.js FSM ---

test('guard FSM: patrol -> suspicious at suspicion 0.5, stops and faces the player', () => {
  const g = guardFixture();
  stepGuardN(g, seenAt(400, 300, 100), 0.4);
  assert.equal(g.state, 'suspicious', `state ${g.state}, suspicion ${g.suspicion}`);
  assert.ok(g.suspicion >= CONFIG.SUSPICIOUS_AT);
  // Suspicious = stands still, turned toward the last-known position.
  const x0 = g.x;
  stepGuardN(g, seenAt(400, 300, 100), 0.15);
  assert.equal(g.x, x0, 'suspicious guard should not move');
  assert.ok(g.dir.x > 0.9, `guard should face the player, dir ${JSON.stringify(g.dir)}`);
});

test('guard FSM: suspicious -> chase at suspicion 1.0, chases faster than patrol', () => {
  const g = guardFixture();
  // Player at (450,300) — inside the lit foyer pool, 150px away, so the
  // guard keeps chasing for the whole measurement window instead of
  // arriving at lastKnown mid-window (which (400,300) would do).
  stepGuardN(g, seenAt(450, 300, 150), 0.9);
  assert.equal(g.state, 'chase', `state ${g.state}, suspicion ${g.suspicion}`);
  const x0 = g.x;
  stepGuardN(g, seenAt(450, 300, 150), 0.5);
  const chaseDist = g.x - x0;
  assert.ok(Math.abs(chaseDist - CONFIG.GUARD_CHASE_SPEED * 0.5) < 8,
    `chase should cover ~${CONFIG.GUARD_CHASE_SPEED * 0.5}px, got ${chaseDist}`);
  assert.ok(chaseDist > CONFIG.GUARD_SPEED * 0.5, 'chase must be faster than patrol');
});

test('guard FSM: no flip-flop under flickering sight (min state time + hysteresis)', () => {
  const g = guardFixture();
  const log = [{ state: g.state, t: 0 }];
  let t = 0;
  // Player crosses the cone edge at a HUMAN timescale (0.3s in / 0.3s
  // out for 6s). A 0.05s toggle would be a 20 Hz blink no real player
  // can produce — and the world would have caught them on touch anyway.
  for (let i = 0; i < 120; i++) {
    const seen = Math.floor(i / 6) % 2 === 0;
    stepGuard(g, seen ? seenAt(400, 300, 100) : unseen(), 0.05);
    t += 0.05;
    if (g.state !== log[log.length - 1].state) log.push({ state: g.state, t });
  }
  const durations = [];
  for (let i = 1; i < log.length; i++) durations.push(log[i].t - log[i - 1].t);
  for (const d of durations) {
    assert.ok(d >= 0.25, `state lasted only ${d.toFixed(2)}s — flicker (log ${JSON.stringify(log)})`);
  }
  assert.ok(log.length - 1 <= 12, `too many transitions: ${log.length - 1} in 6s`);
});

test('guard FSM: chase goes to the LAST-KNOWN position, not the live player', () => {
  const g = guardFixture();
  stepGuardN(g, seenAt(400, 300, 100), 0.9);
  assert.equal(g.state, 'chase');
  assert.deepEqual(g.lastKnown, { x: 400, y: 300 });
  // Player teleports away, out of sight (behind the guard).
  stepGuardN(g, unseen(), 0.5);
  assert.deepEqual(g.lastKnown, { x: 400, y: 300 }, 'lastKnown must not follow the live player');
  assert.ok(g.x > 330, `guard x ${g.x} should have moved toward last-known (450,300)`);
  assert.equal(g.y, 300, 'guard should not veer toward the live player at (300,420)');
});

test('guard FSM: search ends -> back to patrol with suspicion reset', () => {
  const g = guardFixture();
  stepGuardN(g, seenAt(400, 300, 100), 0.9);
  assert.equal(g.state, 'chase');
  stepGuardN(g, unseen(), 0.5); // lose sight -> search
  assert.equal(g.state, 'search', `state ${g.state} after losing sight`);
  stepGuardN(g, unseen(), 5); // travel to last-known + look around 2s
  assert.equal(g.state, 'patrol', `state ${g.state} after search`);
  assert.equal(g.suspicion, 0);
});

test('guard FSM: patrol resumes toward the nearest waypoint after search', () => {
  const g = guardFixture();
  stepGuardN(g, seenAt(400, 300, 100), 0.9);
  stepGuardN(g, unseen(), 0.5); // lose sight -> search
  assert.equal(g.state, 'search', `state ${g.state} after losing sight`);
  // Step until the search ends and the guard returns to patrol, then
  // check the resume decision AT that moment (not seconds later — by
  // then it may already have reached the waypoint and turned around).
  let enteredPatrol = false;
  for (let i = 0; i < 120; i++) {
    stepGuard(g, unseen(), 0.05);
    if (g.state === 'patrol') { enteredPatrol = true; break; }
  }
  assert.ok(enteredPatrol, 'guard never returned to patrol');
  // Guard is near (450,300); nearest waypoint is (300,300) at index 0.
  assert.equal(g.wpIndex, 0, `wpIndex ${g.wpIndex} should be nearest waypoint 0`);
  const x0 = g.x;
  stepGuardN(g, unseen(), 0.5);
  assert.ok(g.x < x0, 'guard should walk back toward waypoint 0');
});

test('guard FSM: two guards are independent (no shared module state)', () => {
  const a = guardFixture();
  const b = guardFixture();
  b.x = 700; b.y = 100;
  stepGuardN(a, seenAt(400, 300, 100), 0.9);
  stepGuardN(b, unseen(), 0.9);
  assert.equal(a.state, 'chase');
  assert.ok(a.suspicion >= 1.0 - 1e-9);
  assert.equal(b.state, 'patrol', `guard B state ${b.state} must not follow guard A`);
  assert.equal(b.suspicion, 0);
});
