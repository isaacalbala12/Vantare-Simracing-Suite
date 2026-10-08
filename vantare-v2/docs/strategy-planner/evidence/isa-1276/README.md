# Evidencia local — T17b / #1276

## Alcance entregado

- Plan permite editar por parada Fuel añadido y energía virtual cuando aplica.
- Si el evento incluye inventario físico, permite decidir cambio de neumáticos
  y compuesto; si no, explica la capacidad ausente sin fabricar controles.
- Cada parada muestra vuelta y el desglose calculado de tránsito, servicio,
  solape y total. El modo paralelo o secuencial sigue siendo el del evento.
- Una edición local marca el plan como obsoleto, bloquea su aceptación y puede
  restablecerse. Recalcular reutiliza las entradas ya preparadas.
- La petición fija todos los stints y servicios visibles, conserva cero y
  `false`, y compara la variante contra el plan vigente con el SolverV2.
- Una parada ya calculada puede refinarse sobre su base retenida. Para volver a
  editar stints se inicia un cálculo completo explícito y se evita mezclar dos
  baselines de coste.

## Regresiones

Las pruebas cubren Fuel/VE/neumáticos, controles no aplicables, bloqueo,
restablecimiento, petición exacta sin nueva preparación, actualización repetida
de una parada, coste y bloqueo de aceptación.

## Verificación

- Frontend focal: 3 archivos y 16 pruebas, PASS.
- Frontend completo: 457 archivos y 3.918 pruebas, PASS.
- Typecheck, lint, auditoría i18n y build: PASS.
- Go global después del build: PASS.
- 259 checks documentales y roadmap regenerado: PASS.

## Límites

T18 conserva las capturas y la revisión visual adversarial de cada pantalla;
T22 conserva el recorrido Wails/DuckDB real. No se abrió la app ni se ejecutaron
Wails, LMU o DuckDB. No hubo push, PR, CI remota, integración ni release.
