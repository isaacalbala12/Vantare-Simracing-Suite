# HUB-05-B v5.2 Remaining Hub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar los HTML v5.2 restantes en las paginas internas del Hub sin tocar logica core, calendario avanzado, overlays runtime ni backend.

**Architecture:** Reusar el shell v5.2 ya commiteado en HUB-05 (`V52Shell`, `V52SectionHeader`, `V52InfoCard`, `navigation.ts`) y convertir cada pagina interna en un corte visual pequeno. Cada pagina debe conservar sus eventos Wails, estado y tests funcionales existentes; los placeholders deben ser honestos y no inventar datos.

**Tech Stack:** React + TypeScript estricto, Vitest + Testing Library, Tailwind/clases CSS existentes, Wails Events (`@wailsio/runtime`) solo donde ya existen.

---

## Contexto operativo

- HUB-05 ya esta commiteado en `4ac08a2 feat(hub): add v5.2 shell dashboard and launcher`.
- HTMLs de referencia disponibles fuera del repo:
  - `C:\Users\isaac\Desktop\Vantare-Overlays\hub_main_v5.2-overlays.html`
  - `C:\Users\isaac\Desktop\Vantare-Overlays\hub_main_v5.2-engineer.html`
  - `C:\Users\isaac\Desktop\Vantare-Overlays\hub_main_v5.2-telemetry.html`
  - `C:\Users\isaac\Desktop\Vantare-Overlays\hub_main_v5.2-settings.html`
  - `C:\Users\isaac\Desktop\Vantare-Overlays\hub_main_v5.2-launcher.html`
- HUB-05 ya cubre shell, Dashboard y una pagina Launcher funcional. Este plan solo completa el primer pase visual de paginas internas.

## Scope estricto

Entra:

- Limpieza P3 barata detectada en review HUB-05:
  - `HubApp.tsx` debe usar `isSection`.
  - `Topbar.tsx` debe tipar `activeSection` como `Section`.
  - `NextRaceCard.tsx` debe eliminar import/reexport innecesario de `EMPTY_CALENDAR`.
  - `DashboardPage.test.tsx` debe dejar de comprobar texto inventado por su propio mock.
- Crear `TelemetryPage` v5.2 como placeholder honesto.
- Rehacer visualmente el home de `OverlaysStudioPage` segun `hub_main_v5.2-overlays.html`, sin tocar `WidgetStudio` ni `LayoutStudio`.
- Rehacer visualmente `EngineerPage` segun `hub_main_v5.2-engineer.html`, conservando los controles y eventos reales existentes.
- Rehacer visualmente `SettingsPage` con wrapper v5.2 basico y secciones ordenadas. No implementar todavia el plan completo `SETTINGS-01` de pestanas profundas.
- Ajustar docs vivos al cierre.

No entra:

- `CALENDAR-02` import UI, bridge Wails, ticker o banner overlay.
- Rework de `WidgetStudio`, `LayoutStudio`, `CompositeApp`, `ObsOverlayApp`.
- Cambios Go.
- Cambios de schema, persistencia o AppSettings.
- Nueva dependencia UI.
- Commit de HTML mockups, screenshots o carpetas externas.
- Multi-sim avanzado del Launcher.
- Subpestanas completas de Settings; eso sigue en `SETTINGS-01`.

## Working tree y archivos fuera de scope

Antes de empezar, ejecutar:

```powershell
git status --short
```

Esperado: puede haber cambios fuera de scope heredados:

```text
 M ../hub_main.html
 M ../pnpm-workspace.yaml
 M frontend/src/hub/overlays/RecommendedProfilesView.tsx
 M frontend/src/hub/overlays/RecommendedProfilesView.test.tsx
 M frontend/src/hub/pages/OverlaysStudioPage.test.tsx
?? ../hub_main_v5.2-*.html
?? ../v5.2*.png
?? docs/*mock*.html
?? fotos/
```

Regla:

- No hacer `git add .`.
- No tocar `../pnpm-workspace.yaml`.
- No tocar `../hub_main.html`.
- No commitear HTMLs/screenshots.
- Si se necesita modificar `RecommendedProfilesView*` u `OverlaysStudioPage.test.tsx`, confirmar primero si el diff existente pertenece al fix "Guardar como overlay propio". Si pertenece, mantenerlo y no revertirlo; si estorba al plan, parar y pedir integracion selectiva.

## File Structure

### Archivos a crear

- `frontend/src/hub/pages/TelemetryPage.tsx`
  - Placeholder honesto v5.2 para la seccion Telemetria.
- `frontend/src/hub/pages/TelemetryPage.test.tsx`
  - Tests anti-fake y de render.
- `frontend/src/hub/overlays/V52OverlaysHome.tsx`
  - Home visual v5.2 de Overlays Studio. Solo decide a que submodo navegar.
