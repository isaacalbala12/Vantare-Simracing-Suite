# Overlays Studio Phase A2 Navigation and Real Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `Overlays Studio` home into a professional app-menu with large clickable panels, move profile/recommended lists into their own subpages, and show real rendered previews for each profile card.

**Architecture:** Keep this as a Hub-only Phase A2. Reuse the existing profile state, `WidgetStudio`, `LayoutStudio`, `recommended-profiles`, and preview widget render pipeline instead of adding new dependencies. A small backend contract change is required: `hub:list` must include each profile's `ProfileConfig` so `Mis perfiles` can render accurate previews for every profile, not only the active one.

**Tech Stack:** React 19, TypeScript, Tailwind v4 classes already present, Vitest + Testing Library, existing Wails event bridge.

---

## Product Decisions

- The `Overlays Studio` home must show four large clickable panels:
  - `Widgets`
  - `Mis perfiles`
  - `Recomendados por Vantare`
  - `Comunidad`
- The old `Perfiles específicos` label disappears from the home and becomes the purpose of `Mis perfiles`.
- Clicking `Widgets` opens the existing widget editor.
- Clicking `Mis perfiles` opens a subpage listing own profiles.
- Clicking `Recomendados por Vantare` opens a subpage listing Vantare presets.
- Clicking `Comunidad` opens a dedicated `Próximamente` screen.
- Every Overlays Studio subpage must have the same `← Volver a Overlays Studio` back action.
- Each own profile and each recommended profile must show a real rendered preview of how that profile looks, not only metadata or rectangles.
- Saving a Vantare recommended profile as an own profile is in scope for A2.
- Backend changes are limited to adding full profile config data to `hub:list` entries for real own-profile previews.

## File Structure After This Plan

- Modify: `frontend/src/hub/pages/OverlaysStudioPage.tsx`
  - Owns internal mode routing: `home`, `widgets`, `ownProfiles`, `recommended`, `community`, `layout`.
  - Wires callbacks from subviews.
- Modify: `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`
  - Integration tests for internal navigation.
- Modify: `frontend/src/hub/overlays/StudioHome.tsx`
  - Becomes only the professional panel menu.
- Modify: `frontend/src/hub/overlays/StudioHome.test.tsx`
  - Tests panel-click behavior and removal of inline lists.
- Create: `frontend/src/hub/overlays/StudioSectionCard.tsx`
  - Reusable large clickable panel for the Studio home.
- Create: `frontend/src/hub/overlays/ProfilePreview.tsx`
  - Shared real rendered mini-preview for a `ProfileConfig`.
- Create: `frontend/src/hub/overlays/ProfilePreview.test.tsx`
  - Verifies real widgets are rendered using existing preview frames.
- Modify: `internal/app/hub_service.go`
  - Adds full `ProfileConfig` to each profile entry returned by `ListProfiles`.
- Modify: `internal/app/hub_service_test.go`
  - Verifies `ListProfiles` includes profile config data for previews.
- Modify: `frontend/src/hub/state/overlay-workbench.ts`
  - Adds optional `profile?: ProfileConfig` to `ProfileEntry`.
- Create: `frontend/src/hub/overlays/OwnProfilesView.tsx`
  - Subpage listing own profiles with previews.
- Create: `frontend/src/hub/overlays/OwnProfilesView.test.tsx`
  - Tests own profile list, create action, preview, and opening profile layout.
- Create: `frontend/src/hub/overlays/RecommendedProfilesView.tsx`
  - Subpage listing Vantare presets with previews and save action.
- Create: `frontend/src/hub/overlays/RecommendedProfilesView.test.tsx`
  - Tests recommended list, previews, and save action.
- Create: `frontend/src/hub/overlays/CommunityComingSoonView.tsx`
  - Dedicated coming-soon screen.
- Create: `frontend/src/hub/overlays/CommunityComingSoonView.test.tsx`
  - Tests coming-soon screen and back action.
- Optional modify: `docs/current-plan.md`
  - Mark Phase A2 as in progress/completed after implementation.

## Out of Scope

- Do not change Go backend beyond the `hub:list` profile-preview contract.
- Do not add dependencies.
- Do not rewrite `WidgetStudio` or `LayoutStudio`.
- Do not modify widget visual design outside previews.
- Do not remove legacy preview code.
- Do not change profile JSON schema.
- Do not implement community downloads/sharing.

## UX Notes for the Worker

