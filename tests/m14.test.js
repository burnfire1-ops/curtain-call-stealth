// M14 tests — campaign-lite (2 jobs) + the two user text rules of
// 22 Nov 06:22 / 06:25 WIB (label-box occlusion, panel text).
// Job 2 (THE GALLERY AFTER DARK): surveillance-heavy, a different shape
// from Job 1 (flow down the west edge, exit bottom-right). Select screen
// (2 job cards + HOW TO PLAY), campaign total, NEXT JOB / CAMPAIGN
// COMPLETE, best per job. No new gadget, no new sensor type, no change
// to win/lose rules or the per-job score formula.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { LEVELS, buildLevel2, goalReachable, pacingProblems, lightAt, floorAt } from '../game/src/level.js';
import { createWorld, step, throwCoin } from '../game/src/world.js';
import { updateSuspicion } from '../game/src/detection.js';
import { segmentBlocked } from '../game/src/vision.js';
import { transition } from '../game/src/screens.js';
import { applyShot } from '../game/src/shots.js';
import { render } from '../game/src/render.js';
import {
  railRect, minimapRect, overlayPanelRect, selectLayout,
  selectCardLines, selectHowtoLines, jobStatus, canSelectJob,
  campaignTotal, updateBest, jobAtPoint, panelTextFits, PANEL_TEXT_MARGIN,
  winScreenLines, loseScreenLines, propsSummary,
  textBox, rectsOverlap, labelOccluded, laserOccluder, labelOccluders,
} from '../game/src/hud.js';

// Canvas monospace advance is 0.6em per char (13px -> 7.8px/char,
// 16px -> 9.6px/char) — the same measure the panel-text tests use.
const measure = (text, size) => String(text).length * size * 0.6;

function stepN(world, input, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) step(world, input, dt);
}
const IDLE = { x: 0, y: 0, run: false };

const freshCampaign = () => ({ selected: 0, cleared: [false, false], best: [null, null] });

// --- Job 2 level data ---

test('m14: LEVELS has 2 jobs — Job 1 unchanged, Job 2 surveillance-heavy', () => {
  assert.equal(LEVELS.length, 2);
  assert.equal(LEVELS[0].name, 'THE MIDNIGHT THEATRE');
  assert.equal(LEVELS[1].name, 'THE GALLERY AFTER DARK');
  assert.equal(LEVELS[0].guards.length, 6, 'Job 1 still has 6 ushers');
  assert.equal(LEVELS[0].cameras.length, 2);
  assert.equal(LEVELS[0].lasers.length, 2);
  const j2 = LEVELS[1];
  assert.equal(j2.guards.length, 4, 'Job 2 has 4 ushers');
  assert.equal(j2.cameras.length, 3, 'Job 2 has 3 cameras');
  assert.equal(j2.lasers.length, 3, 'Job 2 has 3 lasers');
  assert.equal(j2.props.length, 3);
  assert.deepEqual(j2.props.map((p) => p.id), ['script', 'baton', 'rose']);
  assert.deepEqual(j2.props.map((p) => p.name),
    ['The Gilded Script', 'The Silver Baton', 'The Velvet Rose']);
});

test('m14: Job 2 spawn/exit/props/covers sit inside the canvas, props clear of walls and covers', () => {
  const j2 = buildLevel2();
  const inside = (x, y) => x >= CONFIG.WALL && x <= CONFIG.VIEW_WIDTH - CONFIG.WALL
    && y >= CONFIG.WALL && y <= CONFIG.VIEW_HEIGHT - CONFIG.WALL;
  assert.ok(inside(j2.spawn.x, j2.spawn.y), 'spawn inside');
  assert.ok(inside(j2.exit.x, j2.exit.y)
    && inside(j2.exit.x + j2.exit.w, j2.exit.y + j2.exit.h), 'exit inside');
  const inRect = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  for (const p of j2.props) {
    assert.ok(inside(p.x, p.y), `${p.id} inside`);
    assert.ok(!j2.walls.concat(j2.covers).some((r) => inRect(p.x, p.y, r)),
      `${p.id} not inside a wall or cover`);
  }
  assert.ok(!j2.walls.concat(j2.covers).some((r) => inRect(j2.spawn.x, j2.spawn.y, r)),
    'spawn not inside a wall or cover');
});

test('m14: Job 2 is reachable — spawn to exit, spawn to each prop, each prop to exit', () => {
  const j2 = buildLevel2();
  assert.equal(goalReachable(j2, j2.spawn, j2.exit), true, 'spawn -> exit');
  for (const p of j2.props) {
    assert.equal(goalReachable(j2, j2.spawn, p), true, `spawn -> ${p.id}`);
    assert.equal(goalReachable(j2, p, j2.exit), true, `${p.id} -> exit`);
  }
});

