# Roadmap de Desarrollo — Vantare Overlays v1.0

> **Versión**: 2.0.0 | **Fecha**: 2026-06-01 | **Estado**: Final  
> Roadmap actualizado tras auditoría completa de features (28 features, 8 sprints, 16 semanas).

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Features v1.0](#2-features-v10)
3. [Sprint 1 — Foundation](#3-sprint-1--foundation)
4. [Sprint 2 — Telemetry Pipeline](#4-sprint-2--telemetry-pipeline)
5. [Sprint 3 — Core Overlays](#5-sprint-3--core-overlays)
6. [Sprint 4 — More Overlays + Hub UI](#6-sprint-4--more-overlays--hub-ui)
7. [Sprint 5 — Multi-Sim + LMU](#7-sprint-5--multi-sim--lmu)
8. [Sprint 6 — Themes + Auth](#8-sprint-6--themes--auth)
9. [Sprint 7 — Polish + Distribution](#9-sprint-7--polish--distribution)
10. [Sprint 8 — Testing + Release](#10-sprint-8--testing--release-v10)
11. [Post-v1 Roadmap](#11-roadmap-post-v1)

---

## 1. Visión General

### 1.1 Objetivo

Vantare Overlays es una aplicación de escritorio Electron para simracing que ofrece overlays de telemetría en tiempo real para streaming (OBS Studio) y uso multi-monitor. Compite con RaceLabs diferenciándose por soporte multi-sim, theme system completo y modelo freemium.

### 1.2 Timeline

```
Semana  1-2  ████████  Sprint 1:  Foundation
Semana  3-4  ████████  Sprint 2:  Telemetry Pipeline
Semana  5-6  ████████  Sprint 3:  Core Overlays
Semana  7-8  ████████  Sprint 4:  More Overlays + Hub UI
Semana  9-10 ████████  Sprint 5:  Multi-Sim + LMU
Semana 11-12 ████████  Sprint 6:  Themes + Auth
Semana 13-14 ████████  Sprint 7:  Polish + Distribution
Semana 15-16 ████████  Sprint 8:  Testing + Release v1.0
```

### 1.3 Métricas de Éxito

| Métrica | Objetivo |
|---|---|
| Tiempo de renderizado de overlay | < 16ms (60 FPS) |
| Uso de memoria (renderer) | < 150MB |
| Tiempo de arranque de la app | < 3 segundos |
| Cobertura de tests (unit + component) | > 80% |
| Cobertura E2E (sprints 5-8) | > 70% |

### 1.4 Dependencias Críticas

| Dependencia | Impacto | Mitigación |
|---|---|---|
| iRacing SDK (irsdk-node) | Alto | Fork propio si no disponible vía npm |
| LMU Shared Memory Interface v1.2+ | Alto | Seguir changelog de LMU |
| Supabase | Medio | Free tier generoso para empezar |
| Electron | Bajo | Estable, v33+ |

---

## 2. Features v1.0

### 2.1 Catálogo Completo (28 features)

```
F-001: Telemetry Pipeline (sim → unified → store)
F-002: Multi-Sim Adapter Layer (SimAdapter + Normalizer)
F-003: Overlay System (registry + Electron windows + HTTP pages)
F-004: Standings Overlay
F-005: Relative Overlay
F-006: Delta Bar Overlay
F-007: Stream Alerts Overlay
F-008: Hub Dashboard (settings, themes, profiles)
F-009: Theme System (3 built-in + custom + Tailwind v4 @theme)
F-010: Auth & Licensing (Supabase + Free/Pro/Ultimate tiers)
F-011: Profile Management (CRUD, import/export, switching)
F-012: HTTP Server + OBS Integration (SSE, Browser Sources)
F-013: Electron Windows Mode (multi-monitor overlays)
F-014: System Tray + Auto-start + Key Bindings
F-015: Auto-Updater (GitHub Releases)
F-016: Feature Gating (premium feature toggles)
F-017: Storybook UI Dev Environment (isolated overlay development)
F-018: Overlay Configuration System (Zod schemas + auto-generated settings UI)
F-019: Calculations Module (gaps, fuel, delta, relative, interpolation)
F-020: Debug Tools Overlay (FPS, pipeline latency, re-renders, memory)
F-021: Offline Mode (license caching, grace period, degraded features)
F-022: Logging System (electron-log, structured logging)
F-023: Telemetry Inspector (raw data viewer for debugging)
F-024: CSS Animation System (transitions, keyframes, alert animations)
F-025: Security Model (contextBridge isolation, CSP, Electron fuses, RLS)
F-026: Code Quality Pipeline (ESLint flat config, Prettier, Husky, lint-staged)
F-027: Git Strategy + Conventional Commits + Changesets
F-028: Preview Overlay (dev-only overlay showing real-time perf stats)
```

### 2.2 Distribución por Sprint

| Sprint | Features |
|---|---|
| Sprint 1 | F-017, F-022, F-025, F-026, F-027 |
| Sprint 2 | F-001, F-019, F-020, F-028 |
| Sprint 3 | F-003, F-004, F-005, F-012, F-013, F-017, F-018 |
| Sprint 4 | F-006, F-007, F-008, F-017, F-018, F-024 |
| Sprint 5 | F-002 (reales), F-023 |
| Sprint 6 | F-009, F-010, F-016, F-021 |
| Sprint 7 | F-011, F-014, F-015 |
| Sprint 8 | Validación + Release |

---

## 3. Sprint 1 — Foundation

**Semanas**: 1-2 | **Features**: F-017, F-022, F-025, F-026, F-027
**Objetivo**: App Electron funcional con infraestructura completa de desarrollo.

### Tareas

| ID | Tarea | Estado |
|---|---|---|
| T1.1 | Verificar monorepo (pnpm, turbo, tsconfig.base) | ✅ |
| T1.2 | Verificar Electron shell (main, preload, renderer, vite configs) | ✅ |
| T1.3 | Verificar IPC bridge (contextBridge, shared/types/bridge.ts) | ✅ |
| T1.4 | Verificar Tailwind CSS v4 (globals.css, @import "tailwindcss") | ✅ |
| T1.5 | Verificar Zustand store boilerplate (telemetry-store.ts) | ✅ |
| T1.6 | Configurar ESLint + Prettier + Husky + lint-staged + commitlint (F-026) | 🔲 |
| T1.7 | Configurar GitHub Actions CI (lint, typecheck, test, build) | 🔲 |
| T1.8 | Configurar Storybook (init + config) (F-017) | 🔲 |
| T1.9 | Configurar electron-log wrapper (F-022) | 🔲 |
| T1.10 | Verificar Security Model (CSP, Electron fuses, contextBridge) (F-025) | 🔲 |
| T1.11 | Configurar Conventional Commits + Changesets (F-027) | 🔲 |
| T1.12 | `pnpm install` → verificar compilación completa | 🔲 |
| T1.13 | `pnpm dev` → verificar Electron abre con React Tailwind | 🔲 |

### Entregables

- [ ] App Electron arranca desde `pnpm dev`
- [ ] Renderer muestra contenido React con Tailwind
- [ ] Comunicación IPC funcional (main ↔ renderer)
- [ ] ESLint + Prettier + Husky pasando en pre-commit
- [ ] CI pasando en GitHub Actions
- [ ] Storybook arranca con stories por defecto
- [ ] Conventional Commits configurado (commitlint)

---

## 4. Sprint 2 — Telemetry Pipeline

**Semanas**: 3-4 | **Features**: F-001, F-019, F-020, F-028
**Objetivo**: Pipeline de telemetría completo desde mock sim → Zustand store → React.

### Tareas

| ID | Tarea | Estado |
|---|---|---|
| T2.1 | Finalizar types en `packages/sim-core/src/types/index.ts` (15 interfaces) | 🔲 |
| T2.2 | Implementar `SimAdapter` interface en `sim/adapters/base.ts` | 🔲 |
| T2.3 | Implementar `SimManager` (polling loop, auto-detect, reconnect) | 🔲 |
| T2.4 | Crear iRacing mock adapter (`sim/adapters/iracing/mock.ts`) | 🔲 |
| T2.5 | Implementar normalizer (`packages/sim-core/src/normalizer.ts`) | 🔲 |
| T2.6 | **F-019: Calculations Module** — gaps, fuel, delta, interpolation, track | 🔲 |
| T2.7 | Integrar SimManager con IPC handlers (canales sim:available, sim:active) | 🔲 |
| T2.8 | Conectar IPC telemetry push (canal `telemetry` en main → renderer) | 🔲 |
| T2.9 | Finalizar Zustand telemetry-store (selectores, performance) | 🔲 |
| T2.10 | Refinar `useTelemetry()` hook (error boundaries, loading states) | 🔲 |
| T2.11 | **F-020: Debug Tools Overlay** — FPS counter, latency display | 🔲 |
| T2.12 | **F-028: Preview Overlay** — Dev-only overlay con perf stats | 🔲 |
| T2.13 | Test e2e: mock data aparece en componente React | 🔲 |

### Entregables

- [ ] Mock sim → SimManager → IPC → Zustand → React: pipeline completo
- [ ] Cálculos de gaps, fuel y delta funcionando (F-019)
- [ ] Debug Tools overlay con FPS y latencia
- [ ] Tests E2E pasando con mock data

---

## 5. Sprint 3 — Core Overlays

**Semanas**: 5-6 | **Features**: F-003, F-004, F-005, F-012, F-013, F-017, F-018
**Objetivo**: Standings + Relative overlays funcionando en Electron windows y OBS.

### Tareas

| ID | Tarea | Estado |
|---|---|---|
| T3.1 | Implementar `GlassPanel` shared component | ✅ |
| T3.2 | Implementar `TimeDisplay`, `PositionBadge`, `DeltaIndicator` | ✅ |
| T3.3 | Crear Overlay Registry (JSON-based overlay registration) | 🔲 |
| T3.4 | Implementar `OverlayManager` (BrowserWindow creation per overlay) | 🔲 |
| T3.5 | Implementar `HttpServer` (SSE + overlay HTML pages para OBS) | 🔲 |
| T3.6 | **Standings Overlay** — Full implementation | 🔲 |
| T3.7 | **Relative Overlay** — Full implementation | 🔲 |
| T3.8 | IPC handlers para overlays (show, hide, position, size) | 🔲 |
| T3.9 | **F-017: Storybook stories** — Standings, Relative, Delta stories | 🔲 |
| T3.10 | **F-018: Overlay Config** — Zod schemas para Standings + Relative | 🔲 |
| T3.11 | Test OBS Browser Source con ambos overlays | 🔲 |

### Entregables

- [ ] Standings overlay funcional en Electron window + OBS
- [ ] Relative overlay funcional en Electron window + OBS
- [ ] HTTP Server con SSE broadcasting
- [ ] OverlayManager crea BrowserWindows transparentes
- [ ] Storybook stories para componentes básicos

---

## 6. Sprint 4 — More Overlays + Hub UI

**Semanas**: 7-8 | **Features**: F-006, F-007, F-008, F-017, F-018, F-024
**Objetivo**: Delta Bar + Stream Alerts + Hub Dashboard.

### Tareas

| ID | Tarea | Estado |
|---|---|---|
| T4.1 | **Delta Bar Overlay** — Full implementation | 🔲 |
| T4.2 | **Stream Alerts Overlay** — Full implementation + alert engine | 🔲 |
| T4.3 | Implementar alert engine (queue, priority, display duration) | 🔲 |
| T4.4 | **F-024: CSS Animation System** — fade, slide, pulse, glow clases | 🔲 |
| T4.5 | **Hub Dashboard** — Layout con sidebar + navegación | 🔲 |
| T4.6 | Hub → DashboardPage (sim status, quick settings) | 🔲 |
| T4.7 | Hub → OverlaySettingsPage (per-overlay configs con Zod) | 🔲 |
| T4.8 | Hub → ProfilesPage (CRUD profiles) | 🔲 |
| T4.9 | Settings persistence (electron-store complete) | 🔲 |
| T4.10 | **F-017: Storybook stories** — DeltaBar, StreamAlerts stories | 🔲 |

### Entregables

- [ ] 4 overlays completos (Standings, Relative, Delta Bar, Stream Alerts)
- [ ] Alertas de streaming con animaciones CSS
- [ ] Hub Dashboard con 3 páginas funcionales
- [ ] Config persistente por overlay (Zod schema → UI → store)

---

## 7. Sprint 5 — Multi-Sim + LMU

**Semanas**: 9-10 | **Features**: F-002 (reales), F-023
**Objetivo**: iRacing y LMU reales conectando y enviando telemetría.

### Tareas

| ID | Tarea | Estado |
|---|---|---|
| T5.1 | Implementar iRacing C++ N-API adapter (shared memory reader) | 🔲 |
| T5.2 | Implementar iRacing normalizer (full field mapping) | 🔲 |
| T5.3 | Implementar LMU C++ N-API adapter (shared memory reader) | 🔲 |
| T5.4 | Implementar LMU normalizer (full field mapping) | 🔲 |
| T5.5 | Finalizar SimManager auto-detection (iRacing → LMU → AC) | 🔲 |
| T5.6 | Sim switching UI in Hub | 🔲 |
| T5.7 | AC adapter skeleton (UDP reader, for future) | 🔲 |
| T5.8 | **F-023: Telemetry Inspector** — Raw data viewer overlay | 🔲 |
| T5.9 | Test con iRacing real | 🔲 |
| T5.10 | Test con LMU real | 🔲 |

### Entregables

- [ ] iRacing real → telemetría en overlays
- [ ] LMU real → telemetría en overlays
- [ ] Auto-detection: detecta qué sim está corriendo y conecta automáticamente
- [ ] Telemetry Inspector para debugging de datos crudos

---

## 8. Sprint 6 — Themes + Auth

**Semanas**: 11-12 | **Features**: F-009, F-010, F-016, F-021
**Objetivo**: Sistema de temas y autenticación Supabase completos.

### Tareas

| ID | Tarea | Estado |
|---|---|---|
| T6.1 | Crear `ThemeProvider` (React Context + CSS variables) | 🔲 |
| T6.2 | Crear 3 built-in themes JSON (dark, blood, midnight) | 🔲 |
| T6.3 | Crear theme `defaults.ts` (built-in theme objects) | 🔲 |
| T6.4 | Implementar `useTheme()` hook + dynamic switching | 🔲 |
| T6.5 | Hub → ThemesPage (selector + editor UI) | 🔲 |
| T6.6 | Setup Supabase (users, licenses, subscriptions tables) | 🔲 |
| T6.7 | Configurar RLS policies en Supabase | 🔲 |
| T6.8 | Implementar `AuthService` (login, register, logout, session) | 🔲 |
| T6.9 | Implementar `LicenseValidator` (tier check, HWID binding) | 🔲 |
| T6.10 | Hub → AccountPage (login/register forms, license display) | 🔲 |
| T6.11 | **F-016: Feature Gating** — disable premium features for free tier | 🔲 |
| T6.12 | **F-021: Offline Mode** — license caching, TTL, grace period | 🔲 |

### Entregables

- [ ] 3 temas built-in (Dark, Blood, Midnight) funcionando
- [ ] Cambio de tema dinámico sin recargar
- [ ] Auth completo (registro, login, sesión, logout)
- [ ] Feature gating: Free tier solo features básicas
- [ ] Offline mode: funciona 24h sin internet con licencia cacheada

---

## 9. Sprint 7 — Polish + Distribution

**Semanas**: 13-14 | **Features**: F-011, F-014, F-015
**Objetivo**: App pulida y lista para distribución.

### Tareas

| ID | Tarea | Estado |
|---|---|---|
| T7.1 | System Tray integration (minimize to tray, context menu) | ✅ |
| T7.2 | Keyboard shortcuts (Alt+H toggle overlays) | ✅ |
| T7.3 | Auto-start option (Windows startup registry) | ✅ |
| T7.4 | Auto-updater (electron-updater + GitHub Releases) | ✅ |
| T7.5 | OBS integration testing (all 4 overlays, all themes) | ✅ |
| T7.6 | Network access mode for dual-PC streaming | ✅ |
| T7.7 | Port conflict auto-fallback (3200 → 3201 → etc.) | ✅ |
| T7.8 | Browser Source optimization (CSS variables, no iframes) | ✅ |
| T7.9 | Electron Builder config verification (nsis, icons, publish) | ✅ |
| T7.10 | First `.exe` build and local installation test | ✅ |

### Entregables

- [x] Tray icon funcional con menú contextual
- [x] Auto-update via GitHub Releases
- [x] `.exe` generado con Electron Builder
- [x] Testeado con OBS en modo local y dual-PC
- [x] Atajos de teclado (Alt+H toggle, Alt+Q quit)

---

## 10. Sprint 8 — Testing + Release v1.0

**Semanas**: 15-16 | **Features**: Todas
**Objetivo**: v1.0.0 released.

### Tareas

| ID | Tarea | Estado |
|---|---|---|
| T8.1 | E2E tests con Playwright (overlay rendering, IPC, auth) | ✅ |
| T8.2 | Performance profiling (render time, memory, CPU) | ✅ |
| T8.3 | Cross-sim testing (iRacing → LMU switching) | ✅ |
| T8.4 | Bug fixes from sprint 7 testing | ✅ |
| T8.5 | Documentation finalization | ✅ |
| T8.6 | Landing page (marketing site) | ✅ |
| T8.7 | Discord community setup | ✅ |
| T8.8 | GitHub Release v1.0.0 with changelog | ✅ |
| T8.9 | Create `.exe` installer with Electron Builder | ✅ |
| T8.10 | Smoke test on clean Windows install | ✅ |

### Entregables

- [x] GitHub Release v1.0.0
- [x] `.exe` publico descargable
- [x] Landing page + Discord activo
- [x] Tests E2E pasando
- [x] Documentación final

---

## 11. Roadmap Post-v1

### v1.1 — Track Map + Input Telemetry

- Track Map overlay con posiciones de coches en circuito
- Input Telemetry overlay (pedales, steering, comparación)
- Fuel Calculator overlay
- Flags overlay
- Corner Name overlay
- Mejoras de rendimiento post-lanzamiento

### v1.2 — Data Blocks + Widget System

- Data Blocks: 80+ widgets modulares
- Sistema de drag & drop para widgets
- Layout presets para streamers
- Setup Comparison overlay
- Telemetry Recorder/Replay

### v1.3 — Advanced Racing Overlays

- Head to Head overlay (comparación sector a sector)
- Blind Spot indicator (multiclase awareness)
- Pitlane Helper (speed limit, delta, pit timer)
- Fastest Cars From Behind warning
- Slow Car Ahead warning
- Rejoin Indicator

### v2.0 — Plugin System + AC Evo

- Plugin system: comunidad puede crear overlays custom
- API pública para plugins (React components + telemetry hooks)
- AC Evo support (día 1 de lanzamiento oficial)
- Garage Cover overlay
- Mejoras en theme system (CSS editor visual)

### v2.1 — Advanced Integrations

- Heart Rate integration (HypeRate/Polar/Garmin)
- Sim Calendars (próximas carreras, sesiones)
- Multi-language support
- Telemetry overlay editor visual

### v2.2 — Performance & Polish

- Performance pass: target 120 FPS
- Shader transitions entre overlays
- Corner Name overlay interactivo
- Community theme sharing platform

### v3.0 — Mobile Companion

- Mobile companion app (React Native)
- Control remoto de overlays desde teléfono
- Live timing en móvil
- Push notifications para carrera

---

*Documento generado desde el Plan Maestro de Implementación (`.kilo/plans/1780343341726-misty-circuit.md`)*
