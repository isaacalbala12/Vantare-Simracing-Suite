/**
 * Perfilado del redimensionado en la APP REAL (Wails + WebView2).
 *
 * Requiere la app lanzada con `VANTARE_WEBVIEW_DEBUG_PORT=9222`.
 * Conecta por CDP, prepara cada condicion (flags en localStorage + recarga),
 * dispara el gesto sobre la ventana real de Windows y recoge por condicion:
 *   - frames pintados y su cadencia (rAF del hilo principal del renderer)
 *   - long tasks (>50 ms)
 *   - LayoutDuration / RecalcStyleDuration / ScriptDuration / TaskDuration (CDP Performance)
 *   - **desajuste visual**: frames en los que la escala aplicada no es la que
 *     pide el viewport, y cuanto tarda en cuadrar tras soltar. Es la metrica
 *     que corresponde a lo que Isaac percibe como "sigue reduciendose lento".
 *
 * Uso: node scripts/orbit-real-resize-profile.mjs --label antes --mode drag
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESIZE_PS1 = path.join(HERE, "orbit-real-resize.ps1");
const CDP = process.env.ORBIT_CDP ?? "http://127.0.0.1:9222";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const LABEL = flag("label", "medicion");
const ONLY = flag("only", null);
const REPEATS = Number(flag("repeats", "2"));
/** `api` = SetWindowPos; `drag` = bucle modal real de Windows (gesto de usuario). */
const MODE = flag("mode", "drag");

/** Condiciones del protocolo (a/b/c/d del briefing). */
const CONDITIONS = [
  { id: "a-inicio-orbit-zoom", orbit: "1", zoomOff: null, view: "inicio", desc: "Orbit - Inicio - zoom activo (tal cual)" },
  { id: "b-inicio-orbit-sin-zoom", orbit: "1", zoomOff: "1", view: "inicio", desc: "Orbit - Inicio - zoom desactivado" },
  { id: "c-legacy-v52", orbit: "0", zoomOff: null, view: "inicio", desc: "Shell legada V52 (flag Orbit OFF)" },
  { id: "d1-ajustes-orbit-zoom", orbit: "1", zoomOff: null, view: "ajustes", desc: "Orbit - Ajustes (vista ligera) - zoom activo" },
  { id: "d2-studio-orbit-zoom", orbit: "1", zoomOff: null, view: "studio", desc: "Orbit - Studio - zoom activo" },
];

function runResize() {
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", RESIZE_PS1, "-Mode", MODE], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    ps.stdout.on("data", (d) => (out += d));
    ps.stderr.on("data", (d) => (out += d));
    ps.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error("resize ps1 exit " + code + ": " + out))));
  });
}

const RECORDER = [
  "(() => {",
  "  const w = window;",
  "  const REF_W = 1180, REF_H = 790, FLOOR = 0.6;",
  "  const ideal = () => Math.min(Math.max(Math.min(w.innerWidth / REF_W, w.innerHeight / REF_H), FLOOR), 1);",
  "  w.__orbitProbe = { frames: [], longTasks: [], resizes: 0, running: false, zoomWrites: 0, lag: [], lastResizeAt: 0, settleMs: null };",
  "  const p = w.__orbitProbe;",
  "  w.addEventListener('resize', () => { if (p.running) { p.resizes++; p.lastResizeAt = performance.now(); } }, { passive: true });",
  "  try {",
  "    const obs = new PerformanceObserver((list) => {",
  "      if (!p.running) return;",
  "      for (const e of list.getEntries()) {",
  "        p.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration), name: e.name });",
  "      }",
  "    });",
  "    obs.observe({ entryTypes: ['longtask'] });",
  "  } catch (err) { void err; }",
  "  let last = 0;",
  "  let lastZoom = null;",
  "  const tick = (t) => {",
  "    if (p.running) {",
  "      if (last) p.frames.push(Math.round((t - last) * 100) / 100);",
  "      last = t;",
  "      const applied = parseFloat(document.documentElement.style.getPropertyValue('--orbit-zoom')) || 1;",
  "      if (lastZoom !== null && applied !== lastZoom) p.zoomWrites++;",
  "      lastZoom = applied;",
  "      const off = Math.abs(applied - ideal());",
  "      p.lag.push(Math.round(off * 10000) / 10000);",
  "      if (p.lastResizeAt) {",
  "        if (off >= 0.0015) p.settleMs = null;",
  "        else if (p.settleMs === null) p.settleMs = Math.round(t - p.lastResizeAt);",
  "      }",
  "    } else { last = 0; }",
  "    w.requestAnimationFrame(tick);",
  "  };",
  "  w.requestAnimationFrame(tick);",
  "})();",
].join("\n");

function stats(frames) {
  if (!frames.length) return { n: 0, p50: 0, p95: 0, max: 0, over32: 0, over100: 0 };
  const s = [...frames].sort((a, b) => a - b);
  const q = (f) => s[Math.min(s.length - 1, Math.floor(s.length * f))];
  return {
    n: frames.length,
    p50: +q(0.5).toFixed(1),
    p95: +q(0.95).toFixed(1),
    max: +s[s.length - 1].toFixed(1),
    over32: frames.filter((f) => f > 32).length,
    over100: frames.filter((f) => f > 100).length,
  };
}

