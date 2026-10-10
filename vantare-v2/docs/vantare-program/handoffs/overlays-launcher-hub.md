# Handoff vivo — Overlays, Studio, Launcher y Hub

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/overlays-launcher-hub.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Hub y Studio GPUI, edición del layout único, widgets del registro y hosts Desktop/Workshop. Launcher presenta perfiles/discovery y gobierna procesos mediante el motor propio. N Looks sobre Board/Motion comunes en Standings, Relative, Delta y Fuel; no hay otra aplicación Wails/React en esta base.

## 2. Autoridad y lectura verificada

GitHub Issues y Project Vantare. Leídos [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561) y decisiones de Isaac, [#1562](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1562), [#1563](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1563), [#1564](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1564), [#1566](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1566) y [#1569](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1569). Entradas: [UI](../../../native/ui/README.md), [Hub](../../../native/hub/README.md), [ADR 0101](../../adr/0101-widgets-looks-common-state.md). Escritura operativa verificada en #1561; no se modifican las issues de otros workers.

## 3. Estado real y canal

Base incorporada mediante merge (sin rebase): `origin/nightly@661149b07565137a2450580169fd608ebeb2bd42`,
que contiene #1570 (handoffs de estado), #1572 (#1563 pedales) y #1573 (#1568 acceso).
Rama `vantareapp/isa-1535-roadmap-testing`, entrega #1535 `3d762e8b`, PR
[#1578](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1578) a nightly.
SHA del merge/push y CI se registran en la issue y `C:/tmp/buzon/1535.md`.
Auto-merge activo por el orquestador; esta escritura no acredita fusion remota ni release.
Servicios IPC v6, DTO v9 y control/derechos v4 son contratos independientes.
#1568 conserva admision protegida, cancelacion serializada y revalidacion;
la correlacion del incidente humano sigue pendiente. SQL #1535 no aplicado.

## 4. Decisiones cerradas

- Una entrada de registro y una proyección/estado por widget; cambiar Look conserva Motion y no reproyecta.
- Layout v1 conserva nombres persistidos y migración de contenido en memoria; archivo inválido/conflicto no se sobrescribe.
- PR-3 y PR-5 de #1561 quedan para otra entrega. Studio se parte solo en ventana coordinada sin cambios concurrentes; sin entidades nuevas.
- Isaac quiere los otros 14 Looks en una versión siguiente, uno a uno. Pedales necesita Look Vantare antes de vender (#1566), con separacion ajustable (#1563) ya integrada.
- Canvas e inspector comparten documento/historial; preview no sustituye datos live.

## 5. Arquitectura y ownership

[Registro](../../../native/ui/src/registry.rs), [Looks](../../../native/ui/src/look.rs), [layout/documento](../../../native/ui/src/layout.rs), [editor Hub](../../../native/hub/src/document.rs) y [Studio](../../../native/hub/src/studio.rs). Pintores consumen Board/presentación; domain/UI no dependen de runtime. Permisos, transporte y persistencia no viven en el pintor. La cadencia/movimiento reducido aún usa `frame_with_motion`: no documentar PR-5 como integrado.

## 6. Evidencia y límites

Merge #1535 sin conflictos de codigo; cambios entrantes nativos identicos a
nightly. Gates Rust no repetidos por la condicion del encargo. Testing/Roadmap
conserva los checks de su rama y SQL local; no se acredita CI remota del merge.

Evidencia registrada en la base, no reejecutada por esta entrega documental: integración #1531, fmt/check/Clippy `-D warnings`, Nextest 1574/1574 (7 skips heredados), lifecycle 18/18 y telemetría 25/25. No convierte fixtures/replays en prueba física LMU/ACC, OBS, DPI, audio ni latencia de entrada.
RGBA #1531: 366 pares históricos exactos y 32 capturas DTO v9; ocho slots ES/EN de Standings/Relative con cambio de footer aceptado. Perfil Standings ACC coincide con la entrega aprobada. Delta Eficiencia ACC conserva FAIL p99 aceptado por magnitud, sin causalidad de ruido demostrada (ADR 0101).
**#1536 · destino real de accesos directos en CI Windows:** el test COM compara destinos canonicalizados, mantiene ejecutable existente, bytes intactos, no ejecución y rechazo UNC. Arreglo `d7c6cd17`; histórico completo enlazado arriba. Este detalle pertenece solo a Launcher, no a seis handoffs.

## 7. Riesgos y deuda

- P1: #1562 toca situación/DTO y widgets; su DTO v10 está en rama separada, aquí sigue v9. Coordinar cualquier campo nuevo de #1527 sobre la base realmente integrada.
- P2: #1564/#1569 comparten Studio; no partirlo durante esas entregas. #1524 sigue abierta: autoría no acredita fuente live.
- Evidencia pendiente: input→Present, juego/OBS, DPI físico y macOS. Present/s no mide latencia de entrada.
- Históricos de paridad y goldens se conservan, no se recalibran para cerrar deuda.

## 8. Issues terminadas, activas y pendientes

Cerradas y presentes en la base: #1530–#1534 y #1536; contrastadas con código e historial de integración. Abierta principal: #1561. Integrada #1563 por #1572. Pendientes/ramas separadas: #1562, #1564, #1566, #1567, #1569 y [#1527](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1527). #1496/#1497 siguen abiertas aunque tengan entregas integradas: no cerrarlas por este resumen. IDs ISA/VAN previos permanecen en el histórico por SHA.

## 9. Siguiente acción exacta

Resolver/push de #1578 con el formato de estado de #1570. Preservar #1563
(separacion persistida 0-12 px, defecto 2 px y ancho proporcional) y #1568
(admision/cancelacion de acceso), ya integrados en la base. #1535 conserva
Roadmap ClickUp/Supabase y participacion Testing IPC v6 sin activar backend.
El orquestador coordina Studio/#1564/#1569 y los PR-3/PR-5 restantes de #1561;
no ampliar esta resolucion. Verificar CI remoto antes de acreditar integracion.

## 10. Última actualización

2026-10-10 · GitHub #1535 · Codex. PR #1578, base nightly y cambios
#1570/#1572/#1573 contrastados. Estado sustituido segun plantilla; diario,
SHA, push y checks en la issue/buzon. Sin autorizacion de produccion.
