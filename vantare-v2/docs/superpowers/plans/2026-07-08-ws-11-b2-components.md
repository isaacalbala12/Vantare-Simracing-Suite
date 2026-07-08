# WS-11.B2 — Componentes JSX por parte (Header, Row, Footer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `resolveWidgetComponents(type, themeId)` that returns the JSX components (Header, Row, Footer) a design system provides for a given widget type. The runtime reads these components from the registry. If a system is not registered or doesn't provide a part, the widget falls back to its built-in implementation. This is the API that B4 uses to enable the "Vantare v3" example.

**Architecture:** Add `resolveWidgetComponents(type, themeId)` to the registry module. Add a `useWidgetComponents(type, themeId)` React hook for components that want to read the registry with React semantics. The widgets in `frontend/src/overlay/widgets/` consume this hook. Built-in systems (base, vantare-crystal) are NOT registered yet (B4 will do that). For B2, we add the API + 1 example component (a "Vantare v3" Standings Header) that is registered in the test environment.

**Tech Stack:** TypeScript, React, Vitest (frontend only). No Go changes.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/src/hub/registry/widget-components.ts` | `resolveWidgetComponents(type, themeId)` + `useWidgetComponents(type, themeId)`. | Create |
| `frontend/src/hub/registry/widget-components.test.tsx` | Tests for resolve + useWidgetComponents hook. | Create |
| `frontend/src/hub/registry/index.ts` | Add re-exports. | Modify |
| `frontend/src/hub/registry/_examples/vantare-v3-standings-header.tsx` | A reference Header component demonstrating the API. | Create (B2) |
| `frontend/src/hub/registry/_examples/vantare-v3-standings-header.test.tsx` | Tests for the example. | Create (B2) |
| `frontend/src/overlay/widgets/StandingsWidget.tsx` | Consumes `useWidgetComponents` for Header. | Modify (light) |
| `docs/superpowers/plans/2026-07-08-ws-11-b2-components.md` | This plan. | (already exists) |
| `docs/current-plan.md` | Living changelog. | Add `## Nota WS-11.B2 (2026-07-08) — Implementation:` |

**NOT touched:**
- `widget-design-system.ts`, `style-catalog.ts`, `widget-appearance.ts`, `widget-design-gallery.ts`, `widget-factory.ts`: not modified in B2.
- The 3 other widgets (Delta, Pedals, Relative) do not consume the hook in B2; B4 will wire them up.
- Go code: no changes.

---

## Design decisions

### `resolveWidgetComponents` API

```ts
import type { DesignSystem, WidgetComponents } from "./design-system";
import { lookupDesignSystem } from "./design-system-registry";
import type { WidgetType } from "../../lib/widget-factory";

/** Returns the components a system provides for a given widget type. */
export function resolveWidgetComponents(
  type: WidgetType | string,
  themeId: string | undefined,
): WidgetComponents {
  const system = lookupDesignSystem(themeId);
  if (!system) return {};
  return system.components[type as WidgetType] ?? {};
}

/** React hook: subscribes the component to the registry. */
export function useWidgetComponents(
  type: WidgetType | string,
  themeId: string | undefined,
): WidgetComponents {
  // For B2, the registry is in-memory and doesn't change at runtime, so
  // this is a simple wrapper. B3+ may add useSyncExternalStore if needed.
  return resolveWidgetComponents(type, themeId);
}
```

### `WidgetComponentProps` is already in `design-system.ts` (B1).

### Example Header: `VantareV3StandingsHeader`

A minimal Header component that demonstrates the API. It does NOT replace the production Standings Header yet; it exists to validate the API and serve as documentation.

---

## Task 1: Baseline

**Files:** Read-only.