test('m14: Job 2 patrol routes never cross a cover or a wall', () => {
  const j2 = buildLevel2();
  const blockers = j2.walls.concat(j2.covers);
  for (const g of j2.guards) {
    const [a, b] = g.waypoints;
    assert.equal(segmentBlocked(a.x, a.y, b.x, b.y, blockers), false,
      `${g.name} route ${a.x},${a.y} -> ${b.x},${b.y} must be clear`);
  }
});

test('m14: Job 2 pacing beats pass (teach first, rest before climax)', () => {
  assert.deepEqual(pacingProblems(buildLevel2().beats), []);
});

test('m14: Job 2 room labels are hand-placed and inside the canvas', () => {
  const labels = buildLevel2().roomLabels;
  assert.equal(labels.length, 2, 'GALLERY + WEST WING (no east label — it would straddle the select/win panels)');
  for (const l of labels) {
    assert.ok(l.x > 0 && l.x < CONFIG.VIEW_WIDTH && l.y > 0 && l.y < CONFIG.VIEW_HEIGHT,
      `${l.text} inside the canvas`);
  }
});

// --- world per job ---

test('m14: createWorld(1) builds Job 2 — counts, jobIndex, jobName, gadgets reset', () => {
  const w2 = createWorld(1);
  assert.equal(w2.jobIndex, 1);
  assert.equal(w2.jobName, 'THE GALLERY AFTER DARK');
  assert.equal(w2.guards.length, 4);
  assert.equal(w2.cameras.length, 3);
  assert.equal(w2.lasers.length, 3);
  assert.equal(w2.props.length, 3);
  assert.equal(w2.coins, 3, 'a fresh job starts with 3 coins');
  assert.equal(w2.smokes, 2, 'a fresh job starts with 2 smokes');
  const w1 = createWorld();
  assert.equal(w1.jobIndex, 0);
  assert.equal(w1.jobName, 'THE MIDNIGHT THEATRE');
  assert.equal(w1.guards.length, 6);
  assert.equal(w1.cameras.length, 2);
  assert.equal(w1.lasers.length, 2);
  assert.deepEqual(propsSummary(w2.props).items.map((i) => i.name),
    ['Script', 'Baton', 'Rose'], 'Job 2 short names for the HUD checklist');
});

test('m14: gadgets reset per job — spending coins in Job 1 does not carry to Job 2', () => {
  const w1 = createWorld(0);
  w1.player.x = 200; w1.player.y = 520;
  for (let i = 0; i < 3; i++) {
    assert.equal(throwCoin(w1, 400, 520), true, `coin ${i + 1} throws`);
    stepN(w1, IDLE, 0.6);
  }
  assert.equal(w1.coins, 0);
  const w2 = createWorld(1);
  assert.equal(w2.coins, 3, 'Job 2 starts full');
  assert.equal(w2.smokes, 2, 'Job 2 starts full');
});

test('m14: lightAt/floorAt read the active job — Job 2 hall lit, Job 2 west runner carpet', () => {
  // (700,300) is dark in Job 1 and inside Job 2's hall pool.
  assert.equal(lightAt(700, 300), CONFIG.LIGHT_DARK, 'Job 1 default: dark');
  assert.equal(lightAt(700, 300, LEVELS[1]), CONFIG.LIGHT_POOL, 'Job 2 hall pool: lit');
  assert.equal(lightAt(500, 90, LEVELS[1]), CONFIG.LIGHT_POOL, 'Job 2 gallery pool: lit');
  // (200,480) is wood in Job 1 and inside Job 2's west carpet runner.
  assert.equal(floorAt(200, 480), 'wood', 'Job 1 default: wood');
  assert.equal(floorAt(200, 480, LEVELS[1]), 'carpet', 'Job 2 west runner: carpet');
});

test('m14: updateSuspicion uses the active job light — same spot fills slower in Job 1 dark', () => {
  const dark = updateSuspicion(0, true, { dist: 100, running: false, x: 700, y: 300 }, 0.1);
  const lit = updateSuspicion(0, true,
    { dist: 100, running: false, x: 700, y: 300, level: LEVELS[1] }, 0.1);
  assert.ok(Math.abs(dark - 0.101) < 0.005, `Job 1 dark fill ${dark} ~= 0.101`);
  assert.ok(Math.abs(lit - 0.289) < 0.005, `Job 2 lit fill ${lit} ~= 0.289`);
});

// --- campaign pure helpers ---

test('m14: jobStatus — Job 1 always open, Job 2 locked until Job 1 clears', () => {
  const fresh = freshCampaign();
  assert.equal(jobStatus(fresh, 0), 'open');
  assert.equal(jobStatus(fresh, 1), 'locked');
  assert.equal(canSelectJob(fresh, 1), false);
  const cleared1 = { selected: 0, cleared: [true, false], best: [null, null] };
  assert.equal(jobStatus(cleared1, 1), 'open');
  assert.equal(canSelectJob(cleared1, 1), true);
  const done = { selected: 1, cleared: [true, true], best: [null, null] };
  assert.equal(jobStatus(done, 0), 'cleared');
  assert.equal(jobStatus(done, 1), 'cleared');
});

