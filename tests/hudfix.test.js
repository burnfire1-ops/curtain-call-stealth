// HUD-fix tests, M15 rail edition: the header bar and the bottom
// bar are DELETED — every HUD element lives in the 240px right rail
// (title / job / score / objective / stage pill + suspicion bar /
// visibility / noise / loot checklist / ushers roster / goal / icon
// legend / controls / minimap). Labels inside the rail are skipped,
// and the minimap panel is opaque. Pure layout helpers + render
// output via a recording mock canvas (node has no canvas — the mock
// records every draw call, so "text inside its panel" is asserted,
// not assumed). Screenshots (CDP) are the visual proof on top of this.
import test from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { applyShot } from '../game/src/shots.js';
import { render } from '../game/src/render.js';
import {
  railRect, railLayout, labelInsideHud, minimapRect,
  buildRosterLine, guardStates, guardStatesShort, propsSummary,
  propsChecklistLine, cameraStates, cameraStatesShort,
  railRosterLines, visibilityWord, noiseWord, legendItems,
} from '../game/src/hud.js';

// Canvas monospace advance is 0.6em per char (12px -> 7.2px/char).
const measure = (text) => String(text).length * 7.2;
// buildRosterLine is a pure helper (kept from the bottom-bar era);
// its tests still need a width budget — 712px, the old bar's inner
// width, kept as a generic budget so the compression levels are the
// same ones the M8/M13 tests locked.
const ROSTER_WIDTH = 744 - 32;

// --- railLayout (pure) ---

test('hudfix: rail holds its sections — every baseline >=10px from the rail edge', () => {
  const L = railLayout();
  const baselines = [
    L.title.y, L.job.y, L.score.y,
    L.objectiveHeader.y, ...L.objectiveLines.map((l) => l.y),
    L.pill.y + 15, L.visibility.label.y, L.noise.label.y,
    L.lootHeader.y, ...L.propLines.map((l) => l.y),
    L.ushersHeader.y, ...[0, 1, 2, 3, 4].map((i) => L.rosterLineY(i)),
    L.goal.y, L.legendHeader.y, ...L.legendRows,
    ...L.controls.map((l) => l.y),
  ];
  for (const y of baselines) {
    assert.ok(y - L.rail.y >= 10, `row baseline ${y} >=10px below rail top`);
    assert.ok(L.rail.y + L.rail.h - y >= 10,
      `row baseline ${y} >=10px above rail bottom`);
  }
  // The minimap is the last section: 10px clear of the rail bottom.
  assert.equal(L.minimap.y + L.minimap.h, 590, 'minimap bottom 10px above the rail bottom');
  assert.equal(L.rosterMaxLines, 5, 'the roster block reserves 5 lines');
});

test('hudfix: rail + minimap fit the canvas, clear the EXIT, and the minimap sits inside the rail', () => {
  const rail = railRect();
  const exit = { x: 860, y: 40, w: 60, h: 60 };
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x
    && a.y < b.y + b.h && a.y + a.h > b.y;
  assert.deepEqual(rail, { x: 960, y: 0, w: 240, h: 600 }, 'rail is the right 240px of the 1200px canvas');
  assert.ok(rail.x + rail.w <= CONFIG.CANVAS_W, 'rail inside canvas (right)');
  assert.ok(rail.y + rail.h <= CONFIG.CANVAS_H, 'rail inside canvas (bottom)');
  assert.ok(!overlap(rail, exit), 'rail clears the EXIT box');
  // The playfield (x0..960) is 100% game: the rail starts exactly
  // where the world ends, and the minimap lives inside the rail.
  assert.equal(rail.x, CONFIG.VIEW_WIDTH, 'rail starts at the playfield edge');
  const mm = minimapRect();
  assert.ok(mm.x >= rail.x && mm.x + mm.w <= rail.x + rail.w, 'minimap inside the rail (x)');
  assert.ok(mm.y >= rail.y && mm.y + mm.h <= rail.y + rail.h, 'minimap inside the rail (y)');
  assert.equal(mm.w / mm.h, 1.6, 'minimap keeps the 960:600 aspect');
});

// --- labelInsideHud (pure) ---

