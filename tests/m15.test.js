// M15 tests — the right rail + declutter + material floor + dramatic
// light + edge dressing (render-only). Pure layout helpers + render
// output via a recording mock canvas (node has no canvas — the mock
// records every draw call, so "drawn / not drawn" is asserted, not
// assumed). Screenshots (CDP) are the visual proof on top of this.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import CONFIG from '../game/src/config.js';
import { buildLevel, buildLevel2 } from '../game/src/level.js';
import { segmentBlocked } from '../game/src/vision.js';
import { applyShot } from '../game/src/shots.js';
import { render, edgeDressing } from '../game/src/render.js';
import {
  railRect, railLayout, minimapRect, labelOccluders, textBox,
  rectsOverlap, labelOccluded,
} from '../game/src/hud.js';

// --- canvas size ---

test('m15: canvas is 1200x600 — playfield 960 + rail 240, world grid unchanged', () => {
  assert.equal(CONFIG.CANVAS_W, 1200, 'canvas width 1200');
  assert.equal(CONFIG.CANVAS_H, 600, 'canvas height 600');
  assert.equal(CONFIG.RAIL_W, 240, 'rail width 240');
  assert.equal(CONFIG.RAIL_X, 960, 'rail starts at the playfield edge');
  assert.equal(CONFIG.VIEW_WIDTH, 960, 'the world grid is still 960 wide');
  assert.equal(CONFIG.VIEW_HEIGHT, 600, 'the world grid is still 600 tall');
  assert.deepEqual(railRect(), { x: 960, y: 0, w: 240, h: 600 });
});

// --- mock canvas: records every draw call, font-aware measure, alpha ---

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
    this._alpha = 1;
  }
  get globalAlpha() { return this._alpha; }
  set globalAlpha(v) { this._alpha = v; this.calls.push(['globalAlpha', v]); }
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
  fill() { this._rec('fill', [this.fillStyle]); }
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
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const g = new MockGradient();
    this._rec('createRadialGradient', [x0, y0, r0, x1, y1, r1, g]);
    return g;
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

// The alpha in force at each fillText, in call order — the PATROL
// dim test reads the alpha that was set just before each label.
function alphaAtTexts(ctx) {
  const out = [];
  let alpha = 1;
  for (const c of ctx.calls) {
    if (c[0] === 'globalAlpha') alpha = c[1];
    else if (c[0] === 'fillText') out.push([c[1], alpha]);
  }
  return out;
}

// --- the rail is the only HUD ---

test('m15: all HUD text lives in the rail — no HUD text over the playfield', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('play');
  render(ctx, world, screen, 0, false);
  const railStrings = [
    'CURTAIN CALL', 'JOB 1 ·', 'SCORE ', 'OBJECTIVE', 'Steal back',
    'Reach the EXIT', 'VISIBILITY', 'NOISE', 'LOOT', 'GUARDS', 'LEGEND',
    'WASD', 'IN THE LIGHT', 'IN THE DARK', 'silent', 'quiet on carpet',
    'loud on wood', 'Props ', 'EXIT: OPEN',
  ];
  for (const c of ctx.calls.filter((x) => x[0] === 'fillText')) {
    const [, text, x] = c;
    if (x < CONFIG.VIEW_WIDTH) {
      assert.ok(!railStrings.some((s) => text.includes(s)),
        `"${text}" at x=${x} is HUD text over the playfield`);
    }
  }
  // …and the rail strings ARE drawn, inside the rail.
  const railTexts = ctx.calls.filter((c) => c[0] === 'fillText' && c[2] >= 960)
    .map((c) => c[1]);
  for (const s of ['CURTAIN CALL', 'OBJECTIVE', 'VISIBILITY', 'GUARDS', 'LEGEND']) {
    assert.ok(railTexts.some((t) => t.includes(s)), `"${s}" drawn in the rail`);
  }
});

