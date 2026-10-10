# ADR 0101 · Widgets: una proyección, un estado, varios Looks

Aceptado por Isaac para #1531. Base: 5e1da3f6. Aplicación incremental: Standings, Relative, Delta, Fuel.

## Estado de la ronda 2

Los siete puntos de la revisión se implementan en commits separados. Standings
pasa ocho costes tras perfilar; Relative pasa ocho en la repetición autorizada
con cola libre. El cierre sigue bloqueado por Delta Eficiencia ACC p99: ingest
5,2 frente a máximo baseline 4,6 µs (+13,04%); frame 58,0 frente a 51,8
(+11,97%, límite +5%). Los otros seis costes Delta y todos sus p50 pasan.
Fuel y frío nuevo se detienen; las cifras anteriores son evidencia histórica.
El gate no cambia: mediana p50 ≤ 1,03 × máximo baseline y p99 ≤ 1,05 × máximo.
Tandas iniciales y su FAIL conservados en round2/performance; repetición y
perfil en round2/hot-path. No se repiten tandas para estabilizar ruido.

Standings ACC estable no reconstruye Plan/Presentation/Motion ni notifica.
Perfil antes/después de ronda 2: asignaciones Vantare ingest/preparación/paint
0/1/181, bytes 0/48/11192, idénticos en las 600 muestras de cada etapa.
Se elimina el recorrido de filas y tres mapas vacíos en wake_rows/pose cuando
no existen canales de movimiento; las animaciones activas conservan su camino.
El test retiene Paint anterior y exige identidad de Board, Plan y Motion tras
doce fotos/frames repetidos por Look. Ajuste 5ec8e28a; QA explícita 569fa5ef.
No se atribuye el p99 de ingest al ajuste de frame: apenas varía 15,1→15,2 µs;
el rango baseline del mismo fefe pasa de 4,9–13,5 a 9,8–24,2 µs. Dispersión
completa comunicada como DUDA; Standings PASS según el criterio vigente.
Paridad nueva Standings 57/57 RGBA=0; los 366 pares previos permanecen archivados.
Relative repite con cero Cargo, reserva de cuatro mutex durante toda la tanda
y comprobación entre procesos. PASS sin márgenes: Efi ACC ingest p99 6,0 dentro
de 2,8–9,0 µs. Sin causa de código ni cambio: perfil antes 0/1/262 y después
0/1/249 asignaciones ingest/preparación/paint; trabajo e invalidaciones cero.
El FAIL anterior se conserva; no se declara una causa de ruido demostrada.
Delta también mide con esa reserva. Perfil antes/después 0/1/42 asignaciones
y bytes 0/32/3024, iguales en todas las muestras; trabajo e invalidaciones cero.
Ingest estable retorna antes de Arc/Labels/Motion; pintor Eficiencia sin diff.
Motion común añade indirection/selección de interpolación, pero no hay evidencia
suficiente para atribuirle esos p99. Sin causa corregible demostrada, DUDA con
diff y cifras de cinco tandas; parada sin otra A/B ni cambio arbitrario de código.
Perfil, revisión y tandas en round2/hot-path/quiet; gate intacto.

## Decisión

Los Looks son parte central del producto. Eficiencia y Vantare conservan sus tokens,
geometría y animación. El módulo común posee un único Board y Motion por widget.
`domain/src/<widget>.rs` proyecta los hechos y su calidad una vez por ingest, sin Look.
No anida dos proyecciones ni duplica filas o historial de consumo por compatibilidad.
`ui/src/look.rs` define el enum, nombres persistidos y capacidades. `registry.rs`
conserva una entrada por widget; Desktop, Studio y Workshop consumen esa misma API.

Cada módulo UI tiene pintores Eficiencia/Vantare. Reciben Board y presentación;
no reciben Snapshot ni acceden a IPC, persistencia, permisos o posición de pantalla.
Solo existe el pintor activo en `Presentation::{Eficiencia { visual, motion },
Vantare { visual, motion }}`. Ambos brazos poseen el mismo tipo de Motion común,
con una política de interpolación por Look. Al cambiar Look se conserva el Arc
completo: historial por CarId, avisos, interpolaciones, fades, tira y sus relojes.
La geometría se recompone sobre el mismo Board sin reiniciar los tiempos ni
invocar project. No hay un segundo motor dormido ni enums visual/Motion emparejados.
Las copias efímeras de un Frame/cache de pintado no son otra fuente de datos.
Standings Eficiencia lee el Plan común del dominio, con filas Arc del Board y CarId:
ventana del jugador, truncado, bandas multiclase, posiciones y vueltas son contenido
común. El pintor no construye otra VM ni vuelve a ordenar las filas.

