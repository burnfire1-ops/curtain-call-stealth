// M13 probe driver — RECONSTRUCTED 22 Nov ~23:00 WIB after a service
// restart wiped /tmp (deleted /tmp/m7-playtest.mjs + the playtest bundle).
// This copy lives in the REPO (prototypes/m13/) so it survives /tmp wipes.
// Probe definitions follow m7-builder-report.md §4 (route v5) and the
// M12 parent re-runs exactly:
//   Probe A — naive (Enter + hold W+D+Shift, 30 s): MUST LOSE.
//   Probe T — timed win (patient route v5): MUST WIN GHOST.
//   Probe C — old parent route (x=380 north): INFO ONLY, not a gate.
// Pure Node (global WebSocket, no deps). Launches its own headless Chrome
// (port 9226, profile under the bounty playtest dir) and serves the
// workspace playtest bundle on 127.0.0.1:8125.
// Usage: node prototypes/m13/probe.mjs [A|T|C|all]
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';

const CHROME = '/home/hatch/workspace/chip404/chrome/opt/google/chrome/chrome';
const BUNDLE = '/home/hatch/workspace/makefun/best-stealth-game/playtest/curtain-call-playtest.html';
const PROFILE = '/home/hatch/workspace/makefun/best-stealth-game/playtest/profile';
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
    px: Math.round(w.player.x), py: Math.round(w.player.y),
    det: w.detections, exp: +w.exposure.toFixed(2),
    guards: w.guards.map((g) => ({ x: Math.round(g.x), y: Math.round(g.y),
      s: g.state, dx: +g.dir.x.toFixed(2), sus: +g.suspicion.toFixed(2) })) }); })()`;
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
async function freshGame() {
  await send('Page.navigate', { url: `http://127.0.0.1:${SERVE_PORT}/curtain-call-playtest.html` });
  await sleep(1000);
  const s0 = await snap();
  if (!s0) throw new Error('no __curtainCall after navigate');
  await tap('Enter', 'Enter');
  await sleep(400);
  const s = await snap();
  if (s.screen !== 'play') throw new Error('Enter did not start game, screen=' + s.screen);
  return s;
}
const fmtGuards = (s) => s.guards.map((g, i) => `U${i + 1} ${g.s}@(${g.x},${g.y})`).join(' ');

// --- Probe A: naive, hold W+D+Shift 30 s, MUST LOSE ---
async function probeA() {
  out('--- Probe A (naive W+D+run, must LOSE) ---');
  await freshGame();
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
  out(`Probe A: screen=${s.screen} status=${s.status} t=${t}s pos=(${s.px},${s.py}) det=${s.det} exp=${s.exp}`);
  out(`Probe A guards: ${fmtGuards(s)}`);
  await shot('probeA-final.png');
  out(`Probe A verdict: ${s.status === 'lost' ? 'LOSE (expected)' : '!!! ' + s.status.toUpperCase() + ' — UNEXPECTED, STOP !!!'}`);
  return s.status === 'lost';
}

