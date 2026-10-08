# Evidencia local — T15b / #1270

## Alcance entregado

- El borrador recorded conserva una condición seca o mojada explícita; los
  borradores anteriores siguen siendo legibles y quedan incompletos para cálculo.
- El panel Plan prepara una sola proyección desde la combinación y las
  referencias exactas, valida las familias necesarias y envía una sola orden
  `calculate_orbit` con la versión visible del repositorio.
- Los pilotos transportan identidad, nombre y delta. `PlanningInputs` conserva
  la autoridad sobre ritmo y consumos; no se fabrican perfiles dry/wet/eco.
- Calcular, cancelar, carga, error, cancelado y éxito son distinguibles. Un
  cambio de borrador o montaje invalida y cancela el trabajo anterior.
- El resultado válido permanece sólo en memoria para T15c. No hay guardado ni
  aceptación automáticos.

## Regresiones

El RED inicial acreditó que el mapper completo, la persistencia de condición y
el rechazo Go de delta sin base no existían. GREEN cubre seco y mojado,
revisiones sustituidas, familia ausente, cancelación nativa, respuesta tardía,
persistencia legacy y el panel accesible. Los perfiles completos del recorrido
anterior siguen siendo válidos.

## Verificación

- Frontend focal: 5 archivos, 96 pruebas, PASS.
- Aplicación Strategy Go completa: PASS.
- Typecheck, lint, auditoría i18n y build: PASS.
- Go global tras construir el frontend embebido: PASS.
- Frontend completo: 450 archivos y 3.889 pruebas PASS; un benchmark ajeno
  falló a `1,500 ms` porque exige `<1,500 ms`. Repetido de forma aislada: PASS.
- Avisos heredados: chunks superiores a 500 kB y `AbortError` de teardown de
  happy-dom; ninguno procede del ciclo recorded.

## Límites

T15c presentará el resultado parcial/final, la optimalidad y las acciones de
aceptar/guardar. T16/T17 editarán stint y parada. #1239 conserva el clima por
perfil multipiloto. No se abrió la app ni se ejecutaron Wails, LMU o DuckDB.
No hubo push, PR, CI remota, integración ni release.
