# Dashboard Redesign — Plan de Implementación

## TL;DR

> **Quick Summary**: Rediseñar el DashboardPage de Vantare Overlays como un hub central estilo videojuego con 5 paneles glassmorphism asimétricos, animaciones de entrada pesadas, partículas de fondo canvas, y datos en vivo. Cambiar el color primary CSS de azul a borgoña oscuro.
>
> **Deliverables**:
> - `DashboardPage.tsx` reconstruido con layout asimétrico (Layout B)
> - `DashboardPanel.tsx` — componente reutilizable de panel glassmorphism
> - 5 paneles de contenido: `SimStatusPanel`, `OverlaysPanel`, `ThemesPanel`, `AccountPanel`, `SettingsPanel`
> - `CanvasParticles.tsx` — efecto de partículas de fondo
> - `dashboard.css` — estilos avanzados glassmorphism + animaciones
> - Actualización de `theme-tokens.css` (primary fallback a borgoña)
> - Tests con `@testing-library/react`
> - Storybook actualizado
>
> **Estimated Effort**: Medium (10-15 tasks)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: CSS tokens → DashboardPanel → Panel contents → Integration → Tests → Stories

---

## Context

### Original Request
El usuario quiere un dashboard que sea el hub central de la app Vantare Overlays. Debe tener un patrón atractivo parecido a un videojuego, con paneles de vidrio (glassmorphism) estilo oscuro avanzado. Paneles mínimos: SIM Status, Overlays, Themes, Account, Settings.

### Interview Summary
**Key Discussions** (5 rondas de preguntas + Metis gap analysis):
- **Estilo**: Glassmorphism oscuro avanzado, manteniendo paleta gris/oscura actual pero elevada. Acento borgoña oscuro.
- **Layout B**: Overlays (hero izquierda) > SIM Status (derecha arriba) > Themes/Account/Settings (fila de 3 abajo)
- **Navegación**: Paneles completos como enlaces clickeables vía react-router
- **Animaciones**: Stagger con escala (0.8→1.0) en mount inicial. Hover glow. Partículas canvas sutiles.
- **Color**: CSS fallback primary cambia a burgundy (#7f1d1d). Temas existentes intactos.
- **Datos**: Solo datos disponibles (useSimState tiene {connected, simName}). Paneles suscritos en vivo.
- **Loading**: Skeleton shimmer en paneles mientras cargan datos async.
- **Responsive**: Collapse a 2-col (<1024px), 1-col (<640px)
- **Tests**: @testing-library/react, 5 nuevos data-testids
- **Test IDs**: `dashboard-panel-sim`, `dashboard-panel-overlays`, `dashboard-panel-themes`, `dashboard-panel-account`, `dashboard-panel-settings`

### Metis Review
**Identified Gaps** (all resolved):
- **Global primary color scope**: Pasó de "cambiar todo" a "solo CSS fallback en theme-tokens.css. Temas intactos."
- **useSimState data**: No tiene sessionTime/driverName → panel muestra solo datos disponibles
- **Test pattern**: renderToString existente ≠ @testing-library/react → se introduce nuevo patrón para dashboard
- **Overlay windows tracking**: No hay store → se usa getOverlayWindows() IPC directo desde hook
- **Animation replay**: Solo en mount inicial, no al re-navegar
- **Loading states**: Skeleton shimmer mientras cargan datos async

---

## Work Objectives

### Core Objective
Rediseñar el Dashboard principal de Vantare Overlays como un hub central con 5 paneles glassmorphism asimétricos, animaciones pesadas, partículas de fondo, y datos en vivo — que sirva como navegación principal a toda la app.

### Concrete Deliverables
- `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx` — reconstruido
- `apps/desktop/src/renderer/hub/components/DashboardPanel.tsx` — nuevo
- `apps/desktop/src/renderer/hub/components/panels/SimStatusPanel.tsx` — nuevo
- `apps/desktop/src/renderer/hub/components/panels/OverlaysPanel.tsx` — nuevo
- `apps/desktop/src/renderer/hub/components/panels/ThemesPanel.tsx` — nuevo
- `apps/desktop/src/renderer/hub/components/panels/AccountPanel.tsx` — nuevo
- `apps/desktop/src/renderer/hub/components/panels/SettingsPanel.tsx` — nuevo
- `apps/desktop/src/renderer/hub/components/CanvasParticles.tsx` — nuevo
- `apps/desktop/src/renderer/hub/styles/dashboard.css` — nuevo
- `apps/desktop/src/renderer/styles/theme-tokens.css` — actualizado (primary fallback)
- `apps/desktop/src/renderer/hub/__tests__/DashboardPage.test.tsx` — nuevo
- `apps/desktop/src/renderer/hub/__stories__/DashboardPage.stories.tsx` — actualizado

### Definition of Done
- [ ] DashboardPage renderiza 5 paneles en layout asimétrico (Layout B)
- [ ] Cada panel es clickeable y navega a su ruta correcta
- [ ] Animaciones stagger de entrada funcionan en mount inicial
- [ ] Canvas particles se renderizan en el fondo (50-80 partículas, 30fps)
- [ ] Hover glow activo en cada panel
- [ ] Responsive: 3 layouts (desktop >1024px, tablet 640-1024px, mobile <640px)
- [ ] Skeleton shimmer durante carga de datos
- [ ] Tests pasan: `vitest run`
- [ ] Storybook stories actualizadas: `build-storybook` exitoso
- [ ] `data-testid` nuevos funcionando

### Must Have
- Layout B asimétrico funcional en 3 breakpoints
- Cada panel navega a su ruta correspondiente
- Glassmorphism avanzado (backdrop-filter, bordes con glow, profundidad)
- Animación stagger de entrada (escala 0.8→1.0 + fade)
- Hover glow (box-shadow con color borgoña)
- Canvas particles sutiles (50-80, ~30fps)
- Skeleton shimmer loading states
- Datos en vivo (useSimState, settings-store, etc.)
- Tests unitarios para cada componente nuevo
- Nuevos data-testids en todos los paneles

### Must NOT Have (Guardrails)
- NO modificar HubLayout, App.tsx routes, o sidebar navigation
- NO crear nuevos Zustand stores (usar stores existentes + IPC calls directas)
- NO cambiar temas existentes (dark.json, blood.json, midnight.json)
- NO agregar controles/settings para particles
- NO partículas interactivas (solo decorativas)
- NO animaciones flotantes en paneles
- NO E2E tests (solo unit/integration)
- NO crear stories individuales para cada panel (solo DashboardPage.stories)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: ✅ YES (Vitest + @testing-library/react)
- **Automated tests**: Tests-after (unit tests for each component)
- **Framework**: Vitest + @testing-library/react (new pattern for dashboard code)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate to dashboard, interact with panels, assert DOM elements
- **Component Tests**: Use `vitest run` — Verify rendering, navigation, animations
- **Visual**: Storybook build verification

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - start immediately):
├── Task 1: Update CSS tokens + create dashboard.css
├── Task 2: Create CanvasParticles component
├── Task 3: Create DashboardPanel reusable component
└── Task 4: Create custom hooks for panel data (useOverlayWindows, useThemePreview, useAccountStatus)