## Layouts guardados

Sigue el documento v1: `designSystem`, `style`, `accent`, `templateId`, columnas,
posición, tamaño, opacidad y marca conservan sus nombres. Look desconocido conserva
el fallback Vantare. La migración es en memoria, sin reescribir el archivo al abrirlo.
`contentVersion` distingue contenido normalizado del layout histórico: aplica una
vez el filtro que antes imponía Vantare; después el filtro es independiente del Look.
Guardar y recargar conserva el Look y ese contenido, también después de alternarlos.

## Cómo añadir un Look

1. Añadir variante y metadatos en `ui/src/look.rs` (incluido `ALL`).
2. Añadir un archivo de pintor por widget en `ui/src/<widget>/`; conectar el enum
   local de presentación y su política visual. Reutilizar Board y Motion comunes.
3. Añadir un test/caso de estilo con geometría, animación y captura de referencia.
   Las pruebas por `Look::ALL` exigen una proyección por ingest y cambio sin reset.

No añadir ramas sobre estilos concretos a Hub, Studio, registry ni domain. El test
arquitectónico recorre UI/Hub/domain, prohíbe has_variants()/legacy() y limita
referencias concretas a look.rs y cada módulo UI de widget. Si el Look necesita un hecho nuevo, ampliarlo en la proyección común;
no crear otra proyección ni historia. No se introduce un registro genérico o un trait.

## Verificación y riesgos

Baseline compilado antes del primer widget; misma fuente, fuentes/DPI y configuración
para capturas RGBA antes/después sin máscaras, umbral 0 y porcentaje máximo 0.
Goldens existentes permanecen intactos. Escenas secuenciales y tests con reloj inyectado
protegen reordenaciones, cruces, récord y repostaje de cada política visual.
Medir project/ingest/frame con el mismo corpus, invalidaciones y asignaciones; las
mediciones locales no demuestran CPU del juego ni latencia real de LMU/OBS.
Los riesgos principales son semántica de gaps/calidad, migración de filtros y pérdida
de avisos. Se valida y entrega un widget antes de pasar al siguiente.

La proyección incremental de Standings compara hechos exactos en el propio Board:
contenido, preferencias, sesión/fuente, clima/banderas y hechos por CarId. No guarda
Snapshot ni clave de Look; secuencia/inputs ajenos a la clasificación no invalidan.
Un cambio de hechos o de referencia global invalida y produce el mismo Board que
una proyección en frío. Hay tests de ambas invalidaciones y de una llamada por ingest.
## Hitos históricos de validación

Estos checkpoints conservan gates y fallos anteriores. El gate vigente y el cierre
están en las secciones posteriores; WIP/FAIL aquí describe ese momento.

Gate inicial aprobado: cinco tandas A/B intercaladas en procesos separados con el corpus
real y el Look activo. La mediana de p50 no empeora y la mediana de p99 del nuevo
queda dentro o por debajo de mín–máx de los p99 del baseline; no se afinan umbrales ni máscaras.
Proyección fría como máximo 1,5× Vantare anterior. Cifras y tandas en la evidencia externa.
El Motion Eficiencia reutiliza únicamente su Frame cuando Wake es Idle; una nueva
ingestión o restaurar avisos lo invalida. Vantare presta Motion/Plan/Opciones con Arc
al Frame; estas lecturas efímeras evitan clonar mapas y no son historiales dormidos.

Standings cerrado: 148 tests domain, 224 UI (2 ignorados), arquitectura y Clippy PASS;
48 pares de configuración + 4 reales + golden antes/después con 0 diferencias RGBA.
El golden versionado ya difería del baseline: se conserva y se registra esa deuda previa.
Cinco tandas A/B cumplen el gate. Frío LMU 98→116 µs (1,18×), ACC 44→55 µs (1,24×).
Las cifras por tanda y ambas fases están en evidence-1531/performance/standings-gate-five-rounds.json.

