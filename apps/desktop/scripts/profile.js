#!/usr/bin/env node

/**
 * Vantare Overlays — Performance Profiling Script
 *
 * Launches the built Electron app with remote debugging, measures:
 *   1. Startup time   (app.whenReady → ready-to-show)
 *   2. Render FPS     (requestAnimationFrame cadence per overlay)
 *   3. Memory usage   (heapUsed via process.memoryUsage)
 *   4. Telemetry latency (IPC send → renderer receive)
 *
 * Usage:
 *   node scripts/profile.js             # profile the built app
 *   node scripts/profile.js --runs 3    # average over N runs (default 1)
 *   node scripts/profile.js --help      # full options
 *
 * Requirements:
 *   - Electron app must be built first  (pnpm --filter @vantare/desktop build)
 *   - Node.js 18+ with --experimental-websocket (or native in 22+)
 */

'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { performance, PerformanceObserver } = require('perf_hooks');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..');
const ELECTRON_PATH = resolveElectronBinary();
const MAIN_ENTRY = path.join(ROOT, 'dist', 'main', 'index.js');
const DEBUG_PORT = 8315;

const OVERLAY_IDS = ['standings', 'relative', 'delta', 'stream-alerts'];

// Roadmap thresholds (used by the report)
const THRESHOLDS = {
  startupMs: 3000,
  renderFps: 60,
  memoryMb: 150,
  telemetryLatencyMs: 30,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveElectronBinary() {
  // pnpm / npm: look for electron binary under node_modules
  const candidates = [
    path.join(ROOT, 'node_modules', '.bin', 'electron.cmd'),
    path.join(ROOT, 'node_modules', '.bin', 'electron'),
    path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return require('child_process').execSync(`where "${c}" 2>nul || echo "${c}"`, { encoding: 'utf8' }).trim().split('\n')[0];
    } catch { /* try next */ }
  }
  // Last resort — try resolving via require
  try {
    return require('electron');
  } catch {
    // Fallback to pnpm store lookup
    const pnpmDir = path.join(ROOT, 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      const dirs = fs.readdirSync(pnpmDir).filter(d => d.startsWith('electron@'));
      if (dirs.length) {
        const exe = path.join(pnpmDir, dirs[0], 'node_modules', 'electron', 'dist', 'electron.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
    console.error(
      'ERROR: Could not locate Electron binary.\n' +
      'Make sure dependencies are installed: pnpm install\n' +
      'Expected locations:\n' +
      candidates.map(c => `  - ${c}`).join('\n')
    );
    process.exit(1);
  }
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatMs(ms) {
  return `${ms.toFixed(1)} ms`;
}

function formatFps(fps) {
  return `${fps.toFixed(1)} FPS`;
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// CDP Client (Chrome DevTools Protocol over WebSocket)
// ---------------------------------------------------------------------------

function cdpConnect(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const info = JSON.parse(body);
          const wsUrl = info.webSocketDebuggerUrl;
          if (!wsUrl) return reject(new Error('No webSocketDebuggerUrl'));
          const ws = new (require('ws'))(wsUrl);
          const callbacks = new Map();
          let msgId = 0;

          ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id && callbacks.has(msg.id)) {
              callbacks.get(msg.id)(msg);
              callbacks.delete(msg.id);
            }
            if (msg.method === 'Runtime.consoleAPICalled') {
              if (global.__profileOnConsole) global.__profileOnConsole(msg.params);
            }
          });

          ws.on('open', () => {
            resolve({
              send(method, params = {}) {
                return new Promise((resolveSend) => {
                  const id = ++msgId;
                  callbacks.set(id, resolveSend);
                  ws.send(JSON.stringify({ id, method, params }));
                });
              },
              close() {
                try { ws.close(); } catch {}
              },
              onConsole(cb) {
                global.__profileOnConsole = cb;
              },
            });
          });

          ws.on('error', reject);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Measurement functions
// ---------------------------------------------------------------------------

/**
 * Measure startup time by listening for the "ready-to-show" event.
 * App source already has `mainWindow.once('ready-to-show', ...)` — we inject
 * a console.timeEnd / console.time stamp via CDP on the main target.
 *
 * Strategy:
 *   - Enable Runtime on the main process target
 *   - Execute `performance.now()` just before app.whenReady resolves
 *   - Poll for the main window creation
 *   - The "ready-to-show" event fires after load — we sniff window creation
 *     and then monitor progressEvent timing via injected code
 *
 * Simpler approach: listen for the main process WebSocket and look for
 * "did-finish-load" + "ready-to-show" events in the event logs.
 */
async function measureStartup(cdp) {
  // Enable necessary domains
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  let startTime = performance.now();

  // Mark app start: inject a performance mark at the start of app lifecycle
  // We evaluate in the renderer once it's available
  await delay(500); // wait for initial boot

  // Evaluate in main process world to sniff timing
  // The startup sequence is:
  //   t0: app.whenReady() resolves
  //   t1: initAppStore() completes
  //   t2: HttpServer starts
  //   t3: createMainWindow() called (BrowserWindow with show:false)
  //   t4: ready-to-show fires
  //   t5: window shown (or hidden for startMinimized)

  // We'll use the performance timeline — inject marks during the boot sequence
  // Since we can't modify source, we'll instrument via CDP's Runtime.evaluate
  // on the main world

  // Wait for main process to be ready
  let targets = [];
  for (let i = 0; i < 30; i++) {
    const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`).then(r => r.json()).catch(() => []);
    targets = resp;
    const mainTarget = targets.find(t => t.title && t.title.includes('Vantare'));
    if (mainTarget) break;
    await delay(500);
  }

  const mainTarget = targets.find(t => t.title && t.title.includes('Vantare'));
  if (!mainTarget) {
    console.warn('  [profile] Could not detect main window target — startup timing may be incomplete');
    return {
      totalMs: 0,
      appReadyMs: 0,
      storeInitMs: 0,
      serverStartMs: 0,
      windowReadyMs: 0,
      note: 'Target not found — check that app window title includes "Vantare"',
    };
  }

  // Get timing marks from the Performance timeline that Electron exposes
  // We inject a marker at the beginning of `app.whenReady()` by evaluating
  // performance.mark() calls into the main context
  try {
    // Navigate to the main target and request timing
    const mainWsUrl = mainTarget.webSocketDebuggerUrl;
    const mainWs = new (require('ws'))(mainWsUrl);
    const mainCdp = await new Promise((resolve, reject) => {
      const callbacks = new Map();
      let mid = 0;
      mainWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id && callbacks.has(msg.id)) {
          callbacks.get(msg.id)(msg);
          callbacks.delete(msg.id);
        }
      });
      mainWs.on('open', () => {
        resolve({
          send(method, params = {}) {
            return new Promise((r) => {
              const id = ++mid;
              callbacks.set(id, r);
              mainWs.send(JSON.stringify({ id, method, params }));
            });
          },
          close() { try { mainWs.close(); } catch {} },
        });
      });
      mainWs.on('error', reject);
    });

    await mainCdp.send('Runtime.enable');

    // Get performance marks from main process
    const getMarksScript = `
      (function() {
        try {
          return performance.getEntriesByType('mark').map(m => ({
            name: m.name,
            startTime: m.startTime,
          }));
        } catch(e) {
          return { error: e.message };
        }
      })()
    `;

    await delay(300); // let marks accumulate
    const marksResult = await mainCdp.send('Runtime.evaluate', {
      expression: getMarksScript,
      returnByValue: true,
    });

    const marks = marksResult.result?.value || [];

    // Also get memory info
    const memScript = `
      (function() {
        try {
          const u = process.memoryUsage();
          return { heapUsed: u.heapUsed, heapTotal: u.heapTotal, external: u.external };
        } catch(e) {
          return { error: e.message };
        }
      })()
    `;

    const memResult = await mainCdp.send('Runtime.evaluate', {
      expression: memScript,
      returnByValue: true,
    });

    const memInfo = memResult.result?.value || {};

    mainCdp.close();

    // If we have marks, compute from them; otherwise use timing heuristic
    const startMark = marks.find(m => m.name === 'vantare:app-start');
    const readyMark = marks.find(m => m.name === 'vantare:app-ready');
    const windowReadyMark = marks.find(m => m.name === 'vantare:ready-to-show');

    // If marks exist (from instrumented build), use them
    if (startMark && windowReadyMark) {
      return {
        totalMs: windowReadyMark.startTime - startMark.startTime,
        appReadyMs: readyMark ? readyMark.startTime - startMark.startTime : null,
        windowReadyMs: windowReadyMark.startTime - (readyMark?.startTime || startMark.startTime),
        memInfo,
        marks,
      };
    }

    // Otherwise return estimated timing based on known app structure
    return {
      totalMs: performance.now() - startTime,
      note: 'Estimated — no performance marks found. Run with VANTARE_PROFILE=1 for precise marks.',
      memInfo,
      marks,
    };

  } catch (err) {
    console.warn(`  [profile] Main CDP error: ${err.message}`);
    return { totalMs: performance.now() - startTime, error: err.message };
  }
}

/**
 * Track FPS for each overlay window using requestAnimationFrame counting.
 * Injects an rAF loop that counts frames and reports via console.
 */
async function measureRenderFps(cdp) {
  const fpsScript = `
    (function() {
      let frameCount = 0;
      let lastTime = performance.now();
      let active = true;
      const results = [];

      function tick() {
        if (!active) return;
        frameCount++;
        const now = performance.now();
        const elapsed = now - lastTime;
        if (elapsed >= 1000) {
          const fps = (frameCount / elapsed) * 1000;
          results.push({
            fps: Math.round(fps * 10) / 10,
            frames: frameCount,
            elapsedMs: Math.round(elapsed),
          });
          console.log('[profile] FPS:', results[results.length - 1]);
          frameCount = 0;
          lastTime = now;
        }
        requestAnimationFrame(tick);
      }

      tick();

      // Return results after 5 seconds
      return new Promise((resolve) => {
        setTimeout(() => {
          active = false;
          resolve(results);
        }, 5000);
      });
    })()
  `;

  // We can't await Promises via CDP evaluate directly,
  // so we'll inject the loop and collect via console messages

  await cdp.send('Runtime.evaluate', {
    expression: `(function() {
      window.__profileFps = (function() {
        let fc = 0, last = performance.now(), res = [], active = true;
        function tick() {
          if (!active) return;
          fc++;
          const n = performance.now(), el = n - last;
          if (el >= 1000) {
            const fps = (fc / el) * 1000;
            res.push({ fps: Math.round(fps*10)/10, frames: fc, elapsedMs: Math.round(el) });
            last = n; fc = 0;
          }
          requestAnimationFrame(tick);
        }
        tick();
        setTimeout(() => { active = false; }, 5000);
        return res;
      })();
    })()`,
    returnByValue: false,
  });

  // Wait for sampling to complete
  await delay(5500);

  // Retrieve results
  const getResult = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify(window.__profileFps || [])`,
    returnByValue: true,
  });

  try {
    const data = JSON.parse(getResult.result?.value || '[]');
    if (data.length) {
      const avgFps = data.reduce((s, d) => s + d.fps, 0) / data.length;
      return { samples: data, avgFps, note: 'renderer process' };
    }
  } catch {}

  return { samples: [], avgFps: 0, note: 'No FPS data collected — window may not have been ready' };
}

/**
 * Sample memory usage periodically.
 */
async function measureMemory(cdp) {
  const samples = [];

  for (let i = 0; i < 6; i++) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `(function() {
        try {
          const u = process.memoryUsage();
          return { heapUsed: u.heapUsed, heapTotal: u.heapTotal, rss: u.rss, external: u.external };
        } catch(e) {
          return { error: e.message };
        }
      })()`,
      returnByValue: true,
    });

    if (result.result?.value) {
      samples.push({ ...result.result.value, at: Date.now() });
    }

    // Wait between samples for GC to possibly run
    if (i < 5) {
      // Try to trigger GC hint
      await cdp.send('Runtime.evaluate', {
        expression: `try { global.gc && global.gc(); } catch(e) {}`,
      });
      await delay(1000);
    }
  }

  if (samples.length) {
    const heapUsages = samples.map(s => s.heapUsed).filter(Boolean);
    const peak = Math.max(...heapUsages);
    const avg = heapUsages.reduce((a, b) => a + b, 0) / heapUsages.length;
    return { samples, peakHeapBytes: peak, avgHeapBytes: avg };
  }

  return { samples: [], peakHeapBytes: 0, avgHeapBytes: 0 };
}

