# Handoff vivo — Telemetry Core

Última actualización: 2026-11-03 · VANTA-129 / [#1868](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1868).
Historial y evidencia completos de los cortes anteriores
[en nightly@aae9c2cec](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/aae9c2cecb8053483e03c89778176a847c5ffd72/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md).

## Estado vigente

VANTA-129 **Por testear** por indicación del orquestador: pasos **0–10 integrados**.
#1907 integrado en aae9c2cecb8053483e03c89778176a847c5ffd72; merge y CI **5/5
SUCCESS** verificados en GitHub. El objetivo estructural se cumple; el saldo
aceptado es −287 líneas de producción y no alcanza la estimación de tamaño.
Cierre pequeño solicitado en rama vantareapp/isa-1868-cierre, worktree
D:/VantareServer/worktrees/isa-1868-cierre desde ese origin/nightly actualizado.
Este cierre no está integrado: completa el footer tipado, documenta espectador
y añade check bench obligatorio al gate check. Validación local final completa;
CI remota pendiente al publicar [PR draft #1909](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1909). Código 80828160f10f22f202e84a6de71971f13349a7ca,
árbol nativo 374b3e128ed77267b5fdc925f469a70a880c30ef.
Plane es el tablero; GitHub/Project Vantare registra código y PRs.
Riesgos abiertos: #1471, #1474, #1478, #1527 y #1561.

| Corte | Integración en nightly por el orquestador | CI del PR verificada |
| --- | --- | --- |
| 0–1, #1873 | bc239c063 | 5/5 SUCCESS |
| 2 + P3, #1877 | da4c2af08 | 5/5 SUCCESS |
| REST #1881, #1885 | 56c6df494 | 5/5 SUCCESS |
| 3, #1882 | ec4ca056c70ebdc92bf21d0540c5a65794667f3f | 5/5 SUCCESS; DeepSeek MERGE comunicado |
| 5, #1886 | 9d4982e290c3538d8bd2980c3f23c2d8b76b4183 | 5/5 SUCCESS; DeepSeek MERGE comunicado |
| 9, #1889 | cc5af8de149b7f9156130417fe1dc3545ee4fec7 | 5/5 SUCCESS verificado; DeepSeek MERGE comunicado |
| 6, #1891 | 7e92e1a9e52d57db17263234ec62efc5774794cb | 5/5 SUCCESS verificado; DeepSeek MERGE comunicado |
| 4, #1895 | 71a12cc092c7aeee2b76ec357936471e6bee1043 | 5/5 SUCCESS verificado; Sonnet MERGE comunicado |
| 7, #1898 | 8066d1c8e52e8dd1c40e44cd145eac818c66aaf0 | 5/5 SUCCESS verificado; Sonnet MERGE comunicado |
| 8+10, #1907 | aae9c2cecb8053483e03c89778176a847c5ffd72 | 5/5 SUCCESS verificado; integración por el orquestador |

## Balance final del recorrido

El objetivo estructural se cumple. El balance de tamaño integrado aceptado por
el orquestador es **−287 líneas de producción**, frente a **−850/−900 estimadas**:
el objetivo de tamaño no se alcanza. No se abre otra limpieza para perseguirlo.
El delta de este cierre se mide aparte respecto a aae9c2cec.

La tabla cuenta decisiones funcionales del diseño, no cada llamada o aparición
textual. Las reglas distintas de Journal y del consumidor siguen separadas.

| Decisión | Antes | Después |
| --- | --- | --- |
| Ámbito e hidratación | 7 criterios repartidos, con desacuerdo al cambiar situación | 2 fronteras explícitas: Scope (fuente/sesión/coche) y Boundary (hidratación); publicador y suscriptor usan el mismo Boundary |
| Silencio y situación | 5 límites de frescura de 500 ms y umbrales dispersos de confirmación | STALL_LIMIT y SITUATION_CONFIRM (250 ms) compartidos |
| Pausa | 4 capas reinterpretándola | Adaptador detecta, Core retiene; host consume predicados comunes |
| Diagnóstico de frescura | Caso ACC y motivos propios dentro de Core | Reason neutral compartido más detalle del adaptador; mismo log y E/S de transiciones |
| Señales del DTO | 3 mapas señal→campos | 1 tabla signal_fields! |
| Codificación | 2 caminos | 1: selected(all) también produce la foto completa |
| Decodificación | 2 caminos | 1 lector por referencia; el de valor delega |
| Golden | Cirugía sobre texto JSON | oracle_view tipado, mismos bytes/hashes congelados |
| Escenas activas | Fixtures v7/v10 y alias específico | v11 estricto; lectores externos v7–v10 conservados y probados con documentos reales |
| Host | 2 hosts para campaña/layout | 1 host; campaña como Layout sintético, Instance retenida por widget |
| Visibilidad | Sesión, derechos y presentación resueltos en varios lugares | 1 visibility() pura compartida por render y uso |
| Estado sin datos | 7 enums | 1 Status::of; se conservan prioridades de cada proyección |
| Espera | 4 funciones waiting y textos repetidos | 1 función y textos comunes; Standings admite espectador |
| Amarilla | 3 selecciones global/sector | 1 selección común; boxes/vuelta final e índices siguen en cada widget |
| Líder y clasificación | Texto traducido interpretado por consumidores | is_leader/qualifying proyectados; este cierre completa Footer::Session |
| Quality de adaptadores | Constructores repetidos en LMU/ACC | from_source/from_estimate compartidos, must_use y un único test de contrato |
| Fila REST y movimiento LMU | Dos casados de fila y cálculos repetidos de pose/velocidad | Fila única y un cálculo por coche, conservando vigencia/suelo |
| Repostaje y spline | Constantes/ventanas duplicadas | Constante de repostaje y ventana spline ACC compartidas |
| Medición | 2 flags de ablación en Core de producto | 0 flags en producto; banco opt-in bench, tests normales conservados y check bench obligatorio en gates.ps1 |

Se conservan ACC experimental y su golden, lectores v7–v10, formato del delta
por Look, cable v11, capacidades del adaptador y cola acotada. DTO v12,
capacidades en Core y conectar ACC siguen fuera. Los cambios intencionados de
Scope (calidad de metadatos ignorada y reset al cambiar fuente) están aceptados.

## Cierre pequeño y verificación

Caracterización ANTES sobre aae9c2cec: 17/17 tests de Standings Vantare PASS
(run 0cddd061-f922-47f3-b3a7-0e481dfd9765), incluidos qualy, ES/EN y espectador.
Los goldens y las 208 capturas aceptadas de #1907 son la base conservada; no
se regeneran. La paridad visual comprueba el footer con las escenas existentes.
Validación final sobre ese código y árbol nativo:
- Fmt workspace/widget, check y Clippy -D warnings PASS (--all-targets),
  domain/ipc/runtime/ui juntos por compilar.ps1; target privado y jobs 2.
- Check de runtime --features bench --all-targets y parser de gates.ps1 PASS.
  El comando añadido al gate check compila sin activar bench en producto.
- Nextest CI 1.307/1.307 PASS, 15 skips; incluye telemetría 34/34 (#1498),
  goldens LMU/ACC y replay a widgets. ACC completo 200,569 s.
- Lifecycle 25/25 PASS con overlays reales normal/QA; capturador QA compila.
- 208/208 PNG byteidénticos a la base aceptada, sin máscaras/tolerancias nuevas.
  Trece lotes de 16, cero omisiones, un proceso/ventana por lote, sin foco.
- Integridad y quality 468/468 PASS. Diff completo revisado. Cola cedida antes
  de capturar; no se comparten targets ni se copian cachés.
Recuento del cierre frente a aae9c2cec: producción +3/−3 (neto 0), tests +0/−0,
tooling +7/−0; docs por separado en el PR. El saldo de producción queda en −287.
Evidencia de este cierre: D:/VantareServer/evidence/isa-1868-cierre.

## Histórico integrado: corte 8+10 y verificación

Pasos 8+10 agrupados desde la misma base, con cambios de código separados.
Los siete widgets comparten Status::of y sus textos; cada proyección conserva
sus hechos y prioridades de ausencia/caducidad. No se trasladan capacidades al
núcleo. Waiting y sus textos pertenecen al kit Vantare, conservando la política
de espectador de Standings. La selección global/sector de amarilla es común;
cada widget conserva boxes/vuelta final y su conversión de índice.
Standings proyecta is_leader y qualifying; el consumidor deja de interpretar
Líder/Leader y prefijos traducidos del nombre de sesión. Solo Qualifying
produce Pole; Other no se reclasifica por su nombre. LMU/ACC ya publican
Qualifying como tipo reconocido. Delta por Look intacto.

Las ablaciones se trasladan a core/bench.rs tras cfg(feature = "bench") o
cfg(test): el Core de producto pierde sus flags y mantiene validación y flujos.
Los dos measurement_modes_* siguen en la CI normal y se repiten con bench.
El ejecutable normal rechaza VANTARE_MEASUREMENT_MODE antes de abrir derechos
o flujos; el banco conserva controles de modo, UTF-8 y recording. No hay
medición nueva de CPU/latencia ni activación de bench en packaging.

P3 de #1898: servicios del documento en un único bloque watched después de
install_parent_shutdown, sin precopia del layout antes de initialize.
Agenda::default también se instala en campaña, como estado vacío, sin sondeo.
El test de LMU aísla el tipo recordado con el mismo circuito/número y compara
la salida observable Stale frente al control Paused. El lector deriva kind del
número; el arreglo del estado recordado es necesario para aislar esa guarda.

Clarificación histórica de píxeles del paso 7: «ocho difieren» corresponde a
una compilación intermedia anterior al formato final (200/208 exactas).
«208 idénticas» corresponde al binario final b7b49f259, árbol nativo
521ffdf283345d1b884b487c1d6ac5f29833b8b9. Son dos pasadas diferentes;
la entrega final no conserva diferencias. Además el lote crítico 16/16
coincidió con el renderer previo al host reconstruido desde 37a92f016.
Se conservan originales y diagnósticos, sin máscaras ni tolerancias nuevas.

Caracterización previa 6d43456b8: 1.110/1.110 unitarios PASS, 12 skips,
incluidos los modos de medición anteriores y los nuevos casos de estado e
idioma. Antes del cambio se capturan 208 PNG: 208/208 byteidénticos al paso 7.
Validación final sobre 33be67d8a y el árbol nativo indicado:
- Fmt de workspace y de widgets incluidos por registry.rs, check y Clippy
  -D warnings PASS; domain/ipc/runtime/ui --all-targets juntos por compilar.ps1.
  Check y Clippy de runtime con bench también PASS.
- Nextest CI 1.307/1.307 PASS, 15 skips; incluye los 34/34 del perfil telemetria
  (#1498), corpus LMU/ACC y replay hasta widgets. ACC completo 201,971 s.
- Bench 3/3 PASS; los dos measurement_modes_* también PASS en la suite normal.
  El rechazo del modo de medición en el binario normal tiene regresión propia.
- Lifecycle 25/25 PASS con overlays reales normal/QA; capturador final compila.
- Capturas finales 208/208 byteidénticas a las 208 previas conservadas: cero
  diferencias, máscaras o tolerancias nuevas. Trece lotes de 16, un proceso y
  una ventana por lote, sin foco ni omisiones, mismo viewport 2304×1440.
- Integridad y quality 468/468 PASS. No se regeneran goldens, corpus o fixtures.
- Producción física +432/−438 (neto −6), tests +291/−73, configuración +2;
  docs por separado en el PR. El banco se cuenta como producción aunque quede
  tras cfg: se aísla del binario normal, no desaparece del repo. No se alcanza
  la reducción estimada; se conservan prioridades explícitas de cada widget.
Tanda conjunta con target privado native/target/gates y jobs 2; cola respetada
(esperas finales de 1.331 y 1.403 s) y cedida antes de las capturas. Tres fallos
de Clippy conservados y corregidos sin allow ni quitar casos: Copy de Signals,
tamaño del nuevo test y punto y coma del bloque de bandeja.
Evidencia: D:/VantareServer/evidence/isa-1868-paso8; la del paso 7 conserva su
repetición de base y migrate-fixtures.rs archivado fuera del repo.
No se han usado subagentes: DeepSeek expresamente excluido.

## Contratos y límites que se conservan

- [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md) y [mapa nativo](../../../native/README.md):
  runtime posee adapters/adquisición/supervisión; domain es puro; IPC posee wire.
  Domain/UI no dependen de runtime, tampoco transitivamente.
- Adapter::poll recibe reloj y no bloquea. Origin conserva origen/recepción;
  calidad y capacidades explícitas no autorizan ceros o referencias inventados.
- Live negocia DTO **v11**; los lectores guardados v7–v10 se mantienen. Latest-wins
  de fotos no sustituye journal/cursor/ACK; época nueva invalida estado previo.
- Boundary de productor y suscriptor coincide, incluida situación de conducción.
  Core conserva la última foto viva en pausa; silencio 500 ms y situación 250 ms
  usan domain::freshness. El consumidor conserva su plazo Lost de cinco segundos.
- ACC sigue experimental con su golden. Sin conexión de ACC al producto, DTO v12,
  capacidades calculadas en núcleo ni cambio del formato delta por Look.
- Corpus, fixtures y lifecycle no prueban juego físico, OBS, DPI, audio o latencia.
  Las mediciones orientativas no certifican fluidez de producto.

## Coordinación y siguiente acción

VANTA-130 paso 8A reserva ui/layout (lector, normalización, persistencia y
default_path), hub/document, ipc/session_alerts y lectura opcional de
reducedMotion en el host. Se mantienen las reservas de raíz de datos,
workshop/state, carga/avisos/diagnóstico de hub/shell, files::future_version y
texto CAS de ipc/files. No se modifican esos archivos o líneas, ni installer,
packaging o hub/installation. La llamada MotionPolicy::apply_layout permanece
idéntica en el host compartido.

Revisar el PR pequeño de cierre y probar el recorrido integrado. Plane permanece
Por testear; no se marca Entregado. El worker no hace merge, release ni
promoción. Tras esta entrega no quedan más pasos de implementación del encargo;
la revisión, integración del cierre y prueba de producto corresponden al orquestador/Isaac.
