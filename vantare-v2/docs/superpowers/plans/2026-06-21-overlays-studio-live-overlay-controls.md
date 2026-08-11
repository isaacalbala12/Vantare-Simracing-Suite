> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# Overlays Studio Live Overlay Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the missing `Abrir overlay` / `Detener overlay` live controls inside `Overlays Studio` after the Preview tab was removed from visible navigation.

**Architecture:** Keep this as a frontend-only bugfix that reuses existing Wails events: `overlay:start`, `overlay:stop`, and `overlay:status`. `OverlaysStudioPage` owns overlay runtime state and passes narrow callbacks into `OwnProfilesView` and `LayoutStudio`; no backend or profile schema changes are needed.

**Tech Stack:** React 19, TypeScript, Wails runtime events, Vitest + Testing Library.

---

## Current Problem

The old visible live controls still exist in legacy pages:

- `frontend/src/hub/pages/PreviewPage.tsx`
- `frontend/src/hub/pages/ProfilesPage.tsx`

But `HubApp` now routes the visible `Overlays Studio` tab to:

- `frontend/src/hub/pages/OverlaysStudioPage.tsx`

`OverlaysStudioPage` does not currently listen to `overlay:status`, emit `overlay:start`, or emit `overlay:stop`. Therefore the user can edit profiles but cannot launch the live desktop overlay from the new main flow.

## Product Behavior

- `Overlays Studio > Mis perfiles` must show an operational control per own profile:
  - `Abrir overlay` when that profile is not running.
  - `Detener overlay` when that profile is currently running.
- `Overlays Studio > LayoutStudio` must show the same operational control for the active profile.
- `WidgetStudio` must not show live overlay controls.
- `Abrir overlay` must be disabled if there are unsaved layout changes (`dirty`) or a save is in progress (`saveState === "saving"`).
- `Detener overlay` must remain available even if the current profile is dirty.
- Starting must emit `Events.Emit("overlay:start", { id: profile.id, file: profile.file })`.
- Stopping must emit `Events.Emit("overlay:stop")`.

## File Structure

- Modify: `frontend/src/hub/state/overlay-workbench.ts`
  - Reuse existing `OverlayStatus`, `profileTarget`, and `isRunningProfile`.
- Modify: `frontend/src/hub/overlays/OwnProfilesView.tsx`
  - Add narrow props for overlay status and start/stop callbacks.
- Modify: `frontend/src/hub/overlays/OwnProfilesView.test.tsx`
  - Cover start/stop button behavior.
- Modify: `frontend/src/hub/overlays/LayoutStudio.tsx`
  - Add optional live overlay control in the top action row.
- Modify: `frontend/src/hub/overlays/LayoutStudio.test.tsx`
  - Cover start button, stop button, and disabled state.
- Modify: `frontend/src/hub/pages/OverlaysStudioPage.tsx`
  - Listen to `overlay:status`, pass callbacks, emit events.
- Modify: `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`
  - Integration coverage for `overlay:start` and `overlay:stop`.
- Modify: `docs/current-plan.md`
  - Record this as a Fase A live-controls bugfix after implementation.

## Out of Scope

- Do not restore `PreviewPage` as a visible tab.
- Do not change backend.
- Do not change `cmd/vantare/main.go`.
- Do not change profile JSON schema.
- Do not add dependencies.
- Do not add live overlay controls inside `WidgetStudio`.
- Do not fix unrelated package/lock/config diffs.

---

### Task 1: Add Live Controls to `OwnProfilesView`

**Files:**
- Modify: `frontend/src/hub/overlays/OwnProfilesView.tsx`
- Modify: `frontend/src/hub/overlays/OwnProfilesView.test.tsx`

- [ ] **Step 1: Update tests first**

Add `OverlayStatus` import to `frontend/src/hub/overlays/OwnProfilesView.test.tsx`:

```tsx
import type { OverlayStatus, ProfileEntry } from "../state/overlay-workbench";
```

Replace the existing `ProfileEntry` import line:

```tsx
import type { ProfileEntry } from "../state/overlay-workbench";
```

