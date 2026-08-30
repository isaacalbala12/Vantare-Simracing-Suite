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
      surface: "desktop",
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
    expectedWindows: ["desktop"],
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

test("falla cerrado si falta pull o shadow no es null en cualquier ventana OFF", () => {
  const missingPull = fixture();
  missingPull.diagnostics[2].targets[0].diagnostics.pull = null;
  assert.equal(summarizeSession(missingPull).verdict, "fail");

  const activeShadow = fixture();
  activeShadow.diagnostics[3].targets[0].diagnostics.shadow = {frames: 0, mismatches: 0};
  assert.equal(summarizeSession(activeShadow).criteria.v1Off.status, "fail");
});

test("falla si la sesión omite una clase de ventana esperada", () => {
  const input = fixture();
  input.expectedWindows = [];
  const summary = summarizeSession(input);
  assert.equal(summary.verdict, "fail");
  assert.equal(summary.criteria.windows.status, "fail");
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
    {kind: "source-state", window: "desktop|overlay|one", from: "live", to: "stale", frameRevision: 100, timestamp: "2026-08-30T10:05:00Z"},
    {kind: "human", text: "reanudar LMU", timestamp: "2026-08-30T10:05:05Z"},
    {kind: "source-state", window: "desktop|overlay|one", from: "stale", to: "live", frameRevision: 101, timestamp: "2026-08-30T10:05:20Z"},
    {kind: "v2-progress", window: "desktop|overlay|one", frameRevision: 101, timestamp: "2026-08-30T10:05:20Z"},
  ];
  assert.equal(summarizeSession(reconnect).criteria.scenario.status, "pass");

  const late = fixture();
  late.session = "S5";
  late.expectedWindows = ["desktop", "studio-or-obs"];
  late.transitions = [
    {kind: "human", text: "abrir Desktop tarde", timestamp: "2026-08-30T10:05:00Z"},
    {kind: "window-first-seen", surface: "desktop", window: "desktop|overlay|one", timestamp: "2026-08-30T10:05:03Z"},
    {kind: "window-widget-ready", surface: "desktop", window: "desktop|overlay|one", timestamp: "2026-08-30T10:05:08Z"},
    {kind: "human", text: "abrir Studio Live tarde", timestamp: "2026-08-30T10:10:00Z"},
    {kind: "window-first-seen", surface: "studio", window: "studio|hub|two", timestamp: "2026-08-30T10:10:03Z"},
    {kind: "window-widget-ready", surface: "studio", window: "studio|hub|two", timestamp: "2026-08-30T10:10:08Z"},
  ];
  assert.equal(summarizeSession(late).criteria.scenario.status, "pass");
});

test("S4 falla cada ciclo sin avance V2 posterior a su propia marca", () => {
  const input = fixture();
  input.session = "S4";
  input.transitions = [
    {kind: "source-state", window: "desktop|overlay|one", from: "live", to: "stale", frameRevision: 100, timestamp: "2026-08-30T10:04:55Z"},
    {kind: "human", text: "reanudar LMU ciclo 1", timestamp: "2026-08-30T10:05:00Z"},
    {kind: "source-state", window: "desktop|overlay|one", from: "stale", to: "live", frameRevision: 101, timestamp: "2026-08-30T10:05:10Z"},
    {kind: "v2-progress", window: "desktop|overlay|one", frameRevision: 101, timestamp: "2026-08-30T10:05:10Z"},
    {kind: "source-state", window: "desktop|overlay|one", from: "live", to: "disconnected", frameRevision: 200, timestamp: "2026-08-30T10:09:55Z"},
    {kind: "human", text: "reanudar LMU ciclo 2", timestamp: "2026-08-30T10:10:00Z"},
    {kind: "source-state", window: "desktop|overlay|one", from: "disconnected", to: "live", frameRevision: 200, timestamp: "2026-08-30T10:10:10Z"},
  ];
  assert.equal(summarizeSession(input).criteria.scenario.status, "fail");
});

