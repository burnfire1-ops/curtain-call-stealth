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
  floor: '#191310', // M15: deeper dark wings (the light pools read brighter against them)
  floorLine: '#241a12', // M15: faint 80px board lines only (the checkerboard read as graph paper)
  carpet: '#3a1f2b', // deep plum carpet (silent floor)
  carpetDot: '#4d2a38',
  wood: '#4a3423', // warm stage wood (noisy floor)
  woodLine: '#5d4229',
  tile: '#241c22', // M15: vault tile (noisy floor, like wood)
  tileLine: '#31242e',
  zoneBorder: 'rgba(245, 240, 230, 0.10)', // M15: thin borders between floor zones
  poolGlow: 'rgba(255, 176, 70, 0.32)', // M15: bigger + warmer amber light pool
  poolTint: 'rgba(255, 176, 70, 0.07)',
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
      // M15: a PATROL label is dim (0.45) — the guard is background
      // until it notices something; alert states read at full
      // strength, so the eye goes to the danger first.
      ctx.globalAlpha = body.state === 'patrol' ? 0.45 : 1;
      ctx.fillStyle = COLORS.hudDim;
      ctx.fillText(label, body.x, body.y - body.r - 6);
      ctx.globalAlpha = 1;
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

function drawProps(ctx, world) {
  for (const prop of world.props) {
    if (prop.taken) continue;
    // Gold diamond only (M15: the prop NAME label is gone from the
    // playfield — the name lives in the rail LOOT checklist; the
    // diamond marks the spot).
    ctx.fillStyle = COLORS.prop;
    ctx.beginPath();
    ctx.moveTo(prop.x, prop.y - 9);
    ctx.lineTo(prop.x + 9, prop.y);
    ctx.lineTo(prop.x, prop.y + 9);
    ctx.lineTo(prop.x - 9, prop.y);
    ctx.closePath();
    ctx.fill();
  }
}

// M15: edge dressing — the theatre's trim, drawn on the EDGES only
// (never on a patrol path, never over a prop, the exit, or a guard
// label). Pure data, unit-tested in tests/m15.test.js: every element
// sits in the top strip (y<24), the bottom wall (y>576), a corner
// box, or on the stage pool's bottom edge (the footlights, 10px below
// the stage lip — 30px+ clear of every patrol route). Footlight x
// positions avoid the vertical lasers (Job 1 L2 at x=460, Job 2 L2
// at x=600) by a 15px+ margin. Positions derive from the level where
// they exist (the stage pool), fixed margins elsewhere.
export function edgeDressing(level) {
  const stage = level.lightPools.find((p) => p.id === 'stage');
  const out = [
    // The curtain valance: a scalloped strip along the top wall.
    { kind: 'valance', x: 20, y: 0, w: 920, h: 16 },
    // Sconce lamps on the top wall, clear of the valance scallops.
    { kind: 'sconce', x: 120, y: 8 },
    { kind: 'sconce', x: 840, y: 8 },
    // Corner columns: pillar bases overlapping the bottom wall.
    { kind: 'column', x: 20, y: 576, w: 24, h: 24 },
    { kind: 'column', x: 916, y: 576, w: 24, h: 24 },
  ];
  // Footlights along the stage pool's bottom edge (the stage's lip):
  // 4 lights, inset 35px from the pool's ends so none sits on a
  // vertical laser beam or a patrol route.
  if (stage) {
    const fy = stage.y + stage.h + 10;
    for (let i = 0; i < 4; i++) {
      out.push({
        kind: 'footlight',
        x: Math.round(stage.x + 35 + i * ((stage.w - 70) / 3)),
        y: fy,
      });
    }
  }
  return out;
}