Wave 2 (Panel Contents - MAX PARALLEL):
├── Task 5: SimStatusPanel
├── Task 6: OverlaysPanel
├── Task 7: ThemesPanel
├── Task 8: AccountPanel
└── Task 9: SettingsPanel

Wave 3 (Integration):
├── Task 10: Rebuild DashboardPage with Layout B + responsive
├── Task 11: Entrance animation system (stagger scale + fade)
└── Task 12: Hover glow + particle integration

Wave 4 (Validation):
├── Task 13: Vitest tests for all components
├── Task 14: Update Storybook stories
├── Task F1: Plan Compliance Audit (oracle)
├── Task F2: Code Quality Review (unspecified-high)
├── Task F3: Real Manual QA (unspecified-high)
└── Task F4: Scope Fidelity Check (deep)

Critical Path: Task 1 → Task 3 → Task 10 → Task 13 → F1-F4 → user okay
Max Concurrent: 5 (Wave 2)
```

### Dependency Matrix
- **1-4**: `-` `-` `5-9, 10` (Wave 1 → Wave 2, 3)
- **5-9**: `1, 3, 4` `-` `10` (panel CSS + base component + hooks → integration)
- **10-12**: `1, 3, 4, 5-9` `-` `13, 14` (all panels → tests + stories)
- **13, 14**: `10-12` `-` `F1-F4` (integration → final verify)
- **F1-F4**: `13, 14` `-` Done (final review)

### Agent Dispatch Summary
- **Wave 1**: 4 tasks → `visual-engineering`
- **Wave 2**: 5 tasks → `visual-engineering`
- **Wave 3**: 3 tasks → `visual-engineering`
- **Wave 4**: 2 tasks → `quick` (tests), `writing` (stories)
- **FINAL**: 4 tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

---

## TODOs

- [x] 1. **Update CSS tokens + create dashboard.css**

  **What to do**:
  - In `theme-tokens.css`: Change `--color-primary` from `#3b82f6` to `#7f1d1d`, `--color-primary-hover` to `#991b1b`, `--color-primary-muted` to `#7f1d1d33`, `--shadow-glow` to `0 0 20px #7f1d1d40`
  - Create new file `apps/desktop/src/renderer/hub/styles/dashboard.css` with:
    - `.dashboard-panel` — advanced glassmorphism class (backdrop-filter, gradient border, inner shadow, transition)
    - `.dashboard-panel-glow` — hover glow effect using box-shadow with var(--color-primary)
    - `.dashboard-panel-skeleton` — skeleton shimmer animation (@keyframes shimmer)
    - `.dashboard-layout-desktop` — CSS grid for Layout B (desktop: overlay hero left, sim right, 3 small bottom)
    - `.dashboard-layout-tablet` — 2-col grid for <1024px
    - `.dashboard-layout-mobile` — 1-col for <640px
    - `.particles-canvas` — fixed positioning, pointer-events none, z-index low
    - Stagger animation keyframes: `@keyframes panelEnter` (scale 0.8→1.0 + opacity 0→1)

  **Must NOT do**:
  - NO modificar dark.json/blood.json/midnight.json (temas existentes intactos)
  - NO eliminar la clase `.glass-panel` existente (se sigue usando en otras páginas)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: CSS theming, animations, glassmorphism design
  - **Skills**: `tailwind` (Tailwind v4 patterns)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 6, 7, 8, 9, 10, 11, 12
  - **Blocked By**: None

  **References**:
  - `apps/desktop/src/renderer/styles/theme-tokens.css:1-73` — Current token structure to modify
  - `apps/desktop/src/renderer/styles/globals.css:12-16` — Current glass-panel class for reference
  - `apps/desktop/src/renderer/hub/__stories__/mock-vantare.ts` — Window mock for understanding test patterns

  **Acceptance Criteria**:
  - [ ] theme-tokens.css: --color-primary is now #7f1d1d
  - [ ] dashboard.css exists with all required classes
  - [ ] Skeleton shimmer keyframes defined
  - [ ] Panel enter keyframes defined (scale 0.8→1.0 + fade)
  - [ ] 3 layout grid classes defined

  **QA Scenarios**:
  ```
  Scenario: CSS tokens updated
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. grep '--color-primary: #7f1d1d' theme-tokens.css → match found
      2. grep '--color-primary-hover: #991b1b' theme-tokens.css → match found
    Expected Result: Both tokens updated to burgundy values
    Evidence: .omo/evidence/task-1-tokens-updated.txt

  Scenario: Dashboard CSS exists with all classes
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. grep 'dashboard-panel' dashboard.css → 3+ matches (base, glow, skeleton)
      2. grep '@keyframes panelEnter' dashboard.css → match found
      3. grep '@keyframes shimmer' dashboard.css → match found
    Expected Result: All required CSS classes and animations defined
    Evidence: .omo/evidence/task-1-css-classes.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add glassmorphism CSS tokens and animations`
  - Files: `apps/desktop/src/renderer/styles/theme-tokens.css`, `apps/desktop/src/renderer/hub/styles/dashboard.css`

