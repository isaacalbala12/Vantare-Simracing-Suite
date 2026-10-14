## #1608 · Cierre comercial ronda 4 · Mac arm64 (14/10/2026)

Review `~/orq/review-1622-sol-r3.md` leída **entera**: NO APTO por R3-P1-1,
reset concurrente que reinserta el dispositivo tras el borrado irreversible.
Encargo del orquestador: abarcar todas las escrituras SQL/Edge ligadas a UUID;
solo local/tests, sin subagentes, GitHub, push ni servicios reales.
Inicio limpio `3ce0eadc5bcd04a557fe94b994dccd5ffb9005b2`, rama
`vantareapp/isa-1608-cierre-comercial`, worktree
`/Users/isaacalbala/vw-isa-1608-cierre-comercial`, base/merge-base local
`e5c90be5f63347fa4d50b4110e1946201c1957c0`. No fetch, rebase ni integración.

### Regla única y diseño aplicado

Nueva migración **`20261014140000_isa_1608_account_write_barrier.sql`**;
no se reescriben migraciones anteriores. `private.lock_account_write(uuid)`
toma `pg_advisory_xact_lock(hashtextextended(uuid::text,1608))` y **después**
consulta todos los tombstones del UUID. Función VOLATILE, ACL privada, índice
por `account_id`; no flags/GUC que permitan saltarse la protección.
Rechaza snapshots REPEATABLE READ/SERIALIZABLE con SQLSTATE 25001.

Un trigger común BEFORE INSERT/UPDATE/DELETE protege **74 tablas**. La migración
compila los caminos de FK directos/indirectos/composites a `profiles`, más raíces
explícitas sin FK: auditoría operacional, admisión por UUID, Storage, agregados
Testing, inbox Polar y objetivos/resultados del admin. Los joins de runtime
usan las claves tipadas; no recorren el catálogo ni comparan filas enteras como
JSON. Comprueba propietarios OLD/NEW, los bloquea en orden UUID, relee los
propietarios tras esperar y rechaza cambios concurrentes (40001). No permite
desasociar propietarios, cambiar claves de identidad ni eliminar físicamente
perfiles/aliases. Una FK a un padre todavía invisible se rechaza (23503),
con reintento comprobado después del commit del padre.

Tras tombstone, las escrituras ligadas al UUID se rechazan (28000), excepto
las tres proyecciones ya existentes de grants/entitlements/acceso operacional:
solo persisten **revocado**, metadata vacía o campos de revocación completos.
DELETE de datos/ACK de Storage sigue permitido bajo la misma barrera; UUID y
aliases son durables. Historial previo privado se conserva. El borrado borra/
anonimiza bajo el lock y **marca los tombstones al final de la misma transacción**;
no necesita excepciones de privilegios ni un bypass de limpieza.
Los webhooks tardíos por otro alias siguen devolviendo `ignored`.

Reset obtiene la barrera desde `resolve_current_account` **antes** del lock de
fila de dispositivo. Claim entra por INSERT y el mismo trigger antes de tomar
filas; la resolución nativa/bootstrap también relee el tombstone bajo el lock.
Se retira la guarda anterior limitada a tres tablas. Los consumidores Edge
reciben la protección en SQL, incluidos sus upserts con service_role.

### Inventario SQL: ruta → protegida → test

Inventario sobre las **50 migraciones reales** y los writers Edge activos;
87 tablas public/private/storage en el bootstrap local. `Sí` significa el
trigger común en las tres operaciones, también para service_role/DEFINER.
Las 13 filas `No` son catálogo, configuración o auditoría técnica sin UUID de
cuenta; no se fabrica una identidad para bloquear operaciones globales.
Las políticas y ACL originales siguen aplicándose además del trigger.

Cada nombre de test identifica una fila de `commercial_write_cases.py`,
ejecutada por `commercial_write_race.py`. `coverage.json` registra las tablas
**realmente escritas** por cada control válido mediante un AFTER de fixture;
ese observador se retira al terminar y no reemplaza las funciones ni guardas.
El gate falla si una tabla protegida carece de escritura válida/carrera, si falta
un trigger o si sus argumentos compilados omiten una columna FK actual.

