# Vantare — Contexto Completo del Repositorio

> **Propósito:** Este documento permite a otro modelo tomar decisiones arquitectónicas sobre la integración de un `Tire Strategy Planner` sin tener acceso directo al código.
> **Fecha de generación:** 2026-07-10
> **Rama analizada:** `opencode/cosmic-otter`
> **Advertencia:** No contiene secretos, tokens ni valores de `.env`.

---

## 1. Resumen Ejecutivo

### 1.1 Qué es Vantare

Vantare es una **aplicación de escritorio profesional para simracing** que permite a los corredores virtuales crear, personalizar y mostrar overlays de telemetría en tiempo real sobre sus sesiones de carrera. Captura datos de telemetría directamente desde los sims de carrera a través de memoria compartida (mmap) y renderiza overlays personalizables que pueden integrarse con OBS Studio o mostrarse directamente en pantalla.

### 1.2 Arquitectura dual: v1 (Legacy) y v2 (Activa)

El repositorio contiene **dos generaciones de código**:

| Generación | Ubicación | Stack | Estado |
|------------|-----------|-------|--------|
| **v1 (Legacy)** | `apps/desktop/`, `packages/`, `shared/` | Electron + Node.js + React 18 | Archivado. Código existe pero no se modifica activamente. |
| **v2 (Activa)** | `vantare-v2/` | Go 1.25 + Wails v3 + React 19 | **Desarrollo activo.** Todas las nuevas features van aquí. |

> **Regla de oro:** El código activo está en `vantare-v2/`. La documentación de referencia está en `docs/proyecto/`. El diseño visual del Hub está en `hub_main_v5.html`.

### 1.3 Módulos principales

| Módulo | Ubicación (v2) | Responsabilidad |
|--------|----------------|-----------------|
| **App principal** | `vantare-v2/cmd/vantare/` | Punto de entrada Wails, orquestación de servicios |
| **Pipeline de telemetría** | `vantare-v2/internal/telemetry/` | Lectura LMU (mmap), parsing, normalización, deadband, broadcast |
| **Overlay system** | `vantare-v2/internal/window/` + `frontend/src/overlay/` | Ventana transparente click-through, composición de widgets |
| **Hub (Dashboard)** | `vantare-v2/frontend/src/hub/` | Configuración visual, perfiles, Overlays Studio, temas |
| **Overlays Studio** | `vantare-v2/frontend/src/hub/overlays/` | Editor de widgets: LayoutStudio (único editor activo) |
| **Launcher** | `vantare-v2/internal/app/launcher/` | Descubrimiento de apps, perfiles de lanzamiento, hotkeys |
| **Ingeniero IA** | `vantare-v2/internal/engineer/` | Spotter en tiempo real, detección de solapes, audio |
| **Servidor HTTP/SSE** | `vantare-v2/internal/server/` | OBS Browser Source, streaming, OAuth callbacks |
| **Licencias** | `vantare-v2/internal/license/` | Validación Supabase, grace offline, device binding |
| **Calendar** | `vantare-v2/internal/calendar/` | Calendario de carreras LMU, recordatorios |
| **Updater** | `vantare-v2/internal/updater/` | Auto-actualización desde GitHub Releases |
| **Supabase** | `supabase/` | Auth, billing (Polar), Edge Functions, RPCs |
| **Auth package** | `packages/auth/` | Servicio de auth, feature gates, offline cache |

### 1.4 Estado de desarrollo

| Componente | Estado |
|------------|--------|
| Pipeline de telemetría LMU | ✅ Funcional (60Hz read / 30Hz emit) |
| Overlay compuesto (ventana transparente) | ✅ Funcional |
| Layout con modos racing/edit/streaming | ✅ Funcional |
| Hub React (dashboard) | ✅ Funcional |
| OBS/SSE streaming | ✅ Funcional |
| Temas CSS | ✅ Funcional |
| Billing con Polar | ✅ Funcional |
| Ingeniero IA (spotter) | ✅ Funcional |
| Launcher de apps | ✅ Funcional |
| Calendar de carreras | ✅ Funcional |
| Multi-sim (iRacing, AC) | 🔲 Pendiente (fundamentos existen en v1 legacy) |
| Overlays Studio refactor | 🟡 En curso (WidgetStudio eliminado, sub-nav pendiente) |
| Tire Strategy Planner | ⬜ No existe |

---

## 2. Estado de Git

### 2.1 Rama actual

```
Rama: opencode/cosmic-otter
Commit HEAD: f22d64b chore: commit preexisting changes and clean repo state
Working tree: LIMPIO (sin cambios sin commit)
```

### 2.2 Commits recientes

```
f22d64b chore: commit preexisting changes and clean repo state
8f3a605 docs: add LayoutStudio sub-nav redesign plan and v10 mockup reference
53dffc6 feat(hub): remove widget mode and unify Overlays Studio
6d83a94 chore(hub): delete WidgetStudio and WidgetPreviewPanel
ba455d5 feat(hub): add mock session selector to LayoutStudio
c303369 feat(hub): add design system selector to LayoutStudio
a750665 test(frontend): fix vitest contract tests missing glassmorphism reference
cc84a4b feat(billing): integrate Polar checkout portal webhooks
```

### 2.3 Ramas relevantes

| Rama | Propósito | Estado |
|------|-----------|--------|
| `master` | Rama principal del repo | Estable |
| `opencode/cosmic-otter` | **Actual** — trabajo reciente | Activa |
| `develop` | Desarrollo continuo | Activa |
| `feature` | Features generales | Activa |
| `refactor` | Refactors grandes | Activa |
| `launch/polar-billing` | Lanzamiento con Polar | Activa |
| `codex/engineer-release` | Release del Ingeniero | Activa |
| `codex/i18n-widget-studio-clean` | Limpieza i18n Widget Studio | Activa |
| `release-0.3.0` | Release v0.3.0 | Estable |

### 2.4 Worktrees activos

```
C:/Users/isaac/Desktop/Vantare-Overlays          [launch/polar-billing]
C:/Users/isaac/.local/.../cosmic-otter            [opencode/cosmic-otter]  ← ACTUAL
C:/Users/isaac/AppData/.../malachite-copper       [malachite-copper]
C:/Users/isaac/Desktop/vantare-launch-1a-test     (detached HEAD)
C:/Users/isaac/Desktop/.../vantare-v2-engineer    [codex/engineer-release]
C:/Users/isaac/emdash/worktrees/vantare-v2/develop [develop]
C:/Users/isaac/emdash/worktrees/vantare-v2/feature [feature]
C:/Users/isaac/emdash/worktrees/vantare-v2/lanzamiento [lanzamiento]
C:/Users/isaac/emdash/worktrees/vantare-v2/refactor [refactor]
```

> **Nota:** Hay 8 worktrees activos. El trabajo en `refactor` y `feature` podría entrar en conflicto con una nueva feature grande.

### 2.5 Stashes

Hay 9 stashes, incluyendo trabajo previo en launcher, i18n, y remotion. Ninguno relevante para el Strategy Planner.

---

## 3. Estructura General del Repositorio

