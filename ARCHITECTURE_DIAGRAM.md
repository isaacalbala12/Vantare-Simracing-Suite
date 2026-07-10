# Vantare Overlays Architecture Diagram

## Overview

Vantare Overlays is a professional simracing overlay system with two major versions:
- **v1 (Legacy)**: Electron-based monorepo (deprecated)
- **v2 (Current)**: Go + Wails + React (active development)

---

## v2 Architecture (Current - Go + Wails + React)

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VANTARE OVERLAYS v2                                │
│                         (Go + Wails + React 19)                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
        ┌───────────────────┐   ┌───────────────┐   ┌──────────────────┐
        │  Le Mans Ultimate │   │   Hub Window  │   │  Overlay Window  │
        │   (Simulator)     │   │  (Wails/React)│   │  (Wails/React)   │
        └───────────────────┘   └───────────────┘   └──────────────────┘
                    │                   │                   │
                    │ Shared Memory     │                   │
                    ▼                   │                   │
        ┌───────────────────┐           │                   │
        │  LMU_Data (mmap)  │           │                   │
        │   ~325 KB buffer  │           │                   │
        └─────────┬─────────┘           │                   │
                  │                     │                   │
                  │ 60 Hz poll           │                   │
                  ▼                     │                   │
        ┌──────────────────────────────────────────────────────────────────┐
        │                    GO BACKEND (internal/)                         │
        ├──────────────────────────────────────────────────────────────────┤
        │                                                                    │
        │  ┌────────────────────────────────────────────────────────────┐  │
        │  │ telemetry/lmu/ - LMU Shared Memory Reader                    │  │
        │  │   ├── reader_windows.go  - mmap reader (60 Hz)             │  │
        │  │   ├── parser.go          - offset-based parser              │  │
        │  │   ├── offsets.go         - generated from Python ctypes     │  │
        │  │   └── synthetic.go       - mock data generator              │  │
        │  └────────────────────────────────────────────────────────────┘  │
        │                              │                                   │
        │                              ▼                                   │
        │  ┌────────────────────────────────────────────────────────────┐  │
        │  │ telemetry/normalizer/ - Raw bytes → Unified Telemetry       │  │
        │  └────────────────────────────────────────────────────────────┘  │
        │                              │                                   │
        │                              ▼                                   │
        │  ┌────────────────────────────────────────────────────────────┐  │
        │  │ telemetry/pipeline/ - Processing Pipeline                    │  │
        │  │   ├── deadband filter  - suppress noise                     │  │
        │  │   ├── diff/            - JSON diff payload                   │  │
        │  │   └── service/         - 60Hz read / 30Hz emit              │  │
        │  └────────────────────────────────────────────────────────────┘  │
        │                              │                                   │
        │            ┌─────────────────┼─────────────────┐                 │
        │            │                 │                 │                 │
        │            ▼                 ▼                 ▼                 │
        │  ┌─────────────────┐ ┌─────────────┐ ┌──────────────────┐       │
        │  │ Wails Binding   │ │ HTTP Server │ │  Hub Service     │       │
        │  │ (Go → JS)       │ │   + SSE     │ │  (Config/Profile)│       │
        │  └─────────────────┘ └─────────────┘ └──────────────────┘       │
        └──────────────────────────────────────────────────────────────────┘
                    │                 │                 │
                    │ 30 Hz throttle  │ 30 Hz SSE      │ On-demand
                    ▼                 ▼                 ▼
        ┌───────────────────┐ ┌─────────────┐ ┌──────────────────┐
        │  Overlay Runtime  │ │ OBS Browser │ │  Hub UI          │
        │  (React 19)       │ │   Source    │ │  (React 19)      │
        │  - Standings      │ │   (HTTP)    │ │  - Dashboard     │
        │  - Relative       │ │             │ │  - Profile Editor│
        │  - Delta          │ │             │ │  - Preview       │
        │  - Telemetry      │ │             │ │  - Settings      │
        └───────────────────┘ └─────────────┘ └──────────────────┘
