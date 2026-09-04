import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// B1 · Guardia estructural RED de ausencia V1 frontend (ISA-894).
//
// Cero cambios productivos: este archivo solo lee el árbol y cita restos por
// ruta exacta con su corte dueño de la tabla B0 del microplan
// (`docs/superpowers/plans/2026-09-04-telemetria-v1-retirada-r7b-frontend.md`).
// Falla en rojo mientras exista V1 productivo. Los diferidos (C2/D/E1/E2/E3)
// y el oráculo E4 se afirman PRESENTES para que nadie los borre antes de su
// corte; los exentos Strategy/Engineer/Analysis v1 se afirman presentes y
// verdes por contrato independiente.

const FRONTEND = path.resolve(process.cwd());
const ROOT = path.resolve(process.cwd(), "..");

function src(...segments: string[]): string {
  return path.resolve(FRONTEND, "src", ...segments);
}

function root(...segments: string[]): string {
  return path.resolve(ROOT, ...segments);
}

function absent(route: string, owner: string): void {
  expect(
    existsSync(route),
    `${route} todavía existe: resto V1 productivo, dueño ${owner}`,
  ).toBe(false);
}

function present(route: string, owner: string): void {
  expect(
    existsSync(route),
    `${route} falta antes de su corte: dueño ${owner}, no borrar a ciegas`,
  ).toBe(true);
}

function contentHas(route: string, anchor: string, owner: string): void {
  expect(
    readFileSync(route, "utf8").includes(anchor),
    `${route} perdió su ancla ${JSON.stringify(anchor)} antes de su corte: dueño ${owner}`,
  ).toBe(true);
}

function contentAbsent(route: string, anchor: string, owner: string): void {
  expect(
    readFileSync(route, "utf8").includes(anchor),
    `${route} aún contiene ${JSON.stringify(anchor)}: resto V1 productivo, dueño ${owner}`,
  ).toBe(false);
}