Relative aplica el mismo patrón: slots con una única fila por CarId, información
de sesión y pie en el Board, Motion del pintor activo y transferencia de avisos
con su reloj. Las dos coordenadas de Vantare (filas y tira) son animación activa;
solo las filas producen avisos. Eficiencia conserva su FLIP y aviso de cruce.
La caché compara hechos exactos sin Snapshot ni Look: sesión, fuente, preferencias,
contenido, banderas, clima, gaps/ritmos y hechos de las filas visibles. Los nombres
se guardan solo cuando el ancho o la salida de boxes los consumen; la clave presta
esos nombres, sin copiarlos otra vez. Secuencia y pedales no invalidan; hechos,
calidad, filtros o pie sí. Los casos de jugador oculto prueban también los boxes.
Los textos ausentes usan Cow y se omiten cálculos de tráfico sin ritmo propio.
Frío real medido: LMU 2,4→3,1 µs (1,29×), ACC 2,4→3,4 µs (1,42×).
Relative queda WIP: 80 configuraciones, 4 casos reales y fixture del golden
antes/después dan 0 diferencias. El golden histórico ya tiene otra geometría
(304×285; baseline nativo 470×277) y se conserva intacto.
Cinco tandas A/B: ingest PASS; frame ACC Eficiencia p99 163,2 µs supera el
rango baseline 84,5–157,6 µs, y ACC Vantare p50 36,0→41,5 µs. Gate FAIL:
Isaac acepta el +3,6 % Eficiencia como ruido; exige corregir el p50 Vantare.
Gate Relative actualizado: mediana p50 sin superar el rango baseline en los cuatro
casos; p99 dentro del rango o como máximo +5 % documentado. Corrección en curso.
Detalle y todas las tandas en performance/relative-gate-five-rounds.{json,md}.

Relative prepara etiquetas al cambiar Board/Presentation; el recorte necesita
las fuentes reales de la ventana y se prepara una vez antes del pintor, mediante
OnceLock propiedad del Look activo. Paint lee etiquetas y recortes; no hace
format ni fit. Cambiar idioma/estilo/datos visibles invalida; hechos ajenos no.
Revisión Standings: su Plan ya cambia solo en ingest/presentación y sus Frames
prestan Arcs; el formato/fit de nombres restante viene del baseline, no de una
clonación nueva. Su gate anterior pasó los cuatro casos; se conserva la evidencia.

Corrección Relative: cinco nuevas tandas A/B PASS con el gate actualizado.
Frame p50 Efi LMU 47,3→50,4 µs (rango baseline 47,0–53,2), ACC 76,2→74,9;
Vantare LMU 31,7→29,3 y ACC 36,8→34,3 (antes del arreglo: 36,0→41,5).
p99 mediana dentro o por debajo del rango en los cuatro casos; no se usa el margen
+5 % en las nuevas tandas. El +3,6 % de Efi ACC anterior queda aceptado por Isaac.
Ingest p50 Efi LMU/ACC 5,8/7,4→1,3/1,0 µs; Vantare 6,2/6,0→1,3/1,1.
Se conservan las tandas pre-fix y el resumen antes de corregir, sin sobrescribirlos.
La revisión no demuestra un nuevo format/fit respecto al baseline: era trabajo
heredado. Al retirarlo se resuelve la regresión medida; no se atribuye una causa
microarquitectónica no perfilada. Corpus real, widgets visualmente estables (0
invalidaciones tras warmup); no demuestra coste de cualquier secuencia del juego.

