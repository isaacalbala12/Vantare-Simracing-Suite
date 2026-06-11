# Vantare Overlays v2

Reinicio del proyecto con **Go + Wails + React**. Esta carpeta es el scaffold inicial (Fase 1).

Documentación: [`../docs/V2-STACK-AND-PERFORMANCE.md`](../docs/V2-STACK-AND-PERFORMANCE.md) · Plan maestro: [`../docs/V2-MASTER-PLAN.md`](../docs/V2-MASTER-PLAN.md)

## Requisitos

- Go 1.25+ (Wails v3) · Node 20+ · pnpm
- Windows 10/11 (shared memory LMU)
- Le Mans Ultimate en ejecución (para modo live)

## Estructura

```
vantare-v2/
├── cmd/vantare/            # Wails overlay app (Fase 3)
├── cmd/lmu-debug/          # CLI de telemetría LMU
├── frontend/               # React 19 + Vite + Tailwind v4
├── internal/
│   ├── app/                # lifecycle + telemetry bridge
│   ├── core/               # deadband, utilidades
│   └── telemetry/
│       ├── lmu/            # mmap reader + parser
│       ├── normalizer/     # raw bytes → snapshot
│       ├── pipeline/       # deadband filter
│       ├── diff/           # JSON diff payload
│       └── service/        # 60Hz read / 30Hz emit + Subscribe
├── pkg/models/             # tipos unificados
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

## Wails overlay (Fase 3)

```bash
pnpm --dir frontend install
pnpm --dir frontend test           # vitest: wire format + diff merge
pnpm --dir frontend build
go run ./cmd/vantare              # mock telemetry
go run ./cmd/vantare -live        # LMU must be running
```

## Próximos pasos

1. ~~Offsets generados desde Python~~ → `python tools/generate-lmu-offsets.py`
2. ~~Fixtures binarios + tests (`testdata/lmu-fixture.bin`)~~ → ver `testdata/README.md`
3. ~~Normalizer + deadband en pipeline (Fase 2)~~ ✅
4. ~~Wails v3 + ventana overlay (Fase 3)~~ ✅
