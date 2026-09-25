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
larga **con muchas vueltas**, y reducir visitas antes de fijar una cuota nueva.
La sección siguiente separa el coste de importación en una fuente de alto
volumen continuo. Quedan pendientes inspección y proyección paginadas, correcciones
exactas, limpieza/cancelación en runtime y Wails T22.

## Volumen real aislado de la importación

Se repitió la lectura con el original limpio
`Autodromo Enzo e Dino Ferrari_P_2026-08-13T13_50_06Z.duckdb` (264,10 MiB,
sin WAL; SHA-256 `88956bb77774fbe93a1898b3c34f13ecaa076ff37d5e2ec2003212be39440de0`).
Esta fuente contiene mucho más volumen continuo, pero sólo **una vuelta**:
sirve para estresar el lector, no para certificar una estrategia de resistencia.
La rama opcional del test abre el parser autorizado y llama directamente a
`ReadCorrectionSummary` antes de importar el catálogo. Sólo en el banco se
permitieron 12 M muestras, 15 M valores y 64 MiB de texto para observar el
recorrido completo; **la cuota productiva no cambió**. La fuente Monza usada
por el banco conservó también su hash original.

Una medición preliminar con importación previa dio 2.191 MiB de pico, pero
`HeapSys` ya marcaba 2.492 MiB **antes** de empezar el resumen: esa cifra no
pertenece a `ReadCorrectionSummary`. Se retiró la importación del recorrido de
volumen y se midió el proceso nuevo con `PeakWorkingSet64` cada 50 ms:

| Ejecución | Pico de working set | Tiempo | Resultado |
| --- | ---: | ---: | --- |
| 1 | 50,8 MiB | 54,09 s | 1 vuelta; hashes intactos |
| 2 | 50,8 MiB | 53,49 s | 1 vuelta; hashes intactos |
| 3 | 51,1 MiB | 53,31 s | 1 vuelta; hashes intactos |

Antes del resumen `HeapSys` estaba entre 7,6 y 11,6 MiB; al terminar,
entre 18,2 y 18,4 MiB. El test asignó ~14,66 GiB **acumulados** a lo largo
de las visitas, dato que explica el coste temporal pero no es memoria
simultánea. Los tres picos son evidencia de este lector, esta fuente y este
entorno: no prueban rendimiento con muchas vueltas/eventos, aplicación Wails
ni las operaciones productivas que todavía materializan correcciones.