- [ ] **Step 1: Confirm B1 already committed**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git log --oneline -3
```

Expected: top commit is B1 (`feat(registry): introduce design-system-registry module` or similar).

- [ ] **Step 2: Working tree clean**

```powershell
git status --short
```

Expected: only external changes.

- [ ] **Step 3: Read the B1 files to know what's exported**

```powershell
Get-Content "frontend\src\hub\registry\index.ts"
Get-Content "frontend\src\hub\registry\design-system.ts" -TotalCount 20
```

Capture the B1 exports.

- [ ] **Step 4: Run tests baseline**

```powershell
corepack pnpm --dir frontend test 2>&1 | Select-Object -Last 5
```

Expected: 1438/1438 PASS.

---

## Task 2: Create `widget-components.ts` (resolve + hook)

**Files:**
- Create: `frontend/src/hub/registry/widget-components.ts`

- [ ] **Step 1: Create the file**

Write to `frontend/src/hub/registry/widget-components.ts`:

```ts
import type { WidgetComponents } from "./design-system";
import { lookupDesignSystem } from "./design-system-registry";

/**
 * Resolve the JSX components (Header, Row, Footer) that a design system
 * provides for a given widget type. Returns an empty object if the system
 * is not registered or doesn't provide components for that type. The widget
 * is responsible for falling back to its built-in implementation.
 *
 * @param type - The widget type (e.g. "standings", "delta").
 * @param themeId - The design system id (typically `widget.style` or
 *   `variant.themeId`).
 */
export function resolveWidgetComponents(
  type: string,
  themeId: string | undefined | null,
): WidgetComponents {
  const system = lookupDesignSystem(themeId);
  if (!system) return {};
  return system.components[type as keyof typeof system.components] ?? {};
}
```

- [ ] **Step 2: Verify tsc**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend exec tsc -b 2>&1
```

Expected: exit 0.

---

## Task 3: Add `useWidgetComponents` React hook

**Files:**
- Modify: `frontend/src/hub/registry/widget-components.ts` (add the hook)

- [ ] **Step 1: Add the hook at the end of the file**

Append to `frontend/src/hub/registry/widget-components.ts`:

```ts
import { useMemo } from "react";

/**
 * React hook that returns the components a system provides for a widget type.
 *
 * For B2, the registry is in-memory and doesn't change at runtime, so the
 * hook is a thin wrapper over `resolveWidgetComponents` (memoized by
 * `type` and `themeId`). If the registry becomes dynamic (B3+), this hook
 * will subscribe via `useSyncExternalStore`.
 *
 * @example
 * ```tsx
 * function StandingsHeader({ data, appearance }: WidgetComponentProps<...>) {
 *   const { Header: CustomHeader } = useWidgetComponents("standings", "vantare-v3");
 *   if (CustomHeader) return <CustomHeader data={data} appearance={appearance} />;
 *   return <DefaultHeader data={data} appearance={appearance} />;
 * }
 * ```
 */
export function useWidgetComponents(
  type: string,
  themeId: string | undefined | null,
): WidgetComponents {
  return useMemo(
    () => resolveWidgetComponents(type, themeId),
    [type, themeId],
  );
}
```

- [ ] **Step 2: Verify tsc**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend exec tsc -b 2>&1
```

Expected: exit 0.

---

## Task 4: Update `index.ts` to re-export

**Files:**
- Modify: `frontend/src/hub/registry/index.ts`

- [ ] **Step 1: Add the new exports**

Open `frontend/src/hub/registry/index.ts`. Add the resolve + hook exports:

```ts
export {
  resolveWidgetComponents,
  useWidgetComponents,
} from "./widget-components";
```

The full file becomes:

```ts
export type {
  DesignSystem,
  WidgetComponent,
  WidgetComponentProps,
  WidgetComponents,
} from "./design-system";
export {
  registerDesignSystem,
  lookupDesignSystem,
  listDesignSystems,
  clearDesignSystemRegistry,
} from "./design-system-registry";
export {
  resolveWidgetComponents,
  useWidgetComponents,
} from "./widget-components";
```

- [ ] **Step 2: Verify tsc**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend exec tsc -b 2>&1
```

Expected: exit 0.

---

## Task 5: Tests for resolve + hook

**Files:**
- Create: `frontend/src/hub/registry/widget-components.test.tsx`

- [ ] **Step 1: Create the test file**

