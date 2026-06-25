# Pedals Compact Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el render heredado de `PedalsWidget` por el diseño compacto del mock V4 (`docs/p2-pedals-mock.html`): 3 barras verticales (THR/BRK/CLT), sin marcha, sin velocidad, sin volante fake, sin canvas histórico, fondo transparente por defecto, datos `0..100` con clamp visual.

**Architecture:** Rediseño aislado de un solo widget. Se introduce un helper puro `pedals-format.ts` para clamp de valores extremos (TDD). El render reutiliza el patrón existente de refs + `setStylePropertyIfChanged` + `startFrameBudgetLoop` a 30Hz, eliminando refs/constantes del canvas/volante/marcha. No se toca `widget-base-size.ts`, schema, backend, ni otros widgets. Colores existentes se preservan; solo se alinean los defaults del catálogo con la paleta del mock V4.

**Tech Stack:** React 18 + TypeScript estricto, Vitest + @testing-library/react, Tailwind, helpers `dom-write.ts`/`frame-budget.ts`, perfil schema v2.

---

## Decisiones aprobadas (deben respetarse sin reabrir)

1. **Estilo beta v1:** solo barras verticales (mock V4 broadcast minimal). Sin labels visibles, sin % numérico.
2. **Fondo:** transparente por defecto. El "track" de cada barra vacía usa `#0a0a0a` fijo (independiente de `backgroundColor` del appearance). Si el usuario setea `appearance.backgroundColor` explícitamente a un color distinto de `transparent`, el contenedor lo pinta (compatibilidad mínima hacia atrás); si no, no pinta fondo.
3. **Etiqueta interna del dato:** `CLT` (no `CLU`) en `data-testid`/`aria-label`. No se renderiza texto en beta v1.
4. **Tamaño base:** `90x100` (mock V4: 3x26 + 2x3 gap = 84px ancho ~ 90 redondeado; 100px alto). Se actualiza `configs/example-racing.json` y `recommended-profiles.ts` (perfiles demo/Vantare). **No se migran perfiles de usuario guardados**: su `position.w/h` se respeta; solo se verá grande hasta que redimensionen en LayoutStudio.
5. **Colores por defecto del catálogo:** `pedalThrottleColor=#34d399`, `pedalBrakeColor=#e63946`, `pedalClutchColor=#3aa6c8` (alineados con mock V4). Perfiles existentes con `appearance.pedal*Color` explícito siguen funcionando via override.
6. **No tocar `widget-base-size.ts`**: solo aplica a `relative`/`standings`. Pedals sigue usando `position.w/h` como contrato de layout.

## Respuestas a las preguntas del enunciado

1. **¿Fondo negro propio o transparente?** Transparente por defecto (ver decisión 2).
2. **¿Tamaño base cambia desde 530x80?** Sí, a `90x100` en perfiles demo/Vantare (ver decisión 4).
3. **¿CLU o CLT?** CLT (ver decisión 3).
4. **¿Porcentaje numérico o solo barras?** Solo barras (ver decisión 1).
5. **¿Compatibilidad con props de colores actuales?** Sí, preservada (ver decisión 5).
6. **¿Riesgo de resize/espacio vacío en WidgetStudio/LayoutStudio?** Bajo. El widget renderiza un contenedor `fit-content` en X (84px intrínseco) y `100%` height. En `WidgetSandboxPreview` (`fillHost=false`) se envuelve sin espacio vacío. En runtime/LayoutStudio con `fillHost=true` y `position.w/h` grandes, las barras crecen en ancho proporcionalmente. Si `position.h` es muy chico, las barras se achatan; se acepta que LayoutStudio controla tamaño. No tocar `widget-base-size.ts` ni `PreviewScaler`.

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `frontend/src/overlay/widgets/pedals-format.ts` | Crear | Helper puro `clampPedalPercent` + `formatPedalHeightPercent`. Sin deps. |
| `frontend/src/overlay/widgets/pedals-format.test.ts` | Crear | Tests table-driven de clamp y formato. |
| `frontend/src/overlay/widgets/PedalsWidget.tsx` | Reescribir render | 3 barras verticales, refs, frame loop, sin marcha/volante/canvas. |
| `frontend/src/overlay/widgets/PedalsWidget.test.tsx` | Reescribir tests | Render 3 barras, clamp extremos, appearance, mock update. |
| `frontend/src/hub/state/style-catalog.ts` | Modificar defaults pedals | Paleta mock V4. |
| `configs/example-racing.json` | Modificar widget pedals | `position.w/h` 90x100. |
| `frontend/src/hub/overlays/recommended-profiles.ts` | Modificar widget pedals | `position.w/h` 90x100 en perfiles Vantare. |
| `docs/current-plan.md` | Actualizar al cierre | Estado P3. |