describe("B1 guardias RED de ausencia V1 frontend", () => {
  it("B2: proyección/adapter/observer/transporte V1 y ProductID/eventos fuera", () => {
    absent(src("overlay", "projection", "overlay-projection-v1.ts"), "B2");
    absent(src("overlay", "projection", "overlay-projection-v1.test.ts"), "B2");
    absent(src("overlay", "projection", "overlay-projection-adapter.ts"), "B2");
    absent(src("overlay", "projection", "overlay-projection-adapter.test.ts"), "B2");
    absent(src("overlay", "transports", "projection-telemetry-adapter.ts"), "B2");
    absent(src("overlay", "transports", "projection-telemetry-adapter.test.ts"), "B2");
    absent(src("overlay", "transports", "projection-observer.ts"), "B2");
    absent(src("overlay", "transports", "projection-observer.test.ts"), "B2");
    contentAbsent(src("telemetry-transport", "contracts.ts"), '"overlay",', "B2 (ProductID overlay)");
    contentAbsent(
      src("telemetry-transport", "overlay-wails-pull.ts"),
      "telemetry:overlay:projection",
      "B2 (eventos/allowlist V1)",
    );
  });

  it("B3: runtime shadow V1, harnesses y scripts sesion-v1 fuera", () => {
    absent(src("overlay", "telemetry-shadow", "overlay-v2-shadow-runtime.ts"), "B3");
    absent(src("overlay", "telemetry-shadow", "overlay-v2-shadow-runtime.test.ts"), "B3");
    absent(src("telemetry-cutover-runtime-harness", "main.ts"), "B3");
    absent(src("telemetry-overlay-shadow-harness", "main.tsx"), "B3");
    absent(src("telemetry-overlay-shadow-harness", "TelemetryOverlayShadowHarness.tsx"), "B3");
    absent(src("telemetry-overlay-shadow-harness", "TelemetryOverlayShadowHarness.test.tsx"), "B3");
    absent(src("telemetry-overlay-shadow-harness", "evidence.ts"), "B3");
    absent(root("scripts", "bench", "sesion-v1.ps1"), "B3");
    absent(root("scripts", "bench", "sesion-v1-resumen.mjs"), "B3");
    absent(root("scripts", "bench", "sesion-v1-resumen.test.mjs"), "B3");
    absent(root("scripts", "bench", "sesion-v1-state.test.mjs"), "B3");
    contentAbsent(root("scripts", "bench", "all.test.mjs"), "sesion-v1-resumen.test.mjs", "B3 (refs)");
    contentAbsent(root("scripts", "bench", "README.md"), "sesion-v1.ps1", "B3 (refs)");
  });

  it("diferidos C2 presentes: nadie los migra antes de su corte", () => {
    present(src("overlay", "CompositeApp.tsx"), "C2");
    present(src("overlay", "ObsOverlayApp.tsx"), "B2+C2 (parte adapter + previews)");
    present(src("hub", "overlay-studio", "StudioRoute.tsx"), "C2");
    present(src("hub", "overlay-studio", "studio-overlay-telemetry.ts"), "C2");
    present(src("overlay", "authoring", "fixtures", "authoring-fixtures.ts"), "C2");
    present(src("overlay", "authoring", "fixtures", "authoring-v2-fixture.ts"), "C2");
    present(src("overlay-harness", "OverlayParityHarness.tsx"), "C2");
    present(src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "C2");
  });

  it("diferidos D presentes: buildViewModel legacy por lote", () => {
    contentHas(
      src("overlay", "widget-types", "standings", "standings-definition.ts"),
      "buildViewModel",
      "D2 (lote core/status)",
    );
    contentHas(
      src("overlay", "widget-types", "delta-trace", "delta-trace-definition.ts"),
      "buildViewModel",
      "D3 (lote dinámicos)",
    );
    contentHas(
      src("overlay", "widget-types", "head-to-head", "head-to-head-definition.ts"),
      "buildViewModel",
      "D4 (lote espacial/broadcast/daño)",
    );
  });

  it("diferidos E1 presentes: snapshot, adapter, stores, mocks y harness snapshot", () => {
    present(src("overlay", "core", "telemetry-rate-coordinator.ts"), "E1");
    present(src("overlay", "core", "mock-scenarios.ts"), "E1");
    present(
      src("hub", "overlay-studio", "canvas", "fixtures", "studio-v1-snapshot-test-harness.ts"),
      "E1",
    );
    present(src("overlay", "core", "telemetry-snapshot.ts"), "E1");
    present(src("overlay", "transports", "telemetry-adapter.ts"), "E1");
    present(src("overlay", "core", "telemetry-adapter.ts"), "E1");
    present(src("overlay", "core", "derived-telemetry-store.ts"), "E1");
  });

  it("diferido E2 presente: switch mutable fuera solo en su corte", () => {
    contentHas(
      src("overlay", "telemetry-shadow", "overlay-v2-features.ts"),
      "createOverlayV2FeaturesGeneration",
      "E2 (maquinaria mutable)",
    );
  });

  it("diferidos E3 presentes y preservados: bench research sin borrado prematuro", () => {
    present(root("docs", "research", "telemetry-architecture-2026", "bench", "frontend-bench-entry.ts"), "E3");
    present(root("docs", "research", "telemetry-architecture-2026", "bench", "frontend-bench.mjs"), "E3");
    present(root("docs", "research", "telemetry-architecture-2026", "bench", "compact_frame.go"), "E3 (se preserva)");
    for (const route of ["vite.config.ts", "index.html", "overlay.html"] as const) {
      for (const anchor of ["overlay-projection-v1", "projection-telemetry-adapter", "telemetry-snapshot"]) {
        contentAbsent(path.resolve(FRONTEND, route), anchor, "E3 (verificado limpio en B0)");
      }
    }
  });

  it("diferidos E4 presentes: comparator/sanitizer son el oráculo vivo", () => {
    present(src("overlay", "telemetry-shadow", "overlay-shadow-comparator.ts"), "E4 (oráculo, no borrar en B)");
    present(src("overlay", "telemetry-shadow", "overlay-shadow-sanitizer.ts"), "E4 (oráculo, no borrar en B)");
    present(src("overlay", "telemetry-shadow", "overlay-shadow-comparator.test.ts"), "E4 (oráculo)");
    present(src("overlay", "telemetry-shadow", "overlay-shadow-sanitizer.test.ts"), "E4 (oráculo)");
  });

  it("exentos Strategy/Engineer/Analysis v1: contratos independientes vivos", () => {
    present(src("strategy", "strategy-contract-v1.ts"), "exento (contrato independiente)");
    present(src("strategy", "strategy-contract-v1-canonical.ts"), "exento (contrato independiente)");
    present(src("engineer", "engineer-types.ts"), "exento (contrato independiente)");
    contentHas(src("generated", "telemetry.ts"), "AnalysisPayloadV1", "exento (contrato independiente)");
  });
});
