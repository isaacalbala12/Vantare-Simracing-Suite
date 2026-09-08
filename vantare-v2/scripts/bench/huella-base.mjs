// Base-only evidence. No rAF, tracing, settings mutation or synthetic telemetry.
export function validateBaseEvidence(evidence, route, gamePresent = false) {
  const reasons = [];
  for (const state of [evidence?.before, evidence?.after]) {
    if (!state || state.route !== route || state.visibility !== 'visible'
      || state.studio !== false || state.widgets !== 0 || state.welcome !== false) reasons.push('route-or-surface');
    if (!(state?.viewport?.width > 0 && state.viewport.height > 0 && state.viewport.dpr > 0)) reasons.push('viewport-missing');
  }
  if (JSON.stringify(evidence?.before?.viewport) !== JSON.stringify(evidence?.after?.viewport)) reasons.push('viewport-changed');
  if (!Array.isArray(evidence?.changes) || evidence.changes.length) reasons.push('surface-changed');
  const levels = Array.isArray(evidence?.levels) ? evidence.levels : [];
  const policies = new Set(levels.map(p => JSON.stringify([p?.mode, p?.level, p?.effects, p?.rafCap])));
  if (!(evidence?.levelEvents > 0) || policies.size !== 1) reasons.push('level-not-stable');
  if (!(evidence?.maxLevelGapMs >= 0 && evidence.maxLevelGapMs <= 3000
    && evidence.levelQuietMs >= 0 && evidence.levelQuietMs <= 3000)) reasons.push('performance-events-stalled');
  const level = levels?.[0];
  if (level?.mode !== 'auto' || !Number.isInteger(level?.level) || level.level < 1 || level.level > 5
    || level.effects !== 'full' || !(level.rafCap > 0)
    || levels.some(p => !Number.isFinite(p?.sourceHz) || p.sourceHz < 0 || (!gamePresent && p.sourceHz !== 0))) reasons.push('unexpected-performance-mode');
  if (gamePresent) {
    const sources = evidence?.sources;
    if (!(evidence?.sourceEvents > 0) || !Array.isArray(sources) || sources.length !== 1
      || !sources[0]?.kind || !sources[0]?.state || typeof sources[0]?.available !== 'boolean'
      || !(evidence.maxSourceGapMs >= 0 && evidence.maxSourceGapMs <= 3000
        && evidence.sourceQuietMs >= 0 && evidence.sourceQuietMs <= 3000)) reasons.push('source-not-stable-or-missing');
  }
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

// Serialized by Playwright: keep this function independent of module closures.
export async function baseWatchInPage(action, eventBus) {
  const read = () => ({
    route: document.querySelector('[data-testid="orbit-home"]') ? 'home'
      : ['next', 'day', 'week', 'month', 'timeline'].find(route =>
        document.querySelector(`[data-testid="orbit-races-${route}"]`)) ?? 'other',
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
      return { ...watch.evidence, levelQuietMs: Date.now() - watch.lastLevelAt,
        sourceQuietMs: watch.lastSourceAt === null ? null : Date.now() - watch.lastSourceAt,
        after: read(), stoppedAt: new Date().toISOString() };
    } finally {
      watch.cleanup();
      delete window.__vantareBaseWatch;
    }
  }
  if (action !== 'start') throw new Error('Unknown base watch action');
  if (window.__vantareBaseWatch) throw new Error('Base watch already exists');
  const Events = eventBus ?? (await import('/wails/runtime.js')).Events;
  const evidence = { startedAt: new Date().toISOString(), before: read(), changes: [], levels: [], levelEvents: 0, maxLevelGapMs: 0,
    sources: [], sourceEvents: 0, maxSourceGapMs: 0 };
  const record = kind => {
    if (!evidence.changes.some(change => change.kind === kind)) evidence.changes.push({ kind, at: new Date().toISOString() });
  };
  const visibility = () => record('visibility');
  const resize = () => record('resize');
  const interaction = () => record('interaction');
  const interactionEvents = ['click', 'input', 'change', 'keydown', 'wheel'];
  const observer = new MutationObserver(() => record('route'));
  let off = () => {};
  let offOverlay = () => {};
  let offSource = () => {};
  const cleanup = () => {
    off(); offOverlay(); offSource(); observer.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('resize', resize);
    for (const name of interactionEvents) document.removeEventListener(name, interaction, true);
  };
  const watch = { evidence, cleanup, lastLevelAt: null, lastSourceAt: Date.now() };
  window.__vantareBaseWatch = watch;
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('resize', resize);
  for (const name of interactionEvents) document.addEventListener(name, interaction, { capture: true, passive: true });
  observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['aria-current', 'aria-pressed', 'aria-selected', 'aria-checked'] });
  try {
    offOverlay = Events.On('overlay:status', () => record('overlay-status'));
    offSource = Events.On('ops:metrics', event => {
      const p = event?.data?.source;
      if (!p) return;
      const source = { kind: p.kind, state: p.state, available: p.available };
      const now = Date.now();
      if (watch.lastSourceAt !== null) evidence.maxSourceGapMs = Math.max(evidence.maxSourceGapMs, now - watch.lastSourceAt);
      watch.lastSourceAt = now;
      evidence.sourceEvents += 1;
      if (JSON.stringify(source) !== JSON.stringify(evidence.sources.at(-1))) evidence.sources.push(source);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Missing performance:level')), 7000);
      off = Events.On('performance:level', event => {
        const p = event?.data;
        if (!p || typeof p !== 'object' || !p.host) return;
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