with the combined import above.

Add these tests inside `describe("OwnProfilesView", () => { ... })`:

```tsx
  it("starts the selected profile overlay from a profile card", () => {
    const onStartOverlay = vi.fn();

    render(
      <OwnProfilesView
        profiles={profiles}
        overlayStatus={null}
        onStartOverlay={onStartOverlay}
        onStopOverlay={vi.fn()}
        onOpenProfile={vi.fn()}
        onCreateProfile={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Abrir overlay para Default Racing/i }));

    expect(onStartOverlay).toHaveBeenCalledWith(profiles[0]);
  });

  it("stops the running profile overlay from a profile card", () => {
    const onStopOverlay = vi.fn();
    const overlayStatus: OverlayStatus = {
      running: true,
      profileId: "default-racing",
      mode: "racing",
    };

    render(
      <OwnProfilesView
        profiles={profiles}
        overlayStatus={overlayStatus}
        onStartOverlay={vi.fn()}
        onStopOverlay={onStopOverlay}
        onOpenProfile={vi.fn()}
        onCreateProfile={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Detener overlay de Default Racing/i }));

    expect(onStopOverlay).toHaveBeenCalledTimes(1);
  });
```

Update all existing `OwnProfilesView` renders in the same test file to pass:

```tsx
overlayStatus={null}
onStartOverlay={vi.fn()}
onStopOverlay={vi.fn()}
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- OwnProfilesView.test.tsx
```

Expected: FAIL because `OwnProfilesView` does not accept `overlayStatus`, `onStartOverlay`, or `onStopOverlay`.

- [ ] **Step 3: Implement narrow props in `OwnProfilesView`**

Modify imports in `frontend/src/hub/overlays/OwnProfilesView.tsx`:

```tsx
import { isRunningProfile, profileLabel, type OverlayStatus, type ProfileEntry } from "../state/overlay-workbench";
```

Replace the current import:

```tsx
import { profileLabel, type ProfileEntry } from "../state/overlay-workbench";
```

Extend `OwnProfilesViewProps`:

```tsx
type OwnProfilesViewProps = {
  profiles: ProfileEntry[];
  overlayStatus: OverlayStatus | null;
  onStartOverlay: (profile: ProfileEntry) => void;
  onStopOverlay: () => void;
  onOpenProfile: (profile: ProfileEntry) => void;
  onCreateProfile: () => void;
  onBack: () => void;
};
```

Update the component signature:

```tsx
export function OwnProfilesView({
  profiles,
  overlayStatus,
  onStartOverlay,
  onStopOverlay,
  onOpenProfile,
  onCreateProfile,
  onBack,
}: OwnProfilesViewProps) {
```

Inside the `profiles.map`, after `const label = profileLabel(profile);`, add:

```tsx
const running = isRunningProfile(profile, overlayStatus);
```

Replace the single `Editar layout` button block with this two-button action row:

```tsx
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-label={`Editar ${label}`}
                    onClick={() => onOpenProfile(profile)}
                    className="btn-secondary rounded-lg px-4 py-2 text-xs font-bold text-white"
                  >
                    Editar layout
                  </button>
                  {running ? (
                    <button
                      type="button"
                      aria-label={`Detener overlay de ${label}`}
                      onClick={onStopOverlay}
                      className="btn-secondary rounded-lg px-4 py-2 text-xs font-bold text-white"
                    >
                      Detener overlay
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Abrir overlay para ${label}`}
                      onClick={() => onStartOverlay(profile)}
                      className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white"
                    >
                      Abrir overlay
                    </button>
                  )}
                </div>
