// M11 tests: visual polish helpers (pure) + render output via a
// recording mock canvas (node has no canvas — the mock records every
// draw call, so "panel drawn / gradient used" is asserted, not
// assumed). Screenshots (CDP) are the visual proof on top of this.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyShot } from '../game/src/shots.js';
import { render } from '../game/src/render.js';
import { segmentCount } from '../game/src/hud.js';

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

// M15: roomLabels() is GONE from render.js — the room labels were
// removed from the playfield (declutter); the floor zones + the rail
// legend carry the reading now. The not-drawn assertion lives in
// tests/m15.test.js ('m15: room labels are not drawn on the play
// frame'). The Job 2 hand-placed room labels are level DATA
// (level.js), still covered by tests/m14.test.js.

// M15: hudPanelRects() is GONE — the header + bottom bar were
// deleted, and the rail is the only HUD panel (railRect, covered by
// tests/hudfix.test.js). No replacement test belongs here.

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

test('render M11: play frame draws the rail, gradients, no room labels', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('play');
  render(ctx, world, screen, 0, false);

  // Framed HUD: the rail slab (960,0,240,600) drawn; the header +
  // bottom bar are gone (M15).
  const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
  assert.ok(rects.some((c) => c[1] === 960 && c[2] === 0 && c[3] === 240 && c[4] === 600),
    'rail slab (960,0,240,600) drawn');
  assert.ok(!rects.some((c) => c[1] === 8 && c[2] === 8 && c[3] === 836 && c[4] === 56),
    'header panel NOT drawn');
  assert.ok(!rects.some((c) => c[1] === 8 && c[2] === 536 && c[3] === 744 && c[4] === 56),
    'bottom panel NOT drawn');
  // Panel borders stroked.
  assert.ok(ctx.calls.some((c) => c[0] === 'strokeRect'), 'panel border stroked');

  // Gradients used: 3 light pools + 6 cones + exit glow + vignette
  // (+ 2 sconce glows from the M15 edge dressing).
  const grads = ctx.calls.filter((c) => c[0] === 'createRadialGradient').length;
  assert.ok(grads >= 11, `radial gradients used (${grads}, want >= 11)`);

  // Room labels are NOT drawn on the floor anymore (M15 declutter);
  // the rail title is still drawn.
  const texts = textsOf(ctx);
  for (const room of ['FOYER', 'AUDITORIUM', 'BACKSTAGE']) {
    assert.ok(!texts.includes(room), `room label ${room} NOT drawn`);
  }
  assert.ok(texts.includes('CURTAIN CALL'), 'HUD title drawn');
});

// M14: the start-frame test lived here ('render M11: start frame draws
// the overlay panel') — the old start screen is gone, replaced by the
// job-select screen. Its replacement is in tests/m14.test.js
// ('m14 render: select frame draws the job cards + howto panel'), which
// also covers the win overlay panel (x=150, w=660) via the end2 shot.