| Ruta SQL / tabla destino | Protegida | Test de dos transacciones / clasificación |
| --- | --- | --- |
| `private.billing_reconciliation_cursor` | No (no aplica UUID) | Cursor/lease global por entorno; no UUID. |
| `private.clerk_deleted_objects` — INSERT/UPDATE/DELETE | Sí | `deletion-queue` |
| `private.clerk_issuers` | No (no aplica UUID) | Registry de confianza por issuer; no cuenta. |
| `private.clerk_user_events` | No (no aplica UUID) | Inbox mínimo event_id/hash/tipo, sin subject/PII ni UUID. |
| `private.native_admin_rate` — INSERT/UPDATE/DELETE | Sí | `admin-rate` |
| `private.testing_report_attempts` — INSERT/UPDATE/DELETE | Sí | `admission-account` |
| `public.account_identities` — INSERT/UPDATE/DELETE | Sí | `alias-insert`, `alias-clear` |
| `public.admin_audit_log` — INSERT/UPDATE/DELETE | Sí | `admin-audit`, `admin-target`, `admin-search-result` |
| `public.billing_access_blocks` — INSERT/UPDATE/DELETE | Sí | `access-block` |
| `public.billing_access_grants` — INSERT/UPDATE/DELETE | Sí | `grant` |
| `public.billing_checkout_attempts` — INSERT/UPDATE/DELETE | Sí | `checkout-claim`, `checkout-complete`, `checkout-uncertain` |
| `public.billing_checkout_bindings` — INSERT/UPDATE/DELETE | Sí | `checkout-complete`, `checkout-binding` |
| `public.billing_commercial_resources` — INSERT/UPDATE/DELETE | Sí | `resource` |
| `public.billing_customers` — INSERT/UPDATE/DELETE | Sí | `customer-upsert` |
| `public.billing_orders` — INSERT/UPDATE/DELETE | Sí | `order` |
| `public.billing_reconciliation_runs` — INSERT/UPDATE/DELETE | Sí | `reconciliation` |
| `public.billing_refunds` — INSERT/UPDATE/DELETE | Sí | `refund` |
| `public.billing_subscription_recovery_cycles` — INSERT/UPDATE/DELETE | Sí | `recovery` |
| `public.billing_subscriptions` — INSERT/UPDATE/DELETE | Sí | `billing-subscription` |
| `public.billing_webhook_effects` — INSERT/UPDATE/DELETE | Sí | `inbox-effect` |
| `public.billing_webhook_inbox` — INSERT/UPDATE/DELETE | Sí | `inbox`, `inbox-checkout`, `inbox-order`, `inbox-refund`, `inbox-subscription`, `inbox-nested-customer` |
| `public.billing_webhook_replay_audit` — INSERT/UPDATE/DELETE | Sí | `inbox-replay` |
| `public.devices` — INSERT/UPDATE/DELETE | Sí | `device-insert`, `reset-clerk`, `claim-clerk`, `reset-native`, `native-claim` |
| `public.hwid_changes` — INSERT/UPDATE/DELETE | Sí | `hwid-change` |
| `public.license_events` — INSERT/UPDATE/DELETE | Sí | `license-event` |
| `public.license_validations` — INSERT/UPDATE/DELETE | Sí | `validation` |
| `public.licenses` — INSERT/UPDATE/DELETE | Sí | `license-insert`, `license-update` |
| `public.module_rollout` | No (no aplica UUID) | Configuración global de módulos; el actor se audita en admin_audit_log. |
| `public.operational_access_assignments` — INSERT/UPDATE/DELETE | Sí | `operational` |
| `public.operational_access_audit` — INSERT/UPDATE/DELETE | Sí | `operational-audit` |
| `public.operational_legacy_grant_retirements` — INSERT/UPDATE/DELETE | Sí | `operational-retirement` |
| `public.profiles` — INSERT/UPDATE/DELETE | Sí | `profile-update` |
| `public.race_schedule_publications` — INSERT/UPDATE/DELETE | Sí | `calendar`, `calendar-publisher` |
| `public.rate_limits` — INSERT/UPDATE/DELETE | Sí | `rate-limit-user`, `rate-limit-license` |
| `public.subscriptions` — INSERT/UPDATE/DELETE | Sí | `legacy-subscription` |
| `public.supabase_heartbeat` | No (no aplica UUID) | Heartbeat global, sin cuenta. |
| `public.testing_answers` — INSERT/UPDATE/DELETE | Sí | `answer` |
| `public.testing_center_agent_audit` — INSERT/UPDATE/DELETE | Sí | `agent-audit` |
| `public.testing_center_agent_callbacks` — INSERT/UPDATE/DELETE | Sí | `agent-callback` |
| `public.testing_center_agent_effect_outbox` — INSERT/UPDATE/DELETE | Sí | `agent-effect` |
| `public.testing_center_agent_jobs` — INSERT/UPDATE/DELETE | Sí | `agent-job` |
| `public.testing_center_agent_phase_callbacks` — INSERT/UPDATE/DELETE | Sí | `agent-phase` |
| `public.testing_center_agent_reservations` — INSERT/UPDATE/DELETE | Sí | `agent-reservation` |
| `public.testing_center_audit` — INSERT/UPDATE/DELETE | Sí | `tc-audit` |
| `public.testing_center_build_identities` | No (no aplica UUID) | Build/SHA/canal y actor técnico de registro; no UUID de cuenta. |
| `public.testing_center_candidate_builds` — INSERT/UPDATE/DELETE | Sí | `candidate` |
| `public.testing_center_codex_dossier_snapshots` — INSERT/UPDATE/DELETE | Sí | `dossier` |
| `public.testing_center_codex_execution_control` — INSERT/UPDATE/DELETE | Sí | `codex-control` |
| `public.testing_center_codex_runs` — INSERT/UPDATE/DELETE | Sí | `codex-run` |
| `public.testing_center_effect_outbox` — INSERT/UPDATE/DELETE | Sí | `effect-outbox` |
| `public.testing_center_effect_supersessions` — INSERT/UPDATE/DELETE | Sí | `supersession` |
| `public.testing_center_evidence` — INSERT/UPDATE/DELETE | Sí | `report-evidence` |
| `public.testing_center_evidence_batches` — INSERT/UPDATE/DELETE | Sí | `evidence-batch` |
| `public.testing_center_evidence_outbox` — INSERT/UPDATE/DELETE | Sí | `evidence-outbox` |
| `public.testing_center_github_deliveries` | No (no aplica UUID) | Digest y metadatos de entrega GitHub; sin cuerpo/PII/UUID. |
| `public.testing_center_idempotency` — INSERT/UPDATE/DELETE | Sí | `tc-idempotency` |
| `public.testing_center_issue_destinations` — INSERT/UPDATE/DELETE | Sí | `destination` |
| `public.testing_center_issue_occurrences` — INSERT/UPDATE/DELETE | Sí | `occurrence` |
| `public.testing_center_linear_issue_bindings` — INSERT/UPDATE/DELETE | Sí | `linear-binding` |
| `public.testing_center_linear_migration_metadata` | No (no aplica UUID) | Snapshot técnico de función heredada, sin cuenta. |
| `public.testing_center_linear_projection_snapshots` — INSERT/UPDATE/DELETE | Sí | `linear-projection` |
| `public.testing_center_linear_reconciliations` — INSERT/UPDATE/DELETE | Sí | `linear-reconciliation` |
| `public.testing_center_linear_state_mappings` | No (no aplica UUID) | Configuración organización/estado y actor técnico, no UUID de cuenta. |
| `public.testing_center_linear_webhook_deliveries` — INSERT/UPDATE/DELETE | Sí | `linear-webhook` |
| `public.testing_center_memberships` — INSERT/UPDATE/DELETE | Sí | `membership` |
| `public.testing_center_owner_dispositions` — INSERT/UPDATE/DELETE | Sí | `owner-disposition` |
| `public.testing_center_pauses` — INSERT/UPDATE/DELETE | Sí | `pause` |
| `public.testing_center_posthog_consent_events` — INSERT/UPDATE/DELETE | Sí | `consent` |
| `public.testing_center_posthog_evidence` — INSERT/UPDATE/DELETE | Sí | `posthog-evidence` |
| `public.testing_center_promotions` — INSERT/UPDATE/DELETE | Sí | `promotion` |
| `public.testing_center_report_events` — INSERT/UPDATE/DELETE | Sí | `report-event` |
| `public.testing_center_report_payloads` — INSERT/UPDATE/DELETE | Sí | `report-payload` |
| `public.testing_center_report_submission_keys` — INSERT/UPDATE/DELETE | Sí | `report-key` |
| `public.testing_center_reports` — INSERT/UPDATE/DELETE | Sí | `report` |
| `public.testing_center_screenshot_evidence` — INSERT/UPDATE/DELETE | Sí | `screenshot` |
| `public.testing_center_technical_issues` — INSERT/UPDATE/DELETE | Sí | `technical-issue` |
| `public.testing_center_triage_results` — INSERT/UPDATE/DELETE | Sí | `triage` |
| `public.testing_center_validation_snapshots` — INSERT/UPDATE/DELETE | Sí | `validation-snapshot` |
| `public.testing_center_validations` — INSERT/UPDATE/DELETE | Sí | `candidate-validation` |
| `public.testing_contributions` — INSERT/UPDATE/DELETE | Sí | `contribution` |
| `public.testing_questionnaires` | No (no aplica UUID) | Catálogo global de preguntas; respuestas separadas y protegidas. |
| `public.testing_report_followup` — INSERT/UPDATE/DELETE | Sí | `followup` |
| `public.user_entitlements` — INSERT/UPDATE/DELETE | Sí | `entitlement` |
| `public.visual_roadmap` | No (no aplica UUID) | Documento público global; no cuenta. |
| `public.visual_roadmap_sync_approvals` | No (no aplica UUID) | Aprobación de documento global; no cuenta. |
| `storage.buckets` | No (no aplica UUID) | Configuración de buckets; objetos separados y protegidos. |
| `storage.objects` — INSERT/UPDATE/DELETE | Sí | `storage-owner`, `storage-manifest` |

