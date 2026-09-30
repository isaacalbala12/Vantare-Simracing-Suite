# ISA-1269 · T15a2c horizonte temporal con orden libre

## Resultado local

SolverV2 acepta una duración opcional junto a su límite de exploración. En ese
modo, la distancia deja de ser una estimación previa: cada decisión se evalúa
con su reloj real, incluida formación, ritmo por piloto, combustible, paradas y
servicios. La carrera termina al completar una vuelta iniciada antes del límite;
entre planes válidos se prefieren más vueltas y después el menor tiempo.

CalculateOrbit usa ese modo sólo para la selección libre temporal. La rotación
temporal fija conserva su resolución anterior y las carreras por vueltas siguen
cerrando en su distancia exacta. El asistente recorded permite ya elegir orden
libre en una carrera temporal y lo valida y transporta sin calcular vueltas en
React.

## Evidencia de regresión

- 239/240/241 segundos a 60 s por vuelta producen 4/4/5 vueltas.
- 180 segundos con pilotos de 60/180 y mínimo de tres vueltas para el rápido
  encuentra las tres vueltas rápidas aunque una semilla media daría dos.
- 240 segundos con pilotos de 60/120, máximo de una vuelta cada uno y 100 s de
  parada produce dos vueltas, una parada y 280 s totales.
- 130 s de formación se cuentan una vez: ocho vueltas a 60 s terminan en 610 s
  y la última empieza en 550 s.
- La carga inicial mínima se aplica antes de decidir el final: con penalización
  de peso, tres vueltas duran 186 s y cuatro duran 250 s; no se acepta el falso
  final de 207 s que produciría cargar el depósito completo.
- Cancelación y agotamiento del presupuesto mantienen sus errores separados.

## Límites

- T15b conectará el ciclo Calcular/Cancelar del recorrido recorded; este corte
  sólo deja preparada y seleccionable su entrada correcta.
- El plan parcial y la política final de optimalidad pertenecen a T15c.
- La disponibilidad horaria legacy necesita otra referencia temporal y no se
  convierte desde vueltas ni ritmo medio.
- No se abrió la app ni se ejecutaron Wails, LMU o DuckDB.

## Verificación

El RED inicial no compilaba porque SolverV2 carecía de duración. Los tests
focales cubren las fronteras y contraejemplos anteriores, replay, reservas,
cancelación, presupuesto, conexión Go y validación TypeScript. Pasan solver y
aplicación completos, 3 archivos/56 tests frontend focales, frontend completo
450/3.879, typecheck, lint, auditoría i18n, build, Go global y 259 checks
documentales. El build conserva el aviso heredado de chunks superiores a 500
kB y Vitest imprime el `AbortError` conocido de teardown sin fallar pruebas. El
gate PR específico de roadmap no se ejecuta sin `GITHUB_TOKEN`; la issue declara
los dos IDs modificados y no existe PR.