test('hudfix: labelInsideHud hides anchors inside the rail, shows the rest', () => {
  assert.equal(labelInsideHud(700, 40), false, 'PETRA label anchor is clear now (no header)');
  assert.equal(labelInsideHud(520, 60), false, 'CAM 1 mount is clear now (no header)');
  assert.equal(labelInsideHud(520, 100), false, 'MIRA label anchor is clear now');
  assert.equal(labelInsideHud(400, 560), false, 'open floor is clear now (no bottom bar)');
  assert.equal(labelInsideHud(880, 522), false, 'Violin label anchor is clear now (no playfield minimap)');
  assert.equal(labelInsideHud(900, 300), false, 'CAM 2 mount is clear');
  assert.equal(labelInsideHud(100, 300), false, 'open floor is clear');
  assert.equal(labelInsideHud(1000, 300), true, 'a point inside the rail');
  assert.equal(labelInsideHud(1100, 100), true, 'a point inside the rail (top)');
  assert.equal(labelInsideHud(959, 300), false, 'just left of the rail is clear');
});

// --- rail pure helpers ---

test('hudfix: railRosterLines — alerted guards named with distances, patrols collapse, capped at 5', () => {
  const { world } = applyShot('play');
  // Job 1 play shot: MIRA SEARCH (2t from the player), CAM 1 SPOTTED,
  // CAM 2 SWEEP, 5 PATROL — 4 lines, under the cap.
  assert.deepEqual(railRosterLines(world),
    ['MIRA SEARCH 2t', 'C1 SPOTTED', 'C2 SWEEP', '5 PATROL']);
  const { world: w2 } = applyShot('play2');
  // Job 2 calm shot: DORIN SEARCH 8t, 3 cameras sweeping, 3 PATROL — 5 lines, at the cap.
  assert.deepEqual(railRosterLines(w2),
    ['DORIN SEARCH 8t', 'C1 SWEEP', 'C2 SWEEP', 'C3 SWEEP', '3 PATROL']);
  // 6 simultaneous alerts + 3 cameras overflow the cap: first 4 + a count.
  const crowded = {
    player: { x: 100, y: 100 },
    guards: [1, 2, 3, 4, 5, 6].map((n) => (
      { name: ['CORVIN', 'MIRA', 'OTTO', 'SELMA', 'IVO', 'PETRA'][n - 1], state: 'suspicious', x: 100 + n * 50, y: 300 })),
    cameras: [
      { name: 'CAM 1', state: 'sweep' },
      { name: 'CAM 2', state: 'sweep' },
      { name: 'CAM 3', state: 'sweep' },
    ],
  };
  const lines = railRosterLines(crowded);
  assert.equal(lines.length, 5, 'capped at 5 lines');
  assert.match(lines[4], /^\+5 more$/, 'overflow collapses to a count');
});

test('hudfix: visibilityWord reads the same light the simulation uses', () => {
  const { world } = applyShot('play');
  // The play-shot player (500,230) stands in the dark hall between
  // the stage pool (y40..150) and the foyer pool (y260..340).
  assert.equal(visibilityWord(world), 'IN THE DARK');
  // The same player moved into the stage pool (500,100) is lit.
  const lit = { ...world, player: { ...world.player, x: 500, y: 100 } };
  assert.equal(visibilityWord(lit), 'IN THE LIGHT');
  const { world: w2 } = applyShot('play2');
  // The calm-shot player (360,140) hides in the dark west of curtain A.
  assert.equal(visibilityWord(w2), 'IN THE DARK');
});

test('hudfix: noiseWord — silent at rest, quiet on carpet, loud on wood', () => {
  const { world } = applyShot('play');
  assert.equal(noiseWord(world), 'silent', 'no lastNoise yet');
  const carpet = { ...world, lastNoise: { radius: 40, floor: 'carpet' }, player: { x: 500, y: 450 } };
  assert.equal(noiseWord(carpet), 'quiet on carpet');
  const wood = { ...world, lastNoise: { radius: 140, floor: 'wood' }, player: { x: 500, y: 230 } };
  assert.equal(noiseWord(wood), 'loud on wood');
});

