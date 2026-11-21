// M11 tests: visual polish helpers (pure) + render output via a
// recording mock canvas (node has no canvas — the mock records every
// draw call, so "panel drawn / gradient used" is asserted, not
// assumed). Screenshots (CDP) are the visual proof on top of this.
import test from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { buildLevel } from '../game/src/level.js';
import { createWorld } from '../game/src/world.js';
import { applyShot } from '../game/src/shots.js';
import { render, roomLabels } from '../game/src/render.js';
import { segmentCount, hudPanelRects } from '../game/src/hud.js';

// --- segmentCount (pure) ---

test('hud M11: segmentCount maps 0..1 to 0..total', () => {
  assert.equal(segmentCount(0, 5), 0);
  assert.equal(segmentCount(0.1, 5), 1);
  assert.equal(segmentCount(0.5, 5), 3);
  assert.equal(segmentCount(0.9, 5), 5);
  assert.equal(segmentCount(1, 5), 5);
});

test('hud M11: segmentCount clamps outside 0..1', () => {
  assert.equal(segmentCount(-0.5, 5), 0);
  assert.equal(segmentCount(1.5, 5), 5);
  assert.equal(segmentCount(40 / 140, 5), 1); // carpet noise -> 1 seg
  assert.equal(segmentCount(140 / 140, 5), 5); // wood noise -> 5 segs
});

// --- roomLabels (pure, derived from level geometry) ---

test('render M11: roomLabels returns one label per wing, in-wing', () => {
  const labels = roomLabels(buildLevel());
  assert.deepEqual(labels.map((l) => l.text), ['FOYER', 'AUDITORIUM', 'BACKSTAGE']);
  const [foyer, aud, back] = labels;
  assert.ok(foyer.x < 380, 'FOYER west of curtain A');
  assert.ok(aud.x >= 380 && aud.x < 720, 'AUDITORIUM between curtain A and crate');
  assert.ok(back.x >= 720, 'BACKSTAGE east of the crate');
  // Regression: the first screenshot pass caught FOYER at y=72 hidden
  // under the HUD header panel (y8..92) during play.
  assert.ok(foyer.y > 92, 'FOYER below the HUD header panel');
  for (const l of labels) {
    assert.ok(l.x > 0 && l.x < CONFIG.VIEW_WIDTH, 'label inside canvas x');
    assert.ok(l.y > 0 && l.y < CONFIG.VIEW_HEIGHT, 'label inside canvas y');
  }
});

// --- hudPanelRects (pure layout) ---

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('hud M11: panels fit the canvas, clear the EXIT, do not overlap', () => {
  const panels = hudPanelRects();
  const exit = { x: 860, y: 40, w: 60, h: 60 };
  for (const p of Object.values(panels)) {
    assert.ok(p.x >= 0 && p.y >= 0, 'panel inside canvas (top-left)');
    assert.ok(p.x + p.w <= CONFIG.VIEW_WIDTH, 'panel inside canvas (right)');
    assert.ok(p.y + p.h <= CONFIG.VIEW_HEIGHT, 'panel inside canvas (bottom)');
    assert.ok(!overlaps(p, exit), 'panel clears the EXIT box');
  }
  assert.ok(!overlaps(panels.header, panels.noise), 'panels do not overlap each other');
});

// --- mock canvas: records every draw call ---

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
  fillRect(x, y, w, h) { this._rec('fillRect', [x, y, w, h]); }
  strokeRect(x, y, w, h) { this._rec('strokeRect', [x, y, w, h]); }
  beginPath() { this._rec('beginPath', []); }
  moveTo(x, y) { this._rec('moveTo', [x, y]); }
  lineTo(x, y) { this._rec('lineTo', [x, y]); }
  arc(x, y, r, a0, a1) { this._rec('arc', [x, y, r, a0, a1]); }
  closePath() { this._rec('closePath', []); }
  fill() { this._rec('fill', []); }
  stroke() { this._rec('stroke', []); }
  setLineDash(d) { this._rec('setLineDash', [d]); }
  fillText(text, x, y) { this._rec('fillText', [text, x, y]); }
  measureText(text) { return { width: String(text).length * 7 }; }
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

function textsOf(ctx, name = 'fillText') {
  return ctx.calls.filter((c) => c[0] === name).map((c) => c[1]);
}

test('render M11: play frame draws panels, gradients, room labels', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('play');
  render(ctx, world, screen, 0, false);

  // Framed HUD: panel A rect drawn (fill, not just the old flat strip).
  const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
  assert.ok(rects.some((c) => c[1] === 8 && c[2] === 8 && c[3] === 836 && c[4] === 84),
    'header panel rect (8,8,836,84) drawn');
  assert.ok(rects.some((c) => c[1] === 560 && c[2] === 104 && c[3] === 392 && c[4] === 22),
    'noise panel rect (560,104,392,22) drawn');
  // Panel borders stroked.
  assert.ok(ctx.calls.some((c) => c[0] === 'strokeRect'), 'panel border stroked');

  // Gradients used: 3 light pools + 6 cones + exit glow + vignette.
  const grads = ctx.calls.filter((c) => c[0] === 'createRadialGradient').length;
  assert.ok(grads >= 11, `radial gradients used (${grads}, want >= 11)`);

  // Room labels drawn on the floor (node fallback draws the floor
  // directly, so the labels are fillText calls here; in the browser
  // they are baked into the cached floor layer).
  const texts = textsOf(ctx);
  for (const room of ['FOYER', 'AUDITORIUM', 'BACKSTAGE']) {
    assert.ok(texts.includes(room), `room label ${room} drawn`);
  }
  assert.ok(texts.includes('CURTAIN CALL'), 'HUD title drawn');
});

test('render M11: start frame draws the overlay panel', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('start');
  render(ctx, world, screen, 0, false);
  const texts = textsOf(ctx);
  assert.ok(texts.includes('CURTAIN CALL'), 'start title drawn');
  assert.ok(texts.some((t) => t.includes('Steal back 3 props')), 'start line drawn');
  // Overlay panel: a 660-wide rect centred (x=150) behind the text.
  const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
  assert.ok(rects.some((c) => c[1] === 150 && c[3] === 660),
    'overlay panel (x=150, w=660) drawn');
});