- `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`
  - Tests de cards y callbacks.

### Archivos a modificar

- `frontend/src/hub/HubApp.tsx`
  - Usar `isSection` y renderizar `TelemetryPage`.
- `frontend/src/hub/HubApp.test.tsx`
  - Test de navegacion Telemetria real.
- `frontend/src/hub/components/Topbar.tsx`
  - `activeSection: Section`.
- `frontend/src/hub/components/Topbar.test.tsx`
  - Ajuste solo si TypeScript/tests lo requieren.
- `frontend/src/hub/components/NextRaceCard.tsx`
  - Quitar import/reexport innecesario.
- `frontend/src/hub/pages/DashboardPage.test.tsx`
  - Quitar asercion complaciente del mock de `LastActivityCard`.
- `frontend/src/hub/pages/OverlaysStudioPage.tsx`
  - Usar `V52OverlaysHome` solo cuando `effectiveMode === "home"`.
- `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`
  - Ajustar expectativas de home visual sin romper tests de flujos existentes.
- `frontend/src/hub/pages/EngineerPage.tsx`
  - Reorganizar visualmente usando v5.2; conservar eventos.
- `frontend/src/hub/pages/EngineerPage.test.tsx`
  - Mantener tests funcionales y agregar anti-fake.
- `frontend/src/hub/pages/SettingsPage.tsx`
  - Wrapper visual v5.2 minimo; conservar handlers/settings/updater/OBS/account.
- `frontend/src/hub/pages/SettingsPage.test.tsx`
  - Ajustar headings y mantener tests de guardado, OBS URL, updater y diagnostics.
- `docs/current-plan.md`
  - Nota HUB-05-B al cerrar implementacion.
- `docs/roadmap-execution-board.md`
  - HUB-05-B Done/In review.
- `docs/release-roadmap-execution-index.md`
  - Tracking de Hub v5.2.
- `docs/technical-debt.md`
  - Actualizar/cerrar partes de TD-050 si se corrigen P3.

### Archivos prohibidos

- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/LayoutStudio.tsx`
- `frontend/src/overlay/**`
- `internal/**`
- `cmd/**`
- `.github/workflows/**`
- `build/**`
- `VERSION`
- `Taskfile.yml`

---

## Task 1: P3 cleanup de HUB-05

**Files:**
- Modify: `frontend/src/hub/HubApp.tsx`
- Modify: `frontend/src/hub/components/Topbar.tsx`
- Modify: `frontend/src/hub/components/NextRaceCard.tsx`
- Modify: `frontend/src/hub/pages/DashboardPage.test.tsx`
- Test: existing focused tests

- [ ] **Step 1: Write/confirm focused tests still describe behavior**

Run:

```powershell
corepack pnpm --dir frontend test -- HubApp Topbar DashboardPage NextRaceCard
```

Expected before code changes: PASS.

- [ ] **Step 2: Replace unsafe casts in HubApp**

In `frontend/src/hub/HubApp.tsx`, import `isSection`:

```tsx
import { isSection, type Section } from './navigation';
```

Replace `handleNavigate`:

```tsx
const handleNavigate = useCallback((id: string) => {
  if (isSection(id)) {
    setSection(id);
  }
}, []);
```

Replace the `V52Shell` navigation prop:

```tsx
<V52Shell
  activeSection={section}
  onNavigate={handleNavigate}
  version={version}
  sourceStatus={sourceStatus}
>
```

- [ ] **Step 3: Type Topbar activeSection as Section**

In `frontend/src/hub/components/Topbar.tsx`, import `Section`:

```tsx
import { NAV_ITEMS, type Section } from "../navigation";
```

Update props:

```tsx
type TopbarProps = {
  activeSection: Section;
  onNavigate: (id: Section) => void;
  version: string | null;
  sourceStatus: SourceStatus | null;
};
```

When mapping `NAV_ITEMS`, no cast is required because `item.id` is already a `Section`:

```tsx
onClick={() => onNavigate(item.id)}
```

- [ ] **Step 4: Remove unused calendar export**

In `frontend/src/hub/components/NextRaceCard.tsx`, remove any import of `EMPTY_CALENDAR` if it is only used for a test export. If tests need an empty calendar, import it directly from `frontend/src/calendar/calendar-types.ts` inside the test.

Expected production import shape:

```tsx
import { formatCountdown, isEventActive, type Calendar, type RaceEvent } from "../../calendar/calendar-types";
```

- [ ] **Step 5: Fix DashboardPage test complacency**

In `frontend/src/hub/pages/DashboardPage.test.tsx`, if `LastActivityCard` is mocked, assert the slot by test id instead of a string produced by the mock:

```tsx
expect(screen.getByTestId("last-activity-card")).toBeTruthy();
```

Do not assert text like `"Sin carreras registradas todavía"` if that text is emitted by the mock itself.

- [ ] **Step 6: Verify cleanup**

Run:

```powershell
corepack pnpm --dir frontend test -- HubApp Topbar DashboardPage NextRaceCard
corepack pnpm --dir frontend exec tsc -b
```

Expected: PASS / OK.

---

## Task 2: TelemetryPage v5.2 placeholder honesto

**Files:**
- Create: `frontend/src/hub/pages/TelemetryPage.tsx`
- Create: `frontend/src/hub/pages/TelemetryPage.test.tsx`
- Modify: `frontend/src/hub/HubApp.tsx`
- Modify: `frontend/src/hub/HubApp.test.tsx`

- [ ] **Step 1: Create the failing tests**

Create `frontend/src/hub/pages/TelemetryPage.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TelemetryPage } from "./TelemetryPage";

afterEach(() => cleanup());

describe("TelemetryPage", () => {
  it("renders an honest telemetry placeholder", () => {
    render(<TelemetryPage />);

    expect(screen.getByRole("heading", { name: "Telemetría" })).toBeTruthy();
    expect(screen.getByText(/en desarrollo/i)).toBeTruthy();
    expect(screen.getByText(/velocidad, rpm, throttle, freno/i)).toBeTruthy();
  });

  it("does not promise fake dates or live data", () => {
    render(<TelemetryPage />);

    expect(screen.queryByText(/Q1 2027/i)).toBeNull();
    expect(screen.queryByText(/datos reales conectados/i)).toBeNull();
    expect(screen.queryByText(/iRating/i)).toBeNull();
  });
});
```

Run:

```powershell
corepack pnpm --dir frontend test -- TelemetryPage
```

Expected: FAIL because `TelemetryPage` does not exist.

- [ ] **Step 2: Implement TelemetryPage**

Create `frontend/src/hub/pages/TelemetryPage.tsx`:

```tsx
import { V52SectionHeader } from "../components/V52SectionHeader";
import { V52InfoCard } from "../components/V52InfoCard";

export function TelemetryPage() {
  return (
    <div className="flex flex-col gap-5">
      <V52SectionHeader
        title="Telemetría"
        description="Herramientas de lectura y análisis de datos del simulador. Esta sección está en desarrollo y no muestra datos inventados."
      />

      <section className="card-sleek rounded-2xl p-8 min-h-[420px] flex flex-col items-center justify-center text-center">
        <span className="v52-eyebrow">Telemetría</span>
        <h1 className="font-display font-bold text-4xl text-white tracking-tight mt-3">
          Próximamente
        </h1>
        <p className="text-sm text-vantare-textMuted mt-4 max-w-xl leading-relaxed">
          Aquí verás gráficas en tiempo real de velocidad, rpm, throttle, freno,
          g-force y tiempos por vuelta cuando el módulo esté conectado a datos reales.
        </p>
        <span className="mt-7 text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.28em]">
          En desarrollo
        </span>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <V52InfoCard
          tone="blue"
          label="Fuente"
          title="LMU primero"
          body="La beta mantiene LMU como fuente principal antes de ampliar a otros simuladores."
        />
        <V52InfoCard
          tone="green"
          label="Datos"
          title="Sin datos inventados"
          body="Los paneles de telemetría solo se activarán cuando exista fuente real o fixture explícito."
        />
        <V52InfoCard
          tone="amber"
          label="Estado"
          title="Módulo pendiente"
          body="El diseño queda preparado; el cableado funcional se hará en una fase separada."
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire TelemetryPage in HubApp**

In `frontend/src/hub/HubApp.tsx`, import:

```tsx
import { TelemetryPage } from './pages/TelemetryPage';
```

Replace the inline telemetry placeholder:

```tsx
{section === "telemetry" && <TelemetryPage />}
```

- [ ] **Step 4: Add HubApp navigation assertion**

In `frontend/src/hub/HubApp.test.tsx`, add a test matching the existing sidebar navigation style:

```tsx
it("renders Telemetry page when telemetry section is selected", () => {
  setLicense({ state: "active", entitlements: ["overlays"], email: "test@example.com" });

  render(<HubApp />);
  fireEvent.click(screen.getByTestId("v52-sidebar-telemetry"));

  expect(screen.getByRole("heading", { name: "Telemetría" })).toBeTruthy();
  expect(screen.getByText(/en desarrollo/i)).toBeTruthy();
});
```

- [ ] **Step 5: Verify TelemetryPage**

Run:

```powershell
corepack pnpm --dir frontend test -- TelemetryPage HubApp
corepack pnpm --dir frontend exec tsc -b
```

Expected: PASS / OK.

---

## Task 3: Overlays Studio home v5.2

**Files:**
- Create: `frontend/src/hub/overlays/V52OverlaysHome.tsx`
- Create: `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`
- Modify: `frontend/src/hub/pages/OverlaysStudioPage.tsx`
- Modify: `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`

- [ ] **Step 1: Write V52OverlaysHome tests**

Create `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V52OverlaysHome } from "./V52OverlaysHome";

afterEach(() => cleanup());

describe("V52OverlaysHome", () => {
  it("renders the four Overlays Studio entry cards", () => {
    render(
      <V52OverlaysHome
        profilesCount={4}
        onOpenWidgets={vi.fn()}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Overlays Studio" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Widgets" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recomendados por Vantare" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Comunidad" })).toBeTruthy();
  });

  it("calls the correct callbacks from primary buttons", () => {
    const onOpenWidgets = vi.fn();
    const onOpenOwnProfiles = vi.fn();
    const onOpenRecommended = vi.fn();
    const onOpenCommunity = vi.fn();

    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenWidgets={onOpenWidgets}
        onOpenOwnProfiles={onOpenOwnProfiles}
        onOpenRecommended={onOpenRecommended}
        onOpenCommunity={onOpenCommunity}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Configurar widgets" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver mis perfiles" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver recomendados" }));
    fireEvent.click(screen.getByRole("button", { name: "Explorar comunidad" }));

    expect(onOpenWidgets).toHaveBeenCalledTimes(1);
    expect(onOpenOwnProfiles).toHaveBeenCalledTimes(1);
    expect(onOpenRecommended).toHaveBeenCalledTimes(1);
    expect(onOpenCommunity).toHaveBeenCalledTimes(1);
  });

  it("does not render fake profile counts", () => {
    render(
      <V52OverlaysHome
        profilesCount={0}
        onOpenWidgets={vi.fn()}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
      />,
    );

    expect(screen.queryByText(/4 perfiles · 3 layouts activos/i)).toBeNull();
    expect(screen.getByText(/0 perfiles propios/i)).toBeTruthy();
  });
});
```

Run:

```powershell
corepack pnpm --dir frontend test -- V52OverlaysHome
```

Expected: FAIL because file does not exist.

- [ ] **Step 2: Implement V52OverlaysHome**

Create `frontend/src/hub/overlays/V52OverlaysHome.tsx`:

```tsx
import { V52SectionHeader } from "../components/V52SectionHeader";

type V52OverlaysHomeProps = {
  profilesCount: number;
  onOpenWidgets: () => void;
  onOpenOwnProfiles: () => void;
  onOpenRecommended: () => void;
  onOpenCommunity: () => void;
};

function EntryCard({
  eyebrow,
  title,
  body,
  meta,
  button,
  onClick,
}: {
  eyebrow: string;
  title: string;
  body: string;
  meta: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <article className="card-sleek rounded-xl p-5 flex flex-col gap-4">
      <div>
        <span className="v52-eyebrow">{eyebrow}</span>
        <h2 className="font-display font-bold text-xl text-white tracking-tight mt-3">
          {title}
        </h2>
        <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed">
          {body}
        </p>
        <p className="text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.18em] mt-3">
          {meta}
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="mt-auto rounded-lg bg-vantare-red-600 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-white hover:bg-vantare-red-500 transition-colors"
      >
        {button}
      </button>
    </article>
  );
}

export function V52OverlaysHome({
  profilesCount,
  onOpenWidgets,
  onOpenOwnProfiles,
  onOpenRecommended,
  onOpenCommunity,
}: V52OverlaysHomeProps) {
  return (
    <div className="flex flex-col gap-5">
      <V52SectionHeader
        title="Overlays Studio"
        description="Elige qué quieres editar. Widgets controla apariencia y comportamiento; Mis perfiles controla layouts y colocación."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EntryCard
          eyebrow="Editor de widgets"
          title="Widgets"
          body="Edita apariencia, comportamiento, visibilidad y estilo de los widgets disponibles."
          meta="Widgets disponibles · categorías estables y tester"
          button="Configurar widgets"
          onClick={onOpenWidgets}
        />
        <EntryCard
          eyebrow={`${profilesCount} perfiles propios`}
          title="Mis perfiles"
          body="Gestiona tus perfiles propios y entra en el editor de colocación con preview real de cada layout."
          meta={`${profilesCount} perfiles propios`}
          button="Ver mis perfiles"
          onClick={onOpenOwnProfiles}
        />
        <EntryCard
          eyebrow="Base recomendada"
          title="Recomendados por Vantare"
          body="Guarda una copia propia de un perfil recomendado y úsalo como punto de partida."
          meta="Perfiles oficiales incluidos"
          button="Ver recomendados"
          onClick={onOpenRecommended}
        />
        <EntryCard
          eyebrow="Futuro"
          title="Comunidad"
          body="Más adelante podrás descubrir overlays compartidos por la comunidad."
          meta="Sin marketplace en beta"
          button="Explorar comunidad"
          onClick={onOpenCommunity}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire V52OverlaysHome in OverlaysStudioPage**

In `frontend/src/hub/pages/OverlaysStudioPage.tsx`, import:

```tsx
import { V52OverlaysHome } from "../overlays/V52OverlaysHome";
```

Replace only the final `StudioHome` render branch. Keep `WidgetStudio`, `LayoutStudio`, `OwnProfilesView`, `RecommendedProfilesView`, `CommunityComingSoonView` untouched.

Expected final home branch:

```tsx
return (
  <V52OverlaysHome
    profilesCount={studio.profiles.length}
    onOpenWidgets={openWidgetStudio}
    onOpenOwnProfiles={() => setMode("ownProfiles")}
    onOpenRecommended={() => setMode("recommended")}
    onOpenCommunity={() => setMode("community")}
  />
);
```

- [ ] **Step 4: Update OverlaysStudioPage tests**

In `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`, keep tests for existing flows. Add or update a home test:

```tsx
it("renders the v5.2 Overlays Studio home", () => {
  render(<OverlaysStudioPage />);

  expect(screen.getByRole("heading", { name: "Overlays Studio" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Configurar widgets" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ver mis perfiles" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ver recomendados" })).toBeTruthy();
});
```

- [ ] **Step 5: Verify Overlays page**

Run:

```powershell
corepack pnpm --dir frontend test -- V52OverlaysHome OverlaysStudioPage
corepack pnpm --dir frontend exec tsc -b
```

Expected: PASS / OK.

---

## Task 4: EngineerPage v5.2 visual pass

**Files:**
- Modify: `frontend/src/hub/pages/EngineerPage.tsx`
- Modify: `frontend/src/hub/pages/EngineerPage.test.tsx`

- [ ] **Step 1: Confirm current tests before visual change**

Run:

```powershell
corepack pnpm --dir frontend test -- EngineerPage
```

Expected: PASS.

- [ ] **Step 2: Add anti-fake test expectations**

In `frontend/src/hub/pages/EngineerPage.test.tsx`, add:

```tsx
it("does not render unimplemented fake voice profile data", () => {
  render(<EngineerPage />);

  expect(screen.queryByText(/Carlos \(Ingeniero\)/i)).toBeNull();
  expect(screen.queryByText(/12 perfiles compatibles/i)).toBeNull();
  expect(screen.queryByText(/LMU, iRacing y Assetto Corsa/i)).toBeNull();
});
```

If existing tests already dispatch `engineer:status`, keep them; this new test protects against copying fake content from the HTML.

- [ ] **Step 3: Reorganize EngineerPage markup**

Keep all existing state and handlers:

```tsx
const [status, setStatus] = useState<EngineerStatus>(INITIAL_STATUS);
const [notifications, setNotifications] = useState<EngineerNotification[]>([]);
```

Keep these event emissions unchanged:

```tsx
Events.Emit('engineer:status:get');
Events.Emit('engineer:enabled:set', !status.enabled);
Events.Emit('engineer:spotter:set', !status.spotterEnabled);
Events.Emit('engineer:source:set', e.target.value);
Events.Emit('engineer:sensitivity:set', e.target.value);
```

Update the outer render to v5.2:

```tsx
return (
  <div className="flex flex-col gap-5">
    <V52SectionHeader
      title="Ingeniero Vantare"
      description="Configura el ingeniero de pista y el spotter. En beta, el módulo trabaja con el estado real que emite el backend."
    />

    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
      <section className="xl:col-span-1 flex flex-col gap-4">
        {/* mantener controles reales: estado, enabled, spotter, source, sensitivity */}
      </section>
      <section className="xl:col-span-2 flex flex-col gap-4">
        {/* mantener timeline real de notifications */}
      </section>
    </div>
  </div>
);
```

Use `card-sleek rounded-xl p-5` for panels and `v52-eyebrow` for labels. Do not add controls not wired to backend.

- [ ] **Step 4: Keep empty notification state honest**

The empty state text should remain equivalent to:

```tsx
<span className="text-xs text-vantare-textDim font-mono">
  Esperando mensajes de telemetría...
