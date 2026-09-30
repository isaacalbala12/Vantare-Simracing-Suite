# Evidencia local — T15c / #1271

## Alcance entregado

- Plan muestra la salida exacta de SolverV2: estado de optimalidad, versión,
  objetivo, tiempo, vueltas, paradas, reserva, stints, Fuel, VE aplicable y
  revisiones fuente.
- La cobertura parcial presenta únicamente magnitudes respaldadas y sus
  bloqueos. No envía un cálculo incompleto ni convierte ausencia en cero.
- Go marca `proven` sólo cuando el replay coincide con la decisión optimizada,
  no hubo edición de variante ni degradación por presupuesto. Cualquier otro
  plan factible es `not_proven`.
- Inviabilidad, cancelación, timeout y presupuesto agotado permanecen estados
  distintos; una respuesta antigua no vuelve a ser vigente.
- Aceptar guarda el borrador, variante, petición y plan exactos mediante la
  revisión Orbit existente. No vuelve a preparar ni calcular, está separado de
  guardar configuración y recupera una escritura incierta con el mismo comando.

## Regresiones

Los tests cubren cobertura parcial, cero VE frente a ausencia, rechazo de
revisión o plan ausentes, descarte de respuesta tardía, optimalidad demostrada
y no demostrada, metadatos del modelo, Fuel/VE del plan, snapshot exacto de
aceptación, recuperación durable y obsolescencia inmediata tras editar.

## Verificación

- Frontend focal: 6 archivos y 116 pruebas, PASS.
- Golden Go de cálculo: PASS.
- Frontend completo: 453 archivos y 3.897 pruebas, PASS.
- Typecheck, lint, auditoría i18n y build: PASS.
- Go global tras construir el frontend embebido: PASS.
- Checks documentales y roadmap generado: PASS.
- Avisos heredados: chunks superiores a 500 kB y `AbortError` de teardown de
  happy-dom; no alteran el resultado de las suites.

## Límites

T16/T17 convertirán la edición de stint/parada en restricciones y recálculo.
T18/T22 conservan la aceptación visual y nativa. T19–T21 conservan la validez
empírica. No se abrió la app ni se ejecutaron Wails, LMU o DuckDB. No hubo push,
PR, CI remota, integración ni release.
