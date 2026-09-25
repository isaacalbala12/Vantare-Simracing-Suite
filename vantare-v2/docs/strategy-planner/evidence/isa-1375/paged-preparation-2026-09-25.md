# ISA-1375 — preparación paginada, primer corte productivo

`PrepareCorrections` usa ahora `ReadCorrectionSummary`: valida el artefacto
autorizado y todas las páginas, conserva eventos con un techo explícito de
100.000 filas, valida GPS en orden y relee señales continuas mediante ventanas
GPS. La validez y la referencia de análisis se construyen sin devolver las
páginas de todas las señales. No cambia el presupuesto de 1,25 M muestras,
1,5 M valores y 16 MiB de texto; una fuente que lo supera sigue rechazándose.
En el primer corte inspección, guardado y proyección aún usaban
`ReadCorrectionInput`; los cortes posteriores de este expediente migraron
inspección y guardado. La proyección todavía retiene las páginas completas.
Por tanto **no** se anuncia soporte de resistencia.

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

## Límite de las relecturas repetidas

Se probó pasar `LoadCorrection`, `LoadPendingCorrectionCommand`,
`AcknowledgeCorrectionCommand` y `ResolveCorrectionCommand` al resumen paginado.
El banco real completo conservó revisiones, proyección, restauración y hashes,
pero tardó **288,18 s** frente a **87,21 s** de la ejecución anterior con
esas operaciones en la ruta materializada. Son ejecuciones individuales, no
una comparación estadística de rendimiento, pero el coste es inaceptable para
consultas de historial frecuentes. El cambio de esas cuatro llamadas se
retiró antes de commit; el worktree volvió a `03e5e5e6` limpio. Hace falta
separar revalidación ligera de la fuente y reutilización segura de identidad,
o una derivación paginada compartida por comando, antes de cambiar esas rutas.

## Consultas de historial con identidad de sesión abierta

Las cuatro consultas citadas arriba usan ahora sólo la identidad base ya
obtenida por preparación o una lectura anterior. Antes de cada consulta,
`LMUDuckDBParser.Inspect` vuelve a validar el SHA-256 de la copia privada a
través del proceso lector y el catálogo. Si aún no hay base en esa sesión,
`ReadCorrectionSummary` la produce una vez. El caché no guarda muestras ni
sale de la sesión abierta. Guardar, inspeccionar observaciones y proyectar
siguen en el lector materializado.

Un test focal comprueba que la segunda consulta no toca páginas de muestras,
que la cancelación no retira la fuente y que una evidencia modificada sí la
invalida. `go test ./...`, `go vet ./internal/app ./internal/telemetryanalysis/...`
y `git diff --check` pasaron. El banco real corto confirmó preparación de
98 canales y 70 anclas, con originales Algarve y Monza intactos: PASS,
45,66 s incluyendo apertura e importación. El banco real completo confirmó
paridad paginada/materializada, 71 eventos, 70 reinicios, proyección, cálculo,
revisiones exactas, restauración, reapertura y hashes originales intactos:
PASS, **132,81 s**. Una ejecución previa del mismo corte tardó 429,46 s con
salida capturada por PowerShell y no verificó explícitamente el código del
test; se considera sólo un dato de latencia anómala, no un PASS. Las medidas
individuales no prueban una mejora de tiempo frente al banco anterior de
87,21 s; sí evitan estructuralmente releer muestras para cada consulta de
historial. No se eleva la cuota ni se acredita resistencia o Wails.

## Inspección de vueltas sin retener todas las muestras

`InspectCorrectionLaps` lee ahora un `CorrectionSummary` del original, carga
la revisión exacta y solicita sólo las filas que nombra su snapshot (máximo
256 decisiones). El validador mixto existente comprueba sobre ellas las
precondiciones de escalares, familias, clasificación e hitos de stint. Cuando
hay un valor corregido, una segunda visita paginada aplica ese valor a una
copia de su página y deriva la validez efectiva. La construcción de la página
pública es común a esta ruta y al oráculo materializado. El servicio mantiene
el mismo permiso, lock, cancelación y retiro ante fuente incompatible; el
original y el snapshot persistido no se modifican.

