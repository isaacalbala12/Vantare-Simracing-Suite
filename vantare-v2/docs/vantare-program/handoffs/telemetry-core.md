# Handoff vivo — Telemetry Core

Última actualización: 2026-11-03 · VANTA-129 / [#1868](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1868).
El historial, decisiones y logs de los cortes anteriores se conservan completos
[en nightly@9d4982e29](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/9d4982e290c3538d8bd2980c3f23c2d8b76b4183/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md),
incluidas las investigaciones de Imola, #1638/#1750 y los handoffs previos.
Es referencia histórica; la situación operativa de este archivo es la siguiente.

## Estado vigente

VANTA-129 **Por revisar**: [PR draft #1891](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1891)
contra nightly, paso 6 + P3, listo para revisión final con gates locales verdes.
Pasos **0–3, 5 y 9 integrados**; paso **6 implementado y validado localmente**;
pendientes **4, 7, 8 y 10**. Plane es el tablero; GitHub/Project Vantare
registra código y PRs. Riesgos abiertos: #1471, #1474, #1478, #1527 y #1561.

| Corte | Integración en nightly por el orquestador | CI del PR verificada |
| --- | --- | --- |
| 0–1, #1873 | bc239c063 | 5/5 SUCCESS |
| 2 + P3, #1877 | da4c2af08 | 5/5 SUCCESS |
| REST #1881, #1885 | 56c6df494 | 5/5 SUCCESS |
| 3, #1882 | ec4ca056c70ebdc92bf21d0540c5a65794667f3f | 5/5 SUCCESS; DeepSeek MERGE comunicado |
| 5, #1886 | 9d4982e290c3538d8bd2980c3f23c2d8b76b4183 | 5/5 SUCCESS; DeepSeek MERGE comunicado |
| 9, #1889 | cc5af8de149b7f9156130417fe1dc3545ee4fec7 | 5/5 SUCCESS verificado; DeepSeek MERGE comunicado |

Rama `vantareapp/isa-1868-paso6-scope`, worktree
`D:/VantareServer/worktrees/isa-1868-paso6`, base origin/nightly `cc5af8de1`.
No se han fusionado ramas, promocionado canales o publicado releases desde el worker.

## Corte actual y verificación

Paso 6 del [diseño aprobado](D:/VantareServer/evidence/revision-general/telemetria-overlay-DISENO.md):
`domain::Scope` reúne Source (simulador y live/replay), SessionId y coche del
jugador, sin copiar payloads. Core delega retención en pausa/jugador y reset de
situación; Trackers usa el mismo valor y reinicia también al cambiar fuente.
La ausencia de jugador mantiene su invalidación parcial previa; Paused no
alimenta derivaciones. No se redefine Journal ni la Boundary del pipe.

El contrato exige SessionId nuevo al cambiar un valor conocido de circuito o
tipo. Ausencia/calidad de metadatos no son identidad. La tabla 0(b) conserva
sus casos, con SessionId nuevo en cambios reales de pista/tipo, como hacen los
adapters. La caracterización anterior registraba retención de trackers al
cambiar fuente: pasa a reset, igual que Core y conforme al diseño. Un test
observable comprueba que metadatos Stale no pierden la foto viva ni reinician
la confirmación de Garage. Los límites de frescura y confirmación no cambian.

Caracterización ANTES: `f56fd28ba` y formato `58debe440`.
435/435 unitarios runtime PASS (5 skips), run
`e8d09439-b741-4a64-a9bc-cce0f958a906`; **34/34** telemetría PASS (1 skip), run
`cf7ac234-cd85-46e2-a08d-d854b8804607`. Pruebas de tipo sobre frame LMU real y
vectores ACC SHM/UDP, y garantía de pista/tipo junto a los corpus completos.
LMU47 y ACC cumplen la garantía, incluidos huecos de metadata; bytes/hashes
congelados intactos antes del cambio. ACC completo 189,446 s.
Tanda conjunta domain/runtime por compilar.ps1, target propio, jobs 2 del entorno:
fmt/check/Clippy -D warnings PASS; **781/781** Nextest PASS (8 skips), incluidos
**34/34** telemetría. Run `41a28cba-0b61-45c5-b3fd-d0d8e74b3e40`.
ACC completo 193,066 s, 3849 fotos LMU y hashes de los 190308 DTO ACC intactos.
Quality/integridad 468/468 PASS. Lifecycle **25/25 PASS**, overlays reales normal/QA. El primer build se detuvo
antes de compilar por D: <15 GB libres, fallo conservado. Se retiraron solo cachés Cargo
propias de pasos 0/2 ya integrados, con rutas/tags/links/locks comprobados;
D: pasó de 11,22 a 25,52 GB libres. Código y evidencia conservados, guard sin
cambios; reanudación solo de lifecycle por cola completada. Cola liberada.
Código validado `d1ccd82e04a390a0d1798979a7d6626643d06c11`, árbol native
`928480e7c3b1c98063365af62a87e1f3ae928869`. CI remota de #1891 en curso al publicar; sin atribuir verde.
HEAD/CI de la entrega se verifican en #1868 y #1891; después de d1ccd82e0
solo cambia este handoff fuera de native.

P3 de #1889: constructores Quality con must_use; su test único vive en
`domain/quality.rs`, retiradas las dos copias en LMU/ACC. Riesgos abiertos
conservados arriba. El código productivo de los adapters no cambia en este paso.
Evidencia y contador separado de producción/tests/docs:
`D:/VantareServer/evidence/isa-1868-paso6`. Sin dependencias nuevas ni
regeneración de goldens, corpus, fixtures o baselines.

Paso 9 integrado: revisión DeepSeek MERGE comunicada y CI real 5/5 SUCCESS.
Gates locales: 891/891 Nextest, 34/34 telemetría y lifecycle 25/25 PASS.
El decode por valor del Hub conserva copias; paint-stats solo mide JSON.
Bench orientativo de 47 coches, perfil test, mediana de medias 26,560 us/foto;
no mide coste aislado de clonado ni latencia Live/Release. La revisión de 1248
scripts no encontró parser de freshness.log. Detalles y límites completos
[en el handoff integrado de #1889](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/cc5af8de149b7f9156130417fe1dc3545ee4fec7/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md)
y `D:/VantareServer/evidence/isa-1868-paso9`.

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

Paso 9 integrado y verificado. Revisar #1891, paso 6 y sus P3; siguiente paso 4. El **paso 4 no está hecho**: migra fixtures del repo
a v11, conserva v7/v10 reales para probar los lectores y elimina el alias de
fixtures; exige Snapshot== antes/después y paridad de píxeles sin rebaselinar.
Luego quedan host, proyecciones y medición de los pasos 7, 8 y 10.
