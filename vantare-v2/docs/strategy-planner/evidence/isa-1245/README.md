# ISA-1245 — indisponibilidad por vueltas

## Resultado

Pilotos permite añadir, editar y quitar intervalos inclusivos de vueltas de
carrera en `driverLimits[id].unavailable`. Una vuelta única es válida. Añadir
espera ambos extremos; vaciar temporalmente una fila confirmada no la elimina y
sólo Quitar borra. Al quitar el último intervalo desaparece únicamente
`unavailable` y se conservan los demás límites, pilotos y reglas.

La ausencia se muestra como «Sin tramos no disponibles configurados». No se
presenta como disponibilidad total. El modelo horario legacy por minutos del día
permanece separado y no se convierte mediante ritmo promedio.

## Evidencia

- RED: el grupo y sus controles no existían.
- GREEN focal: cuatro archivos y 43 pruebas.
- Cero, decimal e inversión son rechazados por el validador compartido.
- Guardado/reapertura y cálculo conservan `[4,4]` y `[20,25]` exactamente.
- Frontend completo: 448 archivos y 3820 pruebas; typecheck, lint, auditoría
  i18n y build pasan. El build conserva sólo el aviso heredado de chunks grandes.
- Los 21 tests del contrato de roadmap pasan; digest estable y diff-check limpio.
- Astra recomendó reutilizar exclusivamente `DriverLimit.unavailable` y el
  patrón local de ventanas, sin cambiar contrato, adapter ni SolverV2.

## Límites

No cierra disponibilidad horaria, zona temporal ni calendario. La semántica de
orden y el clima individual #1239 quedan en cortes separados. No se abrió
app/Wails/LMU ni se tocaron DuckDB.
