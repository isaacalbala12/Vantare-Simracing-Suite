# Informe #1610 / VANTA-29 · ronda 2

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
