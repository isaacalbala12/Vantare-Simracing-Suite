import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getOverlayV2ViewModelEntry, overlayV2ViewModelRegistry } from "./core/overlay-v2-view-models";

// E2 · Guardia estructural RED: el sistema de features/rollback muere entero,
// no se reubica (ISA-894).
//
// Hecho verificado con rg antes de escribir este guard: `overlayV2Features`
// solo llega a WidgetVisualHost para calcular `v2Rollback`
// (`props.runtime?.overlayV2Features?.length === 0`); `hasOverlayV2Feature` y
// `entry.feature` solo aparecen en tests y en la declaración del registry.
// No existe ningún consumidor productivo del catálogo que no sea el rollback,
// así que la decisión anterior del microplan ("mover catálogo" a otro archivo)
// queda corregida por el inventario real: se elimina todo, sin copia, sin
// wrapper, sin factory, sin compatibilidad y sin fallback V1. V2 es la única
// autoridad directa.

const FRONTEND = path.resolve(process.cwd());

function src(...segments: string[]): string {
  return path.resolve(FRONTEND, "src", ...segments);
}

function read(route: string): string {
  return readFileSync(route, "utf8");
}

// Exige ausentes TODAS las rutas (acumula, no cortocircuita).
function absentAll(entries: ReadonlyArray<readonly [route: string, owner: string]>): void {
  const remaining = entries
    .filter(([route]) => existsSync(route))
    .map(([route, owner]) => `${route} todavía existe: resto E2, dueño ${owner}`);
  expect(remaining, "archivos E2 pendientes").toEqual([]);
}

// Exige ausentes TODAS las anclas de contenido (acumula, no cortocircuita).
function contentAbsentAll(entries: ReadonlyArray<readonly [route: string, anchor: string, owner: string]>): void {
  const remaining = entries.flatMap(([route, anchor, owner]) => {
    if (!existsSync(route)) {
      return [`${route} falta: no se puede verificar ${JSON.stringify(anchor)}, dueño ${owner}`];
    }
    return read(route).includes(anchor)
      ? [`${route} aún contiene ${JSON.stringify(anchor)}: resto E2, dueño ${owner}`]
      : [];
  });
  expect(remaining, "anclas E2 pendientes").toEqual([]);
}

const THREADING = [
  src("overlay", "core", "widget-definition.ts"),
  src("overlay", "edit", "InPlaceWidgetEditFrame.tsx"),
  src("overlay", "edit", "InPlaceEditOverlay.tsx"),
  src("overlay", "edit", "InPlaceEditModeBranch.tsx"),
  src("overlay", "runtime", "RuntimeWidgetFrame.tsx"),
  src("overlay", "runtime", "RuntimeOverlaySurface.tsx"),
  src("overlay", "runtime", "ObsOverlayRuntime.tsx"),
  src("overlay", "runtime", "DesktopOverlayRuntime.tsx"),
] as const;

const MACHINERY = [
  "createOverlayV2FeaturesGeneration",
  "activeGeneration",
  "setRollback",
  "parseOverlayV2Features",
  "readDiagnosticOverlayV2Features",
  "writeOverlayV2Rollback",
  "readOverlayV2Rollback",
  "ROLLBACK_FEATURES",
  "__vantareSetOverlayV2Rollback",
  "__vantareGetOverlayV2Rollback",
  "vantare:overlay-v2-rollback-changed",
  "vantare:overlay-v2-features",
  "__vantareOverlayV2Features",
] as const;

describe("E2 guardias RED: sistema de features/rollback fuera, V2 directo", () => {
  it("módulo del catálogo y su test ausentes del árbol", () => {
    absentAll([
      [src("overlay", "telemetry-shadow", "overlay-v2-features.ts"), "E2 (catálogo muerto)"],
      [src("overlay", "telemetry-shadow", "overlay-v2-features.test.ts"), "E2 (test exclusivo)"],
    ]);
  });

  it("cero generación/suscripción/dispose en los tres callsites", () => {
    // CompositeApp/ObsOverlayApp solo usaban useSyncExternalStore para el
    // catálogo; StudioRoute lo conserva para raceSchedule (vivo), así que su
    // ausencia solo se exige en los dos primeros.
    contentAbsentAll(
      ([src("overlay", "CompositeApp.tsx"), src("overlay", "ObsOverlayApp.tsx")] as readonly string[]).flatMap(
        (route) =>
          (["createOverlayV2FeaturesGeneration", "overlayV2Features", "useSyncExternalStore"] as const).map(
            (anchor) => [route, anchor, "E2 (callsite V2 directo)"] as const,
          ),
      ),
    );
    contentAbsentAll(
      (["createOverlayV2FeaturesGeneration", "overlayV2Features"] as const).map(
        (anchor) =>
          [src("hub", "overlay-studio", "StudioRoute.tsx"), anchor, "E2 (Studio V2 directo)"] as const,
      ),
    );
  });

  it("cero prop overlayV2Features ni tipo OverlayV2Feature en edit/runtime/context/definition", () => {
    contentAbsentAll(
      (THREADING as readonly string[]).flatMap((route) =>
        (["overlayV2Features", "OverlayV2Feature"] as const).map(
          (anchor) => [route, anchor, "E2 (hilo muerto)"] as const,
        ),
      ),
    );
  });

  it("cero maquinaria mutable/rollback ni diagnóstico en árbol productivo", () => {
    const host = src("overlay", "core", "WidgetVisualHost.tsx");
    contentAbsentAll([
      ...MACHINERY.map(
        (anchor) => [host, anchor, "E2 (maquinaria/host)"] as const,
      ),
      [host, "v2Rollback", "E2 (host sin rollback)"],
      [host, "overlay-v2-rollback", "E2 (diagnóstico muerto)"],
      [host, "!v2Rollback", "E2 (gates simplificados)"],
    ]);
  });

  it("registry V2 directo: sin feature ni constantes del catálogo", () => {
    const registry = src("overlay", "core", "overlay-v2-view-models.ts");
    contentAbsentAll([
      [registry, "OverlayV2Feature", "E2 (registry sin catálogo)"],
      [registry, "overlay-v2-features", "E2 (registry sin import muerto)"],
      [registry, "feature:", "E2 (entry sin metadata muerta)"],
      [registry, "hasOverlayV2Feature", "E2 (sin helper muerto)"],
      [registry, "DEFAULT_OVERLAY_V2_FEATURES", "E2 (sin default muerto)"],
      [registry, "OVERLAY_V2_STANDINGS", "E2 (sin constantes muertas)"],
    ]);
  });

  it("registry V2 directo: los 18 builders siguen siendo la única autoridad", () => {
    expect(overlayV2ViewModelRegistry.size).toBe(18);
    for (const [type, entry] of overlayV2ViewModelRegistry) {
      expect(typeof type).toBe("string");
      expect(typeof (entry as { buildViewModelV2?: unknown }).buildViewModelV2).toBe("function");
      expect(getOverlayV2ViewModelEntry(type)).toBe(entry);
      expect(entry as object).not.toHaveProperty("feature");
    }
  });

  it("el host conserva los diagnósticos V2 productivos (no se soborró)", () => {
    const host = read(src("overlay", "core", "WidgetVisualHost.tsx"));
    for (const anchor of ["overlay-v2-source-missing", "overlay-v2-frame-missing", "overlay-v2-stale"] as const) {
      expect(host.includes(anchor), `host perdió el diagnóstico productivo ${anchor}`).toBe(true);
    }
  });
});