Los tests comparan validez y página pública contra la ruta materializada con
correcciones de `Lap Time` y `GPS Time`, comparan la inspección de una revisión
escalar guardada y comprueban objetivo ausente, página malformada, canal ajeno,
cancelación, autorización y fuente cambiada. El banco real Algarve→Monza
añadió una corrección temporal de `Lap Time` sobre una fila autorizada, sin
guardarla, y obtuvo validez paginada **idéntica** a la materializada. Después
pasaron proyección, cálculo, historial, restauración y reapertura. PASS,
215,01 s; 71 eventos, 70 reinicios y 66 vueltas completas. SHA-256 de ambos
originales invariantes (Algarve `6b912640e5b68da087fbe86ce70401101edbdc89cb89cb93df30c9ef396d9362`;
Monza `08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`).
Es un único banco funcional, no una comparación A/B de tiempo ni memoria.
Tras esa ejecución se añadió reutilización del resumen dentro del handle
abierto: `Inspect` recalcula la evidencia del archivo y verifica el catálogo
antes de cada reutilización. Un test impide leer páginas de muestras al
inspeccionar de nuevo una revisión sin cambios escalares y otro cambia la
evidencia para comprobar que la sesión se retira. Esta mejora de navegación
no queda acreditada por el tiempo del banco anterior. Se repitió el banco
real con el caché incluido: PASS, **99,46 s**; corrección de Lap Time idéntica,
proyección/cálculo y revisiones exactas intactos, ambos hashes originales
invariantes. La diferencia entre ejecuciones individuales de 215,01 y 99,46 s
no es una medición A/B controlada de rendimiento; sólo acredita función.
El guardado se migró después de este banco; la inspección paginada por sí sola
no certifica resistencia, todos los tipos de corrección ni Wails T22.

## Guardado de correcciones desde filas exactas

`SaveCorrections` y `SaveRecoverableCorrections` reutilizan el resumen del
original revalidado con `Inspect`, leen sólo las filas que nombra la petición
y conservan las comprobaciones existentes del almacén. Si una petición mezcla
valores escalares con familias o límites de stint, calculan la validez efectiva
mediante páginas corregidas antes de guardar. El oráculo materializado queda
sólo en tests: una petición mixta recuperable compara el snapshot exacto y el
guardado escalar compara los valores preparados. La política de cancelación,
fuente cambiada y comando pendiente sigue bajo el bloqueo de sesión.

`go test ./...`, `go vet ./internal/app ./internal/telemetryanalysis/...` y
`git diff --check` pasaron tras mover el oráculo materializado a código sólo de
prueba. El banco completo Algarve→Monza con esta ruta pasó en **269,64 s**: preparación,
paridad de validez, corrección temporal de Lap Time, proyección, cálculo,
historial, restauración y reapertura. Conservó 71 eventos, 70 reinicios,
66 vueltas completas y los hashes de ambos originales indicados arriba.
Es evidencia funcional de una ejecución, no prueba de ahorro de memoria ni
comparación de velocidad. La proyección aún materializa, la cuota productiva
no se ha elevado y faltan una fuente larga multivuelta y Wails T22.

## Dependencias exactas de la proyección pendiente

La revisión de `ProjectCorrection`, la proyección conjunta y
`DeriveCorrectedSession` confirma que ambas entradas comparten un derivador
que vuelve a retener series completas. El inventario de señales, consultas,
ventanas de boxes y desempates consta en [ADR 0012](../../adr/0012-strategy-recorded-bounded-reading.md).
Se añadió una regresión de contrato para la marca temporal duplicada: las
búsquedas de estado/recurso eligen el último valor exacto, mientras la
búsqueda de Fuel más cercano elige el primero exacto y prefiere el anterior
en un empate de distancia. Esta prueba protege la semántica que debe igualar
el futuro recolector; **no** valida todavía una proyección paginada.
La prueba focal, `go test ./...`, vet del paquete y `git diff --check`
pasaron. No se repitió el banco DuckDB real porque la ruta productiva de
proyección no cambió en este corte.

## Primer recolector de fronteras, aún sin conexión productiva

`orderedProjectionBoundaryScan` consume muestras ya alineadas y válidas de
un canal en orden temporal. Para cada instante conserva sólo la fila anterior
y la posterior, incluidas la primera y la última entre marcas duplicadas;
entrega las filas seleccionadas en orden original. Rechaza un orden temporal
decreciente para que un lector futuro no publique resultados distintos en
silencio. Las pruebas comparan `valueAt`, `continuousValueAt`, la búsqueda
de Fuel más cercano y `vectorValueAt` con series completas, incluyendo
duplicados, valor inválido, empate de distancia, tolerancia y ausencia.
El espacio retenido es proporcional al número de instantes consultados, no
al de muestras visitadas. Esta pieza **todavía no lee páginas ni proyecta una
revisión**: faltan alineación, ventanas de boxes, correcciones escalares y
paridad del derivador completo antes de conectarla al servicio.
La suite `go test ./...` pasó antes de la última reducción de filas retenidas;
después pasaron el paquete completo `internal/telemetryanalysis`, su vet y
`git diff --check`. No se repitió el banco real: la proyección productiva no
cambió en este corte.

## Ascensos de boxes con estado constante

`observeRise` deja de copiar las muestras de cada intervalo de boxes. El
nuevo `pitRiseScan` conserva la muestra anterior, el incremento acumulado,
la presencia y los instantes del primer/último ascenso; se puede alimentar
en páginas consecutivas sin cambiar la tasa calculada. Una regresión cubre
dos ascensos separados por un incremento bajo el umbral, presencia degradada
y una subida con duración cero. La suite `go test ./...` y vet focal pasaron.

