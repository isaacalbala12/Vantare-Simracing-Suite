# Vantare Simracing Suite — Repository Technical Context

> **Purpose**: Complete technical context package for a subsequent code review. This document describes what exists in the repository, where things are, and how they connect — without analysis, recommendations, or quality judgments.

---

## 1. Repository Identification

| Property | Value | Source |
|----------|-------|--------|
| **Name** | Vantare Simracing Suite | `build/config.yml`, README.md |
| **Root path** | `C:\Users\isaac\Desktop\Vantare-Overlays` | workspace root |
| **Vantare v2 path** | `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2` | subdirectory |
| **Current branch** | `launch/polar-billing` | `git branch --show-current` |
| **Last commit** | `dd39e15 docs(launch): record production checkout smoke status` | `git log --oneline -5` |
| **Git status** | ~30 modified files, ~30 untracked files | `git status --short` |
| **Remote** | `git@github.com:isaacalbala12/Vantare-Simracing-Suite.git` | `git remote -v` |
| **Repository type** | Monorepo (pnpm workspace) | `pnpm-workspace.yaml` |
| **License** | Proprietary — All rights reserved, Copyright 2026 Vantare | LICENSE |
| **App identifier** | `com.vantare.simracing` | `build/config.yml` |
| **Current version** | `0.1.0.4` | `VERSION` file |

### Languages

| Language | Location | Notes |
|----------|----------|-------|
| TypeScript / TSX | `vantare-v2/frontend/src/` | ~200+ files |
| Go | `vantare-v2/internal/`, `vantare-v2/cmd/`, `vantare-v2/pkg/` | ~90+ files |
| CSS (Tailwind) | `vantare-v2/frontend/src/` | Tailwind v4 via Vite plugin |
| SQL | `supabase/migrations/` | 4 migrations |
| Deno TypeScript | `supabase/functions/` | Edge Functions |
| HTML | Root-level mockups | Standalone overlays, hub prototypes |

### Frameworks & Runtime

| Component | Version | Source |
|-----------|---------|--------|
| React | ^19.2.6 | `frontend/package.json` |
| Vite | ^8.0.12 | `frontend/package.json` |
| TypeScript | ~6.0.3 | `frontend/package.json` |
| Wails v3 | v3.0.0-alpha.98-tui (Go) / 3.0.0-alpha.79 (JS) | `go.mod`, `frontend/package.json` |
| Go | 1.25.0 | `go.mod` |
| Tailwind CSS | ^4.0.0 | `frontend/package.json` |
| Vitest | ^4.1.8 | `frontend/package.json` |
| Supabase JS | ^2.45.0 | `frontend/package.json` |
| Motion (Framer) | ^12.42.2 | `frontend/package.json` |
| Playwright | ^1.60.0 | `frontend/package.json` |
| Turbo | ^2.5.0 | root `package.json` |
| pnpm | 9.1.0 | root `package.json` |

### Target OS

- **Primary**: Windows 10/11 (WebView2 required)
- **Planned**: macOS, Linux, iOS, Android (Taskfile targets exist but not primary focus)

---

## 2. Repository Tree