```
Vantare-Overlays/
│
├── apps/desktop/                    ★ LEGACY v1 — Electron + Node.js (archivado)
│   ├── src/main/                    Proceso principal Electron
│   ├── src/renderer/                React 18 + Zustand
│   ├── src/preload/                 contextBridge IPC
│   ├── e2e/                         8 archivos Playwright E2E
│   └── scripts/                     Profiler de performance
│
├── vantare-v2/                      ★ ACTIVO — Go + Wails v3 + React 19
│   ├── cmd/vantare/                 Entry point principal (Wails app)
│   ├── cmd/lmu-debug/               CLI debugger de telemetría LMU
│   ├── cmd/lmu-test/                Test de integración LMU
│   ├── cmd/lmu-dump/                Dump raw de memoria LMU
│   ├── cmd/lmu-api-probe/           Probe de REST API LMU
│   ├── cmd/vantare-admin/           CLI admin Supabase
│   ├── internal/app/                Core: App, ProfileService, HubService, SettingsService, Hotkeys
│   ├── internal/app/launcher/       Launcher: discovery, apps, profiles, chain runner
│   ├── internal/telemetry/          Pipeline: service, lmu, normalizer, pipeline, delta, diff, gap, fusion
│   ├── internal/telemetry/lmu/      Reader mmap LMU, parser, offsets, synthetic buffer
│   ├── internal/telemetry/lmuapi/   REST client para API local LMU
│   ├── internal/window/             Window manager: overlay lifecycle, shrink-wrap
│   ├── internal/server/             HTTP server + SSE para OBS
│   ├── internal/license/            Validación licencias, cache offline, fingerprint
│   ├── internal/engineer/           Spotter: physics, audio, notifications
│   ├── internal/ops/                Métricas runtime (CPU, memoria)
│   ├── internal/updater/            Auto-updater desde GitHub
│   ├── internal/calendar/           Calendario LMU, iCal, recordatorios
│   ├── internal/core/               Deadband filter
│   ├── pkg/config/                  ProfileConfig (schema v2), WidgetConfig
│   ├── pkg/models/                  Telemetry, PlayerTelemetry, SessionInfo, VehicleScoring
│   ├── configs/                     Perfiles JSON embebidos + persistidos
│   ├── frontend/src/                React 19 + Tailwind v4 + shadcn/ui
│   │   ├── hub/                     Dashboard, Overlays Studio, LayoutStudio
│   │   └── overlay/                 Widget components (delta, relative, standings, etc.)
│   ├── tools/                       Scripts de build y release
│   ├── build/                       Configuración Wails + Taskfiles
│   ├── testdata/                    Fixtures binarios para tests
│   ├── go.mod                       Module: github.com/vantare/overlays/v2, Go 1.25
│   ├── Taskfile.yml                 Build tasks
│   └── VERSION                      Versión actual
│
├── packages/                        ★ LEGACY v1 — Paquetes compartidos (archivados)
│   ├── auth/                        AuthService, feature gates, offline cache
│   ├── sim-core/                    Sim adapters, normalizers, calculators
│   ├── ui-core/                     Componentes UI, hooks, stores, themes, schemas
│   └── types/                       Re-exportación de tipos
│
├── shared/types/                    ★ LEGACY v1 — Tipos compilados (bridge.ts, profile.ts, etc.)
│
├── supabase/                        ★ ACTIVO — Configuración Supabase
│   ├── config.toml                  Config del proyecto
│   ├── migrations/                  4 migraciones SQL
│   └── functions/                   Edge Functions (billing-webhook, billing-checkout, billing-portal)
│
├── docs/                            ★ Documentación
│   ├── proyecto/                    13 archivos: visión, arquitectura, estado, planes
│   ├── plans/                       8 archivos: roadmap v2, fases, deuda técnica
│   ├── superpowers/plans/           20+ miniplans de implementación
│   ├── ARCHITECTURE.md              Doc técnica v1 completa (~3000 líneas)
│   ├── IPC-BRIDGE.md                Sistema IPC completo
│   ├── OVERLAY-DEV-GUIDE.md         Guía de desarrollo de overlays
│   ├── SIM-ADAPTER-GUIDE.md         Guía de adaptadores de sim (~4000 líneas)
│   ├── THEME-SYSTEM.md              Sistema de temas
│   ├── TECH-DECISIONS.md            25 decisiones arquitectónicas
│   ├── V2-MASTER-PLAN.md            Plan maestro v2 (10 fases)
│   └── architecture/                ← Este documento
│
├── tools/                           ★ UTILIDADES LMU
│   ├── generate-lmu-offsets.py      Generador de offsets shared memory
│   ├── dump-lmu-memory.py           Dump de memoria LMU
│   ├── lmu-sidecar/main.py          Sidecar Python para LMU
│   └── ingeniero_path.py            Resolución de paths para Ingeniero
│
├── hub_main_v5.html                 Fuente única de verdad del diseño visual Hub v5
├── layout-studio-v10.html           Mockup del redesign de sub-nav de LayoutStudio
├── pnpm-workspace.yaml              Workspace definition
├── turbo.json                       Configuración Turborepo
├── package.json                     Root: vantare-overlays, pnpm 9.1.0
├── CHANGELOG.md                     Changelog v0.2.10 → v0.2.14-alpha.1
└── learnings.md                     Notas de Storybook
```

---

## 4. Aplicaciones y Puntos de Entrada

### 4.1 Aplicación Desktop (v2 — ACTIVA)

**Punto de entrada:** `vantare-v2/cmd/vantare/main.go`

**Cómo se inicia:**
- Desarrollo: `wails3 dev` (via Taskfile)
- Producción: binario compilado con `wails3 build`
- El binario embebe el frontend React via `//go:embed dist`

**Responsabilidad:** Orquestar todos los servicios: telemetría, overlays, hub, licencias, launcher, ingeniero, calendar, updater.

**Comunicación con otras partes:**
- Frontend React ↔ Go: **Wails v3** (bound services + event system)
- Overlay ↔ OBS: **HTTP SSE** en `127.0.0.1:39261`
- Go ↔ LMU: **Shared memory** (Windows mmap)
- Go ↔ LMU REST: **HTTP** a `localhost:6397`
- Go ↔ Supabase: **HTTPS** (Edge Functions + REST API)

### 4.2 CLI Tools

| Comando | Entry Point | Propósito |
|---------|-------------|-----------|
| `lmu-debug` | `vantare-v2/cmd/lmu-debug/main.go` | Leer e imprimir telemetría LMU (mock o live) |
| `lmu-test` | `vantare-v2/cmd/lmu-test/main.go` | Test de integración con servicio de telemetría |
| `lmu-dump` | `vantare-v2/cmd/lmu-dump/main.go` | Dump raw de shared memory para reverse-engineering |
| `lmu-api-probe` | `vantare-v2/cmd/lmu-api-probe/main.go` | Probar REST API local de LMU |
| `vantare-admin` | `vantare-v2/cmd/vantare-admin/main.go` | Admin de usuarios Supabase (lookup, grant, revoke) |

### 4.3 Supabase Edge Functions

| Function | Path | Propósito | JWT |
|----------|------|-----------|-----|
| `billing-webhook` | `supabase/functions/billing-webhook/` | Recibe webhooks de Polar | No (verifica HMAC) |
| `billing-checkout` | `supabase/functions/billing-checkout/` | Crea sesión de checkout Polar | Sí |
| `billing-portal` | `supabase/functions/billing-portal/` | Crea portal de gestión de cliente | Sí |
| `validate-license` | `supabase/functions/validate-license/` | **DEPRECATED** — Validación legacy | Sí |

### 4.4 Aplicación Desktop (v1 — LEGACY, archivada)

**Punto de entrada:** `apps/desktop/src/main/index.ts`

**Cómo se inicia:** `pnpm dev:desktop` (Electron + Vite)

**Stack:** Electron 32+ + React 18 + Zustand 5 + Tailwind v4 + Node.js

**Comunicación:** IPC via `contextBridge` (`window.vantare`)

> **No desarrollar nuevas features aquí.** Este código está archivado pero se mantiene como referencia.

---

## 5. Arquitectura del Frontend (v2)

### 5.1 Estructura de páginas y features

**Ubicación:** `vantare-v2/frontend/src/`

```
frontend/src/
├── hub/                              Dashboard (Hub SPA)
│   ├── HubLayout.tsx                 Sidebar + Outlet layout
│   ├── pages/
│   │   ├── DashboardPage.tsx         Grid 5 paneles
│   │   ├── OverlaySettingsPage.tsx   Config de overlays
│   │   ├── ProfilesPage.tsx          CRUD perfiles
│   │   ├── ThemesPage.tsx            Selector + editor de temas
│   │   ├── SettingsPage.tsx          Config global
│   │   ├── TelemetryInspectorPage.tsx Inspector de telemetría
│   │   └── AccountPage.tsx           Login/Register + licencia
│   ├── components/                   Componentes del Hub
│   │   ├── FeatureGate.tsx           Gating por tier de licencia
│   │   ├── SimSwitcher.tsx           Selector de sim
│   │   ├── TelemetryInspector.tsx    Display completo de telemetría
│   │   └── panels/                   Paneles del dashboard
│   ├── overlays/                     ★ OVERLAYS STUDIO
│   │   ├── LayoutStudio.tsx          Editor principal (UNICAMENTE este)
│   │   ├── WidgetSettingsPanel.tsx   Panel de settings (siendo refactorizado)
│   │   └── V52OverlaysHome.tsx       Home de la sección overlays
│   └── hooks/                        useOverlayWindows, useThemePreview, useAccountStatus
│
├── overlay/                          Widget components para el overlay
│   ├── CompositeApp.tsx              App compuesta del overlay
│   ├── WidgetHost.tsx                Host que renderiza widgets
│   └── widgets/                      Componentes de widgets
│       ├── delta/                    Delta bar
│       ├── relative/                 Relative gaps
│       ├── standings/                Clasificación
│       ├── pedals/                   Pedales (input display)
│       └── telemetry/                Telemetría general
│
├── lib/                              Utilidades
│   ├── supabase-auth.ts              Cliente Supabase
│   └── theme.ts                      Persistencia de temas
│
└── bindings/                         Wails bindings auto-generados (TypeScript)
```