**Archivos NO tocados:** `docs/p2-pedals-mock.html`, `widget-base-size.ts`, `TelemetryWidget.tsx`, `TelemetryVerticalWidget.tsx`, `telemetry-ref.ts`, `dom-write.ts`, `frame-budget.ts`, `WidgetRenderer.tsx`, `CompositeApp.tsx`, `ObsOverlayApp.tsx`, `WidgetList.tsx`, `widget-appearance.ts`, `use-widget-telemetry.ts`, `mock-telemetry.ts`, cualquier Go/schema/backend/Ingeniero/Standings/Relative/Delta.

---

## Task 0: Lectura / contrato visual

**Files:**
- Read: `docs/p2-pedals-mock.html`, `docs/pedals-inventory.md`, `docs/superpowers/plans/2026-06-25-p2-pedals-design.md`, `frontend/src/overlay/widgets/PedalsWidget.tsx`, `frontend/src/lib/dom-write.ts`, `frontend/src/lib/frame-budget.ts`, `frontend/src/overlay/widgets/use-widget-telemetry.ts`, `frontend/src/overlay/widgets/widget-appearance.ts`, `frontend/src/hub/state/style-catalog.ts`, `frontend/src/overlay/widgets/widget-base-size.ts`, `configs/example-racing.json`, `frontend/src/hub/overlays/recommended-profiles.ts`

- [ ] **Step 1: Confirmar punto de partida limpio**

Run: `git status --short`
Expected: `docs/p2-pedals-mock.html` y `docs/superpowers/plans/2026-06-25-p2-pedals-design.md` untracked (no mezclar); resto preferiblemente limpio. Si hay cambios previos no relacionados, parar y reportar.

- [ ] **Step 2: Fijar contrato visual desde mock V4**

Confirmar valores exactos del mock:
- Contenedor `.pedals`: `display:flex; gap:3px; align-items:flex-end; width:87px; height:100px`.
- Barra `.bar`: `width:26px; height:100px; background:#0a0a0a` (track final, no `#9a9a9a` ni `#050505`); `overflow:hidden`.
- Fill `.fill`: `position:absolute; bottom:0; left:0; width:100%; height:0; transition:height .15s linear`.
- Colores fill: clt `#3aa6c8`, brk `#e63946`, thr `#34d399`.
- Orden DOM: clt, brk, thr (izq→der).
- Contenedor del widget: sin fondo por defecto (transparente).

- [ ] **Step 3: Inventario de refs/constantes a eliminar en PedalsWidget.tsx**

Listar para eliminar en Task 2:
- `BAKED_PANEL_BG`, `HISTORY_SIZE`.
- `gearRef`, `speedRef`, `canvasRef`, `steeringRef`, `steeringRef_`, `thrHistoryRef`, `brkHistoryRef`.
- JSX: bloque marcha/velocidad (`data-testid="pedals-gear"`), bloque central con skew, bloque canvas + SVG volante.
- Lógica frame loop: `setTextIfChanged(gearRef...)`, `setTextIfChanged(speedRef...)`, oscilación `Math.sin`, push/shift historiales, dibujo canvas 2D.

Listar para mantener:
- `containerRef`, `clutchBarRef`, `brakeBarRef`, `throttleBarRef`.
- `resolveWidgetAppearance("pedals", props)`.
- `getWidgetTelemetrySource`, `startFrameBudgetLoop(updateHz, ...)`.
- `setStylePropertyIfChanged(..., "height", ...)`.