test('m14: campaignTotal sums the bests, null counts 0', () => {
  assert.equal(campaignTotal([null, null]), 0);
  assert.equal(campaignTotal([{ score: 1245, time: 87.4 }, null]), 1245);
  assert.equal(campaignTotal([{ score: 1245, time: 87.4 }, { score: 1529, time: 95.2 }]), 2774);
});

test('m14: updateBest only ever improves, a tie keeps the earlier run', () => {
  assert.deepEqual(updateBest(null, 1000, 60), { score: 1000, time: 60 });
  assert.deepEqual(updateBest({ score: 1245, time: 87.4 }, 1000, 60),
    { score: 1245, time: 87.4 }, 'a worse replay never lowers the best');
  assert.deepEqual(updateBest({ score: 1245, time: 87.4 }, 1500, 90),
    { score: 1500, time: 90 });
  assert.deepEqual(updateBest({ score: 1245, time: 87.4 }, 1245, 80),
    { score: 1245, time: 87.4 }, 'a tie keeps the earlier (faster) run');
});

test('m14: selectCardLines — counts, status, best', () => {
  const fresh = freshCampaign();
  assert.deepEqual(selectCardLines(LEVELS[0], fresh, 0), [
    '1 · THE MIDNIGHT THEATRE',
    '6 guards · 2 cameras · 2 lasers · 3 props',
    'NOT CLEARED',
    'PRESS 1',
  ]);
  assert.deepEqual(selectCardLines(LEVELS[1], fresh, 1), [
    '2 · THE GALLERY AFTER DARK',
    '4 guards · 3 cameras · 3 lasers · 3 props',
    'LOCKED — clear Job 1 to open',
    '',
  ]);
  const cleared = { selected: 1, cleared: [true, false], best: [{ score: 1245, time: 87.4 }, null] };
  assert.deepEqual(selectCardLines(LEVELS[0], cleared, 0), [
    '1 · THE MIDNIGHT THEATRE',
    '6 guards · 2 cameras · 2 lasers · 3 props',
    'CLEARED',
    'BEST 1245 · 01:27',
  ]);
  assert.equal(selectCardLines(LEVELS[1], cleared, 1)[2], 'NOT CLEARED');
});