Write to `frontend/src/hub/registry/widget-components.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  registerDesignSystem,
  clearDesignSystemRegistry,
  type DesignSystem,
} from "./index";
import {
  resolveWidgetComponents,
  useWidgetComponents,
} from "./widget-components";

const HeaderComponent: ComponentType<any> = () => <div data-testid="custom-header" />;
const RowComponent: ComponentType<any> = () => <div data-testid="custom-row" />;

// Use a complete fake tokens object (not `{} as DesignSystem["tokens"]`) so
// the test breaks if DesignSystemTokens changes — same pattern as B1.
const fakeTokens: DesignSystem["tokens"] = {
  id: "fake",
  name: "Fake",
  colors: { accent: "#000", background: "#000", surface: "#000", border: "#000", text: "#000", textMuted: "#000", textDim: "#000", positive: "#000", negative: "#000", warning: "#000", info: "#000", purple: "#000" },
  badges: { free: { bg: "#000", text: "#000", border: "#000" }, pro: { bg: "#000", text: "#000", border: "#000" }, tester: { bg: "#000", text: "#000", border: "#000" }, experimental: { bg: "#000", text: "#000", border: "#000" }, dataOk: { bg: "#000", text: "#000", border: "#000" }, dataPartial: { bg: "#000", text: "#000", border: "#000" }, dataPending: { bg: "#000", text: "#000", border: "#000" } },
  surfaces: { card: "#000", panel: "#000", header: "#000", rowEven: "#000", rowOdd: "#000", playerHighlight: "#000", lockedOverlay: "#000" },
  typography: { displayFont: "Inter", bodyFont: "Inter", monoFont: "JetBrains Mono" },
  radius: { sm: "4px", md: "8px", lg: "12px", xl: "16px" },
  glow: { accent: "none", none: "none" },
};

function makeSystem(id: string, components: DesignSystem["components"]): DesignSystem {
  return {
    id,
    name: id,
    tokens: fakeTokens,
    perWidgetAppearance: {},
    components,
  };
}

describe("resolveWidgetComponents", () => {
  beforeEach(() => clearDesignSystemRegistry());

  it("returns empty object for unregistered themeId", () => {
    expect(resolveWidgetComponents("standings", "unknown")).toEqual({});
  });

  it("returns empty object for null themeId", () => {
    expect(resolveWidgetComponents("standings", null)).toEqual({});
    expect(resolveWidgetComponents("standings", undefined)).toEqual({});
    expect(resolveWidgetComponents("standings", "")).toEqual({});
  });

  it("returns components for a registered system", () => {
    registerDesignSystem(
      makeSystem("vantare-v3", {
        standings: { Header: HeaderComponent, Row: RowComponent },
      }),
    );
    const result = resolveWidgetComponents("standings", "vantare-v3");
    expect(result.Header).toBe(HeaderComponent);
    expect(result.Row).toBe(RowComponent);
    expect(result.Footer).toBeUndefined();
  });

  it("returns empty object for a type the system doesn't cover", () => {
    registerDesignSystem(
      makeSystem("vantare-v3", {
        standings: { Header: HeaderComponent },
      }),
    );
    expect(resolveWidgetComponents("delta", "vantare-v3")).toEqual({});
  });
});

describe("useWidgetComponents", () => {
  beforeEach(() => clearDesignSystemRegistry());

  it("returns empty object for unregistered themeId", () => {
    const { result } = renderHook(() => useWidgetComponents("standings", "unknown"));
    expect(result.current).toEqual({});
  });

  it("returns the components a system provides", () => {
    registerDesignSystem(
      makeSystem("vantare-v3", {
        standings: { Header: HeaderComponent },
      }),
    );
    const { result } = renderHook(() => useWidgetComponents("standings", "vantare-v3"));
    expect(result.current.Header).toBe(HeaderComponent);
  });

  it("memoizes result by type + themeId", () => {
    registerDesignSystem(
      makeSystem("vantare-v3", {
        standings: { Header: HeaderComponent },
      }),
    );
    const { result, rerender } = renderHook(
      ({ type, themeId }: { type: string; themeId: string }) =>
        useWidgetComponents(type, themeId),
      { initialProps: { type: "standings", themeId: "vantare-v3" } },
    );
    const first = result.current;
    rerender({ type: "standings", themeId: "vantare-v3" });
    expect(result.current).toBe(first);
  });
});
```