test('m15: header + bottom bar are not drawn on any screen', () => {
  for (const shot of ['select', 'play', 'play2', 'end2', 'chase2']) {
    const ctx = new MockCtx();
    const { world, screen, campaign } = applyShot(shot);
    render(ctx, world, screen, 0, false, campaign);
    const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
    assert.ok(!rects.some((c) => c[1] === 8 && c[2] === 8 && c[3] === 836 && c[4] === 56),
      `header NOT drawn on the ${shot} frame`);
    assert.ok(!rects.some((c) => c[1] === 8 && c[2] === 536 && c[3] === 744 && c[4] === 56),
      `bottom bar NOT drawn on the ${shot} frame`);
    assert.ok(rects.some((c) => c[1] === 960 && c[2] === 0 && c[3] === 240 && c[4] === 600),
      `rail slab drawn on the ${shot} frame`);
  }
});

test('m15: minimap sits inside the rail bottom', () => {
  const mm = minimapRect();
  const rail = railRect();
  assert.ok(mm.x >= rail.x && mm.x + mm.w <= rail.x + rail.w, 'minimap inside the rail (x)');
  assert.ok(mm.y >= rail.y && mm.y + mm.h <= rail.y + rail.h, 'minimap inside the rail (y)');
  assert.equal(mm.w / mm.h, 1.6, 'minimap keeps the 960:600 aspect');
  assert.equal(railLayout().minimap.y + railLayout().minimap.h, 590,
    'minimap bottom 10px above the rail bottom');
});

// --- declutter ---

test('m15: room labels are not drawn on the play frame', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('play');
  render(ctx, world, screen, 0, false);
  const texts = textsOf(ctx);
  for (const room of ['FOYER', 'AUDITORIUM', 'BACKSTAGE']) {
    assert.ok(!texts.includes(room), `${room} NOT drawn`);
  }
  const ctx2 = new MockCtx();
  const p2 = applyShot('play2');
  render(ctx2, p2.world, p2.screen, 0, false, p2.campaign);
  for (const room of ['GALLERY', 'WEST WING']) {
    assert.ok(!textsOf(ctx2).includes(room), `${room} NOT drawn`);
  }
});

test('m15: prop name labels are not drawn — the gold diamond marks the prop', () => {
  const ctx = new MockCtx();
  const { world, screen, campaign } = applyShot('play2');
  render(ctx, world, screen, 0, false, campaign);
  const texts = textsOf(ctx);
  for (const name of ['THE GILDED SCRIPT', 'THE SILVER BATON', 'THE VELVET ROSE']) {
    assert.ok(!texts.includes(name), `${name} NOT drawn`);
  }
  // The diamonds ARE drawn: a fill with the prop gold (#ffd94d) for
  // each untaken prop (3 in the calm shot).
  const goldFills = ctx.calls.filter((c) => c[0] === 'fill' && c[1] === '#ffd94d');
  assert.ok(goldFills.length >= 3, `gold diamonds drawn (${goldFills.length}, want >= 3)`);
});

test('m15: PATROL usher labels are dim, alert usher labels are full strength', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('play');
  render(ctx, world, screen, 0, false);
  const alphas = alphaAtTexts(ctx);
  const at = (text) => alphas.filter(([t]) => t === text).map(([, a]) => a);
  assert.deepEqual(at('CORVIN · PATROL'), [0.45], 'PATROL label dim');
  assert.deepEqual(at('OTTO · PATROL'), [0.45], 'PATROL label dim');
  assert.deepEqual(at('PETRA · PATROL'), [0.45], 'PATROL label dim');
  assert.deepEqual(at('MIRA · SEARCH'), [1], 'SEARCH label full strength');
});

