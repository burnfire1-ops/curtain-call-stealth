// M14 probe driver — Job 2 (THE GALLERY AFTER DARK).
// Same harness as prototypes/m13/probe.mjs (own headless Chrome port
// 9226, own profile under playtest/profile2, same bundle on
// 127.0.0.1:8125). SNAP adds job + cameras + lasers.
//   Probe A2 — naive Job 2 (W+D+Shift from spawn, 30 s): MUST LOSE.
//   Probe T2 — timed Job 2 win (the golden path): MUST WIN GHOST.
// Job 2 is reached through the REAL campaign flow: win Job 1 with the
// proven M7 route v5, then ENTER (NEXT JOB). That also proves the
// unlock works end-to-end; if the Job 1 win flakes, T2/A2 cannot run
// and the driver says so instead of faking a Job 2 start.
// Usage: node prototypes/m14/probe2.mjs [A2|T2|all]
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';

const CHROME = '/home/hatch/workspace/chip404/chrome/opt/google/chrome/chrome';
const BUNDLE = '/home/hatch/workspace/makefun/best-stealth-game/playtest/curtain-call-playtest.html';
const PROFILE = '/home/hatch/workspace/makefun/best-stealth-game/playtest/profile2';
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
    guards: w.guards.map((g) => ({ x: Math.round(g.x), y: Math.round(g.y),
      s: g.state, dx: +g.dir.x.toFixed(2), sus: +g.suspicion.toFixed(2) })),
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
      if (!s || s.screen !== 'play') return { ok: false, why: 'screen=' + (s?.screen ?? 'null'), ...s };
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
const fmtGuards = (s) => s.guards.map((g, i) => `U${i + 1} ${g.s}@(${g.x},${g.y})`).join(' ');
const fmtCams = (s) => s.cams.map((c, i) => `CAM${i + 1} a${c.a} sus${c.sus}`).join(' ');

// --- reach Job 2 through the real flow: select Job 1, win it (route
// v5, copied verbatim from prototypes/m13/probe.mjs), ENTER = NEXT JOB.
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
  out('reachJob2: Job 1 started');
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
  const won1 = s.screen === 'win' && s.status === 'won' && s.det === 0;
  out(`  J1 win: screen=${s.screen} status=${s.status} t=${s.t}s det=${s.det} ${won1 ? 'GHOST' : 'NOT GHOST — aborting'}`);
  if (!won1) return false;
  await tap('Enter', 'Enter'); // NEXT JOB
  await sleep(400);
  s = await snap();
  const inJob2 = s.screen === 'play' && s.job === 1;
  out(`  NEXT JOB: screen=${s.screen} job=${s.job} ${inJob2 ? 'in Job 2' : 'FAILED to enter Job 2'}`);
  return inJob2;
}

// --- Probe A2: naive Job 2 (W+D+Shift from spawn, 30 s), MUST LOSE ---
// Spawn (80,300): diagonal NE to the top wall (y=32) at ~1.7 s, then
// east along the top. USHER 4 (y=60, starts (880,60) heading west)
// fills ~0.73 on the first pass (no chase); the player sticks at
// (940,32); USHER 4 returns east, re-enters the cone at ~9.2 s,
// chase at ~9.9 s, catch at ~11 s. CAM 3 never sees the stuck player
// (its sweep is [130,230] deg; the player sits at 294 deg from it).
async function probeA2() {
  out('--- Probe A2 (naive Job 2 W+D+run, must LOSE) ---');
  if (!(await reachJob2())) { out('Probe A2: could not reach Job 2'); return false; }
  await keyDown('KeyW', 'w'); await keyDown('KeyD', 'd'); await keyDown('ShiftLeft', 'Shift');
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
  out(`Probe A2: screen=${s.screen} status=${s.status} t=${t}s pos=(${s.px},${s.py}) det=${s.det} exp=${s.exp}`);
  out(`Probe A2 guards: ${fmtGuards(s)}`);
  out(`Probe A2 cams: ${fmtCams(s)}`);
  await shot('probeA2-final.png');
  out(`Probe A2 verdict: ${s.status === 'lost' ? 'LOSE (expected)' : '!!! ' + s.status.toUpperCase() + ' — UNEXPECTED, STOP !!!'}`);
  return s.status === 'lost';
}