### 5.2 Sistema de navegación y rutas

**Router:** React Router (HashRouter en v1, Wails routing en v2)

**Rutas del Hub (v2):**
| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/` | `DashboardPage` | Dashboard principal con 5 paneles |
| `/overlays` | `V52OverlaysHome` | Home de Overlays Studio |
| `/overlays/editor` | `LayoutStudio` | Editor de layout de widgets |
| `/profiles` | `ProfilesPage` | CRUD de perfiles |
| `/themes` | `ThemesPage` | Selector y editor de temas |
| `/settings` | `SettingsPage` | Configuración global |
| `/account` | `AccountPage` | Login, registro, licencia |
| `/inspector` | `TelemetryInspectorPage` | Inspector de telemetría |

### 5.3 Componentes compartidos

| Componente | Ubicación | Propósito |
|-----------|-----------|-----------|
| `GlassPanel` | `packages/ui-core/src/components/GlassPanel.tsx` | Panel con efecto glassmorphism |
| `TimeDisplay` | `packages/ui-core/src/components/TimeDisplay.tsx` | Formateo de tiempos de carrera |
| `PositionBadge` | `packages/ui-core/src/components/PositionBadge.tsx` | Badge de posición (P1-P99) |
| `DeltaIndicator` | `packages/ui-core/src/components/DeltaIndicator.tsx` | Indicador +/- de delta |
| `SettingsForm` | `packages/ui-core/src/components/SettingsForm.tsx` | Form auto-generado desde Zod schemas |
| F1 components | `packages/ui-core/src/components/f1/` | F1Card, AuroraEffect, TelemetryBar, etc. |

### 5.4 Estado global y estado local

**Stores Zustand (renderer):**

| Store | Ubicación | Propósito |
|-------|-----------|-----------|
| `app-store` | `apps/desktop/src/renderer/shared/stores/app-store.ts` | Estado global: demoMode, isLoading |
| `settings-store` | `apps/desktop/src/renderer/shared/stores/settings-store.ts` | Settings CRUD via IPC |
| `profile-store` | `apps/desktop/src/renderer/shared/stores/profile-store.ts` | Profiles CRUD via IPC |
| `overlay-config-store` | `apps/desktop/src/renderer/shared/stores/overlay-config-store.ts` | Draft-based overlay config |
| `auth-store` | `apps/desktop/src/renderer/shared/stores/auth-store.ts` | Auth + license status |
| `alerts-store` | `apps/desktop/src/renderer/shared/stores/alerts-store.ts` | Alert queue (cap 5) |
| `telemetry-store` | `packages/ui-core/src/stores/telemetry-store.ts` | Telemetry data + sim state |

### 5.5 Hooks importantes

| Hook | Ubicación | Propósito |
|------|-----------|-----------|
| `useTelemetry()` | `packages/ui-core/src/hooks/useTelemetry.ts` | Suscripción a telemetry store |
| `useSimState()` | `packages/ui-core/src/hooks/useSimState.ts` | Estado de conexión del sim |
| `useTheme()` | `packages/ui-core/src/hooks/useTheme.ts` | Tema activo + setter |
| `useOverlayWindows()` | `apps/desktop/src/renderer/hub/hooks/useOverlayWindows.ts` | Ventanas de overlay activas |
| `useLicense()` | `apps/desktop/src/renderer/shared/hooks/useLicense.ts` | Feature gating |
| `useConnectionStatus()` | `apps/desktop/src/renderer/shared/hooks/useConnectionStatus.ts` | Estado de conexión via IPC |

### 5.6 Comunicación con Go (Wails)

**Patrón 1: Bound Services (Go → TS auto-generated)**
```typescript
// Frontend llama directamente a métodos Go
const profile = await ProfileService.LoadActiveProfile();
await HubService.StartOverlay();
```

**Patrón 2: Wails Events (bidireccional)**
```typescript
// Go emite → Frontend escucha
Events.On('telemetry:update', (data) => { ... });
Events.On('profile:loaded', (data) => { ... });

// Frontend emite → Go maneja
Events.Emit('license:validate', { token });
Events.Emit('overlay:start', { id });
```

**~40+ eventos nombrados** siguiendo convención `domain:action`:
- `telemetry:update`, `telemetry:state`
- `profile:loaded`, `profile:saved`
- `overlay:status`, `overlay:started`
- `license:changed`, `license:validate`
- `launcher:chain:started`, `launcher:apps:detected`
- `engineer:notification`, `engineer:status`
- `calendar:get`, `calendar:import`

---

## 6. Arquitectura de Go y Wails

### 6.1 Estructura del backend Go

```
vantare-v2/
├── cmd/vantare/main.go              Entry point: Wails app init, service wiring, event handlers
├── cmd/lmu-debug/main.go            CLI debugger
├── internal/
│   ├── app/                          Core application
│   │   ├── app.go                    App struct: telemetry lifecycle, source management
│   │   ├── telemetry_bridge.go       Subscribe → Wails events
│   │   ├── telemetry_source_manager.go  Live/mock source switching
│   │   ├── profile_service.go        Profile CRUD (Wails-bound)
│   │   ├── hub_service.go            Hub operations (Wails-bound)
│   │   ├── overlay_controller.go     Thread-safe overlay lifecycle
│   │   ├── settings_service.go       App settings persistence (atomic writes)
│   │   ├── engineer_bridge.go        Engineer Wails events
│   │   ├── updater_service.go        Auto-updater wrapper
│   │   ├── diagnostics_service.go    System diagnostics
│   │   ├── preset_service.go         Widget presets
│   │   ├── hotkeys.go                Win32 global hotkeys (RegisterHotKey)
│   │   ├── ops_bridge.go             CPU/memory metrics
│   │   ├── calendar_bridge.go        Calendar events
│   │   └── lmu_enriched_source.go    LMU + REST API fusion
│   ├── app/launcher/                 Simulator launcher
│   │   ├── launcher.go               Orchestrator
│   │   ├── chain.go                  Cancelable launch chain
│   │   ├── discovery.go              Auto-detection (Steam, Registry)
│   │   ├── apps.go                   App registry
│   │   ├── profiles.go               Launch profile CRUD
│   │   └── hotkey_windows.go         Per-profile hotkeys
│   ├── telemetry/                    Telemetry pipeline
│   │   ├── service/service.go        Core: 60Hz read / 30Hz emit, Subscribe()
│   │   ├── service/source.go         Source interfaces
│   │   ├── service/source_lmu.go     LMU lazy-attaching wrapper
│   │   ├── lmu/                      LMU shared memory reader + parser
│   │   │   ├── reader_windows.go     mmap via OpenFileMappingW/MapViewOfFile
│   │   │   ├── offsets.go            Generated byte offsets
│   │   │   ├── parser.go             Parse(buf, level) → *models.Telemetry
│   │   │   └── synthetic.go          Mock buffer generation
│   │   ├── lmuapi/                   LMU REST API client (port 6397)
│   │   ├── normalizer/               Raw → models.Telemetry
│   │   ├── pipeline/filter.go        Deadband filter
│   │   ├── delta/                    Delta best lap computation
│   │   ├── diff/                     JSON diff for efficient updates
│   │   ├── gap/                      Time gap computation
│   │   └── fusion/                   Multi-source fusion
│   ├── window/                       Overlay window management
│   │   ├── manager.go                Apply display mode to native window
│   │   └── bounds.go                 ShrinkWrap (minimal bounding box)
│   ├── server/                       HTTP + SSE server
│   │   ├── server.go                 Routes: /health, /overlay, /api/profile, /telemetry/stream
│   │   ├── sse.go                    SSE handler with 15s keepalive
│   │   └── engineer_sse.go           Engineer notifications SSE
│   ├── license/                      License validation
│   │   ├── service.go                States: anonymous, active, grace, expired, device-limit
│   │   ├── cache.go                  JSON file cache for offline
│   │   ├── supabase_client.go        Supabase REST RPC calls
│   │   └── fingerprint_windows.go    Machine fingerprint
│   ├── engineer/                     Race Engineer (spotter)
│   │   ├── service/engineer_service.go  Coordinator
│   │   ├── core/runtime.go           Spotter logic
│   │   ├── spotter/                  Physics: alignment, overlap, state machine
│   │   ├── audio/                    Audio queue + platform player
│   │   ├── simulator/                Test scenarios
│   │   └── replay/                   JSONL replay
│   ├── ops/sampler.go                CPU/memory metrics (gopsutil)
│   ├── updater/                      GitHub releases auto-updater
│   └── calendar/                     LMU race calendar + iCal
├── pkg/
│   ├── config/profile.go             ProfileConfig schema v2, WidgetConfig
│   └── models/telemetry.go           Unified telemetry model
├── configs/                          Embedded default profiles
├── frontend/                         React 19 + Vite 8 + Tailwind v4
│   ├── embed.go                      //go:embed dist
│   └── src/                          React app source
└── build/config.yml                  Wails v3 build config
```

### 6.2 Servicios principales (Wails-bound)

| Servicio | Archivo | Propósito |
|----------|---------|-----------|
| `ProfileService` | `internal/app/profile_service.go` | Load, Save, SetDisplayMode, profile cycling |
| `HubService` | `internal/app/hub_service.go` | Profile CRUD from Hub, overlay lifecycle |
| `LicenseService` | `internal/license/service.go` | Validate, HasEntitlement, ResetDevice |
| `PresetService` | `internal/app/preset_service.go` | Widget presets for WidgetStudio |
| `UpdaterService` | `internal/app/updater_service.go` | Check/install updates |
| `DiagnosticsService` | `internal/app/diagnostics_service.go` | System info, sanitized settings |

### 6.3 Modelos de datos

**`pkg/models/telemetry.go`:**
```go
type Telemetry struct {
    Connected       bool
    Player          PlayerTelemetry
    Session         SessionInfo
    Vehicles        []VehicleScoring
    PlayerHasVehicle bool
    SessionEpoch    int64
    SessionKey      string
    SessionState    int
}

