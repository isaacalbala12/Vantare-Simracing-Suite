# ISA-1375 — preparación paginada, primer corte productivo

`PrepareCorrections` usa ahora `ReadCorrectionSummary`: valida el artefacto
autorizado y todas las páginas, conserva eventos con un techo explícito de
100.000 filas, valida GPS en orden y relee señales continuas mediante ventanas
GPS. La validez y la referencia de análisis se construyen sin devolver las
páginas de todas las señales. No cambia el presupuesto de 1,25 M muestras,
1,5 M valores y 16 MiB de texto; una fuente que lo supera sigue rechazándose.
Inspección, guardado y proyección todavía usan `ReadCorrectionInput` y retienen
las páginas completas. Por tanto **no** se anuncia soporte de resistencia.

La prueba focal compara referencia, sesión alineada y validez completas contra
el lector anterior, y compara rechazo por límite/cancelación, puente inválido y
cobertura truncada. El banco real opt-in con S266 Algarve y una Monza de
2026-05-02 compara los tres objetos completos y la lista productiva de canales
editables, después ejecuta revisiones exactas, derivación, Strategy y reapertura.
Una regresión RED→PASS confirma que una lectura cancelada no retira el handle
y puede repetirse; una fuente realmente incompatible sigue retirándose.
Pasó: 71 eventos, 70 reinicios, 66 vueltas completas, ritmo seco 95,190 s
(N=58), Fuel 2,135 L/vuelta (N=58), VE no aplicable a LMP2 y plan de 38 vueltas
sin parada con óptimo probado **sólo para el evento supuesto**. Los SHA-256 de
ambos originales siguieron intactos. `go test ./...` y `go vet` de Analysis/App
pasaron. Esto no es prueba Wails ni precisión física de carrera.

Para medir sólo el recorrido hasta preparación, el banco real se detuvo tras
`PrepareCorrections`. La versión anterior se compiló desde `03988b62` en un
worktree temporal separado con **únicamente** esa salida temprana de test; el
worktree se retiró tras medir. Ambas versiones usaron los mismos dos originales,
runtime autorizado y test binario oculto. Se muestreó `PeakWorkingSet64` del
proceso cada 50 ms; cada ejecución terminó con código 0 y verificó los hashes.

| Versión | Pico de working set, MiB (3 ejecuciones) | Tiempo total, s (3 ejecuciones) |
| --- | --- | --- |
| Materializada | 531,5 · 546,1 · 596,0 | 9,39 · 8,25 · 8,56 |
| Preparación paginada inicial | 540,9 · 591,8 · 624,6 | 15,63 · 15,88 · 15,59 |
| Paginada, segunda visita sólo a canales continuos | 657,4 · 482,8 · 433,5 | 15,66 · 15,41 · 15,87 |

Los rangos de memoria varían y se solapan; **no demuestran ahorro de pico** en
esta grabación. Evitar releer eventos en la segunda visita tampoco redujo el
tiempo de forma visible: domina la relectura de señales continuas. El tiempo
aumentó frente a la versión anterior. La medición incluye discovery,
importación de catálogo y apertura, de modo que tampoco aísla el pico de la
preparación. La propiedad estructural lograda es no retener señales continuas
en la respuesta de preparación; falta medir una fuente significativamente más
larga, separar el coste de importación y reducir visitas antes de fijar una
cuota nueva. Quedan pendientes inspección y proyección paginadas, correcciones
exactas, limpieza/cancelación en runtime y Wails T22.
