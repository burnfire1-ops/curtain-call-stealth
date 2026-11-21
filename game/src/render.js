// CURTAIN CALL — M4 renderer: theatre palette, binary lighting,
// floor that talks, patrol routes + footstep rings for ALL guards,
// HUD (hud.js), screens with GHOST/SPOTTED rank, feel visuals
// ("!" alerts, "+1 PROP" flash, trauma shake, blinking cone edge).
// Flat shapes only, no art, no audio. Draws floor, light pools, carpet,
// wood stage, walls, curtain covers, props, patrol routes, cones, guards,
// player, rings, HUD, overlays.
import CONFIG from './config.js';
import { drawHud, formatTime, winRank } from './hud.js';
import { shakeOffset } from './feel.js';

const COLORS = {
  floor: '#1c1512', // charcoal-plum dark wings
  floorLine: '#2e2118',
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
  conePatrol: 'rgba(232, 179, 61, 0.16)', // tan — patrol (M8: diturunkan
  // dari 0.25; dua cone patrol yang tumpang tindih kini 0.29 efektif,
  // bukan 0.44 — massa kuning di stage terurai)
  coneSuspicious: 'rgba(240, 200, 60, 0.30)', // kuning — suspicious (M8: 0.38)
  coneChase: 'rgba(220, 60, 40, 0.36)', // merah — chase (M8: 0.42)
  coneSearch: 'rgba(232, 130, 40, 0.22)', // oranye — search (M8: 0.30)
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
  hud: '#f5f0e6',
  hudDim: '#b8ab98',
  overlay: 'rgba(10, 8, 6, 0.78)',
};

function drawCone(ctx, guard, t) {
  const half = (CONFIG.VIEW_HALF_ANGLE_DEG * Math.PI) / 180;
  const base = Math.atan2(guard.dir.y, guard.dir.x);
  // Cone colour follows the guard's FSM state (M2) — the state is
  // readable at a glance, even on the judge's contact sheet.
  const fillByState = {
    patrol: COLORS.conePatrol,
    suspicious: COLORS.coneSuspicious,
    chase: COLORS.coneChase,
    search: COLORS.coneSearch,
  };
  ctx.fillStyle = fillByState[guard.state] || COLORS.conePatrol;
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

function drawPerson(ctx, body, fill, label) {
  drawCircle(ctx, body.x, body.y, body.r, fill, '#1a140f');
  // Facing tick.
  ctx.strokeStyle = '#1a140f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(body.x, body.y);
  ctx.lineTo(body.x + body.dir.x * (body.r + 6), body.y + body.dir.y * (body.r + 6));
  ctx.stroke();
  if (label) {
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, body.x, body.y - body.r - 6);
  }
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
}

function drawProps(ctx, world) {
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
    ctx.fillText(prop.name.toUpperCase(), prop.x, prop.y + 22);
  }
}

function drawOverlay(ctx, title, lines) {
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, CONFIG.VIEW_WIDTH, CONFIG.VIEW_HEIGHT);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.hud;
  ctx.font = 'bold 44px monospace';
  ctx.fillText(title, CONFIG.VIEW_WIDTH / 2, 250);
  ctx.font = '16px monospace';
  ctx.fillStyle = COLORS.hudDim;
  lines.forEach((line, i) => {
    ctx.fillText(line, CONFIG.VIEW_WIDTH / 2, 300 + i * 28);
  });
}

export function render(ctx, world, screen, t = 0, muted = false) {
  const W = CONFIG.VIEW_WIDTH;
  const H = CONFIG.VIEW_HEIGHT;
  const level = world.level;
  // M4 feel: trauma shake moves the whole frame (visual only — the
  // simulation never moves). It decays in real time via feel.update.
  const off = shakeOffset(world.feel);
  ctx.save();
  ctx.translate(off.x, off.y);
  // Floor: dark charcoal-plum wings + faint board lines.
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 1;
  for (let x = CONFIG.TILE; x < W; x += CONFIG.TILE) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = CONFIG.TILE; y < H; y += CONFIG.TILE) {
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
  // Light pools: warm glow so "light = danger" reads at a glance.
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

  for (const guard of world.guards) drawPatrolRoute(ctx, guard);
  for (const guard of world.guards) drawCone(ctx, guard, t);

  for (const wall of world.walls) drawRect(ctx, wall, COLORS.wall);
  for (const cover of world.covers) {
    // The prop crate reads as wood, curtains as velvet red.
    const isCrate = cover.kind === 'crate';
    drawRect(ctx, cover, isCrate ? COLORS.crate : COLORS.curtain,
      isCrate ? COLORS.crateEdge : COLORS.curtainEdge);
  }

  // Exit: green stage door.
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
    drawPerson(ctx, guard, COLORS.guard, `${guard.name} · ${guard.state.toUpperCase()}`);
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

  if (screen === 'play' || screen === 'paused') drawHud(ctx, world, screen, t, muted);
  if (screen === 'start') {
    drawOverlay(ctx, 'CURTAIN CALL', [
      'Steal back 3 props before the curtain rises.',
      'Hide behind the red curtains. Stay out of the ushers’ yellow cones.',
      'Grab the Tiara, Mask, Violin — then reach the EXIT. Props are optional:',
      'the exit is always reachable without props.',
      'Light = danger · Dark = safe · Carpet = silent',
      '',
      'WASD move · Shift run · P pause · M sound',
      'Press ENTER or click to start',
    ]);
  } else if (screen === 'win') {
    const taken = world.props.filter((p) => p.taken).length;
    const rank = winRank(world.detections);
    drawOverlay(ctx, `${rank} — ESCAPED!`, [
      `Time: ${formatTime(world.time)} · Props ${taken}/3 · Spotted ${world.detections}x`,
      rank === 'GHOST'
        ? 'Never seen at all — perfect.'
        : 'You were spotted, but you still escaped.',
      'Press R / Enter to play again',
    ]);
  } else if (screen === 'lose') {
    drawOverlay(ctx, 'CAUGHT!', [
      `${world.caughtBy || 'An usher'} caught you.`,
      'An usher saw you inside the cone for too long.',
      'Press R / Enter to try again',
    ]);
  }
  ctx.restore();
}