- [x] 2. **Create CanvasParticles background component**

  **What to do**:
  - Create `apps/desktop/src/renderer/hub/components/CanvasParticles.tsx`
  - React component that renders a `<canvas>` element fixed to the viewport
  - On mount: initialize 50-80 small particles (2-3px circles, low opacity 0.1-0.3, white/pale color)
  - Each particle: random position, random velocity (very slow, ~0.2-0.5px/frame), random size
  - `requestAnimationFrame` loop capped at 30fps (throttle)
  - Pause animation loop on unmount (clean up RAF properly)
  - No interactivity — purely decorative, `pointer-events: none`
  - Canvas matches window size (resize handler)
  - z-index behind panels but above background

  **Must NOT do**:
  - NO particle interaction (hover, click, etc.)
  - NO settings/controls for particles
  - NO external dependencies (pure canvas API)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Canvas rendering, animation loop, performant particle system
  - **Skills evaluated but omitted**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 12 (particle integration)
  - **Blocked By**: None

  **References**:
  - Standard `requestAnimationFrame` + `canvas 2d context` API
  - `apps/desktop/src/renderer/styles/globals.css:12-16` — z-index context

  **Acceptance Criteria**:
  - [ ] CanvasParticles renders a `<canvas>` element
  - [ ] 50-80 particles visible floating slowly
  - [ ] RAF cleans up on unmount (no memory leaks)
  - [ ] Throttled at ~30fps
  - [ ] Resizes with window
  - [ ] pointer-events: none

  **QA Scenarios**:
  ```
  Scenario: CanvasParticles renders and animates
    Tool: Playwright
    Preconditions: Dashboard mounted
    Steps:
      1. Navigate to dashboard
      2. Assert canvas element exists with class particles-canvas
      3. Wait 500ms — check canvas has non-zero width/height
      4. Assert canvas has pointer-events: none
    Expected Result: Canvas exists, visible, non-interactive
    Evidence: .omo/evidence/task-2-canvas-mounted.png

  Scenario: Particles clean up on unmount
    Tool: interactive_bash (vitest)
    Preconditions: Test file exists
    Steps:
      1. Mount CanvasParticles
      2. Unmount component
      3. Assert RAF is cancelled (spy on cancelAnimationFrame)
    Expected Result: No memory leaks, RAF properly cleaned
    Evidence: .omo/evidence/task-2-raf-cleanup.txt
  ```

  **Commit**: YES (with Task 3, 4)
  - Message: `feat(dashboard): add CanvasParticles background component`