**Stop conditions Task 0:** si el mock V4 fue editado y ya no coincide con los valores de Step 2; si `git status` muestra cambios en archivos del alcance que no entiendes.

---

## Task 1: Helpers puros de clamp/formato

**Files:**
- Create: `frontend/src/overlay/widgets/pedals-format.ts`
- Test: `frontend/src/overlay/widgets/pedals-format.test.ts`

- [ ] **Step 1: Write the failing test**

Crear `frontend/src/overlay/widgets/pedals-format.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { clampPedalPercent, formatPedalHeightPercent } from "./pedals-format";

describe("clampPedalPercent", () => {
  const cases: Array<[unknown, number]> = [
    [0, 0],
    [50.4, 50],
    [50.6, 51],
    [100, 100],
    [150, 100],
    [Infinity, 0],
    [-Infinity, 0],
    [NaN, 0],
    [-20, 0],
    [undefined, 0],
    [null, 0],
    ["78", 0],
    [{}, 0],
  ];
  for (const [input, expected] of cases) {
    it(`clamps ${JSON.stringify(input)} to ${expected}`, () => {
      expect(clampPedalPercent(input)).toBe(expected);
    });
  }
});

describe("formatPedalHeightPercent", () => {
  it("formats a normal value", () => {
    expect(formatPedalHeightPercent(78)).toBe("78%");
  });
  it("clamps negative to 0%", () => {
    expect(formatPedalHeightPercent(-5)).toBe("0%");
  });
  it("clamps over 100 to 100%", () => {
    expect(formatPedalHeightPercent(200)).toBe("100%");
  });
  it("handles undefined as 0%", () => {
    expect(formatPedalHeightPercent(undefined)).toBe("0%");
  });
  it("handles NaN as 0%", () => {
    expect(formatPedalHeightPercent(NaN)).toBe("0%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend test -- pedals-format`
Expected: FAIL con "module not found" o "clampPedalPercent is not a function".

- [ ] **Step 3: Write minimal implementation**

Crear `frontend/src/overlay/widgets/pedals-format.ts`:

```typescript
export function clampPedalPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

export function formatPedalHeightPercent(value: unknown): string {
  return `${clampPedalPercent(value)}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend test -- pedals-format`
Expected: PASS (todos los casos table-driven).

- [ ] **Step 5: Run typecheck**

Run: `pnpm --dir frontend exec tsc -b`
Expected: PASS sin errores.

**Stop conditions Task 1:** si `clampPedalPercent` necesita importar de `telemetry-ref.ts` (no debe; es puro). Si algún caso del table-drive falla inesperadamente.

---

## Task 2: Rediseño render PedalsWidget

**Files:**
- Modify: `frontend/src/overlay/widgets/PedalsWidget.tsx`

- [ ] **Step 1: Reescribir PedalsWidget.tsx**

Sustituir todo el contenido por:

```typescript
import { useEffect, useMemo, useRef } from "react";
import { getWidgetTelemetrySource } from "./use-widget-telemetry";
import type { WidgetTelemetryMode } from "./use-widget-telemetry";
import { resolveWidgetAppearance } from "./widget-appearance";
import { setStylePropertyIfChanged } from "../../lib/dom-write";
import { startFrameBudgetLoop } from "../../lib/frame-budget";
import { formatPedalHeightPercent } from "./pedals-format";

type PedalsProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  props?: Record<string, unknown>;
};

const TRACK_BG = "#0a0a0a";
const DEFAULT_CONTAINER_BG = "transparent";

