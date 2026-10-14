# Informe #1610 / VANTA-29 · ronda 3

1. Conservados todos los commits de T3 y F2–F4; reanudación limpia en a43ce994.
2. F1 implementado: cliente → Edge testing-report-submit → RPC service_role.
3. Presupuesto durable por IP y cuenta: 5 intentos/día y 20/semana UTC.
4. Rechazos/retries también cuentan; una IP no obtiene otro presupuesto con otra cuenta.
5. Solo HMAC con sal servidor y semana; sin IP cruda, sin logs privados propios.
6. Cabecera cf-connecting-ip exclusiva del gateway alojado; nunca X-Forwarded-For.
7. JWT corto del puente verificado; identidad vigente y cuenta bloqueada comprobadas.
8. RED→GREEN nativo; 10 Edge, 26 pgTAP+concurrencia/rollback, F2–F4 y 35 originales PASS.
9. fmt/check/Clippy PASS; Nextest 1649/1649 (7 skips), lifecycle 18/18; quality 456 PASS.
10. VANTA-29 Por revisar, PR #1618 draft a nightly; sin deploy, merge, promoción o release.

Hito funcional `f3faedb7899386eb67126e6ec86df60ce256b017`; base
`0807fbd0d3d8e354706c580f1bc5f60469b202b4`. HEAD de cierre/push/CI se registra
en la PR, issue y buzón. Última verificación local: 2026-10-14, 04:43 +02:00.
Rama `vantareapp/isa-1610-testing-center-todos`, proyecto Vantare,
label area:testing-center, issue OPEN y GitHub Project In Review; sin milestone.

El primer ensayo F1 de ronda 2 creaba 10 informes desde una IP con dos cuentas.
Ronda 3 añade esa reproducción sobre la Edge, rechazo del sexto e independencia
del presupuesto de cuenta respecto a IP. RED nativo demuestra que el cliente
seguía llamando la RPC cerrada; GREEN demuestra la ruta Edge y payload sin IP,
cuenta ni IDs privados elegidos por el cliente. También hay RED de infraestructura
ausente (nueva RPC/Edge), conservado en `C:/tmp/1610-evidence/r3/`.
Primera invocación Rust sin network falló por selección de features del harness;
se corrigió el comando sin cambiar producto. El RED funcional posterior y GREEN
se conservan en native-red.log/native-green.log.

SQL sobre #1602 exacta @87950380: 26 pgTAP F1IP y dos sesiones reales; quinto
admitido, sexto espera advisory lock, devuelve false y conserva gasto. Down
inerte/reapply PASS; down con presupuesto usado bloqueado. Misma pasada sin
dependencia PASS. F1 ACL original 17/17; F2 6/6; F3 8/8+concurrencia; F4 legacy
íntegro y seis clones protegidos; 35 originales+snapshot+concurrencia+rollback PASS.
El HEAD actual #1602@5d62f624 fue consultado: sus dos archivos SQL probados son
idénticos a @87950380 (git diff vacío); sigue con conflictos y sin integrar.

Deno fmt/lint/typecheck y 10 tests PASS; guard de superficie TS/PowerShell PASS.
La nueva Edge está reconocida como candidata, fuera de los wrappers de deploy.
Mocks Plane/notas 4/4; quality/retirement 456 huellas PASS; diff-check PASS.
Workspace Rust por cola, timeout y CARGO_BUILD_JOBS=2 con target propio:
check/Clippy PASS; Nextest 1649/1649, 7 skips previstos, una prueba Strategy lenta
de 121 s que finalizó PASS; lifecycle 5+13 PASS. Telemetría dedicada no repetida:
solo cambian services/SQL/Edge/docs, no runtime/domain/ipc/testdata. QA visual
no repetida; no hay diseño ni cambio de controles.

Límite relevante: las fuentes oficiales se citan en el commit y
[runbook](testing-report-followup.md). Supabase muestra gateway y uso de
cf-connecting-ip para controles por IP; Cloudflare documenta la cabecera al
origen. Las docs Edge no formalizan sobrescritura para cualquier despliegue.
El backend restringe SUPABASE_URL a project.supabase.co y falla cerrado sin
cabecera/sal. Antes de activar requiere revisar y probar esa frontera alojada;
no se ha probado el gateway real ni se declara Supabase/PostgREST end-to-end.
El borrado de hashes antiguos ocurre con tráfico; sin tráfico espera la siguiente
petición. Rotar la sal dentro de una ventana reiniciaría presupuesto IP.

#1602/#1609 siguen pendientes; capturas públicas, Intake, PostHog consentido y
publicación de notas no se completan con F1. No se leen/configuran secretos,
instalan herramientas ni añaden dependencias. No se toca instalación/datos
de Isaac ni ramas ajenas. Sin subagentes. Acciones externas autorizadas:
seguimiento GitHub/Plane, commits/push y PR draft; producción intacta.

## Evidencia histórica · ronda 2