</span>
```

- [ ] **Step 5: Verify EngineerPage**

Run:

```powershell
corepack pnpm --dir frontend test -- EngineerPage
corepack pnpm --dir frontend exec tsc -b
```

Expected: PASS / OK.

---

## Task 5: SettingsPage v5.2 visual wrapper, not full SETTINGS-01

**Files:**
- Modify: `frontend/src/hub/pages/SettingsPage.tsx`
- Modify: `frontend/src/hub/pages/SettingsPage.test.tsx`

- [ ] **Step 1: Confirm current Settings tests**

Run:

```powershell
corepack pnpm --dir frontend test -- SettingsPage
```

Expected: PASS.

- [ ] **Step 2: Add explicit no-full-tabs test**

In `frontend/src/hub/pages/SettingsPage.test.tsx`, add:

```tsx
it("renders v5.2 settings shell without hiding existing functional sections", () => {
  render(<SettingsPage />);

  expect(screen.getByRole("heading", { name: "Ajustes" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Cuenta" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Soporte Técnico y Diagnósticos" })).toBeDefined();
  expect(screen.getByLabelText("Solo releases estables")).toBeDefined();
  expect(screen.getByLabelText("Incluir pre-releases")).toBeDefined();
});
```

This protects the rule: visual wrapper only, no full `SETTINGS-01` tab migration.

- [ ] **Step 3: Wrap SettingsPage with v5.2 section header**

In `frontend/src/hub/pages/SettingsPage.tsx`, import:

```tsx
import { V52SectionHeader } from '../components/V52SectionHeader';
```

Replace the outer header block with:

```tsx
<div className="flex flex-col gap-5">
  <V52SectionHeader
    title="Ajustes"
    description="Cuenta, OBS, actualizaciones, atajos y diagnosticos. Las pestanas profundas quedan para SETTINGS-01."
  />
  <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
    {/* existing content */}
  </div>