export function PedalsWidget({ editMode, telemetryMode, updateHz = 30, props }: PedalsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clutchBarRef = useRef<HTMLDivElement>(null);
  const brakeBarRef = useRef<HTMLDivElement>(null);
  const throttleBarRef = useRef<HTMLDivElement>(null);
  const { appearance: a } = resolveWidgetAppearance("pedals", props);

  const getTelemetry = useMemo(
    () => getWidgetTelemetrySource(telemetryMode ?? (editMode ? "mock" : "live")),
    [editMode, telemetryMode],
  );

  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => {
      const t = getTelemetry();
      if (clutchBarRef.current) {
        setStylePropertyIfChanged(clutchBarRef.current, "height", formatPedalHeightPercent(t.clutch));
      }
      if (brakeBarRef.current) {
        setStylePropertyIfChanged(brakeBarRef.current, "height", formatPedalHeightPercent(t.brake));
      }
      if (throttleBarRef.current) {
        setStylePropertyIfChanged(throttleBarRef.current, "height", formatPedalHeightPercent(t.throttle));
      }
    });
  }, [updateHz, a.pedalThrottleColor, a.pedalBrakeColor, a.pedalClutchColor, getTelemetry]);

  const containerBg =
    a.backgroundColor && a.backgroundColor !== "transparent"
      ? a.backgroundColor
      : DEFAULT_CONTAINER_BG;

  return (
    <div
      ref={containerRef}
      data-testid="pedals-widget"
      className="w-full h-full flex items-end justify-center overflow-hidden font-display"
      style={{ background: containerBg, opacity: a.opacity }}
    >
      <div
        className="flex gap-[3px] items-end"
        style={{ width: "84px", height: "100%" }}
        aria-label="Pedals: throttle, brake, clutch"
      >
        <div
          data-testid="pedal-bar-clt"
          aria-label="Clutch"
          className="relative overflow-hidden"
          style={{ width: "26px", height: "100%", background: TRACK_BG }}
        >
          <div
            ref={clutchBarRef}
            className="absolute bottom-0 left-0 w-full"
            style={{ height: "0%", background: a.pedalClutchColor, transition: "height .15s linear" }}
          />
        </div>
        <div
          data-testid="pedal-bar-brk"
          aria-label="Brake"
          className="relative overflow-hidden"
          style={{ width: "26px", height: "100%", background: TRACK_BG }}
        >
          <div
            ref={brakeBarRef}
            className="absolute bottom-0 left-0 w-full"
            style={{ height: "0%", background: a.pedalBrakeColor, transition: "height .15s linear" }}
          />
        </div>
        <div
          data-testid="pedal-bar-thr"
          aria-label="Throttle"
          className="relative overflow-hidden"
          style={{ width: "26px", height: "100%", background: TRACK_BG }}
        >
          <div
            ref={throttleBarRef}
            className="absolute bottom-0 left-0 w-full"
            style={{ height: "0%", background: a.pedalThrottleColor, transition: "height .15s linear" }}
          />
        </div>
      </div>
    </div>
  );
}
```

Notas:
- Se elimina `setTextIfChanged` import (no se usa texto).
- Se elimina `BAKED_PANEL_BG`, `HISTORY_SIZE`, `gearRef`, `speedRef`, `canvasRef`, `steeringRef`, `steeringRef_`, `thrHistoryRef`, `brkHistoryRef`.
- El frame loop ya no lee `t.gear`/`t.speed`, no dibuja canvas, no oscila volante.
- `containerBg` resuelve fondo transparente por defecto; si el usuario setea `appearance.backgroundColor` a un color, lo aplica (compatibilidad mínima).
- `data-testid` eliminados del heredado: `pedals-gear`. Nuevos: `pedals-widget`, `pedal-bar-clt`, `pedal-bar-brk`, `pedal-bar-thr`.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --dir frontend exec tsc -b`
Expected: PASS sin errores. Si falla por imports no usados, limpiar.

- [ ] **Step 3: Run build**

Run: `pnpm --dir frontend build`
Expected: PASS.

**Stop conditions Task 2:** si `tsc` reporta errores en otros archivos por cambios de exports (no debería; el componente mantiene la misma firma `PedalsWidget({ editMode, telemetryMode, updateHz, props })`). Si tests existentes fallan por `data-testid="pedals-gear"` ausente (se reescriben en Task 3, pero ejecuta Task 3 antes de declarar done).

---

## Task 3: Tests de render y valores extremos

**Files:**
- Modify: `frontend/src/overlay/widgets/PedalsWidget.test.tsx`

- [ ] **Step 1: Reescribir PedalsWidget.test.tsx**

Sustituir todo el contenido por:

