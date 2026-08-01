# TC-07B — Shadow Wails/SSE

## Objetivo

Observar en paralelo la proyección Overlay v1 generada por Telemetry Core en
Studio, Desktop y OBS, manteniendo el transporte legacy como única autoridad
visible hasta el cutover de TC-07C.

## Flujo implementado

`LMU Driver -> BatchMapper -> Reducer -> SessionCoordinator -> Derive -> Overlay Projection v1 -> Hub`

El mismo `Hub` emite envelopes JSON idénticos mediante:

- Wails: `telemetry:overlay:status` y `telemetry:overlay:projection`.
- SSE local: `GET /telemetry/overlay/projection`.

El frontend usa un observer independiente. Decodifica y adapta la proyección,
pero conserva únicamente estado, epoch, sequence y resultado sanitizado. No
publica `TelemetrySnapshot`, no conoce documentos y no modifica canvas,
renderizadores, layouts ni dirty state.

## Autoridad durante el shadow

- `telemetry:update` y `/telemetry/stream` continúan alimentando el render.
- La proyección canónica solo se compara/observa.
- Un fallo del shadow no detiene el adapter legacy.
- Menú o identidad de sesión ausente producen estado sin snapshot, nunca mock.
- `-live=false` no abre LMU y publica `stopped`.

## Lifecycle

El composition root crea un único runtime shadow y un único hub. El runtime
posee sus goroutines, contexto, DriverManager y mapping LMU; el cierre de la
aplicación cancela el driver, cierra el hub y espera el teardown. El handler SSE
hereda la cancelación de cada request y solo acepta loopback.

## Verificación

- Tests Go del lifecycle disabled/idempotente y ruta SSE canónica.
- Tests TypeScript de paridad Wails/SSE, estado sin sesión y fail-open.
- Suite frontend completa y build.
- Harness Playwright que ejecuta los adapters de Studio, Desktop y OBS y
  demuestra cero escrituras a la autoridad de render.
- El visual runner conserva Original en 0 % y reproduce el baseline Crystal
  Studio heredado al 100 %. El benchmark de drag reproduce los umbrales
  heredados fuera de alcance. No se regeneran baselines ni se cambian límites.

## Fuera de alcance

- Cutover de Overlay.
- Cambios de ViewModels, CSS, widgets, canvas o documentos.
- Eliminación de transports/readers legacy.
- Engineer/Spotter.