- [ ] **Step 2: Run tests (expect PASS)**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend test -- widget-components 2>&1
```

Expected: 7/7 PASS.

- [ ] **Step 3: Run full test suite**

```powershell
corepack pnpm --dir frontend test 2>&1 | Select-Object -Last 5
```

Expected: 1445/1445 PASS (1438 + 7 new).

---

## Task 6: Example `VantareV3StandingsHeader`

**Files:**
- Create: `frontend/src/hub/registry/_examples/vantare-v3-standings-header.tsx`
- Create: `frontend/src/hub/registry/_examples/vantare-v3-standings-header.test.tsx`

- [ ] **Step 1: Create the example Header**

Write to `frontend/src/hub/registry/_examples/vantare-v3-standings-header.tsx`:

```tsx
import type { WidgetComponentProps } from "../design-system";

/**
 * Reference Header for the "Vantare v3" design system. Demonstrates the
 * `WidgetComponentProps` contract: receives `data`, `appearance`, and an
 * optional `className`. Does NOT replace the production Standings Header
 * (B4 wires the registry to the widget). It exists to validate the API
 * and serve as a copy-pasteable template for new system components.
 *
 * The visual style here is intentionally minimal (just a centered time).
 * Real Vantare v3 work happens in B4.
 */
export const VantareV3StandingsHeader: React.FC<
  WidgetComponentProps<{ time?: string }>
> = ({ data, appearance, className }) => {
  return (
    <div
      data-testid="vantare-v3-standings-header"
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 12px",
        background: appearance.surface,
        borderBottom: `1px solid ${appearance.borderColor}`,
        color: appearance.textColor,
        fontFamily: appearance.displayFont,
        fontSize: "14px",
        fontWeight: 600,
      }}
    >
      {data.time ?? "Vantare v3"}
    </div>
  );
};
```

- [ ] **Step 2: Create the test**

Write to `frontend/src/hub/registry/_examples/vantare-v3-standings-header.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { VantareV3StandingsHeader } from "./vantare-v3-standings-header";
import type { WidgetAppearance } from "../../lib/profile";

const baseAppearance: Required<WidgetAppearance> = {
  accentColor: "#9b2226",
  backgroundColor: "#000000",
  textColor: "#ffffff",
  borderColor: "#9b2226",
  opacity: 1,
  positiveColor: "#e74c3c",
  negativeColor: "#2ecc71",
  rpmGreen: "#2ecc71",
  rpmYellow: "#f1c40f",
  rpmRed: "#e74c3c",
  rpmBlue: "#3498db",
  pedalThrottleColor: "#2ecc71",
  pedalBrakeColor: "#e74c3c",
  pedalClutchColor: "#3498db",
  posLeaderColor: "#f1c40f",
  pitColor: "#f1c40f",
  tireSoftColor: "#E63946",
  tireMediumColor: "#f1c40f",
  tireHardColor: "#ffffff",
  gapAheadColor: "#f87171",
  gapBehindColor: "#4ade80",
  classHypercarColor: "#c1121f",
  classHypercarFg: "#f87171",
  classLmp2Color: "#0055A4",
  classLmp2Fg: "#60a5fa",
  classLmp3Color: "#f59e0b",
  classLmp3Fg: "#22d3ee",
  classGt3Color: "#2ecc71",
  classGt3Fg: "#fbbf24",
  classGt4Color: "rgba(244,114,182,0.25)",
  classGt4Fg: "#f472b6",
  classUnknownColor: "#6b7280",
  classUnknownFg: "#6b7280",
};

describe("VantareV3StandingsHeader", () => {
  it("renders with default text when no time provided", () => {
    const { getByTestId } = render(
      <VantareV3StandingsHeader data={{}} appearance={baseAppearance} />,
    );
    expect(getByTestId("vantare-v3-standings-header").textContent).toBe("Vantare v3");
  });

  it("renders the provided time", () => {
    const { getByTestId } = render(
      <VantareV3StandingsHeader data={{ time: "01:23:45" }} appearance={baseAppearance} />,
    );
    expect(getByTestId("vantare-v3-standings-header").textContent).toBe("01:23:45");
  });

  it("uses appearance colors for chrome", () => {
    const { getByTestId } = render(
      <VantareV3StandingsHeader data={{}} appearance={baseAppearance} />,
    );
    const el = getByTestId("vantare-v3-standings-header") as HTMLElement;
    expect(el.style.color).toBe("rgb(255, 255, 255)");
    expect(el.style.borderBottom).toContain("rgb(155, 34, 38)");
  });
});
```

- [ ] **Step 3: Verify tsc**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend exec tsc -b 2>&1
```

