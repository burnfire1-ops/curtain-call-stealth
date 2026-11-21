// HUD-fix tests: the header is 2 rows in 56px, legend/roster/SOUND
// live in the bottom bar, labels inside HUD panels are skipped, and
// the minimap panel is opaque. Pure layout helpers + render output
// via a recording mock canvas (node has no canvas — the mock records
// every draw call, so "text inside its panel" is asserted, not
// assumed). Screenshots (CDP) are the visual proof on top of this.
import test from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { applyShot } from '../game/src/shots.js';
import { render } from '../game/src/render.js';
import {
  hudPanelRects, hudLayout, labelInsideHud, minimapRect,
  buildRosterLine, guardStates, guardStatesShort, propsSummary,
  propsChecklistLine, cameraStates, cameraStatesShort,
} from '../game/src/hud.js';

// Canvas monospace advance is 0.6em per char (12px -> 7.2px/char).
const measure = (text) => String(text).length * 7.2;
const BOTTOM_INNER = 744 - 32; // bottom bar width minus 16px insets

// --- hudLayout (pure) ---

test('hudfix: header holds exactly 2 text rows, every baseline >=10px from its panel edge', () => {
  const { panels, headerRows } = hudLayout();
  const rows = Object.values(headerRows);
  assert.equal(rows.length, 2, 'header is 2 rows, not 4');
  for (const y of rows) {
    assert.ok(y - panels.header.y >= 10, `row baseline ${y} >=10px below panel top`);
    assert.ok(panels.header.y + panels.header.h - y >= 10,
      `row baseline ${y} >=10px above panel bottom`);
  }
  assert.equal(panels.header.h, 56, 'header is 56px tall');
});

test('hudfix: bottom bar holds 3 text rows, every baseline >=10px from its panel edge', () => {
  const { panels, bottomRows } = hudLayout();
  const rows = Object.values(bottomRows);
  assert.equal(rows.length, 3, 'legend / roster / noise, one row each');
  for (const y of rows) {
    assert.ok(y - panels.bottom.y >= 10, `row baseline ${y} >=10px below panel top`);
    assert.ok(panels.bottom.y + panels.bottom.h - y >= 10,
      `row baseline ${y} >=10px above panel bottom`);
  }
});

test('hudfix: panels fit the canvas, clear the EXIT, do not overlap, and the bottom bar clears the lowest patrol', () => {
  const panels = hudPanelRects();
  const exit = { x: 860, y: 40, w: 60, h: 60 };
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x
    && a.y < b.y + b.h && a.y + a.h > b.y;
  for (const p of Object.values(panels)) {
    assert.ok(p.x >= 0 && p.y >= 0, 'panel inside canvas (top-left)');
    assert.ok(p.x + p.w <= CONFIG.VIEW_WIDTH, 'panel inside canvas (right)');
    assert.ok(p.y + p.h <= CONFIG.VIEW_HEIGHT, 'panel inside canvas (bottom)');
    assert.ok(!overlap(p, exit), 'panel clears the EXIT box');
  }
  assert.ok(!overlap(panels.header, panels.bottom), 'header and bottom bar do not overlap');
  assert.ok(!overlap(panels.bottom, minimapRect()), 'bottom bar and minimap do not overlap');
  // USHER 3 patrols y520 (body bottom 520+14=534); the player spawns
  // at (80,520) (body bottom 520+12=532). The bar must start below
  // both, or a body would sink under it every patrol.
  assert.ok(panels.bottom.y > 520 + CONFIG.GUARD_R, 'bottom bar below the lowest guard body');
  assert.ok(panels.bottom.y > 520 + CONFIG.PLAYER_R, 'bottom bar below the spawn body');
});

// --- labelInsideHud (pure) ---

test('hudfix: labelInsideHud hides anchors inside a panel, shows the rest', () => {
  assert.equal(labelInsideHud(700, 40), true, 'USHER 6 label anchor under the header');
  assert.equal(labelInsideHud(520, 60), true, 'CAM 1 mount under the header');
  assert.equal(labelInsideHud(520, 100), false, 'USHER 2 label anchor is clear now');
  assert.equal(labelInsideHud(400, 560), true, 'a point inside the bottom bar');
  assert.equal(labelInsideHud(880, 522), true, 'Violin label anchor under the minimap');
  assert.equal(labelInsideHud(900, 300), false, 'CAM 2 mount is clear');
  assert.equal(labelInsideHud(100, 300), false, 'open floor is clear');
});

// --- buildRosterLine (pure) ---

test('hudfix: play-shot roster fits the bottom bar at full detail', () => {
  const { world } = applyShot('play');
  const line = buildRosterLine(guardStates(world.guards), world.player,
    propsSummary(world.props), world.detections, BOTTOM_INNER, measure);
  assert.match(line, /U2 SEARCH 2t/, 'full distances kept when they fit');
  assert.ok(measure(line) <= BOTTOM_INNER, `roster fits (${measure(line)}px <= ${BOTTOM_INNER})`);
});

test('hudfix: roster degrades one level at a time as the bar narrows', () => {
  const { world } = applyShot('play');
  const states = [
    { name: 'USHER 1', state: 'chase', x: 420, y: 300 },
    { name: 'USHER 2', state: 'search', x: 560, y: 210 },
    { name: 'USHER 3', state: 'chase', x: 500, y: 520 },
    { name: 'USHER 4', state: 'suspicious', x: 700, y: 200 },
    { name: 'USHER 5', state: 'patrol', x: 800, y: 380 },
    { name: 'USHER 6', state: 'patrol', x: 600, y: 60 },
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
    'wide bar: full distances');
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
    { name: `USHER ${n}`, state: 'suspicious', x: 100 + n * 50, y: 300 }));
  const line = buildRosterLine(states, world.player,
    propsSummary(world.props), world.detections, BOTTOM_INNER, measure);
  assert.match(line, /6 ALERT/, 'all six collapse to a count');
  assert.doesNotMatch(line, /U1 SUSPICIOUS/, 'no per-guard names at the compressed level');
  assert.ok(measure(line) <= BOTTOM_INNER, `compressed roster fits (${measure(line)}px)`);
});