// --- Probe T2: timed Job 2 win (the golden path), MUST WIN GHOST ---
// Route: spawn (80,300) -> south along the west edge (80,540) -> wait
// for USHER 3 north (guards[2].y < 200) -> east along the bottom
// (700,540) -> wait for CAM 2's sweep to swing past south-west
// (cameras[1].angle > 3.4) -> the exit (880,510) + drive-east.
// Lasers never touch the path (L1/L2/L3 all >=80px clear — see the
// m14.test.js golden-path test); CAM 1/CAM 3 never reach it (range).
// USHER 1 hazard: the bottom leg passes (300,540), 60px south of
// USHER 1's south waypoint (300,480). USHER 1 and USHER 3 start north
// at t=0 with the same 10.3 s cycle and speed, so they stay in phase —
// the USHER-3-north wait implies USHER 1 is north too, and by the time
// it reaches the hazard band the player is past x=500 (out of its cone
// in x and out of range). If USHER 1 is ever interrupted before leg 2
// the phases drift — a flake here must be reported, not hidden.
async function probeT2() {
  out('--- Probe T2 (timed Job 2 win, must WIN GHOST) ---');
  if (!(await reachJob2())) { out('Probe T2: could not reach Job 2'); return false; }
  let r = await moveTo(80, 540, {});
  out(`T2 leg1 south along the west edge (80,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await waitFor((s) => s.guards[2].y < 200, 30000, 'USHER 3 north y<200');
  out(`T2 wait USHER 3 north y<200 (USHER 1 in phase, also north): ${r.ok ? 'ok G3@(' + r.s.guards[2].x + ',' + r.s.guards[2].y + ')' : 'FAIL ' + r.why}`);
  if (!r.ok) return false;
  r = await moveTo(700, 540, {});
  out(`T2 leg2 east along the bottom (700,540): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await waitFor((s) => s.cams[1].a > 3.4, 30000, 'CAM 2 angle > 3.4');
  out(`T2 wait CAM 2 angle > 3.4 (sweep past south-west): ${r.ok ? 'ok ' + fmtCams(r.s) : 'FAIL ' + r.why}`);
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
  out(`T2 leg3 to the exit (880,510): ${leg3} @(${r.x},${r.y})`);
  if (leg3.startsWith('FAIL')) return false;
  await sleep(1500);
  const s = await snap();
  out(`Probe T2: screen=${s.screen} status=${s.status} t=${s.t}s pos=(${s.px},${s.py}) det=${s.det} exp=${s.exp}`);
  out(`Probe T2 guards: ${fmtGuards(s)}`);
  out(`Probe T2 cams: ${fmtCams(s)}`);
  await shot('probeT2-final.png');
  const ghost = s.status === 'won' && s.det === 0;
  out(`Probe T2 verdict: ${ghost ? 'WIN GHOST (expected)' : '!!! ' + s.status.toUpperCase() + ' det=' + s.det + ' — NOT GHOST WIN !!!'}`);
  return ghost;
}

await send('Runtime.enable');
await send('Page.enable');
const results = {};
if (WHICH === 'all' || WHICH === 'A2') results.A2 = await probeA2();
if (WHICH === 'all' || WHICH === 'T2') results.T2 = await probeT2();
out(`console errors: ${errors.length}${errors.length ? ' ' + JSON.stringify(errors).slice(0, 400) : ' (none)'}`);
out('PROBE-RESULT ' + JSON.stringify(results));
ws.close();
chrome.kill();
server.close();
process.exit(results.A2 === false || results.T2 === false ? 1 : 0);
