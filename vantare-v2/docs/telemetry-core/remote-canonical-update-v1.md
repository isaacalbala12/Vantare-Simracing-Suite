# `RemoteCanonicalUpdateV1`

Estado: contrato wire V1 implementado y probado de forma aislada en ISA-876.
No existe listener, transporte, pairing, cliente Mac ni wiring productivo.

## Frontera

`Project` recibe exclusivamente un
`envelope.Snapshot[derive.FinalState]` posterior al commit aceptado de
`TelemetryEngine.Apply`. Construye un DTO nuevo con allowlist cerrada; nunca
serializa `FinalState`, raw, facts, histories ni tipos internos completos.

```text
EngineResult.State post-commit
          |
          v
remote/v1.Project -> RemoteCanonicalUpdateV1 -> Encode / Decode
```

El paquete vive en `internal/telemetry/projection/remote/v1`. Un guard recorre
todos los `.go` productivos del repositorio, fuera del propio paquete, y
rechaza cualquier import de remote V1. Toda capacidad Windows → Mac sigue no
disponible.

## Envelope

| JSON | Valor V1 | Autoridad y regla |
|---|---:|---|
| `version` | `1` | Versión wire exacta; cualquier otra falla cerrada. |
| `kind` | `full` | Todos los mensajes son snapshots autosuficientes; no hay deltas. |
| `canonicalVersion` | `1` | Versión de la entrada canónica aceptada. |
| `streamEpoch` | `Header.Cursor.Epoch` | No cero; separa reinicios del stream. |
| `revision` | `Header.Cursor.Sequence` | No cero y monotónica dentro del epoch; puede saltar. |
| `sessionId` | `Header.Identity.Session` | Identidad de sesión requerida y no vacía. |
| `capturedAt` | `Header.Clock.ReceivedUTC` | RFC3339 UTC para diagnóstico; nunca decide liveness. |
| `session` | objeto | Slice allowlisted de sesión. |
| `player` | objeto | Slice allowlisted del jugador; no contiene history. |
| `vehicles` | array | Grid completo, máximo 104 identidades únicas. |

## Calidad compacta

Cada valor telemétrico usa `{"q": quality, "v": value?}`. Las qualities
cerradas son `fresh`, `stale`, `missing` e `invalid`.

- `fresh` y `stale` exigen `v`; por eso un cero fresco se serializa como
  `{"q":"fresh","v":0}`.
- `missing` e `invalid` prohíben `v`.
- Ninguna ausencia se infiere desde el zero-value de Go.

## Allowlist

### Sesión

| JSON | Fuente canónica | Unidad/validación |
|---|---|---|
| `track` | `Observed.TrackName` | Texto no vacío cuando está presente. |
| `type` | `Observed.SessionType` | `practice`, `qualifying`, `race`, `warmup` o `endurance`. |
| `remainingSeconds` | `Derived.SessionRemaining` | Segundos finitos, no negativos. |
| `maximumLaps` | `Observed.MaximumLaps` | Entero no negativo; cero sigue siendo válido. |

### Jugador

| JSON | Fuente canónica | Unidad/validación |
|---|---|---|
| `vehicleId` | `Header.Identity.Vehicle` | Vacío únicamente cuando no hay jugador. |
| `speedMps`, `rpm`, `gear` | Vehículo del jugador | m/s y RPM finitos/no negativos; marcha conserva su signo. |
| `throttle`, `brake`, `clutch` | Vehículo del jugador | Ratios finitos en `[0,1]`. |
| `lapNumber`, `completedLaps`, `sector`, `lapDistanceMeters` | Vehículo del jugador | Conteos/distancia no negativos; sector `1..3`. |
| `inPit`, `pitStopCount` | Vehículo del jugador | Boolean observado y conteo no negativo. |
| `fuelRemainingLiters`, `fuelCapacityLiters` | `Observed.Vehicle.Fuel` | Litros finitos; capacidad positiva. |
| `fuelPerLapLiters` | `Derived.Fuel.PerLap` | Litros/vuelta finitos y positivos. |
| `deltaSeconds`, `deltaReference` | `Derived.Delta` | Delta finito; referencia V1 `best-completed-player-lap`. Sus qualities son independientes: la referencia puede seguir fresh con segundos missing/invalid. |
| `damage.dents` | `Observed.Vehicle.Damage.Dents` | Ocho severidades observadas. |
| `damage.overheating`, `damage.detached` | `Observed.Vehicle.Damage` | Booleanos observados. |
| `damage.wheelDetachedCount` | `Observed.Vehicle.Damage` | Conteo `0..4`. |