1. Conservados los siete commits de T3; recuperación en HEAD limpio 47e62675.
2. F2 corregido: «Mis informes» del owner solo incluye sus informes.
3. F3 corregido: marcar fixed no libera la aceptación diaria/semanal.
4. F4 corregido: legacy previo → apply → down inmediato conserva la fila completa.
5. El rollback protege crédito, acuse, estado, consentimiento, nuevos informes y fixed.
6. F1 contenido cerrando RPC directa/v2; falta admisión por cuenta/IP confiable.
7. El envío público queda inoperativo: no activar ni reabrir EXECUTE para sortear F1.
8. RED/GREEN por hallazgo y gates SQL sobre #1602 exacta; mocks sin red.
9. Sin cambios Rust/visuales, dependencias nuevas, producción ni Plane real.
10. Misma rama y PR #1618 draft a nightly; sin merge/promoción/release.

[Issue #1610](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1610)
· [PR #1618](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1618)
· GitHub Project Vantare, area:testing-center, issue OPEN y sin milestone.
VANTA-29 «Por revisar» es evidencia de la ronda anterior; no se consulta ni cambia
Plane real en ronda 2. Canal alcanzado: rama de issue, base nightly 0807fbd0.
Último HEAD/push y estado CI constan en la PR y en el buzón 1610.md.

| Hallazgo | Commit | RED → GREEN |
| --- | --- | --- |
| F1 · contención, admisión pendiente | 0cc3c7d7 | Dos cuentas desde una IP crean 10 informes; 15/17 RED. Tras cierre de EXECUTE: 17/17 GREEN sin grant sintético; retries/IP distintas y marcador cliente también denegados. |
| F2 · historial owner | fa552e15 | 5/6 RED: informes ajenos, fixed sin versión y página global desplaza el propio. 6/6 GREEN; administración owner conserva acceso. |
| F3 · presupuesto de aceptación | df1d9db4 | 6/8 RED: diario/semanal se liberan tras fixed. 8/8 GREEN; dos sesiones esperan lock 1594, rechazan tercera semanal y revierten review. |
| F4 · rollback poblado | 113bf741 | Down inmediato falla por backfill (RED). GREEN conserva toda la fila y rechaza seis clones con actividad independiente, incluido off/on/off. |

F3 añade un guard de aceptación en la frontera de estado; mantiene UTC y lock
1594 de #1602 sin reemplazar su RPC ni editar/fusionar su rama. La transacción
revierte la review insertada si el estado excede el presupuesto. F4 marca la
actividad de seguimiento de forma durable: un backfill intacto es reversible;
una revocación con campos finales iguales al baseline también debe preservarse.

Logs: C:/tmp/1610-evidence/r2/. Runner: supabase/tests/run-followup-local.py,
flags --regression F1/F2/F3/F4; SQL #1602@87950380 extraído de Git a carpeta
temporal. No es merge ni consulta a Supabase. PostgreSQL sin TCP, fixtures
sintéticas y actor de migración NOSUPERUSER BYPASSRLS.

| Gates ronda 2 | Resultado |
| --- | --- |
| F1/F2/F3 combinados con #1602 | 17/17 + 6/6 + 8/8; F3 con concurrencia adicional |
| F4 con #1602 y sin dependencia | Legacy íntegro; seis rollbacks activos denegados |
| Suite semántica original con/sin #1602 | 35/35, snapshot antiguo, dos sesiones quinto/sexto, rollback/reapply |
| Mocks Plane/notas | 4/4, sin transporte/red |
| Quality/retirement | 456 huellas PASS |
| Rust fmt/check/Clippy/Nextest/lifecycle/telemetría | No repetidos: ningún archivo Rust/fixture nativo cambia en ronda 2 |

La suite semántica original conserva sus 35 tests sin cambios. Usa
--internal-submit para un grant **solo en su clúster desechable**; no acredita
admisión/IP. F1 prueba los ACLs reales de la migración sin ese grant y el runner
rechaza mezclar ambos flags. Rust anterior en 4b22f1ae: fmt/check/Clippy PASS,
Nextest 1649/1649 (7 skips), lifecycle 18/18, telemetría 25/25; evidencia histórica
de la primera ronda, no ejecución nueva. CI remoto se informa por SHA aparte.

F1 no puede cerrarse con seguridad sin la frontera ausente: no hay origen IP
verificado ni presupuesto durable para peticiones rechazadas/reintentos. No se
usó un X-Forwarded-For del cliente ni se guardaron IPs crudas. Requiere diseño e
integración revisada con Intake; el SQL de este corte queda cerrado e inerte.
También siguen pendientes #1602/#1609, capturas públicas/unión de recibos legacy,
referencia PostHog consentida y publicación de notas. No es entrega end-to-end.

No se realizaron QA visual/DPI/teclado, instalación, JWT/PostgREST completo,
cuentas reales, publicación o sesiones físicas LMU/ACC. No se tocaron instalación,
ajustes/datos de Isaac, ramas ajenas ni secretos. Sin subagentes ni herramientas
nuevas. Acciones externas de ronda 2: seguimiento GitHub, push y actualización de
PR draft autorizados; sin Plane real, merge, release ni producción.

[Runbook](testing-report-followup.md) ·
[Handoff vivo](../vantare-program/handoffs/testing-center.md).
