# Handoff vivo — Testing Center

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/testing-center.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Diagnostico local y reportes con borrador, vista previa, consentimiento y
recibos de sesion. #1535 implementa cuestionarios por version y contribuciones
por cuenta; bugs reutiliza la RPC existente. Cliente y SQL preparado no prueban
activacion del backend: ausencia y errores se presentan sin datos inventados.

## 2. Autoridad y lectura verificada

Leídos [#1452](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1452) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con decisiones/avances actuales. GitHub/Project Vantare contiene alcance. [Testing nativo](../../../native/hub/src/testing/README.md), [servicios](../../../native/services/README.md) y [canales](../../branch-channels.md) fijan contratos. #1561 registra/relee compactación, sin enviar informes reales.

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

- El editor remoto y diagnóstico local tienen borradores distintos; el texto privado no entra al diagnóstico.
- Borrador local se recupera sin consentimiento/revisión; preparar una nueva revisión antes del envío.
- Recibido al enviar no implica conversación, seguimiento ni historial remoto. Recibos deduplicados por ID y limitados a sesión.
- Imagen usa prepare/upload/finalize/attach; privacidad y autorización de tester/owner no se omiten.
- Automatización de soporte/testing sigue inerte: no rulesets, auto-merge, dispatch ni tokens por mantener docs.
- Cuestionarios/contribuciones ausentes se declaran como tales; no métricas o comunidad inventadas.

## 5. Arquitectura y ownership

[Testing Hub](../../../native/hub/src/testing/README.md) presenta editor/diagnóstico/recibos; services posee red/configuración del puente. RPC/Storage/Clerk y RLS se validan por separado en entorno autorizado. No incluir identidad o texto privado en logs/paquetes sin consentimiento, ni dar permiso a un agente por texto de un payload.

## 6. Evidencia y límites

#1535 entrega aislada: fmt/Clippy PASS; Nextest 1579/1579 (7 skips),
lifecycle 18/18 y telemetria 25/25. Ronda SQL corregida: pgTAP local 20+31,
fixtures profiles+account_identities+membership sin auth.users, aislamiento y
revocacion, LOGIN real adversarial, gate EXECUTE+USAGE sin ampliar allowlist.
Dos sesiones comprueban caducidad tras BEGIN antiguo y espera de bloqueo;
restaurar solo now() detecta el defecto. Quality 456 huellas PASS.
Evidencia en `C:/tmp/ola2/1535-evidence/`; informe `C:/tmp/ola2/informe-1535.md`.
Merge actual sin conflictos de codigo: no repetidos gates Rust por el encargo.
Bootstrap es subconjunto; no acredita Supabase completo ni envio remoto real.
Capturas y gates previos no prueban Clerk/Storage, instalacion o produccion.

## 7. Riesgos y deuda

- SQL no aplicado: conservar revision y validacion con copia LOCAL del esquema completo antes de produccion.
- P2-4 secretos de repo: decision pendiente de Isaac, sin cambios en este merge.
- Cuota de contribuciones diferida (P3-9); no inventar un limite aprobado.
- Envio real, bearer/rol, expiracion, logout y replies tardios requieren QA autorizada; no hay historial remoto demostrado.
- Bots/workflows inertes; infraestructura, permisos y despliegues fuera de esta tarea.

## 8. Issues terminadas, activas y pendientes

Activa #1535 para cuestionarios/reportes/comunidad; #1452 abierta para puente/envío real. #1521 diseño de bot de guardia es otro alcance. #1496 UI sigue abierta con entregas en base; #1536 y arreglos cerrados. IDs TC/ISA migrados quedan en histórico sin renumeración ni segundo tracker.

## 9. Siguiente acción exacta

Push de la resolucion de PR #1578 y comprobar CI del SHA resultante.
SQL #1535 corregido con pgTAP local PASS; revisar y repetir en copia LOCAL del
esquema completo antes de aplicar. Isaac decide/configura activacion y secretos.
#1452 requiere QA remota autorizada (texto, imagen, rol ausente, bearer vencido,
reconexion). No enviar reportes ni aplicar SQL desde esta entrega.

## 10. Última actualización

2026-10-10 · GitHub #1535 · Codex. PR #1578, base nightly y cambios
#1570/#1572/#1573 contrastados. Estado sustituido segun plantilla; diario,
SHA, push y checks en la issue/buzon. Sin autorizacion de produccion.