Home must feel like a professional app launcher, not a list with small buttons. Use large cards with:

- title,
- short description,
- meta/status line,
- strong hover/focus state,
- whole-card click target,
- optional right-side status/action text.

The user should not need to aim at a small `Abrir widgets` button. The panel itself is the action.

---

### Task 1: Make `StudioHome` a Panel Menu

**Files:**
- Create: `frontend/src/hub/overlays/StudioSectionCard.tsx`
- Modify: `frontend/src/hub/overlays/StudioHome.tsx`
- Modify: `frontend/src/hub/overlays/StudioHome.test.tsx`

- [ ] **Step 1: Replace the current `StudioHome` test with failing panel-menu tests**

Write this test content in `frontend/src/hub/overlays/StudioHome.test.tsx`:

```tsx
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { StudioHome } from "./StudioHome";

afterEach(() => {
  cleanup();
});

describe("StudioHome", () => {
  it("renders professional clickable panels instead of inline profile lists", () => {
    render(
      <StudioHome
        profileCount={2}
        recommendedCount={3}
        onOpenWidgetStudio={vi.fn()}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Abrir Widgets/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir Mis perfiles/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir Recomendados por Vantare/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir Comunidad/i })).toBeTruthy();

    expect(screen.queryByText("Perfiles específicos")).toBeNull();
    expect(screen.queryByRole("button", { name: /Abrir widgets/i })).toBeNull();
  });

  it("opens each section when its whole panel is clicked", () => {
    const onOpenWidgetStudio = vi.fn();
    const onOpenOwnProfiles = vi.fn();
    const onOpenRecommended = vi.fn();
    const onOpenCommunity = vi.fn();

    render(
      <StudioHome
        profileCount={2}
        recommendedCount={3}
        onOpenWidgetStudio={onOpenWidgetStudio}
        onOpenOwnProfiles={onOpenOwnProfiles}
        onOpenRecommended={onOpenRecommended}
        onOpenCommunity={onOpenCommunity}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Abrir Widgets/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Mis perfiles/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Recomendados por Vantare/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Comunidad/i }));

    expect(onOpenWidgetStudio).toHaveBeenCalledTimes(1);
    expect(onOpenOwnProfiles).toHaveBeenCalledTimes(1);
    expect(onOpenRecommended).toHaveBeenCalledTimes(1);
    expect(onOpenCommunity).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- StudioHome.test.tsx
```

Expected: FAIL because `StudioHome` still expects `profiles`, `onOpenProfile`, `onCreateProfile`, and `onSaveRecommended`.

- [ ] **Step 3: Create the reusable panel component**

Create `frontend/src/hub/overlays/StudioSectionCard.tsx`:

```tsx
type StudioSectionCardProps = {
  title: string;
  description: string;
  meta: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
};

export function StudioSectionCard({
  title,
  description,
  meta,
  action,
  onClick,
  disabled = false,
}: StudioSectionCardProps) {
  return (
    <button
      type="button"
      aria-label={`Abrir ${title}`}
      onClick={onClick}
      disabled={disabled}
      className="group card-sleek min-h-[220px] rounded-xl p-6 text-left transition-colors hover:border-vantare-red-500/45 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-vantare-red-500/60 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
    >
      <div className="flex h-full flex-col justify-between gap-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-vantare-red-300">
            {meta}
          </p>
          <h2 className="mt-4 font-display text-2xl font-bold text-white">{title}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-vantare-textMuted">
            {description}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-white/80">
            {action}
          </span>
          <span className="text-xl text-vantare-red-300 transition-transform group-hover:translate-x-1">
            →
          </span>
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Rewrite `StudioHome` as a pure menu**

Replace `frontend/src/hub/overlays/StudioHome.tsx` with:

```tsx
import { StudioSectionCard } from "./StudioSectionCard";

type StudioHomeProps = {
  profileCount: number;
  recommendedCount: number;
  onOpenWidgetStudio: () => void;
  onOpenOwnProfiles: () => void;
  onOpenRecommended: () => void;
  onOpenCommunity: () => void;
};