- [x] 3. **Create DashboardPanel reusable component**

  **What to do**:
  - Create `apps/desktop/src/renderer/hub/components/DashboardPanel.tsx`
  - Props interface:
    ```ts
    interface DashboardPanelProps {
      title: string;
      to: string;               // route for navigation
      testId: string;           // data-testid
      loading?: boolean;        // show skeleton
      variant?: 'hero' | 'medium' | 'small';  // size variant
      children: React.ReactNode;
      accentColor?: string;     // optional gradient accent
    }
    ```
  - Renders a `<Link>` wrapper (react-router-dom) containing:
    - Panel container with classes: `dashboard-panel dashboard-panel-{variant}`
    - Title bar with icon placeholder + title text
    - Content area (children)
    - When `loading=true`: show skeleton shimmer instead of children
  - On hover: apply `dashboard-panel-glow` class (box-shadow glow)
  - On click: navigate to `to` route
  - Stagger animation: each panel has `style={{ animationDelay: '${index * 0.1}s' }}` passed from parent

  **Must NOT do**:
  - NO router logic — navigation handled by <Link>
  - NO data fetching — presentational only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Reusable UI component with animations, glassmorphism, responsive sizing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5, 6, 7, 8, 9, 10
  - **Blocked By**: Task 1 (dashboard.css classes)

  **References**:
  - `apps/desktop/src/renderer/hub/HubLayout.tsx:105-122` — NavLink pattern for routing
  - `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx:34-120` — Current panel structure

  **Acceptance Criteria**:
  - [ ] DashboardPanel renders as a <Link> with correct `to` prop
  - [ ] Loading prop shows skeleton shimmer
  - [ ] Variant applies correct CSS class (hero/medium/small)
  - [ ] testId applied correctly
  - [ ] Children rendered inside content area

  **Commit**: YES (with Task 2, 4)

- [x] 4. **Create custom hooks for panel data**

  **What to do**:
  - Create `apps/desktop/src/renderer/hub/hooks/useOverlayWindows.ts`:
    - Calls `window.vantare.getOverlayWindows()` on mount
    - Subscribes to window state changes (poll or event)
    - Returns `{ total: number, active: number, openAll: () => void, closeAll: () => void }`
  - Create `apps/desktop/src/renderer/hub/hooks/useThemePreview.ts`:
    - Calls `window.vantare.getActiveTheme()` and `window.vantare.getThemes()` on mount
    - Returns `{ activeTheme: Theme | null, allThemes: Theme[] }`
  - Create `apps/desktop/src/renderer/hub/hooks/useAccountStatus.ts`:
    - Uses existing `useAuthStore` for user + session
    - Returns `{ user: User | null, session: Session | null, tier: string, isValid: boolean }`
  - Export all from `apps/desktop/src/renderer/hub/hooks/index.ts`

  **Must NOT do**:
  - NO new Zustand stores (use existing stores + IPC)
  - NO polling loops — use existing subscriptions where possible

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: React hooks, IPC integration, Zustand store usage

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 5, 6, 7, 8, 9
  - **Blocked By**: None

  **References**:
  - `apps/desktop/src/renderer/shared/stores/auth-store.ts` — Auth store pattern
  - `apps/desktop/src/renderer/hub/__stories__/mock-vantare.ts:39-40` — getOverlayWindows mock
  - `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx:16-25` — getActiveTheme usage pattern

  **Acceptance Criteria**:
  - [ ] useOverlayWindows returns { total, active, openAll, closeAll }
  - [ ] useThemePreview returns { activeTheme, allThemes }
  - [ ] useAccountStatus returns { user, session, tier, isValid }
  - [ ] Hooks directory created with index.ts barrel export

  **Commit**: YES (with Task 2, 3)

