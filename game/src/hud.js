// CURTAIN CALL — M4 HUD: pure data for the HUD + the HUD drawing itself.
// game-ui-ux: the HUD is driven by game state (props, guard states,
// suspicion) — the draw function only reads, it never mutates the world.
// Pure helpers are unit-tested (tests/m4.test.js); drawHud is verified
// visually via headless screenshots, like render.js in M1–M3.
import CONFIG from './config.js';

// Legend (tesis differentiator 4): light = danger, dark = safe, and the
// floor that talks — readable at a glance, also on the judge's sheet.
export const LEGEND =
  'CAHAYA=bahaya · GELAP=aman · KARPET=senyap · LARI di kayu=berisik';

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
  if (!n) return 'SUARA: hening — jalan kaki senyap';
  const floor = n.floor === 'carpet' ? 'karpet' : 'kayu';
  return `SUARA: lari di ${floor} (${n.radius}px)`;
}

const COLORS = {
  hud: '#f5f0e6',
  hudDim: '#b8ab98',
  meterBg: '#3a2f24',
  meterLow: '#e8a33d',
  meterHigh: '#dc3c28',
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

  // M5: dark backing strips behind the HUD rows (M4 debt) — hudDim text
  // washed out when the bright player sprite stood right under it.
  // One strip covers title/meter/controls/guard rows (y 0..92, stops
  // before the EXIT box at x>=860); a second short strip backs the
  // right-aligned noise line (y 104..122), clear of the EXIT box (ends
  // y=100) and the Golden Mask label (ends x~570).
  ctx.fillStyle = 'rgba(12, 9, 7, 0.6)';
  ctx.fillRect(0, 0, 844, 92);
  ctx.fillRect(690, 104, 270, 20);

  ctx.textAlign = 'left';
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = COLORS.hud;
  ctx.fillText('CURTAIN CALL', 16, 24);
  // Timer, top-right (mm:ss) — the win screen repeats it. MUTE shows
  // here when the player silenced the audio with M.
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px monospace';
  if (muted) {
    ctx.fillStyle = '#ff6b57';
    ctx.fillText(`${formatTime(world.time)} · MUTE`, CONFIG.VIEW_WIDTH - 16, 24);
    ctx.fillStyle = COLORS.hud;
  } else {
    ctx.fillText(formatTime(world.time), CONFIG.VIEW_WIDTH - 16, 24);
  }
  ctx.textAlign = 'left';

  // Suspicion meter: worst guard's suspicion, coloured by level; it
  // pulses (alpha throb) while suspicion is high — game-feel, cheap.
  const stateText = {
    patrol: ['belum terlihat', COLORS.hudDim],
    suspicious: ['CURIGA! sembunyi!', '#ffce54'],
    chase: ['KEJAR! lari!', '#ff6b57'],
    search: ['dia mencarimu…', '#ff9a3d'],
  };
  const [label, labelColor] = stateText[worst.state] || stateText.patrol;
  const mw = 140;
  const mx = 16;
  const my = 34;
  ctx.fillStyle = COLORS.meterBg;
  ctx.fillRect(mx, my, mw, 10);
  const pulse = worst.suspicion > 0.7 ? 0.65 + 0.35 * Math.sin(t * 10) : 1;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = worst.suspicion > 0 ? COLORS.meterHigh : COLORS.meterLow;
  ctx.fillRect(mx, my, mw * Math.min(1, worst.suspicion), 10);
  ctx.globalAlpha = 1;
  ctx.font = '12px monospace';
  ctx.fillStyle = labelColor;
  ctx.fillText(label, mx + mw + 8, my + 9);

  // Controls + full legend on one line (M3 layout, kept): shortened so
  // it ends before the EXIT box (x>=860) — the M3 line plus "· M suara"
  // ran into the box; "restart" -> "ulang" and a single " | " buy the
  // ~120px the line was over. M is documented on the start screen.
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = '12px monospace';
  ctx.fillText(
    `WASD gerak · Shift lari · R ulang · P jeda | ${LEGEND}`,
    16, 68,
  );
  // Per-guard state list + props with names and checkmarks.
  ctx.fillText(
    guardStates(world.guards).map((g) => `${g.name.replace('USHER ', 'U')} ${g.state.toUpperCase()}`).join(' · ')
    + `   |   Props ${summary.taken}/${summary.total} `
    + summary.items.map((i) => `${i.taken ? '✓' : '○'} ${i.name}`).join(' '),
    16, 84,
  );
  // Last noise the player made (M3 differentiator: the floor talks).
  // Right-aligned at y=116: the left-aligned first pass ran over the
  // Star Tiara prop + label at (70,90); this corner is clear of the
  // EXIT box (ends y=100), the Golden Mask label (ends x~570) and the
  // usher labels.
  ctx.textAlign = 'right';
  ctx.fillText(lastNoiseText(world), CONFIG.VIEW_WIDTH - 16, 116);
  ctx.textAlign = 'left';

  if (screen === 'paused') {
    ctx.fillStyle = COLORS.hud;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('JEDA — tekan P untuk lanjut, R untuk ulang', CONFIG.VIEW_WIDTH / 2, 130);
  }
}
