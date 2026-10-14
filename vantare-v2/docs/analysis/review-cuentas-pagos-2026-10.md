# Revisión de cuentas y pagos · #1608 · 14/10/2026

## Integración autorizada tras review r3 APTA

Se reanuda el worktree limpio en `8fecf307` y se avanza sin reescribir historia
al merge remoto publicado `812ed8ec`. Se fusiona `origin/nightly@5b781964`
(#1611/#1617/#1618) en `vantareapp/isa-1608-cuentas-y-pagos`, con merge.
Único archivo en conflicto: `native/services/src/app.rs`. La resolución mantiene
la revocación con ACK al rechazar definitivamente la renovación; el candidato
correcto se transfiere al núcleo antes de registrar las observaciones consentidas
de cuenta/licencia comercial de #1609. No se decide ni cambia comportamiento.

Evidencia nueva `C:/tmp/1608-merge/`: fmt/check/Clippy PASS; Deno 534 PASS/
1 ignored existente; SQL cuentas/pagos 230 PASS; Testing Center 35 pgTAP más
concurrencia/rollback y F1/F1IP/F2/F3/F4 PASS. Integridad 456 huellas, 138 tests
de scripts GitHub, 8 de paneles y 4 de followup, snippet Node PASS.
Nextest/lifecycle/telemetría en curso por cola, target propio y QA aislada.
Los fallos Deno por resolución de tipos, cwd y permisos quedan en logs; se
corrige la invocación sin editar tests. B01/B02/B03 siguen No-Go comercial;
su sonda RED SQL se conserva fuera del recuento de gates GREEN.
Último SHA/push/CI/estados se actualizan al cierre. Sin promoción a nightly,
producción, compras/refunds, datos reales, UI nueva, subagentes ni release.

## Ronda 3 · R2-N1, cambio de identidad sin CoreLink

Review completa: `C:/tmp/ola2/review-1615-sol-r2.md`, NO APTO en `b5be4303`.
Misma rama/PR draft #1615, base `69fa2d65`, sin integrar nightly ni #1523.
Los planes B01–B03 están aceptados como planes y conservan el No-Go comercial;
esta ronda no los implementa. El bloqueo nuevo es la herencia local de derechos.

### Resumen de diez líneas para Isaac · ronda 3

1. Los commits anteriores se conservan; worktree limpio al reanudar en `b5be4303`.
2. R2-N1 reproduce el login B detached que guardaba B sin revocar el candidato A.
3. Dos RED nuevos cubren cuenta A restaurada y candidato previo sin identidad.
4. `64e9eec5` exige la revocación común antes de guardar identidad distinta o ausente.
5. Sin núcleo el cambio falla, conserva la cuenta anterior y exige reintento gestionado.
6. Con núcleo se exige Invalidate ACK durable antes de retirar candidato y guardar B.
7. `04cfe8df` comparte el callback; no hay allow, tests relajados ni dependencia nueva.
8. GREEN: fmt/check/Clippy, 1654 Nextest/7 exclusiones y 18 lifecycle; logs `C:/tmp/1608-r3/`.
9. B01/B02/B03 permanecen abiertos como No-Go comercial con sus planes aceptados.
10. Misma draft #1615 a nightly; sin producción, UI nueva, subagentes, merge o release.

RED nuevo: login OAuth B mediante AccountPoll sin CoreLink conserva el candidato
A y guarda B; se reproduce también con candidato previo y ninguna identidad
restaurada. Dos regresiones fallan contra el código anterior (`red.log`).
Arreglo mínimo en `native/services/src/app.rs`: `is_none_or` detecta la ausencia
de identidad y se retira la condición `core.is_some()` de la revocación.
`revoke_local` exige Invalidate ACK durable antes de retirar candidato; si falta
CoreLink o falla el ACK, no se guarda B. Logout/rechazo OAuth ya usan esa ruta.
No se escribe el binding desde services ni se implementa borrado remoto (B03).
El primer login sin identidad también necesita núcleo, pues no puede demostrar
la ausencia de un binding antiguo. La regresión IPC #1548 conserva todos sus
asserts y añade el ACK al completar ese primer login gestionado.

Fix `64e9eec5`; tests finales `04cfe8df` (callback compartido sin cambiar asserts,
ausencia del candidato comprobada por NotFound). GREEN focal 49/49, incluido
Owner/Launch y el IPC #1548; fmt/check/Clippy PASS. Nextest completo nuevo:
1654 PASS/7 exclusiones existentes del perfil; lifecycle 18 PASS. La paridad
larga termina en 124 segundos, sin alterar tests. Quality/retirada 456 huellas
PASS; canal 45 y release-notes 26 tests PASS; fragmento ISA-1608 válido.
`clippy-initial.log` conserva el fallo de dos tests de 103/102 líneas;
se extrajo el callback común sin allow ni cambio productivo adicional.
Evidencia nueva `C:/tmp/1608-r3/`, target propio
`native/target/gates`, dos jobs y APPDATA/LOCALAPPDATA aislados.
Código probado `04cfe8df`; los cambios posteriores son solo informe, handoff y
fragmento. SHA-256 de app.rs probado:
`762cff81d9ca74d711b857bcaadbde8834cc5e1746aa28cf4e6159ebffb7d003`.
HEAD/push/PR/CI y estado Plane finales se registran tras publicar en issue/buzón.
Diff completo de esta ronda y `git diff --check 69fa2d65` revisados, sin conflictos.
Las regresiones de AccountPoll comprueban sesión durable/candidato y ACK con
fixture de transporte. La regresión existente de Owner/Launch perpetua comprueba
por separado el binding real, logout gestionado y reapertura en Free; no se
presenta el fixture de IPC como Owner real ni como login comercial con Clerk.

Deno/SQL/telemetría no se repiten en esta ronda: solo cambia services y documentos,
sin cambios en runtime/domain/ipc/testdata/Functions/SQL. Su evidencia de ronda 2
se conserva más abajo y no cuenta como gate nuevo. GUI, login con cuentas reales,
PostgREST/TPA, backend comercial y corte combinado con nightly/#1612/#1523 siguen
sin acreditarse. Verificación manual futura solo con fixture aislado autorizado:
A con Launch, intento B detached rechazado sin guardar B; reintento gestionado,
reinicio de Owner en Free y ausencia del candidato A antes de TransferRights.

## Ronda 2 · respuesta a la review independiente #1615

Review completa: `C:/tmp/ola2/review-1615-sol.md`, NO APTO en `ba02b093`.
Misma rama y base `69fa2d65`; sin rebase ni integración de #1523.
El informe de ronda 1 que sigue es evidencia histórica; sus cierres parciales
F02/F04/F08 quedan corregidos o limitados por esta sección.

### Resumen de diez líneas para Isaac · ronda 2

1. Misma rama/PR draft #1615, base `69fa2d65`; los nueve fixes previos se conservan.
2. N1/F08: sin núcleo autorizado no se confirma revocación; reintento gestionado con ACK.
3. Launch v1 perpetua instalada en Owner queda Free tras logout gestionado y reinicio.
4. N2/F02: OAuth 400 invalid_grant retira derechos/candidato y sesión; otros fallos preservan offline.
5. N3/F04: Pro production y grants sandbox coexisten sin bloquear emisión de producción.
6. El cliente Polar vinculado conserva su UUID pese a external_customer_id contradictorio.
7. RED→GREEN por arreglo; Deno 524 PASS/1 ignored y SQL desechable 230 GREEN.
8. Gates nuevos GREEN: fmt/check/Clippy, Nextest 1652 PASS/7 skips, lifecycle 18 y telemetría 25.
9. B01/B02/B03 siguen P1 y No-Go: planes por archivo, riesgo, pruebas y decisión de Isaac.
10. Sin producción, compras/refunds, datos instalados, subagentes, UI nueva, merge ni release.

| Hallazgo | Cambio y evidencia de esta ronda |
| --- | --- |
| N3 / F04 | El loader recibe el entorno fijado por servidor y filtra `billing_access_grants.environment`. Handler nativo y ruta legacy pasan el mismo entorno a lectura y firma. El normalizador sigue rechazando filas ajenas; soporte del entorno solicitado se conserva. RED: mezcla production/sandbox → 409. GREEN: 67 tests emisor/handler; credencial con Pro+calendar de producción, sin Launch sandbox. Logs `C:/tmp/1608-r2/N3-{red,green-corrected}.log`. |
| Atribución residual | `resolveUserId` consulta primero el binding Polar+entorno+customer; ese UUID prevalece sobre external_customer_id raíz/anidado contradictorio. Sin binding conserva el contrato de external ID existente; no se presenta como cierre de checkout/atribución completo. RED: cliente A + external B devuelve B. GREEN: 52 tests procesador, incluyendo entornos distintos y metadata no autoritativa. Logs `attribution-{red,green}.log`. |
| N1 / F08 / parte F02 | Opción mínima de la review: sin CoreLink no se confirma logout ni se inicia renovación HTTP, porque no se puede revocar el binding del propietario. Se devuelve Unconfigured y se conserva estado para reintento gestionado. Con núcleo se exige Invalidate durable antes de borrar candidato/sesión. RED: dos tests fallan por falso éxito del auxiliar con binding Owner previamente instalado. GREEN: cuatro focales; el test real arranca host, hace logout gestionado, cierra/reabre Owner y demuestra ausencia de derechos. Logs `N1-{red,green}.log`. No se escribe el almacén del núcleo desde services ni se cambia formato/protocolo. |
| N2 / F02 | Solo HTTP 400 con JSON OAuth `error=invalid_grant` se clasifica Authentication (RFC 6749 §5.2). Refresh explícito y automático comparten ACK Invalidate, retirada de candidato, tombstone de cuenta y descarte de bearer de datos. Sin núcleo el refresh se detiene antes de HTTP. RED: invalid_grant era Protocol. GREEN: 6 focales, incluida renovación de licencia/cuenta/perfil, cero llamadas a userinfo/native-license tras rechazo; 400 genérico/malformado y 429/503 conservan derechos/sesión. Logs `N2-{red,green-corrected}.log`; N1 verifica la durabilidad del mismo Invalidate con Owner real. |

Los cuatro arreglos están en commits separados. Gates completos nuevos GREEN: fmt/check/Clippy, Nextest 1652 PASS/7 skips,
lifecycle 18 y telemetría 25 PASS. B01/B02/B03 permanecen abiertos con los planes siguientes.
No se eleva evidencia previa a verde nuevo. `N2-green.log` conserva un primer
intento interrumpido: el fixture hacía join del core antes de solicitar refresh;
se corrigió la sincronización y el GREEN final no tiene ese bloqueo ni warnings.
Dos ejecuciones Deno completas iniciales fallaron por permisos de lectura
estrechos de scripts/código público; se ampliaron únicamente esas rutas, sin
acceso a `.env*`, cambios de tests ni permisos de red. Final: 524 PASS/1 ignored.
PostgreSQL 18 desechable repetido: 230 assertions GREEN; B01 sigue 1 RED
`not_authenticated`. B02 repetido: cuatro RED (incluido agregado), sin skips.
N1 reforzado con Launch v1 **perpetua**: instalar binding, cerrar Owner, pedir
logout detached, comprobar error y binding vigente, ejecutar logout gestionado
por host y reabrir Owner en Free. RED contrafactual restaurando solo la rama de
logout de `ba02b093`; GREEN 2 focales (`N1-launch-{red,green-rebuilt}.log`).
La primera restauración conservó mtime y Cargo reutilizó el binario RED;
`N1-launch-green.log` conserva ese fallo. SHA-256 del source restaurado idéntico,
mtime actualizado y recompilación explícita antes del GREEN y gates finales.
Primer Nextest completo: 1157 PASS/1 FAIL/7 skips, 494 no ejecutados porque el
fixture de `device_limit` carecía de CoreLink. Se añade el vínculo gestionado y
se exige el ACK, manteniendo íntegros los asserts del reply y del marco IPC.
Logs `test-failed-detached-device-limit.log` y `check-failed-fixture-patch.log`
(una edición del fixture mal situada, corregida); suite completa repetida.
`clippy-initial.log`: wildcard de la única variante restante, sustituido por
`Command::AccountBegin`, sin allow ni cambio de comportamiento.

Rutas de los arreglos, relativas a raíz Git:
`vantare-v2/native/services/src/app.rs:121,178,235`,
`vantare-v2/native/services/src/account.rs:240`,
`vantare-v2/native/runtime/src/rights/tests.rs:336`,
`supabase/functions/_shared/license-credential.ts:506,521`,
`supabase/functions/native-license/index.ts:91` y
`supabase/functions/billing-webhook/process.ts:199,219`.

### Plan concreto de los bloqueos (sin ejecución de producción)

Se contrastó el código de `#1523@33be660d` y su PR OPEN/draft con esta base;
no se trasplantaron fragmentos ni se hizo merge. Estos tres bloqueos permanecen
P1. El corte completo necesita revisión/integración y aceptación separadas.

**B01 · Identidad Clerk-only y bearer de datos.** El cambio afecta autoridad,
RPC/RLS y configuración PostgREST; aceptar dos claims de proveniencia en la
función legacy no es un arreglo local seguro.

1. Revisar juntos `supabase/migrations/20261008210000_clerk_identity_cutover.sql`
   y `20261008233000_clerk_native_data_boundary.sql` de #1523, el resolver
   `20261002130000_native_license_bridge.sql`,
   `supabase/functions/native-account-authorize/index.ts` y
   `native/services/src/{bridge,license_remote}.rs`. Conservar `(issuer,sub)` →
   UUID y verificar la firma y procedencia del bearer; retirar la dependencia
   operativa de `auth.users` sin borrar usuarios/datos históricos.
2. Probar en PostgreSQL/PostgREST aislados: Clerk-only puede resetear su equipo;
   otro UUID, issuer no fijado, claims falsos, token Supabase legacy y TTL >300 s
   no pueden leer/resetear. Ejecutar `clerk_native_data_boundary_test.sql`,
   `clerk_identity_cutover_test.sql` y bridge nativo con JWT real, no solo claims
   SQL simulados. Inspeccionar ACL/RLS y cero ampliaciones para anon.
3. Isaac decide el corte coordinado #1523, issuer/audiencia/firmante de datos y
   ventana de migración/rollback. Después autoriza por separado configuración
   TPA/JWT y despliegue. Riesgo: aceptar un JWT legacy como Clerk, bloquear
   cuentas válidas o permitir acceso cruzado al cambiar la autoridad.

**B02 · Refund ordinario, Pro, parcial y `order.refunded` agregado.**
`RefundLedgerInput.paymentId` y `billing_refunds.provider_payment_id` son
obligatorios aquí; `parseOrderLedgerInput` y el procesador solo admiten Launch
one-time; Memory/SQL revocan por total. Cambiar solo TypeScript dejaría distinto
el comportamiento durable SQL. La [API Polar vigente](https://polar.sh/docs/api-reference/2026-10/refunds/create-refund)
identifica el refund por `order_id`, y muestra `payment_id` dentro de disputa.

1. Revisar/integrar el paquete monetario #1523:
   `supabase/migrations/20261008220000_billing_identity_refunds.sql`,
   `supabase/functions/billing-webhook/{process,order-refund-ledger,disputes}.ts`,
   `subscription-lifecycle-store.ts`, `billing-reconcile/{worker,checkouts}.ts`
   y `supabase/functions/_shared/license-credential.ts`. Payment ID nullable,
   vínculo durable order→UUID/checkout/entorno/subscription y restricción de
   refund/disputa independiente de grants paid-through. No inventar payment ID
   ni atribuir por email; una renovación tardía no debe levantar la restricción.
2. Conservar RED ordinario/Pro/parcial de `billing-blockers.test.ts`; añadir
   orden agregada totalmente refundada sin `refund.updated`, out-of-order,
   pending→failed/canceled, late renewal, otra fuente activa y separación de
   entornos. Comparar el ledger en memoria con SQL real usando
   `billing_identity_refunds_test.sql` y `lifecycle-matrix.test.ts`, y verificar
   emisión nativa sin los derechos de la fuente revocada. Reconciliación debe
   resolver el agregado aunque falte el evento de refund; no declarar cerrado
   ese caso solo por integrar un parser. Matriz sandbox requiere autorización.
3. Isaac ratifica en el corte la política ya descrita en BIL-13: refund emitido
   (incluido parcial/pending) retira esa fuente, failed/canceled restaura solo
   si sigue vigente, disputa suspende y restaura al ganar el cliente; confirma
   alcance Pro (factura/fuente/suscripción) y tratamiento del agregado sin
   detalle. Riesgo: retirar otra compra legítima o restaurar derechos por un
   evento tardío. No se ejecutan refunds, compras ni cambios SQL de producción.

**B03 · Borrado y tombstone del UUID.** No es seguro inventar una política de
retención ni un botón de borrado; tampoco basta consultar Clerk al firmar.

1. Revisar el consumidor firmado `supabase/functions/clerk-webhook/index.ts`,
   `_shared/webhook-verify.ts`, `20261008210000_clerk_identity_cutover.sql` y
   `20261008233000_clerk_native_data_boundary.sql` de #1523: inbox idempotente,
   timestamp monotónico y tombstone que un `user.updated` tardío no revive.
   Toda RPC/RLS/Storage sensible debe consultar identidad no borrada; el
   bearer emitido antes del borrado debe quedar denegado aun antes de su TTL.
2. Verificar con fixtures firmados y SQL/PostgREST aislado: deleted→updated
   tardío, duplicados, UUID histórico, bearer previo, webhook Polar posterior,
   licencias nuevas y borrado/anonimización de datos personales sin destruir
   la trazabilidad comercial. `clerk-webhook/index.test.ts`,
   `clerk_identity_cutover_test.sql`, `clerk_native_data_boundary_test.sql` y
   tests del emisor deben cubrir esos escenarios. Offline mantiene su política
   hasta reconectar/expirar; no prometer revocación instantánea sin red.
3. Isaac fija qué datos personales borrar/anonimizar, qué historial comercial
   conservar y cuánto tiempo, si la cuenta puede recuperarse/recrearse y qué
   ocurre con compras posteriores. Luego autoriza configuración Svix/Clerk y
   despliegue como pasos separados. Riesgos: pérdida irreversible de historial,
   acceso residual por RLS antigua y resurrección de UUID/grants. Sin UI nueva,
   consumidor parcial ni eliminación de datos reales en esta entrega.

### Verificación y entrega final de la ronda 2

| Hallazgo | Commit o plan concreto |
| --- | --- |
| N1 / F08 / F02 sin núcleo | `d6aec3ca`; validación Launch perpetua y fixture gestionado `03fb0dea` |
| N2 / F02 refresh invalid_grant | `381bee42`; dispatch explícito validado en `03fb0dea` |
| N3 / F04 entorno de grants | `5b5ab24c` |
| Atribución residual external ID | `71388711` |
| B01 P1 | Plan identidad/bearer anterior: corte #1523 JWT/RLS, gate PostgREST real y decisión de issuer/firmante por Isaac. |
| B02 P1 | Plan monetario anterior: ledger SQL/refunds/Pro/reconciliación, matriz aislada y política/corte confirmados por Isaac. |
| B03 P1 | Plan borrado anterior: webhook/tombstone/RLS/Storage y decisión de conservación/recreación por Isaac. |

| Gate | Resultado nuevo / log en `C:/tmp/1608-r2/` |
| --- | --- |
| fmt/check/Clippy `-D warnings` | PASS; `fmt.log`, `check.log`, `clippy.log` |
| Nextest completo | 1652 PASS/7 skips existentes; `test.log`, incluida paridad larga 128 s |
| lifecycle | 18 PASS; `lifecycle.log` |
| telemetría | 25 PASS; `telemetria.log`, corpus ACC lento terminado sin excluirlo |
| Deno completo con tipos | 524 PASS/1 ignored existente; `deno-full-final.log`; sin permiso de red |
| PostgreSQL 18 desechable | 230 GREEN verificados por plan/count; `sql/`, `validate-sql.log` |
| Bloqueos aislados | B01 1 RED SQL y B02 4 RED Deno explícitos; no se cuentan como verde ni skips |
| quality/retirada | 456 huellas PASS, sin recalibrar baselines |
| Canal/fragmento/notes | ruta issue→nightly válida, 45 + 26 tests PASS, ISA-1608 válido |

Comandos largos con timeout propio por árbol de procesos, cola del repo y
`CARGO_BUILD_JOBS=2`; target exclusivo del worktree `native/target/gates`.
`LOCALAPPDATA`/`APPDATA` de tests bajo `C:/tmp/1608-r2/qa`, sin override global
VANTARE_NATIVE_DATA_ROOT. No se distribuye esta variante DuckDB de desarrollo.
Snapshots/hash de source comprueban que los archivos probados coinciden con el
código `03fb0dea`; el cierre posterior solo modifica documentación.

Misma PR draft #1615 a nightly y base `69fa2d65`; `origin/nightly@0807fbd0`
leído, sin integrarlo. Estado/push/HEAD final, Plane VANTA-16/17/15 y CI se
verifican al cierre en la issue #1608 y `C:/tmp/buzon/1608.md`. No se hereda CI
verde de ba02b093 ni se certifica la combinación con nightly/#1612/#1523.
Sin merge/promoción/release, producción, compras/refunds reales, datos de Isaac,
secretos, herramientas/dependencias nuevas ni visual nuevo. QA manual comercial,
Clerk/PostgREST/TPA, instalador y juegos físicos quedan sin ejecutar por alcance;
la review del corte corregido y las decisiones B01/B02/B03 corresponden a Isaac
/orquestador. **No-Go comercial permanece: tres P1 con plan, no subsanados aquí.**

## Ronda 1 · evidencia histórica de `ba02b093`

Issue [#1608](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1608),
proyecto Vantare / `area:plataforma`, Plane VANTA-16, VANTA-17 y VANTA-15.
Rama `vantareapp/isa-1608-cuentas-y-pagos`, base `nightly@69fa2d65`.
Reanudación por Codex CLI: se conservaron seis commits de T3 y sus pruebas;
se completó el cambio pendiente de caché y se corrigió el cierre sin núcleo.
No hubo subagentes en la reanudación, diseño nuevo ni cambios en producción.

## Diez líneas para Isaac

1. Se han corregido nueve fallos de cuenta, compra y licencia en esta rama.
2. Una cuenta Clerk bloqueada o borrada ya no recibe nuevas licencias.
3. Una denegación definitiva online retira la licencia local anterior.
4. Un fallo temporal de red conserva el acceso offline hasta su fecha real.
5. Cerrar sesión también limpia la licencia pendiente cuando services está sin núcleo.
6. Los intentos admiten UUID interno y plan anual; `metadata.user_id` no atribuye compras.
7. El emisor consulta la tabla de grants que existe en el esquema versionado.
8. Un refund anterior a su order queda reintentable, con límite y cuarentena final.
9. Las huellas inválidas se rechazan antes de crear cuenta o cambiar dispositivo.
10. **La venta sigue bloqueada**: bearer de datos/RLS, refunds completos y borrado requieren #1514 y aceptación autorizada.

## Hallazgos corregidos y rojo → verde

Las rutas `supabase/` son relativas a la raíz Git; `native/` a `vantare-v2/`.
Los logs están en `C:/tmp/1608-evidence/`. Son fixtures locales, no cuentas reales.

| ID / prioridad | Problema, arreglo y evidencia | Commit / regresión |
| --- | --- | --- |
| F01 P1 | `native-license/index.ts:80`: OAuth válido no comprobaba banned/locked/borrado. RED emitía 200 en vez de 403. Se reutiliza `requireUnblocked` antes de grants/firma; borrado devuelve 401. GREEN handler 46 tests en el hito; suite completa posterior abajo. | `cf2983ec`; `native-license/index.test.ts`, `F01-red.log`, `F01-green.log` |
| F02 P1 | `native/services/src/app.rs:122`: renovación denegada dejaba el candidato firmado anterior. RED `online rejection retained the previous license`. Ahora 401/403/409 y credencial inválida invalidan primero el núcleo, esperan ACK durable y después retiran el candidato; sin núcleo se retira el candidato. 429/503 preservan offline. | `0fd539ce`; `definitive_online_license_rejection_removes_the_previous_candidate`, `transient_online_license_failures_preserve_the_previous_candidate`; `F02-red.log`, `F02-green-cli.log` (2 PASS) |
| F03 P1 | FK `billing_checkout_attempts.user_id` todavía apuntaba a `auth.users`: una cuenta Clerk con UUID interno válido fallaba 23503 antes de Polar. Migración cambia solo la FK a `profiles(id)`; cuenta inexistente, RLS y RPC server-only siguen restringidos. | `4eba01d6`; `native_checkout_internal_account.test.sql`; RED 2/5, GREEN 5/5 y rollback que vuelve a reproducir 23503 |
| F04 P1 | `_shared/license-credential.ts:530`: el lector consultaba una relación ausente. Ahora lee `billing_access_grants`, manteniendo filtros cuenta/status y normalización de entorno/capabilities. RED SQL 42P01 y loader Deno; GREEN consulta real y loader. | `e286eff6`; `license_grants_relation.test.sql` 2 PASS, `native-license/index.test.ts:666`; `F04-red.log`, `F04-green.log` |
| F05 P1 | CHECK de `billing_checkout_attempts.checkout_key` rechazaba `pro_annual` (23514). Se añade exclusivamente el producto existente, sin cambiar catálogo/precios. Productos desconocidos siguen rechazados. | `a359653f`; `native_checkout_annual.test.sql` 3 PASS; logs `sql/native_checkout_annual.test.sql.{red,green}.log` |
| F06 P1 | `billing-webhook/process.ts:925`: refund antes de order acababa en cuarentena terminal en la primera entrega. Ahora ausencia de order produce fallo reintentable mediante inbox/backoff existentes, máximo cinco intentos. Tras recibir order y redelivery se revoca Launch; atribución ambigua permanece en cuarentena. | `0314d266`; dos regresiones en `process.test.ts:2277`; `F06-red.log`, `F06-green.log`. Depende de redelivery del proveedor; no se ha instalado scheduler. |
| F07 P2 | `claim_active_device`/`reset_active_device` aceptaban huellas cortas, mayúsculas o espacios; la resolución podía crear cuenta antes de detectar el error. La migración exige 64 hex minúsculas antes de resolver identidad o escribir. Fixtures históricos pasan a huellas canónicas sin cambiar sus asserts de permisos/aislamiento. | `fbf68867`; `canonical_device_claim.test.sql` 8 PASS; `sql-fp-red.log`, `sql-fp-reset-red.log`, `sql-fp-green.log`, `sql-blocker.log` |
| F08 P2 | `native/services/src/app.rs:179`: services sin `--managed` anunciaba cierre y conservaba el candidato durable. RED `logout retained candidate without core`. Ahora lo retira antes de limpiar sesión/anunciar éxito; con núcleo mantiene el ACK previo. | `84db0981`; `logout_without_core_removes_candidate_before_session_success`; `F08-red.log`, `F08-green.log` (1 PASS). |
| F09 P1 | `billing-webhook/process.ts:120`: el fallback a `metadata.user_id` atribuía compras sin binding servidor y podía prevalecer sobre un cliente ya vinculado. RED devolvía UUID cuando debía devolver ausencia. Se retira ese fallback; metadata sola no atribuye y un cliente vinculado mantiene su cuenta real aunque metadata indique otra. No se cambia el ledger/contrato externo. | `f8183f36`; `untrusted user_id metadata cannot attribute a purchase without a server binding`; `F09-red.log`, `F09-green.log` (51 PASS). |

Las tres migraciones `20261013225216`, `20261013225408` y `20261013225830`
incluyen rollback; **no se han aplicado remotamente**. Los rollbacks de FK y
CHECK pueden rechazar datos nuevos incompatibles: requieren preflight y backup;
no borran esos datos para forzar la vuelta atrás. No se han cambiado ACL/RLS
para hacer pasar una llamada ni se han añadido dependencias.

## Bloqueos confirmados que permanecen

**B01 P1 · Bearer de datos y reset de dispositivo.**
`native-account-authorize/index.ts:51` firma un UUID interno con issuer Supabase
y claims de proveniencia Clerk. `private.resolve_account_identity` en
`20261002130000_native_license_bridge.sql:23` trata ese issuer como legacy y
exige que el UUID exista en `auth.users`. El reset del cliente llama esa RPC
desde `native/services/src/license_remote.rs:132`; una cuenta solo Clerk falla.
Reproducción SQL `native-data-blocker.sql` / `sql/native-data-blocker.log`:
`not_authenticated`, 1 test RED después de aplicar los arreglos locales.
No se acepta ciegamente `clerk_issuer/clerk_subject`: es necesario cerrar la
proveniencia del token, configuración JWT/PostgREST y gate nativo de #1514.
La implementación autorizada de #1514 está en el PR draft
[#1523](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1523),
HEAD `33be660d`, abierto y sin merge al verificarlo. Incluye ese contrato y
otros cambios acoplados de RLS, JWT, webhook y clientes; no está en esta base.
No se trasplantan partes del corte de identidad sin revisar su integración.

**B02 P1 · Refund Polar ordinario y refund de Pro.**
`billing-webhook/process.ts:446` exige `payment_id` en la raíz del refund.
El objeto de la [API oficial de refunds](https://polar.sh/docs/api-reference/refunds/create)
contiene `order_id`; el `payment_id` mostrado pertenece a la disputa anidada.
La sonda local sin `payment_id` deja Launch activo. Además,
`process.ts:509` solo guarda orders de Launch: el refund de un ciclo Pro no
encuentra order en el ledger, reintenta y mantiene el grant `active`.
`billing-blockers.test.ts` / `billing-blockers-final-red.log`: tres tests RED con
expectativa de revocación, sin alterar/ignorar los tests del gate.
El tercero reproduce un refund parcial emitido que mantiene Launch activo,
frente a la política de retirada de fuente documentada en el runbook BIL-13
de #1523. Las disputas y la restauración también requieren ese corte completo.
No se inventa un payment ID ni se revoca por email/metadata. Hace falta el
ledger order→subscription, política monetaria/refund/disputa y reconciliación
de #1514/#1506. #1523 declara estos arreglos junto con el corte de identidad,
sin integrar; modificar solo el parser dejaría incompatibles SQL, atribución
y replay. F06 mejora el desorden de entrega de Launch, no resuelve B02.
El cierre completo de atribución de #1523 también sigue pendiente:
`resolveUserId` aún acepta `external_customer_id` antes de consultar un binding
durable. F09 retira el fallback a metadata; no certifica por sí solo toda la
atribución. Eventos legacy que solo lleven metadata sin cliente vinculado quedan
sin atribuir y requieren reconciliación, conservando su inbox.

**B03 P1 · Borrado de cuenta y revocación de datos.**
El corte no contiene una ruta nativa de borrado ni consumidor de webhook Clerk
que aplique tombstone/revocación al UUID interno y a los datos Supabase.
La comprobación F01 impide emitir una licencia nueva al usuario borrado;
no prueba limpieza de datos, revocación de un bearer ya emitido ni manejo de
compras posteriores. El bearer de datos puede durar hasta 300 s y los grants
perpetuos offline no se revocan mágicamente sin reconectar. La transición de
borrado requiere política de conservación comercial y el corte de #1514/#1523. No se elimina
ninguna cuenta ni dato real y no se crea UI de borrado sin diseño Opus.
Este hallazgo es revisión de rutas/contratos; no se presenta como borrado live.

## Cobertura y límites

- OAuth/PKCE, state, rotación/restore, identidad distinta y completion posterior a
  logout: tests existentes de `account/tests.rs`; no se toca su implementación.
- Datos: puente fija endpoint, valida UUID/TTL y reutiliza sesión solo para la
  identidad vigente; tests de `bridge.rs`. RLS/ACL/aislamiento local en pgTAP.
  Sin validación JWT real de PostgREST: el test Deno correspondiente sigue ignored.
- Licencia: firma/dispositivo, paid-through exacto, 17 días offline, reloj monotónico,
  rollback y excepción live acotada cubiertos por `license/tests.rs` y núcleo.
  No se ha cambiado su contrato ni extendido la caducidad.
- Billing: fixtures de firma/inbox, idempotencia, entorno, cuarentena, cancelación
  hasta paid-through, trial y recovery acotado; PostgreSQL verifica sus RPC reales.
  No prueban cobros, refunds ni webhooks físicos de Polar.
- Coordinación #1612: anotación en ambos buzones. Mis cambios Rust se limitan a
  `app.rs` (renovación/cierre y tests). #1612 conserva sus extensiones de perfil;
  no he tocado `account.rs`, `account/*`, `bridge.rs`, IPC ni Hub.

Documentación de [Clerk en Supabase](https://supabase.com/docs/guides/auth/third-party/clerk)
y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
contrastada con ADR 0100; no se configura ninguna integración remota.

## Verificación de la reanudación

| Check | Resultado / evidencia |
| --- | --- |
| Deno Functions completo | **522 PASS, 0 FAIL, 1 ignored** después de F09; `deno-cli-post-F09.log`. La ronda anterior pasó 521; dos invocaciones previas fallaron por permisos de lectura demasiado estrechos (5 y 2 tests), se conservan; corregir permisos, sin editar tests, dio verde. No se habilita acceso a `.env*`. |
| PostgreSQL 18 local desechable | **230 assertions PASS** en diez suites: hardening 48, checkout 18, bootstrap 31, native bridge 27, ledger 37, lifecycle 51, UUID checkout 5, anual 3, grants 2, huella 8. `sql-cli.log` y `validate-sql.py`; RED basal/rollback FK esperado y B01 separado. |
| Sondas de bloqueos | B01 1 RED SQL y B02 3 RED Deno, conservados explícitamente; no se cuentan como verde ni se ocultan en skips. |
| Quality / retirada | **PASS, 456 huellas**; `vantare_quality.py check` y `native/retirement/verify.py`; baselines intactos. |
| Canal / fragmento | Validación rama→nightly y 45 tests de canal PASS; fragmento `ISA-1608.json` válido. Plantilla Notion de master es histórica y no se reutiliza. |
| Rust fmt/check/Clippy | **PASS**, workspace/all-targets, Clippy `-D warnings`; `fmt-F08.log`, `check-cli.log`, `clippy-cli.log`. |
| Rust Nextest | **1649 PASS, 7 skips del perfil/ignorados existentes**, suite completa con rutas aisladas; `test-cli.log`. Un parity test de Strategy tardó 130 s y pasó sin modificarlo. |
| Rust lifecycle | **18 escenarios PASS, 0 FAIL**, procesos propios y rutas aisladas; `lifecycle-cli.log`. |
| Telemetría | No repetida: solo se modifica services, Functions y SQL; no runtime/domain/ipc/testdata. |

Comandos largos con timeout, `CARGO_BUILD_JOBS=2`, target del propio worktree
`native/target/gates`, cola `native/scripts/compilar.ps1`; DuckDB de desarrollo
existente. Sin instalación de herramientas, build Release ni medición del PC.
El intento recuperado `services-baseline.log` no llegó a ejecutar tests:
falló al buscar Cargo.toml desde el directorio padre. La reanudación usa
manifest explícito en los focales y `gates.ps1` para el workspace.
El formateo, sin compilación, pasó directamente con cargo fmt después de
terminar su espera propia en la cola; no se cerraron procesos de otros workers
ni se alteraron slots/RAM. El resto de compilaciones pasa por la cola.
Nextest y lifecycle usan `LOCALAPPDATA` y `APPDATA` bajo `C:/tmp/1608-qa-roots`,
sin override global `VANTARE_NATIVE_DATA_ROOT`: algunos tests arrancan services
sin root explícita y usan las rutas por defecto de Windows.
Se interrumpió únicamente mi primera compilación Nextest antes de ejecutar tests
y se reanudó con esas rutas; `test-cli-interrupted-build.log` conserva el intento.
No se usan ajustes/datos de la instalación real para aceptar esta entrega.
La primera ejecución aislada falló en el test de junctions del Launcher:
`cmd.exe` interpretó la ruta temporal `C:/tmp/...` como modificador. Log
`test-cli-failed-isolation-path.log`: 737 PASS, 1 FAIL, 911 no ejecutados.
Se corrigieron solo las variables de entorno a `C:\tmp\...` y se repitió
la suite completa; no se modificó ni exceptuó ese test.
La segunda ejecución aislada detectó que el override global adicional chocaba
con el test de ruta por defecto de UI. `test-cli-failed-root-override.log`:
1479 PASS, 1 FAIL, 169 no ejecutados. Se retiró ese override, manteniendo las dos
rutas de Windows en el directorio de QA, y se repitió todo sin modificar tests.

## Entrega y siguiente paso

PR [**#1615, draft a nightly**](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1615),
pendiente de revisión independiente. Plane VANTA-16/17/15 **Por revisar** e issue
GitHub `state:in-review` verificados el 14/10/2026; Project Vantare, sin milestone
comprometido. Código probado `f8183f36`, entrega documental `99405dd9`.
SHA/push/CI finales en la issue y el buzón; no se afirma integración en nightly.
Sin merge, release, promoción, deploy, migración prod, precios, compras ni refunds
reales. La única actividad externa es seguimiento GitHub/Plane y push/PR pedidos.

El orquestador revisa los nueve arreglos y coordina `app.rs` con #1612. Para abrir
venta debe cerrar B01/B02/B03 con el plan de #1514 y ejecutar una aceptación
separadamente autorizada: login/refresh/logout/reinicio; cuenta bloqueada/borrada;
compra mensual/anual/Launch; cancelación, refund parcial/total, disputa; entregas
fuera de orden; desconexión, caducidad y recuperación. Este informe no autoriza
esa operación ni sustituye la matriz monetaria real.

Al integrar #1523, revisar solapamientos de FK, productos, lector de grants y
wrappers de dispositivo con F03/F04/F05/F07; no aplicar migraciones duplicadas
ni asumir que dos suites verdes por separado prueban el corte integrado.