- [x] 5. **Create SimStatusPanel component**

  **What to do**:
  - Create `apps/desktop/src/renderer/hub/components/panels/SimStatusPanel.tsx`
  - Uses `useSimState()` for `{ connected, simName }` — live subscription
  - Props: `tier: string` (for feature gating)
  - Shows:
    - Status indicator (green dot = connected, red = disconnected)
    - Sim name (or "No sim detected" when disconnected)
    - Badge: "LIVE" (conected) / "OFFLINE" (disconnected) with appropriate styling
    - Small data rows: only fields with available data
  - When disconnected: slightly muted/opacity styling
  - Navigates to `/overlays` (SIM settings page)

  **Must NOT do**:
  - NO sessionTime or driverName (not available from useSimState)
  - NO fake/dummy data

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Status indicators, live data, conditional rendering

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 9)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 3, 4

  **References**:
  - `apps/desktop/src/renderer/shared/components/StatusIndicator.tsx` — Existing status indicator pattern
  - `packages/ui-core/src/hooks/useSimState.ts` — Available sim data shape

  **Acceptance Criteria**:
  - [ ] Shows green "LIVE" + simName when connected
  - [ ] Shows red "OFFLINE" + "No sim detected" when disconnected
  - [ ] Navigates to `/overlays` on click
  - [ ] Container has data-testid="dashboard-panel-sim"
  - [ ] Live subscription updates on sim state change

  **Commit**: NO (groups with Task 10)

- [x] 6. **Create OverlaysPanel component**

  **What to do**:
  - Create `apps/desktop/src/renderer/hub/components/panels/OverlaysPanel.tsx`
  - Uses `useOverlayWindows()` hook for active/total counts
  - Shows:
    - Header with overlay count badge: "X / Y active"
    - Quick action buttons: "Open All" / "Close All" (calls openAll/closeAll from hook)
    - If 0 overlays configured: show subtle "No overlays configured" message
    - If all open: disable "Open All" button
  - Navigates to `/overlays` on panel click (entire panel is link)
  - Action buttons use `event.preventDefault()` to prevent navigation when clicking buttons

  **Must NOT do**:
  - NO overlay list/names — only counts and quick actions
  - NO mini toggle switches (keep it simple)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Interactive controls + live counts

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8, 9)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 3, 4

  **Acceptance Criteria**:
  - [ ] Shows "X / Y active" with correct counts from hook
  - [ ] "Open All" button calls openAll()
  - [ ] "Close All" button calls closeAll()
  - [ ] Disabled state when all already open
  - [ ] "No overlays configured" when total is 0
  - [ ] data-testid="dashboard-panel-overlays"
  - [ ] Clicking panel navigates to /overlays

  **Commit**: NO (groups with Task 10)

- [x] 7. **Create ThemesPanel component**

  **What to do**:
  - Create `apps/desktop/src/renderer/hub/components/panels/ThemesPanel.tsx`
  - Uses `useThemePreview()` hook for activeTheme + allThemes
  - Visual preview of active theme:
    - 4-5 small colored circles showing theme's primary color palette
    - Sample text line showing the font + color
    - Border sample showing theme's border style
    - Theme name below preview
  - Loading state: skeleton shimmer rectangle
  - If no theme: "Default" fallback
  - Navigates to `/themes` on click

  **Must NOT do**:
  - NO theme selector inline (redirects to Themes page)
  - NO long list of all themes

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Color swatches, visual preview rendering

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8, 9)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 3, 4

  **References**:
  - `packages/ui-core/src/themes/` — Theme type with color tokens
  - `apps/desktop/src/renderer/hub/components/ThemeSelector.tsx` — Existing theme selector for reference

  **Acceptance Criteria**:
  - [ ] Shows color circles from active theme
  - [ ] Shows theme name
  - [ ] Skeleton on loading
  - [ ] Default fallback when no theme
  - [ ] data-testid="dashboard-panel-themes"
  - [ ] Navigates to /themes

  **Commit**: NO (groups with Task 10)

