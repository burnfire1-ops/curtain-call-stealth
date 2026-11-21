// M3 CDP scenario driver — pure Node (global WebSocket, no deps).
// Verifies the 3-wing level live in stock Chrome headless: multi-guard
// FSM, noise hearing, footstep rings, teach walk, then deterministic
// ?shot= frames per wing. Viewport 960x600 (M2 debt: the 800x600 default
// cropped the canvas). Expects Chrome on --remote-debugging-port=9223 and
// game/ served on 127.0.0.1:8124. Usage: node prototypes/m3/cdp.mjs <outdir>
import fs from 'node:fs';

const OUT = process.argv[2] || '/tmp/m3-shots';
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
  log.push(`shot ${name} (${fs.statSync(`${OUT}/${name}`).size} bytes)`);
}
async function keyDown(code, key) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key });
}
async function keyUp(code, key) {
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key });
}
const guardsAt = () => evalJs(`(() => { const w = window.__curtainCall.world; return w.guards.map((g) => g.name + ':' + g.state + ':' + g.suspicion.toFixed(2)).join(' | ') + ' exposure=' + w.exposure.toFixed(2) + ' status=' + w.status + ' rings=' + w.rings.length; })()`);

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 960, height: 600, deviceScaleFactor: 1, mobile: false,
});
await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html' });
await sleep(1200);
await evalJs(`document.getElementById('game').click()`);
await sleep(200);

// Live 1: player in guard 1's lit cone (350,300) — only guard 1 reacts.
await evalJs(`(() => { const w = window.__curtainCall.world; w.player.x = 350; w.player.y = 300; })()`);
await sleep(1200);
log.push('live seen 1.2s (expect USHER 1 chase ~1.0, rest patrol 0.00): ' + (await guardsAt()));
await shot('m3-live-chase.png');

// Live 2: player hides behind guard 1 — guard 1 searches last-known.
await evalJs(`window.__curtainCall.world.player.x = 300; window.__curtainCall.world.player.y = 420;`);
await sleep(1000);
log.push('live hide+1.0s (expect USHER 1 search, moving to 350,300): ' + (await guardsAt()));

// Live 3 (fresh world): run left on wood — guard 1 hears the noise.
// Restart with R, teleport, hold Shift+KeyA 1s, read BEFORE releasing.
await keyDown('KeyR', 'r');
await keyUp('KeyR', 'r');
await sleep(200);
await evalJs(`(() => { const w = window.__curtainCall.world; w.player.x = 250; w.player.y = 400; })()`);
await keyDown('ShiftLeft', 'Shift');
await keyDown('KeyA', 'a');
await sleep(1000);
log.push('live wood-run 1.0s (expect USHER 1 suspicious via heard, noiseRing set): ' + (await guardsAt())
  + ' noiseRing=' + (await evalJs(`(() => { const n = window.__curtainCall.world.noiseRing; return n ? 'r=' + n.radius : 'null'; })()`))
  + ' lastKnown=' + (await evalJs(`JSON.stringify(window.__curtainCall.world.guards[0].lastKnown)`)));
await keyUp('KeyA', 'a');
await keyUp('ShiftLeft', 'Shift');
await shot('m3-live-noise.png');

// Live 4 (fresh world): teach walk along the bottom, no run.
await keyDown('KeyR', 'r');
await keyUp('KeyR', 'r');
await sleep(200);
await keyDown('KeyD', 'd');
await sleep(2200);
await keyUp('KeyD', 'd');
log.push('live teach walk 2.2s (expect player.x>=355, playing, exposure 0): '
  + (await evalJs(`(() => { const w = window.__curtainCall.world; return 'player=(' + w.player.x.toFixed(0) + ',' + w.player.y.toFixed(0) + ') status=' + w.status + ' exposure=' + w.exposure.toFixed(2); })()`)));
await shot('m3-live-play.png');

// Deterministic ?shot= frames (no live loop, no __curtainCall).
for (const s of ['start', 'play', 'end', 'chase', 'foyer', 'auditorium', 'backstage']) {
  await send('Page.navigate', { url: `http://127.0.0.1:8124/index.html?shot=${s}` });
  await sleep(800);
  await shot(`m3-shot-${s}.png`);
}

log.push('console errors: ' + errors.length + (errors.length ? ' ' + JSON.stringify(errors).slice(0, 500) : ' (none)'));
console.log('CDP-RESULT\n' + log.join('\n'));
ws.close();
process.exit(0);
