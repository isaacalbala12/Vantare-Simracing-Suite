# Resize proporcional para `relative` y `standings` (LayoutStudio + runtime compartido)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `relative` y `standings` se redimensionen como objetos visuales proporcionales en `LayoutStudio` y se rendericen idénticos en runtime/OBS, sin reflow, sin schema change.

**Architecture:** Introducir un `baseSize` determinista por tipo+variante (anchura intrínseca ya existente + nueva altura determinista) y un scaler uniforme (`transform: scale`) compartido entre `PreviewWidgetFrame` (LayoutStudio) y `WidgetHost` (runtime desktop/OBS). El gesto de resize pasa a ser proporcional usando el ratio dinámico `startW/startH` del gesto. `WidgetStudio` sandbox no se toca: sigue con preview intrínseca configurable vía `PreviewScaler` + `WidgetRenderer fillHost={false}`.

**Tech Stack:** React + TypeScript + Vitest + JSDOM + Tailwind. Go/Wails runtime hereda sin cambios porque solo se modifica el renderer frontend.

---

## Resumen de arquitectura

### Contrato
- `position.w/h` sigue siendo el **bounding box final** persistido (no schema change).
- El widget se renderiza a un **tamaño base** determinista (`baseWidth × baseHeight`) con `fillHost={false}` (modo intrínseco ya existente).
- Un **scaler uniforme** `scale = min(bbox.w / base.w, bbox.h / base.h)` aplica `transform: scale(scale)` con `transformOrigin: top left` para que el objeto encaje en el bounding box **conservando su forma** (como escalar una imagen/vector).
- El resize debe impedir que `position.w/h` quede deformado para `relative` y `standings`: el gesto de resize conserva el aspect ratio inicial del widget, de forma que el bounding box persistido siga siendo proporcional. El scaler no sustituye esta regla; la complementa.
- El gesto de resize es **proporcional**: la relación usada es `startRect.w / startRect.h` (dinámica, por gesto), no un `WIDGET_RATIOS` estático.

### Capas afectadas
- `widget-base-size.ts` (nuevo): cálculo determinista de `baseWidth/baseHeight` para `relative` y `standings`. Reutiliza `getRelativeIntrinsicWidth` / `getStandingsIntrinsicWidth` existentes.
- `canvas-math.ts`: `resizeWithRatio` pasa a ser proporcional para `relative`/`standings`.
- `PreviewWidgetFrame.tsx`: en modo layout (no sandbox), envuelve el `WidgetRenderer` con `fillHost={false}` + scaler uniforme.
- `WidgetHost.tsx`: aplica el mismo scaler para runtime desktop/OBS.
- `CompositeApp.tsx` / `ObsOverlayApp.tsx`: pasan el `profile` y `widget` a `WidgetHost` para que pueda derivar `baseSize` (cambio mínimo de props).

### Capas NO afectadas
- `WidgetSandboxPreview`, `PreviewScaler`, `widget-preview-size.ts`: siguen siendo la ruta intrínseca de `WidgetStudio`. **No se tocan.**
- `relative-format.ts`, `standings-format.ts`: ya exponen `intrinsicWidth`. No se modifican.
- Persistencia, schema, backend Go: sin cambios.

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `frontend/src/overlay/widgets/widget-base-size.ts` | Cálculo determinista `getWidgetBaseSize(type, widget, profile) -> {width, height}` para relative/standings. | Crear |
| `frontend/src/overlay/widgets/widget-base-size.test.ts` | Tests puros del helper. | Crear |
| `frontend/src/lib/canvas-math.ts` | `resizeWithRatio` proporcional para relative/standings. | Modificar |
| `frontend/src/lib/canvas-math.test.ts` | Tests de proporcionalidad. | Modificar |
| `frontend/src/hub/preview/PreviewWidgetFrame.tsx` | Scaler uniforme en modo layout. | Modificar |
| `frontend/src/hub/preview/PreviewWidgetFrame.test.tsx` | Tests de resize proporcional. | Modificar |
| `frontend/src/overlay/WidgetHost.tsx` | Scaler uniforme para runtime. | Modificar |
| `frontend/src/overlay/CompositeApp.tsx` | Pasar `profile`+`widget` a `WidgetHost`. | Modificar (mínimo) |
| `frontend/src/overlay/ObsOverlayApp.tsx` | Pasar `profile`+`widget` a `WidgetHost`. | Modificar (mínimo) |

---

## Archivos prohibidos

- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/preview/PreviewScaler.tsx`
- `frontend/src/hub/preview/widget-preview-size.ts`
- `frontend/src/overlay/widgets/relative-format.ts`
- `frontend/src/overlay/widgets/standings-format.ts`
- `frontend/src/overlay/widgets/RelativeWidget.tsx` (salvo revertir si el worker parte de HEAD; ver Tarea 0)
- `frontend/src/overlay/widgets/StandingsWidget.tsx` (idem)
- Cualquier archivo de persistencia, schema, backend Go, configs de build, dependencias.
- Cualquier archivo de A4/A5 (`recommended-profiles.ts`, `hub_service.go`, `OverlaysStudioPage.tsx`, `PreviewInspector.tsx`).

---

## Nuevos helpers/componentes propuestos

### `widget-base-size.ts` (nuevo)

Función pura determinista:

```ts
export type WidgetBaseSize = { width: number; height: number };

