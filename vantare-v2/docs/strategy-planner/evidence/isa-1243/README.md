# ISA-1243 — compuestos obligatorios

## Resultado

Reglas muestra los cuatro compuestos canónicos y guarda la selección explícita
en `draft.rules.mandatoryCompounds`, siempre en orden soft/medium/hard/wet.
Desmarcar todos elimina únicamente ese campo y conserva las demás reglas.

La pantalla no consulta inventario ni ritmo: configura el reglamento antes de
Sesiones. Readiness y SolverV2 siguen siendo responsables de explicar datos
ausentes o inviabilidad.

## Evidencia

- RED: la pantalla no exponía ningún compuesto obligatorio.
- GREEN focal: cuatro archivos de test, 59 pruebas.
- Hard y wet conservan orden en parser, guardado/reapertura y adapter.
- Frontend completo: 448 archivos y 3815 pruebas; typecheck, lint, auditoría
  i18n y build pasan. El build conserva sólo el aviso heredado de chunks grandes.
- Los 21 tests del contrato de roadmap pasan; digest estable y diff-check limpio.
- Astra pidió hacer visible el título del grupo; corregido y revisión final sin
  P0–P2 ni alternativa más simple.

## Límites

`allowedCompoundsByClimate` y disponibilidad de pilotos quedan en cortes
separados. No se abrió app/Wails/LMU ni se tocaron DuckDB.
