// M4 CDP scenario driver — pure Node (global WebSocket, no deps).
// Verifies HUD + screens + audio + feel live in stock Chrome headless:
// start screen, play HUD, scripted GHOST win (teleport to exit unseen),
// SPOTTED win (one chase first), lose (caught by USHER 1), pause,
// mute toggle, "!" alert + "+1 PROP" flash. 0 console errors expected,
// including with no audio device. Viewport 960x600.
// Expects Chrome on --remote-debugging-port=9223 and game/ served on
// 127.0.0.1:8124. Usage: node prototypes/m4/cdp.mjs <outdir>
import fs from 'node:fs';

const OUT = process.argv[2] || '/tmp/m4-shots';
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
async function tap(code, key) {
  await keyDown(code, key);
  await keyUp(code, key);
}
const state = () => evalJs(`(() => { const c = window.__curtainCall; const w = c.world; return 'screen=' + c.screen + ' status=' + w.status + ' detections=' + w.detections + ' caughtBy=' + w.caughtBy + ' time=' + w.time.toFixed(1) + ' props=' + w.props.filter(p=>p.taken).length + '/3 exposure=' + w.exposure.toFixed(2) + ' guards=' + w.guards.map(g=>g.state).join(','); })()`);
const audioState = () => evalJs(`(() => { const a = window.__curtainCall.audio; return 'audio ready=' + a.isReady() + ' muted=' + a.isMuted(); })()`);

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 960, height: 600, deviceScaleFactor: 1, mobile: false,
});
await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html' });
await sleep(1200);
log.push('start: ' + (await state()));
await shot('m4-shot-start.png');

// Play: Enter starts, walk right 1s on the bottom (teach walk, unseen).
await tap('Enter', 'Enter');
await sleep(200);
await keyDown('KeyD', 'd');
await sleep(1000);
await keyUp('KeyD', 'd');
log.push('play 1s walk (expect playing, exposure 0): ' + (await state()));
await shot('m4-shot-play.png');

// Prop flash: teleport onto the Star Tiara, screenshot the "+1 PROP".
await evalJs(`(() => { const w = window.__curtainCall.world; w.player.x = 70; w.player.y = 90; })()`);
await sleep(150);
log.push('prop pickup (expect props 1/3, propFlash>0): ' + (await state())
  + ' propFlash=' + (await evalJs(`window.__curtainCall.world.feel.propFlash.toFixed(2)`)));
await shot('m4-shot-prop.png');

// GHOST win: fresh world, teleport straight to the exit unseen.
await tap('KeyR', 'r');
await sleep(200);
await evalJs(`(() => { const w = window.__curtainCall.world; w.player.x = 890; w.player.y = 70; })()`);
await sleep(300);
log.push('ghost win (expect screen=win, detections=0): ' + (await state()));
await shot('m4-shot-win-ghost.png');

// SPOTTED win: fresh world, get seen once (chase entry), then exit.
await tap('KeyR', 'r');
await sleep(200);
await evalJs(`(() => { const w = window.__curtainCall.world; w.player.x = 350; w.player.y = 300; })()`);
await sleep(1200);
log.push('spotted setup (expect detections=1, chase): ' + (await state()));
await shot('m4-shot-alert.png'); // "!" + blinking red cone edge, if still fresh
await evalJs(`(() => { const w = window.__curtainCall.world; w.player.x = 890; w.player.y = 70; })()`);
await sleep(300);
log.push('spotted win (expect screen=win, detections>=1): ' + (await state()));
await shot('m4-shot-win-spotted.png');

// Lose: fresh world, stand in USHER 1's cone until it touches the player.
await tap('KeyR', 'r');
await sleep(200);
await evalJs(`(() => { const w = window.__curtainCall.world; w.player.x = 350; w.player.y = 300; })()`);
let lost = false;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  const s = await state();
  if (s.includes('status=lost')) { lost = true; log.push('lose reached: ' + s); break; }
}
if (!lost) log.push('LOSE TIMEOUT (still playing after 10s): ' + (await state()));
await shot('m4-shot-lose.png');

// Pause: fresh world, P pauses, P resumes, R restarts from pause.
await tap('KeyR', 'r');
await sleep(200);
await tap('KeyP', 'p');
await sleep(200);
log.push('pause (expect screen=paused): ' + (await state()));
await shot('m4-shot-pause.png');
await tap('KeyP', 'p');
await sleep(200);
log.push('resume (expect screen=play): ' + (await state()));

// Mute: M toggles twice, audio must never throw (ready may be true or
// false in headless — either is fine as long as there is no error).
await tap('KeyM', 'm');
await sleep(100);
log.push('mute 1 (expect muted=true): ' + (await audioState()));
await tap('KeyM', 'm');
await sleep(100);
log.push('mute 2 (expect muted=false): ' + (await audioState()));

// Win/lose restart via Enter: lose again quickly, then Enter restarts.
await evalJs(`(() => { const w = window.__curtainCall.world; w.player.x = 350; w.player.y = 300; })()`);
for (let i = 0; i < 40; i++) {
  await sleep(250);
  const s = await state();
  if (s.includes('status=lost')) break;
}
await tap('Enter', 'Enter');
await sleep(200);
log.push('restart from lose via Enter (expect screen=play, status=playing): ' + (await state()));

// Deterministic ?shot=end frame (M5 screenshot candidate).
await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?shot=end' });
await sleep(800);
await shot('m4-shot-end.png');

log.push('console errors: ' + errors.length + (errors.length ? ' ' + JSON.stringify(errors).slice(0, 500) : ' (none)'));
console.log('CDP-RESULT\n' + log.join('\n'));
ws.close();
process.exit(0);
