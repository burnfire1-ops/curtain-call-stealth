// hud.js — HUD data + drawing (rail, roster, meters).
import CONFIG from './config.js';
import { lightAt, floorAt } from './level.js'; // M15: rail VISIBILITY/NOISE words read the live floor/light

export const LEGEND =
  'LIGHT=danger · DARK=safe · CARPET=silent · RUNNING on wood=noisy';

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function worstSuspicion(guards) {
  if (!guards || guards.length === 0) return null;
  return guards.reduce((a, b) => (b.suspicion > a.suspicion ? b : a));
}

export function propsSummary(props) {
  const short = {
    tiara: 'Tiara', mask: 'Mask', violin: 'Violin',
    script: 'Script', baton: 'Baton', rose: 'Rose', // M14: Job 2 props
    key: 'Key', ledger: 'Ledger', crown: 'Crown', // M16: Job 3 props
  };
  return {
    taken: props.filter((p) => p.taken).length,
    total: props.length,
    items: props.map((p) => ({
      name: short[p.id] || p.name,
      taken: p.taken,
    })),
  };
}

// Pure, unit-tested in tests/m8.test.js.
// header panel — the roster order itself never changes).
export function guardStatesShort(states, player, distLimit = Infinity) {
  const alerted = states.filter((g) => g.state !== 'patrol');
  const patrolling = states.length - alerted.length;
  let near = null;
  if (player && distLimit < Infinity) {
    near = new Set(alerted
      .filter((g) => g.x !== undefined && g.y !== undefined)
      .map((g) => ({ g, d: Math.hypot(g.x - player.x, g.y - player.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, distLimit)
      .map((r) => r.g));
  }
  const parts = alerted.map((g) => {
    const base = `${g.name} ${g.state.toUpperCase()}`;
    if (!player || g.x === undefined || g.y === undefined) return base;
    if (near && !near.has(g)) return base;
    const tiles = Math.round(
      Math.hypot(g.x - player.x, g.y - player.y) / CONFIG.TILE);
    return `${base} ${tiles}t`;
  });
  if (patrolling > 0) parts.push(`${patrolling} PATROL`);
  return parts.join(' · ');
}

export function guardStates(guards) {
  return guards.map((g) => ({ name: g.name, state: g.state, x: g.x, y: g.y }));
}

export function cameraStates(cameras) {
  return (cameras || []).map((c) => ({ name: c.name, state: c.state }));
}

// CAM 2 SPOTTED". Pure, unit-tested in tests/m12.test.js.
export function cameraStatesShort(states) {
  return states.map((c) => `${c.name} ${c.state.toUpperCase()}`).join(' · ');
}

// Pure, unit-tested in tests/m13.test.js.
export function alarmStage(worst, alarmActive) {
  if (alarmActive || worst >= CONFIG.STAGE_ALARM) return 'ALARM';
  if (worst >= CONFIG.STAGE_HUNTED) return 'HUNTED';
  if (worst >= CONFIG.STAGE_UNEASY) return 'UNEASY';
  return 'CALM';
}

export const STAGE_COLORS = {
  CALM: '#b8ab98',
  UNEASY: '#e8a33d',
  HUNTED: '#ff9a3d',
  ALARM: '#ff3b30',
};

// Pure, unit-tested in tests/m13.test.js.
export function timeBonus(seconds) {
  if (seconds <= CONFIG.TIME_BONUS_FULL_S) return CONFIG.TIME_BONUS_MAX;
  return Math.max(0, Math.floor(
    CONFIG.TIME_BONUS_MAX
    - CONFIG.TIME_BONUS_DECAY * (seconds - CONFIG.TIME_BONUS_FULL_S)));
}

export function scoreBreakdown(world) {
  const taken = world.props.filter((p) => p.taken).length;
  const props = taken * CONFIG.PROP_SCORE;
  const ghost = world.detections === 0 ? CONFIG.GHOST_BONUS : 0;
  const time = timeBonus(world.time);
  return { props, ghost, time, total: props + ghost + time, spotted: world.detections };
}

export function propsChecklistLine(summary) {
  return `Props ${summary.taken}/${summary.total} `
    + summary.items.map((i) => `${i.taken ? '✓' : '○'} ${i.name}`).join(' ');
}

// corner/centre mapping test still applies to the new rect.
export function minimapRect() {
  return { x: 1000, y: 490, w: 160, h: 100 };
}

export function projectToMinimap(x, y, rect = minimapRect()) {
  return {
    x: rect.x + (x / CONFIG.VIEW_WIDTH) * rect.w,
    y: rect.y + (y / CONFIG.VIEW_HEIGHT) * rect.h,
  };
}

export function winRank(detections) {
  return detections === 0 ? 'GHOST' : 'SPOTTED';
}

// lastNoise is set by world.js only while the player runs.
export function lastNoiseText(world) {
  const n = world.lastNoise;
  if (!n) return 'SOUND: silent — quiet footsteps';
  const floor = n.floor === 'carpet' ? 'carpet' : 'wood';
  return `SOUND: running on ${floor} (${n.radius}px)`;
}

const COLORS = {
  hud: '#f5f0e6',
  hudDim: '#b8ab98',
  meterBg: '#3a2f24',
  meterLow: '#e8a33d',
  meterHigh: '#dc3c28',
  coin: '#ffd94d', // M12: the coin counter gold (same gold as props)
  panelFill: 'rgba(12, 9, 7, 0.82)',
  panelFillOpaque: 'rgba(12, 9, 7, 1)',
  panelBorder: 'rgba(245, 240, 230, 0.20)',
  panelShadow: 'rgba(0, 0, 0, 0.35)',
};

// translucent default).
export function drawPanel(ctx, x, y, w, h, border = COLORS.panelBorder, fill = COLORS.panelFill) {
  ctx.fillStyle = COLORS.panelShadow;
  ctx.fillRect(x + 2, y + 2, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// (x972..1188, 12px margins).
export function railRect() {
  return { x: CONFIG.RAIL_X, y: 0, w: CONFIG.RAIL_W, h: CONFIG.CANVAS_H };
}

// instead of shifting the layout.
export function railLayout() {
  const rail = railRect();
  const x = rail.x + 12; // 972 — the fixed left margin
  const cx = rail.x + rail.w / 2; // 1080 — the centred column
  const right = rail.x + rail.w - 12; // 1188 — the right margin
  return {
    rail,
    innerX: x,
    centerX: cx,
    rightX: right,
    title: { x: cx, y: 26 },
    job: { x: cx, y: 44 },
    score: { x: cx, y: 64 },
    dividerY: 74,
    objectiveHeader: { x, y: 92 },
    objectiveLines: [{ x, y: 108 }, { x, y: 123 }],
    pill: { x, y: 138, w: 104, h: 22 },
    suspicionBar: { x: right - 88, y: 144, w: 88, h: 10 },
    visibility: { label: { x, y: 178 }, word: { x: right, y: 178 } },
    noise: { label: { x, y: 196 }, word: { x: right, y: 196 } },
    noiseBar: { x, y: 204, w: 88, h: 10 },
    lootHeader: { x, y: 232 },
    propLines: [{ x, y: 248 }, { x, y: 262 }, { x, y: 276 }],
    ushersHeader: { x, y: 296 },
    rosterLineY: (i) => 312 + i * 13, // max 5 lines (312..364)
    rosterMaxLines: 5,
    goal: { x, y: 384 },
    legendHeader: { x, y: 404 },
    legendCols: [x, x + 72, x + 144],
    legendRows: [420, 435, 450],
    controls: [{ x, y: 468 }, { x, y: 482 }],
    minimap: minimapRect(),
  };
}

export function labelInsideHud(x, y) {
  const r = railRect();
  return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
}

export function buildRosterLine(states, player, summary, detections, maxWidth, measure) {
  const spotted = `SPOTTED ×${detections}`;
  const fullChecklist = propsChecklistLine(summary);
  const shortChecklist = `Props ${summary.taken}/${summary.total}`;
  const alerted = states.filter((g) => g.state !== 'patrol').length;
  const patrolling = states.length - alerted;
  const countRoster = alerted > 0
    ? `${alerted} ALERT${patrolling > 0 ? ` · ${patrolling} PATROL` : ''}`
    : `${patrolling} PATROL`;
  const tries = [
    [guardStatesShort(states, player), fullChecklist],
    [guardStatesShort(states, player, 3), fullChecklist],
    [guardStatesShort(states), fullChecklist],
    [guardStatesShort(states), shortChecklist],
    [countRoster, shortChecklist],
  ];
  for (const [roster, checklist] of tries) {
    const line = `${roster}   |   ${checklist}   |   ${spotted}`;
    if (measure(line) <= maxWidth) return line;
  }
  const [roster, checklist] = tries[tries.length - 1];
  return `${roster}   |   ${checklist}   |   ${spotted}`;
}

export function segmentCount(value, total) {
  const v = Math.max(0, Math.min(1, value));
  return Math.max(0, Math.min(total, Math.round(v * total)));
}

export function drawSegmentedBar(ctx, x, y, segW, segH, gap, filled, total, fillColor) {
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < filled ? fillColor : COLORS.meterBg;
    ctx.fillRect(x + i * (segW + gap), y, segW, segH);
  }
}

export function drawMinimap(ctx, world) {
  const rect = minimapRect();
  // HUD-fix: opaque fill — the translucent default let the
  // "LEAD'S VIOLIN" floor label show through the panel.
  drawPanel(ctx, rect.x, rect.y, rect.w, rect.h, COLORS.panelBorder, COLORS.panelFillOpaque);
  const p = (x, y) => projectToMinimap(x, y, rect);
  const a = p(CONFIG.WALL, CONFIG.WALL);
  const b = p(CONFIG.VIEW_WIDTH - CONFIG.WALL, CONFIG.VIEW_HEIGHT - CONFIG.WALL);
  ctx.strokeStyle = 'rgba(245, 240, 230, 0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x - 1, b.y - a.y - 1);
  // Covers (curtains + crate), dim.
  ctx.fillStyle = 'rgba(245, 240, 230, 0.18)';
  for (const cover of world.level.covers) {
    const c0 = p(cover.x, cover.y);
    const c1 = p(cover.x + cover.w, cover.y + cover.h);
    ctx.fillRect(c0.x, c0.y, Math.max(1, c1.x - c0.x), Math.max(1, c1.y - c0.y));
  }
  // Lasers: red line while ON, dim dashed while OFF.
  for (const laser of world.lasers || []) {
    const l0 = p(laser.x1, laser.y1);
    const l1 = p(laser.x2, laser.y2);
    ctx.strokeStyle = laser.on ? 'rgba(255, 70, 60, 0.95)' : 'rgba(255, 70, 60, 0.30)';
    ctx.lineWidth = laser.on ? 2 : 1;
    if (!laser.on) ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(l0.x, l0.y);
    ctx.lineTo(l1.x, l1.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const e0 = p(world.exit.x, world.exit.y);
  const e1 = p(world.exit.x + world.exit.w, world.exit.y + world.exit.h);
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(e0.x, e0.y, Math.max(2, e1.x - e0.x), Math.max(2, e1.y - e0.y));
  for (const prop of world.props) {
    const pp = p(prop.x, prop.y);
    ctx.fillStyle = prop.taken ? 'rgba(184, 171, 152, 0.6)' : '#ffd94d';
    ctx.beginPath();
    ctx.moveTo(pp.x, pp.y - 3);
    ctx.lineTo(pp.x + 3, pp.y);
    ctx.lineTo(pp.x, pp.y + 3);
    ctx.lineTo(pp.x - 3, pp.y);
    ctx.closePath();
    ctx.fill();
  }
  for (const cam of world.cameras || []) {
    const cp = p(cam.x, cam.y);
    ctx.fillStyle = '#2dd4bf';
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const guard of world.guards) {
    const gp = p(guard.x, guard.y);
    ctx.fillStyle = guard.state === 'chase' ? '#ff3b30' : '#e8a33d';
    ctx.beginPath();
    ctx.arc(gp.x, gp.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player: white dot with a dark ring, always on top.
  const pp = p(world.player.x, world.player.y);
  ctx.fillStyle = '#f5f0e6';
  ctx.beginPath();
  ctx.arc(pp.x, pp.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a140f';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// it works on every canvas the game runs on).
function pillPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(x + rr, y + h);
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rr);
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

const pillByState = {
  patrol: { fill: 'rgba(232, 179, 61, 0.14)', border: 'rgba(232, 179, 61, 0.45)', text: COLORS.hudDim },
  suspicious: { fill: '#ffce54', border: '#ffce54', text: '#1a140f' },
  chase: { fill: '#ff6b57', border: '#ff6b57', text: '#1a140f' },
  search: { fill: '#ff9a3d', border: '#ff9a3d', text: '#1a140f' },
  sweep: { fill: 'rgba(232, 179, 61, 0.14)', border: 'rgba(232, 179, 61, 0.45)', text: COLORS.hudDim },
  spotted: { fill: '#ffce54', border: '#ffce54', text: '#1a140f' },
  alarm: { fill: '#ff3b30', border: '#ff3b30', text: '#ffffff' },
};

// Pure, unit-tested in tests/m15.test.js.
export function railRosterLines(world) {
  const player = world.player;
  const tile = (g) => (g.x === undefined ? ''
    : ` ${Math.round(Math.hypot(g.x - player.x, g.y - player.y) / CONFIG.TILE)}t`);
  const alerted = world.guards
    .filter((g) => g.state !== 'patrol')
    .map((g) => `${g.name} ${g.state.toUpperCase()}${tile(g)}`);
  const cams = (world.cameras || []).map((c) => {
    const n = c.name.replace('CAM ', 'C');
    return `${n} ${c.state === 'spotted' ? 'SPOTTED' : 'SWEEP'}`;
  });
  const patrolling = world.guards.filter((g) => g.state === 'patrol').length;
  const lines = [...alerted, ...cams];
  if (patrolling > 0) lines.push(`${patrolling} PATROL`);
  const max = railLayout().rosterMaxLines;
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max - 1), `+${lines.length - (max - 1)} more`];
}

export function visibilityWord(world) {
  return lightAt(world.player.x, world.player.y, world.level) === CONFIG.LIGHT_POOL
    ? 'IN THE LIGHT' : 'IN THE DARK';
}

// from the same floorAt the footstep sound uses.
export function noiseWord(world) {
  const n = world.lastNoise;
  if (!n || n.radius <= 0) return 'silent';
  return floorAt(world.player.x, world.player.y, world.level) === 'carpet'
    ? 'quiet on carpet' : 'loud on wood';
}

// columns x 3 rows. Pure data; drawHud draws the icons.
export function legendItems() {
  return [
    { key: 'usher', label: 'usher', icon: 'usher' },
    { key: 'curtain', label: 'curtain', icon: 'curtain' },
    { key: 'light', label: 'light', icon: 'light' },
    { key: 'carpet', label: 'carpet', icon: 'carpet' },
    { key: 'coin', label: 'coin', icon: 'coin' },
    { key: 'smoke', label: 'smoke', icon: 'smoke' },
    { key: 'camera', label: 'camera', icon: 'camera' },
    { key: 'laser', label: 'laser', icon: 'laser' },
    { key: 'exit', label: 'exit', icon: 'exit' },
  ];
}

// on the quiet CALM pill.
const stagePill = {
  CALM: { fill: '#3a2f24', border: '#5a6b7a', text: '#b8ab98' },
  UNEASY: { fill: '#e8a33d', border: '#e8a33d', text: '#1a140f' },
  HUNTED: { fill: '#ff9a3d', border: '#ff9a3d', text: '#1a140f' },
  ALARM: { fill: '#ff3b30', border: '#ff3b30', text: '#ffffff' },
};

// x+14 on the same baseline.
function drawLegendIcon(ctx, icon, x, y) {
  ctx.save();
  if (icon === 'usher') {
    ctx.fillStyle = '#e8a33d';
    ctx.beginPath(); ctx.arc(x + 5, y + 5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(232, 179, 61, 0.5)';
    ctx.beginPath(); ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + 10, y); ctx.lineTo(x + 10, y + 10); ctx.closePath(); ctx.fill();
  } else if (icon === 'curtain') {
    ctx.fillStyle = '#8e1f2f'; ctx.fillRect(x, y + 1, 10, 8);
    ctx.strokeStyle = 'rgba(255, 120, 140, 0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 5, y + 1); ctx.lineTo(x + 5, y + 9); ctx.stroke();
  } else if (icon === 'light') {
    ctx.fillStyle = 'rgba(255, 190, 90, 0.9)';
    ctx.beginPath(); ctx.arc(x + 5, y + 5, 4, 0, Math.PI * 2); ctx.fill();
  } else if (icon === 'carpet') {
    ctx.fillStyle = '#3a1f2b'; ctx.fillRect(x, y + 1, 10, 8);
    ctx.fillStyle = '#4d2a38'; ctx.fillRect(x + 2, y + 3, 2, 2); ctx.fillRect(x + 6, y + 6, 2, 2);
  } else if (icon === 'coin') {
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath(); ctx.moveTo(x + 5, y); ctx.lineTo(x + 10, y + 5); ctx.lineTo(x + 5, y + 10); ctx.lineTo(x, y + 5); ctx.closePath(); ctx.fill();
  } else if (icon === 'smoke') {
    ctx.fillStyle = 'rgba(200, 200, 205, 0.8)';
    ctx.beginPath(); ctx.arc(x + 5, y + 5, 4, 0, Math.PI * 2); ctx.fill();
  } else if (icon === 'camera') {
    ctx.fillStyle = 'rgba(45, 212, 191, 0.9)';
    ctx.beginPath(); ctx.moveTo(x + 1, y + 5); ctx.lineTo(x + 9, y + 1); ctx.lineTo(x + 9, y + 9); ctx.closePath(); ctx.fill();
  } else if (icon === 'laser') {
    ctx.strokeStyle = 'rgba(255, 70, 60, 0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x + 10, y + 5); ctx.stroke();
  } else if (icon === 'exit') {
    ctx.fillStyle = '#2e7d32'; ctx.fillRect(x + 1, y + 1, 8, 8);
    ctx.fillStyle = '#a5d6a7'; ctx.fillRect(x + 4, y + 3, 2, 4);
  }
  ctx.restore();
}

// M14 campaign object (default = a fresh session).
export function drawHud(ctx, world, screen, t, muted = false, campaign = null) {
  const camp = campaign || { selected: 0, cleared: [false, false, false], best: [null, null, null] };
  const L = railLayout();
  // M13: the laser meter feeds the same bar + stage word.
  const worst = worstSuspicion(
    world.guards.concat(world.cameras || []),
  ) || { state: 'patrol', suspicion: 0 };
  const worstValue = Math.max(worst.suspicion, world.laserSuspicion || 0);
  const alarming = !!(world.alarm && world.alarm.active);
  const stage = alarmStage(worstValue, alarming);
  const score = scoreBreakdown(world);
  const summary = propsSummary(world.props);

  // The rail slab + its divider from the playfield.
  ctx.fillStyle = 'rgba(13, 10, 8, 0.97)';
  ctx.fillRect(L.rail.x, L.rail.y, L.rail.w, L.rail.h);
  ctx.fillStyle = '#4a3a28';
  ctx.fillRect(L.rail.x, L.rail.y, 1, L.rail.h);

  ctx.textAlign = 'center';
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText('CURTAIN CALL', L.title.x, L.title.y);
  ctx.font = '11px monospace';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(`JOB ${world.jobIndex + 1} · ${world.jobName}`, L.job.x, L.job.y);
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = COLORS.hud;
  const total = campaignTotal(camp.best);
  const scoreText = screen === 'select'
    ? (total > 0 ? `CAMPAIGN BEST ${total}` : 'NO JOBS CLEARED YET')
    : `SCORE ${score.total} · ${muted ? `${formatTime(world.time)} · MUTE` : formatTime(world.time)}`;
  ctx.fillText(scoreText, L.score.x, L.score.y);
  ctx.textAlign = 'left';

  // Divider under the header block.
  ctx.fillStyle = 'rgba(245, 240, 230, 0.20)';
  ctx.fillRect(L.innerX, L.dividerY, L.rail.w - 24, 1);

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText('OBJECTIVE', L.objectiveHeader.x, L.objectiveHeader.y);
  ctx.font = '12px monospace';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('Steal back 3 props', L.objectiveLines[0].x, L.objectiveLines[0].y);
  ctx.fillText('Reach the EXIT', L.objectiveLines[1].x, L.objectiveLines[1].y);

  // same worst-suspicion value in 5 segments.
  const pill = stagePill[stage];
  pillPath(ctx, L.pill.x, L.pill.y, L.pill.w, L.pill.h, 9);
  ctx.fillStyle = pill.fill;
  ctx.fill();
  ctx.strokeStyle = pill.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = pill.text;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(stage, L.pill.x + L.pill.w / 2, L.pill.y + 15);
  ctx.textAlign = 'left';
  const pulse = worstValue > 0.7 ? 0.65 + 0.35 * Math.sin(t * 10) : 1;
  ctx.globalAlpha = pulse;
  drawSegmentedBar(ctx, L.suspicionBar.x, L.suspicionBar.y, 16, L.suspicionBar.h, 2,
    segmentCount(worstValue, 5), 5,
    worstValue > 0 ? COLORS.meterHigh : COLORS.meterLow);
  ctx.globalAlpha = 1;

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText('VISIBILITY', L.visibility.label.x, L.visibility.label.y);
  ctx.fillText('NOISE', L.noise.label.x, L.noise.label.y);
  const vis = visibilityWord(world);
  ctx.font = '12px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = vis === 'IN THE LIGHT' ? '#ffb84d' : '#a5d6a7';
  ctx.fillText(vis, L.visibility.word.x, L.visibility.word.y);
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(noiseWord(world), L.noise.word.x, L.noise.word.y);
  ctx.textAlign = 'left';
  const noiseRadius = world.lastNoise ? world.lastNoise.radius : 0;
  drawSegmentedBar(ctx, L.noiseBar.x, L.noiseBar.y, 16, L.noiseBar.h, 2,
    segmentCount(noiseRadius / CONFIG.NOISE_RUN_WOOD, 5), 5, COLORS.meterLow);

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText(`LOOT · Props ${summary.taken}/${summary.total}`, L.lootHeader.x, L.lootHeader.y);
  ctx.font = '12px monospace';
  summary.items.forEach((item, i) => {
    ctx.fillStyle = item.taken ? COLORS.coin : COLORS.hudDim;
    ctx.fillText(`${item.taken ? '✓' : '○'} ${item.name}`, L.propLines[i].x, L.propLines[i].y);
  });

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText('GUARDS', L.ushersHeader.x, L.ushersHeader.y);
  ctx.font = '12px monospace';
  railRosterLines(world).forEach((line, i) => {
    ctx.fillStyle = /PATROL/.test(line) ? COLORS.hudDim : COLORS.hud;
    ctx.fillText(line, L.innerX, L.rosterLineY(i));
  });

  // has been spotted yet on a title screen).
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = world.detections === 0 ? '#a5d6a7' : '#ff8c42';
  const goalText = screen === 'select'
    ? 'EXIT: OPEN'
    : `EXIT: OPEN · ${world.detections === 0 ? 'GHOST' : `SPOTTED ×${world.detections}`}`;
  ctx.fillText(goalText, L.goal.x, L.goal.y);

  // (game-ui-ux: icon + label, never colour alone).
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText('LEGEND', L.legendHeader.x, L.legendHeader.y);
  ctx.font = '11px monospace';
  legendItems().forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const ix = L.legendCols[col];
    const iy = L.legendRows[row];
    drawLegendIcon(ctx, item.icon, ix, iy - 8);
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText(item.label, ix + 14, iy);
  });

  // screen's HOW TO PLAY panel).
  ctx.font = '10px monospace';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('WASD move · Shift run · C coin', L.controls[0].x, L.controls[0].y);
  ctx.fillText('X smoke · P pause · M sound', L.controls[1].x, L.controls[1].y);

  // Minimap, bottom of the rail, always on.
  drawMinimap(ctx, world);
}



export function jobStatus(campaign, i) {
  if (campaign.cleared[i]) return 'cleared';
  if (i === 0 || campaign.cleared[i - 1]) return 'open';
  return 'locked';
}

export function canSelectJob(campaign, i) {
  return jobStatus(campaign, i) !== 'locked';
}

// counts 0). The win screen shows this, not the run total.
export function campaignTotal(best) {
  return best.reduce((sum, b) => sum + (b ? b.score : 0), 0);
}

export function updateBest(best, score, time, stars = 0) {
  if (!best) return { score, time, stars };
  // The best score and the best stars are independent: a faster run
  // with fewer stars never lowers the stars, and a slower run with
  // more stars never lowers the score.
  return {
    score: Math.max(best.score, score),
    time: score > best.score ? time : best.time,
    stars: Math.max(best.stars || 0, stars),
  };
}

// M16 stars (display only — never change the score): 3 = GHOST + all
// props + within par; 2 = GHOST; 1 = cleared. Par comes from
// CONFIG.PAR_S (per job); the caller passes the job's par.
export function starsForJob(detections, taken, total, time, par) {
  if (detections === 0 && taken === total && time <= par) return 3;
  if (detections === 0) return 2;
  return 1;
}

export function starsText(n) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

// --- select screen (pure layout + content) ---

// edge (the HUD-fix rule, applied to the new screen too).
export function selectLayout() {
  const cards = [
    { x: 20, y: 108, w: 300, h: 128 },
    { x: 330, y: 108, w: 300, h: 128 },
    { x: 640, y: 108, w: 300, h: 128 },
  ];
  const howto = { x: 90, y: 250, w: 780, h: 272 };
  return {
    titleY: 52,
    taglineY: 84,
    cards,
    howto,
    howtoX: howto.x + PANEL_TEXT_MARGIN,
    howtoFirstBaseline: 274,
    howtoPitch: 19,
    footerY: 548,
    bestY: 570,
  };
}

// HOW TO PLAY panel (user 06:25 WIB).
export function selectCardLines(level, campaign, index) {
  // The counts line drops '· N props' (every job has 3, and HOW TO
  // PLAY says so) and shortens 'cameras' to 'cams' — the full format
  // is 42 chars and overflows a 300px card at 12px (panel − 80px rule).
  const counts = `${level.guards.length} guards · ${level.cameras.length} cams · ${level.lasers.length} lasers`;
  const status = jobStatus(campaign, index);
  const best = campaign.best[index];
  const statusLine = status === 'cleared' ? 'CLEARED'
    : status === 'locked' ? `LOCKED — clear Job ${index} to open` : 'NOT CLEARED';
  const bestLine = status === 'cleared' && best
    ? `BEST ${best.score} · ${formatTime(best.time)} · ${starsText(best.stars || 0)}`
    : status === 'locked' ? '' : `PRESS ${index + 1}`;
  return [
    `${index + 1} · ${level.name}`,
    counts,
    statusLine,
    bestLine,
  ];
}

// appear on the map labels and the job cards' counts.
export function selectHowtoLines() {
  return [
    'HOW TO PLAY',
    'Steal back the props before the curtain rises.',
    'Grab the 3 props — then reach the EXIT.',
    'Props are optional: the exit is always reachable without them.',
    "Hide behind the red curtains. Stay out of the ushers' yellow cones.",
    '',
    'Light = danger · Dark = safe · Carpet = silent',
    'C throws a coin to distract guards.',
    'X throws smoke to block sight.',
    'Cameras sweep teal cones — time them.',
    'Lasers pulse — cross only when off.',
    '',
    'WASD move · Shift run · C coin · X smoke · P pause · M sound',
  ];
}

export function jobAtPoint(x, y, layout = selectLayout()) {
  for (let i = 0; i < layout.cards.length; i++) {
    const c = layout.cards[i];
    if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return i;
  }
  return -1;
}

// --- panel text rules (user 06:25 WIB) ---

export const PANEL_TEXT_MARGIN = 40;

export function panelTextFits(text, fontSize, panelW, measure) {
  return measure(text, fontSize) <= panelW - PANEL_TEXT_MARGIN * 2;
}

// --- win / lose screen text (pure data) ---

// (campaignTotal), so a worse replay never lowers it.
export function winScreenLines(world, campaign) {
  const taken = world.props.filter((p) => p.taken).length;
  const s = scoreBreakdown(world);
  const rank = winRank(world.detections);
  const job = world.jobIndex || 0;
  const total = campaignTotal(campaign.best);
  const last = campaign.best.length - 1; // only the last job closes the campaign
  const par = CONFIG.PAR_S[job];
  const stars = starsForJob(world.detections, taken, world.props.length, world.time, par);
  const body = [
    `JOB ${job + 1} · ${world.jobName || 'THE MIDNIGHT THEATRE'} — CLEARED`,
    `Time: ${formatTime(world.time)} · Props ${taken}/${world.props.length} · Spotted ${world.detections}x`,
    `Score: ${s.total} — Props ${s.props} + Ghost ${s.ghost} + Time ${s.time}`,
    `STARS ${starsText(stars)} · PAR ${formatTime(par)}`,
    job < last ? `CAMPAIGN TOTAL ${total}` : `CAMPAIGN COMPLETE — TOTAL ${total}`,
  ];
  const footer = job < last
    ? 'NEXT JOB — PRESS ENTER · R TO REPLAY'
    : 'PRESS ENTER — BACK TO TITLE · R TO REPLAY';
  return { title: `${rank} — ESCAPED!`, body, footer };
}

export function loseScreenLines(world) {
  const s = scoreBreakdown(world);
  const body = [
    `${world.caughtBy || 'An usher'} caught you.`,
    'An usher saw you inside the cone for too long.',
    `Score: ${s.total} — Props ${s.props} + Time ${s.time}`,
  ];
  return { title: 'CAUGHT!', body, footer: 'PRESS R OR ENTER TO TRY AGAIN' };
}

// --- overlay panel rect (single source of truth) ---

// count, same as M11.)
export function overlayPanelRect(rows) {
  return { x: CONFIG.VIEW_WIDTH / 2 - 330, y: 190, w: 660, h: 130 + rows * 28 };
}

// --- label-box occlusion (user 06:22 WIB) ---

// when a canvas does not report the boxes).
export function textBox(text, x, y, metrics, align = 'center') {
  const left = align === 'center' ? x - metrics.width / 2
    : align === 'right' ? x - metrics.width : x;
  return {
    x: left,
    y: y - metrics.ascent,
    w: metrics.width,
    h: metrics.ascent + metrics.descent,
  };
}

// edge (2px) already reads as clipped, so it is skipped.
export function rectsOverlap(a, b, margin = 2) {
  return a.x - margin < b.x + b.w && a.x + a.w + margin > b.x
    && a.y - margin < b.y + b.h && a.y + a.h + margin > b.y;
}

export function labelOccluded(box, occluders, margin = 2) {
  return occluders.some((r) => rectsOverlap(box, r, margin));
}

export function laserOccluder(laser, pad = 4) {
  const x = Math.min(laser.x1, laser.x2) - pad;
  const y = Math.min(laser.y1, laser.y2) - pad;
  const w = Math.abs(laser.x2 - laser.x1) + pad * 2;
  const h = Math.abs(laser.y2 - laser.y1) + pad * 2;
  return { x, y, w: Math.max(w, pad * 2), h: Math.max(h, pad * 2) };
}

// laser beams.
export function labelOccluders({ hud = false, overlay = null, lasers = [] } = {}) {
  const out = [];
  if (hud) out.push(railRect()); // M15: the rail is the only HUD panel
  if (overlay) out.push(overlay);
  for (const l of lasers) out.push(laserOccluder(l));
  return out;
}
