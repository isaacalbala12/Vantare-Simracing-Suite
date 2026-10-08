# ISA-1042 — horizonte temporal de Orbit

2026-09-08. Rama `vantareapp/isa-1042-timed-race-horizon`, worktree
`C:/tmp/vantare-isa1042`, base `b7991919`. Ejecución y revisión personales.

## Resultado

Los planes normales de Orbit se vuelven a resolver y evaluar cada vez que
cambia el horizonte de vueltas. CalculateRace recibe el coste real de boxes
y el ritmo medio evaluado como estimación del siguiente horizonte. La
aceptación utiliza el reloj real del replay: última vuelta iniciada antes
del vencimiento y llegada en él o después (`complete_current_lap`).

El replay obtiene el comienzo de la última vuelta evaluando el prefijo con
los mismos costes; no usa una media para certificar esa frontera. Tolerancia
de comparación: `1e-12 * max(1, duración)` segundos, para ruido aritmético.
La iteración está acotada a 32 intentos y al contexto; los ciclos devuelven
`calculation_overflow` con causa `timed horizon did not converge`. No se
confunde falta de convergencia con una prueba de imposibilidad global.

El golden de cuatro horas pasa de 139 a 136 vueltas: 136 × 104 + 4 × 64 =
14400 s, salvo coste subnanosegundo de las tasas de servicio históricas.
Reparto 9/32/32/32/31; última vuelta desde 14296 s. El puente y la pantalla
consumen esa misma referencia, no reconstruyen las vueltas en TypeScript.

## Regresiones y checks

- RED previo: vuelta desde 360 s con evento de 240 s; reparto que no descuenta
  paradas. La regresión corregida usa 18 min, 60 s/vuelta, depósito 4 L y
  parada 90 s: 14 vueltas, tres paradas, reserva satisfecha, llegada 1110 s.
- Fronteras 239/240/241 s: 4/4/5 vueltas sin boxes.
- Degradación de 100 s/vuelta y boxes de 1000 s: vuelta final inicia a 220 s,
  termina a 480 s, con evento de 240 s. Se completa la vuelta en curso.
- Caso de ciclo entre reparto y paradas devuelve error tipado, sin resultado.
- Tests Go de application/solver PASS; `go test ./...` PASS. Build, typecheck
  y lint PASS. Frontend completo: 415 archivos / 3241 tests PASS, 417,01 s,
  exit 0. AbortError de Happy DOM en teardown, sin fallo del resumen final.
  Logs locales: `C:/tmp/vantare-isa1042-go-final.log` y
  `C:/tmp/vantare-isa1042-frontend-final.log`.

## Revisión personal y límites

Se revisaron la traducción de Orbit, CalculateRace, appendStint/replay y
todos los cambios de tests/golden. No hay cálculo alternativo de recursos ni
recorte posterior de servicios. El prefijo clona el nodo existente; no muta
la decisión evaluada. No hay dependencia, I/O, secreto o cambio de datos.

La búsqueda por horizontes es acotada y no prueba optimalidad global. Algunos
eventos pueden requerir otro reparto o una semántica de final en boxes que
el modelo actual no representa: en esos casos no se publica un plan.
El comparador avanzado `calculateOrbitWeather` sigue siendo un cálculo a
distancia fija y no queda certificado como estrategia de carrera por tiempo.
Su adaptación temporal debe tratar también la comparación de resultados a
distancias diferentes; queda registrada en #1042 y fuera de este microcorte.
No habilitarlo como prueba de óptimo del editor inicial de un solo resultado.

Sin validación Wails/LMU ni corpus reservado. Para prueba manual posterior:
evento de cuatro horas con cuatro pilotos a 104 s, 2,75 L/vuelta, tanque 90 L
y boxes 64 s; verificar 136 vueltas y 4:00:00, con reserva del motor.

Sin push, PR, CI remota, merge, promoción, release o escritura de originales.