</div>
```

Keep existing controls and event handlers intact:

- `handleChannelChange`
- `handleInstall`
- `handleIgnore`
- `handleRefresh`
- `handleDeltaModeChange`
- `handleCpuToggle`
- `handleHotkeyChange`
- `handleSaveHotkeys`
- `handleCopyDiagnostics`

- [ ] **Step 4: Replace broad visual containers only**

When changing classes, keep labels and accessible text stable:

- Preserve `"Solo releases estables"`.
- Preserve `"Incluir pre-releases"`.
- Preserve `"Copiar paquete de diagnóstico"`.
- Preserve `AccountSettings`.
- Preserve `ObsSetup` and OBS URL behavior.

Allowed class changes:

```tsx
className="card-sleek rounded-xl p-5"
```

Forbidden changes:

- Do not split into real tabs with hidden panels.
- Do not change `Events.Emit('settings:save', ...)` payloads.
- Do not rename event names.
- Do not remove diagnostics/updater tests.

- [ ] **Step 5: Verify SettingsPage**

Run:

```powershell
corepack pnpm --dir frontend test -- SettingsPage
corepack pnpm --dir frontend exec tsc -b
```

Expected: PASS / OK.

---

## Task 6: LauncherPage visual delta against HTML, still honest

**Files:**
- Modify: `frontend/src/hub/pages/LauncherPage.tsx`
- Modify: `frontend/src/hub/pages/LauncherPage.test.tsx`

- [ ] **Step 1: Add anti-fake regression tests**

In `frontend/src/hub/pages/LauncherPage.test.tsx`, extend the existing anti-fake test:

```tsx
it("does not render fake detected app versions or fake launch profiles", () => {
  render(<LauncherPage />);

  expect(screen.queryByText(/8 \/ 8/i)).toBeNull();
  expect(screen.queryByText(/CrewChief/i)).toBeNull();
  expect(screen.queryByText(/Spotify/i)).toBeNull();
  expect(screen.queryByText(/v30\.2/i)).toBeNull();
  expect(screen.queryByText(/Último uso/i)).toBeNull();
  expect(screen.queryByText(/Endurance/i)).toBeNull();
});
```

- [ ] **Step 2: Keep LauncherPage honest**

Do not copy the fake app list from `hub_main_v5.2-launcher.html`. The current structure is acceptable:

- `LauncherCard` real.
- Disabled `"Perfiles de lanzamiento avanzados"`.
- Disabled `"Apps asociadas"`.

Allowed improvement: add a compact helper text matching v5.2 copy:

```tsx
<p className="text-[10px] font-mono text-vantare-textDim uppercase tracking-[.18em]">
  LMU disponible · Apps asociadas pendientes de spec multi-sim
