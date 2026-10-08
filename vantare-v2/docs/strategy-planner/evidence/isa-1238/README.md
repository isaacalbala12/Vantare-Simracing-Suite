# Evidencia ISA-1238 — presupuesto de secuencia multipiloto

## Reproducción

Una carrera de 136 vueltas con cuatro perfiles equivalentes y secuencia
`[a,b,c,d]` agotaba el presupuesto porque el atajo escalar aceptaba sólo un
piloto y la búsqueda general conservaba cada número exacto de stints.

## Solución mínima

El atajo escalar existente acepta varios perfiles únicamente cuando todos
coinciden con los valores escalares efectivos, no hay límites de conducción y
existe una secuencia explícita. El mínimo de stints completa al menos una pasada
de la secuencia y la misma rotación se aplica a stints y paradas. Pilotos
distintos, selección libre y límites continúan por la búsqueda general.

Astra high aconsejó retirar el cambio inicialmente probado sobre la dominancia:
el RED no lo necesitaba y habría ampliado el algoritmo general. El corte final
no modifica la poda, los presupuestos ni el modelo de estado.

## Pruebas

- RED: el caso de 136 vueltas terminaba con `WithinBudget=false`.
- GREEN: el resultado es factible, queda dentro del presupuesto, usa cero
  iteraciones de búsqueda y conserva la primera secuencia completa.
- La regresión `[a,a,b]` de #1236 sigue pasando por la búsqueda general.
- `go test ./internal/strategy/solver`: PASS.
- `go vet ./internal/strategy/solver`: PASS.
- Build web previo a Go: PASS, con el aviso heredado de chunks mayores de
  500 kB.
- `go test ./...`: PASS.
- Vet focal de app, Strategy, Analysis y `cmd/vantare`: PASS.
- Roadmap regenerado y estable: digest 23/23, Discord 64/64 y contrato 21/21.
- `git diff --check`: PASS.
- Astra high: sin P0/P1/P2; recomendó el corte final simplificado.

## Límites

No conecta todavía el adapter Strategy, no altera perfiles distintos ni reglas
por piloto. Sin UI, app/Wails/LMU, DuckDB, push, PR, CI remota, integración o
release.
