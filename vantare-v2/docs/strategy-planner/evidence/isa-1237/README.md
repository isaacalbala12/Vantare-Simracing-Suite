# Evidencia ISA-1237 — T02g2b adapter multipiloto

## Alcance

- Orbit construye un perfil efectivo por cada piloto único de la variante antes
  de llamar a SolverV2.
- `variant.order` se conserva completo como secuencia, incluidas repeticiones.
- El plan publica el piloto asignado por el solver cuando conserva la misma
  distribución de stints.
- Un piloto sin límites mantiene el camino legacy.

## Decisión mínima

Se reutilizan `effectiveOrbitPace`, `orbitDriverProfile`, SolverV2 y replay. El
bucket de ritmo se deriva del mismo modo usado para construir perfiles, evitando
un parámetro redundante. No se añade modelo, persistencia ni cálculo en React.

Meteorología parte de perfiles secos para evitar aplicar dos veces el cambio de
clima. Su delta seco→mojado continúa promediado entre pilotos; #1239 documenta
esa limitación fuera de este corte.

## Pruebas

- RED: dos pilotos con límites fallaban por ausencia de `driverProfiles`.
- GREEN: `fast` y `slow` cumplen dos vueltas cada uno con su ritmo y consumo;
  el segundo stint conserva 2.8 L, incluida la reserva.
- GREEN: perfiles únicos con secuencia `[a,a,b]` mantienen dos perfiles y tres
  posiciones.
- GREEN: la ruta weather construye perfiles secos antes de aplicar escenarios.
- `go test ./internal/strategy/application ./internal/strategy/solver`: PASS.
- Build web previo a Go: PASS, con el aviso heredado de chunks mayores de
  500 kB.
- `go test ./...`: PASS.
- Vet focal de app, Strategy, Analysis y `cmd/vantare`: PASS.
- Roadmap regenerado y estable: digest 23/23, Discord 64/64 y contrato 21/21.
- `git diff --check`: PASS.
- Astra high: sin P0/P1/P2 tras corregir perfiles duplicados y base weather;
  su simplificación del bucket redundante quedó aplicada.

## Límites

La UI todavía no distingue orden fijado de propuesta óptima libre. Disponibilidad,
conducción y clima individual siguen pendientes. Sin app/Wails/LMU, DuckDB,
push, PR, CI remota, integración o release.
