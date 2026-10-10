# Handoff vivo — Testing Center

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/testing-center.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Diagnóstico local y envío de reportes con borrador, vista previa, consentimiento y recibos de sesión. Cuestionarios/comunidad son «Próximamente» en esta base; las nuevas tablas/vistas de #1535 están en otra rama.

## 2. Autoridad y lectura verificada

Leídos [#1452](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1452) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con decisiones/avances actuales. GitHub/Project Vantare contiene alcance. [Testing nativo](../../../native/hub/src/testing/README.md), [servicios](../../../native/services/README.md) y [canales](../../branch-channels.md) fijan contratos. #1561 registra/relee compactación, sin enviar informes reales.

## 3. Estado real y canal

Base de código contrastada: `origin/nightly@ca17545f607b85f5d47dc9d060721b69e6a6a158`. Esta compactación vive en `vantareapp/isa-1561-docs`; no cambia producto ni acredita integración de las ramas de ola 2. SHA final y push en [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561) y `C:/tmp/buzon/1561-docs.md`. PR [#1570](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1570) contra nightly, con auto-merge autorizado por el orquestador. Nightly `0cf38ed2` incorporada mediante merge `dbee0c18`; sin promoción ni release. #1535 reporta hito Testing `7900e08e`: IPC v6, cuestionarios y contribuciones en rama local; RLS/pgTAP/revisión pendientes y nada aplicado en producción. La base documental actual conserva servicios v5. #1452 sigue abierta para verificar envío remoto real.

## 4. Decisiones cerradas

- El editor remoto y diagnóstico local tienen borradores distintos; el texto privado no entra al diagnóstico.
- Borrador local se recupera sin consentimiento/revisión; preparar una nueva revisión antes del envío.
- Recibido al enviar no implica conversación, seguimiento ni historial remoto. Recibos deduplicados por ID y limitados a sesión.
- Imagen usa prepare/upload/finalize/attach; privacidad y autorización de tester/owner no se omiten.
- Automatización de soporte/testing sigue inerte: no rulesets, auto-merge, dispatch ni tokens por mantener docs.
- Cuestionarios/contribuciones ausentes se declaran como tales; no métricas o comunidad inventadas.

## 5. Arquitectura y ownership

[Testing Hub](../../../native/hub/src/testing/README.md) presenta editor/diagnóstico/recibos; services posee red/configuración del puente. RPC/Storage/Clerk y RLS se validan por separado en entorno autorizado. No incluir identidad o texto privado en logs/paquetes sin consentimiento, ni dar permiso a un agente por texto de un payload.

## 6. Evidencia y límites

Evidencia registrada en la base, no reejecutada por esta entrega documental: integración #1531, fmt/check/Clippy `-D warnings`, Nextest 1574/1574 (7 skips heredados), lifecycle 18/18 y telemetría 25/25. No convierte fixtures/replays en prueba física LMU/ACC, OBS, DPI, audio ni latencia de entrada. Capturas R5 históricas 96 GPUI +96 mockup, matrices inspeccionadas: composición visual, no envío/Clerk/Storage reales. La integración de la base preserva formulario/adjuntos/recibos; el código no prueba activación de tablas nuevas. #1535 reporta tests offline y quality/456 huellas, con gates/capturas/pgTAP/revisiones pendientes al leer.

## 7. Riesgos y deuda

- P1: #1535 requiere revisión Sol+Opus de migración/RLS antes de aplicar producción y pgTAP; no asumir autorización satisfecha porque la migración existe.
- P2: envío real autorizado, bearer/rol, expiración, logout y replies tardíos requieren QA de servicio.
- P2: seguimiento/historial/conversación no demostrados en servicios v5. Reportar ausencia, no mock como backend.
- Mantener bot y workflows inertes; configuración/despliegue de terceros fuera de esta entrega.

## 8. Issues terminadas, activas y pendientes

Activa #1535 para cuestionarios/reportes/comunidad; #1452 abierta para puente/envío real. #1521 diseño de bot de guardia es otro alcance. #1496 UI sigue abierta con entregas en base; #1536 y arreglos cerrados. IDs TC/ISA migrados quedan en histórico sin renumeración ni segundo tracker.

## 9. Siguiente acción exacta

Completar #1535 en su rama: gates/capturas de Hub y revisión Sol+Opus de migración, RLS y vínculo al UUID interno; ejecutar pgTAP en entorno disponible antes de activar. Bugs reutiliza RPC existente. #1452 requiere QA remota autorizada (sin imagen, imagen validada, rol ausente, bearer vencido y reconexión). Esta rama docs solo entrega/push de #1561; no envía reportes, aplica SQL ni configura secretos.

## 10. Última actualización

2026-10-10 · GitHub #1561 · Codex. Código, README del área e issues leídos; seguimiento #1561 escrito y releído. Las siguientes acciones de área proceden de las issues abiertas, sin nuevas autorizaciones implícitas. El diario y los avances por ronda se escriben en la issue; aquí se sustituye el estado.