```

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```powershell
pnpm --dir frontend test -- OwnProfilesView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/hub/overlays/OwnProfilesView.tsx frontend/src/hub/overlays/OwnProfilesView.test.tsx
git commit -m "feat(hub): add overlay controls to own profiles"
```

---

### Task 2: Add Live Controls to `LayoutStudio`

**Files:**
- Modify: `frontend/src/hub/overlays/LayoutStudio.tsx`
- Modify: `frontend/src/hub/overlays/LayoutStudio.test.tsx`

- [ ] **Step 1: Add failing tests**

Update the import in `frontend/src/hub/overlays/LayoutStudio.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
```

Replace:

```tsx
import { render, screen } from "@testing-library/react";
```

Add these tests inside `describe("LayoutStudio", () => { ... })`:

```tsx
  it("starts overlay from layout studio when there are no unsaved changes", () => {
    const onStartOverlay = vi.fn();

    render(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        overlayRunning={false}
        onStartOverlay={onStartOverlay}
        onStopOverlay={vi.fn()}
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir overlay" }));

    expect(onStartOverlay).toHaveBeenCalledTimes(1);
  });

  it("disables start overlay while dirty or saving", () => {
    const { rerender } = render(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={true}
        saveState="idle"
        overlayRunning={false}
        onStartOverlay={vi.fn()}
        onStopOverlay={vi.fn()}
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Abrir overlay" }).hasAttribute("disabled")).toBe(true);

    rerender(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="saving"
        overlayRunning={false}
        onStartOverlay={vi.fn()}
        onStopOverlay={vi.fn()}
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Abrir overlay" }).hasAttribute("disabled")).toBe(true);
  });

  it("stops overlay from layout studio while running", () => {
    const onStopOverlay = vi.fn();

    render(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={true}
        saveState="idle"
        overlayRunning={true}
        onStartOverlay={vi.fn()}
        onStopOverlay={onStopOverlay}
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Detener overlay" }));

    expect(onStopOverlay).toHaveBeenCalledTimes(1);
  });
```

Update the existing test render to include:

```tsx
overlayRunning={false}
onStartOverlay={vi.fn()}
onStopOverlay={vi.fn()}
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- LayoutStudio.test.tsx
```

Expected: FAIL because `LayoutStudio` props do not exist.

- [ ] **Step 3: Implement `LayoutStudio` props and controls**

Extend `LayoutStudioProps` in `frontend/src/hub/overlays/LayoutStudio.tsx`:

```tsx
type LayoutStudioProps = {
  profile: ProfileConfig;
  selectedWidgetId: string | null;
  dirty: boolean;
  saveState: SaveState;
  overlayRunning: boolean;
  onStartOverlay: () => void;
  onStopOverlay: () => void;
  onSelectWidget: (id: string) => void;
  onChangeProfile: (profile: ProfileConfig) => void;
  onSave: () => void;
  onBack: () => void;
};
```

Update destructuring:

```tsx
export function LayoutStudio({
  profile,
  selectedWidgetId,
  dirty,
  saveState,
  overlayRunning,
  onStartOverlay,
  onStopOverlay,
  onSelectWidget,
  onChangeProfile,
  onSave,
  onBack,
}: LayoutStudioProps) {
```

In the top action row, after the `Guardar` button, add:

```tsx
          {overlayRunning ? (
            <button
              type="button"
              onClick={onStopOverlay}
              className="btn-secondary rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer"
            >
              Detener overlay
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartOverlay}
              disabled={dirty || saveState === "saving"}
              className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              Abrir overlay
            </button>
          )}
```

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```powershell
pnpm --dir frontend test -- LayoutStudio.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/hub/overlays/LayoutStudio.tsx frontend/src/hub/overlays/LayoutStudio.test.tsx
git commit -m "feat(hub): add overlay controls to layout studio"
```

---

### Task 3: Wire Overlay Runtime State in `OverlaysStudioPage`

**Files:**
- Modify: `frontend/src/hub/pages/OverlaysStudioPage.tsx`
- Modify: `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`

- [ ] **Step 1: Add failing integration tests**

In `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`, add `profile` data to the test profiles where needed. Use this helper shape in new tests:

```tsx
const loadedProfile = {
  id: "default-racing",
  name: "Default Racing",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
  ],
};
```

Add these tests inside `describe("OverlaysStudioPage", () => { ... })`:

```tsx
  it("starts overlay from own profiles using the selected profile target", async () => {
    render(<OverlaysStudioPage />);

    listeners.get("hub:profiles")?.({
      data: {
        profiles: [
          {
            id: "default-racing",
            file: "example-racing.json",
            name: "Default Racing",
            displayMode: "racing",
            widgets: 1,
            profile: loadedProfile,
          },
        ],
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Abrir overlay para Default Racing/i }));

    expect(Events.Emit).toHaveBeenCalledWith("overlay:start", {
      id: "default-racing",
      file: "example-racing.json",
    });
  });

  it("stops overlay from own profiles when selected profile is running", async () => {
    render(<OverlaysStudioPage />);

    listeners.get("hub:profiles")?.({
      data: {
        profiles: [
          {
            id: "default-racing",
            file: "example-racing.json",
            name: "Default Racing",
            displayMode: "racing",
            widgets: 1,
            profile: loadedProfile,
          },
        ],
      },
    });

    listeners.get("overlay:status")?.({
      data: { running: true, profileId: "default-racing", mode: "racing" },
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Detener overlay de Default Racing/i }));

    expect(Events.Emit).toHaveBeenCalledWith("overlay:stop");
  });

  it("starts and stops overlay from layout studio for the loaded profile", async () => {
    render(<OverlaysStudioPage />);

    listeners.get("hub:profiles")?.({
      data: {
        profiles: [
          {
            id: "default-racing",
            file: "example-racing.json",
            name: "Default Racing",
            displayMode: "racing",
            widgets: 1,
            profile: loadedProfile,
          },
        ],
      },
    });

    listeners.get("profile:loaded")?.({ data: { profile: loadedProfile } });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Editar Default Racing/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Abrir overlay" }));

    expect(Events.Emit).toHaveBeenCalledWith("overlay:start", {
      id: "default-racing",
      file: "example-racing.json",
    });

    listeners.get("overlay:status")?.({
      data: { running: true, profileId: "default-racing", mode: "racing" },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Detener overlay" }));

    expect(Events.Emit).toHaveBeenCalledWith("overlay:stop");
  });
```

- [ ] **Step 2: Run integration test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- OverlaysStudioPage.test.tsx
```

Expected: FAIL because `OverlaysStudioPage` does not listen to `overlay:status` or pass overlay callbacks.

- [ ] **Step 3: Implement state and callbacks in `OverlaysStudioPage`**

Modify imports in `frontend/src/hub/pages/OverlaysStudioPage.tsx`:

```tsx
import { isRunningProfile, profileTarget, type OverlayStatus, type ProfileEntry } from "../state/overlay-workbench";
```

Replace current `ProfileEntry` import:

```tsx
import type { ProfileEntry } from "../state/overlay-workbench";
```

Add React import if needed remains:

```tsx
import { useEffect, useState } from "react";
```

Replace:

```tsx
import { useState } from "react";
```

Add state after `layoutTarget`:

```tsx
const [overlayStatus, setOverlayStatus] = useState<OverlayStatus | null>(null);
```

Add effect after functions or before render branches:

```tsx
useEffect(() => {
  const unsubOverlayStatus = Events.On("overlay:status", (event: { data: unknown }) => {
    setOverlayStatus(event.data as OverlayStatus);
  });
  return () => {
    unsubOverlayStatus();
  };
}, []);
```

Add helper callbacks:

```tsx
function startOverlay(profile: ProfileEntry) {
  Events.Emit("overlay:start", profileTarget(profile));
}

function stopOverlay() {
  Events.Emit("overlay:stop");
}
```

In the `layout` branch, before returning `LayoutStudio`, derive the selected entry:

```tsx
const activeEntry = studio.profiles.find((entry) => entry.id === studio.profile?.id) ?? null;
const activeOverlayRunning = activeEntry ? isRunningProfile(activeEntry, overlayStatus) : Boolean(overlayStatus?.running);
```

Pass props to `LayoutStudio`:

```tsx
overlayRunning={activeOverlayRunning}
onStartOverlay={() => {
  if (activeEntry) startOverlay(activeEntry);
}}
onStopOverlay={stopOverlay}
```

Pass props to `OwnProfilesView`:

```tsx
overlayStatus={overlayStatus}
onStartOverlay={startOverlay}
onStopOverlay={stopOverlay}
```

- [ ] **Step 4: Run integration tests and verify they pass**

Run:

```powershell
pnpm --dir frontend test -- OverlaysStudioPage.test.tsx OwnProfilesView.test.tsx LayoutStudio.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/hub/pages/OverlaysStudioPage.tsx frontend/src/hub/pages/OverlaysStudioPage.test.tsx
git commit -m "feat(hub): wire overlay controls in studio"
```

---

### Task 4: Verification and Documentation

**Files:**
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Update current plan**

Add this under the completed Overlays Studio status in `docs/current-plan.md`:

```markdown
Live overlay controls restored inside Overlays Studio:

- `Mis perfiles` shows `Abrir overlay` / `Detener overlay` per profile.
- `LayoutStudio` shows `Abrir overlay` / `Detener overlay` for the active profile.
- `WidgetStudio` intentionally does not show live overlay controls.
- Start/stop use existing Wails events: `overlay:start`, `overlay:stop`, `overlay:status`.
- `Abrir overlay` is disabled while layout changes are dirty or saving.
```

- [ ] **Step 2: Run focused tests**

Run:

```powershell
pnpm --dir frontend test -- OwnProfilesView.test.tsx LayoutStudio.test.tsx OverlaysStudioPage.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run frontend tests**

Run:

```powershell
pnpm --dir frontend test
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
pnpm --dir frontend build
```

Expected: PASS. If this fails because of unrelated dependency/lockfile or `telemetry-ref.ts` issues, report exact output and do not fix it inside this task.

- [ ] **Step 5: Run Go tests**

Run:

```powershell
go test ./...
```

Expected: PASS.

- [ ] **Step 6: Manual verification**

Run:

```powershell
go run ./cmd/vantare -live=false -profile configs/example-racing.json
```

Manual checks:

1. Open `Overlays Studio`.
2. Click `Mis perfiles`.
3. Confirm each profile card has `Abrir overlay`.
4. Click `Abrir overlay`.
5. Confirm the desktop overlay window opens.
6. Confirm the same card changes to `Detener overlay`.
7. Click `Detener overlay`.
8. Confirm the desktop overlay window closes.
9. Open `Editar layout`.
10. Confirm `Abrir overlay` appears in `LayoutStudio`.
11. Move a widget so changes are dirty.
12. Confirm `Abrir overlay` is disabled until saved.
13. Confirm `WidgetStudio` does not show `Abrir overlay`.

- [ ] **Step 7: Commit docs**

```powershell
git add docs/current-plan.md
git commit -m "docs: record Overlays Studio live controls"
```

---

## Acceptance Criteria

- Given I am in `Overlays Studio > Mis perfiles`, when a profile is stopped, then its card shows `Abrir overlay`.
- Given I click `Abrir overlay` for a profile, then frontend emits `overlay:start` with `{ id, file }`.
- Given that profile is running, when I view its card, then the action changes to `Detener overlay`.
- Given I click `Detener overlay`, then frontend emits `overlay:stop`.
- Given I am in `LayoutStudio` with no dirty changes, then I can click `Abrir overlay`.
- Given `LayoutStudio` has dirty changes or is saving, then `Abrir overlay` is disabled.
- Given the overlay is running, then `LayoutStudio` shows `Detener overlay`.
- Given I am in `WidgetStudio`, then there is no live overlay start/stop control.
- Given tests and build pass, then the missing live overlay control regression is fixed.

## Reviewer Checklist

- Verify no backend code changed.
- Verify no dependencies changed.
- Verify `PreviewPage` was not restored to visible navigation.
- Verify `WidgetStudio` has no live controls.
- Verify `overlay:start` payload uses `profileTarget(profile)`.
- Verify `overlay:status` is unsubscribed on unmount.
- Verify `Abrir overlay` is disabled for dirty/saving layout.
- Verify `Detener overlay` remains available while dirty.
- Verify tests cover own profile cards and layout studio.
