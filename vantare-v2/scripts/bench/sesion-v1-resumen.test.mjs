import assert from "node:assert/strict";
import test from "node:test";
import { renderSessionMarkdown, summarizeSession } from "./sesion-v1-resumen.mjs";

function fixture() {
  const started = Date.parse("2026-08-30T10:00:00Z");
  const samples = [];
  for (let minute = 0; minute <= 20; minute += 1) {
    for (const [pid, role, base] of [[100, "go-host", 70], [200, "browser", 45], [300, "renderer-unassigned", 120], [400, "gpu-process", 140]]) {
      samples.push({
        timestamp: new Date(started + minute * 60_000).toISOString(),
        pid,
        role,
        cpuPct: 1,
        privateBytes: (base + minute / 20) * 1024 * 1024,
      });
    }
  }
  const diagnostics = [0, 5, 10, 15, 20].map((minute, index) => ({
    capturedAt: new Date(started + minute * 60_000).toISOString(),
    targets: [{
      role: "overlay",
      url: "http://wails.localhost/",
      title: "Vantare",
      widgetCount: 3,
      diagnostics: {
        pull: {
          receivedV1Projections: 0,
          receivedV2Snapshots: index * 100,
          requestDurationMs: {count: index * 100, sampleCount: index * 100, p99: 30, max: 50, histogram: []},
        },
        shadow: null,
      },
    }],
  }));
  return {
    schema: "vantare.session.v1",
    session: "S1",
    phase: "off",
    durationMinutes: 20,
    startedAt: new Date(started).toISOString(),
    endedAt: new Date(started + 20 * 60_000).toISOString(),
    executable: {sha256: "a".repeat(64), sha256End: "a".repeat(64), distSha256: "b".repeat(64), distSha256End: "b".repeat(64), stable: true},
    scene: {description: "Spa practice garage-track-boxes", cars: 20},
    hygiene: {foreign: [], systemWebView2: []},
    samples,
    diagnostics,
    transitions: [],
    screenshots: {initial: ["initial-overlay.png"], final: ["final-overlay.png"]},
    shutdownClean: true,
  };
}

test("resume una fase OFF completa con pendientes y transporte dentro del umbral", () => {
  const summary = summarizeSession(fixture());
  assert.equal(summary.verdict, "pass");
  assert.equal(summary.criteria.v1Off.status, "pass");
  assert.equal(summary.criteria.delivery.status, "pass");
  assert.equal(summary.criteria.memory.status, "pass");
  assert.match(renderSessionMarkdown(summary), /Veredicto: PASS/);
});

test("falla cerrado si una ventana recibe V1 durante OFF", () => {
  const input = fixture();
  input.diagnostics[2].targets[0].diagnostics.pull.receivedV1Projections = 1;
  const summary = summarizeSession(input);
  assert.equal(summary.verdict, "fail");
  assert.equal(summary.criteria.v1Off.status, "fail");
});

test("falla una pendiente renderer superior a cinco MiB por hora", () => {
  const input = fixture();
  const started = Date.parse(input.startedAt);
  for (const sample of input.samples.filter(({pid}) => pid === 300)) {
    const hours = (Date.parse(sample.timestamp) - started) / 3_600_000;
    sample.privateBytes = (120 + hours * 8) * 1024 * 1024;
  }
  const summary = summarizeSession(input);
  assert.equal(summary.verdict, "fail");
  assert.equal(summary.criteria.memory.status, "fail");
});

test("valida reconnect y apertura tardía contra sus timestamps", () => {
  const reconnect = fixture();
  reconnect.session = "S4";
  reconnect.transitions = [
    {kind: "source-state", from: "live", to: "stale", timestamp: "2026-08-30T10:05:00Z"},
    {kind: "source-state", from: "stale", to: "live", timestamp: "2026-08-30T10:05:20Z"},
  ];
  assert.equal(summarizeSession(reconnect).criteria.scenario.status, "pass");

  const late = fixture();
  late.session = "S5";
  late.transitions = [
    {kind: "human", text: "abrir Desktop tarde", timestamp: "2026-08-30T10:05:00Z"},
    {kind: "window-first-seen", window: "overlay", timestamp: "2026-08-30T10:05:03Z"},
    {kind: "window-widget-ready", window: "overlay", timestamp: "2026-08-30T10:05:08Z"},
  ];
  assert.equal(summarizeSession(late).criteria.scenario.status, "pass");
});