export function getWidgetBaseSize(
  type: string,
  widget: WidgetConfig,
  profile?: ProfileConfig | null,
): WidgetBaseSize | null;
```

- Devuelve `null` para tipos no soportados (delta, telemetry, pedals): el caller cae al camino legacy (fill, sin scaler).
- Para `relative`:
  - `width = getRelativeIntrinsicWidth(activeColumns)` (ya existe).
  - `height`:
    - `compact`: `getRelativeCompactHeight(rowCount)` (ya existe en `relative-format.ts:21`). `rowCount = rangeAhead + rangeBehind + (includePlayer ? 1 : 0)`.
    - `fill`: `RELATIVE_FILL_BASE_HEIGHT = 240` + `rows × RELATIVE_FILL_ROW_MIN = max(20, …)`. Para que sea determinista sin medir DOM, se define `RELATIVE_FILL_BASE_HEIGHT = 48` (header+class+footer+padding) + `(rangeAhead+rangeBehind+includePlayer?1:0) × 24` (fila mínima de 24). Constantes documentadas en el archivo.
- Para `standings`:
  - `width = getStandingsIntrinsicWidth(activeColumns)` (ya existe).
  - `height = STANDINGS_HEADER_HEIGHT + STANDINGS_CLASS_HEIGHT + (maxRows × STANDINGS_ROW_HEIGHT) + STANDINGS_FOOTER_HEIGHT`.
    - `STANDINGS_ROW_HEIGHT = 24` (constante ya usada en `StandingsWidget.tsx:169`).
    - `maxRows = (props?.maxRows as number) ?? 12` (ya en `StandingsWidget.tsx:117`).
    - Header/class/footer: constantes derivadas de los paddings Tailwind (`pt-4 pb-2` + `text-3xl` + `mb-1` + `text-[11px]`; `py-1`; `py-1 text-[8px]`). Se definen como constantes en el helper y se documentan con el origen. Valores iniciales: `STANDINGS_HEADER_HEIGHT = 56`, `STANDINGS_CLASS_HEIGHT = 24`, `STANDINGS_FOOTER_HEIGHT = 24`. El worker debe verificar visualmente y ajustar si la medición real difiere (ver checklist manual).

Estas constantes viven en `widget-base-size.ts` para que layout y runtime compartan el mismo cómputo.

---

## Cómo aplicar escala proporcional

### LayoutStudio / PreviewWidgetFrame

En `PreviewWidgetFrame.tsx`, el `WidgetRenderer` interno pasa a `fillHost={false}` y se envuelve en un div scaler cuando `getWidgetBaseSize` devuelva un tamaño (relative/standings). El frame exterior sigue midiendo `visualRect.w/h` (bounding box). El scaler:

```tsx
const baseSize = profile ? getWidgetBaseSize(widget.type, widget, profile) : null;
const scale = baseSize ? Math.min(visualRect.w / baseSize.width, visualRect.h / baseSize.height) : 1;
// render:
<div className="w-full h-full overflow-hidden">
  {baseSize ? (
    <div style={{ width: baseSize.width, height: baseSize.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <WidgetRenderer ... fillHost={false} />
    </div>
  ) : (
    <WidgetRenderer ... fillHost />
  )}
</div>
```

El `profile` ya se pasa opcional a `PreviewWidgetFrame`; `PreviewCanvas` lo propaga (verificar, si no, añadir).

### Runtime desktop / CompositeApp / WidgetHost

`WidgetHost.tsx` recibe `widget` y `profile` (nuevos props) y, si `getWidgetBaseSize` no es null, aplica el mismo scaler uniforme dentro de la caja `position.w/h`:

```tsx
const baseSize = getWidgetBaseSize(widget.type, widget, profile);
const scale = baseSize ? Math.min(position.w / baseSize.width, position.h / baseSize.height) : 1;
// render:
<div id={`widget-${id}`} className="absolute pointer-events-none" style={{ left, top, width: position.w, height: position.h, overflow: "hidden" }}>
  {baseSize ? (
    <div style={{ width: baseSize.width, height: baseSize.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      {children}
    </div>
  ) : children}
</div>
```

`CompositeApp.tsx` y `ObsOverlayApp.tsx` ya renderizan `<WidgetHost ...><Component .../></WidgetHost>`. Solo hay que pasar `widget={w}` y `profile={profile}` a `WidgetHost`.

### OBS / ObsOverlayApp

Mismo cambio que CompositeApp: pasar `widget` y `profile` a `WidgetHost`. El scaler es idéntico → OBS es pixel-idéntico a LayoutStudio.

---

## Cómo mantener intacto WidgetStudio sandbox

- `WidgetSandboxPreview` usa `PreviewScaler` + `WidgetRenderer fillHost={false}` + `resolveWidgetPreviewBaseSize` (que usa `intrinsicWidth`). **No se toca.**
- El nuevo `widget-base-size.ts` es independiente de `widget-preview-size.ts`: este último sigue siendo la fuente del sandbox; el nuevo es la fuente del scaler de layout/runtime.
- `__previewFillHost` sigue siendo runtime-only y no se persiste.
- Los tests de `WidgetSandboxPreview`, `WidgetRenderer fillHost={false}`, `relative-format`, `standings-format` deben seguir pasando sin modificación (regresión).

---

## Cómo debe funcionar el gesto de resize

- **Ratio dinámico por gesto:** al iniciar el resize, `aspect = startRect.w / startRect.h`.
- **Eje dominante:** `dominant = max(|deltaX|, |deltaY|)`. El eje con mayor desplazamiento manda; el otro escala para conservar `aspect`.
- **Fórmula recomendada (Tarea 1):**
  ```ts
  const dominant = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  const sign = Math.sign(deltaX) !== 0 ? Math.sign(deltaX) : Math.sign(deltaY);
  const newH = Math.max(MIN_SIZE.h, startH + sign * dominant);
  const newW = Math.max(MIN_SIZE.w, Math.round(newH * aspect));
  return { w: newW, h: newH };
  ```
  (Si `sign` es 0 porque no hay movimiento, no se llama a la función; el `if` de JSDOM ya lo cubre.)
- **Snap/clamp:** `snap(clamped.w)` y `snap(clamped.h)` siguen aplicándose en `PreviewWidgetFrame` (sin cambios).
- **Mínimos:** `WIDGET_MIN_SIZE = { w: 80, h: 40 }` (sin cambios).
- **No deformar:** como `newW = newH * aspect`, la relación se conserva en todo el gesto.
- **Tipos con ratio fijo legacy** (`delta`, `telemetry`, `telemetry-vertical`, `pedals`): siguen su rama `ratio != null` actual sin cambios.

---

## Tests unitarios requeridos (canvas-math, widget-base-size)

- `resizeWithRatio("relative", 300, 200, 100, 50)` → `w/h ≈ 300/200` (proporcional).
- `resizeWithRatio("relative", 300, 200, 0, -10)` → `w/h ≈ 300/200` (no colapsa ancho).
- `resizeWithRatio("relative", 100, 200, 0, 104)` → proporcional a `100/200` (no libre).
- `resizeWithRatio("standings", 400, 200, 800, 0)` → proporcional a `400/200` (no libre).
- `resizeWithRatio("delta", 400, 100, 0, 0)` → sin cambios (ratio 4 legacy).
- `getWidgetBaseSize("relative", …)` compact y fill: devuelve width = intrinsicWidth, height determinista.
- `getWidgetBaseSize("standings", …)` default y con maxRows custom: devuelve width = intrinsicWidth, height = header+class+rows+footer.
- `getWidgetBaseSize("delta", …)` → null.

---

## Tests React/JSDOM requeridos

- `PreviewWidgetFrame` con `relative` y `profile`: tras un gesto de resize, `onChangePosition` recibe un rect con `w/h` que conserva el aspecto inicial (`w/h ≈ startW/startH`).
- `PreviewWidgetFrame` con `relative` y `profile`: el `WidgetRenderer` interno recibe `fillHost={false}` (verificar clase `fit-content` en el renderer wrapper).
- `PreviewWidgetFrame` con `standings` y `profile`: idem proporcionalidad.
- `PreviewWidgetFrame` con `delta` (sin baseSize): sigue con `fillHost` default y resize por ratio legacy (regresión).
- `WidgetHost` con `relative` y `profile`: renderiza un wrapper con `transform: scale(...)` (verificar estilo inline).
- `WidgetHost` con `delta` (sin baseSize): renderiza children directos sin scaler (regresión).
- `WidgetSandboxPreview`: sin cambios (regresión: sigue intrínseco, sigue sin `PreviewWidgetFrame`).
- `WidgetRenderer fillHost={false}`: sigue produciendo `fit-content` (regresión PREVIEW2).

---

## Checks obligatorios

```powershell
pnpm --dir frontend test -- canvas-math widget-base-size PreviewWidgetFrame WidgetHost WidgetRenderer WidgetSandboxPreview RelativeWidget StandingsWidget
pnpm --dir frontend test
pnpm --dir frontend lint
pnpm --dir frontend build
git diff --check
go test ./...
```

---

## Orden exacto de tareas

> Nota sobre el working copy: hay cambios sin commit de A3/A4/A5 en archivos que **no** toca este plan salvo `canvas-math.ts`, `StandingsWidget.tsx`, `PreviewWidgetFrame.tsx` y sus tests. El plan corrige sobre lo existente:
> - `WIDGET_RATIOS.relative = null` se **mantiene** como flag "sin ratio fijo"; la nueva lógica de `resizeWithRatio` trata `relative`/`standings` por código.
> - Los tests de resize libre se **reescriben** para afirmar proporcionalidad.
> - El `w-full` condicional en `StandingsWidget` se **mantiene**: es correcto para modo fill (runtime sin baseSize cae ahí) y no se activa en modo layout (que usa `fillHost={false}` → `intrinsicOnly=true` → sin `w-full`).
> No se toca A4/A5.

---

### Task 0: Verificar estado de partida y aislar archivos

**Files:**
- Read: working tree (`git status --short`)

- [ ] **Step 1: Confirmar archivos afectados por este plan**

Run:
```bash
git status --short -- frontend/src/lib/canvas-math.ts frontend/src/lib/canvas-math.test.ts frontend/src/hub/preview/PreviewWidgetFrame.tsx frontend/src/hub/preview/PreviewWidgetFrame.test.tsx frontend/src/overlay/widgets/StandingsWidget.tsx
```
Expected: estos archivos aparecen como modificados (parte de A3). Los archivos de A4/A5 (`recommended-profiles.ts`, `hub_service.go`, `OverlaysStudioPage.tsx`, `PreviewInspector.tsx`) NO deben tocarse en este plan.

- [ ] **Step 2: Confirmar que NO hay que revertir StandingsWidget ni RelativeWidget**

Run:
```bash
git diff HEAD -- frontend/src/overlay/widgets/StandingsWidget.tsx
```
Expected: diff muestra `w-full` condicional (`!intrinsicOnly ? "w-full" : ""`). **Mantener este cambio**; es compatible con el nuevo contrato (modo fill sigue permitiendo `w-full`; modo layout usa `fillHost={false}`).

- [ ] **Step 3: No commit en este paso**

No se hace commit. Se trabaja sobre el working copy existente.

---

### Task 1: `resizeWithRatio` proporcional para relative/standings (canvas-math)

**Files:**
- Modify: `frontend/src/lib/canvas-math.ts:32-49`
- Test: `frontend/src/lib/canvas-math.test.ts:13-66`

- [ ] **Step 1: Reescribir tests para afirmar proporcionalidad (failing primero)**

Reemplazar el bloque `describe("resizeWithRatio", …)` en `canvas-math.test.ts:13-66` por:

```ts
  describe("resizeWithRatio", () => {
    it("relative resizes proportionally using start aspect (horizontal drag)", () => {
      const startW = 300;
      const startH = 200;
      const aspect = startW / startH;
      const result = resizeWithRatio("relative", startW, startH, 100, 0);
      // Eje dominante = 100 (X). newH = 200 + 100 = 300. newW = 300 * 1.5 = 450.
      expect(result.h).toBe(300);
      expect(result.w).toBe(450);
      expect(result.w / result.h).toBeCloseTo(aspect, 5);
    });

    it("relative resizes proportionally using start aspect (vertical drag)", () => {
      const startW = 100;
      const startH = 200;
      const aspect = startW / startH;
      const result = resizeWithRatio("relative", startW, startH, 0, 104);
      // Eje dominante = 104 (Y). newH = 200 + 104 = 304. newW = 304 * 0.5 = 152.
      expect(result.h).toBe(304);
      expect(result.w).toBe(152);
      expect(result.w / result.h).toBeCloseTo(aspect, 5);
    });

    it("relative does not collapse width when only height shrinks", () => {
      const startW = 300;
      const startH = 200;
      const aspect = startW / startH;
      const result = resizeWithRatio("relative", startW, startH, 0, -10);
      // Eje dominante = 10 (Y, abs). sign = -1. newH = 200 - 10 = 190. newW = 190 * 1.5 = 285.
      expect(result.h).toBe(190);
      expect(result.w).toBe(285);
      expect(result.w / result.h).toBeCloseTo(aspect, 5);
    });

    it("standings resizes proportionally using start aspect (horizontal expansion)", () => {
      const startW = 400;
      const startH = 200;
      const aspect = startW / startH;
      const result = resizeWithRatio("standings", startW, startH, 800, 0);
      // Eje dominante = 800 (X). newH = 200 + 800 = 1000. newW = 1000 * 2 = 2000.
      expect(result.h).toBe(1000);
      expect(result.w).toBe(2000);
      expect(result.w / result.h).toBeCloseTo(aspect, 5);
    });

    it("standings resizes proportionally when shrinking", () => {
      const startW = 400;
      const startH = 200;
      const aspect = startW / startH;
      const result = resizeWithRatio("standings", startW, startH, -200, -100);
      // Eje dominante = 200 (X). sign = -1. newH = 200 - 200 = 0 -> clamped a MIN 40. newW = 40 * 2 = 80.
      expect(result.h).toBe(40);
      expect(result.w).toBe(80);
    });

    it("maintains aspect ratio for ratio-locked widget types (delta)", () => {
      const result = resizeWithRatio("delta", 400, 100, 0, 0);
      expect(result.w).toBe(400);
      expect(result.h).toBe(100);
      expect(result.w / result.h).toBeCloseTo(4, 5);
    });

    it("respects minimum size for ratio-locked widgets", () => {
      const result = resizeWithRatio("delta", 400, 100, 0, -200);
      expect(result.h).toBe(40);
      expect(result.w).toBe(160);
    });

    it("respects minimum size for proportional widgets", () => {
      const result = resizeWithRatio("relative", 100, 100, -200, -200);
      expect(result.w).toBe(80);
      expect(result.h).toBe(40);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --dir frontend test -- canvas-math
```
Expected: FAIL (la implementación actual devuelve resize libre para relative/standings).

- [ ] **Step 3: Implementar `resizeWithRatio` proporcional**

Reemplazar `canvas-math.ts:32-49` por:

```ts
const PROPORTIONAL_TYPES = new Set(["relative", "standings"]);

export function resizeWithRatio(
  type: string,
  startW: number,
  startH: number,
  deltaX: number,
  deltaY: number,
): { w: number; h: number } {
  const ratio = WIDGET_RATIOS[type] ?? null;
  if (ratio != null) {
    const h = Math.max(WIDGET_MIN_SIZE.h, startH + deltaY);
    const w = Math.max(WIDGET_MIN_SIZE.w, Math.round(h * ratio));
    return { w, h };
  }
  if (PROPORTIONAL_TYPES.has(type)) {
    const aspect = startH > 0 ? startW / startH : 1;
    const dominant = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const sign = Math.sign(deltaX) !== 0 ? Math.sign(deltaX) : Math.sign(deltaY);
    const h = Math.max(WIDGET_MIN_SIZE.h, startH + sign * dominant);
    const w = Math.max(WIDGET_MIN_SIZE.w, Math.round(h * aspect));
    return { w, h };
  }
  return {
    w: Math.max(WIDGET_MIN_SIZE.w, startW + deltaX),
    h: Math.max(WIDGET_MIN_SIZE.h, startH + deltaY),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm --dir frontend test -- canvas-math
```
Expected: PASS.

- [ ] **Step 5: No hacer commit**

No hacer `git add`, commit, push ni tag. El orquestador cerrará el conjunto completo tras review y verificación manual.

---

### Task 2: Helper `getWidgetBaseSize` (widget-base-size.ts)

**Files:**
- Create: `frontend/src/overlay/widgets/widget-base-size.ts`
- Test: `frontend/src/overlay/widgets/widget-base-size.test.ts`

- [ ] **Step 1: Escribir tests failing**

Crear `frontend/src/overlay/widgets/widget-base-size.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getWidgetBaseSize } from "./widget-base-size";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { createDefaultRelativeColumns } from "./relative-catalog";
import { createDefaultStandingsColumns } from "./standings-catalog";

function relativeWidget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "rel",
    type: "relative",
    enabled: true,
    updateHz: 15,
    position: { x: 0, y: 0, w: 300, h: 200 },
    ...overrides,
  };
}

function standingsWidget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "st",
    type: "standings",
    enabled: true,
    updateHz: 15,
    position: { x: 0, y: 0, w: 400, h: 300 },
    ...overrides,
  };
}

function profileWith(widget: WidgetConfig): ProfileConfig {
  return {
    id: "p",
    name: "P",
    displayMode: "racing",
    monitorIndex: 0,
    widgets: [widget],
  };
}

describe("getWidgetBaseSize", () => {
  it("returns null for unsupported widget types", () => {
    const widget: WidgetConfig = { id: "d", type: "delta", enabled: true, updateHz: 30, position: { x: 0, y: 0, w: 400, h: 48 } };
    expect(getWidgetBaseSize("delta", widget, profileWith(widget))).toBeNull();
  });

  it("computes base size for relative compact using intrinsic width and compact height", () => {
    const widget = relativeWidget();
    const profile = profileWith(widget);
    const size = getWidgetBaseSize("relative", widget, profile);
    expect(size).not.toBeNull();
    // width = sum of default column widths + padding
    expect(size!.width).toBeGreaterThan(0);
    // compact: header + (rangeAhead+rangeBehind+includePlayer) * rowHeight
    // defaults: rangeAhead=3, rangeBehind=3, includePlayer=true => 7 rows
    expect(size!.height).toBeGreaterThan(100);
  });

  it("computes base size for relative fill", () => {
    const widget = relativeWidget();
    const profile = profileWith(widget);
    // Forzar fill via props legacy (sin variant filters)
    const widgetFill = { ...widget, props: { rowHeightMode: "fill" } };
    const size = getWidgetBaseSize("relative", widgetFill, profile);
    expect(size).not.toBeNull();
    expect(size!.width).toBeGreaterThan(0);
    expect(size!.height).toBeGreaterThan(50);
  });

  it("computes base size for standings with default maxRows", () => {
    const widget = standingsWidget();
    const profile = profileWith(widget);
    const size = getWidgetBaseSize("standings", widget, profile);
    expect(size).not.toBeNull();
    expect(size!.width).toBeGreaterThan(0);
    // maxRows default 12; height = header + class + 12*row + footer
    expect(size!.height).toBeGreaterThan(300);
  });

  it("computes base size for standings with custom maxRows", () => {
    const widget = standingsWidget({ props: { maxRows: 5 } });
    const profile = profileWith(widget);
    const size = getWidgetBaseSize("standings", widget, profile);
    expect(size).not.toBeNull();
    // 5 rows vs 12 rows => menor altura
    const defaultSize = getWidgetBaseSize("standings", standingsWidget(), profileWith(standingsWidget()));
    expect(size!.height).toBeLessThan(defaultSize!.height);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --dir frontend test -- widget-base-size
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implementar `getWidgetBaseSize`**

Crear `frontend/src/overlay/widgets/widget-base-size.ts`:

```ts
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { enrichWidgetPropsWithVariant } from "../../lib/widget-variants";
import { getRelativeIntrinsicWidth, getRelativeCompactHeight } from "./relative-format";
import { getStandingsIntrinsicWidth } from "./standings-format";
import { getRelativeFilters } from "./relative-filters";
import { createDefaultRelativeColumns } from "./relative-catalog";
import { createDefaultStandingsColumns, getStandingsColumn } from "./standings-catalog";
import type { ColumnConfig } from "../../lib/profile";

export type WidgetBaseSize = { width: number; height: number };

// Alturas deterministas para standings (derivadas de los paddings Tailwind del widget).
// header: pt-4 (16) + pb-2 (8) + text-3xl (~30) + mb-1 (4) + text-[11px] (~16) = ~74 -> 76 aprox
export const STANDINGS_HEADER_HEIGHT = 76;
// class: py-1 (8) + text-[11px] (~16) = 24
export const STANDINGS_CLASS_HEIGHT = 24;
export const STANDINGS_ROW_HEIGHT = 24;
// footer: mt-1 (4) + py-1 (8) + text-[8px] (~12) + border (2) = 26
export const STANDINGS_FOOTER_HEIGHT = 26;
export const STANDINGS_DEFAULT_MAX_ROWS = 12;

// Relative fill: header (pt-2+pb-1+text-xl+mb-0.5 = ~40) + class (py-1+text-[10px] = ~24) + footer/padding (~8)
export const RELATIVE_FILL_HEADER_HEIGHT = 40;
export const RELATIVE_FILL_CLASS_HEIGHT = 24;
export const RELATIVE_FILL_FOOTER_PADDING = 8;
export const RELATIVE_FILL_ROW_MIN = 24;

function getActiveRelativeColumns(props?: Record<string, unknown>): ColumnConfig[] {
  const variant = props?.variant as { columns?: ColumnConfig[] } | undefined;
  const sourceColumns = variant?.columns?.length ? variant.columns : createDefaultRelativeColumns();
  return sourceColumns.filter((column) => column.enabled);
}

function getActiveStandingsColumns(props?: Record<string, unknown>): ColumnConfig[] {
  const variant = props?.variant as { columns?: ColumnConfig[] } | undefined;
  const sourceColumns = variant?.columns?.length ? variant.columns : createDefaultStandingsColumns();
  return sourceColumns.filter((column) => column.enabled && getStandingsColumn(column.id));
}

export function getWidgetBaseSize(
  type: string,
  widget: WidgetConfig,
  profile?: ProfileConfig | null,
): WidgetBaseSize | null {
  if (type !== "relative" && type !== "standings") {
    return null;
  }

  const props = profile ? enrichWidgetPropsWithVariant(profile, widget) : widget.props;

  if (type === "relative") {
    const columns = getActiveRelativeColumns(props);
    if (columns.length === 0) return null;
    const width = getRelativeIntrinsicWidth(columns);
    const filters = getRelativeFilters(
      (props?.variant as { filters?: Record<string, unknown> } | undefined)?.filters,
      props,
    );
    const rowCount = filters.rangeAhead + filters.rangeBehind + (filters.includePlayer ? 1 : 0);
    let height: number;
    if (filters.rowHeightMode === "compact") {
      height = getRelativeCompactHeight(rowCount);
    } else {
      height = RELATIVE_FILL_HEADER_HEIGHT + RELATIVE_FILL_CLASS_HEIGHT + RELATIVE_FILL_FOOTER_PADDING + rowCount * RELATIVE_FILL_ROW_MIN;
    }
    return { width, height };
  }

  // standings
  const columns = getActiveStandingsColumns(props);
  if (columns.length === 0) return null;
  const width = getStandingsIntrinsicWidth(columns);
  const maxRows = typeof props?.maxRows === "number" && Number.isFinite(props.maxRows)
    ? Math.max(1, Math.round(props.maxRows))
    : STANDINGS_DEFAULT_MAX_ROWS;
  const height = STANDINGS_HEADER_HEIGHT + STANDINGS_CLASS_HEIGHT + maxRows * STANDINGS_ROW_HEIGHT + STANDINGS_FOOTER_HEIGHT;
  return { width, height };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm --dir frontend test -- widget-base-size
```
Expected: PASS.

- [ ] **Step 5: No hacer commit**

No hacer `git add`, commit, push ni tag. El orquestador cerrará el conjunto completo tras review y verificación manual.

---

### Task 3: Scaler uniforme en `PreviewWidgetFrame` (LayoutStudio)

**Files:**
- Modify: `frontend/src/hub/preview/PreviewWidgetFrame.tsx:108-120`
- Test: `frontend/src/hub/preview/PreviewWidgetFrame.test.tsx:59-174`

- [ ] **Step 1: Reescribir tests de resize para afirmar proporcionalidad y scaler**

Reemplazar el bloque `describe("PreviewWidgetFrame resize behavior", …)` (`PreviewWidgetFrame.test.tsx:59-174`) por:

```ts
describe("PreviewWidgetFrame resize behavior", () => {
  afterEach(() => {
    cleanup();
  });

  function profileWith(widget: WidgetConfig): ProfileConfig {
    return { id: "p", name: "P", displayMode: "racing", monitorIndex: 0, widgets: [widget] };
  }

  it("relative resize is proportional when profile is provided", () => {
    const onChangePosition = vi.fn();
    const widget = makeWidget({
      id: "rel",
      type: "relative",
      position: { x: 0, y: 0, w: 300, h: 200 },
    });
    render(
      <PreviewWidgetFrame
        widget={widget}
        profile={profileWith(widget)}
        selected={true}
        scale={1}
        onSelect={vi.fn()}
        onChangePosition={onChangePosition}
      />,
    );

    const handle = screen.getByTestId("resize-handle-rel");
    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 100, clientY: 0 });
    fireEvent.mouseUp(window);

    expect(onChangePosition).toHaveBeenCalledTimes(1);
    const rect = onChangePosition.mock.lastCall?.[1] as Rect;
    // aspect inicial 300/200 = 1.5; eje dominante 100 (X) => h=300, w=450
    // snap(grid 8) puede introducir una pequeña desviación de grid: snap(300)=304, snap(450)=448.
    // 448/304 = 1.4736 ≈ 1.5 dentro de la tolerancia de snap (1 decimal = 0.05).
    expect(rect.h).toBe(304);
    expect(rect.w / rect.h).toBeCloseTo(1.5, 1);
  });

  it("standings resize is proportional when profile is provided", () => {
    const onChangePosition = vi.fn();
    const widget = makeWidget({
      id: "st",
      type: "standings",
      position: { x: 0, y: 0, w: 400, h: 200 },
    });
    render(
      <PreviewWidgetFrame
        widget={widget}
        profile={profileWith(widget)}
        selected={true}
        scale={1}
        onSelect={vi.fn()}
        onChangePosition={onChangePosition}
      />,
    );

    const handle = screen.getByTestId("resize-handle-st");
    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 0, clientY: 100 });
    fireEvent.mouseUp(window);

    expect(onChangePosition).toHaveBeenCalledTimes(1);
    const rect = onChangePosition.mock.lastCall?.[1] as Rect;
    // aspect inicial 400/200 = 2; eje dominante 100 (Y) => h=300, w=600
    // snap(grid 8): snap(300)=304, snap(600)=600. 600/304 = 1.9737 ≈ 2.
    expect(rect.h).toBe(304);
    expect(rect.w / rect.h).toBeCloseTo(2, 1);
  });

  it("delta keeps legacy ratio resize when no profile base size", () => {
    const onChangePosition = vi.fn();
    render(
      <PreviewWidgetFrame
        widget={makeWidget({ id: "delta", type: "delta", position: { x: 0, y: 0, w: 400, h: 100 } })}
        selected={true}
        scale={1}
        onSelect={vi.fn()}
        onChangePosition={onChangePosition}
      />,
    );

    const handle = screen.getByTestId("resize-handle-delta");
    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 0, clientY: 50 });
    fireEvent.mouseUp(window);

    expect(onChangePosition).toHaveBeenCalledTimes(1);
    const rect = onChangePosition.mock.lastCall?.[1] as Rect;
    // delta ratio 4: h=150 => w=600
    expect(rect.h).toBe(152); // snap(150)
    expect(rect.w).toBe(608); // snap(600)
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --dir frontend test -- PreviewWidgetFrame
```
Expected: FAIL (el renderer actual no escala; los asserts de proporcionalidad fallan por el snap exacto puede variar, pero la proporcionalidad sí debe pasar tras el fix).

- [ ] **Step 3: Implementar scaler en `PreviewWidgetFrame`**

En `PreviewWidgetFrame.tsx`, añadir import y modificar el bloque de render (`:108-120`):

Añadir import al principio:
```ts
import { getWidgetBaseSize } from "../../overlay/widgets/widget-base-size";
```

Reemplazar el bloque de render del `WidgetRenderer` (`PreviewWidgetFrame.tsx:108-120`) por:

```tsx
      <div
        className={`w-full h-full overflow-hidden ${widget.enabled ? "" : "opacity-45 grayscale"}`}
        style={{ pointerEvents: "none" }}
      >
        {(() => {
          const baseSize = getWidgetBaseSize(widget.type, widget, profile);
          if (!baseSize) {
            return (
              <WidgetRenderer
                profile={profile}
                widget={widget}
                editMode
                telemetryMode="mock"
                updateHz={widget.updateHz}
                disabled
              />
            );
          }
          const scale = Math.min(visualRect.w / baseSize.width, visualRect.h / baseSize.height);
          return (
            <div
              data-testid={`widget-scaler-${widget.id}`}
              style={{
                width: baseSize.width,
                height: baseSize.height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <WidgetRenderer
                profile={profile}
                widget={widget}
                editMode
                telemetryMode="mock"
                updateHz={widget.updateHz}
                disabled
                fillHost={false}
              />
            </div>
          );
        })()}
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm --dir frontend test -- PreviewWidgetFrame
```
Expected: PASS.

- [ ] **Step 5: No hacer commit**

No hacer `git add`, commit, push ni tag. El orquestador cerrará el conjunto completo tras review y verificación manual.

---

### Task 4: Scaler uniforme en `WidgetHost` (runtime desktop + OBS)

**Files:**
- Modify: `frontend/src/overlay/WidgetHost.tsx`
- Modify: `frontend/src/overlay/CompositeApp.tsx:112-114`
- Modify: `frontend/src/overlay/ObsOverlayApp.tsx:134-136`
- Test: crear `frontend/src/overlay/WidgetHost.test.tsx`

- [ ] **Step 1: Escribir test failing para WidgetHost**

Crear `frontend/src/overlay/WidgetHost.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../lib/profile";
import { WidgetHost } from "./WidgetHost";

afterEach(() => cleanup());

function widget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "rel",
    type: "relative",
    enabled: true,
    updateHz: 15,
    position: { x: 10, y: 20, w: 300, h: 200 },
    ...overrides,
  };
}

function profileWith(widget: WidgetConfig): ProfileConfig {
  return { id: "p", name: "P", displayMode: "racing", monitorIndex: 0, widgets: [widget] };
}

describe("WidgetHost", () => {
  it("renders children directly for unsupported widget types (no scaler)", () => {
    const w = widget({ id: "d", type: "delta" });
    render(
      <WidgetHost id="d" position={{ x: 10, y: 20, w: 400, h: 48 }} widget={w} profile={profileWith(w)}>
        <div data-testid="child" />
      </WidgetHost>,
    );
    expect(screen.queryByTestId("widget-host-scaler")).toBeNull();
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("wraps relative children with a transform scale wrapper", () => {
    const w = widget();
    render(
      <WidgetHost id="rel" position={w.position} widget={w} profile={profileWith(w)}>
        <div data-testid="child" />
      </WidgetHost>,
    );
    const scaler = screen.getByTestId("widget-host-scaler");
    expect(scaler).toBeTruthy();
    const style = scaler.style;
    expect(style.transform).toContain("scale(");
    expect(style.transformOrigin).toBe("top left");
  });

  it("wraps standings children with a transform scale wrapper", () => {
    const w = widget({ id: "st", type: "standings" });
    render(
      <WidgetHost id="st" position={w.position} widget={w} profile={profileWith(w)}>
        <div data-testid="child" />
      </WidgetHost>,
    );
    expect(screen.getByTestId("widget-host-scaler")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --dir frontend test -- WidgetHost
```
Expected: FAIL (props `widget`/`profile` no existen aún; `widget-host-scaler` no se renderiza).

- [ ] **Step 3: Implementar scaler en `WidgetHost`**

Reemplazar `frontend/src/overlay/WidgetHost.tsx` completo por:

```tsx
import { type ReactNode } from "react";
import type { ProfileConfig, Rect, WidgetConfig } from "../lib/profile";
import { getWidgetBaseSize } from "./widgets/widget-base-size";

type WidgetHostProps = {
  id: string;
  position: Rect; // window-local coordinates
  widget?: WidgetConfig;
  profile?: ProfileConfig | null;
  children: ReactNode;
};

export function WidgetHost({ id, position, widget, profile, children }: WidgetHostProps) {
  const baseSize = widget && profile ? getWidgetBaseSize(widget.type, widget, profile) : null;
  const scale = baseSize
    ? Math.min(position.w / baseSize.width, position.h / baseSize.height)
    : 1;

  return (
    <div
      id={`widget-${id}`}
      className="absolute pointer-events-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.w}px`,
        height: `${position.h}px`,
        overflow: "hidden",
      }}
    >
      {baseSize ? (
        <div
          data-testid="widget-host-scaler"
          style={{
            width: baseSize.width,
            height: baseSize.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
```

- [ ] **Step 4: Actualizar `CompositeApp.tsx` para pasar props**

Modificar `frontend/src/overlay/CompositeApp.tsx:112-114`:

```tsx
          <WidgetHost key={w.id} id={w.id} position={localPos} widget={w} profile={profile}>
            <Component editMode={false} telemetryMode="live" updateHz={w.updateHz} props={enrichWidgetPropsWithVariant(profile, w)} />
          </WidgetHost>
```

- [ ] **Step 5: Actualizar `ObsOverlayApp.tsx` para pasar props**

Modificar `frontend/src/overlay/ObsOverlayApp.tsx:134-136` de forma análoga (añadir `widget={w} profile={profile}`):

```tsx
          <WidgetHost key={w.id} id={w.id} position={localPos} widget={w} profile={profile}>
            <Component editMode={false} telemetryMode="live" updateHz={w.updateHz} props={enrichWidgetPropsWithVariant(profile, w)} />
          </WidgetHost>
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
pnpm --dir frontend test -- WidgetHost
```
Expected: PASS.

- [ ] **Step 7: Run regression tests for CompositeApp**

Run:
```bash
pnpm --dir frontend test -- CompositeApp
```
Expected: PASS (sin regresión en runtime desktop).

- [ ] **Step 8: No hacer commit**

No hacer `git add`, commit, push ni tag. El orquestador cerrará el conjunto completo tras review y verificación manual.

---

### Task 5: Verificación completa y regresión

**Files:**
- Read: tests existentes

- [ ] **Step 1: Suite focal de widgets y preview**

Run:
```bash
pnpm --dir frontend test -- canvas-math widget-base-size PreviewWidgetFrame WidgetHost WidgetRenderer WidgetSandboxPreview RelativeWidget StandingsWidget relative-format standings-format PreviewScaler
```
Expected: PASS.

- [ ] **Step 2: Suite completa frontend**

Run:
```bash
pnpm --dir frontend test
```
Expected: PASS (todos los tests verdes; cuenta debe mantenerse o crecer).

- [ ] **Step 3: Lint**

Run:
```bash
pnpm --dir frontend lint
```
Expected: sin errores bloqueantes.

- [ ] **Step 4: Build**

Run:
```bash
pnpm --dir frontend build
```
Expected: OK.

- [ ] **Step 5: Go tests (regresión backend)**

Run:
```bash
go test ./...
```
Expected: PASS.

- [ ] **Step 6: git diff --check**

Run:
```bash
git diff --check
```
Expected: sin errores bloqueantes (warnings CRLF conocidos OK).

- [ ] **Step 7: No commit en este paso si todo pasa**

Si todo pasa, el plan está completo. El commit final lo decide el orquestador tras verificación manual.

---

## Checklist manual post-fix

1. Reconstruir y abrir la app.
2. `Overlays Studio → LayoutStudio`, seleccionar `relative`:
   - Arrastrar handle **horizontal**: el widget crece proporcional, las filas **no se estiran**, header y espacios conservan forma.
   - Arrastrar **vertical**: crece proporcional, no aparecen filas extra ni huecos.
   - Arrastrar en diagonal: mantiene relación.
3. Seleccionar `standings`: idem. Header VANTARE, class bar y footer escalan juntos, no se ensanchan independientes.
4. Guardar, recargar perfil: `position.w/h` persisten; el widget se ve igual.
5. Abrir overlay runtime (desktop): el widget se ve **idéntico** a LayoutStudio (mismo scaler, misma forma).
6. Abrir overlay OBS: idéntico a LayoutStudio y a runtime desktop.
7. `WidgetStudio` (PREVIEW2): `relative` y `standings` siguen con ancho intrínseco, sin espacio vacío derecho, centrados. **Sin regresión.**
8. Mini-previews de perfiles (`Mis perfiles`): el widget se ve escalado, no refloweado.
9. Otros widgets (`delta`, `telemetry`, `telemetry-vertical`, `pedals`): resize sigue funcionando con su ratio legacy, sin regresión visual.
10. Si las alturas deterministas de header/footer no coinciden con la realidad visual (objeto recortado o con hueco dentro del bbox), ajustar las constantes en `widget-base-size.ts` (`STANDINGS_HEADER_HEIGHT`, etc.) y volver a verificar. Es lo único que puede requerir retoque manual.

---

## Stop conditions

- Si el fix necesita tocar más archivos de los listados en "File Structure" → parar.
- Si `getWidgetBaseSize` no puede ser determinista para `relative`/`standings` sin medir DOM → parar; reconsiderar base = `position` al momento de creación.
- Si los tests de `WidgetSandboxPreview`/`WidgetRenderer fillHost={false}` se rompen → parar; el fix no debe tocar la ruta sandbox.
- Si `git status` mezcla este cambio con A4/A5 → no mergear; trabajar solo sobre los archivos de resize.
- Si runtime no coincide con LayoutStudio tras el scaler (diferencia visible > tolerancia alpha) → revisar constantes de altura en `widget-base-size.ts`.
- Si aparece necesidad de schema change → parar; el contrato dice no schema change.

---

## Riesgos principales y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Constantes de altura header/footer no coinciden con la realidad Tailwind | Checklist manual paso 10: ajustar constantes en `widget-base-size.ts` y re-verificar. Son las únicas que pueden necesitar retoque. |
| `relative` fill con muchas filas produce baseHeight muy grande → scaler muy pequeño | Aceptable para alpha; el objeto conserva forma. Futuro: limitar `rowCount` al rango configurado (ya lo hace `getRelativeFilters`). |
| Scaler uniforme deja hueco dentro del bounding box si el bbox no tiene el aspecto del base | Aceptable por contrato ("uniforme + fit"). El objeto conserva forma; el bbox es el área disponible. |
| `ProfilePreview` hereda el scaler y puede mostrar contenido muy pequeño | Verificar en checklist (paso 8). Si es ilegible, añadir `min-scale` en `ProfilePreview` (fuera de este plan; follow-up). |
| Widgets no configurables sin baseSize caen al camino legacy y pueden parecer inconsistentes | Por contrato: otros widgets pueden quedarse legacy. Solo relative/standings en este corte. |
| Cambios de A4/A5 en working copy pueden mezclarse con este fix | El plan no toca archivos de A4/A5. El worker no debe hacer staging ni commits; el orquestador cerrará el conjunto completo tras review/manual. |

---

## Criterios de aceptación

- `relative` y `standings` no reflowean en `LayoutStudio` durante el resize.
- El gesto de resize conserva la relación `startW/startH` para relative/standings.
- Runtime desktop y OBS renderizan relative/standings idénticos a LayoutStudio (mismo scaler, misma forma).
- `WidgetStudio` sandbox sin regresión (intrinsic width, sin espacio vacío derecho).
- `position.w/h` sigue siendo el único tamaño persistido (no schema change).
- Suite frontend completa verde; lint y build OK; Go tests OK; `git diff --check` sin errores bloqueantes.
- Verificación manual aprobada por el usuario.

---

## Prompt final listo para pasar a un worker de implementación

```markdown
Actúa como worker para Vantare Overlays Studio.

Tarea: Resize proporcional para `relative` y `standings` (LayoutStudio + runtime compartido)
Version objetivo: próxima versión funcional (sin bump hasta verificación manual)
Tipo: bugfix de contrato + feature de render
Lee obligatoriamente:
- AGENTS.md
- docs/current-plan.md
- docs/roadmap-execution-board.md
- docs/widget-preview-bug-log.md
- docs/resolved-bugs.md
- docs/feature-architecture-map.md
- docs/superpowers/plans/2026-06-25-resize-proporcional-relative-standings.md (este plan)

Alcance (limitado a relative y standings):
- Introducir `getWidgetBaseSize` determinista en `frontend/src/overlay/widgets/widget-base-size.ts`.
- Hacer `resizeWithRatio` proporcional para relative/standings en `frontend/src/lib/canvas-math.ts`.
- Aplicar scaler uniforme en `frontend/src/hub/preview/PreviewWidgetFrame.tsx` (LayoutStudio).
- Aplicar scaler uniforme en `frontend/src/overlay/WidgetHost.tsx` (runtime desktop + OBS).
- Pasar `widget` y `profile` a `WidgetHost` desde `CompositeApp.tsx` y `ObsOverlayApp.tsx`.

No tocar:
- WidgetSandboxPreview, PreviewScaler, widget-preview-size.ts (ruta sandbox de WidgetStudio).
- relative-format.ts, standings-format.ts, RelativeWidget.tsx, StandingsWidget.tsx (salvo verificación; el w-full condicional actual se mantiene).
- Cualquier archivo de A4/A5 (recommended-profiles, hub_service, OverlaysStudioPage, PreviewInspector).
- Persistencia, schema, backend Go, configs de build, dependencias.

Requisitos:
- Sigue el plan tarea por tarea con TDD (test failing → implementación → test passing).
- Cambios pequeños y reversibles.
- No dependencias nuevas.
- No hagas `git add`, commit, push ni tag.
- Si una constante de altura determinista no coincide con la realidad visual, ajústala en widget-base-size.ts y documenta el origen del valor.

Decisiones de diseño aprobadas:
- Scaler uniforme + fit: scale = min(bbox.w/base.w, bbox.h/base.h), transformOrigin top left.
- baseSize derivado determinista (sin medir DOM): width = intrinsicWidth existente; height = constantes derivadas de paddings Tailwind + rows × rowHeight.
- Gesto de resize proporcional: ratio dinámico startW/startH; eje dominante; signo del eje dominante.
- El scaler no debe usarse para aceptar bounding boxes deformados: `position.w/h` para relative/standings debe conservar ratio durante el resize.
- Corregir sobre el working copy existente: mantener WIDGET_RATIOS.relative=null como flag; reescribir tests de resize libre; mantener w-full condicional en StandingsWidget.

Checks esperados:
- pnpm --dir frontend test -- canvas-math widget-base-size PreviewWidgetFrame WidgetHost WidgetRenderer WidgetSandboxPreview RelativeWidget StandingsWidget
- pnpm --dir frontend test
- pnpm --dir frontend lint
- pnpm --dir frontend build
- git diff --check
- go test ./...

Stop conditions:
- Si necesitas tocar más archivos de los listados → parar.
- Si getWidgetBaseSize no puede ser determinista sin medir DOM → parar.
- Si los tests de WidgetSandboxPreview/WidgetRenderer fillHost={false} se rompen → parar.
- Si aparece necesidad de schema change → parar.
- Si hay contradicción con docs → parar y pedir aclaración.

Reporte final en español:
- Archivos creados/modificados.
- Tests/checks ejecutados y resultado.
- Checks no ejecutados y motivo.
- Riesgos restantes.
- Verificación manual recomendada (usar la checklist del plan).
```

---

## Follow-up final: ajuste de baseSize y baseAspect

> Sección añadida tras la validación manual del contrato proporcional. El contrato general implementado en las tareas 0–5 sigue vigente; este follow-up corrige dos detalles visuales detectados por el usuario sin reabrir el diseño.

### Estado del follow-up

Pendiente de implementación. Es la última pieza antes de cerrar el contrato proporcional y marcar A3 como Done.

### 1. Decisión aprobada

- **Aplicar Fix A** (constantes de altura de `standings` en `widget-base-size.ts`).
- **Aplicar Fix B1** (durante resize, usar `baseAspect` derivado de `baseSize`, no `startW/startH`).
- **NO aplicar B2** por ahora:
  - no normalizar widgets al cargar;
  - no mutar `position` en memoria;
  - no tocar persistencia;
  - no cambiar schema.

### 2. Motivo

- **Fix A** corrige el clipping de `standings`: las constantes actuales subestiman header, márgenes (`mt-1`) y borde del panel en ~9-13px, lo que con `transformOrigin: top left` + `overflow: hidden` corta el contenido por abajo.
- **Fix B1** hace que el gesto de resize converja al aspect real del overlay (`base.w/base.h`) en vez de conservar el aspect del bbox actual (que puede estar deformado). Cierra el hueco entre frame/handle y el objeto visual durante el resize. Para perfiles legacy deformados, el primer resize los corrige.
- **B2 se evita** para no cambiar perfiles en reposo ni mutar posiciones al cargar. Cualquier normalización al cargar implicaría alterar la disposición visual de perfiles existentes sin guardado explícito del usuario, lo cual queda fuera de este follow-up y se deja como decisión futura.

### 3. Archivos permitidos

- `frontend/src/overlay/widgets/widget-base-size.ts`
- `frontend/src/overlay/widgets/widget-base-size.test.ts`
- `frontend/src/lib/canvas-math.ts`
- `frontend/src/lib/canvas-math.test.ts`
- `frontend/src/hub/preview/PreviewWidgetFrame.tsx`
- `frontend/src/hub/preview/PreviewWidgetFrame.test.tsx`

### 4. Archivos prohibidos

- `frontend/src/overlay/WidgetHost.tsx`
- `frontend/src/overlay/CompositeApp.tsx`
- `frontend/src/overlay/ObsOverlayApp.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/preview/PreviewScaler.tsx`
- `frontend/src/hub/preview/widget-preview-size.ts`
- `frontend/src/overlay/widgets/RelativeWidget.tsx`
- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- `frontend/src/overlay/widgets/relative-format.ts`
- `frontend/src/overlay/widgets/standings-format.ts`
- Backend Go, schema, persistencia, configs de build, dependencias.
- Archivos de A4/A5 (`recommended-profiles.ts`, `hub_service.go`, `OverlaysStudioPage.tsx`, `PreviewInspector.tsx`).
- Versionado / tags.

### 5. Cambios exactos esperados

#### Fix A — Constantes de altura de `standings`

En `frontend/src/overlay/widgets/widget-base-size.ts`, reemplazar el bloque de constantes de standings por:

```ts
// header: pt-4(16) + pb-2(8) + text-3xl lh(36) + mb-1(4) + text-[11px](~16) = 80
export const STANDINGS_HEADER_HEIGHT = 80;        // era 76
export const STANDINGS_CLASS_HEIGHT = 24;         // sin cambio (py-1 + text-[11px])
export const STANDINGS_CONTAINER_TOP_MARGIN = 4;  // nuevo: mt-1 del container de filas
export const STANDINGS_ROW_HEIGHT = 24;           // sin cambio
export const STANDINGS_FOOTER_TOP_MARGIN = 4;     // nuevo: mt-1 del footer
export const STANDINGS_FOOTER_HEIGHT = 21;        // era 26: py-1(8) + text-[8px](12) + border-t(1)
export const STANDINGS_PANEL_BORDER = 2;          // nuevo: 1px top + 1px bottom del panel
export const STANDINGS_DEFAULT_MAX_ROWS = 12;     // sin cambio
```

Fórmula esperada en la rama `standings` de `getWidgetBaseSize`:

```ts
const height =
  STANDINGS_HEADER_HEIGHT +
  STANDINGS_CLASS_HEIGHT +
  STANDINGS_CONTAINER_TOP_MARGIN +
  maxRows * STANDINGS_ROW_HEIGHT +
  STANDINGS_FOOTER_TOP_MARGIN +
  STANDINGS_FOOTER_HEIGHT +
  STANDINGS_PANEL_BORDER;
```

- `Default maxRows=12` debe dar `80 + 24 + 4 + 288 + 4 + 21 + 2 = 423`.
- `maxRows=5` debe dar `80 + 24 + 4 + 120 + 4 + 21 + 2 = 255`.
- Las constantes de `relative` (`RELATIVE_FILL_*`) **no se modifican** (ya son correctas según el análisis adversarial).

#### Fix B1 — `baseAspect` en `resizeWithRatio`

En `frontend/src/lib/canvas-math.ts`, `resizeWithRatio` acepta un parámetro opcional `baseAspect?: number`:

```ts
export function resizeWithRatio(
  type: string,
  startW: number,
  startH: number,
  deltaX: number,
  deltaY: number,
  baseAspect?: number,
): { w: number; h: number } {
  const ratio = WIDGET_RATIOS[type] ?? null;
  if (ratio != null) {
    const h = Math.max(WIDGET_MIN_SIZE.h, startH + deltaY);
    const w = Math.max(WIDGET_MIN_SIZE.w, Math.round(h * ratio));
    return { w, h };
  }
  if (PROPORTIONAL_TYPES.has(type)) {
    const aspect = baseAspect ?? (startH > 0 ? startW / startH : 1);
    const dominant = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const sign = Math.sign(deltaX) !== 0 ? Math.sign(deltaX) : Math.sign(deltaY);
    const h = Math.max(WIDGET_MIN_SIZE.h, startH + sign * dominant);
    const w = Math.max(WIDGET_MIN_SIZE.w, Math.round(h * aspect));
    return { w, h };
  }
  return {
    w: Math.max(WIDGET_MIN_SIZE.w, startW + deltaX),
    h: Math.max(WIDGET_MIN_SIZE.h, startH + deltaY),
  };
}
```

- Los tipos con `ratio` fijo legacy (`delta`, `telemetry`, `telemetry-vertical`, `pedals`) **ignoran** `baseAspect` (no cambia su comportamiento).
- Para `relative`/`standings`, si el caller pasa `baseAspect`, se usa ese; si no, cae al `startW/startH` anterior (compatibilidad).

En `frontend/src/hub/preview/PreviewWidgetFrame.tsx`, calcular `baseSize` una vez (fuera del IIFE de render, p. ej. como `const` antes del handler de resize o dentro de `handleResizeMouseDown` capturando el `baseSize` del render actual) y pasarlo al gesto:

```ts
const baseSize = getWidgetBaseSize(widget.type, widget, profile);
const baseAspect = baseSize ? baseSize.width / baseSize.height : undefined;
// dentro de onMouseMove:
const sized = resizeWithRatio(widget.type, startRect.w, startRect.h, deltaX, deltaY, baseAspect);
```

- El bloque de render del scaler (`PreviewWidgetFrame.tsx:113-149`) **no cambia**: sigue usando `scale = min(visualRect.w/baseSize.width, visualRect.h/baseSize.height)`.
- `WidgetHost` **no se toca**: hereda el aspect correcto vía `baseSize` y el scaler existente.

### 6. Tests requeridos

`frontend/src/overlay/widgets/widget-base-size.test.ts`:

- `standings` default (`maxRows=12`): `expect(size!.height).toBe(423)`.
- `standings` con `maxRows=5`: `expect(size!.height).toBe(255)`.
- Mantener regresión `relative` compact/fill y `delta → null`.

`frontend/src/lib/canvas-math.test.ts`:

- `resizeWithRatio("relative", 300, 200, 100, 0, baseAspect=258/240)` → el resultado usa `baseAspect` (aspect ≈ 1.075), **no** `startW/startH` (1.5). Afirmar `result.w / result.h ≈ 258/240` con tolerancia.
- `resizeWithRatio("standings", 400, 200, 0, 100, baseAspect=…)` → usa `baseAspect`.
- `resizeWithRatio("delta", 400, 100, 0, 0)` (sin `baseAspect`) → sin cambios (ratio 4 legacy).
- `resizeWithRatio("relative", 300, 200, 100, 0)` (sin `baseAspect`) → conserva `startW/startH` (compatibilidad con el comportamiento anterior).

`frontend/src/hub/preview/PreviewWidgetFrame.test.tsx`:

- Actualizar los asserts de `relative resize is proportional` y `standings resize is proportional` para afirmar el **aspect del base**, no el `startW/startH`. Calcular `baseAspect` a partir del `getWidgetBaseSize` del widget de test y afirmar `rect.w / rect.h ≈ baseAspect` con tolerancia de snap (1 decimal).
- Mantener regresión `delta` (legacy, sin `baseAspect`).

### 7. Checks

```powershell
pnpm --dir frontend test -- widget-base-size canvas-math PreviewWidgetFrame WidgetHost WidgetRenderer WidgetSandboxPreview RelativeWidget StandingsWidget
pnpm --dir frontend test
pnpm --dir frontend lint
pnpm --dir frontend build
git diff --check
```

- `go test ./...` no es obligatorio para este follow-up (no se toca backend), pero puede ejecutarse como regresión.
- Los tests de `WidgetHost`, `WidgetRenderer`, `WidgetSandboxPreview`, `RelativeWidget`, `StandingsWidget` deben seguir pasando **sin modificación** (regresión del contrato y de PREVIEW2).

### 8. Stop conditions

- Si el fix necesita **B2** (normalización al cargar / mutar `position` en memoria) → parar; queda fuera de este follow-up.
- Si el fix necesita tocar **runtime** (`WidgetHost`, `CompositeApp`, `ObsOverlayApp`) → parar.
- Si el fix necesita tocar los **widgets** (`RelativeWidget`, `StandingsWidget`, `*-format.ts`) → parar.
- Si se rompe **PREVIEW2** (`WidgetSandboxPreview`/`WidgetRenderer fillHost={false}`) → parar.
- Si requiere **schema/persistencia** → parar.
- Si los tests de regresión del contrato proporcional dejan de pasar → parar y reportar.

### 9. Checklist manual post-fix

1. Reconstruir y abrir la app.
2. `Overlays Studio → LayoutStudio`, seleccionar `standings`: el contenido **no se corta** abajo; el footer `LE MANS ULTIMATE` se ve completo.
3. Seleccionar `relative`: el frame rodea el objeto sin hueco grande; el handle rojo queda en la esquina del objeto visual.
4. Arrastrar el handle de `relative`/`standings` en cualquier dirección: el bbox conserva el **aspect del base**, no se deforma y el hueco no reaparece durante el gesto.
5. Para un perfil legacy con bbox deformado: tras el primer resize, el bbox converge al aspect del base (B2 queda fuera, así que en reposo el hueco puede seguir hasta el primer resize — comportamiento aceptado).
6. Guardar, recargar perfil: `position.w/h` persisten; el widget se ve igual que al guardar.
7. Abrir overlay runtime (desktop): idéntico a LayoutStudio.
8. Abrir overlay OBS: idéntico a LayoutStudio y a runtime desktop.
9. `WidgetStudio` (PREVIEW2): `relative` y `standings` siguen con ancho intrínseco, sin espacio vacío derecho, centrados. **Sin regresión.**
10. Mini-previews de `Mis perfiles`: escalados, sin reflow.
11. `delta`/`telemetry`/`telemetry-vertical`/`pedals`: resize legacy sin cambios.

### 10. Riesgos

- **Fix A**: el objeto escalado de `standings` es ~2% más alto; puede asomar 1-2px si el bbox estaba justísimo. Aceptable; el clipping se elimina.
- **Fix B1**: cambia la referencia del gesto de `startW/startH` a `base.w/base.h`. No rompe el contrato proporcional (sigue siendo proporcional, ahora al base). Cambia la especificación literal del gesto (la tarea 1 afirmaba `startW/startH`); este follow-up la actualiza explícitamente. Requiere reescribir los asserts de `PreviewWidgetFrame.test.tsx` y `canvas-math.test.ts`.
- **Sin B2**: los perfiles legacy con bbox deformado conservan el hueco en reposo hasta el primer resize. Aceptado por el usuario para este follow-up; queda como decisión futura.
- **No tocar runtime**: `WidgetHost` ya usa `baseSize` y el scaler `min(...)`, por lo que Fix A se propaga automáticamente a runtime/OBS. Si runtime no coincidiera con LayoutStudio tras el fix, revisar que `CompositeApp`/`ObsOverlayApp` pasen `profile` a `WidgetHost` (ya hecho en la tarea 4; no debe deshacerse).

### 11. Criterios de aceptación del follow-up

- `standings` no se corta en LayoutStudio ni en runtime/OBS.
- El gesto de resize de `relative`/`standings` conserva el aspect del `baseSize`, no el del bbox actual.
- `WidgetStudio` sandbox sin regresión (PREVIEW2 intacto).
- `position.w/h` sigue siendo el único tamaño persistido (no schema change, no mutación al cargar).
- Suite frontend completa verde; lint y build OK; `git diff --check` sin errores bloqueantes.
- Verificación manual aprobada por el usuario.

### 12. Prompt final listo para pasar a un worker de implementación (follow-up)

```markdown
Actúa como worker para Vantare Overlays Studio.

Tarea: Follow-up final del resize proporcional para `relative` y `standings` (Fix A + Fix B1).
Version objetivo: próxima versión funcional (sin bump hasta verificación manual).
Tipo: bugfix de constantes + bugfix de gesto de resize.

Lee obligatoriamente:
- AGENTS.md
- docs/current-plan.md
- docs/widget-preview-bug-log.md
- docs/superpowers/plans/2026-06-25-resize-proporcional-relative-standings.md (este plan, sección "Follow-up final")

Alcance (solo Follow-up final, NO reabrir tareas 0–5):
- Fix A: ajustar constantes de altura de `standings` en `frontend/src/overlay/widgets/widget-base-size.ts`.
- Fix B1: `resizeWithRatio` acepta `baseAspect?: number` en `frontend/src/lib/canvas-math.ts`; `PreviewWidgetFrame.tsx` pasa `baseAspect` derivado de `getWidgetBaseSize`.

Archivos permitidos (exactamente):
- frontend/src/overlay/widgets/widget-base-size.ts
- frontend/src/overlay/widgets/widget-base-size.test.ts
- frontend/src/lib/canvas-math.ts
- frontend/src/lib/canvas-math.test.ts
- frontend/src/hub/preview/PreviewWidgetFrame.tsx
- frontend/src/hub/preview/PreviewWidgetFrame.test.tsx

No tocar:
- WidgetHost, CompositeApp, ObsOverlayApp (runtime ya usa baseSize; no se modifica).
- WidgetSandboxPreview, PreviewScaler, widget-preview-size.ts (ruta sandbox de WidgetStudio).
- RelativeWidget, StandingsWidget, relative-format.ts, standings-format.ts.
- Backend Go, schema, persistencia, configs de build, dependencias.
- Archivos de A4/A5.
- Versionado / tags.
- NO aplicar B2: no normalizar widgets al cargar, no mutar position en memoria, no tocar persistencia.

Requisitos:
- Sigue el follow-up con TDD (test failing → implementación → test passing).
- Cambios pequeños y reversibles.
- No dependencias nuevas.
- No hagas `git add`, commit, push ni tag.

Decisiones de diseño aprobadas:
- Fix A: constantes standings = STANDINGS_HEADER_HEIGHT=80, CLASS=24, CONTAINER_TOP_MARGIN=4, ROW=24, FOOTER_TOP_MARGIN=4, FOOTER=21, PANEL_BORDER=2. Default maxRows=12 → height=423; maxRows=5 → height=255. Constantes de relative sin cambio.
- Fix B1: resizeWithRatio(type, startW, startH, deltaX, deltaY, baseAspect?). Para relative/standings: aspect = baseAspect ?? (startH>0 ? startW/startH : 1). Tipos con ratio fijo legacy ignoran baseAspect. PreviewWidgetFrame calcula baseSize una vez y pasa baseAspect = baseSize ? baseSize.width/baseSize.height : undefined.
- El bloque de render del scaler de PreviewWidgetFrame NO cambia.
- WidgetHost NO se toca.

Tests requeridos:
- widget-base-size.test.ts: standings default height toBe(423); standings maxRows=5 toBe(255); regresión relative/delta.
- canvas-math.test.ts: relative con baseAspect usa ese aspect; standings con baseAspect usa ese aspect; delta legacy sin cambio; relative sin baseAspect conserva startW/startH (compatibilidad).
- PreviewWidgetFrame.test.tsx: actualizar asserts de relative/standings al aspect del base; regresión delta.

Checks:
- pnpm --dir frontend test -- widget-base-size canvas-math PreviewWidgetFrame WidgetHost WidgetRenderer WidgetSandboxPreview RelativeWidget StandingsWidget
- pnpm --dir frontend test
- pnpm --dir frontend lint
- pnpm --dir frontend build
- git diff --check

Stop conditions:
- Si necesitas B2 (normalizar al cargar / mutar position) → parar.
- Si necesitas tocar runtime (WidgetHost/CompositeApp/ObsOverlayApp) → parar.
- Si necesitas tocar widgets (RelativeWidget/StandingsWidget/*-format.ts) → parar.
- Si se rompe PREVIEW2 (WidgetSandboxPreview/WidgetRenderer fillHost={false}) → parar.
- Si requiere schema/persistencia → parar.
- Si los tests de regresión del contrato proporcional dejan de pasar → parar y reportar.

Reporte final en español:
- Archivos modificados.
- Tests/checks ejecutados y resultado.
- Checks no ejecutados y motivo.
- Riesgos restantes.
- Verificación manual recomendada (usar la checklist del follow-up, sección 9).
```