type PlayerTelemetry struct {
    Speed, Gear, EngineRPM, Fuel, DeltaBest float64
    Throttle, Brake, Clutch, Steering       float64
    VehicleName, TrackName                  string
    TimeGaps                                map[string]float64
    // ... más campos
}

type VehicleScoring struct {
    ID, DriverName, VehicleClass string
    Place, TotalLaps             int
    BestLapTime, LastLapTime     float64
    // ... más campos
}
```

**`pkg/config/profile.go`:**
```go
type ProfileConfig struct {
    Version     string           `json:"version"`
    Name        string           `json:"name"`
    Layouts     []LayoutConfig   `json:"layouts"`
    ActiveLayout string          `json:"activeLayout"`
    Theme       string           `json:"theme"`
    // ...
}

type WidgetConfig struct {
    ID       string            `json:"id"`
    Type     string            `json:"type"`       // delta, relative, standings, pedals, telemetry
    Variant  string            `json:"variant"`    // default, compact, etc.
    Bounds   Rect              `json:"bounds"`
    Visible  bool              `json:"visible"`
    Props    map[string]any    `json:"props"`
}
```

### 6.4 Recorrido completo de una petición típica

```
1. LMU escribe datos en shared memory (LMU_Data, 324,820 bytes)
2. Go lmu.Reader.Bytes() lee via mmap (zero-copy, <0.5ms)
3. Go lmu.Parse(buf, ParseFull) decodifica → *models.Telemetry (<2ms)
4. Go normalizer convierte raw → modelo unificado
5. Go gap.ComputeTimeGaps calcula gaps entre vehículos
6. Go pipeline.Filter (deadband) elimina ruido
7. Go service.Service.processRead (60Hz tick)
8. Go service.Service.flushEmit (30Hz tick)
9. Go diff.Compute genera JSON diff (solo campos cambiados)
10. Go TelemetryBridge emite Wails event 'telemetry:update' con UpdateWire{Seq, Snapshot, Diff}
11. Go Server SSE envía a OBS Browser Sources conectados
12. React Events.On('telemetry:update') recibe datos
13. React stores actualizan estado
14. React widgets re-renderizan (selectores Zustand minimizan re-renders)
15. CSS transitions interpolan entre valores para 60fps visual
```

---

## 7. Telemetría y Simuladores

### 7.1 Simuladores soportados

| Sim | Estado en v2 | Método de lectura | Notas |
|-----|-------------|-------------------|-------|
| **Le Mans Ultimate (LMU)** | ✅ Funcional | Shared memory (mmap) + REST API | Principal. Offsets generados por `tools/generate-lmu-offsets.py` |
| **iRacing** | 🔲 Pendiente | Shared memory (N-API addon) | Implementado en v1 legacy, pendiente port a v2 |
| **Assetto Corsa (AC)** | 🔲 Pendiente | UDP packets | Implementado en v1 legacy, pendiente port a v2 |
| **ACC** | ⬜ Futuro | Shared memory | Postergado |
| **AMS2** | ⬜ Futuro | Shared memory | En desarrollo en v1 |
| **rFactor 2** | ⬜ Futuro | Shared memory | Planificado |
| **Mock** | ✅ Funcional | Synthetic buffer | Para desarrollo y testing |

### 7.2 Cómo se detecta LMU

En `internal/telemetry/service/source_lmu.go`:
- `LMUSource` intenta `lmu.Open()` en cada `Read()` si no está conectado
- `lmu.Open()` busca named shared memory `LMU_Data` via `OpenFileMappingW`
- Si falla, retorna `nil` y el servicio intenta de nuevo en el siguiente tick
- Mock se activa automáticamente si LMU no está disponible

### 7.3 Datos disponibles desde LMU

**Shared memory (mmap, 324,820 bytes):**
- Player telemetry: speed, RPM, gear, fuel, delta, throttle, brake, clutch, steering, vehicle name, track name
- Session info: track name, session type, num vehicles, game phase
- Vehicle scoring: ID, driver name, place, total laps, vehicle class, best/last lap times

**REST API (localhost:6397):**
- `/rest/watch/standings` — Standings detallados
- `/rest/watch/sessionInfo` — Info de sesión
- `/navigation/state` — Estado de navegación

### 7.4 Datos procesados por Vantare

| Dato | Disponible en LMU | Procesado por V2 | Mostrado en overlay |
|------|-------------------|-------------------|---------------------|
| Velocidad | ✅ | ✅ | ✅ |
| RPM | ✅ | ✅ | ✅ (delta, telemetry) |
| Gear | ✅ | ✅ | ✅ (telemetry) |
| Fuel remaining | ✅ | ✅ | ✅ (telemetry) |
| Delta best | ✅ | ✅ (delta engine) | ✅ (delta bar) |
| Throttle/Brake/Clutch | ✅ | ✅ | ✅ (pedals widget) |
| Steering | ✅ | ✅ | ✅ (pedals widget) |
| Vehicle position | ✅ | ✅ (gap calc) | ✅ (standings, relative) |
| Gaps to others | ❌ (calculado) | ✅ (gap.ComputeTimeGaps) | ✅ (standings, relative) |
| Lap times | ✅ (scoring) | ✅ | ✅ (standings) |
| Best lap | ✅ (scoring) | ✅ | ✅ (standings) |
| Session time remaining | ✅ | ✅ | 🔲 (pendiente) |
| Weather | 🔲 Parcial | 🔲 Parcial | 🔲 (pendiente) |
| Tyre data | ❌ (no en LMU mmap) | ❌ | ❌ |
| Brake temp | ❌ | ❌ | ❌ |
| Pit stops | ❌ | ❌ | ❌ |
| Historical data | ❌ (no persistido) | ❌ | ❌ |

### 7.5 Frecuencia de actualización

- **Lectura LMU:** 60 Hz (cada ~16.7ms)
- **Emit a frontend:** 30 Hz (cada ~33.3ms)
- **Render React:** ~60 fps (CSS transitions interporean)
- **SSE para OBS:** 30 Hz (mismo que emit)

---

## 8. Overlays Studio

### 8.1 Estado actual del refactor

> **IMPORTANTE:** Overlays Studio está en medio de un refactor activo. WidgetStudio.tsx y WidgetPreviewPanel.tsx fueron eliminados en el commit `53dffc6`. LayoutStudio es ahora el único editor.

**Sistema actualmente utilizado:**
- `LayoutStudio.tsx` — Editor principal con canvas drag/resize
- `WidgetSettingsPanel.tsx` — Panel derecho con accordion de settings (siendo refactorizado)
- `V52OverlaysHome.tsx` — Home de la sección overlays

**Nueva arquitectura del refactor (en progreso):**
- Sub-nav redesign: icon rail + content area
- Archivos a crear: `SubNavRail.tsx`, `SubNavContent.tsx`, `sub-nav-config.ts`
- WidgetSettingsPanel será reemplazado internamente

**Componentes que probablemente se mantendrán:**
- `LayoutStudio.tsx` (core del editor)
- `V52OverlaysHome.tsx` (home page)
- Canvas drag/resize logic
- Profile save/load from Go

**Código temporal o en proceso de eliminación:**
- `WidgetStudio.tsx` — ✅ Eliminado
- `WidgetPreviewPanel.tsx` — ✅ Eliminado
- `WidgetSettingsPanel.tsx` — 🟡 Siendo refactorizado (sub-nav)

### 8.2 Cómo funciona el sistema actual

**Widget types disponibles en v2:**
- `delta` — Barra de delta vs mejor vuelta
- `relative` — Gaps relativos a otros vehículos
- `standings` — Tabla de clasificación
- `pedals` — Input display (throttle/brake/steering)
- `telemetry` — Display general de telemetría

**Flujo de edición:**
1. Usuario abre Overlays Studio → `V52OverlaysHome`
2. Selecciona o crea un perfil → `LayoutStudio`
3. Arrastra/redimensiona widgets en el canvas
4. Configura props de cada widget en `WidgetSettingsPanel`
5. Guarda → Go `ProfileService.SaveProfile()` → `configs/*.json`

**Modos de display:**
- `racing` — Ventana transparente, click-through, shrink-wrap al bbox de widgets activos
- `edit` — Ventana grande, interactiva, drag/resize
- `streaming` — Off-screen 1×1, sirve via SSE para OBS

### 8.3 Cómo se renderizan los overlays

1. `OverlayController.Start()` crea ventana via `WindowFactory`
2. Ventana carga `frontend/dist/index.html` con `?overlay=true&id=<widget_type>`
3. React carga `CompositeApp.tsx` → `WidgetHost.tsx`
4. `WidgetHost` renderiza el widget correspondiente
5. Widget se suscribe a `telemetry:update` events
6. CSS transitions suavizan las actualizaciones

### 8.4 Cómo se actualizan en tiempo real

```
Go service.Service (30Hz emit)
  → diff.Compute(prev, curr) → JSON diff payload
  → TelemetryBridge → Wails event 'telemetry:update'
  → React Events.On() → telemetry-store update
  → Selectores Zustand → re-render selectivo
  → CSS transitions interpolan valores
```

### 8.5 Puntos de integración estables para Strategy Planner

- **`pkg/models/telemetry.go`** — Modelo de datos unificado (estable, no cambiar)
- **`internal/telemetry/service/service.go`** — `Subscribe()` para recibir datos (estable)
- **`pkg/config/profile.go`** — Schema de perfiles (extensible)
- **`internal/app/hub_service.go`** — Servicio de hub (extensible)
- **Frontend: `hub/overlays/`** — Para añadir nueva página en Hub
- **Frontend: `overlay/widgets/`** — Para añadir nuevo widget de overlay

---

## 9. Persistencia y Datos

### 9.1 Persistencia local (Go)

| Dato | Archivo | Creado por | Modificado por | Consumido por |
|------|---------|-----------|----------------|---------------|
| Perfiles | `configs/*.json` | `ProfileService` | `ProfileService.SaveProfile()` | Frontend, Overlay |
| App settings | `configs/app-settings.json` | `SettingsService` | `SettingsService.Save()` | Frontend, todos los servicios |
| Updater settings | `configs/updater-settings.json` | `UpdaterService` | `UpdaterService` | Updater |
| License cache | `configs/license-cache.json` | `LicenseService` | `LicenseService` | LicenseService (offline) |
| Calendar | `configs/calendar-lmu.json` | `CalendarService` | `CalendarService` | CalendarService |

**Patrón de escritura:** Temp file + rename (atomic write) + .bak rotation + sidecar recovery (.failed files)

**Perfiles embebidos:** `configs/embed.go` usa `//go:embed` para incluir perfiles default. Se copian al directorio de config del usuario en el primer arranque.

### 9.2 Supabase (remoto)

**Tablas:**
| Tabla | Propósito |
|-------|-----------|
| `profiles` | Perfiles de usuario (display_name, email, language, primary_simulator) |
| `licenses` | Licencias (tier, hwid, expires_at) — Legacy |
| `subscriptions` | Suscripciones — Legacy |
| `license_validations` | Audit log de validaciones |
| `hwid_changes` | Tracking de cambios de HWID |
| `rate_limits` | Rate limiting |
| `user_entitlements` | Entitlements por producto (Fase 1.6) |
| `devices` | Device binding (1 device por user) |
| `license_events` | Event log idempotente |
| `billing_customers` | Customer links por provider |
| `billing_subscriptions` | Subscriptions por provider |

**RPCs:**
- `get_account_entitlements(device_fingerprint)` — Retorna entitlements + device binding status
- `reset_active_device(device_fingerprint)` — Limpia binding (rate-limited 1/24h)

**Edge Functions:**
- `billing-webhook` — Procesa eventos Polar (order.paid, subscription.*)
- `billing-checkout` — Crea sesión de checkout Polar
- `billing-portal` — Crea portal de gestión de cliente

### 9.3 Identidad de usuario

- Auth via Supabase (email/password + OAuth)
- JWT almacenado en `safeStorage` (Electron, encrypted files)
- HWID: SHA-256 de machine ID (Windows)
- Device binding: 1 device por usuario (reset con rate limit)

### 9.4 Licencias y Entitlements

**Tiers:** Free → Pro → Ultimate

**Feature gates:**
- Free: iRacing, overlays básicos (4), 2 temas
- Pro: +LMU+AC, todos los overlays, temas custom
- Ultimate: +rFactor2+Assetto, data-blocks, custom themes

**Productos Polar:**
- `launch_lifetime` — Compra única, lifetime
- `pro_monthly` — Suscripción mensual
- `V1_ENTITLEMENT_PRODUCT_KEY = "bundle"` — Clave única para todos los tiers pagados

### 9.5 Offline mode

- TTL: 24h (cache de licencia fresca)
- Grace period: 72h (licencia aún válida después del TTL)
- Después del grace: degrada a tier 'free'
- Sin sync en background (request-response pattern)

---

## 10. Dependencias y Paquetes

### 10.1 Dependencias Go principales

| Paquete | Propósito |
|---------|-----------|
| `github.com/wailsapp/wails/v3` | Framework desktop (v3 alpha) |
| `github.com/shirou/gopsutil/v4` | Métricas CPU/memoria |
| `github.com/stretchr/testify` | Testing |
| `golang.org/x/sys` | Win32 syscalls (mmap, hotkeys) |
| `github.com/coder/websocket` | WebSocket (Wails) |
| `github.com/go-git/v5` | Git operations (updater) |

### 10.2 Dependencias Frontend principales

| Paquete | Propósito |
|---------|-----------|
| React 19 | UI framework |
| Tailwind CSS v4 | Styling |
| shadcn/ui | Componentes UI (variantes de Radix) |
| Zustand | State management |
| Vite 8 | Build tool |
| `@wailsio/runtime` | Wails JS runtime |
| `@supabase/supabase-js` | Supabase client |
| Zod | Schema validation |
| Lucide React | Icons |

### 10.3 Librerías relevantes para Strategy Planner

| Necesidad | Librería existente | Estado |
|-----------|-------------------|--------|
| Drag-and-drop | ❌ No hay librería DnD actualmente | Necesita evaluar |
| Charts/gráficos | ❌ No hay librería de charts | Necesita evaluar |
| State management | Zustand ✅ | Ya disponible |
| Forms | Zod schemas + SettingsForm auto-generated | Ya disponible |
| Persistencia | Go file-based JSON + Supabase | Ya disponible |
| Telemetría access | `Subscribe()` en `service.Service` | Ya disponible |

> **No existe actualmente una dependencia adecuada para construir un planificador visual.** Se necesitaría evaluar librerías como `react-dnd`, `@dnd-kit`, `recharts`/`nivo`, o `@xyflow/react` para un visual flow builder.

---

## 11. Sistema de Tests

### 11.1 Frameworks

| Nivel | Framework | Config |
|-------|-----------|--------|
| Unit (frontend) | Vitest + React Testing Library | `apps/desktop/vitest.config.ts` |
| E2E | Playwright | `apps/desktop/playwright.config.ts` |
| Unit (Go) | `go test` + testify | Integrado en Go |
| Component | Storybook v8 | `apps/desktop/.storybook/` |
| Supabase EF | Deno test | Integrado en Edge Functions |

### 11.2 Ubicación de tests

**Go tests (v2):**
- `cmd/vantare/main_test.go` (1029 líneas)
- `internal/app/*_test.go` (15+ archivos)
- `internal/telemetry/*_test.go` (15+ archivos)
- `internal/license/*_test.go` (8 archivos)
- `internal/server/*_test.go`
- `pkg/config/profile_test.go`

**Frontend tests (v1 legacy):**
- `apps/desktop/e2e/` (8 archivos Playwright)
- `apps/desktop/src/**/__tests__/` (25+ archivos Vitest)
- `packages/sim-core/` (14 archivos de test)
- `packages/ui-core/` (14 archivos de test)
- `packages/auth/` (6 archivos de test)

**Supabase tests:**
- `supabase/functions/_shared/*.test.ts` (3 archivos)
- `supabase/functions/billing-*/index.test.ts` (3 archivos)

### 11.3 Cobertura

| Área | Cobertura estimada |
|------|-------------------|
| Telemetría (Go) | ✅ Buena (parser, gap, delta, normalizer, service) |
| Perfiles (Go) | ✅ Buena (load, save, convert) |
| Overlays (Go) | ✅ Buena (lifecycle, edit mode toggle) |
| Launcher (Go) | ✅ Buena (discovery, chain, profiles) |
| License (Go) | ✅ Buena (validation, cache, fingerprint) |
| Frontend components | 🟡 Moderada |
| E2E flows | 🟡 Moderada (8 spec files) |
| Edge Functions | ✅ Buena (webhook, checkout, portal) |

### 11.4 Comandos de test

```bash
# Go tests
go test ./...
go test ./cmd/vantare/ -v
go test ./internal/telemetry/... -v

