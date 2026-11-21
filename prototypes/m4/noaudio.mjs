// M4 no-audio check — same CDP harness as cdp.mjs, but the page loads
// with window.AudioContext deleted (Page.addScriptToEvaluateOnNewDocument),
// simulating a browser/headless run with no audio device at all.
// The game must still start, play, win, and report 0 console errors:
// every audio.js method is a guarded no-op when unlock() finds no
// AudioContext. Usage: node prototypes/m4/noaudio.mjs
import fs from 'node:fs';

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

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 960, height: 600, deviceScaleFactor: 1, mobile: false,
});
// Remove the audio API before any page script runs.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'delete window.AudioContext; delete window.webkitAudioContext;',
});
await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html' });
await sleep(1200);
log.push('no-audio start: ' + (await evalJs(`(() => { const c = window.__curtainCall; return 'screen=' + c.screen + ' audioReady=' + c.audio.isReady(); })()`)));
// Start, walk, mute-toggle, win — all while audio is absent.
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter' });
await sleep(200);
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyM', key: 'm' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyM', key: 'm' });
await sleep(100);
log.push('no-audio mute toggle (expect muted=true, ready=false): '
  + (await evalJs(`(() => { const a = window.__curtainCall.audio; return 'muted=' + a.isMuted() + ' ready=' + a.isReady(); })()`)));
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyD', key: 'd' });
await sleep(800);
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyD', key: 'd' });
await evalJs(`(() => { const w = window.__curtainCall.world; w.player.x = 890; w.player.y = 70; })()`);
await sleep(300);
log.push('no-audio ghost win: ' + (await evalJs(`(() => { const c = window.__curtainCall; return 'screen=' + c.screen + ' status=' + c.world.status; })()`)));
log.push('console errors: ' + errors.length + (errors.length ? ' ' + JSON.stringify(errors).slice(0, 500) : ' (none)'));
console.log('NOAUDIO-RESULT\n' + log.join('\n'));
ws.close();
process.exit(0);