test('hudfix: legendItems — 9 icons, one-word labels, the four LEGEND rules among them', () => {
  const items = legendItems();
  assert.equal(items.length, 9, 'usher/curtain/light/carpet/coin/smoke/camera/laser/exit');
  assert.deepEqual(items.map((i) => i.label),
    ['usher', 'curtain', 'light', 'carpet', 'coin', 'smoke', 'camera', 'laser', 'exit']);
  for (const item of items) {
    assert.equal(item.key, item.icon, 'key matches the icon kind');
    assert.ok(!/\s/.test(item.label), 'one word per label');
  }
});

// --- buildRosterLine (pure, kept) ---

test('hudfix: play-shot roster fits at full detail', () => {
  const { world } = applyShot('play');
  const line = buildRosterLine(guardStates(world.guards), world.player,
    propsSummary(world.props), world.detections, ROSTER_WIDTH, measure);
  assert.match(line, /MIRA SEARCH 2t/, 'full distances kept when they fit');
  assert.ok(measure(line) <= ROSTER_WIDTH, `roster fits (${measure(line)}px <= ${ROSTER_WIDTH})`);
});

test('hudfix: roster degrades one level at a time as the width narrows', () => {
  const { world } = applyShot('play');
  const states = [
    { name: 'CORVIN', state: 'chase', x: 420, y: 300 },
    { name: 'MIRA', state: 'search', x: 560, y: 210 },
    { name: 'OTTO', state: 'chase', x: 500, y: 520 },
    { name: 'SELMA', state: 'suspicious', x: 700, y: 200 },
    { name: 'IVO', state: 'patrol', x: 800, y: 380 },
    { name: 'PETRA', state: 'patrol', x: 600, y: 60 },
  ];
  const player = { x: 500, y: 230 };
  const summary = propsSummary(world.props);
  const spotted = 'SPOTTED ×0';
  const full = propsChecklistLine(summary);
  const short = `Props ${summary.taken}/${summary.total}`;
  const lineFor = (roster, checklist) => `${roster}   |   ${checklist}   |   ${spotted}`;
  const l0 = lineFor(guardStatesShort(states, player), full);
  const l1 = lineFor(guardStatesShort(states, player, 3), full);
  const l2 = lineFor(guardStatesShort(states), full);
  const l3 = lineFor(guardStatesShort(states), short);
  assert.equal(buildRosterLine(states, player, summary, 0, 10000, measure), l0,
    'wide: full distances');
  assert.equal(buildRosterLine(states, player, summary, 0, measure(l1), measure), l1,
    'narrower: 3 nearest distances');
  assert.equal(buildRosterLine(states, player, summary, 0, measure(l2), measure), l2,
    'narrower still: no distances');
  assert.equal(buildRosterLine(states, player, summary, 0, measure(l3), measure), l3,
    'narrower still: short checklist');
  assert.equal(buildRosterLine(states, player, summary, 0, 0, measure),
    '4 ALERT · 2 PATROL   |   Props 0/3   |   SPOTTED ×0',
    'zero width: alert-count compression');
});

test('hudfix: 6 simultaneous alerts compress to a count and still fit', () => {
  const { world } = applyShot('play');
  // 'suspicious' is the longest state name: six of them (93 chars
  // of roster) overflow even the short-checklist level, so the
  // alert-count level must fire.
  const states = [1, 2, 3, 4, 5, 6].map((n) => (
    { name: ['CORVIN', 'MIRA', 'OTTO', 'SELMA', 'IVO', 'PETRA'][n - 1], state: 'suspicious', x: 100 + n * 50, y: 300 }));
  const line = buildRosterLine(states, world.player,
    propsSummary(world.props), world.detections, ROSTER_WIDTH, measure);
  assert.match(line, /6 ALERT/, 'all six collapse to a count');
  assert.doesNotMatch(line, /CORVIN SUSPICIOUS/, 'no per-guard names at the compressed level');
  assert.ok(measure(line) <= ROSTER_WIDTH, `compressed roster fits (${measure(line)}px)`);
});