```

### Data Flow

```
LMU Shared Memory (LMU_Data)
    │
    │ 60 Hz poll (zero-copy slice)
    ▼
Go mmap reader (reader_windows.go)
    │
    │ Raw bytes (~325 KB)
    ▼
Go parser (offset-based, parser.go)
    │
    │ Struct fields (speed, gear, rpm, etc.)
    ▼
Normalizer (unified telemetry format)
    │
    │ Telemetry struct
    ▼
Pipeline (deadband + diff + throttle)
    │
    ├─────────────────┬─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
Wails Binding    HTTP/SSE         Hub Service
(30 Hz)          (30 Hz)         (on-demand)
    │                 │                 │
    ▼                 ▼                 ▼
Overlay Window   OBS Browser      Hub Window
(React)          Source          (React)
```

### Component Breakdown

#### 1. Go Backend (`internal/`)

**Telemetry Pipeline (`internal/telemetry/`)**
- `lmu/` - LMU shared memory reader and parser
  - `reader_windows.go` - Windows-specific mmap reader (60 Hz)
  - `parser.go` - Offset-based parser using generated offsets
  - `offsets.go` - Generated from Python ctypes (build-time only)
  - `synthetic.go` - Mock data generator for testing
- `normalizer/` - Converts raw bytes to unified telemetry format
- `pipeline/` - Processing pipeline with optimizations
  - Deadband filter to suppress noise
  - Diff payload for efficient updates
  - Service layer (60 Hz read, 30 Hz emit)
- `delta/` - Delta calculation logic
- `gap/` - Gap calculation for relative/standings
- `fusion/` - Data fusion from multiple sources

**App Services (`internal/app/`)**
- `app.go` - Main Wails application lifecycle
- `hub_service.go` - Hub configuration and profile management
- `profile_service.go` - Profile CRUD operations
- `preset_service.go` - Preset management
- `settings_service.go` - Application settings
- `overlay_controller.go` - Overlay window management
- `telemetry_bridge.go` - Bridge between telemetry and UI
- `telemetry_source_manager.go` - Manages telemetry sources
- `hotkeys.go` - Global hotkey registration
- `diagnostics_service.go` - System diagnostics
- `updater_service.go` - Auto-update functionality
- `calendar_bridge.go` - Calendar integration
- `engineer_bridge.go` - Engineer mode bridge
- `ops_bridge.go` - Operations bridge

**Window Management (`internal/window/`)**
- Bounds calculation for shrink-wrap
- Mode manager (racing/edit/streaming)
- Monitor detection

**Other Services**
- `calendar/` - Calendar functionality
- `engineer/` - Engineer mode
- `license/` - License validation
- `ops/` - Operations
- `server/` - HTTP server for OBS
- `updater/` - Update mechanism

#### 2. Frontend (`frontend/`)

**React 19 + TypeScript + Vite + Tailwind v4**

**Main Entry Points**
- `main.tsx` - Application entry point
- `index.html` - HTML template

**Hub UI (`src/hub/`)**
- Dashboard with cinematographic hero
- Car/circuit/session panels
- Driver ratings and iRating graph
- Recent races
- Profile editor
- Preview workbench
- Settings panels

**Overlay Runtime (`src/overlay/`)**
- `CompositeApp.tsx` - Main overlay composite window
- `EditOverlayApp.tsx` - Edit mode overlay
- `ObsOverlayApp.tsx` - OBS-only mode
- `WidgetHost.tsx` - Widget host component
- `WidgetEditFrame.tsx` - Widget editing frame
- `widgets/` - Individual widget implementations
  - Standings
  - Relative
  - Delta
  - Telemetry (horizontal/vertical)
  - Pedals
  - Calendar reminder

**Libraries (`src/lib/`)**
- `telemetry-ref.ts` - Telemetry reference management
- `profile.ts` - Profile utilities
- Theme utilities
- i18n setup

**Calendar (`src/calendar/`)**
- Calendar integration
- Event management

**Engineer (`src/engineer/`)**
- Engineer mode tools

**Themes (`src/themes/`)**
- Theme definitions (Dark, Blood, Midnight)
- CSS custom properties

#### 3. Wails Integration

**Bindings (`bindings/`)**
- Go ↔ JavaScript bridge
- Event system for telemetry
- IPC for configuration

**Window Modes**
- **Racing**: Shrink-wrap transparent window, click-through, 30 Hz
- **Edit**: Fullscreen transparent window, interactive, 10 Hz
- **Streaming**: No Wails window, HTTP/SSE only

#### 4. HTTP Server (OBS Mode)

**Endpoints**
- `GET /overlay?profile=...` - Overlay HTML page
- `GET /telemetry/stream` - SSE telemetry stream (30 Hz)

**Features**
- Single browser source in OBS
- No desktop window overhead
- Same renderer as Wails mode

### Performance Optimizations

**Go Backend**
- Zero-copy mmap (no 325 KB copy per tick)
- Partial parsing (only what widgets need)
- Throttle to 30 Hz before crossing to JS
- Deadband filtering
- Diff payload (only changed fields)
- Dedicated goroutines (reader, parser, broadcast)

**Frontend**
- Direct DOM manipulation for hot fields (RPM, speed, delta)
- React ref for telemetry (no re-renders)
- React.memo for standings rows
- CSS containment
- Transform/opacity animations only
- Code-split (hub vs overlay bundles)
- Virtualization for large lists

**Window Management**
- Single composite window (not N windows per widget)
- Shrink-wrap (bounding box of widgets)
- skipWindowRefresh on layout save
- Click-through in racing mode

**OBS Mode**
- No Wails window overhead
- SSE for efficient streaming
- Single browser source

### Profile System

**Profile JSON Structure**
```json
{
  "id": "default-racing",
  "displayMode": "racing",  // racing | streaming | edit
  "monitorIndex": 0,
  "widgets": [
    {
      "id": "delta",
      "type": "delta",
      "enabled": true,
      "updateHz": 30,
      "position": { "x": 760, "y": 40, "w": 400, "h": 48 }
    }
  ]
}
```

**Display Modes**
- `racing`: Shrink-wrap window, click-through, 30 Hz
- `streaming`: No window, HTTP/SSE only
- `edit`: Fullscreen, interactive, 10 Hz

### Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Desktop Shell | Wails | v3 | WebView2, native windows, Go↔JS bindings |
| Backend Language | Go | 1.25+ | Telemetry, logic, HTTP, window management |
| Frontend Language | TypeScript | 6.0+ | Type safety with schemas |
| UI Framework | React | 19.2+ | Hub + widgets overlay |
| CSS | Tailwind CSS | v4 | Utilities + theme tokens |
| Bundler | Vite | 8.0+ | Frontend build |
| LMU Codegen | Python + ctypes | 3.11+ | Build-time offset generation |
| Streaming | Go net/http + SSE | - | OBS browser sources |
| Auth | Supabase | 2.45+ | Licensing (post-MVP) |
| Testing Go | testing + testify | - | Unit tests |
| Testing Frontend | Vitest + Testing Library | - | Component tests |
| E2E | Playwright | 1.60+ | End-to-end tests |

---

## v1 Architecture (Legacy - Electron + Node)

### Monorepo Structure

```
vantare-overlays/
├── apps/
│   ├── desktop/              # Electron main app (v1 legacy)
│   │   ├── src/
│   │   │   ├── main/         # Electron main process
│   │   │   ├── preload/      # Preload scripts
│   │   │   └── renderer/     # Renderer process (React)
│   │   └── electron-builder.yml
│   │
│   └── overlay-app/          # Standalone web app
│
├── packages/
│   ├── @vantare/
│   │   ├── sim-core/         # Telemetry adapters
│   │   │   ├── src/
│   │   │   │   ├── adapters/ # iRacing, LMU, AC adapters
│   │   │   │   └── types/    # Telemetry types
│   │   │
│   │   ├── ui-core/          # Shared React components
│   │   ├── auth/             # Supabase auth
│   │   └── types/            # Public types
│   │
│   └── ui/                   # Additional UI package
│
├── shared/
│   └── types/                # IPC bridge types
│
└── docs/                     # Documentation
```

### v1 Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Desktop | Electron | 33.0.0 |
| Frontend | React | 19.0.0 |
| Language | TypeScript | 5.7.0 |
| Build | Vite | 6.0.0 |
| CSS | Tailwind CSS | 4.2.0 |
| State | Zustand | 5.0.0 |
| Monorepo | Turborepo | 2.5.0 |
| Package Manager | pnpm | 9.1.0 |
| Testing | Vitest | 3.0.0 |
| E2E | Playwright | 1.49.0 |
| Auth | Supabase | 2.45.0 |

### Why v2 Replaced v1

- **Resource Usage**: Electron ~200 MB overhead vs Wails ~50 MB
- **Performance**: Go telemetry processing vs Node
- **Architecture**: Single composite window vs N windows
- **Modern Stack**: Wails v3 + React 19 vs Electron legacy

---

## Key Architectural Decisions

### 1. Single Composite Window
- **v2**: One window containing all widgets (shrink-wrap)
- **Benefit**: 1 WebView2 instance instead of N, ~80 MB RAM total vs ~80 MB × N

### 2. LMU Offset Generation
- **Approach**: Python ctypes at build-time → Go offsets
- **Reason**: C++ struct alignment incompatible with Go
- **Runtime**: No Python in production, only Go parser

### 3. Throttle Before JS
- **Rate**: 60 Hz read → 30 Hz emit to UI
- **Reason**: React can't handle 60 Hz state updates efficiently

### 4. Direct DOM for Hot Fields
- **Pattern**: `useRef` + direct DOM manipulation for RPM/speed/delta
- **Benefit**: No React re-renders for high-frequency updates

### 5. OBS-Only Mode
- **Feature**: No Wails window, HTTP/SSE only
- **Benefit**: Zero compositor overhead for streamers

### 6. Deadband Filtering
- **Pattern**: Suppress updates below threshold
- **Benefit**: Reduce unnecessary UI updates

---

## Performance Targets (v2)

| Metric | Target v2 | v1 Electron |
|--------|-----------|-------------|
| Binary Size | < 40 MB | ~150 MB |
| RAM Total | < 120 MB | 250-400 MB |
| RAM per Overlay | < 80 MB | 80-150 MB × N |
| CPU Usage | < 2% | 5-15% |
| Telemetry Latency | < 33 ms | 50-100 ms |
| Parse Time | < 2 ms | - |
| Startup Time | < 2 s | 3-5 s |

---

## Development Workflow

### v2 Development

```bash
cd vantare-v2