export function StudioHome({
  profileCount,
  recommendedCount,
  onOpenWidgetStudio,
  onOpenOwnProfiles,
  onOpenRecommended,
  onOpenCommunity,
}: StudioHomeProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1800px] flex-col px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-white">Overlays Studio</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-vantare-textMuted">
          Elige qué quieres editar. Widgets controla apariencia y comportamiento; Mis perfiles controla layouts y colocación.
        </p>
      </div>

      <div className="grid flex-1 gap-5 lg:grid-cols-2">
        <StudioSectionCard
          title="Widgets"
          description="Edita apariencia, comportamiento, visibilidad y estilo de los widgets disponibles."
          meta="Editor de widgets"
          action="Configurar widgets"
          onClick={onOpenWidgetStudio}
        />
        <StudioSectionCard
          title="Mis perfiles"
          description="Gestiona tus perfiles propios y entra en el editor de colocación con preview real de cada layout."
          meta={`${profileCount} perfiles propios`}
          action="Ver mis perfiles"
          onClick={onOpenOwnProfiles}
        />
        <StudioSectionCard
          title="Recomendados por Vantare"
          description="Explora presets oficiales, previsualízalos y guárdalos como perfil propio para editarlos."
          meta={`${recommendedCount} presets oficiales`}
          action="Explorar recomendados"
          onClick={onOpenRecommended}
        />
        <StudioSectionCard
          title="Comunidad"
          description="Más adelante podrás descubrir overlays compartidos por la comunidad."
          meta="Próximamente"
          action="Ver estado"
          onClick={onOpenCommunity}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```powershell
pnpm --dir frontend test -- StudioHome.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit this task**

```powershell
git add frontend/src/hub/overlays/StudioSectionCard.tsx frontend/src/hub/overlays/StudioHome.tsx frontend/src/hub/overlays/StudioHome.test.tsx
git commit -m "feat(hub): make Overlays Studio home a panel menu"
```

---

### Task 2: Add Real Rendered Profile Previews

**Files:**
- Create: `frontend/src/hub/overlays/ProfilePreview.tsx`
- Create: `frontend/src/hub/overlays/ProfilePreview.test.tsx`

- [ ] **Step 1: Write the failing preview test**

Create `frontend/src/hub/overlays/ProfilePreview.test.tsx`:

```tsx
import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, afterEach } from "vitest";
import { ProfilePreview } from "./ProfilePreview";
import type { ProfileConfig } from "../../lib/profile";

afterEach(() => {
  cleanup();
});

const profile: ProfileConfig = {
  id: "preview-test",
  name: "Preview Test",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
    { id: "relative", type: "relative", enabled: true, updateHz: 15, position: { x: 40, y: 600, w: 320, h: 280 } },
  ],
};