test('hudfix: legend + camera roster fits the width budget', () => {
  const { world } = applyShot('play');
  const camRoster = `   |   ${cameraStatesShort(cameraStates(world.cameras))}`;
  const line = `LIGHT=danger · DARK=safe · CARPET=silent${camRoster}`;
  assert.ok(measure(line) <= ROSTER_WIDTH, `legend fits (${measure(line)}px <= ${ROSTER_WIDTH})`);
});

// --- mock canvas: records every draw call, font-aware measure ---

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
    // M14: the label-box check reads the bounding boxes, so the mock
    // reports them like a real canvas (ascent = size, descent = 25%).
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
  drawImage() { this._rec('drawImage', []); }
}

function textsOf(ctx) {
  return ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
}

// Every text whose baseline falls inside a HUD panel that was
// actually DRAWN in this frame (the rail slab + the minimap panel)
// must sit >=10px from that panel's top/bottom edge and fully inside
// its left/right edges — the exact overflow the user reported ("teks
// meluber dari kotak bar"). Panels not drawn impose no constraint.
function assertNoTextOverflowsPanel(ctx) {
  const allPanels = [railRect(), minimapRect()];
  const drawn = new Set(ctx.calls.filter((c) => c[0] === 'fillRect')
    .map((c) => `${c[1]},${c[2]},${c[3]},${c[4]}`));
  const panels = allPanels.filter((p) => drawn.has(`${p.x},${p.y},${p.w},${p.h}`));
  for (const c of ctx.calls.filter((x) => x[0] === 'fillText')) {
    const [, text, x, y, align, font] = c;
    const size = parseInt((/(\d+)px/.exec(font || '') || [0, 12])[1], 10);
    const w = String(text).length * size * 0.6;
    let left; let right;
    if (align === 'center') { left = x - w / 2; right = x + w / 2; }
    else if (align === 'right') { left = x - w; right = x; }
    else { left = x; right = x + w; }
    for (const p of panels) {
      const insideY = y > p.y && y < p.y + p.h;
      const overlapsX = right > p.x && left < p.x + p.w;
      if (insideY && overlapsX) {
        assert.ok(y - p.y >= 10, `"${text}" baseline ${y} <10px from panel top ${p.y}`);
        assert.ok(p.y + p.h - y >= 10, `"${text}" baseline ${y} <10px from panel bottom ${p.y + p.h}`);
        assert.ok(left >= p.x + 4, `"${text}" left ${left} past panel left ${p.x}`);
        assert.ok(right <= p.x + p.w - 4, `"${text}" right ${right} past panel right ${p.x + p.w}`);
      }
    }
  }
}

