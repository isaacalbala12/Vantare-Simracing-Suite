# ENG-03 — adaptación del payload Engineer sobre TC-05A

Fecha: 2026-07-29. Alcance: integración y lógica pura, sin wiring productivo.

## Composición de ramas

La rama de ISA-127 parte de TC-05A (`efcc77c`) e integra mediante merge real
ENG-02 (`df0c202`). El merge local `b5d69e7` conserva la investigación ENG-01,
ADR 0005, el contrato ENG-02 y el contrato transversal TC-05A. El único
conflicto fue `docs/current-plan.md`; se resolvió conservando las notas de
ambas líneas, no eligiendo un lado completo.

## Frontera resultante

```text
derive.FinalState
  -> TC-05A engineer.ProjectorV1
     -> TC-05A PayloadV1 + Metadata v1
        -> ENG-03 adaptProjectedV1
           -> ENG-02 ObservationSnapshotV1
              (Metadata TC-05A + ObservationV1)
              Context + Manifest + Field
```

- `projection.Metadata`, `VersionPolicy`, `PayloadV1` y el envelope canónico
  siguen siendo autoridad exclusiva de TC-05A.
- `ObservationSnapshotV1` reutiliza exactamente el `Metadata` de TC-05A.
  `Context`, `Manifest`, `Field` y `ObservationV1` forman la superficie
  in-process de Engineer.
- `ProjectObservationV1` es una entrada de productor. El consumidor recibe
  `ObservationSnapshotV1` y no necesita importar `schema`, `core`, `derive` o
  `envelope`.
- No existe un segundo contador de secuencia, versión, reloj o envelope.
- No existe wiring a monitores, servicio legacy, Wails/SSE, audio o UI.

## Capabilities v1

El adaptador reconoce únicamente cuatro grupos ya demostrados por TC-05A:

| Capability | Señales actuales |
|---|---|
| `session` | nombre de pista y tipo de sesión |
| `standings` | vuelta, posición y vueltas completadas |
| `controls` | marcha, RPM, velocidad, acelerador, freno y embrague |
| `pit` | estado de pit y número de paradas |

La lista `PayloadV1.Capabilities` expresa disponibilidad en ese snapshot. El
`Manifest` expresa la decisión del producto:

- `Unknown`: solo puede acompañar campos missing;
- `Supported`: un campo fresh puede ser utilizable;
- `Unsupported`: todos los campos del grupo quedan explícitamente
  unsupported y sin valor;
- `Degraded`: conserva calidad y valor, pero `Usable()` permanece `false`
  hasta que una regla tome una decisión expresa.

El adaptador recalcula la disponibilidad desde los campos y exige que coincida
exactamente con la lista transversal. Grupos duplicados, desconocidos,
desordenados, capabilities desconocidas con valor, unsupported con valor o
identidad de vehículo incoherente fallan cerrados.

## Calidad y ownership

- Un cero fresh conserva `present=true` y puede ser usable.
- Missing, stale, invalid y unsupported siguen separados.
- Provenance observed, derived y estimated se preserva.
- Los tipos de dominio canónico se convierten a primitivas propias de
  Engineer en el límite.
- El `Manifest` mantiene ownership defensivo; `ObservationV1` no expone slices
  mutables.
- La secuencia de snapshots no se interpreta como log: saltar de 5 a 999 en el
  mismo epoch e identidad sigue siendo `BoundaryContinuous`.
- Epoch regresivo/cero e identidades incoherentes fallan cerrados. Un reset o
  cambio real de evento, sesión, coche, equipo o piloto conserva la semántica
  de cancelación de ADR 0005.

## Pruebas

- Golden local:
  `internal/telemetry/projection/engineer/testdata/engineer_observation_v1.golden.txt`.
- Golden JSON transversal TC-05A:
  `internal/telemetry/projection/engineer/testdata/engineer_v1.golden.json`.
- Contratos: cero, missing, stale, invalid, unsupported, degraded, ownership,
  contradicciones, identidad y latest-wins.
- Superficie externa:
  `consumer_test.go` usa únicamente tipos de
  `internal/telemetry/projection/engineer`.

## No incluido

- Wiring o migración de los 34 consumidores legacy.
- Monitores, Spotter, policy, scheduler o mensajes.
- Audio, TTS/STT, voz, Pit Manager, UI o Radio Crystal.
- I/O, persistencia, transporte, dependencias o goroutines.

El siguiente corte de Engineer podrá caracterizar una familia de monitores
contra `ObservationV1`. La retirada del frame legacy solo puede comenzar tras
replay parity, wiring canónico y consumidores cero.

## Evidencia de esta rama

- `go test ./internal/telemetry/projection/engineer -count=20`: PASS.
- `go test ./internal/telemetry/projection/... -count=1`: PASS.
- `go test ./internal/engineer/... -count=1`: 31 paquetes PASS.
- `go vet ./internal/telemetry/projection/engineer`: PASS.
- `go test -race ./internal/telemetry/projection/engineer -count=10`: PASS
  con GCC UCRT64 configurado solo para el proceso.
- `pnpm --dir frontend build`: PASS; conserva el warning conocido de chunk.
- `go test ./... -count=1`: todos los paquetes salvo la contención Windows
  heredada de `TestConcurrentSavesDontCorruptFile`; ningún paquete del diff
  falla.
- Una pasada final de `go test ./internal/telemetry/... -count=1` expuso la
  intermitencia heredada
  `TestDriverDoesNotPublishOrMutateRESTAfterCancellation`; el test aislado
  `-count=20` pasa y `drivers/lmu` no forma parte del cambio.