test('m15: "?" marks a SUSPICIOUS guard, "!" only a chase', () => {
  const ctx = new MockCtx();
  const { world, screen } = applyShot('foyer');
  render(ctx, world, screen, 0, false);
  const texts = textsOf(ctx);
  assert.ok(texts.includes('?'), '"?" drawn above the suspicious guard');
  assert.ok(!texts.includes('!'), 'no "!" while nobody chases');
  const ctx2 = new MockCtx();
  const p2 = applyShot('play2');
  render(ctx2, p2.world, p2.screen, 0, false, p2.campaign);
  assert.ok(!textsOf(ctx2).includes('?'), 'no "?" while nobody is suspicious');
  const ctx3 = new MockCtx();
  const c3 = applyShot('chase');
  render(ctx3, c3.world, c3.screen, 0, false, c3.campaign);
  assert.ok(textsOf(ctx3).includes('!'), '"!" drawn above the chasing guard');
  assert.ok(!textsOf(ctx3).includes('?'), 'no "?" while the guard chases');
});

// --- calm play staging ---

test('m15: the play2 shot is staged calm — no coin ring, no smoke, no live laser, no spotted camera', () => {
  const { world } = applyShot('play2');
  assert.equal(world.coinRing, null, 'no coin ring');
  assert.equal(world.coins, 3, 'coins full');
  assert.equal(world.smokes, 2, 'smokes full');
  assert.deepEqual(world.smokeClouds, [], 'no smoke cloud');
  assert.ok(world.lasers.every((l) => !l.on), 'all lasers down (dashed, not live)');
  assert.ok(world.cameras.every((c) => c.state !== 'spotted'), 'no camera spotted');
  assert.equal(world.guards[1].state, 'search', 'one guard searches');
  assert.equal(world.guards.filter((g) => g.state !== 'patrol').length, 1,
    'exactly one guard is not patrolling');
  assert.equal(world.exposure, 0.2, 'CALM exposure');
  // The player hides in the dark west of curtain A.
  assert.deepEqual([world.player.x, world.player.y], [360, 140]);
});

test('m15: the chase2 alarm frame is honest — a chase means a detection', () => {
  // M14 nit, fixed in M15: the frozen alarm frame showed
  // "EXIT: OPEN · GHOST" while OTTO chased — but a chase only
  // happens after a detection (world.js counts detections on chase
  // entry), so the rail must read SPOTTED ×1 and the live score must
  // have lost the GHOST bonus (200 = time bonus only, t=0).
  const { world, screen, campaign } = applyShot('chase2');
  assert.equal(world.detections, 1, 'one detection carried into the frame');
  const ctx = new MockCtx();
  render(ctx, world, screen, 0, false, campaign);
  const texts = textsOf(ctx);
  assert.ok(texts.some((t) => t.includes('EXIT: OPEN · SPOTTED ×1')),
    'goal line reads SPOTTED ×1, not GHOST');
  assert.ok(texts.some((t) => t.includes('SCORE 200 · 00:00')),
    'score lost the GHOST bonus (200)');
  // …while the calm play2 frame stays GHOST: its SEARCH comes from a
  // coin noise, not a spot, so detections stays 0 there.
  const p2 = applyShot('play2');
  assert.equal(p2.world.detections, 0, 'play2 keeps detections 0 (noise search)');
});

// --- the honest floor: carpet look == carpet gameplay ---

function insideRect(x, y, r) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

test('m15: carpet-looking floor is exactly the gameplay carpet zones (silent)', () => {
  for (const shot of ['play', 'play2']) {
    const ctx = new MockCtx();
    const { world, screen, campaign } = applyShot(shot);
    render(ctx, world, screen, 0, false, campaign);
    const zones = world.level.carpetZones;
    // Playfield fills only (x<960) — the rail legend draws a carpet
    // icon in the same plum, which is not a floor fill.
    const carpetFills = ctx.calls.filter((c) => c[0] === 'fillRect' && c[5] === '#3a1f2b'
      && c[1] < CONFIG.VIEW_WIDTH);
    assert.ok(carpetFills.length > 0, `${shot}: carpet fills drawn`);
    for (const [, x, y, w, h] of carpetFills) {
      assert.ok(zones.some((z) => insideRect(x, y, z) && insideRect(x + w - 1, y + h - 1, z)),
        `${shot}: carpet fill (${x},${y},${w},${h}) must sit inside a gameplay carpet zone`);
    }
    const dotFills = ctx.calls.filter((c) => c[0] === 'fillRect' && c[5] === '#4d2a38'
      && c[1] < CONFIG.VIEW_WIDTH);
    for (const [, x, y] of dotFills) {
      assert.ok(zones.some((z) => insideRect(x, y, z)),
        `${shot}: carpet dot (${x},${y}) must sit inside a gameplay carpet zone`);
    }
  }
});