describe("ProfilePreview", () => {
  it("renders real preview widget frames for a profile", () => {
    render(<ProfilePreview profile={profile} />);

    expect(screen.getByTestId("profile-preview")).toBeTruthy();
    expect(screen.getByTestId("preview-widget-frame-delta")).toBeTruthy();
    expect(screen.getByTestId("preview-widget-frame-relative")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- ProfilePreview.test.tsx
```

Expected: FAIL because `ProfilePreview` does not exist.

- [ ] **Step 3: Implement `ProfilePreview` using existing real widget frames**

Create `frontend/src/hub/overlays/ProfilePreview.tsx`:

```tsx
import type { ProfileConfig } from "../../lib/profile";
import { PreviewWidgetFrame } from "../preview/PreviewWidgetFrame";

type ProfilePreviewProps = {
  profile: ProfileConfig;
};

const LOGICAL_WIDTH = 1920;
const LOGICAL_HEIGHT = 1080;
const PREVIEW_WIDTH = 360;
const PREVIEW_SCALE = PREVIEW_WIDTH / LOGICAL_WIDTH;

export function ProfilePreview({ profile }: ProfilePreviewProps) {
  return (
    <div
      data-testid="profile-preview"
      className="relative overflow-hidden rounded-lg border border-white/10 bg-black/45"
      style={{ aspectRatio: `${LOGICAL_WIDTH} / ${LOGICAL_HEIGHT}` }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: LOGICAL_WIDTH,
          height: LOGICAL_HEIGHT,
          transform: `scale(${PREVIEW_SCALE})`,
          transformOrigin: "top left",
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        {profile.widgets.map((widget) => (
          <PreviewWidgetFrame
            key={widget.id}
            widget={widget}
            selected={false}
            scale={PREVIEW_SCALE}
            onSelect={() => undefined}
            disabled
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the preview test and verify it passes**

Run:

```powershell
pnpm --dir frontend test -- ProfilePreview.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit this task**

```powershell
git add frontend/src/hub/overlays/ProfilePreview.tsx frontend/src/hub/overlays/ProfilePreview.test.tsx
git commit -m "feat(hub): add real profile previews"
```

---

### Task 3: Include Full Profile Configs in `hub:list`

**Files:**
- Modify: `internal/app/hub_service.go`
- Modify: `internal/app/hub_service_test.go`
- Modify: `frontend/src/hub/state/overlay-workbench.ts`

- [ ] **Step 1: Write/extend the failing Go test**

In `internal/app/hub_service_test.go`, add this assertion to the existing `ListProfiles` test if one exists. If no focused test exists, add this test function:

```go
func TestHubServiceListProfilesIncludesProfileConfig(t *testing.T) {
	dir := t.TempDir()
	profile := &config.ProfileConfig{
		ID:           "preview-profile",
		Name:         "Preview Profile",
		DisplayMode:  config.ModeRacing,
		MonitorIndex: 0,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, UpdateHz: 30, Position: config.Rect{X: 760, Y: 40, W: 400, H: 48}},
		},
	}
	if err := config.SaveFile(filepath.Join(dir, "preview-profile.json"), profile); err != nil {
		t.Fatalf("save profile: %v", err)
	}

	service := NewHubService(dir, nil, nil, nil)
	got, err := service.ListProfiles()
	if err != nil {
		t.Fatalf("ListProfiles() error = %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("profiles len=%d, want 1", len(got))
	}
	if got[0].Profile == nil {
		t.Fatal("Profile is nil, want full profile config for previews")
	}
	if got[0].Profile.ID != "preview-profile" {
		t.Fatalf("Profile.ID=%q, want preview-profile", got[0].Profile.ID)
	}
	if len(got[0].Profile.Widgets) != 1 {
		t.Fatalf("Profile.Widgets len=%d, want 1", len(got[0].Profile.Widgets))
	}
}
```

Required imports if the file does not already have them:

```go
import (
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/pkg/config"
)
```

- [ ] **Step 2: Run the focused Go test and verify it fails**

Run:

```powershell
go test ./internal/app -run TestHubServiceListProfilesIncludesProfileConfig
```

Expected: FAIL because `ProfileEntry` does not have `Profile`.

- [ ] **Step 3: Add profile config to Go `ProfileEntry`**

Modify `internal/app/hub_service.go`:

```go
type ProfileEntry struct {
	ID          string                `json:"id"`
	File        string                `json:"file"` // basename on disk (e.g. example-racing.json)
	Name        string                `json:"name,omitempty"`
	DisplayMode config.DisplayMode    `json:"displayMode"`
	Widgets     int                   `json:"widgets"`
	Profile     *config.ProfileConfig `json:"profile,omitempty"`
}
```

In `ListProfiles`, include the loaded profile:

```go
profiles = append(profiles, ProfileEntry{
	ID:          id,
	File:        e.Name(),
	Name:        p.Name,
	DisplayMode: p.DisplayMode,
	Widgets:     len(p.Widgets),
	Profile:     p,
})
```

- [ ] **Step 4: Add `profile` to frontend `ProfileEntry`**

Modify `frontend/src/hub/state/overlay-workbench.ts`:

```ts
import type { ProfileConfig } from "../../lib/profile";

export type ProfileEntry = {
  id: string;
  file: string;
  name?: string;
  displayMode: string;
  widgets: number;
  profile?: ProfileConfig;
};
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
go test ./internal/app -run TestHubServiceListProfilesIncludesProfileConfig
pnpm --dir frontend test -- OverlaysStudioPage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit this task**

```powershell
git add internal/app/hub_service.go internal/app/hub_service_test.go frontend/src/hub/state/overlay-workbench.ts
git commit -m "feat(hub): include profile configs in studio list"
```

---

### Task 4: Add `Mis perfiles` Subpage

**Files:**
- Create: `frontend/src/hub/overlays/OwnProfilesView.tsx`
- Create: `frontend/src/hub/overlays/OwnProfilesView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/hub/overlays/OwnProfilesView.test.tsx`:

```tsx
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { OwnProfilesView } from "./OwnProfilesView";
import type { ProfileEntry } from "../state/overlay-workbench";
import type { ProfileConfig } from "../../lib/profile";

afterEach(() => {
  cleanup();
});

const activeProfile: ProfileConfig = {
  id: "default-racing",
  name: "Default Racing",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
  ],
};

const profiles: ProfileEntry[] = [
  {
    id: "default-racing",
    file: "example-racing.json",
    name: "Default Racing",
    displayMode: "racing",
    widgets: 1,
    profile: activeProfile,
  },
];

describe("OwnProfilesView", () => {
  it("shows own profiles as cards with a real preview", () => {
    render(
      <OwnProfilesView
        profiles={profiles}
        onOpenProfile={vi.fn()}
        onCreateProfile={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByText("Default Racing")).toBeTruthy();
    expect(screen.getByTestId("profile-preview")).toBeTruthy();
    expect(screen.queryByText("Perfiles específicos")).toBeNull();
  });

  it("opens a profile and exposes create/back actions", () => {
    const onOpenProfile = vi.fn();
    const onCreateProfile = vi.fn();
    const onBack = vi.fn();

    render(
      <OwnProfilesView
        profiles={profiles}
        onOpenProfile={onOpenProfile}
        onCreateProfile={onCreateProfile}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Editar Default Racing/i }));
    fireEvent.click(screen.getByRole("button", { name: /Nuevo perfil/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));

    expect(onOpenProfile).toHaveBeenCalledWith(profiles[0]);
    expect(onCreateProfile).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- OwnProfilesView.test.tsx
```

Expected: FAIL because `OwnProfilesView` does not exist.

- [ ] **Step 3: Implement `OwnProfilesView`**

Create `frontend/src/hub/overlays/OwnProfilesView.tsx`:

```tsx
import { profileLabel, type ProfileEntry } from "../state/overlay-workbench";
import type { ProfileConfig } from "../../lib/profile";
import { ProfilePreview } from "./ProfilePreview";

type OwnProfilesViewProps = {
  profiles: ProfileEntry[];
  onOpenProfile: (profile: ProfileEntry) => void;
  onCreateProfile: () => void;
  onBack: () => void;
};

export function OwnProfilesView({
  profiles,
  onOpenProfile,
  onCreateProfile,
  onBack,
}: OwnProfilesViewProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1800px] flex-col px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
          >
            ← Volver a Overlays Studio
          </button>
          <h1 className="font-display text-3xl font-bold text-white">Mis perfiles</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-vantare-textMuted">
            Elige un perfil propio para editar la colocación, tamaño y layout de sus widgets.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateProfile}
          className="btn-primary rounded-lg px-5 py-2 text-xs font-bold text-white"
        >
          Nuevo perfil
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 text-sm text-vantare-textMuted">
          No hay perfiles propios todavía. Crea uno o guarda un recomendado como propio.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => {
            const label = profileLabel(profile);
            return (
              <article key={profile.file} className="card-sleek rounded-xl p-5">
                <ProfilePreview profile={profile.profile ?? {
                  id: profile.id,
                  name: label,
                  displayMode: profile.displayMode === "streaming" ? "streaming" : "racing",
                  monitorIndex: 0,
                  widgets: [],
                }} />
                <div className="mt-4">
                  <h2 className="font-display text-xl font-semibold text-white">{label}</h2>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
                    {profile.displayMode} · {profile.widgets} widgets
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Editar ${label}`}
                  onClick={() => onOpenProfile(profile)}
                  className="btn-primary mt-4 w-full rounded-lg px-4 py-2 text-xs font-bold text-white"
                >
                  Editar layout
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

Important implementation note: after Task 3, `ProfileEntry.profile` should exist for real own-profile previews. The fallback empty profile is only defensive for malformed/old events and should not be the normal path.

- [ ] **Step 4: Run the test and verify it passes**

Run:

```powershell
pnpm --dir frontend test -- OwnProfilesView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit this task**

```powershell
git add frontend/src/hub/overlays/OwnProfilesView.tsx frontend/src/hub/overlays/OwnProfilesView.test.tsx
git commit -m "feat(hub): add own profiles studio view"
```

---

### Task 5: Add `Recomendados por Vantare` Subpage

**Files:**
- Create: `frontend/src/hub/overlays/RecommendedProfilesView.tsx`
- Create: `frontend/src/hub/overlays/RecommendedProfilesView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/hub/overlays/RecommendedProfilesView.test.tsx`:

```tsx
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { RecommendedProfilesView } from "./RecommendedProfilesView";
import { RECOMMENDED_PROFILES } from "./recommended-profiles";

afterEach(() => {
  cleanup();
});

describe("RecommendedProfilesView", () => {
  it("shows recommended profiles with real previews", () => {
    render(
      <RecommendedProfilesView
        profiles={RECOMMENDED_PROFILES}
        onSaveRecommended={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Recomendados por Vantare" })).toBeTruthy();
    expect(screen.getByText("Racing Básico")).toBeTruthy();
    expect(screen.getAllByTestId("profile-preview").length).toBe(RECOMMENDED_PROFILES.length);
  });

  it("saves a recommended profile and goes back", () => {
    const onSaveRecommended = vi.fn();
    const onBack = vi.fn();

    render(
      <RecommendedProfilesView
        profiles={RECOMMENDED_PROFILES}
        onSaveRecommended={onSaveRecommended}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Guardar Racing Básico como perfil propio/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));

    expect(onSaveRecommended).toHaveBeenCalledWith(RECOMMENDED_PROFILES[0]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- RecommendedProfilesView.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement `RecommendedProfilesView`**

Create `frontend/src/hub/overlays/RecommendedProfilesView.tsx`:

```tsx
import type { RecommendedProfile } from "./recommended-profiles";
import { ProfilePreview } from "./ProfilePreview";

type RecommendedProfilesViewProps = {
  profiles: RecommendedProfile[];
  onSaveRecommended: (profile: RecommendedProfile) => void;
  onBack: () => void;
};

export function RecommendedProfilesView({
  profiles,
  onSaveRecommended,
  onBack,
}: RecommendedProfilesViewProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1800px] flex-col px-6 py-8">
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
        >
          ← Volver a Overlays Studio
        </button>
        <h1 className="font-display text-3xl font-bold text-white">Recomendados por Vantare</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-vantare-textMuted">
          Presets oficiales listos para usar. Guárdalos como perfil propio para poder editarlos.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {profiles.map((profile) => (
          <article key={profile.id} className="card-sleek rounded-xl p-5">
            <ProfilePreview profile={profile.profile} />
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-vantare-red-300">
                {profile.tag} · preset oficial
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold text-white">{profile.name}</h2>
              <p className="mt-2 text-sm leading-6 text-vantare-textMuted">{profile.description}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
                {profile.profile.widgets.length} widgets incluidos
              </p>
            </div>
            <button
              type="button"
              aria-label={`Guardar ${profile.name} como perfil propio`}
              onClick={() => onSaveRecommended(profile)}
              className="btn-primary mt-4 w-full rounded-lg px-4 py-2 text-xs font-bold text-white"
            >
              Guardar como perfil propio
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```powershell
pnpm --dir frontend test -- RecommendedProfilesView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit this task**

```powershell
git add frontend/src/hub/overlays/RecommendedProfilesView.tsx frontend/src/hub/overlays/RecommendedProfilesView.test.tsx
git commit -m "feat(hub): add recommended profiles view"
```

---

### Task 6: Add Dedicated Community Coming Soon Screen

**Files:**
- Create: `frontend/src/hub/overlays/CommunityComingSoonView.tsx`
- Create: `frontend/src/hub/overlays/CommunityComingSoonView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hub/overlays/CommunityComingSoonView.test.tsx`:

```tsx
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CommunityComingSoonView } from "./CommunityComingSoonView";

afterEach(() => {
  cleanup();
});

describe("CommunityComingSoonView", () => {
  it("shows a dedicated coming soon screen and back action", () => {
    const onBack = vi.fn();
    render(<CommunityComingSoonView onBack={onBack} />);

    expect(screen.getByRole("heading", { name: "Comunidad" })).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- CommunityComingSoonView.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement `CommunityComingSoonView`**

Create `frontend/src/hub/overlays/CommunityComingSoonView.tsx`:

```tsx
type CommunityComingSoonViewProps = {
  onBack: () => void;
};

export function CommunityComingSoonView({ onBack }: CommunityComingSoonViewProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1200px] flex-col px-6 py-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 w-fit text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
      >
        ← Volver a Overlays Studio
      </button>
      <div className="glass-panel rounded-xl p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-vantare-red-300">
          Comunidad
        </p>
        <h1 className="mt-4 font-display text-3xl font-bold text-white">Comunidad</h1>
        <p className="mt-6 font-display text-2xl font-semibold text-white">Próximamente</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-vantare-textMuted">
          Esta sección se reservará para overlays compartidos por la comunidad. En Fase A2 solo debe comunicar que todavía no está disponible.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```powershell
pnpm --dir frontend test -- CommunityComingSoonView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit this task**

```powershell
git add frontend/src/hub/overlays/CommunityComingSoonView.tsx frontend/src/hub/overlays/CommunityComingSoonView.test.tsx
git commit -m "feat(hub): add community coming soon view"
```

---

### Task 7: Wire A2 Navigation in `OverlaysStudioPage`

**Files:**
- Modify: `frontend/src/hub/pages/OverlaysStudioPage.tsx`
- Modify: `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`

- [ ] **Step 1: Update integration tests for new internal navigation**

Add these tests to `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`, keeping existing tests that still apply:

```tsx
  it("opens own profiles, recommended profiles, and community subpages", async () => {
    render(<OverlaysStudioPage />);

    listeners.get("hub:profiles")?.({
      data: {
        profiles: [
          { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 2 },
        ],
      },
    });

    listeners.get("profile:loaded")?.({
      data: {
        profile: {
          id: "default-racing",
          name: "Default Racing",
          displayMode: "racing",
          monitorIndex: 0,
          widgets: [
            { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
          ],
        },
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: /Abrir Mis perfiles/i }));
    expect(await screen.findByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByText("Default Racing")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Recomendados por Vantare/i }));
    expect(await screen.findByRole("heading", { name: "Recomendados por Vantare" })).toBeTruthy();
    expect(screen.getByText("Racing Básico")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Comunidad/i }));
    expect(await screen.findByRole("heading", { name: "Comunidad" })).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();
  });
```

Update the existing widget test click from:

```tsx
fireEvent.click(await screen.findByRole("button", { name: /Abrir widgets/i }));
```

to:

```tsx
fireEvent.click(await screen.findByRole("button", { name: /Abrir Widgets/i }));
```

- [ ] **Step 2: Run the integration test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- OverlaysStudioPage.test.tsx
```

Expected: FAIL until the page routes the new modes.

- [ ] **Step 3: Wire new modes and views**

Modify `frontend/src/hub/pages/OverlaysStudioPage.tsx`:

```tsx
import { useState } from "react";
import { Events } from "@wailsio/runtime";
import { StudioHome } from "../overlays/StudioHome";
import { WidgetStudio } from "../overlays/WidgetStudio";
import { LayoutStudio } from "../overlays/LayoutStudio";
import { OwnProfilesView } from "../overlays/OwnProfilesView";
import { RecommendedProfilesView } from "../overlays/RecommendedProfilesView";
import { CommunityComingSoonView } from "../overlays/CommunityComingSoonView";
import { useOverlayStudioState } from "../overlays/useOverlayStudioState";
import { RECOMMENDED_PROFILES, cloneRecommendedProfile, type RecommendedProfile } from "../overlays/recommended-profiles";
import type { ProfileEntry } from "../state/overlay-workbench";

type StudioMode = "home" | "widgets" | "ownProfiles" | "recommended" | "community" | "layout";
```

Keep the existing `createProfile`, `openWidgetStudio`, `openProfile`, and `saveRecommended` functions. Add:

```tsx
  function goHome() {
    setNotice(null);
    setMode("home");
  }
```

Use `goHome` for every `onBack`.

Add these render branches before the final home return:

```tsx
  if (mode === "ownProfiles") {
    return (
      <OwnProfilesView
        profiles={studio.profiles}
        onOpenProfile={openProfile}
        onCreateProfile={createProfile}
        onBack={goHome}
      />
    );
  }

  if (mode === "recommended") {
    return (
      <RecommendedProfilesView
        profiles={RECOMMENDED_PROFILES}
        onSaveRecommended={saveRecommended}
        onBack={goHome}
      />
    );
  }

  if (mode === "community") {
    return <CommunityComingSoonView onBack={goHome} />;
  }
```

Update final `StudioHome` props to:

```tsx
      <StudioHome
        profileCount={studio.profiles.length}
        recommendedCount={RECOMMENDED_PROFILES.length}
        onOpenWidgetStudio={openWidgetStudio}
        onOpenOwnProfiles={() => setMode("ownProfiles")}
        onOpenRecommended={() => setMode("recommended")}
        onOpenCommunity={() => setMode("community")}
      />
```

Update existing `onBack={() => setMode("home")}` occurrences in widget/layout branches to `onBack={goHome}` or `onClick={goHome}`.

- [ ] **Step 4: Run focused integration tests**

Run:

```powershell
pnpm --dir frontend test -- OverlaysStudioPage.test.tsx StudioHome.test.tsx OwnProfilesView.test.tsx RecommendedProfilesView.test.tsx CommunityComingSoonView.test.tsx ProfilePreview.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit this task**

```powershell
git add frontend/src/hub/pages/OverlaysStudioPage.tsx frontend/src/hub/pages/OverlaysStudioPage.test.tsx
git commit -m "feat(hub): wire Overlays Studio section navigation"
```

---

### Task 8: Verification and Documentation

**Files:**
- Modify: `docs/current-plan.md`
- No product code unless fixing test/build issues from this plan.

- [ ] **Step 1: Update `docs/current-plan.md`**

Add this under the current Overlays Studio status:

```markdown
Fase A2 de Overlays Studio:

- Home convertida en cuatro paneles grandes clicables.
- `Mis perfiles` abre una subpantalla propia con perfiles y previews.
- `Recomendados por Vantare` abre una subpantalla propia con previews reales y guardado como perfil propio.
- `Comunidad` abre una pantalla dedicada de `Próximamente`.
- Todas las subpantallas usan `← Volver a Overlays Studio`.
```

- [ ] **Step 2: Run frontend tests for A2**

Run:

```powershell
pnpm --dir frontend test -- StudioHome.test.tsx ProfilePreview.test.tsx OwnProfilesView.test.tsx RecommendedProfilesView.test.tsx CommunityComingSoonView.test.tsx OverlaysStudioPage.test.tsx WidgetStudio.test.tsx LayoutStudio.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full frontend tests**

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

Expected: PASS. If it fails because of pre-existing `frontend/src/lib/telemetry-ref.ts` TypeScript errors, do not silently ignore it. Report the exact errors and create a separate bugfix prompt. Do not mix that bugfix into this A2 plan unless the user approves.

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

1. Topbar shows `Overlays Studio`.
2. No visible separate `Preview` tab.
3. `Overlays Studio` home shows four large panels.
4. Clicking anywhere on `Widgets` panel opens widget editor.
5. `Widgets` still does not show `POSICIÓN Y TAMAÑO`, `X/Y/W/H`, or `Eliminar`.
6. Back button returns to home.
7. Clicking `Mis perfiles` opens profile grid/list.
8. Each profile card shows a rendered preview area.
9. Clicking a profile opens layout editor.
10. Back returns to home.
11. Clicking `Recomendados por Vantare` opens recommended grid.
12. Each recommended card shows rendered preview.
13. `Guardar como perfil propio` asks for name and saves.
14. Clicking `Comunidad` opens dedicated `Próximamente` screen.

- [ ] **Step 7: Commit verification docs**

```powershell
git add docs/current-plan.md
git commit -m "docs: record Overlays Studio phase A2 status"
```

---

## Acceptance Criteria

- Given I open `Overlays Studio`, when I see the home, then I see four professional clickable panels: `Widgets`, `Mis perfiles`, `Recomendados por Vantare`, `Comunidad`.
- Given I click the `Widgets` panel, when the editor opens, then the widget editor works as before and does not expose layout controls.
- Given I click `Mis perfiles`, when the subpage opens, then I see own profiles with rendered previews.
- Given I click an own profile, when the layout editor opens, then I can edit placement/layout.
- Given I click `Recomendados por Vantare`, when the subpage opens, then I see Vantare presets with rendered previews.
- Given I save a recommended profile, when the name is accepted, then the app emits the existing save-own-copy flow.
- Given I click `Comunidad`, when the subpage opens, then it shows a dedicated `Próximamente` screen.
- Given I am in any Overlays Studio subpage, when I click `← Volver a Overlays Studio`, then I return to the home panel menu.

## Reviewer Checklist

- Verify no backend changes were made unless explicitly justified.
- Verify no dependencies were added.
- Verify `StudioHome` no longer mixes navigation with inline profile/recommended lists.
- Verify panel cards are whole-card clickable and accessible as buttons.
- Verify `Mis perfiles` and `Recomendados por Vantare` are subpages.
- Verify previews use real widget rendering through existing preview components.
- Verify widget settings still do not show layout controls.
- Verify layout controls remain in `LayoutStudio`.
- Verify tests cover navigation, previews, save recommended, and back actions.
- Verify any `pnpm build` failure is not hidden.

## Data Contract Note

`ProfileEntry.profile` is intentionally added in A2 so `Mis perfiles` can render accurate previews for every own profile. This is a small contract expansion of `hub:list`, not a new feature subsystem.
