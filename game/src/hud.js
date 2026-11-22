// CURTAIN CALL — M4 HUD: pure data for the HUD + the HUD drawing itself.
// game-ui-ux: the HUD is driven by game state (props, guard states,
// suspicion) — the draw function only reads, it never mutates the world.
// Pure helpers are unit-tested (tests/m4.test.js); drawHud is verified
// visually via headless screenshots, like render.js in M1–M3.
import CONFIG from './config.js';
import { lightAt, floorAt } from './level.js'; // M15: rail VISIBILITY/NOISE words read the live floor/light

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
  const short = {
    tiara: 'Tiara', mask: 'Mask', violin: 'Violin',
    script: 'Script', baton: 'Baton', rose: 'Rose', // M14: Job 2 props
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

// M15 minimap (game-ui-ux: a tactical map, always on) — moved off
// the playfield into the rail bottom (the M14 bottom-right panel
// covered the Violin prop and forced its label to be skipped). The
// panel is aspect-correct (160x100 = 960:600), centred in the rail,
// opaque so nothing shows through it. Pure projection — the m13
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
  // HUD-fix: the minimap panel is OPAQUE — the translucent fill let
  // the "LEAD'S VIOLIN" floor label show through it (defect 3).
  panelFillOpaque: 'rgba(12, 9, 7, 1)',
  panelBorder: 'rgba(245, 240, 230, 0.20)',
  panelShadow: 'rgba(0, 0, 0, 0.35)',
};

// M11: framed panel (dark fill + offset shadow + 1px border) — the
// top-10 HUD depth treatment. Used by the HUD and by render.js
// overlays; pure drawing, no game state. HUD-fix: optional `fill`
// (the minimap passes the opaque fill; everything else keeps the
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

// M15 — the right rail (game-ui-ux: sidebar HUD, the top-3 pattern):
// the header bar and the bottom bar are DELETED, and every HUD
// element lives in one 240px rail at the canvas's right edge — the
// playfield (x0..960) is 100% game, no panel ever covers it. The rail
// is the single HUD panel now: one dark navy slab, a thin gold
// divider at x=960, sections top-to-bottom (title / job / score /
// objective / stage pill + suspicion bar / visibility / noise / loot
// checklist / ushers roster / goal / icon legend / controls /
// minimap). All text is 10–15px monospace on the 216px inner width
// (x972..1188, 12px margins).
export function railRect() {
  return { x: CONFIG.RAIL_X, y: 0, w: CONFIG.RAIL_W, h: CONFIG.CANVAS_H };
}

// M15: the rail text rows, as pure data — the single source of truth
// for drawHud AND the tests (game-ui-ux: rows sized to their section
// with breathing room, never crammed). Every baseline is >=10px from
// the rail's top/bottom edge (title 26, last controls line 482 vs
// the 600px rail) and every line fits the 216px inner width. The
// roster block reserves 5 lines (312..364); the sections below it
// (goal 384, legend 404..450, controls 468/482, minimap 490..590)
// are FIXED positions, so a short calm roster leaves breathing room
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

// M15: is a label anchor point covered by the HUD? The rail is the
// only HUD panel now — a point inside x960..1200 is under it, a
// point on the playfield (x<960) is clear. render.js skips a world
// label whose TEXT BOX touches the rail (the box rule, 06:22 WIB);
// the roster line in the rail carries the guard/camera instead.
export function labelInsideHud(x, y) {
  const r = railRect();
  return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
}

