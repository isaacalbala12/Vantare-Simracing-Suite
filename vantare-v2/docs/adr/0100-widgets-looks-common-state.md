# ADR 0100 · Widgets: una proyección, un estado, varios Looks

Aceptado por Isaac para #1531. Base: 5e1da3f6. Aplicación incremental: Standings, Relative, Delta, Fuel.

## Decisión

Los Looks son parte central del producto. Eficiencia y Vantare conservan sus tokens,
geometría y animación. El módulo común posee un único Board y Motion por widget.
`domain/src/<widget>.rs` proyecta los hechos y su calidad una vez por ingest, sin Look.
No anida dos proyecciones ni duplica filas o historial de consumo por compatibilidad.
`ui/src/look.rs` define el enum, nombres persistidos y capacidades. `registry.rs`
conserva una entrada por widget; Desktop, Studio y Workshop consumen esa misma API.

Cada módulo UI tiene pintores Eficiencia/Vantare. Reciben Board y presentación;
no reciben Snapshot ni acceden a IPC, persistencia, permisos o posición de pantalla.
Solo existe el pintor activo en un enum. El Motion común selecciona la política
visual activa: no retiene el motor del Look anterior. Al cambiar Look toma sus
CarIds y avisos, recompone la geometría sobre el mismo Board y transfiere los avisos
con el instante original. Cambiar presentación no invoca project ni reinicia un aviso.
Las copias efímeras de un Frame/cache de pintado no son otra fuente de datos.

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
arquitectónico recorre fuentes y limita referencias concretas a look.rs y cada módulo
UI de widget. Si el Look necesita un hecho nuevo, ampliarlo en la proyección común;
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

## Cierre local de #1531 (10-10-2026)

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