Delta WIP: Board tipado único y una llamada por ingest, sin caché; un pintor y
Motion activos. Los avisos comunes conservan clase e instante al cambiar Look,
incluido un récord pendiente aunque una vuelta posterior añada otro aviso.
`contentVersion` migra una vez la referencia ignorada por Eficiencia a mejor propia;
después la referencia no depende del Look. Plan y etiquetas cambian por datos o
presentación, no por frame; los frames prestan Arcs y el pintor lee etiquetas.
La demanda es la unión de señales a 16 ms, independiente del Look. No se toca IPC;
dos consumidores de tests domain se adaptan a los helpers del Board común.
89 pares antes/después dan 0 RGBA; golden versionado ya difería 81,71 %, intacto.
Clippy UI/domain PASS y Nextest 395/395 PASS, 2 skipped; gates workspace pendientes.
Frío real: LMU 43→50 ns (1,16×), ACC 25→37 ns (1,48×): PASS. Cada muestra mide
32 proyecciones independientes para resolver el reloj de 100 ns, sin Board previo.
Cinco A/B reales FAIL: Efi LMU frame p50 33,3→43,2 µs y p99 mediana 89,5 µs
frente a rango baseline 63,1–82,6 (+8,35 % sobre máximo). Vantare frame p50
LMU 18,4→28,8 y ACC 23,6→28,4; ingest falla LMU ambos y ACC Vantare.
No se declara paridad de rendimiento ni causa no perfilada. Se detiene el avance
a Fuel según el gate de Isaac; tandas completas en performance/delta-gate-five-rounds.json.

Isaac actualiza el gate para Standings, Relative y Delta tras el bloqueo: cinco
A/B intercaladas, p50 ingest/frame sin superar máximo del rango baseline; p99
sin superar máximo o hasta +5 % documentado. Perfil QA por ingest, preparación
frame y paint, con asignaciones/bytes solicitados del hilo UI y contadores de
Plan/etiquetas/Motion. No demuestra RSS máximo ni GPU/Present. Datos iniciales
profile-*.json conservados: no hay más invalidaciones ni asignaciones nuevas
por frame en los casos medidos. No se declara inevitable una regresión por diseño.
Corrección común en curso: contenido Standings estable, frame Idle de Relative/
Delta memorizado y consulta prestada del caché de texto, manteniendo fuente,
color y límite de 4096 entradas. Se vuelven a medir y capturar los tres widgets.


## Perfil común y gate vigente (10-10-2026)

Cinco tandas A/B intercaladas en procesos distintos, corpus real: mediana p50 de
frame e ingest hasta +3 % sobre el máximo de las tandas baseline; mediana p99
hasta +5 % sobre ese máximo, con exceso documentado. No se ajusta más el ruido.
Relative PASS en los ocho costes; Delta PASS, con ingest Vantare LMU 5,3 frente
a máximo 5,2 µs (+1,92 %, aceptado por Isaac). Standings PASS tras comparar
sus Scalars prestados: ingest Efi LMU p99 65,0 frente a máximo 63,4 µs (+2,52 %);
los restantes costes dentro/bajo rango. Delta presta Player y memoriza referencia.
Snapshot/State/Car no ofrecen revisión por coche/señal; Lost conserva la revisión
global en IPC. No se usa epoch/sequence como atajo que omita cambios de hechos.
Perfil estable: no aparecen Plan/etiquetas/Motion ni invalidaciones nuevos.
Costes heredados retirados: Content copiado, filas/Frame Idle y claves de shape
con Strings nuevos por hit. No se afirma una causa microarquitectónica del ruido.

## Fuel y stint

`fuel_strategy::Board` combina los hechos de ambos Looks, con calidad y estado
explícitos. Un único `Vec<HistoryEntry { lap, consumed: Option<f64> }>` mantiene
el orden canónico; conserva las posiciones inválidas para recortar como antes.
No se guarda Fuel/Snapshot ni otra colección de consumos. Eficiencia prepara
únicamente etiquetas de las filas visibles; Vantare deriva puntos del gráfico,
Plan y etiquetas del mismo historial. Ninguno reproyecta el Snapshot.
El Widget posee ese Board en Arc, Config memorizada, preferencias, un pintor y
Motion activos; el reloj del pulso es común y sobrevive al cambio de Look.
`contentVersion` migra una vez controles ignorados por layouts Vantare antiguos;
los layouts Eficiencia conservan su contenido. Después el contenido y la demanda
unida a 250 ms son independientes del Look. Identidad/registro JSON permanecen.
El reloj de capturas de pulso bajo se fija solo en `parity-capture`; el producto
mantiene su reloj, interpolación cúbica, duración y cadencia de 50 ms existentes.
Se conserva la fuente original congelada para comparar la misma fase del pulso.
Fuel: 99 pares RGBA originales exactos y cinco A/B reales PASS en ocho costes;
medianas p50/p99 dentro o bajo rango baseline, sin usar márgenes +3/+5.
Frame p50 Efi LMU/ACC 28,5/45,8 µs; Vantare 59,0/64,2. Frío Vantare original
LMU 134→125 ns (0,93×), ACC 112→112 ns (1,00×); 12000 muestras, sin Board previo.
Agregado de los cuatro widgets: 326 pares, 0 diferencias RGBA sin máscaras.
Recaptura UTF8 QA completada y validada; capturas/snapshots v0 archivados.
Gates workspace completos PASS (detalle en el cierre siguiente).

