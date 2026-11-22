// M15: 1200x600 — the 960 playfield + the 240 right rail. Pure Node
// (global WebSocket, no deps). Takes the 4 SHIP screenshots into
// repo/screenshots/ via the frozen ?shot= frames (deterministic,
// reproducible). Also checks the M15 index.html fix: the page must fit
// EXACTLY in a 1200x600 viewport (scrollWidth/Height == 1200/600, no
// scrollbar) and 0 console errors on every shot.
// Expects Chrome on --remote-debugging-port=9223 and game/ served on
// 127.0.0.1:8124. Usage: node prototypes/m13/cdp-shots.mjs <outdir>
// M16: shot list is select / play3 / end3 / chase3 (Job 3 frames).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = process.argv[2] || '/tmp/m5-shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const errors = [];

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push('console.error: ' + JSON.stringify(msg.params.args).slice(0, 200));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push('log.error: ' + msg.params.entry.text.slice(0, 200));
  }
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
  fs.writeFileSync(`${OUT}/${name}`, Buffer.from(r.result.data, 'base64'));
  // M15: Chrome's PNG encoder leaves 1200x600 frames over the 256 KiB
  // cap (2-play +4,848 B, 4-alarm +8,782 B over) — re-encode losslessly
  // (pixel-identical, PIL max compression) so every shot fits.
  execFileSync('python3', ['-c',
    "from PIL import Image; import sys; im = Image.open(sys.argv[1]); im.save(sys.argv[1], optimize=True, compress_level=9)",
    `${OUT}/${name}`], { stdio: 'ignore' });
  const size = fs.statSync(`${OUT}/${name}`).size;
  log.push(`shot ${name} (${size} bytes, ${size <= 262144 ? 'OK <=256KiB' : 'OVER 256KiB'})`);
}

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1200, height: 600, deviceScaleFactor: 1, mobile: false,
});

// Page-fit check (M15 index.html fix): no scrollbar at 1200x600.
await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?shot=select' });
await sleep(1200);
const fit = await evalJs(`JSON.stringify({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: window.innerWidth, ih: window.innerHeight, canvas: document.getElementById('game').getBoundingClientRect().toJSON() })`);
log.push('page fit (expect sw=1200 sh=600): ' + fit);
await shot('1-select.png');

await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?shot=play3' });
await sleep(800);
log.push('play state: ' + (await evalJs(`(() => { const w = window.__curtainCall; return w ? 'live-mode (unexpected)' : 'frozen shot frame'; })()`)));
await shot('2-play.png');

await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?shot=end3' });
await sleep(800);
await shot('3-end.png');

await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?shot=chase3' });
await sleep(800);
await shot('4-alarm.png');

// Live sanity: the game still plays (start -> play, no errors).
await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html' });
await sleep(1000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter' });
await sleep(500);
log.push('live after Enter: ' + (await evalJs(`(() => { const c = window.__curtainCall; return 'screen=' + c.screen + ' status=' + c.world.status; })()`)));

log.push('console errors: ' + errors.length + (errors.length ? ' ' + JSON.stringify(errors).slice(0, 500) : ' (none)'));
console.log('CDP-RESULT\n' + log.join('\n'));
ws.close();
process.exit(0);
