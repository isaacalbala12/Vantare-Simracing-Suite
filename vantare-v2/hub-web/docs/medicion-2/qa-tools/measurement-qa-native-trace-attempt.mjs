// Loaded ONLY by the instrumented ASAR under the dedicated QA root. No TLA,
// browser capabilities, authentication values, or product defaults are changed.
import { app, contentTracing } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';

const data = resolve(process.env.VANTARE_HUB_DATA_DIR ?? '');
const owner = resolve('D:/VantareServer/qa/isa-1995-measure-2');
if (!data.toLowerCase().startsWith((owner + sep).toLowerCase())) throw new Error('Measurement ASAR is confined to its QA owner');
const options = JSON.parse(readFileSync(join(data, 'measurement-options.json'), 'utf8'));
const allowed = new Set(['baseline', 'hardware-off', 'hardware-off-no-gpu', 'renderer-limit', 'media-router-off', 'media-keys-off', 'trace']);
if (!allowed.has(options.variant)) throw new Error('Unknown measurement experiment');
const events = [], preferences = [], deniedSchemes = [];
const mark = name => events.push({ name, epochMs: performance.timeOrigin + performance.now(), processMs: performance.now() });
globalThis.__vantareMeasureMark = mark;
mark('qa-module-start');
const flags = [];
function flag(name, value) { app.commandLine.appendSwitch(name, value); flags.push({ name, value: value ?? '' }); }
if (options.variant === 'hardware-off' || options.variant === 'hardware-off-no-gpu') app.disableHardwareAcceleration();
if (options.variant === 'hardware-off-no-gpu') { flag('disable-gpu'); flag('disable-software-rasterizer'); }
if (options.variant === 'renderer-limit') flag('renderer-process-limit', '1');
if (options.variant === 'media-router-off') flag('disable-features', 'MediaRouter');
if (options.variant === 'media-keys-off') flag('disable-features', 'HardwareMediaKeyHandling');
mkdirSync(data, { recursive: true });
const result = () => ({ variant: options.variant, pid: process.pid, creationEpochMs: process.getCreationTime(), versions: process.versions, flags, preferences, deniedSchemes, events });
const flush = () => writeFileSync(join(data, 'measurement-startup.json'), JSON.stringify(result(), null, 2));
let tracePromise;
if (options.variant === 'trace') {
  mark('trace-requested');
  try {
    tracePromise = app.whenReady().then(() => contentTracing.startRecording({ included_categories: ['v8', 'devtools.timeline', 'blink.user_timing', 'loading', 'disabled-by-default-v8.compile'], recording_mode: 'record-until-full', trace_buffer_size_in_kb: 32768 }));
    tracePromise.then(() => { mark('trace-started'); flush(); }, error => { events.push({ name: 'trace-failed', message: String(error) }); flush(); });
  } catch(error) { events.push({ name: 'trace-failed', message: String(error) }); }
  // Directory notifications can be coalesced amid Chromium profile writes.
  // Poll only this closed QA marker; cancel on completion or app shutdown.
  const monitor = setInterval(() => {
    if (!existsSync(join(data, 'measurement-stop-trace'))) return;
    clearInterval(monitor);
    mark('trace-stop-requested'); flush();
    Promise.resolve(tracePromise).then(() => contentTracing.stopRecording(join(data, 'startup-trace.json'))).then(() => {
      mark('trace-stopped'); flush(); writeFileSync(join(data, 'trace-complete'), 'ok');
    }, error => { events.push({ name: 'trace-stop-failed', message: String(error) }); flush(); writeFileSync(join(data, 'trace-complete'), 'failed'); });
  }, 100);
  monitor.unref();
  app.once('before-quit', () => clearInterval(monitor));
}
app.once('ready', () => mark('app-ready'));
app.on('web-contents-created', (_event, contents) => {
  // Additional QA-only denial, never a relaxation of CSP or sandbox. No URL,
  // request body, cookies or auth value is logged.
  contents.session.webRequest.onBeforeRequest((details, callback) => {
    const scheme = details.url.split(':', 1)[0];
    const deny = ['http', 'https', 'ws', 'wss', 'ftp'].includes(scheme);
    if (deny) deniedSchemes.push(scheme);
    callback({ cancel: deny });
  });
  contents.on('ipc-message', (_event, channel) => { if (channel === 'vantare:connect') mark('renderer-connect-request'); });
});
app.on('browser-window-created', (_event, window) => {
  mark('window-created');
  const prefs = window.webContents.getLastWebPreferences();
  if (!prefs.sandbox || !prefs.contextIsolation || prefs.nodeIntegration || prefs.webSecurity === false || prefs.webviewTag) throw new Error('Measurement must preserve renderer isolation');
  preferences.push(Object.fromEntries(['sandbox','contextIsolation','nodeIntegration','webSecurity','webviewTag','spellcheck','backgroundThrottling','v8CacheOptions'].map(name => [name, prefs[name]])));
  for (const event of ['did-start-loading', 'dom-ready', 'did-finish-load']) window.webContents.once(event, () => mark(event));
  window.once('ready-to-show', () => mark('ready-to-show'));
  // Buffer through startup; no log write is added to the visible-window clock.
  window.once('show', () => { mark('window-show'); setTimeout(flush, 1000).unref(); });
});
app.on('before-quit', flush);
mark('qa-module-end');