Perfil Fuel (ambos corpus, 600 muestras + 60 warmup): ACC estable no reconstruye
Plan/textos/Motion; LMU reconstruye por los 100 cambios de Board y conserva las
mismas 100 invalidaciones Vantare. Paint Efi 27→0 asignaciones, V ACC 99→55
y V LMU 108→64; ingest V conserva una asignación de clase como antes.
No se equiparan bytes solicitados con RSS ni con memoria viva máxima.
Adaptación adicional mínima: cuatro lecturas rows() en tests runtime (79cbc6eb)
y Preferences::default() explícito en tres tests Studio; aserciones intactas.
Los fallos iniciales de workspace check/Clippy se conservan y se reejecutan los gates.

El golden versionado Fuel ya tiene geometría distinta (680×204 frente al baseline
nativo 523×272). No se renueva: el par original/nuevo 523×272 da 0 RGBA.
Las deudas previas Standings (85,37 %), Relative (304×285 frente a 470×277)
y Delta (81,71 %) también permanecen documentadas y sin modificar referencias.

En los tests runtime, el intervalo global antiguo se verifica con
`classification_interval`; `interval` conserva la semántica de clase del pintor
Vantare. La aserción de flujo sigue exigiendo +2.00s/+3.00s y la de stale exige
—; el fallo inicial de adaptación se conserva. Los pintores ya leían el campo
correcto, por lo que esta corrección no cambia producto, capturas o rendimiento.

## Cierre local inicial de #1531 (10-10-2026)

Los cuatro widgets quedan implementados y validados en la rama aislada
`vantareapp/isa-1531-widgets-looks`, base 5e1da3f6. Código productivo 746c2cc4;
contratos adicionales runtime 79cbc6eb/607941c7 y Studio 0d58f187.
Fmt/check/Clippy workspace -D warnings PASS; Nextest 1425/1425 PASS, 7 skipped
del perfil oficial; lifecycle 5+13 PASS; telemetría real 21/21 PASS, 0 skipped.
Todos por compilar.ps1/gates.ps1, -j2, Nextest2 y DuckDB oficial; defaults ajenos
a storage conservados. No se debilitan aserciones ni se excluyen tests nuevos.
Un EOF inicial de Engineer antes del saludo no se reprodujo en la única
repetición íntegra de la suite; causa exacta no demostrada, fuente Engineer
intacta. Se conservan fallos, correcciones y resultados sin declarar ese fallo resuelto.

326 pares RGBA originales exactos, inspeccionados por Look, con umbral 0 y sin
máscaras. Cinco A/B por caso/Look: 32 costes ingest/frame PASS; frío ≤1,5x
Vantare original en ambos corpus. Excesos aprobados: Standings p99 +2,52 %,
Delta p50 +1,92 %; Fuel no necesita márgenes. Tandas y perfiles anteriores
permanecen en C:/tmp/auditoria-arquitectura-v2/evidence-1531/performance.

La demanda común de Delta 16 ms/Fuel 250 ms puede incrementar frecuencia frente
a Eficiencia antigua; el gate por ingest/frame no mide carga total del juego.
Asignaciones/bytes del hilo UI no prueban RSS ni GPU/Present/latencia OBS.
IPC, registro y dependencias permanecen intactos; integrar DTO v9 de #1530 y
revalidar sus fixtures corresponde al orquestador. No hay push, PR, merge,
release, CI remoto ni promoción; entrega local pendiente de revisión de Isaac.

