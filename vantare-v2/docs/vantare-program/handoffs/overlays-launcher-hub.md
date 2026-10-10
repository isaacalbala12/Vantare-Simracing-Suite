# Handoff vivo — Overlays, Studio, Launcher y Hub

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/overlays-launcher-hub.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Hub y Studio GPUI, edición del layout único, widgets del registro y hosts Desktop/Workshop. Launcher presenta perfiles/discovery y gobierna procesos mediante el motor propio. N Looks sobre Board/Motion comunes en Standings, Relative, Delta y Fuel; no hay otra aplicación Wails/React en esta base.

## 2. Autoridad y lectura verificada

GitHub Issues y Project Vantare. Leídos [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561) y decisiones de Isaac, [#1562](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1562), [#1563](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1563), [#1564](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1564), [#1566](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1566) y [#1569](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1569). Entradas: [UI](../../../native/ui/README.md), [Hub](../../../native/hub/README.md), [ADR 0101](../../adr/0101-widgets-looks-common-state.md). Escritura operativa verificada en #1561; no se modifican las issues de otros workers.

## 3. Estado real y canal

Base de código contrastada: `origin/nightly@ca17545f607b85f5d47dc9d060721b69e6a6a158`. Esta compactación vive en `vantareapp/isa-1561-docs`; no cambia producto ni acredita integración de las ramas de ola 2. SHA final y push en [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561) y `C:/tmp/buzon/1561-docs.md`. PR [#1570](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1570) contra nightly, con auto-merge autorizado por el orquestador. Nightly `0cf38ed2` incorporada mediante merge `dbee0c18`; sin promoción ni release. #1562 en `vantareapp/isa-1562-ocultar-fuera-de-pista`: ocultar fuera de pista con garaje solo ante señal explícita LMU `mInGarageStall` (servicio/colas paradas visibles); fmt/Clippy, Nextest 1590/1590, lifecycle 18/18, telemetría 25/25 PASS; captura positiva LMU original pendiente.

## 4. Decisiones cerradas

- Una entrada de registro y una proyección/estado por widget; cambiar Look conserva Motion y no reproyecta.
- Layout v1 conserva nombres persistidos y migración de contenido en memoria; archivo inválido/conflicto no se sobrescribe.
- PR-3 y PR-5 de #1561 quedan para otra entrega. Studio se parte solo en ventana coordinada sin cambios concurrentes; sin entidades nuevas.
- Isaac quiere los otros 14 Looks en una versión siguiente, uno a uno. Pedales necesita Look Vantare antes de vender (#1566), después de separación ajustable (#1563).
- Canvas e inspector comparten documento/historial; preview no sustituye datos live.

## 5. Arquitectura y ownership

[Registro](../../../native/ui/src/registry.rs), [Looks](../../../native/ui/src/look.rs), [layout/documento](../../../native/ui/src/layout.rs), [editor Hub](../../../native/hub/src/document.rs) y [Studio](../../../native/hub/src/studio.rs). Pintores consumen Board/presentación; domain/UI no dependen de runtime. Permisos, transporte y persistencia no viven en el pintor. La cadencia/movimiento reducido aún usa `frame_with_motion`: no documentar PR-5 como integrado.

## 6. Evidencia y límites

Evidencia registrada en la base, no reejecutada por esta entrega documental: integración #1531, fmt/check/Clippy `-D warnings`, Nextest 1574/1574 (7 skips heredados), lifecycle 18/18 y telemetría 25/25. No convierte fixtures/replays en prueba física LMU/ACC, OBS, DPI, audio ni latencia de entrada.
RGBA #1531: 366 pares históricos exactos y 32 capturas DTO v9; ocho slots ES/EN de Standings/Relative con cambio de footer aceptado. Perfil Standings ACC coincide con la entrega aprobada. Delta Eficiencia ACC conserva FAIL p99 aceptado por magnitud, sin causalidad de ruido demostrada (ADR 0101).
**#1536 · destino real de accesos directos en CI Windows:** el test COM compara destinos canonicalizados, mantiene ejecutable existente, bytes intactos, no ejecución y rechazo UNC. Arreglo `d7c6cd17`; histórico completo enlazado arriba. Este detalle pertenece solo a Launcher, no a seis handoffs.

## 7. Riesgos y deuda

- P1: #1562 toca situación/DTO y widgets; su DTO v10 está en rama separada, aquí sigue v9. Coordinar cualquier campo nuevo de #1527 sobre la base realmente integrada.
- P2: #1564/#1569 comparten Studio; no partirlo durante esas entregas. #1524 sigue abierta: autoría no acredita fuente live.
- Evidencia pendiente: input→Present, juego/OBS, DPI físico y macOS. Present/s no mide latencia de entrada.
- Históricos de paridad y goldens se conservan, no se recalibran para cerrar deuda.

## 8. Issues terminadas, activas y pendientes

Cerradas y presentes en la base: #1530–#1534 y #1536; contrastadas con código e historial de integración. Abierta principal: #1561. Pendientes/ramas separadas: #1562, #1563, #1564, #1566, #1567, #1569 y [#1527](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1527). #1496/#1497 siguen abiertas aunque tengan entregas integradas: no cerrarlas por este resumen. IDs ISA/VAN previos permanecen en el histórico por SHA.

## 9. Siguiente acción exacta

Entregar PR-1/PR-2 de #1561 con dos commits y push, sin abrir PR ni fusionar. El orquestador revisa los criterios documentales y coordina PR-3/PR-5; PR-4 espera la ventana de Studio. Otros workers continúan #1562 (señal neutral, global/excepción, previews visibles y gates de telemetría) y #1563 (separación persistida y ancho proporcional); sus entregas no se incorporan aquí. Verificar diff, enlaces, límites de líneas, 10 apartados y una sola nota Launcher #1536.

## 10. Última actualización

2026-10-10 · GitHub #1561 · Codex. Código, README del área e issues leídos; seguimiento #1561 escrito y releído. Las siguientes acciones de área proceden de las issues abiertas, sin nuevas autorizaciones implícitas. El diario y los avances por ronda se escriben en la issue; aquí se sustituye el estado.
