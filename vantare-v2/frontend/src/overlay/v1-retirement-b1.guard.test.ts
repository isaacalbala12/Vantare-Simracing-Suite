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
// authoring-fixtures y telemetry-snapshot permanecen bajo D/E1; el puente
// authoring-v2-fixture se retiró en B2 tras desacoplar el oráculo E4.
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
      [src("overlay", "authoring", "fixtures", "authoring-v2-scenario-fixture.test.ts"), "./authoring-v2-fixture", "C2 (test del escenario V2 puro)"],
      // C2b6c: OverlayWorkshopDevRoute ya es V2 puro (frame canónico +
      // variantes dev acotadas, sin snapshot ni builders snapshot); el lock
      // exacto queda abajo, fuera de las anclas pendientes.
      // C2b5a: responsive-overlay-main.tsx ya es V2-only; el lock exacto
      // queda abajo, fuera de las anclas pendientes.
      // C2b3: HomeMiniStage, ProfilePreview y ui-orbit-harness ya son V2
      // (factory por consumidor sobre el escenario canónico, sin snapshot).
      // C2b6c: workshop-runtime-parity ya compara mismo widget y frame V2;
      // el lock exacto queda abajo.
      // C2b6a: los tests de layout TrackMap y shells Endurance ya consumen
      // el escenario V2 puro; el lock exacto queda abajo.
      // C2b7: gaps/scenes ya están cerrados sobre contrato y ViewModels V2.
      [src("overlay", "authoring", "fixtures", "projection-gaps.test.ts"), "overlay-projection-adapter.ts", "C2b7 (gaps sin adapter V1)"],
      [src("overlay", "authoring", "fixtures", "projection-gaps.test.ts"), "readFileSync", "C2b7 (contrato V2 tipado, no textual)"],
      [src("overlay", "authoring", "fixtures", "animation-scenes.ts"), "authoring-fixtures", "C2b7 (catálogo con tipo canónico)"],
      [src("overlay", "authoring", "fixtures", "animation-scenes.test.ts"), "overlay-projection-adapter.ts", "C2b7 (escenas sin adapter V1)"],
      [src("overlay", "authoring", "fixtures", "animation-scenes.test.ts"), "authoring-fixtures", "C2b7 (escenas sin builders V1)"],
      [src("overlay", "authoring", "fixtures", "animation-scenes.test.ts"), "buildAuthoringFixtureTelemetry", "C2b7 (sin snapshot sintético)"],
      [src("overlay", "authoring", "fixtures", "animation-scenes.test.ts"), "buildAuthoringFixtureWidget", "C2b7 (widget desde registro V2)"],
    ]);
    contentHas(
      src("overlay", "authoring", "fixtures", "animation-scenes.test.ts"),
      "buildWorkshopFrameV2",
      "C2b7 (escenas por runtime V2)",
    );
    contentHas(
      src("overlay", "authoring", "fixtures", "projection-gaps.test.ts"),
      "OVERLAY_V2_STANDINGS_DECLARED_GAPS",
      "C2b7 (gaps congelados junto al ViewModel V2)",
    );
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

  it("C2b6a: layout TrackMap y shells Endurance usan el escenario V2 puro", () => {
    contentAbsentAll(
      [
        src("overlay", "design-systems", "vantare-endurance", "track-map", "TrackMapEndurance.layout.test.tsx"),
        src("overlay", "design-systems", "vantare-endurance", "endurance-transparent-shells.test.tsx"),
      ].flatMap((route) => [
        [route, "authoring-v2-fixture", "C2b6a (sin puente snapshot a V2)"],
        [route, "buildMockTelemetry", "C2b6a (sin snapshot sintético)"],
      ] as const),
    );
    for (const route of [
      src("overlay", "design-systems", "vantare-endurance", "track-map", "TrackMapEndurance.layout.test.tsx"),
      src("overlay", "design-systems", "vantare-endurance", "endurance-transparent-shells.test.tsx"),
    ] as const) {
      contentHas(route, "buildAuthoringV2ScenarioRuntime", "C2b6a (golden V2 canónico)");
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
      src("hub", "home-orbit", "HomeMiniStage.tsx"),
      src("hub", "overlays", "ProfilePreview.tsx"),
      src("ui-orbit-harness.tsx"),
      src("overlay-harness", "responsive-overlay-main.tsx"),
      src("overlay-harness", "OverlayParityHarness.tsx"),
      src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"),
      src("overlay", "authoring", "fixtures", "authoring-fixtures.ts"),
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
    // C2b3 (lock previews V2): los tres consumidores no pueden volver a la
    // prop snapshot, sus constantes ni buildMockTelemetry. Fuera del array
    // RED C2: es lock post-corte, no ancla pendiente.
    contentAbsentAll([
      [src("hub", "home-orbit", "HomeMiniStage.tsx"), "snapshot={", "C2b3 (preview sin snapshot)"],
      [src("hub", "home-orbit", "HomeMiniStage.tsx"), "PREVIEW_SNAPSHOT", "C2b3 (constante snapshot retirada)"],
      [src("hub", "home-orbit", "HomeMiniStage.tsx"), "buildMockTelemetry", "C2b3 (sin mock snapshot)"],
      [src("hub", "overlays", "ProfilePreview.tsx"), "snapshot={", "C2b3 (preview sin snapshot)"],
      [src("hub", "overlays", "ProfilePreview.tsx"), "PREVIEW_SNAPSHOT", "C2b3 (constante snapshot retirada)"],
      [src("hub", "overlays", "ProfilePreview.tsx"), "buildMockTelemetry", "C2b3 (sin mock snapshot)"],
      [src("ui-orbit-harness.tsx"), "snapshot={", "C2b3 (harness sin snapshot)"],
      [src("ui-orbit-harness.tsx"), "STAGE_SNAPSHOT", "C2b3 (constante snapshot retirada)"],
      [src("ui-orbit-harness.tsx"), "buildMockTelemetry", "C2b3 (sin mock snapshot)"],
      [src("hub", "overlay-studio", "canvas", "StudioTelemetryProvider.tsx"), "buildMockTelemetry", "C2b4 (provider sin mock snapshot)"],
      [src("hub", "overlay-studio", "canvas", "StudioTelemetryProvider.tsx"), "authoring-v2-fixture", "C2b4 (provider usa escenario V2 puro)"],
      [src("hub", "overlay-studio", "canvas", "StudioTelemetryProvider.tsx"), "coordinator.publish", "C2b4 (provider publica solo frame V2)"],
      [src("hub", "overlay-studio", "canvas", "StudioTelemetryProvider.test.tsx"), "wails-telemetry-adapter", "C2b4 (tipo desde módulo canónico)"],
      [src("overlay-harness", "responsive-overlay-main.tsx"), "buildHarnessTelemetry", "C2b5a (harness sin snapshot V1)"],
      [src("overlay-harness", "responsive-overlay-main.tsx"), "buildHarnessWidget", "C2b5a (widgets desde registro productivo)"],
      [src("overlay-harness", "responsive-overlay-main.tsx"), "authoring-fixtures", "C2b5a (sin megamódulo legacy)"],
      [src("overlay-harness", "responsive-overlay-main.tsx"), "coordinator.publish", "C2b5a (publica solo frame V2)"],
    ]);
    contentHas(
      src("overlay-harness", "responsive-overlay-main.tsx"),
      "buildAuthoringV2ScenarioRuntime",
      "C2b5a (escenario V2 canónico)",
    );
    contentHas(
      src("overlay-harness", "responsive-overlay-main.tsx"),
      "coordinator.setOverlayFrame",
      "C2b5a (frontera V2)",
    );
    // C2b6b (lock Parity V2 puro): sin prop snapshot, puente, builders ni
    // seed snapshot; escenario V2 canónico como única fuente. Fuera del
    // array RED C2: es lock post-corte, no ancla pendiente.
    contentAbsentAll([
      [src("overlay-harness", "OverlayParityHarness.tsx"), "snapshot={", "C2b6b (Parity sin snapshot)"],
      [src("overlay-harness", "OverlayParityHarness.tsx"), "authoring-v2-fixture", "C2b6b (Parity usa escenario V2 puro)"],
      [src("overlay-harness", "OverlayParityHarness.tsx"), "authoring-fixtures", "C2b6b (Parity sin megamódulo legacy)"],
      [src("overlay-harness", "OverlayParityHarness.tsx"), "buildHarnessTelemetry", "C2b6b (Parity sin builder snapshot)"],
      [src("overlay-harness", "OverlayParityHarness.tsx"), "seedHarnessInputHistory", "C2b6b (Parity sin seed snapshot global)"],
      [src("overlay-harness", "overlay-parity-query.ts"), "authoring-fixtures", "C2b6b (query sin megamódulo legacy)"],
    ]);
    contentHas(
      src("overlay-harness", "OverlayParityHarness.tsx"),
      "buildAuthoringV2ScenarioRuntime",
      "C2b6b (escenario V2 canónico)",
    );
    contentHas(
      src("overlay-harness", "OverlayParityHarness.tsx"),
      "buildAuthoringV2ScenarioWidget",
      "C2b6b (widget V2 puro sin snapshot)",
    );
    // C2b6b (frontera runtime/visual): el fixture del golden no importa el
    // módulo visual ni el registry; solo Parity lo hace vía el vecino.
    contentAbsentAll([
      [src("overlay", "authoring", "fixtures", "authoring-v2-scenario-fixture.ts"), "authoring-v2-scenario-widget", "C2b6b (runtime sin módulo visual)"],
      [src("overlay", "authoring", "fixtures", "authoring-v2-scenario-fixture.ts"), "widget-registry", "C2b6b (runtime sin registry)"],
      [src("overlay", "authoring", "fixtures", "authoring-v2-scenario-fixture.ts"), "widget-design", "C2b6b (runtime sin diseños)"],
      [src("overlay", "authoring", "fixtures", "authoring-v2-scenario-fixture.ts"), "official-designs", "C2b6b (runtime sin diseños)"],
      [src("overlay", "authoring", "fixtures", "authoring-v2-scenario-fixture.ts"), "relative-content", "C2b6b (runtime sin contenido)"],
    ]);
    // C2b6c (lock Workshop V2 puro): sin prop snapshot, puente, builders ni
    // seed snapshot; frame canónico + variantes dev acotadas como única
    // fuente. Fuera del array RED C2: es lock post-corte, no ancla pendiente.
    contentAbsentAll([
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "snapshot={", "C2b6c (Workshop sin snapshot)"],
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "authoring-v2-fixture", "C2b6c (Workshop usa frame V2 puro)"],
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "authoring-fixtures", "C2b6c (Workshop sin megamódulo legacy)"],
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "buildAuthoringFixtureTelemetry", "C2b6c (Workshop sin builder snapshot)"],
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "resetAndSeedAuthoringInputTelemetry", "C2b6c (Workshop sin seed snapshot global)"],
      [src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"), "clearInputTelemetryHistory", "C2b6c (Workshop sin acumulador global)"],
      [src("overlay", "authoring", "overlay-workshop-query.ts"), "authoring-fixtures", "C2b6c (query sin megamódulo legacy)"],
      [src("overlay", "authoring", "workshop-runtime-parity.test.tsx"), "authoring-v2-fixture", "C2b6c (compat sin puente snapshot)"],
      [src("overlay", "authoring", "workshop-runtime-parity.test.tsx"), "buildAuthoringFixtureTelemetry", "C2b6c (compat sin builder snapshot)"],
      [src("overlay", "authoring", "workshop-runtime-parity.test.tsx"), "coordinator.publish", "C2b6c (compat publica solo frame V2)"],
    ]);
    contentHas(
      src("overlay", "authoring", "OverlayWorkshopDevRoute.tsx"),
      "buildWorkshopFrameV2",
      "C2b6c (frame V2 puro con variantes dev)",
    );
    contentHas(
      src("overlay", "authoring", "workshop-runtime-parity.test.tsx"),
      "buildWorkshopFrameV2",
      "C2b6c (compat sobre frame V2)",
    );
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

  it("D2/D3/D4 cerrados: buildViewModel legacy por lote exacto", () => {
    const retiredLots = {
      "D2 (lote core/status retirado)": ["standings", "relative", "delta", "fuel-strategy", "pedals-telemetry", "input-telemetry"],
      "D3 (lote dinámicos retirado)": ["racing-flags", "delta-advanced", "delta-trace", "pedals", "pedals-telemetry-compact", "multiclass-relative"],
      "D4 (lote espacial/broadcast/daño retirado)": ["head-to-head", "track-map", "broadcast-tower", "track-weather", "car-damage-numbers", "car-damage-visual"],
    } as const;
    for (const [lot, types] of Object.entries(retiredLots)) {
      contentAbsentAll(types.map((type) => [
        src("overlay", "widget-types", type, type + "-definition.ts"),
        "buildViewModel",
        lot,
      ] as const));
    }
    // D5 auxiliares con fuente propia, fuera de los lotes: se conservan,
    // no se cuentan en los 18 V2 ni se retiran en D2–D4.
    for (const type of ["race-schedule", "engineer-radio"] as const) {
      present(src("overlay", "widget-types", type, type + "-definition.ts"), "D5 (auxiliar, se conserva)");
    }
  });

  it("C1 resuelto rama B: daño legacy fuera, definitions sin builders V1", () => {
    // Rama B con evidencia: cero productores reales de snapshot.damage; la
    // autoridad productiva es el frame V2 (overlayV2ViewModelRegistry). El
    // slot legacy de cada definition queda honesto missing; D4 retirará el
    // slot con su lote. Este lock solo endurece: no toca D2/D3/D4 ni E1–E4.
    absentAll([
      [src("overlay", "widget-types", "shared", "damage-reader.ts"), "C1 (lector legacy de daño)"],
      [
        src("overlay", "widget-types", "car-damage-visual", "car-damage-visual-view-model.test.ts"),
        "C1 (test del builder V1 visual)",
      ],
      [
        src("overlay", "widget-types", "car-damage-numbers", "car-damage-numbers-view-model.test.ts"),
        "C1 (test del builder V1 numbers)",
      ],
    ]);
    contentAbsentAll([
      [
        src("overlay", "widget-types", "car-damage-visual", "car-damage-visual-view-model.ts"),
        "readDamage",
        "C1 (builder V1 visual)",
      ],
      [
        src("overlay", "widget-types", "car-damage-numbers", "car-damage-numbers-view-model.ts"),
        "readDamage",
        "C1 (builder V1 numbers)",
      ],
      [
        src("overlay", "widget-types", "car-damage-visual", "car-damage-visual-view-model.ts"),
        "buildCarDamageVisualViewModel(",
        "C1 (builder V1 visual)",
      ],
      [
        src("overlay", "widget-types", "car-damage-numbers", "car-damage-numbers-view-model.ts"),
        "buildCarDamageNumbersViewModel(",
        "C1 (builder V1 numbers)",
      ],
      [
        src("overlay", "widget-types", "car-damage-visual", "car-damage-visual-definition.ts"),
        "buildCarDamageVisualViewModel(",
        "C1 (definition visual sin builder V1)",
      ],
      [
        src("overlay", "widget-types", "car-damage-numbers", "car-damage-numbers-definition.ts"),
        "buildCarDamageNumbersViewModel(",
        "C1 (definition numbers sin builder V1)",
      ],
    ]);
    contentHas(
      src("overlay", "widget-types", "shared", "car-damage-c1.test.ts"),
      "rama B",
      "C1 (rama de evidencia fijada en test)",
    );
  });

  it("E1c autoría legacy fuera: megamódulo, shim y tests V1", () => {
    // E1c (autoría legacy): el megamódulo snapshot cae junto a su shim de
    // compatibilidad y sus tests exclusivos V1. Workshop/Parity ya consumen
    // la frontera V2 (authoring-v2-scenario-fixture/-widget/-workshop-frame);
    // el contract Endurance construye su modelo multiclass desde el frame V2.
    absentAll([
      [src("overlay", "authoring", "fixtures", "authoring-fixtures.ts"), "E1c (megamódulo snapshot)"],
      [src("overlay", "authoring", "fixtures", "authoring-fixtures.test.ts"), "E1c (test exclusivo V1)"],
      [src("overlay-harness", "harness-fixtures.ts"), "E1c (shim sin callers productivos)"],
      [src("overlay-harness", "harness-fixtures.test.ts"), "E1c (test exclusivo V1)"],
    ]);
    contentAbsentAll([
      [src("overlay", "design-systems", "vantare-endurance", "contract.test.tsx"), "authoring-fixtures", "E1c (contract sobre frame V2)"],
      [src("overlay", "design-systems", "vantare-endurance", "contract.test.tsx"), "buildHarnessTelemetry", "E1c (contract sobre frame V2)"],
    ]);
  });

  it("diferidos E1 presentes: snapshot, adapter, stores e historias legacy", () => {
    for (const [route, owner] of [
      [src("overlay", "core", "telemetry-rate-coordinator.ts"), "E1 (historias/API legacy)"],
      [src("overlay", "core", "mock-scenarios.ts"), "E1"],
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