## Calidad y orden histórico: contratos reales de #1537

P1.1 confirmado con `ui/fixtures/telemetry-real/lmu-stale.snapshot.json`:
44 coches, tres clases, jugador CarId 44. La clasificación salía por slot
(IDs 1..44) porque ambos sorts descartaban la posición Stale. Standings usa
ahora la posición Reliable/Estimated/Stale como clave de orden, con ausencia
al final. Esa clave se lee de los Scalars existentes; no crea otra colección,
no añade estado y no convierte el último dato conocido en actual. Las celdas
siguen usando `current()`: posición global/de clase obsoletas son `—`/None.

Los tests pasan por `Widget::ingest`, no se limitan a repetir `project` ni a
observar su booleano. Comparan el Board completo entre todos los Looks y la
identidad Arc al cambiar de Look. Cubren cuatro fotos reales (lmu47, ACC,
stale, menú), los cinco SourceState y una copia degradada por Core de cada
foto, sin inventar valores. Incluyen ambos ámbitos de clase, las tres
referencias Delta y los dos recursos Fuel. Protegen jugador/clase, calidad,
ausencia, orden y el historial único. La transición live→stale invalida la
caché aunque epoch/sequence no cambien y conserva el orden conocido.

Orden por posición corresponde a Standings global y a sus grupos. Relative
conserva su contrato de vecinos por gap firmado al jugador (delante lejos→
cerca, jugador, detrás cerca→lejos), además de posición/clase correctas. Sus
valores históricos llevan marcas stale explícitas. Delta y Fuel no tienen
filas de clasificación: se comprueba identidad del jugador, referencia de
líder de su clase en Delta y clase/recurso/stint en Fuel; datos crudos
conservan Quality y no alimentan valores actuales desde Stale.

La corrección del orden stale justifica una diferencia visual localizada
respecto al baseline que contenía el bug; las referencias históricas no se
renuevan. Evidencia adicional separada en
`C:/tmp/auditoria-arquitectura-v2/evidence-1531/stale-contract-1537`, incluida
la reproducción anterior (dos tests FAIL, los otros tres PASS). El cierre
inicial de arriba conserva sus cifras históricas; esta corrección se revalida
con capturas y el mismo gate de rendimiento y gates oficiales.

Cinco A/B intercaladas en procesos distintos tras el arreglo: ocho costes
Standings PASS sin usar los márgenes +3 %/+5 %. Frame p50 Efi LMU/ACC
139,1/148,6 µs dentro de rangos baseline 95,4–223,7/99,3–162,4; Vantare
117,4/90,3 dentro de 89,6–135,9/83,8–121,0. Todos los p99 dentro o por debajo
del rango baseline; la carga concurrente queda reflejada en las tandas, sin
buscar estabilización adicional. Frío Vantare LMU 97,781→116,893 µs (1,195x),
ACC 44,378→54,671 (1,232x), sin Board anterior: límite 1,5x PASS. El JSON
conserva cada tanda y muestras frías (12 000 LMU / 1 000 ACC por proceso).

Relative publica `HeaderStale` en el Board: circuito, badge del jugador,
tipo de sesión, reloj, aire, pista y viento tienen marcas independientes.
Se calculan una vez al proyectar, a partir de Quality, sin Look ni estado
adicional. La clave existente compara la calidad y la comparación visible
de Eficiencia incluye las marcas: una transición fresco→Stale repinta aunque
el texto sea idéntico. Cambiar Look conserva el mismo Arc y sus marcas.

Eficiencia reutiliza exactamente la tinta al 60 % de sus filas Stale, solo
en el valor afectado; etiquetas estáticas y valores frescos conservan su
tinta. Sesión y reloj se atenúan por separado. Footer configurable conserva
las marcas InfoCell existentes. Vantare no dibuja estos metadatos de
cabecera/pie; mantiene su presentación existente sin inventar un tratamiento.
Las capturas Live sin señales Stale deben seguir siendo idénticas. Una foto
SourceState::Live con campos Stale sí requiere marcar esos campos: el estado
global no sustituye la calidad individual.