test('m15: wood is only the stage pool, tile is only the vault pool (noisy floors)', () => {
  for (const shot of ['play', 'play2']) {
    const ctx = new MockCtx();
    const { world, screen, campaign } = applyShot(shot);
    render(ctx, world, screen, 0, false, campaign);
    const stage = world.level.lightPools.find((p) => p.id === 'stage');
    const vault = world.level.lightPools.find((p) => p.id === 'vault');
    const woodFills = ctx.calls.filter((c) => c[0] === 'fillRect' && c[5] === '#4a3423');
    assert.equal(woodFills.length, 1, `${shot}: one wood fill (the stage pool)`);
    assert.deepEqual(
      [woodFills[0][1], woodFills[0][2], woodFills[0][3], woodFills[0][4]],
      [stage.x, stage.y, stage.w, stage.h], `${shot}: wood fill == stage pool rect`);
    const tileFills = ctx.calls.filter((c) => c[0] === 'fillRect' && c[5] === '#241c22');
    if (vault) {
      assert.equal(tileFills.length, 1, `${shot}: one tile fill (the vault pool)`);
      assert.deepEqual(
        [tileFills[0][1], tileFills[0][2], tileFills[0][3], tileFills[0][4]],
        [vault.x, vault.y, vault.w, vault.h], `${shot}: tile fill == vault pool rect`);
    } else {
      assert.equal(tileFills.length, 0, `${shot}: no vault pool, no tile fill`);
    }
  }
});

// --- light as architecture: the glow matches the pools ---

test('m15: every light pool gets a bigger warmer glow centred on the pool', () => {
  for (const shot of ['play', 'play2']) {
    const ctx = new MockCtx();
    const { world, screen, campaign } = applyShot(shot);
    render(ctx, world, screen, 0, false, campaign);
    const grads = ctx.calls.filter((c) => c[0] === 'createRadialGradient');
    for (const pool of world.level.lightPools) {
      const cx = pool.x + pool.w / 2;
      const cy = pool.y + pool.h / 2;
      const r = Math.max(pool.w, pool.h);
      const match = grads.find((c) => c[4] === cx && c[5] === cy && c[6] === r);
      assert.ok(match, `${shot}: a glow gradient centred on the ${pool.id} pool (r=${r})`);
      assert.equal(match[7].stops[0][1], 'rgba(255, 176, 70, 0.32)',
        `${shot}: the ${pool.id} glow is the warmer amber`);
    }
  }
});

// --- edge dressing: edges only, never on a route ---

function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function dressingRect(el) {
  if (el.w !== undefined) return { x: el.x, y: el.y, w: el.w, h: el.h };
  return { x: el.x - 3, y: el.y - 3, w: 6, h: 6 };
}

// The Probe T golden routes (from prototypes/m13/probe.mjs +
// prototypes/m14/probe2.mjs) — the dressing must stay clear of them.
const PROBE_T = {
  0: [[200, 520], [200, 170], [200, 32], [400, 32], [860, 32]],
  1: [[80, 300], [80, 540], [700, 540], [880, 510]],
};