</p>
```

- [ ] **Step 3: Verify LauncherPage**

Run:

```powershell
corepack pnpm --dir frontend test -- LauncherPage
```

Expected: PASS.

---

## Task 7: Documentation sync

**Files:**
- Modify: `docs/current-plan.md`
- Modify: `docs/roadmap-execution-board.md`
- Modify: `docs/release-roadmap-execution-index.md`
- Modify: `docs/technical-debt.md`

- [ ] **Step 1: Update current-plan**

Add a new note near the existing HUB-05 block:

```markdown
Nota HUB-05-B (2026-07-01):
- Plan guardado en `docs/superpowers/plans/2026-06-30-hub-05b-v52-remaining-pages.md`.
- Objetivo: integrar los HTML v5.2 restantes por paginas internas: Overlays home, Ingeniero, Telemetria, Ajustes wrapper y ajuste honesto de Launcher.
- Scope: visual/cableado minimo. No toca Go, runtime overlays, Calendar avanzado, Settings tabs profundas ni nuevos datos fake.
- Orden recomendado: P3 cleanup barato -> Telemetria -> Overlays home -> Ingeniero -> Ajustes wrapper -> Launcher polish -> review/commit selectivo.
```

Update the "Siguiente trabajo recomendado" block so item 1 becomes HUB-05-B implementation/review, not HUB-05 review.

- [ ] **Step 2: Update execution board**

In `docs/roadmap-execution-board.md`, add:

```markdown
| HUB-05-B | 0.1.x | Integrar paginas internas v5.2: Overlays home, Ingeniero, Telemetria, Ajustes wrapper y Launcher polish | Planned | Worker frontend | Codex/GLM | Si |
```

- [ ] **Step 3: Update release roadmap index**

In `docs/release-roadmap-execution-index.md`, add a tracking bullet:

```markdown
- `HUB-05-B`: planificado — integrar paginas internas v5.2 restantes sin tocar logica core ni calendario avanzado.
```

- [ ] **Step 4: Update technical debt**

In `docs/technical-debt.md`, update `TD-050` if Task 1 closes any subitems. For example, if casts/import/test are fixed:

```markdown
- Cierre parcial 2026-07-01: casts `as Section`, `Topbar.activeSection: string`, import muerto de `EMPTY_CALENDAR` y test complaciente de `DashboardPage` cerrados en HUB-05-B. Siguen abiertos: entrada triple Launcher, Lite mode en primitivas v5.2, dock top hardcoded y limpieza legacy `EmptyNextRace`/`EmptyActivity`.
```

- [ ] **Step 5: Verify docs**

Run:

```powershell
git diff --check -- docs/current-plan.md docs/roadmap-execution-board.md docs/release-roadmap-execution-index.md docs/technical-debt.md
rg -n "HUB-05-B|SETTINGS-01|CALENDAR-02|TD-050" docs/current-plan.md docs/roadmap-execution-board.md docs/release-roadmap-execution-index.md docs/technical-debt.md
```

Expected: no whitespace errors; HUB-05-B appears in all relevant docs.

---

## Task 8: Final verification

**Files:** no new files.

- [ ] **Step 1: Run focused page tests**

```powershell
corepack pnpm --dir frontend test -- HubApp Topbar DashboardPage TelemetryPage V52OverlaysHome OverlaysStudioPage EngineerPage SettingsPage LauncherPage NextRaceCard LastActivityCard
```

Expected: PASS.

- [ ] **Step 2: Run full frontend suite**

```powershell
corepack pnpm --dir frontend test
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript**

