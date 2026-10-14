# Revisión de cuentas y pagos · #1608 · 14/10/2026

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