El banco real Algarve→Monza pasó en **131,40 s**, conservando 71 eventos,
70 reinicios, 66 vueltas completas, ritmo seco 95,190 s (N=58), Fuel
2,135 L/vuelta (N=58), plan supuesto de 38 vueltas/0 paradas con óptimo
probado, revisiones/restauración y hashes de ambos originales intactos.
Es una ejecución funcional; no mide el pico de memoria ni demuestra una
mejora temporal frente a los bancos anteriores. La proyección productiva
todavía carga la serie completa antes de llamar al acumulador.

## Derivación con filas reducidas y visita alineada

Se separó el cálculo de consumo, curvas, boxes y estrategia observada del
paso que aplica el snapshot y analiza validez. La ruta materializada conserva
el mismo derivador y la misma referencia de revisión. En un ensayo **sólo de
test**, filas de frontera seleccionadas desde páginas ya materializadas
producen un `CorrectedSessionDerivations` idéntico en la grabación saneada
S045. El fixture de carrera con boxes empezó rojo: consumo y curvas eran
idénticos, pero boxes y estrategia observada diferían. Al incluir las
muestras interiores de cada parada, también coincidió el modelo completo.
Ese ensayo explica la dependencia y **no es una lectura acotada de boxes**:
retiene esas filas para que el derivador actual pueda consumirlas.

`visitAlignedCorrectionPages` ya puede volver a visitar el lector autorizado
sin guardar todas las páginas, aplicar los tiempos del mismo GPS por ventanas
y entregar páginas seleccionadas al consumidor. En un fixture de canales
continuos Lap/Lap Time igualó las muestras de `ReadCorrectionInput`; un
`Inspect` con sesión cambiada fue rechazado. Todavía falta usarlo para
recolectar los límites reales y resumir Fuel/VE en boxes antes de producir
una proyección paginada; esta prueba no acredita paridad en DuckDB real.

## Boxes desacoplado de las filas de proyección

`DeriveSessionPitObservation` construye ahora el mismo modelo público desde
dos funciones que entregan el ascenso observado por intervalo. La ruta
materializada usa sus series actuales; un test alimenta `pitRiseScan` desde
filas sucesivas y obtiene un `SessionPitObservation` completo idéntico.
El derivador común acepta ese resultado como entrada validada. En el fixture
de carrera, las filas de frontera **sin** las muestras interiores de boxes,
más el resultado de parada separado, producen un
`CorrectedSessionDerivations` completo idéntico al materializado. El test
todavía obtiene esa parada desde páginas materializadas; la paridad del
acumulador se comprueba por separado. Falta unir ambas piezas al visitante
autorizado y probar el snapshot real antes del cambio productivo.

## Recolectores paginados conectados al visitante

`readPagedPitObservation` visita primero los eventos de boxes y después Fuel/VE;
retiene sólo los eventos acotados y un acumulador por parada. Un test con
páginas partidas y un valor de Fuel corregido iguala el resultado materializado
y verifica que el original no cambió. `readPagedProjectionRows` usa el mismo
visitante alineado para conservar sólo las muestras anterior/posterior a los
instantes consultados por las derivaciones, más los eventos necesarios. Otro
test compara las filas seleccionadas de Fuel/VE y Finish Status con la
selección materializada, incluyendo un valor corregido. Si una señal válida
retrocede en el tiempo, los recolectores fallan explícitamente.

La corrección se aplica **después** de alinear con el GPS original, como en
`DeriveCorrectedSession`. `DerivePagedCorrectedSession` une validez paginada,
fronteras, boxes y las mismas derivaciones de siempre. En un fixture de carrera
de dos vueltas igualó el modelo completo tanto para la revisión base como para
una corrección de Fuel. El banco real Algarve→Monza igualó el modelo completo
para una corrección de Lap Time en Algarve y terminó PASS en **153,08 s**:
71 eventos, 70 reinicios, 66 vueltas completas, ritmo seco 95,190 s (N=58),
Fuel 2,135 L/vuelta (N=58), cálculo supuesto 38 vueltas/0 paradas con óptimo
probado, restauración y hashes de ambos originales intactos.

Una tercera variante del fixture corrigió el GPS justo en un límite de vuelta
y detectó una diferencia de validez. La relectura paginada corregía el GPS
antes de alinear, en contradicción con la ruta materializada. Ahora deja el
GPS original como reloj de alineación y aplica las demás correcciones después;
base, Fuel y GPS igualan el modelo completo en el fixture. El banco real
anterior usaba una corrección de Lap Time, por lo que no acredita este caso GPS.

La ruta paginada aún **no alimenta los comandos productivos**. Tampoco se ha
medido su pico de memoria: el banco compara rutas en el mismo proceso y su
tiempo no demuestra una mejora de rendimiento. Faltan la activación conjunta
de las dos entradas, medición aislada de memoria, fuente larga multivuelta y
validación Wails T22.