Los vínculos de inbox se derivan de customer/checkout/order/refund/subscription
**durables** y del entorno/proveedor. No usan email, metadata.user_id ni external
UUID como autoridad. Sin vínculo canónico aún no existe un UUID que bloquear:
se conserva el transporte minimizado previo (sin email/nombre/cuerpo completo),
no se crea cuenta ni se conceden permisos. `scope=ip` en admisión tampoco es un
UUID; `scope=account` sí pasa por la barrera. Storage comprueba tanto owner_id
como el propietario del manifest, incluso si owner_id es NULL.

### Inventario Edge y RPC consumidoras

| Ruta Edge / entrada SQL | Protegida | Test / destino |
| --- | --- | --- |
| `clerk-webhook` → `apply_clerk_user_event` | Sí | Aliases/PII, cola Storage y borrado real en las 94 carreras; cuatro carreras previas por alias/tiempo. |
| `native-license` → `native_claim_license_device` → `claim_account_device` | Sí | `native-claim`, `device-insert`; emisión/normalización en Deno. |
| `_shared/native-auth` → `native_resolve_account`; `clerk_bootstrap_account` | Sí | `native-resolve`, `bootstrap`, barrera aun cuando solo resuelven la identidad existente. |
| `native-account-authorize` → bearer de datos; `claim_active_device` / `reset_active_device` | Sí en resolución/consumo SQL | `claim-clerk`, `reset-clerk`, `reset-native`; JWT no se guarda en SQL. Firma/handler en Deno, sin nuevo gate HTTP firmado. |
| `native-billing-checkout`, `billing-checkout` → claim/complete/uncertain/bindings | Sí | `checkout-claim`, `checkout-complete`, `checkout-uncertain`, `checkout-binding`. |
| `native-billing-portal`, `billing-portal` | Resolución Sí; sin writer propio | Mismo resolver; llamada al proveedor fuera de esta QA local. |
| `billing-webhook` / `billing-reconcile` → snapshots/orders/refunds/subscriptions/proyección | Sí | `order`, `refund`, `resource`, `billing-subscription`, `recovery`, `access-block`, `grant`, `entitlement`, `reconciliation`. |
| `billing-webhook/process.ts` → upsert clientes / insert license_events | Sí | `customer-upsert`, `license-event`. No depende de un precheck Edge separado de la escritura. |
| Inbox/effects/replay Polar | Sí para UUID vinculado | `inbox`, `inbox-checkout`, `inbox-order`, `inbox-refund`, `inbox-subscription`, `inbox-nested-customer`, `inbox-effect`, `inbox-replay`. |
| `native-admin` / `operational_access_set` / calendario | Sí en tablas y auditoría | `membership`, `operational`, `operational-audit`, `operational-retirement`, `admin-rate`, `admin-audit`, `admin-target`, `admin-search-result`, `calendar`, `calendar-publisher`. |
| `testing-report-submit` → admit/submit/admitted/followup/notice/consent/answer | Sí | `admission-account`, `contribution`, `followup`, `answer`; sin sync de perfil. |
| `testing-center-feedback`, report submission/validation/owner disposition | Sí | `report`, `report-payload`, `report-key`, `report-event`, `candidate-validation`, `validation-snapshot`, `owner-disposition`, `dossier`, `consent`, `posthog-evidence`. |
| `testing-center-linear-worker/webhook`, agent dispatch/callback; RPC históricas conservadas | Sí en cada destino ligado a UUID | Casos `linear-*`, `agent-*`, `effect-outbox`, `destination`, `supersession`, `technical-issue`, `codex-*`, `promotion`, `tc-audit`, `tc-idempotency`, `pause`, `triage`, `occurrence`. No se envía ningún efecto externo. |
| Preparación/finalización screenshot y Storage API | Sí en metadatos | `evidence-batch`, `screenshot`, `evidence-outbox`, `report-evidence`, `storage-owner`, `storage-manifest`; bytes/API gestionada no ejecutados. |
| `clerk_deletion_objects` / `clerk_deletion_completed` | Sí; lectura/retirada permitidas | `deletion-queue`, cola preservada en alias40 y ACK service_role positivo tras tombstone; sin recreación del UUID. |
| `_deprecated/validate-license`, `_deprecated/stripe-webhook` | Destinos SQL Sí; handlers retirados | `licenses`, validaciones, HWID, rate limits, clientes, subscripciones y entitlements cubiertos en tabla. No se reactivan ni invocan los handlers. |
| Perfil/foto remoto de #1612 | Sin nueva ruta activa | Sync permanece APAGADA. Un futuro writer SQL hacia perfiles/Storage hereda la guarda; no se añade uploader ni servicio. |

