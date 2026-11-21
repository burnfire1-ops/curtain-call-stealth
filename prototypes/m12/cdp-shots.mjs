// M12 screenshot driver — pure Node (global WebSocket, no deps).
// Takes the 4 SHIP screenshots into repo/screenshots/ via the frozen
// ?shot= frames (deterministic, reproducible): 1-start (controls incl.
// C throw coin), 2-play (coin ring + CAM 1 teal cone + USHER 2
// investigating), 3-end (GHOST win), 4-alarm (ALARM! pill + teal
// camera cone on the player + U1 chase). Also checks the M5
// index.html fix: the page must fit EXACTLY in a 960x600 viewport
// (scrollWidth/Height == 960/600, no scrollbar) and 0 console errors
// on every shot.
// Expects Chrome on --remote-debugging-port=9223 and game/ served on
// 127.0.0.1:8124. Usage: node prototypes/m12/cdp-shots.mjs <outdir>
import fs from 'node:fs';

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
  const size = fs.statSync(`${OUT}/${name}`).size;
  log.push(`shot ${name} (${size} bytes, ${size <= 262144 ? 'OK <=256KiB' : 'OVER 256KiB'})`);
}

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 960, height: 600, deviceScaleFactor: 1, mobile: false,
});

// Page-fit check (M5 index.html fix): no scrollbar at 960x600.
await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?shot=start' });
await sleep(1200);
const fit = await evalJs(`JSON.stringify({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: window.innerWidth, ih: window.innerHeight, canvas: document.getElementById('game').getBoundingClientRect().toJSON() })`);
log.push('page fit (expect sw=960 sh=600): ' + fit);
await shot('1-start.png');

await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?shot=play' });
await sleep(800);
log.push('play state: ' + (await evalJs(`(() => { const w = window.__curtainCall; return w ? 'live-mode (unexpected)' : 'frozen shot frame'; })()`)));
await shot('2-play.png');

await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?shot=end' });
await sleep(800);
await shot('3-end.png');

await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?shot=chase' });
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
