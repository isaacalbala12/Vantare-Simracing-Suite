# Remove Widget Studio — Unify Overlays Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar `WidgetStudio` como vista independiente y consolidar toda la funcionalidad en `LayoutStudio` ("Perfiles Específicos"), dejando `Overlays Studio` como el único editor.

**Architecture:** Mover el design system selector y el mock session selector de `WidgetStudio.tsx` a `LayoutStudio.tsx`. Eliminar `WidgetStudio.tsx`, `WidgetPreviewPanel.tsx` y sus tests. Actualizar `V52OverlaysHome` para quitar la card "Widgets". Actualizar `OverlaysStudioPage` para eliminar el modo `"widgets"`. Verificar que todo compila y pasa tests.

**Tech Stack:** React 19, TypeScript, Wails v3 events, Tailwind CSS v4, Vitest, Testing Library.

---

## Contexto

Actualmente existen dos vistas de edición:

- **WidgetStudio** — Editor de apariencia/behavior sin canvas. Tiene design system selector, mock session selector, y WidgetPreviewPanel (preview central).
- **LayoutStudio** — Editor de perfil con canvas 1920×1080, drag/resize, y los mismos controles de apariencia/behavior.

Ambos usan `WidgetSettingsPanel` que internamente usa `PreviewInspector`. La diferencia real es:
- WidgetStudio tiene un preview central dedicado (`WidgetPreviewPanel`) y selectores prominentes arriba.
- LayoutStudio tiene el canvas interactivo.

Al unificar, LayoutStudio absorbe los selectores de WidgetStudio y el preview central se elimina (el canvas ya muestra los widgets).

---

## File Structure After This Plan

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/hub/overlays/LayoutStudio.tsx` | **Modify** | Absorbe design system selector + mock session selector de WidgetStudio |
| `frontend/src/hub/overlays/LayoutStudio.test.tsx` | **Modify** | Tests actualizados para los nuevos selectores |
| `frontend/src/hub/overlays/WidgetStudio.tsx` | **Delete** | Eliminado |
| `frontend/src/hub/overlays/WidgetStudio.test.tsx` | **Delete** | Eliminado |
| `frontend/src/hub/overlays/WidgetPreviewPanel.tsx` | **Delete** | Eliminado |
| `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx` | **Delete** | Eliminado |
| `frontend/src/hub/overlays/V52OverlaysHome.tsx` | **Modify** | Quita card "Widgets" y prop `onOpenWidgets` |
| `frontend/src/hub/overlays/V52OverlaysHome.test.tsx` | **Modify** | Tests actualizados sin card "Widgets" |
| `frontend/src/hub/pages/OverlaysStudioPage.tsx` | **Modify** | Elimina modo `"widgets"`, import de WidgetStudio, función `openWidgetStudio` |
| `frontend/src/hub/pages/OverlaysStudioPage.test.tsx` | **Verify** | Verificar que tests existentes siguen pasando |

---

## Task 1: Move Design System Selector to LayoutStudio

**Files:**
- Modify: `frontend/src/hub/overlays/LayoutStudio.tsx`
- Modify: `frontend/src/hub/overlays/LayoutStudio.test.tsx`

- [ ] **Step 1: Add design system imports to LayoutStudio**

In `frontend/src/hub/overlays/LayoutStudio.tsx`, add these imports after the existing imports:

```tsx
import { useState } from "react";
import {
  applyOfficialDesignToProfile,
  getOfficialDesign,
  listOfficialDesigns,
  getActiveOfficialDesignId,
  resetWidgetDesignToBase,
} from "../widgets/widget-design-gallery";
import { isSyntheticProfile } from "./widget-studio-empty-profile";
```

- [ ] **Step 2: Add design system state and logic inside LayoutStudio component**

Inside the `LayoutStudio` function, after `const selectedWidget = ...`, add:

```tsx
  const activeDesignId = selectedWidget ? getActiveOfficialDesignId(selectedWidget) : null;
  const isSynthetic = isSyntheticProfile(profile);
