# Evidencia ISA-1225 — T02d2b cargas iniciales fijas

## Alcance

- Dos cargas iniciales opcionales con valor, procedencia y confianza.
- Búsqueda, replay, canonicalización, clima y peor caso coherentes.
- Compatibilidad exacta del camino sin cargas declaradas.

Application, TypeScript, asistente, inventario y servicios quedan fuera.

## Decisión mínima

El caso nuevo usa la búsqueda general existente. El atajo simple permanece
intacto y sólo se omite cuando aparece alguna carga fija; adaptarlo obligaría a
revisar su estimación de cargas y stints sin añadir comportamiento necesario.
Un helper común elige valor explícito o el fallback propio de cada consumidor.

## Contrato comprobado

- Una carga insuficiente no se rellena en silencio.
- Cero y ausencia tienen identidades y resultados distintos.
- Fuel y VE se validan independientemente contra capacidad.
- Solve y replay usan el mismo coste de peso y los mismos recursos.
- Clima y peor caso parten de la carga fija y publican causas específicas.
- La ausencia mantiene el hash serializado y el camino simple anteriores.

## Pruebas

- RED inicial: el test no compilaba porque `SolverInputV2` no exponía cargas.
- solver completo: PASS.
- `go test ./... -count=1`: PASS tras generar el embed web.
- vet focal del solver: PASS.
- build frontend web: PASS; sólo preparó `frontend/dist` ignorado para el embed.
- roadmap: 23 + 21 tests PASS y artefacto regenerado.
- Astra high: sin P0/P1/P2 ni complejidad eliminable en la revisión final.

La primera ejecución Go no pudo compilar únicamente `cmd/vantare` y `frontend`
porque el worktree nuevo aún no tenía `frontend/dist`; el resto, incluido
Strategy, pasó. Tras el build web exigido por el embed, la repetición global
pasó completa.

## Límites

Este corte prueba el contrato interno del solver. No acredita transporte desde
la UI, precisión física, runtime nativo ni una carrera LMU real.
