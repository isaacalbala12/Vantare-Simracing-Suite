import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// B1 · Guardia estructural RED de ausencia V1 frontend (ISA-894).
//
// Cero cambios productivos: este archivo solo lee el árbol y cita restos por
// ruta exacta con su corte dueño de la tabla B0 del microplan
// (`docs/superpowers/plans/2026-09-04-telemetria-v1-retirada-r7b-frontend.md`).
// Falla en rojo mientras exista V1 productivo. Para que UNA ejecución enumere
// TODOS los residuos (sin cortocircuito), las ausencias se acumulan y se
// afirman juntas con ruta+dueño en el mensaje. Los diferidos (C2/D/E1/E2/E3)
// y el oráculo E4 se afirman PRESENTES para que nadie los borre antes de su
// corte; los exentos Strategy/Engineer/Analysis v1 se afirman presentes por
// contrato independiente (verde heredado de la suite A3, no reejecutado en
// este corte).

const FRONTEND = path.resolve(process.cwd());
const ROOT = path.resolve(process.cwd(), "..");

function src(...segments: string[]): string {
  return path.resolve(FRONTEND, "src", ...segments);
}

function root(...segments: string[]): string {
  return path.resolve(ROOT, ...segments);
}

function read(route: string): string {
  return readFileSync(route, "utf8");
}

// Exige ausentes TODAS las rutas (acumula, no cortocircuita): cada residuo
// aparece con su dueño en el mensaje.
function absentAll(entries: ReadonlyArray<readonly [route: string, owner: string]>): void {
  const remaining = entries
    .filter(([route]) => existsSync(route))
    .map(([route, owner]) => `${route} todavía existe: resto V1 productivo, dueño ${owner}`);
  expect(remaining, "restos V1 productivos pendientes").toEqual([]);
}

// Exige ausentes TODAS las anclas de contenido (acumula, no cortocircuita).
function contentAbsentAll(entries: ReadonlyArray<readonly [route: string, anchor: string, owner: string]>): void {
  const remaining = entries.flatMap(([route, anchor, owner]) => {
    if (!existsSync(route)) {
      return [`${route} falta: no se puede verificar ${JSON.stringify(anchor)}, dueño ${owner}`];
    }
    return read(route).includes(anchor)
      ? [`${route} aún contiene ${JSON.stringify(anchor)}: resto V1, dueño ${owner}`]
      : [];
  });
  expect(remaining, "anclas V1 productivas pendientes").toEqual([]);
}

function present(route: string, owner: string): void {
  expect(
    existsSync(route),
    `${route} falta antes de su corte: dueño ${owner}, no borrar a ciegas`,
  ).toBe(true);
}

function contentHas(route: string, anchor: string, owner: string): void {
  expect(
    read(route).includes(anchor),
    `${route} perdió su ancla ${JSON.stringify(anchor)} antes de su corte: dueño ${owner}`,
  ).toBe(true);
}

// Módulos V1 cuya importación en un caller es resto B2: se afirma ausencia
// en cada caller C2/B2 (acumula archivo+especificador). C2 migra únicamente
// los callers productivos a runtime V2 puro. Los helpers snapshot de
// authoring-fixtures y telemetry-snapshot permanecen bajo D/E1, mientras el
// puente authoring-v2-fixture queda reservado al oráculo E4 hasta B2-prep/B2.
const V1_MODULES_B2 = [
  "overlay-projection-v1",
  "overlay-projection-adapter",
  "projection-telemetry-adapter",
  "projection-observer",
] as const;