test('m14: selectLayout — cards + howto inside the canvas, no overlap, baselines clear of the panel edges', () => {
  const L = selectLayout();
  const rects = [...L.cards, L.howto];
  for (const r of rects) {
    assert.ok(r.x >= 0 && r.y >= 0, 'inside the canvas (top-left)');
    assert.ok(r.x + r.w <= CONFIG.VIEW_WIDTH, 'inside the canvas (right)');
    assert.ok(r.y + r.h <= CONFIG.VIEW_HEIGHT, 'inside the canvas (bottom)');
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x
    && a.y < b.y + b.h && a.y + a.h > b.y;
  assert.equal(overlap(L.cards[0], L.cards[1]), false, 'the cards do not overlap');
  assert.equal(overlap(L.cards[0], L.howto), false, 'card 1 clears the howto panel');
  assert.equal(overlap(L.cards[1], L.howto), false, 'card 2 clears the howto panel');
  // 13 howto rows at pitch 19 from baseline 274: first 24px below the
  // panel top (250), last 20px above the panel bottom (522).
  const rows = selectHowtoLines().length;
  assert.equal(rows, 13, 'header + 4 objective + blank + 5 mechanics + blank + controls');
  assert.ok(L.howtoFirstBaseline - L.howto.y >= 10, 'first baseline >=10px below the panel top');
  const last = L.howtoFirstBaseline + (rows - 1) * L.howtoPitch;
  assert.ok(L.howto.y + L.howto.h - last >= 10, 'last baseline >=10px above the panel bottom');
  assert.ok(L.footerY > L.howto.y + L.howto.h, 'the closer sits below the howto panel');
  assert.ok(L.bestY < CONFIG.VIEW_HEIGHT, 'the campaign best sits inside the canvas');
});

test('m14: jobAtPoint hits the cards, misses the gaps', () => {
  assert.equal(jobAtPoint(280, 170), 0, 'card 1 centre');
  assert.equal(jobAtPoint(680, 170), 1, 'card 2 centre');
  assert.equal(jobAtPoint(480, 170), -1, 'the gap between the cards');
  assert.equal(jobAtPoint(480, 300), -1, 'the howto panel is not a card');
  assert.equal(jobAtPoint(50, 50), -1, 'open floor');
});

// --- transitions (the full select/win/lose flow; the basics live in m4.test.js) ---

test('m14: screens — win Job 1 Enter goes NEXT JOB, win Job 2 Enter goes back to the title', () => {
  assert.deepEqual(transition('win', 'Enter'), { screen: 'play', action: 'next' });
  assert.deepEqual(transition('win', 'Enter', { jobIndex: 0 }), { screen: 'play', action: 'next' });
  assert.deepEqual(transition('win', 'Enter', { jobIndex: 1 }), { screen: 'select', action: 'title' });
  assert.deepEqual(transition('win', 'KeyR'), { screen: 'play', action: 'restart' });
  assert.deepEqual(transition('lose', 'Enter'), { screen: 'play', action: 'restart' });
  assert.deepEqual(transition('lose', 'Enter', { jobIndex: 1 }), { screen: 'play', action: 'restart' });
});

// --- label-box occlusion (user rule 06:22 WIB) ---

test('m14: textBox measures the centred box from the metrics', () => {
  assert.deepEqual(
    textBox('USHER 1 · PATROL', 300, 100, { width: 106, ascent: 11, descent: 3 }),
    { x: 247, y: 89, w: 106, h: 14 });
  assert.deepEqual(
    textBox('X', 100, 50, { width: 10, ascent: 11, descent: 3 }, 'left'),
    { x: 100, y: 39, w: 10, h: 14 });
});

test('m14: labelOccluded catches the three user defects; the anchor-only check misses them', () => {
  const overlay = overlayPanelRect(11); // the old 11-line start panel
  // (1) USHER 1: the anchor (140,280) sits OUTSIDE the panel (x<150),
  // but the text juts under the panel's left edge — cut in half.
  // The label is 16 chars at 11px monospace = 105.6px wide.
  const usher1 = textBox('USHER 1 · PATROL', 140, 280, { width: 105.6, ascent: 11, descent: 3 });
  assert.equal(labelOccluded(usher1, [overlay]), true, 'the straddling box is occluded');
  assert.equal(labelInsideHudCheck(140, 280), false, 'but the anchor-only check says clear');
  // (2) USHER 4 on the select screen: the label box overlaps card 2.
  const L = selectLayout();
  const usher4 = textBox('USHER 4 · PATROL', 900, 180, { width: 105.6, ascent: 11, descent: 3 });
  assert.equal(labelOccluded(usher4, [L.cards[1]]), true, 'on the card edge');
  // (3) CAM 2: LASER 1 (y=290) crosses the label text at (900,288).
  const cam2 = textBox('CAM 2', 900, 288, { width: 33, ascent: 11, descent: 3 });
  const laser1 = laserOccluder({ x1: 660, y1: 290, x2: 940, y2: 290 });
  assert.equal(labelOccluded(cam2, [laser1]), true, 'the beam crosses the text');
  assert.equal(labelInsideHudCheck(900, 288), false, 'but the anchor-only check says clear');
  // A clear label is not occluded (well above the panel, far from the beam).
  const clear = textBox('USHER 2 · SEARCH', 560, 150, { width: 105.6, ascent: 11, descent: 3 });
  assert.equal(labelOccluded(clear, [overlay, laser1]), false);
});

// The anchor-only helper, kept for its own tests — imported here only
// to prove the old rule misses the new defects (it is NOT the M14 rule).
import { labelInsideHud as labelInsideHudCheck } from '../game/src/hud.js';

test('m14: laserOccluder thickens the beam by 4px on each side', () => {
  assert.deepEqual(
    laserOccluder({ x1: 660, y1: 290, x2: 940, y2: 290 }),
    { x: 656, y: 286, w: 288, h: 8 });
  assert.deepEqual(
    laserOccluder({ x1: 600, y1: 80, x2: 600, y2: 220 }),
    { x: 596, y: 76, w: 8, h: 148 });
});

test('m14: labelOccluders builds the right list per screen', () => {
  const laser = { x1: 0, y1: 0, x2: 100, y2: 0 };
  assert.equal(labelOccluders({ hud: true, lasers: [laser] }).length, 2,
    'rail + 1 laser (M15: the header + bottom + minimap panels are gone, the rail is the only HUD panel)');
  assert.equal(labelOccluders({ overlay: overlayPanelRect(5), lasers: [] }).length, 1);
  assert.equal(labelOccluders({}).length, 0);
});

test('m14: overlayPanelRect matches the drawn panel (x150 y190 w660)', () => {
  assert.deepEqual(overlayPanelRect(5), { x: 150, y: 190, w: 660, h: 270 });
  assert.deepEqual(overlayPanelRect(4), { x: 150, y: 190, w: 660, h: 242 });
});

// --- panel text rules (user rule 06:25 WIB) ---

test('m14: every HOW TO PLAY line fits panel − 80px at 13px (measureText)', () => {
  const panelW = selectLayout().howto.w; // 780
  let longest = 0;
  let longestLine = '';
  for (const line of selectHowtoLines()) {
    assert.ok(panelTextFits(line, 13, panelW, measure),
      `"${line}" must fit ${panelW - PANEL_TEXT_MARGIN * 2}px`);
    const w = measure(line, 13);
    if (w > longest) { longest = w; longestLine = line; }
  }
  assert.ok(longest <= panelW - PANEL_TEXT_MARGIN * 2,
    `longest line "${longestLine}" is ${longest}px <= ${panelW - 80}px`);
});

test('m14: no HOW TO PLAY sentence breaks across lines with a lowercase continuation', () => {
  const lines = selectHowtoLines();
  for (const line of lines) {
    if (!line) continue; // blank group separators
    assert.ok(!/^[a-z]/.test(line), `"${line}" must not start lowercase`);
  }
  // The user's rewrite (rule (c)): a complete sentence ending at
  // "EXIT.", then a new line starting "Props are optional:".
  assert.ok(lines[2].endsWith('.'), 'the prop sentence ends at EXIT.');
  assert.ok(lines[3].startsWith('Props are optional:'), 'the next line starts capitalised');
  assert.equal(lines[2], 'Grab the 3 props — then reach the EXIT.');
  assert.equal(lines[3], 'Props are optional: the exit is always reachable without them.');
});

test('m14: every win-screen body line fits panel − 80px at 16px', () => {
  for (const shot of ['end', 'end2']) {
    const { world, campaign } = applyShot(shot);
    const { body } = winScreenLines(world, campaign);
    for (const line of body) {
      assert.ok(panelTextFits(line, 16, 660, measure),
        `"${line}" (${shot}) must fit ${660 - PANEL_TEXT_MARGIN * 2}px`);
    }
  }
});

test('m14: winScreenLines — Job 1 offers NEXT JOB, Job 2 closes the campaign, totals are right', () => {
  const e1 = applyShot('end');
  assert.deepEqual(winScreenLines(e1.world, e1.campaign), {
    title: 'GHOST — ESCAPED!',
    body: [
      'JOB 1 · THE MIDNIGHT THEATRE — CLEARED',
      'Time: 01:27 · Props 2/3 · Spotted 0x',
      'Score: 1245 — Props 600 + Ghost 500 + Time 145',
      'CAMPAIGN TOTAL 1245',
    ],
    footer: 'NEXT JOB — PRESS ENTER · R TO REPLAY',
  });
  const e2 = applyShot('end2');
  assert.deepEqual(winScreenLines(e2.world, e2.campaign), {
    title: 'GHOST — ESCAPED!',
    body: [
      'JOB 2 · THE GALLERY AFTER DARK — CLEARED',
      'Time: 01:35 · Props 3/3 · Spotted 0x',
      'Score: 1529 — Props 900 + Ghost 500 + Time 129',
      'CAMPAIGN COMPLETE — TOTAL 2774',
    ],
    footer: 'PRESS ENTER — BACK TO TITLE · R TO REPLAY',
  });
});

test('m14: loseScreenLines — the M13 body, unchanged in meaning', () => {
  const w = createWorld();
  w.caughtBy = 'USHER 3';
  w.props[0].taken = true;
  w.time = 30;
  w.detections = 1;
  assert.deepEqual(loseScreenLines(w), {
    title: 'CAUGHT!',
    body: [
      'USHER 3 caught you.',
      'An usher saw you inside the cone for too long.',
      'Score: 500 — Props 300 + Time 200',
    ],
    footer: 'PRESS R OR ENTER TO TRY AGAIN',
  });
});

// --- the Job 2 golden path (Probe T2) is winnable by construction ---

test('m14: the Job 2 golden path is geometrically reachable and never trips a laser', () => {
  // The Probe T2 route: spawn (80,300) -> south along the west edge
  // (80,540) -> east along the bottom (700,540) -> the exit (880,510).
  // The camera timing (CAM 2's sweep window) is the probe's job, not
  // a unit test — but the geometry must hold: reachable, and no laser
  // within 32px of any point on the path (player r12 + 20px margin).
  const j2 = buildLevel2();
  const path = [[80, 300], [80, 540], [700, 540], [880, 510]];
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];
    assert.equal(goalReachable(j2, { x: x1, y: y1 }, { x: x2, y: y2 }), true,
      `leg ${i + 1} (${x1},${y1}) -> (${x2},${y2}) must be reachable`);
  }
  const samples = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.ceil(len / 20);
    for (let k = 0; k <= n; k++) {
      samples.push([x1 + (x2 - x1) * (k / n), y1 + (y2 - y1) * (k / n)]);
    }
  }
  for (const [px, py] of samples) {
    for (const laser of j2.lasers) {
      assert.equal(
        segmentHitsCircleFor(laser, px, py), false,
        `laser ${laser.name} must stay 32px clear of the path at (${Math.round(px)},${Math.round(py)})`);
    }
  }
});

