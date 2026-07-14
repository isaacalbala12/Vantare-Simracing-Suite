# Prealpha Next Steps — Vantare Ingeniero Go

> **Estado:** activo. Revisado 2026-06-27 (corregido tras auditoría
> 2026-06-27).
> **Objetivo:** cerrar la prealpha del spotter LMU antes de empezar
> alpha.
> **Estado real del worktree:** ver
> [`INDEX.md`](../INDEX.md) § 5.
> **Adaptado de:** Vantare Ingeniero Go original
> (`docs/product/prealpha-next-steps.md`).

## Objetivo inmediato

Cerrar el spotter como base fiable. Hasta que el spotter no sea estable
en LMU real, no conviene avanzar fuerte con ingeniero determinista, Pit
Manager o IA.

## Prioridad 1: Validación live del spotter

Hay que probar en LMU con coches reales alrededor y validar:

- Coche a la izquierda.
- Coche a la derecha.
- Coche en ambos lados.
- Libre izquierda.
- Libre derecha.
- Libre / all clear al salir de three-wide.
- Casos en recta.
- Casos en curva.
- Casos entrando/saliendo de boxes.
- Coches detrás golpeando o muy cerca, sin falso lateral.

Resultado esperado: los mensajes deben coincidir con posición real y
no deben parpadear.

## Prioridad 2: Diagnóstico live del clasificador

Agregar una herramienta o modo debug que imprima, para cada coche
candidato:

```
playerID
opponentID
playerPos
opponentPos
playerOri
leftAxisWorld
forwardAxisWorld
relative
lateralDot
trackDiff
pathLateralPlayer
pathLateralOpponent
sideDecision
reasonAcceptedOrRejected
```

Esto existe como helper en `internal/engineer/spotter/debug.go`
(`WriteDebugRecordsJSONL`) pero **no se invoca desde CLI**. Pendiente
en `current-plan.md` § 6 Tarea 1: crear `cmd/spotter-debug` que
use este helper.

> **CORRECCIÓN auditoría 2026-06-27:** la versión previa de este
> doc afirmaba que `cmd/lmu-debug -jsonl` exportaba el JSONL. El flag
> `-jsonl` no existe en `cmd/lmu-debug/main.go` (flags reales:
> `-once -mock -hz`).

Pendiente una vez creado `cmd/spotter-debug`:

- Confirmar que el JSONL incluye `lateralDot` y `trackDiff` para
  auditoría futura.

## Prioridad 3: Replay real desde LMU

El simulador sintético ya no es suficiente para validar el spotter.
Necesitamos grabar JSONL desde LMU real con:

- Frames completos relevantes.
- Vehículos cercanos.
- Posiciones.
- Orientaciones.
- LapDistance.
- PathLateral.
- Decisión del spotter si es posible.

Estos replays deben convertirse en fixtures bajo
`internal/engineer/replay/testdata/` (no `internal/spotter/testdata/replay/`,
que es el path citado en la versión previa y es incorrecto porque
el paquete vive en `internal/engineer/replay/`, no en
`internal/spotter/`) para tests reproducibles.

## Prioridad 4: Audio queue para mensajes críticos

Ahora el clear puede generarse antes, pero puede sentirse tarde si la
cola de audio está ocupada reproduciendo una frase anterior.

Siguiente mejora probable:

- Mensajes `clear_left`, `clear_right`, `all_clear` deben poder
  interrumpir o reemplazar audio menos importante.
- Mantener cuidado para no cortar frases críticas de forma
  incoherente.
- Definir política por tipo:
  - `car_left/right`: crítico, prioridad alta.
  - `clear_left/right`: crítico y sensible a latencia.
  - `still_there`: menos crítico, puede saltarse si está obsoleto.

Estado actual: validación de `ValidityRule` antes de reproducir.
**Interrupción de audio en curso sigue siendo alpha 2.**

## Prioridad 5: UI mínima de prueba

La UI debe ayudar a testear, no solo mostrar estado.

Controles útiles (ya en prealpha, pendientes de verificación):

- Fuente LMU / replay / simulator.
- Botón para limpiar mensajes recientes.
- Estado de conexión LMU.
- Último evento spotter.
- Últimos candidatos laterales.
- Toggle debug spotter.
- Exportar logs / fixture.

## Prioridad 6: Cerrar prealpha gate

Prealpha puede cerrarse cuando todos los criterios de
[`testing/prealpha-gate.md`](../testing/prealpha-gate.md) pasan.
Resumen:

- `scripts/verify-prealpha.ps1` pasa.
- LMU mock debug imprime geometría.
- ≥1 sesión LMU real grabada a JSONL con `cmd/spotter-debug`
  (sustituye al `-jsonl` inexistente en `cmd/lmu-debug`).
- Replay fixtures cubren left, right, clear, all clear, three-wide
  en `internal/engineer/replay/testdata/`.
- Sin stale spotter audio en tests.
- `ValidityRule` + `Runtime.IsMessageStillValid` implementados.
- Speed gate `minSpotterSpeedMPS=10.0` implementado.
- `Player.Play` integrado en `queueLoop`.
- 7 frases críticas en español en cache (cuando `internal/tts/`
  exista).
- Edge TTS sintetiza `.mp3` correctamente.
- Audio playback funciona en Windows.
- Pre-cache en arranque con ≥7 archivos.

## Después de prealpha

Cuando el spotter esté estable, empieza alpha 1. Orden recomendado:

1. Race-control: flags, penalties, damage, rain, frozen_order.
2. Core race: laps, push, session end, fuel, pit stops.
3. Vehicle + opponents: tyres, engine, battery, multiclass, pearls.
4. i18n EN con NumberProcessing.
5. Frases editables (PhraseStore + import/export).
6. Pit Manager LMU REST.
7. NSIS installer + auto-update.
8. duck_lmu bundle.

No introducir IA antes de que el core determinista y el spotter sean
confiables. Regla 1 del plan maestro: la IA no decide datos críticos.
