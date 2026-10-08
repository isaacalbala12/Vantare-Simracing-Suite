# ISA-1396 · edición temporal exacta por piloto

## Resultado local

La mesa recorded muestra, junto al editor de vueltas, las ventanas de minutos
transcurridos desde el inicio de carrera. La ayuda explica que formación y
paradas forman parte del reloj y que el fin del intervalo no está incluido.
Introducir 65–120 minutos conserva `[3900,7200)` segundos en
`driverLimits[id].unavailableTime`, mientras los límites por vueltas siguen
independientes. Una fila existente vacía temporalmente no elimina su dato;
Quitar sí lo elimina.

`StrategyEventRules` valida el contrato antes de guardar o calcular: rechaza
negativos, NaN, infinitos e intervalos vacíos o invertidos. El borrador
guardado y reabierto y `recordedCalculationEvent` conservan exactamente el
campo. El backend #1395 lo evalúa en solve y replay. No se convierte el
horario legacy por hora del día sin fecha y zona fiables.

## Evidencia

- RED: cuatro casos inválidos pasaban y no existía el grupo de edición.
- GREEN: 76/76 tests focales de edición, validación, persistencia y cálculo.
- Typecheck, lint y build frontend PASS; auditoría i18n ES/EN/PT/IT con cero
  claves ausentes y cero huérfanas. Suite completa: 493 archivos, 4325 tests
  PASS y 2 omitidos. Los 44 tests del roadmap también pasan.
- En el navegador interno con harness mock se abrió el editor de pilotos y se
  añadió una ventana 65–120 minutos. El campo y la acción de guardar quedaron
  visibles; este recorrido no prueba la persistencia Wails ni un cálculo real.

## Pendiente

Paridad visual de esta nueva sección en todos los tamaños, T22 Wails E01–E08
con DuckDB real, aceptación humana, memoria de resistencia #1375 y calibración
empírica T19–T21. Ningún test de frontend certifica por sí solo el runtime.