La firma de un bearer/licencia es una respuesta, no un registro SQL; esta
corrección no afirma que firma y borrado constituyan una sola transacción de red.
La resolución y las escrituras/consumos SQL sí verifican el UUID. Se conserva
la política offline firmada hasta expiración/reconexión ya aceptada.

### RED → GREEN y evidencia reproducible

`~/evidence/1608-r4/checked-red/`: el runner aplica las 49 migraciones previas
y omite **solo** la nueva con `--before-write-barrier`. Los controles válidos
pasan y las carreras detectan **189 comprobaciones FAIL**. Incluye reset
Clerk/nativo que restaura dispositivo, PII/alias y otros writers que no esperan
o escriben tras confirmar el borrado. No se deshabilita ni sustituye ninguna
función/trigger productivo para fabricar el RED.

`checked-green/`: las **50 migraciones reales** + **94 rutas / 559 checks PASS**
en PostgreSQL17 local macOS arm64. Cada caso hace control válido con rollback,
ejecuta un `user.deleted` real hasta dejar pendiente su commit, lanza el writer
en otra conexión, comprueba el bloqueo real mediante `pg_stat_activity` y
`pg_blocking_pids`, confirma el borrado y verifica SQLSTATE/revocación/no filas.
Después comprueba PII, aliases, dispositivos, accesos, contribuciones, respuestas,
objetos y payloads, y reentrega el mismo borrado. Incluye claims Clerk y claims
nativos completos con TTL300, rol authenticated/service_role y guardas SQL
invocadas por RPC reales. Las pausas de 10 ms son sondeo del lock observado;
no deciden el orden de la carrera. Una prueba adicional con padre sin commit
rechaza la FK antes de escribir, y el reintento válido confirma tras el padre.
Los guards rechazan aislamiento con snapshot antiguo, reinserción del perfil,
borrado/renombrado/reasignación de aliases y exposición directa de helpers.

La cobertura se ejecuta con `--writers` y también al final del runner normal,
tras los gates existentes. `--concurrency` conserva aislada la regresión r3.
Desde la raíz Git, con PostgreSQL existente (sin instalar paquetes):

```sh
python3 -B supabase/tests/run-commercial-local.py --pg-bin /opt/homebrew/opt/postgresql@17/bin --output "$HOME/evidence/1608-r4/recheck-red" --writers --before-write-barrier
python3 -B supabase/tests/run-commercial-local.py --pg-bin /opt/homebrew/opt/postgresql@17/bin --output "$HOME/evidence/1608-r4/recheck-green" --writers
python3 -B supabase/tests/run-commercial-local.py --pg-bin /opt/homebrew/opt/postgresql@17/bin --output "$HOME/evidence/1608-r4/recheck-aliases" --concurrency
```

El primer comando **debe fallar**. Cada ejecución crea PGDATA/puerto loopback
propios y los detiene en `finally`; no admite DSN ni toca DB existente.
En Windows se puede ejecutar el mismo Python bajo WSL con `--pg-bin` de allí.

| Check nuevo | Resultado / evidencia bajo `~/evidence/1608-r4` |
| --- | --- |
| Nuevo inventario/carreras por tabla y RPC | 94 rutas, 74 tablas, **559 PASS**, `checked-green/write-races.log`, `coverage.json`, `inventory.json`; RED189 en `checked-red/`. |
| Regresión previa de aliases | **40/40 PASS**, `aliases-green/concurrency-results.log`. Primer intento cambió ignored por excepción; corregido en el consumidor, sin debilitar el test. |
| Edge completo con tipos | **551 PASS / 0 FAIL / 1 ignored histórico**, `deno-functions.log`. Entorno sin credenciales, red de tests limitada a loopback. |
| Oráculos retirados | **456 huellas PASS**, `retirement.log`. |
| Python parse / diff / revisión completa | PASS; fuente verificada y manifest de SHA256 en evidencia al entregar. |
| pgTAP317 y upgrades48 previos | **No repetidos**: pgTAP no está instalado. Intento real aborta bootstrap con 0A000, `pgtap-unavailable-console.log`. No se simula ni instala extensión. |
| HTTP PostgREST / Ed25519 leyendo SQL real | **No repetido**: PostgREST no instalado. Las carreras usan PostgreSQL real y claims de fixture, no HTTP/OAuth real. No se heredan los PASS de r3. |
| Invocación adicional `supabase/functions supabase/tests` | **FAIL preexistente TS2353**: `evidenceSanitization` en fixture histórica `testing-center-codex-adversarial.test.ts:65`; `deno-fetch-existing.log`. Ningún TS modificado, no se oculta con --no-check. |
| Rust fmt/check/Clippy/Nextest/lifecycle/telemetría; lint TS | Omitidos por alcance SQL/Python/docs; sin native/runtime/domain/ipc/testdata/TS nuevos. |

Primer Deno cached-only no tenía `standardwebhooks@1.0.0`; se descargó la
**dependencia ya declarada** a la caché local, sin modificar manifests/locks ni
añadir dependencias. Se conservan `deno.log`, intentos de fixtures/esquema y
primeras iteraciones de la guarda (`42P21`, nombres cualificados, columnas de
record genérico); no se presentan como RED de producto. La evidencia RED válida
es exclusivamente `checked-red/` frente a la misma suite GREEN.

### Entrega, riesgos y seguimiento

Diff revisado completo. Seis archivos: migración nueva, runner, dos módulos
Python de regresión, este informe y handoff vivo. Commit local en español con
coautor requerido; SHA final en `~/orq/1608.buzon.md` y evidencia. Rama y canal
alcanzado: **rama de issue local**. Sin push, PR nuevo, CI nueva, merge,
promoción, release, deploy, subagentes ni escrituras al tracker.

