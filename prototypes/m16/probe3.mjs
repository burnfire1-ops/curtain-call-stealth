// M16 probe driver — Job 3 (THE VAULT AT MIDNIGHT), route v2.
// Same harness as prototypes/m14/probe2.mjs (own headless Chrome port
// 9226, own profile under playtest/profile3, same bundle on
// 127.0.0.1:8125). SNAP adds props taken + guard dy.
//   Probe A3 — naive Job 3 (W+Shift straight north from spawn,
//     30 s): MUST be DETECTED (det>0) or LOSE. The diagonal W+D
//     run (Job 1's Probe A) is SAFE on Job 3: W2 (800,180,140,20)
//     seals the east edge and the player parks at (940,212),
//     outside every cone. Straight north parks at (880,212) —
//     DESIGN FINDING (v13 run): the player is detected 10x
//     (det=10) but NEVER caught: guards chase toward (880,212)
//     but are BLOCKED by curtain B (760,200,40,160) — guards do
//     not pathfind around covers, so they stall at (745,212) and
//     fall back to SEARCH. CAM 2 does not alarm either (sus 0).
//     So A3 passes on det>0 (the level responds to naive play),
//     and the (880,212) safe pocket is a known design nit: a
//     detected naive player is stuck, not punished. The pocket
//     does not soft-lock (the player can walk away) and does not
//     help a real player (no prop, no exit there).
//   Probe T3 — timed Job 3 FULL-CLEAR win (Ledger + Key + Crown,
//     then exit): MUST WIN GHOST. Its time sets PAR_S[2] (ceil + 15s).
// Route v2 (Ledger first; the north hall is crossed at y=160, south
// of the stage light pool y40-140, so every cone fill stays dark):
//  spawn (880,520) -> west along the bottom y=540 to (200,540)
//  -> WAIT NOOR east (x>500, facing east) -> north up the west wall
//     to (172,200) -> WAIT L3 OFF (lasers pulse in phase, 1.6/1.6 s)
//  -> east to (370,220), crossing L3 at (240,220) while OFF
//  -> WAIT LUKA east (x>700, facing east) at (370,220)
//  -> RUN south to (370,300), RUN east to the Ledger (520,300)
//  -> south to (520,450), west to (172,450), north to (172,160)
//  -> east along the hall y=160 to (880,160), north to the Key (880,90)
//  -> south to (880,160), west along the hall y=160 to (90,160)
//  -> north to (90,100): the Crown (90,90) is picked up at y~126,
//     the exit overlap wins at y~112, same run, 3/3. No exit wait
//     is needed: x=90 is out of range of BASIL and CAM 3 (dist > 180).
// Job 3 is reached through the REAL campaign flow: win Job 1 (route
// v5), ENTER (NEXT JOB), win Job 2 (T2 route), ENTER (NEXT JOB).
// Usage: node prototypes/m16/probe3.mjs [A3|T3|all]
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';

