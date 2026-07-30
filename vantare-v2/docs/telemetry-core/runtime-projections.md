# TC-05A — Proyecciones versionadas por producto

Fecha: 2026-07-28. Alcance: contratos Go puros, sin wiring productivo.

## Frontera

Telemetry Core no entrega `core.ObservedState`, headers internos ni raw a los
productos. Cada consumidor recibe su contrato bajo
`internal/telemetry/projection/<producto>`.

```text
core snapshot -> derive final snapshot
  -> proyección pura v1
    -> Overlay | Engineer | Strategy | Analysis
      -> transporte en ISA-40
```

Los cuatro `ProjectorV1` consumen `derive.FinalState`, el snapshot canónico
final. La frontera aprobada es `core -> derive -> projection`; el guard permite
esa única dirección y sigue rechazando el import inverso.

El projector conserva `epoch`, `sequence` y `capturedAt`, pero omite `Source`,
clock monotónico, identidad interna completa y estado privado del reducer.
`capturedAt` siempre se serializa en UTC.

## Versiones independientes

- `CanonicalVersionV1`: forma del input canónico que entiende la proyección.
- `VersionV1` de cada producto: forma JSON de ese producto.
- `RecordingVersionV1`: reserva el primer formato histórico para TC-06; no se
  incluye en envelopes live ni lo implementa este corte.

Un cambio canónico no obliga a cambiar la versión de todas las proyecciones. Un
cambio de recording tampoco altera live. ISA-40 añade semántica de transporte
(`full/delta`, `statusRevision` y resync) alrededor de estos payloads mediante
constructors tipados por producto; no duplica sus campos ni serializa el
snapshot canónico. Véase `docs/telemetry-core/projection-transport.md`.

## Evolución

- **Aditivo en la misma major:** campo opcional nuevo, capability nueva o valor
  enum nuevo que el decoder pueda ignorar con seguridad.
- **Breaking:** renombrar/eliminar un campo, cambiar unidad/tipo/significado o
  reinterpretar presencia. Requiere nueva versión de la proyección.
- Cada consumidor declara `Current` y `MinimumSupported` mediante
  `VersionPolicy`. Versiones futuras, cero o retiradas se rechazan.
- Una versión anterior admitida es `Deprecated`; primero se publica el decoder
  sucesor y fixtures, después se anuncia retirada, y solo un corte posterior
  eleva `MinimumSupported`.
- IDs y significados no se reutilizan. Un campo retired no reaparece con otra
  semántica.

Los cuatro golden JSON v1 fijan compatibilidad. Un guard adicional rechaza
leakage de claves raw/canonical/internal.

## Presencia, calidad y capabilities

Cada `Field` publica siempre:

- `present`, independiente de `value`;
- `provenance`: `unknown`, `observed`, `derived` o `estimated`;
- `freshness`: `missing`, `fresh`, `stale` o `invalid`.

Por tanto `0`, `false` y `""` pueden seguir siendo observaciones válidas.
`missing`, `stale` e `invalid` no se convierten en valores inventados.

Las capabilities son listas ordenadas, de cardinalidad pequeña y específicas
del producto. Una capability aparece cuando al menos una señal correspondiente
está presente y no es inválida; `stale` sigue visible como dato degradado. Una
lista vacía se serializa como `[]`, no `null`.

## Contratos v1

- **Overlay:** sesión, standings, controles y pit para todos los vehículos
  observados, más `controls.history` derivado para el trace de pedales. No
  contiene layout, ViewModels ni renderer.
- **Engineer:** sesión y estado observado del vehículo activo, más hechos
  ordenados de sesión/lap/pit/driver/conexión. No contiene frases, prioridades,
  Strategy ni decisiones. Un hecho desconocido se rechaza.
- **Strategy:** contrato compile-only con sesión, progreso y pit del jugador.
  Fuel, Virtual Energy, ruedas y clima no aparecen hasta existir señales
  canónicas demostradas.
- **Analysis:** contrato compile-only live con sesión, vuelta y controles del
  jugador. Archivos históricos y recording pertenecen a TC-06 y al proyecto
  Telemetry Analysis.

El trabajo paralelo ENG-02 debe adaptar su `EngineerProjection` a
`projection/engineer` v1. No debe crear otro envelope/versionado ni importar
drivers. El agregado de disponibilidad del payload TC-05A se llama
`CapabilityGroup`; `Capability`, `CapabilityID`, `State` y `Manifest` quedan
libres para el manifiesto específico auditado por ENG-02. Campos adicionales
requieren evidencia canónica y evolución aditiva.

ENG-03 debe apilar primero ISA-39 y después ENG-02. Su gate de integración
incluye compilar `internal/telemetry/projection/engineer`, ejecutar ambos
fixtures contractuales y confirmar que el adapter Engineer usa
`ProjectorV1`/`PayloadV1` sin crear un segundo `Metadata`, `VersionPolicy` o
envelope. Una colisión nominal o dos versiones del mismo campo bloquean el
cutover.

## Verificación

```powershell
go test ./internal/telemetry/projection/... -count=20
go test ./internal/telemetry/... -count=1
go test ./internal/telemetry/... -run 'TestTelemetryProductionImportsFollowADR0004|TestValidateImport|TestScanProductionImportsIgnoresTestsGeneratedFilesAndTools' -count=1
go test ./... -count=1
git diff --check
```

No hay UI, transporte, I/O, goroutines o lifecycle nuevos; no corresponde
Playwright ni prueba LMU real en este corte. La comprobación manual es revisar
los cuatro golden y confirmar que exponen únicamente el payload del producto.

Rollback: revertir ISA-39. Al no existir wiring ni persistencia, no hay
migración de datos.

Evidencia de este worktree:

- proyecciones x20, Telemetry Core completo, guard ADR 0004, vet focal,
  frontend build y race focal x5 con GCC UCRT64: PASS;
- la suite global habilitada tras generar `frontend/dist` conserva el fallo
  Windows conocido de `TestConcurrentSavesDontCorruptFile`;
- una pasada global intermedia bajo carga hizo fallar una vez el teardown REST
  LMU `TestDriverDoesNotPublishOrMutateRESTAfterCancellation`; la suite
  Telemetry final y el test aislado x20 pasan, y el driver no forma parte del
  cambio;
- `git diff --check` y el chequeo de whitespace de archivos nuevos: PASS.
