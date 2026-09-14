# ISA-1249 — comandos de cálculo únicos entre montajes

## Resultado

Strategy Orbit genera cada `commandId` de cálculo con `crypto.randomUUID()` y
conserva el contador sólo para invalidar efectos dentro del montaje. La
correlación, cancelación y limpieza existentes permanecen como única autoridad.

## Evidencia

- RED: dos montajes equivalentes emitían `orbit-calculate-2`; el error tardío
  del primero se publicaba como fallo del segundo.
- GREEN: los comandos difieren; un error y una respuesta tardíos del primer
  montaje se ignoran, el segundo sigue cargando y sólo publica su respuesta.
- El banco usa `createStrategyApplicationClient` y un transporte controlado, no
  promesas resueltas directamente por un cliente falso.
- Prueba focal: 8 casos pasan. Frontend completo: 448 archivos y 3822 pruebas;
  typecheck, lint, auditoría i18n y build pasan. El build conserva sólo el aviso
  heredado de chunks grandes.
- Los 44 tests de roadmap pasan; digest estable y diff-check limpio.
- Astra detectó que el primer banco no vaciaba las promesas antes de comprobar
  la pantalla. Corregido con `await act`: la repetición RED muestra el error
  antiguo en la pantalla y la revisión productiva no encuentra P0–P2.

## Límites

No detiene físicamente el backend, no añade persistencia ni define readiness o
resultados parciales. No se abrió app/Wails/LMU ni se tocaron DuckDB.