```

- [ ] **Step 3: Add design system selector bar in LayoutStudio JSX**

After the `</div>` that closes the header section (the one with `mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between`), and before the `<div className="grid min-h-0 flex-1 gap-4...">`, add:

```tsx
      <div className="flex flex-none items-center gap-2 border-b border-white/5 px-3 py-2" data-testid="design-system-selector">
        <label
          htmlFor="design-system-select-layout"
          className="font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textDim"
        >
          Diseño
        </label>
        <select
          id="design-system-select-layout"
          value={activeDesignId ?? "base"}
          disabled={isSynthetic}
          title={isSynthetic ? "Crea o activa un perfil para aplicar diseños" : undefined}
          onChange={(e) => {
            const value = e.target.value;
            if (!selectedWidget) return;
            if (value === "base") {
              onChangeProfile(resetWidgetDesignToBase(profile, selectedWidget.id));
              return;
            }
            const design = getOfficialDesign(value);
            if (design) onChangeProfile(applyOfficialDesignToProfile(profile, selectedWidget.id, design));
          }}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        >
          <option value="base">Base</option>
          {selectedWidget
            ? listOfficialDesigns(selectedWidget.type).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))
            : null}
        </select>
      </div>
```

- [ ] **Step 4: Write failing test for design system selector in LayoutStudio**

Add this test to `frontend/src/hub/overlays/LayoutStudio.test.tsx` inside the `describe("LayoutStudio")` block:

```tsx
  it("renders a design system selector reflecting the active design", () => {
    render(<LayoutStudio {...defaultProps} />);

    expect(screen.getByTestId("design-system-selector")).toBeTruthy();
    const select = screen.getByLabelText("Diseño") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("base");
    expect(screen.getByRole("option", { name: "Base" })).toBeTruthy();
  });

  it("shows the active official design selected in the design selector", () => {
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        {
          id: "standings",
          type: "standings",
          enabled: true,
          updateHz: 15,
          variantId: "official-standings-vantare-crystal-standings",
          position: { x: 0, y: 0, w: 360, h: 300 },
        },
      ],
      variants: [
        {
          id: "official-standings-vantare-crystal-standings",
          widgetType: "standings",
          templateId: "standings-vantare-default",
          themeId: "vantare-crystal",
        },
      ],
    };

    render(
      <LayoutStudio
        {...defaultProps}
        profile={standingsProfile}
        selectedWidgetId="standings"
      />,
    );

    const select = screen.getByLabelText("Diseño") as HTMLSelectElement;
    expect(select.value).toBe("standings-vantare-crystal");
  });

  it("disables design selector when profile is synthetic", () => {
    const emptyProfile: ProfileConfig = {
      schemaVersion: 2,
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [],
      variants: [],
      layouts: {},
    };
    render(
      <LayoutStudio
        {...defaultProps}
        profile={emptyProfile}
        selectedWidgetId={null}
      />,
    );
    const select = screen.getByRole("combobox", { name: /Diseño/i }) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });
```

- [ ] **Step 5: Run LayoutStudio tests**

Run: `pnpm --dir frontend test -- LayoutStudio.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hub/overlays/LayoutStudio.tsx frontend/src/hub/overlays/LayoutStudio.test.tsx
git commit -m "feat(hub): add design system selector to LayoutStudio"
```

---

## Task 2: Move Mock Session Selector to LayoutStudio

**Files:**
- Modify: `frontend/src/hub/overlays/LayoutStudio.tsx`
- Modify: `frontend/src/hub/overlays/LayoutStudio.test.tsx`

- [ ] **Step 1: Add mock session import to LayoutStudio**

In `frontend/src/hub/overlays/LayoutStudio.tsx`, add to the imports:

```tsx
import type { MockSessionScenario } from "../../overlay/widgets/mock-telemetry";
```

- [ ] **Step 2: Add mock session state inside LayoutStudio component**

Inside the `LayoutStudio` function, after the design system state additions:

```tsx
  const [mockSessionScenario, setMockSessionScenario] = useState<MockSessionScenario>("race");
