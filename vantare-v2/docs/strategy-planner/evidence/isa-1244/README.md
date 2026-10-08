# ISA-1244 — compuestos permitidos por clima

## Resultado

Reglas muestra seco, húmedo y mojado con los cuatro compuestos canónicos. Cada
selección se guarda de forma independiente en `allowedCompoundsByClimate` y en
orden soft/medium/hard/wet. Un clima sin selección muestra «Sin restricción»;
desmarcar el último compuesto elimina ese bucket y, al vaciar todos, elimina el
mapa sin alterar las demás reglas.

La pantalla configura el evento antes de elegir sesiones. No filtra opciones con
telemetría ni afirma que exista evidencia compatible. Readiness y SolverV2 siguen
siendo responsables de explicar datos ausentes o inviabilidad.

## Evidencia

- RED: la pantalla no exponía reglas por clima.
- GREEN focal: cuatro archivos y 60 pruebas.
- Parser, guardado/reapertura y adapter conservan seco hard/wet y mojado soft.
- Frontend completo: 448 archivos y 3816 pruebas; typecheck, lint, auditoría
  i18n y build pasan. El build conserva sólo el aviso heredado de chunks grandes.
- Los 21 tests del contrato de roadmap pasan; digest estable y diff-check limpio.
- Astra recomendó los tres buckets del contrato existente y descartó un editor
  genérico o filtrado por datos en este paso del asistente.

## Límites

La disponibilidad de pilotos, la semántica de orden y el clima individual #1239
quedan en cortes separados. No se abrió app/Wails/LMU ni se tocaron DuckDB.
