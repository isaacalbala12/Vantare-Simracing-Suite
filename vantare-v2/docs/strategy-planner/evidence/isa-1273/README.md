# Evidencia local — T16a / #1273

## Alcance entregado

- La propuesta base y la edición de stint viajan como dos variantes de una
  misma petición y comparten evento, pilotos, fuentes y `PlanningInputs`.
- La edición reutiliza `order` para fijar el piloto de cada stint visible y
  `overrides[index].laps` para fijar vueltas. No amplía el contrato Go.
- La variante restringida queda activa; la propuesta base permanece intacta y
  el backend devuelve la comparación entre ambas.
- Índices, pilotos, vueltas, duplicados y cambios vacíos se validan antes de
  enviar. Construir la petición no muta la entrada ni el resultado anterior.

## Regresiones

El test TypeScript cubre piloto, vueltas, clonación y todos los rechazos de
entrada. El test Go usa una propuesta libre y otra fija en el mismo cálculo:
demuestra la base intacta, la distribución restringida 1+3, el delta exacto y
la etiqueta `not_proven` cuando se alteran vueltas.

## Verificación

- Frontend focal: 1 archivo y 8 pruebas, PASS.
- Aplicación Strategy Go focal: PASS.
- Typecheck, lint, auditoría i18n y build: PASS.
- Frontend completo: 454 archivos y 3.905 pruebas, PASS.
- Go global y 259 checks documentales: PASS.

## Límites

T16b conectará controles visuales, teclado, obsolescencia y coste. T17 mantiene
la edición de parada; T18/T22, los gates visual y nativo. No se abrió la app ni
se ejecutaron Wails, LMU o DuckDB. No hubo push, PR, CI remota, integración ni
release.