```

- [ ] **Step 3: Add mock session selector bar in LayoutStudio JSX**

After the design system selector `<div>` and before the `<div className="grid min-h-0 flex-1 gap-4...">`, add:

```tsx
      {selectedWidget?.type === "standings" ? (
        <div
          className="flex flex-none items-center gap-2 border-b border-white/5 px-3 py-2"
          data-testid="mock-session-selector"
        >
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textDim">
            Mock
          </span>
          <div className="flex overflow-hidden rounded-md border border-white/10 bg-black/40">
            {[
              ["practice", "Práctica"],
              ["qual", "Clasif"],
              ["race", "Carrera"],
            ].map(([value, label]) => {
              const active = value === mockSessionScenario;
              return (
                <button
                  key={value}
                  type="button"
                  data-testid={`mock-session-${value}`}
                  aria-pressed={active}
                  onClick={() => setMockSessionScenario(value as MockSessionScenario)}
                  className={`border-r border-white/5 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors last:border-r-0 cursor-pointer ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-vantare-textMuted hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
```

- [ ] **Step 4: Write failing test for mock session selector in LayoutStudio**

Add this test to `frontend/src/hub/overlays/LayoutStudio.test.tsx`:

```tsx
  it("shows mock session selector when standings widget is selected", () => {
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 0, y: 0, w: 360, h: 300 } },
      ],
    };

    render(
      <LayoutStudio
        {...defaultProps}
        profile={standingsProfile}
        selectedWidgetId="standings"
      />,
    );

    expect(screen.getByTestId("mock-session-selector")).toBeTruthy();
    expect(screen.getByTestId("mock-session-race")).toBeTruthy();
    expect(screen.getByTestId("mock-session-practice")).toBeTruthy();
    expect(screen.getByTestId("mock-session-qual")).toBeTruthy();
  });

  it("does not show mock session selector for non-standings widgets", () => {
    render(<LayoutStudio {...defaultProps} />);

    expect(screen.queryByTestId("mock-session-selector")).toBeNull();
  });

  it("defaults mock session selector to Carrera", () => {
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 0, y: 0, w: 360, h: 300 } },
      ],
    };

    render(
      <LayoutStudio
        {...defaultProps}
        profile={standingsProfile}
        selectedWidgetId="standings"
      />,
    );

    expect(screen.getByTestId("mock-session-race").getAttribute("aria-pressed")).toBe("true");
  });

  it("switches mock session scenario when clicking selector", () => {
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 0, y: 0, w: 360, h: 300 } },
      ],
    };

    render(
      <LayoutStudio
        {...defaultProps}
        profile={standingsProfile}
        selectedWidgetId="standings"
      />,
    );

    fireEvent.click(screen.getByTestId("mock-session-practice"));

    expect(screen.getByTestId("mock-session-practice").getAttribute("aria-pressed")).toBe("true");
  });

  it("does not mark profile dirty when changing mock session scenario", () => {
    const onChangeProfile = vi.fn();
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 0, y: 0, w: 360, h: 300 } },
      ],
    };

    render(
      <LayoutStudio
        {...defaultProps}
        profile={standingsProfile}
        selectedWidgetId="standings"
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.click(screen.getByTestId("mock-session-practice"));

    expect(onChangeProfile).not.toHaveBeenCalled();
  });
```

- [ ] **Step 5: Run LayoutStudio tests**

Run: `pnpm --dir frontend test -- LayoutStudio.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hub/overlays/LayoutStudio.tsx frontend/src/hub/overlays/LayoutStudio.test.tsx
git commit -m "feat(hub): add mock session selector to LayoutStudio"
```

---

## Task 3: Remove WidgetStudio and WidgetPreviewPanel

**Files:**
- Delete: `frontend/src/hub/overlays/WidgetStudio.tsx`
- Delete: `frontend/src/hub/overlays/WidgetStudio.test.tsx`
- Delete: `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- Delete: `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`

- [ ] **Step 1: Verify no other files import from WidgetStudio or WidgetPreviewPanel**

Run: `rg "WidgetStudio|WidgetPreviewPanel" --include="*.ts" --include="*.tsx" frontend/src/`

Expected: Only `OverlaysStudioPage.tsx` imports `WidgetStudio`. No other files import `WidgetPreviewPanel` (only its own test and WidgetStudio itself).

- [ ] **Step 2: Delete WidgetStudio files**

Run:
```bash
rm frontend/src/hub/overlays/WidgetStudio.tsx
rm frontend/src/hub/overlays/WidgetStudio.test.tsx
```

- [ ] **Step 3: Delete WidgetPreviewPanel files**

Run:
```bash
rm frontend/src/hub/overlays/WidgetPreviewPanel.tsx
rm frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx
```

- [ ] **Step 4: Verify build still compiles (will fail until OverlaysStudioPage is updated)**

Run: `pnpm --dir frontend build`
Expected: FAIL — `OverlaysStudioPage.tsx` still imports `WidgetStudio`. This is expected; Task 4 fixes it.

- [ ] **Step 5: Commit deletions**

```bash
git add -u frontend/src/hub/overlays/WidgetStudio.tsx frontend/src/hub/overlays/WidgetStudio.test.tsx frontend/src/hub/overlays/WidgetPreviewPanel.tsx frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx
git commit -m "chore(hub): delete WidgetStudio and WidgetPreviewPanel"
```

---

## Task 4: Remove Widget Mode from OverlaysStudioPage

**Files:**
- Modify: `frontend/src/hub/pages/OverlaysStudioPage.tsx`

- [ ] **Step 1: Remove WidgetStudio import**

In `frontend/src/hub/pages/OverlaysStudioPage.tsx`, delete line 4:

```tsx
import { WidgetStudio } from "../overlays/WidgetStudio";
```

- [ ] **Step 2: Remove EMPTY_PROFILE import**

In `frontend/src/hub/pages/OverlaysStudioPage.tsx`, delete line 16:

```tsx
import { EMPTY_PROFILE } from "../overlays/widget-studio-empty-profile";
```

- [ ] **Step 3: Remove "widgets" from StudioMode type**

Change line 18 from:

```tsx
type StudioMode = "home" | "widgets" | "ownProfiles" | "recommended" | "community" | "layout" | "obs";
```

to:

```tsx
type StudioMode = "home" | "ownProfiles" | "recommended" | "community" | "layout" | "obs";
```

- [ ] **Step 4: Remove openWidgetStudio function**

Delete the entire `openWidgetStudio` function (lines 123-127):

```tsx
  function openWidgetStudio() {
    setNotice(null);
    setLayoutTarget(null);
    setMode("widgets");
  }
```

- [ ] **Step 5: Remove the "widgets" mode rendering block**

Delete the entire block (lines 177-190):

```tsx
  if (effectiveMode === "widgets") {
    return (
      <WidgetStudio
        profile={studio.profile ?? EMPTY_PROFILE}
        selectedWidgetId={studio.selectedWidgetId}
        dirty={studio.profile ? studio.dirty : false}
        saveState={studio.saveState}
        onSelectWidget={studio.profile ? studio.setSelectedWidgetId : () => {}}
        onChangeProfile={studio.profile ? studio.updateDraft : () => {}}
        onSave={studio.profile ? studio.saveProfile : () => {}}
        onBack={goHome}
      />
    );
  }
```

- [ ] **Step 6: Remove onOpenWidgets prop from V52OverlaysHome**

In the `<V52OverlaysHome>` JSX (around line 306), remove the `onOpenWidgets={openWidgetStudio}` prop:

Change from:

```tsx
      <V52OverlaysHome
        profilesCount={studio.profiles.length}
        onOpenWidgets={openWidgetStudio}
        onOpenOwnProfiles={() => setMode("ownProfiles")}
        onOpenRecommended={() => setMode("recommended")}
        onOpenCommunity={() => setMode("community")}
        onOpenObs={() => setMode("obs")}
      />
```

to:

```tsx
      <V52OverlaysHome
        profilesCount={studio.profiles.length}
        onOpenOwnProfiles={() => setMode("ownProfiles")}
        onOpenRecommended={() => setMode("recommended")}
        onOpenCommunity={() => setMode("community")}
        onOpenObs={() => setMode("obs")}
      />
```

- [ ] **Step 7: Verify build compiles**

Run: `pnpm --dir frontend build`
Expected: PASS (may fail if V52OverlaysHome still expects `onOpenWidgets` — Task 5 fixes that)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hub/pages/OverlaysStudioPage.tsx
git commit -m "feat(hub): remove widget mode from OverlaysStudioPage"
```

---

## Task 5: Remove Widgets Card from V52OverlaysHome

**Files:**
- Modify: `frontend/src/hub/overlays/V52OverlaysHome.tsx`
- Modify: `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`

- [ ] **Step 1: Remove onOpenWidgets prop from V52OverlaysHome type**

In `frontend/src/hub/overlays/V52OverlaysHome.tsx`, change the type from:

```tsx
type V52OverlaysHomeProps = {
  profilesCount: number;
  onOpenWidgets: () => void;
  onOpenOwnProfiles: () => void;
  onOpenRecommended: () => void;
  onOpenCommunity: () => void;
  onOpenObs: () => void;
};
```

to:

```tsx
type V52OverlaysHomeProps = {
  profilesCount: number;
  onOpenOwnProfiles: () => void;
  onOpenRecommended: () => void;
  onOpenCommunity: () => void;
  onOpenObs: () => void;
};
```

- [ ] **Step 2: Remove onOpenWidgets from function signature**

Change the function signature from:

```tsx
export function V52OverlaysHome({
  profilesCount,
  onOpenWidgets,
  onOpenOwnProfiles,
  onOpenRecommended,
  onOpenCommunity,
  onOpenObs,
}: V52OverlaysHomeProps) {
```

to:

```tsx
export function V52OverlaysHome({
  profilesCount,
  onOpenOwnProfiles,
  onOpenRecommended,
  onOpenCommunity,
  onOpenObs,
}: V52OverlaysHomeProps) {
```

- [ ] **Step 3: Remove the Widgets card from JSX**

Delete the entire Widgets `EntryCard` block (lines 90-99):

```tsx
        <div className="opacity-0 animate-fade-in-up delay-100">
          <EntryCard
            eyebrow="Editor de widgets"
            title="Widgets"
            body="Edita apariencia, comportamiento, visibilidad y estilo de los widgets disponibles."
            meta="Widgets disponibles · configuración visual"
            button="Configurar widgets"
            onClick={onOpenWidgets}
          />
        </div>
```

- [ ] **Step 4: Update V52OverlaysHome tests**

In `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`:

1. Remove `onOpenWidgets` from all `<V52OverlaysHome>` render calls.
2. Remove the test "calls callbacks for all five entry cards" and replace with a test for four cards.
3. Remove assertions for "Widgets" heading and "Configurar widgets" button.

Replace the entire test file content with:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RECOMMENDED_PROFILES } from "./recommended-profiles";
import { V52OverlaysHome } from "./V52OverlaysHome";

afterEach(() => cleanup());

describe("V52OverlaysHome", () => {
  it("renders the four Overlays Studio entry cards including OBS", () => {
    render(
      <V52OverlaysHome
        profilesCount={4}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Overlays Studio" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recomendados por Vantare" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Comunidad" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "OBS Browser Source" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Widgets" })).toBeNull();
  });

  it("calls callbacks for all four entry cards", () => {
    const onOpenOwnProfiles = vi.fn();
    const onOpenRecommended = vi.fn();
    const onOpenCommunity = vi.fn();
    const onOpenObs = vi.fn();

    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenOwnProfiles={onOpenOwnProfiles}
        onOpenRecommended={onOpenRecommended}
        onOpenCommunity={onOpenCommunity}
        onOpenObs={onOpenObs}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Ver mis perfiles/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ver recomendados/ }));
    fireEvent.click(screen.getByRole("button", { name: /Explorar comunidad/ }));
    fireEvent.click(screen.getByRole("button", { name: /Configurar OBS/ }));

    expect(onOpenOwnProfiles).toHaveBeenCalledTimes(1);
    expect(onOpenRecommended).toHaveBeenCalledTimes(1);
    expect(onOpenCommunity).toHaveBeenCalledTimes(1);
    expect(onOpenObs).toHaveBeenCalledTimes(1);
  });

  it("Comunidad card is clickable and calls onOpenCommunity", () => {
    const onOpenCommunity = vi.fn();

    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={onOpenCommunity}
        onOpenObs={vi.fn()}
      />,
    );

    const comunidadButton = screen.getByRole("button", { name: /Explorar comunidad/ });
    fireEvent.click(comunidadButton);
    expect(onOpenCommunity).toHaveBeenCalledTimes(1);
  });

  it("renders recommended pills from RECOMMENDED_PROFILES", () => {
    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
      />,
    );

    expect(screen.getByText(RECOMMENDED_PROFILES[0].name)).toBeTruthy();
    expect(screen.getByText(RECOMMENDED_PROFILES[1].name)).toBeTruthy();
    expect(screen.queryByText("Le Mans Basic")).toBeNull();
  });

  it("shows real profilesCount in meta and eyebrow", () => {
    render(
      <V52OverlaysHome
        profilesCount={3}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
      />,
    );

    const matches = screen.getAllByText(/3 perfiles propios/i);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("does not render fake marketplace as active", () => {
    render(
      <V52OverlaysHome
        profilesCount={0}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
      />,
    );

    expect(screen.queryByText(/marketplace/i)).toBeNull();
    expect(screen.queryByText(/comunidad activa/i)).toBeNull();
    expect(screen.queryByText(/explorar comunidad/i)).toBeTruthy();
  });

  it("renders OBS Browser Source card with correct copy", () => {
    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
      />,
    );

    expect(screen.getByText("OBS Browser Source")).toBeTruthy();
    expect(screen.getByText("Copia la URL para capturar tu overlay en OBS.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Configurar OBS/ })).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run V52OverlaysHome tests**

Run: `pnpm --dir frontend test -- V52OverlaysHome.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hub/overlays/V52OverlaysHome.tsx frontend/src/hub/overlays/V52OverlaysHome.test.tsx
git commit -m "feat(hub): remove Widgets card from V52OverlaysHome"
```

---

## Task 6: Full Verification

**Files:** No code changes.

- [ ] **Step 1: Run all frontend tests**

Run: `pnpm --dir frontend test`
Expected: PASS

- [ ] **Step 2: Run frontend build**

Run: `pnpm --dir frontend build`
Expected: PASS

- [ ] **Step 3: Run Go tests**

Run: `go test ./...`
Expected: PASS

- [ ] **Step 4: Manual smoke test**

Run: `go run ./cmd/vantare -live=false -profile configs/example-racing.json`

Verify:
- Hub opens first.
- Topbar shows `Overlays Studio`.
- Open `Overlays Studio`.
- Home shows 4 cards: Mis perfiles, Recomendados, Comunidad, OBS. NO card "Widgets".
- Click "Ver mis perfiles" → list of profiles.
- Click "Editar layout" on a profile → LayoutStudio opens.
- Design system selector is visible above the canvas.
- Select a standings widget → mock session selector appears.
- Canvas shows widgets with drag/resize.
- Widget settings panel shows all controls (appearance, visibility, config sections, presets, variants).
- Save/dirty state works.
- Start/Stop overlay works.
- "Volver a Overlays Studio" returns to home.

- [ ] **Step 5: Commit evidence**

```bash
git commit --allow-empty -m "test: verify Widget Studio removal and Overlays Studio unification"
```

---

## Acceptance Criteria

- `WidgetStudio.tsx` y `WidgetPreviewPanel.tsx` están eliminados.
- `LayoutStudio` tiene design system selector y mock session selector.
- `V52OverlaysHome` no tiene card "Widgets".
- `OverlaysStudioPage` no tiene modo `"widgets"`.
- Todos los tests pasan.
- Build frontend pasa.
- Go tests pasan.
- Manual smoke test verifica que todo funciona.

---

## Self-Review

**Spec coverage:**
- Move design system selector: Task 1 ✓
- Move mock session selector: Task 2 ✓
- Delete WidgetStudio: Task 3 ✓
- Delete WidgetPreviewPanel: Task 3 ✓
- Remove widgets card from home: Task 5 ✓
- Remove widgets mode from page: Task 4 ✓
- Full verification: Task 6 ✓

**Placeholder scan:** No TBD, TODO, or vague steps. All code is concrete.

**Type consistency:** All props, imports, and function signatures match across tasks. `LayoutStudio` props unchanged — only internal additions. `V52OverlaysHome` props reduced by one. `OverlaysStudioPage` simplified.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-remove-widget-studio-unify-overlays.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