Expected: exit 0.

- [ ] **Step 4: Run the example tests**

```powershell
corepack pnpm --dir frontend test -- vantare-v3-standings-header 2>&1
```

Expected: 3/3 PASS.

---

## Task 7: Lint, diff-check, commit

**Files:** none modified beyond Tasks 2-6.

- [ ] **Step 1: Run lint**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend lint 2>&1
```

Expected: no new errors.

- [ ] **Step 2: Run diff-check**

```powershell
git diff --check -- frontend
```

Expected: clean.

- [ ] **Step 3: Verify only intended files**

```powershell
git status --short
```

Expected:
- `?? frontend/src/hub/registry/widget-components.ts`
- `?? frontend/src/hub/registry/widget-components.test.tsx`
- `?? frontend/src/hub/registry/_examples/`
- `M frontend/src/hub/registry/index.ts`
- NO modifications to widgets, design-system, etc.

- [ ] **Step 4: Stage and commit**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git add frontend/src/hub/registry/
git status --short
```

Expected: registry files staged.

```powershell
git diff --cached --check
```

Expected: clean.

```powershell
git commit -m "feat(registry): add resolveWidgetComponents + useWidgetComponents hook

B2 introduces the API for pluggable widget parts. A design system can
contribute Header, Row, and Footer components per widget type. The widget
calls useWidgetComponents(type, themeId) and falls back to its built-in
implementation when the system doesn't provide a part.

- widget-components.ts: resolveWidgetComponents (synchronous) +
  useWidgetComponents (React hook, memoized by type+themeId).
- _examples/vantare-v3-standings-header.tsx: a reference Header
  demonstrating the WidgetComponentProps contract. B4 will wire it to
  the Standings widget when the 'vantare-v3' system is registered.
- Tests: 7 (resolve + hook) + 3 (example) = 10 new tests.

The hook is a thin wrapper for now; if the registry becomes dynamic
(B3+), it will subscribe via useSyncExternalStore.

The Standings widget is NOT modified in B2; that wiring happens in B4
when the built-in systems are registered. The API is validated first.

Tests: 1445/1445 PASS (1438 + 7 new)."
```

---

## Task 8: Documentation

**Files:**
- Modify: `docs/superpowers/plans/2026-07-08-ws-11-b2-components.md` (this plan; add implementation log)

- [ ] **Step 1: Add implementation log**

Append at the end of this plan:

```markdown

## Implementation Log (2026-07-08)

Ejecutado por worker (Fixer) sin commit/tag/release. Skills: vantare-core, test-driven-development, code-review-and-quality.

### Archivos tocados

| Archivo | Acción |
|---|---|
| `frontend/src/hub/registry/widget-components.ts` | Creado (resolve + hook) |
| `frontend/src/hub/registry/widget-components.test.tsx` | Creado (7 tests) |
| `frontend/src/hub/registry/index.ts` | Modificado (re-exports) |
| `frontend/src/hub/registry/_examples/vantare-v3-standings-header.tsx` | Creado (reference component) |
| `frontend/src/hub/registry/_examples/vantare-v3-standings-header.test.tsx` | Creado (3 tests) |
| `docs/superpowers/plans/2026-07-08-ws-11-b2-components.md` | Implementation log |

### Microcortes completados

- [x] Task 1: Baseline
- [x] Task 2: Create `widget-components.ts` (resolve)
- [x] Task 3: Add `useWidgetComponents` hook
- [x] Task 4: Update `index.ts`
- [x] Task 5: Tests for resolve + hook
- [x] Task 6: Example `VantareV3StandingsHeader`
- [x] Task 7: Lint, diff-check, commit
- [x] Task 8: Documentation

### Autorevisión

1. ✅ Solo archivos de scope modificados (registry). No se tocó ningún widget, ningún archivo de producción existente, ni Go.
2. ✅ Tests 1445/1445 PASS, tsc OK, lint OK.
3. ✅ `resolveWidgetComponents` y `useWidgetComponents` cubren los 3 casos: unregistered, null themeId, system sin componente para type.
4. ✅ Hook memoizado por type + themeId.
5. ✅ Example Header demuestra la API sin tocar widgets.
6. ✅ `git diff --check` limpio.
7. ✅ Sin tag, sin release, sin push.
```

