// CURTAIN CALL — M4 HUD: pure data for the HUD + the HUD drawing itself.
// game-ui-ux: the HUD is driven by game state (props, guard states,
// suspicion) — the draw function only reads, it never mutates the world.
// Pure helpers are unit-tested (tests/m4.test.js); drawHud is verified
// visually via headless screenshots, like render.js in M1–M3.
import CONFIG from './config.js';

// Legend (tesis differentiator 4): light = danger, dark = safe, and the
// floor that talks — readable at a glance, also on the judge's sheet.
export const LEGEND =
  'LIGHT=danger · DARK=safe · CARPET=silent · RUNNING on wood=noisy';

// Seconds -> "mm:ss", flooring the fraction (a 87.4s run reads 01:27).
export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// The guard the player should worry about most (highest suspicion).
// Null when there is no guard (defensive; the level always ships 5).
export function worstSuspicion(guards) {
  if (!guards || guards.length === 0) return null;
  return guards.reduce((a, b) => (b.suspicion > a.suspicion ? b : a));
}

// Props with names + taken flags, in level order; short names keep the
// HUD line inside the 960px canvas (full names stay on the map labels).
export function propsSummary(props) {
  const short = { tiara: 'Tiara', mask: 'Mask', violin: 'Violin' };
  return {
    taken: props.filter((p) => p.taken).length,
    total: props.length,
    items: props.map((p) => ({
      name: short[p.id] || p.name,
      taken: p.taken,
    })),
  };
}

// M8: compressed guard list — only non-patrol guards are named; patrols
// collapse into a count ("U3 CHASE · 5 PATROL", "6 PATROL" when all calm).
// The alarming state is the signal; patrol is the default. The full
// per-guard list still exists via guardStates() (tested, untouched).
// Pure, unit-tested in tests/m8.test.js.
// M13: distances only for the `distLimit` nearest alerted guards
// (the fallback when the full-distance line would overflow the
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
    const base = `${g.name.replace('USHER ', 'U')} ${g.state.toUpperCase()}`;
    if (!player || g.x === undefined || g.y === undefined) return base;
    if (near && !near.has(g)) return base;
    const tiles = Math.round(
      Math.hypot(g.x - player.x, g.y - player.y) / CONFIG.TILE);
    return `${base} ${tiles}t`;
  });
  if (patrolling > 0) parts.push(`${patrolling} PATROL`);
  return parts.join(' · ');
}

// One short line per usher: name + FSM state, in level order.
// M13: positions ride along so the roster can show tile distances.
export function guardStates(guards) {
  return guards.map((g) => ({ name: g.name, state: g.state, x: g.x, y: g.y }));
}

// One short line per camera: name + sweep state, in level order.
// M12: 'sweep' (patrolling its arc) or 'spotted' (suspicion >= 0.5).
export function cameraStates(cameras) {
  return (cameras || []).map((c) => ({ name: c.name, state: c.state }));
}

// M12: camera roster, same shape as the guard list — "CAM 1 SWEEP ·
// CAM 2 SPOTTED". Pure, unit-tested in tests/m12.test.js.
export function cameraStatesShort(states) {
  return states.map((c) => `${c.name} ${c.state.toUpperCase()}`).join(' · ');
}

// M13 alarm stages (game-ui-ux: a DISPLAY mapping over the worst
// suspicion — the fill rates never change). The building alarm
// overrides everything: an active alarm is ALARM at any meter value.
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

// M13 time bonus: full +200 at <= 60s, then -2/s, floored at 0.
// Pure, unit-tested in tests/m13.test.js.
export function timeBonus(seconds) {
  if (seconds <= CONFIG.TIME_BONUS_FULL_S) return CONFIG.TIME_BONUS_MAX;
  return Math.max(0, Math.floor(
    CONFIG.TIME_BONUS_MAX
    - CONFIG.TIME_BONUS_DECAY * (seconds - CONFIG.TIME_BONUS_FULL_S)));
}

// M13 score (informative only — win/lose rules never change):
// props x300 + GHOST +500 (0 detections) + time bonus. The live
// header number equals the win-screen total if you won right now
// (a run with detections already lost the GHOST bonus). Pure.
export function scoreBreakdown(world) {
  const taken = world.props.filter((p) => p.taken).length;
  const props = taken * CONFIG.PROP_SCORE;
  const ghost = world.detections === 0 ? CONFIG.GHOST_BONUS : 0;
  const time = timeBonus(world.time);
  return { props, ghost, time, total: props + ghost + time, spotted: world.detections };
}