// segmentHitsCircle imported under a local name to keep the test
// readable (the laser is the segment, the path point is the circle).
import { segmentHitsCircle } from '../game/src/vision.js';
function segmentHitsCircleFor(laser, px, py) {
  return segmentHitsCircle(laser.x1, laser.y1, laser.x2, laser.y2, px, py, 32);
}

// --- render: the box rule + the panel-text rules, on real frames ---

class MockGradient {
  constructor() { this.stops = []; }
  addColorStop(offset, color) { this.stops.push([offset, color]); }
}

class MockCtx {
  constructor() {
    this.calls = [];
    this.fillStyle = '';
    this.strokeStyle = '';
    this.lineWidth = 1;
    this.font = '';
    this.textAlign = '';
    this.globalAlpha = 1;
  }
  _rec(name, args) { this.calls.push([name, ...args]); }
  save() { this._rec('save', []); }
  restore() { this._rec('restore', []); }
  translate(x, y) { this._rec('translate', [x, y]); }
  fillRect(x, y, w, h) { this._rec('fillRect', [x, y, w, h, this.fillStyle]); }
  strokeRect(x, y, w, h) { this._rec('strokeRect', [x, y, w, h]); }
  beginPath() { this._rec('beginPath', []); }
  moveTo(x, y) { this._rec('moveTo', [x, y]); }
  lineTo(x, y) { this._rec('lineTo', [x, y]); }
  arc(x, y, r, a0, a1) { this._rec('arc', [x, y, r, a0, a1]); }
  closePath() { this._rec('closePath', []); }
  fill() { this._rec('fill', []); }
  stroke() { this._rec('stroke', []); }
  setLineDash(d) { this._rec('setLineDash', [d]); }
  fillText(text, x, y) { this._rec('fillText', [text, x, y, this.textAlign, this.font]); }
  measureText(text) {
    const m = /(\d+)px/.exec(this.font || '12px monospace');
    const size = m ? parseInt(m[1], 10) : 12;
    return {
      width: String(text).length * size * 0.6,
      actualBoundingBoxAscent: size,
      actualBoundingBoxDescent: Math.ceil(size * 0.25),
    };
  }
  createRadialGradient() {
    this._rec('createRadialGradient', []);
    return new MockGradient();
  }
  createLinearGradient() {
    this._rec('createLinearGradient', []);
    return new MockGradient();
  }
  quadraticCurveTo() { this._rec('quadraticCurveTo', []); }
  drawImage() { this._rec('drawImage', []); }
}

