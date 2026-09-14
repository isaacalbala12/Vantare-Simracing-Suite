# Evidencia ISA-1236 — T02g2a secuencia multipiloto en SolverV2

## Alcance

- `driverSequence` es opcional: ausente conserva la selección libre de piloto.
- Presente fija el piloto de cada stint, exige completar la primera pasada y
  repite la secuencia si hacen falta más stints.
- Cada identidad debe tener perfil; solve y replay aplican la misma regla.
- La poda distingue posiciones de secuencia mediante el conteo de stints.

## Decisión mínima

Se reutilizan perfiles, búsqueda, replay y comparación de dominancia existentes.
No se añade estado de fases ni un solver alternativo. El atajo escalar tampoco
necesita un guard: si su candidato no completa la secuencia, replay lo rechaza y
la búsqueda general continúa. Astra high confirmó el alcance tras contrastar
ese flujo.

## Pruebas

- RED inicial: `SolverInputV2` no representaba la secuencia.
- GREEN: sin secuencia gana sólo el piloto rápido; `[fast,slow]` obliga dos
  stints en ese orden.
- GREEN: `[a,b]` se repite como `[a,b,a,b]` cuando la capacidad exige cuatro
  stints; replay rechaza intercambiar pilotos.
- GREEN: identidad sin perfil falla cerrada.
- Contraste del atajo: `[solo,solo]` con carrera posible en un stint y tránsito
  alto retrocede correctamente y encuentra dos stints.
- RED de poda: `[a,a,b]` resultaba falsamente inviable al mezclar posiciones.
- GREEN de poda: conserva el conteo de stints y el tiempo óptimo coincide con
  `exhaustiveV2Best`.
- Focales `TestSolveV2DriverSequence*`: PASS.
- `go test ./internal/strategy/solver/...`: PASS.
- `go vet ./internal/strategy/solver/...`: PASS.
- Build web previo a los paquetes con recursos embebidos: PASS, con el aviso
  heredado de chunks mayores de 500 kB.
- `go test ./...`: PASS.
- Roadmap regenerado y estable: digest 23/23, Discord 64/64 y contrato 21/21.
- `git diff --check`: PASS.
- Astra high: sin P0/P1/P2; oráculo acotado suficiente para el defecto.

## Límites

No conecta todavía Strategy, no migra ni reinterpreta `variant.order` y no
decide cómo la UI distingue propuesta libre de orden fijado. Sin persistencia,
app/Wails/LMU, DuckDB, push, PR, CI remota, integración o release.