const CHROME = '/home/hatch/workspace/chip404/chrome/opt/google/chrome/chrome';
const BUNDLE = '/home/hatch/workspace/makefun/best-stealth-game/playtest/curtain-call-playtest.html';
const PROFILE = '/home/hatch/workspace/makefun/best-stealth-game/playtest/profile3';
const SHOTDIR = '/home/hatch/workspace/makefun/best-stealth-game/playtest/probe-shots';
const PORT = 9226;
const SERVE_PORT = 8125;
const WHICH = process.argv[2] || 'all';
fs.mkdirSync(SHOTDIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const out = (s) => { log.push(s); console.log(s); };

// --- static server for the bundle (single file) ---
const server = http.createServer((req, res) => {
  if (req.url === '/curtain-call-playtest.html' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(BUNDLE).pipe(res);
  } else { res.writeHead(404); res.end(); }
});
await new Promise((res) => server.listen(SERVE_PORT, '127.0.0.1', res));

// --- launch Chrome ---
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  'about:blank',
], { stdio: 'ignore' });
let version = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch { /* not up yet */ }
}
if (!version) { console.log('CHROME FAILED TO START'); chrome.kill(); server.close(); process.exit(1); }

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(JSON.stringify(msg.params.args).slice(0, 200));
};
function send(method, params = {}) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${SHOTDIR}/${name}`, Buffer.from(r.result.data, 'base64'));
}
const SNAP = `(() => { const c = window.__curtainCall; if (!c) return null;
  const w = c.world;
  return JSON.stringify({ screen: c.screen, status: w.status, t: +w.time.toFixed(1),
    job: w.jobIndex, px: Math.round(w.player.x), py: Math.round(w.player.y),
    det: w.detections, exp: +w.exposure.toFixed(2),
    props: w.props.map((p) => (p.taken ? 1 : 0)),
    guards: w.guards.map((g) => ({ x: Math.round(g.x), y: Math.round(g.y),
      s: g.state, dx: +g.dir.x.toFixed(2), dy: +g.dir.y.toFixed(2), sus: +g.suspicion.toFixed(2) })),
    cams: w.cameras.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y),
      a: +m.angle.toFixed(2), sus: +m.suspicion.toFixed(2), s: m.state })),
    lasers: w.lasers.map((l) => l.on) }); })()`;
async function snap() { const s = await evalJs(SNAP); return s ? JSON.parse(s) : null; }

// --- keys ---
const held = new Map(); // code -> key
async function keyDown(code, key) {
  if (held.has(code)) return;
  held.set(code, key);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key });
}
async function keyUp(code, key) {
  if (!held.has(code)) return;
  held.delete(code);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key });
}
async function tap(code, key) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key });
}
async function releaseAll() {
  for (const [code, key] of [...held]) await keyUp(code, key);
  held.clear();
}
const KEYMAP = { W: ['KeyW', 'w'], A: ['KeyA', 'a'], S: ['KeyS', 's'], D: ['KeyD', 'd'] };

// moveTo: hold W/A/S/D per axis until within tol (14px, M7) or timeout.
// Walk (no Shift) unless run=true.
async function moveTo(tx, ty, { run = false, timeoutMs = 20000, tol = 14 } = {}) {
  const t0 = Date.now();
  if (run) await keyDown('ShiftLeft', 'Shift');
  try {
    while (Date.now() - t0 < timeoutMs) {
      const s = await snap();
      if (!s || s.screen !== 'play') return { ok: false, why: 'screen=' + (s?.screen ?? 'null'), x: s?.px, y: s?.py, ...s };
      const dx = tx - s.px, dy = ty - s.py;
      if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) { await releaseAll(); return { ok: true, x: s.px, y: s.py }; }
      if (dx > tol) await keyDown(...KEYMAP.D); else await keyUp(...KEYMAP.D);
      if (dx < -tol) await keyDown(...KEYMAP.A); else await keyUp(...KEYMAP.A);
      if (dy > tol) await keyDown(...KEYMAP.S); else await keyUp(...KEYMAP.S);
      if (dy < -tol) await keyDown(...KEYMAP.W); else await keyUp(...KEYMAP.W);
      await sleep(50);
    }
    const s = await snap();
    await releaseAll();
    return { ok: false, why: 'timeout', x: s?.px, y: s?.py };
  } finally { await keyUp('ShiftLeft', 'Shift'); await releaseAll(); }
}
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await snap();
    if (s && s.screen !== 'play') return { ok: false, why: 'screen=' + s.screen, s };
    if (s && fn(s)) return { ok: true, s };
    await sleep(50);
  }
  return { ok: false, why: 'timeout ' + label };
}
const fmtGuards = (s) => s.guards.map((g, i) => `G${i + 1} ${g.s}@(${g.x},${g.y}) sus${g.sus}`).join(' ');
const fmtCams = (s) => s.cams.map((c, i) => `CAM${i + 1} a${c.a} sus${c.sus}`).join(' ');

// --- reach Job 2 through the real flow (route v5, verbatim from
// prototypes/m13/probe.mjs) ---
async function reachJob2() {
  await send('Page.navigate', { url: `http://127.0.0.1:${SERVE_PORT}/curtain-call-playtest.html` });
  await sleep(1000);
  const s0 = await snap();
  if (!s0) throw new Error('no __curtainCall after navigate');
  if (s0.screen !== 'select') throw new Error('expected select screen, got ' + s0.screen);
  await tap('Digit1', '1');
  await sleep(200);
  await tap('Enter', 'Enter');
  await sleep(400);
  let s = await snap();
  if (s.screen !== 'play' || s.job !== 0) throw new Error('Job 1 did not start, screen=' + s.screen + ' job=' + s.job);
  out('reachJob3: Job 1 started');
  let r = await moveTo(200, 520, {});
  out(`  J1 leg1 to (200,520): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await waitFor((s2) => s2.guards[0].x < 300 && s2.guards[0].dx < 0, 30000, 'U1 west heading west');
  out(`  J1 wait U1 west x<300 facing west: ${r.ok ? 'ok' : 'FAIL ' + r.why}`);
  if (!r.ok) return false;
  r = await moveTo(200, 170, {});
  out(`  J1 leg2 push-through to (200,170): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await waitFor((s2) => s2.guards[5].x >= 500 && s2.guards[5].x <= 515 && s2.guards[5].dx > 0, 30000, 'U6 just-turned-east 500-515');
  out(`  J1 wait U6 just-turned-east x 500-515: ${r.ok ? 'ok' : 'FAIL ' + r.why}`);
  if (!r.ok) return false;
  r = await moveTo(200, 32, { tol: 6 });
  out(`  J1 leg3a WALK north to top wall (200,32): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await moveTo(400, 32, { tol: 6 });
  out(`  J1 leg3b WALK east along top (400,32): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  let settled = false;
  {
    const t0 = Date.now();
    await keyDown(...KEYMAP.W);
    while (Date.now() - t0 < 5000) {
      const s2 = await snap();
      if (!s2 || s2.screen !== 'play') break;
      if (s2.py <= 33) { settled = true; break; }
      await sleep(50);
    }
    await releaseAll();
  }
  out(`  J1 settle to top wall y<=33: ${settled ? 'ok' : 'FAIL timeout'}`);
  if (!settled) return false;
  r = await moveTo(860, 32, { tol: 4 });
  if (r.ok) {
    const sNow = await snap();
    if (sNow && sNow.screen === 'play') {
      const t0 = Date.now();
      await keyDown(...KEYMAP.D);
      while (Date.now() - t0 < 3000) {
        const s2 = await snap();
        if (!s2 || s2.screen !== 'play') break;
        await sleep(50);
      }
      await releaseAll();
    }
  }
  await sleep(1200);
  s = await snap();
  const won1 = s.screen === 'win' && s.status === 'won';
  out(`  J1 win: screen=${s.screen} status=${s.status} t=${s.t}s det=${s.det} ${won1 ? (s.det === 0 ? 'GHOST' : 'won, det>0 (setup only — T3 GHOST measured separately)') : 'FAILED'}`);
  if (!won1) return false;
  await tap('Enter', 'Enter'); // NEXT JOB
  await sleep(400);
  s = await snap();
  const inJob2 = s.screen === 'play' && s.job === 1;
  out(`  NEXT JOB: screen=${s.screen} job=${s.job} ${inJob2 ? 'in Job 2' : 'FAILED to enter Job 2'}`);
  return inJob2;
}

// --- win Job 2 with the T2 golden path (verbatim from probe2.mjs) ---
async function winJob2() {
  let r = await moveTo(80, 540, {});
  out(`  J2 leg1 south along the west edge (80,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await waitFor((s) => s.guards[2].y < 200, 30000, 'USHER 3 north y<200');
  out(`  J2 wait USHER 3 north y<200: ${r.ok ? 'ok G3@(' + r.s.guards[2].x + ',' + r.s.guards[2].y + ')' : 'FAIL ' + r.why}`);
  if (!r.ok) return false;
  r = await moveTo(700, 540, {});
  out(`  J2 leg2 east along the bottom (700,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await waitFor((s) => s.cams[1].a > 3.4, 30000, 'CAM 2 angle > 3.4');
  out(`  J2 wait CAM 2 angle > 3.4: ${r.ok ? 'ok ' + fmtCams(r.s) : 'FAIL ' + r.why}`);
  if (!r.ok) return false;
  r = await moveTo(880, 510, { tol: 6 });
  let leg3 = r.ok ? 'arrived' : (r.why === 'screen=win' ? 'won en route' : 'FAIL ' + r.why);
  if (r.ok) {
    const sNow = await snap();
    if (sNow && sNow.screen === 'play') {
      const t0 = Date.now();
      await keyDown(...KEYMAP.D);
      while (Date.now() - t0 < 3000) {
        const s2 = await snap();
        if (!s2 || s2.screen !== 'play') break;
        await sleep(50);
      }
      await releaseAll();
      const sEnd = await snap();
      leg3 = sEnd && sEnd.screen === 'win' ? 'won en route (drive-east)' : 'arrived, screen=' + (sEnd?.screen ?? 'null');
    }
  }
  out(`  J2 leg3 to the exit (880,510): ${leg3} @(${r.x},${r.y})`);
  if (leg3.startsWith('FAIL')) return false;
  await sleep(1500);
  const s = await snap();
  const won2 = s.screen === 'win' && s.status === 'won';
  out(`  J2 win: screen=${s.screen} status=${s.status} t=${s.t}s det=${s.det} ${won2 ? (s.det === 0 ? 'GHOST' : 'won, det>0 (setup only — T3 GHOST measured separately)') : 'FAILED'}`);
  return won2;
}

async function reachJob3() {
  if (!(await reachJob2())) { out('reachJob3: could not reach Job 2'); return false; }
  if (!(await winJob2())) { out('reachJob3: could not win Job 2'); return false; }
  await tap('Enter', 'Enter'); // NEXT JOB -> Job 3
  await sleep(400);
  const s = await snap();
  const inJob3 = s.screen === 'play' && s.job === 2;
  out(`  NEXT JOB: screen=${s.screen} job=${s.job} ${inJob3 ? 'in Job 3' : 'FAILED to enter Job 3'}`);
  return inJob3;
}

// --- Probe A3: naive Job 3 (W+Shift straight north, 30 s), MUST LOSE ---
async function probeA3() {
  out('--- Probe A3 (naive Job 3 W+run straight north, must LOSE) ---');
  if (!(await reachJob3())) { out('Probe A3: could not reach Job 3'); return false; }
  await keyDown('KeyW', 'w'); await keyDown('ShiftLeft', 'Shift');
  const t0 = Date.now();
  let s = await snap();
  while (Date.now() - t0 < 30000) {
    s = await snap();
    if (!s || s.screen !== 'play') break;
    await sleep(100);
  }
  await releaseAll();
  s = await snap();
  const t = ((Date.now() - t0) / 1000).toFixed(1);
  out(`Probe A3: screen=${s.screen} status=${s.status} t=${t}s pos=(${s.px},${s.py}) det=${s.det} exp=${s.exp}`);
  out(`Probe A3 guards: ${fmtGuards(s)}`);
  out(`Probe A3 cams: ${fmtCams(s)}`);
  await shot('probeA3-final.png');
  const pass = s.status === 'lost' || s.det > 0;
  out(`Probe A3 verdict: ${pass ? (s.status === 'lost' ? 'LOSE (expected)' : 'DETECTED det=' + s.det + ' (expected — see safe-pocket note)') : '!!! ' + s.status.toUpperCase() + ' det=0 — UNEXPECTED, STOP !!!'}`);
  return pass;
}

// On any leg failure, capture the full live state + a screenshot
// before giving up — the loss cause is read from evidence, not guessed.
async function diagnose(tag) {
  const s = await snap();
  out(`DIAG ${tag}: ${s ? JSON.stringify(s) : 'snap=null'}`);
  await shot(`probeT3-diag-${tag}.png`);
}
// --- Probe T3: timed Job 3 FULL-CLEAR win, MUST WIN GHOST ---
// Route v3 (Ledger -> Key -> Crown+exit), mapped against EVERY
// wall/cover. v2 died on curtain A (340,80,40,140), which spans
// y80-220 and seals the north hall at y<232. Corridors:
//  west passage x172-328 (W1 east +12 .. curtain A -12),
//  east passage x712-748 (VERA +12 .. curtain B -12),
//  bottom corridor y472-568, y=250 lane between L1 (y200) and
//  L2 (y280), south of curtain A. The crate (460,400,60,60)
//  blocks x=520 south and y=450 east, so the Ledger exit goes
//  west to x=370, then south, then east along the bottom to the
//  east passage (x=730, tol 6). The Key is reached via the east
//  passage -> hall east -> (880,90); the Crown + exit via the
//  bottom -> west passage (x185) -> (90,100). Hall crossings use
//  y=155, tol 6 (south of the stage pool y<=140, north of W2
//  y>=180). The Crown (90,90) is picked up at y~126 from the
//  south, the exit overlap wins at y~112, same run, 3/3.
// --- Probe T3: timed Job 3 FULL-CLEAR win, MUST WIN GHOST ---
// Route v6 (Ledger -> Key -> Crown+exit). v5 died at leg8 too:
// LUKA chased (det=1, caught at (653,534)) — the WALK did NOT fix
// it, so the run-noise theory was wrong. Recomputed timeline
// (from the DIAG + patrol math): from the wait end, leg3 1.32 s +
// leg4 0.23 s + Ledger walk 1.07 s = 2.62 s, in which LUKA moves
// 183 px: east from 670, turns at 740 (+1.0 s), back west to ~627
// at the Ledger grab — the player walks TOWARD a west-facing LUKA
// and sits in his cone for the last 0.35 s of the walk + the
// standstill + the SE diagonal, ~+0.92 total, jitter -> 1.0.
// Fix: the combined wait now requires LUKA at the WEST end
// (x<500, facing east, 1.14 s window) before leg3, so during the
// 2.62 s approach LUKA moves EAST (away from the Ledger, facing
// away from the player) and is at ~683 facing east at the grab —
// the player is behind him the whole time, exposure 0. The WALK
// east stays (no noise). Everything else = v5:
//  (1) the LUKA wait at (185,250) (LUKA always >180 px away),
//      COMBINED (LUKA x>600 facing east AND L3 OFF);
//  (2) after the Ledger the player does NOT go back west along
//      y=300 (1.3 s inside LUKA's cone -> chase) but diagonally
//      south-east to (600,420), east to (650,420), south to
//      (650,540), then east along the bottom to the east passage
//      (x730, tol 6).
//  Route v7 (Ledger -> Key -> Crown+exit). v6 died at leg9: VERA
// chased (det=1, caught at (724,263)). Root cause: the player
// climbs the east passage x730, 30 px east of VERA's route (x700);
// when VERA faces south the player is in her cone (Dy>34 px,
// dist<180) — and the hall light pool (600,240,180,120) covers
// y240-360 of the passage, so the fill is ~2.86/s (not 1.0) and
// suspicion hits 1.0 in ~0.7 s. Fix: wait for VERA moving NORTH
// (dy<0, y>320, enough northward travel left for leg9's 2.75 s)
// before leg9, so the player is behind her the whole climb.
// Note: the wait sits at the bottom (730,540), exposed to VERA's
// southward leg — if she is mid-southward on arrival the wait
// itself can chase her. Re-run if the wait fails; the arrival
// time varies with the earlier waits.
//  Route v8 (Ledger -> Key -> Crown+exit). v7 died exactly there:
// VERA chased DURING the wait (det=1, caught at (728,535)) — the
// bottom is VERA's territory on her southward leg, confirmed.
// Fix: wait at the SAFE south-east corner (880,540) instead —
// dx 180+ from VERA's route (out of range), CAM 2 dist 241, NOOR
// 286, LUKA/ODETTE/BASIL far — for VERA moving NORTH with y>400
// (4.0 s of northward travel left, vs 3.82 s for the west move
// 880->730 plus leg9). The pool passage (y360-240) then happens
// at 2.36-3.21 s after the wait return, while VERA is still
// moving north; the post-pool tail (VERA turns south at ~3.9 s)
// adds at most ~+0.5 in the dark, survivable.
//  Route v9 (Ledger -> Key -> Crown+exit). v8 died at leg13: BASIL
// chased (det=1, caught at (731,153)). Root cause: the hall legs
// (y=155, 95 px south of BASIL's y=60 route) put the player in
// BASIL's E/W cone whenever 136<|dx|<153 px — a narrow window,
// but leg10 + Key grab + leg11 + leg12 accumulate suspicion to
// 1.0 with almost no decay gap between them. Fix: wait for BASIL
// x<550 before leg10, so |dx| stays >180 (out of range) through
// legs 10-12 and BASIL's exposure is 0. The wait sits at
// (730,155), where BASIL passing x577-594 facing east adds at
// most ~+0.20, which decays during the wait.
//  Route v10 (Ledger -> Key -> Crown+exit). v9 died at the BASIL
// wait — but the killer was VERA, not BASIL (det=1, VERA chased,
// caught at (727,143)). Root cause: after leg9 VERA (northbound
// from y=479) approaches the player's y (155) from the south;
// the player is NORTH of her, in front of her, in her cone for
// the 0.81 s it takes her to pass the player's y — ~+0.93, and
// standing still at (730,155) for the BASIL wait lets it reach
// 1.0. Fix: (1) merge the VERA + BASIL waits into ONE joint wait
// at the safe SE corner (880,540) — VERA north y>400 AND BASIL
// x<550, timeout 60 s (joint window ~5%, expected wait ~21 s);
// (2) leg10 follows leg9 IMMEDIATELY (no wait at (730,155)) —
// moving east cuts the VERA leg9-end exposure to ~0.2 s (+0.23).
// Sequential waits cannot work: whichever condition is waited
// first expires during the second wait (VERA's northward leg is
// 4.0 s, BASIL's x<550 window 3.57 s).
//  Route v11 (Ledger -> Key -> Crown+exit). v10 WON FULL-CLEAR
// (props 1,1,1, t=43.4 s) but det=1 — NOT GHOST. Killer: VERA
// again, on leg13 (south through the east passage). VERA turned
// south during legs 10-12, so on leg13 she faces south while the
// player (faster, 140 vs 70) overtakes her from behind and sits
// in front of her cone, in the light pool — suspicion 1.0, she
// chased the player all the way to the exit (109,135). Fix: wait
// for VERA moving NORTH before leg13, at (730,155). Safe because
// VERA is deterministically moving SOUTH at leg12 end (legs 8c-12
// take 6.96 s > her remaining northward travel of 4.0-5.11 s from
// the joint wait), so she moves away from the player while the
// wait runs (~3.3 s to her south end); leg13 then descends while
// she moves north and the player is behind her.
//  Route v12 (Ledger -> Key -> Crown+exit). v11 died at leg12:
// BASIL chased (det=1, caught at (804,149)). Root cause: the
// joint wait's "BASIL x<550" does not fix his DIRECTION — BASIL
// was at (367,60) moving EAST (toward the hall), so leg10 + Key
// + leg11 accumulated ~+0.78 and jitter pushed it to 1.0. Fix:
// the joint wait now requires BASIL moving WEST (dx<0) instead of
// x<550: the player (east, in the hall) is then always BEHIND
// him, exposure ~0 (leg12's pass-through adds at most +0.20).
// Joint window ~5.5%, expected wait ~18 s, timeout 60 s.
//  Route v13 (Ledger -> Key -> Crown+exit). v12 died at leg13:
// VERA chased (det=1, caught at (726,366), in the pool). Final
// analysis: the east-passage SOUTHBOUND cannot be GHOST in any
// VERA phase — the corridor is 30 px from her route and the hall
// pool (y240-360) sits in it, so the player spends ~2 s in her
// cone (fill ~2.86/s) whether head-on (VERA north) or overtaking
// (VERA south). Fix: do NOT descend the east passage. After the
// Key, continue west along the hall to (370,155), then descend
// through the MIDDLE (x=370, west of L1/L2's x380 start, dx 330
// from VERA = out of range). The middle crossing needs a LUKA
// wait at (370,155) — LUKA x<450 facing EAST, so the player
// crosses y=300 behind him (safe; (370,155) itself is never in
// his cone, vertical gap 145 px). NOOR at y=480 is accepted as a
// ~+0.3-0.6 risk (no joint wait — LUKA+NOOR joint window is
// ~0.8%, would time out). The VERA wait before leg13 is deleted.
//  Corridors (v3 map): west passage x172-328, east passage
//  x712-748, bottom y472-568, y=250 lane between L1/L2, south of
//  curtain A (340,80,40,140). Hall crossings y=155, tol 6.
async function probeT3() {
  out('--- Probe T3 (timed Job 3 FULL-CLEAR win, must WIN GHOST) ---');
  if (!(await reachJob3())) { out('Probe T3: could not reach Job 3'); return false; }
  const tStart = Date.now();
  let r = await moveTo(200, 540, {});
  out(`T3 leg1 west along the bottom (200,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg1'); return false; }
  r = await waitFor((s) => s.guards[4].x > 500 && s.guards[4].dx > 0, 30000, 'NOOR east x>500 facing east');
  out(`T3 wait NOOR east x>500 facing east: ${r.ok ? 'ok ' + fmtGuards(r.s) : 'FAIL ' + r.why}`);
  if (!r.ok) { await diagnose('wait-noor'); return false; }
  r = await moveTo(185, 250, { tol: 6 });
  out(`T3 leg2 north up the west passage (185,250): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg2'); return false; }
  r = await waitFor((s) => s.guards[1].x < 500 && s.guards[1].dx > 0 && !s.lasers[2], 45000, 'LUKA west x<500 facing east AND L3 OFF');
  out(`T3 wait LUKA west x<500 + L3 OFF: ${r.ok ? 'ok ' + fmtGuards(r.s) + ' lasers=' + r.s.lasers : 'FAIL ' + r.why}`);
  if (!r.ok) { await diagnose('wait-luka-l3'); return false; }
  r = await moveTo(370, 250, { tol: 6 });
  out(`T3 leg3 east at y=250, crossing L3 while OFF (370,250): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg3'); return false; }
  r = await moveTo(370, 300, { run: true });
  out(`T3 leg4 RUN south to (370,300): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg4'); return false; }
  r = await moveTo(520, 300, {});
  let s = await snap();
  out(`T3 Ledger grab WALK (520,300): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y}) props=${s?.props}`);
  if (!r.ok || !s || s.props[1] !== 1) { await diagnose('ledger'); return false; }
  r = await moveTo(600, 420, {});
  out(`T3 leg5 south-east to (600,420): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg5'); return false; }
  r = await moveTo(650, 420, {});
  out(`T3 leg6 east to (650,420): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg6'); return false; }
  r = await moveTo(650, 540, {});
  out(`T3 leg7 south to the bottom (650,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg7'); return false; }
  r = await moveTo(730, 540, {});
  out(`T3 leg8 east along the bottom (730,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg8'); return false; }
  r = await moveTo(880, 540, {});
  out(`T3 leg8b east to the safe SE corner (880,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg8b'); return false; }
  r = await waitFor((s) => s.guards[0].dy < 0 && s.guards[0].y > 400 && s.guards[3].dx < 0, 60000, 'VERA north y>400 AND BASIL west dx<0');
  out(`T3 wait VERA north y>400 + BASIL west: ${r.ok ? 'ok G1@(' + r.s.guards[0].x + ',' + r.s.guards[0].y + ') G4@(' + r.s.guards[3].x + ',' + r.s.guards[3].y + ')' : 'FAIL ' + r.why}`);
  if (!r.ok) { await diagnose('wait-vera-basil'); return false; }
  r = await moveTo(730, 540, {});
  out(`T3 leg8c west back to the east passage (730,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg8c'); return false; }
  r = await moveTo(730, 155, { tol: 6 });
  out(`T3 leg9 north through the east passage (730,155): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg9'); return false; }
  r = await moveTo(880, 155, { tol: 6 });
  out(`T3 leg10 east along the hall (880,155): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg10'); return false; }
  r = await moveTo(880, 90, { tol: 10 });
  s = await snap();
  out(`T3 Key grab (880,90): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y}) props=${s?.props}`);
  if (!r.ok || !s || s.props[0] !== 1) { await diagnose('key'); return false; }
  r = await moveTo(880, 155, { tol: 6 });
  out(`T3 leg11 south to (880,155): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg11'); return false; }
  r = await moveTo(730, 155, { tol: 6 });
  out(`T3 leg12 west along the hall (730,155): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg12'); return false; }
  r = await moveTo(370, 155, { tol: 6 });
  out(`T3 leg12b west along the hall to the middle (370,155): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg12b'); return false; }
  r = await waitFor((s) => s.guards[1].x < 450 && s.guards[1].dx > 0, 30000, 'LUKA west x<450 facing east');
  out(`T3 wait LUKA west x<450 east: ${r.ok ? 'ok G2@(' + r.s.guards[1].x + ',' + r.s.guards[1].y + ')' : 'FAIL ' + r.why}`);
  if (!r.ok) { await diagnose('wait-luka13'); return false; }
  r = await moveTo(370, 540, {});
  out(`T3 leg13m south through the middle (370,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg13m'); return false; }
  r = await moveTo(200, 540, {});
  out(`T3 leg14 west along the bottom (200,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg14'); return false; }
  r = await moveTo(185, 155, { tol: 6 });
  out(`T3 leg15 north up the west passage (185,155): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg15'); return false; }
  r = await moveTo(90, 155, { tol: 6 });
  out(`T3 leg16 west to (90,155): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) { await diagnose('leg16'); return false; }
  r = await moveTo(90, 100, { tol: 6 });
  let leg17 = r.ok ? 'arrived' : (r.why === 'screen=win' ? 'won en route' : 'FAIL ' + r.why);
  if (r.ok) {
    const sNow = await snap();
    if (sNow && sNow.screen === 'play') {
      const t0 = Date.now();
      await keyDown(...KEYMAP.W);
      while (Date.now() - t0 < 3000) {
        const s2 = await snap();
        if (!s2 || s2.screen !== 'play') break;
        await sleep(50);
      }
      await releaseAll();
      const sEnd = await snap();
      leg17 = sEnd && sEnd.screen === 'win' ? 'won en route (drive-north)' : 'arrived, screen=' + (sEnd?.screen ?? 'null');
    }
  }
  out(`T3 leg17 north to the Crown/exit (90,100): ${leg17} @(${r.x},${r.y})`);
  if (leg17.startsWith('FAIL')) { await diagnose('leg17'); return false; }
  await sleep(1500);
  s = await snap();
  const tWall = ((Date.now() - tStart) / 1000).toFixed(1);
  out(`Probe T3: screen=${s.screen} status=${s.status} t=${s.t}s (wall ${tWall}s) pos=(${s.px},${s.py}) det=${s.det} exp=${s.exp} props=${s.props}`);
  out(`Probe T3 guards: ${fmtGuards(s)}`);
  out(`Probe T3 cams: ${fmtCams(s)}`);
  await shot('probeT3-final.png');
  const ghost = s.status === 'won' && s.det === 0 && s.props.join('') === '111';
  out(`Probe T3 verdict: ${ghost ? 'WIN GHOST FULL-CLEAR (expected)' : '!!! ' + s.status.toUpperCase() + ' det=' + s.det + ' props=' + s.props + ' — NOT GHOST FULL-CLEAR !!!'}`);
  return ghost;
}

await send('Runtime.enable');
await send('Page.enable');
const results = {};
if (WHICH === 'all' || WHICH === 'A3') results.A3 = await probeA3();
if (WHICH === 'all' || WHICH === 'T3') results.T3 = await probeT3();
out(`console errors: ${errors.length}${errors.length ? ' ' + JSON.stringify(errors).slice(0, 400) : ' (none)'}`);
out('PROBE-RESULT ' + JSON.stringify(results));
ws.close();
chrome.kill();
server.close();
process.exit(results.A3 === false || results.T3 === false ? 1 : 0);
