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
export function guardStatesShort(states) {
  const alerted = states.filter((g) => g.state !== 'patrol');
  const patrolling = states.length - alerted.length;
  const parts = alerted.map(
    (g) => `${g.name.replace('USHER ', 'U')} ${g.state.toUpperCase()}`,
  );
  if (patrolling > 0) parts.push(`${patrolling} PATROL`);
  return parts.join(' · ');
}

// One short line per usher: name + FSM state, in level order.
export function guardStates(guards) {
  return guards.map((g) => ({ name: g.name, state: g.state }));
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
};

// Suspicion meter, guard list, props, timer, legend, noise — all the
// data the HUD needs, drawn from the world each frame. `t` is real time
// (seconds) and drives the pulse: above 0.7 suspicion the bar throbs so
// a near-miss reads even at contact-sheet size. `muted` shows MUTE
// next to the timer (the M key itself is documented on the start
// screen — the controls line is too long to carry it, see below).
export function drawHud(ctx, world, screen, t, muted = false) {
  const worst = worstSuspicion(world.guards);
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
  // VIEW_WIDTH-16, unbacked, above the EXIT box).
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px monospace';
  if (muted) {
    ctx.fillStyle = '#ff6b57';
    ctx.fillText(`${formatTime(world.time)} · MUTE`, panels.header.x + panels.header.w - 8, 24);
    ctx.fillStyle = COLORS.hud;
  } else {
    ctx.fillText(formatTime(world.time), panels.header.x + panels.header.w - 8, 24);
  }
  ctx.textAlign = 'left';

  // Suspicion: segmented bar (M11, top-10 ALARM/HEAT style) + state
  // pill sized to the label. Strings unchanged from M10.
  const stateText = {
    patrol: 'unseen',
    suspicious: 'SUSPICIOUS! Hide!',
    chase: 'RUN! Hide!',
    search: 'searching for you…',
  };
  const label = stateText[worst.state] || stateText.patrol;
  const barX = 16;
  const barY = 34;
  const segW = 26;
  const segH = 10;
  const segGap = 2;
  const segTotal = 5;
  const pulse = worst.suspicion > 0.7 ? 0.65 + 0.35 * Math.sin(t * 10) : 1;
  ctx.globalAlpha = pulse;
  drawSegmentedBar(ctx, barX, barY, segW, segH, segGap,
    segmentCount(worst.suspicion, segTotal), segTotal,
    worst.suspicion > 0 ? COLORS.meterHigh : COLORS.meterLow);
  ctx.globalAlpha = 1;
  const pill = pillByState[worst.state] || pillByState.patrol;
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

  // M8: short legend ONLY on the play HUD — no controls line (full
  // controls live on the start screen) and no full LEGEND: the LEGEND
  // constant is test-locked to all four rules (tests/m4.test.js) and
  // the complete rules stay on the start screen. The dropped 4th rule
  // (running on wood is noisy) is carried by the SOUND line + the
  // player noise ring instead. One short row, ~270px.
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = '12px monospace';
  ctx.fillText('LIGHT=danger · DARK=safe · CARPET=silent', 16, 68);
  // Per-guard state list (M8 compressed) + props with names and checkmarks.
  ctx.fillText(
    guardStatesShort(guardStates(world.guards))
    + `   |   Props ${summary.taken}/${summary.total} `
    + summary.items.map((i) => `${i.taken ? '✓' : '○'} ${i.name}`).join(' '),
    16, 84,
  );
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

  if (screen === 'paused') {
    // M11: moved 130 -> 170 — the noise panel now runs y104..126 and
    // the '+1 PROP' flash sits at y150; y170 clears both.
    ctx.fillStyle = COLORS.hud;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED — press P to resume, R to restart', CONFIG.VIEW_WIDTH / 2, 170);
  }
}
