# Handoff vivo — Testing Center

Estado vigente #1594: migración aprobada, aplicada y postcheck PASS;
cliente y worker inerte preparados, gates finales/PR pendientes.
Cron/proveedor/credencial/despliegue cerrados.
Releer issue y buzón antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/testing-center.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

#1594 / VANTA-38 prepara contexto, adjuntos, revisiones y RPC de confirmación
owner para DeepSeek V4.1 Flash. Cliente/worker preparados. Migración aplicada
en ombjshwzqgeisazijduq, history 20261013160000 tras OK explícito del orquestador.
SQL completo en C:/tmp/buzon/1594.md. Sin PR, push, merge o despliegue.
[Contrato y runbook](../../runbooks/testing-contribution-triage.md).

Diagnostico local y reportes con borrador, vista previa, consentimiento y
recibos de sesion. #1535 implementa cuestionarios por version y contribuciones
por cuenta; bugs reutiliza la RPC existente. Cliente y SQL preparado no prueban
activacion del backend: ausencia y errores se presentan sin datos inventados.

## 2. Autoridad y lectura verificada

#1594 y dependencia comercial #1593 leídas. Manda diseño r2 completo
C:/tmp/ola2/diseno-1594-opus.md y encargo del 2026-10-13: DeepSeek vía OpenCode,
PostHog opcional ausente, worker solo propone, owner confirma; descuento fuera.
La condición 2 se cumplió: SQL completo en DUDA, parada y OK posterior
del orquestador sobre SQL 0fd57395...cf6c9 y rollback 206dd635...4e621.

Leídos [#1452](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1452) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con decisiones/avances actuales. GitHub/Project Vantare contiene alcance. [Testing nativo](../../../native/hub/src/testing/README.md), [servicios](../../../native/services/README.md) y [canales](../../branch-channels.md) fijan contratos. #1561 registra/relee compactación, sin enviar informes reales.

## 3. Estado real y canal

#1594: worktree/branch vantareapp/isa-1594-triaje-informes, base exacta
origin/nightly@a0f8569b6ee0228b924ea528c4309b41ecaeddb2. Hito SQL/tests/runbook
1358eb71e97696ed6eae98be6f97ed0510e3f016 (local). Hito ensayo/prueba de
producción 91e2f1af247e3287b696f319816fc2ffa6367500. No PR ni promoción.
GitHub: area:testing-center, state:in-progress y Project Vantare. Intento
Plane En curso falló: script ausente y PR #1599 aún abierto al inicio.

Contexto de la entrega anterior #1535 (no estado remoto refrescado aquí):

Base incorporada mediante merge (sin rebase): `origin/nightly@b2186f82746424b4844a5909efd31530c5bbe5b3`,
que contiene #1570 (handoffs de estado), #1572 (#1563 pedales) y #1573 (#1568 acceso).
Rama `vantareapp/isa-1535-roadmap-testing`, entrega #1535 `3d762e8b`, PR
[#1578](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1578) a nightly.
SHA del merge/push y CI se registran en la issue y `C:/tmp/buzon/1535.md`.
Auto-merge activo por el orquestador; esta escritura no acredita fusion remota ni release.
Servicios IPC v6, DTO v10 y control/derechos v4 son contratos independientes.
#1568 conserva admision protegida, cancelacion serializada y revalidacion;
la correlacion del incidente humano sigue pendiente. El registro archivado
C:/tmp/ola2/1535-backup-cli/FIN-production-applied.md declara aplicado #1535
el 2026-10-13 con gate cerrado. Previa fresca de #1594 confirma gate cerrado.

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

#1594: ensayo de esquema vigente 83/83 pgTAP y restore completo sin red
con 73 conteos exactos. Postcheck local y de producción 25/25 PASS. 73 conteos
originales preservados salvo history +1; tres tablas nuevas vacías. Evidencia
protegida C:/tmp/ola2/1594-backup-cli/, copias detenidas con datos retenidos.
Sin URI/password/filas impresos. También 83/83 pgTAP sobre PostgreSQL local
temporal con fixtures sintéticas;
actor de aplicación NOSUPERUSER+BYPASSRLS. Dos sesiones comprueban tope
concurrente; login real del rol de lectura, rechazo de snapshot obsoleto,
rollback atómico por rol preexistente, rollback con datos denegado, rollback
vacío con preservación legacy y reaplicación PASS. Quality 456 huellas PASS;
git diff --check PASS. Evidencia C:/tmp/ola2/1594-sql-evidence/summary.json.
Rust/Go/frontend no aplican en este hito SQL; no cambiados. Esto no demuestra
Supabase completo, PostgREST/JWT/UI, worker ni proveedor.

Evidencia previa #1535:

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

- SQL #1594 aplicado tras OK, previa fresca, backup recuperable y ensayo
  de esquema vigente. No prueba login/JWT/UI; gates de cliente pendientes.
- Aprobados cuarto parámetro de review (snapshot), topes por fecha/semana UTC
  de envío y purga preparada sin cron. Ventana comercial 45 días/pérdida del tramo
  por dos spams queda en #1593, sin inventar origen de suscripción.
- pg_cron no registrado; rol NOLOGIN sin password. Proveedor pendiente de
  condiciones escritas de privacidad antes de activar. Cliente/worker pendientes.
- P2-4 secretos de repo: riesgo aceptado por Isaac en #1535; sin configuracion en este merge.
- Cuota de contribuciones diferida (P3-9); no inventar un limite aprobado.
- Envio real, bearer/rol, expiracion, logout y replies tardios requieren QA autorizada; no hay historial remoto demostrado.
- Bots/workflows inertes; infraestructura, permisos y despliegues fuera de esta tarea.

## 8. Issues terminadas, activas y pendientes

Activa #1594 para triaje (SQL aplicado, cliente/worker pendientes). Contexto #1535 para cuestionarios/reportes/comunidad; #1452 abierta para puente/envío real. #1521 diseño de bot de guardia es otro alcance. #1496 UI sigue abierta con entregas en base; #1536 y arreglos cerrados. IDs TC/ISA migrados quedan en histórico sin renumeración ni segundo tracker.

## 9. Siguiente acción exacta

Cliente con contexto real/redacción/vista previa/consentimiento, IPC v7;
worker Python inerte con 13 tests offline PASS y consentimiento GUI PASS.
Incorporar nightly vigente, completar gates y PR con auto-merge squash. Por revisar/FIN solo al
completar. No activar cron, LOGIN/password, proveedor ni despliegue del worker.

## 10. Última actualización

2026-10-13 · GitHub #1594 / VANTA-38 · Codex. Hito SQL 1358eb71, base nightly
verificada, sin PR/push. Migración aplicada tras OK, postcheck 25/25 PASS,
backup+restore protegidos y gate nativo cerrado. Hito de evidencia 91e2f1af.
