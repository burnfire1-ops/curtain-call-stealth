// M5 probe: why is ?shot=chase blank? Navigate, wait, dump state.
import fs from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console.error: ' + JSON.stringify(msg.params.args).slice(0, 300));
  if (msg.method === 'Runtime.exceptionThrown') errors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 500));
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push('log.error: ' + msg.params.entry.text.slice(0, 200));
};
function send(method, params = {}) {
  return new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return 'EVAL-EXCEPTION: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400);
  return JSON.stringify(r.result?.result?.value);
}
await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?shot=chase' });
await sleep(2500);
console.log('url:', await evalJs(`window.location.href`));
console.log('canvas:', await evalJs(`(() => { const c = document.getElementById('game'); return c ? c.width + 'x' + c.height + ' rect=' + JSON.stringify(c.getBoundingClientRect()) : 'NO CANVAS'; })()`));
console.log('shot-param:', await evalJs(`new URLSearchParams(window.location.search).get('shot')`));
console.log('errors:', JSON.stringify(errors));
const r = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/tmp/m5-chase-probe.png', Buffer.from(r.result.data, 'base64'));
console.log('probe png bytes:', fs.statSync('/tmp/m5-chase-probe.png').size);
ws.close();
process.exit(0);