```powershell
corepack pnpm --dir frontend exec tsc -b
```

Expected: OK.

- [ ] **Step 4: Run build**

```powershell
corepack pnpm --dir frontend build
```

Expected: OK. Chunk-size warning is pre-existing and not a failure.

- [ ] **Step 5: Run lint**

```powershell
corepack pnpm --dir frontend lint
```

Expected: OK. `.eslintignore` deprecation warning is pre-existing and not a failure.

- [ ] **Step 6: Check git diff**

```powershell
git diff --check
git status --short
```

Expected:

- No whitespace errors in files touched by HUB-05-B.
- Dirty files outside this plan remain unstaged.

---

## Commit strategy

Recommended commits:

1. Cleanup + Telemetry:

```powershell
git add frontend/src/hub/HubApp.tsx frontend/src/hub/HubApp.test.tsx frontend/src/hub/components/Topbar.tsx frontend/src/hub/components/Topbar.test.tsx frontend/src/hub/components/NextRaceCard.tsx frontend/src/hub/pages/DashboardPage.test.tsx frontend/src/hub/pages/TelemetryPage.tsx frontend/src/hub/pages/TelemetryPage.test.tsx
git commit -m "fix(hub): tighten v5.2 navigation and telemetry page"
```

2. Remaining pages:

```powershell
git add frontend/src/hub/overlays/V52OverlaysHome.tsx frontend/src/hub/overlays/V52OverlaysHome.test.tsx frontend/src/hub/pages/OverlaysStudioPage.tsx frontend/src/hub/pages/OverlaysStudioPage.test.tsx frontend/src/hub/pages/EngineerPage.tsx frontend/src/hub/pages/EngineerPage.test.tsx frontend/src/hub/pages/SettingsPage.tsx frontend/src/hub/pages/SettingsPage.test.tsx frontend/src/hub/pages/LauncherPage.tsx frontend/src/hub/pages/LauncherPage.test.tsx
git commit -m "feat(hub): apply v5.2 visuals to remaining pages"
```

