# Handoff vivo — Telemetry Core

Última actualización: 2026-11-03 · VANTA-129 / [#1868](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1868).
El historial, decisiones y logs de los cortes anteriores se conservan completos
[en nightly@9d4982e29](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/9d4982e290c3538d8bd2980c3f23c2d8b76b4183/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md),
incluidas las investigaciones de Imola, #1638/#1750 y los handoffs previos.
Es referencia histórica; la situación operativa de este archivo es la siguiente.

## Estado vigente

VANTA-129 **Por revisar**: pasos **0–3, 5, 6 y 9 integrados**; paso 4 en
[PR draft #1895](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1895)
contra nightly, sin integrar. Después quedan 7, 8 y 10.
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

Código `ffc1fae4d74ff52dd71fa2bf42fe3e8181f2739a`; árbol nativo
`a0ff32f6c0735fcae5236d88ce5f4c6487e40269`.
Rama `vantareapp/isa-1868-paso4-fixtures-v11`, worktree
`D:/VantareServer/worktrees/isa-1868-paso4`, base origin/nightly `7e92e1a9e`.
No se han fusionado ramas, promocionado canales o publicado releases desde el worker.

## Corte actual y verificación

Paso 4: migradas 102 fixtures UI v10 (797 fotos). Dos archivos ya v11 (seis
fotos) son controles. Solo cambia versión y siete campos de timing Unavailable;
Snapshot == antes/propuesta/aplicar/volver a leer, 803 fotos. La inversión de
los parches recupera los bytes exactos de los 104 archivos. El alias de fixtures
se retira; los datos internos usan lectura estricta y los documentos externos
conservan lectura guardada v7–v10. El documento v7 real conserva nombre histórico
saved-v8.snapshot.json y bytes; se añade una copia v10 real con SHA y valores.
80 pins activos de retirement se revisan conservando source_sha256 e historia;
las otras 388 entradas son idénticas. Ningún golden, corpus, PNG de referencia
ni baseline histórico se regenera; verify.py permanece intacto.

Caracterización previa de producto/datos: d1386dac7 y 8ebe041a8; 724 unitarios,
34 telemetría, Snapshot == de 803 fotos y 208 capturas anteriores PASS. El caso
LMU quedó en rojo (Paused en vez de Stale) antes de la guarda mínima. Ahora una
firma conocida incompatible no confirma pausa bajo el ID anterior y hacen falta
los dos avances habituales para adoptar ID nuevo. Unavailable literal se prueba
en Scope y retención/confirmación del Core. Diseño externo alineado con
Scope::of(Source, &State), diff y hashes guardados; Journal conserva SessionChanged.

Validación local del árbol nativo a0ff32f6c0735fcae5236d88ce5f4c6487e40269:
- Fmt, check y Clippy habitual de domain/ipc/runtime/ui/hub PASS, juntos por
  compilar.ps1; ejemplo QA con parity-capture compila.
- Nextest completo: 1.922/1.922 PASS, 19 skips, run
  8e9800c4-919c-41aa-b752-61b79ae8990c. Incluye telemetría 34 PASS (#1498),
  ACC experimental 198,958 s, goldens/corpus existentes intactos.
- Lifecycle con procesos reales: 25/25 PASS, overlays normal y QA. Target privado
  del worktree D:/VantareServer/worktrees/isa-1868-paso4/vantare-v2/native/target/gates;
  cola liberada al terminar; sin copiar cachés.
- 208 comparaciones de captura, 19 familias y ambos Looks: 200 PNG byteidénticos;
  ocho delta-trace difieren en dos píxeles de S1, máximo premultiplicado 1,1255.
  Cero píxeles fuera del umbral canónico 8 / máximo 4 %, sin máscaras. Se conserva
  también la sonda estricta a cero (ocho diferencias) y el lote repetido idéntico
  16/16 al posterior. No se atribuye una causa interna ni se cambian tolerancias.
  13 lotes por fase, una ventana fuera de pantalla por proceso, sin foco/omisiones.
  Revisión visual de standings, pedals, input-telemetry, fuel-strategy y delta-trace.
- Integridad y quality: 468/468 PASS. Reservas VANTA-130 verificadas por diff;
  app.rs solo cambia llamadas de tests, con prefijo productivo idéntico a la base.

Incidencias conservadas en la evidencia, sin ocultar fallos: el primer intento
omitió el binario storage, después compilado con DuckDB oficial. El test nuevo
esperaba Version; los documentos históricos reales se rechazan antes por señales
ausentes (Protocol). Corregida esa expectativa en ffc1fae4d; lectores live y guard
de versión son idénticos a la base y las aserciones sintéticas existentes siguen.
Una tanda dio 1.919/1.922 y tres timeouts de servicios sin diff: pasan en los
binarios anterior/actual, en Nextest filtrado y en la repetición completa, sin
cambiar plazos/aserciones. Causa no aislada; mantener seguimiento en #1561.
Clippy QA adicional conserva 17 avisos preexistentes de Hub (#1648). DeepSeek
opcional no arrancó por Insufficient account funds; diff revisado directamente.
NumPy no está disponible: PNG idéntico se prueba por bytes y el resto con GDI+
BGRA8 premultiplicado, equivalente para el umbral vigente; no se instala nada.

El orquestador acepta ambos ajustes de #1891: ignorar calidad de metadatos en
Scope y reiniciar trackers al cambiar fuente. CI real 5/5 SUCCESS verificada;
DeepSeek MERGE comunicado tras integrar 7e92e1a9e.
Detalles completos del paso 6 [en el handoff integrado](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e92e1a9e52d57db17263234ec62efc5774794cb/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md).
Evidencia de este corte: D:/VantareServer/evidence/isa-1868-paso4, incluidos
validation.json, pixel-parity-canonical.json, la sonda estricta, parches e inversión.
CI de este corte: al publicar, cuatro checks SUCCESS y el gate bloqueante en
curso en efba6053b. [Estado vivo de los checks](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1895/checks);
la issue registra HEAD y la última verificación remota. No se afirma 5/5 aún.

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

VANTA-130 paso 8A reserva ui/layout (lector, normalización y persistencia,
incluido default_path), hub/document, ipc/session_alerts y la lectura opcional
de reducedMotion en el host. Se mantienen las reservas anteriores de raíz de
datos, workshop/state, carga/avisos/diagnóstico de hub/shell, files::future_version
y texto CAS de ipc/files. Las reservas nuevas tampoco se tocan; en app.rs solo
cambian llamadas de tests, con el prefijo productivo idéntico al de la base.
Este corte solo cambia lectores de fixtures de UI/Studio fuera de esas zonas;
no cambia installer, packaging ni las rutas reservadas.

Paso 4 publicado para revisión; comprobar la CI final y recoger la revisión del
orquestador. Después quedan 7, 8 y 10, coordinando las reservas vigentes.
Sin merge, release ni promoción por el worker.