test('render hudfix: play frame — rail rows at the new baselines, labels read, no text overflows a panel', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('play');
  render(ctx, world, screen, 0, false);
  const texts = textsOf(ctx);
  const rows = ctx.calls.filter((c) => c[0] === 'fillText');
  const atY = (y) => rows.filter((c) => c[3] === y).map((c) => c[1]);

  // The rail slab is drawn; the header + bottom bar are gone.
  const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
  assert.ok(rects.some((c) => c[1] === 960 && c[2] === 0 && c[3] === 240 && c[4] === 600),
    'rail slab (960,0,240,600) drawn');
  assert.ok(!rects.some((c) => c[1] === 8 && c[2] === 8 && c[3] === 836 && c[4] === 56),
    'header panel NOT drawn');
  assert.ok(!rects.some((c) => c[1] === 8 && c[2] === 536 && c[3] === 744 && c[4] === 56),
    'bottom bar NOT drawn');
  // Rail rows at the railLayout baselines.
  assert.ok(atY(26).includes('CURTAIN CALL'), 'title on rail row 1 (baseline 26)');
  assert.ok(atY(64).some((t) => t.startsWith('SCORE 700')), 'score on rail row 3 (baseline 64)');
  assert.ok(atY(92).includes('OBJECTIVE'), 'objective header (92)');
  assert.ok(atY(178).includes('VISIBILITY'), 'visibility row (178)');
  assert.ok(atY(196).includes('NOISE'), 'noise row (196)');
  assert.ok(atY(232).some((t) => t.startsWith('LOOT · Props 0/3')), 'loot header (232)');
  assert.ok(atY(296).includes('GUARDS'), 'guards header (296)');
  assert.ok(atY(312).some((t) => t.includes('MIRA SEARCH 2t')), 'roster line 1 (312)');
  assert.ok(atY(384).some((t) => t.includes('EXIT: OPEN · GHOST')), 'goal row (384)');
  assert.ok(atY(404).includes('LEGEND'), 'legend header (404)');
  assert.ok(atY(468).some((t) => t.startsWith('WASD move')), 'controls row 1 (468)');
  // Meter rows: the suspicion bar sits at y144..154, the noise bar at y204..214.
  assert.ok(rects.some((c) => c[2] === 144 && c[4] === 10), 'suspicion bar at y144');
  assert.ok(rects.some((c) => c[2] === 204 && c[4] === 10), 'noise bar at y204');
  // Labels: no header/minimap hides anyone now — all 6 ushers +
  // CAM 1 read. CAM 2's label is STILL skipped: LASER 1 (y=290)
  // crosses its text box (the M14 CAM 2 defect, unchanged) — the
  // rail roster ('C2 SWEEP') still names the camera.
  for (const name of ['CORVIN', 'MIRA', 'OTTO', 'SELMA', 'IVO', 'PETRA']) {
    assert.ok(texts.some((t) => t.startsWith(name)), `${name} label shown`);
  }
  assert.ok(texts.includes('CAM 1'), 'CAM 1 label shown');
  assert.ok(!texts.includes('CAM 2'), 'CAM 2 label skipped — LASER 1 crosses its text');
  assert.ok(!texts.includes('STAR TIARA'), 'Tiara label removed from the playfield');
  assert.ok(!texts.includes('GOLDEN MASK'), 'Mask label removed from the playfield');
  assert.ok(!texts.includes("LEAD'S VIOLIN"), 'Violin label removed from the playfield');
  assert.ok(!texts.includes('FOYER'), 'FOYER room label removed from the playfield');
  assert.ok(!texts.includes('AUDITORIUM'), 'AUDITORIUM room label removed from the playfield');
  assert.ok(!texts.includes('BACKSTAGE'), 'BACKSTAGE room label removed from the playfield');
  // The generic overflow rule over every text in the frame.
  assertNoTextOverflowsPanel(ctx);
});

test('render hudfix: alarm frame — ALARM stage pill + roster, no text overflows a panel', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('chase');
  render(ctx, world, screen, 0, false);
  const texts = textsOf(ctx);
  assert.ok(texts.includes('ALARM'), 'alarm stage pill drawn');
  assert.ok(texts.some((t) => t.includes('CORVIN CHASE 2t')), 'chase roster line in the rail');
  assert.ok(texts.some((t) => t.startsWith('PETRA')), 'PETRA label shown in alarm too');
  assertNoTextOverflowsPanel(ctx);
});

test('render hudfix: select + win frames — rail drawn, no text overflows a panel', () => {
  // M15: the rail is drawn on every screen now, including select +
  // win — the select frame shows CAMPAIGN BEST in the rail, the win
  // frame shows the live score there.
  for (const shot of ['select', 'end']) {
    const ctx = new MockCtx();
    const { world, screen } = applyShot(shot);
    render(ctx, world, screen, 0, false);
    const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
    assert.ok(rects.some((c) => c[1] === 960 && c[2] === 0 && c[3] === 240 && c[4] === 600),
      `rail slab drawn on the ${shot} frame`);
    assertNoTextOverflowsPanel(ctx);
  }
});

test('render hudfix: minimap panel is opaque, rail slab keeps its dark fill', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('play');
  render(ctx, world, screen, 0, false);
  const rect = minimapRect();
  const fills = ctx.calls.filter((c) => c[0] === 'fillRect'
    && c[1] === rect.x && c[2] === rect.y && c[3] === rect.w && c[4] === rect.h)
    .map((c) => c[5]);
  assert.ok(fills.includes('rgba(12, 9, 7, 1)'), 'minimap panel filled opaque');
  const railFills = ctx.calls.filter((c) => c[0] === 'fillRect'
    && c[1] === 960 && c[2] === 0 && c[3] === 240 && c[4] === 600)
    .map((c) => c[5]);
  assert.ok(railFills.includes('rgba(13, 10, 8, 0.97)'), 'rail slab keeps its dark fill');
});
