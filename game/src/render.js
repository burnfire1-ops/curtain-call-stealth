// CURTAIN CALL — M4 renderer: theatre palette, binary lighting,
// floor that talks, patrol routes + footstep rings for ALL guards,
// HUD (hud.js), screens with GHOST/SPOTTED rank, feel visuals
// ("!" alerts, "+1 PROP" flash, trauma shake, blinking cone edge).
// Flat shapes only, no art, no audio. Draws floor, light pools, carpet,
// wood stage, walls, curtain covers, props, patrol routes, cones, guards,
// player, rings, HUD, overlays.
import CONFIG from './config.js';
import { LEVELS } from './level.js';
import {
  drawHud, drawPanel,
  overlayPanelRect, labelOccluders, textBox, labelOccluded,
  selectLayout, selectHowtoLines, selectCardLines, jobStatus,
  campaignTotal, winScreenLines, loseScreenLines, PANEL_TEXT_MARGIN,
} from './hud.js';
import { shakeOffset } from './feel.js';

const COLORS = {
  floor: '#1c1512', // charcoal-plum dark wings
  floorAlt: '#201a15', // M11: second checker tone (near-identical)
  floorLine: '#2e2118',
  roomLabel: 'rgba(245, 240, 230, 0.14)', // M11: dim floor room labels
  carpet: '#3a1f2b', // deep plum carpet (silent floor)
  carpetDot: '#4d2a38',
  wood: '#4a3423', // warm stage wood (noisy floor)
  woodLine: '#5d4229',
  poolGlow: 'rgba(255, 190, 90, 0.20)', // warm stage light pool
  poolTint: 'rgba(255, 190, 90, 0.05)',
  wall: '#4a3a28',
  curtain: '#8e1f2f', // velvet red
  curtainEdge: '#c0394d',
  crate: '#6b4a26',
  crateEdge: '#8a6234',
  exit: '#2e7d32',
  exitText: '#a5d6a7',
  player: '#f5f0e6',
  guard: '#e8a33d',
  prop: '#ffd94d',
  propText: '#ffe9a8',
  // M11: cone fill as rgb + M8 base alpha — the wedge is filled with a
  // radial gradient (full alpha near the guard, fading to transparent
  // at VIEW_DIST) so the far edge reads soft like top-10 cones. The
  // M8 alphas are unchanged; only the falloff is new.
  coneFill: {
    patrol: { rgb: '232, 179, 61', a: 0.16 },
    suspicious: { rgb: '240, 200, 60', a: 0.30 },
    chase: { rgb: '220, 60, 40', a: 0.36 },
    search: { rgb: '232, 130, 40', a: 0.22 },
  },
  // M8: tepi tipis tiap cone — batas tiap cone tetap kebaca walau
  // fill-nya tumpang tindih (warna = state, alpha lebih kuat dari fill).
  coneEdgePatrol: 'rgba(232, 179, 61, 0.55)',
  coneEdgeSuspicious: 'rgba(240, 200, 60, 0.65)',
  coneEdgeChase: 'rgba(255, 90, 60, 0.70)',
  coneEdgeSearch: 'rgba(232, 130, 40, 0.60)',
  guardHalo: 'rgba(10, 8, 6, 0.60)', // M8: halo gelap di belakang guard
  patrol: 'rgba(232, 179, 61, 0.55)',
  ring: 'rgba(232, 179, 61, 0.55)',
  noiseRing: 'rgba(245, 240, 230, 0.35)',
  // M12: camera cones are TEAL (45,212,191) — a different colour from
  // every guard cone, so a camera reads as a different sensor at a
  // glance (game-ui-ux: colour + label, never colour alone).
  camCone: { rgb: '45, 212, 191', sweep: 0.18, spotted: 0.32 },
  camConeEdge: 'rgba(45, 212, 191, 0.60)',
  camMount: '#2b3a3a',
  camMountEdge: '#5eead4',
  coin: '#ffd94d',
  coinRing: 'rgba(255, 217, 77, 0.80)',
  // M13: smoke is soft grey (nothing like the gold coin or the red
  // laser) — a radial puff that fades at the edge, so the cloud
  // reads as a volume, not a wall. The laser beam is alarm red.
  smoke: 'rgba(200, 200, 205, 0.32)',
  smokeCore: 'rgba(220, 220, 225, 0.28)',
  laser: 'rgba(255, 70, 60, 0.95)',
  laserGlow: 'rgba(255, 70, 60, 0.25)',
  laserOff: 'rgba(255, 70, 60, 0.28)',
  laserEmitter: '#3a2020',
  laserEmitterEdge: '#ff463c',
  hud: '#f5f0e6',
  hudDim: '#b8ab98',
  overlay: 'rgba(10, 8, 6, 0.78)',
};

