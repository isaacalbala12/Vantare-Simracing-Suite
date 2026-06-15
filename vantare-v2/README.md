# Vantare Overlays v2

Pre-alpha `v0.1.1-prealpha` del reinicio del proyecto con **Go + Wails + React**.

Estado actual: Hub principal + Preview Workbench + overlay desktop fullscreen transparente bajo demanda + telemetría live de Le Mans Ultimate. `apps/desktop/` es v1 legado y no forma parte de esta pre-alpha.

Documentación: [`../docs/V2-STACK-AND-PERFORMANCE.md`](../docs/V2-STACK-AND-PERFORMANCE.md) · Plan maestro: [`../docs/V2-MASTER-PLAN.md`](../docs/V2-MASTER-PLAN.md) · **Guía completa:** [`../docs/proyecto/README.md`](../docs/proyecto/README.md)

## Requisitos

- Go 1.25+ (Wails v3) · Node 20+ · pnpm
- Windows 10/11 (shared memory LMU)
- Le Mans Ultimate en ejecución (para modo live)

## Estructura

```
vantare-v2/
├── cmd/vantare/            # Wails app: Hub + overlay runtime bajo demanda
├── cmd/lmu-debug/          # CLI de telemetría LMU
├── configs/                # perfiles JSON (racing, edit)
├── frontend/               # React 19 + Vite + Tailwind v4
│   └── src/
│       ├── lib/            # telemetry-ref.ts, profile.ts
│       └── overlay/        # CompositeApp, WidgetHost, widgets/
├── internal/
│   ├── app/                # lifecycle + bridge + profile service
│   ├── core/               # deadband, utilidades
│   ├── telemetry/
│   │   ├── lmu/            # mmap reader + parser
│   │   ├── normalizer/     # raw bytes → snapshot
│   │   ├── pipeline/       # deadband filter
│   │   ├── diff/           # JSON diff payload
│   │   └── service/        # 60Hz read / 30Hz emit + Subscribe
│   └── window/             # bounds + mode manager
├── pkg/
│   ├── config/             # profile schema + load/save
│   └── models/             # tipos unificados
└── tools/                  # generador offsets (desde repo v1)
```

## Comandos

```bash
cd vantare-v2

# Tests (sin LMU)
go test ./...

# Debug con buffer sintético
go run ./cmd/lmu-debug -mock -once

# Debug en vivo (LMU abierto en pista)
go run ./cmd/lmu-debug -once
go run ./cmd/lmu-debug -hz 10
```

## Salida esperada (mock)

```
track=Spa | speed=54.0 km/h | gear=4 | rpm=7200 | fuel=45.2 L | lap=0
```

## Ejecutar Vantare

```bash
pnpm --dir frontend install
pnpm --dir frontend test           # vitest: wire format + diff merge
pnpm --dir frontend build
go run ./cmd/vantare -profile configs/example-racing.json                     # live LMU (por defecto)
go run ./cmd/vantare -live=false -profile configs/example-racing.json        # mock telemetry
```

## Hub + Preview Workbench

La app abre primero el Hub. El overlay desktop no se crea al arrancar; se crea al pulsar `Iniciar` desde el flujo de perfiles/Preview.

Preview permite:

- seleccionar perfil/layout;
- activar/desactivar widgets;
- editar posición/tamaño/apariencia;
- guardar el JSON;
- iniciar/detener el overlay runtime.

El runtime renderiza solo widgets `enabled: true`.

### Comandos

```bash
go test ./...                     # Go tests
pnpm --dir frontend test          # Frontend tests
pnpm --dir frontend build         # Build frontend

# Live con LMU (por defecto)
go run ./cmd/vantare -profile configs/example-racing.json

# Modo mock
go run ./cmd/vantare -live=false -profile configs/example-racing.json
```

### Perfil JSON

Los perfiles definen widgets con posiciones, tipo y props:

```json
{
  "id": "default-racing",
  "displayMode": "racing",
  "monitorIndex": 0,
  "widgets": [
    { "id": "delta", "type": "delta", "enabled": true, "position": { "x": 760, "y": 40, "w": 400, "h": 48 } },
    { "id": "relative", "type": "relative", "enabled": true, "position": { "x": 40, "y": 600, "w": 320, "h": 280 } },
    { "id": "standings", "type": "standings", "enabled": true, "position": { "x": 1560, "y": 40, "w": 340, "h": 420 } }
  ]
}
```

## Widgets Alpha

- `standings`: conectado a vehículos LMU.
- `relative`: conectado a vehículos LMU.
- `delta`: UI disponible; `deltaBest` live fiable está pendiente.
- `telemetry` y `telemetry-vertical`: velocidad/marcha/rpm/pedales según datos disponibles.
- `pedals`: visual inicial con throttle/brake/clutch; clutch live queda pendiente si LMU no expone offset.

## Hub features

- **Dashboard**: Hero VANTARE cinematográfico, panel coche/circuito/sesión, banner evento, ratings driver + safety, gráfico iRating (canvas), carreras recientes, sidebar Pro + ecosistema
- **Overlays / Preview**: Lista perfiles, editor visual, iniciar/detener overlay, activar/desactivar widgets
- **Diseño**: Portado fiel desde `hub_main_v5.html` — Tailwind v4, glass-panel, card-sleek, paleta `vantare-*`

## Modos

- **Racing desktop**: ventana fullscreen, transparente, always-on-top y click-through.
- **Streaming/OBS**: página HTTP en `/overlay?profile=...` + SSE `/telemetry/stream`.
- **Preview**: editor dentro del Hub; la ventana desktop no se usa para editar.

## Próximos pasos

1. ~~Offsets generados desde Python~~ → `python tools/generate-lmu-offsets.py`
2. ~~Fixtures binarios + tests (`testdata/lmu-fixture.bin`)~~ → ver `testdata/README.md`
3. ~~Normalizer + deadband en pipeline (Fase 2)~~ ✅
4. ~~Wails v3 + ventana overlay (Fase 3)~~ ✅
5. ~~Composite layout + perfiles (Fase 4)~~ ✅
6. ~~Hub dashboard + CRUD perfiles (Fase 5)~~ ✅
