# ISA-1250 — telemetría preparada antes de calcular

## Resultado

Strategy Orbit no solicita ni presenta un cálculo cuando el evento usa
telemetría seleccionada y sus entradas todavía están pendientes o han fallado.
Al guardar una selección publica primero el catálogo invalidado; un único efecto
prepara las entradas y habilita el cálculo sólo cuando el estado es `available`.
Los eventos manuales sin telemetría conservan su cálculo existente.

## Evidencia

- RED: al reabrir un evento con una sesión incluida y derivación pendiente se
  emitían dos cálculos con los valores del roster.
- GREEN: mientras la derivación permanece pendiente se emiten cero cálculos; al
  resolver, el cálculo contiene exactamente 142.004 s/vuelta y 3.538 L/vuelta
  derivados por el banco.
- Si una sesión se vuelve a incluir y la derivación falla, se presenta el error
  y se emiten cero cálculos de sustitución.
- Si la combinación de una selección incluida ya no existe en el catálogo,
  omitir el selector muestra el error existente en vez de cargar sin fin; se
  emiten cero cálculos.
- La prueba usa el cliente de aplicación controlado y monta de nuevo la pantalla
  para cubrir una selección persistida, no sólo el clic que la crea.
- Astra detectó y permitió retirar la segunda derivación de los handlers y el
  registro auxiliar de peticiones. La pantalla conserva una sola autoridad.
- Frontend completo: 448 archivos y 3822 pruebas; typecheck/build, lint y
  auditoría i18n pasan. Los 44 tests de roadmap pasan; digest estable y
  diff-check limpio. El build conserva sólo el aviso heredado de chunks grandes.
- El primer banco global, ejecutado junto a lint y roadmap, hizo coincidir el
  parseo exactamente con el límite de 1.5 ms. La prueba aislada y la repetición
  global sin carga paralela pasan.

## Límites

Este corte cierra sólo la preparación de la telemetría seleccionada. No define
el contrato integral de readiness ni los estados óptimo, factible, parcial o
inviable. No se abrió app/Wails/LMU ni se tocaron DuckDB.