// M13: the objective checklist line — a taken prop shows ✓, the
// rest ○ ("Props 2/3 ✓ Tiara ✓ Mask ○ Violin"). Extracted pure so
// the checklist is unit-tested, not only screenshot-verified.
export function propsChecklistLine(summary) {
  return `Props ${summary.taken}/${summary.total} `
    + summary.items.map((i) => `${i.taken ? '✓' : '○'} ${i.name}`).join(' ');
}

// M13 minimap (game-ui-ux: a tactical map, always on, bottom-right
// — the corner the header and noise panels do not use). The panel
// sits clear of the header (y8..92) and the noise panel (y104..126);
// it covers floor only (the Violin prop sits under it, and the map
// itself marks the prop as a gold diamond, so the objective stays
// readable). Pure projection — unit-tested in tests/m13.test.js.
export function minimapRect() {
  return { x: 764, y: 476, w: 188, h: 116 };
}

export function projectToMinimap(x, y, rect = minimapRect()) {
  return {
    x: rect.x + (x / CONFIG.VIEW_WIDTH) * rect.w,
    y: rect.y + (y / CONFIG.VIEW_HEIGHT) * rect.h,
  };
}

// Win rank (tesis Q3): GHOST only when the player was never spotted —
// detections counts every chase entry, so any alarm breaks the ghost.
export function winRank(detections) {
  return detections === 0 ? 'GHOST' : 'SPOTTED';
}

// Last noise the player made: floor material + radius, or silence.
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
  // M11: framed panels (game-ui-ux: panel depth like top-10 LB) —
  // dark translucent fill + 1px light border + offset shadow.
  panelFill: 'rgba(12, 9, 7, 0.82)',
  panelBorder: 'rgba(245, 240, 230, 0.20)',
  panelShadow: 'rgba(0, 0, 0, 0.35)',
};

// M11: framed panel (dark fill + offset shadow + 1px border) — the
// top-10 HUD depth treatment. Used by the HUD and by render.js
// overlays; pure drawing, no game state.
export function drawPanel(ctx, x, y, w, h, border = COLORS.panelBorder) {
  ctx.fillStyle = COLORS.panelShadow;
  ctx.fillRect(x + 2, y + 2, w, h);
  ctx.fillStyle = COLORS.panelFill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// M11: HUD panel rects — header holds title/timer/meter/legend/guard
// lines; noise holds the SOUND line + its segment bar. Both clear the
// EXIT box (860,40,60,60) and the Star Tiara label (ends y~112 at
// x~70); the noise panel starts x=560, clear of the Golden Mask label
// (ends x~553) and 4px below usher 2's label (baseline y=100).
export function hudPanelRects() {
  return {
    header: { x: 8, y: 8, w: 836, h: 84 },
    noise: { x: 560, y: 104, w: 392, h: 22 },
  };
}

// M11: how many segments of a segmented bar are filled (0..total),
// from a 0..1 value — pure, unit-tested (tests/m11.test.js).
export function segmentCount(value, total) {
  const v = Math.max(0, Math.min(1, value));
  return Math.max(0, Math.min(total, Math.round(v * total)));
}

// M11: segmented bar (top-10 style: ALARM / HEAT bars) — empty
// segments in meterBg, filled ones in fillColor. Pure drawing.
export function drawSegmentedBar(ctx, x, y, segW, segH, gap, filled, total, fillColor) {
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < filled ? fillColor : COLORS.meterBg;
    ctx.fillRect(x + i * (segW + gap), y, segW, segH);
  }
}