function textsOf(ctx) {
  return ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
}

// World labels only (guard / camera / prop names) — the panel texts,
// the room labels (baked floor text) and the EXIT label are not world
// labels and are not subject to the box rule.
const LABEL_RE = /^(USHER \d|CAM \d|THE )/;

// For every world label actually DRAWN in a frame, its text box (from
// the recorded font + the mock measure) must not touch any occluder
// for that screen — the user rule (06:22 WIB), checked on the frame
// itself, not just on the helpers.
function assertNoLabelTouchesOccluder(ctx, occluders) {
  for (const c of ctx.calls.filter((x) => x[0] === 'fillText')) {
    const [, text, x, y, align, font] = c;
    if (!LABEL_RE.test(text)) continue;
    const size = parseInt((/(\d+)px/.exec(font || '') || [0, 11])[1], 10);
    const box = textBox(text, x, y,
      { width: String(text).length * size * 0.6, ascent: size, descent: Math.ceil(size * 0.25) },
      align || 'center');
    assert.equal(labelOccluded(box, occluders), false,
      `"${text}" at (${x},${y}) must not touch any panel or laser`);
  }
}

test('m14 render: select frame draws the job cards + howto panel, one straight left edge, no label touches a panel', () => {
  const ctx = new MockCtx();
  const { world, screen, campaign } = applyShot('select');
  render(ctx, world, screen, 0, false, campaign);
  const texts = textsOf(ctx);
  const rows = ctx.calls.filter((c) => c[0] === 'fillText');
  const L = selectLayout();
  // The cards + the howto panel are drawn (fillRect), the title is centred.
  const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
  assert.ok(rects.some((c) => c[1] === 90 && c[2] === 108 && c[3] === 380 && c[4] === 128),
    'job card 1 drawn');
  assert.ok(rects.some((c) => c[1] === 490 && c[2] === 108 && c[3] === 380 && c[4] === 128),
    'job card 2 drawn');
  assert.ok(rects.some((c) => c[1] === 90 && c[2] === 250 && c[3] === 780 && c[4] === 272),
    'howto panel drawn');
  assert.ok(texts.includes('CURTAIN CALL'), 'title drawn');
  assert.ok(texts.includes('1 · THE MIDNIGHT THEATRE'), 'Job 1 card drawn');
  assert.ok(texts.includes('2 · THE GALLERY AFTER DARK'), 'Job 2 card drawn');
  assert.ok(texts.some((t) => t.includes('CLEARED')), 'Job 1 status drawn');
  // The fixture has Job 1 CLEARED, so Job 2 is OPEN (not locked):
  // 'NOT CLEARED' + 'PRESS 2'. The locked card IS covered by the
  // selectCardLines unit tests (fresh campaign, Job 2 locked).
  assert.ok(texts.some((t) => t.includes('NOT CLEARED')), 'Job 2 open status drawn');
  assert.ok(texts.some((t) => t.includes('PRESS 2')), 'Job 2 press hint drawn');
  assert.ok(texts.some((t) => t.includes('BEST 1245')), 'Job 1 best drawn');
  assert.ok(texts.includes('HOW TO PLAY'), 'howto header drawn');
  assert.ok(texts.includes('CLICK A JOB CARD OR PRESS 1–2 · ENTER TO START'), 'closer drawn');
  assert.ok(texts.includes('CAMPAIGN BEST 1245'), 'campaign best drawn');
  // One straight left edge: every non-blank howto line is left-aligned
  // at the same x (panel.x + 40); the title + closer stay centred.
  const howtoLines = selectHowtoLines();
  for (const line of howtoLines) {
    if (!line) continue;
    const found = rows.filter((c) => c[1] === line);
    assert.equal(found.length, 1, `"${line}" drawn once`);
    assert.equal(found[0][2], L.howtoX, `"${line}" on the straight left edge (x=${L.howtoX})`);
    assert.equal(found[0][4], 'left', `"${line}" left-aligned`);
  }
  const title = rows.find((c) => c[1] === 'CURTAIN CALL');
  assert.equal(title[4], 'center', 'the title stays centred');
  assert.equal(title[2], CONFIG.VIEW_WIDTH / 2, 'the title is centred on the canvas');
  const closer = rows.find((c) => c[1].startsWith('CLICK A JOB CARD'));
  assert.equal(closer[4], 'center', 'the closer stays centred');
  // The card lines are left-aligned on the card's fixed margin.
  const cardLine = rows.find((c) => c[1] === '1 · THE MIDNIGHT THEATRE');
  assert.equal(cardLine[2], 90 + 16, 'card lines on the card margin');
  assert.equal(cardLine[4], 'left', 'card lines left-aligned');
  // Labels: G4 + CAM 2 + CAM 3 read in the clear strips; the rest are
  // skipped by the box rule (cards / howto / title / tagline zones).
  assert.ok(texts.some((t) => t.startsWith('USHER 4')), 'USHER 4 label shown (clear top strip)');
  assert.ok(texts.includes('CAM 2'), 'CAM 2 label shown');
  assert.ok(texts.includes('CAM 3'), 'CAM 3 label shown');
  assert.ok(!texts.some((t) => t.startsWith('USHER 1')), 'USHER 1 label skipped (tagline zone)');
  assert.ok(!texts.some((t) => t.startsWith('USHER 2')), 'USHER 2 label skipped (howto panel)');
  assert.ok(!texts.some((t) => t.startsWith('USHER 3')), 'USHER 3 label skipped (tagline zone)');
  assert.ok(!texts.includes('CAM 1'), 'CAM 1 label skipped (title zone)');
  // M15: prop name labels are GONE from the playfield entirely (the
  // names live in the rail LOOT checklist) — not skipped by the box
  // rule, simply never drawn.
  assert.ok(!texts.includes('THE GILDED SCRIPT'), 'Script label removed from the playfield');
  assert.ok(!texts.includes('THE SILVER BATON'), 'Baton label removed from the playfield');
  assert.ok(!texts.includes('THE VELVET ROSE'), 'Rose label removed from the playfield');
  // The box rule on the frame itself: no drawn label touches a select
  // panel, a laser, the rail, or the title/tagline text zones.
  const occluders = [...L.cards, L.howto, railRect()];
  for (const l of world.lasers) occluders.push(laserOccluder(l));
  occluders.push(textBox('CURTAIN CALL', CONFIG.VIEW_WIDTH / 2, L.titleY,
    { width: measure('CURTAIN CALL', 44), ascent: 44, descent: 11 }));
  occluders.push(textBox('Steal back the props. Leave no witness.', CONFIG.VIEW_WIDTH / 2, L.taglineY,
    { width: measure('Steal back the props. Leave no witness.', 16), ascent: 16, descent: 4 }));
  assertNoLabelTouchesOccluder(ctx, occluders);
});

