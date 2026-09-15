import assert from 'node:assert/strict';
import test from 'node:test';
import { installDiagnosticRuntimeInPage } from './huella-runtime.mjs';

test('diagnostic import preserves delivery to app and observers without multiplying listeners', async () => {
  const previous = globalThis.window;
  const calls = [];
  globalThis.window = { _wails: { dispatchWailsEvent: e => calls.push(['app', e]) } };
  try {
    let imports = 0;
    const load = async () => { imports++; window._wails.dispatchWailsEvent = e => calls.push(['probe', e]); return { Events: {} }; };
    await installDiagnosticRuntimeInPage(load);
    await installDiagnosticRuntimeInPage(load);
    const event = {name: 'calendar:refresh:result', data: {ok: true}};
    window._wails.dispatchWailsEvent(event);
    assert.deepEqual(calls, [['app',event],['probe',event]]);
    assert.equal(imports,1);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});

test('concurrent diagnostic installations share one import and one delivery', async () => {
  const previous = globalThis.window;
  const calls = [];
  globalThis.window = { _wails: { dispatchWailsEvent: e => calls.push(['app',e]) } };
  try {
    let resolve; let imports = 0;
    const pending = new Promise(done => { resolve = done; });
    const load = () => { imports++; return pending; };
    const first = installDiagnosticRuntimeInPage(load);
    const second = installDiagnosticRuntimeInPage(load);
    window._wails.dispatchWailsEvent = e => calls.push(['probe',e]);
    resolve({Events:{}});
    await Promise.all([first, second]);
    const event = {name:'calendar:loaded'};
    window._wails.dispatchWailsEvent(event);
    assert.deepEqual(calls,[['app',event],['probe',event]]);
    assert.equal(imports,1);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});

test('failed initialization restores app dispatcher and permits retry', async () => {
  const previous = globalThis.window;
  const original = () => {};
  globalThis.window = {_wails:{dispatchWailsEvent:original}};
  try {
    await assert.rejects(installDiagnosticRuntimeInPage(async () => { window._wails.dispatchWailsEvent = () => {}; throw new Error('import failed'); }));
    assert.equal(window._wails.dispatchWailsEvent,original);
    assert.equal(window.__vantareDiagnosticRuntimePending,undefined);
    await installDiagnosticRuntimeInPage(async () => ({Events:{}}));
    assert.ok(window.__vantareDiagnosticRuntime);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