### Grid por vehículo

| JSON | Fuente canónica | Unidad/validación |
|---|---|---|
| `vehicleId` | `Vehicle.Identity.Vehicle` | Requerido y único en el mensaje. |
| `driverName`, `vehicleName`, `vehicleClass` | Vehículo observado | Texto no vacío cuando está presente. |
| `position`, `lapNumber`, `completedLaps`, `sector`, `lapDistanceMeters` | Vehículo observado | Posición positiva; conteos/distancia no negativos; sector `1..3`. |
| `inPit`, `penaltyCount` | Vehículo observado | Boolean y conteo no negativo. |
| `gapToLeaderSeconds`, `lapsBehindLeader` | Gaps observados | Valores finitos y no negativos. |
| `gapToNextSeconds`, `lapsBehindNext` | Gaps observados | Valores finitos y no negativos. |
| `gapToPlayerSeconds`, `lapDeltaToPlayer` | `Derived.Gaps` | Relativos con signo; los saltos de vuelta son válidos. |
| `groundPositionCm.{x,z}` | `Observed.WorldPosition.{X,Z}` | Metros cuantizados a centímetros `int32`; Y queda fuera. |

Todo lo no enumerado queda fuera de V1. Añadir un campo exige compatibilidad
explícita o una V2 y sus pruebas.

## Codec y límites

- JSON de librería estándar, sin dependencia adicional.
- `Encode` valida antes de serializar y `Decode` valida después de decodificar.
- Ambos aplican el mismo límite inclusivo de `131072` bytes (128 KiB).
- Un preflight por tokens rechaza cualquier `null`, claves duplicadas en todos
  los objetos y tags con nombre o casing distinto del vocabulario V1 exacto.
- El decode tipado conserva `DisallowUnknownFields` para validar el contexto;
  acepta un único valor JSON y rechaza trailing values, truncado, campos
  obligatorios ausentes y números no finitos.
- No hay truncado parcial: un payload excesivo devuelve `ErrPayloadTooLarge`.
- El máximo V1 son 104 vehículos; IDs duplicados o un jugador ausente del grid
  fallan cerrados.

Los goldens legibles están en `testdata/active.golden.json` y
`testdata/minimal.golden.json`. El primero cubre sesión activa, ceros frescos,
stale y grid; el segundo demuestra una sesión identificada con todos los datos
telemétricos missing.

## Continuidad y liveness

`Receiver` retiene únicamente `initialized`, epoch, revisión, `sessionId` y
`receivedAt`:

- el primer mensaje debe ser un full V1 válido;
- dentro del mismo epoch acepta revisiones mayores, incluidos gaps;
- dentro del mismo epoch exige el mismo `sessionId`; un cambio devuelve
  `ErrSessionChangedWithinEpoch`;
- rechaza duplicados y retrocesos;
- un epoch mayor reinicia la comparación y acepta un full válido con una
  sesión distinta y revisión mayor que uno, porque latest-wins puede haber
  descartado los full anteriores;
- rechaza epochs anteriores;
- `receivedAt` procede del reloj monotónico local del caller y no puede
  retroceder;
- `Live`/`Stale` compara `now` con `receivedAt`; `capturedAt` no participa;
- si `now` es anterior a `receivedAt`, falla seguro como `Waiting` porque la
  edad local no puede considerarse válida.

No existe goroutine, temporizador global ni snapshot retenido en este receptor
de referencia.

## Medición local

Medición orientativa del 2026-08-27 con Go 1.25.0, `darwin/arm64`, Apple M5.
Incluye validación; no mide red, framing, cadencia, UI ni WebView.

| Vehículos | Payload | Project + Encode | Decode |
|---:|---:|---:|---:|
| 1 | 1.871 B | 4,527 µs/op | 15,127 µs/op |
| 44 | 33.345 B | 85,681 µs/op | 258,233 µs/op |
| 104 | 77.667 B | 202,242 µs/op | 594,629 µs/op |

El caso de 104 vehículos consume el 59,3 % del límite y deja 53.405 bytes de
margen. Estas cifras fijan el coste del contrato aislado; no prometen todavía
rendimiento de transporte.

## Rollback y verificación manual

Retirar el paquete y este documento revierte completamente ISA-876 porque no
hay wiring. Para inspección manual, abrir ambos goldens y comprobar versión,
epoch/revisión, full autosuficiente, `QValue`, allowlist y ausencia de raw,
facts, histories o campos persistidos.