// HUD-fix: the roster line, compressed until it fits `maxWidth`
// (measured by `measure`, a (text) => width function). Levels, in
// order — the M8/M13 distance fallbacks first, then the checklist
// short form, then the alert-count compression (the M8 precedent:
// patrols already collapse to a count when space demands it). The
// last level always fits a 712px bar: even 6 simultaneous alerts
// read as "6 ALERT | Props 0/3 | SPOTTED ×0" (~45 chars). Pure.
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
  // HUD-fix: opaque fill — the translucent default let the
  // "LEAD'S VIOLIN" floor label show through the panel.
  drawPanel(ctx, rect.x, rect.y, rect.w, rect.h, COLORS.panelBorder, COLORS.panelFillOpaque);
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
// M15: the rail's per-guard roster lines (Moonlit-rail pattern: one
// line per guard, alerted guards named with tile distance, patrols
// collapsed to a count, cameras as short "C1 SWEEP" lines). Capped
// at railLayout().rosterMaxLines (5): alerted guards first, then
// cameras, then the patrol count; overflow collapses to "+N more".
// Pure, unit-tested in tests/m15.test.js.
export function railRosterLines(world) {
  const player = world.player;
  const tile = (g) => (g.x === undefined ? ''
    : ` ${Math.round(Math.hypot(g.x - player.x, g.y - player.y) / CONFIG.TILE)}t`);
  const alerted = world.guards
    .filter((g) => g.state !== 'patrol')
    .map((g) => `U${g.name.replace('USHER ', '')} ${g.state.toUpperCase()}${tile(g)}`);
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

// M15: the rail VISIBILITY word — the binary light rule, as a word
// (game-ui-ux: colour never the only signal). Reads the SAME lightAt
// the simulation uses, so the word can never disagree with the
// suspicion fill: standing in a pool is IN THE LIGHT (danger).
export function visibilityWord(world) {
  return lightAt(world.player.x, world.player.y, world.level) === CONFIG.LIGHT_POOL
    ? 'IN THE LIGHT' : 'IN THE DARK';
}

// M15: the rail NOISE word — short form of the old SOUND line. The
// radius is the audibility the simulation uses (0 = walking, 40 =
// running on carpet, 140 = running on wood); the floor word comes
// from the same floorAt the footstep sound uses.
export function noiseWord(world) {
  const n = world.lastNoise;
  if (!n || n.radius <= 0) return 'silent';
  return floorAt(world.player.x, world.player.y, world.level) === 'carpet'
    ? 'quiet on carpet' : 'loud on wood';
}

// M15: the rail icon legend — the LEGEND constant's four rules plus
// every map object, as small canvas-drawn icons + one-word labels
// (game-ui-ux: icon + label, never colour alone). 9 items in 3
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

// M15: the stage pill fill — the stage word (CALM/UNEASY/HUNTED/
// ALARM) in the stage colour, dark text on a filled pill, dim text
// on the quiet CALM pill.
const stagePill = {
  CALM: { fill: '#3a2f24', border: '#5a6b7a', text: '#b8ab98' },
  UNEASY: { fill: '#e8a33d', border: '#e8a33d', text: '#1a140f' },
  HUNTED: { fill: '#ff9a3d', border: '#ff9a3d', text: '#1a140f' },
  ALARM: { fill: '#ff3b30', border: '#ff3b30', text: '#ffffff' },
};

// M15: one legend icon — a 10px canvas shape, the same shape the map
// uses for that object (usher dot + cone, curtain slab, light pool,
// carpet slab, coin diamond, smoke puff, camera wedge, laser line,
// exit door). x,y is the icon's top-left corner; the label sits at
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

// M15: the right rail (game-ui-ux: sidebar HUD, the top-3 pattern).
// Every HUD element lives in the rail; the playfield is 100% game.
// Drawn on EVERY screen (play/paused/select/win/lose) — the rail is
// the frame, not a play overlay: on select it shows the campaign
// best instead of the live score, and the goal line drops the GHOST
// word (nothing has been spotted yet on a title screen). `t` is real
// time (seconds) and drives the pulse: above 0.7 suspicion the
// suspicion bar throbs so a near-miss reads even at contact-sheet
// size. `muted` shows MUTE next to the score. `campaign` is the
// M14 campaign object (default = a fresh session).
export function drawHud(ctx, world, screen, t, muted = false, campaign = null) {
  const camp = campaign || { selected: 0, cleared: [false, false], best: [null, null] };
  const L = railLayout();
  // M12: the meter shows the worst suspicion of guards AND cameras —
  // a camera filling up is as alarming as a guard filling up.
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

  // Title / job / score — centred, one straight centre column.
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

  // OBJECTIVE — two lines, left-aligned on the fixed margin.
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText('OBJECTIVE', L.objectiveHeader.x, L.objectiveHeader.y);
  ctx.font = '12px monospace';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('Steal back 3 props', L.objectiveLines[0].x, L.objectiveLines[0].y);
  ctx.fillText('Reach the EXIT', L.objectiveLines[1].x, L.objectiveLines[1].y);

  // Stage pill + suspicion bar, one row: the pill is the stage word
  // (CALM/UNEASY/HUNTED/ALARM) in the stage colour, the bar is the
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

  // VISIBILITY + NOISE — label left, word right, one row each (the
  // word IS the meter for visibility: binary light, binary word).
  // The noise bar below the word scales from the same lastNoise
  // radius the text reports (0 = silent, 40 = carpet, 140 = wood).
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

  // LOOT — the objective checklist, one line per prop (✓ taken).
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText(`LOOT · Props ${summary.taken}/${summary.total}`, L.lootHeader.x, L.lootHeader.y);
  ctx.font = '12px monospace';
  summary.items.forEach((item, i) => {
    ctx.fillStyle = item.taken ? COLORS.coin : COLORS.hudDim;
    ctx.fillText(`${item.taken ? '✓' : '○'} ${item.name}`, L.propLines[i].x, L.propLines[i].y);
  });

  // USHERS — one line per guard (Moonlit-rail pattern), capped at 5.
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText('USHERS', L.ushersHeader.x, L.ushersHeader.y);
  ctx.font = '12px monospace';
  railRosterLines(world).forEach((line, i) => {
    ctx.fillStyle = /PATROL/.test(line) ? COLORS.hudDim : COLORS.hud;
    ctx.fillText(line, L.innerX, L.rosterLineY(i));
  });

  // GOAL — the exit state + the ghost word (select drops it: nothing
  // has been spotted yet on a title screen).
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = world.detections === 0 ? '#a5d6a7' : '#ff8c42';
  const goalText = screen === 'select'
    ? 'EXIT: OPEN'
    : `EXIT: OPEN · ${world.detections === 0 ? 'GHOST' : `SPOTTED ×${world.detections}`}`;
  ctx.fillText(goalText, L.goal.x, L.goal.y);

  // LEGEND — small canvas-drawn icons + one-word labels, 3x3
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

  // CONTROLS — two short lines (the full controls live on the select
  // screen's HOW TO PLAY panel).
  ctx.font = '10px monospace';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('WASD move · Shift run · C coin', L.controls[0].x, L.controls[0].y);
  ctx.fillText('X smoke · P pause · M sound', L.controls[1].x, L.controls[1].y);

  // Minimap, bottom of the rail, always on.
  drawMinimap(ctx, world);
}

// ---------------------------------------------------------------------------
// M14 — campaign-lite (2 jobs) + the two user text rules of 22 Nov 06:22 /
// 06:25 WIB. Pure data + pure helpers; render.js draws them, tests prove
// them. No mechanic changes: win/lose rules and the per-job score
// formula (prop x300 + GHOST +500 + time bonus) are exactly M13's.
// ---------------------------------------------------------------------------

// --- campaign state (in-memory per session, main.js owns the object) ---

// Job status for the select cards: Job 1 is always open; a later job
// opens only when the previous one is cleared (sequential unlock).
export function jobStatus(campaign, i) {
  if (campaign.cleared[i]) return 'cleared';
  if (i === 0 || campaign.cleared[i - 1]) return 'open';
  return 'locked';
}

export function canSelectJob(campaign, i) {
  return jobStatus(campaign, i) !== 'locked';
}

// Campaign total = the sum of the per-job BEST scores (a null best
// counts 0). The win screen shows this, not the run total.
export function campaignTotal(best) {
  return best.reduce((sum, b) => sum + (b ? b.score : 0), 0);
}

// A job's best only ever improves: a worse replay never lowers it.
// The stored time rides with the best score (a tie keeps the earlier,
// faster run — the caller passes the run time only on improvement).
export function updateBest(best, score, time) {
  if (!best || score > best.score) return { score, time };
  return best;
}

// --- select screen (pure layout + content) ---

// The select screen layout, as pure data — the single source of truth
// for render.js AND the tests. One grid (x90..870): title + tagline
// centred, two job cards, the HOW TO PLAY panel, the centred closer
// + campaign best. Every text baseline sits >=10px from its panel
// edge (the HUD-fix rule, applied to the new screen too).
export function selectLayout() {
  const cards = [
    { x: 90, y: 108, w: 380, h: 128 },
    { x: 490, y: 108, w: 380, h: 128 },
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

// The four lines inside one job card: number + name, the sensor/prop
// counts, the status, and the best (or the key hint). Left-aligned in
// the card on a fixed margin — the same straight-edge rule as the
// HOW TO PLAY panel (user 06:25 WIB).
export function selectCardLines(level, campaign, index) {
  const counts = `${level.guards.length} guards · ${level.cameras.length} cameras · ${level.lasers.length} lasers · ${level.props.length} props`;
  const status = jobStatus(campaign, index);
  const best = campaign.best[index];
  const statusLine = status === 'cleared' ? 'CLEARED'
    : status === 'locked' ? 'LOCKED — clear Job 1 to open' : 'NOT CLEARED';
  const bestLine = status === 'cleared' && best
    ? `BEST ${best.score} · ${formatTime(best.time)}`
    : status === 'locked' ? '' : `PRESS ${index + 1}`;
  return [
    `${index + 1} · ${level.name}`,
    counts,
    statusLine,
    bestLine,
  ];
}

// The HOW TO PLAY body, as pure data — 13 rows: section header,
// objective (4 short lines), blank, legend + one gadget/threat per
// line (5), blank, controls (1). The prop sentence is the user's
// rewrite (rule 06:25 (c)): a complete sentence ending at "EXIT.",
// then a new line starting "Props are optional:" — never a lowercase
// continuation. The names are generic ("the 3 props") because this
// screen covers BOTH jobs, whose props differ; the per-job names
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

// Click hit-test for the select cards: the card index, or -1.
export function jobAtPoint(x, y, layout = selectLayout()) {
  for (let i = 0; i < layout.cards.length; i++) {
    const c = layout.cards[i];
    if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return i;
  }
  return -1;
}

// --- panel text rules (user 06:25 WIB) ---

// The title stays centred; the BODY is left-aligned on ONE fixed left
// margin (panel.x + 40), so the block has one straight left edge. No
// body line may be wider than the panel minus 80px (40px clear on
// each side) — measured with measureText, enforced by tests, not by
// eye. The closer ("Press ENTER..." / "NEXT JOB...") stays centred.
export const PANEL_TEXT_MARGIN = 40;

// `measure` is (text, fontSizePx) => width in px (the tests use the
// 0.6em monospace advance; the real canvas uses ctx.measureText).
export function panelTextFits(text, fontSize, panelW, measure) {
  return measure(text, fontSize) <= panelW - PANEL_TEXT_MARGIN * 2;
}

// --- win / lose screen text (pure data) ---

// The win screen: title centred, body left-aligned on panel.x + 40,
// closer centred. Job 1 offers NEXT JOB (ENTER); Job 2 closes the
// campaign with the total. The total is the sum of the per-job BESTS
// (campaignTotal), so a worse replay never lowers it.
export function winScreenLines(world, campaign) {
  const taken = world.props.filter((p) => p.taken).length;
  const s = scoreBreakdown(world);
  const rank = winRank(world.detections);
  const job = world.jobIndex || 0;
  const total = campaignTotal(campaign.best);
  const body = [
    `JOB ${job + 1} · ${world.jobName || 'THE MIDNIGHT THEATRE'} — CLEARED`,
    `Time: ${formatTime(world.time)} · Props ${taken}/${world.props.length} · Spotted ${world.detections}x`,
    `Score: ${s.total} — Props ${s.props} + Ghost ${s.ghost} + Time ${s.time}`,
    job === 0 ? `CAMPAIGN TOTAL ${total}` : `CAMPAIGN COMPLETE — TOTAL ${total}`,
  ];
  const footer = job === 0
    ? 'NEXT JOB — PRESS ENTER · R TO REPLAY'
    : 'PRESS ENTER — BACK TO TITLE · R TO REPLAY';
  return { title: `${rank} — ESCAPED!`, body, footer };
}

// The lose screen: the M13 body lines, unchanged in meaning, now
// left-aligned with a centred closer (same rule as the win screen).
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

// The overlay panel rect — drawOverlay and the label-box check share
// this, so a label can never be judged against a different rect than
// the one actually drawn. (x150 y190 w660; height grows with the row
// count, same as M11.)
export function overlayPanelRect(rows) {
  return { x: CONFIG.VIEW_WIDTH / 2 - 330, y: 190, w: 660, h: 130 + rows * 28 };
}

// --- label-box occlusion (user 06:22 WIB) ---

// A world label is skipped when its TEXT BOX (measureText) touches ANY
// panel — HUD panels, the minimap, or an overlay panel — NOT only when
// its anchor point falls inside one. The anchor-only check (labelInsideHud,
// kept for its tests) missed exactly the three defects the user found
// on the start screen: USHER 1's label was cut in half under the overlay
// because its anchor sat outside the panel while its text jutted under
// the panel's left edge; USHER 4 sat on the panel's top border line;
// and a laser beam crossed CAM 2's text. Laser beams count as occluders
// too, as thickened line rects — the same box test, one occluder list.
// `metrics` is ctx.measureText(text): { width, actualBoundingBoxAscent,
// actualBoundingBoxDescent } (render.js falls back to the font size
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

// Rect overlap with a small margin: a label that merely TOUCHES a panel
// edge (2px) already reads as clipped, so it is skipped.
export function rectsOverlap(a, b, margin = 2) {
  return a.x - margin < b.x + b.w && a.x + a.w + margin > b.x
    && a.y - margin < b.y + b.h && a.y + a.h + margin > b.y;
}

export function labelOccluded(box, occluders, margin = 2) {
  return occluders.some((r) => rectsOverlap(box, r, margin));
}

// A laser beam as an occluder rect: the segment thickened by `pad` px
// (the beam itself is 3px + a 7px glow, so 4px covers the visible line).
export function laserOccluder(laser, pad = 4) {
  const x = Math.min(laser.x1, laser.x2) - pad;
  const y = Math.min(laser.y1, laser.y2) - pad;
  const w = Math.abs(laser.x2 - laser.x1) + pad * 2;
  const h = Math.abs(laser.y2 - laser.y1) + pad * 2;
  return { x, y, w: Math.max(w, pad * 2), h: Math.max(h, pad * 2) };
}

// The occluder list for world labels on a given screen. The world is
// drawn first and the panels on top, so render.js builds this BEFORE
// drawing the world. `hud` adds the HUD panels + minimap (play/paused
// only — the HUD is not drawn on the other screens); `overlay` is the
// screen's overlay panel rect (select/win/lose); every screen adds the
// laser beams.
export function labelOccluders({ hud = false, overlay = null, lasers = [] } = {}) {
  const out = [];
  if (hud) out.push(railRect()); // M15: the rail is the only HUD panel
  if (overlay) out.push(overlay);
  for (const l of lasers) out.push(laserOccluder(l));
  return out;
}