/**
 * Measure telemetry pipeline latency.
 * The SimManager sends telemetry IPC every 62ms.
 * We inject a timestamp before the IPC send and read it in the renderer.
 */
async function measureTelemetryLatency(cdp) {
  // Inject a listener for telemetry with timing
  await cdp.send('Runtime.evaluate', {
    expression: `
      (function() {
        window.__profileTelemetryLatencies = [];
        window.__profileTelemetryActive = true;

        // Hook into TelemetryBridge — look for window.vantare.onTelemetry
        if (window.vantare && window.vantare.onTelemetry) {
          const orig = window.vantare._origOnTelemetry || window.vantare.onTelemetry;
          window.vantare.onTelemetry = (cb) => {
            const wrapped = (data) => {
              if (window.__profileTelemetryActive) {
                const now = performance.now();
                const latency = data._profileSentAt ? now - data._profileSentAt : 0;
                if (latency > 0 && latency < 1000) {
                  window.__profileTelemetryLatencies.push(latency);
                }
              }
              cb(data);
            };
            return orig ? orig.call(window.vantare, wrapped) : wrapped;
          };
        }
      })()
    `,
    returnByValue: false,
  });

  // Also send a timestamped telemetry message via IPC simulation
  // We evaluate in main (but CDP on renderer can't do IPC),
  // so we directly benchmark the EventSource/SSE path from renderer

  // Wait for telemetry to flow
  await delay(8000);

  const result = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      count: window.__profileTelemetryLatencies.length,
      samples: window.__profileTelemetryLatencies.slice(0, 100),
      min: window.__profileTelemetryLatencies.length ? Math.min(...window.__profileTelemetryLatencies) : 0,
      max: window.__profileTelemetryLatencies.length ? Math.max(...window.__profileTelemetryLatencies) : 0,
      avg: window.__profileTelemetryLatencies.length
        ? window.__profileTelemetryLatencies.reduce((a,b) => a+b, 0) / window.__profileTelemetryLatencies.length
        : 0,
    })`,
    returnByValue: true,
  });

  try {
    return JSON.parse(result.result?.value || '{}');
  } catch {
    return { count: 0, samples: [], min: 0, max: 0, avg: 0 };
  }
}

// ---------------------------------------------------------------------------
// Main profiling orchestrator
// ---------------------------------------------------------------------------

async function runProfile(runIndex = 0) {
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  Run #${runIndex + 1} — Profiling Vantare Overlays`);
  console.log(`═══════════════════════════════════════════════════\n`);

  // 1. Verify build exists
  if (!fs.existsSync(MAIN_ENTRY)) {
    console.error(`ERROR: Build not found at ${MAIN_ENTRY}`);
    console.error('Run: pnpm --filter @vantare/desktop build');
    process.exit(1);
  }

  // 2. Check port availability
  if (await isPortInUse(DEBUG_PORT)) {
    console.error(`ERROR: Port ${DEBUG_PORT} is already in use`);
    process.exit(1);
  }

  // 3. Launch Electron with remote debugging
  console.log(`  Launching Electron (debug port ${DEBUG_PORT})...`);
  const appArgs = [
    MAIN_ENTRY,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-sandbox',
    '--disable-gpu', // reduce noise for profiling
  ];

  // Set profiling env vars — detected by main process
  const env = {
    ...process.env,
    VANTARE_PROFILE: '1',
    NODE_ENV: 'production',
    ELECTRON_IS_DEV: '0',
  };

  const child = spawn(ELECTRON_PATH, appArgs, {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  });

  child.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line && !line.startsWith('[profile]')) return;
    console.log(`  ${line}`);
  });

  child.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (!line) return;
    // Electron logs warnings to stderr — filter noise
    if (
      line.includes('ELECTRON_IS_DEV') ||
      line.includes('GPU') ||
      line.includes('Compositor') ||
      line.includes('ANGLE')
    ) return;
    console.log(`  [stderr] ${line}`);
  });

  const metrics = {};

  try {
    // 4. Wait for CDP to be available
    console.log('  Waiting for debugger...');
    let cdp = null;
    for (let i = 0; i < 40; i++) {
      try {
        cdp = await cdpConnect(DEBUG_PORT);
        console.log('  CDP connected\n');
        break;
      } catch {
        await delay(500);
      }
    }

    if (!cdp) {
      throw new Error('Failed to connect to Chrome DevTools Protocol');
    }

    // 5. Wait for the main renderer page
    console.log('  Waiting for renderer...');
    let pageTarget = null;
    for (let i = 0; i < 30; i++) {
      const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`).then(r => r.json()).catch(() => []);
      pageTarget = resp.find(
        (t) => t.url && (t.url.includes('renderer/index.html') || t.url.includes('localhost:3000'))
      );
      if (pageTarget) break;
      await delay(500);
    }

    if (!pageTarget) {
      console.warn('  Renderer page not found — some metrics will be estimated');
    }

    // 6. Measure: Startup Time
    console.log('  [1/4] Measuring startup time...');
    metrics.startup = await measureStartup(cdp);
    console.log(`    → ${metrics.startup.totalMs ? formatMs(metrics.startup.totalMs) : 'N/A'}`);

    // 7. Measure: Render FPS
    console.log('  [2/4] Measuring render FPS...');
    metrics.render = await measureRenderFps(cdp);
    console.log(`    → ${metrics.render.avgFps ? formatFps(metrics.render.avgFps) : 'N/A'}`);

    // 8. Measure: Memory
    console.log('  [3/4] Measuring memory usage...');
    metrics.memory = await measureMemory(cdp);
    console.log(`    → Peak: ${metrics.memory.peakHeapBytes ? formatMb(metrics.memory.peakHeapBytes) : 'N/A'}`);
    console.log(`    → Avg:  ${metrics.memory.avgHeapBytes ? formatMb(metrics.memory.avgHeapBytes) : 'N/A'}`);

    // 9. Measure: Telemetry Latency
    console.log('  [4/4] Measuring telemetry pipeline latency...');
    metrics.telemetry = await measureTelemetryLatency(cdp);
    console.log(`    → Avg: ${metrics.telemetry.avg ? formatMs(metrics.telemetry.avg) : 'N/A'} (${metrics.telemetry.count || 0} samples)`);

    // 10. Cleanup
    cdp.close();

  } catch (err) {
    console.error(`\n  ERROR: ${err.message}`);
  } finally {
    // Terminate the app
    console.log('\n  Terminating app...');
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {}
    // Force kill after timeout
    setTimeout(() => {
      try { process.kill(child.pid, 'SIGKILL'); } catch {}
    }, 3000);
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Aggregate results from multiple runs
// ---------------------------------------------------------------------------

function aggregateResults(results) {
  const getNumeric = (r, key) => {
    const v = r[key];
    if (!v || typeof v !== 'object') return null;
    if (key === 'startup') return v.totalMs;
    if (key === 'render') return v.avgFps;
    if (key === 'memory') return v.peakHeapBytes;
    if (key === 'telemetry') return v.avg;
    return null;
  };

  const metrics = ['startup', 'render', 'memory', 'telemetry'];

  const aggregated = {};
  for (const m of metrics) {
    const vals = results.map(r => getNumeric(r, m)).filter(v => v !== null && v > 0);
    if (vals.length === 0) {
      aggregated[m] = { avg: null, min: null, max: null, samples: 0 };
      continue;
    }
    aggregated[m] = {
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
      samples: vals.length,
    };
  }

  // Also collect raw startup details from the best run
  const bestRun = results.reduce((best, r) =>
    (r.startup?.totalMs && (!best.startup?.totalMs || r.startup.totalMs < best.startup.totalMs)) ? r : best,
    results[0]
  );

  aggregated._bestRunDetails = {
    appReadyMs: bestRun?.startup?.appReadyMs,
    windowReadyMs: bestRun?.startup?.windowReadyMs,
    avgHeapBytes: bestRun?.memory?.avgHeapBytes,
    telemetrySamples: bestRun?.telemetry?.samples?.length || 0,
  };

  return aggregated;
}

function printSummary(aggregated) {
  const passFail = (val, threshold, higherBetter) => {
    if (val === null || val === undefined) return '—';
    return higherBetter ? (val >= threshold ? '✓ PASS' : '✗ FAIL')
                        : (val <= threshold ? '✓ PASS' : '✗ FAIL');
  };

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  PERFORMANCE SUMMARY`);
  console.log(`═══════════════════════════════════════════════════`);

  const rows = [
    ['Startup Time',     aggregated.startup.avg,   THRESHOLDS.startupMs,     'ms',  false, aggregated.startup],
    ['Render FPS',       aggregated.render.avg,    THRESHOLDS.renderFps,     'FPS', true,  aggregated.render],
    ['Memory (peak)',    aggregated.memory.avg,    THRESHOLDS.memoryMb,      'MB',  false, aggregated.memory],
    ['Telemetry Latency', aggregated.telemetry.avg, THRESHOLDS.telemetryLatencyMs, 'ms', false, aggregated.telemetry],
  ];

  for (const [name, avg, threshold, unit, higherBetter, stats] of rows) {
    const status = passFail(avg, threshold, higherBetter);
    const minS = stats.min !== null ? `${stats.min.toFixed(1)}` : '—';
    const maxS = stats.max !== null ? `${stats.max.toFixed(1)}` : '—';
    const avgS = avg !== null ? `${avg.toFixed(1)}` : '—';

    console.log(`\n  ${name}`);
    console.log(`    Average:  ${avgS} ${unit}  (min: ${minS}, max: ${maxS}, n=${stats.samples})`);
    console.log(`    Target:   ${threshold} ${unit}`);
    console.log(`    Result:   ${status}`);
  }

  // Overall
  const allPass = rows.every(([, avg, threshold, , higherBetter]) => {
    if (avg === null) return false;
    return higherBetter ? avg >= threshold : avg <= threshold;
  });

  console.log(`\n  ──────────────────────────────────────────`);
  console.log(`  OVERALL: ${allPass ? '✓ ALL METRICS PASS' : '✗ SOME METRICS FAIL'}`);
  console.log(`\n  See docs/PERFORMANCE-REPORT.md for detailed methodology.`);
}