```typescript
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PedalsWidget } from "./PedalsWidget";

describe("PedalsWidget", () => {
  it("renders exactly three pedal bars (clt, brk, thr)", () => {
    render(<PedalsWidget editMode={true} updateHz={30} />);
    expect(screen.getByTestId("pedal-bar-clt")).toBeTruthy();
    expect(screen.getByTestId("pedal-bar-brk")).toBeTruthy();
    expect(screen.getByTestId("pedal-bar-thr")).toBeTruthy();
    expect(screen.queryByTestId("pedals-gear")).toBeNull();
  });

  it("does not render gear block, steering svg or history canvas", () => {
    const { container } = render(<PedalsWidget editMode={true} updateHz={30} />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-testid='pedals-gear']")).toBeNull();
  });

  it("renders transparent background by default", () => {
    render(<PedalsWidget editMode={true} updateHz={30} />);
    const root = screen.getByTestId("pedals-widget");
    expect(root.style.background).toBe("transparent");
  });

  it("applies explicit backgroundColor when set", () => {
    render(
      <PedalsWidget
        editMode={true}
        updateHz={30}
        props={{ appearance: { backgroundColor: "#1a0104" } }}
      />,
    );
    const root = screen.getByTestId("pedals-widget");
    expect(root.style.background).toBe("#1a0104");
  });

  it("applies custom pedal colors to fills", () => {
    render(
      <PedalsWidget
        editMode={true}
        updateHz={30}
        props={{
          appearance: {
            pedalThrottleColor: "#00ff00",
            pedalBrakeColor: "#0000ff",
            pedalClutchColor: "#ff0000",
          },
        }}
      />,
    );
    const thrFill = screen.getByTestId("pedal-bar-thr").firstChild as HTMLElement;
    const brkFill = screen.getByTestId("pedal-bar-brk").firstChild as HTMLElement;
    const cltFill = screen.getByTestId("pedal-bar-clt").firstChild as HTMLElement;
    expect(thrFill.style.background).toBe("#00ff00");
    expect(brkFill.style.background).toBe("#0000ff");
    expect(cltFill.style.background).toBe("#ff0000");
  });

  it("uses dark track background for empty bars", () => {
    render(<PedalsWidget editMode={true} updateHz={30} />);
    expect(screen.getByTestId("pedal-bar-thr").style.background).toBe("#0a0a0a");
  });

  it("never exceeds 100% or goes negative with mock telemetry", () => {
    render(<PedalsWidget editMode={true} updateHz={30} />);
    const thrFill = screen.getByTestId("pedal-bar-thr").firstChild as HTMLElement;
    const pct = parseInt(thrFill.style.height || "0", 10);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});
```

Notas:
- El test de frame timing en jsdom es inestable con `requestAnimationFrame` real; por eso se valida el clamp de extremos en `pedals-format.test.ts` (Task 1) y aquí solo se aserta que el render inicial está en rango `0..100`.
- El test "clamps negative" es defensivo; el clamp real se prueba en `pedals-format.test.ts` (Task 1).

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --dir frontend test -- PedalsWidget`
Expected: PASS (todos los tests nuevos).

- [ ] **Step 3: Run full frontend test suite**

Run: `pnpm --dir frontend test`
Expected: PASS (suite completa). Si otros tests fallan por `data-testid="pedals-gear"` o `CLU`/`THR`/`BRK` texto ausente, actualizar esos tests en sus propios archivos (buscar con `rg "pedals-gear|\"CLU\"|\"THR\"|\"BRK\"" frontend/src`).

- [ ] **Step 4: Search for broken references in other tests**

Run: `rg -n "pedals-gear|\"CLU\"|getByText.*CLU" frontend/src`
Expected: Solo `PedalsWidget.test.tsx` (ya reescrito). Si aparecen otros archivos, actualizar los selectores a `getByTestId("pedal-bar-clt")` etc.

**Stop conditions Task 3:** si tests de otros widgets se rompen por cambios en `PedalsWidget` (no debería; el componente es autocontenido). Si el frame loop no es testable en jsdom y no se puede estabilizar, parar y consultar.

---

## Task 4: Integración appearance / style catalog / configs

**Files:**
- Modify: `frontend/src/hub/state/style-catalog.ts`
- Modify: `configs/example-racing.json`
- Modify: `frontend/src/hub/overlays/recommended-profiles.ts`

- [ ] **Step 1: Actualizar defaults de pedals en style-catalog.ts**

En `frontend/src/hub/state/style-catalog.ts`, reemplazar el bloque `pedals:` (líneas ~95-108) por:

```typescript
  pedals: [
    {
      id: "vantare-racing",
      name: "Vantare Racing",
      defaults: {
        accentColor: "#9b2226",
        textColor: "#FFFFFF",
        backgroundColor: "transparent",
        pedalThrottleColor: "#34d399",
        pedalBrakeColor: "#e63946",
        pedalClutchColor: "#3aa6c8",
      },
    },
  ],