test('hudfix: legend + camera roster fits the bottom bar', () => {
  const { world } = applyShot('play');
  const camRoster = `   |   ${cameraStatesShort(cameraStates(world.cameras))}`;
  const line = `LIGHT=danger · DARK=safe · CARPET=silent${camRoster}`;
  assert.ok(measure(line) <= BOTTOM_INNER, `legend fits (${measure(line)}px <= ${BOTTOM_INNER})`);
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
// actually DRAWN in this frame (header, bottom bar, minimap) must
// sit >=10px from that panel's top/bottom edge and fully inside its
// left/right edges — the exact overflow the user reported ("teks
// meluber dari kotak bar"). Panels not drawn (start/win screens
// draw no HUD) impose no constraint: the start overlay's controls
// line sits at y552, inside the bottom bar's y-band, but the bar
// itself is not on screen there.
function assertNoTextOverflowsPanel(ctx) {
  const allPanels = [...Object.values(hudPanelRects()), minimapRect()];
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

test('render hudfix: play frame — HUD rows at the new baselines, labels skipped/shown correctly, no text overflows a panel', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('play');
  render(ctx, world, screen, 0, false);
  const texts = textsOf(ctx);
  const rows = ctx.calls.filter((c) => c[0] === 'fillText');
  const atY = (y) => rows.filter((c) => c[3] === y).map((c) => c[1]);

  assert.ok(texts.includes('CURTAIN CALL'), 'title drawn');
  assert.ok(atY(28).includes('CURTAIN CALL'), 'title on header row 1 (baseline 28)');
  assert.ok(atY(552).some((t) => t.startsWith('LIGHT=danger')), 'legend on bottom row 1 (552)');
  assert.ok(atY(567).some((t) => t.includes('U2 SEARCH 2t')), 'roster on bottom row 2 (567)');
  assert.ok(atY(582).some((t) => t.startsWith('SOUND:')), 'SOUND on bottom row 3 (582)');
  // Meter row: the segmented bar sits at y44..54 (baseline 53 row).
  const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
  assert.ok(rects.some((c) => c[2] === 44 && c[4] === 10), 'suspicion bar at y44');
  assert.ok(rects.some((c) => c[2] === 572 && c[4] === 10), 'noise bar at y572');
  // Labels: USHER 6 (under the header) + CAM 1 (under the header) +
  // the Violin label (under the minimap) are skipped; the rest read.
  // M14: CAM 2's label is skipped too — LASER 1 crosses its text
  // (user rule 06:22 WIB: a label whose TEXT BOX touches a laser is
  // skipped, even though its anchor is clear). The legend roster
  // ('CAM 1 SPOTTED · CAM 2 SWEEP') still names the camera.
  assert.ok(!texts.some((t) => t.startsWith('USHER 6')), 'USHER 6 label skipped');
  assert.ok(!texts.includes('CAM 1'), 'CAM 1 label skipped');
  assert.ok(!texts.includes('CAM 2'), 'CAM 2 label skipped — the laser crosses its text');
  assert.ok(!texts.includes("LEAD'S VIOLIN"), 'Violin label skipped under the minimap');
  assert.ok(texts.some((t) => t.startsWith('USHER 2')), 'USHER 2 label shown');
  assert.ok(texts.includes('STAR TIARA'), 'Tiara label shown');
  assert.ok(texts.includes('GOLDEN MASK'), 'Mask label shown');
  // The generic overflow rule over every text in the frame.
  assertNoTextOverflowsPanel(ctx);
});

test('render hudfix: alarm frame — ALARM! pill + roster, no text overflows a panel', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('chase');
  render(ctx, world, screen, 0, false);
  const texts = textsOf(ctx);
  assert.ok(texts.includes('ALARM!'), 'alarm pill drawn');
  assert.ok(texts.some((t) => t.includes('U1 CHASE 2t')), 'chase roster on the bottom bar');
  assert.ok(!texts.some((t) => t.startsWith('USHER 6')), 'USHER 6 label skipped in alarm too');
  assertNoTextOverflowsPanel(ctx);
});

test('render hudfix: select + win frames — no text overflows a panel', () => {
  // M14: the old start screen is gone — the opener is the select
  // screen now, so this test renders 'select' instead of 'start'.
  for (const shot of ['select', 'end']) {
    const ctx = new MockCtx();
    const { world, screen } = applyShot(shot);
    render(ctx, world, screen, 0, false);
    assertNoTextOverflowsPanel(ctx);
  }
});

test('render hudfix: minimap panel is opaque, header/bottom panels keep the translucent fill', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('play');
  render(ctx, world, screen, 0, false);
  const rect = minimapRect();
  const fills = ctx.calls.filter((c) => c[0] === 'fillRect'
    && c[1] === rect.x && c[2] === rect.y && c[3] === rect.w && c[4] === rect.h)
    .map((c) => c[5]);
  assert.ok(fills.includes('rgba(12, 9, 7, 1)'), 'minimap panel filled opaque');
  const header = hudPanelRects().header;
  const headerFills = ctx.calls.filter((c) => c[0] === 'fillRect'
    && c[1] === header.x && c[2] === header.y && c[3] === header.w && c[4] === header.h)
    .map((c) => c[5]);
  assert.ok(headerFills.includes('rgba(12, 9, 7, 0.82)'), 'header keeps the translucent fill');
});