test("S5 exige Desktop y Studio u OBS y empareja first-seen y widget-ready por clave", () => {
  const missingStudio = fixture();
  missingStudio.session = "S5";
  missingStudio.expectedWindows = ["desktop", "studio-or-obs"];
  missingStudio.transitions = [
    {kind: "human", text: "abrir Desktop tarde", timestamp: "2026-08-30T10:05:00Z"},
    {kind: "window-first-seen", surface: "desktop", window: "desktop|one", timestamp: "2026-08-30T10:05:02Z"},
    {kind: "window-widget-ready", surface: "desktop", window: "desktop|one", timestamp: "2026-08-30T10:05:04Z"},
  ];
  assert.equal(summarizeSession(missingStudio).criteria.scenario.status, "fail");

  const crossed = fixture();
  crossed.session = "S5";
  crossed.expectedWindows = ["desktop", "studio-or-obs"];
  crossed.transitions = [
    {kind: "human", text: "abrir Desktop tarde", timestamp: "2026-08-30T10:05:00Z"},
    {kind: "window-first-seen", surface: "desktop", window: "desktop|one", timestamp: "2026-08-30T10:05:02Z"},
    {kind: "window-widget-ready", surface: "desktop", window: "studio|two", timestamp: "2026-08-30T10:05:04Z"},
    {kind: "human", text: "abrir OBS tarde", timestamp: "2026-08-30T10:10:00Z"},
    {kind: "window-first-seen", surface: "obs", window: "obs|three", timestamp: "2026-08-30T10:10:02Z"},
    {kind: "window-widget-ready", surface: "obs", window: "desktop|one", timestamp: "2026-08-30T10:10:04Z"},
  ];
  assert.equal(summarizeSession(crossed).criteria.scenario.status, "fail");
});

test("ON exige paridad shadow independiente en cada ventana esperada", () => {
  const input = fixture();
  input.session = "S5";
  input.phase = "on";
  input.expectedWindows = ["desktop", "studio-or-obs"];
  input.diagnostics.forEach((checkpoint, index) => {
    checkpoint.targets[0].diagnostics.shadow = {frames: (index + 1) * 10, mismatches: 0, metrics: {standings: 0}};
    checkpoint.targets.push({
      role: "hub",
      surface: "studio",
      url: "http://wails.localhost/#/studio",
      title: "Vantare Studio",
      widgetCount: 3,
      diagnostics: {
        pull: {
          receivedV1Projections: index * 100,
          receivedV2Snapshots: index * 100,
          requestDurationMs: {count: index * 100, sampleCount: index * 100, p99: 30, max: 50, histogram: []},
        },
        shadow: {frames: 0, mismatches: 0, metrics: {standings: 0}},
      },
    });
  });
  input.transitions = [
    {kind: "human", text: "abrir Desktop tarde", timestamp: "2026-08-30T10:05:00Z"},
    {kind: "window-first-seen", surface: "desktop", window: "desktop|overlay|one", timestamp: "2026-08-30T10:05:02Z"},
    {kind: "window-widget-ready", surface: "desktop", window: "desktop|overlay|one", timestamp: "2026-08-30T10:05:04Z"},
    {kind: "human", text: "abrir Studio tarde", timestamp: "2026-08-30T10:10:00Z"},
    {kind: "window-first-seen", surface: "studio", window: "studio|hub|two", timestamp: "2026-08-30T10:10:02Z"},
    {kind: "window-widget-ready", surface: "studio", window: "studio|hub|two", timestamp: "2026-08-30T10:10:04Z"},
  ];

  const summary = summarizeSession(input);
  assert.equal(summary.criteria.shadowOn.status, "fail");

  for (const checkpoint of input.diagnostics) checkpoint.targets[1].diagnostics.shadow = null;
  assert.equal(summarizeSession(input).criteria.shadowOn.status, "fail");

  for (const checkpoint of input.diagnostics) checkpoint.targets[1].diagnostics.shadow = {frames: 10, mismatches: 1, metrics: {standings: 1}};
  assert.equal(summarizeSession(input).criteria.shadowOn.status, "fail");
});