test('m14 render: Job 2 play frame — calm staging, labels read, none touches the rail or a laser', () => {
  const ctx = new MockCtx();
  const { world, screen, campaign } = applyShot('play2');
  render(ctx, world, screen, 0, false, campaign);
  const texts = textsOf(ctx);
  assert.ok(texts.includes('CURTAIN CALL'), 'rail title drawn');
  // M15 calm staging: the player hides in the dark west of curtain A,
  // USHER 2 searches the south hall, CAM 2 sweeps (not spotted), all
  // lasers are down. No header hides anyone now, so all 4 ushers +
  // all 3 cameras read (USHER 4 + CAM 1 were skipped under the old
  // header; the box rule still applies — the rail + the beams).
  assert.ok(texts.some((t) => t.startsWith('USHER 1')), 'USHER 1 label shown');
  assert.ok(texts.some((t) => t.startsWith('USHER 2')), 'USHER 2 label shown');
  assert.ok(texts.some((t) => t.startsWith('USHER 3')), 'USHER 3 label shown');
  assert.ok(texts.some((t) => t.startsWith('USHER 4')), 'USHER 4 label shown (no header to hide it)');
  assert.ok(texts.includes('CAM 1'), 'CAM 1 label shown (no header to hide it)');
  assert.ok(texts.includes('CAM 2'), 'CAM 2 label shown');
  assert.ok(texts.includes('CAM 3'), 'CAM 3 label shown');
  // M15 declutter: prop names + room labels are gone from the
  // playfield (names live in the rail LOOT checklist).
  assert.ok(!texts.includes('THE GILDED SCRIPT'), 'Script label removed from the playfield');
  assert.ok(!texts.includes('THE SILVER BATON'), 'Baton label removed from the playfield');
  assert.ok(!texts.includes('THE VELVET ROSE'), 'Rose label removed from the playfield');
  assert.ok(!texts.includes('GALLERY'), 'GALLERY room label removed from the playfield');
  assert.ok(!texts.includes('WEST WING'), 'WEST WING room label removed from the playfield');
  // The rail carries the game state: searching guard + patrol count +
  // the GHOST goal line.
  assert.ok(texts.some((t) => t.includes('U2 SEARCH 8t')), 'roster names the searching guard');
  assert.ok(texts.some((t) => t.includes('3 PATROL')), 'roster collapses the calm guards');
  assert.ok(texts.some((t) => t.includes('EXIT: OPEN · GHOST')), 'goal line reads GHOST');
  const occluders = [railRect()];
  for (const l of world.lasers) occluders.push(laserOccluder(l));
  assertNoLabelTouchesOccluder(ctx, occluders);
});