```
Vantare-Overlays/                          # Monorepo root
├── package.json                           # Root package.json (turbo, prettier)
├── pnpm-workspace.yaml                    # Workspace: apps/*, packages/*, shared/*, vantare-v2/frontend
├── turbo.json                             # Turbo pipeline config
├── tsconfig.base.json                     # Shared TS config with path aliases
├── .prettierrc                            # Prettier config
├── .gitignore
├── .github/workflows/                     # 5 CI/CD workflows
│   ├── release.yml                        # Build + GitHub Release
│   ├── discord-beta-progress.yml
│   ├── discord-build-available.yml
│   ├── discord-known-issues.yml
│   └── discord-release.yml
├── README.md                              # Project overview
├── CHANGELOG.md                           # Version history
├── LICENSE                                # Proprietary
├── learnings.md                           # Storybook learnings
├── ARCHITECTURE_DIAGRAM.md                # Architecture diagram
├── docs/                                  # ~95 documentation files
│   ├── current-plan.md                    # Living work log (active development)
│   ├── technical-debt.md                  # 50+ tracked debt items
│   ├── architecture.md
│   ├── adr/                               # Architecture Decision Records
│   ├── analysis/                          # Analysis docs (7 files)
│   ├── archive/                           # Obsolete SQL schemas
│   ├── marketing/                         # Brand strategy (5 files)
│   ├── prompts/                           # Agent prompt templates
│   ├── research/                          # Research docs
│   └── superpowers/                       # Plans, specs, reviews, screenshots
├── supabase/                              # Supabase project
│   ├── config.toml
│   ├── functions/                         # Edge Functions (Deno)
│   │   ├── _shared/                       # Shared modules (auth, cors, mapping, polar, webhook-verify)
│   │   ├── billing-checkout/              # Polar checkout session creation
│   │   ├── billing-portal/                # Polar customer portal
│   │   ├── billing-webhook/               # Polar webhook handler
│   │   ├── validate-license/              # DEPRECATED
│   │   ├── scripts/                       # Support scripts
│   │   └── _deprecated/stripe-webhook/    # OBSOLETE
│   └── migrations/                        # 4 SQL migrations
├── packages/                              # Legacy shared packages (v1 monorepo)
│   ├── auth/                              # @vantare/auth
│   ├── sim-core/                          # @vantare/sim-core
│   ├── types/                             # @vantare/types
│   └── ui-core/                           # @vantare/ui-core
├── shared/types/                          # @shared/types
├── apps/desktop/                          # Legacy v1 Electron app
├── vantare-v2/                            # ← ACTIVE APPLICATION
│   ├── VERSION                            # 0.1.0.4
│   ├── go.mod / go.sum                    # Go module
│   ├── Taskfile.yml                       # Build orchestration
│   ├── AGENTS.md                          # Agent instructions (Spanish)
│   ├── cmd/                               # Go entry points
│   │   ├── vantare/                       # Main app binary
│   │   │   ├── main.go                    # 1887 lines — full app bootstrap
│   │   │   ├── main_test.go
│   │   │   └── launcher_dialog.go
│   │   ├── lmu-api-probe/                 # LMU REST API probe CLI
│   │   ├── lmu-debug/                     # LMU shared memory debug CLI
│   │   ├── lmu-dump/                      # LMU memory dump CLI
│   │   ├── lmu-test/                      # LMU test CLI
│   │   └── vantare-admin/                 # Admin CLI (license lookup/grant/revoke)
│   ├── internal/                          # Go packages
│   │   ├── app/                           # App lifecycle, bridges, services
│   │   │   ├── app.go                     # App struct (telemetry lifecycle)
│   │   │   ├── overlay_controller.go      # Overlay window lifecycle
│   │   │   ├── telemetry_bridge.go        # Telemetry → Wails events
│   │   │   ├── telemetry_source_manager.go
│   │   │   ├── lmu_enriched_source.go     # LMU shared memory + REST fusion
│   │   │   ├── profile_service.go         # Overlay profile CRUD
│   │   │   ├── hub_service.go             # Hub profile management
│   │   │   ├── settings_service.go        # App settings persistence
│   │   │   ├── preset_service.go          # Widget presets CRUD
│   │   │   ├── updater_service.go         # Auto-updater
│   │   │   ├── diagnostics_service.go     # Diagnostics
│   │   │   ├── hotkeys.go                 # Global hotkeys (Win32 API)
│   │   │   ├── engineer_bridge.go         # Engineer ↔ Wails
│   │   │   ├── ops_bridge.go              # Ops metrics → UI
│   │   │   ├── calendar_bridge.go         # Calendar event handlers
│   │   │   ├── testhooks.go               # Test overrides
│   │   │   └── launcher/                  # Simulator launcher subsystem
│   │   │       ├── launcher.go            # Service orchestrator
│   │   │       ├── chain.go               # Chain runner (step execution)
│   │   │       ├── discovery.go           # Cross-platform app discovery
│   │   │       ├── discovery_windows.go   # Windows-specific discovery
│   │   │       ├── known.go               # Known apps (LMU, OBS, etc.)
│   │   │       ├── apps.go                # App CRUD
│   │   │       ├── profiles.go            # Launch profiles CRUD
│   │   │       ├── registry_windows.go    # Windows Registry reader
│   │   │       ├── autostart_windows.go   # Windows Run key
│   │   │       ├── hotkey_windows.go      # Per-profile hotkeys
│   │   │       ├── icon_windows.go        # EXE icon extraction
│   │   │       └── telemetry.go           # Launch stats tracking
│   │   ├── calendar/                      # LMU race calendar
│   │   │   ├── calendar_service.go        # Calendar persistence
│   │   │   ├── calendar.go                # Types
│   │   │   ├── bundled_seed.go            # Bundled seed data
│   │   │   ├── official_schedule.go       # Official LMU schedule
│   │   │   ├── parse.go                   # ICS/text parsing
│   │   │   ├── reminder_loop.go           # 30s reminder polling
│   │   │   └── seed/                      # Seed data files
│   │   ├── core/                          # Utilities
│   │   │   └── deadband.go
│   │   ├── engineer/                      # Spotter/Engineer module
│   │   │   ├── service/                   # EngineerService orchestrator
│   │   │   ├── core/                      # Spotter runtime
│   │   │   ├── spotter/                   # Proximity detection
│   │   │   ├── simulator/                 # Test scenarios
│   │   │   ├── replay/                    # Replay system
│   │   │   ├── audio/                     # Audio playback
│   │   │   └── telemetry/                 # Engineer-specific telemetry types
│   │   ├── license/                       # License validation via Supabase
│   │   │   ├── service.go                 # Validate, ResetDevice, HasEntitlement
│   │   │   ├── types.go                   # States, Entitlements, Config
│   │   │   ├── cache.go                   # Local cache (atomic, 0600)
│   │   │   ├── plan.go                    # Plan classification
│   │   │   ├── supabase_client.go         # Supabase REST client
│   │   │   └── fingerprint_*.go           # Machine GUID (Windows)
│   │   ├── ops/                           # Runtime metrics (CPU, memory)
│   │   │   ├── metrics.go
│   │   │   └── sampler.go
│   │   ├── server/                        # Embedded HTTP server
│   │   │   ├── server.go                  # Router + auth callback
│   │   │   ├── sse.go                     # SSE telemetry stream
│   │   │   ├── engineer_sse.go            # SSE engineer stream
│   │   │   └── profile.go                # Profile API
│   │   ├── telemetry/                     # Telemetry pipeline
│   │   │   ├── service/                   # Pub/sub service (60Hz read, 30Hz emit)
│   │   │   ├── lmu/                       # LMU shared memory reader
│   │   │   │   ├── reader_windows.go      # OpenFileMapping/MapViewOfFile
│   │   │   │   ├── reader_stub.go         # Non-Windows stub
│   │   │   │   ├── offsets.go             # Binary buffer offsets
│   │   │   │   ├── parser.go              # Buffer → models
│   │   │   │   └── synthetic.go           # Mock data builder
│   │   │   ├── lmuapi/                    # LMU REST client (localhost:6397)
│   │   │   ├── normalizer/                # Raw buffer normalization
│   │   │   ├── pipeline/                  # Dedup + session annotation
│   │   │   ├── fusion/                    # Shared memory + REST merge
│   │   │   ├── delta/                     # Delta calculation engine
│   │   │   ├── diff/                      # Snapshot diff computation
│   │   │   └── gap/                       # Time gap detection
│   │   ├── updater/                       # Auto-updater (GitHub Releases)
│   │   │   ├── updater.go
│   │   │   ├── github.go
│   │   │   ├── settings.go
│   │   │   └── version.go
│   │   └── window/                        # Overlay window management
│   │       ├── manager.go                 # Mode switching (racing/edit/streaming)
│   │       └── bounds.go                  # ShrinkWrap, WindowLocalPos
│   ├── pkg/                               # Shared Go packages
│   │   ├── config/                        # Profile schema (v2)
│   │   │   └── profile.go                 # ProfileConfig, WidgetConfig, Rect, etc.
│   │   └── models/                        # Telemetry models
│   │       ├── telemetry.go               # Telemetry, PlayerTelemetry, SessionInfo
│   │       └── telemetry_json_test.go
│   ├── configs/                           # Embedded config files
│   │   ├── embed.go                       # Go embed
│   │   ├── app-settings.json              # User settings (gitignored)
│   │   ├── license-cache.json             # License cache
│   │   ├── calendar-lmu.json              # Calendar data
│   │   ├── updater-settings.json          # Updater config
│   │   ├── polar-product-mapping.example.json  # Polar product mapping template
│   │   ├── stripe-price-mapping.json      # OBSOLETE (placeholders)
│   │   ├── custom-hfg.json                # Example profile
│   │   ├── example-edit.json              # Example profile
│   │   ├── example-racing.json            # Example profile
│   │   └── example-streaming.json         # Example profile
│   ├── build/                             # Build tooling
│   │   ├── config.yml                     # Wails v3 build config
│   │   ├── sync_version.go                # Version sync tool
│   │   ├── Taskfile.yml                   # Common tasks
│   │   ├── windows/                       # NSIS, MSIX, icon, manifest
│   │   ├── darwin/                        # macOS (Info.plist, icons)
│   │   ├── linux/                         # AppImage, deb, rpm, AUR
│   │   ├── docker/                        # Cross-compilation Dockerfiles
│   │   ├── android/                       # Android build
│   │   └── ios/                           # iOS build
│   ├── frontend/                          # React frontend
│   │   ├── package.json                   # v0.1.0.2
│   │   ├── index.html                     # Entry HTML (loads fonts, transparent overlay boot)
│   │   ├── vite.config.ts                 # Vite config with Wails mock aliases
│   │   ├── embed.go                       # Go embed for dist/
│   │   └── src/                           # Source code
│   │       ├── main.tsx                   # App entry — 5-way routing by path/hash
│   │       ├── index.css                  # Global CSS
│   │       ├── test-setup.ts              # Vitest setup (mocks @wailsio/runtime)
│   │       ├── assets/                    # Static images (hero.png, logos)
│   │       ├── themes/                    # Theme JSON files
│   │       │   ├── vantare-v5.json        # Full theme (dark, glass, red accents)
│   │       │   └── vantare-lite.json      # Lite theme
│   │       ├── i18n/                      # Internationalization
│   │       │   ├── i18n.ts                # Translation engine
│   │       │   ├── I18nProvider.tsx        # React context
│   │       │   └── locales/               # en.ts, es.ts, pt.ts, it.ts
│   │       ├── lib/                       # Shared libraries (~50 files)
│   │       │   ├── theme.ts               # Theme application
│   │       │   ├── profile.ts             # Profile types and helpers
│   │       │   ├── license.tsx            # License context + provider
│   │       │   ├── license-types.ts       # License TypeScript types
│   │       │   ├── plan.ts                # Plan classification
│   │       │   ├── access.tsx             # Access context + hook
│   │       │   ├── access-policy.ts       # Feature gate matrix
│   │       │   ├── access-dev-modes.ts    # Dev/tester modes
│   │       │   ├── supabase-auth.ts       # Supabase auth client
│   │       │   ├── billing-client.ts      # Polar billing client
│   │       │   ├── entitlements-refresh.ts
│   │       │   ├── telemetry-ref.ts       # Frontend telemetry state
│   │       │   ├── widget-factory.ts      # Widget creation helpers
│   │       │   ├── widget-variants.ts     # Variant enrichment
│   │       │   ├── widget-presets.ts      # Preset definitions
│   │       │   ├── widget-presets-store.ts # Preset CRUD via Wails
│   │       │   ├── useDemoMode.ts         # Demo mode with animated telemetry
│   │       │   ├── visibility.ts          # Widget visibility logic
│   │       │   ├── color-utils.ts         # Color utilities
│   │       │   ├── dom-write.ts           # DOM write batching
│   │       │   ├── frame-budget.ts        # RAF frame budget
│   │       │   ├── html-escape.ts         # HTML escaping
│   │       │   ├── canvas-math.ts         # Canvas math helpers
│   │       │   ├── wails-runtime-mock.ts  # Wails mock for dev
│   │       │   └── wails-runtime-topbar-mock.ts
│   │       ├── overlay/                   # Overlay application
│   │       │   ├── CompositeApp.tsx        # Main overlay (live telemetry)
│   │       │   ├── ObsOverlayApp.tsx       # OBS Browser Source overlay
│   │       │   ├── EditOverlayApp.tsx      # Edit mode overlay
│   │       │   ├── App.tsx                 # Legacy simple overlay
│   │       │   ├── WidgetHost.tsx          # Widget positioning/scaling
│   │       │   ├── WidgetEditFrame.tsx     # Drag/resize frame
│   │       │   ├── OverlayCalendarReminderBanner.tsx
│   │       │   ├── overlay-document.ts     # CSS mode management
│   │       │   ├── shared-widget-map.ts    # Widget type mapping
│   │       │   └── widgets/               # 9 widget implementations
│   │       │       ├── DeltaWidget.tsx
│   │       │       ├── RelativeWidget.tsx
│   │       │       ├── StandingsWidget.tsx
│   │       │       ├── TelemetryWidget.tsx
│   │       │       ├── TelemetryVerticalWidget.tsx
│   │       │       ├── PedalsWidget.tsx
│   │       │       ├── EngineerNotificationsWidget.tsx
│   │       │       ├── BroadcastTowerWidget.tsx
│   │       │       ├── MulticlassRelativeWidget.tsx
│   │       │       ├── widget-appearance.ts
│   │       │       ├── widget-base-size.ts
│   │       │       ├── widget-design-system.ts
│   │       │       ├── use-widget-telemetry.ts
│   │       │       ├── mock-telemetry.ts
│   │       │       ├── standings-catalog.ts / standings-format.ts
│   │       │       ├── relative-catalog.ts / relative-format.ts / relative-filters.ts
│   │       │       ├── pedals-format.ts
│   │       │       └── _assets/            # Widget SVGs, logos
│   │       ├── hub/                       # Hub application
│   │       │   ├── HubApp.tsx              # Hub entry (LicenseProvider > I18nProvider > LicenseGate)
│   │       │   ├── HubErrorBoundary.tsx
│   │       │   ├── navigation.ts          # 8 sections: dashboard, profiles, launcher, calendar, engineer, telemetry, setup, roadmap
│   │       │   ├── auth/                  # Auth screens
│   │       │   │   ├── LoginScreen.tsx    # Google/Discord/email login
│   │       │   │   ├── PaywallScreen.tsx  # Paywall with plans
│   │       │   │   ├── LicenseBanner.tsx
│   │       │   │   ├── OAuthCallbackHandler.tsx
│   │       │   │   ├── UnconfiguredScreen.tsx
│   │       │   │   └── paywall-plans.ts   # Free, Launch Lifetime, Pro Monthly
│   │       │   ├── pages/                 # Hub pages
│   │       │   │   ├── DashboardPage.tsx
│   │       │   │   ├── OverlaysStudioPage.tsx
│   │       │   │   ├── SettingsPage.tsx
│   │       │   │   ├── EngineerPage.tsx
│   │       │   │   ├── LauncherPage.tsx
│   │       │   │   ├── TelemetryPage.tsx  # Placeholder ("Próximamente")
│   │       │   │   ├── CalendarPage.tsx
│   │       │   │   ├── RoadmapPage.tsx
│   │       │   │   ├── PreviewPage.tsx
│   │       │   │   ├── WidgetsPage.tsx
│   │       │   │   └── ProfilesPage.tsx
│   │       │   ├── components/            # Hub UI components (~39 files)
│   │       │   │   ├── V52Shell.tsx        # Main layout (Topbar + Sidebar + Content)
│   │       │   │   ├── Topbar.tsx
│   │       │   │   ├── ProSidebar.tsx
│   │       │   │   ├── LauncherDock.tsx
│   │       │   │   ├── UpdateBanner.tsx
│   │       │   │   ├── ActiveOverlayCard.tsx
│   │       │   │   ├── OpsPanel.tsx
│   │       │   │   ├── ObsSetup.tsx
│   │       │   │   ├── AccessGate.tsx
│   │       │   │   ├── RatingsCards.tsx
│   │       │   │   ├── RatingChart.tsx
│   │       │   │   ├── RecentRaces.tsx
│   │       │   │   └── ... (25+ more)
│   │       │   ├── overlays/              # Overlay Studio (~62 files)
│   │       │   │   ├── WidgetStudio.tsx    # Widget appearance editor
│   │       │   │   ├── LayoutStudio.tsx    # Position/size editor
│   │       │   │   ├── useOverlayStudioState.ts  # Studio state machine
│   │       │   │   ├── WidgetSettingsPanel.tsx
│   │       │   │   ├── WidgetPreviewPanel.tsx
│   │       │   │   ├── widget-catalog.ts   # Widget registry (14 types)
│   │       │   │   ├── widget-config-model.ts
│   │       │   │   ├── WidgetVariantManager.tsx
│   │       │   │   ├── WidgetPresetSection.tsx
│   │       │   │   ├── StudioWidgetList.tsx
│   │       │   │   ├── OwnProfilesView.tsx
│   │       │   │   ├── RecommendedProfilesView.tsx
│   │       │   │   └── ... (40+ more)
│   │       │   ├── launcher/              # Launcher UI
│   │       │   │   ├── AppsPanel.tsx
│   │       │   │   ├── ProfilesPanel.tsx
│   │       │   │   ├── ProfileCard.tsx
│   │       │   │   ├── ProfileEditor.tsx
│   │       │   │   ├── AddNonSteamGameModal.tsx
│   │       │   │   ├── chain-store.tsx     # Chain runner state machine
│   │       │   │   └── launcher-state.ts
│   │       │   ├── calendar/              # Calendar UI
│   │       │   │   ├── CalendarMonthView.tsx
│   │       │   │   ├── CalendarWeekView.tsx
│   │       │   │   ├── CalendarDayView.tsx
│   │       │   │   ├── CalendarToolbar.tsx
│   │       │   │   ├── CalendarRaceDetailPanel.tsx
│   │       │   │   └── CalendarReminderBanner.tsx
│   │       │   ├── preview/               # Widget preview system
│   │       │   │   ├── PreviewCanvas.tsx
│   │       │   │   ├── WidgetRenderer.tsx
│   │       │   │   ├── WidgetPreview.tsx
│   │       │   │   ├── AppearanceEditor.tsx
│   │       │   │   └── profile-editor.ts
│   │       │   ├── registry/              # Design system registry
│   │       │   │   ├── design-system-registry.ts
│   │       │   │   ├── widget-components.ts
│   │       │   │   ├── builtin-systems.ts
│   │       │   │   └── _examples/         # Custom component examples
│   │       │   ├── onboarding/            # Beta welcome, onboarding flow
│   │       │   ├── settings/              # Account settings, hotkeys
│   │       │   ├── roadmap/               # Roadmap data and features
│   │       │   ├── state/                 # Workbench types, style catalog
│   │       │   └── widgets/               # Design gallery
│   │       ├── calendar/                  # Calendar store and types
│   │       ├── engineer/                  # Engineer types
│   │       └── lib/                       # (shared, listed above)
│   ├── scripts/                           # Helper scripts
│   ├── tools/                             # PowerShell utilities
│   ├── testdata/                          # Test fixtures
│   ├── bin/                               # Release artifacts (gitignored)
│   ├── supabase/                          # Local supabase config
│   ├── mcps/                              # MCP server configs
│   └── terminals/                         # Terminal configs
```

---

## 3. Entry Points

### Frontend

| Entry | File | Function |
|-------|------|----------|
| **React app** | `frontend/src/main.tsx` | 5-way routing by pathname/hash: `/overlay/edit` → EditOverlayApp, `/overlay` or `?obs=1` → ObsOverlayApp, `#/auth/callback` → OAuthCallbackHandler, `#/hub` → HubApp, default → CompositeApp |
| **Index HTML** | `frontend/index.html` | Loads Google Fonts (Inter, Rajdhani, Space Mono), sets transparent background for overlay mode |
| **Theme init** | `main.tsx:18-19` | Applies stored theme (vantare-v5 or vantare-lite) at startup |
| **Design systems** | `main.tsx:12` | `registerBuiltinDesignSystems()` at startup |

### Backend Go

| Entry | File | Function |
|-------|------|----------|
| **Main binary** | `cmd/vantare/main.go` (1887 lines) | Full app bootstrap: Wails v3 app, hub window, overlay controller, telemetry service, HTTP server, hotkey manager, launcher service, calendar service, license service, updater, all event handlers |
| **Admin CLI** | `cmd/vantare-admin/main.go` | License lookup/grant/revoke (stubs) |
| **LMU debug** | `cmd/lmu-debug/main.go` | Shared memory debug tool |
| **LMU dump** | `cmd/lmu-dump/main.go` | Memory dump tool |
| **LMU test** | `cmd/lmu-test/main.go` | Test CLI |
| **LMU API probe** | `cmd/lmu-api-probe/` | REST API probe |