Último estado **copiado de la review r3**, no consultado en este Mac: issue
[#1608](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1608)
OPEN/in-review, area:plataforma, Project Vantare, sin milestone, updatedAt
`2026-10-14T11:40:15Z`; lectura del revisor 12:13 UTC. VANTA-16/17/15 Por revisar.
Draft [#1622](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1622)
a nightly, HEAD publicado `3ce0eadc`; no se afirma estado remoto actual.
Orquestador: recoger la rama por git, revisar el diff y repetir pgTAP/upgrades/
HTTP con sus herramientas; después actualizar issue/Plane/PR/CI del nuevo SHA.

Antes de activar: comprobar el esquema Storage/FK completo del entorno objetivo
(el bootstrap local es explícito), repetir gates omitidos y medir volumen de
joins/locks. Una futura tabla/FK necesita regenerar las guardas y añadir un
control válido: los gates de catálogo/cobertura lo exigen. Escrituras DML que
entran directamente por UPDATE pueden participar de un deadlock normal de
filas/advisory; PostgreSQL aborta la transacción, nunca se acepta un writer
sin releer el tombstone. Reset/claim conservan el orden UUID→fila. La prueba
no afirma ausencia global de deadlocks ni aceptación de servicios gestionados.

La política es conservadora: una mutación comercial/Testing tardía del UUID
borrado puede rechazarse; historial previo privado y revocaciones se conservan.
No habilitar procesamiento que eluda esta guarda para resolver un retry.
Registry/reconciliación y sync de perfil permanecen inertes. Sin producción,
Clerk/Polar/Storage reales, secretos, compras/refunds/cuentas/datos reales,
precios ni datos/instalación del Mac. No se autoriza venta ni activación.

## #1608 · Cierre comercial ronda 3 (14/10/2026)

Review `C:/tmp/ola2/review-1622-sol-r2.md` leída **entera**. R2-P1-1 es el
único hallazgo nuevo confirmado; la review no añade P2/P3. Encargo de Isaac:
solo local/tests, commit por hallazgo y FIN en buzón. Se continúa el worktree
limpio `C:/tmp/1608-cierre-comercial`, rama `vantareapp/isa-1608-cierre-comercial`,
HEAD inicial `c30e7c4c47aefdb6fec34b757ef467d5a465fab3`, base/merge-base
`e5c90be5f63347fa4d50b4110e1946201c1957c0`; historia r1/r2 conservada.

**RED exacto:** dos transacciones reales de PostgreSQL18. La transacción de
borrado retiene el lock del UUID; la actualización por otro subject lee el
alias vivo y queda bloqueada. `pg_stat_activity`/`pg_blocking_pids` comprueban
la barrera, sin elegir la carrera por una espera fija. El borrado anonimiza y
confirma antes de liberar la actualización. Esta devolvía `applied`, restauraba
el email y alteraba su versión; el retry de borrado devolvía `unchanged` y
dejaba PII restaurada. **16/40 comprobaciones RED**, en cuatro escenarios:
borrado por cada uno de los dos subjects y update anterior (10:00) o posterior
(12:00) al borrado (11:00). Derechos permanecían revocados en el RED.

**Corrección mínima:** B03 relee `identity FOR UPDATE` después de obtener el
lock del UUID y comprueba tombstones de ese UUID antes de escribir PII/versiones.
No usa el registro leído antes de esperar. **GREEN 40/40**: los cuatro updates
devuelven `ignored`; PII sigue NULL, UUID/aliases/versiones conservan tombstone,
grants/hashes/historial revocados y cola/bytes Storage permanecen. Reentregar
el borrado y el update devuelve `unchanged` sin restaurar PII.

Regresión persistente `supabase/tests/commercial_tombstone_race.py`, integrada
en `run-commercial-local.py`: se ejecuta por defecto en el gate completo y
`--concurrency` permite aislarla. Sin drivers, dependencias o DSN externos.
Repetir desde raíz Git:

```powershell
wsl --exec python3 -B /mnt/c/tmp/1608-cierre-comercial/supabase/tests/run-commercial-local.py --pg-bin /usr/lib/postgresql/18/bin --output /mnt/c/tmp/1608-comercial-r3/recheck --concurrency
```

Gates nuevos: **317 pgTAP + 48 upgrade + 40 concurrencia = 405 comprobaciones
PASS**, JWT del handler → PostgREST real (reset204/RLS/nueve denegaciones,
incluido bearer tombstone), Ed25519 sobre SQL real, **551 Deno PASS/0 FAIL/
1 ignored histórico**, calidad/retirada456, guarda deploy, check scripts HTTP
y diff--check PASS. Evidencia `C:/tmp/1608-comercial-r3/`: `red/`, `green/`,
`sql-final/`, tres `upgrade-*/`, `deno.log`, `quality.log`, `surface.log`.
Primer gate HTTP falló por una ruta Deno supuesta inexistente; log conservado
en `sql-console.log`, invocación corregida a la ruta instalada, sin tocar tests.

Solo cambian B03, runner, regresión Python y estos documentos. Rust fmt/check/
Clippy/Nextest/lifecycle/telemetría y lint TS omitidos por alcance: sin fuentes
nativas ni TS nuevas. Migración aún no desplegada; esta corrección de su cuerpo
no actualiza instalaciones donde ya se hubiese aplicado el corte anterior.
Activación/confianza/gateway/servicios gestionados y aceptación comercial real
siguen separados; no autoriza venta. Queda review independiente del nuevo HEAD.

Lectura remota: #1608 OPEN/in-review, area:plataforma, Project Vantare, sin
milestone, updatedAt `2026-10-14T11:40:15Z`; VANTA-16/17/15 Por revisar.
PR [#1622](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1622)
OPEN/draft a nightly, auto-merge OFF, HEAD remoto `c30e7c4c`. Esos estados
pertenecen a r2: **esta ronda queda solo local**, sin push, escritura de PR/
issue/Plane, nueva CI, merge, promoción, release, deploy ni datos reales.
SHA final y petición al orquestador para actualizar seguimiento en
`C:/tmp/buzon/1608.md`; no se atribuye CI de r2 al commit local nuevo.

## #1608 · Cierre comercial ronda 2 (14/10/2026)

Review `C:/tmp/ola2/review-1622-sol.md` leída entera: **dos P1 confirmados;
ningún P2/P3 adicional confirmado**. Se corrigen ambos upgrades en la misma
rama `vantareapp/isa-1608-cierre-comercial`, PR draft [#1622](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1622)
a nightly; arranque limpio `76c1b948`, base `e5c90be5`. No se cambia Rust,
Functions, precios, despliegue, dependencias ni datos reales.

| Hallazgo | RED exacto con datos anteriores | Corrección / GREEN |
| --- | --- | --- |
| P1-1 · issuer histórico con slash | El resolver basal recupera A; después del upgrade el canónico crea B y user.deleted deja PII, compra y alias de A activos. **10/18 aserciones fallan**; otro fixture de canonical/slash con UUID distintos pasa la migración indebidamente. | `a0db4d98`: B03 backfillea el vínculo canónico al UUID original sin borrar aliases. **18/18 PASS**: UUID, compra, RLS, tombstone, PII, Storage y otro issuer. Conflicto **23505** aborta la transacción; **4/4 PASS** prueban historial/perfiles intactos y rollback. |
| P1-2 · refunds históricos sin bloque | Compras de 3000 con refund succeeded parcial de 1000, pending y agregado positivo anteriores al PR conservan grants/read model activos, también después de refresh. **14/26 aserciones fallan**. | `d6e3caf5`: B02 proyecta todos los agregados/refunds del ledger y refresca usuarios bloqueados antes del commit. **26/26 PASS**, sin evento/sync adicional; otra compra/suscripción/entorno, failed/canceled, IDs/hashes y grants base conservados. Cancelación posterior válida restaura solo su fuente. |

Las fixtures se insertan **antes de B03/B01/B02**, usando el esquema y las
RPC de la base; no simulan historial insertando filas tras el upgrade. B03
conserva los aliases admitidos por el resolver anterior (origen exacto o su
variante con un slash) y rechaza su ambigüedad antes del cutover. No fusiona
UUIDs ni inventa vínculos entre instancias/subjects. B02 conserva atribución
por UUID/entorno/fuente y toma estados/versiones/hashes directamente de órdenes
y refunds. No fabrica payment/refund/subscription IDs ni cambia paid-through.
Los writers de orders/refunds/grants quedan serializados hasta commit para
publicar juntos restricciones y read model; el scheduler permanece inerte.

### Gates nuevos y reproducción

Código probado `d6e3caf57dc9ca1ce7dc4771df1405a11b3f8d1b`:
**551 Deno PASS/0 FAIL/1 ignored histórico**, con tipos; **317 pgTAP PASS**
existentes y **48 de upgrade PASS (18+4+26)**, total **365**.
JWT del handler real → PostgREST loopback: reset propio204 y nueve denegaciones,
borrado invalida bearer previo. Ed25519 nativo verificado leyendo SQL real:
Pro refundado excluido, Launch independiente conservado. Calidad/retirada456,
guarda de superficies de deploy, check de los dos scripts HTTP y diff--check
PASS. Diff completo revisado; código anterior y commits por bloqueo preservados.

Desde la raíz Git, repetir la suite Deno y los upgrades aislados:

```powershell
deno test --cached-only --no-lock --allow-all --config supabase/functions/deno.json supabase/functions
wsl --exec python3 /mnt/c/tmp/1608-cierre-comercial/supabase/tests/run-commercial-local.py --pg-bin /usr/lib/postgresql/18/bin --output /mnt/c/tmp/1608-comercial-r2/recheck-identity --upgrade identity
wsl --exec python3 /mnt/c/tmp/1608-cierre-comercial/supabase/tests/run-commercial-local.py --pg-bin /usr/lib/postgresql/18/bin --output /mnt/c/tmp/1608-comercial-r2/recheck-conflict --upgrade identity-conflict
wsl --exec python3 /mnt/c/tmp/1608-cierre-comercial/supabase/tests/run-commercial-local.py --pg-bin /usr/lib/postgresql/18/bin --output /mnt/c/tmp/1608-comercial-r2/recheck-refunds --upgrade refunds
```

El runner sin `--upgrade` ejecuta las 317 aserciones existentes; añadir
`--postgrest-bin` y `--deno-bin` con las herramientas locales para el gate
HTTP/Ed25519. Nunca acepta DSN externo; usa cluster/puerto nuevos y lo detiene
incluso ante fallo. Logs RED/GREEN y gates en `C:/tmp/1608-comercial-r2/`.
Primeras fixtures P1-1 tenían un subject corto y un ANY mal formado: errores
conservados, corregidos **antes del RED válido**. Check auxiliar falló primero
por flag Deno retirado y después por `--no-remote`; se corrigió la invocación
sin cambiar fuentes, lock o dependencias. Gates finales anteriores son nuevos,
no herencia del HEAD revisado ni de #1615.

### Estado y límites de esta ronda

Handoff/issue actualizados tras cada hallazgo; Plane VANTA-16/17/15 En curso
durante ejecución y Por revisar al publicar. GitHub #1608 OPEN/in-review,
area:plataforma, Project Vantare, sin milestone. Commit documental posterior;
HEAD/push/PR/CI y timestamp finales se verifican en issue y buzón.
Solo rama de issue con draft; sin merge/promoción/release/producción,
Clerk/Polar/Storage reales, secretos/dependencias nuevas o compras/refunds reales.
Rust fmt/check/Clippy/Nextest/lifecycle/telemetría y lint TS omitidos en esta
ronda: solo SQL, runner Python y documentación; ningún cambio nativo/TS.
Clerk/OAuth/datos monetarios son fixtures; PostgreSQL/PostgREST/firma reales y
locales. Configurar confianza/desplegar/aceptar datos reales sigue separado.

Riesgos: aliases de UUID distintos requieren resolver el conflicto antes de
aplicar B03; la migración aborta sin destruir historial. B02 bloquea writers
durante el backfill: duración/volumen de datos reales no medidos aquí. Solo se
convierte evidencia persistida; no se reconstruyen eventos o enlaces de
suscripción ausentes mediante inferencias. Queda review independiente del nuevo
SHA y CI; estas correcciones locales no autorizan venta.

## #1608 · Cierre comercial B03 → B01 → B02 (14/10/2026)

Encargo explícito de Isaac: implementar los tres planes en rama nueva, solo
local/tests. Worktree `C:/tmp/1608-cierre-comercial`, rama
`vantareapp/isa-1608-cierre-comercial`, arranque #1615 `7aab0699`.
#1615 entró en nightly `e5c90be5`; rebase de **solo los commits de cierre** a
esa base antes del push. El HEAD/PR/checks finales están en issue/buzón.

### Diez líneas para Isaac

1. B03 recibe borrados Clerk firmados y conserva un tombstone irreversible del UUID.
2. Un update tardío, otra identidad histórica o un evento Polar no devuelve acceso.
3. Perfil/datos personales de Testing se anonimizan o retiran; el historial comercial queda privado.
4. Storage elimina archivos por su API con cola durable; un fallo pide reintento sin perder pendientes.
5. B01 firma el bearer de datos con issuer/audiencia propios, TTL ≤300 y vínculo exacto Clerk/UUID.
6. Una cuenta Clerk-only puede resetear su equipo; tokens falsos, legacy o de otra identidad se rechazan.
7. B02 acepta refunds ordinarios sin payment ID, incluye Pro y retira la fuente incluso con parcial/pending.
8. Una renovación tardía no levanta la restricción; failed/canceled restaura solo la fuente vigente.
9. Agregados y eventos perdidos convergen por reconciliación; otra compra/suscripción y otro entorno permanecen.
10. Código preparado/probado en local; activar confianza/backend y aceptar la matriz real sigue separado.

### Decisiones por defecto autorizadas

Registradas como DUDA en `C:/tmp/buzon/1608.md`; sin esperar respuestas.
Firmante HS256 dedicado `NATIVE_DATA_JWT_SECRET`, sin fallback Auth; issuer
`<SUPABASE_URL>/native-data/v1`, audiencia `vantare-native-data`.
El registry se crea vacío, sin habilitar instancias o confianza del gateway.
La configuración de claves/confianza en Supabase gestionado requiere revisión
y autorización propias: PostgREST loopback no demuestra ese gateway.

El UUID/issuer/subject borrado no se recrea automáticamente. Se preservan
identificadores comerciales, hashes y auditoría privada; no se inventa un plazo
legal ni una purga automática. Perfil, dispositivo, diagnósticos y contribuciones
personales del contrato actual se anonimizan/retiran. La cola de Storage queda
privada y se drena mediante API antes de ACK; no se borra storage.objects por SQL.
Offline conserva la política firmada hasta reconexión/expiración; no hay promesa
de revocación instantánea sin red.

Pro se vincula a su factura y subscription ID inmutable. Refund partial/pending/
succeeded o agregado positivo bloquea esa suscripción y su recovery. Otra fuente
legítima permanece. Failed/canceled conserva paid-through, no lo extiende; una
renovación tardía no borra el bloqueo. Disputa se procesa desde la API Polar,
con su propia restricción/versionado. La política BIL-13 restaura al ganar el
cliente, conservando cualquier restricción independiente de refund. No se ejecuta
ninguna operación monetaria. El agregado se registra por su fuente real, sin
fabricar refund ID ni payment ID; la reconciliación recorre páginas sin truncar.

### RED → GREEN y cobertura

| Bloqueo | RED conservado | GREEN local |
| --- | --- | --- |
| B03 | Bearer firmado del handler basal por HTTP: perfil propio visible antes y después de entregar user.deleted, porque falta consumidor; expected 0, obtuvo 1 (`B03-red-http`). También se conserva el RED de registry ausente. | 23 cutover + 19 tombstone: duplicate/hash conflict, delete→late update, delete-before-create, UUID histórico/alias, PII, RLS/reset, grants Polar posteriores, Storage queue y ACK/retry. Svix firma real/tampering/caducidad/reintento Deno. |
| B01 | Issuer basal incorrecto en Deno; JWT del handler anterior, firma validada por PostgREST, devuelve reset403 en vez de204 (`B01-red-http4`). | Handler actual→JWT firmado→PostgREST real reset204, perfil propio RLS; firma alterada, UUID/issuer/audiencia falsos, legacy, TTL>300, expired/future y bearer anterior al tombstone denegados. |
| B02 | Cuatro RED exactos `B02-red-deno.log`: ordinary sin payment_id, Pro, parcial y agregado sin refund.updated. SQL basal carece de contrato order/subscription nullable (`B02-red-sql`). | Los cuatro GREEN, más pending→failed/canceled, late renewal, binding durable/entornos, otra fuente y reconciliación; SQL 34 aserciones del contrato monetario. |

Gates locales finales: **551 Deno PASS / 1 ignored histórico**, con typecheck;
**317 pgTAP PASS** (23+54+43+17+51+20+56+19+34), incluyendo inbox/concurrencia,
proyección, reconciliación, lifecycle, observabilidad y acceso operacional.
El nuevo gate HTTP sí ejecuta PostgREST real y no está omitido: admin SDK lee
SQL real y el handler native-license firma Ed25519; se verifica la firma y que
Pro refundado no aparece mientras Launch independiente sí permanece.
Clerk OAuth y los datos monetarios son fixtures inyectadas, no servicios reales.
Lint de Functions tocadas PASS; retirada/calidad 456 huellas PASS y diff --check PASS.
Los gates finales se repiten tras rebase; resultados finales en issue/buzón.

No cambios Rust, runtime/domain/ipc/testdata: fmt/check/Clippy/Nextest/lifecycle/
telemetría nativos omitidos por alcance. No se atribuye a este cierre el verde
Rust anterior de #1615. El cliente trata el bearer como opaco: protocolo intacto.
Los tests históricos de autoridad Supabase legacy y refunds BIL-07 no sustituyen
el contrato nuevo: sus escenarios aplicables se cubren por cutover/BIL-13. Se
conservan sus archivos históricos; las suites activas Deno se adaptan a la
política más restrictiva sin quitar escenarios o asserts de aislamiento.

Fallos de entorno y primeros intentos conservados en `C:/tmp/1608-comercial/`:
readiness OpenAPI de PostgREST, permiso de import dinámico, prefijo /rest/v1 del
SDK en el servidor standalone y bootstrap de grants service_role. El runner usa
DSN generado solo en loopback, base nueva, puerto aleatorio y limpieza propia;
nunca recibe DSN remoto. Dos fixtures SQL heredadas se hacen portables: dblink
usa el puerto real y la proyección evalúa su reloj inyectado en agosto en lugar
de depender de la fecha del PC. No se cambia producto ni se relajan asserts.
Los errores SQL del paquete #1523 (CASE y nombre de variable ambiguo) se reparan
al verificarlo aquí. No se importa/preaprueba #1523 entero: solo los contratos
de estos tres bloqueos; se preservan F01–F09 y el binding prioritario de #1615.

### Verificación final del cierre local

Código probado `05e79d1a1cb68c48f07213aaa89a7d0a69e2b43a`, base rebasada `e5c90be5f63347fa4d50b4110e1946201c1957c0`. Rebase sin conflictos;
árbol de #1615 y nightly eran idénticos antes de aplicar los tres bloqueos.

```
05e79d1a fix(1608): reconcile refund restrictions and durable ownership (B02)
2b675292 fix(1608): bind native data bearer to active Clerk UUID (B01)
df527462 fix(1608): tombstone Clerk accounts and prevent resurrection (B03)
```

En este SHA: Deno completo 551 PASS/1 ignored; SQL 317 PASS; JWT/PostgREST
real y emisor nativo Ed25519 sobre SQL real PASS. Los 25 TypeScript tocados
pasan lint; los dos scripts del gate HTTP pasan check. Calidad/retirada 456
huellas y diff --check PASS. Logs delivery-deno.log, delivery-sql-console.log,
delivery-sql/, check-scripts.log y lint-all-final.log en C:/tmp/1608-comercial.
El check inicial usó un flag Deno retirado; se corrigió la invocación y una
anotación de tipos de la fixture dinámica, sin cambiar producto. El paquete
standardwebhooks ya existía fijado a 1.0.0: se usa esa misma versión, sin nueva
dependencia ni cambio de lock. Commit posterior solo de documentación.

Push/PR draft/CI y Por revisar se verifican al publicar y quedan en issue/buzón;
no se atribuye a esta rama la integración de #1615 hecha por otro actor.

### Entrega y límites

VANTA-16/17/15 En curso durante ejecución; al cierre Por revisar con PR draft a
nightly, GitHub #1608/area:plataforma/Project Vantare y handoff actualizados.
No hay deploy/migración remota, scheduler activo, Clerk/Polar reales, precios,
secrets, nuevas dependencias, compras/refunds, UI, datos/instalación de Isaac,
merge de esta rama, promoción ni release. PostgREST v16.4 gratuito de GitHub
oficial se descarga solo como herramienta bajo C:/tmp; no dependencia del repo.

**B01/B02/B03 cerrados en implementación y pruebas locales; no constituyen
autorización ni prueba de venta activa.** Queda review independiente del nuevo
SHA, CI, configuración/despliegue separados y aceptación monetaria/Clerk/
Storage/gateway gestionado reales con autorización. Rollback seguro: deshabilitar
handlers/trust/scheduler y parar activación; no restaurar la autoridad legacy ni
borrar tombstones/ledger para forzar un downgrade. Las migraciones se aplican
en transacción sobre el esquema completo local; cualquier ambiguity de FK,
ownership o versión aborta/quarantina, no se resuelve borrando historial.

# Revisión de cuentas y pagos · #1608 · 14/10/2026

## Integración autorizada tras review r3 APTA

### Resumen de diez líneas para Isaac

1. Reanudación limpia en `8fecf307`; fast-forward conserva el merge remoto `812ed8ec`.
2. Merge `eca5155f6a51aad620e5af5d4ad51368edcaaa83`, padres `812ed8ec` + nightly `5b781964`.
3. Se incorporan #1611/#1617/#1618 mediante merge, sin rebase ni historia reescrita.
4. Conflicto único `native/services/src/app.rs`: rechazo definitivo conserva revocación/ACK.
5. Renovación correcta conserva analytics consentido después de transferir derechos; sin política nueva.
6. Los otros 66 archivos entrantes coinciden exactamente con nightly; prueba y hashes en logs.
7. fmt/check/Clippy PASS; Nextest 1697 PASS/12 skips heredados y lifecycle 18 PASS.
8. Telemetría 25 PASS/0 skips, ACC largo 814.150 s; Deno 534 PASS/1 ignored existente.
9. SQL230 y followup35+F1–F4/concurrencia/rollback PASS; integridad456 y tooling PASS.
10. Sin promoción/producción/release; B01/B02/B03 siguen No-Go comercial y CI final se lee tras push.

Evidencia nueva `C:/tmp/1608-merge/`, cola `native/scripts/compilar.ps1`,
target propio `native/target/gates`, CARGO_BUILD_JOBS=2 y APPDATA/LOCALAPPDATA
bajo la QA aislada de esta integración. Código probado `eca5155f`; hashes Rust
conservados en `integration-proof.json` y contrastados antes del cierre documental.
No se han añadido ni relajado tests. Las cinco exclusiones adicionales son los
bancos manuales de rendimiento de #1611, idénticos a nightly; no se ejecutan como
medición física. Se conservan las siete exclusiones previas. PostgREST real sigue
ignored en Deno y la sonda B01 sigue RED separado, fuera de las 230 assertions GREEN.

Testing Center: 35 pgTAP, snapshot tardío, concurrencia y rollback/reaplicación;
F1 17, F1IP 26, F2 6, F3 8 y F4 legacy/6 bloqueos de rollback PASS. F2/F3
usan el SQL exacto #1602 extraído en la evidencia anterior, sin integrarlo ni
modificarlo. Tooling: 138 tests scripts GitHub, 8 paneles, 4 followup y snippet
Node PASS. Guardas de superficie TypeScript/PowerShell PASS, sin despliegue.

Fallos de entorno conservados: Deno inicial resolvía tipos contra un node_modules
anterior; segunda invocación tenía cwd/permisos insuficientes. Se corrigió la
invocación (`--node-modules-dir=none`, config explícita, cwd raíz y allowlist de
lectura), sin cambiar tests. La caché node_modules preexistente en Functions se
apartó reversiblemente a `C:/tmp/1608-merge/deno-node-modules` para pasar la guarda
de superficie; no se borró ni se cambió ninguna dependencia. La primera ejecución
de la sonda de conservación usó cwd incorrecto; se corrigió en tooling de evidencia.

Auto-merge preexistente de #1615 estaba activado por Isaac desde 03:20:18Z.
Desactivado reversiblemente y verificado antes del push: este encargo permite
merge de nightly en la rama, no promoción a nightly. PR ready conservada, sin
alterar reviews. HEAD final/push/CI y VANTA-16/17/15 Por revisar se verifican en
issue/buzón después de publicar. No se presenta la CI del SHA anterior como nueva.
Sin GUI física, Clerk/Polar/PostgREST real, compras/refunds, instalación/datos
reales, visual nuevo, subagentes ni release. B01/B02/B03 continúan sin implementación.

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
