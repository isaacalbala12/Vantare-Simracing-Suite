# Handoff vivo — Telemetry Core

Última actualización: 2026-11-03 · VANTA-129 / [#1868](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1868).
El historial, decisiones y logs de los cortes anteriores se conservan completos
[en nightly@9d4982e29](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/9d4982e290c3538d8bd2980c3f23c2d8b76b4183/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md),
incluidas las investigaciones de Imola, #1638/#1750 y los handoffs previos.
Es referencia histórica; la situación operativa de este archivo es la siguiente.

## Estado vigente

VANTA-129 En curso, corte preparado para revisión. Pasos **0–3 y 5 integrados**;
paso **9 y P3 implementados y validados localmente**;
pendientes **4, 6, 7, 8 y 10**. Plane es el tablero; GitHub/Project Vantare
registra código y PRs. No tomar otros encargos desde el historial.

| Corte | Integración en nightly por el orquestador | CI del PR verificada |
| --- | --- | --- |
| 0–1, #1873 | bc239c063 | 5/5 SUCCESS |
| 2 + P3, #1877 | da4c2af08 | 5/5 SUCCESS |
| REST #1881, #1885 | 56c6df494 | 5/5 SUCCESS |
| 3, #1882 | ec4ca056c70ebdc92bf21d0540c5a65794667f3f | 5/5 SUCCESS; DeepSeek MERGE comunicado |
| 5, #1886 | 9d4982e290c3538d8bd2980c3f23c2d8b76b4183 | 5/5 SUCCESS; DeepSeek MERGE comunicado |

Rama `vantareapp/isa-1868-paso9-adaptadores`, worktree
`D:/VantareServer/worktrees/isa-1868-paso9`, base origin/nightly `9d4982e29`.
Comenzó sobre `ee74d36b6`, actualizado entonces; al integrarse 3/5 se trasladaron
los dos commits de caracterización a la base nueva, antes del refactor.
No se han fusionado ramas, promocionado canales o publicado releases desde el worker.

## Corte actual y verificación

Paso 9 del [diseño aprobado](D:/VantareServer/evidence/revision-general/telemetria-overlay-DISENO.md):
constructores de Quality en domain, un cruce REST por coche para número/paradas,
pose/velocidad LMU reutilizadas, umbral de repostaje común y ventana spline ACC.
Conserva reglas de caducidad, suelo REST, señal ausente y calidad estimada.

Caracterización ANTES: `e62b4edac` y formato `01f669509`.
Sobre la primera base: 430/430 tests de runtime y 34/34 de telemetría PASS,
con todos los bytes/hashes congelados. Tras trasladar a `9d4982e29`, 527/527
unitarios runtime+ipc PASS (5 skips preexistentes), también antes del cambio.
Código validado `80b735213`, árbol native `f83c2f0a1b4341d39268f2a2b638e691c6cb7656`.
Tanda conjunta por compilar.ps1 para domain/ipc/runtime, target propio, jobs 4 y
raíces QA: fmt/check/Clippy -D warnings PASS; **891/891** Nextest PASS (9 skips:
8 preexistentes y el bench opt-in, ejecutado aparte), incluidos **34/34** de
telemetría. Run `8a08934a-a18d-416c-99c0-4f4f207ac2a6`. Lifecycle runtime **25/25**
PASS con overlays reales normal/QA. Cola liberada; quality/integridad 468/468 PASS.
Las 3857 fotos LMU y hashes ACC de 190471 lecturas permanecen idénticos, sin
regeneración; ACC completo 202,124 s. Sin nuevas dependencias o configuración.
CI remota de este corte pendiente de publicación; no se le atribuye verde.

P3 asignados: sustituir este diario por una única situación operativa con CI real;
asociar el comentario de alineación de lmu/frame al uso del presupuesto;
revisar scripts que puedan parsear el sufijo detail del registro; retirar del
DTO la comparación redundante de caminos que delegan al mismo decodificador.
La lectura por referencia sigue contrastándose con fotos originales de las cuatro
calidades; codec y goldens conservan la cobertura de la entrada por valor.

Coste del decode del Hub: por valor delega al lector prestado, que copia payloads
al crear un Snapshot dueño. No se ha cambiado esa decisión del paso 3.
El tramo Decode de paint-stats solo mide serde_json::from_slice (codec), no esa
conversión. Se ejecutó el bench opt-in del DTO real de 47 coches, con setup
fuera del cronómetro, nueve rondas tras calentamiento y 128 fotos por ronda.
Mide conversión por valor, incluidas copias/liberación del DTO, sin JSON ni drop
de los Snapshot resultantes. Es orientativo en servidor compartido, perfil test;
no compara con el decodificador antiguo por movimiento ni cuenta allocations.
Bench 1/1 PASS, run `5d5cf6ce-c856-4985-af36-6158590c5d15`: medias por foto,
mínimo **23,075 µs**, mediana entre rondas **26,560 µs**, máximo **37,209 µs**.
No aísla el coste de las copias ni representa latencia Live o rendimiento Release.
En 1248 scripts versionados/de evidencia buscados no se encontró ningún parser
de freshness.log; el único literal era un generador del test IPC que comprueba
reason y detail por separado. Los candidatos de reason= eran otros diagnósticos
o generación de código. No se reescribieron scripts/evidencia históricos.

Evidencia, comandos y recuento de producción/tests/docs separados:
`D:/VantareServer/evidence/isa-1868-paso9`. Los fallos se conservan en sus logs.
No se regeneran goldens/corpus ni se cambian baselines o dependencias.

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

VANTA-130 conserva cálculos de raíz de datos, persistencia/lectura y constructor
desde bytes/default de ui/layout, escritor de workshop/state, hub/document y
carga/avisos/diagnóstico de hub/shell. Sin sondeo/host/motion en su constructor.
Siguen reservados files::future_version y texto CAS de ipc/files. El orquestador
liberó ui/motion_policy, conexión reducedMotion del host y migración preferences
de ui/layout al aplazar VANTA-130 ese grupo. Persistencia/lectura y default_path,
y las demás zonas previas de VANTA-130, conservan su reserva.
Este corte no toca UI, Hub, installer, packaging ni ninguna de esas zonas.

Revisar el PR del paso 9 y sus P3, con todos los gates locales verdes. Después, según el orden
aprobado, paso 6 y paso 4. El **paso 4 no está hecho**: migra fixtures del repo
a v11, conserva v7/v10 reales para probar los lectores y elimina el alias de
fixtures; exige Snapshot== antes/después y paridad de píxeles sin rebaselinar.
Luego quedan host, proyecciones y medición de los pasos 7, 8 y 10.

Fallos iniciales conservados: renombrado mecánico de métodos Velocity.quality,
dos referencias de tests al helper retirado, atributo must_use y línea vacía tras
un doc comment. Corregidos sin relajar aserciones ni permitir warnings.