- [ ] **Step 2: Stage and commit implementation log**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git add docs/superpowers/plans/2026-07-08-ws-11-b2-components.md
git commit -m "docs(ws-11): B2 components implementation log"
```

---

## Self-Review (author checks before handoff)

**1. Spec coverage:**
- `resolveWidgetComponents(type, themeId)`: ✓ Task 2.
- `useWidgetComponents(type, themeId)` React hook: ✓ Task 3.
- 3-part API (Header, Row, Footer): ✓ design-system.ts from B1.
- Example component validating the contract: ✓ Task 6.
- 7 + 3 = 10 new tests: ✓ Tasks 5, 6.
- No widget modifications (B4 does that): ✓ explicitly excluded.
- No Go changes: ✓ File Structure.

**2. Placeholder scan:**
- The example Header is fully implemented (no TODOs).
- The hook is a thin wrapper with a comment about future useSyncExternalStore.

**3. Type consistency:**
- The `resolveWidgetComponents` reuses the `WidgetComponents` type from B1.
- The example Header uses `WidgetComponentProps<{ time?: string }>` from B1.
- The test `Required<WidgetAppearance>` mirrors the production code (it's the same shape).

---

## Implementation Log (2026-07-08)

Ejecutado por worker (Fixer) sin commit/tag/release. Skills: vantare-core, test-driven-development, code-review-and-quality.

### Archivos tocados

| Archivo | Acción |
|---|---|
| `frontend/src/hub/registry/widget-components.ts` | Creado (resolve + hook) |
| `frontend/src/hub/registry/widget-components.test.tsx` | Creado (7 tests) |
| `frontend/src/hub/registry/index.ts` | Modificado (re-exports) |
| `frontend/src/hub/registry/_examples/vantare-v3-standings-header.tsx` | Creado (reference component) |
| `frontend/src/hub/registry/_examples/vantare-v3-standings-header.test.tsx` | Creado (3 tests) |
| `docs/superpowers/plans/2026-07-08-ws-11-b2-components.md` | Implementation log |

### Microcortes completados

- [x] Task 1: Baseline
- [x] Task 2: Create `widget-components.ts` (resolve)
- [x] Task 3: Add `useWidgetComponents` hook
- [x] Task 4: Update `index.ts`
- [x] Task 5: Tests for resolve + hook
- [x] Task 6: Example `VantareV3StandingsHeader`
- [x] Task 7: Lint, diff-check, commit
- [x] Task 8: Documentation

### Autorevisión

1. ✅ Solo archivos de scope modificados (registry). No se tocó ningún widget, ningún archivo de producción existente, ni Go.
2. ✅ Tests 1447/1447 PASS, tsc OK, lint OK (solo errores preexistentes, 0 nuevos).
3. ✅ `resolveWidgetComponents` y `useWidgetComponents` cubren los 3 casos: unregistered, null themeId, system sin componente para type.
4. ✅ Hook memoizado por type + themeId.
5. ✅ Example Header demuestra la API sin tocar widgets.
6. ✅ `git diff --check` limpio.
7. ✅ Sin tag, sin release, sin push.
8. ⚠️ Plan corregido: `appearance.surface` → `appearance.backgroundColor`, `appearance.displayFont` → hardcoded `"Inter, sans-serif"` porque `WidgetAppearance` no tiene esas props. Import path corregido de `../../lib/profile` a `../../../lib/profile` para `_examples/`. Test corregido para que `el.style.color` espere `"#ffffff"` (valor inline) en vez de `"rgb(255, 255, 255)"`.
9. ⚠️ Añadido `afterEach(cleanup)` en test example para evitar fugas DOM entre tests.
