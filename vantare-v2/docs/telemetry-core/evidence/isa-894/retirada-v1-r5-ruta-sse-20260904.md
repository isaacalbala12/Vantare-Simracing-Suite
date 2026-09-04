# ISA-894 · R5 retirada de la ruta SSE publica Overlay V1

Fecha: 2026-09-04.

## Alcance

Base R4: `d9893379a0c19e2d39307aef957eafe3466c17b3`.

R5 retira exclusivamente la entrada HTTP publica
`GET /telemetry/overlay/projection`, su campo
`ServerConfig.OverlayProjection` y el cableado desde `cmd/vantare/main.go`.
El harness deja de publicar y capturar Overlay V1 por SSE, pero conserva
Strategy por Wails/SSE, Overlay V2 por SSE/pull, Engineer y el cierre de
recursos.

R5 no retira el productor, Hub, flag, persistencia, metricas, tipos ni
fixtures V1 internos. Tampoco modifica Strategy V1, Overlay V2 o los helpers
genericos `Hub`, `SSEHandler` y `ProjectionRoute`. Esos limites quedan
para R6a/R6b y R7.

## TDD

RED:

```text
go test ./internal/server/ -run 'TestServerOverlayProjectionRouteRetired' -count=1 -v -timeout 60s
telemetry_projection_test.go:51: overlay V1 route still registered: SSE opened with body
"event: telemetry:overlay:status\ndata: {...}\n\n", want HTTP 404
--- FAIL: TestServerOverlayProjectionRouteRetired
FAIL
```

El primer intento con `httptest.ResponseRecorder` plano no terminaba porque
la ruta R4 era un stream SSE. Se sustituyo por writer/contexto cancelable para
obtener un RED acotado en 0,04 s antes de cambiar produccion.

GREEN:

- `go test ./internal/server -count=1`: PASS.
- `go test ./cmd/vantare -run '^TestTelemetryLifecycleHarness$' -count=1 -v`:
  PASS; lifecycle, Strategy, V2 y shutdown conservados.
- `go test ./internal/server ./cmd/vantare -count=1`: PASS.
- `go test ./... -count=1`: PASS completo.
- `go vet ./internal/server ./cmd/vantare`: PASS.
- `go vet ./...`: FAIL solo por tres avisos heredados fuera del diff:
  `internal/app/launcher/icon_windows.go:553`,
  `internal/telemetry/drivers/lmu/reader_windows.go:85` y
  `internal/telemetry/drivers/lmu/version_windows.go:433`, todos por posible
  uso incorrecto de `unsafe.Pointer`.
- `pnpm --dir frontend build`: PASS. Se genero `frontend/dist` antes de
  compilar los paquetes Go que lo embeben; permanece el aviso heredado de
  chunks superiores a 500 kB.
- `gofmt` y `git diff --check`: PASS.

No se abrieron Vantare, LMU, navegadores ni herramientas de medida. Este corte
no prueba comportamiento fisico ni rendimiento.

## Revision independiente

Revision de especificacion Muse Spark 1.3 Contributor xhigh,
`ses_f9646e4bfffe3U670drv4bDWWB`, sobre
`cd5b33c378b3ecbe85fad6ecb5e6329fccf05017`: **APPROVE**,
P0/P1/P2 = 0. Verifico el diff literal, 404, aislamiento Strategy/V2,
lifecycle, permanencia del interior V1 y ausencia de cambios fuera de alcance.

La revision de calidad se ejecuta sobre el SHA final que incluya esta
evidencia, handoff y roadmap.

## Estado

Rama `vantareapp/isa-894-retirada-v1-r5`, apilada sobre R4. Sin merge,
promocion, release ni retirada fisica total de V1. Rollback exclusivamente por
la build anterior verificada en R0.