test('m15: all edge dressing sits in the edge margins, clear of patrols, props, exit and Probe T', () => {
  for (const [jobIndex, build] of [[0, buildLevel], [1, buildLevel2]]) {
    const level = build();
    const stage = level.lightPools.find((p) => p.id === 'stage');
    const els = edgeDressing(level);
    assert.ok(els.length >= 9, `Job ${jobIndex + 1}: valance + 2 sconces + 2 columns + 4 footlights`);
    for (const el of els) {
      const r = dressingRect(el);
      // Edge margins: top strip (y<24), bottom wall (y>576), or the
      // stage lip (footlights, 10px below the stage pool's edge).
      const inTop = r.y + r.h <= 24;
      const inBottom = r.y >= 576;
      const onStageLip = el.kind === 'footlight'
        && el.y === stage.y + stage.h + 10
        && el.x >= stage.x && el.x <= stage.x + stage.w;
      assert.ok(inTop || inBottom || onStageLip,
        `Job ${jobIndex + 1}: ${el.kind} at (${el.x},${el.y}) must sit in an edge margin`);
      // Never on a patrol route (the dressing rect itself must not
      // intersect any guard's patrol segment).
      for (const g of level.guards) {
        const [a, b] = g.waypoints;
        assert.equal(segmentBlocked(a.x, a.y, b.x, b.y, [r]), false,
          `Job ${jobIndex + 1}: ${el.kind} at (${el.x},${el.y}) must not sit on ${g.name}'s patrol`);
      }
      // Never over a prop (32px clear).
      for (const p of level.props) {
        assert.ok(!insideRect(p.x, p.y, { x: r.x - 32, y: r.y - 32, w: r.w + 64, h: r.h + 64 }),
          `Job ${jobIndex + 1}: ${el.kind} at (${el.x},${el.y}) must stay 32px clear of the ${p.id} prop`);
      }
      assert.equal(rectsOverlap(r, level.exit), false,
        `Job ${jobIndex + 1}: ${el.kind} at (${el.x},${el.y}) must not cover the exit`);
      // Never on a Probe T route (12px clear of every leg — one
      // player radius, so the player's body never overlaps the
      // dressing while following the route; the valance hangs on the
      // top wall 16px above the route's top leg).
      const route = PROBE_T[jobIndex];
      for (let i = 0; i < route.length - 1; i++) {
        const [x1, y1] = route[i];
        const [x2, y2] = route[i + 1];
        const fat = { x: r.x - 12, y: r.y - 12, w: r.w + 24, h: r.h + 24 };
        assert.equal(segmentBlocked(x1, y1, x2, y2, [fat]), false,
          `Job ${jobIndex + 1}: ${el.kind} at (${el.x},${el.y}) must stay 12px clear of Probe T leg ${i + 1}`);
      }
      // Never on a laser beam (12px clear of every beam).
      for (const l of level.lasers) {
        const cx = el.x + (el.w !== undefined ? el.w / 2 : 0);
        const cy = el.y + (el.h !== undefined ? el.h / 2 : 0);
        assert.ok(pointSegDist(cx, cy, l.x1, l.y1, l.x2, l.y2) >= 12,
          `Job ${jobIndex + 1}: ${el.kind} at (${el.x},${el.y}) must stay 12px clear of ${l.name}`);
      }
    }
  }
});

// --- no Indonesian strings (M10 lock, re-checked for M15) ---

test('m15: no Indonesian strings in game/src/ + game/index.html', () => {
  const markers = /\b(yang|dengan|untuk|tidak|adalah|pemain|penjaga|jangan|tekan|kembali|menang|kalah|panggung|tirai|suara|buka|tutup|keluar|masuk|cepat|lambat|dan|atau|jika|saat|dari|dalam|oleh|pada|ini|itu|semua|juga)\b/i;
  const dir = new URL('../game/src/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
    .map((f) => new URL(`../game/src/${f}`, import.meta.url));
  files.push(new URL('../game/index.html', import.meta.url));
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    // Comments are not strings — strip /* */ + // comments first.
    const noComments = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    const strings = [...noComments.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g)]
      .map((m) => m[1] ?? m[2] ?? m[3]);
    for (const s of strings) {
      assert.ok(!markers.test(s), `${file.pathname.split('/').pop()}: Indonesian string "${s}"`);
    }
  }
});
