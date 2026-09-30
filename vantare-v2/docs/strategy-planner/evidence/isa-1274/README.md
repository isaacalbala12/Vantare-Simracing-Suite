# Evidencia local — T16b / #1274

## Alcance entregado

- Cada stint permite fijar piloto y cada frontera permite mover vueltas sin
  cambiar el total ni dejar un stint vacío.
- El mismo límite se edita mediante `range` arrastrable y número/teclado; ambos
  producen las mismas restricciones exactas.
- Editar muestra obsolescencia y bloquea aceptar. Restablecer descarta cambios
  locales todavía no calculados.
- Recalcular reutiliza la petición exacta ya preparada, sin otra consulta de
  telemetría, y envía base + variante restringida en una orden.
- El plan restringido muestra el delta temporal que devuelve la comparación Go
  bajo las mismas fuentes, reglas y entradas.

## Regresiones

Los tests cubren equivalencia arrastre/número, total constante, piloto, reset,
bloqueo, obsolescencia, aceptación deshabilitada, una sola preparación, petición
comparativa exacta y presentación del coste devuelto.

## Verificación

- Frontend focal: 3 archivos y 18 pruebas, PASS.
- Typecheck, lint y auditoría i18n: PASS.
- Build, Go global y 259 checks documentales: PASS.
- Frontend completo: 454 archivos y 3.908 pruebas funcionales, PASS. El único
  fallo fue el benchmark heredado de parseo al quedar exactamente en su límite
  estricto (1,500 ms frente a `< 1,500 ms`); repetido aislado, PASS.

## Límites

T17 mantiene la edición de parada y servicios. T18/T22 mantienen los gates
visual y nativo. No se abrió la app ni se ejecutaron Wails, LMU o DuckDB. No
hubo push, PR, CI remota, integración ni release.