# Go tests
go test ./...

# Frontend tests
pnpm --dir frontend test

# Build frontend
pnpm --dir frontend build

# Run with live LMU
go run ./cmd/vantare -profile configs/example-racing.json

# Run with mock telemetry
go run ./cmd/vantare -live=false -profile configs/example-racing.json

# Debug LMU telemetry
go run ./cmd/lmu-debug -mock -once
```

### v1 Development (Legacy)

```bash
# Install dependencies
pnpm install

# Development
pnpm dev

# Tests
pnpm test

# Build
pnpm build

# Package
pnpm package
```

---

## File Organization Summary

### v2 Key Directories

- `cmd/vantare/` - Main Wails application
- `cmd/lmu-debug/` - LMU telemetry CLI tool
- `internal/telemetry/` - Telemetry pipeline
- `internal/app/` - Application services
- `frontend/src/hub/` - Hub UI
- `frontend/src/overlay/` - Overlay runtime
- `frontend/src/widgets/` - Widget implementations
- `configs/` - Profile JSON files
- `pkg/` - Shared packages
- `tools/` - Build-time tools (offset generator)

### v1 Key Directories

- `apps/desktop/` - Electron app (legacy)
- `packages/@vantare/sim-core/` - Telemetry adapters
- `packages/@vantare/ui-core/` - Shared UI components
- `packages/@vantare/auth/` - Authentication
- `shared/types/` - IPC types