- [x] 8. **Create AccountPanel component**

  **What to do**:
  - Create `apps/desktop/src/renderer/hub/components/panels/AccountPanel.tsx`
  - Uses `useAccountStatus()` + `useAuthStore` for user data
  - **Logged in state**:
    - User email display
    - Plan badge: "FREE" (gray), "PRO" (primary color), "ULTIMATE" (gold/gradient)
    - License status: green "Active" / red "Expired" badge
    - Small text: "Manage account →"
  - **Logged out state**:
    - "Sign in to sync your setup" message
    - "Sign In" button/CTA
  - Navigates to `/account` on panel click
  - Buttons use `event.preventDefault()` to stay on dashboard

  **Must NOT do**:
  - NO login form inline (redirects to Account page)
  - NO register flow

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Conditional rendering based on auth state, plan badges

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 9)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 3, 4

  **References**:
  - `apps/desktop/src/renderer/shared/stores/auth-store.ts` — Auth state shape
  - `apps/desktop/src/renderer/hub/components/FeatureBadge.tsx` — Existing badge component
  - `apps/desktop/src/renderer/hub/components/UpgradePrompt.tsx` — Upgrade CTA pattern

  **Acceptance Criteria**:
  - [ ] Logged in: shows email + plan badge + license status
  - [ ] Logged out: shows sign-in prompt
  - [ ] Plan badges have correct colors (FREE gray, PRO primary, ULTIMATE gold)
  - [ ] data-testid="dashboard-panel-account"
  - [ ] Navigates to /account

  **Commit**: NO (groups with Task 10)

- [x] 9. **Create SettingsPanel component**

  **What to do**:
  - Create `apps/desktop/src/renderer/hub/components/panels/SettingsPanel.tsx`
  - Uses `useSettingsStore` for settings data (live subscription)
  - Uses `useAppStore` for demoMode toggle
  - Shows quick settings summary:
    - Demo Mode toggle switch (interactive, calls `setDemoMode()`)
    - HTTP Server Port: `font-mono` display
    - Overlay Visibility Key: `font-mono` display + "Press to reveal" if sensitive
  - Navigates to `/settings` on panel click (except toggle area)
  - Demo Mode toggle uses `event.stopPropagation()` to prevent navigation

  **Must NOT do**:
  - NO full settings editor (redirects to Settings page)
  - NO save buttons (settings save on toggle via store)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Form controls, data display, store mutations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 8)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 3, 4

  **References**:
  - `apps/desktop/src/renderer/shared/stores/settings-store.ts` — Settings store
  - `apps/desktop/src/renderer/shared/stores/app-store.ts` — Demo mode toggle
  - `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx:57-87` — Current quick settings implementation

  **Acceptance Criteria**:
  - [ ] Demo mode toggle works (calls setDemoMode, reflects state)
  - [ ] HTTP port displayed
  - [ ] Overlay key displayed
  - [ ] data-testid="dashboard-panel-settings"
  - [ ] Navigates to /settings on panel click
  - [ ] Demo toggle doesn't navigate (stops propagation)

  **Commit**: NO (groups with Task 10)

- [x] 10. **Rebuild DashboardPage with Layout B + responsive**

  **What to do**:
  - Rewrite `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx`
  - Import and orchestrate:
    - `DashboardPanel` (3 variants: hero, medium, small)
    - `SimStatusPanel`, `OverlaysPanel`, `ThemesPanel`, `AccountPanel`, `SettingsPanel`
    - `CanvasParticles`
    - Custom hooks (`useOverlayWindows`, `useThemePreview`, `useAccountStatus`)
    - Existing stores (`useSimState`, `useSettingsStore`, `useAppStore`, `useProfileStore`)
  - Layout B structure using CSS grid classes, panel ordering: Overlays (hero, left), SIM (medium, right top), Themes/Account/Settings (small, right bottom row/center bottom)
  - Fetch all async data on mount (themes, overlay windows, account)
  - Pass loading states to each panel (skeleton while data loads)
  - Remove old Quick Settings, Active Profile, Active Theme sections
  - Wrap with CanvasParticles
  - Add `data-testid="dashboard-page"` on root container

  **Must NOT do**:
  - NO modificar el EmptyState de HubLayout (se mantiene)
  - NO cambiar rutas o estructura de App.tsx

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex layout orchestration, data flow, responsive design

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all panels)
  - **Parallel Group**: Wave 3 (with Tasks 11, 12)
  - **Blocks**: Tasks 13, 14
  - **Blocked By**: Tasks 1, 3, 4, 5, 6, 7, 8, 9

  **References**:
  - `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx` — Full current file to replace
  - `apps/desktop/src/renderer/hub/HubLayout.tsx:147-153` — Content area wrapping dashboard

  **Acceptance Criteria**:
  - [ ] 5 panels render in Layout B asymmetric layout on desktop (>1024px)
  - [ ] Collapses to 2-col at <1024px (tablet)
  - [ ] Collapses to 1-col at <640px (mobile)
  - [ ] Each panel has correct data-testid
  - [ ] CanvasParticles rendered behind panels
  - [ ] Stagger animation delays applied (0s, 0.1s, 0.2s, 0.3s, 0.4s)
  - [ ] Async data loaded: themes, overlay windows, account
  - [ ] Skeleton shimmer shown during loading

  **Commit**: YES
  - Message: `feat(dashboard): rebuild DashboardPage with Layout B and 5 glassmorphism panels`
  - Files: `apps/desktop/src/renderer/hub/pages/DashboardPage.tsx`

