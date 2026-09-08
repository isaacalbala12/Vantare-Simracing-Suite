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