// ---------------------------------------------------------------------------
// CLI Entry
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Vantare Overlays — Performance Profiler

Usage:
  node scripts/profile.js              Single profiling run
  node scripts/profile.js --runs 3     Average over 3 runs
  node scripts/profile.js --json       Output JSON only
  node scripts/profile.js --help       This help

Environment:
  VANTARE_PROFILE=1  (set automatically by script)
    `);
    process.exit(0);
  }

  const numRuns = (() => {
    const idx = args.indexOf('--runs');
    if (idx !== -1 && args[idx + 1]) return Math.min(parseInt(args[idx + 1], 10) || 1, 5);
    return 1;
  })();

  const outputJson = args.includes('--json');

  // Check build exists upfront
  if (!fs.existsSync(MAIN_ENTRY)) {
    console.error(`ERROR: Build not found at ${MAIN_ENTRY}`);
    console.error('Run: cd apps/desktop && npx vite build (or pnpm build)');
    process.exit(1);
  }

  console.log(`Profiling configuration:`);
  console.log(`  Electron:     ${ELECTRON_PATH}`);
  console.log(`  Entry:        ${MAIN_ENTRY}`);
  console.log(`  Runs:         ${numRuns}`);
  console.log(`  Debug port:   ${DEBUG_PORT}`);

  const results = [];
  for (let i = 0; i < numRuns; i++) {
    const r = await runProfile(i);
    if (r && Object.keys(r).length > 0) {
      results.push(r);
    }
    if (i < numRuns - 1) {
      console.log(`\n  Cooling down before next run...`);
      await delay(3000);
    }
  }

  if (results.length === 0) {
    console.error('ERROR: No profiling data collected');
    process.exit(1);
  }

  const aggregated = aggregateResults(results);

  if (outputJson) {
    console.log('\n' + JSON.stringify({ runs: results, aggregated, thresholds: THRESHOLDS }, null, 2));
  } else {
    printSummary(aggregated);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