### Services Registered with Wails

1. `ProfileService` — overlay profile CRUD
2. `HubService` — Hub profile management
3. `LicenseService` — Supabase entitlement validation
4. `PresetService` — widget presets CRUD
5. `UpdaterService` — auto-update via GitHub Releases
6. `DiagnosticsService` — system diagnostics

### Scripts

| Script | File | Purpose |
|--------|------|---------|
| `task dev` | `Taskfile.yml` | `wails3 dev` with Vite |
| `task build` | `Taskfile.yml` | Platform-specific build |
| `task package:all` | `Taskfile.yml` | Full release pipeline (installer + portable + checksums) |
| `task version:sync` | `Taskfile.yml` | Sync VERSION to all config files |
| `task release:artifacts` | `Taskfile.yml` | Alias of package:all |

---

## 4. Stack — Complete Dependency Map

### Frontend Dependencies

| Package | Version | Declared in | Used in |
|---------|---------|-------------|---------|
| `react` | ^19.2.6 | `frontend/package.json` | Everywhere |
| `react-dom` | ^19.2.6 | `frontend/package.json` | `main.tsx` |
| `@wailsio/runtime` | 3.0.0-alpha.79 | `frontend/package.json` | 90+ files (Events, Browser) |
| `@supabase/supabase-js` | ^2.45.0 | `frontend/package.json` | `lib/supabase-auth.ts` |
| `motion` | ^12.42.2 | `frontend/package.json` | Animation components |
| `tailwindcss` | ^4.0.0 | `frontend/package.json` (dev) | All CSS |
| `@tailwindcss/vite` | ^4.0.0 | `frontend/package.json` (dev) | `vite.config.ts` |
| `vite` | ^8.0.12 | `frontend/package.json` (dev) | Build tool |
| `@vitejs/plugin-react` | ^6.0.1 | `frontend/package.json` (dev) | `vite.config.ts` |
| `typescript` | ~6.0.3 | `frontend/package.json` (dev) | Type checking |
| `vitest` | ^4.1.8 | `frontend/package.json` (dev) | Unit tests |
| `@testing-library/react` | ^16.3.2 | `frontend/package.json` (dev) | Component tests |
| `@testing-library/dom` | ^10.4.1 | `frontend/package.json` (dev) | DOM testing |
| `happy-dom` | ^20.10.2 | `frontend/package.json` (dev) | Test environment |
| `playwright` | ^1.60.0 | `frontend/package.json` (dev) | E2E tests |
| `eslint` | ^10.3.0 | `frontend/package.json` (dev) | Linting |
| `eslint-plugin-react-hooks` | ^7.1.1 | `frontend/package.json` (dev) | React hooks linting |
| `eslint-plugin-react-refresh` | ^0.5.2 | `frontend/package.json` (dev) | React refresh linting |

### Go Dependencies

| Package | Version | Declared in | Used in |
|---------|---------|-------------|---------|
| `github.com/wailsapp/wails/v3` | v3.0.0-alpha.98-tui | `go.mod` | `cmd/vantare/main.go`, all app code |
| `github.com/shirou/gopsutil/v4` | v4.26.5 | `go.mod` | `internal/ops/sampler.go` (CPU/memory) |
| `github.com/stretchr/testify` | v1.11.1 | `go.mod` | All `*_test.go` files |
| `golang.org/x/sys` | v0.43.0 | `go.mod` | `internal/telemetry/lmu/reader_windows.go` (kernel32 syscalls) |
| `github.com/go-git/go-git/v5` | v5.19.1 | `go.mod` (indirect) | Updater |
| `github.com/coder/websocket` | v1.8.14 | `go.mod` (indirect) | Wails runtime |

### No Redux, no Zustand, no React Router

State management is entirely via React Context (3 providers) and local `useState`. Navigation is manual by pathname/hash.

---

## 5. Applications and Modules

### Hub Application (`frontend/src/hub/`)

| Module | Section ID | Page Component | Status |
|--------|-----------|----------------|--------|
| **Dashboard** | `dashboard` | `DashboardPage.tsx` | Confirmada en código y accesible |
| **Overlays Studio** | `profiles` | `OverlaysStudioPage.tsx` | Confirmada en código y accesible |
| **Launcher** | `launcher` | `LauncherPage.tsx` | Confirmada en código y accesible |
| **Calendar** | `calendar` | `CalendarPage.tsx` | Confirmada en código y accesible |
| **Engineer** | `engineer` | `EngineerPage.tsx` | Confirmada en código y accesible |
| **Telemetry** | `telemetry` | `TelemetryPage.tsx` | Confirmada en código pero placeholder ("Próximamente") |
| **Roadmap** | `roadmap` | `RoadmapPage.tsx` | Confirmada en código y accesible |
| **Settings** | `setup` | `SettingsPage.tsx` | Confirmada en código y accesible |

### WidgetStudio (`frontend/src/hub/overlays/WidgetStudio.tsx`)

- Widget appearance editor (colors, fonts, variants, presets)
- 3-column layout: WidgetList → PreviewPanel → SettingsPanel
- Design system selector (Base / named designs)
- Mock session selector for preview
- Strict separation: NO position/size controls

### LayoutStudio (`frontend/src/hub/overlays/LayoutStudio.tsx`)

- Widget position/size editor on 1920×1080 logical canvas
- 3-column layout: WidgetList → PreviewCanvas → SettingsPanel
- Start/stop overlay buttons
- Dirty state tracking with save indicator

### Overlay Application (`frontend/src/overlay/`)

| App | File | Trigger | Purpose |
|-----|------|---------|---------|
| **CompositeApp** | `CompositeApp.tsx` | Default (`/`) | Live overlay with telemetry, all 9 widget types |
| **ObsOverlayApp** | `ObsOverlayApp.tsx` | `/overlay` or `?obs=1` | OBS Browser Source overlay (SSE streaming) |
| **EditOverlayApp** | `EditOverlayApp.tsx` | `/overlay/edit` | Edit mode overlay |
| **App** (legacy) | `App.tsx` | N/A | Simple speed+gear overlay |

### License/Auth (`frontend/src/hub/auth/`, `frontend/src/lib/`)

| Component | File | Purpose |
|-----------|------|---------|
| LoginScreen | `LoginScreen.tsx` | Google OAuth, Discord, email login |
| PaywallScreen | `PaywallScreen.tsx` | Subscription plans display |
| LicenseBanner | `LicenseBanner.tsx` | Status banner |
| OAuthCallbackHandler | `OAuthCallbackHandler.tsx` | OAuth redirect handler |
| UnconfiguredScreen | `UnconfiguredScreen.tsx` | Missing Supabase config error |
| LicenseProvider | `lib/license.tsx` | React context for license state |
| access-policy | `lib/access-policy.ts` | Feature gate matrix by plan |

### Billing (`frontend/src/lib/billing-client.ts`, `supabase/functions/billing-*`)

| Component | File | Purpose |
|-----------|------|---------|
| billing-client.ts | Frontend | `createBillingCheckout()`, `openBillingPortal()` |
| billing-checkout | Supabase EF | Creates Polar checkout session |
| billing-portal | Supabase EF | Creates Polar customer portal |
| billing-webhook | Supabase EF | Processes Polar webhooks |

### Launcher (`internal/app/launcher/`, `frontend/src/hub/launcher/`)

| Component | File | Purpose |
|-----------|------|---------|
| Service | `launcher.go` | Orchestrator: discovery, CRUD, chain runner |
| ChainRunner | `chain.go` | Step-by-step profile launch execution |
| Discovery | `discovery.go` | Cross-platform app discovery |
| Known apps | `known.go` | LMU, OBS, CrewChief, Discord, Spotify, MoTeC, SimHub |
| AppsPanel | `AppsPanel.tsx` | App list UI |
| ProfilesPanel | `ProfilesPanel.tsx` | Profile list UI |
| chain-store | `chain-store.tsx` | Frontend state machine for chain runner |

### Calendar (`internal/calendar/`, `frontend/src/calendar/`, `frontend/src/hub/calendar/`)

| Component | File | Purpose |
|-----------|------|---------|
| Service | `calendar_service.go` | LMU race calendar persistence |
| bundled_seed.go | Go | Bundled seed data |
| official_schedule.go | Go | Official LMU weekly schedule |
| reminder_loop.go | Go | 30s reminder polling |
| CalendarMonthView | React | Month calendar view |
| CalendarWeekView | React | Week calendar view |
| CalendarDayView | React | Day calendar view |
| CalendarReminderBanner | React | Reminder notification |

### Engineer (`internal/engineer/`, `frontend/src/hub/pages/EngineerPage.tsx`)

| Component | File | Purpose |
|-----------|------|---------|
| EngineerService | `service/engineer_service.go` | Orchestrator (spotter, notifications) |
| core.Runtime | `core/runtime.go` | Spotter proximity detection |
| spotter/ | Go | Vehicle proximity detection |
| simulator/ | Go | Test scenarios (Monza) |
| replay/ | Go | Replay system |
| audio/ | Go | Audio playback |
| EngineerPage | React | Status, toggles, spotter notifications |

### Updater (`internal/updater/`, `frontend/src/hub/components/UpdateBanner.tsx`)

| Component | File | Purpose |
|-----------|------|---------|
| Updater | `updater.go` | GitHub Releases auto-update |
| github.go | Go | GitHub API client |
| settings.go | Go | Updater settings persistence |
| UpdateBanner | React | Update notification UI |

---

## 6. Navigation and Screens

### Routing Mechanism

**No React Router**. Routing is manual:

1. **`main.tsx`**: 5-way routing by `window.location.pathname` and `window.location.hash`
2. **`HubApp.tsx`**: Section state via `useState<Section>` with programmatic navigation
3. **`navigation.ts`**: Defines 8 sections with icons

### Hub Sections

| Screen | Section ID | Component | Access |
|--------|-----------|-----------|--------|
| Dashboard | `dashboard` | `DashboardPage` | Sidebar nav, default |
| Overlays Studio | `profiles` | `OverlaysStudioPage` | Sidebar nav |
| Launcher | `launcher` | `LauncherPage` | Sidebar nav |
| Calendar | `calendar` | `CalendarPage` | Sidebar nav |
| Engineer | `engineer` | `EngineerPage` | Sidebar nav |
| Telemetry | `telemetry` | `TelemetryPage` | Sidebar nav |
| Roadmap | `roadmap` | `RoadmapPage` | Sidebar nav |
| Settings | `setup` | `SettingsPage` | Sidebar nav |

### Overlay Routes

| Route | Component | Access |
|-------|-----------|--------|
| `/` (default) | `CompositeApp` | Default overlay |
| `/overlay` or `?obs=1` | `ObsOverlayApp` | OBS Browser Source |
| `/overlay/edit` | `EditOverlayApp` | Edit mode |
| `#/auth/callback` | `OAuthCallbackHandler` | OAuth redirect |
| `#/hub` | `HubApp` | Hub dashboard |

### Modals

- `AddNonSteamGameModal` — Add non-Steam game to launcher
- `BetaWelcome` — First-run onboarding
- `CalendarReminderBanner` — Calendar reminder notification
- `UpdateBanner` — Update available notification

### Feature Gates

Access is controlled by `access-policy.ts` → `FEATURE_POLICY` matrix:

| Feature | free | paid_overlays | paid_engineer | suite |
|---------|------|---------------|---------------|-------|
| `hub.dashboard` | ✅ | ✅ | ✅ | ✅ |
| `launcher.basic` | ✅ | ✅ | ✅ | ✅ |
| `calendar.visual` | ✅ | ✅ | ✅ | ✅ |
| `overlays.basic` | ✅ | ✅ | ❌ | ✅ |
| `overlays.advanced` | ❌ | ✅ | ❌ | ✅ |
| `engineer.ai` | ❌ | ❌ | ✅ | ✅ |
| `telemetry.live` | ❌ | ✅ | ✅ | ✅ |

Roles `tester`, `staff`, `dev` override all restrictions.

---

## 7. Frontend Architecture

### Component Hierarchy

