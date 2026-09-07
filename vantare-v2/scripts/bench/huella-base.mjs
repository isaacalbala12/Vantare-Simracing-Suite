// Base-only evidence. No rAF, tracing, settings mutation or synthetic telemetry.
export function validateBaseEvidence(evidence, route) {
  const reasons = [];
  for (const state of [evidence?.before, evidence?.after]) {
    if (!state || state.route !== route || state.visibility !== 'visible'
      || state.studio !== false || state.widgets !== 0 || state.welcome !== false) reasons.push('route-or-surface');
    if (!(state?.viewport?.width > 0 && state.viewport.height > 0 && state.viewport.dpr > 0)) reasons.push('viewport-missing');
  }
  if (JSON.stringify(evidence?.before?.viewport) !== JSON.stringify(evidence?.after?.viewport)) reasons.push('viewport-changed');
  if (!Array.isArray(evidence?.changes) || evidence.changes.length) reasons.push('surface-changed');
  const levels = evidence?.levels;
  if (!(evidence?.levelEvents > 0) || !Array.isArray(levels) || levels.length !== 1) reasons.push('level-not-stable');
  if (!(evidence?.maxLevelGapMs >= 0 && evidence.maxLevelGapMs <= 3000
    && evidence.levelQuietMs >= 0 && evidence.levelQuietMs <= 3000)) reasons.push('performance-events-stalled');
  const level = levels?.[0];
  if (level?.mode !== 'auto' || !Number.isInteger(level?.level) || level.level < 1 || level.level > 5
    || level.effects !== 'full' || !(level.rafCap > 0) || level.sourceHz !== 0) reasons.push('unexpected-performance-mode');
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

// Serialized by Playwright: keep this function independent of module closures.
export async function baseWatchInPage(action) {
  const read = () => ({
    route: document.querySelector('[data-testid="orbit-home"]') ? 'home'
      : document.querySelector('[data-testid="orbit-races-month"]') ? 'month'
        : document.querySelector('[data-testid="orbit-races-timeline"]') ? 'timeline' : 'other',
    visibility: document.visibilityState,
    studio: Boolean(document.querySelector('.studio-route-views')),
    widgets: document.querySelectorAll('[data-testid="runtime-widget-frame"]').length,
    welcome: Boolean(document.querySelector('[data-testid="beta-welcome"]')),
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
  });
  if (action === 'stop') {
    const watch = window.__vantareBaseWatch;
    if (!watch) throw new Error('Base watch was not started');
    try {
      return { ...watch.evidence, levelQuietMs: Date.now() - watch.lastLevelAt, after: read(), stoppedAt: new Date().toISOString() };
    } finally {
      watch.cleanup();
      delete window.__vantareBaseWatch;
    }
  }
  if (action !== 'start') throw new Error('Unknown base watch action');
  if (window.__vantareBaseWatch) throw new Error('Base watch already exists');
  const { Events } = await import('/wails/runtime.js');
  const evidence = { startedAt: new Date().toISOString(), before: read(), changes: [], levels: [], levelEvents: 0, maxLevelGapMs: 0 };
  const record = kind => evidence.changes.push({ kind, at: new Date().toISOString() });
  const visibility = () => record('visibility');
  const resize = () => record('resize');
  const observer = new MutationObserver(() => record('route'));
  let off = () => {};
  const cleanup = () => {
    off(); observer.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('resize', resize);
  };
  const watch = { evidence, cleanup, lastLevelAt: null };
  window.__vantareBaseWatch = watch;
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('resize', resize);
  observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Missing performance:level')), 7000);
      off = Events.On('performance:level', event => {
        const p = event?.data;
        if (!p || typeof p !== 'object') return;
        const level = { mode: p.mode, level: p.level, effects: p.effects, rafCap: p.rafCap, sourceHz: p.sourceHz };
        const now = Date.now();
        if (watch.lastLevelAt !== null) evidence.maxLevelGapMs = Math.max(evidence.maxLevelGapMs, now - watch.lastLevelAt);
        watch.lastLevelAt = now;
        evidence.levelEvents += 1;
        if (JSON.stringify(level) !== JSON.stringify(evidence.levels.at(-1))) evidence.levels.push(level);
        clearTimeout(timer); resolve();
      });
    });
    return { startedAt: evidence.startedAt, before: evidence.before, level: evidence.levels[0] };
  } catch (error) {
    cleanup(); delete window.__vantareBaseWatch;
    throw error;
  }
}