async function measure(page, client, cond) {
  // Preparar condicion y recargar para que los flags se apliquen desde el arranque.
  await page.evaluate((c) => {
    localStorage.setItem("vantare.orbit.enabled", c.orbit);
    if (c.zoomOff) localStorage.setItem("vantare.v03orbit.zoomOff", c.zoomOff);
    else localStorage.removeItem("vantare.v03orbit.zoomOff");
    localStorage.setItem("vantare.v03orbit.view", c.view);
  }, cond);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);

  await page.evaluate(RECORDER);
  await client.send("Performance.enable");
  const before = Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const t0 = Date.now();
  await page.evaluate(() => { window.__orbitProbe.running = true; });
  // El bucle modal a veces no arranca al primer intento (foco recien devuelto
  // tras la recarga): se reintenta antes de dar la corrida por buena.
  let gesture;
  for (let attempt = 1; ; attempt++) {
    try {
      gesture = await runResize();
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      console.warn("  gesto fallido (intento " + attempt + "), reintentando");
    }
  }
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__orbitProbe.running = false; });
  const wall = Date.now() - t0;
  const after = Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const probe = await page.evaluate(() => ({
    frames: window.__orbitProbe.frames,
    longTasks: window.__orbitProbe.longTasks,
    resizes: window.__orbitProbe.resizes,
    zoomWrites: window.__orbitProbe.zoomWrites,
    lag: window.__orbitProbe.lag,
    settleMs: window.__orbitProbe.settleMs,
  }));

  const d = (k) => +(((after[k] ?? 0) - (before[k] ?? 0)) * 1000).toFixed(1);
  return {
    id: cond.id,
    desc: cond.desc,
    gesture,
    wallMs: wall,
    resizeEvents: probe.resizes,
    zoomWrites: probe.zoomWrites,
    // Frames en los que la escala aplicada no es la que pide la ventana: el
    // contenido va visiblemente por detras del marco.
    lagFrames: probe.lag.filter((v) => v >= 0.0015).length,
    lagMax: Math.max(0, ...probe.lag),
    settleMs: probe.settleMs,
    frames: stats(probe.frames),
    longTasks: probe.longTasks.length,
    longTasksMaxMs: probe.longTasks.reduce((a, t) => Math.max(a, t.dur), 0),
    layoutMs: d("LayoutDuration"),
    recalcStyleMs: d("RecalcStyleDuration"),
    scriptMs: d("ScriptDuration"),
    taskMs: d("TaskDuration"),
    layoutCount: (after.LayoutCount ?? 0) - (before.LayoutCount ?? 0),
    recalcCount: (after.RecalcStyleCount ?? 0) - (before.RecalcStyleCount ?? 0),
    nodes: after.Nodes,
  };
}

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const client = await ctx.newCDPSession(page);

const results = [];
for (const cond of CONDITIONS) {
  if (ONLY && !cond.id.includes(ONLY)) continue;
  const runs = [];
  for (let r = 0; r < REPEATS; r++) {
    const res = await measure(page, client, cond);
    runs.push(res);
    console.log("[" + cond.id + "] run " + (r + 1), JSON.stringify({
      frames: res.frames, longTasks: res.longTasks, layout: res.layoutMs, style: res.recalcStyleMs,
      script: res.scriptMs, task: res.taskMs, zoomWrites: res.zoomWrites, lagFrames: res.lagFrames,
      lagMax: res.lagMax, settleMs: res.settleMs,
    }));
  }
  runs.sort((a, b) => a.lagFrames - b.lagFrames);
  results.push({ ...runs[Math.floor(runs.length / 2)], runs: runs.length });
}

// Restaurar estado usable de la app.
await page.evaluate(() => {
  localStorage.setItem("vantare.orbit.enabled", "1");
  localStorage.removeItem("vantare.v03orbit.zoomOff");
  localStorage.setItem("vantare.v03orbit.view", "inicio");
});

const out = path.join(HERE, "..", "..", "docs", "design", "orbit-v03", "evidence", "porte", "01-shell", "responsive", "real-resize-" + MODE + "-" + LABEL + ".json");
writeFileSync(out, JSON.stringify({ label: LABEL, mode: MODE, at: new Date().toISOString(), results }, null, 2));
console.log("\n=== TABLA " + LABEL + " (mode=" + MODE + ") ===");
console.log("cond | frames | p50 | p95 | max | >32ms | longTasks(max) | layout | style | script | task | resizeEv | zoomWrites | lagFrames | lagMax | settleMs");
for (const r of results) {
  console.log([r.id, r.frames.n, r.frames.p50, r.frames.p95, r.frames.max, r.frames.over32,
    r.longTasks + "(" + r.longTasksMaxMs + ")", r.layoutMs, r.recalcStyleMs, r.scriptMs, r.taskMs,
    r.resizeEvents, r.zoomWrites, r.lagFrames, r.lagMax, r.settleMs].join(" | "));
}
console.log("json ->", out);
await browser.close();