```
React.StrictMode
└── App (main.tsx) — 5-way router
    ├── HubApp
    │   └── LicenseProvider > I18nProvider > LicenseGate > HubErrorBoundary > ChainRunnerProvider > HubShell
    │       └── V52Shell (Topbar + Sidebar + Content)
    │           └── {section page}
    ├── CompositeApp (overlay)
    │   └── WidgetHost × N → WidgetComponent
    ├── ObsOverlayApp (OBS)
    ├── EditOverlayApp (edit mode)
    └── OAuthCallbackHandler
```

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/lib/` | ~50 shared libraries (types, hooks, services, utilities) |
| `src/hub/` | Hub application (pages, components, overlays, launcher, calendar, auth) |
| `src/overlay/` | Overlay application (widgets, edit, OBS) |
| `src/i18n/` | Internationalization (4 locales) |
| `src/themes/` | Theme JSON files (vantare-v5, vantare-lite) |
| `src/calendar/` | Calendar store and types |
| `src/engineer/` | Engineer types |
| `src/assets/` | Static images |

### Wails Communication Pattern

All communication uses `@wailsio/runtime` Events (pub/sub):

```typescript
// Listen to backend events
Events.On("telemetry:update", (event) => { ... });

// Emit events to backend
Events.Emit("profile:request");
Events.Emit("layout:save", { widgets: [...] });
```

No direct Go function calls from frontend. No `wailsjs/go/` imports.

### DOM Performance Pattern

Widgets use direct DOM manipulation (`dom-write.ts`) instead of React state for high-frequency updates (30Hz telemetry).

---

## 8. State Management

### React Context Providers (3)

| Context | File | Data |
|---------|------|------|
| `LicenseContext` | `lib/license.tsx` | `LicenseResult`, loading, refresh, clearLicense |
| `I18nContext` | `i18n/I18nProvider.tsx` | locale, setLocale, t (translator), options |
| `ChainRunnerContext` | `hub/launcher/chain-store.tsx` | Chain state machine, last result |

### Local State Stores

| Store | File | Data |
|-------|------|------|
| `calendar-store.ts` | `calendar/calendar-store.ts` | Calendar data via Wails events |
| `useOverlayStudioState` | `hub/overlays/useOverlayStudioState.ts` | Profile, widgets, undo/redo, save state |
| `launcher-state.ts` | `hub/launcher/launcher-state.ts` | App entries, launch profiles |
| `style-catalog.ts` | `hub/state/style-catalog.ts` | Widget style catalog |
| `widget-presets-store.ts` | `lib/widget-presets-store.ts` | Preset CRUD via Wails |
| `design-system-registry.ts` | `hub/registry/design-system-registry.ts` | In-memory Map<string, DesignSystem> |

### localStorage Keys

| Key | File | Purpose |
|-----|------|---------|
| `vantare.locale` | `i18n/I18nProvider.tsx` | Selected language |
| `vantare.theme` | `lib/theme.ts` | Selected theme ID |
| Supabase session | `lib/supabase-auth.ts` | OAuth session persistence |

### Backend State (Go)

| Service | File | Data | Persistence |
|---------|------|------|-------------|
| `SettingsService` | `internal/app/settings_service.go` | `AppSettings` (hotkeys, deltaMode, launcher apps/profiles, beta flags) | `configs/app-settings.json` (atomic, .bak, retry) |
| `ProfileService` | `internal/app/profile_service.go` | Current overlay profile | `configs/*.json` |
| `PresetService` | `internal/app/preset_service.go` | Widget presets | `configs/widget-presets.json` |
| `CalendarService` | `internal/calendar/calendar_service.go` | Race calendar | `configs/calendar-lmu.json` (atomic) |
| `LicenseService` | `internal/license/service.go` | License cache | `configs/license-cache.json` (atomic, 0600) |
| `UpdaterService` | `internal/updater/settings.go` | Updater settings | `configs/updater-settings.json` |
| `TelemetryBridge` | `internal/app/telemetry_bridge.go` | Latest telemetry snapshot | In-memory, forwarded to Wails events |
| `OverlayController` | `internal/app/overlay_controller.go` | Current overlay window | In-memory |

---

## 9. Communication: React ↔ Wails ↔ Go

### Wails v3 Services (registered via `wailsApp.RegisterService`)

| Service | Go Type | Frontend Consumer |
|---------|---------|-------------------|
| `ProfileService` | `app.ProfileService` | Wails auto-generated bindings |
| `HubService` | `app.HubService` | Wails auto-generated bindings |
| `LicenseService` | `license.Service` | Wails auto-generated bindings |
| `PresetService` | `app.PresetService` | Wails auto-generated bindings |
| `UpdaterService` | `app.UpdaterService` | Wails auto-generated bindings |
| `DiagnosticsService` | `app.DiagnosticsService` | Wails auto-generated bindings |

### Wails Events (Go → Frontend)

| Event | Source | Data |
|-------|--------|------|
| `telemetry:update` | `TelemetryBridge` | Telemetry snapshot + diff |
| `telemetry:source-status` | main.go | `{kind, name, live, available}` |
| `profile:loaded` | `ProfileService` | `{profile, layoutOrigin, windowMode}` |
| `profile:saved` | `ProfileService` | Confirmation |
| `overlay:status` | `OverlayController` | Running/stopped |
| `overlay:edit-mode-changed` | main.go | `{mode}` |
| `hub:profiles` | main.go | `{profiles}` |
| `hub:profile-created/deleted/activated` | main.go | Confirmation |
| `launcher:apps:updated` | main.go | `{apps}` |
| `launcher:profiles:updated` | main.go | `{profiles}` |
| `launcher:chain:step/done/error` | `ChainRunner` | Step progress |
| `launcher:error` | main.go | `{message}` |
| `settings` | main.go | `AppSettings` |
| `settings-saved` | main.go | `{ok}` |
| `calendar:loaded` | `CalendarBridge` | Calendar document |
| `calendar:reminder` | main.go (ticker) | `{eventId, title, track, minutesLeft}` |
| `license:changed` | `LicenseService` | `LicenseResult` |
| `license:error` | main.go | `{message}` |
| `updater:notify/available/installed` | main.go | Update info |
| `app:version` | main.go | `{version}` |
| `engineer:status/notification` | `EngineerBridge` | Engineer state |
| `ops:metrics` | `OpsBridge` | CPU, memory, goroutines |
| `presets:changed` | `PresetService` | Preset list |
| `auth:session` | main.go | `{access_token, refresh_token}` |
| `diagnostics` | main.go | System diagnostics |
| `layout:saved` | `ProfileService` | Confirmation |

### Wails Events (Frontend → Go)

| Event | Handler | Purpose |
|-------|---------|---------|
| `profile:request` | `ProfileService` | Request current profile |
| `profile:set-mode` | `ProfileService` | Set display mode (racing/edit/streaming) |
| `layout:save` | main.go | Save widget positions/variants |
| `settings:get/save` | main.go | Read/write app settings |
| `hub:list/create/delete/activate/set-active/save-own-copy` | main.go | Hub profile CRUD |
| `overlay:start/stop/start-active/toggle-edit-mode` | main.go | Overlay lifecycle |
| `license:validate` | `LicenseService` | Validate license with token |
| `license:reset-device` | `LicenseService` | Reset device binding |
| `launcher:*` (~15 events) | main.go | Launcher CRUD, chain, hotkeys, autostart |
| `calendar:*` (6 events) | main.go | Calendar CRUD, follow/unfollow |
| `preset:*` (4 events) | `PresetService` | Preset CRUD |
| `engineer:*` (5 events) | `EngineerBridge` | Engineer control |
| `updater:*` (5 events) | main.go | Update check/install |
| `diagnostics:get` | main.go | Request diagnostics |
| `telemetry:source-status:get` | main.go | Request source info |
| `app:version:get` | main.go | Request version |

---

## 10. Backend Go

### Packages Summary

| Package | Path | Responsibility | Key Files |
|---------|------|---------------|-----------|
| `main` | `cmd/vantare/` | App bootstrap, event wiring | `main.go` (1887 lines), `launcher_dialog.go` |
| `app` | `internal/app/` | Services, bridges, controllers | 20 files |
| `app/launcher` | `internal/app/launcher/` | Simulator launcher subsystem | 22 files |
| `calendar` | `internal/calendar/` | LMU race calendar | 9 files |
| `core` | `internal/core/` | Deadband utility | 1 file |
| `engineer` | `internal/engineer/` | Spotter/Engineer module | ~12 files in 6 subdirs |
| `license` | `internal/license/` | License validation via Supabase | 14 files |
| `ops` | `internal/ops/` | Runtime metrics | 3 files |
| `server` | `internal/server/` | Embedded HTTP/SSE server | 6 files |
| `telemetry` | `internal/telemetry/` | Telemetry pipeline | ~22 files in 9 subdirs |
| `updater` | `internal/updater/` | Auto-updater | 6 files |
| `window` | `internal/window/` | Overlay window management | 4 files |
| `config` | `pkg/config/` | Profile schema (v2) | 2 files + testdata |
| `models` | `pkg/models/` | Telemetry models | 3 files |

### Key Structs

| Struct | Package | Purpose |
|--------|---------|---------|
| `App` | `app` | Telemetry lifecycle, source manager |
| `ProfileService` | `app` | Overlay profile CRUD |
| `HubService` | `app` | Hub profile management |
| `SettingsService` | `app` | App settings persistence |
| `PresetService` | `app` | Widget presets CRUD |
| `OverlayController` | `app` | Overlay window lifecycle |
| `TelemetryBridge` | `app` | Telemetry → Wails events |
| `EngineerBridge` | `app` | Engineer ↔ Wails |
| `OpsBridge` | `app` | Ops metrics → UI |
| `HotkeyManager` | `app` | Global hotkeys (Win32) |
| `DiagnosticsService` | `app` | System diagnostics |
| `EnrichedLMUSource` | `app` | LMU shared memory + REST fusion |
| `Service` | `launcher` | Launcher orchestrator |
| `ChainRunner` | `launcher` | Step execution |
| `Service` | `calendar` | Calendar persistence |
| `Service` | `license` | License validation |
| `Server` | `server` | HTTP/SSE server |
| `Service` | `telemetry/service` | Pub/sub telemetry (60Hz read, 30Hz emit) |
| `Manager` | `window` | Overlay window modes |
| `RuntimeSampler` | `ops` | CPU/memory metrics |

---

## 11. Telemetry System

### Data Flow

```
1. LMU Shared Memory (LMU_Data)
   → lmu.Reader (OpenFileMappingW/MapViewOfFile, Windows kernel32.dll)
   → lmu.Parse() → models.Telemetry

2. LMU REST API (localhost:6397)
   → lmuapi.Client → StandingRow[], SessionInfo

3. Fusion (fusion.Merge)
   → Combined data from shared memory + REST

4. EnrichedLMUSource
   → Wraps fusion + delta engine

5. TelemetrySourceManager
   → Manages live vs mock switching

6. Service (telemetry/service)
   → Read loop at 60Hz, emit loop at 30Hz
   → pipeline.Filter (dedup, session annotation)
   → diff.Compute (snapshot diff)
   → gap.ComputeTimeGaps

7. TelemetryBridge
   → Subscribes to Service
   → Emits "telemetry:update" Wails events

8. SSE Server (server/sse.go)
   → Streams to OBS Browser Source

9. Frontend
   → CompositeApp listens to "telemetry:update"
   → telemetry-ref.ts parses payload
   → Widgets render via direct DOM writes
```

### Telemetry Models

| Type | File | Fields |
|------|------|--------|
| `Telemetry` | `pkg/models/telemetry.go` | Player, Session, Vehicles, Delta |
| `PlayerTelemetry` | `pkg/models/telemetry.go` | RPM, Gear, Speed, Throttle, Brake, Clutch, Fuel, Tyres |
| `SessionInfo` | `pkg/models/telemetry.go` | Session type, track, time remaining |
| `VehicleScoring` | `pkg/models/telemetry.go` | Position, gaps, lap times |

### Delta Engine (`internal/telemetry/delta/`)

- Modes: `self`, `session`, `global`
- `Store` — stores reference laps
- `Engine` — computes delta to reference
- `Tracker` — tracks current delta state

---

## 12. Simulator Support

### Defined Simulator Kinds

```go
const (
    SimulatorUnknown SimulatorKind = "unknown"
    SimulatorMock    SimulatorKind = "mock"
    SimulatorLMU     SimulatorKind = "lmu"
    SimulatorIRacing SimulatorKind = "iracing"
    SimulatorAC      SimulatorKind = "assetto-corsa"
)
```

### Implementation Status

| Simulator | Reader | Parser | REST API | Status |
|-----------|--------|--------|----------|--------|
| **LMU** | `internal/telemetry/lmu/reader_windows.go` | `parser.go` | `lmuapi/client.go` | Confirmada en código y accesible |
| **Mock** | `internal/telemetry/lmu/synthetic.go` | — | — | Confirmada en código y accesible |
| **iRacing** | — | — | — | Solo constantes definidas |
| **Assetto Corsa** | — | — | — | Solo constantes definidas |

### LMU-Specific

- Shared memory name: `LMU_Data`
- Buffer size: `ObjectOutSize` (324820 bytes)
- REST API: `http://localhost:6397` (standings, sessionInfo, multiplayer/teams)
- Known apps: LMU (Steam AppID 2399420)
- Calendar: LMU race calendar with bundled seed and official schedule

### Engineer Simulator

- `internal/engineer/simulator/scenario.go` — Deterministic test scenarios (Monza)
- `internal/engineer/simulator/source.go` — Frame replay source

---

## 13. Overlay System

### Overlay Window Creation

```go
// cmd/vantare/main.go:1649-1678
w := f.app.Window.NewWithOptions(application.WebviewWindowOptions{
    Title:             "Vantare Overlay",
    Width:             1920, Height: 1080,
    Frameless:         true,
    BackgroundType:    application.BackgroundTypeTransparent,
    BackgroundColour:  application.NewRGBA(0, 0, 0, 0),
    IgnoreMouseEvents: false,
    AlwaysOnTop:       true,
    URL:               "/",
})
```

### Display Modes (`pkg/config/profile.go`)

| Mode | Behavior |
|------|----------|
| `racing` | Fullscreen, click-through (`SetIgnoreMouseEvents(true)`) |
| `edit` | Fullscreen, interactive (`SetIgnoreMouseEvents(false)`, resizable) |
| `streaming` | Minimized off-screen (-9999,-9999), click-through |

### Window Manager (`internal/window/manager.go`)

- `ApplyProfile()` — switches mode based on `DisplayMode`
- `ShrinkWrap()` — calculates minimal bounds for widgets
- `WindowLocalPos()` — converts profile coordinates to window-local

### Overlay Controller (`internal/app/overlay_controller.go`)

- `Start(profile)` — creates new window via factory, applies profile mode
- `Stop()` — closes current window
- `Status()` — returns running state

### Transparency

- Go: `SetBackgroundColour(0,0,0,0)` + `BackgroundTypeTransparent`
- JS injection: Sets `background: transparent` on html, body, root
- CSS: `.desktop-overlay` class with transparent background

---

## 14. Widget System

### Widget Registry (`frontend/src/hub/overlays/widget-catalog.ts`)

| Type | Access Tier | Data Status | Runtime Ready | Edit Model |
|------|-------------|-------------|---------------|------------|
| `standings` | free | ok | yes | columns |
| `delta` | free | ok | yes | slots |
| `pedals` | free | ok | yes | slots |
| `relative` | pro | ok | yes | columns |
| `broadcast-tower` | pro | partial | no | slots |
| `multiclass-relative` | pro | partial | no | mixed |
| `race-schedule` | pro | partial | no | slots |
| `telemetry-blade` | pro | ok | no | slots |
| `fuel-calculator` | tester | partial | no | slots |
| `track-weather` | tester | pending | no | slots |
| `car-damage` | tester | pending | no | slots |
| `head-2-head` | tester | pending | no | slots |
| `delta-trace` | experimental | pending | no | mixed |
| `racing-flags` | tester | partial | no | slots |

### Runtime Widget Map (`CompositeApp.tsx:36-46`)

```typescript
const WIDGETS = {
  delta: DeltaWidget,
  relative: RelativeWidget,
  standings: StandingsWidget,
  telemetry: TelemetryWidget,
  "telemetry-vertical": TelemetryVerticalWidget,
  pedals: PedalsWidget,
  "engineer-notifications": EngineerNotificationsWidget,
  "broadcast-tower": BroadcastTowerWidget,
  "multiclass-relative": MulticlassRelativeWidget,
};
```

### Widget Host (`WidgetHost.tsx`)

- Positions widget at `(x, y)` in window-local coordinates
- Applies scaling based on `getWidgetBaseSize()` and `normalizeWidgetVisualRect()`
- `pointer-events-none` for non-interactive mode

### Widget Config (`pkg/config/profile.go`)

```go
type WidgetConfig struct {
    ID        string
    Type      string         // delta | relative | standings | ...
    VariantID string
    Enabled   bool
    UpdateHz  int
    Position  Rect           // x, y, w, h
    Props     map[string]any
}
```

### Variant System (`WidgetVariantConfig`)

- ID, WidgetType, TemplateID, ThemeID, Name
- Slots (SlotConfig), Columns (ColumnConfig), ColumnGroups
- Filters, Formats, Props

### Design System Registry

- `hub/registry/design-system-registry.ts` — In-memory Map
- `hub/registry/builtin-systems.ts` — Registers built-in systems
- `hub/registry/widget-components.ts` — Resolves components per design system
- `overlay/widgets/widget-design-system.ts` — Design system tokens

---

## 15. LayoutStudio and WidgetStudio

### LayoutStudio

**Props**: `profile`, `selectedWidgetId`, `dirty`, `saveState`, `overlayRunning`, `isActiveProfile`, `onStartOverlay`, `onStopOverlay`, `onSelectWidget`, `onChangeProfile`, `onAddWidget`, `onSave`, `onBack`

**Layout**: 3-column grid:
1. `StudioWidgetList` — widget list
2. `PreviewCanvas` — scaled 1920×1080 canvas with drag/resize
3. `WidgetSettingsPanel` — selected widget settings

**Features**:
- Start/stop overlay buttons
- Save with dirty state tracking
- Non-active profile warning
- Widget positioning via drag on PreviewCanvas

### WidgetStudio

**Props**: `profile`, `selectedWidgetId`, `dirty`, `saveState`, `onSelectWidget`, `onChangeProfile`, `onSave`, `onBack`

**Layout**: 3-column grid:
1. `StudioWidgetList` — widget list
2. `WidgetPreviewPanel` — live preview
3. `WidgetSettingsPanel` — appearance settings

**Features**:
- Design system selector dropdown
- Mock session selector (practice/qual/race)
- Save state indicator (dirty/saving/saved/error)
- NO position or size controls (strict separation)

### State Management (`useOverlayStudioState.ts`)

- Profile state with undo/redo
- Save state tracking
- Widget selection
- Dirty detection
- Integration with Wails events for load/save

---

## 16. Persistence and Configuration

### Frontend Persistence

| Data | Storage | Key | File |
|------|---------|-----|------|
| Locale | localStorage | `vantare.locale` | `i18n/I18nProvider.tsx` |
| Theme | localStorage | `vantare.theme` | `lib/theme.ts` |
| Supabase session | localStorage | (Supabase SDK) | `lib/supabase-auth.ts` |

### Backend Persistence

| Data | Format | Path | Atomic | Backup | Recovery |
|------|--------|------|--------|--------|----------|
| App settings | JSON | `configs/app-settings.json` | Yes (.tmp → rename) | .bak rotation | .failed sidecar |
| Overlay profiles | JSON | `configs/*.json` | Yes | No | Fallback defaults |
| Widget presets | JSON | `configs/widget-presets.json` | Yes | No | Empty on error |
| Calendar | JSON | `configs/calendar-lmu.json` | Yes | No | Empty on error |
| License cache | JSON | `configs/license-cache.json` | Yes (0600) | No | Offline grace |
| Updater settings | JSON | `configs/updater-settings.json` | Yes | No | Defaults |
| Launcher apps | In app-settings.json | `configs/app-settings.json` | Via settings | Via settings | Via settings |
| Launcher profiles | In app-settings.json | `configs/app-settings.json` | Via settings | Via settings | Via settings |

### Config Search Order (`cmd/vantare/main.go:74-122`)

1. Portable: `configs/` next to executable
2. Development: `configs/` or `vantare-v2/configs/` in CWD
3. Installed: `AppData/Roaming/Vantare/configs/` (with bundled defaults)

### Embedded Configs (`configs/embed.go`)

- `custom-hfg.json`, `example-edit.json`, `example-racing.json`, `example-streaming.json`
- Copied to user config dir on first run if not present

---

## 17. Design System

### Theme System (`lib/theme.ts`)

**Theme IDs**: `vantare-v5` (full), `vantare-lite`

**CSS Variables** (26 total):
- `--v-bg`, `--v-surface`, `--v-panel`, `--v-border`, `--v-border-hover`
- `--v-text`, `--v-text-muted`, `--v-text-dim`
- `--v-red-400` through `--v-red-950` (6 red shades)
- `--v-wine`, `--v-burgundy`, `--v-blood`
- `--v-success`, `--v-warning`
- `--v-glass-alpha`, `--v-glass-blur`, `--v-card-shadow`, `--v-hover-translate-y`, `--v-motion-scale`
- `--v-font-sans`, `--v-font-display`, `--v-font-mono`

### Vantare V5 Theme (`themes/vantare-v5.json`)

| Token | Value |
|-------|-------|
| `bg` | `#080808` |
| `surface` | `#0F0F0F` |
| `panel` | `#141414` |
| `border` | `#1E1E1E` |
| `borderHover` | `#2A2A2A` |
| `text` | `#E8E8E8` |
| `textMuted` | `#7A7A7A` |
| `textDim` | `#4A4A4A` |
| `red400` | `#E63946` |
| `red500` | `#C1121F` |
| `red600` | `#9B2226` |
| `red700` | `#800020` |
| `red900` | `#4A0012` |
| `red950` | `#2A000A` |
| `wine` | `#722F37` |
| `burgundy` | `#4A0E16` |
| `blood` | `#8B0000` |
| `glassAlpha` | `0.6` |
| `glassBlur` | `20px` |
| `font-sans` | `'Inter', sans-serif` |
| `font-display` | `'Rajdhani', sans-serif` |
| `font-mono` | `'Space Mono', monospace` |

### Fonts (loaded via Google Fonts in `index.html`)

- **Inter** (300-700) — sans-serif body
- **Rajdhani** (400-700) — display/headings
- **Space Mono** — monospace/data

### Glass Panel

Defined via CSS classes (not as a named CSS variable). Uses `glassAlpha` and `glassBlur` theme tokens.

---

## 18. Assets

### Static Assets

| Path | Format | Usage |
|------|--------|-------|
| `frontend/src/assets/hero.png` | PNG | Hero section |
| `frontend/src/assets/react.svg` | SVG | React logo |
| `frontend/src/assets/vite.svg` | SVG | Vite logo |
| `frontend/public/favicon.svg` | SVG | Browser tab icon |
| `frontend/src/overlay/widgets/_assets/` | SVG | Widget-specific icons/logos |

### Build Assets

| Path | Format | Usage |
|------|--------|-------|
| `build/windows/icon.ico` | ICO | Windows app icon |
| `build/appicon.png` | PNG | App icon |
| `build/darwin/icons.icns` | ICNS | macOS icon |
| `build/darwin/Assets.car` | CAR | macOS asset catalog |

### Marketing Assets

| Path | Format | Usage |
|------|--------|-------|
| `docs/superpowers/screenshots/widget-parity/*.png` | PNG | Widget parity screenshots (12 files) |
| `docs/overlay-*.html` | HTML | Overlay style mockups |
| `docs/p2-*.html` | HTML | Widget mockups |
| `docs/tp-*.html` | HTML | Telemetry panel mockups |
| Root `hub_main*.html` | HTML | Hub prototype iterations (12 files) |
| Root `vantare_*.html` | HTML | Standalone overlay prototypes |
| Root `v5.2-*.png` | PNG | UI mockup screenshots |

---

## 19. Internationalization

### Languages

| Locale | File | Status |
|--------|------|--------|
| `es` (Spanish) | `i18n/locales/es.ts` | Default |
| `en` (English) | `i18n/locales/en.ts` | Available |
| `pt` (Portuguese) | `i18n/locales/pt.ts` | Available |
| `it` (Italian) | `i18n/locales/it.ts` | Available |

### Implementation

- **Library**: Custom (no i18next or similar)
- **Engine**: `i18n/i18n.ts` — `translate(locale, key)` function
- **Provider**: `i18n/I18nProvider.tsx` — React context with `useI18n()` hook
- **Default locale**: `es` (Spanish)
- **Detection**: localStorage (`vantare.locale`), falls back to `es`
- **Persistence**: localStorage
- **Fallback**: Default locale if key not found

### Hardcoded Texts

Some Spanish text appears hardcoded in components (e.g., `"Cargando licencia..."`, `"Próximamente"`, edit mode hints).

---

## 20. Payments, Licenses, and Access

### Payment Provider: Polar.sh

**Status**: Active (replaced Stripe)

| Component | File | Purpose |
|-----------|------|---------|
| billing-client.ts | Frontend | `createBillingCheckout()`, `openBillingPortal()` |
| billing-checkout | Supabase EF | Creates Polar checkout session |
| billing-portal | Supabase EF | Creates Polar customer portal |
| billing-webhook | Supabase EF | Processes Polar webhooks |
| polar.ts | Shared EF | Polar API client |
| mapping.ts | Shared EF | Product → entitlement mapping |

### Products

| Key | Type | Entitlement | Lifetime |
|-----|------|-------------|----------|
| `launch_lifetime` | one_time | `bundle` | yes |
| `pro_monthly` | subscription | `bundle` | no |

### License System (`internal/license/`)

**States**: `anonymous`, `authenticated-no-entitlement`, `active`, `grace`, `expired`, `device-limit`, `unconfigured`

**Entitlements** (9): `overlays`, `engineer`, `bundle`, `beta_access`, `supporter`, `founder`, `pro_founder`, `visionary_backer`, `ac_lua_pack`

**Plan Labels**: `free`, `paid_overlays`, `paid_engineer`, `suite`, `unknown`

**Flow**:
1. Frontend calls `Events.Emit('license:validate', { sessionToken })`
2. Go `LicenseService.Validate()` calls Supabase RPC `get_account_entitlements`
3. On success, emits `license:changed` with `LicenseResult`
4. On failure, falls back to local cache (grace period 24h)
5. If no Supabase configured, runs in `unconfigured` mode (base features only)

### Environment Variables Required

| Variable | Purpose | Where |
|----------|---------|-------|
| `VITE_SUPABASE_URL` | Supabase project URL | Frontend |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Frontend |
| `VITE_BILLING_ENABLED` | Enable billing (default: false) | Frontend |
| `VANTARE_SUPABASE_URL` | Supabase URL (Go) | Go binary (ldflags or env) |
| `VANTARE_SUPABASE_ANON_KEY` | Supabase anon key (Go) | Go binary (ldflags or env) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role | Admin CLI only |

---

## 21. Database and Supabase

### Project

- **ID**: `ombjshwzqgeisazijduq`
- **URL**: `https://ombjshwzqgeisazijduq.supabase.co`

### Migrations (chronological)

| Migration | Purpose |
|-----------|---------|
| `20260605140000_initial_schema.sql` | Original schema: profiles, licenses, subscriptions, license_validations, hwid_changes, rate_limits |
| `20260709120000_provider_agnostic_billing.sql` | Extended profiles, new tables: user_entitlements, devices, license_events, billing_customers, billing_subscriptions. RPCs: get_account_entitlements, reset_active_device |
| `20260709150000_fix_get_account_entitlements_device_binding.sql` | Hotfix for ambiguous user_id in RPC |
| `20260709160000_backfill_profiles_for_existing_auth_users.sql` | Backfill missing profiles |

### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (extended with email, language, simulator) |
| `user_entitlements` | Active entitlements (product_key, status, expires_at) |
| `devices` | Device binding (fingerprint_hash, last_reset_at) |
| `license_events` | License webhook events (idempotency_key) |
| `billing_customers` | Billing provider customers |
| `billing_subscriptions` | Billing subscriptions |
| `licenses` | (Old) Legacy, not used in runtime |
| `subscriptions` | (Old) Legacy, not used in runtime |

### RPCs

| RPC | Purpose | Auth |
|-----|---------|------|
| `get_account_entitlements(device_fingerprint)` | Returns user_id, email, entitlements[], active_device, expires_at, device_ok | `authenticated` |
| `reset_active_device(device_fingerprint)` | Resets device binding (rate-limit 24h) | `authenticated` |

### Edge Functions

| Function | Auth | Purpose |
|----------|------|---------|
| `billing-checkout` | JWT required | Creates Polar checkout session |
| `billing-portal` | JWT required | Creates Polar customer portal |
| `billing-webhook` | No JWT (webhook signature) | Processes Polar webhooks |
| `validate-license` | — | DEPRECATED |

---

## 22. Security and Secrets

### Environment Files

- `.env.example` at root — contains Supabase URL and anon key placeholders
- `frontend/.env.example` — contains `VITE_BILLING_ENABLED=false`

### Token Storage

- Supabase session: localStorage (via `@supabase/supabase-js`)
- License cache: `configs/license-cache.json` (atomic write, 0600 permissions)
- Supabase URL/Key: ldflags at build time + runtime env var fallback

### OAuth Flow

1. Frontend calls `Browser.OpenURL()` to external browser
2. User authenticates with Google/Discord
3. Redirect to `http://127.0.0.1:39261/auth/callback`
4. HTTP server handles callback, exchanges tokens
5. Frontend receives tokens via URL params
6. Session stored in localStorage

### CORS

- Supabase EF shared module: `cors.ts` — returns CORS headers for all Edge Functions

### Validation

- Supabase EF `auth.ts`: `requireUserAuth()` — validates Bearer token via `auth.getUser()`
- Webhook verification: `webhook-verify.ts` — HMAC-SHA256 Standard Webhooks

---

## 23. Tests

### Go Tests (92 files)

| Package | Files | Coverage |
|---------|-------|----------|
| `cmd/vantare` | `main_test.go`, `launcher_dialog.go` | App bootstrap |
| `internal/app` | 16 test files | Settings, profiles, presets, overlay, ops, LMU, hub, hotkeys, diagnostics, calendar bridge |
| `internal/app/launcher` | 12 test files | Discovery, chain, profiles, apps, registry, hotkeys, telemetry, icons |
| `internal/calendar` | 6 test files | Calendar service, parsing, seed |
| `internal/license` | 10 test files | Service, types, cache, plan, wire |
| `internal/engineer` | Multiple | Replay, core, telemetry, audio, simulator, spotter, service |
| `internal/ops` | `sampler_test.go` | Runtime metrics |
| `internal/server` | 3 test files | SSE, server, engineer SSE |
| `internal/updater` | 4 test files | Updater, github, settings |
| `internal/window` | 2 test files | Manager, bounds |
| `internal/telemetry` | Multiple | Diff, delta, service, lmu, normalizer, fusion, pipeline, gap, lmuapi |
| `pkg/models` | 2 test files | Telemetry, JSON |
| `pkg/config` | `profile_test.go` | Profile schema |
| `build` | `sync_version_test.go` | Version sync |

### TypeScript Tests (~180+ files)

| Location | Files | Coverage |
|----------|-------|----------|
| `frontend/src/overlay/widgets/` | 10 `.test.ts` + 10 `.test.tsx` | All widget types, formatting, appearance |
| `frontend/src/overlay/` | 8 `.test.ts` + 8 `.test.tsx` | WidgetHost, WidgetEditFrame, CompositeApp, ObsOverlayApp, EditOverlayApp |
| `frontend/src/lib/` | 18 `.test.ts` + 2 `.test.tsx` | Widget variants/presets/factory, visibility, theme, telemetry, auth, billing, access |
| `frontend/src/i18n/` | 2 `.test.ts` + 2 `.test.tsx` | Translation engine, language selector |
| `frontend/src/hub/` | 60+ test files | Pages, components, overlays, preview, settings, registry, widgets, onboarding, launcher, calendar |

### E2E Tests (8 Playwright specs)

Located in `apps/desktop/e2e/` (legacy v1):
- telemetry-pipeline, sprint8-overlays, sprint8-manual-test, sprint8-ipc, sprint8-auth, sprint7-polish, sprint6-hub, sprint5b-lmu

### Test Configuration

| File | Environment | Tool |
|------|-------------|------|
| `frontend/vite.config.ts` | happy-dom | Vitest 4.1.8 |
| `apps/desktop/vitest.config.ts` | jsdom | Vitest |
| `packages/sim-core/vitest.config.ts` | node | Vitest |
| `packages/ui-core/vitest.config.ts` | jsdom | Vitest |
| `packages/auth/vitest.config.ts` | node | Vitest |

### Run Commands

| Command | Directory | Purpose |
|---------|-----------|---------|
| `corepack pnpm --dir frontend test` | vantare-v2 | Frontend unit tests |
| `go test ./...` | vantare-v2 | Go unit tests |
| `corepack pnpm --dir frontend lint` | vantare-v2 | ESLint |
| `corepack pnpm --dir frontend exec tsc -b` | vantare-v2 | Type checking |
| `corepack pnpm --dir frontend build` | vantare-v2 | Production build |

---

## 24. Scripts and Commands

### Taskfile Commands

| Command | Purpose | Directory |
|---------|---------|-----------|
| `task dev` | Wails dev mode | vantare-v2 |
| `task build` | Platform build | vantare-v2 |
| `task package:all` | Full release pipeline | vantare-v2 |
| `task release:artifacts` | Alias of package:all | vantare-v2 |
| `task release:portable` | Portable zip only | vantare-v2 |
| `task release:checksums` | SHA256 sidecars | vantare-v2 |
| `task release:verify` | Version verification | vantare-v2 |
| `task release:clean` | Remove stale files | vantare-v2 |
| `task version:sync` | Sync VERSION to configs | vantare-v2 |
| `task run` | Run app | vantare-v2 |
| `task build:server` | Server mode build | vantare-v2 |
| `task run:server` | Server mode run | vantare-v2 |
| `task setup:docker` | Docker cross-compile | vantare-v2 |

### NPM Scripts (root)

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Turbo dev |
| `pnpm build` | Turbo build |
| `pnpm lint` | Turbo lint |
| `pnpm test` | Turbo test |
| `pnpm test:e2e` | Turbo e2e |
| `pnpm format` | Prettier format |
| `pnpm typecheck` | Turbo typecheck |
| `pnpm changeset` | Changeset |
| `pnpm release` | Build + changeset publish |

### NPM Scripts (frontend)

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Vite dev server |
| `pnpm build` | tsc + vite build |
| `pnpm build:dev` | tsc + vite build (dev mode) |
| `pnpm test` | vitest run |
| `pnpm lint` | ESLint |
| `pnpm preview` | Vite preview |

### PowerShell Scripts

| Script | Purpose |
|--------|---------|
| `tools/start-wails-dev.ps1` | Start wails3 dev with Supabase env vars |
| `tools/start-wails-dev-visible.ps1` | Visible PowerShell window |
| `tools/release_artifacts.ps1` | Portable zip, SHA256, verify, clean |
| `tools/generate_supabase_config.ps1` | Generate supabase_build.go from env vars |
| `tools/build_nsis.ps1` | NSIS installer wrapper |
| `tools/benchmark.ps1` | CPU/RAM/GPU benchmark |

---

## 25. Build and Distribution

### Wails v3 Configuration

- **Config file**: `build/config.yml` (not `wails.json`)
- **Company**: Vantare
- **Product**: Vantare Simracing Suite
- **Identifier**: `com.vantare.simracing`
- **Version**: 0.1.0.4
- **Copyright**: (c) 2026, Vantare

### Build Targets

| Platform | Taskfile | Artifacts |
|----------|----------|-----------|
| Windows | `build/windows/Taskfile.yml` | .exe, NSIS installer, MSIX, portable zip |
| macOS | `build/darwin/Taskfile.yml` | .app bundle, universal binary |
| Linux | `build/linux/Taskfile.yml` | AppImage, deb, rpm, AUR |
| Android | `build/android/Taskfile.yml` | APK |
| iOS | `build/ios/Taskfile.yml` | .app bundle |

### Windows Build

- **NSIS installer**: `build/windows/nsis/project.nsi` + WebView2 bootstrapper
- **MSIX**: `build/windows/msix/`
- **Icon**: `build/windows/icon.ico`
- **Manifest**: `build/windows/wails.exe.manifest`
- **Signing**: Configurable via `SIGN_CERTIFICATE`/`SIGN_THUMBPRINT`
- **Version sync**: `build/sync_version.go` reads `VERSION` → syncs to main.go, config.yml, info.json, project.nsi

### Release Artifacts (6 files)

1. `vantare.exe` — standalone executable
2. `vantare-amd64-installer.exe` — NSIS installer
3. `vantare-portable-amd64.zip` — portable zip
4. `.sha256` for each of the above

### Auto-Updater

- `internal/updater/` — GitHub Releases
- Checks on startup (5s delay)
- Settings: `configs/updater-settings.json`
- Verified install path for security

---

## 26. CI/CD

### GitHub Actions Workflows

| Workflow | Trigger | Jobs | Purpose |
|----------|---------|------|---------|
| `release.yml` | Push tags `v*` or workflow_dispatch | build (Windows) → release (GitHub Release) | Full build + release |
| `discord-release.yml` | Push tags `v*` | Send Discord notification | Release announcement |
| `discord-beta-progress.yml` | Push to docs/current-plan.md or roadmap | Send progress to Discord | Beta progress |
| `discord-build-available.yml` | workflow_dispatch | Send build notification | Build available |
| `discord-known-issues.yml` | Push to tester-known-issues.md | Send known issues | Issue tracking |

### Release Pipeline

1. Frontend deps install
2. Frontend build
3. Go tests
4. Frontend tests
5. Frontend lint
6. Go build with ldflags
7. NSIS installer
8. Portable zip
9. SHA256 checksums
10. Version verification
11. GitHub Release creation

---

## 27. Documentation

### Key Documents

| Path | Purpose | Size |
|------|---------|------|
| `vantare-v2/docs/current-plan.md` | Living work log, active development | ~400+ lines |
| `vantare-v2/docs/technical-debt.md` | 50+ tracked debt items (TD-001 to TD-050) | 605 lines |
| `vantare-v2/AGENTS.md` | Agent instructions (Spanish) | 124 lines |
| `README.md` | Project overview | 554 lines |
| `CHANGELOG.md` | Version history | 394 lines |
| `ARCHITECTURE_DIAGRAM.md` | Architecture diagram | — |
| `vantare-v2/docs/architecture.md` | Architecture documentation | — |
| `vantare-v2/docs/license-service-contract.md` | License service API | — |
| `vantare-v2/docs/licensing-auth-architecture.md` | Auth/licensing architecture | — |
| `vantare-v2/docs/widget-architecture.md` | Widget system architecture | — |
| `vantare-v2/docs/widget-design-systems.md` | Design system docs | — |
| `vantare-v2/docs/vantare-suite-architecture.md` | Suite architecture | — |
| `vantare-v2/docs/release-checklists.md` | Release checklists | — |
| `vantare-v2/docs/testing-strategy.md` | Testing strategy | — |
| `docs/superpowers/specs/` | Feature specs (3 files) | — |
| `docs/superpowers/plans/` | Development plans (80+ files) | — |
| `docs/marketing/` | Brand strategy (5 files) | — |

---

## 28. Git and Project Organization

### Current Branch

`launch/polar-billing` — Active branch for Polar billing integration

### Commit Convention

Conventional Commits: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`
- Scopes: `billing`, `license`, `supabase`, `frontend`, `dev`, `launch`, etc.

### Gitignore Highlights

- `bin/` — Release binaries
- `*.exe`, `*.dll` — Compiled binaries
- `configs/app-settings.json` — User settings
- `configs/updater-settings.json` — Updater settings
- `frontend/bindings/` — Wails generated bindings
- `vantare-v2/*.csv` — Debug data files
- `.env`, `.env.local` — Environment secrets

### Agent Instructions

- `vantare-v2/AGENTS.md` — Primary agent instructions (Spanish)
- No `CLAUDE.md`, `GEMINI.md`, or `copilot instructions` found
- `vantare-v2/.agents/skills/vantare-core/SKILL.md` — Vantare-specific skill

---

## 29. Features Inventory

| Feature | Status | Evidence |
|---------|--------|----------|
| Hub dashboard | Confirmada en código y accesible | `DashboardPage.tsx`, sidebar nav |
| Overlays Studio (WidgetStudio + LayoutStudio) | Confirmada en código y accesible | `OverlaysStudioPage.tsx`, 62+ files |
| Widget system (9 runtime widgets) | Confirmada en código y accesible | `overlay/widgets/` |
| Design system registry | Confirmada en código y accesible | `registry/` |
| Widget presets | Confirmada en código y accesible | `widget-presets-store.ts`, `preset_service.go` |
| Widget variants | Confirmada en código y accesible | `widget-variants.ts`, `WidgetVariantConfig` |
| Overlay window (transparent, always-on-top) | Confirmada en código y accesible | `overlay_controller.go`, `wailsOverlayFactory` |
| Edit mode (drag/resize widgets) | Confirmada en código y accesible | `WidgetEditFrame.tsx`, `handleToggleEditMode` |
| OBS Browser Source (SSE) | Confirmada en código y accesible | `ObsOverlayApp.tsx`, `server/sse.go` |
| Telemetry pipeline (LMU shared memory + REST) | Confirmada en código y accesible | `internal/telemetry/` |
| Delta calculation (self/session/global) | Confirmada en código y accesible | `internal/telemetry/delta/` |
| LMU race calendar | Confirmada en código y accesible | `internal/calendar/`, `CalendarPage.tsx` |
| Calendar reminders | Confirmada en código y accesible | `reminder_loop.go`, `CalendarReminderBanner` |
| Official LMU schedule | Confirmada en código y accesible | `official_schedule.go` |
| Launcher (simulator discovery + launch) | Confirmada en código y accesible | `internal/app/launcher/`, `LauncherPage.tsx` |
| Launcher profiles (chain runner) | Confirmada en código y accesible | `chain.go`, `ProfilesPanel.tsx` |
| Launcher hotkeys | Confirmada en código y accesible | `hotkey_windows.go` |
| Launcher autostart | Confirmada en código y accesible | `autostart_windows.go` |
| Engineer/Spotter | Confirmada en código y accesible | `internal/engineer/`, `EngineerPage.tsx` |
| Engineer notifications widget | Confirmada en código y accesible | `EngineerNotificationsWidget.tsx` |
| License validation (Supabase) | Confirmada en código y accesible | `internal/license/`, `license.tsx` |
| OAuth (Google, Discord) | Confirmada en código y accesible | `supabase-auth.ts`, `LoginScreen.tsx` |
| Polar billing (checkout + portal) | Confirmada en código y accesible | `billing-client.ts`, `supabase/functions/billing-*` |
| Feature gates by plan | Confirmada en código y accesible | `access-policy.ts` |
| Beta welcome onboarding | Confirmada en código y accesible | `BetaWelcome.tsx` |
| Auto-updater (GitHub Releases) | Confirmada en código y accesible | `internal/updater/`, `UpdateBanner.tsx` |
| Global hotkeys | Confirmada en código y accesible | `hotkeys.go`, `HotkeyManager` |
| Profile hotkeys | Confirmada en código y accesible | `hotkey_windows.go` |
| Theme system (v5, lite) | Confirmada en código y accesible | `themes/`, `lib/theme.ts` |
| i18n (es, en, pt, it) | Confirmada en código y accesible | `i18n/locales/` |
| Demo mode (animated telemetry) | Confirmada en código y accesible | `useDemoMode.ts` |
| Diagnostics service | Confirmada en código y accesible | `diagnostics_service.go` |
| Runtime metrics (CPU/memory) | Confirmada en código y accesible | `internal/ops/` |
| Roadmap page | Confirmada en código y accesible | `RoadmapPage.tsx` |
| Telemetry page | Confirmada en código pero placeholder | `TelemetryPage.tsx` — "Próximamente" |
| Community profiles | Solo aparece como placeholder | `CommunityComingSoonView.tsx` |
| iRacing support | Solo constantes definidas | `SimulatorIRacing` enum only |
| Assetto Corsa support | Solo constantes definidas | `SimulatorAC` enum only |
| UDP telemetry | No encontrada | No UDP code found |
| BroadcastTower widget | Solo aparece como placeholder | Not runtime-ready |
| MulticlassRelative widget | Solo aparece como placeholder | Not runtime-ready |
| Fuel calculator | Solo aparece en catálogo | Access tier: tester |
| Track weather | Solo aparece en catálogo | Access tier: tester |
| Car damage | Solo aparece en catálogo | Access tier: tester |
| Head-to-head | Solo aparece en catálogo | Access tier: tester |
| Stripe integration | OBSOLETE | Replaced by Polar |

---

## 30. Main Flows

### Application Startup

1. `main.go:406` — Set WebView2 user data folder
2. `main.go:413-418` — Parse flags (`-live`, `-profile`, `-edit`, `-http`)
3. `main.go:428` — Load embedded frontend dist
4. `main.go:430` — Create `app.New(*live)` (telemetry app)
5. `main.go:431` — Setup signal context (SIGINT/SIGTERM)
6. `main.go:434-439` — Create Wails v3 application with bundled assets
7. `main.go:451-481` — Setup cleanup (overlay, HTTP, ops, telemetry, hotkey, launcher)
8. `main.go:485-488` — Resolve configs directory
9. `main.go:499-513` — Load profile (or create fallback)
10. `main.go:521-530` — Create overlay controller
11. `main.go:533-543` — Create hub window (1280×800, URL: `/#/hub`)
12. `main.go:551-555` — Register services with Wails
13. `main.go:557-592` — Setup license service (Supabase + cache)
14. `main.go:657-662` — Setup preset service
15. `main.go:665-671` — Setup updater service
16. `main.go:674-680` — Start engineer service
17. `main.go:683-692` — Start HTTP server (SSE, auth callback)
18. `main.go:695-699` — Setup settings service
19. `main.go:702-743` — Setup calendar service + reminders
20. `main.go:749` — Create launcher service
21. `main.go:779-828` — Setup hotkey manager
22. `main.go:831-855` — Silent update check (5s delay)
23. `main.go:860-867` — Emit version + source status
24. `main.go:1203-1209` — Start telemetry bridge + ops bridge
25. `main.go:1212-1216` — Start global hotkey manager
26. `main.go:1558` — `wailsApp.Run()` — Start event loop

### Overlay Open

1. Frontend emits `overlay:start` with profile target
2. `main.go:1120-1144` — Calls `hubSvc.StartOverlay(target)`
3. `hub_service.go` — Resolves profile, creates overlay window
4. `overlay_controller.go` — `Start(profile)` creates window via factory
5. `wailsOverlayFactory.NewOverlayWindow()` — Creates transparent, frameless, always-on-top window
6. `window/manager.go` — `ApplyProfile()` sets mode (racing → click-through)
7. Frontend `CompositeApp.tsx` receives `profile:loaded` event
8. Widgets rendered via `WidgetHost` → individual widget components

### Telemetry Reception

1. `lmu.Reader` opens `LMU_Data` shared memory (Windows)
2. `lmu.Parse()` decodes binary buffer → `models.Telemetry`
3. `lmuapi.Client` polls REST API for standings/session info
4. `fusion.Merge()` combines shared memory + REST
5. `EnrichedLMUSource` wraps fusion + delta engine
6. `service.Service` reads at 60Hz, emits at 30Hz
7. `pipeline.Filter` deduplicates, annotates session state
8. `diff.Compute()` calculates snapshot diff
9. `TelemetryBridge` subscribes, emits `telemetry:update` Wails events
10. `CompositeApp.tsx` receives event, calls `applyTelemetryUpdate()`
11. Widgets render via direct DOM writes

### License Validation

1. `LicenseProvider` mounts, emits `license:validate` with session token
2. Go `LicenseService.Validate()` calls Supabase RPC `get_account_entitlements`
3. On success: emits `license:changed` with `LicenseResult`
4. On failure: falls back to local cache (grace period 24h)
5. If no Supabase: emits `unconfigured` state
6. Frontend `LicenseGate` blocks/allows access based on state

---

## 31. Essential Files for Review

### Configuration (7 files)

1. `vantare-v2/go.mod` — Go dependencies
2. `vantare-v2/frontend/package.json` — Frontend dependencies
3. `vantare-v2/build/config.yml` — Wails build config
4. `vantare-v2/Taskfile.yml` — Build orchestration
5. `vantare-v2/VERSION` — Current version
6. `vantare-v2/frontend/vite.config.ts` — Vite config with Wails mocks
7. `vantare-v2/.gitignore` — What's excluded

### Frontend Core (15 files)

8. `vantare-v2/frontend/src/main.tsx` — App entry, 5-way routing
9. `vantare-v2/frontend/src/hub/HubApp.tsx` — Hub entry with providers
10. `vantare-v2/frontend/src/hub/navigation.ts` — Section definitions
11. `vantare-v2/frontend/src/overlay/CompositeApp.tsx` — Main overlay app
12. `vantare-v2/frontend/src/overlay/WidgetHost.tsx` — Widget positioning
13. `vantare-v2/frontend/src/lib/profile.ts` — Profile types
14. `vantare-v2/frontend/src/lib/license.tsx` — License context
15. `vantare-v2/frontend/src/lib/access-policy.ts` — Feature gates
16. `vantare-v2/frontend/src/lib/supabase-auth.ts` — Auth client
17. `vantare-v2/frontend/src/lib/billing-client.ts` — Billing client
18. `vantare-v2/frontend/src/lib/telemetry-ref.ts` — Telemetry state
19. `vantare-v2/frontend/src/lib/theme.ts` — Theme system
20. `vantare-v2/frontend/src/hub/overlays/useOverlayStudioState.ts` — Studio state
21. `vantare-v2/frontend/src/hub/overlays/widget-catalog.ts` — Widget registry
22. `vantare-v2/frontend/src/hub/launcher/chain-store.tsx` — Chain runner state

### Backend Core (15 files)

23. `vantare-v2/cmd/vantare/main.go` — Full app bootstrap (1887 lines)
24. `vantare-v2/internal/app/app.go` — App struct
25. `vantare-v2/internal/app/overlay_controller.go` — Overlay lifecycle
26. `vantare-v2/internal/app/telemetry_bridge.go` — Telemetry → UI
27. `vantare-v2/internal/app/profile_service.go` — Profile CRUD
28. `vantare-v2/internal/app/settings_service.go` — Settings persistence
29. `vantare-v2/internal/app/hub_service.go` — Hub service
30. `vantare-v2/internal/app/lmu_enriched_source.go` — LMU fusion
31. `vantare-v2/internal/telemetry/service/service.go` — Telemetry pub/sub
32. `vantare-v2/internal/telemetry/lmu/reader_windows.go` — Shared memory reader
33. `vantare-v2/internal/telemetry/lmu/parser.go` — Buffer parser
34. `vantare-v2/internal/window/manager.go` — Window modes
35. `vantare-v2/internal/app/launcher/launcher.go` — Launcher orchestrator
36. `vantare-v2/internal/app/launcher/chain.go` — Chain runner
37. `vantare-v2/pkg/config/profile.go` — Profile schema (v2)

### Telemetry (5 files)

38. `vantare-v2/pkg/models/telemetry.go` — Telemetry models
39. `vantare-v2/internal/telemetry/delta/engine.go` — Delta engine
40. `vantare-v2/internal/telemetry/lmuapi/client.go` — REST client
41. `vantare-v2/internal/telemetry/fusion/fusion.go` — Data fusion
42. `vantare-v2/internal/telemetry/pipeline/filter.go` — Dedup filter

### Widgets (5 files)

43. `vantare-v2/frontend/src/overlay/widgets/DeltaWidget.tsx` — Delta widget
44. `vantare-v2/frontend/src/overlay/widgets/RelativeWidget.tsx` — Relative widget
45. `vantare-v2/frontend/src/overlay/widgets/StandingsWidget.tsx` — Standings widget
46. `vantare-v2/frontend/src/overlay/widgets/PedalsWidget.tsx` — Pedals widget
47. `vantare-v2/frontend/src/overlay/widgets/widget-design-system.ts` — Design tokens

### Persistence (5 files)

48. `vantare-v2/configs/embed.go` — Embedded configs
49. `vantare-v2/internal/license/cache.go` — License cache
50. `vantare-v2/internal/license/service.go` — License validation
51. `vantare-v2/internal/calendar/calendar_service.go` — Calendar persistence
52. `vantare-v2/internal/updater/settings.go` — Updater settings

### Billing/Payments (5 files)

53. `supabase/functions/billing-checkout/index.ts` — Polar checkout
54. `supabase/functions/billing-webhook/process.ts` — Webhook processing
55. `supabase/functions/_shared/mapping.ts` — Product mapping
56. `supabase/functions/_shared/polar.ts` — Polar API client
57. `supabase/migrations/20260709120000_provider_agnostic_billing.sql` — Schema

### Tests (5 files)

58. `vantare-v2/cmd/vantare/main_test.go` — App bootstrap tests
59. `vantare-v2/internal/app/launcher/chain_test.go` — Chain runner tests
60. `vantare-v2/internal/license/service_test.go` — License tests
61. `vantare-v2/frontend/src/overlay/CompositeApp.test.tsx` — Overlay tests
62. `vantare-v2/frontend/src/hub/overlays/WidgetStudio.test.tsx` — WidgetStudio tests

### Documentation (5 files)

63. `vantare-v2/docs/current-plan.md` — Active work log
64. `vantare-v2/docs/technical-debt.md` — Debt tracker
65. `vantare-v2/AGENTS.md` — Agent instructions
66. `README.md` — Project overview
67. `CHANGELOG.md` — Version history

---

## 32. Information Not Found

- **UDP telemetry**: No UDP code found anywhere in the repository
- **iRacing adapter**: Only enum constant defined, no reader/parser implementation
- **Assetto Corsa adapter**: Only enum constant defined, no reader/parser implementation
- **Assetto Corsa EVO / ACEVO**: No code found
- **rFactor 2**: No direct code (LMU is the successor)
- **Multi-monitor support**: `MonitorIndex` field exists in profile but reserved ("F9")
- **Storybook**: Config exists in `learnings.md` but no active Storybook setup found
- **Playwright E2E for v2**: Only legacy v1 specs in `apps/desktop/e2e/`
- **CI tests for v2**: `release.yml` runs Go tests and frontend tests, but no dedicated test workflow
- **Supabase Edge Function tests**: Some test files exist but coverage unclear
- **Telemetry page**: Placeholder only ("Próximamente")
- **Community profiles**: `CommunityComingSoonView.tsx` exists but is a coming-soon placeholder
- **Admin CLI implementations**: `cmd/vantare-admin/` has stub implementations ("not implemented in this version")
- **Mobile apps**: Android/iOS Taskfile targets exist but no active development
- **Docker deployment**: Dockerfiles exist but no production deployment
- **WebSocket communication**: No WebSocket code found (SSE used instead)
- **Undo/redo in LayoutStudio**: `useOverlayStudioState` mentions undo/redo but implementation details not fully traced
- **Multi-layout profiles**: `ProfileLayout` type exists with multiple layout types but only `general` is actively used
- **Streaming mode**: Defined in code (`ModeStreaming`) but behavior is "minimized off-screen" — no streaming-specific UI

---

## 33. Questions for the Owner

1. **Simulators**: Which simulators are officially supported for launch? Only LMU, or should iRacing/AC stubs be fleshed out?
2. **Overlay flow**: Is the current overlay flow (Hub → start overlay → transparent window) the intended production UX?
3. **Widget behavior**: Should BroadcastTower and MulticlassRelative be runtime-ready for launch, or are they deferred?
4. **Free vs paid**: What is the intended free tier for launch? The `free` plan currently allows basic overlays, launcher, calendar, and dashboard.
5. **Telemetry page**: Is the Telemetry page placeholder intentional for launch, or should it be populated?
6. **Community profiles**: Is the community feature deferred, or should it be removed from the UI?
7. **Polar products**: Are `launch_lifetime` and `pro_monthly` the final product definitions?
8. **License grace period**: Is 24 hours the intended offline grace period?
9. **Device limit**: How many devices per account? Current code checks `active_device` but doesn't enforce a max count in the RPC.
10. **Performance targets**: Are there specific FPS/rendering targets for the overlay (e.g., 60fps, <16ms frame budget)?
11. **Backwards compatibility**: Should v2 profiles be compatible with any future v1 migration?
12. **Production data**: Are there production Supabase records/migrations that aren't reflected in the repo?
13. **Branding**: Is the brand name finalized as "Vantare Simracing Suite" or just "Vantare"?
14. **Platforms**: Is Windows-only the launch target, or should macOS/Linux be ready?
15. **Engineer module**: Is the Engineer/Spotter feature intended for launch, or is it beta-only?

---

## HANDOFF SUMMARY

### Stack
- **Frontend**: React 19.2, Vite 8, TypeScript 6, Tailwind CSS 4, Motion 12, Supabase JS 2.45
- **Backend**: Go 1.25, Wails v3 (alpha.98-tui), gopsutil v4
- **Database**: Supabase (PostgreSQL) with 4 migrations
- **Payments**: Polar.sh (replaced Stripe)
- **Build**: Taskfile + pnpm + Turbo + Wails v3
- **Tests**: Vitest 4, Testing Library, Playwright, Go testing + testify

### Entry Points
- `frontend/src/main.tsx` — 5-way routing (overlay, OBS, edit, hub, default)
- `cmd/vantare/main.go` — 1887-line app bootstrap
- `frontend/index.html` — HTML entry with font loading and transparent overlay boot

### Main Modules
1. **Hub** — Dashboard, Overlays Studio, Launcher, Calendar, Engineer, Telemetry (placeholder), Roadmap, Settings
2. **Overlay** — CompositeApp (live), ObsOverlayApp (OBS), EditOverlayApp (edit mode)
3. **Widgets** — 9 runtime widgets (delta, relative, standings, telemetry, pedals, engineer-notifications, broadcast-tower, telemetry-vertical, multiclass-relative)
4. **Launcher** — Simulator discovery, launch profiles, chain runner, hotkeys, autostart
5. **Calendar** — LMU race calendar, reminders, official schedule
6. **Engineer** — Spotter, notifications, replay, audio
7. **License** — Supabase validation, device binding, entitlements, offline grace
8. **Billing** — Polar checkout, portal, webhooks
9. **Updater** — GitHub Releases auto-update

### Telemetry Flow
LMU Shared Memory → Reader → Parser → Normalizer → Fusion (+REST API) → Service (60Hz/30Hz) → Bridge → Wails Events → Frontend → Widgets (DOM writes)

### Overlay Flow
Hub → Start Overlay → Wails creates transparent window → Profile loaded → Widgets positioned/scaled → Telemetry updates at 30Hz → Racing mode (click-through) / Edit mode (interactive)

### Widget System
14 catalog types (4 runtime-ready: delta, relative, standings, pedals) → Variants (appearance) → Design Systems (Base, Crystal) → Presets → WidgetStudio (appearance) / LayoutStudio (position/size)

### Persistence
- Frontend: localStorage (locale, theme, Supabase session)
- Backend: Atomic JSON files in `configs/` (settings, profiles, presets, calendar, license cache, updater)
- Supabase: PostgreSQL (profiles, entitlements, devices, billing)

### Billing
Polar.sh → Supabase Edge Functions (billing-checkout, billing-portal, billing-webhook) → Database (billing_customers, billing_subscriptions, user_entitlements) → Go LicenseService → Frontend LicenseProvider

### Tests
- Go: 92 test files across all packages
- TypeScript: ~180+ test files (unit + component)
- E2E: 8 Playwright specs (legacy v1 only)
- No dedicated test CI workflow for v2

### Key Commands
- `task dev` — Development mode
- `task build` — Production build
- `task package:all` — Full release pipeline
- `corepack pnpm --dir frontend test` — Frontend tests
- `go test ./...` — Go tests

### Top 20 Files Most Important for Review
1. `cmd/vantare/main.go` — App bootstrap and event wiring
2. `internal/app/overlay_controller.go` — Overlay lifecycle
3. `internal/app/telemetry_bridge.go` — Telemetry → UI bridge
4. `internal/telemetry/service/service.go` — Telemetry pub/sub
5. `internal/telemetry/lmu/reader_windows.go` — Shared memory reader
6. `internal/license/service.go` — License validation
7. `internal/app/settings_service.go` — Settings persistence
8. `internal/app/launcher/chain.go` — Chain runner
9. `pkg/config/profile.go` — Profile schema
10. `pkg/models/telemetry.go` — Telemetry models
11. `frontend/src/main.tsx` — Frontend entry
12. `frontend/src/overlay/CompositeApp.tsx` — Main overlay
13. `frontend/src/hub/HubApp.tsx` — Hub entry
14. `frontend/src/lib/access-policy.ts` — Feature gates
15. `frontend/src/lib/billing-client.ts` — Billing client
16. `frontend/src/hub/overlays/useOverlayStudioState.ts` — Studio state
17. `frontend/src/hub/overlays/widget-catalog.ts` — Widget registry
18. `supabase/functions/billing-checkout/index.ts` — Polar checkout
19. `supabase/migrations/20260709120000_provider_agnostic_billing.sql` — Schema
20. `docs/current-plan.md` — Active development state

### Pending Questions
1. Official simulator support for launch?
2. Intended overlay flow in production?
3. Which widgets must be runtime-ready for launch?
4. Free tier definition for launch?
5. Polar product definitions final?
6. Performance targets for overlay rendering?
7. Windows-only launch target?
8. Engineer module launch readiness?
9. Production data not in repo?
10. License grace period and device limits?