function drawCone(ctx, guard, t) {
  const half = (CONFIG.VIEW_HALF_ANGLE_DEG * Math.PI) / 180;
  const base = Math.atan2(guard.dir.y, guard.dir.x);
  // Cone colour follows the guard's FSM state (M2) — the state is
  // readable at a glance, even on the judge's contact sheet. M11: the
  // fill is a radial gradient (full M8 alpha near the guard, fading to
  // transparent at the far edge) instead of a flat alpha wedge.
  const c = COLORS.coneFill[guard.state] || COLORS.coneFill.patrol;
  const grad = ctx.createRadialGradient(
    guard.x, guard.y, 10, guard.x, guard.y, CONFIG.VIEW_DIST);
  grad.addColorStop(0, `rgba(${c.rgb}, ${c.a})`);
  grad.addColorStop(0.75, `rgba(${c.rgb}, ${c.a})`);
  grad.addColorStop(1, `rgba(${c.rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(guard.x, guard.y);
  ctx.arc(guard.x, guard.y, CONFIG.VIEW_DIST, base - half, base + half);
  ctx.closePath();
  ctx.fill();
  // M8: tepi tipis di SELURUH wedge (arc + dua sisi radial) — tiap cone
  // tetap punya batas sendiri walau fill-nya tumpang tindih dengan cone
  // lain. Chase tetap dapat blink 3px di atasnya (M4, dipertahankan).
  const edgeByState = {
    patrol: COLORS.coneEdgePatrol,
    suspicious: COLORS.coneEdgeSuspicious,
    chase: COLORS.coneEdgeChase,
    search: COLORS.coneEdgeSearch,
  };
  ctx.strokeStyle = edgeByState[guard.state] || COLORS.coneEdgePatrol;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(guard.x, guard.y);
  ctx.arc(guard.x, guard.y, CONFIG.VIEW_DIST, base - half, base + half);
  ctx.closePath();
  ctx.stroke();
  // M4 feel: the cone's edge blinks while the guard chases — the alert
  // reads from the cone alone, not just from the guard's colour.
  if (guard.state === 'chase') {
    ctx.strokeStyle = `rgba(255, 90, 60, ${0.5 + 0.4 * Math.sin(t * 12)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(guard.x, guard.y, CONFIG.VIEW_DIST, base - half, base + half);
    ctx.stroke();
  }
}

// M12: a camera's cone — same wedge shape as a guard cone, but TEAL
// and with a radial falloff, so it reads as a different sensor. The
// alpha follows the camera state (spotted = brighter); the sweep
// itself is the timing tell.
function drawCameraCone(ctx, cam) {
  const half = (CONFIG.CAM_HALF_ANGLE_DEG * Math.PI) / 180;
  const a = cam.state === 'spotted' ? COLORS.camCone.spotted : COLORS.camCone.sweep;
  const grad = ctx.createRadialGradient(
    cam.x, cam.y, 10, cam.x, cam.y, CONFIG.CAM_VIEW_DIST);
  grad.addColorStop(0, `rgba(${COLORS.camCone.rgb}, ${a})`);
  grad.addColorStop(0.75, `rgba(${COLORS.camCone.rgb}, ${a})`);
  grad.addColorStop(1, `rgba(${COLORS.camCone.rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cam.x, cam.y);
  ctx.arc(cam.x, cam.y, CONFIG.CAM_VIEW_DIST, cam.angle - half, cam.angle + half);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COLORS.camConeEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cam.x, cam.y);
  ctx.arc(cam.x, cam.y, CONFIG.CAM_VIEW_DIST, cam.angle - half, cam.angle + half);
  ctx.closePath();
  ctx.stroke();
}

// M12: the wall mount — a small dark box with a teal rim + a lens
// dot in the facing direction, labelled like a guard. (CAM 1 sits at
// (520,60), under the HUD header panel y8..92, so its mount is hidden
// in play and its label is skipped — the cone below the panel is what
// shows. CAM 2's label is skipped in play too — LASER 1 crosses its
// text (user rule 06:22 WIB); the mount + teal cone + legend roster
// carry the camera instead.)
// M14: the label is skipped when its TEXT BOX touches any occluder
// (HUD panel, minimap, overlay panel, or a laser beam) — see
// hud.js labelOccluders (user rule 06:22 WIB). `occluders` defaults
// to [] (label always drawn) for old callers.
function drawCameraMount(ctx, cam, occluders = []) {
  drawRect(ctx, { x: cam.x - 8, y: cam.y - 5, w: 16, h: 10 },
    COLORS.camMount, COLORS.camMountEdge);
  ctx.fillStyle = COLORS.camMountEdge;
  ctx.beginPath();
  ctx.arc(cam.x + cam.dir.x * 10, cam.y + cam.dir.y * 10, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  const box = textBox(cam.name, cam.x, cam.y - 12, measureLabel(ctx, cam.name));
  if (!labelOccluded(box, occluders)) {
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText(cam.name, cam.x, cam.y - 12);
  }
}

function drawPatrolRoute(ctx, guard) {
  const wps = guard.waypoints;
  ctx.strokeStyle = COLORS.patrol;
  ctx.setLineDash([4, 8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wps[0].x, wps[0].y);
  for (let i = 1; i < wps.length; i++) ctx.lineTo(wps[i].x, wps[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawRect(ctx, r, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  }
}

function drawCircle(ctx, x, y, r, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawPerson(ctx, body, fill, label, occluders = []) {
  drawCircle(ctx, body.x, body.y, body.r, fill, '#1a140f');
  // Facing tick.
  ctx.strokeStyle = '#1a140f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(body.x, body.y);
  ctx.lineTo(body.x + body.dir.x * (body.r + 6), body.y + body.dir.y * (body.r + 6));
  ctx.stroke();
  // M14: a guard label is skipped when its TEXT BOX touches any
  // occluder (HUD panel, minimap, overlay panel, or a laser beam) —
  // the anchor-only check let a label sit half-clipped on a panel
  // edge (user rule 06:22 WIB). The roster line carries the guard.
  if (label) {
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    const box = textBox(label, body.x, body.y - body.r - 6,
      measureLabel(ctx, label));
    if (!labelOccluded(box, occluders)) {
      ctx.fillStyle = COLORS.hudDim;
      ctx.fillText(label, body.x, body.y - body.r - 6);
    }
  }
}

// M14: measure a label for the box check — width + ascent + descent
// from ctx.measureText, falling back to the font size when a canvas
// does not report the bounding boxes (node mocks, older canvases).
function measureLabel(ctx, text) {
  const m = ctx.measureText(text);
  const size = parseInt((/(\d+)px/.exec(ctx.font || '') || [0, 11])[1], 10);
  return {
    width: m.width,
    ascent: m.actualBoundingBoxAscent !== undefined ? m.actualBoundingBoxAscent : size,
    descent: m.actualBoundingBoxDescent !== undefined
      ? m.actualBoundingBoxDescent : Math.ceil(size * 0.25),
  };
}

// Footstep rings (M3, visual only): thin gold circles that expand and
// fade, so the player can read where a guard has just walked.
function drawRings(ctx, world) {
  for (const ring of world.rings) {
    const t = ring.age / CONFIG.RING_FADE_S;
    ctx.strokeStyle = COLORS.ring;
    ctx.globalAlpha = (1 - t) * 0.7;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, 8 + t * 30, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Player noise radius while running: the circle a guard can hear.
  if (world.noiseRing) {
    ctx.strokeStyle = COLORS.noiseRing;
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(world.noiseRing.x, world.noiseRing.y, world.noiseRing.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // M12: the thrown coin — a gold dot arcing to its landing point
  // (game-feel: the arc + the ring sell the throw; the simulation
  // only ever sees the landing point), then the expanding gold
  // landing ring, the circle every guard inside it can hear.
  if (world.coinFlight) {
    const f = world.coinFlight;
    const p = Math.min(1, f.t / f.dur);
    const cx = f.x0 + (f.x1 - f.x0) * p;
    const cy = f.y0 + (f.y1 - f.y0) * p - Math.sin(p * Math.PI) * 28;
    ctx.strokeStyle = 'rgba(255, 217, 77, 0.35)';
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(f.x0, f.y0);
    ctx.quadraticCurveTo(
      (f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2 - 56, f.x1, f.y1);
    ctx.stroke();
    ctx.setLineDash([]);
    drawCircle(ctx, cx, cy, 5, COLORS.coin, '#1a140f');
  }
  // M13: a flying smoke — the same arc as the coin, a grey puff
  // instead of a gold dot (the simulation only ever sees the landing
  // point, like the coin).
  if (world.smokeFlight) {
    const f = world.smokeFlight;
    const p = Math.min(1, f.t / f.dur);
    const cx = f.x0 + (f.x1 - f.x0) * p;
    const cy = f.y0 + (f.y1 - f.y0) * p - Math.sin(p * Math.PI) * 28;
    drawCircle(ctx, cx, cy, 6, 'rgba(200, 200, 205, 0.85)', '#1a140f');
  }
  if (world.coinRing) {
    const r = world.coinRing;
    const grow = Math.min(1, r.age / 0.3);
    ctx.strokeStyle = COLORS.coinRing;
    ctx.globalAlpha = Math.max(0, 1 - r.age / CONFIG.COIN_RING_S) * 0.9;
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, Math.max(4, r.radius * grow), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
  // M13: smoke clouds — a soft grey radial puff (core + fading
  // edge) that thins as the 4s cloud ages. Drawn over the floor and
  // cones, under the guards, so a hidden player still reads.
  for (const cloud of world.smokeClouds || []) {
    const fade = Math.max(0, 1 - cloud.age / CONFIG.SMOKE_CLOUD_S);
    const grad = ctx.createRadialGradient(
      cloud.x, cloud.y, 4, cloud.x, cloud.y, cloud.r);
    grad.addColorStop(0, COLORS.smokeCore);
    grad.addColorStop(0.7, COLORS.smoke);
    grad.addColorStop(1, 'rgba(200, 200, 205, 0)');
    ctx.globalAlpha = Math.min(1, 0.55 + fade * 0.45);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cloud.x, cloud.y, cloud.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// M13: a laser tripwire — a live beam is a bright red line with a
// soft glow under it; a down beam is a dim dashed line. Both ends
// carry an emitter box; the dot brightens in the last 0.4s of the
// OFF phase, telegraphing that the beam is about to go live.
function drawLaser(ctx, laser) {
  const dx = laser.x2 - laser.x1;
  const dy = laser.y2 - laser.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  if (laser.on) {
    ctx.strokeStyle = COLORS.laserGlow;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(laser.x2, laser.y2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.laser;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(laser.x2, laser.y2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = COLORS.laserOff;
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(laser.x2, laser.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Emitters: a dark box at each end + a lens dot. The dot is bright
  // while ON, dim while OFF — and pulses bright in the last 0.4s of
  // OFF, the "about to go live" telegraph.
  const warn = !laser.on && laser.phaseT > CONFIG.LASER_OFF_S - 0.4;
  const dotAlpha = laser.on ? 1 : (warn ? 0.75 : 0.35);
  for (const [ex, ey] of [[laser.x1, laser.y1], [laser.x2, laser.y2]]) {
    drawRect(ctx, { x: ex - 6, y: ey - 6, w: 12, h: 12 },
      COLORS.laserEmitter, COLORS.laserEmitterEdge);
    ctx.globalAlpha = dotAlpha;
    ctx.fillStyle = '#ff463c';
    ctx.beginPath();
    ctx.arc(ex + nx * 8, ey + ny * 8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawProps(ctx, world, occluders = []) {
  for (const prop of world.props) {
    if (prop.taken) continue;
    // Gold diamond + short label.
    ctx.fillStyle = COLORS.prop;
    ctx.beginPath();
    ctx.moveTo(prop.x, prop.y - 9);
    ctx.lineTo(prop.x + 9, prop.y);
    ctx.lineTo(prop.x, prop.y + 9);
    ctx.lineTo(prop.x - 9, prop.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.propText;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    // M14: the label is skipped when its TEXT BOX touches any occluder
    // (the Violin label sat under the minimap; the box rule catches
    // the same case on every screen, not only in play).
    const label = prop.name.toUpperCase();
    const box = textBox(label, prop.x, prop.y + 22, measureLabel(ctx, label));
    if (!labelOccluded(box, occluders)) {
      ctx.fillText(label, prop.x, prop.y + 22);
    }
  }
}

// M11: room labels as floor landmarks (level-design: guide with light
// and landmarks, not walls). X derived from cover geometry — curtain A
// splits foyer/auditorium, the crate splits auditorium/backstage; Y
// are hand-placed clear rows (below the top patrols, clear of pools,
// prop labels and patrol-label rows — and below the HUD header panel,
// which covers y8..92: FOYER sits at y130, not y72, after the first
// screenshot pass caught it hidden under the panel).
export function roomLabels(level) {
  // M14: a level may hand-place its labels (Job 2); Job 1 keeps the
  // geometric derivation (unchanged).
  if (level.roomLabels) return level.roomLabels;
  const curtainA = level.covers.find((c) => c.kind === 'curtain');
  const crate = level.covers.find((c) => c.kind === 'crate');
  const foyerX = Math.round((CONFIG.WALL + curtainA.x) / 2);
  const audX = Math.round((curtainA.x + curtainA.w + crate.x) / 2);
  const backX = Math.round((crate.x + crate.w + (CONFIG.VIEW_WIDTH - CONFIG.WALL)) / 2);
  return [
    { text: 'FOYER', x: foyerX, y: 130 },
    { text: 'AUDITORIUM', x: audX, y: 205 },
    { text: 'BACKSTAGE', x: backX, y: 160 },
  ];
}

// M11: the static floor — checkerboard, carpet, wood stage, light
// pools, room labels. Drawn once into the offscreen layer (see
// getFloorLayer) and drawn directly when there is no document (node
// tests / dossier build). Geometry identical to the M1–M10 floor.
function drawFloor(ctx, level) {
  const W = CONFIG.VIEW_WIDTH;
  const H = CONFIG.VIEW_HEIGHT;
  const T = CONFIG.TILE;
  // Checkerboard (create-game-assets: tileable surface, two
  // near-identical dark tones) — replaces the flat M1 fill.
  for (let ty = 0; ty < H / T; ty++) {
    for (let tx = 0; tx < W / T; tx++) {
      ctx.fillStyle = (tx + ty) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
      ctx.fillRect(tx * T, ty * T, T, T);
    }
  }
  // Faint board lines (M1, kept over the checker).
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 1;
  for (let x = T; x < W; x += T) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = T; y < H; y += T) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // Carpet zones (silent floor): plum fill + dot pattern.
  for (const zone of level.carpetZones) {
    drawRect(ctx, zone, COLORS.carpet);
    ctx.fillStyle = COLORS.carpetDot;
    for (let x = zone.x + 12; x < zone.x + zone.w; x += 24) {
      for (let y = zone.y + 12; y < zone.y + zone.h; y += 24) {
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }
  // Wood stage (noisy floor): the stage light pool rect, plank lines.
  const stage = level.lightPools.find((p) => p.id === 'stage');
  drawRect(ctx, stage, COLORS.wood);
  ctx.strokeStyle = COLORS.woodLine;
  ctx.lineWidth = 1;
  for (let y = stage.y + 14; y < stage.y + stage.h; y += 14) {
    ctx.beginPath(); ctx.moveTo(stage.x, y); ctx.lineTo(stage.x + stage.w, y); ctx.stroke();
  }
  // Light pools: warm radial glow so "light = danger" reads at a
  // glance (M3 geometry, now baked into the static layer).
  for (const pool of level.lightPools) {
    const cx = pool.x + pool.w / 2;
    const cy = pool.y + pool.h / 2;
    const r = Math.max(pool.w, pool.h) * 0.75;
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, r);
    grad.addColorStop(0, COLORS.poolGlow);
    grad.addColorStop(1, 'rgba(255, 190, 90, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(pool.x - 20, pool.y - 20, pool.w + 40, pool.h + 40);
    drawRect(ctx, pool, COLORS.poolTint);
  }
  // Room labels, dim on the floor.
  ctx.fillStyle = COLORS.roomLabel;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  for (const l of roomLabels(level)) ctx.fillText(l.text, l.x, l.y);
}

// M11: the floor never changes during a run — pre-render it once to
// an offscreen canvas (game-feel: cache static gradients, no per-frame
// allocation). Null when there is no document (node tests / dossier).
// M14: the cache is keyed by LEVEL — the campaign switches levels, and
// the old single-slot cache would have kept Job 1's floor under Job 2.
let floorLayer = null;
let floorLayerLevel = null;
function getFloorLayer(level) {
  if (floorLayer && floorLayerLevel === level) return floorLayer;
  floorLayerLevel = level;
  floorLayer = null;
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas');
  c.width = CONFIG.VIEW_WIDTH;
  c.height = CONFIG.VIEW_HEIGHT;
  drawFloor(c.getContext('2d'), level);
  floorLayer = c;
  return floorLayer;
}

function drawOverlay(ctx, title, body, footer) {
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, CONFIG.VIEW_WIDTH, CONFIG.VIEW_HEIGHT);
  // M11: framed panel behind the text (same treatment as the HUD) —
  // gold border for the big moment. Height grows with the row count.
  // M14: the rect comes from hud.js overlayPanelRect — the same rect
  // the label-box check uses, so the two can never drift apart.
  const rows = body.length + (footer ? 1 : 0);
  const panel = overlayPanelRect(rows);
  drawPanel(ctx, panel.x, panel.y, panel.w, panel.h, 'rgba(232, 179, 61, 0.45)');
  ctx.fillStyle = COLORS.hud;
  ctx.font = 'bold 44px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(title, CONFIG.VIEW_WIDTH / 2, 250);
  // M14: the body is LEFT-aligned on one fixed margin (panel.x + 40)
  // — one straight left edge (user rule 06:25 WIB: the old centred
  // block had no straight edge, long lines nearly touched the panel
  // sides, and a sentence broke into a lowercase continuation). The
  // title and the closer stay centred.
  ctx.font = '16px monospace';
  ctx.fillStyle = COLORS.hudDim;
  ctx.textAlign = 'left';
  body.forEach((line, i) => {
    ctx.fillText(line, panel.x + PANEL_TEXT_MARGIN, 300 + i * 28);
  });
  if (footer) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.hud;
    ctx.fillText(footer, CONFIG.VIEW_WIDTH / 2, 300 + body.length * 28 + 8);
  }
}

// M14: the job-select screen — the opener, replacing the old start
// screen. The backdrop world is ambience (dimmed); the cards carry
// the content. Title + tagline centred; the two job cards + the HOW
// TO PLAY panel on one grid; the howto body left-aligned on one fixed
// margin (panel.x + 40, the same straight-edge rule as the overlays);
// the closer + campaign best centred below. `campaign` is main.js's
// live campaign (or a shot fixture); `world` is the backdrop world
// (the selected job's level).
function drawSelectScreen(ctx, campaign, world) {
  const L = selectLayout();
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, CONFIG.VIEW_WIDTH, CONFIG.VIEW_HEIGHT);
  // Title + tagline, centred (the judul stays centred — rule 06:25 (a)).
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.hud;
  ctx.font = 'bold 44px monospace';
  ctx.fillText('CURTAIN CALL', CONFIG.VIEW_WIDTH / 2, L.titleY);
  ctx.font = '16px monospace';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('Steal back the props. Leave no witness.', CONFIG.VIEW_WIDTH / 2, L.taglineY);
  // Job cards: gold border on the selected one; status colours carry
  // the state (cleared = gold, locked = red, open = dim) alongside
  // the words, never colour alone.
  for (let i = 0; i < L.cards.length; i++) {
    const c = L.cards[i];
    const status = jobStatus(campaign, i);
    const selected = campaign.selected === i;
    drawPanel(ctx, c.x, c.y, c.w, c.h,
      selected ? 'rgba(232, 179, 61, 0.9)' : undefined);
    const lines = selectCardLines(LEVELS[i], campaign, i);
    const statusColor = status === 'cleared' ? '#ffd94d'
      : status === 'locked' ? '#ff6b57' : COLORS.hudDim;
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = selected ? COLORS.hud : COLORS.hudDim;
    ctx.fillText(lines[0], c.x + 16, c.y + 28);
    ctx.font = '12px monospace';
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText(lines[1], c.x + 16, c.y + 54);
    ctx.fillStyle = statusColor;
    ctx.fillText(lines[2], c.x + 16, c.y + 80);
    if (lines[3]) {
      ctx.fillStyle = COLORS.hudDim;
      ctx.fillText(lines[3], c.x + 16, c.y + 106);
    }
  }
  // HOW TO PLAY panel: section header bold, body left-aligned on one
  // fixed margin — one straight left edge, blank lines between the
  // groups (objective / legend+mechanics / controls).
  const h = L.howto;
  drawPanel(ctx, h.x, h.y, h.w, h.h);
  const lines = selectHowtoLines();
  ctx.textAlign = 'left';
  lines.forEach((line, i) => {
    if (!line) return;
    ctx.font = i === 0 ? 'bold 13px monospace' : '13px monospace';
    ctx.fillStyle = i === 0 ? COLORS.hud : COLORS.hudDim;
    ctx.fillText(line, L.howtoX, L.howtoFirstBaseline + i * L.howtoPitch);
  });
  // Closer + campaign best, centred below the panel.
  ctx.textAlign = 'center';
  ctx.font = '16px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText('CLICK A JOB CARD OR PRESS 1–2 · ENTER TO START',
    CONFIG.VIEW_WIDTH / 2, L.footerY);
  ctx.font = '14px monospace';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(`CAMPAIGN BEST ${campaignTotal(campaign.best)}`,
    CONFIG.VIEW_WIDTH / 2, L.bestY);
}

export function render(ctx, world, screen, t = 0, muted = false, campaign = null) {
  const W = CONFIG.VIEW_WIDTH;
  const H = CONFIG.VIEW_HEIGHT;
  const level = world.level;
  // M14: the campaign (default = a fresh session) and the overlay
  // lines are computed BEFORE the world is drawn — the world labels
  // must be checked against the panels that will cover them, and the
  // panels are drawn after the world. The occluder list depends on
  // the screen: play/paused get the HUD panels + minimap, select gets
  // the select panels (cards + howto), win/lose get the overlay panel
  // (row count from that screen's lines). Every screen adds the laser
  // beams — a beam crossing a label is the CAM 2 defect (06:22 WIB).
  const camp = campaign || { selected: 0, cleared: [false, false], best: [null, null] };
  const winLines = screen === 'win' ? winScreenLines(world, camp) : null;
  const loseLines = screen === 'lose' ? loseScreenLines(world) : null;
  let occluders;
  if (screen === 'play' || screen === 'paused') {
    occluders = labelOccluders({ hud: true, lasers: world.lasers || [] });
  } else if (screen === 'select') {
    const L = selectLayout();
    occluders = labelOccluders({ lasers: world.lasers || [] });
    occluders.push(...L.cards, L.howto);
    // The title + tagline are drawn text, not panels — their text
    // zones are occluders too, or a backdrop label prints through them
    // (CAM 1's label sat under "CURTAIN CALL"; the G3 label sat under
    // the tagline). Measured with the same fonts drawSelectScreen uses,
    // so the zones match the drawn text exactly.
    ctx.font = 'bold 44px monospace';
    occluders.push(textBox('CURTAIN CALL', W / 2, L.titleY,
      measureLabel(ctx, 'CURTAIN CALL')));
    ctx.font = '16px monospace';
    occluders.push(textBox('Steal back the props. Leave no witness.', W / 2, L.taglineY,
      measureLabel(ctx, 'Steal back the props. Leave no witness.')));
  } else if (winLines) {
    occluders = labelOccluders({
      overlay: overlayPanelRect(winLines.body.length + 1),
      lasers: world.lasers || [],
    });
  } else if (loseLines) {
    occluders = labelOccluders({
      overlay: overlayPanelRect(loseLines.body.length + 1),
      lasers: world.lasers || [],
    });
  } else {
    occluders = labelOccluders({ lasers: world.lasers || [] });
  }
  // M4 feel: trauma shake moves the whole frame (visual only — the
  // simulation never moves). It decays in real time via feel.update.
  const off = shakeOffset(world.feel);
  ctx.save();
  ctx.translate(off.x, off.y);
  // M11: static floor from the cached layer (baked once); direct draw
  // when there is no document (node tests / dossier build).
  const layer = getFloorLayer(level);
  if (layer) ctx.drawImage(layer, 0, 0);
  else drawFloor(ctx, level);

  for (const guard of world.guards) drawPatrolRoute(ctx, guard);
  for (const guard of world.guards) drawCone(ctx, guard, t);
  for (const cam of world.cameras || []) drawCameraCone(ctx, cam);

  for (const wall of world.walls) drawRect(ctx, wall, COLORS.wall);
  for (const cover of world.covers) {
    // The prop crate reads as wood, curtains as velvet red.
    const isCrate = cover.kind === 'crate';
    drawRect(ctx, cover, isCrate ? COLORS.crate : COLORS.curtain,
      isCrate ? COLORS.crateEdge : COLORS.curtainEdge);
    if (isCrate) {
      // M11: crate X + bevel — the box reads as a box at a glance.
      ctx.strokeStyle = COLORS.crateEdge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cover.x + 4, cover.y + 4);
      ctx.lineTo(cover.x + cover.w - 4, cover.y + cover.h - 4);
      ctx.moveTo(cover.x + cover.w - 4, cover.y + 4);
      ctx.lineTo(cover.x + 4, cover.y + cover.h - 4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 220, 160, 0.35)';
      ctx.beginPath();
      ctx.moveTo(cover.x + 2, cover.y + cover.h - 2);
      ctx.lineTo(cover.x + 2, cover.y + 2);
      ctx.lineTo(cover.x + cover.w - 2, cover.y + 2);
      ctx.stroke();
    } else {
      // M11: curtain folds — vertical pleat lines, so velvet reads as
      // fabric, not a flat red slab.
      ctx.strokeStyle = 'rgba(60, 8, 16, 0.45)';
      ctx.lineWidth = 2;
      for (const fx of [0.25, 0.5, 0.75]) {
        const lx = cover.x + cover.w * fx;
        ctx.beginPath();
        ctx.moveTo(lx, cover.y + 3);
        ctx.lineTo(lx, cover.y + cover.h - 3);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255, 120, 140, 0.25)';
      ctx.beginPath();
      ctx.moveTo(cover.x + cover.w * 0.12, cover.y + 3);
      ctx.lineTo(cover.x + cover.w * 0.12, cover.y + cover.h - 3);
      ctx.stroke();
    }
  }

  // M12: camera mounts (drawn after the covers, so the box sits on
  // the wall instead of under it).
  for (const cam of world.cameras || []) drawCameraMount(ctx, cam, occluders);

  // M13: laser tripwires (drawn after the mounts, so the beams sit
  // on top of the floor and the emitters read as hardware).
  for (const laser of world.lasers || []) drawLaser(ctx, laser);

  // Exit: green stage door + soft glow halo (M11) so the goal reads
  // from anywhere on the map.
  const ex = world.exit;
  const ecx = ex.x + ex.w / 2;
  const ecy = ex.y + ex.h / 2;
  const egrad = ctx.createRadialGradient(ecx, ecy, 6, ecx, ecy, 80);
  egrad.addColorStop(0, 'rgba(46, 125, 50, 0.30)');
  egrad.addColorStop(1, 'rgba(46, 125, 50, 0)');
  ctx.fillStyle = egrad;
  ctx.fillRect(ex.x - 50, ex.y - 50, ex.w + 100, ex.h + 100);
  drawRect(ctx, world.exit, COLORS.exit, COLORS.exitText);
  ctx.fillStyle = COLORS.exitText;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', world.exit.x + world.exit.w / 2, world.exit.y + world.exit.h / 2 + 5);

  drawProps(ctx, world, occluders);
  drawRings(ctx, world);

  for (const guard of world.guards) {
    // M8: halo gelap di belakang guard — badan oranye tetap kebaca di
    // dalam cone-nya sendiri maupun di tumpang tindih cone lain.
    drawCircle(ctx, guard.x, guard.y, guard.r + 4, COLORS.guardHalo);
    drawPerson(ctx, guard, COLORS.guard, `${guard.name} · ${guard.state.toUpperCase()}`, occluders);
    // M4 feel: "!" above the guard for the first beat of a chase, so
    // the Suspicious -> Chase transition reads even without the cone.
    const alert = world.feel.alerts.find((a) => a.guard === guard);
    if (alert) {
      ctx.fillStyle = '#ff5a3c';
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', guard.x, guard.y - guard.r - 22);
    }
  }
  drawPerson(ctx, world.player, COLORS.player);

  // M4 feel: "+1 PROP" flash, fixed at screen centre (first pass drew
  // it above the player, where a top-of-map prop put it on top of the
  // HUD meter + controls lines; second pass at y=128 sat on the Golden
  // Mask label). y=150 clears the mask label (y=112), usher 2's label
  // (y=100) and curtain A (ends x=420). Fades in 1s.
  if (world.feel.propFlash > 0) {
    ctx.globalAlpha = world.feel.propFlash;
    ctx.fillStyle = COLORS.prop;
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('+1 PROP', CONFIG.VIEW_WIDTH / 2, 150);
    ctx.globalAlpha = 1;
  }

  // M13: "TRIPPED!" flash — red, centre screen below the prop
  // flash, fades in 1s. The laser trip is the one event that must
  // read even when the player is looking at the minimap, not the beam.
  if (world.feel.laserFlash > 0) {
    ctx.globalAlpha = world.feel.laserFlash;
    ctx.fillStyle = '#ff3b30';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TRIPPED!', CONFIG.VIEW_WIDTH / 2, 190);
    ctx.globalAlpha = 1;
  }

  // M11: vignette — darkened playfield edges (top-10 lighting), drawn
  // after entities so the frame feels lit, before the HUD so text
  // stays at full contrast.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.68);
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(0.72, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  if (screen === 'play' || screen === 'paused') drawHud(ctx, world, screen, t, muted);
  if (screen === 'select') {
    drawSelectScreen(ctx, camp, world);
  } else if (winLines) {
    drawOverlay(ctx, winLines.title, winLines.body, winLines.footer);
  } else if (loseLines) {
    drawOverlay(ctx, loseLines.title, loseLines.body, loseLines.footer);
  }
  ctx.restore();
}