describe("B1 guardias RED de ausencia V1 frontend", () => {
  it("B2: proyección/adapter/observer/transporte V1 fuera", () => {
    absentAll([
      [src("overlay", "projection", "overlay-projection-v1.ts"), "B2"],
      [src("overlay", "projection", "overlay-projection-v1.test.ts"), "B2"],
      [src("overlay", "projection", "overlay-projection-adapter.ts"), "B2"],
      [src("overlay", "projection", "overlay-projection-adapter.test.ts"), "B2"],
      [src("overlay", "transports", "projection-telemetry-adapter.ts"), "B2"],
      [src("overlay", "transports", "projection-telemetry-adapter.test.ts"), "B2"],
      [src("overlay", "transports", "projection-observer.ts"), "B2"],
      [src("overlay", "transports", "projection-observer.test.ts"), "B2"],
      [src("overlay", "authoring", "fixtures", "authoring-v2-fixture.ts"), "B2 (puente snapshot reservado al oráculo E4)"],
    ]);
  });

  it("B2: ProductID overlay sin direccionamiento (superficie exacta)", () => {
    // Superficie auditada en telemetry-transport/contracts.ts: exactamente 2
    // anclas V1 — el literal en TELEMETRY_PRODUCTS y la alternativa en el
    // regex de eventName. projectionRoute/factsRoute son plantillas
    // genéricas (`/telemetry/${product}/…`) sin literal overlay y
    // effectiveMaximum es genérico: necesarios, no se vigilan ni se borran.
    contentAbsentAll([
      [src("telemetry-transport", "contracts.ts"), '"overlay",', "B2 (ProductID overlay)"],
      [
        src("telemetry-transport", "contracts.ts"),
        "(overlay|engineer|strategy|analysis)",
        "B2 (regex eventName: overlay seguiría direccionable sin esto)",
      ],
      [
        src("telemetry-transport", "projection-golden.test.ts"),
        "../internal/telemetry/projection/overlay/testdata/overlay_v1.golden.json",
        "B2 (golden de producto Overlay retirado)",
      ],
      [
        src("telemetry-transport", "projection-golden.test.ts"),
        "../internal/telemetry/projection/overlay/testdata/overlay_v1_pre_d7.golden.json",
        "B2 (golden pre-D7 de producto Overlay retirado)",
      ],
      [
        src("telemetry-transport", "projection-golden.test.ts"),
        'eventName("overlay", "projection")',
        "B2 (caso pre-D7 Overlay retirado)",
      ],
    ]);
  });

  it("B2: eventos/allowlist/counters V1 de overlay-wails-pull fuera", () => {
    // ALLOWED_EVENTS + contador receivedV1Projections: la vía V1 del pull.
    contentAbsentAll([
      [src("telemetry-transport", "overlay-wails-pull.ts"), "telemetry:overlay:projection", "B2 (evento V1)"],
      [src("telemetry-transport", "overlay-wails-pull.ts"), "telemetry:overlay:status", "B2 (evento V1)"],
      [src("telemetry-transport", "overlay-wails-pull.ts"), "telemetry:overlay:fact", "B2 (evento V1)"],
      [src("telemetry-transport", "overlay-wails-pull.ts"), "receivedV1Projections", "B2 (counter V1)"],
    ]);
  });

  it("B3: runtime shadow V1, activación, harnesses, HTML, scripts y playwright fuera", () => {
    absentAll([
      [src("overlay", "telemetry-shadow", "overlay-v2-shadow-runtime.ts"), "B3 (runtime shadow)"],
      [src("overlay", "telemetry-shadow", "overlay-v2-shadow-runtime.test.ts"), "B3 (runtime shadow)"],
      // overlay-v2-shadow-activation.ts expone acceptLegacy(epoch, sequence,
      // snapshot: TelemetrySnapshot) y crea el runtime en el primer snapshot
      // legacy: es la puerta de ingesta V1 del runtime, mismo dueño B3.
      [src("overlay", "telemetry-shadow", "overlay-v2-shadow-activation.ts"), "B3 (puerta acceptLegacy)"],
      [src("overlay", "telemetry-shadow", "overlay-v2-shadow-activation.test.ts"), "B3 (puerta acceptLegacy)"],
      [src("overlay", "telemetry-shadow", "overlay-shadow-lote2b-features.test.ts"), "B3 (test runtime V1; migrar garantías útiles)"],
      [src("telemetry-cutover-runtime-harness", "main.ts"), "B3 (harness cutover)"],
      [src("telemetry-overlay-shadow-harness", "main.tsx"), "B3 (harness shadow)"],
      [src("telemetry-overlay-shadow-harness", "TelemetryOverlayShadowHarness.tsx"), "B3 (harness shadow)"],
      [src("telemetry-overlay-shadow-harness", "TelemetryOverlayShadowHarness.test.tsx"), "B3 (harness shadow)"],
      [src("telemetry-overlay-shadow-harness", "evidence.ts"), "B3 (harness shadow)"],
      [path.resolve(FRONTEND, "telemetry-cutover-runtime-harness.html"), "B3 (HTML harness)"],
      [path.resolve(FRONTEND, "telemetry-overlay-shadow-harness.html"), "B3 (HTML harness)"],
      [root("scripts", "bench", "sesion-v1.ps1"), "B3 (dueño exclusivo)"],
      [root("scripts", "bench", "sesion-v1-state.ps1"), "B3 (parser del collector)"],
      [root("scripts", "bench", "sesion-v1-resumen.mjs"), "B3 (dueño exclusivo)"],
      [root("scripts", "bench", "sesion-v1-resumen.test.mjs"), "B3 (dueño exclusivo)"],
      [root("scripts", "bench", "sesion-v1-state.test.mjs"), "B3 (dueño exclusivo)"],
      // Los playwright ejercitan los HTML de harnesses B3 (base URLs a
      // telemetry-overlay-shadow-harness.html y
      // telemetry-cutover-runtime-harness.html): sin harnesses quedarían
      // huérfanos, mismo dueño B3.
      [path.resolve(FRONTEND, "scripts", "telemetry-overlay-shadow.playwright.mjs"), "B3 (playwright harness)"],
      [path.resolve(FRONTEND, "scripts", "telemetry-cutover-runtimes.playwright.mjs"), "B3 (playwright harness)"],
    ]);
  });

  it("B3: referencias a scripts sesion-v1 fuera", () => {
    contentAbsentAll([
      [root("scripts", "bench", "all.test.mjs"), "sesion-v1-resumen.test.mjs", "B3 (refs)"],
      [root("scripts", "bench", "all.test.mjs"), "sesion-v1-state.test.mjs", "B3 (refs)"],
      [root("scripts", "bench", "README.md"), "sesion-v1.ps1", "B3 (refs)"],
      [path.resolve(FRONTEND, "package.json"), '"test:telemetry-overlay-shadow"', "B3 (script npm)"],
      [path.resolve(FRONTEND, "package.json"), '"test:telemetry-cutover-runtimes"', "B3 (script npm)"],
      [
        root("docs", "telemetry-core", "evidence", "isa-894", "s1-definitiva", "recalcular.mjs"),
        "../../../../../scripts/bench/sesion-v1-resumen.mjs",
        "B3 (desacoplar helper histórico antes de retirar el resumen)",
      ],
    ]);
  });

  it("B2-prep: el oráculo E4 no depende del adapter que B2 borrará", () => {
    contentAbsentAll([
      [
        src("overlay", "telemetry-shadow", "overlay-shadow-comparator.ts"),
        "../projection/overlay-projection-adapter",
        "B2-prep (tipos locales del oráculo E4)",
      ],
      [
        src("overlay", "telemetry-shadow", "overlay-shadow-comparator.test.ts"),
        "../projection/overlay-projection-adapter",
        "B2-prep (test del oráculo E4)",
      ],
      [
        src("overlay", "telemetry-shadow", "overlay-shadow-comparator.test.ts"),
        "../authoring/fixtures/authoring-v2-fixture",
        "B2-prep (puente snapshot del oráculo E4)",
      ],
    ]);
  });

  it("C2: callers, previews y fixtures migran a V2 puro antes de B3/B2", () => {
    contentAbsentAll([
      // C2b1: CompositeApp.test.tsx ya es V2-only (golden V1 y mock shadow
      // retirados con cobertura del snapshot V2 real preservada).
      // C2b2: StudioRoute.test.tsx ya es V2-only (golden V1, envelope y
      // eventos legacy retirados; el literal negativo de no-suscripción
      // queda bajo ownership B2 en el propio test).
      // C2b0: los cuatro `import type TelemetryAdapter` de Studio
      // (StudioRoute, OverlayStudioV3, studio-overlay-telemetry,
      // StudioTelemetryProvider) son type-only bajo ownership E1: no son V1
      // en runtime ni entran al bundle, así que no se vigilan aquí.
      [src("hub", "overlay-studio", "canvas", "StudioTelemetryProvider.tsx"), "buildMockTelemetry", "C2 (mock V1 fuera)"],
      [src("hub", "overlay-studio", "canvas", "StudioTelemetryProvider.tsx"), "authoring-v2-fixture", "C2 (usar escenario V2 puro)"],
      [src("overlay", "authoring", "fixtures", "authoring-v2-scenario-fixture.test.ts"), "./authoring-v2-fixture", "C2 (test del escenario V2 puro)"],
      [src("overlay-harness", "OverlayParityHarness.tsx"), "snapshot={snapshot}", "C2 (Host vía runtime V2)"],
      [src("overlay-harness", "OverlayParityHarness.tsx"), "authoring-v2-fixture", "C2 (usar escenario V2 puro)"],
      [src("overlay-harness", "OverlayParityHarness.tsx"), "buildHarnessTelemetry", "C2 (sin builder snapshot)"],
      [src("overlay-harness", "OverlayParityHarness.tsx"), "seedHarnessInputHistory", "C2 (sin seed snapshot global)"],
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "snapshot={prepared.snapshot}", "C2 (Workshop V2)"],
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "authoring-v2-fixture", "C2 (usar escenario V2 puro)"],
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "buildAuthoringFixtureTelemetry", "C2 (sin builder snapshot)"],
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "resetAndSeedAuthoringInputTelemetry", "C2 (sin seed snapshot global)"],
      [src("overlay-harness", "responsive-overlay-main.tsx"), "buildHarnessTelemetry", "C2 (harness dev V2)"],
      // C2b3: HomeMiniStage, ProfilePreview y ui-orbit-harness ya son V2
      // (factory por consumidor sobre el escenario canónico, sin snapshot).
      [src("overlay", "authoring", "workshop-runtime-parity.test.tsx"), "authoring-v2-fixture", "C2 (compat API V2 pura)"],
      [src("overlay", "authoring", "workshop-runtime-parity.test.tsx"), "buildAuthoringFixtureTelemetry", "C2 (compat sin snapshot)"],
      [src("overlay", "design-systems", "vantare-endurance", "track-map", "TrackMapEndurance.layout.test.tsx"), "authoring-v2-fixture", "C2 (compat API V2 pura)"],
      [src("overlay", "design-systems", "vantare-endurance", "endurance-transparent-shells.test.tsx"), "authoring-v2-fixture", "C2 (compat API V2 pura)"],
      [src("overlay", "authoring", "fixtures", "projection-gaps.test.ts"), "overlay-projection-adapter.ts", "C2 (contrato gaps V2)"],
      [src("overlay", "authoring", "fixtures", "animation-scenes.test.ts"), "overlay-projection-adapter.ts", "C2 (escenas V2)"],
    ]);
    // C2b0 (reclasificación E1, comprobación positiva): los cuatro callers
    // Studio conservan `import type { TelemetryAdapter }` desde el módulo
    // canónico hasta E1. Falla si pasa a import runtime o si cambia
    // silenciosamente de módulo. El módulo neutral no se vigila como V1.
    for (const route of [
      src("hub", "overlay-studio", "StudioRoute.tsx"),
      src("hub", "overlay-studio", "OverlayStudioV3.tsx"),
      src("hub", "overlay-studio", "studio-overlay-telemetry.ts"),
      src("hub", "overlay-studio", "canvas", "StudioTelemetryProvider.tsx"),
    ] as const) {
      contentHas(route, "import type { TelemetryAdapter }", "E1 (type-only canónico)");
      contentHas(route, "overlay/transports/telemetry-adapter", "E1 (módulo canónico)");
    }
  });

  it("diferidos C2 presentes: nadie los migra antes de su corte", () => {
    for (const [route, owner] of [
      [src("overlay", "CompositeApp.tsx"), "C2"],
      [src("overlay", "ObsOverlayApp.tsx"), "B2+C2 (parte adapter + previews)"],
      [src("hub", "overlay-studio", "StudioRoute.tsx"), "C2"],
      [src("hub", "overlay-studio", "OverlayStudioV3.tsx"), "C2"],
      [src("hub", "overlay-studio", "studio-overlay-telemetry.ts"), "C2"],
      [src("hub", "overlay-studio", "canvas", "StudioTelemetryProvider.tsx"), "C2"],
      [src("overlay", "authoring", "fixtures", "authoring-fixtures.ts"), "D/E1"],
      [src("overlay", "authoring", "fixtures", "authoring-v2-fixture.ts"), "B2 (puente temporal E4)"],
      [src("overlay-harness", "OverlayParityHarness.tsx"), "C2"],
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "C2"],
      [src("hub", "home-orbit", "HomeMiniStage.tsx"), "C2"],
      [src("hub", "overlays", "ProfilePreview.tsx"), "C2"],
      [src("ui-orbit-harness.tsx"), "C2"],
    ] as const) present(route, owner);
  });

  it("callers C2/B2 sin imports V1 y sus tests exactos presentes", () => {
    const violations: string[] = [];
    for (const route of [
      src("overlay", "CompositeApp.tsx"),
      src("overlay", "ObsOverlayApp.tsx"),
      src("hub", "overlay-studio", "StudioRoute.tsx"),
      src("hub", "overlay-studio", "OverlayStudioV3.tsx"),
      src("hub", "overlay-studio", "studio-overlay-telemetry.ts"),
      src("hub", "overlay-studio", "canvas", "StudioTelemetryProvider.tsx"),
      src("overlay-harness", "OverlayParityHarness.tsx"),
      src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"),
      src("overlay", "authoring", "fixtures", "authoring-fixtures.ts"),
      src("overlay", "authoring", "fixtures", "authoring-v2-fixture.ts"),
    ] as const) {
      const text = read(route);
      for (const module of V1_MODULES_B2) {
        if (text.includes(module)) violations.push(`${route} importa ${module} (resto B2 en caller)`);
      }
    }
    expect(violations, "imports V1 en callers").toEqual([]);
    // C2b1 (pin Desktop V2-only sin shadow): CompositeApp no puede volver a
    // importar ni referenciar el runtime shadow aunque no exponga diagnóstico.
    contentAbsentAll([
      [src("overlay", "CompositeApp.tsx"), "overlay-v2-shadow-runtime", "C2b1 (Desktop V2-only sin shadow)"],
    ]);
    for (const route of [
      src("overlay", "CompositeApp.test.tsx"),
      src("overlay", "ObsOverlayApp.test.tsx"),
      src("hub", "overlay-studio", "StudioRoute.test.tsx"),
      src("hub", "overlay-studio", "studio-overlay-telemetry.test.ts"),
      src("telemetry-transport", "overlay-wails-pull.test.ts"),
      src("overlay-harness", "OverlayParityHarness.test.tsx"),
      src("overlay", "authoring", "OverlayWorkshopDevRoute.test.tsx"),
      src("overlay", "authoring", "fixtures", "authoring-fixtures.test.ts"),
      src("overlay", "authoring", "fixtures", "scene-interpolation.test.ts"),
      src("overlay", "authoring", "fixtures", "projection-gaps.test.ts"),
      src("overlay", "authoring", "fixtures", "animation-scenes.test.ts"),
    ] as const) present(route, "tests exactos del expediente");
  });

  it("diferidos D2/D3/D4 COMPLETOS: buildViewModel legacy por lote exacto", () => {
    const lots = {
      "D2 (lote core/status)": ["standings", "relative", "delta", "fuel-strategy", "pedals-telemetry", "input-telemetry"],
      "D3 (lote dinámicos)": ["racing-flags", "delta-advanced", "delta-trace", "pedals", "pedals-telemetry-compact", "multiclass-relative"],
      "D4 (lote espacial/broadcast/daño)": ["head-to-head", "track-map", "broadcast-tower", "track-weather", "car-damage-numbers", "car-damage-visual"],
    } as const;
    for (const [lot, types] of Object.entries(lots)) {
      for (const type of types) {
        contentHas(src("overlay", "widget-types", type, type + "-definition.ts"), "buildViewModel", lot);
      }
    }
    // D5 auxiliares con fuente propia, fuera de los lotes: se conservan,
    // no se cuentan en los 18 V2 ni se retiran en D2–D4.
    for (const type of ["race-schedule", "engineer-radio"] as const) {
      present(src("overlay", "widget-types", type, type + "-definition.ts"), "D5 (auxiliar, se conserva)");
    }
  });

  it("diferidos E1 presentes: snapshot, adapter, stores e historias legacy", () => {
    for (const [route, owner] of [
      [src("overlay", "core", "telemetry-rate-coordinator.ts"), "E1 (historias/API legacy)"],
      [src("overlay", "core", "mock-scenarios.ts"), "E1"],
      [src("hub", "overlay-studio", "canvas", "fixtures", "studio-v1-snapshot-test-harness.ts"), "E1"],
      [src("overlay", "core", "telemetry-snapshot.ts"), "E1"],
      [src("overlay", "transports", "telemetry-adapter.ts"), "E1"],
      [src("overlay", "core", "telemetry-adapter.ts"), "E1"],
      [src("overlay", "core", "derived-telemetry-store.ts"), "E1"],
      [src("overlay", "core", "derived-telemetry-store.test.ts"), "E1"],
      [src("overlay", "core", "telemetry-rate-coordinator.test.ts"), "E1"],
      [src("overlay", "core", "mock-scenarios.test.ts"), "E1"],
    ] as const) present(route, owner);
    contentHas(
      src("overlay", "authoring", "fixtures", "authoring-fixtures.ts"),
      "TelemetrySnapshot",
      "D/E1 (helpers legacy permanecen hasta migrar definitions/tests)",
    );
    contentHas(
      src("overlay", "authoring", "fixtures", "authoring-fixtures.ts"),
      "buildMockTelemetry",
      "D/E1 (helpers legacy permanecen hasta migrar definitions/tests)",
    );
    // Ancla real de las historias legacy consumidas por el coordinator.
    for (const anchor of ["getFuelHistory", "getInputHistory", "getDeltaHistory"] as const) {
      contentHas(src("overlay", "core", "telemetry-rate-coordinator.ts"), anchor, "E1 (historias legacy)");
    }
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
    // compact_frame.go es prototipo Go con tag researchbench e imports
    // canónicos (derive/envelope), sin cableado al proyector V1: solo lo
    // menciona en comentarios. Se preserva; se vigila que siga así.
    const compact = root("docs", "research", "telemetry-architecture-2026", "bench", "compact_frame.go");
    present(compact, "E3 (se preserva)");
    contentHas(compact, "//go:build researchbench", "E3 (prototipo acotado)");
    contentAbsentAll([[compact, "internal/telemetry/projection/overlay", "E3 (sin cableado V1)"]]);
    contentAbsentAll(
      (["vite.config.ts", "index.html", "overlay.html"] as const).flatMap((route) =>
        (["overlay-projection-v1", "projection-telemetry-adapter", "telemetry-snapshot"] as const).map(
          (anchor) => [path.resolve(FRONTEND, route), anchor, "E3 (verificado limpio en B0)"] as const,
        ),
      ),
    );
    const s1Evidence = root("docs", "telemetry-core", "evidence", "isa-894", "s1-definitiva");
    present(path.resolve(s1Evidence, "recalcular.mjs"), "B3 (evidencia histórica reproducible, se conserva)");
    present(path.resolve(s1Evidence, "README.md"), "B3 (evidencia histórica reproducible, se conserva)");
    contentHas(path.resolve(s1Evidence, "SHA256SUMS"), "recalcular.mjs", "B3 (custodia histórica)");
  });

  it("diferidos E4 presentes: comparator/sanitizer son el oráculo vivo", () => {
    present(src("overlay", "telemetry-shadow", "overlay-shadow-comparator.ts"), "E4 (oráculo, no borrar en B)");
    present(src("overlay", "telemetry-shadow", "overlay-shadow-sanitizer.ts"), "E4 (oráculo, no borrar en B)");
    present(src("overlay", "telemetry-shadow", "overlay-shadow-comparator.test.ts"), "E4 (oráculo)");
    present(src("overlay", "telemetry-shadow", "overlay-shadow-sanitizer.test.ts"), "E4 (oráculo)");
  });

  it("exentos Strategy/Engineer/Analysis v1: contratos independientes vivos", () => {
    // Presentes por contrato; verde heredado de la suite A3 (3439/3441, 2
    // fallos fuel ajenos), no reejecutado en este corte.
    present(src("strategy", "strategy-contract-v1.ts"), "exento (contrato independiente)");
    present(src("strategy", "strategy-contract-v1-canonical.ts"), "exento (contrato independiente)");
    present(src("engineer", "engineer-types.ts"), "exento (contrato independiente)");
    contentHas(src("generated", "telemetry.ts"), "AnalysisPayloadV1", "exento (contrato independiente)");
  });
});