test('m14 render: Job 2 win frame — body left-aligned, closer centred, overlay panel drawn, no label touches it', () => {
  const ctx = new MockCtx();
  const { world, screen, campaign } = applyShot('end2');
  render(ctx, world, screen, 0, false, campaign);
  const texts = textsOf(ctx);
  const rows = ctx.calls.filter((c) => c[0] === 'fillText');
  // Overlay panel: a 660-wide rect centred (x=150) behind the text.
  const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
  assert.ok(rects.some((c) => c[1] === 150 && c[3] === 660),
    'overlay panel (x=150, w=660) drawn');
  assert.ok(texts.includes('GHOST — ESCAPED!'), 'win title drawn');
  // One straight left edge: every body line at panel.x + 40, left-aligned.
  const { body, footer } = winScreenLines(world, campaign);
  for (const line of body) {
    const found = rows.filter((c) => c[1] === line);
    assert.equal(found.length, 1, `"${line}" drawn once`);
    assert.equal(found[0][2], 150 + PANEL_TEXT_MARGIN,
      `"${line}" on the straight left edge (x=${150 + PANEL_TEXT_MARGIN})`);
    assert.equal(found[0][4], 'left', `"${line}" left-aligned`);
  }
  const footerRow = rows.find((c) => c[1] === footer);
  assert.equal(footerRow[4], 'center', 'the closer stays centred');
  assert.equal(footerRow[2], CONFIG.VIEW_WIDTH / 2, 'the closer is centred on the canvas');
  assert.ok(texts.includes('CAMPAIGN COMPLETE — TOTAL 2774'), 'campaign total drawn');
  // Labels: G2 is skipped (its box sits inside the overlay panel);
  // the rest read in the clear strips.
  assert.ok(!texts.some((t) => t.startsWith('USHER 2')), 'USHER 2 label skipped (overlay panel)');
  assert.ok(texts.some((t) => t.startsWith('USHER 1')), 'USHER 1 label shown');
  assert.ok(texts.some((t) => t.startsWith('USHER 3')), 'USHER 3 label shown');
  assert.ok(texts.some((t) => t.startsWith('USHER 4')), 'USHER 4 label shown');
  assert.ok(texts.includes('CAM 1'), 'CAM 1 label shown');
  assert.ok(texts.includes('CAM 2'), 'CAM 2 label shown');
  assert.ok(texts.includes('CAM 3'), 'CAM 3 label shown');
  const occluders = [overlayPanelRect(body.length + 1), railRect()];
  for (const l of world.lasers) occluders.push(laserOccluder(l));
  assertNoLabelTouchesOccluder(ctx, occluders);
});