```

- [ ] **Step 2: Actualizar position.w/h en configs/example-racing.json**

En `configs/example-racing.json`, widget `id: "pedals"`, cambiar:

```json
      "position": {
        "x": 690,
        "y": 980,
        "w": 90,
        "h": 100
      },
```

(Mantener `x`/`y` existentes; solo `w` 530→90 y `h` 80→100). Actualizar también `props.appearance.pedalThrottleColor` a `#34d399`, `pedalBrakeColor` a `#e63946`, `pedalClutchColor` a `#3aa6c8`, y `backgroundColor` a `"transparent"`.

- [ ] **Step 3: Actualizar position.w/h en recommended-profiles.ts**

En `frontend/src/hub/overlays/recommended-profiles.ts` línea ~62, cambiar el widget pedals:

```typescript
{ id: "pedals", type: "pedals", enabled: true, updateHz: 30, position: { x: 40, y: 760, w: 90, h: 100 } },
```

(Mantener `x`/`y`; solo `w` 180→90, `h` 220→100).

- [ ] **Step 4: Run tests**

Run: `pnpm --dir frontend test`
Expected: PASS. Si tests de `recommended-profiles` o `example-racing` validan tamaño exacto, actualizar las aserciones a 90x100.

- [ ] **Step 5: Run typecheck and build**

Run: `pnpm --dir frontend exec tsc -b`
Run: `pnpm --dir frontend build`
Expected: PASS ambos.

**Stop conditions Task 4:** si cambiar `backgroundColor` default a `"transparent"` rompe `resolveWidgetAppearance` (no debería; `WidgetAppearance.backgroundColor` es `string`). Si tests de perfiles recomendados validan el `530x80` o `180x220` y hay que actualizar muchos, parar y reportar el alcance extra.

---

## Task 5: Checks finales y documentación mínima

**Files:**
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Ejecutar todos los checks**

Run (en este orden, parar al primer fallo):
1. `pnpm --dir frontend test -- PedalsWidget`
2. `pnpm --dir frontend test -- pedals-format`
3. `pnpm --dir frontend test`
4. `pnpm --dir frontend exec tsc -b`
5. `pnpm --dir frontend build`
6. `pnpm --dir frontend lint`
7. `git diff --check`

Expected: todos PASS. `git diff --check` sin errores bloqueantes (warnings CRLF conocidos no bloqueantes).

- [ ] **Step 2: Actualizar docs/current-plan.md**

Añadir entrada bajo "Proximas tareas pequenas" / sección P:

```markdown
P3 - Pedals compact render ejecutado (2026-06-25):
- Worker: [modelo asignado].
- PedalsWidget rediseñado a 3 barras verticales (THR/BRK/CLT) segun mock V4.
- Eliminados: marcha, velocidad, volante fake, canvas histórico, BAKED_PANEL_BG, HISTORY_SIZE.
- Fondo transparente por defecto; track de barra #0a0a0a fijo.
- Helper puro pedals-format.ts con clamp 0..100 (undefined/NaN/Infinity/negativos/>100).
- Defaults del catálogo alineados a mock V4 (#34d399/#e63946/#3aa6c8).
- Tamaño base 90x100 en example-racing.json y recommended-profiles.ts.
- No se toco widget-base-size.ts, schema, backend, Ingeniero, Standings, Relative, Delta.
- Checks: [N] tests frontend, tsc, build, lint, git diff --check OK.
- Verificacion manual pendiente.
```