- [x] 11. **Implement entrance stagger animation system**

  **What to do**:
  - Each DashboardPanel receives `style={{ animationDelay: '${index * 0.1}s', animationFillMode: 'backwards' }}`
  - CSS class `dashboard-panel-enter` triggers `@keyframes panelEnter` (scale 0.8→1.0, opacity 0→1, duration 0.5s)
  - Use `useRef` + `useEffect` to add class on mount only (not on re-render)
  - Respect `prefers-reduced-motion`:
    - If `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, skip stagger
    - Panels render at full scale immediately
  - Stagger order: Overlays (0s), SIM (0.1s), Themes (0.2s), Account (0.3s), Settings (0.4s)

  **Must NOT do**:
  - NO animation on re-navigate (only mount)
  - NO animation library dependencies

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: CSS animations, React refs, accessibility (reduced motion)

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 10)
  - **Parallel Group**: Wave 3 (with Task 10, 12)
  - **Blocks**: Task 13
  - **Blocked By**: Task 1 (CSS keyframes), Task 10 (panel structure)

  **Acceptance Criteria**:
  - [ ] Panels enter with scale 0.8→1.0 + fade over 0.5s
  - [ ] Stagger delays correct (0s, 0.1s, 0.2s, 0.3s, 0.4s)
  - [ ] Animation only on mount, not re-render
  - [ ] prefers-reduced-motion: reduce disables animation
  - [ ] No JS errors

  **Commit**: NO (groups with Task 10)

- [x] 12. **Integrate hover glow + CanvasParticles into DashboardPage**

  **What to do**:
  - Import and render `<CanvasParticles />` as first child in DashboardPage
  - Canvas positioned absolute, full viewport, z-index 0, `pointer-events: none`
  - Panels container z-index 1 (above particles)
  - Hover glow already in CSS (Task 1): `.dashboard-panel:hover` → `box-shadow: 0 0 20px var(--color-primary), 0 0 40px var(--color-primary-muted)`

  **Must NOT do**:
  - NO particles on top of panels (z-index)
  - NO animation library for hover

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Layer composition, particle integration, hover effects

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 2, 10)
  - **Parallel Group**: Wave 3 (with Task 10, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 1, 2, 10

  **Acceptance Criteria**:
  - [ ] Panels glow with box-shadow on hover
  - [ ] Particles visible behind panels
  - [ ] Panels above particles (z-index)
  - [ ] Smooth transition on hover in/out

  **Commit**: NO (groups with Task 10)

---

## Wave 4: Validation

- [x] 13. **Write Vitest tests for all dashboard components**

  **What to do**:
  - Create `apps/desktop/src/renderer/hub/__tests__/DashboardPage.test.tsx`
  - Tests using `@testing-library/react` + `vitest`:
    1. DashboardPage renders all 5 panels with correct test IDs
    2. Each panel navigates to correct route on click (MemoryRouter)
    3. SimStatusPanel shows "No sim detected" when disconnected
    4. OverlaysPanel shows overlay count
    5. AccountPanel shows sign-in prompt when logged out
    6. SettingsPanel demo mode toggle works
    7. CanvasParticles renders canvas element
    8. CanvasParticles cleans up RAF on unmount
    9. Stagger animation only on mount (not re-render)
    10. prefers-reduced-motion disables animation
  - Use `vi.mock()` for IPC calls (`window.vantare.*`)
  - Use `MemoryRouter` wrapper for navigation tests
  - Follow existing mock patterns from `mock-vantare.ts`

  **Must NOT do**:
  - NO Playwright E2E tests (unit only)
  - NO tests requiring manual visual validation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test writing - clear spec, well-defined assertions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 14)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 10, 11, 12

  **References**:
  - `apps/desktop/src/renderer/hub/__tests__/SimSwitcher.static.test.tsx` — Existing test pattern
  - `apps/desktop/src/renderer/hub/__stories__/mock-vantare.ts` — Mock setup

  **Acceptance Criteria**:
  - [ ] vitest run → all tests pass (10+ tests)
  - [ ] Coverage: all 5 panels, canvas, animations
  - [ ] Mock IPC calls correctly
  - [ ] Navigation tests pass with MemoryRouter

  **Commit**: YES
  - Message: `test(dashboard): add unit tests for dashboard components`
  - Files: `apps/desktop/src/renderer/hub/__tests__/DashboardPage.test.tsx`

- [x] 14. **Update Storybook stories**

  **What to do**:
  - Update `apps/desktop/src/renderer/hub/__stories__/DashboardPage.stories.tsx`:
    - Update imports to use new DashboardPage
    - Update mock data to reflect new panel data
    - Update test IDs in story assertions
    - Keep "Connected" and "Disconnected" stories if they exist
    - Add story notes about the new glassmorphism design
  - Verify: `pnpm build-storybook` completes without errors

  **Must NOT do**:
  - NO new stories for individual panel components
  - NO modifying other story files

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Storybook configuration, documentation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 13)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 10, 11, 12

  **References**:
  - `apps/desktop/src/renderer/hub/__stories__/DashboardPage.stories.tsx` — Existing story to update
  - `apps/desktop/src/renderer/hub/__stories__/mock-vantare.ts` — Mock setup

  **Acceptance Criteria**:
  - [ ] Storybook stories updated with new DashboardPage
  - [ ] `pnpm build-storybook` completes without errors
  - [ ] Story renders all 5 panels

  **Commit**: YES
  - Message: `story(dashboard): update DashboardPage stories for redesign`
  - Files: `apps/desktop/src/renderer/hub/__stories__/DashboardPage.stories.tsx`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check component renders, run tests). For each "Must NOT Have": search codebase for forbidden patterns (new stores, sidebar changes, theme file changes) — reject with file:line if found. Check evidence files exist in `.omo/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify CanvasParticles has no memory leaks (RAF cleanup). Verify prefers-reduced-motion implementation.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (DashboardPage renders all 5 panels together, navigation works, particles animate). Test edge cases: disconnected SIM, logged out account, 0 overlays configured, prefers-reduced-motion. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: HubLayout unchanged, App.tsx routes unchanged, no new stores, themes JSON files untouched. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Tasks 1**: `feat(dashboard): add glassmorphism CSS tokens and animations` — `theme-tokens.css`, `dashboard.css`