Validación visual adicional de Relative: 121 pares ES/EN, catálogo, estados,
cuatro fotos reales por Look y siete degradaciones de calidad aisladas por
Look/idioma. 106 pares idénticos; 15 cambios exclusivamente Stale, todos en
cabecera/pie de Eficiencia (14 campos aislados + foto real stale). Las 91
entradas sin señales Stale y todo Vantare conservan RGBA exacto=0. Filas y
aviso de fuente no cambian; goldens intactos. Pares antes/después y regiones:
`stale-contract-1537/relative-freshness/captures.md` y `changed-regions.json`.

Cinco A/B adicionales de Relative: ocho costes PASS sin márgenes +3 %/+5 %.
Frame p50 Eficiencia LMU/ACC 52,0/84,2 µs frente a rangos baseline
52,4–91,3/77,2–129,5; Vantare 37,3/45,8 frente a 32,9–95,8/37,0–95,9.
Ingest mediano 3,2/1,9 µs Eficiencia y 3,8/2,9 Vantare, por debajo de sus
rangos baseline. Todos los p99 dentro o por debajo del rango baseline.
Frío Vantare LMU 2,453→3,137 µs (1,279x), ACC 2,137→2,850 (1,334x):
límite 1,5x PASS, sin Board anterior. Las tandas reflejan la carga concurrente
y no se repiten para afinar ruido; el gate usa el rango aprobado por Isaac.

Cierre adicional: Standings `be505e8f`, Relative `d595fac8`; siete tests
nuevos. Fmt/check/Clippy workspace -D warnings PASS; enfocados 123/123,
Nextest 1432/1432 (7 skips oficiales), lifecycle 5+13 y telemetría 21/21
PASS por cola y targets aislados. No se modifican IPC ni fixtures; los
diagnósticos iniciales se conservan en la evidencia, sin fallos pendientes.
Capturas finales fijadas al único Release C9E36342; entrega local sin push/PR/merge.

## Contadores Fuel fuera de rango (#1539)

La proyección común usa `checked_add` para vuelta actual, número de stint,
cierre de parada, total derivado de vueltas y sector visible. Un resultado
no representable queda ausente (`None` o `Plan::Unknown`), sin panic en
debug ni vuelta del contador en release. El total derivado solo se calcula
si no existe un total explícito; `unwrap_or` evaluaba antes la suma aunque
su resultado no se utilizara. Datos normales e historial único se conservan.
Los tests cubren u32::MAX en laps/pit_stops, sector 255, sumas cercanas al
límite y un DTO extremo que pasa por ingest con ambos Looks; IPC intacto.

Validación de esta corrección: 30/30 tests enfocados tanto en debug como en
release; fmt/check/Clippy workspace -D warnings, Nextest 1436/1436 (7 skips
oficiales), lifecycle 5+13 y telemetría 21/21 PASS. Reproducción anterior y
logs completos separados en evidence-1531/fuel-range-1539. No se repiten
capturas ni A/B por este arreglo de sumas: no toca pintores/geometría y los
tests de valores normales, catálogo, animación/cache e historial siguen PASS.

## Preparación de fuente y defaults (ronda 2)

Fuel conserva un OnceLock de textos ajustados en cada presentación, Eficiencia
y Vantare. GPUI entrega Window en el closure: prepare inicializa las métricas
una sola vez, sin cambiar Board, Motion ni historial de consumo. Board/opciones,
idioma o estilo invalidan la preparación; los siguientes paint solo leen.
Relative Eficiencia usa el mismo seam: formato y mayúsculas en ingest/cambio de
presentación, y una primera preparación de medidas con Window. No se vuelve a
formatear ni ajustar texto por frame; los fantasmas activos conservan etiquetas.

Los valores base viven una sola vez en Settings::for_look de cada widget.
Default y eficiencia delegan ahí; los presets de Workshop parten de ese mismo
constructor y solo ajustan su composición de preview. look.rs publica datos de
apariencia, columnas editables y geometría de preview; Hub/Workshop no clasifican
Looks con legacy/has_variants. El pie Eficiencia comparte una estimación de filas.
Antes de cambiar Look se normaliza el contenido con el Look anterior: Delta v0
no recupera una reference antes ignorada. Ambos guardados normalizan ajustes.