- [ ] **Step 3: No commit (salvo instruccion explicita)**

No hacer commit ni staging. Reportar estado para que el orquestador revise.

**Stop conditions Task 5:** si cualquier check falla. Si `lint` reporta warnings nuevos por el nuevo archivo, corregir antes de cerrar.

---

## Stop Conditions (globales)

- Si necesitas tocar archivos fuera de la lista "Toca".
- Si necesitas una dependencia nueva.
- Si necesitas cambiar `widget-base-size.ts`, schema, o backend.
- Si tests fallan por causa que no entiendes.
- Si encuentras cambios previos en git que chocan con esta tarea.
- Si el mock V4 fue editado y el contrato visual ya no coincide.
- Si `resolveWidgetAppearance` no acepta `backgroundColor: "transparent"` (verificar en Task 4 Step 1).

## Checks que debe exigir el plan

- `pnpm --dir frontend test -- PedalsWidget`
- `pnpm --dir frontend test -- pedals-format`
- `pnpm --dir frontend test`
- `pnpm --dir frontend exec tsc -b`
- `pnpm --dir frontend build`
- `pnpm --dir frontend lint`
- `git diff --check`

## Verificación manual (checklist)

1. [ ] Abrir `docs/p2-pedals-mock.html` en navegador y comparar con el widget real.
2. [ ] En Hub con modo mock: las 3 barras se animan (throttle ~78%, brake ~12%, clutch ~0%).
3. [ ] En Hub: el contenedor del widget no pinta fondo (transparente) sobre el checkerboard del sandbox.
4. [ ] Cambiar `appearance.backgroundColor` a `#1a0104` en WidgetStudio: el contenedor pinta el fondo.
5. [ ] Cambiar `pedalThrottleColor` en WidgetStudio: la barra thr cambia de color en vivo.
6. [ ] En LayoutStudio: arrastrar y redimensionar el widget pedals; las barras escalan sin desbordar.
7. [ ] Abrir overlay desktop: el widget se renderiza sin marcha/velocidad/volante/canvas.
8. [ ] Abrir overlay OBS (URL browser source): el widget se ve sobre el fondo del juego sin panel gris.
9. [ ] Cargar `configs/example-racing.json`: el widget pedals aparece en 90x100 (no 530x80).
10. [ ] Suministrar mock con throttle=200: la barra thr se clampa a 100% (no desborda).
11. [ ] Suministrar mock con brake=-50: la barra brk queda en 0% (no negativa).
12. [ ] Perfiles de usuario guardados con `position.w=530` siguen cargando (se ven grandes hasta redimensionar).

---

## Worker Prompt