// --- Probe T: timed win route v5 (M7 report), MUST WIN GHOST ---
async function probeT() {
  out('--- Probe T (timed win v5, must WIN GHOST) ---');
  await freshGame();
  let r = await moveTo(200, 520, {});
  out(`T leg1 to (200,520): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await waitFor((s) => s.guards[0].x < 300 && s.guards[0].dx < 0, 30000, 'U1 west heading west');
  out(`T wait U1 west x<300 facing west: ${r.ok ? 'ok U1@(' + r.s.guards[0].x + ',' + r.s.guards[0].y + ')' : 'FAIL ' + r.why}`);
  if (!r.ok) return false;
  r = await moveTo(200, 170, {});
  out(`T leg2 push-through to (200,170): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await waitFor((s) => s.guards[5].x >= 500 && s.guards[5].x <= 515 && s.guards[5].dx > 0, 30000, 'U6 just-turned-east 500-515');
  out(`T wait U6 just-turned-east x 500-515: ${r.ok ? 'ok U6@(' + r.s.guards[5].x + ',' + r.s.guards[5].y + ')' : 'FAIL ' + r.why}`);
  if (!r.ok) return false;
  r = await moveTo(200, 32, { tol: 6 });
  out(`T leg3a WALK north to top wall (200,32): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await moveTo(400, 32, { tol: 6 });
  out(`T leg3b WALK east along top (400,32): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  // Settle: ACTIVELY hold W until the player is pressed against the top
  // wall (y<=33) — a passive wait can never move the player (keys were
  // released by moveTo's +-14 tolerance, e.g. stopped at y=39).
  let settled = false;
  {
    const t0 = Date.now();
    await keyDown(...KEYMAP.W);
    while (Date.now() - t0 < 5000) {
      const s = await snap();
      if (!s || s.screen !== 'play') break;
      if (s.py <= 33) { settled = true; break; }
      await sleep(50);
    }
    await releaseAll();
  }
  out(`T settle to top wall y<=33: ${settled ? 'ok' : 'FAIL timeout'}`);
  if (!settled) return false;
  // Tight tol: exit rect starts x=860 and at y=32 the circle (r=12) only
  // touches it at x>=852, so the +-14 default can stop 12px short (848)
  // and leave the player standing for U6 to catch (the 22 Nov 23:0x
  // run lost exactly this way). After arriving, keep driving east until
  // the screen actually changes — the exit window is ~80px wide.
  r = await moveTo(860, 32, { tol: 4 });
  let leg4 = r.ok ? 'arrived' : (r.why === 'screen=win' ? 'won en route' : 'FAIL ' + r.why);
  if (r.ok) {
    const sNow = await snap();
    if (sNow && sNow.screen === 'play') {
      const t0 = Date.now();
      await keyDown(...KEYMAP.D);
      while (Date.now() - t0 < 3000) {
        const s = await snap();
        if (!s || s.screen !== 'play') break;
        await sleep(50);
      }
      await releaseAll();
      const sEnd = await snap();
      leg4 = sEnd && sEnd.screen === 'win' ? 'won en route (drive-east)' : 'arrived, screen=' + (sEnd?.screen ?? 'null');
    }
  }
  out(`T leg4 WALK east along top to exit (860,32): ${leg4} @(${r.x},${r.y})`);
  if (leg4.startsWith('FAIL')) return false;
  await sleep(1500);
  const s = await snap();
  out(`Probe T: screen=${s.screen} status=${s.status} t=${s.t}s pos=(${s.px},${s.py}) det=${s.det} exp=${s.exp}`);
  out(`Probe T guards: ${fmtGuards(s)}`);
  await shot('probeT-final.png');
  const ghost = s.status === 'won' && s.det === 0;
  out(`Probe T verdict: ${ghost ? 'WIN GHOST (expected)' : '!!! ' + s.status.toUpperCase() + ' det=' + s.det + ' — NOT GHOST WIN !!!'}`);
  return ghost;
}

// --- Probe C: old parent route (x=380 north), INFO ONLY ---
async function probeC() {
  out('--- Probe C (old parent route x=380, INFO ONLY) ---');
  await freshGame();
  let r = await moveTo(380, 520, {});
  out(`C leg1 to (380,520): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await moveTo(380, 60, {});
  out(`C leg2 north to (380,60): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  if (!r.ok) return false;
  r = await moveTo(860, 32, {});
  out(`C leg3 to exit (860,32): ${r.ok ? 'ok' : 'FAIL ' + r.why} @(${r.x},${r.y})`);
  await sleep(1000);
  const s = await snap();
  out(`Probe C: screen=${s.screen} status=${s.status} t=${s.t}s pos=(${s.px},${s.py}) det=${s.det}`);
  await shot('probeC-final.png');
  return true; // info only — never gates
}

await send('Runtime.enable');
await send('Page.enable');
const results = {};
if (WHICH === 'all' || WHICH === 'A') results.A = await probeA();
if (WHICH === 'all' || WHICH === 'T') results.T = await probeT();
if (WHICH === 'all' || WHICH === 'C') results.C = await probeC();
out(`console errors: ${errors.length}${errors.length ? ' ' + JSON.stringify(errors).slice(0, 400) : ' (none)'}`);
out('PROBE-RESULT ' + JSON.stringify(results));
ws.close();
chrome.kill();
server.close();
process.exit(results.A === false || results.T === false ? 1 : 0);
