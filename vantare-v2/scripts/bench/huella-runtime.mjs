// Serialized into a Wails page. Diagnostic and app imports have separate
// listener registries; installation must preserve the app and be shared.
export async function installDiagnosticRuntimeInPage(load) {
  if (window.__vantareDiagnosticRuntime) return;
  if (window.__vantareDiagnosticRuntimePending) return window.__vantareDiagnosticRuntimePending;
  const original = window._wails?.dispatchWailsEvent;
  if (typeof original !== 'function') throw new Error('Application event dispatcher unavailable');
  const pending = Promise.resolve().then(async () => {
    try {
      const runtime = await (load ? load() : import('/wails/runtime.js'));
      const diagnostic = window._wails.dispatchWailsEvent;
      window._wails.dispatchWailsEvent = diagnostic === original ? original : function(event) {
        try { original(event); } finally { diagnostic(event); }
      };
      window.__vantareDiagnosticRuntime = runtime;
    } catch (error) {
      window._wails.dispatchWailsEvent = original;
      throw error;
    }
  });
  window.__vantareDiagnosticRuntimePending = pending;
  try { await pending; } finally { delete window.__vantareDiagnosticRuntimePending; }
}