// M13 minimap drawing: panel + room bounds + covers + exit + props
// + guards + cameras + lasers + player, all projected from world
// coordinates. Guards are amber dots (red while chasing), cameras
// teal dots, lasers red lines (dim dashed while OFF), the player a
// white dot with a dark ring. Pure drawing, reads the world only.
export function drawMinimap(ctx, world) {
  const rect = minimapRect();
  drawPanel(ctx, rect.x, rect.y, rect.w, rect.h);
  const p = (x, y) => projectToMinimap(x, y, rect);
  // Room bounds (the outer walls, inset by the wall thickness).
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
  // Exit: green square. Props: gold diamonds (grey when taken).
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
  // Cameras: teal dots. Guards: amber dots, red while chasing.
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

// Rounded-rect path for the state pill (arcs, not ctx.roundRect, so
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

// M11: state pill colours — the pill fill IS the state colour (top-10
// big-badge style); text is dark on a filled pill, dim on the patrol
// pill (which is only a tinted outline). Labels stay the M10 strings.
const pillByState = {
  patrol: { fill: 'rgba(232, 179, 61, 0.14)', border: 'rgba(232, 179, 61, 0.45)', text: COLORS.hudDim },
  suspicious: { fill: '#ffce54', border: '#ffce54', text: '#1a140f' },
  chase: { fill: '#ff6b57', border: '#ff6b57', text: '#1a140f' },
  search: { fill: '#ff9a3d', border: '#ff9a3d', text: '#1a140f' },
  // M12: camera states reuse the guard palette (a spotted camera is
  // a suspicious-grade alert); 'sweep' is the patrol-grade default.
  sweep: { fill: 'rgba(232, 179, 61, 0.14)', border: 'rgba(232, 179, 61, 0.45)', text: COLORS.hudDim },
  spotted: { fill: '#ffce54', border: '#ffce54', text: '#1a140f' },
  // M12: the building alarm overrides every other pill, solid red.
  alarm: { fill: '#ff3b30', border: '#ff3b30', text: '#ffffff' },
};

// Suspicion meter, guard list, props, timer, legend, noise — all the
// data the HUD needs, drawn from the world each frame. `t` is real time
// (seconds) and drives the pulse: above 0.7 suspicion the bar throbs so
// a near-miss reads even at contact-sheet size. `muted` shows MUTE
// next to the timer (the M key itself is documented on the start
// screen — the controls line is too long to carry it, see below).
export function drawHud(ctx, world, screen, t, muted = false) {
  // M12: the meter shows the worst suspicion of guards AND cameras —
  // a camera filling up is as alarming as a guard filling up.
  // M13: the laser meter feeds the same bar + stage word.
  const worst = worstSuspicion(
    world.guards.concat(world.cameras || []),
  ) || { state: 'patrol', suspicion: 0 };
  const worstValue = Math.max(worst.suspicion, world.laserSuspicion || 0);
  const score = scoreBreakdown(world);
  const summary = propsSummary(world.props);
  const panels = hudPanelRects();

  // M11: framed panels replace the flat M5 backing strips (game-ui-ux:
  // depth + hierarchy like top-10 LB). All info from M4/M8 is kept —
  // title, timer, meter, state, legend, guard list, props, SOUND.
  drawPanel(ctx, panels.header.x, panels.header.y, panels.header.w, panels.header.h);
  drawPanel(ctx, panels.noise.x, panels.noise.y, panels.noise.w, panels.noise.h);

  ctx.textAlign = 'left';
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText('CURTAIN CALL', 16, 24);
  // Timer, top-right INSIDE the header panel (M10: it floated at
  // VIEW_WIDTH-16, unbacked, above the EXIT box). M13: the live
  // score rides on the same row, left of the timer.
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px monospace';
  const timeText = muted ? `${formatTime(world.time)} · MUTE` : formatTime(world.time);
  if (muted) ctx.fillStyle = '#ff6b57';
  ctx.fillText(`SCORE ${score.total} · ${timeText}`, panels.header.x + panels.header.w - 8, 24);
  ctx.fillStyle = COLORS.hud;
  ctx.textAlign = 'left';

  // Suspicion: segmented bar (M11, top-10 ALARM/HEAT style) + state
  // pill sized to the label. Strings unchanged from M10.
  // M12: a camera 'spotted' reads like a guard 'suspicious'; the
  // building alarm overrides every pill with a solid-red ALARM!.
  const stateText = {
    patrol: 'unseen',
    suspicious: 'SUSPICIOUS! Hide!',
    chase: 'RUN! Hide!',
    search: 'searching for you…',
    sweep: 'unseen',
    spotted: 'SPOTTED! Hide!',
  };
  const alarming = !!(world.alarm && world.alarm.active);
  const label = alarming ? 'ALARM!' : (stateText[worst.state] || stateText.patrol);
  const barX = 16;
  const barY = 34;
  const segW = 26;
  const segH = 10;
  const segGap = 2;
  const segTotal = 5;
  const pulse = worstValue > 0.7 ? 0.65 + 0.35 * Math.sin(t * 10) : 1;
  ctx.globalAlpha = pulse;
  drawSegmentedBar(ctx, barX, barY, segW, segH, segGap,
    segmentCount(worstValue, segTotal), segTotal,
    worstValue > 0 ? COLORS.meterHigh : COLORS.meterLow);
  ctx.globalAlpha = 1;
  const pill = alarming ? pillByState.alarm
    : (pillByState[worst.state] || pillByState.patrol);
  ctx.font = '12px monospace';
  const tw = ctx.measureText(label).width;
  const px = barX + segTotal * segW + (segTotal - 1) * segGap + 8;
  const py = barY - 4;
  pillPath(ctx, px, py, tw + 16, 18, 9);
  ctx.fillStyle = pill.fill;
  ctx.fill();
  ctx.strokeStyle = pill.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = pill.text;
  ctx.textAlign = 'center';
  ctx.fillText(label, px + (tw + 16) / 2, py + 13);
  ctx.textAlign = 'left';
  // M13: the alarm stage word right after the pill (CALM / UNEASY /
  // HUNTED / ALARM) — the stage is a display mapping over the worst
  // suspicion, so it never disagrees with the bar next to it.
  const stage = alarmStage(worstValue, alarming);
  ctx.fillStyle = STAGE_COLORS[stage];
  ctx.font = 'bold 12px monospace';
  ctx.fillText(stage, px + tw + 16 + 8, py + 13);

  // M12: coin counter, right-aligned on the meter row (the row's
  // right side was empty; the count never moves the other HUD rows).
  // M13: the smoke counter rides next to it, same row, same gold.
  const coins = typeof world.coins === 'number' ? world.coins : 0;
  const smokes = typeof world.smokes === 'number' ? world.smokes : 0;
  ctx.fillStyle = COLORS.coin;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`COINS ×${coins} · SMOKE ×${smokes}`, panels.header.x + panels.header.w - 8, barY + 10);
  ctx.textAlign = 'left';

  // M8: short legend ONLY on the play HUD — no controls line (full
  // controls live on the start screen) and no full LEGEND: the LEGEND
  // constant is test-locked to all four rules (tests/m4.test.js) and
  // the complete rules stay on the start screen. The dropped 4th rule
  // (running on wood is noisy) is carried by the SOUND line + the
  // player noise ring instead. One short row, ~270px.
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = '12px monospace';
  // M12: the legend line also carries the camera roster — the guard
  // line below is already near-full in an all-chase alarm, so the
  // cameras ride here instead of overflowing the panel.
  const camRoster = (world.cameras && world.cameras.length > 0)
    ? `   |   ${cameraStatesShort(cameraStates(world.cameras))}`
    : '';
  ctx.fillText(`LIGHT=danger · DARK=safe · CARPET=silent${camRoster}`, 16, 68);
  // Per-guard state list (M8 compressed, M13 with tile distances)
  // + objective checklist (✓ taken) + informative SPOTTED count.
  // The roster falls back to distances for the 3 nearest guards,
  // then to no distances, when the line would overflow the panel.
  const states = guardStates(world.guards);
  const checklist = propsChecklistLine(summary);
  const spotted = `SPOTTED ×${world.detections}`;
  let roster = guardStatesShort(states, world.player);
  let rosterLine = `${roster}   |   ${checklist}   |   ${spotted}`;
  if (ctx.measureText(rosterLine).width > panels.header.w - 32) {
    roster = guardStatesShort(states, world.player, 3);
    rosterLine = `${roster}   |   ${checklist}   |   ${spotted}`;
  }
  if (ctx.measureText(rosterLine).width > panels.header.w - 32) {
    roster = guardStatesShort(states);
    rosterLine = `${roster}   |   ${checklist}   |   ${spotted}`;
  }
  ctx.fillText(rosterLine, 16, 84);
  // SOUND line + noise segment bar, inside the noise panel. Bar: 0 =
  // silent, 1 = carpet (40px), 5 = wood (140px) — scaled from the same
  // lastNoise radius the text reports.
  const noiseRadius = world.lastNoise ? world.lastNoise.radius : 0;
  const noiseFilled = segmentCount(noiseRadius / CONFIG.NOISE_RUN_WOOD, 5);
  drawSegmentedBar(ctx, panels.noise.x + 12, panels.noise.y + 6, 8, 10, 2,
    noiseFilled, 5, COLORS.meterLow);
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = '12px monospace';
  ctx.fillText(lastNoiseText(world), panels.noise.x + 12 + 5 * 8 + 4 * 2 + 8, panels.noise.y + 15);

  // M13: tactical minimap, bottom-right, always on (play + paused).
  drawMinimap(ctx, world);

  if (screen === 'paused') {
    // M11: moved 130 -> 170 — the noise panel now runs y104..126 and
    // the '+1 PROP' flash sits at y150; y170 clears both.
    ctx.fillStyle = COLORS.hud;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED — press P to resume, R to restart', CONFIG.VIEW_WIDTH / 2, 170);
  }
}
