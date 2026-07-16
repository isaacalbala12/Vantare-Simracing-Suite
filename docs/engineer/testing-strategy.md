# Estrategia de Testing — Vantare Ingeniero Go

> **Estado:** activo. Revisado 2026-06-27 (paths corregidos).
> **Adaptado de:** Vantare Ingeniero Go original
> (`docs/testing-strategy.md`).

Este documento explica cómo demostrar que los cambios son seguros sin
esperar que el usuario lea diffs grandes de código.

## Checks principales

Tests Go:

```powershell
go test ./...
```

Checks enfocados de spotter:

```powershell
go test ./internal/engineer/spotter -v
go test ./internal/engineer/spotter ./internal/engineer/simulator ./internal/engineer/core ./internal/engineer/replay -v
```

> **CORRECCIÓN 2026-06-27:** los paths correctos en el worktree son
> `internal/engineer/{spotter,simulator,core,replay}/`, no
> `internal/{spotter,simulator,core,sim/lmu}/`. Estos últimos no
> existen.

Wrapper de Task, si `task` está instalado:

```powershell
task test
```

Si `task` no está instalado, usa:

```powershell
go test ./...
```

Debug LMU:

```powershell
go run ./cmd/lmu-debug -mock -once
go run ./cmd/lmu-debug -hz 5
```

Build frontend:

```powershell
cd frontend
npm run build
```

Actualmente `npm test` en frontend es un placeholder que imprime
`no tests`.

## Qué necesita tests

Todo cambio de comportamiento necesita tests. Ejemplos:

- Clasificación del spotter
- Ventanas de overlap
- Transiciones clear / all-clear
- Expiración en cola de audio
- Parsing de replay
- Carga de config
- Cambios en parser de telemetría
- `ActiveSides` y `ClassifyWithActiveSides`
- `ValidityRule` y `Runtime.IsMessageStillValid`
- `clearDelayMS`, `pendingClearAt`, cancel de stale

Todo bugfix necesita un test de regresión que falle antes del fix y
pase después.

## Política de testing del spotter

La lógica del spotter debe probarse en este orden:

1. **Tests unitarios de geometría pura** (`alignment_test.go`,
   `overlap_test.go`, `geometry_test.go`).
2. **Tests de state machine** (`state_test.go`,
   `machine_active_sides_test.go`).
3. **Tests con fixtures replay** (`replay_test.go`).
4. **Validación live con debug LMU** (`cmd/lmu-debug` + manual).

No ajustar thresholds por intuición. Usar trazas o fixtures.

## Fixtures replay

> **CORRECCIÓN 2026-06-27 (pase editorial):** los datos replay viven
> en `internal/engineer/replay/testdata/`. **No** en
> `internal/replay/testdata/` ni en `internal/spotter/testdata/replay/`;
> esos paths no existen en el worktree.

Path canónico de fixtures:

```
internal/engineer/replay/testdata/
```

Tipos útiles de fixture (a crear en prealpha, ver `current-plan.md`
§ 6 Tarea 4):

- `spotter-left-basic.jsonl`
- `spotter-right-basic.jsonl`
- `spotter-three-wide.jsonl`
- `spotter-all-clear.jsonl`
- (alpha 1) trazas reales convertidas desde JSONL exportado, una vez
  exista `cmd/spotter-debug -out <archivo>`.

Los fixtures los consume directamente el runner de tests del paquete
`internal/engineer/replay/`. **No** se invoca `cmd/replay-tool`: ese
binario no existe en este worktree.

## Si un test falla

El worker debe reportar:

- Comando exacto ejecutado.
- Nombre del test fallido.
- Resumen del error.
- Si parece relacionado con la tarea.
- Siguiente paso pequeño propuesto.

No ocultes fallos. No borres tests para pasar.

## Tests deterministas

Los tests no deben depender de `time.Sleep` salvo justificación. Usar:

- `time.Now().UnixMilli()` con offset fijo en fixtures.
- Inyección de tiempo en máquina de estados vía parámetro `nowMS`.
- Mock del reloj del sistema solo si es estrictamente necesario.

## Tests de regresión

Cada bug nuevo en [`testing/spotter-bug-log.md`](testing/spotter-bug-log.md)
debe quedar con al menos un test que falle **sin el fix** y pase **con
el fix**. Si el bug es de geometría, el test debe usar coordenadas que
reproduzcan el síntoma sin necesidad de LMU abierto.

## Cobertura de voice contract

Voice contract matriz VC-* tiene casos en
[`voice-contract.md`](voice-contract.md) § 9. Cada caso relevante debe
tener un test ejecutable en prealpha:

- VC-A01..A18 → `internal/audio/voice_contract_test.go`
- VC-P01..P07 → `internal/audio/voice_contract_ptt_test.go`
- VC-C01..C04 → `internal/audio/commentary_test.go`
- VC-Q01..Q11 → `internal/audio/queue_contract_test.go`
- VC-B01..B05 → `internal/audio/backend_emission_test.go`
- VC-R01..R04 → `scripts/release_smoke.go` +
  `frontend/__tests__/configMigration.voice.test.ts`

## Cobertura de matriz LMU-01..48

Cada LMU ID en [`vantare-go-master-plan.md`](vantare-go-master-plan.md)
§ 13 debe tener al menos un test que verifique el comportamiento Go
para los que apliquen a prealpha.

## Tests de concurrencia

- Race detector Go (`go test -race ./...`) en CI.
- Verificar que ningún test comparte estado mutable entre goroutines
  sin sincronización.

## Tests con fixtures externos

> **CORRECCIÓN 2026-06-27 (pase editorial):** esta sección sustituye
> las instrucciones previas que prometían
> `cmd/lmu-debug -jsonl` y `cmd/replay-tool`. Ninguno de los dos
> existe hoy en el worktree (`cmd/lmu-debug/main.go:24-27` solo define
> `-once -mock -hz`; `cmd/spotter-debug` y `cmd/replay-tool` son tarea
> pendiente). Por tanto, hasta que `cmd/spotter-debug` se implemente
> (ver `current-plan.md` § 6 Tarea 1), no se debe prometer captura
> JSONL desde CLI.

Procedimiento provisional mientras `cmd/spotter-debug` no exista:

1. Para generar JSONL en prealpha, invocar el helper
   `spotter.WriteDebugRecordsJSONL` desde un test Go contra
   `internal/engineer/spotter/testdata/*.jsonl` sintético.
2. Revisar manualmente al menos 3 frames consecutivos.
3. Validar formato con los tests de
   `internal/engineer/replay/` (lectura y parseo), por ejemplo:
   ```powershell
   go test ./internal/engineer/replay -v
   ```
4. Cuando exista `cmd/spotter-debug -out <archivo>`, sustituir los
   pasos 1-3 por captura real con LMU abierto y validación con el
   runner de tests de `internal/engineer/replay/`.
5. Mover el JSONL validado a
   `internal/engineer/replay/testdata/<nombre>.jsonl`.
6. Crear o extender un test que cargue y reproduzca la fixture.
7. Si el test falla, arreglar spotter hasta que pase con la traza.

> Recordatorio: el path correcto de fixtures en este worktree es
> `internal/engineer/replay/testdata/`. No usar
> `internal/replay/testdata/` ni
> `internal/spotter/testdata/replay/` (no existen).

## Regla de oro

Si dudas si necesitas test, la respuesta es sí.