// M15: draw the edge dressing (flat shapes, no gameplay). The valance
// is deep-red velvet with a gold hem + scallops; sconces are small
// amber lamps with a glow; columns are pillar bases on the bottom
// wall; footlights are small amber dots on the stage lip.
function drawEdgeDressing(ctx, level) {
  for (const el of edgeDressing(level)) {
    if (el.kind === 'valance') {
      ctx.fillStyle = '#6e1626';
      ctx.fillRect(el.x, el.y, el.w, 12);
      // Scalloped bottom edge (arcs dipping to y=16) + gold hem.
      ctx.fillStyle = '#6e1626';
      const n = Math.floor(el.w / 40);
      for (let i = 0; i < n; i++) {
        const cx = el.x + i * 40 + 20;
        ctx.beginPath();
        ctx.arc(cx, 12, 20, 0, Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(el.x, 12, el.w, 1);
    } else if (el.kind === 'sconce') {
      const g = ctx.createRadialGradient(el.x, el.y, 1, el.x, el.y, 14);
      g.addColorStop(0, 'rgba(255, 190, 90, 0.35)');
      g.addColorStop(1, 'rgba(255, 190, 90, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(el.x - 14, el.y - 14, 28, 28);
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(el.x - 2, el.y - 5, 4, 10);
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath(); ctx.arc(el.x, el.y - 2, 3, 0, Math.PI * 2); ctx.fill();
    } else if (el.kind === 'column') {
      ctx.fillStyle = '#3a2f24';
      ctx.fillRect(el.x, el.y, el.w, el.h);
      ctx.fillStyle = '#4a3a28';
      ctx.fillRect(el.x, el.y, el.w, 4);
      ctx.strokeStyle = 'rgba(245, 240, 230, 0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(el.x + 0.5, el.y + 0.5, el.w - 1, el.h - 1);
    } else if (el.kind === 'footlight') {
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath(); ctx.arc(el.x, el.y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 190, 90, 0.25)';
      ctx.beginPath(); ctx.arc(el.x, el.y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// M15: the static floor — material zones, not a checkerboard. The
// M11 checkerboard read as graph paper, so the base is one flat dark
// tone with faint 80px board lines only, and the MATERIAL ZONES read
// as the rooms: wood stage (planks), carpet zones (plum + dots),
// vault tile (fine grid), thin borders between zones. HONESTY RULE:
// the carpet LOOK is exactly the gameplay carpet zones (silent) —
// wood and tile are the noisy floors. Light pools are bigger +
// warmer (light as architecture); the dark between them is deeper
// (the base is darker now). The LIGHT=danger / DARK=safe mapping is
// unchanged (same multipliers in detection.js). Room labels are GONE
// from the playfield (declutter) — the zones + the rail legend carry
// the reading now. Drawn once into the offscreen layer (see
// getFloorLayer) and drawn directly when there is no document (node
// tests / dossier build).
function drawFloor(ctx, level) {
  const W = CONFIG.VIEW_WIDTH;
  const H = CONFIG.VIEW_HEIGHT;
  const T = CONFIG.TILE;
  // Flat dark base + faint 80px board lines.
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 1;
  for (let x = T * 2; x < W; x += T * 2) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = T * 2; y < H; y += T * 2) {
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
  // Tile vault (noisy floor): the vault light pool rect, fine grid.
  // Job 2 has no vault pool, so it simply gets no tile zone.
  const vault = level.lightPools.find((p) => p.id === 'vault');
  if (vault) {
    drawRect(ctx, vault, COLORS.tile);
    ctx.strokeStyle = COLORS.tileLine;
    ctx.lineWidth = 1;
    for (let x = vault.x + 20; x < vault.x + vault.w; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, vault.y); ctx.lineTo(x, vault.y + vault.h); ctx.stroke();
    }
    for (let y = vault.y + 20; y < vault.y + vault.h; y += 20) {
      ctx.beginPath(); ctx.moveTo(vault.x, y); ctx.lineTo(vault.x + vault.w, y); ctx.stroke();
    }
  }
  // Light pools: warm radial glow so "light = danger" reads at a
  // glance (M3 geometry, now baked into the static layer). The
  // gradient radius covers the whole pool (max(w,h)), and the fill
  // rect covers the whole gradient circle, so the glow fades to
  // transparent with no hard edge.
  for (const pool of level.lightPools) {
    const cx = pool.x + pool.w / 2;
    const cy = pool.y + pool.h / 2;
    const r = Math.max(pool.w, pool.h);
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, r);
    grad.addColorStop(0, COLORS.poolGlow);
    grad.addColorStop(1, 'rgba(255, 176, 70, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    drawRect(ctx, pool, COLORS.poolTint);
  }
  // Thin borders between zones — the map reads as rooms without
  // walls: around every light pool + every carpet zone.
  ctx.strokeStyle = COLORS.zoneBorder;
  ctx.lineWidth = 1;
  for (const pool of level.lightPools) {
    ctx.strokeRect(pool.x + 0.5, pool.y + 0.5, pool.w - 1, pool.h - 1);
  }
  for (const zone of level.carpetZones) {
    ctx.strokeRect(zone.x + 0.5, zone.y + 0.5, zone.w - 1, zone.h - 1);
  }
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
  // the screen: play/paused get the rail, select gets the select
  // panels (cards + howto), win/lose get the overlay panel (row count
  // from that screen's lines). Every screen adds the laser beams — a
  // beam crossing a label is the CAM 2 defect (06:22 WIB).
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

  // M15: edge dressing (valance + sconces + columns + footlights) —
  // edges and corners only, drawn after the covers so the trim sits
  // on the walls, before the mounts/lasers/entities.
  drawEdgeDressing(ctx, level);

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

  drawProps(ctx, world);
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
    // M15: "?" above a SUSPICIOUS guard (the "!" is chase-only) —
    // the guard heard something and is turning toward it. Same spot
    // as the "!", mutually exclusive states.
    if (guard.state === 'suspicious') {
      ctx.fillStyle = '#ffce54';
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', guard.x, guard.y - guard.r - 22);
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
  // stays at full contrast. M15: deeper (0.38) — the dark wings read
  // darker against the bigger amber pools.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.68);
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(0.72, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  if (screen === 'select') {
    drawSelectScreen(ctx, camp, world);
  } else if (winLines) {
    drawOverlay(ctx, winLines.title, winLines.body, winLines.footer);
  } else if (loseLines) {
    drawOverlay(ctx, loseLines.title, loseLines.body, loseLines.footer);
  }
  // M15: the rail is drawn on EVERY screen (play/paused/select/win/
  // lose), after the screen content — the rail is the frame, and it
  // stays bright under the win/lose dim (the overlay dims the
  // playfield only, x0..960).
  drawHud(ctx, world, screen, t, muted, camp);
  if (screen === 'paused') {
    // M15: the PAUSED line moved here from drawHud (it is a playfield
    // overlay, not rail content) — y170 clears the '+1 PROP' flash
    // at y150 and stays far from the rail.
    ctx.fillStyle = '#f5f0e6';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED — press P to resume, R to restart', CONFIG.VIEW_WIDTH / 2, 170);
  }
  ctx.restore();
}
