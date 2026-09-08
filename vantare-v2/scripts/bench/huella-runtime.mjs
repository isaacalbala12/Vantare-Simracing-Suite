// Serialized into a Wails page. A diagnostic import owns a separate listener
// registry; preserve the application's dispatcher when it initializes.
export async function installDiagnosticRuntimeInPage(load) {
  if (window.__vantareDiagnosticRuntime) return;
  const original = window._wails?.dispatchWailsEvent;
  if (typeof original !== 'function') throw new Error('Application event dispatcher unavailable');
  const runtime = await (load ? load() : import('/wails/runtime.js'));
  const diagnostic = window._wails.dispatchWailsEvent;
  window._wails.dispatchWailsEvent = diagnostic === original ? original : function(event) {
    try { original(event); } finally { diagnostic(event); }
  };
  window.__vantareDiagnosticRuntime = runtime;
}