```markdown
Actua como worker para Vantare Suite / Overlays Studio.

Tarea: P3 - Pedals compact render
Version objetivo: 0.5.3.X
Tipo: feature (rediseño de widget existente)
Modelo asignado: Kimi K2.7

Lee obligatoriamente:
- AGENTS.md
- docs/current-plan.md
- docs/roadmap-execution-board.md
- docs/pedals-inventory.md
- docs/superpowers/plans/2026-06-25-p3-pedals-compact-render.md (este plan)
- docs/p2-pedals-mock.html
- frontend/src/overlay/widgets/PedalsWidget.tsx
- frontend/src/overlay/widgets/PedalsWidget.test.tsx
- frontend/src/lib/dom-write.ts
- frontend/src/lib/frame-budget.ts
- frontend/src/overlay/widgets/use-widget-telemetry.ts
- frontend/src/overlay/widgets/widget-appearance.ts
- frontend/src/hub/state/style-catalog.ts
- frontend/src/overlay/widgets/widget-base-size.ts
- configs/example-racing.json
- frontend/src/hub/overlays/recommended-profiles.ts

Alcance:
- Rediseñar PedalsWidget a 3 barras verticales (clt/brk/thr) segun mock V4.
- Crear helper puro pedals-format.ts con clamp 0..100.
- Eliminar marcha, velocidad, volante fake, canvas histórico.
- Fondo transparente por defecto; track #0a0a0a fijo.
- Actualizar defaults del catálogo y configs a paleta mock V4 y tamaño 90x100.
- TDD: tests de helper + tests de render + tests de appearance.

No tocar:
- docs/p2-pedals-mock.html
- frontend/src/overlay/widgets/widget-base-size.ts
- frontend/src/overlay/widgets/TelemetryWidget.tsx
- frontend/src/overlay/widgets/TelemetryVerticalWidget.tsx
- frontend/src/lib/telemetry-ref.ts
- frontend/src/lib/dom-write.ts
- frontend/src/lib/frame-budget.ts
- frontend/src/hub/preview/WidgetRenderer.tsx
- frontend/src/overlay/CompositeApp.tsx
- frontend/src/overlay/ObsOverlayApp.tsx
- frontend/src/hub/preview/WidgetList.tsx
- frontend/src/overlay/widgets/widget-appearance.ts
- frontend/src/overlay/widgets/use-widget-telemetry.ts
- frontend/src/overlay/widgets/mock-telemetry.ts
- Cualquier Go/schema/backend/Ingeniero/Standings/Relative/Delta.

Requisitos:
- cambios pequeños;
- TDD;
- no dependencias nuevas;
- no commits ni staging salvo instruccion explicita;
- parar si aparece contradiccion o hace falta tocar mas scope.

Checks esperados:
- pnpm --dir frontend test -- PedalsWidget
- pnpm --dir frontend test -- pedals-format
- pnpm --dir frontend test
- pnpm --dir frontend exec tsc -b
- pnpm --dir frontend build
- pnpm --dir frontend lint
- git diff --check

Reporte final en espanol:
- archivos creados/modificados;
- checks ejecutados y resultado;
- checks no ejecutados y motivo;
- riesgos;
- verificacion manual pendiente.
```

---

## Reporte final (para entregar al orquestador)

- **Decisión visual recomendada:** Mock V4 broadcast minimal — 3 barras verticales (clt/brk/thr), fondo transparente, track `#0a0a0a`, sin labels ni % numérico. Tamaño base 90x100.
- **Archivos que tocaría la implementación:** `pedals-format.ts` (nuevo), `pedals-format.test.ts` (nuevo), `PedalsWidget.tsx` (reescribir), `PedalsWidget.test.tsx` (reescribir), `style-catalog.ts` (defaults), `example-racing.json` (tamaño), `recommended-profiles.ts` (tamaño), `docs/current-plan.md` (estado).
- **Archivos que NO tocaría:** `p2-pedals-mock.html`, `widget-base-size.ts`, `TelemetryWidget.tsx`, `TelemetryVerticalWidget.tsx`, `telemetry-ref.ts`, `dom-write.ts`, `frame-budget.ts`, `WidgetRenderer.tsx`, `CompositeApp.tsx`, `ObsOverlayApp.tsx`, `WidgetList.tsx`, `widget-appearance.ts`, `use-widget-telemetry.ts`, `mock-telemetry.ts`, todo Go/schema/backend/Ingeniero/Standings/Relative/Delta.
- **Riesgos:**
  1. Perfiles de usuario guardados con `530x80` se verán grandes hasta redimensionar (no se migran).
  2. Embrague no validado end-to-end con fixture LMU real (la barra CLT puede verse "muerta" si el dato viene siempre 0).
  3. Marcha/velocidad eliminadas del widget pedals — no se mueven a otro widget en este alcance (quedan en `TelemetryWidget` si el usuario las quiere).
  4. Test de frame timing en jsdom puede requerir fake timers (mitigado: clamp se valida en helper test).
  5. `backgroundColor: "transparent"` como default del catálogo es un cambio de paleta; perfiles existentes con `appearance.backgroundColor` explícito (`#1a0104`) siguen pintando el fondo viejo.
- **Checklist manual:** ver sección "Verificación manual" (12 puntos).
- **Path del plan:** `docs/superpowers/plans/2026-06-25-p3-pedals-compact-render.md`
- **¿Listo para que otro worker implemente?** Sí. El plan está dividido en 6 tareas (Task 0-5) con archivos permitidos/prohibidos, cambios exactos, tests TDD y stop conditions por tarea.