# Frontend tests (v1 legacy)
pnpm test
pnpm test:e2e

# Wails dev
cd vantare-v2 && wails3 dev
```

---

## 12. Convenciones del Proyecto

### 12.1 Nombres de archivos

- **Go:** `snake_case.go` (standard Go)
- **TypeScript:** `PascalCase.tsx` para componentes, `camelCase.ts` para utilidades
- **Tests:** `*_test.go` (Go), `*.test.ts` / `*.test.tsx` (TS)
- **Test files:** Dentro de `__tests__/` directories

### 12.2 Nombres de componentes

- **React:** `PascalCase` (ej: `LayoutStudio.tsx`, `WidgetSettingsPanel.tsx`)
- **Go structs:** `PascalCase` (ej: `ProfileService`, `OverlayController`)
- **Go interfaces:** `PascalCase` con suffix `-er` o descriptivo (ej: `EventEmitter`, `WindowHandle`)

### 12.3 Organización por feature

**Go (v2):** Por dominio en `internal/`:
- `internal/telemetry/` — Todo lo relacionado con telemetría
- `internal/app/` — Core de la aplicación
- `internal/app/launcher/` — Launcher feature
- `internal/engineer/` — Ingeniero feature
- `internal/license/` — Licencias feature

**Frontend (v2):** Por capa en `frontend/src/`:
- `hub/` — Dashboard UI
- `hub/pages/` — Una página por ruta
- `hub/components/` — Componentes compartidos del hub
- `hub/overlays/` — Overlays Studio
- `overlay/` — Widget components del overlay

### 12.4 Manejo de errores (Go)

- Wrapped errors con `%w` para propagación
- Sentinel errors tipados: `ErrMissingSession`, `ErrValidationFailed`, etc.
- Pattern log + emit event: errores se loguean y se surfacen al frontend como `*:error` events
- Graceful degradation en config load failures
- Retry + backoff para settings persistence (3 retries, exponential)

### 12.5 Convenciones de commits

```
feat(scope): description
fix(scope): description
chore(scope): description
docs(scope): description
test(scope): description
```

Scopes comunes: `hub`, `frontend`, `billing`, `supabase`, `telemetry`, `launcher`, `engineer`, `license`

### 12.6 Documentación

- **Docs técnicos:** Español
- **Código:** Inglés
- **Comentarios:** Inglés
- **UI strings:** Inglés
- **Commits:** Inglés

### 12.7 Idiomas de la UI

- No hay sistema i18n configurado actualmente
- `language` en settings está definido pero sin archivos de traducción
- Solo se usa `'en'` efectivamente

---

## 13. Archivos Compartidos y Zonas de Conflicto

### 13.1 Archivos que múltiples features modifican

| Archivo | Ruta | Por qué es zona de conflicto |
|---------|------|------------------------------|
| `pkg/config/profile.go` | `vantare-v2/pkg/config/profile.go` | Schema de perfiles — toda feature que añada datos lo modifica |
| `cmd/vantare/main.go` | `vantare-v2/cmd/vantare/main.go` | Wire de servicios — toda feature nueva registra servicios aquí |
| `internal/app/hub_service.go` | `vantare-v2/internal/app/hub_service.go` | Hub operations — toda feature de UI pasa por aquí |
| `internal/app/settings_service.go` | `vantare-v2/internal/app/settings_service.go` | Settings — feature gating, nuevos settings |
| `pkg/models/telemetry.go` | `vantare-v2/pkg/models/telemetry.go` | Modelo de telemetría — nuevos campos |
| `configs/*.json` | `vantare-v2/configs/` | Perfiles default embebidos |
| `frontend/src/hub/HubLayout.tsx` | `vantare-v2/frontend/src/hub/HubLayout.tsx` | Navegación sidebar |
| `frontend/src/hub/pages/` | `vantare-v2/frontend/src/hub/pages/` | Todas las páginas del Hub |
| `internal/telemetry/service/service.go` | `vantare-v2/internal/telemetry/service/service.go` | Core de telemetría — subscribe, emit |
| `docs/` | `docs/` | Documentación — planes, arquitectura |

### 13.2 Worktrees que podrían entrar en conflicto

- `refactor` branch — Refactor grande activo
- `feature` branch — Features generales
- `launch/polar-billing` — Billing integration
- `codex/engineer-release` — Engineer feature

### 13.3 Documentos de planes activos

- `docs/superpowers/plans/2026-07-10-remove-widget-studio-unify-overlays.md` — Unificación reciente
- `docs/superpowers/plans/2026-07-10-layout-studio-subnav-redesign.md` — Sub-nav redesign

---

## 14. Trabajo en Curso

### 14.1 Overlays Studio refactor

| Aspecto | Estado |
|---------|--------|
| Eliminar WidgetStudio | ✅ Completado (commit `53dffc6`) |
| Eliminar WidgetPreviewPanel | ✅ Completado (commit `6d83a94`) |
| Absorber selectores en LayoutStudio | ✅ Completado (commit `c303369`, `ba455d5`) |
| Sub-nav redesign (icon rail) | 🟡 Planificado, no implementado |
| Remover "Widgets" card de V52OverlaysHome | 🟡 Pendiente |
| Remover mode "widgets" de OverlaysStudioPage | 🟡 Pendiente |

### 14.2 Ingeniero IA

| Aspecto | Estado |
|---------|--------|
| Core spotter (physics, alignment, overlap) | ✅ Funcional |
| Audio queue + playback | ✅ Funcional |
| Notification store | ✅ Funcional |
| Simulator adapter | ✅ Funcional |
| Replay from JSONL | ✅ Funcional |
| Wails bridge | ✅ Funcional |
| SSE for OBS | ✅ Funcional |

### 14.3 Polar billing

| Aspecto | Estado |
|---------|--------|
| Provider-agnostic schema | ✅ Completado |
| Edge Functions (webhook, checkout, portal) | ✅ Completado |
| Device binding RPC | ✅ Completado |
| Entitlements system | ✅ Completado |
| Frontend integration | ✅ Completado |

### 14.4 Refactor general

| Aspecto | Estado |
|---------|--------|
| Migración v1 → v2 | 🟡 En curso (v2 activo, v1 archivado) |
| Multi-sim (iRacing, AC) en v2 | 🔲 Pendiente (fundamentos en v1) |
| i18n | 🔲 No existe |
| Persistencia de telemetría histórica | 🔲 No existe |

---

## 15. Posibles Puntos de Integración del Strategy Planner

### 15.1 Nueva página en el Hub

**Opción:** Añadir `/strategy` al Hub como nueva página.

**Archivos implicados:**
- `vantare-v2/frontend/src/hub/HubLayout.tsx` — Añadir NavLink
- `vantare-v2/frontend/src/hub/pages/StrategyPage.tsx` — Nueva página
- `vantare-v2/cmd/vantare/main.go` — Wiring si necesita servicio Go

**Dependencias:** Ninguna adicional si es puramente frontend.
**Riesgos:** Bajo. Es una página aislada.
**Trabajo previo:** Definir el schema de datos de una estrategia.

### 15.2 Modelos de dominio

**Opción:** Crear `pkg/config/strategy.go` con el modelo de datos.

**Archivos implicados:**
- `vantare-v2/pkg/config/strategy.go` — Modelo Strategy
- `vantare-v2/pkg/config/profile.go` — Referenciar strategy desde profile

**Dependencias:** Schema de profile existente.
**Riesgos:** Medio. El schema de profile ya es complejo.
**Limitación:** No romper compatibilidad con perfiles existentes.

### 15.3 Persistencia de estrategias

**Opción A: Local** — `configs/strategies/*.json` (mismo patrón que perfiles)
**Opción B: Supabase** — Nueva tabla `strategies` con RPC
**Opción C: Hibrida** — Local + sync opcional con Supabase

**Archivos implicados:**
- `vantare-v2/internal/app/strategy_service.go` — CRUD
- `vantare-v2/cmd/vantare/main.go` — Wiring
- `supabase/migrations/` — Nueva migración si se usa Supabase

**Dependencias:** License service (para feature gating).
**Riesgos:** Medio. Persistencia local es simple; Supabase añade complejidad.

### 15.4 Acceso a telemetría

**Opción:** Suscribirse al pipeline existente de telemetría.

**Archivos implicados:**
- `vantare-v2/internal/telemetry/service/service.go` — `Subscribe()`
- `vantare-v2/internal/app/strategy_bridge.go` — Bridge para enviar datos al frontend

**Dependencias:** Telemetry service (ya existe y es estable).
**Riesgos:** Bajo. El patrón `Subscribe()` ya está establecido.
**Limitación:** Solo datos en vivo de LMU. Datos históricos no existen.

### 15.5 Overlays de estrategia

**Opción:** Añadir widget `strategy` al sistema de overlays.

**Archivos implicados:**
- `vantare-v2/frontend/src/overlay/widgets/strategy/` — Nuevo widget
- `vantare-v2/pkg/config/profile.go` — Añadir tipo `strategy` a WidgetConfig
- `vantare-v2/internal/window/` — Posiblemente ajustar bounds

**Dependencias:** Sistema de overlays (estable pero en refactor).
**Riesgos:** Medio. Overlays Studio está refactorizándose.
**Limitación:** El sistema de overlays es para datos en vivo, no para planificación estática.

### 15.6 Integración futura con Ingeniero IA

**Opción:** El Strategy Planner podría recibir sugerencias del Ingeniero (pit window, fuel save, etc.).

**Archivos implicados:**
- `vantare-v2/internal/engineer/service/engineer_service.go` — Emitir eventos de estrategia
- `vantare-v2/internal/engineer/core/runtime.go` — Añadir lógica de stratégie

**Dependencias:** Ingeniero service (estable).
**Riesgos:** Alto. El Ingeniero tiene su propio scope claro.
**Limitación:** El Ingeniero es un spotter en tiempo real, no un planificador.

### 15.7 Comparación entre datos estimados y reales

**Opción:** El Strategy Planner estima, y al final de la carrera compara con datos reales.

**Archivos implicados:**
- Necesitaría persistencia de datos históricos (NO EXISTE actualmente)
- `supabase/migrations/` — Tabla `session_history`
- `vantare-v2/internal/telemetry/` — Grabación de datos

**Dependencias:** Sistema de recording (parcialmente existe en v1: `telemetry-recorder.ts`).
**Riesgos:** Alto. Requiere infraestructura nueva significativa.
**Limitación:** No hay persistencia de telemetría histórica actualmente.

---

## 16. Preguntas Arquitectónicas Pendientes

1. **¿Frontend o Go para los cálculos de estrategia?**
   - Frontend: más rápido de iterar, acceso directo a UI
   - Go: más rápido en runtime, acceso directo a telemetría, persistencia natural
   - **El repo no impone una respuesta clara.** Ambos son viables.

2. **¿Persistencia local o Supabase para estrategias?**
   - Local: más simple, funciona offline, sin dependencia de red
   - Supabase: sync entre dispositivos, sharing con equipos
   - **El repo usa local para perfiles/settings. Supabase para auth/entitlements.** Podría seguir el mismo patrón.

3. **¿Datos en vivo o históricos?**
   - En vivo: ya disponible via `Subscribe()`
   - Históricos: **NO EXISTE**. Requiere sistema de grabación + storage.

4. **¿Separación entre planner y telemetría?**
   - El planner podría ser una herramienta offline que no dependa de telemetría en vivo
   - O podría ser un overlay que muestre la estrategia planificada vs datos reales
   - **El repo no impone separación.**

5. **¿Modelo de neumáticos?**
   - LMU no expone datos de neumáticos en shared memory
   - Habría que modelar neumáticos basándose en datos indirectos (fuel, pace, weather)
   - **No hay modelo de neumáticos en el repo actual.**

6. **¿Estrategias por evento, coche o circuito?**
   - El calendario LMU ya distingue entre eventos y series
   - Los perfiles ya tienen `primary_simulator`
   - **El repo no impone una granularidad.**

7. **¿Compatibilidad con múltiples simuladores?**
   - Solo LMU está implementado en v2
   - El modelo `SimulatorKind` es extensible
   - **El Strategy Planner debería ser independiente del sim.**

8. **¿Necesidad de un motor de simulación?**
   - El planner podría necesitar simular laps para estimar stints
   - O podría usar datos históricos de LMU
   - **No hay motor de simulación en el repo.**

9. **¿Integración con overlays?**
   - Los overlays son para datos en vivo
   - Un overlay de estrategia mostraría la estrategia planificada
   - **Es viable pero Overlays Studio está refactorizándose.**

10. **¿Integración con el futuro Ingeniero IA?**
    - El Ingeniero ya procesa telemetría en tiempo real
    - Podría emitir eventos de "pit window" o "fuel save"
    - **Es una posibilidad futura, no un requisito actual.**

---

## 17. Índice de Archivos Importantes

| Ruta | Responsabilidad | Relevancia | Estado |
|------|----------------|------------|--------|
| `vantare-v2/cmd/vantare/main.go` | Entry point, wiring de servicios | Punto de partida para añadir nuevos servicios | Estable |
| `vantare-v2/internal/telemetry/service/service.go` | Core telemetry pipeline | Subscribe() para recibir datos | Estable |
| `vantare-v2/internal/telemetry/lmu/parser.go` | LMU shared memory parser | Fuente de datos | Estable |
| `vantare-v2/pkg/models/telemetry.go` | Unified telemetry model | Contrato de datos | Estable |
| `vantare-v2/pkg/config/profile.go` | Profile schema v2 | Extensible para strategy | Estable |
| `vantare-v2/internal/app/hub_service.go` | Hub operations | Service binding para frontend | Estable |
| `vantare-v2/internal/app/settings_service.go` | App settings persistence | Para nuevos settings | Estable |
| `vantare-v2/internal/window/manager.go` | Overlay window management | Para overlays de strategy | Estable |
| `vantare-v2/internal/server/server.go` | HTTP/SSE server | Para OBS streaming | Estable |
| `vantare-v2/internal/license/service.go` | License validation | Feature gating | Estable |
| `vantare-v2/internal/engineer/service/engineer_service.go` | Race engineer | Posible integración futura | Estable |
| `vantare-v2/internal/app/launcher/launcher.go` | App launcher | Posible lanzar apps desde strategy | Estable |
| `vantare-v2/frontend/src/hub/HubLayout.tsx` | Hub sidebar navigation | Para añadir ruta /strategy | En desarrollo |
| `vantare-v2/frontend/src/hub/overlays/LayoutStudio.tsx` | Layout editor | Referencia de patrón de editor | En refactor |
| `vantare-v2/frontend/src/overlay/CompositeApp.tsx` | Overlay composition | Para widgets de strategy | Estable |
| `supabase/migrations/` | Database schema | Para strategy persistence | Activo |
| `supabase/functions/billing-webhook/` | Polar billing | Referencia de Edge Function pattern | Estable |
| `docs/proyecto/README.md` | Project documentation index | Guía canonical | Activo |
| `docs/V2-MASTER-PLAN.md` | v2 master plan | Contexto de roadmap | Activo |
| `hub_main_v5.html` | Hub visual design | Fuente de verdad visual | Activo |

---

## 18. Diagramas

### 18.1 Flujo de datos: Simulador → Overlay

```
┌─────────────┐
│  LMU Sim    │
│  (escribe   │
│  shared mem)│
└──────┬──────┘
       │ mmap (324,820 bytes)
       ▼
┌──────────────┐
│ lmu.Reader  │  ← OpenFileMappingW / MapViewOfFile
│ .Bytes()    │     zero-copy, <0.5ms
└──────┬───────┘
       │ []byte
       ▼
┌──────────────┐
│ lmu.Parse() │  ← Decodifica offsets → *models.Telemetry
│              │     <2ms
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ normalizer   │  ← Convierte raw → modelo unificado
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ gap.Compute  │  ← Calcula gaps entre vehículos
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ pipeline     │  ← Deadband filter (elimina ruido)
│ .Filter()    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ service      │  ← Dual ticker: 60Hz read / 30Hz emit
│ .flushEmit() │
└──────┬───────┘
       │
       ├──→ diff.Compute() → JSON diff payload
       │
       ├──→ TelemetryBridge → Wails event 'telemetry:update'
       │         │
       │         ▼
       │    ┌──────────┐
       │    │ React    │ → telemetry-store → Widget re-render
       │    │ Frontend │    CSS transitions → 60fps visual
       │    └──────────┘
       │
       └──→ HTTP SSE '/telemetry/stream'
                  │
                  ▼
             ┌──────────┐
             │ OBS      │ → Browser Source
             │ Studio   │    Overlay transparente
             └──────────┘
```

### 18.2 Comunicación: React ↔ Wails ↔ Go

```
┌─────────────────────────────────────────────────┐
│                 REACT FRONTEND                   │
│                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐│
│  │ Hub Pages   │  │ Overlay     │  │ Stores   ││
│  │ (Dashboard, │  │ Widgets     │  │ (Zustand)││
│  │  Strategy)  │  │ (delta, etc)│  │          ││
│  └──────┬──────┘  └──────┬──────┘  └────┬─────┘│
│         │                │              │        │
│         └────────────────┼──────────────┘        │
│                          │                       │
│              ┌───────────▼───────────┐           │
│              │  Wails Runtime        │           │
│              │  Events.On()          │           │
│              │  Events.Emit()        │           │
│              │  Bindings (auto-gen)  │           │
│              └───────────┬───────────┘           │
└──────────────────────────┼───────────────────────┘
                           │ Wails IPC
                           ▼
┌──────────────────────────────────────────────────┐
│                  GO BACKEND                       │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │ cmd/vantare/main.go                        │  │
│  │  - Wails app init                          │  │
│  │  - Service registration                    │  │
│  │  - Event handler wiring                    │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
│  ┌──────────────▼─────────────────────────────┐  │
│  │ Services (Wails-bound)                     │  │
│  │  ProfileService, HubService, LicenseService │  │
│  │  SettingsService, UpdaterService, etc.     │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
│  ┌──────────────▼─────────────────────────────┐  │
│  │ Internal packages                          │  │
│  │  telemetry/ → service, lmu, normalizer     │  │
│  │  window/    → overlay lifecycle            │  │
│  │  server/    → HTTP/SSE                     │  │
│  │  engineer/  → spotter, audio               │  │
│  │  license/   → validation, cache            │  │
│  │  launcher/  → discovery, chain             │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 18.3 Persistencia: Local y Remota

```
┌──────────────────────────────────────────────┐
│              LOCAL (Go filesystem)            │
│                                               │
│  configs/                                     │
│  ├── profiles/*.json     ← ProfileService     │
│  ├── app-settings.json   ← SettingsService    │
│  ├── updater-settings.json ← UpdaterService   │
│  ├── license-cache.json  ← LicenseService     │
│  ├── calendar-lmu.json   ← CalendarService    │
│  └── *.bak, *.failed     ← Recovery files     │
│                                               │
│  Patrón: atomic write (temp + rename)         │
│  Backup: .bak rotation                        │
│  Recovery: .failed sidecar                    │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              REMOTO (Supabase)                │
│                                               │
│  PostgreSQL:                                  │
│  ├── profiles              ← User profiles    │
│  ├── user_entitlements     ← Product access   │
│  ├── devices               ← Device binding   │
│  ├── billing_customers     ← Polar customers  │
│  ├── billing_subscriptions ← Polar subs       │
│  └── license_events        ← Event log        │
│                                               │
│  RPCs:                                        │
│  ├── get_account_entitlements()               │
│  └── reset_active_device()                    │
│                                               │
│  Edge Functions:                              │
│  ├── billing-webhook      ← Polar events      │
│  ├── billing-checkout     ← Create checkout   │
│  └── billing-portal       ← Customer portal   │
│                                               │
│  Auth:                                        │
│  └── Supabase Auth (email/password, OAuth)    │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              OFFLINE CACHE                    │
│                                               │
│  License:                                     │
│  ├── TTL: 24h (fresco)                        │
│  ├── Grace: 72aún válido                      │
│  └── Después: degrada a 'free'                │
│                                               │
│  Session:                                     │
│  └── safeStorage (Electron, encrypted files)  │
└──────────────────────────────────────────────┘
```

### 18.4 Relación: Overlays Studio → Telemetry → Ingeniero IA

```
┌─────────────────────────────────────────────────────┐
│                  OVERLAYS STUDIO                     │
│  (Editor visual de widgets)                          │
│                                                      │
│  LayoutStudio.tsx ← Editor principal (drag/resize)   │
│  WidgetSettingsPanel.tsx ← Config de cada widget     │
│  V52OverlaysHome.tsx ← Home de la sección            │
│                                                      │
│  Output: ProfileConfig JSON con WidgetConfigs        │
│  Guarda via: ProfileService.SaveProfile()            │
└──────────────────────┬──────────────────────────────┘
                       │ ProfileConfig
                       ▼
┌──────────────────────────────────────────────────────┐
│                  OVERLAY RENDERER                     │
│  (Ventana transparente click-through)                 │
│                                                       │
│  CompositeApp.tsx → WidgetHost.tsx → Widgets          │
│  Recibe: telemetry:update events (30Hz)               │
│  Renderiza: widgets según ProfileConfig               │
└──────────────────────┬──────────────────────────────┘
                       │ telemetry data
                       ▼
┌──────────────────────────────────────────────────────┐
│                  TELEMETRY PIPELINE                   │
│  (60Hz read / 30Hz emit)                              │
│                                                       │
│  LMU → parser → normalizer → gap → deadband → emit    │
│  Subscribe() para consumidores                        │
└──────────┬──────────────────────┬────────────────────┘
           │                      │
           ▼                      ▼
┌──────────────────┐  ┌──────────────────────────────┐
│  OVERLAY RENDERER │  │  INGENIERO IA                │
│  (widgets live)   │  │  (spotter + audio)           │
└──────────────────┘  │                               │
                      │  Procesa telemetría en vivo   │
                      │  Detección de solapes         │
                      │  Audio queue + notifications  │
                      │  Replay from JSONL            │
                      └──────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              FUTURO: TIRE STRATEGY PLANNER            │
│  (No existe todavía)                                  │
│                                                       │
│  Opción 1: Nueva página en Hub (/strategy)            │
│  Opción 2: Widget de overlay                          │
│  Opción 3: Herramienta independiente                  │
│                                                       │
│  Datos: telemetría live + modelo de neumáticos        │
│  Persistencia: local (JSON) + opcional Supabase       │
│  Integración: Subscribe() al pipeline existente       │
└──────────────────────────────────────────────────────┘
```

---

## 19. Grado de Confianza

### ✅ Completamente verificado

- Estructura de directorios del repositorio
- Git state (rama, commits, worktrees)
- Stack tecnológico (Go 1.25, Wails v3, React 19, Tailwind v4)
- Pipeline de telemetría LMU (mmap → parser → normalizer → service)
- Sistema de licencias y billing (Polar, Supabase, Edge Functions)
- Patrón de comunicación Go ↔ Frontend (Wails services + events)
- Persistencia local (profiles, settings, license cache)
- Modelo de datos de telemetría (`pkg/models/telemetry.go`)
- Schema de perfiles (`pkg/config/profile.go`)
- Estado del refactor de Overlays Studio (WidgetStudio eliminado)
- Sistema de tests (Go test, Vitest, Playwright)
- Dependencias principales

### 🟡 Parcialmente verificado

- Cobertura exacta de tests (estimada, no contada)
- Contenido exacto de todos los archivos de `internal/app/` (leídos parcialmente)
- Estado de las ramas `refactor` y `feature` (solo conocidas por nombre)
- Detalles del schema de `frontend/src/overlay/widgets/` (estructura conocida, contenido no leído completo)
- Sistema de temas en v2 (parcialmente leído)

### ⬜ Necesita revisión humana

- Compatibilidad exacta de Wails v3 alpha (puede haber breaking changes)
- Estado real de las ramas de trabajo (commits sin push, stash contents)
- Rendimiento real del pipeline en hardware variado
- Estado de la integración Polar en producción
- Si el sub-nav redesign de LayoutStudio ya fue implementado en otra rama
- Contenido exacto de `configs/*.json` (profiles embebidos)
- Si hay datos de LMU compartidos entre worktrees
- Compatibilidad con versiones futuras de LMU

---

> **Este documento fue generado el 2026-07-10.** La información se basa en el estado del repo en la rama `opencode/cosmic-otter` con HEAD en `f22d64b`. Para decisiones arquitectónicas, se recomienda verificar los archivos fuente directamente.
