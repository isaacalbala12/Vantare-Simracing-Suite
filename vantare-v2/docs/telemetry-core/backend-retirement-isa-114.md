# ISA-114 / TC-09B — retirada del backend duplicado

Fecha: 2026-08-01. Base: ISA-113
`2b33177e1abe5d159a9de14c3b52d9bfec58c947`.

## Resultado

El proceso productivo tiene un único owner de adquisición LMU:
`internal/telemetry/drivers/lmu`. El composition root ya no crea `app.App`,
`TelemetrySourceManager`, el reader de memoria compartida legacy ni su poller
REST de 250 ms. Overlay y Engineer continúan recibiendo las proyecciones del
runtime canónico introducido en TC-07/08.

No se ha cambiado UI, estilos, contrato Overlay Projection v1 ni funcionalidad
activa del Engineer. Tampoco existe un fallback mock productivo.

## Migración antes de borrar

- El estado cerrado de fuente vive ahora en `driver.SourceStatus` y se obtiene
  del `TelemetryCoreRuntime` real.
- Hub/Studio, diagnostics, métricas y el log inicial leen ese mismo snapshot.
- Abrir un overlay ya no intenta arrancar una segunda fuente: el runtime
  canónico posee detección y reconexión.
- `deltaMode` sigue persistido como preferencia, pero se eliminó su side effect
  sobre un motor legacy que ya no alimentaba al producto. Su wiring futuro
  pertenece al dueño del Delta, no a este corte de retirada.
- El endpoint SSE de telemetría legacy del backend fue retirado. La limpieza de
  sus adapters TypeScript y nombres de eventos queda acotada a ISA-115.

## Código retirado

Se eliminaron los paquetes backend que ISA-113 demostró sin valor productivo:

- `internal/telemetry/{service,lmu,lmuapi,normalizer,fusion,gap,diff,pipeline,delta}`;
- el contrato duplicado de `pkg/models`;
- `internal/app/App`, source manager, enriched source, bridge y testhooks;
- las CLIs legacy `lmu-test`, `lmu-dump` y `lmu-debug`;
- el SSE `/telemetry/stream` del servidor;
- los adapters y selector de fuente muertos del Engineer.

Las fixtures canónicas, recordings, replays y harnesses siguen intactos.
`cmd/spotter-debug` conserva únicamente simulator/replay explícitos y nunca es
dependencia de `cmd/vantare`.

## Engineer preservado sin una segunda adquisición

La lógica de monitores, audio/TTS, comandos, Pit Manager, store y SSE se
conserva. Los readers de memoria compartida experimentales Extended, PitInfo y
Wheel y el parser base paralelo fueron retirados porque no tenían una instancia
productiva y sus capabilities estaban disabled en ISA-108/110.

Los dos monitores que caracterizan datos Extended conservan un decoder puro de
buffer para fixtures explícitas. Ese decoder no puede abrir memoria compartida,
REST, procesos, puertos ni goroutines.

## Evidencia reproducible

`scripts/telemetry-core/audit-consumers.ps1` informa imports productivos y
referencias de adquisición. Después de la retirada:

- todos los paquetes del backend legacy tienen cero importadores y cero Go;
- `OpenFileMappingW` y `MapViewOfFile` aparecen únicamente en
  `internal/telemetry/drivers/lmu/reader_windows.go`;
- `ParseEngineerFrame` y el mapping legacy del Engineer tienen cero referencias
  productivas;
- simulator/replay del Engineer solo son alcanzables desde
  `cmd/spotter-debug`, nunca desde `cmd/vantare`.

`TestRetiredTelemetryBackendStaysRemoved` y
`TestLMULiveAcquisitionExistsOnlyInCanonicalDriver` convierten estas reglas en
guardias de arquitectura.

## Checks

- `go test ./... -count=1`: PASS en ejecución aislada.
- Telemetry Core, Engineer, app, ops, server y ambos comandos focales: PASS.
- guardias de retirada y adquisición única x20: PASS.
- frontend: 299 archivos y 2.025 tests PASS.
- build frontend: PASS; conserva únicamente el warning heredado de chunk.
- `go vet` focal de todos los paquetes modificados: PASS.
- auditoría de consumidores y `git diff --check`: PASS.

Una primera suite global ejecutada al mismo tiempo que frontend/build/vet
reprodujo la contención Windows heredada de
`TestConcurrentSavesDontCorruptFile` sobre `app-settings.json.tmp`. El test
pasó x3 aislado tanto en la base ISA-113 como en ISA-114 y la suite global
aislada terminó verde. No se modifica esa deuda ajena al corte.

## Riesgos restantes

- ISA-115 debe retirar `telemetry:update`, `normalizeLegacyTelemetry`, los
  adapters Wails/SSE antiguos y renombrar el transporte canónico `shadow` sin
  tocar UI.
- `deltaMode` no controla todavía el Delta canónico; se conserva honestamente
  como preferencia pendiente, sin fingir wiring.
- El gate de lifecycle interno y ausencia de handles/goroutines pertenece a
  ISA-87.
- El soak y LMU real conjunto pertenecen a ISA-116/117.

## Rollback

El corte no migra datos ni cambia schemas persistidos. Revertir el commit de
ISA-114 restaura el grafo anterior completo. No se ha hecho merge ni promoción.
