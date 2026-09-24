# ISA-1367 — certificado exacto acotado para Hypercar con Fuel y VE

La sesión real S026 Monza Hypercar aporta ritmo seco 97,559 s/vuelta (N=53),
Fuel 2,876 L/vuelta (N=53) y VE 3,328 puntos/vuelta. Con un evento **supuesto**
de 60 minutos, 90 L y 40 s de pérdida por parada, el solver agotaba
100.000.001 comparaciones antes de completar un plan. No era un fallo de
lectura DuckDB ni ausencia de energía virtual.

## Cambio y argumento

Para una carrera por vueltas de hasta 64 vueltas, un piloto uniforme y una
curva combinada de ritmo sin peso de combustible, ahorro, clima, compuestos ni
reglas que condicionen paradas, el solver enumera cada vuelta posible de una
parada. Reproduce cada decisión con el evaluador existente y exige factibilidad
en el caso esperado y en el peor caso cuando la incertidumbre es dura. El
servicio mínimo de Fuel y VE se calcula con capacidad y reserva, redondeado a
los pasos del solver. Sin efecto del peso en el ritmo, cargar más no puede
mejorar el tiempo.

Para descartar dos o más paradas, una programación dinámica calcula una cota
**optimista** de todas las particiones de vueltas: conserva el coste fijo de
cada parada y la curva de ritmo exacta, pero regala el servicio y omite las
restricciones de recursos. Por tanto, ese valor no puede superar el coste de
una estrategia real con las mismas particiones. Solo se declara óptimo el
mejor plan de cero o una parada si vence estrictamente esta cota, incluso
considerando la tolerancia de comparación del solver. En cualquier otro caso
se conserva la búsqueda completa y sus límites habituales. El certificado
no altera los datos de telemetría ni amplía presupuestos.

## Verificación y límites

- Una regresión mínima reprodujo el agotamiento con `MaxIterations=1` antes
  del cambio; ahora resuelve sin iteraciones de búsqueda y coincide en tiempo
  y decisión con el oráculo exhaustivo.
- 24 casos pequeños, incluidos reservas Fuel de media vuelta y tiempos
  variables de neumáticos, coinciden con el oráculo exhaustivo. Otro caso en el que gana una parada adicional
  desactiva el certificado y entra en la búsqueda completa.
- El banco opt-in `TestRecordedStrategyRealDuckDB` con S026 y S125 pasa. S026
  devuelve 37 vueltas, una parada y `optimality=proven` **dentro del modelo y
  del evento supuesto**. S125 sigue pasando. Los originales conservan los
  SHA-256 `08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`
  y `35438326ecddd6ab660ed3aad70b076a73e3290236c0292f30657594c38c1eb0`.
- `go test -p 1 ./internal/strategy/solver -count=1`, el banco real,
  `pnpm --dir frontend build` y `go test -p 1 ./... -count=1` pasan.
  El primer intento de suite Go falló por faltar `frontend/dist` en el
  worktree; tras generar esos archivos, la repetición pasó.

La prueba matemática sólo cubre la clase de entrada descrita. No demuestra
precisión empírica de ritmo, consumo, incidentes o reglas de una carrera real.
Tampoco acredita la interfaz Wails ni sesiones de 24 horas: lectura por
streaming y memoria acotada siguen en #1375, y la calibración en #1030.
