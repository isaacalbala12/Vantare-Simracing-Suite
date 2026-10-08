# Evidencia ISA-1229 — T02e3 contrato TypeScript de neumáticos físicos

## Alcance

- El evento `calculate_orbit` transporta inventario físico individual y
  parámetros de compuesto con los mismos nombres y unidades que Go.
- Stints y paradas decodifican compuesto y montaje físico; las paradas conservan
  `changeTyres: false` como una decisión presente.
- Las respuestas históricas sin campos físicos siguen siendo válidas.

## Decisión mínima

Se reutiliza `StrategyTyre` y sólo se añade el montaje de cuatro esquinas. La
validación del cliente comprueba la forma de cada decisión; Go conserva la
autoridad sobre capacidad, estados, procedencia y factibilidad del inventario.
No se crea otra representación ni se convierte el inventario agregado.

## Pruebas

- Transporte exacto de inventario y `compoundPace`.
- Respuesta física completa con `changeTyres: false`.
- Rechazo de compuesto, montaje o decisión incompletos.
- Validación de cuatro identidades físicas distintas.
- Focales cliente + neumáticos: 62 PASS.
- Frontend completo: 448 archivos y 3778 tests PASS; el `AbortError` heredado de
  teardown de Happy DOM no cambió el código cero.
- Typecheck, ESLint focal/completo y build: PASS.
- Roadmap: 23 + 64 + 21 tests y digest `--check`: PASS.
- Astra high: sin P0/P1/P2 ni complejidad eliminable.

## Límites

Custodia y adaptación del borrador recorded pertenecen a T02e4. Sin UI,
app/Wails/LMU, DuckDB, inferencia de códigos, push, PR, integración o release.
