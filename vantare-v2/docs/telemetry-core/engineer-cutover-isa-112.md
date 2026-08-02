# ISA-112 / TC-08E — cutover canónico de Engineer y Spotter

Fecha: 2026-08-01. Estado: implementación aislada, sin merge ni promoción.

## Resultado

La raíz de composición conecta `EngineerService` al único
`TelemetryCoreRuntime`. El lote aceptado por el reducer produce dos salidas
independientes:

```text
LMU Driver (una apertura de LMU_Data + REST complementario)
  -> BatchMapper -> Reducer -> SessionCoordinator -> Derive
     |-> Overlay Projection v1 -> Wails/SSE
     `-> Engineer Observation v1 + facts -> EngineerService
```

Engineer no recibe el driver, el mapping, el estado canónico mutable ni un
frame genérico. El composition root inyecta un consumidor de tres contratos
de producto: estado de fuente, observación completa y hechos ordenados.

## Disponibilidad y fallos

- `live` y `degraded` permiten aceptar una observación, pero no declaran por sí
  solos que Engineer está conectado;
- `stale`, `error`, `stopping`, `stopped`, `detecting` y `connecting`
  desconectan Engineer y cancelan transiciones pendientes;
- una reconexión solo se completa después de un snapshot usable;
- un snapshot que no alimenta ninguna familia aprobada falla cerrado;
- errores de proyección o consumo Engineer quedan en un diagnóstico separado y
  no detienen LMU ni la publicación Overlay;
- se retiró del bridge Wails el selector productivo de fuente. Simulator y
  replay siguen disponibles únicamente mediante harness explícito.

## Capabilities y módulos preservados

El manifiesto declara las siete familias que el core puede transportar:
sesión, standings, controles, pit, fuel, gaps y spatial. Declarar soporte no
convierte un campo ausente en valor: cada monitor exige además presencia,
freshness y su conjunto mínimo de señales.

Se preservan los 30/30 directorios inventariados en ISA-108. El cutover activa
solo Spotter normal, fuel, contador genérico de sanciones, laps, timings y
entrada/salida de pit, exactamente las seis familias aprobadas en ISA-110.
Engine, tyres, flags, driver swaps, damage y conditions siguen deshabilitados;
las familias parciales no reciben un frame.

## Evidencia LMU real

El test `TestSingleLMU14RuntimeFeedsEngineerAndKeepsDistantTrafficSilent`
recorre el driver real con la captura sanitizada LMU 1.4 de pista, SHA-256
`c2e005362419f1db33df96aab70e9e0d56b627ce4aee02d11b8b9ea49707b0e5`.
Demuestra:

- exactamente una apertura de `LMU_Data`;
- 38 vehículos y jugador presente a través de parse, fusión, mapper, reducer,
  coordinator, derive y Engineer Projection;
- `EngineerService` conectado únicamente a `telemetry-core`;
- silencio de Spotter ante rivales fuera de su ventana de proximidad, evitando
  convertir la mera presencia de tráfico en un falso positivo.

Las secuencias reales hash-pinned de pit y reconexión permanecen cubiertas por
el harness LMU de TC-07A.1. La respuesta audible/perceptual con un rival
realmente solapado no existe en las capturas sanitizadas actuales y queda como
gate manual agrupado del módulo, no se sustituye por una escena sintética.

## Verificación

- regresiones de runtime, proyección, servicio y driver repetidas x20: PASS;
- suite Engineer y Telemetry Core: PASS;
- suite Go global serial: PASS;
- frontend: 299 archivos y 2.025 tests PASS; build PASS;
- `go build ./cmd/vantare`: PASS;
- `go vet` de los paquetes tocados: PASS. El driver LMU conserva dos avisos
  Win32 heredados por `unsafe.Pointer`, sin cambios en este corte;
- `go test -race`: no disponible en el host con CGO desactivado;
- `git diff --check`: PASS.

La repetición x20 de todo `internal/app` reprodujo el P3 heredado de Windows
en `TestConcurrentSavesDontCorruptFile` por contención de
`app-settings.json.tmp`. La suite global serial y las regresiones focales x20
pasan; ISA-112 no modifica Settings.

## Rollback y siguiente corte

Rollback: volver a ISA-111
`905ad1e2306bc3e8e2b2d5de824c7a35268f3829`.

ISA-113 / TC-09A debe auditar todos los consumidores alcanzables antes de
retirar backend legacy. No se borra código histórico durante ISA-112.