- **Tasks 2-4** (grouped): `feat(dashboard): add CanvasParticles, DashboardPanel component, and panel data hooks` — `CanvasParticles.tsx`, `DashboardPanel.tsx`, `hooks/*`
- **Tasks 5-9** (grouped): NO COMMIT (partial)
- **Task 10-12** (grouped): `feat(dashboard): rebuild DashboardPage with Layout B and 5 glassmorphism panels` — `DashboardPage.tsx`
- **Task 13**: `test(dashboard): add unit tests for dashboard components` — `DashboardPage.test.tsx`
- **Task 14**: `story(dashboard): update DashboardPage stories for redesign` — `DashboardPage.stories.tsx`

---

## Success Criteria

### Verification Commands
```bash
# Run tests
cd apps/desktop && npx vitest run

# Type check
cd apps/desktop && npx tsc --noEmit

# Build storybook
cd apps/desktop && npx storybook build
```

### Final Checklist
- [ ] All 5 panels render in Layout B asymmetric layout
- [ ] Each panel navigates to its correct route on click
- [ ] CanvasParticles renders 50-80 particles at 30fps
- [ ] Stagger animation plays on mount (scale 0.8→1.0 with fade)
- [ ] prefers-reduced-motion disables stagger
- [ ] Hover glow effect works on all panels
- [ ] Responsive: 3 breakpoints behave correctly
- [ ] Skeleton shimmer during loading states
- [ ] All Vitest tests pass (10+ tests)
- [ ] Storybook builds without errors
- [ ] No new Zustand stores created
- [ ] HubLayout, App.tsx routes, sidebar unchanged
- [ ] Theme JSON files (dark.json, blood.json, midnight.json) untouched