3. Docs:

```powershell
git add docs/current-plan.md docs/roadmap-execution-board.md docs/release-roadmap-execution-index.md docs/technical-debt.md
git commit -m "docs(hub): plan and track hub v5.2 page integration"
```

If `RecommendedProfilesView*` and `OverlaysStudioPage.test.tsx` already contain the unrelated copy change "Guardar como overlay propio", do not include them in commit 2 unless the final diff is explicitly reviewed as part of Overlays home integration. Prefer a separate commit for that copy fix.

---

## Manual verification checklist

1. Start app with the configured build path (not stale exe).
2. Confirm topbar/sidebar still show: Hub, Overlays Studio, Launcher, Ingeniero, Telemetria, Ajustes.
3. Click Telemetria: see v5.2 placeholder; no Q1 2027 promise and no fake metrics.
4. Click Overlays Studio: see v5.2 home cards; clicking each card still opens the existing subflow.
5. In Overlays Studio, verify WidgetStudio and LayoutStudio still work and were not visually rewritten.
6. Click Ingeniero: controls still emit events; notifications list still updates; no fake voice/profile data.
7. Click Ajustes: account, OBS URL, updater, hotkeys and diagnostics still work.
8. Click Launcher: LMU launcher still configures/opens; no fake detected app list.
9. Resize to narrow width: no content overlap, dock hidden at small sizes.
10. Run one smoke route: Dashboard -> Overlays Studio -> Launcher -> Ajustes -> Dashboard.

## Stop conditions

Stop and report instead of continuing if:

- Implementing Settings requires a full tab system. That belongs to `SETTINGS-01`, not HUB-05-B.
- Overlays home changes require touching `WidgetStudio` or `LayoutStudio`.
- Engineer visual pass requires new backend events.
- Telemetry page starts needing real charts/data.
- Any worker wants to touch Go.
- Existing dirty files conflict with the planned changes and cannot be isolated with selective staging.

## Self-review checklist for the implementer

- Every visible number is real, derived from props/state, or clearly a placeholder. No fake app versions, fake race names, fake telemetry stats, fake profile counts.
- All pages use the v5.2 shell primitives consistently.
- Existing functional tests still pass.
- Tests assert user-observable behavior, not only mocked text.
- No hidden dependency on HTML mockups after implementation.
- No new dependency added.
- No files outside scope staged.

## Worker prompt

```markdown
Actua como worker frontend senior para Vantare Simracing Suite.

Tarea: HUB-05-B — integrar paginas internas v5.2 restantes.

Usa obligatoriamente:
- superpowers:subagent-driven-development o superpowers:executing-plans.
- Sigue este plan: docs/superpowers/plans/2026-06-30-hub-05b-v52-remaining-pages.md.

Lee antes de tocar codigo:
- AGENTS.md
- docs/current-plan.md
- docs/roadmap-execution-board.md
- docs/release-roadmap-execution-index.md
- docs/technical-debt.md
- HTMLs de referencia:
  - ../hub_main_v5.2-overlays.html
  - ../hub_main_v5.2-engineer.html
  - ../hub_main_v5.2-telemetry.html
  - ../hub_main_v5.2-settings.html
  - ../hub_main_v5.2-launcher.html

Reglas duras:
- No tocar Go, workflows, build, VERSION, auth/licensing, overlay runtime, WidgetStudio, LayoutStudio, CompositeApp, ObsOverlayApp.
- No implementar CALENDAR-02 ni SETTINGS-01 completo.
- No copiar fake data de los HTMLs.
- No commitear HTML mockups/screenshots/fotos.
- Mantener cambios pequenos y tests por pagina.
- Si hay cambios fuera de scope ya presentes, no revertirlos y no mezclarlos.

Orden:
1. Task 1 cleanup P3.
2. Task 2 TelemetryPage.
3. Task 3 Overlays home.
4. Task 4 Engineer visual pass.
5. Task 5 Settings wrapper.
6. Task 6 Launcher polish.
7. Task 7 docs.
8. Task 8 checks.

Checks obligatorios:
- corepack pnpm --dir frontend test -- HubApp Topbar DashboardPage TelemetryPage V52OverlaysHome OverlaysStudioPage EngineerPage SettingsPage LauncherPage NextRaceCard LastActivityCard
- corepack pnpm --dir frontend test
- corepack pnpm --dir frontend exec tsc -b
- corepack pnpm --dir frontend build
- corepack pnpm --dir frontend lint
- git diff --check

Reporte final en español:
- archivos creados/modificados;
- checks ejecutados y resultado;
- checks no ejecutados y motivo;
- riesgos restantes;
- verificacion manual;
- git add selectivo recomendado;
- confirmacion de que no se tocaron archivos prohibidos.
```

