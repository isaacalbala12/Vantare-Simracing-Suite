// Loaded ONLY by the instrumented ASAR under the dedicated QA root. No TLA,
// browser capabilities, authentication values, or product defaults are changed.
import { app } from 'electron';
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
// Native contentTracing.stopRecording did not finish in the excluded pilots.
// This trace deliberately records explicit process/window/bridge epoch markers,
// not V8/Chromium CPU slices. Both paired conditions retain the same markers.
if (options.variant === 'trace') {
  mark('trace-started');
  const monitor = setInterval(() => {
    if (!existsSync(join(data, 'measurement-stop-trace'))) return;
    clearInterval(monitor);
    mark('trace-stopped'); flush();
    const traceEvents = events.filter(event => Number.isFinite(event.epochMs)).map(event => ({name:event.name,cat:'vantare.startup',ph:'i',s:'p',ts:event.epochMs*1000,pid:process.pid,tid:0}));
    writeFileSync(join(data,'startup-trace.json'),JSON.stringify({format:'vantare-startup-markers-v1',traceEvents}));
    writeFileSync(join(data,'trace-complete'),'ok');
  },100);
  monitor.unref();
  app.once('before-quit',()=>clearInterval(monitor));
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
