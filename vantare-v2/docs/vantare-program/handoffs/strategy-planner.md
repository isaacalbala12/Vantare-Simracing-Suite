# Handoff vivo — Strategy Planner

## T22 · Candidato localdev actual listo para recorrido nativo (2026-09-26)

En #1393, HEAD local `a888f45b`, la receta localdev regeneró
`bin/vantare-localdev.exe` (46.374.912 bytes; SHA-256
`23fdfaec400cea95f051be4279fd3b0c57249e57a53491dc4bfb4b099cdbf8d3`).
El runtime DuckDB v1.5.5 pasó verificación de cinco miembros y smoke con el
manifiesto confiado. Es preparación sin GUI: E01–E08 y aceptación Wails real
siguen pendientes. No hubo push, PR, CI, integración, promoción ni release.

## ISA-1375 · ADR 0012 alineado con la proyección paginada (2026-09-26)

La inspección del código confirmó que `deriveCorrectionSession` usa
`DerivePagedCorrectedSession` para `ProjectCorrection` y para el catálogo.
El ADR 0012 conservaba frases de la fase anterior que decían que la
proyección aún materializaba la fuente; se actualizaron al estado local
medido en Algarve. No se cambió código ni se elevó la cuota. Falta una fuente
independiente con muchas vueltas, presupuesto general de memoria y Wails
T22; #1375 continúa abierta. Sin push, PR, CI, integración o promoción.

## T18 v5 · 1280×720 incluido en la matriz (2026-09-26)

`pass-v5-25-responsive-final` amplía el gate visual a 128 capturas y 20
combinaciones ES/EN/PT/IT, incluidos 1280×720 y 1672×941. No registra
overflow, errores ni foco perdido. La revisión adversarial independiente
puntúa mínimo **9,1/10** sin P1/P2; el contacto entre contador y botón de
revisión en portugués/1280 detectado en v5-24 se corrigió apilándolos.
Test focal de Datos, typecheck/build, lint y diff check PASS. Umbral visual
web >9 superado; aceptación de Isaac, Wails/LMU/DuckDB real y T22 E01–E08
siguen pendientes. Sin app nativa, push, PR, CI, integración, promoción ni
release.

## T18 v5 · umbral visual del harness superado (2026-09-26)

`pass-v5-23-mobile-final` de #1277 conserva 99 capturas productivas en
harness, 16 combinaciones ES/EN/PT/IT y 320/768/1024/1672 px sin overflow,
errores de página ni foco perdido. La revisión adversarial independiente
puntúa mínimo **9,1/10**, sin P1/P2; P3 opcional de textos auxiliares tenues.
Entrada Manual, editores móviles y contexto de Plan se ajustaron sin cambiar
el backend. Tests focales 11/11, i18n, typecheck/build, lint y diff check
PASS. Queda pendiente aceptación de Isaac y contraste nativo Wails; el
harness simula el cálculo. T22 E01–E08, calibración #1030 y demás objetivos
del SDD permanecen abiertos. Sin app nativa, push, PR, CI, integración,
promoción ni release.

## T18 v5 · responsive y recuperación (2026-09-26)

La rama aislada #1277 avanza desde `157379f9`: acceso Manual visible a 320 px,
contexto superior aprovechando 768 px y plegable a 320 px, y curso neutro
visible también en cobertura parcial/error. El error al editar parada da
acceso directo al cálculo de **estrategia base**, sin presentarlo como reintento
de las restricciones fallidas. `pass-v5-20-recovery` registra 99 capturas y
16 casos responsive sin overflow, errores de página ni pérdida de foco.
Tests focales 11/11, i18n, typecheck, lint y build PASS. La revisión visual
independiente subió 7,4→8,1→8,4/10 hasta `pass-v5-19-context`; la captura
final aún no tiene nueva nota. T18 sigue sin alcanzar >9 y no se pide
aceptación visual. El harness tiene solver simulado; T22 Wails/DuckDB y
calibración empírica siguen sin acreditar. Sin app nativa, push, PR, CI,
integración, promoción ni release.

## T18 v5 · Plan pendiente incorporado al candidato T22 (2026-09-26)

El pase `pass-v5-16-plan` añade al Plan sin calcular la distancia real del
borrador y una línea neutra entre salida y meta, sin inventar stints, paradas
ni progreso. Son 99 capturas y 16 variantes ES/EN/PT/IT sin overflow ni
errores, con foco visible. Test de Plan, auditoría i18n, typecheck, lint,
build y suite frontend secuencial (493 archivos, 4317 tests PASS, 2 omitidos)
pasaron en la rama visual #1277. Sigue pendiente una valoración adversarial
independiente >9/10 y E01–E08 de T22 con Wails/DuckDB real.

## Aceptación con reloj canónico — ISA-1393 (2026-09-25)

El reloj por defecto de `saveOrbitRevision` y activación también podía emitir
`.000Z` y rechazar la revisión en un segundo exacto. Se usa el formateador
canónico de Strategy tras una prueba RED/GREEN de activación. El banco de
navegador con reloj fijado pasa «calcular → aceptar propuesta» y muestra la
revisión inmutable aceptada. Diez tests focales en persistencia/lifecycle
pasan. No acredita Wails ni el repositorio nativo; E03/E01–E08 siguen abiertos.

## QA de Practice y dos sesiones en navegador — ISA-1393 (2026-09-25)

La apertura de Practice como carrera nueva fallaba al guardar en un segundo
exacto: el borrador enviaba `.000Z` y el contrato Strategy exige una marca de
tiempo canónica. Se corrigió con el formateador existente, tras una prueba
RED/GREEN para creación y revisión. El recorrido desde la biblioteca hasta la
mesa de carrera y la matriz visual de 99 capturas pasan ahora en
[`pass-v5-15-practice`](../../strategy-planner/evidence/isa-1277-visual/pass-v5-15-practice/README.md).
Esto sólo prueba el navegador con mock; Wails, DuckDB y persistencia nativa
siguen pendientes.

## QA de dos sesiones en navegador — ISA-1393 (2026-09-25)

El harness devolvía la misma identidad para Race y Practice: al abrir la segunda
sesión, el propietario la descartaba y el contador permanecía en 1/4. Se
separaron handle/base/revisión y la página de vueltas por sesión. El recorrido
automatizado abre ambas, inspecciona Practice y consulta sus vueltas; PASS con
99 capturas, matriz responsive sin overflow ni errores, 39 tests focales,
typecheck, lint y build. [Evidencia](../../strategy-planner/evidence/isa-1393/preflight-2026-09-25.md).
Es una corrección del banco simulado, no prueba del lector LMU. E01–E08 nativos
y T18 >9/10 siguen pendientes. Sin GUI nativa,
push, PR, CI, integración ni release.

## Build integrada sin ventana — ISA-1393 (2026-09-25)

El candidato local compiló frontend y Wails DEV tras #1277/#1375:
`bin/vantare.exe`, 44.077.056 bytes, SHA-256
`b992ce2fa02fd72b7aedef39d9d7b758f8b33e1a1d105b7ef9a61089bf4667e`.
La tarea usa `main.buildChannel=master`; el binario no se abrió ni acredita
licencia/canal de distribución. `go mod tidy -diff` y `go test ./...` pasan;
`go.mod` registra como directa la dependencia websocket ya importada por la
app. [Preflight actualizado](../../strategy-planner/evidence/isa-1393/preflight-2026-09-25.md).
La receta aprobada generó además `bin/vantare-localdev.exe` (46.366.208 bytes,
SHA-256 `9f698206b9ace9bb2be0abbd5e8693980acf0b138f867a9ea6d112ba7b93e3bf`)
con perfil temporal sin login; las combinaciones de tags localdev y
production+localdev pasaron. El preparador canónico instaló el runtime
publicado del lector en este `bin/`; manifiesto de cinco miembros y smoke
PASS, SHA-256 `700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`.
El ejecutable no se lanzó.
E01–E08 siguen pendientes; sin push, PR, CI, promoción ni release.

## Inventario local de resistencia — ISA-1375 (2026-09-25)

Se examinaron 369 DuckDB LMU estables en modo sólo lectura (298 P, 26 Q,
45 R); otros 48 tenían WAL y se excluyeron. El máximo fue Algarve R con 71
marcadores, ya usado en el banco de 66 vueltas completas. El archivo mayor
por tamaño, Sarthe P de 1.113,8 MiB, sólo tiene un marcador de vuelta 0.
No hay en este inventario una carrera independiente significativamente más
larga con la que certificar la cuota de resistencia. [Evidencia y límite](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md).
El barrido incluyó sólo conteos `Lap` de Race potencialmente reservadas para
#1030, sin señales ni etiquetas; no se usa para calibración ni como holdout
independiente. #1375 sigue abierta; falta fuente larga, presupuesto de memoria
y Wails T22.

## Composición visual incorporada al candidato T22 — ISA-1393 (2026-09-25)

El commit `508b6f0b` incorpora localmente el corte visual #1277 sobre el
candidato T22, sin tocar el backend. La rama #1393 reúne el frontend
corregido, 99 capturas y la revisión adversarial v5 con nota mínima 8,0/10.
El umbral T18 >9/10 y E01–E08 con Wails/LMU real siguen pendientes. El pase
completo de 4.317 tests frontend pertenece al estado anterior `30d0c46d`;
después del cambio visual pasaron 50 tests focales, lint y build. Sin push,
PR, CI, promoción ni release.

## T18 v5 · matriz visual provisional — ISA-1277 (2026-09-25)

En la rama aislada `vantareapp/isa-1277-strategy-v5-visual-parity`, desde el
candidato #1393, se actualizó el banco de capturas al menú y mesa v5. El
[`pass-v5-13`](../../strategy-planner/evidence/isa-1277-visual/pass-v5-13/README.md)
contiene 99 PNG; 16 combinaciones ES/EN/PT/IT por 320/768/1024/1672 px sin
desbordamiento horizontal ni errores, con foco visible. Se corrigieron fuentes
320, vueltas/plan 768 y nombres `.duckdb` 1024. Cuatro pruebas focales de
frontend (50 tests), lint, typecheck/build y `git diff --check` pasan. La
[revisión adversarial](../../strategy-planner/evidence/isa-1277-visual/reviews.md)
no encuentra P1/P2, pero la nota mínima es 8,0/10: **T18 aún no está aceptado**. La
puntuación A4 histórica no se aplica a v5. No se lanzó la GUI ni se demuestra
Wails/LMU/DuckDB real; E01–E08 de T22 siguen pendientes. Sin push, PR, CI,
promoción ni release.

## Aceptación manual desbloqueada en el harness — ISA-1393 (2026-09-25)

El recorrido manual del navegador simulado detectó un rechazo real del
contrato al aceptar la propuesta: las capacidades del borrador no estaban
ordenadas. Un test reprodujo `invalid_document (capabilities)` y el arreglo
ordenó la lista sin alterar backend ni contrato. El test focal pasó (2/2);
Strategy pasó 667/667, y typecheck, lint, build frontend y Wails DEV pasaron.
El navegador confirmó «Propuesta aceptada como revisión inmutable». El solver
y los datos de esa pantalla son simulados, por lo que E01 nativo sigue
pendiente. El mapa ausente en ese harness responde a `Imola`/`GP`, que no
coincide con el nombre completo del catálogo ni del fixture LMU; E02 debe
comprobar el contorno con la identidad nativa. Dos intentos paralelos de suite
frontend global no dieron un resultado válido por un `AbortError` de
`happy-dom`; la repetición completa secuencial sí pasó: 493 archivos, 4.317
tests PASS y 2 omitidos en 541,60 s. El binario actual sin
ejecutar mide 44.075.520 bytes, SHA-256
`f1cb254326b7f639db8ded90f6c3464b7f1025a215d19a19e24041982a2a7c9a`.
[Evidencia](../../strategy-planner/evidence/isa-1393/preflight-2026-09-25.md).
Sin push, PR, CI, promoción ni release.

## Candidato T22 integrado, sin GUI — ISA-1393 (2026-09-25)

La rama aislada #1393 contiene ahora la composición local de #1331, #1367,
#1373 y #1375 sobre el código `0786b3f4`; no se integró ningún canal. El
[registro de integración](../../strategy-planner/evidence/isa-1393/preflight-2026-09-25.md)
recoge los checks: Go completo PASS; 4.317 tests frontend PASS y 2 omitidos;
typecheck, lint, i18n y build PASS; 44 tests del contrato de roadmap PASS.
Dos bancos LMU reales (Algarve→Monza y Monza Hypercar→Imola) terminaron PASS con
paridad paginada, revisiones, restauración y SHA de originales intactos; también
pasó la recuperación de una copia verificada COTA tras retirar sólo una copia
temporal. La build Wails DEV integrada mide 44.075.520 bytes. Después de
reparar el mock del diálogo nativo, su SHA-256 actual es
`433108f4731837374f802a218d9da75f83e61fcea3c7269eada039b45d59984e`.
El navegador simulado ya recorrió entrada, selección/aplicación de sesión,
cálculo y edición de paradas; no prueba Wails ni DuckDB real. El script antiguo
de capturas queda FAIL por un selector del flujo anterior; la geometría Imola
GP aparece sin mapa en el harness y requiere contraste de identidad en E02.
Tras el arreglo del mock, una repetición global de frontend registró 4.314
PASS, 2 omitidos y 3 timeouts de Overlays; esas tres pruebas dieron 10/10 PASS
al repetirlas aisladas. No declarar verde esa repetición global.
No se ejecutó: E01–E08 requieren ventana nativa, licencia de desarrollo y
evidencia de interacción. Continúan abiertos la fuente larga independiente
para la cuota #1375 y el holdout anotado para calibración #1030. Sin push, PR,
CI, promoción ni release.

## Preflight nativo T22 — ISA-1393 (2026-09-25)

Se abrió [#1393](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1393)
y su rama/worktree aislados desde #1375 `45ab9a71`. El [preflight](../../strategy-planner/evidence/isa-1393/preflight-2026-09-25.md)
registra CLI Wails alpha.98, runtime WebView2 153.0.4234.48, SHA del último
binario disponible y matriz E01–E08 íntegramente pendiente. El fallo
`8007139F` es histórico; builds posteriores sí abrieron, así que no se le
atribuye causa ni estado actual. No se lanzó GUI para dejar libre el PC. Falta
recorrido nativo con hashes, logs y cuenta de distribución. La build exacta
`1fcb96f4` pasó frontend y Wails DEV sin abrir ventana (SHA-256
`9faef4111ee4b3f9e971bcba3598ef55bf92bdd9adc57cc0c96f479c1b46bf6f`);
el canal compilado por defecto fue `master`, no una prueba de licencia.
Sin push, PR, CI, merge, promoción ni release.

## Espera visible durante la proyección — ISA-1375 (2026-09-25)

Datos y Revisiones muestran ahora junto a la cabecera que una proyección está
releyendo telemetría y puede tardar, con cancelación visible. La fase distingue
el recálculo de la operación genérica; cancelar después de un guardado confirmado
conserva esa revisión y no adopta un resultado parcial. 96 tests focales,
typecheck, lint, 4.303 tests frontend (2 omitidos) y build frontend PASS.
No hay captura Wails de este estado: T22 sigue pendiente. También falta una
fuente LMU real de resistencia con muchas vueltas para medir y fijar su cuota.
Sin push, PR, CI, merge, promoción ni release.

## Proyección paginada activa y pico medido — ISA-1375 (2026-09-25)

Las proyecciones individual y conjunta ya comparten `DerivePagedCorrectedSession`
tras autorización, revisión exacta y revalidación de la misma base. Tests de
App/Analysis y banco LMU completo PASS (234,05 s), con cálculo, restauración y
hashes intactos. La comparación aislada de Algarve midió 94,3/50,0 MiB de
pico paginado en dos ejecuciones frente a 812,2 MiB materializado; presupuesto
provisional 128 MiB **sólo para esta grabación/proceso**. Proyección ~7 s frente
a 2,25 s en ejecuciones secuenciales, sin conclusión estable de velocidad.
Faltan fuente larga multivuelta, cuota respaldada por ese caso, Wails T22 y
UX de espera. [Evidencia](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md).
La visita de fronteras recoge también los eventos de boxes y evita otra
relectura completa cuando no hay parada. Perfil aislado posterior: 93,3 MiB,
6,21 s de proyección y resultado idéntico en Algarve; la variación entre
ejecuciones no permite atribuir una ganancia estable de tiempo.
Build frontend y build Wails DEV con CGO desactivado PASS; ejecutable presente
y hash documentado, sin abrir la app. Eso no cierra el recorrido WebView2 T22.
#1375 sigue abierta; sin push, PR, CI, merge, promoción ni release.

## Recolectores paginados de boxes y fronteras — ISA-1375 (2026-09-25)

El visitante autorizado alimenta dos recolectores: boxes acumula ascensos de
Fuel/VE sin retener el interior y la proyección conserva fronteras y eventos
acotados. `DerivePagedCorrectedSession` une esas piezas con la validez paginada
y el derivador existente. El modelo completo igualó al materializado en un
fixture de carrera para base y corrección de Fuel; el banco LMU Algarve→Monza
igualó una revisión corregida real de Lap Time y terminó PASS en 153,08 s,
con hashes intactos. La corrección se aplica después de alinear con el GPS
original. En ese corte aún no era ruta productiva; las dos entradas y el pico
medido se cerraron en el apartado superior. Siguen faltando fuente larga
multivuelta y T22.
Una regresión adicional corrigió GPS justo en el límite de vuelta, expuso
una realineación indebida y quedó resuelta: el GPS original sigue siendo el
reloj. La paridad GPS está probada en fixture, no en DuckDB real.
[Evidencia](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md).
#1375 abierta, sin push, PR, CI, merge, promoción ni release.

## Boxes desacoplado de páginas retenidas — ISA-1375 (2026-09-25)

La construcción de la parada acepta ascensos compactos por intervalo.
Un test compara el resultado completo de `pitRiseScan` alimentado por filas
sucesivas con la ruta materializada; otro confirma que la derivación de
carrera conserva el mismo modelo usando sólo filas de frontera más una
parada separada. Falta conectar esas dos piezas al visitante autorizado,
comparar una revisión real y medir el pico antes de activar proyección
paginada. [Evidencia](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md).
#1375 continúa abierta, sin push, PR, CI, merge, promoción ni release.

## Derivador compartido y lector alineado — ISA-1375 (2026-09-25)

El cálculo de la proyección se separó de la validación/materialización de la
fuente, preservando la ruta productiva. Un ensayo sólo de test compara el
modelo completo con filas de frontera en S045 y en un fixture de carrera:
consumo/curvas coinciden; boxes exige visitar el interior de la parada.
`visitAlignedCorrectionPages` reproduce páginas Lap/Lap Time alineadas del
lector autorizado y rechaza una sesión cambiada, pero aún no alimenta la
proyección. Siguiente: recolectar límites desde esa visita, usar
`pitRiseScan` para boxes sin conservar sus muestras y comparar la revisión
completa con DuckDB real. [Evidencia](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md).
#1375 sigue abierta; no hay soporte de resistencia, push, PR, CI ni promoción.

## Ascensos de boxes sin copia de ventana — ISA-1375 (2026-09-25)

`observeRise` alimenta ahora `pitRiseScan` muestra a muestra: conserva sólo el
valor anterior, la suma y los instantes del primer/último ascenso. La prueba
focal cubre páginas partidas, umbral, presencia y duración cero. Suite Go,
vet y banco real Algarve→Monza PASS en 131,40 s; ritmo/Fuel, cálculo,
restauración e hashes de ambos originales intactos. El banco no mide memoria
ni acredita velocidad estable. `DeriveSessionPitObservation` sigue creando
series completas; el acumulador aún debe recibir páginas autorizadas para
cerrar la proyección. #1375 continúa abierta, sin integración.

## Frontera de proyección auditada — ISA-1375 (2026-09-25)

La proyección individual y la conjunta comparten `deriveCorrectionSession` y
siguen reteniendo páginas completas. El [ADR 0012](../../adr/0012-strategy-recorded-bounded-reading.md)
identifica las consultas exactas a Fuel, VE, clima, mezcla, compuesto y
desgaste, más todas las muestras dentro de boxes; fija también los distintos
desempates ante marcas temporales duplicadas. Una regresión protege esos
desempates antes de reducir series. El siguiente corte es un recolector de
fronteras/ventanas alimentado por páginas y su paridad de proyección completa,
primero en fixtures y después en Algarve real. Nada de esto acredita aún
resistencia; #1375 sigue abierta y sin integración.

`orderedProjectionBoundaryScan` ya conserva como máximo las filas anterior y
posterior por instante en una señal ordenada, con paridad escalar/vectorial
frente a la serie completa. Todavía no está conectado al parser ni al
derivador; la siguiente pieza es la lectura alineada y el resumen de ascensos
de Fuel/VE dentro de boxes, sin retener cada muestra del intervalo.

## Guardado paginado de correcciones — ISA-1375 (2026-09-25)

El guardado usa el resumen del original revalidado, lee sólo las filas
solicitadas y deriva validez efectiva por páginas para correcciones mixtas.
Una regresión compara snapshots escalares y mixtos con el oráculo materializado;
el banco real Algarve→Monza pasó en 269,64 s con cálculo, historial y hashes
originales intactos. [Evidencia y límites](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md).
La variación de tiempo entre bancos individuales no acredita una mejora de
rendimiento. Proyección sigue materializando; faltan fuente larga multivuelta,
presupuesto medido de memoria y Wails T22. #1375 permanece abierta, rama local
sin push, PR, CI, merge, promoción ni release.

## Inspección paginada de vueltas — ISA-1375 (2026-09-25)

`InspectCorrectionLaps` ya no recibe todas las páginas de `CorrectionInput`:
reúne el resumen original, lee sólo las filas nombradas por la revisión
exacta, valida el snapshot mixto existente y deriva validez efectiva mediante
páginas corregidas sin alterar la fuente. La página pública usa el mismo
constructor que la ruta materializada. Paridad de validez y página en fixtures
de Lap Time/GPS Time, revisión escalar guardada y banco real Algarve→Monza
PASS: corrección temporal de Lap Time idéntica, cálculo e historial intactos,
hashes originales invariables (215,01 s). [Evidencia](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md).
El resumen original queda en el handle abierto y se reutiliza sólo tras
`Inspect` fresco; el test confirma navegación sin reread de muestras y retiro
al cambiar la evidencia. El banco real repetido con ese ajuste pasó en
99,46 s con idéntica paridad y hashes. La variación frente a 215,01 s no es
una prueba A/B de velocidad.
Guardar y proyectar siguen materializando; faltan comparaciones exhaustivas
de snapshots mixtos, fuente larga multivuelta, presupuesto de memoria de
producto y Wails T22. #1375 continúa abierta, rama local sin push, PR, CI,
merge ni promoción.

## Identidad reutilizada para historial — ISA-1375 (2026-09-25)

Las cuatro consultas de historial de correcciones ya no leen todas las
muestras tras una preparación o lectura previa: reutilizan sólo la identidad
base dentro de la sesión abierta y ejecutan `Inspect` para verificar de nuevo
SHA-256 y catálogo antes de cada operación. En una sesión aún sin base se
calcula una vez con el resumen paginado. El test focal cubre reutilización,
cancelación y evidencia cambiada; `go test ./...`, vet y diff check pasaron.
Banco real Algarve→Monza PASS en 132,81 s: paridad de preparación, proyección,
cálculo, revisiones exactas, reapertura y hashes originales intactos. Este
tiempo **no acredita una mejora** frente al banco anterior de 87,21 s; una
primera ejecución anómala tardó 429,46 s y no verificó el resultado del test.
La mejora demostrada es evitar lecturas de muestras por cada consulta de
historial. [Evidencia](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md).
Guardar y proyectar siguen materializando; faltan paridad paginada de esas
operaciones, fuente larga multivuelta y Wails.
#1375 sigue abierta; rama local sin push, PR, CI, merge ni promoción.

## Relecturas de historial descartadas — ISA-1375 (2026-09-25)

Un ensayo de usar el resumen paginado para cuatro consultas de historial
conservó resultados reales, pero el recorrido Algarve→Monza tardó 288,18 s
frente a 87,21 s de la ejecución anterior. La modificación se retiró antes
de commit: esas consultas siguen en `withCorrectionInput`. [Evidencia](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md).
El siguiente diseño debe evitar releer toda la telemetría para cada consulta
de historial y mantener revalidación exacta de la fuente; no cambiar estas
rutas sólo porque el resumen exista.

## Banco de volumen sin importación previa — ISA-1375 (2026-09-25)

El DuckDB limpio de Imola (264,10 MiB; SHA-256 intacto) se recorrió tres veces
con `ReadCorrectionSummary` y un presupuesto elevado **sólo en el banco**.
Al aislar la apertura/lectura del importador de catálogo, el pico de proceso
fue 50,8/50,8/51,1 MiB y el tiempo 54,09/53,49/53,31 s. La medición anterior
de ~2,2 GiB estaba contaminada: `HeapSys` ya era ~2,5 GiB antes del resumen.
Esta fuente aporta únicamente una vuelta, así que demuestra comportamiento de
volumen continuo, **no** carrera de resistencia. Las cuotas productivas siguen
en 1,25 M muestras/1,5 M valores y aún faltan inspección/proyección paginadas,
fuente larga multivuelta, Wails y precisión empírica. [Evidencia y límites](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md).

## Preparación productiva con resumen paginado — ISA-1375 (2026-09-25)

`PrepareCorrections` ya usa `ReadCorrectionSummary` bajo el mismo bloqueo,
autorización y lector LMU. No devuelve todas las páginas; conserva eventos
acotados, relee señales continuas con ventanas GPS y produce idénticos base,
sesión alineada y validez que el lector anterior en la fuente real disponible.
La lista de canales editables también coincide. Una lectura cancelada permite
reintentar con el mismo handle; una fuente incompatible sigue retirándose.
Suite Go, vet focal y banco real Algarve→Monza PASS; 71 eventos, 70 reinicios, 66 vueltas completas,
correcciones/reapertura intactas y ambos hashes originales invariantes.
[Banco A/B de tres ejecuciones](../../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md):
picos anteriores 531,5–596,0 MiB y nuevos 433,5–657,4 MiB; tiempos 8–9 s
frente a ~15–16 s. **No hay ahorro de pico demostrado** en
esta grabación y las relecturas cuestan tiempo. No se elevó la cuota. Inspección,
guardado y proyección aún retienen páginas; faltan fuente larga, memoria por
etapa, paridad de correcciones paginadas y Wails. #1375 continúa abierta,
sin push, PR, CI, merge, promoción ni release.

## Ventana de cobertura alimentable por páginas — ISA-1375 (2026-09-25)

La cobertura continua de validez puede acumular sólo extremos, frecuencia y
último índice/tiempo cuando las páginas llegan ordenadas. La API pura conserva
la ordenación anterior para páginas fuera de orden, incluso si una posterior
rellena un hueco. La regresión compara ambos recorridos en continuidad,
huecos, reloj inválido y ausencia de tiempo; `go test ./...` y el banco real
Algarve→Monza pasan (71 eventos, 70 reinicios, 66 vueltas completas y hashes
originales invariantes). Este acumulador todavía recibe páginas retenidas por
`ReadCorrectionInput`: **no** demuestra memoria acotada ni soporte de
resistencia. La sustitución de `withCorrectionInput`, la medición de pico y
Wails siguen pendientes; #1375 continúa abierta. Rama local sin push, PR, CI,
merge, promoción ni release.

## Ascensos de Fuel sin copia de la señal — ISA-1375 (2026-09-25)

La validez productiva detecta ahora subidas de combustible en páginas ordenadas
con sólo el valor anterior y los ascensos completos; la API pura conserva la
ordenación anterior si recibe páginas fuera de orden. Una prueba RED→PASS
contrasta ascensos que cruzan páginas, mesetas, descenso y fallback. La suite
Go completa y `go vet` de Analysis pasan. El banco real S266 Algarve→S026
Monza pasó en 69,20 s: 71 eventos, 70 reinicios, 66 vueltas completas, ritmo
seco 95,190 s (N=58), Fuel 2,135 L/vuelta (N=58), 38 vueltas/0 paradas y
optimalidad probada **sólo para el evento supuesto**; correcciones, reapertura
y ambos hashes originales invariantes. No se midió un pico nuevo: esta mejora
elimina una copia interna, pero `withCorrectionInput` todavía retiene todas las
páginas. No se acredita soporte de resistencia ni QA Wails; #1375 sigue
abierta. Rama local sin push, PR, CI, merge, promoción ni release.

## Segunda visita limitada a Lap Dist — ISA-1375 (2026-09-25)

El lector paginado permite seleccionar un único canal en una visita privada.
Tras validar todos los canales y el puente GPS en la primera visita, el banco
incremental de reinicios relee sólo `Lap Dist` para comprobar cobertura y
asignar tiempos mediante ventanas GPS. Una regresión reprodujo la lectura
duplicada de `Fuel Level` (6 consultas frente a 3 de la primera visita) y
ahora exige que no se repita; la suite Go completa y `go vet` del paquete pasan.
Esta ruta todavía no alimenta `withCorrectionInput`: no se atribuye ahorro de
memoria productiva, velocidad real ni soporte de resistencia. El siguiente
corte debe convertir validez y proyección en consumidores de páginas, comparar
contra el oráculo materializado y medir el pico con DuckDB real. #1375 sigue
abierta, sin push, PR, CI, merge, promoción ni release.

## Disponibilidad del banco largo — ISA-1375 (2026-09-25)

Se consultó sólo el catálogo DuckDB en modo lectura de los originales LMU:
417 archivos, 369 sin WAL y todos ellos consultables. Entre los 369, S266
Algarve sigue teniendo el máximo de filas `Lap` (71); Monza S026 tiene 61.
El mayor archivo (1,1 GiB, Sarthe) tiene WAL y no es fuente estable para el
banco. Un Imola sin WAL de 264 MiB contiene 3.092.102 filas `GPS Time` pero
sólo una fila `Lap`: sirve para tensionar lectura/índice, no para certificar
una carrera completa. No se alteraron los originales. La validación de una
resistencia más larga con vueltas reales necesitará otra grabación elegible;
el desarrollo y la paridad con S266 pueden seguir mientras tanto.

## Reinicios de vuelta con reloj GPS por ventanas — ISA-1375 (2026-09-25)

Una lectura privada usa el visitante paginado para validar la fuente y el
puente GPS completo, acumula sólo los reinicios `Lap Dist` y relee ventanas GPS
para comprobar la cobertura de **cada** muestra de distancia antes de asignar
instantes a los reinicios. Los tests comparan reinicios, frecuencia y motivos
de alineación con la ruta materializada para reloj válido, cobertura truncada,
reloj no monótono y formas de puente inválidas; también cubren cancelación y
cuotas. Es un paso hacia el consumidor de validez, no está conectado todavía
a `withCorrectionInput`. La segunda visita vuelve a recorrer todos los canales:
hay que medir su tiempo con DuckDB reales y reducirla si afecta la experiencia.
No hay aún prueba de pico de memoria acotado ni evidencia Wails.

## Consulta GPS por ventanas — ISA-1375 (2026-09-25)

Un lector privado reutiliza `CorrectionInputReader.ReadPage` para obtener sólo
la ventana GPS que contiene el índice requerido. Valida forma, frecuencia,
índices, valores finitos y cancelación antes de devolver un instante; una
prueba lo compara con `BuildTemporalAlignment` para canales de frecuencia
distinta y cubre ausencia y página malformada. Todavía no está conectado al
consumidor productivo: sólo demuestra que el cruce por índice se puede hacer
con una página en memoria, no que Strategy ya tenga memoria acotada. La
prueba real Algarve/Monza anterior no ejercita este lector nuevo; debe
repetirse al integrarlo. `withCorrectionInput` sigue reuniendo todas las
páginas. Sin nuevos presupuestos, dependencias ni cambios de originales.

## Reinicios de vuelta alimentables por páginas — ISA-1375 (2026-09-25)

La detección ordenada de reinicios `Lap Dist` comparte ahora un acumulador
entre la ruta materializada y una visita paginada sin retener la señal continua.
Una prueba compara ambas rutas y otra alimenta el estado desde
`VisitCorrectionPages` con páginas crudas de origen temporal desconocido.
Conserva el fallback anterior si las páginas están desordenadas. Las páginas
crudas aún requieren el puente GPS antes de publicar tiempos de reinicio;
esta paridad de índices no sustituye la alineación. La suite Go completa y
`go vet` del paquete pasan. Banco real posterior con S266 Algarve como fuente
y S026 Monza como objetivo: PASS en 94,31 s, 71 eventos, 70 reinicios, 66
vueltas completas; ritmo seco 95,190 s (N=58), Fuel 2,135 L/vuelta (N=58),
38 vueltas/0 paradas y optimalidad probada sólo para el evento supuesto.
Correcciones, clasificación, identidad, familias, restauración y reapertura
pasaron; ambos SHA-256 originales permanecieron intactos. No se midió una
paridad A/B numérica de memoria o tiempo. `withCorrectionInput` continúa
materializando todas las páginas: no se ha medido un nuevo pico ni se acredita
soporte de resistencia. Siguiente corte: cruce GPS por ventanas y consumidor de validez
sin retención, con comparación real antes de sustituir producción. Rama local
sin push, PR, CI, merge, promoción ni release.

## Reloj GPS alimentable por páginas — ISA-1375 (2026-09-24)

El reloj ordenado reutiliza ahora un acumulador de último índice/instante y monotonía, apto para recibir páginas sucesivas sin retenerlas. Paridad con el reloj materializado y con `VisitCorrectionPages` sobre el lector controlado PASS; paquete `internal/telemetryanalysis` completo PASS. La suite Go global terminó roja por dos timeouts externos (`voiceinput` e Imola Strategy), ambos verdes en repetición aislada. No se ejecutó el banco real porque las variables opt-in de fuente primaria, destino y runtime no están presentes en esta sesión. [Evidencia y límites](../../strategy-planner/evidence/isa-1375/allocation-dependencies-2026-09-24.md). `withCorrectionInput` sigue reteniendo todas las páginas: falta consumidor incremental, memoria pico medida, paridad real y Wails. #1375 permanece abierta; sin push, PR, CI, merge, promoción ni release.

## Cobertura continua en orden — ISA-1375 (2026-09-24)

La ventana de cobertura de validez evita copiar/ordenar toda la señal cuando las páginas están ordenadas; preserva la ruta anterior para desorden y comprueba que una página posterior pueda llenar un hueco. Paridad focal, suite Go completa y banco real Algarve/Monza PASS, con resultados y hashes originales invariantes. `alloc_space` total 35.370→35.378 MiB no permite atribuir ahorro medido. [Evidencia](../../strategy-planner/evidence/isa-1375/allocation-dependencies-2026-09-24.md). La ruta productiva aún retiene todas las páginas y no hay memoria pico ni Wails; #1375 sigue abierta. Próximo trabajo decisivo: consumidor incremental de validez/proyección en `withCorrectionInput`, sin elevar la cuota de muestras. Sin push, PR, CI, merge, promoción o release.

## Reinicios de vuelta sin copia de serie completa — ISA-1375 (2026-09-24)

`Lap Dist` se recorre en orden con sólo la muestra anterior; entradas fuera de orden conservan la ruta ordenada previa. Paridad focal, suite Go completa y banco real Algarve/Monza PASS con 71 eventos, 70 reinicios, 66 vueltas completas, ritmo/Fuel y plan supuesto invariantes; hashes originales intactos. El perfil acumulado del banco bajó 36.396→35.370 MiB y desaparecieron los 1.108 MiB propios que antes se atribuían a `readLapDistResetObservations`. No es memoria pico ni soporte de resistencia. [Evidencia](../../strategy-planner/evidence/isa-1375/allocation-dependencies-2026-09-24.md). Sigue pendiente el consumidor productivo sin retener páginas, la paridad de todas las correcciones, la medición de pico y la prueba Wails; #1375 sigue abierta. Sin push, PR, CI, merge, promoción o release.

## Reloj GPS sin mapa global en lectura propia — ISA-1375 (2026-09-24)

La alineación de páginas propias y ordenadas ya busca tiempos GPS en sus páginas sin construir el mapa de cada muestra; el API puro conserva la ruta general y los casos fuera de orden recurren a ella. Paridad focal y dos bancos reales A/B con el mismo S266 Algarve y otra Monza pasan, hashes intactos: `buildGPSClock` asigna acumulativamente 4.394→1.216 MiB y el test completo 39.697→36.396 MiB. No se ha medido un pico nuevo y los 86,86→70,42 s de una sola pasada por versión no prueban una mejora temporal estable. [Evidencia](../../strategy-planner/evidence/isa-1375/allocation-dependencies-2026-09-24.md). La producción todavía retiene todas las páginas y las derivaciones las vuelven a copiar; #1375 sigue abierta. Siguiente: validez y proyección desde visitas paginadas, con paridad de correcciones y memoria pico medida.

## Frontera de memoria para resistencia — ISA-1375 (2026-09-24)

La revisión del flujo confirma que `withCorrectionInput` materializa todas las páginas antes de preparación, inspección, guardado o proyección; las dos últimas vuelven a copiar/alinear vistas. Reducir copias es útil, pero no puede cumplir por sí solo memoria `O(vueltas + correcciones + página)`. [ADR 0012](../../adr/0012-strategy-recorded-bounded-reading.md) fija la frontera común de sustitución. `VisitCorrectionPages` ya permite visitar páginas del mismo parser autorizado, con cuotas, validación y cancelación compartidas; `ReadCorrectionInput` la utiliza, pero todavía retiene el conjunto completo. La prueba focal compara cobertura y salida anticipada; la suite Go completa y el banco real S266 Algarve/otra Monza pasan, con originales intactos. Faltan paridad GPS incremental, consumidor productivo sin retención, medición de pico y QA Wails. [Evidencia](../../strategy-planner/evidence/isa-1375/allocation-dependencies-2026-09-24.md). No hay soporte demostrado de 24 h; #1375 sigue abierta y ningún presupuesto se ha elevado.

## Primer corte de memoria registrada — ISA-1375 (2026-09-24)

`ReadCorrectionInput` alinea ahora las páginas nuevas que posee, sin la copia profunda previa; `BuildTemporalAlignment` público conserva su aislamiento. La regresión compara ambos resultados y el banco real S266 Algarve pasó tres veces por versión con idénticos ritmo, Fuel, aplicabilidad de VE y plan supuesto; hashes originales intactos. Los picos de working set variaron mucho (antes 855,1/790,2/772,4 MiB; después 820,2/772,1/765,7 MiB), así que no se reclama un porcentaje de ahorro ni soporte de 24 h. Un segundo corte simplifica el reloj GPS: el banco real vuelve a pasar y sus asignaciones acumuladas bajan de 7.014 a 4.430 MiB en esa función, sin acreditar un pico menor. La preparación sigue reteniendo páginas completas y la derivación de revisiones las vuelve a copiar. [Evidencia y límites](../../strategy-planner/evidence/isa-1375/owned-alignment-2026-09-24.md). El [perfil y mapa de dependencias](../../strategy-planner/evidence/isa-1375/allocation-dependencies-2026-09-24.md) fundamentan el [ADR 0012 propuesto](../../adr/0012-strategy-recorded-bounded-reading.md); no son aceptación de la arquitectura. Focal Go, build frontend y suite Go global PASS. Pendientes paridad/memoria acotada, Wails y aceptación T22. Sin push, PR, CI, merge, promoción ni release.

## Sesiones largas y Hypercar — ISA-1210 / ISA-1367 (2026-09-24)

El contrato de correcciones vuelve a reflejar el límite productivo medido de 1,25 M muestras/1,5 M valores y advierte que las páginas siguen acumulándose en memoria. Esta conciliación documental no amplía el soporte a carreras de 24 h ni altera el lector.

El banco real actual reprodujo el límite de preparación de #1210 en S266 Algarve y S026 Monza. Se midieron 1.138.082 y 1.002.172 muestras requeridas frente al techo de 1.000.000; S125 Imola consume 626.191 y ~453 MiB de working set. Un presupuesto todavía acotado de 1,25 M muestras/1,5 M valores permite S266 (38 vueltas, 0 paradas, `optimality=proven` en un evento supuesto) con ~837 MiB observados; los hashes originales siguen intactos. No equivale a soporte de carreras de 24 h: la lectura por streaming y su memoria siguen pendientes. S026 ya entrega ritmo/Fuel/VE `valid`, pero el solver agota 100 M iteraciones y no demuestra óptimo; [#1367](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1367) registra la reproducción. [Evidencia y límites](../../strategy-planner/evidence/isa-1210/long-session-budget-2026-09-24.md). Wails, distribución y precisión empírica pendientes; sin push, PR, CI, merge, promoción ni release.

## Segundo recorrido visual registrado — ISA-1331 (2026-09-25)

En el navegador interno, con el servidor mock existente en 127.0.0.1:5209,
Imola Race abrió Preparación y la mesa en el primer intento. Se consultaron
las cinco vueltas de Datos, se editó un piloto, se configuró un evento de 240
minutos con Fuel, energía virtual y paradas, y la condición seca habilitó el
cálculo. La validación impidió abrir la mesa con un piloto sin nombre. El error
genérico de guardado registrado antes no se reprodujo en este recorrido; su
causa sigue sin aislarse.

El mock devuelve un plan fijo de 69 vueltas y 2:02:38 para ese evento de 240
minutos, incluso con la etiqueta «Estrategia óptima demostrada». Es una
incoherencia del **harness ilustrativo**, no evidencia del SolverV2 ni de una
estrategia válida para cuatro horas. La app productiva no usa esa respuesta.
La validación con DuckDB real, Wails y aceptación T22 siguen pendientes; no
se hicieron cambios de código en #1331 en esta pasada. Rama local sin push,
PR, CI, merge, promoción ni release.

## Datos manuales dentro de la mesa — ISA-1331 (2026-09-25)

Revisión posterior del recorrido registrado en navegador interno (runtime mock,
puerto 5209): Imola Race abrió Preparación; después Carrera, Datos, selección
explícita de la sesión y consulta de cinco vueltas funcionaron. Un primer
intento de abrir la mesa devolvió el error genérico de guardado; tras recargar,
la misma secuencia abrió correctamente. No hay causa ni reproducción estable:
queda como incidencia intermitente por aislar, sin afirmar que esté corregida.
El runtime mock no acredita persistencia Wails ni lectura del DuckDB real.

El navegador interno reprodujo un error de continuidad: al abrir «Datos» desde
una carrera manual sin sesiones, la mesa pedía elegir un DuckDB; «Revisiones»
mostraba un historial de correcciones de telemetría que no existía. La mesa
ahora edita y guarda las mismas referencias manuales que Preparación, el
lateral indica su procedencia y «Revisiones» desaparece de la ruta manual sin
inspección.
El texto de pilotos de la vista Carrera tampoco exige sesiones en modo manual.
Una inspección registrada fallida conserva su error y la vía a la biblioteca;
no se confunde con las referencias manuales. Regresión RED→PASS y suite
frontend completa: 493 archivos, 4.304 tests PASS, dos omitidos. Tras añadir
el guardado visible dentro de Datos, 32 pruebas focales, typecheck, lint y
build pasan. La revisión visual del estado manual a 1280×720 mostró la nueva
composición. En el navegador mock, editar ritmo 97,5 s y Fuel 2,8 L/vuelta
activó «Guardar revisión» y el guardado devolvió «Borrador guardado». El navegador
usa `VITE_RUNTIME_MOCK=mock`: la navegación y edición vistas no prueban
DuckDB, SolverV2 ni persistencia Wails. T22, calibración #1030, memoria
acotada #1375, aceptación visual e integración siguen pendientes. Rama local
sin push, PR, CI, merge, promoción ni release.

## Procedencia visible del cálculo manual — ISA-1331 (2026-09-24)

El recorrido completo en el navegador interno llegó desde Manual a la mesa con combinación LMGT3/Imola, ritmo 97,5 s, Fuel 2,8 L/vuelta, VE 3,5 %/vuelta, evento de 60 min, reglas y un piloto. La condición seca habilitó el cálculo sin sesiones. Antes de hacerlo, Plan mostraba «0 sesiones seleccionadas» y Pilotos pedía validar el ritmo con sesiones, pese a que el motor admite referencias manuales. Ahora ambos paneles describen las estimaciones manuales y advierten que no están contrastadas con telemetría. Regresiones focales 9/9, i18n, lint, typecheck y build PASS. La primera suite completa dio cinco tiempos de espera de layout mientras ESLint corría a la vez; esos cinco pasaron aislados. La repetición completa con cuatro workers terminó verde: 493 archivos, 4.303 tests PASS, dos omitidos.

El servidor en `127.0.0.1:5208` usa `VITE_RUNTIME_MOCK=mock`. Su respuesta de cálculo es un plan fijo de 69 vueltas incluso cuando el evento introducido dura 60 minutos: demuestra navegación y estados de UI, **no** el resultado real de SolverV2. La prueba de contrato `use-recorded-calculation.test.tsx` confirma por separado que Manual envía ritmo/Fuel como overrides con procedencia manual y no solicita una proyección de sesiones. T22 Wails/DuckDB, precisión empírica, integración y aceptación visual de Isaac siguen abiertos. Rama aislada sin push, PR, CI, merge, promoción ni release.

## Entrada a la mesa v5 desde preparación — ISA-1331 (2026-09-24)

El recorrido en navegador interno reprodujo que «Abrir mesa de carrera» seleccionaba Plan aun con evento, reglas y pilotos pendientes. El botón abre ahora Carrera, que presenta las tres ediciones y el estado del plan; Plan sigue disponible por pestaña. Regresión RED→PASS, 492 archivos/4301 tests frontend PASS (2 omitidos), tipos, lint, i18n y build PASS. El recorrido visual se hizo con el harness mock, no con DuckDB/Wails real; no valida persistencia nativa ni acepta T22. Rama aislada sin push, PR, CI, merge, promoción ni release.
## Revalidación de copia y recuperación — ISA-1373 (2026-09-25)

El banco opt-in con el DuckDB COTA real volvió a pasar en HEAD `3a291597`
(2,98 s): original sin WAL y SHA-256 intacto, copia verificada, desaparición
del duplicado de trabajo, recuperación desde la copia y misma revisión
corregida tras reabrir. [Evidencia](../../strategy-planner/evidence/isa-1373/real-copy-recovery-2026-09-24.md).
No acredita aún selector de carpeta ni recorrido Wails E04; tampoco se corrió
la suite Go global o CI en esta repetición. Rama aislada, sin push/PR/merge.

## Copia opcional de fuente — ISA-1373 (2026-09-24)

E04/A02 detectó que el importador de arranque declaraba `managed_copy` aunque borraba la copia privada al terminar. En la rama aislada #1373, la declaración pasa a `reference`; Analysis guarda desde una sesión abierta una copia separada en carpeta elegida, verifica tamaño/SHA-256 y conserva el original. Strategy ofrece el selector de carpeta y puede elegir expresamente otro DuckDB fuera de las raíces configuradas, con estabilidad/WAL y lector existentes. El tercer corte registra bajo Analysis la ruta original y de copia en un registro local privado de entradas inmutables; sólo devuelve una copia registrada al faltar el original y tras verificar tamaño y SHA-256. El Open comprueba además el ID de fuente esperado. Hay estados tipados para original presente, copia cambiada/ausente, WAL activo y registro dañado. Un cuarto corte clasifica permisos y falta de espacio al guardar la copia, incluidos los códigos de disco lleno de Windows, y mantiene el borrado de la copia incompleta. Un quinto corte expone esos estados mediante `SaveVerifiedCopyStatus` y mensajes localizados en las cuatro lenguas de Strategy; también distingue error de registro y de limpieza sin anunciar una copia guardada. Un sexto corte da prioridad al fallo de retirada del archivo incompleto cuando coincide con un error de escritura. La prueba unitaria retira el original, reinicia el servicio y recupera la misma sesión/base/revisión inicial; altera después la copia sin cambiar tamaño y la rechaza. El fallo al registrar elimina la copia recién creada. El banco opt-in con DuckDB LMU real retira sólo un duplicado temporal, reinicia Analysis y recupera y proyecta una revisión con una exclusión de ritmo efectiva; el hash del original permanece intacto. Faltan QA Wails del recorrido y fallos físicos de permisos/espacio; no se declara E04/A02 cerrado. En el quinto corte, Go completo, 39 tests frontend focales, 4.310 tests frontend (2 omitidos), typecheck, lint, auditoría i18n y build pasaron. Sin push, PR, CI, merge, promoción ni release.

El cuarto corte pasa `go test -p 1 ./... -count=1`, los tests focales de Analysis/app y `git diff --check`. La prueba de error inyectado cubre permisos, `ENOSPC` y códigos Win32 39/112; no simula un disco físico lleno ni acredita todavía el mensaje final en Wails.
## Ensayos de dominancia Hypercar — ISA-1367 (2026-09-24)

Dos cambios mínimos se probaron y retiraron en el worktree aislado de #1367. Filtrar por Fuel/VE antes de comparar conserva la suite solver, pero el banco real S026 Monza pasa a `calculation_timeout`; recorrer una vez la frontera también conserva la suite, pero continúa en `calculation_overflow`. La fuente conserva sus hashes y proyecta ritmo, Fuel y VE válidos. La [issue #1367](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1367) registra los resultados. El siguiente corte requiere reducir la generación de estados con un oráculo exhaustivo acotado; no hay optimización lista para integrar ni se declara probado un plan incompleto.
## Revalidación Hypercar — ISA-1367 (2026-09-25)

El banco real del HEAD `d293b595` volvió a pasar con Monza S026 e Imola S125:
61 eventos/60 reinicios, ritmo seco `valid` 97,559 s (N=53), Fuel `valid`
2,876 L (N=53), VE `valid` 3,328 puntos/vuelta y, para un evento supuesto de
60 min, 37 vueltas/una parada con `optimality=proven`. Revisión exacta,
reapertura y correcciones de clasificación, identidad y familias pasaron;
hashes originales intactos. Solver completo y `go vet` PASS. [Evidencia](../../strategy-planner/evidence/isa-1367/one-pit-certificate-2026-09-24.md).
No se ejecutó Wails/CI ni la suite Go global en esta revalidación. La rama
continúa aislada y depende del stack local v5; sin push, PR, merge ni release.

## Hypercar Fuel + VE — certificado de una parada (#1367, 2026-09-24)

La carrera S026 Monza real ya no agota la dominancia para el evento supuesto de 60 min, 90 L y 40 s de parada: un certificado acotado enumera cero/una parada y demuestra que dos o más no pueden mejorarla mediante una cota optimista de todas las particiones. Sale 37 vueltas, una parada y `optimality=proven` dentro del modelo; no es precisión empírica de una carrera real. La regresión RED, 24 casos frente a oráculo exhaustivo y un caso donde sí gana otra parada pasan. S026 y S125 pasan en el banco nativo con hashes originales intactos. `pnpm --dir frontend build` y la suite Go completa pasan tras generar `frontend/dist`, ausente inicialmente. [Argumento, evidencia y límites](../../strategy-planner/evidence/isa-1367/one-pit-certificate-2026-09-24.md). El certificado cae a la búsqueda existente fuera de su dominio. Siguen pendientes la lectura/memoria acotada de #1375, la calibración independiente #1030 y QA Wails/T22. Rama aislada sin push, PR, CI, merge, promoción ni release.

## Dominancia Hypercar — experimento descartado (2026-09-24)

Sobre S026 Monza Hypercar real se probaron, y se retiraron, dos prefiltros conservadores antes de comparar estados de SolverV2. Saltar estados con tiempos distintos no cambió el agotamiento: `iteration_budget_exhausted`, 76.237 candidatos, 100.000.001 comparaciones, 42.933 estados podados, cero planes completos en 4,30 s de solver. Filtrar además pares con Fuel/VE insuficientes conservó la suite focal, pero el banco nativo llegó a `calculation_timeout` después de 23,61 s de recorrido total, sin óptimo. Los dos originales conservaron sus SHA-256. El worktree vuelve a estar sin cambio de algoritmo; reducir sólo el coste de cada comparación no resuelve la explosión de estados. Siguiente: una reducción estructural de candidatos con prueba frente al oráculo exhaustivo acotado. No subir presupuestos ni declarar óptimo parcial.

Diagnóstico adicional retirado: el caso usa curva combinada, Fuel y VE, incertidumbre dura, un piloto y ninguna dimensión de neumáticos, clima o peso de combustible. Antes de completar el horizonte, el frente ya contiene 3.100 estados en la vuelta 30. Un índice experimental que conservaba sólo dominancia entre estados con Fuel/VE idénticos pasó la suite focal, pero perdió la poda entre niveles de recursos y el banco real agotó el plazo (28,98 s de recorrido total). Tampoco se acepta. La solución debe conservar la poda cruzada y hacerla más barata o reducir las cantidades de servicio con un argumento de equivalencia exacta.

Un segundo índice experimental conservó la poda cruzada Fuel/VE en línea. La suite del solver pasó, pero el banco S026 agotó los 8 s de plazo; con 30 s **sólo diagnósticos** terminó igualmente en `calculation_overflow` (40,44 s de banco completo). El índice y el aumento temporal del plazo fueron retirados. No hay una mejora algorítmica demostrada ni se cambia el límite de producción.
## Sesiones largas y Hypercar — ISA-1210 / ISA-1367 (2026-09-24)

El banco real actual reprodujo el límite de preparación de #1210 en S266 Algarve y S026 Monza. Se midieron 1.138.082 y 1.002.172 muestras requeridas frente al techo de 1.000.000; S125 Imola consume 626.191 y ~453 MiB de working set. Un presupuesto todavía acotado de 1,25 M muestras/1,5 M valores permite S266 (38 vueltas, 0 paradas, `optimality=proven` en un evento supuesto) con ~837 MiB observados; los hashes originales siguen intactos. No equivale a soporte de carreras de 24 h: la lectura por streaming y su memoria siguen pendientes. S026 ya entrega ritmo/Fuel/VE `valid`, pero el solver agota 100 M iteraciones y no demuestra óptimo; [#1367](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1367) registra la reproducción. [Evidencia y límites](../../strategy-planner/evidence/isa-1210/long-session-budget-2026-09-24.md). Wails, distribución y precisión empírica pendientes; sin push, PR, CI, merge, promoción ni release.

Build localdev posterior a #1210: `bin/vantare-localdev.exe`, 46.015.488 bytes, SHA-256 `69E01DEB9CE93C93CF99314BABB256E98463364A2EB5C4B41F55E32925E5BB46`; compilación PASS sin abrir la app. En #1367, duplicar iteraciones no completó la búsqueda y dos podas conservadoras llegaron al deadline; la curva combinada de stint impide aplicar el atajo escalar. Esos experimentos se retiraron y la rama experimental quedó limpia. Ninguno de los bancos equivale a QA Wails con esta build.

## Decisión optimizada sin edición — ISA-1331 (2026-09-24)

Se corrigió la reconstrucción de combustible del plan: en ausencia de ajustes, Strategy conserva los servicios y la carga inicial calculados por el modelo de recursos de SolverV2 en vez de sustituirlos por mínimos por stint. Una prueba RED demostró la pérdida previa de optimalidad; los ajustes manuales continúan sin reclamarla por herencia. El golden compartido Go/frontend refleja ahora la decisión evaluada. Banco real COTA práctica: 30 vueltas, 2 paradas, `optimality=proven` para el evento supuesto; COTA carrera: 32 vueltas, 0 paradas, `optimality=proven`. Hashes de originales intactos. Esto prueba identidad entre decisión optimizada y replay, no precisión empírica del plan. Go completo fresco, frontend 4.300/2 omitidos, tipos, lint, build y diff-check PASS. [Evidencia](../../strategy-planner/evidence/isa-1331/real-data-validation-2026-09-24.md). Falta QA Wails con el nuevo backend y el protocolo empírico independiente; no hay push, PR, CI, merge, promoción ni release.

## Fronteras de vuelta y referencias reales — ISA-1331 (2026-09-24)

Analysis reconcilia una frontera posterior al inicio sólo si el evento secuencial de vuelta y un único reinicio de distancia de calidad válida coinciden dentro de un periodo de muestreo, con puente GPS Time alineado. El estado inicial y los casos ambiguos permanecen `unknown`. La agregación usa únicamente muestras `valid` cuando las hay, sin borrar las observaciones inciertas por vuelta; si todas son inciertas, la familia sigue incierta. La proyección LMU marca energía virtual como `virtual_energy_not_applicable` fuera de GT3/Hypercar, incluido LMP2, coherente con la UI y el cálculo. Versiones de cómputo de frontera/consumo incrementadas.

Banco opt-in con originales COTA carrera/Monza: 30 fronteras válidas y una inicial incierta; ritmo seco 115,901 s (N=20), combustible 2,469 L/vuelta (N=21), energía virtual LMP2 no aplicable. `CalculateOrbit` consume esas referencias y produce 32 vueltas/0 paradas/`optimality=proven` para un **evento de prueba** de 60 min, 90 L y 40 s de parada. Los SHA-256 originales siguen intactos. `go test ./...` pasa. [Evidencia y límites](../../strategy-planner/evidence/isa-1331/real-data-validation-2026-09-24.md). Falta la aceptación visual/nativa del nuevo estado y la validación empírica de incidentes, elegibilidad y estrategia óptima contra carreras anotadas. Frontend de capacidad LMU en commit local `fb206e52`; backend y evidencia en el siguiente commit local. Sin push, PR, CI remota, merge, promoción ni release en este corte.

Segunda fuente, COTA práctica: 8 fronteras válidas + inicial incierta, ritmo 116,589 s (N=3), Fuel 2,401 L/vuelta (N=3), VE LMP2 no aplicable; SHA-256 intacto. **En esta pasada, anterior a la corrección de decisión optimizada**, el evento de prueba daba 30 vueltas/2 paradas con `optimality=not_proven`; el resultado actual está documentado arriba. Se corrigió sólo la aserción del banco de identidad para admitir el cambio explícito de aplicabilidad de VE al corregir LMP2 a Hypercar; el resto de familias sigue comparándose íntegro. Banco PASS 18,35 s.

## QA visual en navegador interno — ISA-1331 (2026-09-24)

Servidor Vite local en `127.0.0.1:5181` con `VITE_RUNTIME_MOCK=mock`; únicamente se usó el navegador interno de Codex, sin tocar la ventana nativa ni el escritorio. Recorrido visual: inicio, sesión LMGT3 Imola, preparación, biblioteca, revisión de vueltas, Plan, ajustes de stint y parada, Revisiones y entrada manual. En el mock, el plan recalcula tras cambiar un límite de stint y bloquea la aceptación mientras hay cambios pendientes; esto no acredita SolverV2 ni DuckDB reales. Se corrigieron dos textos de estado encontrados en el recorrido: el menú de cambio de origen ya no se presenta como «Nueva estrategia», y manual sin circuito deja de advertir que falta un mapa para una variante inexistente. 21 tests focales, typecheck, ESLint focal y build frontend pasan. Falta QA nativa de LMP2/GT3/Hypercar y cálculo con telemetría válida; el mock solo contiene LMGT3. Rama aislada sin commit, push, PR, CI remota, merge, promoción ni release.

## Capacidad de energía virtual por clase LMU — ISA-1331 (2026-09-24)

Isaac aclara que en LMU solo GT3 y Hypercar tienen energía virtual. En el DuckDB COTA del Oreca 07 LMP2_ELMS, las 19.505 muestras de «Virtual Energy» valen 0; ese canal presente no demuestra consumo. Preparación oculta su tarjeta y el campo manual para LMP2, la selección de combinación fija «no aplicable» y Reglas bloquea ese selector. GT3/Hypercar conservan la confirmación explícita de la regla del evento; clase compatible no significa evento confirmado. Validación rechaza un borrador LMP2 antiguo marcado «aplicable». Frontend: 4.298 pruebas pasan, 2 omitidas; typecheck, ESLint focal y build pasan. Falta prueba visual nativa de este ajuste; no se ha relanzado la app, ni hay push/PR/CI remota/integración/publicación.

## Preparación con observaciones inciertas — ISA-1331 (2026-09-24)

Se abrió físicamente en una build localdev nueva la práctica COTA `2026-07-17T19_06_50Z` con ocho vueltas en el archivo. Analysis/Strategy entregaron ritmo seco 1:56.589, combustible 2.40 L/vuelta y VE 0.0 con presencia `unknown`; la UI ahora los muestra con advertencia roja «Dato incierto · no se usa para calcular», sin ascenderlos a `valid` ni alimentar SolverV2. La sesión de cero vueltas muestra causa explícita. Focal 9/9, frontend 4.294/2 omitidas, typecheck, lint, i18n, build Vite localdev y Go localdev PASS; original SHA-256 intacto. [Evidencia](../../strategy-planner/evidence/isa-1331/real-data-validation-2026-09-24.md). Sigue pendiente definir/calibrar la validez de fronteras y vueltas, obtener familias `valid` reales y verificar el cálculo óptimo; T22 y aceptación visual integral abiertos. App nueva queda abierta para Isaac; sin push, PR, CI remota, merge, promoción ni release.

## Validación de datos reales — ISA-1331 (2026-09-24)

La app localdev abrió COTA, pero la grabación seleccionada `2026-09-09T18_43_03Z` contiene cero vueltas y está en boxes: los guiones de ritmo y consumo son correctos para esa fuente. El banco nativo opt-in recorrió Analysis → proyección de revisión exacta → Strategy con otras tres fuentes COTA reales de 2, 8 y 30 vueltas. Sus magnitudes sí llegan (hasta 21 vueltas de ritmo y 22 de combustible), pero todas salen con presencia `unknown`; la vista sólo presenta `valid` y por eso queda vacía. `reconcileLapBoundaries` publica fronteras `unknown` y la derivación conserva esa incertidumbre. No declarar la conexión rota ni el cálculo óptimo validado. [Evidencia y hashes](../../strategy-planner/evidence/isa-1331/real-data-validation-2026-09-24.md). Siguiente: criterio comprobable de calidad de vueltas/fronteras y estados de UI «sin vueltas»/«observado pendiente», seguido de banco real con presencia `valid` y cálculo nativo. Originales intactos; app abierta para Isaac; sin integración ni publicación.

> **Seguimiento obligatorio en [Notion](https://app.notion.com/p/3fce51695c65834e80b381ec2d632192).**
> Abrir tarea y proyecto antes de ejecutar; actualizar y releer al empezar,
> bloquear, entregar y verificar merge. [Contrato](../notion-transition.md).
> Este handoff conserva evidencia técnica fechada; sus estados antiguos no
> sustituyen el estado vivo ni autorizan nuevas tareas. Enlazar las nuevas entradas a Notion.

## Actualización — ISA-1331, finalización del recorrido v5 (2026-09-23/24)

Isaac rechaza el carácter incompleto del porte mediante tres capturas: inicio centrado sin guardadas visibles, preparación con referencias vacías y editor posterior heredado. [Issue #1331](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1331) y [plan root](../../strategy-planner/sdd/strategy-v5-completion-1331.md) fijan guardadas a la derecha, ancho aprovechado, circuito real, conexión canónica de referencias y composición consistente en todas las vistas. La nota anterior no acepta ese recorrido.

Base `4f3d029f23efa056ef3fdd59ca46aad06148dcb3`, rama `vantareapp/isa-1331-strategy-v5-complete`, worktree `C:/tmp/vantare-isa1331`. Inventario cerrado: repositorio/lista existentes, proyección exacta con handles vivos y 15 contornos LMU sin API histórica pública. Backend y originales se preservan. Un ejecutor GPT-6 Sol medium, sin delegación adicional. Sin push/PR/CI remota/integración/publicación. GitHub prevalece por instrucción de Isaac sobre banners históricos de Notion.

Corte 1 implementado: inicio de ancho disponible con columna derecha de hasta tres borradores y tres planes, reapertura/historial y biblioteca completa. Destinos diferidos protegen el borrador ante cancelación. Óvalo decorativo retirado. Focales Start/Page 10/10, tipos y lint pasan; root revisa el diff y los estados. Sigue el corte de referencias canónicas. Isaac ordena **no abrir ni relanzar la app hasta que lo indique**: sólo código/tests/build sin lanzamiento; QA nativa y visual pendiente, sin heredar notas anteriores.

Corte 2 implementado: preparación consulta `get_revision_planning_inputs` con selección exacta y handles abiertos de la misma sesión/base. Una cabeza más reciente no sustituye la revisión adoptada. La clave cancela/descarta respuestas de selecciones anteriores y no consulta por teclear reglas/nombre. Ritmo por bucket de vista previa, Fuel/VE y ajustes conservan presencia/procedencia; bucket ausente no usa la media como sustituto. Fuente cerrada ofrece apertura y error ofrece reintento. Manual no consulta Analysis. Focales 21/21, tipos, ESLint focal y diff-check pasan. Root revisó hook, cableado, CSS y casos de carrera asincrónica; no acredita datos nativos todavía. Siguiente: circuito y continuidad de editor.

Corte 3 implementado: mapa del catálogo LMU con identidad y variante verificadas, excluyendo toda geometría sintética. COTA y Monza producen trazados reales distintos. Sin API histórica pública para contornos desconocidos, se indica ausencia; no se abre una sesión para decorar el menú. Ajustes numéricos inválidos no sustituyen silenciosamente su valor por la observación. Focales 21/21, tipos, ESLint focal y diff-check pasan; root revisó diff y pruebas. Siguiente: composición y navegación coherentes del editor. App sin abrir ni relanzar.

Corte 4a implementado: barra compacta única, contexto verificado compartido por Carrera/Datos/Plan/Revisiones y Carrera con inspector de plan que refleja el estado de cálculo real y abre Plan. Editar combinación, reglas y pilotos dirige al panel correcto; la fuente abierta se reconoce por sesión y base incluso si su revisión cabeza avanzó. Se preserva navegación por teclado y bloqueo de operaciones. Focales 27/27, tipos, ESLint focal y diff-check pasan; root revisó diff de componentes, CSS y regresiones. Siguen Data/Revisiones, Plan/Stint/Parada y biblioteca/historial. App sin abrir ni relanzar.

Corte 4b implementado: Datos y Revisiones comparten la escala y composición de la mesa, con tablas de desplazamiento local, inspector proporcional y vacíos de altura intrínseca; se retiran gradientes y blur heredados que competían con el shell. Sólo CSS, sin cambiar controles/adopción. Focales existentes Data/Revisions 55/55 y diff-check pasan; root revisó los selectores y puntos de corte. Siguen Plan/Stint/Parada y biblioteca/historial. App sin abrir ni relanzar.

Corte 4c implementado: Plan compacto comparte el contexto; al editar Stint o Parada permanecen visibles la cronología y el resumen calculados. Los controles del ajuste ocupan el inspector derecho y las propuestas no se muestran como resultado hasta recalcular. Volver bloquea ajustes sin recalcular; una invalidación sin plan permite recuperar la salida. El clima no cambia durante la edición. Focales Plan/Stint/Parada 14/14, tipos, ESLint focal, build frontend y diff-check pasan; root revisó la distribución y pruebas. Queda biblioteca e historial, luego gates finales. App sin abrir ni relanzar.

Corte 4d implementado: biblioteca a ancho completo con borradores y planes en columnas; historial de plan como pantalla propia con lista y detalle, no Drawer. Abrir una revisión comprueba referencia completa; error y reintento son recuperables, respuesta tardía se ignora al cerrar o desmontar. Selección sigue explícita. Navegador de fuentes compacto y sin blur. Focales Page/History 13/13, tipos, ESLint focal, build frontend y diff-check pasan; root revisó flujo, render y pruebas. Restan gates completos, documentación final y QA visual/nativa pendiente por orden de Isaac. App sin abrir ni relanzar.

Verificación estática final: el Plan enseña el nombre real de la sesión y conserva la revisión exacta discreta; si falta nombre usa el estado localizado existente. Se retiraron tres textos sin consumidores en los cuatro idiomas. La suite completa terminó con 4.292 pruebas superadas y 2 omitidas (492 archivos); un primer pase concurrente tuvo dos fallos de i18n, corregido el texto huérfano y repetidos los tests de idioma 4/4 antes del pase final. Typecheck, lint completo, auditoría i18n, build frontend y 44 tests de roadmap pasan. `plan.md` describe la entrega real y `roadmap.json` se regeneró desde `origin/nightly`.

La build localdev **no pasa**: TypeScript y Vite completan, pero Go no puede embeber `frontend/dist/assets/RacesOrbitPage-DPXWk2KF.js` porque Defender lo detecta como `Trojan:Script/ObfusScript.A!ml` (ThreatID 2147842389, acción registrada como satisfactoria a las 00:54 del 24-sep). [Issue #1353](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1353) registra este bloqueo independiente. Log `C:/tmp/isa1331-localdev-build-final.log`. Es un artefacto generado de Carreras; no se ha restaurado, exceptuado, renombrado ni ejecutado, y no se afirma falsedad de la detección para este archivo. La QA nativa con DuckDB real y la aceptación visual quedan sin realizar por orden de Isaac. La base `4f3d029f` tampoco pertenece a `origin/nightly` actual; entrega local aislada, sin push, PR, CI remota, merge, promoción ni release.

Isaac autoriza abrir la app el 24-sep. Una build local **de diagnóstico sin minificación** de los mismos fuentes supera el análisis de Defender sin modificar su protección y compila `bin/vantare-localdev.exe` (SHA-256 `C25BA3179F5203B206509015A6AF51661EC6DFAABB28C0F0E26C7A9EA58F3424`); el runtime DuckDB publicado se verifica con manifest `700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`. Computer Use ve Wails maximizada: menú v5 con telemetría/manual/guardadas, apertura de la sesión COTA y preparación con identidad Isotta/COTA y mapa del catálogo. Ritmo y combustible muestran «Sin dato válido para esta selección» de manera estable; no se ha demostrado todavía si falta cobertura en esa revisión o hay un fallo de proyección. Este lanzamiento por ruta EXE usa los configs instalados de AppData (log actualizado allí), así que es sólo una prueba de apertura/presentación, no la QA aislada integral del worktree. Se dejó la ventana abierta para Isaac, sin aceptar plan ni guardar correcciones. La build canónica minificada y los gates de Strategy siguen pendientes.

## Antecedente — QA de preparación y límite funcional (2026-09-22)

Isaac completa VirusTotal: el asset regenerado obtiene 0/62, incluido Microsoft sin detección; no se afirma identidad con el original en cuarentena. Resultado enlazado en la auditoría de ISA-1322. La build normal vuelve a funcionar sin cambios de protección.

Al contrastar su nueva captura, root encuentra que un selector CSS más específico anulaba los mínimos de altura. GPT-6 Sol medium corrige sólo el valor genérico usando `:where`; lint y build localdev pasan. Root comprueba de nuevo COTA en nativo, normal 1266×793 y maximizada 1920×1033, con el DuckDB original intacto. Inspector Reglas/Pilotos accesible. Capturas finales actualizadas en la [evidencia](../../strategy-planner/evidence/isa-1322/README.md). Revisor visual GPT-6 Sol medium: 9,1 normal, 9,0 maximizada, 9,1 conjunta redondeada; listo para revisión de Isaac, no aceptación humana ni paridad píxel a píxel.

La preparación visual queda revisada, pero no terminada funcionalmente: reglas/pilotos sin configurar aparecen «Por confirmar», mientras ritmo y combustible aparecen «Pendiente de datos» porque esta vista aún no recibe la proyección exacta adoptada. Son causas diferentes; abrir correctamente el archivo no acredita las tarjetas ni T22. La siguiente conexión debe reutilizar la autoridad de Analysis existente, sin cálculos paralelos ni valores de ejemplo. La consola transitoria del lector sigue observada. No se cambia ese alcance en esta corrección CSS.

Ejecutable recompilado `bin/vantare-localdev.exe`, SHA-256 `C482206A48BFE941F1F654064494FF8E3595B673B9649B9A580A8A6439E40239`, dejado abierto en preparación. Rama `vantareapp/isa-1322-strategy-desk-fidelity`; entrega aislada, sin push, PR, CI remota, merge, promoción o release. `data/` local excluido.

## Antecedente — rebuild solicitada y VirusTotal preparado (2026-09-22)

Isaac pide regenerar la build para disponer del archivo y analizarlo en VirusTotal. El helper normal termina con salida 0 sobre código 4bc2cd02; no se modifica Defender, y se comprueba antivirus/protección en tiempo real activos. Ejecutable `bin/vantare-localdev.exe`, SHA-256 `54EF6CF185867424F37F9A49D8F40EC3626D095D96B4B2520E5EBCF38B6618B5`. Log `C:/tmp/isa1322-rebuild-for-analysis.log`.

Asset nuevo accesible `RacesOrbitPage-Dt74rd-E.js`, 25.230 bytes, SHA-256 `E8FBF2FA87C4F1BC336F0718C687C0FCE3E9822DBAECDE331698246C89015D15`. Es un artefacto regenerado; no se afirma equivalencia con el original BtqPDHOa en cuarentena. La consulta por hash en VirusTotal muestra Item not found. Archivo seleccionado y botón Confirm upload preparado: la aceptación de condiciones y compartición espera confirmación explícita del usuario por política de la herramienta de navegador. No se ha enviado la muestra ni se ha abierto el nuevo ejecutable. Aceptación visual >9 sigue pendiente.

## Actualización — auditoría de Defender ISA-1322 (2026-09-22)

Isaac solicita verificar la detección antes de autorizar el archivo. Revisión de fuente y procedencia sin hallazgos maliciosos; 168 archivos de seis paquetes instalados coinciden con tarballs e integridades oficiales, y la caché pnpm no presenta modificaciones. El historial muestra la misma detección sobre Carreras el 15-sep, antes de este cambio. Conclusión: **falso positivo probable, no confirmado**, porque el bundle exacto está en cuarentena y no se inspeccionó. [Evidencia y límites](../../strategy-planner/evidence/isa-1322/defender-audit.md). Sin restauración, excepciones, renombrado, nueva build ni cambio de protección. La build final y aceptación visual permanecen pendientes; no se autoriza ni se realiza envío del código a Microsoft.

## Actualización — ISA-1322, fidelidad de preparación (2026-09-22)

[ISA-1322](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1322) corrige el movimiento global de entrada y la composición de la preparación denunciados por Isaac. GitHub es la autoridad de este corte por su instrucción expresa. Rama `vantareapp/isa-1322-strategy-desk-fidelity`, worktree `C:/tmp/vantare-isa1322`, base `8466c4a0aaed803812be900252a69a18e643c685` de ISA-1318.

La shell fija su geometría desde la ruta antes de montar el componente diferido y no anima la rejilla global. La preparación usa una sola cabecera productiva, contexto compacto con combinación desplegable, base/fuentes/referencias centrales e inspector de resumen/reglas/pilotos con acciones al pie. Se retira el resumen central duplicado. Los controles, validadores, persistencia y motor permanecen; no hay cambios Go ni dependencias nuevas. El documento de diseño se precisa contra `workflow.js` y `workflow.css` aprobados.

Implementación GPT-6 Sol medium, dirección/revisión/documentación/QA nativa por root, y revisión visual independiente GPT-6 Sol medium. Un escritor por worktree. Computer Use comprueba abrir el DuckDB real de COTA, combinación, reglas, retorno al menú y entrada manual; 120 s manuales se reflejan como 2:00.000, identificados como estimación. Original intacto. Dos pasadas detectaron y corrigieron doble cabecera, pie recortado y tarjetas sobredimensionadas. Suite frontend 4.265/2 omitidas, 19 focales, tipos/lint/i18n y 44 checks de roadmap pasan. Última revisión nativa 8,9/10: todavía bajo el umbral >9. El CSS posterior queda sin captura porque Defender cuarentena un asset de Carreras y bloquea embed Go. No se elude ni se cambia la protección; Isaac debe revisar la detección antes de recompilar. Estado de checks y contraste final en la [evidencia de ISA-1322](../../strategy-planner/evidence/isa-1322/README.md).

Las métricas telemétricas de las tarjetas de referencia siguen pendientes porque esta vista no expone la proyección exacta adoptada; no se sustituyen por datos de demostración. Este corte no cierra T22 integral, validación empírica, todas las vistas posteriores ni live. Sigue observado el antecedente de consola transitoria del lector. Sin push, PR, CI remota, merge, promoción ni release; pendiente de aceptación visual de Isaac.

## Actualización — ISA-1318 desbloquea QA local (2026-09-22)

Isaac sustituye la petición anterior de login por un perfil explícito de desarrollo sin cuenta. [ISA-1318](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1318) parte del HEAD de ISA-1314 `e304ab26` y conserva su implementación visual. La build local abre Hub y Strategy sin sesión; Computer Use ha recorrido el menú y abierto el DuckDB real de COTA. Se obtiene Circuit of the Americas / Isotta TIPO6 2024 #11:LM y el hash del original permanece idéntico. [Guía](../../local-development.md) y [evidencia](../../evidence/isa-1318-local-development.md).

El bloqueo por login ya no requiere intervención del usuario para desarrollo. Sigue pendiente el recorrido visual completo de v5 (manual/reglas/pilotos/Plan/stint/parada, tamaños e idiomas), revisión adversarial y T22 integral. La apertura correcta no acredita cálculo ni paridad visual completa. Se observan ventanas de consola transitorias al arrancar/abrir el lector; documentar aparte si se reproduce. Sin integración, promoción o release.

## Antecedente de entrega — ISA-1314, menú y mesa v5, 2026-09-22

Isaac aprobó el HTML v5 y autorizó su documento de diseño y aplicación productiva. [GitHub #1314](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1314) es la autoridad de este corte por instrucción expresa del usuario, por encima del banner histórico de seguimiento. El [contrato visual](../../strategy-planner/design/strategy-menu-desk-v5.md) sustituye el asistente A4 y el garaje como referencia; no altera la autoridad de Analysis ni el motor Go.

Worktree `C:/tmp/vantare-isa1314`, rama `vantareapp/isa-1314-strategy-menu-desk`, base `7ff79ead4c125d63730b0ec3aa181e6c630453ab` de ISA-1277. Se conservan los cambios de calendario ajenos del worktree anterior y el checkout principal. Implementación por GPT-6 Sol medium; planes, revisión del diff, documentación y prueba nativa por el orquestador. Un único escritor en cada momento, sin Astra/Devin/OpenCode.

Implementado localmente: menú asimétrico con sesiones reales y entrada Manual; mesa de combinación, referencias, reglas y pilotos; biblioteca completa, retorno al borrador y acceso a Mis estrategias. Manual usa overrides explícitos del comando existente y guarda procedencia manual. Adoptar telemetría elimina las referencias manuales y conserva revisiones exactas. La preparación abre directamente Plan después de guardar; no vuelve a otro resumen obligatorio. Se conservan Datos, Revisiones y los editores de stint/parada.

Revisión funcional: corregidos selección múltiple, retorno al borrador, descubrimiento con StrictMode, limpieza del inspector al cerrar una fuente, etiquetas por identidad persistente y cambio Manual→telemetría. Los tests comprueban estas rutas, la aceptación manual y el transporte al cálculo. No hay cambios Go, dependencias nuevas ni cálculo alternativo. Se retira sólo el componente visual del antiguo wizard y su CSS/test sin consumidores; los tipos y validadores persistidos se conservan.

La build productiva local compila y abre `C:/tmp/vantare-isa1314/vantare-v2/bin/vantare.exe` (PID inicial 21588, canal local configurado nightly; esto no es promoción). Computer Use nativo sí localiza y captura la ventana, pero se detiene ante el inicio de sesión. Se ha pedido al usuario que inicie sesión; no se automatiza autenticación ni se modifica licencia/configuración de acceso. Runtime DuckDB v1.5.5 verificado, manifest `700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`. LMU permanece abierto y no se interviene.

Implementación y contrato guardados en el commit local `421ea6580a02ff7f09da8b6275062014e4805dc8`, sin push.

Evidencia y checks: [entrega local ISA-1314](../../strategy-planner/evidence/isa-1314/README.md). La aprobación del HTML y los tests no acreditan el render nativo de Strategy; no se hereda la nota 9,2/10 de A4. **Siguiente acción:** tras acceso del usuario, recorrer menú/manual/biblioteca/DuckDB/Plan con Computer Use, corregir hallazgos y capturar paridad v5. T22 integral, validación empírica y live no quedan cerrados por esta entrega. Sin integración, promoción ni release.

## Antecedente — #1277 T18 reforzado con recorrido adversarial Computer Use

Las 19 pantallas y estados principales de Strategy registrada se han llevado a
la composición A4 aprobada: asistente único de cinco pasos, editor con sidebar
comprimido, biblioteca, Carrera, Datos, Revisiones, Plan, Stint, Parada y estados
de cálculo. El rojo/carmín mantiene presencia contenida sobre el garaje y las
superficies oscuras de Vantare. La presentación productiva conserva las mismas
autoridades de datos, cálculo y persistencia; el harness sólo fija respuestas
deterministas para obtener capturas comparables.

La primera ejecución Wails real reveló dos fallos que el harness anterior no
podía acreditar: todos los DuckDB quedaban para siempre en estabilización porque
la UI no repetía la observación de seguridad, y la biblioteca se abría en un
drawer ajeno al recorrido A4. La UI conserva la doble observación y ahora repite
automáticamente el descubrimiento tras 5,5 segundos; la biblioteca ocupa una
pantalla intermedia completa, vuelve al contexto anterior y mantiene intactos
los originales.

Computer Use recorrió manualmente asistente, descubrimiento, apertura y selección
de fuente, revisión de una vuelta con incidente, guardado separado, adopción,
cálculo y edición de parada. Encontró dos defectos: las filas de sesiones se
apelmazaban en el paso integrado y un recálculo manual inviable ocultaba la
salida del editor. Ambos están corregidos. El harness también conserva ahora la
revisión que guarda y usa la causa canónica `incident_offtrack`, por lo que el
recorrido de correcciones deja de fallar por datos de prueba inválidos.

La pasada `isa-1277-visual/pass-28-computer-use` contiene 22 estados principales
y 72 variantes responsive: 94 PNG en total. Añade el paso de sesiones a 1208 px,
el error dentro de Parada y su retorno a Plan con «Reintentar cálculo». La matriz
registra cero overflow y cero errores. La nota adversarial visual de la base se
mantiene en 9,2/10 y la inspección directa de las tres vistas nuevas no deja
P0/P1/P2.

La rama quedó reconciliada con `origin/nightly` en
`f617467427f8d78f7432b4445d52be0c4dfe616a`. Pasan typecheck, lint, build,
i18n, 46 pruebas focales del cambio y la suite frontend completa (490 archivos;
4.256 pruebas aprobadas y 2 omitidas), 137 checks documentales y el contrato de
roadmap reconstruido desde esa base. La compilación Wails productiva también
termina correctamente.

La compilación productiva local sigue abierta para repetir el recorrido sobre
los DuckDB reales del equipo. Computer Use no expone esa ventana WebView2, por
lo que esta pasada acredita los componentes React productivos con respuestas
deterministas, no la apertura física del DuckDB. Falta el gate T22: apertura
real, persistencia, reinicio, copia opcional, errores y licencia. Sin push, PR,
CI remota, integración ni release.

## Historial — #1276 T17b cerrado localmente; editor de parada conectado

El panel Plan permite editar por parada Fuel añadido y energía virtual cuando
aplica. Si el evento aporta inventario físico, también permite decidir el cambio
de neumáticos y el compuesto; la ausencia queda explicada y no genera datos.
Cada tarjeta muestra vuelta, tránsito, servicio, solape y total producidos por
el replay único, con el modo paralelo o secuencial gobernado por el evento.

Una edición local marca el resultado como obsoleto, bloquea su aceptación y
puede restablecerse. Recalcular reutiliza la entrada preparada, fija todos los
stints y servicios visibles y muestra el coste exacto contra el plan vigente.
Una parada ya calculada puede refinarse sobre su baseline retenido. La edición
de stint se bloquea tras calcular paradas para no mezclar dos referencias de
coste; un cálculo completo explícito inicia otra propuesta.

Siguiente: T18 recorre todas las pantallas y estados con capturas comparables y
revisión visual adversarial. T22 conserva Wails/DuckDB real. Sin app/Wails, LMU,
DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1275 T17a cerrado localmente; restricciones de parada

Las variantes Orbit pueden fijar por parada la cantidad añadida de Fuel y VE,
además de conservar o cambiar neumáticos y compuesto cuando existe inventario
físico. Las cantidades son servicios, no cargas objetivo del stint siguiente;
se rechazan dos autoridades para el mismo repostaje. El modo paralelo o
secuencial continúa siendo una regla global del evento.

La evaluación materializa una única decisión y el replay existente comprueba
capacidad, reserva, inventario y ventanas. El mismo replay produce el coste:
tránsito se cuenta una vez y el servicio respeta el modo del evento. La entrada
TypeScript construye base + variante restringida fijando todos los límites
visibles. También se corrigió la carga VE publicada por stint, que se copiaba
antes de resolver sus cantidades reales.

T17b conectó el editor y detalle productivo de parada, obsolescencia, recálculo
y coste.

## Historial — #1274 T16b cerrado localmente; editor de stint conectado

El panel Plan permite fijar el piloto de cada stint y mover cada límite entre
dos stints. El control arrastrable nativo y su entrada numérica equivalente
modifican la misma frontera, mantienen el total exacto y conservan al menos una
vuelta a cada lado. Restablecer descarta los cambios locales aún no calculados.

Una edición muestra inmediatamente que el plan está desactualizado y bloquea
su aceptación. Recalcular no vuelve a preparar telemetría: usa las mismas
fuentes, reglas y `PlanningInputs`, envía base y variante restringida en una
sola orden y presenta el resultado de SolverV2 con su coste exacto frente a la
base. Editar de nuevo vuelve a invalidarlo.

Siguiente: T17 debe editar parada y servicios con el mismo patrón de restricción,
replay y comparación, sin duplicar tránsito/servicio. T18 conserva la revisión
visual adversarial. Sin app/Wails, LMU, DuckDB, push, PR, CI remota, integración
ni release.

## Historial — #1268 T15a2b cerrado localmente; delta de ritmo por piloto

El contrato Orbit acepta un único delta aditivo de ritmo por piloto. Strategy
resuelve primero el ritmo común observado y suma después ese delta, por lo que
una entrada 60/62 ya no se aplana a 60/60. La misma función alimenta la
optimización y la evaluación final; Fuel, VE, neumáticos, inventario y límites
no cambian. El mapper TypeScript transporta el campo y el borrador recorded
resuelve de forma determinista cadenas de referencias, rechazando referencias
ausentes, ciclos y valores no finitos. Siguiente: T15a2c debe llevar la
condición de finalización temporal al solver antes de habilitar el orden libre.
Pasan el paquete Go focal de aplicación, frontend focal 4/108, frontend
completo 450/3879, typecheck, lint, i18n, build, Go global y 259 checks
documentales. El build conserva el aviso heredado de chunks superiores a
500 kB. Sin app/Wails, LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1265 T15a2a cerrado localmente; inputs recorded exactos

Strategy expone una consulta read-only que recibe la combinación y las
referencias completas del borrador recorded. Reutiliza el productor conjunto
de Analysis, exige que la proyección devuelva la misma combinación, instante y
conjunto exacto de revisiones y devuelve el contrato `PlanningInputs` existente
sin crear otro Event ni escribir el repositorio. El cliente TypeScript congela
la selección antes de enviarla y rechaza estado, proyección, combinación,
instante o referencias ausentes, parciales, duplicadas o sustituidas. Siguiente:
T15a2b, conservar el delta explícito entre pilotos después de resolver el ritmo
observado en Go; después T15a2c resolverá el horizonte temporal libre dentro
del solver. Pasan el paquete Go focal de aplicación, frontend focal 3/90,
frontend completo 450/3870, typecheck, lint, i18n, build, Go global y 259
checks documentales. El build conserva el aviso heredado de chunks superiores
a 500 kB. Sin app/Wails, LMU, DuckDB, push, PR, CI remota, integración ni
release.

## Historial — #1264 T15a1 cerrado localmente; criterio de pilotos recorded

El borrador registrado conserva de forma aditiva el criterio `fixed|free` y
la secuencia exacta de pilotos. La pantalla Pilotos permite elegir el criterio
y ordenar una rotación fijada; los borradores anteriores siguen significando
rotación fija en el orden ya guardado. Añadir o retirar un piloto reconcilia la
misma lista sin conservar IDs ajenos. El mapper de cálculo exige el modo de
ritmo como entrada explícita y rechaza listas vacías, duplicadas, incompletas o
ajenas. La selección libre se transporta para carreras por vueltas; en carreras
por tiempo permanece visible y bloqueada con causa porque el backend todavía
no tiene esa semántica. No se ejecuta ningún cálculo en este corte. Siguiente:
T15a2, entrada completa/readiness y modo libre temporal usando la autoridad
existente. Pasan 5 archivos/94 tests focales, frontend 449/3862, typecheck,
lint, i18n, build, Go global y 259 checks documentales. El build conserva el
aviso heredado de chunks superiores a 500 kB. Sin app/Wails, LMU, DuckDB,
push, PR, CI remota, integración ni release.

## Historial — #1263 T14g cerrado localmente; `save_revision` recuperable

El repositorio privado de Strategy conserva un único comando completo de
`save_revision` antes de aplicar su efecto, sellado por digest y dentro del
envelope existente. Stage y reconocimiento mantienen la generación lógica; el
commit exige bajo el mismo lease que siga custodiada exactamente esa identidad.
Así, reconocer mientras llega una ejecución tardía impide que el efecto ocurra
sin custodia. Un reinicio expone la intención sin guardarla, resolverla ni
reconocerla automáticamente. Orbit permite comprobar si la revisión inmutable
exacta ya existe, reintentar el mismo comando o cerrar el aviso. La comprobación
encuentra A aunque el borrador o HEAD ya estén en B. El camino legacy de
`save_revision` permanece compatible. Frontend 449/3845, Strategy focal, Go
global, typecheck, lint, i18n, build y 259 checks documentales pasan. Un
benchmark Overlay ruidoso falló una vez por 0,032 ms y pasó aislado y en la
repetición global, sin modificar su umbral. Siguiente: T15. Sin app/Wails, LMU,
DuckDB, push, PR, CI remota,
integración ni release.

## Historial — #1261 T14f cerrado localmente; corrección recuperable tras reinicio

`CorrectionStore` custodia antes de Save un único comando mixto completo
por base: correcciones escalares, uso por familia, clasificación y límites,
incluidos conjuntos vacíos explícitos. El documento privado sella el contenido
con el digest canónico existente, lo valida al reabrir y conserva la intención
si otra escritura avanza la cabeza. Cargar no abre fuentes ni concede autoridad;
reconocer retira sólo el commandId exacto y es idempotente. Se reutilizan lease,
backup y escritura atómica. Cuatro regresiones nuevas cubren reinicio, pérdida
de confirmación al preparar, commit confirmado, ausencia con HEAD posterior,
conflicto, reconocimiento y corrupción. El servicio revalida la fuente, el
cliente repone sólo el handle temporal y el editor expone la recuperación sin
resolver o reintentar automáticamente. Sólo tras reconocer se limpia el estado.
Frontend 449/3842, Strategy 47/533, typecheck, lint, i18n, build, Go global y 259
checks documentales pasan. Persisten únicamente el aviso heredado de chunks y el
AbortError no fatal conocido. Continúa T14g con `save_revision`. Sin app/Wails,
LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1260 T14e cerrado localmente; historial consultable

Mis estrategias muestra planes guardados aunque ya no tengan borrador y abre un
historial lateral sin cargar revisiones automáticamente. La persona elige una
referencia completa; durante la lectura no se muestra un resultado anterior y
un fallo permite reintentar exactamente la misma revisión. El visor identifica
la última referencia por igualdad completa y presenta sólo vueltas, duración y
paradas validadas del snapshot Orbit; los payloads incompatibles y los resúmenes
legacy conservan metadatos y explicación sin inventar datos. Cerrar durante una
lectura invalida su respuesta tardía. T14 continúa únicamente con recuperación
duradera de comandos. Focales 14/14, frontend global 449 archivos/3838 tests,
typecheck, lint, i18n, build y 259 comprobaciones documentales pasan. El build
mantiene sólo el aviso heredado de chunks mayores de 500 kB; la suite conserva
un AbortError de teardown no fatal ya conocido. La aceptación visual sigue en
T18. Sin app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1259 T14d cerrado localmente; historia descubrible

`list` publica ahora las referencias completas de todas las revisiones de cada
plan sin cargar sus payloads. Tras A→B, A puede descubrirse y abrirse mediante
la ruta exacta ya existente; las variantes no mezclan referencias. El cliente
valida cada referencia presente y conserva compatibilidad con respuestas legacy
sin el nuevo campo. T14 continúa con el visor mínimo y la recuperación duradera
de comandos. Sin app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni
release.

## Historial — #1257 T14c cliente cerrado localmente; respuesta exacta

El cliente TypeScript permite abrir una revisión mediante su referencia completa
o conservar el selector legacy por borrador, de forma mutuamente exclusiva. La
respuesta se decodifica y verifica como antes y además debe coincidir en plan,
variante, revisión y hash con lo solicitado; una revisión válida distinta o
ausente falla cerrada. T14 continúa con la vista de historial del plan y la
recuperación duradera de comandos. Sin app/Wails/LMU, DuckDB, push, PR, CI remota,
integración ni release.

## Historial — #1255 T14b cerrado localmente; lectura exacta sin fuente

La operación Go `open` acepta exactamente un `draftId` o una referencia completa
de revisión. Tras guardar A, avanzar a B y reabrir el repositorio, el bridge
devuelve A con su payload inmutable sin proveedor de telemetría, sin sustituirla
por B y sin escribir estado. El hash discordante, la revisión ausente y los
selectores ambiguos fallan cerrados; `open` por borrador conserva su contrato.
T14 continúa con cliente/vista de Revisiones y recuperación duradera de comandos.
Sin app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1254 T14a cerrado localmente; snapshot conserva la entrada exacta

La revisión inmutable de Orbit conserva ahora, junto al resultado, la petición
`StrategyOrbitCalculationInputV1` que lo produjo: proyección, overrides,
referencias de fuente, reglas, pilotos, variantes y escenarios meteorológicos.
El campo es aditivo para abrir snapshots anteriores. Una fuente A→B deja de
reconocer A como la revisión visible guardada. T14 continúa con consulta de
revisiones antiguas sin fuente y recuperación duradera de comandos. Sin
app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1253 T03f cerrado localmente; contrato actual reconciliado

T03a–e queda cerrado sobre lo que CalculateOrbit produce hoy: factible no
probado, inviable, cancelado, timeout, presupuesto agotado, respuesta vigente y
carga pendiente sin falso éxito. La auditoría no encontró otro bug reproducible.
Plan parcial y optimalidad demostrada después de la evaluación final requieren
semántica del recorrido productivo y pasan explícitamente a T15; A12/A13 siguen
abiertos. Siguiente: T14, revisiones reproducibles del plan. Sin cambios
productivos, app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1252 T03e cerrado localmente; presupuesto meteorológico conservado

Los escenarios meteorológicos ya distinguen una búsqueda interrumpida por el
límite de candidatos o iteraciones de una carrera realmente inviable. Reutiliza
las razones existentes y `ErrorOverflow`; no cambia el presupuesto, el algoritmo,
la solución parcial, el protocolo ni la UI. T03 continúa sólo después de volver
a contrastar sus estados y obsolescencia con casos reproducibles. Sin
app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1251 T03d cerrado localmente; optimalidad validada

El cliente conserva la ausencia legacy y `optimality: not_proven`, pero rechaza
cualquier valor presente que no entiende en vez de aceptarlo y borrarlo. La
validación reutiliza `strategyEnum`; no añade estado, envelope, taxonomía ni
cambios del solver. T03 continúa con obsolescencia y estados finales del
resultado. Sin app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni
release.

## Historial — #1250 T03c cerrado localmente; telemetría antes del cálculo

Strategy Orbit bloquea el cálculo cuando el evento conserva sesiones de
telemetría incluidas y sus entradas derivadas siguen pendientes o fallan. Al
resolver usa los valores derivados exactos; sin telemetría, el recorrido manual
conserva su cálculo. Guardar una selección sólo publica el estado invalidado y
un único efecto prepara las entradas, sin hook, controlador, registro global ni
contrato nuevo. T03 continúa con obsolescencia y estados finales del resultado.
Sin app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1249 T03b cerrado localmente; comandos de cálculo únicos

Cada montaje de Strategy crea sus comandos de cálculo con UUID. El cliente,
`calculationKey` y cleanup existentes descartan respuestas y errores tardíos de
un montaje anterior incluso cuando el transporte continúa trabajando. La prueba
usa el cliente real y un transporte controlado; no se añadió manager, registro
global, protocolo ni máquina de estados. T03 continúa con readiness y estados de
resultado. Sin app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1248 T03a cerrado localmente; cancelación distinta de timeout

`CalculateOrbit` distingue `context.Canceled` como `calculation_cancelled` y
reserva `calculation_timeout` para deadlines. Application conserva ambas causas;
el bridge publica un mensaje saneado y el cliente mantiene código, campo y
correlación. No cambia la cancelación local ni se añade una máquina de estados.
T03 continúa con readiness, obsolescencia y estados de resultado. Sin
app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1246 T02g3 cerrado localmente; selector en T15

CalculateOrbit acepta `driverOrderMode`: ausente o `fixed` conserva la rotación
cíclica legacy; `free` trata `order` como candidatos, transporta todos sus
perfiles pero omite `DriverSequence`, por lo que SolverV2 puede elegir y omitir
pilotos salvo límites explícitos. La publicación usa el piloto realmente resuelto
y no fuerza un stint por candidato. El modo libre se limita a carreras por vueltas:
el resolvedor temporal actual valida su horizonte provisional como distancia final
y queda para T15 evitar falsos inviables con límites por vuelta. Modo desconocido,
duplicados libres y overrides de stint libres fallan cerrados. El contrato TypeScript transporta
el campo. No se añadió aún selector recorded: T15 debe conectarlo al construir
la petición completa con perfiles y readiness. Siguiente: T03 estados finales.
La disponibilidad horaria sigue pendiente. Sin app/Wails/LMU, DuckDB, push, PR,
CI remota, integración ni release.

## Historial — #1245 T07c cerrado localmente

T07c edita por piloto los intervalos inclusivos de vueltas de carrera donde no
puede conducir, directamente en `driverLimits[id].unavailable`. Añadir compone
ambos extremos; vaciar temporalmente una fila confirmada no la elimina y sólo
Quitar borra. El vacío se presenta como «Sin tramos no disponibles configurados»
sin afirmar disponibilidad total. Validación, guardado/reapertura y cálculo
conservan los intervalos y las demás reglas. El modelo horario legacy por minutos
del día permanece separado: no se convierte a vueltas mediante ritmo medio.
Siguiente: distinguir orden fijado de propuesta libre; la disponibilidad horaria
completa necesita una decisión temporal posterior. Sin app/Wails/LMU, DuckDB,
push, PR, CI remota, integración ni release.

## Historial — #1244 T06c cerrado localmente

T06c edita `allowedCompoundsByClimate` directamente en las reglas existentes,
con tres grupos seco/húmedo/mojado y los cuatro compuestos canónicos. La ausencia
de selección se presenta como «Sin restricción» y vaciar el último compuesto
elimina el bucket y, si procede, el mapa. La configuración precede a Sesiones:
no se filtra con telemetría ni se fabrica compatibilidad; readiness/Solver debe
explicar después los escenarios sin respaldo o inviables. Guardado, reapertura y
adapter conservan el mapa exacto. Astra confirmó el corte mínimo sin editor
genérico. Siguiente: disponibilidad por ventanas de vueltas, verificando antes
su semántica temporal. Sin app/Wails/LMU, DuckDB, push, PR, CI remota,
integración ni release.

## Historial — #1243 T06b cerrado localmente

T06b muestra soft/medium/hard/wet como configuración explícita del evento y
guarda la selección en orden canónico dentro de `mandatoryCompounds`. No filtra
por telemetría: Reglas precede a Sesiones y la configuración puede guardarse sin
datos; readiness/Solver explicará después qué respaldo falta. Vaciar elimina
sólo este campo. Parser, guardado/reapertura y adapter conservan hard/wet sin
otro modelo ni lógica física React. Astra confirmó esta solución tras contrastar
el orden del asistente. Siguiente: `allowedCompoundsByClimate`; después
disponibilidad con referencia temporal explícita. Sin app/Wails/LMU, DuckDB,
push, PR, CI remota, integración ni release.

## Historial — #1242 T06a cerrado localmente

Reglas permite añadir, editar y quitar ventanas obligatorias inclusivas en
`requiredWindows`; el vacío transitorio no borra y sólo Quitar elimina.

## Historial — #1241 T07b cerrado localmente

Pilotos edita mínimo/máximo de vueltas y máximos continuo/total exclusivamente
en `draft.rules.driverLimits`; validación, guardado y cálculo conservan las
unidades del contrato sin duplicar modelos.

## Historial — #1237 T02g2b cerrado localmente

T02g2b construye un perfil por piloto de la variante antes de optimizar y pasa
el orden completo como secuencia al mismo SolverV2. El plan publica el piloto
elegido por el solver cuando la forma de stints coincide; el camino de un piloto
sin límites conserva su entrada legacy. Solve, replay y meteorología comparten el
input; esta última usa perfiles secos antes de aplicar los escenarios. Los
perfiles se deduplican sin perder repeticiones del orden. RED/GREEN, application,
solver, Go completo, vet, build web, roadmap y diff-check pasan. Astra high cerró
dos defectos del primer corte y recomendó derivar el bucket desde el modo para
eliminar un parámetro contradictorio. El delta seco→mojado sigue promediado entre
pilotos; queda registrado como #1239 y no se afirma clima individual. Siguiente:
T06/T07 disponibilidad y conducción, además de distinguir orden fijado de
propuesta libre. Sin UI, app/Wails/LMU, DuckDB, push, PR, CI remota, integración
ni release.

## Historial — #1238 presupuesto de secuencia cerrado localmente

#1238 corrige el agotamiento observado en una carrera de 136 vueltas con cuatro
pilotos equivalentes. El camino escalar existente acepta ahora varios perfiles
idénticos cuando hay una secuencia explícita, calcula el mínimo de stints que
completa su primera pasada y asigna la rotación a stints y paradas. La búsqueda
general y su poda quedan intactas. El RED reproducía el presupuesto agotado;
GREEN acredita cero iteraciones de búsqueda, orden completo, solver y Go. Astra
high recomendó retirar una optimización general innecesaria y no encontró P0–P2
en el corte final. Siguiente: T02g2b conecta perfiles y secuencia desde Strategy.
Sin UI, app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1236 T02g2a cerrado localmente; adapter multipiloto pendiente

T02g2a añade a SolverV2 una secuencia de pilotos opcional. Ausente conserva la
selección libre; presente exige la primera pasada y después repite el orden,
validando perfiles y replay. La poda conserva el número de stints porque define
la posición en la secuencia. RED reprodujo contrato ausente y una falsa
inviabilidad `[A,A,B]`; el resultado coincide con el oráculo acotado. El atajo
de recursos ya retrocedía correctamente a la búsqueda general, demostrado sin
añadir un guard redundante. Focales, solver completo, vet y diff-check pasan.
Astra high no encontró P0/P1/P2 tras la corrección. Siguiente: T02g2b conecta
perfiles y secuencia desde Strategy, sin decidir todavía cómo la UI distingue
propuesta libre de orden fijado. Sin UI, app/Wails/LMU, DuckDB, push, PR, CI
remota, integración ni release.

## Historial — #1235 T02g1 cerrado localmente; contrato multipiloto pendiente

T02g1 crea el perfil efectivo antes de optimizar únicamente cuando el evento
tiene un piloto y límites de conducción. Solve, meteorología y evaluación final
comparten el mismo input; Fuel y VE conservan la precedencia única de SolverV2,
incluidos cero no aplicable y proyecciones que prevalecen sobre referencias. El
camino sin límites conserva su comportamiento y coste. RED reprodujo la ausencia
del perfil, la pérdida de VE proyectada y el hueco meteorológico; focales,
application/solver, `go test ./...`, vet, build web y diff-check pasan. Astra high
no encontró P0/P1/P2 ni complejidad productiva que retirar. Siguiente: fijar la
semántica multipiloto sin reinterpretar todavía `variant.Order`. Sin UI,
app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1234 T02f3b cerrado localmente; T02g listo

T02f3b añade servicios explícitos y tiempo de formación como dos campos
opcionales del borrador recorded v1. El parser existente valida su forma sin
crear otra autoridad semántica; el adaptador los copia al evento sin aliasing y
conserva ausencia y cero. Los borradores anteriores mantienen exactamente su
JSON y versión. RED reproducido con nueve fallos; focales 48/48, typecheck y
lint focal pasan. La suite completa 3806/3806, lint, build y contratos del
roadmap también pasan. Astra high recomendó este corte de tres cambios productivos,
sin nuevo validador, modelo, migración ni cálculo TypeScript. Siguiente: T02g,
perfiles antes de optimizar. Sin UI, app/Wails/LMU, DuckDB, push, PR, CI remota,
integración ni release.

## Historial — #1233 T02f3a cerrado localmente; T02f3b listo

T02f3a alinea el cliente TypeScript con servicios explícitos de parada y tiempo
de formación. La petición conserva el desglose exacto; el parser de resultados
ya no descarta formación y distingue ausencia de cero. `pitLossSeconds` sigue
requerido por compatibilidad de este contrato y Go lo ignora cuando existe el
desglose. El doble frontend sólo acredita transporte y parsing, no vuelve a
calcular la fórmula. Focales 60/60, suite completa 3796/3796, typecheck, lint,
build y contratos del roadmap pasan. Astra high no encontró P0/P1/P2 ni otra
capa que eliminar. Siguiente: T02f3b custodia y
adaptación recorded. Sin UI, app/Wails/LMU, DuckDB, push, PR, CI remota,
integración ni release.

## Historial — #1232 T02f2 cerrado localmente; T02f3 listo

T02f2 transporta un tiempo de formación opcional al modelo temporal existente.
El reloj total y el inicio de la primera vuelta lo incluyen, mientras conducción
y distribución por piloto lo excluyen. La estimación temporal descuenta ese
tiempo desde el primer horizonte: 600 s, vueltas de 60 s y 130 s de formación
convergen en ocho vueltas aun cuando diez serían inviables por recursos. Ausencia
y cero explícito permanecen distintos. No se modelan vueltas ni consumo de
formación. Astra high no encontró P0/P1/P2 tras corregir el horizonte inicial.
Siguiente: T02f3 TypeScript y custodia recorded de servicios/formación. Sin UI,
app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1231 T02f1 cerrado localmente; T02f2 listo

T02f1 añade al evento de cálculo un desglose opcional y completo de servicios
de parada. El adaptador único lo convierte al `PitCostModel` existente y marca
sus cuatro valores como explícitos, por lo que ni `pitLossSeconds` ni una
proyección histórica pueden pisarlos. El mismo replay acredita 28 s en paralelo
y 33 s en secuencial; sin el objeto nuevo se conserva exactamente el modelo
all-in anterior. No se ha añadido otro solver, validador o modelo de coste.
Astra high no encontró P0/P1/P2 ni complejidad eliminable. Siguiente: T02f2
tiempo de formación y su encaje en el horizonte de carrera. Sin TypeScript, UI,
app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1230 T02e4 cerrado localmente; T02f listo

T02e4 amplía el mismo borrador recorded v1 con inventario físico y ritmo por
compuesto opcionales. La custodia exige ambas partes juntas, valida la forma
canónica y el adaptador las clona al evento de cálculo. Los borradores anteriores
sin esos campos conservan su JSON. No se convierte el conteo del calendario ni
se migra `remainingPercent`, porque fabricaría estado físico. Focales 38 y
frontend completo 448/3790, typecheck, lint, build, roadmap y diff-check pasan.
Astra high cerró dos huecos de forma y no encontró P0/P1/P2 ni otra capa que
eliminar. Siguiente: T02f servicios/formación. Sin UI,
app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1229 T02e3 cerrado localmente; T02e4 listo

T02e3 alinea el cliente TypeScript con el contrato físico Go sin otra
representación: reutiliza `StrategyTyre`, transporta inventario y parámetros de
compuesto, y valida compuesto/montaje/cambio en resultados. `changeTyres: false`
conserva presencia; respuestas legacy sin campos físicos siguen válidas. Go
mantiene la validación completa del inventario. El siguiente corte T02e4 conecta
custodia y borrador recorded sin derivar individuos desde conteos. Focales 62,
typecheck y lint pasan; Astra high no encontró P0/P1/P2 ni complejidad eliminable.
Sin UI, app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1228 T02e backend cerrado localmente; T02e3 listo

T02e acredita que `PlanningInputs` ya lleva curva combinada y vida útil derivada
al cálculo, y añade únicamente el transporte de inventario físico explícito y
parámetros de compuesto existentes. La evaluación final conserva compuesto,
montaje y cambio/no cambio del solver; una redistribución manual incompatible se
rechaza. No convierte el inventario agregado del documento ni infiere códigos,
identidades o condiciones LMU. El siguiente corte T02e3 alinea el contrato
TypeScript; T02e4 conecta custodia y borrador recorded. Application, SolverV2 y
neumáticos pasan. Astra high no encontró P0/P1/P2 ni complejidad eliminable. Sin
app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1227 T02d2d cerrado localmente; T02e listo

T02d2d añade las cargas iniciales Fuel/VE al contrato TypeScript y adapta el
borrador recorded únicamente al evento que CalculateOrbit ya consume. Tiempo y
vueltas, reglas, reservas, cero, ausencia y VE no aplicable conservan su
semántica; una configuración desconocida o incompleta se rechaza. No construye
pilotos, ritmos ni variantes antes de disponer de datos derivados, ni activa el
panel Plan. El siguiente corte T02e continúa la matriz con inventario y curvas.
Sin app/Wails/LMU, DuckDB, push, PR, CI remota, integración ni release. Astra
high recomendó este límite para evitar contratos provisionales.

## Historial — #1226 T02d2c cerrado localmente; T02d2d listo

T02d2c conecta las cargas iniciales Fuel/VE del evento Go con SolverV2 y la
evaluación final. Cero, ausencia y capacidad permanecen separados. Sólo el
primer target queda fijado; el replay común conserva factibilidad y coste. El
remanente VE atraviesa las paradas como Fuel y los servicios nunca retiran
energía. Un override Fuel contradictorio se rechaza. T02d2d sólo debe enlazar
TypeScript y el borrador existente. Sin cambios UI, app/Wails/LMU, DuckDB,
push, PR, CI remota, integración ni release. Astra high no encontró P0/P1/P2
ni complejidad eliminable. Application y Go completos, vet focal, build web y
roadmap pasan.

## Historial — #1225 T02d2b cerrado localmente; T02d2c listo

T02d2b añade cargas iniciales Fuel/VE opcionales y trazables a SolverV2. Con
presencia explícita, búsqueda general, replay, canonicalización, clima y peor
caso usan exactamente ese valor, incluido cero. La ausencia conserva el atajo
y la selección mínima heredados. Se reutilizan escalares y búsqueda existentes;
el atajo no se amplía. El diagnóstico de riesgo parte también de la carga fija
para mantener causas Fuel/VE concretas. T02d2c conectará application y la
evaluación final. Sin cambios frontend, app/Wails/LMU, DuckDB, push, PR, CI
remota, integración ni release. Astra high no encontró P0/P1/P2 ni complejidad
eliminable. Solver, Go completo tras generar el embed web, vet focal, build web
y roadmap pasan; el primer Go global sólo encontró `frontend/dist` ausente en
el worktree nuevo.

## Historial — #1224 T02d2a cerrado localmente; T02d2b listo

T02d2a amplía el contrato existente con reservas independientes: Fuel en litros
y energía virtual en puntos porcentuales, incluida la presencia explícita de
cero. VE distingue `applicable` de `not_applicable`; este último estado la
excluye del cálculo también con escenarios meteorológicos, sin mutar la
proyección original. La ausencia de los campos conserva el comportamiento
heredado. Todo entra por el mismo adaptador y `manual.CalculateRace`; no hay
otro solver, store o estado. El siguiente corte T02d2b añade cargas iniciales
fijas de Fuel/VE. Astra high no encontró P0/P1/P2 ni complejidad evitable. Go
completo, vet focal, frontend 447/3763, cliente 49/49, typecheck, lint, build y
roadmap pasan; la primera suite frontend tuvo un timeout Playwright heredado de
Pedals Redline, cuyo focal y repetición global pasaron. Sin app/Wails/LMU,
DuckDB, push, PR, CI remota, integración ni release.

## Historial — #1222 T02d1 cerrado localmente; T02d2 listo

T02d1 añade el horizonte exacto por vueltas al contrato de cálculo con la
mínima bifurcación posible. `raceKind: "laps"` exige `targetLaps` positivo y
duración inactiva a cero; el contrato anterior sin discriminador sigue siendo
temporal. Ambos caminos comparten `manual.CalculateRace` y el cálculo por
vueltas ya existente, por lo que no aparece otro solver, conversión a minutos,
iteración o estado. Go conserva exactamente N vueltas con ritmos distintos y
el puente JSON; TypeScript usa una unión discriminada y transporta el cero sin
perder presencia. Astra high aconsejó esta separación y no encontró P0. El
siguiente corte T02d2 transporta cargas iniciales y reservas independientes de
Fuel y energía virtual. Sin app/Wails/LMU, DuckDB, push, PR, CI remota,
integración ni release.

## Historial — #1220 T13e cerrado localmente; T02d listo

T13e conecta los límites registrados de extremo a extremo sin añadir otro
servicio, store o ciclo de edición. Preparación devuelve límites originales y
anclas acreditadas; Save/Resolve revalidan el cuarto grupo junto a escalares,
familias y clasificación. El cliente conserva compatibilidad v1–v4, valida v5 y
rechaza respuestas que cambien la petición. Datos permite mover, retirar o
restaurar un límite con causa y motivo, mientras Revisiones lo cuenta y muestra.
Descarte, confirmación incierta, restore, proyección y adopción siguen las rutas
existentes y las visitas a boxes permanecen independientes. Astra encontró y se
corrigieron la lista nula al preparar una sesión sin paradas, una cuota aplicada
por error al inventario, la aceptación de campos v5 vacíos en snapshots antiguos
y la presentación del reloj de sesión como fecha civil; la segunda revisión no
encontró P0/P1/P2 ni complejidad evitable. Frontend completo (447 archivos/3762
tests), typecheck, lint, build, Go completo, vet focal y roadmap pasan. Después,
el orden canónico continúa con T02d (horizonte y recursos), no con una ampliación
de T13. Sin app/Wails/LMU, push, PR, CI remota, integración ni release.

## Historial — #1216 T13d cerrado localmente; T13e listo

T13d aplica el conjunto v5 sobre una copia de la validez efectiva y lo inserta
en el pipeline existente antes de las derivaciones. La vista reutiliza primero
la aplicación completa v1-v4 y comprueba después la identidad íntegra del
snapshot v5. Cada target debe seguir presente exactamente tras reanalizar los
escalares y el ancla nueva debe sobrevivir a esa rederivación; no hay migración
por tiempo u ordinal. Movimiento, retirada y restauración reproducen límites,
curvas y estrategia observada sin mutar fuente, digest o snapshot. Los límites
movidos publican procedencia corregida sin confianza observada heredada; los
stints derivados se renumeran y quedan vinculados al snapshot de corrección.
Telemetry Analysis, race y vet focal pasan. T13e debe exponer operaciones por el
servicio y cliente nativos y conectarlas a la UI avanzada. Sin app/Wails/LMU,
push, PR, CI remota, integración ni release.

## Historial — #1214 T13c cerrado localmente; T13d listo

T13c integra las correcciones de límites en la custodia existente mediante el
snapshot y comando v5. Sin límites activos conserva las representaciones y
digests v1-v4 exactos. Save, reapertura, replay y Resolve comparten el conjunto
canónico; un llamador antiguo no puede borrar límites activos y un conjunto
vacío explícito restaura una revisión anterior sin eliminar historia. La cuota
de 256 operaciones cubre los cuatro grupos. Corrupción, targets almacenados
inconsistentes y confirmaciones de escritura inciertas se rechazan o recuperan
con el flujo existente. Telemetry Analysis, race y vet focal pasan. T13d debe
aplicar la vista efectiva y recalcular derivados; T13c no expone servicio/UI ni
simula una aplicación correcta. Sin app/Wails/LMU, push, PR, CI remota,
integración ni release.

## Historial — #1212 T13b cerrado localmente; T13c listo

T13b implementa en dos archivos los tipos y la validación pura de
`set_stint_boundary` y `remove_stint_boundary`. El conjunto se prepara contra la
base original, queda ordenado de forma canónica y se rechaza entero ante target
ambiguo, fila inicial, reloj/cobertura no acreditados, operación inerte, target
duplicado, colisión o inversión. Una vuelta invalidada sigue siendo ancla si
tiene intervalo real; un stint de una vuelta y la frontera terminal observada
siguen permitidos. La validación reutiliza la cobertura existente y conserva
intactos modelo, peticiones y punteros. Telemetry Analysis completo y vet focal
pasan. Astra high no encontró P0/P1; sus dos P2 y simplificaciones se aplicaron.
Siguiente corte: T13c snapshot/custodia, sin mezclar derivados o UI. Sin
app/Wails/LMU, push, PR, CI remota, integración ni release.

## Historial — #1211 T13a cerrado localmente; T13b listo

El contrato mínimo de edición de límites de stint queda fijado en
`docs/strategy-planner/sdd/stint-boundary-corrections-t13.md`. Hay dos operaciones
explícitas sobre límites originales: mover a un final de vuelta `lap_event` y
retirar de la vista efectiva. Comparten tipo y validador; no crean límites ni
otro segmentador. La base, sus archivos y `SegmentationDigest` permanecen
intactos. T13b se limita a tipos/validación pura y cuatro paths nuevos; snapshot,
custodia, derivados y UI quedan en T13c-e. Sin código productivo, app/Wails/LMU,
push, PR, CI remota, integración ni release.

## Historial — #1208 cerrado localmente; T13a desbloqueado

El banco real D pasa sobre S125 Imola, S266 Algarve y S026 Monza con el runtime
confiado DuckDB v1.5.5. Los tres puentes quedan alineados. S125 publica sólo
`pit@2893.76`; S266 sólo `pit@13580.36`; S026 conserva `pit@9149.8` y
`pit@12158.9`. Desaparecen los tres `fuel_jump` fantasma de T19a y no quedan
stints de una vuelta. Fuel/VE tienen métrica derivada en 25/25, 58/58 y 53/53
vueltas.
Las colas de cobertura de S266/S026 empiezan tras el último `Lap`, no por mezcla
de orígenes. Las visitas finales abiertas conservan final y recursos ausentes.

Los SHA-256 originales son idénticos antes/después y no apareció `.wal`.
Strategy y Telemetry Analysis completos pasan. `internal/...` tuvo un único
timeout de presupuesto SQLite ajeno; el focal pasó inmediatamente en 0.25 s y
la repetición global `go test ./... -count=1` pasó tras generar sólo el embed
web. `go vet ./...` conserva tres avisos `unsafe.Pointer` heredados fuera del
alcance; vet focal de los paquetes modificados pasa.
El banco real llevó a una última regresión RED/GREEN: un repostaje dentro de
`In Pits=true` inicial ya no crea límite sin una entrada observada. El banco
reutiliza el modelo importado y separa importación de la preparación avanzada.
S266 supera el presupuesto de esa preparación con el conjunto actual de
canales; queda en #1210 sin relajarlo dentro de #1208. Evidencia versionada en
`docs/strategy-planner/evidence/isa-1208/`.

Dos importaciones independientes producen catálogos byte a byte idénticos para
las tres fuentes. El recorrido completo S125→S026 también pasa y conserva la
identidad importada frente a la revisión nativa. El replay de S266 se limita a
importación/derivaciones; no se afirma roundtrip de correcciones mientras #1210
siga abierto.

Astra high aconsejó congelar A-C2 y evitar otro harness; el cierre conserva esa
ruta mínima. Pendientes inmediatos: commit y actualización de #1208. Después
puede comenzar T13a. Sin app/Wails/LMU, push, PR, CI remota, integración ni
release.

## Historial — #1208 corte C2 cerrado localmente

C2 conserva visitas `In Pits` cerradas y abiertas sin fabricar el final. Una
visita abierta lleva inicio observado, final ausente, duración no disponible y
motivo `open_pit_lane_interval`; queda fuera de tasas, medias y paradas
completas. La primera fila sigue siendo estado inicial. En visitas cerradas,
Fuel/VE usan los timestamps acreditados y la tasa mide el intervalo real de los
pares que prueban la subida. Wear se compara directamente en finales de vueltas
consecutivas y publica el número real, sin resets ordinales. El contrato acepta
duración cero únicamente para ese caso abierto sin recursos finales. Versiones:
`pit-observation.v2` y `observed-strategy.v2`.

RED C2: el contrato rechazó el abierto y el test de wear no compiló con la
forma correcta basada en vueltas. GREEN focal y paquete Telemetry Analysis.
Astra high detectó dos P2 acotados en el agregado sólo-abierto y el validador
de recursos finales; ambos están corregidos. Sigue D con banco real
S125/S266/S026 y gates. Sin app/Wails/LMU, push, PR, CI remota, integración ni
release.

## Historial — #1208 corte C1 cerrado localmente

C1 elimina el último uso de tiempo relativo al cruzar recursos continuos con
vueltas. Los lectores escalares y vectoriales sólo consumen timestamps finitos
con origen acreditado; Fuel, energía virtual y desgaste quedan no calculables
sin puente. Coldstart y la ruta de correcciones construyen una vista por
operación y la comparten con validez, consumo y curvas. No cambian fórmulas,
buckets, exclusiones o umbrales. Las versiones de cálculo pasan a
`consumption-pace.v5` y `derived-curves.v4`.

RED C1 observado: los casos nuevos recibían segundo 7 desde el tiempo relativo
en vez de 1007 desde el reloj de fuente y una fuente sin alinear aún producía
Fuel/VE. GREEN: regresiones de reloj escalar/vectorial, offset, fail-closed y
desgaste; paquetes Telemetry Analysis y coldstart PASS; `internal/...` PASS.
Las fixtures representan vistas alineadas y no sustituyen el banco DuckDB real.
Astra high aceptó el corte y no encontró P0/P1 ni simplificación material.

Siguiente corte: C2 valida recursos dentro de los intervalos `In Pits` con el
mismo reloj y sin doble conteo. Sin DuckDB real, app, Wails o LMU; no hay push,
PR, CI remota, integración ni release.

## Historial — #1208 corte B cerrado localmente

El corte B hace que `ReadCorrectionInput` construya una sola vista temporal
alineada y la entregue tanto a validez como al modelo de correcciones. El
análisis deja de reconciliar por orden los resets de `Lap Dist` con eventos:
vueltas, tráfico, cobertura y repostajes cruzan dominios sólo mediante el
timestamp acreditado por el puente. La cobertura declara una única serie con
índices contiguos y reloj creciente, usando `Lap Dist` sólo cuando ningún canal
meteorológico lo demuestra. El repostaje gradual se acumula por tramo y se
resuelve contra la vuelta o la visita a boxes correspondiente; `pit` conserva
prioridad y el estado inicial no crea una parada.

RED B observado: los tests nuevos fallaron al compilar porque todavía no
existía `LapValidityDiagnostics.TemporalBridge`. Después pasaron siete
regresiones dirigidas, `go test ./internal/telemetryanalysis -count=1` y
`go test ./internal/... -count=1`; `git diff --check` también pasó. Astra high
revisó el planteamiento y el diff final en modo sólo lectura: señaló el estado
inicial y la continuidad de cobertura, ambos corregidos, y no encontró otro
P0/P1 ni una simplificación material. No es todavía evidencia sobre DuckDB
real: esa comprobación pertenece al corte D.

Siguiente corte: C1 aplica los timestamps alineados a Fuel, energía virtual y
ritmo, manteniendo las familias y umbrales actuales. No se ha abierto DuckDB
real, app, Wails o LMU; no hay push, PR, CI remota, integración ni release.

## Historial — #1208 corte A cerrado localmente

El corte A de #1208 implementa el puente temporal puro `GPS Time` en
`internal/telemetryanalysis/temporal_alignment.go`. La vista resultante clona
sesión y páginas, valida el reloj por fuente, alinea cada canal sólo mediante
muestras exactamente coincidentes y conserva intacta la procedencia declarada.
Ausencia, valores no finitos, retrocesos/duplicados, frecuencia incompatible,
índices inválidos o cobertura truncada fallan cerrados con diagnóstico estable;
un canal rechazado no invalida otro compatible. `GPS Time` forma parte de la
unión canónica de canales que debe leer el importador.

TDD observado: el focal falló primero por `undefined: BuildTemporalAlignment`.
Después pasaron el focal y `go test ./internal/telemetryanalysis -count=1`.
`go test ./...` ejecutó el resto de paquetes, incluido Telemetry Analysis, pero
su resultado global fue FAIL exclusivamente porque este worktree aislado no
contiene `frontend/dist` requerido por `go:embed`; no se generó ese artefacto
porque el corte no toca frontend y la ejecución acordada no abre ni construye
la app de escritorio. Dos intentos con Devin SWE-2 Max fueron cancelados antes
de cualquier edición: el primero quedó deliberando y el segundo permaneció
activo sin emitir trabajo; root hizo el relevo local previsto por este handoff.

Siguiente corte: B aplica una única vista alineada a vueltas y entradas de
corrección, corrige cobertura y elimina la asociación ordinal de `fuel_jump`.
No se ha abierto DuckDB real, app, Wails o LMU; no hay push, PR, CI remota,
integración ni release.

## Historial — T12 cerrado localmente; plan restante reconciliado

Auditoría de continuidad al 2026-09-13 sobre `c2d5b45b43bbf8ff0efb2cd16f1598f7a4925eff`,
rama `vantareapp/isa-1104-recorded-classification`, worktree
`C:/tmp/vantare-isa1104`. El cierre J9 está documentado al final de este mismo
handoff: código `fc57eb9a`, cierre `10105058`, corrección de evidencia `c2d5b45b`.
T12 local cerrado en código, frontend web y banco real Imola→Monza 23.99 s /
Monza→Imola 35.98 s; hashes intactos. Esas duraciones son del banco, no del solver.
Sin push/PR/CI remota/integración ni aceptación Wails/visual/empírica.

El [plan SDD v1.1](../../strategy-planner/sdd/execution.md) sustituye la cola de
«siguientes» de los apuntes históricos de este archivo. T00–T12 **no** se
consideran todos completos: quedan entradas/perfiles/inventario/servicios y
estados de T02/T03/T06/T07. Se ha contrastado con matriz #1092 y UI actual.
T19a ya está auditado (ver historial abajo): el eje de eventos es anclable,
pero el producto mezcla ese reloj con el continuo y genera límites fantasma.
Antes de T13a se necesita una issue propia que corrija esa alineación y sus
joins con pruebas de regresión reales. Después T13a/límites T13, entradas/reglas/pilotos/estados y
revisiones T14, cálculo T15, stint/parada T16/T17. Anotación/calibración y
preflight nativo pueden adelantarse entre cortes. T18/T21/T22 cierran visual,
empírico y distribución; T23 entrega aceptable. T24 OSS/Monte Carlo sólo tras
aceptación recorded.

Orquestador conserva dirección/planes/docs/aceptación y comprueba diff/evidencia;
Devin MCP SWE-2 Max implementa/revisa cortes con modelo confirmado. Ante bloqueo
del adaptador puede haber relevo local documentado, deteniendo primero cualquier
ejecutor anterior. No OpenCode, subdelegación implícita ni dos escritores en
un worktree. Astra high revisa únicamente el plan por petición expresa.
Esta revisión documental no abre app/Wails/LMU ni genera build de escritorio.

Persisten: T11i/T22 `ERROR_INVALID_STATE` sin causa probada, reserva de carreras
completas insuficiente y umbrales/N sin aprobar. Estos gates no bloquean tareas
independientes ni se transforman en PASS para declarar terminado el producto.
#1091 cubre revisión SDD; las futuras implementaciones necesitan issue/base propias.

#1208 ya cubre el bloqueo temporal hallado en T19a. Root fijó el microplan
[temporal-alignment-isa-1208.md](../../strategy-planner/sdd/temporal-alignment-isa-1208.md)
sobre `e3b63708`, rama `vantareapp/isa-1208-strategy-temporal-alignment`.
Orden obligatorio: A reproducción/puente puro → B vueltas/cobertura/límites →
C1 recursos/ritmo → C2 parada → D banco real y gates. T13a no empieza hasta
que S125/S266 pierdan los stints fantasma, S026 no regrese y una fuente sin
puente falle cerrada. Sin app/Wails/LMU, push, PR, integración o release.

## Historial — T19a auditado: anclas temporales y propuesta T13a

Auditoría de semántica temporal sobre rama
`vantareapp/isa-1030-strategy-temporal-semantics`, base/HEAD `c53b8a19`,
worktree aislado `C:/tmp/vantare-isa1030-t19a`. Entrega: sólo documentación
y evidencia bajo `docs/strategy-planner/evidence/isa-1030/`
(`temporal-anchors-t19a.md` + `t19a-temporal-audit.json`); cero cambios de
código, tests, SDD o roadmap. Banco real opt-in PASS en cuatro pases
(19.73/29.46/31.03/19.84 s, dos con exportación aislada) sobre las tres carreras
autorizadas de la reserva #1030 (S125 Imola, S266 Algarve, S026 Monza);
hashes SHA-256 idénticos antes/después, sin `.wal`.

Resultado material para T13a:

- **Dominio de anclaje válido: el eje de eventos `ts`** — monótono, sin
  duplicados, compartido por las 42 tablas de eventos. `Lap` (ts, número)
  es ancla determinista de borde de vuelta; `In Pits` da intervalos de
  boxes verificables. La fila inicial de cada tabla es el estado al grabar,
  no una transición.
- **El eje continuo no es anclable**: `index/freq` deriva hasta +0.94 s
  por archivo y ninguna familia lee `GPS Time` (puente empírico presente
  en la fuente, no autorizado). Fuel/VE miden volumen pero no instante.
- **Stints fantasma demostrados en producto real**: la causa `fuel_jump`
  une resets de `Lap Dist` con vueltas por orden ordinal; la fase varía
  por archivo y desplaza el límite una vuelta antes (S266: stint fantasma
  = in-lap 137) o después (S125: stint fantasma = out-lap 30). S026 sale
  correcto por coincidencia de fase. Verificado contra el modelo exportado
  del propio banco, no sólo simulación.
- **Cobertura publicada mezcla ejes**: `addCoverage` compara fin continuo
  con ts de eventos; S266 publica un "hueco" de ~10078 s que es puro
  desfase de orígenes y deja 0/71 vueltas con métricas; S125 computa 25/39
  vueltas sobre ventanas desplazadas ~25 s sin marca. Degradación honesta
  en un caso, error silencioso en el otro.
- **No soportado**: driver swap, garaje vs pit lane, reloj absoluto,
  anclas intra-vuelta. `TyresCompound` constante ⇒ `tyre_change`
  indetectable. `Finish Status` sin transición ≠ carrera no terminada.
- **Prohibición explícita**: una vuelta lenta/inválida (`LapTime=0`,
  `pace_outlier`) o un impacto nunca son prueba de incidente/spin ni
  justifican un límite; el ancla exige `LapBoundary` verificable.

El siguiente corte obligatorio es corregir la mezcla de relojes, la cobertura
y el join ordinal que origina límites falsos; se hará bajo issue propia antes
de editar el contrato o implementar T13. T13a queda propuesto en §8 del informe:
`set_stint_boundary` ancla a
`LapBoundary` de la base (nunca a `lap_dist_reset` ni a ejes continuos),
con errores tipados (`unresolved_target`, `anchor_wrong_clock`,
`anchor_outside_coverage`, `boundary_ordering_violation`, …), invariantes
de orden estricto y dominio discreto de bordes de vuelta. Pendiente de
decisión del orquestador: semántica de retirar un límite espurio (el
contrato actual sólo nombra reemplazo) y si el check de cobertura se
endurece. Sin push/PR/CI/Wails/LMU; originales intactos.

## Historial — T12j8a aceptado; J8b preparado

J8a aceptado localmente y guardado en `59b9c870`: cinco paths, 368
inserciones/26 borrados. El contrato TypeScript acepta snapshot v4 y seis
campos wire con referencia/target coherentes; la UI sigue iterando sólo los
dos campos legacy. Fixture JSON producida por constructor J2 y contrastada
por test Go. RED válido `snapshot.contractVersion`; después 606 focales y
suite completa 445 archivos/3719 tests PASS, typecheck/lint/i18n/build,
global Go 126 paquetes y vet EXIT0. Intentos de runner y primer lint fallidos
se conservan separados y no se presentan como gates verdes. No GUI/Wails.

Root cierra J8b en cuatro paths: parser de target reutilizable, helper puro de
reemplazo atómico de las cuatro identidades desde metadata OPEN y
`session.combination`, más correlación Save/Resolve v4. Sin React ni selección
de catálogo; el selector visual/controlador será J8c.

Ejecución J8b pendiente por infraestructura: `fierce-light` devolvió dos veces
`resource_exhausted` antes de actuar y una sesión nueva, `sprinkle-blue`,
confirmada como SWE-2 Max, devolvió el mismo error antes de leer o editar.
Tres intentos, cero paths J8b tocados. No es un fallo del código ni requiere
decisión de producto; reanudar el mismo microplan cuando Devin recupere
capacidad. J6/J7/J8a y sus commits permanecen intactos.

## Historial — J7 aceptado y preparación de J8a

J7 aceptado localmente y guardado en `e315c9f8`: un path,
21 inserciones/12 borrados (el encabezado del informe Devin estimó
20/10; el diff y el commit dan el conteo correcto). La composición abre el
repositorio y fuentes una sola vez tras la licencia y comparte el mismo puntero
SessionCatalog con Analysis y Strategy. Se preservan las rutas de error sin
abrir fuentes, los logs y cold-start. Cinco pruebas focales PASS; global 126
paquetes ok/cero FAIL/EXIT0; vet y gofmt EXIT0. Es evidencia de composición y
compilación, no de arranque Wails. Informe:
`frontend/.tmp/isa1104-t12j7-devin-report.md`.

Siguiente corte ejecutable: J8a, cinco paths ya cerrados, para contrato
TypeScript v4 y fixture JSON contrastada con el constructor Go. El editor
actual debe continuar mostrando sólo campos legacy hasta tener selector
atómico de catálogo; cliente/correlación v4 siguen como corte posterior.

## Historial — J6 aceptado y preparación de J7

J6 aceptado localmente y guardado en `5608902d`: tres paths, 352
inserciones/5 borrados. `SaveCorrections` entrega el method value del catálogo
al store J3, sin resolver antes del lease; configuración nativa opcional y
errores públicos sanitizados. Tres tests nuevos cubren Save/Project v4,
historial y replay sin catálogo actual, reautorización de fuente, restore,
catálogo nil/desconocido/I/O, guardas sin escrituras y grupos sin identidad.
RED conductual válido previo: un test FAIL 0.051s/EXIT1 por resolvedor ausente;
después focal identidad 3/3 PASS, focal comandos 15 PASS, global 126 paquetes
ok/cero FAIL/EXIT0, vet y gofmt EXIT0. El antiguo probe incoherente se conserva
como evidencia rechazada, nunca como RED. Informe:
`frontend/.tmp/isa1104-t12j6-devin-report.md`.

Siguiente corte ejecutable: J7, un único path `cmd/vantare/main.go`, para
compartir exactamente la misma instancia de SessionCatalog entre Analysis y
Strategy conservando las guardas de apertura y cold-start. J8a permanece
cerrado en plan y no debe empezar antes de aceptar J7.

## Historial de coordinación — transición a Devin

Isaac confirma que planes y documentación siguen a cargo del orquestador.
Por instrucción posterior de Isaac, Devin MCP con SWE-2 Max sustituye a
OpenCode. Modelo confirmado por el conector como swe-2-max; sesión local
fierce-light (SWE-2 Max confirmado). Al retomar, sapphire-hippodraco ya no
era reconocida y el inventario del conector estaba vacío. Se conserva su
test nuevo de identidad (tres tests principales), aún sin gates registrados;
fierce-light recibe continuación focal, sin reiniciar el diseño.
La sesión anterior orchid-volleyball se interrumpió
con resource_exhausted (también al reintentar); tras reinicio del conector
ya no figuraba en su inventario. Nueva sesión SWE-2 Max confirmada, J6
reasignado con sus cambios conservados y evidencia rechazada explícita.
Devin ejecuta código, tests y revisión técnica; el
orquestador mantiene dirección, planes, documentación y aceptación basada
en evidencia. Un ejecutor por worktree, sin subdelegación ni cambios de
alcance por su cuenta. No se asigna más trabajo a OpenCode.
Rama `vantareapp/isa-1104-recorded-classification`, base exacta
`7f757135445439851180fc503da45f7eb9e557e7`; último código revisado
`c9f85a9f`. A–G3 y Ha/Hb/Hc/Hc2/Hd/I/J1/J2/J3/J4/J5
aceptados localmente tras revisión personal y gates. J2 ocupa cuatro paths,
+1149/-29, dentro de los cinco declarados (classification_identity.go no
necesitó cambios). Snapshot/decoder v4 con seis vectores v3 previos intactos.
Root cierra J3 de dos paths en el microplan: store y test de identidad,
callback nativo diferido bajo lease. No está conectado al catálogo/app aún.
J3 está implementado en sus dos paths y revisado personalmente; focales
reforzados pasan. Global:126 paquetes ok/cero FAIL EXIT0; vet de alcance
EXIT0. Devin acepta sin cambios; informe local en
frontend/.tmp/isa1104-t12j3-devin-review.md. Código guardado en 4d5c3178,
dos paths +700/-4. Root cierra J4 de cuatro paths en el microplan y la issue:
vista efectiva y tests de derivación/proyección; sin catálogo/montaje/UI.
J4 terminado por orchid-volleyball con SWE-2 Max: RED conductual previo,
11 tests nuevos PASS; global126ok/0FAIL y vet EXIT0. Root comprobó diff
productivo y logs; Devin implementó y revisó. Código d9dc43c8, cuatro paths
+689/-11. Informe local frontend/.tmp/isa1104-t12j4-devin-report.md.
J5 terminado y guardado en c9f85a9f, dos paths +267/-1. Siete tests nuevos
PASS (el encabezado del informe dice seis por error de conteo; root contó
siete en log), catálogo0.048s y clasificación4.598s EXIT0. Global126ok/0FAIL,
vet/gofmt EXIT0. Primer focal falló por variable sin usar en test; conservado,
corregido sin cambiar contrato. J6 de tres paths para comandos nativos y
errores públicos está asignado a Devin desde HEAD060c53e8; gates pendientes.
Root cerró J7 de un path para compartir la instancia en composición nativa,
sin nuevas fábricas y conservando guardas de apertura. Sin montar aún.
Root cerró también J8a (cinco paths) para contrato TypeScript v4 y fixture
contrastada con el constructor Go, manteniendo explícitamente el editor
legacy hasta disponer del selector de catálogo. Plan reflejado en #1104;
todavía sin asignar. Cliente y selector atómico quedan después.
En J6 root intervino dos veces: probe creado fuera del path declarado
(movido al test autorizado antes de ejecutarlo) y probe incoherente
(ID de Imola con Replacement Monza, sin catálogo configurado). Su log
isa1104-t12j6-red.log FAIL0.060s EXIT1 NO es RED válido ni defecto previo.
Se conserva; Devin debe construir caso coherente o documentar capacidad
nueva sin RED. Implementación J6 y gates siguen pendientes.

G3 ya conecta la biblioteca con el mismo editor Datos/Revisiones, también
sin combinación ni repositorio: apertura autorizada y referencia exacta,
inspección separada de selección, correcciones locales sin Project espurio,
pin del borrador por referencia completa y vuelta al asistente sin recrearlo.
Los formularios y comandos inciertos bloquean cambios de fuente/salida; las
pestañas conservan formularios. Auditor i18n Hd: EXIT0, paridad OK,
ausentes 0 y huérfanas 0; queda cerrado el estado intermedio de Hc.
Última suite global Hd: 444 archivos/3680 PASS, 224.02s EXIT0;
build 1086 módulos/1.56s EXIT0, typecheck/lint/auditor EXIT0.
Último Go global J5: 126 paquetes ok/cero FAIL EXIT0 y vet de alcance EXIT0.
I banco nativo real: Imola14.03s y Monza19.73s PASS/EXIT0, originales intactos.
Authorizer controlado; no prueba Wails/login, paridad visual ni precisión.

Ha ya consulta el original y comparte normalización; Hb aporta los doce textos
en cuatro idiomas; Hc conecta clasificación en Datos y Hc2 conserva la vista
al avanzar revisión. Hd ya muestra historial, con plan precisado por root en
`docs/strategy-planner/sdd/classification-corrections-t12.md`: Ha consulta del
original/normalización reutilizadas, Hb textos y Hc Datos A4 (aceptados);
Hc2 continuidad e historial Hd aceptados. Cada corte declara 2–4 paths. No generar correcciones
ficticias para comprobar disponibilidad ni duplicar validación en React.
I banco real opt-in aceptado. Root cerró resolución canónica
en §5/ADR0011 antes de su código; J1/J2 aceptados y J3 de dos paths definido. No aceptar
un hash de texto del cliente como catálogo autorizado. T13–T24 siguen en
la secuencia SDD; J3 ya está cerrado por root antes de asignarlo al ejecutor.

Sin cambio de alcance público ni entrega completa: `plan.md` intacto en
estos cortes internos; se actualizará con la entrega en el mismo PR.
Sin push, PR, CI remota, integración, promoción o release. No se reabre
app/LMU; gate Wails sigue pendiente por ERROR_INVALID_STATE de causa no
demostrada. Contraste real y paridad visual >9/10 siguen aparte.

Las entradas siguientes son evidencia histórica; el estado vigente es éste.

## T12j3 — custodia revisada antes del global

Dos paths: corrections_store.go (+52/-4) y nuevo test de identidad.
Callback nativo opcional, una resolución bajo lease después de replay,
cabeza, grupos y cuota. Digest canónico compartido por Save/Resolve,
cancelación y causas preservadas; sin consulta para operaciones históricas.
Root leyó producción y test completos. Exigió comparar Revision completa,
contar writes también en replay/reapertura/guardas/cuota, comprobar contexto
exacto y lease, retirada v4→v3→v2→v1 y ausencia original conservada.
Corregido sólo en el test nuevo; ningún test anterior modificado.

Focal inicial store3.935s/document0.106s/canonical0.053s EXIT0; final
IdentityStore12/12 PASS3.640s, store R2 4.029s, document R2 0.123s y
canonical R2 0.067s EXIT0. Gofmt R2/diff limpios. Logs crudos nuevos
frontend/.tmp/isa1104-t12j3-*.log, leídos por root, sin sobrescribir.
No RED previo para esta capacidad nueva. La cadena256 usa Saves válidos;
pruebas sobre t.TempDir, no banco real ni autorización de catálogo/fuente.
Worker idle al actualizar. Se asigna únicamente global Go/vet, sin más
cambios; J4 de aplicación/proyección será cerrado por root antes de delegar.
Sin banco/frontend/app/LMU/Wails, commit o entrega de J3 todavía.

## T12j2 — revisión personal y global aceptados

Baseline literal previo 0.022s EXIT0; seis vectores v3 fijos conservados.
Root revisó ambos archivos productivos y ambos tests. Exigió compartir
constructor, rechazar target inerte también al combinar y detectar null
con capitalización alternativa. Al compartir preparación se perdió la
delegación sin clasificaciones: R2 snapshot/document FALLARON por Session
cero en un cliente escalar. Restituida la ruta v1/v2, tests anteriores intactos.
R1 document falló por un digest de fixture incompleto según el diagnóstico
del ejecutor; el fixture final incluye su escalar. Canonical R1 falló por
un caso de referencia divergente que era también duplicado; corregido.

Focales leídos por root: snapshot R3 0.068s, document R4 0.150s,
classification R1 0.144s y canonical R2 0.047s, todos EXIT0; gofmt R4 EXIT0.
Logs nuevos frontend/.tmp/isa1104-t12j2-*.log, intentos conservados.
Worker idle antes de esta actualización; no global/vet ni commit todavía.

Root rechazó después la cuota con escalares vacíos/duplicados y los tests
de manipulación que dejaban SnapshotID obsoleto. Corregidos en los dos
tests nuevos, sin otro cambio productivo: 254 entradas válidas/distintas
más familia e identidad pasan256; añadir otra entrada rechaza257 con
snapshot vacío. El digest usa esas mismas peticiones. Reseal RAW conserva
inconsistencias y recalcula snapshot/comando/cadena: control intacto PASS,
target discordante y campos prepared alterados rechazados. Helper reutiliza
el patrón anterior, sin reconstruir canales/muestras ni reparar el contenido.

Focal final snapshot R4 0.069s, document R5 0.109s, canonical R3 0.052s
y baseline R2 0.023s EXIT0; classification R1 0.144s sigue vigente.
Gofmt R5 EXIT0. Baseline R2 ejecutó realmente Fixed (el filtro anterior
Snapshot no lo incluía) y confirmó los seis valores previos sin regenerarlos.
Root leyó código y logs. Se corrigió el último comentario: el digest de
comando no consulta target. Global Go126 paquetes ok/cero FAIL/EXIT0 y
vet de alcance sin salida/EXIT0, leídos y contados por root. Worker idle
antes del commit0a4f079fe3b9e02784670cb0a657699e3a2e27bf.
El catálogo valida pertenencia del destino de nuevas escrituras; nunca
autentica una historia local falsificada de forma coherente. J3 cerrado
por root antes de asignarlo. No banco/frontend/Wails nuevos; no publicación.

## T12j1 — preparación pura revisada y aceptada

Cuatro paths classification_corrections/identity y sus tests, sin tocar
snapshot/store/catalog/service/UI. Cuatro campos y referencia opcional
omitida para clientes anteriores; target nativo recibido, no autorización.
Root leyó todos los diffs y añadió exigencias: target ya recortado incluso
con campo original ausente, reutilizar el helper de disponibilidad,
preservar precedencia de base en constructor anterior, campo corregido
no verificable y límites de1024bytes multibyte/precondición RAW.
Corregidos; ninguna aserción anterior eliminada.

Focal canonical R1 0.029s y R2 0.068s EXIT0; clasificación R1 0.159s EXIT0.
R2 incorpora coberturas adicionales de test, sin nuevo cambio productivo;
gofmt/diff limpios. Logs frontend/.tmp/isa1104-t12j1-*.log leídos por root.
Son fixtures unitarios, no contraste autorizado contra catálogo ni UI.
Tras review sólo se corrigieron dos comentarios obsoletos. Global Go:
126 paquetes ok/cero FAIL/EXIT0; vet app, telemetryanalysis/..., strategy/...
y cmd/vantare: sin salida/EXIT0. Root contó el log global y leyó vet;
ningún log sobrescrito. Commit f6fcc09dadec655d2bde0d87993e4c8d3ba5bc25,
worker idle antes del commit. Sin banco, frontend, app/LMU o Wails repetidos.
Son reglas puras; aún no se consulta un catálogo ni se guarda identidad v4.

J2 queda definido por root en el microplan antes de asignación: snapshot v4
con target separado, compatibilidad byte a byte v1/v2/v3 y digest de comando
sin consulta de catálogo. La lectura usa el target persistido, no autoriza
fuentes. Primero fijar vectores v3 con producción J1 intacta. Cinco paths;
el store/callback y montaje se declaran en cortes posteriores.

## T12i — banco revisado y contrastado con dos fuentes reales

Commit `6c568769cb966e7230b1771fd64457a6118838c1`: sólo
integration_test.go (+2/-1) y nuevo classification_test.go (344 líneas),
bajo internal/app/strategy_recorded_real_*. Helper antes del familiar,
retorna handle reabierto y cabeza restaurada, sin nuevo reader/dato/fixture.
Root revisó todo el código y devolvió: restore debía ser v1; elegibilidad
de observed_strategy necesitaba el gate preliminar de vuelta completa,
no Included; lista íntegra de familias; clima proyectado recortado frente
a precondición RAW; referencia completa antes de omitir auditoría;
Load/Project históricos completos después de reabrir. Corregido.

Focal R3 real: app 0.178s EXIT0, Analysis 0.184s EXIT0; banco sin opt-in
SKIP explícito/0.045s EXIT0, que NO prueba el banco. gofmt/diff limpios.
Logs crudos frontend/.tmp/isa1104-t12i-{focal-app-r3,focal-analysis-r3,
focal-bank-r3,gofmt-r3}.log leídos por root.

El primer focal.log es resumen reconstruido, no log primario. Root comprobó
las ejecuciones originales en mensajes OpenCode msg_08d1f808c001H4FQ8uFVl5PEM2
y msg_08d1fcf9400150MYeDp9YucBir: app0.191s/Analysis0.172s EXIT0, banco SKIP.
R2 tuvo un fallo de invocación (TestClassification no reconocido) con EXIT0
inválido. Root leyó ese contenido inicial de 114 bytes; después el mismo
focal-app-r2.log fue sobrescrito con ejecuciones reales SKIP/app0.175s.
El error queda en la salida de herramienta del orquestador, NO conservado
en ese archivo como afirmó el ejecutor. No se reconstruye como log crudo.
R3 es la verificación válida del código actual. No RED de producto.

Tras review root asignó gates sin más cambios: global Go126 paquetes
ok/cero FAIL EXIT0, vet de alcance EXIT0. Imola PASS14.03s y Monza
PASS19.73s/EXIT0. Ambos abren98canales, prueban tres revisiones de
clasificación/historial exacto y después el helper familiar existente
(vueltas3 y63), y cierran con hash original idéntico. Logs global/vet/
imola/monza leídos íntegros o contados por root; detalle en
`evidence/isa-1104/README.md`. Worker idle antes de commit.
Originalhash/ausencia de señal y Wails son afirmaciones distintas.
Sin app/LMU, reserva, export, push/PR/CI remota o promoción. Siguiente J1.

## T12hd — historial revisado y gate completo

Commit `e583fe30925d7e8bd162fcc7a7f324509289e204`, dos paths
Revisions/tests, +146/-4. Original, confirmado y motivo
proceden únicamente del snapshot consultado; Ha sólo decide disponibilidad
y privacidad. Cuenta tres grupos, muestra procedencia manual y conserva
la distinción de etiqueta climática frente a señales físicas.

Root leyó el diff completo y exigió un v2 real además de v1, IDs únicos
de fixture y tres casos de privacidad con valores/motivo guardados presentes.
El ejecutor los corrigió sin más cambios productivos. Focal inicial
62 PASS/5.69s EXIT0; focal-r2 64 PASS/5.96s EXIT0. Typecheck/lint EXIT0,
lint-r2 del test EXIT0 y auditor --list-r2 EXIT0, paridad/ausentes/huérfanas
correctos. Typecheck excluye tests y no se repitió tras cambios sólo de test.
Sin RED de producto para esta nueva presentación. Logs bajo
`frontend/.tmp/isa1104-t12hd-*.log`, leídos personalmente; diff limpio.

Tras esa revisión root asignó sólo gates: suite completa 444 archivos/
3680 PASS, 224.02s EXIT0; build 1086 módulos/1.56s EXIT0. Logs
frontend-all/build leídos personalmente. Permanecen avisos ya registrados
de AbortError al cerrar happy-dom y chunks mayores de 500 kB; no se ocultan
ni se atribuyen a una corrección nueva. Worker idle antes del commit.
No Go nuevo ni banco, app/LMU, Wails o nota visual. Siguiente I, sólo los
dos paths de test declarados; primero diff/focal, luego global/vet y
bancos nombrados tras revisión personal. No abrir reserva ni exportar.

## T12hc2 — vista de Datos conservada al guardar

Commit `24e647505f892e92da379fcf9842f57140f6adba`, cuatro paths
Workflow/Data y tests, +90/-32. Sólo la vista elegida vive en Workflow y
pasa como props obligatorias; Data conserva sus formularios y revisionKey
mantiene su reinicio. Sin persistencia, estado duplicado ni inferencia del
snapshot. Host de tests mínimo con props tipadas y reenviadas completas.

Regresión previa real: 1 fallo/7 PASS, 4.76s EXIT1; después de Save confirmado
faltaba la fila de clasificación porque Data volvía a vueltas. Focal primero
57 PASS/5.99s; tras simplificar el host por revisión personal, focal-r2
57 PASS/5.73s EXIT0. Typecheck producto/lint y lint-r2 EXIT0; auditor --list
EXIT1 sólo manual pendiente de Hd, paridad OK/ausentes 0. Diff limpio.
Root leyó diffs/logs; ninguna aserción previa de Data cambió. El test nuevo
recorre entrada/inspección/edición/Save con DTOs válidos, valor confirmado y
sin Project/ejecución de comandos Strategy. No es prueba nativa.
Logs `frontend/.tmp/isa1104-t12hc2-{red,focal,focal-r2,typecheck,lint,lint-r2,audit-list}.log`
dentro de esta app. Worker idle antes de commit.

Siguiente Hd en dos paths, con guarda de privacidad por helper Ha y valores
del snapshot consultado, motivo/manual/clima. Después de revisión personal,
auditor sin huérfanas y suite/build completos. I ya precisado por root en
dos paths de test app, encadenamiento seguro de handles con banco familiar
y comparación física completa sobre Imola/Monza. §5 canónico aún pendiente.
No Go/banco/global frontend/build nuevos aquí; últimos G3a/G3f conservados.
Sin app/LMU, Wails ni entrega remota.

## T12hc — clasificación en Datos A4 y revisión personal

Commit `55d79e81b520e1df746e6d1bb12068791a1e4d7a`, cuatro paths
(Classification y test nuevos, Data y test), +481/-11. Tercera vista junto
a vueltas/muestras, original RAW/confirmado/propuesta separados, permiso
por campo con causa, formulario único, motivo/retirada explícitos y contador
de tres grupos; usa helpers y controlador existentes, sin CSS ni otro lector.

Root revisó los cuatro diffs y corrigió: lista inicialmente añadida debajo
de otras vistas; pruebas de retirada sin decisión guardada y contador sin
tres grupos; fixtures v3 vacíos/páginas discordantes; selectores de tests;
clima sin valor inicial; radios y outputs de tabla afectados por CSS de input.
Resultado: elección con select existente, celdas de texto, clima prellenado
y pruebas reales del hook para Save mixto y retirada confirmada. Parsers
validan las respuestas usadas; metadata original intacta, Project/Adopt 0.
La advertencia inicial de root sobre AnalysisSession compacto era demasiado
amplia: ese DTO sí es válido; no se añadieron campos nativos ajenos.

Baseline 38 PASS/4.50s EXIT0. Focal final R9: 56 PASS/5.58s EXIT0;
typecheck-r2/lint-r2 EXIT0. Auditor --list-r2 EXIT1: paridad OK, ausentes 0
y sólo `strategy.classification.manual` huérfana hasta Hd. Diff limpio.
R1 8 fallos/48 PASS, R2 3/54, R3 2/54, R4 1/55; R5 y R6 56 PASS;
R7 3/53, R8 1/55. Fallos de nuevos tests/fixtures y adaptación de controles
conservados, no RED previo de producto. Logs leídos en
`C:/tmp/vantare-isa1104/vantare-v2/frontend/.tmp/isa1104-t12hc-*.log`
(ubicación real, bajo frontend; sustituye la ubicación anunciada en Hb
sólo para estos logs). Regla *.log existente, sin cambios de configuración.

Worker idle antes de commit. No suite/build global nuevos: último G3f.
No Go/banco/Wails/app/LMU, sin certificación visual >9. Hc aislado no prueba
que la vista sobreviva a Save en Workflow: root detectó revisionKey,
declaró Hc2 de cuatro paths y exige regresión antes del cambio. Después Hd/I.

## T12hb — textos de clasificación antes de conectar consumidores

Commit `cda6e0040f35f6178dab0b53de7043cf22b5014c`, cuatro locales
ES/EN/IT/PT, +48/-0: doce claves nuevas por idioma, copia española decidida
por root y traducciones revisadas personalmente. No claves anteriores
modificadas ni cambios de comportamiento; no tests de espejo de texto.

Baseline auditor EXIT0/paridad OK/ausentes 0/huérfanas 0. Después del cambio,
auditor --list EXIT1 conocido: exactamente las doce claves nuevas aún sin
consumir. No se presenta como verde; Hc/Hd deben cerrarlo sin whitelist/usos
falsos. Typecheck y lint EXIT0, diff limpio. Root leyó diff completo y logs
`C:/tmp/isa1104-t12hb-{baseline,audit-list,typecheck,lint}.log`. Worker idle
antes de commit. Último global/build sigue siendo G3f; sin Go nuevo.

Siguiente Hc, cuatro paths de lista/detalle y Data con sus tests, conforme al
microplan. Logs nuevos en `.tmp/isa1104-t12hc-*.log` dentro de esta app; la
regla existente `*.log` ya los ignora. Se conserva toda evidencia anterior
en C:/tmp. No cambio de configuración/ignores. Hd cerrará historial y
gates completos. Sin app/LMU, banco, Wails ni acciones de entrega remota.

## T12ha — consulta del original reutilizada antes del montaje

Commit `e2d610cb10e73f4aa8d985fa80c4ecb362ead053`, cuatro paths de
contrato/helpers TS y tests, +137/-21. Extraídos el validador público del
original RAW y la consulta desde opened con las mismas guardas; parser y
constructor los reutilizan. Enum y normalización SessionType existentes
exportados como alias. Sin cambio de wire, versiones, Go, owner ni señales.

Revisión personal de los cuatro diffs sin hallazgos. Diez casos nuevos
cubren original/efectivo distintos, precondición raw, Unicode, campos parciales,
privacidad, duplicados, enum y ausencia de un nuevo límite/mutación. No se
modifican aserciones anteriores. Baseline previo: 123 PASS/881ms; el archivo
no registró EXIT y se conserva así. El worker declara exit 0 de la llamada
original; root no lo presenta como un EXIT leído del archivo.
Focal final: 133 PASS/944ms, EXIT0; typecheck producto/lint EXIT0 y diff limpio.
Logs `C:/tmp/isa1104-t12ha-{baseline,focal,typecheck,lint}.log` leídos por root.
Diagnóstico LSP preexistente de tuplas del test parametrizado fuera del diff;
typecheck producto no verifica esos tests. No ocultar esa diferencia.

Worker idle antes de commit. Siguiente Hb, doce claves en cuatro locales;
después Hc/Hd consumidores. Global frontend/build después de Hd; última
suite completa sigue siendo G3f. Sin banco/Wails/app/LMU ni entrega remota.

## T12g3f — biblioteca, inspección y vuelta al asistente conectadas

Commit `20b2aad0`, cuatro paths Workflow/Sessions y tests, +281/-14.
Inspeccionar sólo aparece con callback; el montaje navega únicamente si el
dueño acepta. Data/Revisions reciben todas las fuentes poseídas y referencias
reales del borrador. Volver está fuera de tablist y preserva teclado/foco,
borrador y handles; no dispara SaveDraft/Apply/Calculate. La biblioteca
bloquea Use si cualquier fuente es no proyectable y traduce errores nuevos.
Nombres parciales por candidato/unnamed; originales sensibles no se usan
para identificación. Causa dentro de la celda descriptiva conserva el grid.

Revisión personal corrigió: prueba que fabricaba initial/repository para
saltar la entrada real; DTOs incompletos y página distinta de la solicitada;
interacción bajo modal abierto; ausencia de comando realmente incierto;
nombres parciales antes de validar metadata; error técnico nuevo visible;
cuarto hijo en grid de tres columnas. Quedan cubiertos Inicio→Combinación→
Descubrir→inspeccionar sin combinación/repositorio, Save con Project 0,
historial exacto, borrador conservado, formulario crudo/dirty/uncertain,
Resolve sin segundo Save, Arrow/Home/End y error Load visible. La limpieza de
datos anteriores al fallar Load la prueba además el dueño G3c; no se atribuye
esa demostración a un test que empieza vacío.

Focal R1: 2 fallos/44 PASS, 5.70s; R2: 46 PASS, 5.17s; R3: 1 fallo/47 PASS,
5.44s; R4: 1 fallo/47 PASS, 5.57s; R5: 48 PASS, 5.46s; R6 final: 48 PASS,
5.45s. Fallos por consultas ambiguas de texto en tests, conservados; no son
RED de producto. Typecheck producto/lint/auditor --list exit 0 (paridad OK,
ausentes 0, huérfanas 0). Suite completa: 443 archivos/3644 PASS, 221.25s,
exit 0. Build: 1085 módulos/1.90s, exit 0. Diff limpio.
Logs `C:/tmp/isa1104-t12g3f-{focal,focal-r2,focal-r3,focal-r4,focal-r5,focal-r6,typecheck,lint,audit-list,frontend-all,build}.log`
leídos personalmente. Avisos AbortError de teardown y chunks>500 kB
conservados, ya registrados en cortes anteriores. Typecheck excluye tests;
casts de fixtures anteriores señalados por LSP no se modifican ni se presentan
como comprobados por ese gate. Los nuevos DTOs usados se validan por parsers.

Worker idle antes de commit; documentación/issue y siguiente plan por root.
Sin Go nuevo, banco real, Wails/app/LMU ni acciones externas de entrega.

## T12g3e2 — guardado de inspección sin error de preparación evitable

Commit `ce26fa8f`, dos paths hook/test, +70/-1. Cambio productivo limitado a
condicionar la proyección automática posterior a retainSaved: requiere ID de
combinación y ausencia de causa de no proyección. La publicación del guardado,
tres grupos, comando confirmado, Project explícito, Adopt y dueño no cambian.
Las fuentes proyectables conservan errores inesperados y revisión duradera.

RED previo real 3 fallos/25 PASS, 1.11s, exit 1: se llamaba a Project tras
guardar/confirmar una fuente no proyectable. Tests nuevos de Save v3 confirmado,
Resolve found tras respuesta perdida y marca con ID; contratos completos
validados, fuente original y adopción intactas. Focal hook + dueño G3c:
42 PASS/2.06s, typecheck producto/lint exit 0; diff limpio. Logs
C:/tmp/isa1104-t12g3e2-{red,focal,typecheck,lint}.log leídos personalmente.
No tests anteriores modificados ni fallos legítimos ocultos.

Worker idle antes del commit. Orquestador precisa G3f (botón fuera de tablist,
busy completo en biblioteca, formularios conservados entre tabs). Suite completa,
build y auditor i18n se cierran en G3f; tres claves aún pendientes de consumo.
Sin Go, banco real, Wails/app/LMU, push, PR, CI remota o promoción/release.

## T12g3e — selección real en Datos y Revisiones

Commit `7528f1b8`, cuatro paths UI/tests, +204/-9. selectedRevisions explícitas
por fuente/base; pin además por revisión/snapshot exactos. La revisión abierta
no marca uso en carrera; ReviewPinned carga una copia con la referencia del
borrador. Guardar/restaurar local permanece separado de preparar/adoptar, que
requiere fuente seleccionada y proyectable. Causas de ausencia de selección y
de metadata no utilizable visibles, también si la fuente marcada lleva ID.

Revisión personal retiró el OR antiguo que aún bloqueaba por revisión del handle
y exigió comprobar la referencia completa del plan. Fixture inicial Data
completado/validado sin cambiar IDs/valores; tests de referencias distintas,
fuente/base/snapshot, bloqueo con marca, selección explícita y guardado local.
RED R2 tras completar fixture: 1 fallo/8 PASS, 7.83s, causa ausente; R1 3.26s
con fixture UI previo preservado. Focal final 31 PASS/3.24s, typecheck producto
y lint exit 0; diff limpio. Logs C:/tmp/isa1104-t12g3e-{red,red-r2,focal,typecheck,lint,audit-list}.log
leídos personalmente. Lecturas iniciales del log fallaron por escapes de
comillas ajenos a PowerShell; no eran fallos de Strategy. RED guarda sufijo
literal con barras, además de la salida de test/ELIFECYCLE de exit 1.

Auditor exit 1, paridad OK/ausentes 0: sólo inspect, inspectionOnly y
backToWizard sin consumidores; se cierra en G3f, junto con suite completa/build.
No afirmar montaje funcional: Workflow aún no suministra selectedRevisions.
Worker idle antes del commit; sin banco real, Go nuevo, Wails/app/LMU, push,
PR, CI remota, integración, promoción o release. El orquestador añade G3e2 al
microplan para evitar un error de preparación después de un Save local válido.

## T12g3d — textos de inspección y selección

Commit `2ccc2973`, cuatro locales es/en/it/pt, +52/-32: cinco claves nuevas
y ocho textos actualizados por idioma, sin otro cambio. Copia española del
orquestador y traducciones revisadas personalmente: abrir/revisar no implica
sesión preparada o fijada para la carrera; causa de datos no verificables,
fuente no seleccionada y retorno al asistente.

Typecheck de producto y lint exit 0; diff limpio. Auditor i18n exit 1,
paridad OK y usadas ausentes 0, exclusivamente cinco huérfanas esperadas:
strategy.recorded.inspect, inspectionOnly, metadataUnavailable, notSelected,
backToWizard. El orquestador repitió con --list para verificar cada nombre.
Logs C:/tmp/isa1104-t12g3d-{audit,audit-list,typecheck,lint}.log leídos.
No es gate verde: pendiente consumirlas en G3e/G3f y cerrar auditor/global
frontend/build allí. No se introducen usos falsos, whitelist ni cambio del auditor.

Worker idle antes del commit. Nueva sesión Muse para E/F evita arrastrar el
contexto de los cortes previos; mismo modelo/proveedor/xhigh y un solo ejecutor.
Planes/documentación/issues/revisión/commits siguen en el orquestador. Sin
tests nuevos por copia, app/LMU, banco, Go, push, PR, CI remota o promoción.

## T12g3c — dueño de sesiones y acceso al editor

Commit `75de4086`, cuatro paths hooks/tests, +275/-0 (27 líneas productivas).
inspect resuelve el handle poseído y acepta la acción sólo si no hay operación,
ediciones/comando pendientes ni fallo de clear. Inicia el mismo Load después
de vaciar el editor; su error no deja datos de otra fuente. La exclusión usa
refs sincrónicas, no el busy del render anterior. Workflow abre el mismo editor
sin SaveDraft/Apply/Calculate y admite ausencia de combinación/repositorio.
Apply y adopción rechazan fuentes no proyectables, incluyendo fuente poseída
marcada ante una copia que pretenda habilitarla. Contrato de vista legacy intacto.

Revisión personal exigió pruebas que distinguieran cada bloqueo: dos fuentes
proyectables para comprobar Apply durante Load; una fuente ya poseída antes
de otra apertura; escritura real pendiente tras configurar borrador válido;
todo en el mismo act. Fixtures completos validados por parsers, proyección
con contrato válido y copia de revisión alterada que carga la poseída original.
Focal R2 23 PASS/1.89s, typecheck de producto y lint exit 0, diff limpio.
Primer focal 20/22, 1.98s, exit 1: expectativas nuevas erróneas (AbortSignal
esperado como undefined y escritura que no llegó a execute por borrador inválido).
Fallos preservados, no RED productivo; no hubo RED pre-cambio de esta API nueva.
Logs C:/tmp/isa1104-t12g3c-{focal,focal-r2,typecheck,lint}.log leídos personalmente.

Worker idle antes del commit. Sin global frontend/build hasta G3f según plan,
Go nuevo, banco real, Wails/app/LMU, push, PR, CI remota, promoción o release.
El orquestador fija textos y precisa G3e/G3f antes de asignar el montaje.
No se cierra T12 ni se afirma validación visual/nativa por estos tests.

## T12g3b — apertura exacta para inspección

Commit `b6107f9a`, cuatro paths apertura/propuestas y tests, +200/-4.
La causa explícita metadata_unavailable y baseDigest nativo válido permiten
Load de revisión inicial o esperada exacta, sin Project ni combinación del
borrador. Comprueba fuente/base/revisión/snapshot/digest; conserva un handle
poseído con causa de bloqueo. Errores/cancelación siguen cerrando el recurso.
Propuestas rechazan toda selección que contenga una fuente no proyectable.

Revisión personal corrigió un requisito innecesario de objeto combination:
la ruta legacy proyectada puede resolver su ID contra el catálogo. También
exigió cancelar después de Prepare antes de otra lectura. Regresiones de ambos
casos, referencia histórica con cabeza posterior, fuentes ajenas, contratos
inválidos, fallo de Load y cancelación tardía. RED 1 fallo/18 PASS, 874ms,
exit 1 por recorded_combination_unavailable. Focal final R2 36 PASS/721ms,
typecheck y lint exit 0; diff limpio. El primer focal (35/36) falló por una
expectativa errónea del nuevo test de digest; se conserva su log y no cuenta
como fallo de producto. Logs C:/tmp/isa1104-t12g3b-{red,focal,focal-r2,typecheck,lint}.log
leídos personalmente. Fixtures de contrato, sin datos reales.

Worker idle antes del commit. Global frontend/build tras G3f según plan;
sin Go nuevo, banco, Wails/app/LMU, push, PR, CI remota ni promoción/release.
El orquestador precisa ahora inspect del dueño y sus bloqueos en G3c; planes,
handoff e issue siguen bajo su responsabilidad. T12 permanece abierto.

## T12g3a — identidad nativa de inspección

Commit `cd2ab65b`, cuatro paths preparación Go/contrato TS y tests, +67/-1.
PrepareCorrections entrega SourceAnalysisRef.Digest como baseDigest dentro
de la autorización/lifecycle/bloqueo existentes, también con metadata parcial.
Mantiene revisión inicial, capacidades y combinación/causa. TS valida digest
si está presente y admite su ausencia en respuestas antiguas de la ruta
proyectada. Sin hash en frontend ni nuevo lector/catálogo/custodia.

RED wire real en variantes completa y parcial (exit 1, paquete 0.058s): valor
vacío frente al digest esperado. Tests verifican identidad exacta, diferencia
con revisión inicial y estabilidad de Prepare repetido. Go focal 0.052s,
TS focal 103 PASS/760ms, typecheck, lint y vet de alcance exit 0. Global
`go test -p 1 ./...` exit 0: 126 paquetes ok/cero FAIL. gofmt/diff limpios.
Logs C:/tmp/isa1104-t12g3a-{red,go-focal,ts-focal,typecheck,lint,vet,global}.log
leídos personalmente. Mapeo público de errores existente conservado.

Suite frontend completa/build se reservan a G3f según el microplan; último
conjunto completo es G2 (3575 PASS/build). Sin banco real ni Wails/app/LMU.
No push/PR/CI remota/integración/promoción/release. Worker idle antes del commit;
el orquestador mantiene planes, handoff e issue. G3a no cierra acceso al editor.

## T12g2 — controlador de correcciones y restauración

Commit `0873be52`, dos paths `use-recorded-corrections.ts/test`, +319/-12.
Clasificaciones en todas las transiciones de Editor; Save explícito con los
tres grupos. Restore toma todos los conjuntos del antepasado elegido y usa
la cabeza anunciada sólo como precondición: no hereda clasificaciones nuevas.
Cuota total antes de publicar estado, origen original, guardado incierto
congelado, Resolve/retry explícitos y revisión duradera aunque falle Project.

RED real 1 fallo/12 PASS (882ms): restaurar v1 ante cabeza v3 enviaba una
clasificación posterior. Entradas validadas por el parser. Revisión personal
exigió también respuestas guardadas coherentes (nueva revisión d con padre b),
cuota con los tres grupos y retry completo tras intentos bloqueados de edición,
retirada, descarte y carga. Pruebas de v1/v2/v3, original frente a valor efectivo,
Resolve found con cabeza avanzada, ausencia/conflicto y cancelación tardía.

Focal final R3 25 PASS/937ms, exit 0; typecheck producto y lint R2 exit 0.
Suite completa exit 0: 443 archivos/3575 PASS, 195.71s; build exit 0, 1085
módulos, 1.05s. Avisos AbortError de teardown y chunks >500 kB conservados,
también presentes en comprobaciones anteriores; sin atribuir causa nueva.
Logs C:/tmp/isa1104-t12g2-{red,focal,focal-r3,typecheck,lint-r2,frontend-all,build}.log.
Un intento focal R2 falló por un cierre sobrante en test:254, cero tests
ejecutados (19:42:14); el worker sobrescribió ese archivo al reintentar antes
de recibir la instrucción de conservarlo. El fallo se leyó en la salida de
herramienta, no queda un log separado: R2 actual es 25 PASS/1.16s. No cuenta
como RED productivo ni se oculta; R3 es la verificación final nueva.

No Go repetido, banco real ni Wails. Sin app/LMU, push, PR, CI remota,
integración, promoción o release. Commit del orquestador con worker idle;
sesión Muse anterior detenida, la siguiente usa contexto nuevo para G3.
T12 sigue abierto; G3 y montaje/banco no se sustituyen por estos fixtures.

## T12g1 — helpers de corrección completos

Commit `f5c01dda`, cuatro paths de contrato TS/helpers y sus tests, +201/-8.
Resolvedor de claves a SessionType/WeatherConditions con normalización nativa
existente, devuelve undefined para otra metadata sin ampliar el campo wire.
Corrección desde original exacto y válido de la sesión abierta; otra ausencia
no bloquea este campo. Sustituir/retirar valida conjuntos y bases; guardado
conserva por defecto clasificaciones del snapshot y permite retirar con [].
Cuota TOTAL 256 entre los tres grupos, no 256 por grupo; payload clonado.

Revisión personal corrigió el primer fixture RED (v3 con comando inicial vacío)
antes de aceptar evidencia: RED R2 usa revisión guardada validada por el parser,
1 fallo/12 PASS, 710ms, salida classifications undefined. El resolvedor ya se
había añadido sin uso, pero recordedCorrectionSave aún no se había cambiado;
no se revirtió producto para producir el RED. También se corrigió validar base
y duplicados sólo después de filtrar el campo sustituido; regresiones cubren
ahora esas entradas inválidas. Comentario nativo corregido de EqualFold a
ToLower(TrimSpace); ningún normalizador general ni hash en frontend.

Focal final: 2 módulos/114 PASS, 810ms, exit 0; typecheck real y lint frontend
exit 0. Logs leídos C:/tmp/isa1104-t12g1-{red,red-r2,focal,typecheck,lint}.log.
Diff limpio, worker idle antes de commit. Suite frontend completa/build se
reservan al cierre de G2 según el microplan: G1 aislado no entrega el editor.
Sin Go, banco real, app/LMU ni Wails. Sin push/PR/CI remota/integración/promoción.

## T12f — cliente de comandos de clasificación

Commit `38eb9949`, dos paths `analysis-client.ts/test`, +278/-11.
Petición con clasificaciones opcionales; omisión y retirada [] distintas,
familias explícitas requeridas al enviar clasificaciones, cuota conjunta antes
de recorrer elementos. Payload intacto y comparación de comando completo,
familias y clasificaciones en Save/Resolve. Replay con revisión anterior y
cabeza avanzada aceptado; sin adopción ni reintentos automáticos.

RED real conservado en `C:/tmp/isa1104-t12f-red.log`: 4 fallos/13 PASS,
exit 1; el cliente aceptaba motivo de clasificación discrepante y enviaba
peticiones inválidas. Un intento previo falló en transformación por sintaxis
del test y no cuenta como RED productivo. Revisión personal corrigió fixtures
de revisión/comando, contexto de base y cuota: el positivo 256 devuelve los
254 preparados escalares + familia + clasificación. Casos finales de replay,
cancelación tardía, conservación íntegra y tipos estrictos, sin casts en
fixtures válidos. No se amplió el cliente a comparar escalares en la respuesta.

Gates leídos: focal 18 PASS/828ms; suite frontend exit 0, 443 archivos/3553
PASS, 196.60s; typecheck real, lint frontend y build exit 0. Build 1085 módulos,
1.01s, aviso chunks >500 kB. Aviso AbortError de teardown conservado, presente
también en T11g4/T12e; no se atribuye causa nueva. Logs C:/tmp con prefijo
`isa1104-t12f-`: `focal.log`, `frontend-all.log`, `typecheck.log`, `lint.log`,
`build.log`. Diff limpio, worker idle antes del commit del orquestador.
No Go repetido (sólo consumidor TS), banco real, Wails ni app/LMU. Sin push,
PR, CI remota, integración, promoción ni release. T12 permanece abierto.

## T12e — contrato de clasificación en TypeScript

Commit `2cf7ab0e`, dos paths `analysis-contract.ts/test`, +325/-6. Tipos y
parsers de petición/preparación, snapshot v3, cuota total antes de recorrer,
revisión inicial sin decisiones, compatibilidad v1/v2 y comparación semántica
sin mutar entradas. Preserva originales y peticiones exactas; mismo espacio,
minúscula simple del enum, UTF-8, límite bruto de 1024 bytes y clima de 64
puntos Unicode que Go. El cliente valida forma/consistencia, no hashes ni
calidad viva/autorización que no figuran en el wire.

Revisión personal detectó validación semántica ausente en el parser de petición
y comparación que aceptaba duplicados; corregidas antes de aceptar. También
se corrigieron fixtures de precondición que cambiaban a la vez esperado y
original, base ajena sin autoridad externa, escapes Unicode mal representados,
bytes confundidos con longitud JS y target duplicado en el caso de cuota 257.
Casos directos del parser y positivos 256/1024 protegen los límites reales.
No hubo RED pre-cambio; es extensión del contrato con revisión intermedia.

Gates revisados: focal R4 93 PASS (833ms); suite frontend completa exit 0,
443 archivos/3545 tests PASS (250.75s); typecheck `tsc -b --noEmit`, lint
frontend completo y build `tsc -b && vite build` exit 0. Build: 1085 módulos,
1.59s, advertencia de chunks >500 kB conservada. Suite: aviso AbortError en
teardown presente también en el log T11g4 anterior; sin atribuir causa nueva.
Logs `C:/tmp/isa1104-t12e-focal-r4.log`, `isa1104-t12e-frontend-all.log`,
`isa1104-t12e-typecheck.log`, `isa1104-t12e-lint.log`, `isa1104-t12e-build.log`
(todos en C:/tmp). Intentos focal/R2 no arrancaron tests (invocación); R3
90 PASS antes de los casos finales. Se usa `pnpm --dir frontend run test`,
con `run` explícito para pasar opciones a Vitest. No Go repetido (sin Go
modificado), banco real ni Wails. Sin push/PR/CI remota/integración/promoción.
El orquestador mantiene los planes y la revisión; F usará sesión Muse limpia
para reducir contexto, con la sesión anterior detenida y un solo ejecutor.

## T12d1 — comandos y proyección nativa de clasificación

Commit `19f2c886`, dos paths `telemetry_analysis_correction_commands.go/test`,
+465/-18. Save/Resolve aceptan el conjunto completo; clasificaciones no nil
requieren familias explícitas, omitir no retira decisiones desconocidas. La
proyección nativa conserva la clasificación efectiva de Analysis y elimina la
reconstrucción de HistoricalLap. Mantiene las puertas de autorización y el
bloqueo por metadatos globalmente incompletos; un campo válido puede guardarse
aunque otro falte. Clima sólo cambia etiqueta, no métricas físicas.

RED productivo `TestProjectCorrectionUsesEffectiveClassification`: devolvía
race tras guardar qualify. GREEN tras corregir el consumo. Revisión personal
del diff completo reforzó reapertura de custodia tras avanzar cabeza y
proyección de ID antiguo con referencias exactas, guard T11 contra cabeza de
sólo clasificación, Save/Resolve repetidos después del avance, ausencia/error
explícitos en Resolve, rechazo atómico y autorización revocada. Agregación de
dos sesiones conserva tipo/clima y revisiones exactas. Ajustar la expectativa
de unknown_replacement en Resolve fue corregir un test, no otro bug de producto.

Gates: focal app PASS 4.202s; global `go test -p 1 ./...` exit 0, 126 paquetes
ok/cero FAIL; vet de alcance exit 0 (log vacío), gofmt/diff limpios. Logs leídos:
`C:/tmp/isa1104-t12d1-red.log` (exit 1), `C:/tmp/isa1104-t12d1-focal.log`,
`C:/tmp/isa1104-t12d1-global.log`, `C:/tmp/isa1104-t12d1-vet.log`.
Fixtures contractuales, sin frontend/banco real/Wails en D1. Commit del
orquestador tras worker idle; sin push, PR, CI remota, integración ni promoción.

## T12d2 — inspección de vueltas compatible con revisión mixta

Commit `5591602f`, dos paths (`corrections_inspection.go` y test), +275/-2.
Una línea productiva pasa de ApplyObservation a ApplyMixed; mantiene la misma
consulta, paginación, identidad temporal, original/efectivo, límites y cinco
capacidades físicas. RED real: `TestCorrectionLapInspectionAcceptsMixedClassification`
rechaza v3 por `observation snapshot integrity`; mismo caso GREEN tras el cambio.
Tests cubren sólo clasificación, tres grupos con efecto escalar +1s y exclusión
familiar, equivalencia con v2 salvo snapshotID, otro metadato ausente, cuota y
rechazos atómicos. Revisión personal corrigió capturas superficiales de input,
contaminación entre casos y una clonación del puntero de salida que invalidaba
la prueba de no-alias; se escribe directamente sobre el resultado antes de
comparar el input y snapshot serializados.

Gates: focales `telemetryanalysis/...` exit 0; global `go test -p 1 ./...` exit 0,
126 paquetes ok/cero FAIL; vet de alcance exit 0 (log vacío), gofmt/diff limpios.
Logs leídos: `C:/tmp/isa1104-t12d2-red.log` (exit 1),
`C:/tmp/isa1104-t12d2-focal.log`, `C:/tmp/isa1104-t12d2-global.log`,
`C:/tmp/isa1104-t12d2-vet.log`. Sin frontend, banco real ni Wails en este corte.
Sin push/PR/CI remota/integración/promoción. Se documenta en §4 del microplan
la limitación de rollback: un binario antiguo no debe abrir custodia con v3;
conservarla y usar perfil/CorrectionRoot aislado si se vuelve al binario anterior.

## T12c2 — clasificación efectiva en derivación y proyección

Commit `e8abf272`, cuatro paths `corrections_derivation.go/test` y
`corrections_projection.go/test`, +543/-6. `Classified` viaja junto a los
derivados de la revisión exacta. Metadatos activos se reclasifican en Analysis;
v1/v2 conservan identidad/tipo/clima del caller y todos refrescan disponibilidad
desde vueltas completas del análisis, sin reconstruir HistoricalLap. La etiqueta
climática no altera consumo, curvas ni paradas. No se añade DeriveObservedStrategy.

Revisión personal corrigió refresh ausente en legacy y reforzó pruebas: caller
canónico, combinación invariante, separación de rechazo en preparación/derivación,
proyección pública completa, reopen e historial antiguo con head avanzado, retiro,
comparaciones de inmutabilidad por JSON y efecto escalar +1s independiente del
efecto familiar. Gates: focales `telemetryanalysis/...` exit 0; global Go
`-p 1 ./...` exit 0, 126 paquetes ok/cero FAIL; vet de alcance exit 0, gofmt y
diff limpios. Logs `C:/tmp/isa1104-t12c2-focal.log`,
`C:/tmp/isa1104-t12c2-global.log`, `C:/tmp/isa1104-t12c2-vet.log` leídos por
el orquestador. Muse reportó tres fallos durante construcción de fixtures
(Combination, snapshot sin Base, GeneratedAt sin milisegundos); sólo quedaron
en salida de herramienta, sin log separado. No son reproducción de bug de producto.
Sin frontend/banco real/Wails; sin push/PR/CI remota/promoción. C2 no certifica
el recorrido nativo: D1 aún sobrescribe metadatos corregidos y D2 rechaza v3.

## T12c1 — vista efectiva mixta revisada y comprobada

Commit `1c70fb7c`, dos paths (`corrections_view.go` y test), +300/-5.
`ApplyMixedCorrectionSnapshot` reusa la aplicación escalar/familiar y T12a
contra originales, comprueba los tres grupos y devuelve metadatos separados
con procedencia. `session.Channels` es la única autoridad de canales. v1/v2
conservan comportamiento; sin clasificación activa no se añade Metadata a la
vista antigua. Sólo cambia Value; fuente/calidad/presencia/reloj intactos.
Revisión personal: eliminada duplicación familiar y separados los fixtures de
casos adversariales que inicialmente compartían slices. Campo parcial conserva
el metadato ausente incluso en la vista efectiva. Sin consumidores nuevos aún.

Gates: focal `telemetryanalysis/...` exit 0 (0.831/0.094/0.037s), global Go
`-p 1 ./...` exit 0, 126 paquetes ok/cero FAIL, vet de alcance exit 0;
gofmt y diff limpios. Logs `C:/tmp/isa1104-t12c1-focal.log`,
`C:/tmp/isa1104-t12c1-global.log`, `C:/tmp/isa1104-t12c1-vet.log`.
El orquestador leyó diff completo y logs antes de aceptar. Sin suite frontend
(sin TS), banco real ni Wails en C1. Sin push/PR/CI remota/promoción.

## T12b2 custodia v3 cerrada (ISA-1104, 4 paths, revisión final aceptada)

Rama `vantareapp/isa-1104-recorded-classification`, base `7f75713`. Mismo
decoder/store/lease/backup/Save/Resolve; sin store ni formato paralelo.
`ObservationCorrectionInput` suma sesión original + decisiones (nil = grupo
desconocido que nunca se borra en silencio; `[]` = retirada explícita).
Digest mixto v3 anidado sobre v2 con las tres decisiones completas; Save y
Resolve usan exactamente la misma función; v1/v2 (comando/revisión) exactos.
Guards independientes legacy/T11; replay exacto devuelve revisión antigua +
cabeza actual. Decoder cuenta 3 cuotas y recomputa preparación+snapshot+
digests; rechaza tamper incluso resealed (los digests son consistencia, no
autenticidad: una falsificación válida consistente no se promete detectar).
Cuota 256/256rev/8MiB; restore v3→v2→v1 conserva historia. Revisión intermedia
aplicada: reseal semántico real, retirada solo-clasificación a v2 exacto con
replay/Resolve post-avance, rechazo table-driven (original/quality/parser) y
legacy escalar contra head solo-clasificación.
Gates: focales PASS; `gofmt` + `git diff --check` limpios; `go vet` alcance
exit 0 (`C:/tmp/isa1104-t12b2-vet.log`); global `go test -p 1 ./...` exit 0,
126 ok, cero FAIL (`C:/tmp/isa1104-t12b2-global.log`; focal
`C:/tmp/isa1104-t12b2-focal.log`; GOCACHE `C:/tmp/isa1084-go-cache`; sin
suite frontend). `plan.md` intacto. Siguiente C se asignará aparte.

## T12b1 representación v3 (ISA-1104, 2 paths, revisión aceptada; B2 completado)

Rama `vantareapp/isa-1104-recorded-classification`, base `7f75713`. Mismo
`PreparedSampleCorrectionSnapshot` extendido con clasificación completa
`omitempty`; v3 `analysis.mixed-snapshot.v3` solo con clasificaciones
activas; sin clasificación, v1/v2 byte-idénticos (golden v1 existente + golden
v2 nuevo `55938408…e632`). Preparación viva de los tres grupos contra
sesión/base con T12a; helper almacenado separado de autorización/source/
quality (nunca eleva reconstrucción a evidencia). Vacío canónico en v3:
grupos ausentes nil (digest viva/almacenada idéntica, JSON roundtrip directo;
v1/v2 intactos; sin normalización especial en lectores futuros). Cuota total
256 conjunta y atómica: conjunto válido real 253 escalares únicos+1 familia+2
clasificaciones prepara completo; 257º válido individual rechazado por cuota.
Sin decoder/store/vista/servicio/TS en este corte (B2). Corrección de
lenguaje: el rechazo de T12a v1 fue hallazgo de revisión, no RED; RED
ejecutado real solo la sonda del golden v2 (luego verde). Sin cerrar T12 ni
gates nativos/empíricos.
Gates: focales PASS (v3 sola/mezclada/orden/digest/cuota/vacío/no-alias,
v1/v2/documento preexistentes intactos); `gofmt` limpio;
`go vet` alcance exit 0 (`C:/tmp/isa1104-t12b1-vet.log`); global
`go test -p 1 ./...` exit 0, 126 ok, cero FAIL
(`C:/tmp/isa1104-t12b1-global.log`, GOCACHE `C:/tmp/isa1084-go-cache`).
Evidencia T12a previa verificable: R1
`C:\Users\isaac\AppData\Local\Temp\opencode\isa1104-go-global.log` (exit 1,
125 ok, FAIL `TestRecordedImolaCalculationCompletes` 8.03s/64.959s) y R2
`C:\Users\isaac\AppData\Local\Temp\opencode\isa1104-go-global-r2.log`
(exit 0, 126 ok). `plan.md` intacto (sin cambio público). Siguiente B2 solo
tras revisión del orquestador.

## T12a v2 — preparación canónica corregida (ISA-1104, revisión intermedia)

Sesión `ses_f767b9355ffe8jiV60PxmdbsUv`, mismo modelo/variante, ejecutor único
sin subagentes. La revisión intermedia NO dio por válido T12a v1
(`ValidateClassificationCorrection` solo con `SessionID`): reescrito en los
mismos 2 paths como `PrepareClassificationCorrection[Set]` con base exacta
`SourceAnalysisRef` (digests, petición contra vigente, sesión contra base por
ID/parser/schema/fuente; `SourceChanged`/`InterpretationChanged`/`Precondition`/
`Value`/`Invalid`/`Target`/`OverlappingCorrections` reutilizados, sin familia
paralela), motivo con `correctionText(...,1024)`, clima en caracteres con
rechazo de controles y UTF-8, precondición exacta sin recortes, y salida
preparada reutilizable (`BaseID`/`CorrectionID`/petición/original/corregido).
Fixtures contractuales coherentes con tipos reales (fuente LMU, parser/schema/
base válidos como valores de contrato, no DuckDB físico; parcial solo sin
Weather con su causa aplicable); calidades stale/missing/invalid/unknown,
Present/Sensitive/Redacted, duplicados, inmutabilidad y atomicidad cubiertos.
Segunda lectura del orquestador: original preservado byte a byte (esperado
idéntico acepta, recortado rechaza; solo el corregido se normaliza), conjunto
valida base/sesión/cuota antes de preparar, reemplazo en bruto acotado y
UTF-8 inválido rechazado donde se almacena.
Microplan: T12a preciso y T12b dividido en B1 (representación+preparación) y
B2 (decoder+store+digests, el decoder requiere edición). B aún no autorizado
ni implementado. Focales PASS (10 tests); vet de alcance PASS; global Go `-p 1`
R1: 125 paquetes ok, 1 FAIL `TestRecordedImolaCalculationCompletes`
(deadline conocido de ISA-1089; PASS aislado en 4.77s; raíz no demostrada);
ningún Go existente modificado. Commit local separado sin push/PR/merge/
promoción. `plan.md` intacto.

## T12a gates segundo global (ISA-1104, corrección de conclusión)

Corrección aceptada: el PASS aislado solo mostraba intermitencia, no probaba
contención como causa. Evidencia registrada sin afirmación causal: global R1
(exit 1; 125 ok; FAIL `TestRecordedImolaCalculationCompletes` en
`internal/strategy/application`, 64.959s, `calculation_timeout`/deadline;
log `isa1104-go-global.log` temporal, no versionado) + aislado PASS por
separado (4.77s, `-count=1`). Verificado por diff que los 2 paths nuevos no
tienen consumidores productivos (solo se referencian entre sí) y ningún Go
existente fue modificado: el corte no toca solver, timeouts ni ese test.
Segundo global único R2 (GOCACHE `C:/tmp/isa1084-go-cache`, sin builds propios
concurrentes): exit 0, 126 paquetes ok, cero FAIL
(`isa1104-go-global-r2.log`). Se documentan ambas corridas; la raíz de la
intermitencia R1 sigue no demostrada. B pendiente de revisión del orquestador,
dentro del alcance ya autorizado por Isaac.

## T12 revisión del microplan (ISA-1104, corte A solo docs)

Sesión `ses_f767b9355ffe8jiV60PxmdbsUv`, modelo
`opencode-go/muse-spark-1.3-contributor` variante `xhigh`, ejecutor único;
orquestador externo revisa. Rama `vantareapp/isa-1104-recorded-classification`,
base `7f75713`. T11 NO cerrado: lógica/banco PASS, T11i visual/nativo pendiente
(WebView2 `ERROR_INVALID_STATE`, causa indeterminada incluso visible; sin más
UI ni LMU en este encargo). Microplan `classification-corrections-t12.md`
corregido según revisión: §5 distingue clasificar ESA fuente en preparación
(`telemetry_analysis_corrections.go:108-115`, test `:11-72`) del catálogo
nativo (`sessioncatalog.go:76-84,158-183`); el cliente puede adjuntar
referencia/ID canónico explícito y el servidor resuelve/valida contra la
fuente autorizada, nunca hashea texto arbitrario llamándolo canónico;
coche/circuito fuera de T12a. Precondiciones por campo (§2): corregir un campo
válido no exige los otros cinco ni éxito global parcial. Clima (§6/§7):
etiqueta opaca en `classification.go:80,125` + `projectionproducer.go:219,238`;
buckets físicos por vuelta vienen de consumo (`sessioncatalog.go:228-236`), sin
recompute prometido ni toque a #1030. Microcortes T12a–T12i de máx. 5 paths:
comandos Go, contrato/cliente/hook/UI TS por separado; el helper
`strategy-recorded-corrections.ts` no es contrato; banco real reusa
`internal/app`, sin lector paralelo en Analysis. Un path docs; sin código,
push, PR, merge ni promoción. Sigue T12a puro (2 paths Go declarados en #1104
antes de editar). `plan.md` intacto: token `milestones:strategy-recorded-editor`
declarado en la issue, cambio público ninguno en este corte.

## T11f4 — consulta tipada de vueltas en frontend

Cliente añade únicamente InspectCorrectionLaps al conjunto cerrado. Valida
paginación (máximo 50), base/revisión exactas, identidades original/efectiva,
capacidades y reglas, y metadatos del límite registrado. Ausencia efectiva no se
convierte en false; preserva cero y calidad unknown. Sin adopción automática de
cabeza ni redondeo de identidad temporal. 73 focales, tipos/lint/build PASS.
Global frontend más reciente: T11f3, 442/3489 PASS; este corte aditivo se verifica
con sus focales y tipos de todo el frontend, sin anunciar otro global. Cuatro
paths; UI/controlador familiar todavía pendientes. Continúa T11g1 helpers de
conjunto completo y T11g2 controlador, luego montaje. Sin Wails/precisión/visual
>9/push/PR/CI remota/merge/promoción.

## T11f2b — elegibilidad visible según el consumidor

La inspección separa automaticIncluded/effectiveIncluded de la mera bandera
LapFamilyUse. Reusa reglas de curvas/ahorro para reflejar tráfico y la inclusión
explícita por familia. Son reglas de uso, no presencia de señales ni garantía de
métrica calculable. Efectivo ausente si la identidad no es única en ambos modelos.
Pruebas focales, global Go -p1 y vet de alcance PASS. Dos paths Go independientes
del gate frontend. T11f3 quedó en 928e40b7 con global 3489 PASS; T11f4 consulta TS
está en trabajo (73 focales y tipos PASS, lint/build pendientes al registrar esto).
Sin Wails/precisión/visual >9/push/PR/CI remota/merge/promoción.

## T11f3 — contrato mixto de interfaz

Snapshot v2 conserva familias completas; v1 escalar sigue válido. Validación de
precondiciones, resultado, presupuesto conjunto, solapes e identidad temporal con
nanosegundos (sin Date truncada). Save/Resolve mantienen [] explícito y rechazan
respuestas con otra selección o motivo familiar. Focales 61, tipos/lint/build PASS.
Primer global falló por sincronización del test de guardado: corrección separada
5db52e32. Repetición final 442 archivos/3489 tests PASS (511.30s), warnings heredados
de teardown happy-dom; no se oculta el primer run. Cuatro paths TS; controlador
familiar/UI pendientes. En paralelo sólo dos paths Go de inspección, T11f2b,
añaden elegibilidad automática/efectiva: focal/vet PASS, global Go en curso.
Sin Wails/precisión/visual >9/push/PR/CI remota/merge/promoción. Continúa T11f4.

## Gate frontend T11f3 — sincronización del test de guardado

Primer global: 441/442 archivos, 3488/3489 tests. Falló la aserción inmediata de
liberación del suspend guard después de aparecer guardado (Workflow.test.tsx:37).
Focal aislado pasó 2/2. La guarda se libera con useEffect, separado del commit
visible. Se conserva la aserción y se espera con waitFor, sin aumentar timeout ni
cambiar producto. Focal conjunto 63/63 PASS. Global se repetirá; el run anterior
permanece fallido. Contrato mixto TS todavía sin commit/cierre; tipos/lint/build
PASS. Sin Wails ni publicación. Un único path test en este commit separado.

## T11f2 — inspección de vueltas por revisión exacta

Consulta nativa autorizada, máximo 50 filas, base/snapshot/revisión exactos y
cabeza actual separada. Devuelve original, efectivo, objetivo temporal y capacidad
por familia. Inclusión exige integridad original y efectiva; ambigüedad y límites
cambiados no ofrecen edición. Límite de stint sólo si registrado, con causa y
calidad conservadas; no inventa inicio y rechaza empate ambiguo. Copias separadas,
incluida confianza del límite. Reanálisis sólo con escalares, sin calcular curvas
para inspeccionar. Pruebas de paginación, integridad, originales, revisión previa,
metadatos, permisos y objetivos ambiguos PASS. Global Go -p1 y vet de alcance PASS.
Cuatro nuevos paths. Frontend aún no consume la consulta; siguiente T11f3 contrato
mixto TS y T11f4 consulta TS. Sin Wails/precisión/visual >9/push/PR/CI/promoción.

## T11f1 — comandos nativos mixtos

SaveCorrections/ResolveCorrectionCommand aceptan familyUses completo: nil legacy,
[] retirada explícita. Con escalares+familias se reanaliza la vista bajo la misma
autorización y bloqueo; el store verifica objetivos antes de escribir. Reusa
withCorrectionInput y la custodia existente. Pruebas nativas de save/replay/resolve,
payload alterado, guard legacy, restauración, proyección de revisión anterior,
target movido por escalar y revocación de permiso PASS. Global Go -p1 y vet de
alcance PASS; dos paths. Son pruebas con lector controlado, no DuckDB físico.
Sigue T11f2 inspección paginada original/efectivo/capacidades para Datos; después
contrato TS/controlador/UI. Sin Wails/precisión/visual >9/push/PR/CI/promoción.

## T11e2b — compatibilidad sin unión por número

La reparación de ritmo legado exige la misma identidad temporal y unicidad de
ambas colecciones que las curvas. No reconstruye límites ausentes; conserva
esos datos como no disponibles y no modifica el modelo persistido. RED/GREEN:
número repetido, intervalos ausentes/cambiados y duplicados de validez/consumo.
Se conserva el caso válido con intervalos de fixture explícitos. Tres paths;
helper común de identidad, sin otro criterio ni dependencia. Analysis completo,
global Go -p1 y vet de alcance PASS. Continúa T11f1 comandos nativos mixtos.
Sin frontend, Wails, precisión, visual >9, push/PR/CI remota/merge/promoción.

## T11e3b — independencia de ahorro y filtros blandos

Consumo produce observaciones de combustible/tiempo propias de SavingCost tras
los mismos gates físicos; excluir Fuel o ritmo de sus agregados no las elimina.
El colector compartido selecciona la familia, sin otro lector ni resegmentación.
Curvas/ahorro conservan exclusión automática de tráfico salvo inclusión explícita
validada de esa familia. No se alteran umbrales del protocolo A/B. Versiones de
cómputo consumption-pace.v4 y derived-curves.v3; histórico no reescrito.
RED/GREEN de exclusión de ritmo/combustible que anulaba ahorro; controles por
familia, tráfico automático/ritmo/ahorro/ambos, cobertura inválida y señal ausente.
Analysis completo, global Go -p1 y vet de alcance PASS; cuatro paths lógica/test.
Sin frontend modificado ni Wails/precisión/visual >9/push/PR/CI remota/promoción.
Sigue T11e2b: la compatibilidad de ritmo legado también exige identidad exacta;
luego T11f API/inspección y contrato TS. No habilitar UI familiar antes.

## T11e3a — procedencia de decisiones efectivas

LapFamilyUse efectivo recibe el ID de su corrección validada. Originales y
precondiciones no llevan esa marca; se rechaza usar una vista ya corregida como
original. Campo omitido en wire histórico y snapshots preparados: golden v1 y
custodia mixta conservan sus IDs. Pruebas de procedencia por familia, restauración
vacía y precondición corregida PASS. Cinco paths; frontend intacto.
Global Go -p1 y vet app/Analysis/Strategy/cmd PASS. Sigue T11e3b consumo/ritmo para ahorro independientes y filtros blandos; después T11e2b compatibilidad de ritmo antiguo también con identidad exacta. Sin API/UI familiar, Wails, precisión, nota visual ni push/PR/CI remota/merge/promoción.

## T11e2 — identidad temporal en consumo y curvas

El resultado por vuelta transporta inicio/fin por valor. Curvas e índices de
stint usan número+instantes UTC; identidades ausentes, cambiadas o ambiguas no
contribuyen. Un duplicado tampoco aumenta la edad de las vueltas posteriores.
RED/GREEN de número repetido y duplicado que desplazaba edades; pruebas de
intervalo cambiado, legado sin tiempos y equivalencia de zona horaria. Versiones
de cómputo consumption-pace.v3 y derived-curves.v2; no reescritura del histórico.
Cuatro paths lógica/test, sin umbrales nuevos ni frontend modificado.
Global Go -p1 y vet de alcance finales PASS (logs isa1099-t11e2-final-*).
Siguiente T11e3a procedencia de decisión efectiva; luego filtros blandos y
separación de SavingCost, aún dependiente de ritmo/consumo. Sin API/UI familiar,
Wails, precisión, revisión visual, push/PR/CI remota, merge o promoción.

## T11e1 — derivación de conjunto mixto

Vista valida escalares contra páginas originales y familias contra la validez
original; conserva el digest mixto completo. Derivación reanaliza las páginas
corregidas y aplica después las decisiones familiares con objetivos exactos y
puertas duras. No modifica originales ni acepta aplicación parcial. Compatibilidad
escalar v1 intacta. Pruebas de manipulación, cobertura ausente, copia separada,
versión desconocida y exclusión de ritmo sin cambiar otras familias PASS.
Global Go -p1 y vet app/Analysis/Strategy/cmd PASS; cinco paths lógica/test.
Sigue T11e2: identidad temporal completa en el consumidor de curvas, después
T11e3 inclusión explícita frente a tráfico. API/UI mixta aún no habilitadas.
Sin frontend modificado, Wails, banco real, precisión, nota visual, push/PR/CI
remota, merge o promoción. Logs locales isa1099-t11e1-go-all.log y -vet.log.

## T11a — preparación pura de uso por familia

Base b70673d063e203ecb664c20e6074f7c964cdbbc4, rama
vantareapp/isa-1099-recorded-family-use, C:/tmp/vantare-isa1099/vantare-v2.
Objetivo por número/inicio/fin/base; familia existente, original y motivo,
rechazo de ambigüedad/cambio de interpretación. Colecciones separadas, timestamps
normalizados para identidad. Inclusión rechaza vueltas incompletas y cobertura
unknown/missing/invalid/unsupported; stale conserva su marca para el consumidor.
La prueba detectó que presenceWeight(unknown)>0 no sirve como gate de integridad;
se corrigió el nuevo validador sin cambiar pesos/criterios heredados. Focales y
vet Analysis PASS, build de base y global Go -p1 PASS. Instalada exclusivamente
la resolución congelada/offline existente, sin dependencias nuevas.
Dos paths lógicos/test. Todavía sin custodia, derivación ni UI de familias.
Evolución documentada en sdd/family-corrections-evolution.md. Siguiente T11b:
conjunto sin solapes y vista de usos, después custodia mixta existente.
Pendientes T11e: identidad completa en consumidores y tráfico como exclusión
blanda separada. #1096 queda congelada en b70673d0 con 3478 tests frontend PASS.
Sin Wails, banco real/heldout, precisión ni revisión visual >9 nuevos.
Sin push, PR, CI remota, merge, promoción o release.

## Continuación activa T10 — ISA-1096 (2026-09-10)

Worktree C:/tmp/vantare-isa1096, rama vantareapp/isa-1096-recorded-corrections,
base bd9ed2c2ffa148ce4398265e2f83af80303739af. T08j final: 438 archivos/3433
tests, lint/build PASS. T10a helpers de revisión exacta/snapshot/comando estable:
T10a 7 focales y T10b 13 focales (helpers+hook), tipos/lint PASS. Controlador conserva guardado duradero y comando incierto. T10c resolución autorizada con lease/digest: focal Go, build, global Go -p1/vet PASS. T10d cliente de resolución: 43 focales/tipos/lint PASS. T10e controlador resuelve confirmación/ausencia sin perder propuesta: 16 focales/tipos/lint PASS. T10f owner compartido/guards/adopción por fuente: 27 focales/tipos/lint PASS. T10g Datos/pestañas montados: 16 focales, tipos/lint/build y global 441 archivos/3463 tests PASS. T10h–j capacidades nativas y solo lectura: Go global/vet del alcance y frontend focal/tipos/lint/build PASS. T10k historial visible: global frontend 442 archivos/3478 tests, lint/build PASS. Continúa T11 en #1099. No nuevo Wails, precisión ni paridad certificada.

## Continuación activa T08 — ISA-1095 (2026-09-10)

Worktree C:/tmp/vantare-isa1095-library, rama vantareapp/isa-1095-recorded-library,
base 56d2c23e858a2f8b6a141ea106fe2f2d98867db4. Ramas anteriores congeladas.
T05l final: 438 archivos/3422 tests frontend, lint/build PASS; conserva warnings
heredados de teardown/chunks. T08i: etiquetas locales saneadas, sin exportar
rutas ni nombres en dominio/procedencia. Go focal/global -p1/vet y build PASS.
T08j contrato TS y biblioteca de 25 filas/búsqueda/filtros: 43 focales, tipos/lint/build PASS; global en curso. Siguiente #1096 T10 datos/correcciones con servicios existentes.
Ruta nueva montada, pero cálculo avanzado, paridad >9, Wails y precisión real
continúan pendientes. Sin push, PR, CI remota, merge, promoción ni release.

## T05/T09 montaje y biblioteca — continuación ISA-1094 (2026-09-10)

Worktree activo C:/tmp/vantare-isa1094-route, rama vantareapp/isa-1094-recorded-route,
base d5fe69da211438b8f01c65fbb1af932b0195ab51 de #1095. Rama anterior #1094
conservada como corte histórico. T05i lista resúmenes nativos y abre payload
sólo por selección, con validación de identidad evento/plan/variante. 14 focales,
tipos/lint PASS; sigue entrada productiva y contexto A4. Sin ruta nueva montada aún.
T05j sustituye esa última anotación: OrbitShell monta StrategyRecordedPage,
con asistente/resumen/listado nativo y sin suscripción live del editor anterior.
Cinco focales, tipos/lint PASS; build inicial PASS, gate general posterior pendiente.
Captura harness sin errores/overflow; no paridad final ni Wails. Siguiente ajustar
título, selección y footer A4, después continuar datos/cálculo pendientes del SDD.
Roadmap describe entrega parcial y límites, cuatro idiomas/digest actualizado.
T05k: paridad parcial de título/check/footer/contexto/fondo. Corrige grid de
ancho cero al comprimir sidebar (captura RED, banco de geometría GREEN).
438 archivos/3420 tests, lint/build final PASS; evidencia isa-1094/route-pass-01.
Faltan pestañas y operaciones avanzadas/cálculo; no review >9 ni Wails. Dos
repeticiones visuales fallaron al guardar, otra pasó: causa aún no demostrada.
Siguiente gate visible de repositorio cargado (owner ya rechaza desconocido),
prueba retrasada; después datos/plan/revisiones y tareas nativas pendientes.
T05l resuelve el gate de apertura con RED/GREEN de carga retrasada: botón y
submit esperan versión conocida, preparación sigue editable, error con reintento.
10 focales/tipos/lint PASS; 3 recorridos harness posteriores completos/geométricos
sin pageerror. No atribuir causalidad a los fallos históricos sin evidencia.
Siguiente operaciones de datos y revisión; global posterior pendiente.
Gate #1095 T08h final: 436 archivos/3412 tests, lint/build PASS, con avisos
heredados de teardown/chunks. No Wails/paridad/empírico nuevo ni promoción.

## T08 bootstrap de combinación — ISA-1095 (2026-09-10)

Base f661d82638591bf547df835ab71458d3bbc76401; C:/tmp/vantare-isa1095,
rama vantareapp/isa-1095-recorded-source-combination. Continúa dependencias de
#1094/#1088 antes de conectar la ruta de cinco pasos. PrepareCorrections ahora
expone identidad del clasificador Go sobre la sesión ya leída; metadata ausente
no bloquea correcciones ni fabrica combinación. RED/GREEN, permisos/revisiones
previos y vet focal PASS; build frontend PASS. Go global/vet en curso.
Siguiente: contrato TS/apertura sin combinación previa, opciones de identidad
sin recuentos inventados y selección explícita dentro del recorrido A4.
Evidencia isa-1095/README.md. No banco real nuevo ni cambios de criterios físicos.
T08b contrato TS: RED8 de forma inválida; 35 focales/tipos/lint focal PASS.
Sigue apertura explícita que resuelva identidad cuando no hay selección previa.
Gate final T05h: 432 archivos/3384 tests frontend, lint/build PASS; sustituye
la anotación pendiente de la sección anterior. La ruta A4 completa sigue pendiente.
T08a Go global -p1 y vet general PASS. T08c apertura sin combinación previa:
RED3/GREEN45 focales, tipos/lint PASS; identidad nativa comprobada contra proyección,
rechazo/cierre si falta o contradice selección. Siguiente: opciones de identidad
independientes de estadísticas, propietario/bootstrap UI y recorrido integrado.
T08d permite identidades mínimas en el asistente/calendario, sin recuentos
inventados: 17 focales/tipos/lint PASS. Todavía no hay nueva ruta montada.
T08e apertura del owner sin combinación y aceptación explícita de propuestas:
13 focales/tipos/lint PASS; se rechazan identidades contradictorias, mezcla de
fuentes y calendario incompatible. Abrir no acepta ni avanza. Siguiente:
integración productiva conservando propietario de handles y guardado nativo.
T08f owner del recorrido une aceptación y persistencia; conserva handles al
pasar preparación/editor, sólo abre editor tras respuesta nativa y mantiene
cambios ante conflicto. Doble escritura/edición durante escritura bloqueadas.
11 focales/tipos/lint PASS. Sigue montaje visual/ruta, no aceptación Wails.
T08g resumen A4 TSX/CSS con valores reales del borrador, cálculo/validación
pendientes y copy en cuatro idiomas: 3 focales/tipos/lint PASS. Aún sin montar;
no certificado visual. Sigue composición asistente/resumen/biblioteca.
T08h compone recorrido con Drawer existente, confirmación de descarte y guard
de suspensión; sin versión nativa conocida no crea. Seis focales/tipos/lint
PASS; suite general/lint/build en curso en C:/tmp/isa1095-t08h-*.log. Siguiente
montaje de entrada productiva y reapertura/listado. Componentes siguen sin
sustituir entrada anterior; no Wails/paridad/cálculo completo certificados.

## T05 asistente registrado — ISA-1094 (2026-09-10)

Base e95d3bbb; C:/tmp/vantare-isa1094, rama vantareapp/isa-1094-recorded-wizard.
Estado actual: componentes A4 Inicio/Combinación/Reglas/Pilotos y orquestador
de cinco pasos implementados y probados, **todavía sin sustituir la ruta anterior**.
Borrador sin cantidades inventadas; calendario versionado; selección canónica,
referencias completas, validación de valores presentes y estimación de pilotos
con referencia/delta. Reglas avanzadas y conexión de campos nuevos al solver
siguen en T02/T06/T07. Detalle de cortes en evidencia/isa-1094/README.md.

Persistencia e0993a00: PlanDraft nativo create/save_revision/open y payload
strategy.recorded.draft.v1; no otro almacén. Edit nativo sólo valida en memoria,
no persiste. Guardar configuración conserva revisión y campos ausentes sin
activar un plan ni fabricar cálculo. Reapertura con repositorio Go real PASS.
Gates T05g2: 431 archivos/3381 tests frontend, tipos/lint/build, Go global -p1
y vet app/strategy/telemetryanalysis/cmd PASS. No benchmark físico ni Wails.

T05h extrae useRecordedSessions y vista reutilizable conservando la API anterior.
16 focales PASS, tipos/lint focal PASS; prueba de desmontar/remontar vista sin
cerrar handles y cierre al salir del propietario. Gate general posterior pendiente.
El propietario debe seguir montado y su padre estar identificado por evento/combinación.

Siguiente: bootstrap/descubrimiento T08 y conexión del asistente al editor.
El catálogo actual necesita sesiones ya autorizadas; descubrir archivos sólo
devuelve candidatos sin identidad de coche/circuito. Abrir un archivo explícito
debe permitir resolver esa identidad en Go antes de elegir combinación. Reusar
Analysis/StrategyRevisionCatalog; no importar todos los archivos ni abrir reserva.
También falta montar contexto/footer A4 y revisar visualmente la ruta completa.
Sin paridad final, aceptación Wails, push/PR/CI remoto, merge ni promoción.

## T04 A4 productivo — ISA-1093 (2026-09-09)

Base7446c0e6; worktree C:/tmp/vantare-isa1093, rama vantareapp/isa-1093-recorded-a4.
Marco React integrado, todavía recorrido anterior (transición, no A4 completo).
T04a: 51 focales y 421 archivos/3322 tests PASS; lint/build PASS. T04b Call RED/GREEN y tipos/lint focal PASS. T04c arte final/dimensiones en e2359a4f; suite general posterior en curso. Banco visual recuperado: Call explícitamente no disponible; frame-01.png sin errores. Arte final/dimensiones ya aplicados; recorrido, contexto y footer aún pendientes. Continúa T05 #1094 desde este stack.
Evidencia isa-1093/README.md. #1092 T02c4: 3321 tests frontend PASS.
Continuar T04/T05 según SDD sin pedir permiso por corte; T02 entradas, T03 estados,
Wails y calibración siguen pendientes. Sin cambio de autoridad ni promoción.

## SDD T02a — reglas recibidas por Orbit, ISA-1092 (2026-09-09)

Base6d4aa514; rama vantareapp/isa-1092-recorded-event-inputs,
C:/tmp/vantare-isa1092. Matriz de entradas en evidencia/isa-1092/README.md.
Primer corte backend: event.rules opcional reutiliza EventRules del solver,
aplicado en búsqueda, comparación Weather y replay final mediante el adapter
común. Tests RED/GREEN para min/max paradas, negativos, driverLimits sin perfil,
ventana obligatoria y override que la viola. Documento/TS/UI aún no emiten reglas.
T02a commit ad8774a5: Go global y vet PASS. T02b: contrato de reglas con evidencia y schema2.1.0 validado; Go global/vet PASS. T02c1: crear/editar promueve schema al añadir reglas; reapertura y Go global/vet PASS. T02c2: cliente TS validado; 420 archivos/3320 tests, tipos, lint y build PASS. T02c3 compatibilidad legacy RED/GREEN y Go global/vet PASS; T02c4 enlaza pantalla y captura reglas/evidencia en revisión; 14 focales, lint/build PASS, suite frontend global en curso. Continúa T04 #1093, sin cerrar entradas pendientes de #1092. Evidencia detallada en isa-1092/README.md; UI aún pendiente.

T01/ISA-1089: commit6d4aa514, build frontend, Go global -p1 y vet PASS.
Intento Wails diagnóstico PID18668 terminó sin abrir CDP: puerto39261 ocupado,
hotkeys en uso y fallo de controlador WebView. PID26412 de1072 preservado;
no se atribuye todo el fallo a una única causa no demostrada. No cerrar T01
runtime ni declarar benchmark físico. No se tocó LMU. Avanzar tareas independientes.


## Ejecución SDD reanudada — T00/T01, ISA-1089 (2026-09-09)

Isaac autoriza iniciar todo el SDD v1.0. Se levanta la pausa documental anterior;
continuidad entre tareas vigente, sin subagentes de código ni permiso por corte.
Base43d415f4; rama vantareapp/isa-1089-recorded-solver-timeout,
C:/tmp/vantare-isa1089. Timeout Imola reproducido con input Wails capturado,
perfil señala coste repetido de paradas/allocaciones. Caché acotada por búsqueda
reutiliza resultados de CalculatePitStop sin cambiar alternativas ni ecuaciones.
RED 8.02 s; primer GREEN5.88 s. Suites solver/application secuenciales PASS;
una ejecución concurrente volvió a agotar deadline: no se oculta contención.
Gates globales, repeticiones comparables y Wails pendientes. No se declara T01
cerrado ni óptimo físico. Después T02/T03 y porte A4 T04 según dependencias.


## SDD integral y pausa de implementación — ISA-1091 (2026-09-09)

Isaac solicita consolidar chat, roadmap y contratos para continuar después sin
pausas repetidas. [SDD v1.0](../../strategy-planner/sdd/README.md),
[ejecución T00–T24](../../strategy-planner/sdd/execution.md) y
[aceptación A01–A21](../../strategy-planner/sdd/acceptance.md) son la secuencia
vigente de este alcance; las notas posteriores conservan historia, no una cola
alternativa de pendientes. Base 0240bc7806570be17832aea6153300631f392170,
rama vantareapp/isa-1091-strategy-sdd, C:/tmp/vantare-isa1091.

Entrega sólo documental, implementación pausada por Isaac. Al reanudar: T00 y
T01 (#1089); avanzar dependencias y cortes automáticamente, sin permiso por
commit/test/issue. A4 sigue por portar; calibración empírica sigue sin cerrar.
Una decisión de umbrales se prepara agrupada con evidencia y no bloquea UI o
integridad independientes. Código sin subagentes; excepción visual ya autorizada.
No app/build/LMU en esta entrega. Sin promoción ni release.


## Discovery del corpus real — ISA-1090 (2026-09-09)

Base 7d504d780095b0d81044824d7d2182599e94ac89; rama
vantareapp/isa-1090-analysis-discovery-limit, C:/tmp/vantare-isa1090.
Reproducción Wails de #1088: límite de composición 128 impide descubrir carpeta
con >400 archivos; ErrCandidateLimit se presentaba como formato incompatible.
Servicio y composición admiten ahora 1024, mismo límite que importador existente;
el exceso produce error específico, sin truncamiento ni lectura de contenido.
Se mantienen cuatro sesiones abiertas y todos los presupuestos de lectura.
Regresión 400/1024/1025 RED/GREEN; full Go/vet, frontend 420 archivos/3308 tests,
build y lint PASS. Wails descubre 416 archivos; abre Imola, aplica referencia
exacta y cierra sesión. Persistencia y SHA originales comprobados. Evidencia
en docs/strategy-planner/evidence/isa-1090/README.md. Build diagnóstica, no
aceptación visual A4 ni validación de producción/licencia.
El timeout de cálculo real queda en #1089; no se cambia solver en este corte.

## UI y validación real — ISA-1088 (2026-09-09)

Rama vantareapp/isa-1088-recorded-session-ui, C:/tmp/vantare-isa1088,
base 7b0afab9. Panel Sesiones conectado con apertura/preparación/revisión exacta.
Banco real Imola/Monza y lectura de entradas por Strategy PASS; hashes intactos.
Wails abre; evento nuevo de Imola reproduce timeout (#1089). Acceso a Sesiones
ante fallo corregido con RED/GREEN. Búsqueda real bloqueada por límite 128,
frente a carpeta >400: siguiente corrección aislada. No se certifica recorrido
UI completo, A4 productivo completo ni precisión física. Detalle:
docs/strategy-planner/evidence/isa-1088/README.md. Runtime liberado para #1072.

## Consumidor conectado — ISA-1087 (2026-09-09)

Base 11676e9958d951fc1ed999055b4b38f0103590d0; rama
vantareapp/isa-1087-connect-revision-inputs; C:/tmp/vantare-isa1087.
GetEventPlanningInputs despacha referencias completas al productor autorizado;
valida proyección, combinación y referencias exactas antes de entregarlas.
Sin proveedor, fuente o revisión falla sin volver al catálogo observado.
Selecciones antiguas sin referencias conservan su vía. Consulta sin escritura,
ajustes conservados y respuesta tardía tras cancelación rechazada.
Main construye Strategy después de Analysis/licencia usando el adaptador.

Pruebas y límites: docs/strategy-planner/evidence/isa-1087/README.md.
Siguiente: enlazar la preparación y selección de revisiones desde UI productiva,
con reapertura explícita de fuentes. C7, operaciones restantes, calibración real
y aceptación visual/Wails siguen pendientes. LMU intacto. Sin promoción/release.

## Proyección conjunta autorizada — ISA-1086 (2026-09-09)

Base 40e95273; rama vantareapp/isa-1086-authorized-revision-producer;
worktree C:/tmp/vantare-isa1086. Adapter de catálogo reutiliza derivación escalar
y productor Analysis para referencias exactas de sesiones abiertas autorizadas.
Valida identidad/base/revisión/snapshot, combinación, cancelación y licencia;
rechaza fuentes cerradas/ambiguas y conserva límite existente de cuatro abiertas.
No devuelve parciales ni mezcla estadísticas agregadas. No es servicio Wails.

Isaac autoriza de nuevo PC/build/app; LMU intacto. Build frontend PASS.
App/Analysis completos, vet, Go global y diff check PASS. Detalle en
docs/strategy-planner/evidence/isa-1086/README.md.
Siguiente: conexión al consumidor Strategy y composición main; luego reapertura,
UI productiva y operaciones/calibración pendientes. Sin push/PR/CI remota,
merge, promoción o release. No se anuncia C7 completo ni precisión física.

## Cliente de selección exacta — ISA-1085 (2026-09-09)

Base ae6eb45f; rama vantareapp/isa-1085-selection-revision-client;
worktree C:/tmp/vantare-isa1085. Cliente de eventos valida/conserva referencias
exactas y concordancia con proyección. Helper existente mantiene referencias y,
al cambiar selección, retira proyección del evento y caché derivada tras ack,
conservando overrides. Misma selección mantiene datos; error conserva vista.
Sin cambios visuales. Cuatro TS/test, sin nueva dependencia ni Go.

RED de siete casos; GREEN focal 42 tests y typecheck PASS. Frontend global
418 archivos / 3294 tests, lint y diff check PASS.
Detalle: docs/strategy-planner/evidence/isa-1085/README.md. Sin app ni builds.
Siguiente: conectar productor autorizado de revisiones; sigue el rechazo
explícito de #1084. UI y operaciones restantes, calibración y Wails pendientes.
Sin push/PR/CI remota, merge, promoción ni release.

## Selección de revisiones — ISA-1084 (2026-09-09)

Base c1db89f9; rama vantareapp/isa-1084-plan-analysis-revision;
worktree C:/tmp/vantare-isa1084. SessionSelection conserva AnalysisRevisionRef
opcional, validada, incluida en la serialización. Selección fijada exige cobertura
completa de incluidas y coincidencia exacta de la proyección guardada. Excluidas
pueden conservar su referencia sin participar. Sin promoción de calidad ni I/O.

GetEventPlanningInputs rechaza la selección fijada mientras no se conecte su
productor autorizado: el catálogo antiguo no puede ignorar referencias. C7 no
está completo. Siguiente: contrato TS, productor de revisiones y UI; luego
operaciones restantes, calibración y aceptación real. Evidencia en
docs/strategy-planner/evidence/isa-1084/README.md.

Sin app/builds por instrucción de Isaac. Focales document/application PASS;
Vet y diff check PASS. Go global FAIL: dos paquetes sin frontend/dist y
flaky SQLite #708 (WAL deadline). Tres repeticiones aisladas PASS sin cambios.
No se fabrican assets para ocultarlo. Sin push/PR/CI remota, merge o promoción.

## Cliente nativo de Analysis — ISA-1082 (2026-09-09)

Base f68e2214; rama vantareapp/isa-1082-native-analysis-client;
worktree C:/tmp/vantare-isa1082. Cliente TS de discovery, apertura explícita,
páginas y preparar/guardar/cargar/proyectar correcciones. Reutiliza el parser
de proyección existente. Métodos Wails cerrados, cancelación nativa y descarte
tardío, sin reintentos automáticos. Conserva calidad/presencia y rechaza páginas
o revisiones de otra petición. Los digests se validan estructuralmente.

No se abre app ni se generan builds por instrucción actual de Isaac.
Frontend 418 archivos / 3281 tests, tipos, lint y diff check PASS. Evidencia:
docs/strategy-planner/evidence/isa-1082/README.md.
Faltan selección persistida, agregación, operaciones restantes y UI productiva;
la aceptación visual/Wails y precisión física siguen pendientes. Sin fuentes
reales, LMU, push/PR/CI remota, merge, promoción o release.

## Comandos escalares autorizados — ISA-1081 (2026-09-08)

Base 89bdb65e; rama vantareapp/isa-1081-authorized-correction-commands;
worktree C:/tmp/vantare-isa1081. Servicio TA-03E guarda, consulta y proyecta
revisión exacta manteniendo autorización/lifecycle, incluso antes de replay.
Raíz persistente Analysis configurada por main, separada de staging/originales.
Targets resueltos contra páginas requeridas, errores de custodia sanitizados.

Corregida con RED/GREEN una incoherencia de la conexión nueva: clasificación
inicial no conocía vueltas derivadas; ahora toma las vueltas completas de la
revisión recalculada y también retira elegibilidad cuando desaparecen.
App/Analysis completos, vet, build y Go global pasan.
No se publica UI ni se calcula una carrera real; fixtures controladas de contrato.
Siguiente: cliente nativo de fuentes/correcciones, selección de revisiones en
planes, operaciones restantes y UI productiva/paridad. Sin push/PR/CI remota,
promoción, release, lectura DuckDB real o LMU.

## Preparación autorizada — ISA-1080 (2026-09-08)

Base 40419038; rama vantareapp/isa-1080-authorized-correction-input;
worktree C:/tmp/vantare-isa1080. PrepareCorrections usa handle abierto, licencia
y parser/artefacto conservados por el servicio TA-03E. Analysis lee canales
requeridos con presupuestos explícitos y produce base/revisión vacía estable.
No usa el handle temporal como identidad de revisión. Lectura serializada;
sin truncado, nuevos criterios, inferencia de reloj ni caminos desde el cliente.
Error de lector retira/limpia; limpieza fallida sigue registrada para reintento.

RED/GREEN de Analysis y app; suites focales completas y vet pasan.
Build y Go global pasan. Fixtures registradas sanitizadas para paginación
y contratos controlados para permisos/lector; no banco DuckDB real ni Wails.
Siguiente: guardar/cargar/proyectar con autorización en servicio, lectura de
canales adicionales según objetivos, selección persistida y UI. No se declara
editor completo. Sin push/PR/CI remota, promoción, release o LMU.

## Unión de revisión durable y cliente — ISA-1079 (2026-09-08)

Base 4452fe4b; rama vantareapp/isa-1079-revision-binding;
worktree C:/tmp/vantare-isa1079. CorrectionStore.DeriveProjectionSession exige
ID exacto, carga esa revisión, recalcula su snapshot y emite referencia junto
a las familias. No sustituye revisión ausente por la cabeza. Prueba registrada
controlada: tras restaurar la base se puede recalcular la corrección anterior.
Cliente TS tipa/valida cobertura y digests; casos focales pasan (27 tests).

Build, Go global, vet, lint y typecheck pasan. Frontend inicial: 3261 pasan,
3 fallan (dos timeouts Pedals Redline y presupuesto OverlayFrame CPU 1,562 ms
frente a 1,5 ms), con Go/build concurrentes. Los 6 tests de esos dos archivos
pasan aislados; repetición completa con dos workers: 416 archivos y 3264 tests
pasan. No se cambian umbrales ni código Overlay. Happy-dom emite AbortError
durante teardown, con resultado final y código 0. Evidencia en isa-1079.

No conectado todavía a autorización vigente, comandos del editor ni planes.
La llamada a custodia sigue exigiendo que el servicio autorice fuente y páginas.
Sin dependencias, fuentes reales leídas, LMU, promoción ni release.

## Referencias de revisión en proyecciones — ISA-1078 (2026-09-08)

Base d458879f, rama vantareapp/isa-1078-projection-revisions,
worktree C:/tmp/vantare-isa1078. Contrato V2 aditivo con sourceRevisions:
sesión/base/revisión/snapshot. Validación de cobertura completa, digests y
rechazo de IDs cruzados. Productor conserva referencias sin alias; no cambia
familias ni payload legado sin referencias. Analysis, vet, build frontend y
suite Go global pasan. RED anterior por API ausente documentado.

Pendiente unir estos IDs a la revisión duradera y sus derivados en el servicio
autorizado, validar el consumidor TS y exigirlos al guardar planes registrados.
No es conexión del editor todavía. Continúan operaciones de uso por familia,
clasificación/límites, UI productiva, calibración y validación real Wails.
Sin nuevas dependencias, fuentes reales leídas, LMU, push/PR/CI remota,
promoción o release.

## Derivaciones escalares — ISA-1077 (2026-09-08)

Sobre 1980c3d4, rama vantareapp/isa-1077-corrected-derivation, worktree C:/tmp/vantare-isa1077.
DeriveCorrectedSession revalida base/parser/schema, aplica snapshot completo y
reutiliza validez, consumo/ritmo, curvas y boxes. Resultado separado del catálogo
observado, con Base/SnapshotID. No publica todavía una proyección corregida.
Prueba sobre fixture registrada sanitizada: cambio controlado de Lap Time se
refleja en la derivación; calidad invalidada sigue excluida aunque cambie el valor.
No es calibración de precisión. Analysis, vet, build frontend y go test ./... pasan.
Siguiente: referencia exacta de revisión en proyección/selección y servicio autorizado;
operaciones de uso por familia/clasificación/límites y UI todavía pendientes.


## Vista efectiva escalar C3 — ISA-1075 (2026-09-08)

Base 0892b9a9, rama vantareapp/isa-1075-correction-view, worktree C:/tmp/vantare-isa1075.
ApplySampleCorrectionSnapshot revalida el conjunto completo frente a canales y
páginas de la misma base autorizada; rechaza cobertura insuficiente/ambigua,
original cambiado e integridad de snapshot alterada. Copia páginas, valores y
punteros de timestamp. Conserva calidad, tiempos y procedencia de la corrección.
Tests Analysis/vet y build frontend pasan. Suite Go completa falla por la carrera conocida de Engineer/voiceinput #812; reproducida en 200 repeticiones y documentada sin tocar Engineer. No se declara gate global verde.
Todavía no conecta derivados, comandos o UI. Siguiente: revisión referenciada
por los derivados y aplicación de operaciones de selección por familia.
Sin dependencias, originales modificados, subagentes, promoción ni publicación.


## Custodia escalar C2 — ISA-1074 (2026-09-08)

Sobre 9b4df895, rama vantareapp/isa-1074-correction-custody, worktree C:/tmp/vantare-isa1074.
JSON privado por base, lease nativo, historial encadenado, expectedRevision,
commandId idempotente y restauración de snapshots sin reescribir revisiones.
Backup validado/cuarentena; ausencia de ID exacto es error, nunca sustitución.
Primer commit con confirmación perdida devuelve incertidumbre y admite reintento.
Límites: 256 correcciones, 256 revisiones, 8 MiB; son presupuestos de recursos.

Tests de custodia/Analysis y vet pasan; build frontend pasa; suite Go completa
pasa sobre el último código; compilación de Analysis para Linux también pasa. La custodia exige autorización vigente del servicio Analysis futuro;
los hashes no conceden permiso. No UI/bridge/vista efectiva conectados todavía.
Siguiente C3: aplicar correcciones a páginas autorizadas sin cambiar originales.
Sin nuevas dependencias, originales modificados, promoción ni publicación.


## Dirección visual aceptada e implementación — 2026-09-08

Isaac acepta 769775bd y autoriza desarrollar el plan con esa visión visual.
La aprobación cubre el asistente unificado de cinco pasos y el editor A4/Orbit.
Live/Monte Carlo siguen aplazados. Se implementa personalmente, conservando
el bucle adversarial visual al conectar pantallas; sin delegación de código.

Primer corte #1073 sobre 769775bd: snapshots escalares puros, canónicos y
atómicos en Analysis. Rama vantareapp/isa-1073-correction-snapshots; worktree
C:/tmp/vantare-isa1073. Tests focales y paquete Analysis pasan; build frontend
pasa; suite Go completa y vet de Analysis pasan. No existe aún custodia ni UI conectada.
Siguiente: custodia/revisiones bajo lease, vista efectiva y proyección, comandos
de Strategy, UI productiva, plan reproducible y validación con carreras reservadas.


## Combinación unificada — 2026-09-08

Isaac elimina la repetición Simulador/Evento/Combinación. El asistente tiene cinco
pasos: Inicio, Combinación, Reglas, Pilotos y Sesiones. Combinación reúne evento
personalizado o calendario Vantare, simulador, categoría/coche y circuito.
Calendario permanece sin conectar en la propuesta; no se inventan eventos.
Los enlaces antiguos de Simulador/Evento redirigen a Combinación. La galería
retira ambas pantallas y actualiza las capturas del asistente. Base 56ce59cd,
misma rama/worktree ISA-1063. Sin cambios productivos ni promoción.


## Recorrido completo listo para revisión humana — 2026-09-08

Isaac acepta el corte local 4c08b834 de stint y parada y pide extender el mismo
bucle a las doce pantallas restantes antes de implementar la integración productiva.
Asistente Inicio/Simulador/Evento/Combinación/Reglas/Pilotos/Sesiones y editor
Carrera/Datos/Plan/Cálculo/Revisiones. Se mantienen originales intactos, cálculo
y guardado desconectados. El prototipo usa metadatos del banco existente.

Cuatro revisiones independientes: mínimos 7,9 → 8,7 → 8,9 → 9,1/10.
Las doce pantallas superan >9 individualmente; Plan y Revisiones llegan a 9,2.
Stint/parada mantienen 9,2/9,1 sin regresiones materiales. Falta aceptación humana. La evidencia vive en `docs/strategy-planner/evidence/isa-1063-all-screens`.
Rama `vantareapp/isa-1063-orbit-prototype`, worktree `C:/tmp/vantare-isa1063-orbit`,
base 4c08b834. Sin merge, release ni conexión nueva de DuckDB.

## Bucle visual adversarial — ISA-1063 (2026-09-08)

Isaac rechaza la semejanza de 42c9dec8 y autoriza excepcionalmente un subagente
solo para revisión visual adversarial. El bucle exige nota estrictamente >9/10
antes de solicitar su revisión. Tres pasadas: parada/stint 8,0/8,4; 8,7/8,9;
**9,1/9,2**. Gate final = menor nota = **9,1/10**. Isaac aún debe aceptar.

Corte sobre 42c9dec8, misma rama/worktree. Cabecera, imagen decorativa, agrupaciones,
jerarquía, recursos, servicios, iconos y footer reconstruidos contra referencias
1672 × 941. Enlaces #pit/#stint para revisar las vistas; curvas sin valores y
cálculo deshabilitado. Sin backend ni originales tocados. Evidencia y límites:
`docs/strategy-planner/evidence/isa-1063-visual-loop/review-03.md`.

El gate cubre solo stint y parada a ese tamaño, no todas las pantallas ni el
producto conectado. El siguiente paso es revisión de Isaac de estas capturas y
recorrido; después continuar visual/conexión según el plan aprobado.

## Visual en código antes de conexión — ISA-1063 (2026-09-08)

Isaac considera plano el prototipo e53bb132 y excesivo el concepto rojo posterior.
Pide un punto medio y fija el orden: primero completar la parte visual en código,
después enlazar datos y motor. Se mantiene la dirección A4; no se considera
aceptado el acabado concreto de esta nueva iteración antes de que lo vea.

Corte local sobre e53bb132, misma rama y worktree: cabecera compacta, línea de
carrera con selección, iconos, métricas pendientes, tablas, restricciones,
servicios paralelos y evolución vacía. Rojo en selección e iconos; paneles neutros
con tinte leve. Cambian plan-preview.js y recorded-editor.css, sin dependencias.
Se conserva el asistente y la revisión de datos. No se conecta I/O ni solver.

Verificación personal en Chrome y evidencia en el README. Siguiente: revisión
visual del recorrido en código; después custodia/conexión en cortes por issue.
No reordenar los contratos internos ni saltar su validación por esta decisión.

## A4 aceptado y adaptado a Orbit — ISA-1063 (2026-09-08)

Isaac acepta A4 y las pantallas de edición, cálculo, resultado, stint y parada;
pide conservar el diseño con los colores actuales de Vantare y continuar.
Este corte sobre `799049e8`, rama `vantareapp/isa-1063-orbit-prototype`, añade
el garaje decorativo, la composición A4 y navegación documental Plan/Stint/Parada/
Cálculo/Revisiones. Reutiliza tokens, fuentes, iconos y shell Orbit productivos.
El editor comprime la columna contextual. Solo datos y reglas serán editables;
los segmentos los construye el solver. Valores pendientes y cálculo deshabilitado.

La dirección visual está aceptada; la integración productiva sigue pendiente.
No hay persistencia, ejecución del solver ni lectura nueva de DuckDB en este
prototipo. Siguiente corte: snapshots/solapes y custodia reversible con su issue;
después conectar el editor sin duplicar lectores ni motores.
Verificación y capturas en el README del prototipo. Sin push, PR, CI remota,
promoción, release ni modificaciones de fuentes LMU.

## Actualización ISA-1067 — base autorizada (2026-09-08)

Base `7f04dd93`, rama `vantareapp/isa-1067-correction-source`.
Analysis marca sesión/versión al derivar y produce la base exacta de corrección.
Los análisis legacy sin marca requieren reanálisis; no se versionan al leerlos.
Sin cambios de criterios, fuentes o UI. Evidencia en
`docs/strategy-planner/evidence/isa-1067/README.md`.
Siguiente: snapshots/solapes y custodia reversible; después conexión a Strategy.


## Actualización ISA-1066 — C1a (2026-09-08)

Isaac acepta #1063 como dirección visual inicial. Primer código de correcciones
sobre `b486050c`, rama `vantareapp/isa-1066-sample-corrections`: identidad de base
y preparación de un escalar con precondición/original intacto. No persistencia,
UI conectada, revisión guardada ni solver. Evidencia:
`docs/strategy-planner/evidence/isa-1066/README.md`.
Siguiente C1b/base autorizada y snapshots, después C2/custodia. Sin subagentes,
fuentes modificadas, promoción o publicación.


## Actualización ISA-1063: propuesta visual lista (2026-09-08)

Base `609a4390`, rama `vantareapp/isa-1063-strategy-prototype`.
Propuesta navegable en `docs/strategy-planner/prototypes/recorded-editor/index.html`.
Siete pasos y pantalla con resumen/revisión; prueba Chrome del recorrido y deshacer.
No implementa el editor productivo. Isaac debe revisar la composición concreta,
conforme al gate visual de #1028. El contrato #1033 sigue propuesto y la calidad
empírica no se declara validada. Sin datos originales modificados ni promoción.


## Actualización ISA-1030: relojes del banco (2026-09-08)

Corrección instrumental sobre `18f9dea4` en `vantareapp/isa-1030-clock-evidence`.
El contraste real Imola/Algarve reproduce un desfase de 119,48 s en el spike y
recupera el repostaje de Algarve. Producto conserva origen desconocido; no se
cambia su contrato por una inferencia experimental. Ver
`docs/strategy-planner/evidence/isa-1030/clock-correction.md`.
Siguiente: propuesta navegable dentro de Strategy para revisión de Isaac;
anotación/calibración y contrato productivo de relojes siguen pendientes.
Sin promoción, release ni intervención en LMU.


## Resultado

Un único producto que crea, compara, guarda, ejecuta y adapta planes para
minimizar tiempo total esperado y mostrar riesgos/alternativas. Product A/B/C
son fases históricas.

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Este handoff y la issue de GitHub activa. Linear fue retirado el 2026-08-20;
  las referencias posteriores a Linear se conservan solo como historial.
- `docs/superpowers/specs/2026-07-13-strategy-planner-product-b-design.md` y
  `strategy-base.html` son referencias históricas que deben reauditarse.
- El próximo informe de rescate y plan unificado sustituirán los planes PB.

## Estado

Actualización ISA-1033 (2026-09-08, contrato propuesto de correcciones):

- Base `8a2d8ff4`, rama `vantareapp/isa-1033-observation-corrections`, solo docs.
- ADR 0010 y `docs/strategy-planner/corrections-contract-v1.md`: Analysis posee
  correcciones sobre contenido+interpretación exactos; Strategy selecciona una
  revisión. Snapshots reversibles, fuente intacta y conflictos explícitos.
- Microplan posterior en `docs/superpowers/plans/2026-09-08-analysis-corrections-contract-implementation.md`.
- Propuesta revisable, no persistencia/UI implementadas ni umbrales aprobados.
- Bloqueos de aceptación: #1030 (anotación/calibración/holdout), Wails, prototipo
  y F1–F5. Live sigue aplazado. No hubo promoción ni datos reales modificados.

Actualización ISA-1038 (2026-09-08, cierre local del saneamiento):

- Código `5a5feb44`, cierre documental en `vantareapp/isa-1038-review-closeout`.
- Revisión personal terminada; siete hallazgos conocidos tratados en cortes por
  issue, con regresiones. Go completo/build/typecheck/lint PASS; frontend final
  416 archivos / 3256 tests PASS. Sin subagentes.
- Informe consolidado: `docs/strategy-planner/evidence/isa-1038/closeout.md`.
- Preparar #1033 documental. Siguen anotación/calibración/holdout #1030, Wails,
  prototipo revisado y fases F1–F5. El editor completo no está implementado.
- Sin promoción, PR/CI remota, fuentes modificadas o intervención en LMU.

Actualización ISA-1042 (2026-09-08, alcance del comparador avanzado):

- Rama `vantareapp/isa-1042-weather-comparison-scope`, base `686b1c23`.
- Weather usa las vueltas evaluadas de la variante activa, sin cálculo duplicado
  con boxes cero. Contrato y aviso explícitos de distancia fija ES/EN/PT/IT.
- Evidencia: `docs/strategy-planner/evidence/isa-1042-weather-comparison-scope.md`.
- La optimización temporal multiescenario sigue pendiente, visible como límite;
  no afecta a la autoridad del plan principal ni inicia live.

Actualización ISA-445 (2026-09-08, referencias y confianza):

- Rama `vantareapp/isa-445-reference-boundary`, base `b1211c99`, ejecución personal.
- Composición sin fixture o claves TEST; caché TEST rechazada. Catálogo vacío
  hasta confianza/publicación aprobadas. Guarda referencias solo para combinación
  canónica elegida y busca la variante dentro de esa combinación.
- Evidencia: `docs/strategy-planner/evidence/isa-445-reference-boundary.md`.
- Publicación sigue pendiente. No certifica reglas/condiciones ausentes del payload.
- Próximo: cierre personal de revisión, contrato #1033; Wails/holdout pendientes.

Actualización ISA-821 (2026-09-08, deadline por candidato):

- Rama `vantareapp/isa-821-candidate-deadline`, base `b85fa5f4`, ejecución personal.
- Contexto padre y deadline de 29 minutos; cliente conserva 30. No guarda éxito
  tardío y espera terminación antes del siguiente lote. Causas visibles ES/EN/PT/IT.
- Evidencia y límites cooperativos: `docs/strategy-planner/evidence/isa-821-candidate-deadline.md`.
- Continúan #445, validación Wails y calibración/holdout #1030. Sin promoción.

Actualización ISA-819 (2026-09-08, reconciliación de generaciones):

- Rama `vantareapp/isa-819-catalog-reconciliation`, base `bb266977`. Ejecución personal.
- Catálogo autorizado como autoridad; pérdidas reintentables, sin duplicar
  importaciones conservadas ni modificar consentimiento al consultar estado.
- Totales coherentes entre tandas y sesiones fuera del discovery actual.
- Evidencia: `docs/strategy-planner/evidence/isa-819-catalog-reconciliation.md`.
- Wails sigue pendiente; próximos cortes #821/#445 y gate empírico #1030.
- Sin cambios de originales, LMU o promoción.

Actualización ISA-1043 (2026-09-08, calidad de vueltas con boxes):

- Rama `vantareapp/isa-1043-pit-lap-overlap`, base `1ac45d69`. Ejecución personal.
- Se añaden las transiciones de boxes dentro de vuelta a las etiquetas;
  ritmo excluido, FamilyPit/ObservedStrategy conservadas. Sin nuevos umbrales.
- RED/GREEN y paquete telemetryanalysis PASS sin modificar fixtures previas.
  Build/Go completo/digest PASS. Evidencia: `docs/strategy-planner/evidence/isa-1043-pit-overlap.md`.
- Continúan recuperación #819, deadline #821, referencias #445 y gate empírico
  #1030. Sin modificaciones de originales ni promoción.

Actualización ISA-1042 (2026-09-08, reloj normal de Orbit):

- Rama `vantareapp/isa-1042-timed-race-horizon`, base `b7991919`, ejecución
  personal. El horizonte se resuelve junto con paradas/recursos; replay
  comprueba inicio real de última vuelta y llegada. Ciclos no publican plan.
- Golden de cuatro horas: 136 vueltas, cuatro paradas, llegada 4:00:00.
- Evidencia: `docs/strategy-planner/evidence/isa-1042-timed-horizon.md`.
  Go completo/build/typecheck/lint PASS; frontend 415 archivos / 3241 tests PASS.
- El comparador avanzado Weather continúa a distancia fija; este corte no
  lo certifica para tiempo. Sigue fuera del editor inicial de un solo óptimo.
- Continúan #1043/#819/#821/#445, calibración/holdout #1030. Se solicitó a
  Isaac una carpeta con carreras completas nuevas para la validación reservada.

Actualización ISA-1041 (2026-09-08, primer corte de saneamiento validado localmente):

- Isaac autoriza continuar hasta terminar; ejecución personal sin subagentes.
- Rama `vantareapp/isa-1041-orbit-final-evaluation` desde `286f99e8`, worktree
  `C:/tmp/vantare-isa1041`. Microplan: `docs/superpowers/plans/2026-09-08-strategy-final-evaluation.md`.
- El plan definitivo se valida con carga explícita, recursos/reserva del
  solver y costes del replay. No se hereda optimalidad; aviso ES/EN/PT/IT.
- Evidencia: `docs/strategy-planner/evidence/isa-1041-final-evaluation.md`.
  Go completo/build/typecheck/lint PASS; frontend 415 archivos / 3241 tests PASS.
- Continúan #1042, #1043, #819, #821 y #445 en cortes separados. #1030 mantiene
  pendiente calibración/holdout. No se abre todavía el gate de nuevas secciones.
- Sin promoción, release, cambios de LMU o fuentes originales.

Actualización ISA-1038 (2026-09-08, revisión personal previa a nuevas secciones):

- Isaac exige Ponytail + code review y ejecución sin subagentes. Revisión sobre
  `4ce96ded` en `C:/tmp/vantare-isa1038`, sin fixes productivos.
- Veredicto NO-GO para nuevas secciones. Informe, cobertura, límites y seis
  reproducciones: `docs/strategy-planner/evidence/isa-1038/README.md`.
- #1041: recursos/reserva/coste del plan final; #1042: reloj y paradas;
  #1043: boxes dentro de vuelta. Reusar #819 para reconciliación, #821 para
  deadline y #445 para referencias de prueba/compatibilidad.
- 20 paquetes Go PASS; frontend Strategy 32 archivos / 273 tests PASS sobre
  mismo HEAD. Los probes reproducen defectos; no validan precisión real.
- Gate: corregir bloqueos en microcortes, revisar y revalidar antes de nuevas
  secciones. #1030 mantiene anotación/calibración/holdout pendientes.
- Sin Wails, datos originales, cambios de LMU, push, PR, CI remota ni promoción.

Actualización ISA-819 (2026-09-08, segundo corte local):

- Continuación autorizada desde `034cf537`, misma rama aislada de #819.
- Recuperación de cold-start preservando decisión, backup validado y cuarentena;
  causas explícitas desde composition root hasta cliente/banner ES/EN/PT/IT.
- Evidencia: `docs/strategy-planner/evidence/isa-819-cold-start-status.md`.
- Go completo, build, typecheck y lint PASS. Frontend completo: tres timeouts
  iniciales fuera del corte; repetición con dos workers 3240/3240 PASS.
- No cierra #819: falta reconciliar generaciones entre catálogo y progreso tras
  recuperación, y validar el resultado en Wails con perfil de prueba separado.
- Sin cambios de solver, datos reales, deadline #821 ni promoción.

Actualización ISA-819 (2026-09-08, primer corte local de recuperación):

- Isaac autorizó continuar los microplanes de #1030. Rama aislada
  `vantareapp/isa-819-authorized-store-recovery` desde `f29fe3d6`.
- Store autorizado con backup validado, cuarentena y errores tipados; test RED
  previo, paquete telemetryanalysis y `go test ./...` PASS. Build frontend PASS
  para assets Go.
- Evidencia: `docs/strategy-planner/evidence/isa-819-store-recovery.md`.
- #819 sigue abierta: cold-start y mensaje visible de indisponibilidad/
  recuperación aún pendientes. El banco empírico de #1030 no cambia de estado.
- Sin merge, promoción, release, intervención en LMU ni datos reales modificados.

Actualización ISA-1030 (2026-09-08, banco terminado, F0 empírico pendiente):

- Isaac aprobó plan maestro y auditoría v1; ejecución inline en worktree propio
  desde `b4de3035`, sin autorización de implementación o integración.
- Evidencia: `docs/strategy-planner/evidence/isa-1030/README.md` y `code-matrix.md`.
  Tests focales de validez/discovery y backtest PASS; inventario 367/367 sin fallos.
- Banco autorizado por Isaac; LMU abierto intacto, fuentes con WAL excluidas.
  Helper aprobado ISA-1011 verificado por hashes; originales no modificados.
- Cuatro muestras de preparación inspeccionadas y reidentificadas tras leer.
  Reserva congelada: cuatro Race de 1–4 vueltas; las 19 Race de más de cuatro
  vueltas ya se analizaron en el spike histórico. No hay holdout completo suficiente.
- Faltan semántica/relojes, anotación independiente y calibración defendible.
  No se aprobó umbral ni se declaró precisión, óptimo validado o F0 completo.
- Siguiente acción: revisar `evaluation-protocol.md` y `next-slices.md` del
  expediente. Reusar #819/#821/#803; #1033 propone contrato de correcciones.
  Antes del óptimo, llevar reglas/inventario/perfiles al adapter del solver.
- Trabajo local documental e instrumental; sin código productivo, push, PR,
  CI remota, merge, release o promoción. #1030 sigue abierta.

Actualización ISA-1028 (2026-09-08, diseño funcional acordado con Isaac):

- Nueva prioridad: asistente Manual/Automático y pantalla editable sobre archivos
  registrados; LMU/DuckDB primero, formatos ampliables. Originales intactos,
  correcciones reversibles, calidad por cálculo, Fuel/VE, resultados parciales y
  revisiones reproducibles. Toda la experiencia se presenta desde Strategy,
  conservando Analysis como autoridad interna de lectura y derivación.
- Spec escrita v1 aprobada por Isaac el 2026-09-08 sobre el commit `a009231a`:
  `docs/superpowers/specs/2026-09-08-strategy-recorded-editor-design.md`.
- Este rumbo reemplaza la siguiente acción histórica de ISA-694. Live y la
  investigación OSS/Monte Carlo se aplazan hasta completar y validar este corte.
- Corrección de estado histórico: #867 sí se integró en `nightly@a02a1463`;
  los párrafos anteriores a esta fecha que lo llaman candidato son históricos.
- Issue #1028 solo entrega documentación sobre `origin/nightly@d6d0992f`.
  No se ha implementado esta nueva experiencia ni ejecutado el gate Wails/corpus.
- Plan maestro: `docs/superpowers/plans/2026-09-08-strategy-recorded-editor-master.md`.
  Primer plan ejecutable: `docs/superpowers/plans/2026-09-08-strategy-recorded-editor-audit.md`,
  issue #1030. Ambos v1 aprobados; estado posterior de ejecución arriba.

Actualización ISA-861 (2026-08-27, corte final candidato sobre
`origin/nightly@b1d5b15b`):

- La rama de integración incorpora el acumulado ISA-694 completo sobre el
  Nightly actual junto con el reader y runtime productivos de Telemetry
  Analysis. Strategy conserva Go como única autoridad de cálculo, catálogo y
  proyección; Orbit presenta datos, procedencia y causas de ausencia.
- El corte incluye importación histórica/cold start, selección por calendario,
  inputs por clima, backtests, referencias firmadas, SolveV2, reserva y
  persistencia canónica. No habilita subida remota ni publica catálogos.
- TA03E/TA03F ya fue promovida mediante PR #866 a `nightly@b1d5b15b`. Este
  corte final de Analysis/Strategy mantiene push, PR, CI y merge pendientes.
  La prueba Wails/LMU real continúa siendo el gate posterior; `testers`,
  `master` y release quedan fuera.

Actualización ISA-833 / contrato de ritmo por clase (2026-08-25, implementada en rama de issue):

- `StrategyInputProjection v2` declara la familia aditiva `classPace`, con
  presencia, procedencia, confianza, motivo tipado y `byClassName` indexado por
  nombre de clase. Una familia válida exige procedencia `reference` y valores
  positivos; la futura base compartida será la única fuente autorizada.
- El productor actual la publica siempre `missing`, con
  `no_class_pace_source` y mapa vacío. No acepta un input de ritmo rival y no
  calcula ningún doblaje.
- Análisis lee esa causa tanto para las filas de clase como para la tabla. El
  fixture válido de dos clases demuestra que la UI transporta los escalares
  sin convertirlos en bloques, alcances, frecuencias ni vueltas.

Actualización ISA-832 / reserva obligatoria (2026-08-25, implementada en rama de issue):

- La decisión de producto vive en el adaptador Orbit como 0,8 vueltas con procedencia `product-decision:isa-832`. `PlanningInputReserveLaps` permite modificarla por evento y se proyecta a las reservas Fuel/VE existentes de `manual`.
- SolverV2 rechaza cualquier candidato que termine por debajo del margen. El resultado publica cumplimiento, margen efectivo, cantidades y recurso limitante; `reserve_not_met` llega a `Reasons` y al error de aplicación cuando ninguna parada puede hacerlo factible.
- La misma comprobación se ejecuta al reproducir decisiones, elegir ahorro, evaluar candidatos robustos y resolver cada escenario climático. Orbit publica el estado por plan y por escenario sin cálculo de dominio en TypeScript.
- El atajo sigue activo con reserva: la cota incluye el recurso final y el caso Fuel escalar puro tiene cierre exacto lineal; Fuel×VE conserva enumeración acotada. La paridad usa 300 casos mixtos más 100 de Fuel escalar contra el oráculo exhaustivo.
- La salida y la reproducción de cada candidato usan el mínimo Fuel/VE inicial que mantiene factibles todos los prefijos, servicios y la reserva terminal. Un depósito lleno sólo permanece cuando el consumo total supera una carga o cuando reduce un servicio decidido; capacidad nunca vuelve a ser el valor canónico por defecto.
- Gate `go test ./internal/strategy/... -count=1` y `go vet ./internal/strategy/...` verdes. `go vet ./internal/... ./cmd/...` sigue rojo por tres avisos `unsafe.Pointer` heredados en launcher/LMU; los ficheros señalados no cambian contra la base. Pendiente prueba Wails/LMU real de Isaac tras integrar. Sin PR, merge, promoción ni release.

Actualización ISA-831 / consumo por clima (2026-08-24, implementada en rama de issue):

- El contrato TypeScript de `StrategyInputProjection v2` ya conserva y valida
  `byClimateBucket` para Fuel y VE. Su omisión sigue siendo compatible con
  documentos v2 antiguos, pero el consumidor la trata como dato ausente.
- La ficha pide combustible con el mismo bucket de la fila que ya usaba el
  ritmo. Un bucket ausente conserva `missing`, muestra una causa traducida y
  nunca cae a `meanPerLap` ni al dato de otro clima. La función común aplica el
  mismo aislamiento a VE.
- Regresiones de unidad y wiring cubren valor propio, ausencia visible y el
  caso seco `3.538` sin lluvia. Pasan 253 tests focales, typecheck real y build;
  queda pendiente la verificación de Isaac en la app real.

Actualización ISA-830 / ficha y procedencia efectiva (2026-08-24, implementada en rama de issue):

- La ficha de cada piloto renderiza ritmo y consumo desde la misma vista
  efectiva que aporta presencia, procedencia y confianza. Con proyección Spa
  LMGT3 muestra `2:22.004` y `3.54 L/v`, no los manuales persistidos.
- Se corrigieron otros ocho puntos de presentación: seis chips junto a campos
  manuales editables y los dos resúmenes de depósito/boxes. Los campos de
  edición declaran ahora `manual`; los resúmenes, timeline de parada y
  combustible de salida consumen el valor efectivo.
- La regresión enlaza lo visible con los valores `142.004` y `3.538` presentes
  en `planningInputs` del comando `calculate_orbit`. Suite focal, typecheck
  real y build pasan; la prueba Wails/LMU real queda para Isaac tras integrar.

Actualización ISA-825 / cálculo acotado (2026-08-24, implementada en rama de issue):

- La reproducción con los dos modelos autorizados de Spa confirmó que la
  curva `missing` no se recorría. Fuel derivado (3,538 L/vuelta) y VE derivada
  (4,866 %/vuelta) multiplicaban la frontera y `insertNondominated/dominates`
  consumía CPU porque `P95Millis` solo se medía al terminar y las cotas
  declaradas no se aplicaban.
- El subespacio escalar sin beneficio posible por abrir otro stint usa la cota
  de tránsito solo para demostrar el mínimo de stints. Dentro de él enumera sin
  poda longitudes y cantidades discretizadas, con límite de 100.000 nodos y
  retorno a la búsqueda general si lo supera. La paridad aleatorizada de 300
  casos (semilla 825) encontró una divergencia previa en servicio paralelo:
  cargar Fuel adicional puede ser gratis cuando VE domina; ya queda cubierta.
- El evento real termina por este atajo exacto en un candidato, cero
  comparaciones de dominancia, un stint de 18 vueltas y cero paradas; no agota
  presupuesto ni devuelve un plan degradado. El golden largo conserva
  `11+32+32+32+32` y su desempate observable.
- La búsqueda general tiene límites efectivos de candidatos e iteraciones,
  admite `context.Context` y comprueba cancelación dentro de dominancia. Orbit
  comparte un deadline backend de ocho segundos entre variantes y clima; el
  bridge expone `calculation_timeout` antes del timeout de 10 s del cliente.
- `CombinedStintPaceCurve` y `SavingCost` ausentes o vacíos se excluyen con una
  asunción y causa explícitas. No se crean puntos, niveles ni medidas.
- Pendiente: integración y repetición manual del camino ELMS Sprint Trophy /
  Spa (WEC) / LMGT3 / Logitech G Challenge #2:LGC. Sin PR, merge, promoción o
  release.

Actualización ISA-827 / ritmo representativo (2026-08-24, implementada en rama de issue):

- Analysis publica `representativePaceByClimateBucket` en
  `StrategyInputProjection v2`; cada bucket lleva mediana, presencia,
  procedencia, confianza y una causa explícita cuando no es derivable. La
  lectura sigue aceptando documentos v2 anteriores sin el campo, pero todo
  productor nuevo emite los tres buckets.
- El plan y `SolveV2` resuelven `baseLapSeconds` desde el bucket de la variante
  (seco/eco=`dry`, mojado=`wet`) aunque `CombinedStintPaceCurve` esté ausente.
  La curva sigue gobernando solo el coste dentro del stint y un valor
  manual/corregido sigue ganando al derivado. Orbit muestra el chip Derivado
  con muestra/rango o el motivo real
  (`sin vueltas completas`, `sin tiempo fiable`, `sin clima estable` o `sin
  vueltas limpias`) sin aritmética TypeScript.
- Evidencia del defecto en el store real: Spa LMGT3, sesión `e124f80e...`,
  vueltas 2/4/6/7 con 141,55–142,25 s, etiqueta `traffic` e inclusión Fuel/Pace
  verdadera. Un veto posterior y exclusivo de Pace descartaba las cuatro. La
  corrección usa la decisión común de F3-a2; una reparación in-memory permite
  aprovechar modelos `consumption-pace.v1` solo con hechos ya persistidos y no
  modifica el store.
- Verificación real read-only: 336 modelos, 5 sesiones de la combinación, seco
  válido con N=4 y mediana 142,003814697266 s mientras la curva permanece
  missing/0 puntos; hash del fichero sin cambios. El barrido de los 45 buckets
  deja 19 Fuel/Pace válidos, 0 Fuel-válido/Pace-missing y conserva los 26 donde
  ambas familias ya eran no válidas. Analysis+Strategy, vet focal,
  68 tests frontend focales y build pasan. El gate global conserva deuda previa:
  tres avisos `unsafe.Pointer` en vet y una clave i18n huérfana
  `strategy.wizard.fill.autoTip` (2938/2939 tests Vitest verdes), ambas presentes
  en la base. Sin PR, integración, promoción ni release.

Actualización ISA-828 / pantalla Análisis (2026-08-24, implementada en rama de issue):

- Strategy Orbit incorpora una pestaña `Análisis` sin columna de datos
  manuales. Reutiliza `Surface`, `StatRow`/`StatTile`, `HorizontalTimeline`,
  `Chip`, `Note`, `Accordion` y `Button` para ordenar cifras paralelas, carrera,
  multiclase, paradas, tiempos y log de cálculo.
- La UI consume una ampliación aditiva del resultado Go: combustible inicial y
  final, reserva, tiempos, paradas y la decisión D6 exacta de SolverV2. Un modo
  llamado eco no basta para presentarlo como ahorro; `savingApplied` solo se
  activa con stints de ahorro realmente elegidos y su coste entra en el tiempo.
- La ausencia de plan D6, ritmo de las otras clases o desglose legado conserva
  la sección y explica la causa. Cada dato base del log declara procedencia
  derivada, manual o de referencia. La infografía descargable no forma parte de
  este cambio y no se ha empezado.
- Pasan 243 tests Strategy/Orbit, los typechecks solicitado y real, el build y
  el test Go focal. El preview en navegador queda bloqueado antes de Strategy
  por `overlay-frame-v2:invalid-contract:disposed` al ejecutar sin Wails; no se
  presenta como prueba de runtime real.

Actualización ISA-824 / entrada asistida (2026-08-24, implementada en rama de issue):

- La puerta `Automática con telemetría` consulta el catálogo real y solo se
  abre con combinaciones que tengan vueltas clasificadas por clima. Explica por
  separado cero sesiones importadas, catálogo no disponible y ausencia de una
  combinación utilizable; ya no existe el falso bloqueo de ADR 0005.
- El bloque inferior lista las carreras LMU por el bridge Calendar existente.
  La identidad de series declara en Go las diez correspondencias de sede y las
  cinco de clase; esas identidades viajan en el mismo payload y un calendario
  publicado no puede sustituirlas. Los valores no declarados se muestran por
  su nombre y conducen a la vía manual.
- El orden es carrera, clase cuando sea multiclase y coche. Si la sede y clase
  seleccionadas tienen varios trazados grabados, aparece antes una elección con
  sus recuentos reales; con uno solo se omite. El trazado nunca se infiere del
  sufijo del calendario. El coche desemboca en el selector F5-a existente, que
  persiste sesiones, refresca `StrategyInputProjection v2` y alimenta Orbit sin
  pedir números ni duplicar la proyección.
- Tests cubren carrera monoclase, multiclase, trazado ambiguo, falta de sesiones,
  catálogo caído e identidades desconocidas. En el corpus local, la identidad
  cubre 10/10 sedes y 5/5 clases; 7/10 sedes tienen sesiones coincidentes y
  5/11 series ofrecen coches con clima clasificado. Los gates pedidos,
  typecheck real, build y `go test ./...` pasan. El lint global conserva 35
  incidencias heredadas (32 errores y 3 warnings), anteriores al bloque nuevo.
  Sin PR, integración, promoción ni release.

Actualización ISA-815 / F5-e (2026-08-23, implementada en rama de issue):

- `LMUImporter` ya no convierte fallos de validez o clasificación en éxito: la
  omisión conserva el error real y nunca llega al store como importada.
- El store rechaza nuevas entradas sin validez o clasificación catalogable,
  pero al abrir mantiene los registros legados para que el catálogo pueda
  aislarlos. La consulta devuelve las combinaciones sanas y una lista separada
  de exclusiones con sesión y causa, sin inventar una combinación incompleta.
- Tests cubren análisis y clasificación, no persistencia, reporte de la omisión
  y reapertura con dos sesiones buenas más una legada defectuosa. La suite
  Analysis+Strategy y el `vet` focal pasan; build global y `vet ./cmd/...`
  quedan bloqueados por el `frontend/dist` ausente, y `vet ./internal/...`
  conserva tres avisos `unsafe.Pointer` previos y ajenos. Entrega local
  committeada; sin PR, integración, promoción ni release.

Actualización ISA-818 / F5-e (2026-08-23, implementada en rama de issue):

- Cancelar la app durante los cuatro imports activos ya no persiste esas
  sesiones como fallidas ni cierra el cold start; el lote queda pendiente y se
  reanuda en el siguiente arranque.
- Reintentar omitidas es ahora una operación explícita de la aplicación y del
  cliente TS. El banner solo la ofrece cuando hay omisiones, limpia sus fallos
  y vuelve a encolarlas antes de continuar la importación.
- Un fallo real sigue persistiendo su locator y motivo. Hay regresiones para
  cancelación/reanudación, reintento y fallo real. Strategy+Analysis, race,
  suite Go completa, 385 archivos/2924 tests frontend, typecheck y build pasan;
  vet focal pasa y el vet global conserva tres avisos `unsafe.Pointer`
  heredados en archivos Launcher/LMU sin cambios. Sin PR, integración,
  promoción ni release.

Actualización ISA-813 / F5-e (2026-08-23, implementada en rama de issue):

- Las familias de validez, consumo/ritmo, curvas y pit declaran sus canales y
  el importador lee su unión de 17, no los 98 disponibles. Validez declara
  además los cuatro relojes de 1 Hz que preservan el borde de cobertura. Un
  guard AST impide que una familia acceda a un canal sin declararlo.
- Las sesiones se importan con 1-4 helpers y 4 por defecto. La persistencia
  sigue ordenada y secuencial; omisiones, reintento y progreso de ISA-810 se
  conservan con errores y `panic` cubiertos por tests.
- En el corpus real, el baseline de #813 era 13m40s/337. La corrida final con
  el runtime firmado es 1m41,090s, 337/337 y cero omisiones; otra corrida con
  cuatro quedó en 2m20,668s. El pico final fue 950.247.424 bytes en Go más
  134.971.392 en cuatro helpers. Con tres fueron 2m52,766s y unos 82 MB menos
  en total: se eligieron cuatro por el margen.
- 65.536 filas por página no son compatibles con el helper firmado; se mantiene
  16.384. Analysis+Strategy pasan. El gate Go global solo falla por la ausencia
  previa de `frontend/dist` para los paquetes embed. Lista para review; sin PR,
  integración, promoción ni release.

Actualización ISA-810 / F5-e (2026-08-23, implementada en rama de issue):

- El banner permanece visible si falla la consulta de estado, explica el fallo
  y deja reintentar. Durante el descubrimiento en segundo plano declara que
  sigue buscando y no presenta cero sesiones como resultado provisional.
- La importación secuencial conserva progreso por sesión y usa un timeout
  específico de 30 minutos por archivo, independiente de los 10 segundos del
  resto de comandos Strategy.
- Error, fallo del store o `panic` de una sesión se registra con motivo y no
  aborta las siguientes. El estado local recuerda importadas y omitidas; el
  resumen permite reintentar explícitamente solo las omitidas.
- #809 sigue siendo la autoridad del defecto de validez: esta rama no toca
  `internal/telemetryanalysis/lapvalidity.go`; la recuperación defensiva vive
  en el servicio de arranque en frío. Strategy+app, 385 archivos/2923 tests
  frontend, typecheck, build y visual Orbit quedan verdes. Pendiente: push,
  review y prueba real del corpus de 337 sesiones. Sin PR o promoción.

Actualización ISA-796 / F5-e (2026-08-22, implementada en rama de issue):

- El consumidor único acepta el fixture firmado TEST sin abrir red por
  defecto. Firma inválida, época desconocida, rollback, vencimiento duro y
  schema incompatible degradan a caché todavía válida o a vacío con aviso;
  nunca generan referencia inventada.
- Orbit muestra perfiles y estrategias en `Referencia`, ambos con etiqueta
  `referencia` y `k>=3`. Al usarlos crea inputs o variantes del documento v2
  con procedencia `reference` visible.
- El banner de primer arranque descubre los DuckDB estables de la ruta LMU,
  importa uno por comando con progreso a un store autorizado que alimenta
  F5-a, o conserva el rechazo. No reaparece tras aceptar/rechazar.
- Hay copy en ES/EN/IT/PT y evidencia automática de degradación, procedencia,
  progreso, persistencia, discovery y UI. La captura dedicada demuestra la
  sección separada sin romper el gate de scroll de Orbit.
- Lista para review en la rama de issue; sin PR, integración, promoción,
  primera publicación ni release.

Actualización ISA-794 / F5-d (2026-08-22, implementada en rama de issue):

- La query `get_validated_examples` resuelve la combinación del evento y
  reproduce cada carrera autorizada con `internal/strategy/backtest`; Strategy
  no abre DuckDB ni duplica sus métricas.
- La salida neutral incluye error total y por stint, agregado y un resumen de
  `ObservedStrategy`. Los resultados se ordenan del más reciente al más
  antiguo y una combinación sin carreras conserva una lista vacía explícita.
- Orbit presenta fecha relativa, estrategia corrida, predicho, real y
  desviación en ES/EN/IT/PT. No presenta aprobado/suspenso mientras #702 siga
  fijando los umbrales definitivos y no usa datos simulados.
- Gates locales verdes: Strategy+app, 382 archivos/2916 tests frontend,
  typecheck, build y visual Orbit. La captura dedicada justifica la nueva
  evidencia predicho/real/desviación sin semáforo provisional. La entrega
  queda lista para review en la rama de issue; sin PR, integración, promoción
  ni release.

Actualización ISA-786 / F5-c (2026-08-22, implementada en rama de issue):

- El evento canónico guarda hasta 16 escenarios ponderados como
  `WeatherScenario v1`, cada uno con sus cinco nodos manuales de lluvia,
  cielo y temperaturas. Cambiar de combinación vuelve a vincular esos
  escenarios para no dejar un documento inválido.
- Orbit presenta el editor y el plan de cada escenario con la condición
  aplicada por vuelta. La recomendación robusta destaca minimax regret,
  regret máximo y pérdida esperada ponderada; `SolveWeatherScenarios` sigue
  siendo la única autoridad del cálculo.
- Sin escenarios se declara seco manual. La captura LMU permanece
  deshabilitada con copy honesto hasta su validación y no hay datos simulados;
  el overlay ingame sigue fuera de alcance.
- Evidencia final verde: `go test ./internal/strategy/... ./internal/app
  -count=1`, 382 archivos/2913 tests frontend, typecheck, build y
  `visual:orbit-strategy`. La captura nueva del panel justifica el vacío seco
  manual y la futura captura LMU deshabilitada, sin forecast simulado. Sin PR,
  integración, promoción ni release.

Actualización ISA-771 / F5-b2 (2026-08-22, lista para review):

- Los escalares del input F4 llevan valor, procedencia, confianza y rol. Un
  override de usuario gana a la familia derivada; sin override, la derivada
  válida gana al fallback manual/reference. El resultado expone la fuente
  efectiva y los tests cubren Fuel, vida, degradación, pit y ahorro.
- Orbit llama a `SolveV2` y mantiene el ViewModel existente. El golden de 139
  vueltas usa cinco stints `11+32+32+32+32`, cuatro paradas y 14.712 s.
- El gate numérico compara ambos repartos con `ReplayDecisionV2`: sus totales
  difieren solo 12,733 ps y empatan bajo tolerancia relativa `1e-12`. Ranking y
  dominancia usan el mismo orden: menos paradas, vueltas de parada, cantidades
  Fuel/VE e identidad JSON del plan. El golden sigue `11+32+32+32+32` porque,
  a cuatro paradas, la primera vuelta canónica es 11 frente a 28; Go y testdata
  frontend siguen idénticos. El test invierte tanto el ruido de acumulación
  como el orden de inserción y conserva ganador. Con peso real configurado, el
  contrafactual anterior conserva 484 s a favor del elegido.
- Se retiró el evento Wails productivo del solver v1. El código v1 queda para
  tests/paridad histórica, sin consumidores productivos externos.
- Gates locales verdes: solver x100, Strategy+app, frontend (381 archivos /
  2.907 tests), typecheck, build, visual Orbit y compilación de `cmd/vantare`.
- Sin PR, integración, promoción o release; falta review.

Actualización ISA-774 / F6-e (2026-08-22, lista para review):

- El runner PowerShell deja por fecha resumen, informe allowlisted, plantilla
  cerrada y log; después de la decisión de Isaac valida la selección y llama al
  builder sin firma. El dry-run sintético cubre el mismo camino local sin red.
- El LLM solo recibe Markdown de producción con `k>=3`, métricas agregadas y el
  ranking ya calculado. No recibe bundles, JSON técnico, digests, identidades,
  texto de terceros ni herramientas.
- Isaac marca perfiles y rangos visibles. La validación liga la decisión al
  digest exacto del resumen, resuelve los digests técnicos y produce el
  contrato `vantare.catalog.selection.v1` consumido por F6-f.
- Prompt y runbook conservan pendientes los gates del Worker, firma offline y
  primera publicación. Sin PR, integración, promoción ni release; falta review
  de #774.

Actualización ISA-766 / F6-a (2026-08-22, lista para review):

- El exportador construye `CurationBundle v1` desde
  `StrategyInputProjectionV2` y `ObservedStrategyV1`: allowlist cerrada,
  semana ISO, sin sesión, hora exacta, texto libre ni telemetría cruda. El
  sobre administrativo viaja separado del payload analítico.
- El consentimiento guarda versión y timestamp; el primer opt-in genera
  `uploadSecret` y `deleteSecret` distintos en el almacén protegido de Windows.
  La cola JSON atómica sobrevive al reinicio sin contener esos secretos.
- Pausar cancela el envío/reintento que aún no fue aceptado y deja esos items
  pausados; un recibo ya aceptado queda enviado en el historial. Reanudar no
  implica consentir de nuevo. Revocar y pedir borrado remoto son independientes.
- Ajustes > Privacidad muestra el bundle exacto, cola e historial y explica
  explícitamente que los datos son seudónimos, no anónimos. Cliente y pruebas
  hablan el protocolo F6-b solo contra `httptest`; la URL de producción y el
  token de admisión permanecen vacíos, así que no hay envío real por defecto.
- Gates de Strategy/app/cmd y frontend (2.904 tests, typecheck, build e i18n)
  verdes. El barrido Go global tuvo un único timeout no reproducible en SQLite;
  todos los paquetes tocados pasan. Sin PR, integración, promoción ni release;
  falta review de #766.

Actualización ISA-765 / F5-b (2026-08-22, bloqueada antes de review):

- La query de aplicación pide a Analysis una `StrategyInputProjection v2`
  sobre el conjunto exacto de sesiones incluidas por F5-a. Strategy consume el
  puerto público y no toma ownership de modelos históricos ni de DuckDB.
- `StrategyDocumentV2` conserva proyección y overrides juntos. Revertir borra
  solo el override y deja intacto el derivado.
- Orbit presenta nueve datos numéricos con chips Derivado/Manual/Referencia/
  Falta. El tooltip derivado incluye N y rango; Falta explica el motivo. El
  modo sin combinación sigue siendo manual puro y los cuatro idiomas están
  completos.
- Gates de lo implementado verdes: Go focal de Analysis/Strategy, suite frontend completa,
  typecheck, build y `visual:orbit-strategy`. La captura de procedencias queda
  en la evidencia de Orbit.
- Bloqueo de aceptación: Orbit sigue usando `solver.Solve` v1. En F4,
  `SolverInputV2` acepta la proyección con sus tres ejes, pero ritmo base,
  capacidades, pit, vida, Fuel/VE y degradación manuales son escalares sin
  procedencia, y una proyección válida gana al fallback. No existe una forma
  contractual de transportar un override por campo tal cual. Resolverlo exige
  ampliar F4 (y sus fuentes de resultado) o mutar/fabricar una proyección; no
  se hizo ninguna de las dos sin nueva decisión. #765 continúa in-progress,
  sin PR, integración, promoción ni release.

Actualización ISA-758 / F5-a (2026-08-22, lista para review):

- Analysis publica combinaciones y sesiones desde modelos históricos ya
  autorizados usando la clasificación/agrupación existente; Strategy solo
  adapta esa salida y nunca abre DuckDB. Sin fuente autorizada responde con un
  vacío honesto hasta que F5-e conecte la importación inicial.
- Orbit pregunta opcionalmente la combinación al crear o abrir un evento. Se
  puede saltar para seguir en manual puro; el panel Sesiones muestra el motivo
  de inclusión/exclusión y permite cambiarlo sin borrar datos.
- Combinación y toggles se persisten en el documento canónico v2 mediante una
  migración aditiva compatible. Binding, cliente estricto, cuatro idiomas y
  estados vacíos están cubiertos por pruebas, build y captura visual.
- Gates verdes: `go test ./internal/... ./cmd/vantare`, 2.898 pruebas frontend,
  typecheck, build y `visual:orbit-strategy`. Sin banner F5-e, dependencia,
  PR, integración, promoción ni release; falta review de #758.

Actualización ISA-757 / F6-c (2026-08-21, lista para review):

- El nuevo `cmd/vantare-curator` convierte los tres árboles de procedencia en
  un resumen compacto sin mezclar entornos. Valida fail-closed, registra cada
  rechazo con código estable y deduplica por digest del payload normalizado.
- Cada combinación agrega Fuel, Virtual Energy, pits y calidad; pace queda
  explícitamente ausente porque `CurationBundle v1` no lo transporta. Los
  clusters admiten paradas a ±1 vuelta con igual forma/compuestos.
- La cohorte cuenta credenciales administrativas estables distintas y exige
  `k=3`; combinación, perfil y estrategia bajo k quedan no publicables con
  motivo. Ningún hash o identificador administrativo sale en el resumen.
- El score usa `backtest.RunRace`, publica versión/hash F4-9 y declara la
  normalización necesaria por falta de ritmo. El golden end-to-end fija los
  bytes y cubre dedupe, clustering, separación y k.
- El gate de #757 sobre CLI+`internal`, vet focal, gofmt y diff-check pasa.
  Sin frontend, dependencia, Worker, PR, merge, promoción ni release; falta
  review del orquestador.

Actualización ISA-755 / F4-9 (2026-08-21, lista para review):

- El paquete nuevo `internal/strategy/backtest` separa los tres gates del spec:
  calibración de la estrategia corrida, factibilidad de la recomendada contra
  datos realizados y ranking por signo más regret interno cero.
- El solver expone replay determinista de una decisión fija y el contrato
  `ObservedStrategy v1` conserva tiempo observado por stint. El backtest no
  usa la carrera observada como verdad de un contrafactual.
- El holdout se corta por combinación+fecha, falla ante leakage o N bajo y
  devuelve resultados por carrera/agregados con intervalos. `<2 %` y paradas
  secas exactas siguen marcados provisionales hasta #702.
- Fixtures versionadas S026/S125/S266/S287 y el flujo
  derivadas→plan→replay→métricas pasan junto con Strategy+Analysis, vet, gofmt
  y diff-check. Sin frontend, dependencias, PR, merge, promoción ni release.
  F4 queda técnicamente completa en esta rama; falta review/aceptación.

Actualizacion ISA-753 / F4-8 (2026-08-21, lista para review):

- Cada candidato de `SolveV2` conserva esperado, caso malo coherente,
  factibilidad y riesgos duros Fuel/VE/neumatico. La poda considera tambien el
  estado pesimista para no perder una alternativa con margen.
- Rapida, equilibrada y conservadora salen de la misma busqueda y ranking; la
  rapida no limita el caso malo y las otras toleran como maximo 5/2 %. La rapida puede avisar de riesgo duro; las
  otras dos lo excluyen. Rangos estrechos convergen en el mismo plan.
- El presupuesto p95 ya es efectivo: limita niveles de servicio y degrada el
  paso por potencias de dos de forma determinista, visible y repetible. El
  resultado consolida consumo y rain chance con las sensibilidades previas.
- Casos de negocio Fuel y vida de neumatico verdes. Gates solver x100,
  Strategy+app, golden Orbit, vet, gofmt y diff-check pasan. El gate Go global
  solo falla setup de `frontend`/`cmd/vantare` por `frontend/dist` ausente; el
  resto pasa. Sin frontend, dependencias, PR, merge, promocion ni release.
  Siguiente: push y review del orquestador de #753.

Actualización ISA-752 / F4-7 (2026-08-21, lista para review):

- Los cinco nodos de `WeatherScenario v1` se convierten en timeline por vuelta
  mediante interpolación lineal. Los umbrales default 20/60 separan
  seco/húmedo/mojado y la salida expone sensibilidad wet a -5/+5 puntos.
- Cada vuelta selecciona `delta_clima`, consumo por bucket de Analysis o
  fallback manual/reference y parámetros/curva de compuesto. Los cruces dentro
  de un stint cambian de condición sin fabricar una frontera de stint.
- Compuestos dry/wet usan el inventario físico F4-5. Las reglas opcionales por
  bucket fuerzan una parada antes de una condición incompatible y conservan
  ventanas, servicio, edad e identidades.
- Se entrega óptimo por escenario y recomendación `minimax_regret`; la pérdida
  esperada ponderada desempata y ambas métricas se publican con replay por
  escenario. NODE_50 monta wets justo antes de la primera vuelta mojada y la
  robusta supera al plan seco cuando la lluvia se adelanta.
- Oráculo exhaustivo por escenario, caso seco degenerado, fail-closed y gates
  solver x100, Strategy+app, vet, gofmt y diff-check verdes. Sin frontend,
  dependencia, PR, merge, promoción ni release. Siguiente gate: review del
  orquestador de #752.

Actualización ISA-751 / F4-6 (2026-08-21, lista para review):

- `SolveV2` elige piloto por stint. Cada piloto usa `PilotProfile v1` o cifras
  manual/reference con procedencia; su ritmo y consumo participan en la
  autonomía, servicio, peso Fuel y tiempo total común de F4-1..5.
- Disponibilidad por vueltas y máximos de conducción continuo/total son duros
  y explicados. El continuo no se reinicia si el mismo piloto sigue tras el
  pit; sí al relevarlo. Min/max de vueltas también quedan ejecutados.
- El caso canónico usa al rápido en stints 3/3 alrededor de una ventana de 2
  vueltas del lento y prueba el coste frente al óptimo de ritmo puro. El
  oráculo amplía el espacio sin poda, conserva paridad y demuestra poda
  efectiva; la salida preserva procedencia y sensibilidad de ritmo por piloto.
- Gates verdes: solver x100, Strategy+app, golden Orbit, vet focal, gofmt y
  diff-check. Sin frontend, dependencia, PR, merge, promoción ni release.
  Siguiente gate: review del orquestador de #751.

Actualización ISA-750 / F4-5 (2026-08-21, lista para review):

- `SolveV2` elige compuesto y juego físico por stint contra el inventario
  canónico de `internal/strategy/tyres`. Los parámetros de curva/delta son
  exclusivamente manual/reference con procedencia mientras D19 no tenga
  mapping semántico real.
- Cambiar o conservar neumáticos forma parte del candidato: conservar mantiene
  identidades y edad y no paga servicio; cambiar exige otro juego compatible y
  usa el coste paralelo/secuencial de F4-1. Remontar un juego usado no restaura
  su vida.
- Ventanas obligatorias, min/max de paradas y compuestos requeridos son
  restricciones duras explicadas. El caso canónico demuestra cuándo gana el
  doble stint duro y cuándo compensa pagar blandos.
- El oráculo exhaustivo incorpora compuestos, juegos y ventanas en tamaños
  pequeños. La poda conserva estado físico/reglas, publica `prunedStates` y la
  sensibilidad expone el impacto de +0,20 s/vuelta por compuesto elegido.
- Gates verdes: solver+tyres x100, Strategy+app, golden Orbit, vet focal,
  gofmt y diff-check. El gate Go global pasa todos los paquetes compilables y
  solo falla el setup de `frontend`/`cmd/vantare` por `frontend/dist` ausente;
  tampoco hay `frontend/node_modules` para regenerarlo. Sin frontend,
  dependencias, PR, merge, promoción ni release. Pendiente: commit documental,
  push y review del orquestador de #750.

Actualización ISA-749 / F4-4 (2026-08-21, lista para review):

- `SolveV2` incorpora el nivel de ahorro Fuel/VE como decisión de cada stint;
  el consumo efectivo cambia autonomía, servicios y peso, y el coste de ritmo
  queda separado en la evaluación.
- Acepta una sola fuente manual/reference o la familia A/B válida de Analysis,
  conserva procedencia/confianza y publica un plan explícito por stint con
  totales y sensibilidad del 20 %.
- D6 prueba ambos lados de la decisión: ahorro barato elimina la parada corta
  y ahorro caro la conserva. El oráculo exhaustivo comparte la dimensión sin
  poda y cubre Fuel, VE, dos niveles y peso activo en carreras pequeñas.
- Gates verdes: solver x100, Strategy+app, Telemetry Analysis, golden Orbit,
  vet focal, gofmt y diff-check. El gate global pasa todo lo compilable y solo
  falla el setup de `frontend`/`cmd/vantare` por `frontend/dist` ausente; no hay
  `frontend/node_modules` para regenerarlo. Sin frontend, dependencias, PR,
  merge, promoción ni release. Pendiente: push y review del orquestador de
  #749.

Actualización ISA-747 / F4-3 (2026-08-21, lista para review):

- `SolveV2` suma por vuelta `litros al inicio * segundos/L` al ritmo base y a
  la curva de stint. El nivel parte de la capacidad, resta consumo tras cada
  vuelta y añade solo los repostajes elegidos por el candidato.
- El coeficiente acepta `manual` o `reference` con presencia, procedencia y
  confianza. Solo acepta `derived` desde la curva que Analysis materializa
  tras `identifiability=separable`; dos autoridades fallan cerradas. El
  resultado conserva la fuente, la declara en asunciones y expone coste y
  sensibilidad del 20 %.
- La poda exige el mismo fuel cuando el peso está activo y el oráculo exhaustivo
  usa el mismo término. El test de negocio cambia el óptimo de una parada
  llenando a dos repostajes splash.
- Gates verdes: solver x100, Strategy+app, Telemetry Analysis, golden Orbit,
  vet focal, gofmt y diff-check. Golden Orbit invariante; no se tocó frontend.
  Sin dependencia, PR, merge, promoción ni release. Pendiente: review del
  orquestador de #747.

Actualización ISA-746 / F4-2 (2026-08-21, lista para review):

- `SolveV2` usa la curva combinada `valid/combined_only` producida por Analysis
  como coste por edad de vuelta y conserva procedencia/confianza en el
  resultado. La pendiente manual sigue siendo el caso lineal y queda marcada
  como `manual`.
- Interpola linealmente entre puntos y extrapola el tail con la mayor pendiente
  entre el último tramo no negativo y rango/sqrt(N). La sensibilidad del 20 %
  perturba todos los puntos y el rango; el oráculo exhaustivo evalúa el mismo
  modelo por tramos.
- El caso canónico de cliff tardío cambia el óptimo desde cero paradas con la
  aproximación lineal a una parada en vuelta 4. Los costes acumulados mantienen
  O(1) por stint.
- Gates verdes: solver x100, Strategy+app, golden Orbit, vet focal, gofmt y
  diff-check. La suite Go global pasa todo lo compilable y solo falla el setup
  de `frontend`/`cmd/vantare` por `frontend/dist` ausente; tampoco existe
  `frontend/node_modules` para regenerarlo en este worktree. Sin frontend,
  dependencia, PR, merge, promoción ni release. Siguiente: push y review del
  orquestador de #746.

Actualización ISA-745 / F4-1 (2026-08-21, lista para review):

- `SolveV2` deja ejecutable el primer corte del vector F1.3: posiciones de pit
  arbitrarias y cantidades Fuel/VE discretizadas, con coste por tránsito,
  repostaje, recarga VE y neumáticos en modo paralelo/secuencial delegado al
  modelo `manual` existente.
- La poda por dominancia conserva el óptimo y se compara con enumeración total
  del mismo espacio pequeño. Hay ranking estable, desglose por parada, binding,
  min/max de paradas y candidatos inviables explicados. La discretización y
  los dos fallos corregidos del contrato compile-only están documentados en
  `f1-3-contrato-solver.md`.
- Gates locales: solver+manual x100, Strategy+app, golden Orbit, vet focal,
  gofmt y diff-check verdes. El golden permanece en 139 vueltas,
  28/28/28/28/27, cuatro paradas y 14.712 s; Orbit aún consume el solver v1
  escalar porque no dispone de inputs de servicios y no se inventaron.
- Commits de producto/prueba: `429649da`, `26a1db11`, `fa37dbe8` y
  `632903e0`. Sin cambio
  frontend, dependencia, PR, merge, promoción ni release. Siguiente: review
  del orquestador de #745; después F4-2, no antes.

Actualización ISA-735 / F2(e) (2026-08-21, lista para review):

- Orbit guarda el plan visible como revisión inmutable del lifecycle canónico
  y enseña su identidad; activación y exportación usan exactamente esa
  referencia. El `ActivePlan` mostrado procede del backend, mientras que
  seleccionar una tarjeta se etiqueta honestamente como selección local.
- Los fallos de guardado, activación y apertura muestran mensaje, código y
  campo tipados. Las respuestas obsoletas se descartan. Exportar una revisión
  concreta atraviesa application/packaging y su import/re-export es idéntico.
- El mock Wails persiste draft, revisiones y activación; una recreación del
  cliente/runtime demuestra que sobreviven a la recarga. Las caracterizaciones
  de los tres flujos silenciosos se invirtieron con pruebas de comportamiento.
- Gates: Go Strategy+app, frontend 377/2.896, typecheck, build, ESLint focal,
  diff-check y visual Orbit verdes. Se actualizaron 12 capturas porque la
  cabecera y las tarjetas muestran los nuevos verbos; no cambió CSS ni se
  añadieron dependencias.
- Commits `946c341e`, `b8f577c7`, `706039d7` y `de2f04fb`. Sin PR, merge,
  promoción o release. Siguiente acción: review del orquestador de #735;
  después F2(f).

Actualización ISA-734 / F2(d) (2026-08-21, lista para review):

- Orbit ya no calcula planes en TypeScript: la página pide todas las variantes
  a `strategy:application:calculate_orbit`, que compone el cálculo manual y el
  solver Go existentes. El frontend se limita a validar el wire y formar los
  ViewModels de presentación.
- El ciclo asíncrono muestra carga, oculta cifras antiguas, descarta respuestas
  obsoletas y expone el error tipado con código/campo y reintento. Referencias a
  pilotos inexistentes fallan como `calculation_invalid`, sin fallback.
- El golden compartido entre Go y el test de página demuestra 139 vueltas,
  cinco stints 28/28/28/28/27 y 4:05:12 desde el motor real. La caracterización
  de cálculo/piloto colgante queda invertida; persistencia, activación y export
  siguen en F2(e), y la eliminación de datos sintéticos en F2(f).
- Gates: Go Strategy+app, frontend 375/2.888, typecheck, build, diff-check y
  visual Orbit verdes. El harness visual espera el recálculo asíncrono; no hay
  cambios CSS ni capturas nuevas. Sin dependencia, PR, merge o promoción.
- Commits de producto/prueba: `bddccd4c`, `0ae806eb`, `d90c7f13` y
  `32ab7b69`. Siguiente acción: review del orquestador de #734; después F2(e).

Actualización ISA-732 / F2(c) (2026-08-21, lista para review):

- El motor Go importa las dos claves localStorage mediante un journal durable
  de dos commits: backup raw antes de parsear y publicación canónica después
  de confirmar el fingerprint. Los siete fixtures golden atraviesan el flujo
  completo; una property de 32 casos prueba `dos veces = una`, y el crash
  simulado entre commits se recupera sin duplicar.
- Las 28 filas de la matriz tienen política explícita y comprobada. Corruptos,
  colisiones, shapes parciales y referencias colgantes se conservan en
  cuarentena; defaults sintéticos llevan `legacy_synthetic_default` y nunca se
  materializa `startAt=now`. Documento detallado:
  `docs/strategy-planner/isa-732-migracion-localstorage.md`.
- Rollback restaura el snapshot canónico anterior y archiva el documento
  posterior. No toca el lifecycle v1. Orbit aporta diálogo accesible de
  preview/confirmación/resultado/rollback; tras éxito el store legacy queda
  read-only, pero la página sigue leyéndolo hasta F2(d).
- Gates: Go Strategy+app, frontend 375/2.899, typecheck, build y diff-check
  verdes. Sin dependencia nueva. El smoke visual browser no es evidencia
  Wails: la app completa fuera de Wails activó un error runtime preexistente y
  T3 Preview no devolvió snapshot. El localStorage real de Isaac se reserva al
  gate F2.
- Sin PR, merge, promoción ni release. Siguiente acción: review del
  orquestador de #732; después continúa F2(d), no antes.

Actualización ISA-730 / F2(b) (2026-08-21, lista para review):

- `internal/app.StrategyApplicationBridge` posee el binding Wails
  `strategy:application:*`; el composition root solo lo registra. La capa
  prueba encode/decode, correlación, sanitización y propagación de errores
  tipados, incluidos `event_*`, `driver_*` y `variant_*`.
- `strategy-orbit-bridge` es la fachada de Orbit sobre el cliente TS fino. La
  unión cubre las 23 operaciones de la API de aplicación existente y decodifica
  el documento v2 ampliado, listas, comparación, lifecycle y activaciones.
  Los errores llegan con código, campo y mensaje y las respuestas mal formadas
  se rechazan; no hay cálculo ni decisiones de dominio en TS.
- Cero cambios en `StrategyOrbitPage` y stores. Commits `31dd0709` y
  `9487fad8`. Go focal, vet, frontend 374/2.894, typecheck, build y ESLint focal
  verdes. Sin dependencia nueva.
- No hay smoke de aplicación Wails viva en F2(b): las pruebas demuestran las
  dos fronteras aisladas, no una sesión instalada. Siguiente acción: review del
  orquestador de #730; después continúa F2(c), no el cutover de UI F2(d-f).

Actualización ISA-729 / F2(a) (2026-08-21, lista para review):

- El repositorio canónico evoluciona a `strategy.repository.v2` y custodia un
  único `StrategyDocumentV2` junto al lifecycle v1 existente. La migración
  valida el hash v1 antes de conservar drafts, revisiones, activaciones y plan
  activo; el documento soporta eventos, pilotos/orden/disponibilidad,
  variantes, inventario y `legacy_synthetic_default`. `RawLegacy` usa
  bytes/base64 para conservar el backup exacto sin compactarlo.
- La fachada de aplicación y el bridge JSON ofrecen `create/edit/list` de
  eventos, pilotos y variantes, `delete_driver` y `compare_variants`, con
  generación optimista, validación estricta y errores tipados visibles.
- Política de borrado: sanea availability/órdenes y renumera; si una variante
  quedaría vacía, `driver_in_use` aborta toda la transacción. Property test de
  64 casos y regresión de lifecycle ampliado verdes.
- Entrega en commits convencionales pequeños. Gates Strategy y vet focal
  completos PASS. Sin frontend, Wails, solver, telemetría, PR, integración,
  promoción ni release.
- El `go test -count=1 ./...` adicional no fue gate verde: faltaba el artefacto
  ignorado `frontend/dist` para `go:embed` y falló el test temporal ajeno de
  SQLite recording; los paquetes Strategy pasaron dentro de esa misma corrida
  y la repetición focal aislada del test SQLite pasó.
- Siguiente acción: review del orquestador de #729; F2(b) solo después de
  aceptar esta API exacta.

Actualización ISA-694 (2026-08-21, auditoría en curso):

- Briefing autocontenido:
  `docs/strategy-planner/isa-694-current-state-and-rework-brief.md`.
- Base auditada: `origin/nightly@2ab9741d`. La rama es
  `vantareapp/isa-694-auditoria-rework-strategy-planner` y no modifica código
  de producto.
- El cálculo manual Go de Fuel y Virtual Energy y el solver determinista pasan
  100 repeticiones. El desgaste manual agrega valores introducidos; no es un
  modelo predictivo histórico.
- Telemetry Analysis puede descubrir, autorizar, copiar y leer DuckDB de forma
  normalizada, pero aún no produce `StrategyInputProjection v1`. ISA-159,
  ISA-145 e ISA-146 siguen en backlog; por tanto DuckDB no alimenta Strategy.
- Command Orbit conserva valor visual, pero usa persistencia y cálculo
  TypeScript paralelos. Activar, guardar y exportar no representan todavía el
  lifecycle canónico completo.
- El motor live existe, pero Nightly no resuelve aún la revisión activa a
  objetivos ejecutables. PR #280 permanece draft y requiere portado sobre la
  base actual.
- Veredicto: bloquear promoción a `testers`; planificar un cutover incremental
  que conserve Orbit y recupere una sola autoridad. No implementar hasta que
  Isaac apruebe el nivel objetivo manual, histórico y live.

Actualización ISA-309 / STR-N02 (2026-08-10):

- La pila acumulativa de Strategy posterior a STR-09 se reconstruyó sobre
  `origin/nightly@08fcfc1` en la rama oficial de ISA-309, sin los seis commits
  ajenos que contaminaban la rama histórica.
- Los 11 commits de producto incluyen saneamiento presentacional, dominio Go
  unificado de neumáticos, solver determinista, variantes, wiring del
  workspace, listado real de planes, paquetes import/export, plan activo
  auditable, reglas de evento versionadas y la regresión de loading/retry.
- Go Strategy, typecheck real, suite frontend completa, build y ESLint focal
  están verdes. `-race` sigue sin verificarse en este entorno Windows sin CGO;
  los bridges continúan sin prueba manual contra una aplicación Wails viva.
- PR draft #192 está abierto hacia `nightly`, mergeable y con todos los gates
  verdes tras un rerun único de un presupuesto temporal heredado de Telemetry
  Core. Strategy no fue la causa del primer fallo.
- Siguiente acción exacta: revisión de Isaac del PR #192. Solo su autorización
  posterior permite promoverlo a `nightly`; STR-15B (ISA-162) no comienza
  hasta que esa base esté realmente integrada.

Actualización ISA-152 / STR-17 (2026-08-14):

- ISA-161 fue aceptada por Isaac e integrada mediante squash del PR #212 en
  `nightly@b2e4067809d31152fdcf374875179e577d483c03`. El gate post-promoción
  31708164123 pasó completo. Linear refleja ISA-161 en `Nightly`.
- ISA-152 se implementó sobre una rama/worktree aislados desde ese squash. Los
  commits fueron `98104b0` (plan), `3f48045` (motor/read model),
  `091f8ba` (adaptador al Hub) y `bf9e9e5` (evidencia LMU). Reviews
  independientes de spec y calidad aprobaron los tres cortes sin findings
  abiertos.
- El motor efímero mantiene cursor, lifecycle, stint, Fuel, desviación solo
  contra objetivos exactos y próxima acción planificada. Duplicados,
  out-of-order, gaps, epochs, reconnect coalescido y backpressure están
  cubiertos. Missing, stale, invalid y unsupported permanecen explícitos.
- El adaptador consume una única suscripción del `StrategyHub()` existente,
  tolera la evolución aditiva de Strategy v1 y no crea goroutines, readers,
  endpoints ni almacenamiento. No está conectado al arranque: `ActivePlan`
  conserva una referencia de revisión, no los stints/objetivos normalizados, y
  STR-17 no autoriza inventar esa fuente.
- `TestStrategyLiveLMUOptIn` pasó con el pipeline productivo completo y un solo
  reader: source live, cursor `1/3`, vuelta completada `0` fresh, Fuel
  `98/115 L` fresh y desviación missing sin objetivo. El log es sanitizado; no
  contiene raw, track, fingerprint, IDs reales ni PII.
- Gates locales: focales x20, vet focal, frontend build, `go test ./...` y
  frontend `367/2636` pasan. `-race` no se ejecutó por CGO desactivado y falta
  de GCC. El HEAD de rama `c5f965f` pasó CI completo en 31720701167. Isaac
  autorizó la integración y el PR
  [#219](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/219)
  se integró por squash en
  `nightly@8de4f511972757476d96d6a525b69c8917f4ca56`; el gate post-promoción
  [31748815965](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31748815965)
  pasó completo. Linear refleja `Nightly`. No hubo promoción a
  `testers`/`master` ni release.
- Microplan vigente:
  `docs/superpowers/plans/2026-08-13-isa-152-str-17-live-execution-engine.md`.
  Evidencia detallada:
  `docs/strategy-planner/evidence/isa-152-strategy-live-engine.md`.

Actualización condicionada ISA-161 / TC-10B (2026-08-12; estado histórico):

- Telemetry Core ha implementado en la rama local de ISA-161 el productor
  `StrategyLiveProjection v1` sobre el único pipeline LMU canónico. Incluye
  sesión, progreso, pit y Fuel con calidad explícita; VE, tyres, weather y
  facts permanecen ausentes.
- ISA-161 se construyó originalmente desde ISA-160 en `nightly@8880a88`; su
  primer rebase local fue sobre `origin/nightly@234794d` y su base/merge-base
  actuales son `origin/nightly@b6df494`. La rama está publicada y el PR draft
  [#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212)
  está OPEN/CLEAN/MERGEABLE hacia `nightly`. El
  [run 31639192366](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31639192366)
  pasó completo para `19dddea`, incluido GitGuardian. Cualquier amend posterior
  requiere checks de su nuevo HEAD; el estado final se consulta en el PR.
  Linear sigue pendiente por reautenticación.
- Esto no implementa el motor live Strategy ni desbloquea todavía ISA-152 /
  STR-17. La dependencia técnica solo será desbloqueable tras la promoción
  aceptada de ISA-161 a `nightly`; no hubo integración, promoción ni release
  de este corte.

STR-00 y STR-01 quedaron aceptados. STR-01 rescata Product A solo como oráculo
histórico aislado; no conecta sus contratos al producto. STR-02 introduce el
primer contrato productivo versionado. STR-03 implementa el repositorio local
canónico de drafts y revisiones. STR-04 añade la fachada de comandos y el store
frontend transitorio. STR-05 añade el motor manual puro de carrera, Fuel,
Virtual Energy y pit. STR-06 añade el inventario físico individual y sus reglas
de condición, estado y esquina persistente. STR-07 añade el shell visual y la
navegación real de la suite. STR-08 conecta el documento editable al repositorio
canónico, añade operaciones de stint y asignación física por DnD/teclado. La UI canónica usa
estrategias a la izquierda, stints al centro e inventario/entrada a la derecha.
STR-09 añade entrada rápida y tabla por vuelta con correcciones no destructivas,
Fuel/Virtual Energy separados, fuel-save determinista y pérdida de boxes por
cada parada real; las tarjetas consumen el resultado Go correlacionado.

Actualización ISA-134 / STR-00:

- Proyecto activo: `Strategy Planner — Race Strategy Suite`.
- Product A/B/C quedan como fases históricas de un único producto.
- Product A auditado: `codex/strategy-product-a@b9f1937`.
- Base aprobada: `ISA-117@170eaeb`.
- Divergencia: 371 commits de la base y 44 de Product A.
- Simulación: 94 paths = 87 auto-merged + 7 conflictos; 6.751 inserciones y 5
  eliminaciones.
- Veredicto: rescate selectivo; prohibido merge/cherry-pick por rango.
- Allowlist STR-01: un fixture exacto + 24 paths del dominio solo por port
  manual; los otros 69 paths están en denylist.
- Las 26 issues PB están `Canceled` como superseded, enlazadas al mapa y sin
  borrar historia. El backlog canónico son 24 cortes: ISA-136..157 más
  ISA-162/163.
- Productores: ISA-159 (Analysis histórico) e ISA-160/161 (Core live).
- STR-01: commit `f85fd31`, push y PR draft #60; sin promoción.
- STR-02: `ACCEPT`, commit `91c16c2`, push y PR draft #66 sobre `f85fd31`.
  Añade activación idempotente
  con historial exacto, decode execution estricto y corpus Go/TS de errores,
  máximo entero compartido `2^53-1`, regresión UTF-8 real y precedencia de
  versiones desconocidas equivalente en Go/TS. El encoder TS limita profundidad
  también al verificar valores ya construidos. La verificación productiva ya no
  materializa el hexadecimal del payload: calcula solo el digest; el hexadecimal
  diagnóstico usa un búfer acotado. La regresión de 1.000.000 de elementos
  canoniza `9.000.005` bytes y el benchmark reproducible está en
  `docs/strategy-planner/str-02-canonicalization-memory-benchmark.md`.
  Permanece sin merge ni promoción. Go focal x50, dos fuzzers, frontend
  completo 299/299 archivos y 2.034/2.034 tests,
  TypeScript, build, lint focal, vet focal y diff-check pasan. Go/vet global no
  se repitieron en la reanudación del 2 de agosto; su última evidencia conserva
  deuda Windows heredada fuera del diff.
- STR-03: implementación local sobre `ISA-137@91c16c2`. API
  `Snapshot`/`Commit(ChangeSet)`, generación optimista, lease cross-process,
  escritura atómica durable, backup/rollback, drafts recuperables, revisiones
  inmutables, límites y borrado sin tocar externos. La review queda corregida:
  solo corrupción/ausencia activa recovery; límites, I/O y versiones futuras
  no mutan el principal; drafts y revisiones atraviesan el gate `strategy.v1`;
  temporales huérfanos se limpian bajo lease sin seguir links/reparse points;
  y un fallo posterior al replace devuelve `ErrCommitUncertain` para reconciliar
  por generación. La segunda re-review queda corregida sin marker: el primer
  commit persiste su misma generación en el backup antes del principal, de modo
  que principal ausente nunca se confunde con gen0 después de inicializar. Los
  fallos antes/después del replace fijan la frontera ordinaria/incierta y un
  writer con versión 0 no puede consolidar pérdida. Migración v1 es no-op
  explícito porque no existe predecesor productivo. Evidencia:
  `docs/strategy-planner/str-03-repository.md`. Lista para review independiente,
  sin promoción. Focal x100, lease cross-process x50, Strategy, vet focal,
  race x10, compilación Linux,
  frontend build y suite Go global sin el único P3 Windows heredado pasan.
- STR-04: implementación sobre `ISA-138@8e151b8`. Protocolo
  `strategy.application.v1`, servicio/bridge estricto, commits idempotentes,
  rechazo optimista de versiones stale y store con dirty derivado, undo/redo
  acotado y observación live aislada. Cerrar el editor conserva plan activo y
  ejecución; duplicar puede capturar cambios locales sin modificar el origen.
  La corrección de review bloquea edit/undo/redo durante save/close, evita
  reemplazar dirty sin descarte, reintenta un save incierto con identidad
  exacta, endurece requeridos/semántica/límites JSON y añade cancel/dispose con
  limpieza ante respuestas tardías o fallos síncronos del transporte.
  Evidencia: `docs/strategy-planner/str-04-application-service.md`. Lista para
  segunda review independiente, sin wiring, merge ni promoción. Go focal x100,
  Strategy, Go global, vet focal, race x10, frontend 301/301 archivos y
  2.052/2.052 tests, 36/36 focales, TypeScript, build y lint focal pasan. Una primera corrida
  frontend bajo carga paralela mostró flakiness heredada del canvas; la corrida
  final aislada quedó completamente verde.
- STR-05: implementación sobre `ISA-139@f60f480`. El paquete puro
  `internal/strategy/manual` calcula carreras por vueltas/tiempo, recursos y
  pit sin wiring. Una carrera por tiempo completa la vuelta en curso mediante
  `ceil` estable y solo añade otra con regla explícita; pit loss sigue siendo
  input manual con procedencia y no crea un fixed-point oculto. Fuel/VE tienen
  resultados incompatibles, reservas explícitas, repostajes/recargas y
  fuel-save que cuenta el inicio real. Pit separa fijo/variable y cuantifica el
  solape Fuel/neumáticos; repair y penalty son opcionales y no se ocultan.
  Cada supuesto publica valor, unidad, procedencia y confianza. Evidencia:
  `docs/strategy-planner/str-05-manual-calculation.md`. Lista para review
  independiente, sin UI, solver, presets LMU, telemetría, persistencia, wiring,
  merge o promoción.
- Corrección STR-05 posterior a review: servicios Fuel/VE se asignan hasta
  cubrir la necesidad sin epsilon ni subasignación; un ruido positivo sobre un
  múltiplo crea conservadoramente otro servicio. Las fronteras de carrera se
  resuelven con aritmética decimal racional: `0.3/0.1` sigue exacto y una media
  vuelta cerca de `2^52` no se borra. Correcciones P1/P2 listas para re-review.
- STR-06: implementación sobre `ISA-140@2d0af85`. El paquete puro
  `internal/strategy/tyres` modela cada neumático físico con identidad,
  Soft/Medium/Hard/Wet, origen, condición con procedencia/confianza, estado,
  stints y esquina. Clasificación sin dato conserva 80–90 % y ausencia general
  40–70 %; ningún estimado se vuelve exacto. El primer uso liga la unidad a una
  esquina, mientras que un montaje aún no usado puede corregirse. La selección
  admite compuestos mixtos, excluye descartados y explica inventario
  insuficiente mediante error tipado. Evidencia:
  `docs/strategy-planner/str-06-tyre-inventory.md`. Lista para review
  independiente, sin UI, persistencia, telemetría, wiring, merge o promoción.
- STR-07: implementación sobre `ISA-141@52d2466`. Registra Strategy en el
  topbar y la access policy, añade galería, entrada, revisión, workspace,
  comparación y guardado honesto de sesión. El harness autocontenido recorre el
  flujo y captura wide/medium/compact con proporción `3/6/3`, overflow global
  cero, consola limpia y modal accesible con foco atrapado/restaurado. La suite
  serial base pasa `2059/2059`; la corrección final añade el cuarto stint para
  sumar 78 vueltas y métricas coherentes por estrategia, con focal `7/7`, build
  y lint focal PASS. Evidencia:
  `docs/strategy-planner/str-07-shell-visual.md`. Sin solver, live,
  persistencia, drag/drop, merge o promoción.
- STR-08: implementación sobre ISA-142 aceptada. Añade `strategy.editor.v1`,
  editor inmutable de stints, neumáticos individuales con esquina persistente,
  DnD y alternativa de teclado, undo/redo, guardado y recarga mediante STR-03/04.
  El bridge Wails sanitiza errores y conserva correlación; apertura lazy,
  reintento y StrictMode tienen regresión. Playwright recorre todas las acciones
  y recupera el documento tras reload con cero errores de navegador. Evidencia:
  `docs/strategy-planner/str-08-stint-editor.md`. Sin solver, telemetría, live,
  merge o promoción.
- STR-09: implementación sobre `ISA-144@53e8158`. Extiende el documento de
  STR-08 con `strategy.manual.v1`, promedios, correcciones dispersas por vuelta,
  unidades y rangos. El bridge Go calcula Fuel/VE, ahorro por vuelta/stint,
  ritmo, desgaste y boxes; cuatro stints equivalen a tres pérdidas por parada.
  La UI neutraliza resultados stale, restaura correcciones individualmente y
  no muestra impactos de ritmo inventados. Playwright valida edición,
  rechazo, guardado/recarga, responsive y navegador limpio. Evidencia:
  `docs/strategy-planner/str-09-manual-inputs.md`. Sin Analysis, solver, live,
  nueva persistencia, merge o promoción.

## Decisiones

- Modos manual, asistido y live.
- Fuentes históricas, recording, live, inputs y reglas.
- Neumáticos individuales con ID, compuesto, desgaste, condición, stints,
  posición, origen y estado.
- Un neumático usado queda ligado a FL/FR/RL/RR; se permiten combinaciones
  mixtas de Soft/Medium/Hard/Wet cuando las reglas del evento lo permitan.
- Clasificación puede dejar 80–90 %; sin datos se usa manual o rango 40–70 %.
- Fuel y Virtual Energy son recursos separados.
- Objetivo: menor tiempo total con incertidumbre; rápida, robusta y conservadora.
- Safety Car/FCY/lluvia/daños/penalizaciones forman parte del producto final.
- Galerías separan Vantare, Comunidad y Mis planes; privado por defecto.
- STR-03/ISA-138 posee en exclusiva repositorio, atomicidad, migraciones,
  drafts, revisiones y recovery. STR-15A/ISA-150 solo posee queries/UI de `Mis
  planes` y paquetes import/export a través de ese repositorio; no duplica
  persistencia.
- Correcciones no destructivas y tabla avanzada.
- Live explica cambio, impacto, propuesta y consecuencia.
- Engineer propone, piloto acepta, Strategy actualiza, Overlays leen.
- El LLM redacta voz/texto; no calcula la estrategia.
- Contrato inicial `strategy.v1`: draft mutable, revisión inmutable/hash,
  activación por referencia exacta, ejecución secuenciada y replan con
  aceptación explícita.
- Fuel y Virtual Energy son tipos incompatibles en Go y TypeScript.
- Go crea y firma lógicamente revisiones; TypeScript las valida contra un
  manifiesto y golden compartidos, sin segundo constructor divergente.
- `sha256:strategy-c14n-v1` fija un encoder binario común Go/TypeScript con
  orden de claves UTF-8, float64 big-endian, límites de recursos y corpus
  adversarial de bytes/hash. Hashes son minúsculos y timestamps son UTC
  RFC3339 canónicos con precisión máxima de milisegundos.
- Replans se decodifican estrictamente y se validan antes/después de aceptar o
  activar. Los estados de ejecución y propuestas aceptadas no conservan aliases
  mutables del input ni de snapshots anteriores.
- Repetir una propuesta ya aplicada devuelve el mismo snapshot activo sin una
  segunda activación, únicamente si candidata, base y revisión anterior
  concuerdan exactamente.
- `LapCount`, `epoch` y `sequence` comparten el máximo entero `2^53-1`; el
  decoder de execution rechaza shape anidado, duplicados, unknown fields,
  trailing data, timestamps y capabilities inválidos con el mismo
  `errorCode/errorField` en Go y TypeScript.
- La segunda corrección fija los 25 nombres del corpus execution, usa paths
  completos para revision/provenance/confidence y valida escalares antes del
  decode Go. Los límites canónicos viven también en el manifiesto compartido;
  strings ya no heredan por error el límite de elementos de un contenedor.
- Una versión explícita desconocida se rechaza antes de interpretar la shape v1;
  la ausencia del campo conserva `invalid_document`. El mismo corpus fija esa
  precedencia para revisión y replan en Go/TypeScript.
- El encoder TypeScript aplica límites de salida, elementos y profundidad por
  sí mismo; no depende de que el input haya atravesado antes el parser JSON.

## Riesgos

- **P1:** escenarios históricos no auditados usados como autoridad.
- **P1:** duplicar Core o el almacenamiento de Analysis.
- **P2:** Monte Carlo opaco o innecesario; determinista es la base.
- **P2:** preservar contratos débiles por evitar un refactor pre-lanzamiento.

## Evidencia e issues

- Auditoría: `docs/strategy-planner/str-00-audit.md`.
- Matriz: `docs/strategy-planner/rescue-matrix.md`.
- Mapa: `docs/strategy-planner/pb-to-str-map.md`.
- ADR: `docs/adr/0006-strategy-planner-unified-domain-and-ownership.md`.
- Plan: `docs/superpowers/plans/2026-08-01-strategy-planner-unified-master.md`.
- Ownership: `docs/strategy-planner/projection-ownership.md`.
- Product A exacto: Go focal/vet, 25 tests frontend y build pasan; el smoke
  Playwright histórico se bloquea y debe reemplazarse en STR-07.
- Caracterización STR-01:
  `docs/strategy-planner/str-01-product-a-characterization.md`.
- Paquete histórico: `internal/strategy/producta`; 25/25 paths de la allowlist,
  fixture exacto y 24 blobs Go iguales salvo el namespace.
- Guard de entrega: denylist 69/69, manifiesto versionado del delta y discovery
  de raíz compatible con `-trimpath`.
- Contrato STR-02: `docs/strategy-planner/str-02-contract.md`.
- Issue activa: ISA-144 / STR-09, implementación lista para review independiente
  sobre el commit aceptado de STR-08.

## Rework definitivo (ISA-694)

El producto entero se replanifica bajo ISA-694 mediante SDD. Documentos
canónicos del expediente, que prevalecen sobre las secciones históricas de
este handoff:

- Diagnóstico: `docs/strategy-planner/isa-694-current-state-and-rework-brief.md`.
- Spec (SPECIFY, aprobado por Isaac 2026-08-21):
  `docs/strategy-planner/isa-694-spec.md` — decisiones D1–D18, asunciones
  A1–A6, criterios de éxito del corte A+B.
- Plan técnico (PLAN, rev. 2 tras review adversarial Codex gpt-5.6-sol):
  `docs/strategy-planner/isa-694-plan.md` — fases F0–F7b.

Corte A+B (manual = caso degenerado de asistido; live queda para un corte C
posterior). Strategy permanece bloqueado para `testers` hasta el gate F7a.

## Siguiente acción exacta

Isaac revisa el plan maestro y el primer plan ejecutable de auditoría #1030.
La spec v1 ya está aprobada: no volver a pedir su aprobación. Tras aprobar el plan,
ejecutar solo la auditoría de código y corpus para fijar criterios de calidad y
evaluación; los cortes de implementación se concretan con esa evidencia. Live
continúa aplazado. La base de ejecución se fija según issue #1030, sin asumir
que la documentación local esté ya integrada en nightly.

## Última actualización

2026-09-08, ISA-1028: diseño del editor de telemetría registrada; entrega documental
aislada. Sin implementación, promoción ni release del nuevo alcance.

## ISA-1088 — conexión UI en curso (2026-09-09)

Base 7b0afab9, rama vantareapp/isa-1088-recorded-session-ui, worktree
C:/tmp/vantare-isa1088. Primer corte de dos TS/test: coordinación de apertura
explícita, preparación y proyección de revisión exacta. Retiene handle para
cálculo; ante error/cancelación libera el recurso, informa fallo de limpieza.
Ocho pruebas focales PASS; gates globales pendientes de completar la UI.
Siguiente corte: textos en los cuatro catálogos strategy-orbit; después panel,
su test y conexión en StrategyOrbitPage (máximo cinco paths por corte).
No cambios de arquitectura/dependencias ni promoción. Banco real pendiente.

ISA-1088 corte de textos: cuatro catálogos strategy-orbit incorporan estados,
apertura explícita, confirmación de reemplazo y cierre en ES/EN/PT/IT.
La conexión del panel y validación global siguen en curso.

ISA-1088 panel conectado al área Sesiones; mantiene sesiones abiertas entre
pestañas, prepara y aplica referencias exactas mediante comandos existentes.
Reemplazo explícito, cierre y errores visibles. 18 pruebas focales PASS
(coordinador/panel/wiring); typecheck previo PASS, build y gates pendientes.
Siguiente corte de banco: internal/app/strategy_recorded_real_integration_test.go,
activación explícita por variables ISA1088_REAL_SOURCE y ISA1088_RUNTIME_APP.
Usa servicio nativo y helper confiado con originales hash antes/después; autoría
licenciada controlada de test, no equivale a aceptación Wails/login real.

ISA-1088 verificación Wails (2026-09-09): build diagnóstica real abrió Hub.
El importador existente preparó solo Imola/Monza, sin abrir reserva de evaluación.
Evento nuevo selecciona Imola; solver alcanza 8 s (issue #1089). RED/GREEN
confirma que la pantalla de error ocultaba Sesiones; se mantiene el propietario
al nivel raíz entre carga/error/éxito. 20 pruebas focales PASS. La búsqueda
nativa encuentra además límite de composición 128 frente a carpeta >400;
produce mensaje incompatible. Debe corregirse en issue separada antes de
certificar recorrido UI completo. Runtime liberado para overlays #1072.

## T10h — capacidad de edición nativa

PrepareCorrections publica editableChannelIds, explícitamente vacío si no hay
señales preparadas con unidad válida. Se obtiene de páginas ya leídas, conserva
orden nativo y elimina duplicados; no amplía I/O ni infiere capacidad en React.
Contrato TS opcional por compatibilidad: ausencia no concede edición.
RED wire Go y validación TS reproducidos; GREEN 2 focales Go, 42 TS, tipos,
lint focal/build, global Go -p1 y vet del alcance PASS. Vet ampliado a todos
los subpaquetes de app falla en launcher/icon_windows.go:553 (unsafe.Pointer),
deuda heredada ya seguida en #950; archivo intacto. Logs C:/tmp/isa1096-t10h-*.
Review propia: autorización y lectura siguen en withCorrectionInput; la lista
no sustituye la validación de cada guardado. Siguiente transportar capacidad
a RecordedSession y bloquear edición sin permiso explícito, luego historial.
Sin Wails, banco DuckDB, nota visual, push/PR/CI remota o promoción nuevos.

## T10i — capacidad conservada por el propietario

RecordedSession conserva una copia de editableChannelIds. Respuestas antiguas
producen conjunto vacío; recordedSampleCorrection rechaza señales sin capacidad
explícita antes de construir el comando. RED/GREEN, 30 focales/tipos/lint PASS.
Cinco paths declarados. Siguiente T10j: aplicar el mismo límite en Datos y su
fixture UI; después historial. Build/global se agrupan tras ese montaje sin
atribuir aún aceptación general a este corte. No cambios nativos ni promoción.

## T10j — solo lectura visible

Datos conserva señales consultables sin capacidad de corrección y explica el
límite, con botón de muestra deshabilitado. RED/GREEN UI; se actualiza la fixture
del flujo para declarar capacidad explícita, conservando todos sus guards.
24 focales, tipos, lint/build PASS. Global frontend agrupado tras T10k.
Tres paths lógica/test más cuatro idiomas. Sigue historial visible declarado.
No cambios al original, Wails, precisión, nota visual ni promoción nuevos.

## T10k — historial visible de fuentes

Revisiones monta consulta exacta, navegación por padres/cabeza anunciada y retorno
a la referencia de carrera, snapshot con original/corregido/motivo, restauración
como nueva revisión y proyección/adopción explícitas. Configuración guardada se
distingue de resultado calculado; historial completo del plan sigue T14.
Formularios persisten entre pestañas. Cambiar fuente/revisión reinicia formularios
intactos; entradas pendientes bloquean esa navegación. Una razón ya entregada al
controlador no deja Datos bloqueado tras resolución ausente/conflicto.
Cinco paths lógica/test/CSS declarados, cuatro idiomas, roadmap/digest y capturas.
10 focales, tipos, lint/build y global 442 archivos/3478 tests PASS (394.60s).
Logs C:/tmp/isa1096-t10k-*. Capturas revisions-pass-01: navegador/fixture vacío,
no Wails ni telemetría real ni nota >9. Review propia: sin nuevo lector/store,
mutación del original o adopción silenciosa. Se mantiene recuperación entre
reinicios pendiente de T14. Subtítulo/todos los estados cargados van al gate T18.
Siguiente #1099 T11 usos por familia; issue creada y añadida a Project Vantare.
No push/PR/CI remota, merge, promoción o release.
## T11b — conjunto y vista efectiva

Conjunto canónico de hasta 256 decisiones, sin duplicados/solapes en una familia;
permite decisiones independientes de familias sobre una vuelta. La vista efectiva
vuelve a resolver número/inicio/fin tras reanálisis escalar y revalida integridad
antes de devolver el conjunto completo; no publica una parte ni reancla objetivos.
Copias separadas de vueltas, tiempos, etiquetas y usos. Repetir número de vuelta
no confunde el selector de esta operación. El digest temporal se valida una vez
por conjunto; no se rehace por cada solicitud. Incluso vacío exige base válida.
Focales (incluyendo RED/GREEN del conjunto vacío), vet Analysis y global Go -p1
PASS; frontend intacto, build base heredado de T11a. Tres paths lógica/test.
Siguiente T11c representación mixta/custodia compatible. Sin UI/derivados/custodia
familiar productivos aún. Sin Wails, precisión, push/PR/CI remota o promoción.

## T11c — representación mixta compatible

Snapshot con familias usa analysis.observation-snapshot.v2; scalar-only mantiene
wire/digest v1 (golden previo intacto). Se validan razón/base/target/preparado,
solapes y presupuesto conjunto. Decoder del mismo documento de custodia verifica
v1→v2→v1 sin reescribir IDs; command digest v2 incluye decisiones familiares.
Validación de representación almacenada no concede autoridad ni demuestra
cobertura: la aplicación vuelve a validar contra el modelo autorizado original.
Focales, global Go -p1 y vet app/Analysis/Strategy/cmd del alcance PASS.
Cinco paths declarados. Frontend intacto, sin build adicional ni banco físico.
Siguiente T11d: guardar/resolver mixtos bajo el lease existente, guard legacy
contra borrado de familias y revalidación de objetivos tras escalares antes de
persistir. Hasta ese corte no hay guardado mixto ni API/UI familiar habilitados.
Sin push/PR/CI remota, Wails, precisión, nota visual, merge o promoción.

## T11d — guardado y resolución mixtos

SaveObservations usa el mismo saveValidated/lease/backup. Paquete interno de
Analysis incluye muestras y validez original/efectiva; se comprueba la aplicación
completa a los objetivos efectivos antes de persistir. Una petición legacy que
omite familias no puede borrarlas; replay histórico exacto conserva prioridad.
ResolveObservationsCommand identifica todo el payload y comparte lease sin
escritura nueva (salvo recuperación existente). Conjunto explícitamente vacío
restaura sin borrar revisiones previas. Pruebas incluyen reinicio, motivo cambiado,
conjunto omitido, target cambiado, cancelación, lease y confirmación perdida en
backup/primary. Focales, global Go -p1 y vet de alcance PASS; dos paths lógica/test.
Todavía no API/UI familiar ni derivación mixta pública. Siguiente T11e1 vista y
derivación de snapshot mixto, T11e2 identidad temporal en consumidores y T11e3
inclusión explícita frente a exclusiones blandas. Sin cambiar umbrales físicos.
Sin Wails/precision/visual >9/push/PR/CI remota/merge/promoción.

## T11g1 — propuestas completas y selección exacta

Helpers conservan decisiones familiares al editar escalares, permiten reemplazar
una familia o volver a automático y consultan vueltas de la revisión fijada.
Identidad temporal exacta, capacidades nativas y cuota conjunta 256 verificadas.
21 tests focales, typecheck, lint y build PASS (warning heredado de chunks).
Último global frontend: T11f3 442/3489 PASS; no repetido en este corte.
Continúa T11g2: estado mixto del controlador y restauración explícita de familias
históricas (incluido []), antes de habilitar edición familiar visible.
Sin Wails, precisión, revisión visual independiente, push, PR ni promoción.

## T11g2 — controlador de revisiones mixtas

Conserva familias y escalares al cargar, guardar, descartar, resolver o restaurar.
Restaurar un ancestro escalar envía [] explícito; las páginas quedan fijadas a la
revisión consultada y se invalidan al guardar. Cabeza nueva no se adopta.
24 focales, typecheck, lint y build PASS. Sin nuevo global (último T11f3 3489).
Continúa T11g3 montaje de vueltas y familias en Datos, muestras como vista avanzada.
Sin Wails/precisión/visual independiente/push/PR/CI remota/merge/promoción.

## T11g3 — Datos por vueltas y familia

Montaje productivo: fuente/revisión exacta, límites de stint observados (sin
inventar inicio), páginas de 25 vueltas y cinco familias. Distingue regla automática,
revisión guardada y propuesta; motivo obligatorio, cobertura dura no anulable,
formulario pendiente bloquea cambio de fuente/vista. Muestras en vista avanzada.
Mantiene A4/Orbit y tokens actuales; cotejada referencia pass-03-advanced, todavía
sin certificar paridad mediante captura poblada ni revisión independiente.
23 focales finales, tipos/build y lint finales PASS. Primer focal falló al clicar
vista avanzada durante carga; test ahora espera la fuente lista. Lint detectó nombre
useLabel interpretado como hook y export utilitario incompatible con HMR; ambos
corregidos sin excepciones. Global conjunto pendiente tras integrar Revisiones.
Roadmap actualizado en cuatro idiomas y JSON regenerado con origin/nightly vigente
(a9b8dd36 por integración ajena Redline); su ventana de entregas se desplaza como
salida del generador. No rebase ni integración de nuestro stack.
Cinco paths de lógica/test/CSS; traducciones y docs. Sin Wails/precisión/visual>9,
push/PR/CI remota/merge/promoción. Continúa T11g4 historial familiar.

## T11g4 — historial familiar y gate frontend conjunto

Revisiones muestra también familias, intervalo de vuelta, valores declarados y
motivo. Una revisión sólo familiar deja de aparecer como original sin correcciones.
Aclara que el uso declarado no sustituye reglas ni disponibilidad de señales.
Regresión RED documentada; 29 focales GREEN. Global 443 archivos/3515 tests PASS
(222.73s), lint/build PASS; warnings heredados happy-dom y chunks. Sin Wails todavía.
Dos paths UI/test más traducciones. T11h prepara únicamente dos paths de test Go
para ampliar el banco real opt-in, pendiente compilar/ejecutar y con staging separado.
Sin push/PR/CI remota/merge/promoción; base local no cambia por integración ajena.

## T11h — persistencia familiar sobre carreras reales

Banco opt-in ampliado en dos paths de test. Imola PASS 13.19s: vuelta 3;
Monza PASS 15.42s: vuelta 63. Selección desde inspector nativo, guardado familiar,
Resolve/replay exactos, proyección fijada, guard legacy, restauración [] y reapertura
de la revisión mixta anterior verificados. Otras familias permanecen iguales.
SHA256 originales antes/después: Imola 35438326ecddd6ab660ed3aad70b076a73e3290236c0292f30657594c38c1eb0;
Monza 08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538.
Reader/runtime y archivos reales; authorizer de licencia controlado explícito.
No son pruebas de precisión física ni Wails/login. Sin archivos reservados.
Go global -p1 y vet de alcance PASS; frontend conjunto T11g4 443/3515 PASS.
Continúa contraste Wails diagnóstico aislado del recorrido actual, aprovechando
configuración heredada ya presente (sólo comprobada presencia, no leída/imprimida).
No .env, credenciales copiadas, LMU, otras instancias ni promoción/publicación.

## T11i — contraste nativo no disponible: ERROR_INVALID_STATE del controlador WebView2 en tres lanzamientos (causa sin determinar)

Cambio de ejecutor registrado: el usuario ordenó que el orquestador coordine y
Muse Spark 1.3 contributor ejecute vía MCP/opencode en xhigh; esta autorización
sustituye la prohibición anterior de delegación de código sólo para esta
relación. Sin subagentes ni cambio de modelo.

Build diagnóstica bin/vantare.exe de este worktree (sin tags production,
frontend con VITE_* heredadas en build, runtime duckdb-v1 confiado, datos
propios). Dos lanzamientos aislados muertos en el mismo punto: PID13816
(orquestador) y PID30236 (ejecutor, con -profile absoluto a
configs/example-racing.json, -http 127.0.0.1:39262 libre, CDP 9491 libre,
-live=false, LOCALAPPDATA y user-data-folder propios en bin/).

El backend arranca (hub, HTTP 39262 listening, telemetría detenida por
-live=false; 4 hotkeys en conflicto no fatal con la instancia ajena PID26412 de
#1072, preservada). WebView2 Environment se crea, pero
CreateCoreWebView2Controller falla con 8007139F ERROR_INVALID_STATE ("error
creating controller", stderr en C:/tmp/isa1099-t11i-std*.log) y el proceso
termina; CDP 9491 nunca escucha. Sin zombies msedgewebview2 propios; el primer
lanzamiento además chocó en 39261 contra la instancia ajena, ya aislado en el
segundo. Log completo en bin/data/logs/vantare.log (saneado: sin secretos).

Corrección de revisión: la hipótesis de la ventana oculta NO quedó corroborada.
El orquestador lanzó PID31800 visible, con mismos puertos/flags/directorios
aislados y entorno con VANTARE_*: falló en el mismo punto con idéntico 8007139F
(log C:/tmp/isa1099-t11i-visible-stderr.log). Demostrado: tres lanzamientos (dos
ocultos, uno visible) mueren en CreateCoreWebView2Controller con
ERROR_INVALID_STATE; backend (hub, HTTP) y Environment WebView2 correctos; CDP
nunca escucha. No demostrado: la causa. La instancia ajena visible no es control
equivalente (otro binario, perfil y configuración). Sin atribuir fallo al código
de producto ni a otra causa: cero paths de lógica/tests en este corte.
El recorrido con login/entitlement queda fuera de alcance.

Estado final T11i: recorrido Imola + capturas no ejecutados; el runtime
diagnóstico no abre ventana en este worktree hoy. Imola autorizado verificado
intacto antes del recorrido (97513472 bytes, SHA256
35438326ecddd6ab660ed3aad70b076a73e3290236c0292f30657594c38c1eb0). Sin
push/PR/CI remota/merge/promoción/release; LMU intacto; sin roadmap alterado
(no hay entrega que reflejar). Sigue T12 independiente del SDD.

## T12 — microplan de correcciones tipadas de clasificación (ISA-1104, solo docs)

Sesión ejecutora OpenCode ses_f76922768ffe0hHIty8SaEG2IE, provider
opencode-go, modelo muse-spark-1.3-contributor, variante xhigh. Autorización
reciente del usuario (orquestador coordina, Muse Spark ejecuta vía MCP/opencode;
sustituye la prohibición anterior de delegación solo para esta relación);
orquestador revisor. Estado de coordinación para continuidad, no configuración
global. Sin subdelegación.

Issue #1104 (hija de #1091 y #1033, continúa #1099; labels area:estrategia,
roadmap:required, state:in-progress; Project Vantare; token
milestones:strategy-recorded-editor). Rama
vantareapp/isa-1104-recorded-classification, raíz Git C:/tmp/vantare-isa1104,
módulo C:/tmp/vantare-isa1104/vantare-v2, base exacta
7f757135445439851180fc503da45f7eb9e557e7 (el primer checkout usó por error la
ruta .../vantare-v2 como raíz y ubicó el microplan en docs/ de raíz; corregido
con git worktree move a C:/tmp/vantare-isa1104 y reubicación del documento al
docs/ del módulo, sin sobrescribir nada). #1099 y checkout principal intactos.

Microplan en vantare-v2/docs/strategy-planner/sdd/classification-corrections-t12.md:
conjunto cerrado (SessionType enum, WeatherConditions etiqueta opaca, 4 campos
de CombinationIdentity con ID canónico lmu:sha256 del catálogo nativo vía
PrepareCorrections/SessionCatalog, nunca texto del cliente); precondición
original con puertas de HistoricalMetadata y bloqueo con causa, sin fallbacks;
motivo manual sin promocionar mediciones; cuota conjunta 256; snapshot v3 con
compatibilidad v1/v2 y guard legacy extendido; Save/Resolve idempotentes con
expectedRevision/commandId; cambio de combinación que deja obsoleto el plan sin
rebasear, adoptar ni recalcular silenciosamente; consumo en vista separada con
reloj/parser/permisos intactos; clima separado de señales físicas de
temperatura/humedad y de umbrales #1030. Microcortes T12a–T12e de máx. 5 paths
con paths concretos (rg --files), tests observables y gates. plan.md intacto
(sin cambio de rumbo/alcance; la entrega futura lo actualizará y regenerará el
JSON en su PR). Primer corte propuesto: T12a validación pura en
internal/telemetryanalysis/classification_corrections.go +
classification_corrections_test.go (2 paths). Sin implementación, dependencias,
push/PR/merge/promoción en este encargo.

## T12 J6-J8b — identidad canónica conectada hasta propuesta frontend

J6 aceptado en `5608902d`: Save nativo resuelve destinos de identidad mediante
el `SessionCatalog` autorizado y conserva lectura histórica aunque el destino
deje de estar disponible. J7 aceptado en `e315c9f8`: Analysis y Strategy reciben
la misma instancia del catálogo desde la composición nativa. J8a aceptado en
`59b9c870`: contrato TypeScript v4 y fixture producida por Go validan referencia
y target canónicos; el editor visible continúa limitado a los dos campos legacy.
Commits de documentación intermedios: `9e0fe508`, `293ba6f6`, `b8322b4f` y
`53d0e7c7`.

J8b aceptado en `1aaca264` sobre `53d0e7c7`, cuatro paths frontend,
`+232/-13`. El parser canónico y el mapa identidad-combinación de J8a quedan
reutilizables. Un helper puro sustituye como una unidad las cuatro correcciones
de identidad, conserva las dos legacy, toma originales RAW exclusivamente de
la metadata OPEN y solo exige metadata de los campos modificados. Volver a la
combinación original retira toda identidad sin borrar legacy. Motivo, base,
target, duplicados, cuota y puertas de calidad/privacidad se validan antes de
devolver el nuevo conjunto. No hay hash, autorización, persistencia ni cálculo
de dominio en React/TypeScript. Save y Resolve v4 conservan correlación exacta
por referencia y rechazan respuesta retirada, cambiada o incoherente sin retry.

Evidencia J8b: 4 archivos/199 tests focales PASS y repetición del orquestador
`EXIT=0`; suite frontend 445 archivos/3728 tests PASS; `typecheck`, lint,
auditoría i18n y build PASS. El build solo mantiene avisos heredados de tamaño
de chunks. Informe y logs locales nuevos en
`frontend/.tmp/isa1104-t12j8b-*`. Sin Go, app, GUI, Wails, LMU, datos reales,
push, PR, CI remota, merge o promoción.

Siguiente corte J8c pendiente de cerrar por el orquestador: selector visual de
combinación canónica y estado de propuesta, consumiendo `sessionCombinations`
y el helper J8b sin duplicar catálogo, lector ni aritmética. Debe preservar el
diseño A4/Orbit y mantener guardado y adopción explícitos.

## T12 J8c1 — identidad conectada al controlador

Aceptado en `3284cb24` tras el plan `596b95fd`, dos paths frontend,
`+195/-3`. `editIdentity` aplica el reemplazo atómico J8b dentro del propietario
de estado existente, con los mismos bloqueos, cuota conjunta, estado dirty y
retirada de proyección; conserva escalares, familias y legacy. Fallos dejan el
editor intacto y exponen la causa. Guardado, retry y Resolve congelan la misma
referencia canónica. La revisión root corrigió una simulación falsa: cuando la
identidad guardada cambia de combinación, la proyección nativa con el nuevo ID
se rechaza frente a la selección original (`recorded_revision_mismatch`); la
revisión durable se conserva y no se proyecta ni adopta silenciosamente.

Evidencia final: 2 archivos/69 tests focales PASS tras la corrección; typecheck
y lint PASS. Antes de la corrección exclusivamente de test, suite frontend
445/3735, i18n y build PASS; no se repitieron porque producción quedó idéntica.
Un `resource_exhausted` interrumpió la telemetría del ejecutor, pero el proceso
de suite dejó resumen final completo. Sin app/GUI/Wails/LMU, push, PR, CI remota,
merge o promoción. Sigue J8c2: selector visual desde el catálogo ya cargado.

## T12 J8c2 — selector canónico visible en Datos

Aceptado en `a6cb87f0` sobre el plan `477c208a`, cinco paths frontend,
`+392/-14`. La vista Clasificación muestra combinación original, destino v4
guardado y propuesta sólo si el subconjunto de identidad activo difiere del
guardado. El formulario restaura el original o selecciona exclusivamente una
entrada del `sessionCombinations` recibido por Workflow; un destino histórico
ya ausente queda legible y retirable, pero no seleccionable de nuevo. No hay
texto libre, hashes, normalización ni segundo catálogo en React. Aplicar hace
una única llamada atómica a `editIdentity`; fallo conserva el formulario y
éxito comparte los bloqueos y estado pendiente del editor existente.

La revisión root detectó y corrigió dos falsos positivos antes del commit: la
propuesta de identidad comparaba también los campos legacy, y varias fixtures
describían tuples imposibles para su referencia canónica. Quedó una regresión
explícita que demuestra que cambiar sólo SessionType no crea propuesta de
identidad. Focal final 3 archivos/89 tests PASS; suite frontend 445 archivos/
3752 tests PASS; typecheck, lint, auditor i18n y build web EXIT0. Logs e informe
en `frontend/.tmp/isa1104-t12j8c2-*`. Avisos heredados de hydration/AbortError,
telemetría simulada y chunks permanecen dentro de una suite verde.

Sin app, GUI, Wails, LMU, build de escritorio, push, PR, CI remota, merge o
promoción. Falta el contraste v4 de identidad contra más de una combinación
real autorizada y reflejar la entrega visible en roadmap; la paridad Wails
sigue separada por `ERROR_INVALID_STATE` ya reproducido, sin causa demostrada.

## T12 J9 — cierre real bidireccional de identidad v4

Aceptado en `fc57eb9a`, dos paths de test existentes, `+227/-21`. El banco opt-in
requiere fuente primaria, fuente destino y runtime confiado; sin cualquiera hace
SKIP honesto. Descubre e importa ambos DuckDB mediante las rutas de producto,
los autoriza en un único `SessionCatalog` compartido por Analysis y Strategy y
selecciona cada candidato por `DisplayName` exacto, nunca por orden o hash
externo. Conserva primero el banco v3, guarda después sólo las diferencias RAW
de identidad contra la segunda combinación autorizada como snapshot v4,
resuelve/reproduce el comando, proyecta el destino, reabre el historial exacto,
retira a v1 y alimenta con la cabeza restaurada el banco familiar existente.

Imola→Monza PASS 23.99s y Monza→Imola PASS 35.98s. En ambas direcciones se
conservan magnitudes físicas completas; cambia únicamente la referencia de
procedencia agregada asociada a la combinación. SHA-256 finales idénticos:
Imola `35438326ecddd6ab660ed3aad70b076a73e3290236c0292f30657594c38c1eb0` y
Monza `08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`.
Focal sin opt-in SKIP/PASS, focal de alcance, `go vet` y `go test -p 1 ./...`
EXIT0; gofmt/diff limpios. Logs `frontend/.tmp/isa1104-t12j9-*`.

Primer Imola→Monza FAIL: la aserción inicial consideró el cambio esperado de
`Provenance.SourceID` `aggregate:<origen>`→`aggregate:<destino>` como cambio
físico, aunque vueltas y valores eran idénticos. Se corrigió normalizando sólo
esa referencia canónica y manteniendo comparación completa del resto; el
reintento anterior es el PASS registrado. El `Tee-Object` del reintento
sobrescribió por error el log R1 al reutilizar el nombre; la salida cruda sigue
en el registro de herramienta y no se reconstruye ni se presenta como archivo.

T12 queda cerrado localmente en código, frontend web y banco real. Pendiente
separado: aceptación visual/nativa Wails T11i por `ERROR_INVALID_STATE`, edición
de límites y cálculo avanzado del SDD principal. Sin app/GUI/LMU en ejecución,
exportación, build de escritorio, fuente reservada, push, PR, CI remota, merge,
promoción ni release.
