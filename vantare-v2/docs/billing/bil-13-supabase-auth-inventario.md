# ISA-1514 — inventario Supabase Auth y fronteras de identidad

Fecha: 2026-10-08. Solo revisión documental; no prueba del schema desplegado.

## Alcance reproducible

- Base documental/SQL/billing: `cb5b24b8c8e1f204a874fe5759e009b3507430e7` (rama
  #1506). Todos los localizadores sin etiqueta corresponden a esa base.
- **Nativo**: `origin/vantareapp/isa-1470-candidato-beta` fijado en
  `a8f9bdc3b69561e007e656f270de95fa41fba54b`. Su lista se etiqueta aparte; la
  base documental no incluye esas migraciones. No se importa código.
- **Web apilada #1502**: `C:/tmp/web-1502`, repo
  `isaacalbala12/vantare-simracing-suite-web`, HEAD
  `89f934bfe00fdb8d8d379199da0308a1ea09ad16`, limpio al inspeccionarlo.
- **Web principal**: `C:/Users/isaac/Desktop/Vantare Beta Web`, rama
  `flagship-experience`, HEAD `c120b4574a7625e6d06910a52cd3a1693d02cf11`, con
  cambios ajenos (Astro y otros). Inspección de código público únicamente;
  ningún cambio/copias de secretos. No equivale al sitio desplegado.
- Se recorren blobs Git de código/config/tests por extensiones SQL, TS/TSX,
  JS/JSX/MJS, Go, Rust, TOML, PowerShell, Python, HTML y JSON. Se excluyen
  `.env*`, dumps/backups, artefactos, vendor, locks y fixtures de datos. No se
  leen filas reales, contraseñas ni material privado. Los tests se listan
  aparte; los comentarios y migraciones históricas cuentan como referencias, no
  como objetos vigentes. Las cifras de categorías se solapan.
- Patrones: `auth.users`, `auth.uid()`, `auth.jwt()/auth.role()`, FK a Auth,
  métodos Auth de cliente, imports del wrapper, `/auth/v1`, puente Clerk y
  configuración `verify_jwt`/Auth. La revisión semántica de tablas y
  consumidores complementa las coincidencias; el SQL de catálogo del plan
  comprueba lo real.
- No se inspeccionó Dashboard ni producción. Providers, plantillas SMTP/Auth,
  hooks remotos, usuarios y RLS realmente desplegada quedan **desconocidos**.
  Esta es una cobertura completa del código delimitado, no de configuración
  remota invisible. Un archivo de backup SQL no es fuente segura de usuarios.

## Cifras de código productivo/config (excluye tests)

| Categoría     | Base: líneas / archivos | Nativo: líneas / archivos |
| ------------- | ----------------------- | ------------------------- |
| auth.users    | 26 / 12                 | 33 / 15                   |
| auth.uid      | 37 / 11                 | 37 / 11                   |
| auth.jwt/role | 0 / 0                   | 2 / 2                     |
| FK Auth       | 19 / 8                  | 19 / 8                    |
| cliente Auth  | 62 / 22                 | 66 / 25                   |
| puente Clerk  | 0 / 0                   | 62 / 12                   |
| config        | 8 / 3                   | 12 / 3                    |

Base: **40 archivos** con coincidencias; nativo: **51**. Web apilada: **0**
coincidencias Auth/Clerk en código.

## Interpretación: SQL, tablas y situación de cada base

**19 definiciones FK directas en 19 tablas / 8 migraciones**. Son las mismas
definiciones históricas en ambas ramas; el candidato después elimina la FK de
profiles (#909) y cambia cinco del Testing Center a profiles (#1452). Por tanto,
**13 quedarían directas a Auth** en un schema reconstruido con ese candidato,
según esas migraciones, no un conteo certificado de producción. La FK de
`billing_checkout_attempts` sigue impidiendo compras de cuentas Clerk-only.

| Tabla / columna con FK a Auth                             | Definición (base y nativo)                                                     | Acción propuesta                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| profiles.id                                               | `supabase/migrations/20260605140000_initial_schema.sql:8`                      | #909 la retira; cuenta UUID independiente                              |
| licenses.user_id                                          | `supabase/migrations/20260605140000_initial_schema.sql:18`                     | Retener derechos legacy; FK a profiles o retiro tras cero consumidores |
| subscriptions.user_id                                     | `supabase/migrations/20260605140000_initial_schema.sql:32`                     | Igual; no borrar pagos Stripe históricos                               |
| license_validations.user_id                               | `supabase/migrations/20260605140000_initial_schema.sql:47`                     | Identidad interna, revisión de retención                               |
| rate_limits.user_id                                       | `supabase/migrations/20260605140000_initial_schema.sql:66`                     | Cuenta UUID, nullable; no vincular por IP/email                        |
| billing_checkout_attempts.user_id                         | `supabase/migrations/20260802000000_billing_checkout_attempts.sql:2`           | Imprescindible antes de comprar con Clerk                              |
| testing_center_reports.reporter_user_id                   | `supabase/migrations/20260802130100_testing_center_core.sql:12`                | Candidato cambia a profiles, conserva restrict                         |
| testing_center_validations.actor_user_id                  | `supabase/migrations/20260802130100_testing_center_core.sql:109`               | Migrar actor interno, mantener auditoría                               |
| testing_center_promotions.authorized_by_user_id           | `supabase/migrations/20260802130100_testing_center_core.sql:150`               | Igual; nunca claim de cliente concede promoción                        |
| testing_center_audit.actor_user_id                        | `supabase/migrations/20260802130100_testing_center_core.sql:194`               | Retención/seudonimización auditada                                     |
| testing_center_pauses.requested_by_user_id                | `supabase/migrations/20260802130100_testing_center_core.sql:254`               | Actor interno, permisos servidor                                       |
| testing_center_memberships.user_id                        | `supabase/migrations/20260802140000_testing_center_access.sql:5`               | Candidato cambia FK a profiles; roles siguen servidor                  |
| testing_center_report_submission_keys.reporter_user_id    | `supabase/migrations/20260802150000_testing_center_report_submission.sql:74`   | Candidato cambia FK a profiles                                         |
| testing_center_report_events.actor_user_id                | `supabase/migrations/20260802150000_testing_center_report_submission.sql:103`  | Candidato cambia FK a profiles                                         |
| testing_center_validation_snapshots.actor_user_id         | `supabase/migrations/20260803120000_testing_center_candidate_feedback.sql:41`  | Cuenta interna y evidencia retenida                                    |
| testing_center_owner_dispositions.actor_user_id           | `supabase/migrations/20260803120000_testing_center_candidate_feedback.sql:103` | Cuenta interna; Owner no procede de metadata Clerk                     |
| testing_center_posthog_consent_events.actor_user_id       | `supabase/migrations/20260803130000_testing_center_posthog_privacy.sql:13`     | Conservar retirada de consentimiento, minimizar datos                  |
| testing_center_posthog_evidence.linear_link_authorized_by | `supabase/migrations/20260803130000_testing_center_posthog_privacy.sql:66`     | Campo histórico, no reactivar Linear                                   |
| testing_center_evidence_batches.reporter_user_id          | `supabase/migrations/20260814154558_testing_center_screenshot_evidence.sql:34` | Candidato cambia FK a profiles                                         |

Triggers/funciones de aprovisionamiento: `handle_new_user` en
`supabase/migrations/20260605140000_initial_schema.sql:127`, trigger
`on_auth_user_created` en
`supabase/migrations/20260605140000_initial_schema.sql:147` (AFTER INSERT Auth).
Backfills de contacto/perfil en
`supabase/migrations/20260709120000_provider_agnostic_billing.sql:17` y
`supabase/migrations/20260709160000_backfill_profiles_for_existing_auth_users.sql:29`.
Se retiran del schema vigente tras migrar, conservando historia SQL. Triggers de
updated_at/auditoría ajenos a Auth se mantienen.

RLS/RPC: las **37 líneas `auth.uid()` en 11 archivos** están enumeradas abajo,
incluyendo profiles/licencias, user_entitlements/devices/billing, role/canales y
validación/feedback/screenshots del Testing Center. Algunas migraciones
reemplazan funciones anteriores: contar referencias no cuenta policies finales.
`claim_active_device`, `read_account_entitlements`, `reset_active_device` y
`get_account_entitlements` se definen/endurecen en
`supabase/migrations/20260802020000_supabase_auth_license_hardening.sql:3,37,83,116`;
sus joins de email a Auth también son dependencia (`:66`). El candidato
reemplaza su resolución, pero `read_account_entitlements` aún hace join a Auth
(`supabase/migrations/20260828124540_clerk_account_bootstrap.sql:169`).

`auth.jwt()` tiene **0** referencias productivas en la base; **2** en candidato,
en el resolver #909 y su reemplazo del bridge. Mantener el helper con TPA;
retirar la compatibilidad Supabase identity del resolver solo tras cutover. Las
policies native que operan con token HS256 UUID aún no son RLS Clerk text: no
presentar el bridge de datos como migración TPA completa.

Tablas de dominio a conservar, aunque no tengan FK directa a Auth:

| Familia                                                                                        | Referencias de definición                                                         | Identidad/capabilities                                                |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| user_entitlements, devices, license_events, billing_customers, billing_subscriptions           | `supabase/migrations/20260709120000_provider_agnostic_billing.sql:43,56,65,74,87` | UUID a profiles; RLS legacy usa auth.uid                              |
| billing_checkout_attempts                                                                      | `supabase/migrations/20260802000000_billing_checkout_attempts.sql:1`              | UUID; FK Auth por reemplazar, clave user+attempt                      |
| billing_webhook_inbox, billing_webhook_effects, billing_webhook_replay_audit                   | `supabase/migrations/20260802090000_billing_webhook_inbox.sql:4,29,45`            | Inbox/replay no requiere login Auth; firma y service_role             |
| billing_commercial_resources, billing_access_grants, billing_reconciliation_runs               | `supabase/migrations/20260802100000_billing_commercial_projection.sql:5,24,42`    | Cuenta interna; capability/source/env/version y grants independientes |
| billing_subscription_recovery_cycles                                                           | `supabase/migrations/20260802110000_billing_subscription_lifecycle.sql:81`        | Recuperación/paidThrough; no sustituir por metadata Clerk             |
| billing_orders, billing_refunds                                                                | `supabase/migrations/20260802120000_billing_order_refund_ledger.sql:5,29`         | Ledger para atribución/retiro; no borrar con identidad                |
| operational_access_assignments, operational_access_audit, operational_legacy_grant_retirements | `supabase/migrations/20260803140000_operational_access_assignments.sql:7,39,52`   | UUID a profiles; roles operativos servidor, no role JWT               |
| account_identities (solo candidato)                                                            | `supabase/migrations/20260828124540_clerk_account_bootstrap.sql:31`               | issuer/sub text → account UUID; mapping cerrado                       |

## Edge: todos los consumidores y las otras autoridades

La base tiene **4 funciones** que importan `_shared/auth.ts`:
`billing-checkout/index.ts:1,56`, `billing-portal/index.ts:1,144`,
`license-credential/index.ts:2,104`, `testing-center-feedback/index.ts:1,234`
(prefijo `supabase/functions/`). El wrapper usa `auth.getUser(token)` en
`supabase/functions/_shared/auth.ts:56`. Una quinta función histórica llama
getUser directamente:
`supabase/functions/_deprecated/validate-license/index.ts:32`. No retirar el
wrapper hasta resolver cada consumidor.

En el candidato, license-credential abandona ese wrapper y resuelve por RPC TPA;
billing-checkout/portal y feedback siguen usando Auth. Nativo tiene
`supabase/functions/_shared/native-auth.ts:49,163,174` (verify OAuth, estado
banned/locked, resolver UUID) y `supabase/functions/native-license/index.ts:79`
(emisión para OAuth verificado).
`supabase/functions/native-account-authorize/index.ts:25,104,113,117` verifica
OAuth y emite token HS256 de **datos**, no un usuario Auth. `native-admin` usa
esa frontera y roles del servidor; no convertir `role:authenticated` en Owner.

El resto de funciones de billing operan con firma Polar/service-role/inbox, no
hacen login Supabase. Mantener `_shared/supabase-admin.ts`, catálogo,
monotonicidad, ledger/replay/reconciliación. Scripts
`supabase/functions/scripts/reconcile-polar-customer-state.ts:54` enumeran
billing_customers, no usuarios Auth; no descubren huérfanos automáticamente. La
lista de configuración abajo incluye `verify_jwt`; gateway no demuestra que
getUser acepte Clerk. Config local no permite inferir config desplegada.

## Clientes, sesión protegida, offline y web

- Wails frontend:
  `vantare-v2/frontend/src/lib/supabase-auth.ts:38,76,98,117,139,150,174,207,310`
  crea cliente, password/signup/logout/reset/session/restore/OAuth/listener.
  Imports/transitivos en LoginScreen, SettingsOrbitPage, use-account-identity,
  AuthSessionBridge, billing-client, entitlements-refresh y clientes Testing
  Center aparecen abajo. Wails se retira tras beta; no migrarlo por simetría.
- Go Wails: `vantare-v2/internal/server/server.go:415,433,474,515` transporta
  callback/refresh; `vantare-v2/cmd/vantare/main.go:107,2121,2140` restaura
  sesión protegida. `vantare-v2/internal/authsession/store.go:20,21,24,32`
  almacena access/refresh Supabase en OS, no en LocalStorage. Es código a
  retirar con Wails; no inspeccionar almacenes reales. La base
  `vantare-v2/internal/license/service.go:210,234,322,449` usa subject JWT en
  validación/cache; el candidato #909 separa `sub` externo del UUID firmado.
- Electron histórico: `packages/auth/src/auth-service.ts:48,69,102,109`
  login/signup/logout/sesión, `:54,77` persiste tokens;
  `packages/auth/src/supabase-client.ts:1,4`, main auth setup e IPC del
  `apps/desktop` son consumidores heredados. Confirmar cero distribución activa
  antes de eliminar dependencias compartidas, no tratarlos como app de venta.
- Native (solo candidato): `vantare-v2/native/services/src/account.rs:65,271`
  discovery/restauración OAuth Clerk;
  `vantare-v2/native/hub/src/services/access.rs:245` portal development;
  `vantare-v2/native/services/src/license_remote.rs:44,107` renueva vía
  native-license y recibe UUID solo de credencial verificada. No login Supabase.
- BIL-08: `supabase/functions/license-credential/index.ts:171,172,291,306` firma
  subject UUID/device y grants perpetuos/paidThrough. Mantener claves Ed25519,
  clock, environment/canal, un dispositivo y scope Launch.
  `vantare-v2/internal/license/credential.go:43,44,60,61,92` modela firma,
  expiración/dispositivo/reloj, no cuenta Clerk. Native lo verifica en
  `vantare-v2/native/services/src/license.rs:12` y license_remote anterior.
  Sesión login y envelope offline se migran por separado. Un webhook no borra
  una credencial perpetua de un equipo desconectado.
- Scripts: no se encontró script de login/session Supabase en la selección
  productiva `scripts/`/`supabase/functions/scripts/`. Sí hay generación config
  pública en `vantare-v2/tools/generate_supabase_config.ps1:2,36,39` y harness
  SQL/Deno con Auth simulado. Mantener names-only y no leer `.env*`.
- Web #1502: cero dependencias Auth/Clerk detectadas; **no hay compra
  autenticada implementada**. `checkout-config.js:1,3,4,5,9` propone links
  directos y hoy apunta Discord; `index.html:284,290,296,299,399` marca compra
  no disponible. Retirar consejo de link directo cuando se diseñe la compra
  autenticada.
- Web principal Astro (cambios ajenos): inspección de `src/`, `scripts/`,
  package.json y script.js sin coincidencias Supabase/Clerk productivas;
  `src/config/site.ts:13` tiene pricing deshabilitado. No prueba ausencia en
  otra rama ni en Cloudflare real. No editar ni llevar sus cambios al PR #1514.

La lista siguiente conserva cada coincidencia por archivo:línea. Los bloques
anteriores añaden dependencias semánticas de sesión/offline que no contienen
literalmente `auth.users` ni los métodos de login. Los localizadores agrupados
`:1,2` significan líneas individuales, no rangos.

## Base — todas las referencias productivas/config

- **apps/desktop/src/main/auth/license.ts** — cliente Auth.
  `apps/desktop/src/main/auth/license.ts:1`.
- **apps/desktop/src/main/auth/setup.ts** — cliente Auth.
  `apps/desktop/src/main/auth/setup.ts:5,51,59,63`.
- **apps/desktop/src/main/ipc/handlers.ts** — cliente Auth.
  `apps/desktop/src/main/ipc/handlers.ts:2,107,108,109,110,111`.
- **packages/auth/src/auth-service.ts** — cliente Auth.
  `packages/auth/src/auth-service.ts:8,9,20,21,27,48,69,102,161`.
- **packages/auth/src/index.ts** — cliente Auth.
  `packages/auth/src/index.ts:7,12`.
- **packages/auth/src/types.ts** — cliente Auth.
  `packages/auth/src/types.ts:42`.
- **supabase/config.toml** — config. `supabase/config.toml:8,11,14,17,20,23`.
- **supabase/functions/_deprecated/validate-license/index.ts** — cliente Auth.
  `supabase/functions/_deprecated/validate-license/index.ts:32`.
- **supabase/functions/_shared/auth.ts** — cliente Auth.
  `supabase/functions/_shared/auth.ts:29,56`.
- **supabase/functions/billing-checkout/index.ts** — cliente Auth.
  `supabase/functions/billing-checkout/index.ts:1,56`.
- **supabase/functions/billing-portal/index.ts** — cliente Auth.
  `supabase/functions/billing-portal/index.ts:1,144`.
- **supabase/functions/license-credential/index.ts** — cliente Auth.
  `supabase/functions/license-credential/index.ts:2,104`.
- **supabase/functions/testing-center-feedback/index.ts** — cliente Auth.
  `supabase/functions/testing-center-feedback/index.ts:1,234`.
- **supabase/migrations/20260605140000_initial_schema.sql** — FK Auth; auth.uid;
  auth.users.
  `supabase/migrations/20260605140000_initial_schema.sql:8,18,32,47,66,148,166,170,171,176,193,210,220`.
- **supabase/migrations/20260709120000_provider_agnostic_billing.sql** —
  auth.uid; auth.users.
  `supabase/migrations/20260709120000_provider_agnostic_billing.sql:14,17,129,133,137,141,145,173,229,257`.
- **supabase/migrations/20260709150000_fix_get_account_entitlements_device_binding.sql**
  — auth.uid; auth.users.
  `supabase/migrations/20260709150000_fix_get_account_entitlements_device_binding.sql:21,77`.
- **supabase/migrations/20260709160000_backfill_profiles_for_existing_auth_users.sql**
  — auth.users.
  `supabase/migrations/20260709160000_backfill_profiles_for_existing_auth_users.sql:29`.
- **supabase/migrations/20260802000000_billing_checkout_attempts.sql** — FK
  Auth; auth.users.
  `supabase/migrations/20260802000000_billing_checkout_attempts.sql:2`.
- **supabase/migrations/20260802020000_supabase_auth_license_hardening.sql** —
  auth.uid; auth.users.
  `supabase/migrations/20260802020000_supabase_auth_license_hardening.sql:10,66,78,90`.
- **supabase/migrations/20260802130100_testing_center_core.sql** — FK Auth;
  auth.users.
  `supabase/migrations/20260802130100_testing_center_core.sql:12,109,150,194,254`.
- **supabase/migrations/20260802140000_testing_center_access.sql** — FK Auth;
  auth.uid; auth.users.
  `supabase/migrations/20260802140000_testing_center_access.sql:5,36,71,78,92,108,141`.
- **supabase/migrations/20260802150000_testing_center_report_submission.sql** —
  FK Auth; auth.uid; auth.users.
  `supabase/migrations/20260802150000_testing_center_report_submission.sql:74,103,150,184`.
- **supabase/migrations/20260803120000_testing_center_candidate_feedback.sql** —
  FK Auth; auth.users.
  `supabase/migrations/20260803120000_testing_center_candidate_feedback.sql:41,103`.
- **supabase/migrations/20260803130000_testing_center_posthog_privacy.sql** — FK
  Auth; auth.uid; auth.users.
  `supabase/migrations/20260803130000_testing_center_posthog_privacy.sql:13,66,123`.
- **supabase/migrations/20260808000000_race_schedule_publications.sql** —
  auth.uid.
  `supabase/migrations/20260808000000_race_schedule_publications.sql:90,125,192,193`.
- **supabase/migrations/20260813193000_testing_center_agent_closeout_callbacks.sql**
  — auth.uid.
  `supabase/migrations/20260813193000_testing_center_agent_closeout_callbacks.sql:300`.
- **supabase/migrations/20260814154558_testing_center_screenshot_evidence.sql**
  — FK Auth; auth.uid; auth.users.
  `supabase/migrations/20260814154558_testing_center_screenshot_evidence.sql:34,174,212,377,471`.
- **vantare-v2/cmd/vantare-admin/main.go** — auth.uid.
  `vantare-v2/cmd/vantare-admin/main.go:133`.
- **vantare-v2/frontend/src/hub/auth/LoginScreen.tsx** — cliente Auth.
  `vantare-v2/frontend/src/hub/auth/LoginScreen.tsx:8`.
- **vantare-v2/frontend/src/hub/orbit/use-account-identity.ts** — cliente Auth.
  `vantare-v2/frontend/src/hub/orbit/use-account-identity.ts:5,75`.
- **vantare-v2/frontend/src/hub/settings-orbit/SettingsOrbitPage.tsx** — cliente
  Auth. `vantare-v2/frontend/src/hub/settings-orbit/SettingsOrbitPage.tsx:26`.
- **vantare-v2/frontend/src/hub/testing-center/agent-job-state-client.ts** —
  cliente Auth.
  `vantare-v2/frontend/src/hub/testing-center/agent-job-state-client.ts:1`.
- **vantare-v2/frontend/src/hub/testing-center/candidate-feedback-client.ts** —
  cliente Auth.
  `vantare-v2/frontend/src/hub/testing-center/candidate-feedback-client.ts:1`.
- **vantare-v2/frontend/src/hub/testing-center/report-submission-client.ts** —
  cliente Auth.
  `vantare-v2/frontend/src/hub/testing-center/report-submission-client.ts:1`.
- **vantare-v2/frontend/src/lib/AuthSessionBridge.tsx** — cliente Auth.
  `vantare-v2/frontend/src/lib/AuthSessionBridge.tsx:5,6,7,8,24,30,44`.
- **vantare-v2/frontend/src/lib/billing-client.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/billing-client.ts:2`.
- **vantare-v2/frontend/src/lib/entitlements-refresh.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/entitlements-refresh.ts:3`.
- **vantare-v2/frontend/src/lib/supabase-auth.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/supabase-auth.ts:76,98,117,139,150,160,163,174,207,293,306,310`.
- **vantare-v2/internal/telemetryanalysis/duckdbadapter/manifest.go** — config.
  `vantare-v2/internal/telemetryanalysis/duckdbadapter/manifest.go:25`.
- **vantare-v2/tools/release_artifacts.ps1** — config.
  `vantare-v2/tools/release_artifacts.ps1:230`.

## Candidato nativo — todas las referencias productivas/config

- **apps/desktop/src/main/auth/license.ts** — cliente Auth.
  `apps/desktop/src/main/auth/license.ts:1`.
- **apps/desktop/src/main/auth/setup.ts** — cliente Auth.
  `apps/desktop/src/main/auth/setup.ts:5,51,59,63`.
- **apps/desktop/src/main/ipc/handlers.ts** — cliente Auth.
  `apps/desktop/src/main/ipc/handlers.ts:2,107,108,109,110,111`.
- **packages/auth/src/auth-service.ts** — cliente Auth.
  `packages/auth/src/auth-service.ts:8,9,20,21,27,48,69,102,161`.
- **packages/auth/src/index.ts** — cliente Auth.
  `packages/auth/src/index.ts:7,12`.
- **packages/auth/src/types.ts** — cliente Auth.
  `packages/auth/src/types.ts:42`.
- **supabase/config.toml** — config.
  `supabase/config.toml:8,11,14,17,20,23,26,29,32,35`.
- **supabase/functions/_deprecated/validate-license/index.ts** — cliente Auth.
  `supabase/functions/_deprecated/validate-license/index.ts:32`.
- **supabase/functions/_shared/auth.ts** — cliente Auth.
  `supabase/functions/_shared/auth.ts:29,56`.
- **supabase/functions/_shared/native-auth.ts** — puente Clerk.
  `supabase/functions/_shared/native-auth.ts:25,49,174,179`.
- **supabase/functions/billing-checkout/index.ts** — cliente Auth.
  `supabase/functions/billing-checkout/index.ts:1,56`.
- **supabase/functions/billing-portal/index.ts** — cliente Auth.
  `supabase/functions/billing-portal/index.ts:1,144`.
- **supabase/functions/native-account-authorize/index.ts** — cliente Auth;
  puente Clerk.
  `supabase/functions/native-account-authorize/index.ts:6,7,13,50,104,113`.
- **supabase/functions/native-admin/index.ts** — puente Clerk.
  `supabase/functions/native-admin/index.ts:9,10,28,260,281`.
- **supabase/functions/native-license/index.ts** — puente Clerk.
  `supabase/functions/native-license/index.ts:16,79`.
- **supabase/functions/testing-center-feedback/index.ts** — cliente Auth.
  `supabase/functions/testing-center-feedback/index.ts:1,234`.
- **supabase/migrations/20260605140000_initial_schema.sql** — FK Auth; auth.uid;
  auth.users.
  `supabase/migrations/20260605140000_initial_schema.sql:8,18,32,47,66,148,166,170,171,176,193,210,220`.
- **supabase/migrations/20260709120000_provider_agnostic_billing.sql** —
  auth.uid; auth.users.
  `supabase/migrations/20260709120000_provider_agnostic_billing.sql:14,17,129,133,137,141,145,173,229,257`.
- **supabase/migrations/20260709150000_fix_get_account_entitlements_device_binding.sql**
  — auth.uid; auth.users.
  `supabase/migrations/20260709150000_fix_get_account_entitlements_device_binding.sql:21,77`.
- **supabase/migrations/20260709160000_backfill_profiles_for_existing_auth_users.sql**
  — auth.users.
  `supabase/migrations/20260709160000_backfill_profiles_for_existing_auth_users.sql:29`.
- **supabase/migrations/20260802000000_billing_checkout_attempts.sql** — FK
  Auth; auth.users.
  `supabase/migrations/20260802000000_billing_checkout_attempts.sql:2`.
- **supabase/migrations/20260802020000_supabase_auth_license_hardening.sql** —
  auth.uid; auth.users.
  `supabase/migrations/20260802020000_supabase_auth_license_hardening.sql:10,66,78,90`.
- **supabase/migrations/20260802130100_testing_center_core.sql** — FK Auth;
  auth.users.
  `supabase/migrations/20260802130100_testing_center_core.sql:12,109,150,194,254`.
- **supabase/migrations/20260802140000_testing_center_access.sql** — FK Auth;
  auth.uid; auth.users.
  `supabase/migrations/20260802140000_testing_center_access.sql:5,36,71,78,92,108,141`.
- **supabase/migrations/20260802150000_testing_center_report_submission.sql** —
  FK Auth; auth.uid; auth.users.
  `supabase/migrations/20260802150000_testing_center_report_submission.sql:74,103,150,184`.
- **supabase/migrations/20260803120000_testing_center_candidate_feedback.sql** —
  FK Auth; auth.users.
  `supabase/migrations/20260803120000_testing_center_candidate_feedback.sql:41,103`.
- **supabase/migrations/20260803130000_testing_center_posthog_privacy.sql** — FK
  Auth; auth.uid; auth.users.
  `supabase/migrations/20260803130000_testing_center_posthog_privacy.sql:13,66,123`.
- **supabase/migrations/20260808000000_race_schedule_publications.sql** —
  auth.uid.
  `supabase/migrations/20260808000000_race_schedule_publications.sql:90,125,192,193`.
- **supabase/migrations/20260813193000_testing_center_agent_closeout_callbacks.sql**
  — auth.uid.
  `supabase/migrations/20260813193000_testing_center_agent_closeout_callbacks.sql:300`.
- **supabase/migrations/20260814154558_testing_center_screenshot_evidence.sql**
  — FK Auth; auth.uid; auth.users.
  `supabase/migrations/20260814154558_testing_center_screenshot_evidence.sql:34,174,212,377,471`.
- **supabase/migrations/20260828124540_clerk_account_bootstrap.sql** —
  auth.jwt/role; auth.users; cliente Auth; puente Clerk.
  `supabase/migrations/20260828124540_clerk_account_bootstrap.sql:12,31,39,40,41,44,52,64,67,81,91,97,98,109,152,169,195,271,273,274`.
- **supabase/migrations/20261002130000_native_license_bridge.sql** —
  auth.jwt/role; auth.users; cliente Auth; puente Clerk.
  `supabase/migrations/20261002130000_native_license_bridge.sql:3,23,26,40,51,57,58,61,69,116,128,135`.
- **supabase/migrations/20261003200000_native_account_data.sql** — auth.users;
  cliente Auth; puente Clerk.
  `supabase/migrations/20261003200000_native_account_data.sql:3,6,10,13,14,15,36`.
- **supabase/migrations/20261003201000_native_admin.sql** — puente Clerk.
  `supabase/migrations/20261003201000_native_admin.sql:58,117,198,222`.
- **supabase/migrations/20261005160000_native_admin_account_pages.sql** — puente
  Clerk.
  `supabase/migrations/20261005160000_native_admin_account_pages.sql:56,60,77,159,183`.
- **vantare-v2/cmd/vantare-admin/main.go** — auth.uid.
  `vantare-v2/cmd/vantare-admin/main.go:133`.
- **vantare-v2/frontend/src/hub/auth/LoginScreen.tsx** — cliente Auth.
  `vantare-v2/frontend/src/hub/auth/LoginScreen.tsx:8`.
- **vantare-v2/frontend/src/hub/orbit/use-account-identity.ts** — cliente Auth.
  `vantare-v2/frontend/src/hub/orbit/use-account-identity.ts:5,75`.
- **vantare-v2/frontend/src/hub/settings-orbit/SettingsOrbitPage.tsx** — cliente
  Auth. `vantare-v2/frontend/src/hub/settings-orbit/SettingsOrbitPage.tsx:26`.
- **vantare-v2/frontend/src/hub/testing-center/agent-job-state-client.ts** —
  cliente Auth.
  `vantare-v2/frontend/src/hub/testing-center/agent-job-state-client.ts:1`.
- **vantare-v2/frontend/src/hub/testing-center/candidate-feedback-client.ts** —
  cliente Auth.
  `vantare-v2/frontend/src/hub/testing-center/candidate-feedback-client.ts:1`.
- **vantare-v2/frontend/src/hub/testing-center/report-submission-client.ts** —
  cliente Auth.
  `vantare-v2/frontend/src/hub/testing-center/report-submission-client.ts:1`.
- **vantare-v2/frontend/src/lib/AuthSessionBridge.tsx** — cliente Auth.
  `vantare-v2/frontend/src/lib/AuthSessionBridge.tsx:5,6,7,8,24,30,44`.
- **vantare-v2/frontend/src/lib/billing-client.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/billing-client.ts:2`.
- **vantare-v2/frontend/src/lib/entitlements-refresh.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/entitlements-refresh.ts:3`.
- **vantare-v2/frontend/src/lib/supabase-auth.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/supabase-auth.ts:76,98,117,139,150,160,163,174,207,293,306,310`.
- **vantare-v2/internal/telemetryanalysis/duckdbadapter/manifest.go** — config.
  `vantare-v2/internal/telemetryanalysis/duckdbadapter/manifest.go:25`.
- **vantare-v2/native/hub/src/services/access.rs** — puente Clerk.
  `vantare-v2/native/hub/src/services/access.rs:40,41,42,245,287,794`.
- **vantare-v2/native/packaging/build-config.ps1** — puente Clerk.
  `vantare-v2/native/packaging/build-config.ps1:4`.
- **vantare-v2/native/services/src/config.rs** — puente Clerk.
  `vantare-v2/native/services/src/config.rs:31,32,33`.
- **vantare-v2/tools/release_artifacts.ps1** — config.
  `vantare-v2/tools/release_artifacts.ps1:230`.

## Tests y scripts de verificación — base

- **apps/desktop/e2e/sprint8-auth.spec.ts** — cliente Auth.
  `apps/desktop/e2e/sprint8-auth.spec.ts:32,34,127,131,134,137,139,140,142,143,144,145,147,148,149,183`.
- **apps/desktop/src/main/ipc/**tests**/handlers.test.ts** — cliente Auth.
  `apps/desktop/src/main/ipc/__tests__/handlers.test.ts:33`.
- **packages/auth/src/**tests**/auth.test.ts** — cliente Auth.
  `packages/auth/src/__tests__/auth.test.ts:2,4,6,7,11,16,18,25,26,28,35,38,39,45,46,52,53,57,58,62,63,65,66`.
- **packages/auth/src/**tests**/integration.test.ts** — cliente Auth.
  `packages/auth/src/__tests__/integration.test.ts:2,22,23,27,28,30,34,37`.
- **packages/auth/src/mock-auth-service.ts** — cliente Auth.
  `packages/auth/src/mock-auth-service.ts:10`.
- **supabase/tests/billing_checkout_attempts_test.sql** — auth.users.
  `supabase/tests/billing_checkout_attempts_test.sql:18`.
- **supabase/tests/billing_commercial_projection.test.sql** — auth.users.
  `supabase/tests/billing_commercial_projection.test.sql:22`.
- **supabase/tests/billing_observability.test.sql** — auth.users.
  `supabase/tests/billing_observability.test.sql:38`.
- **supabase/tests/billing_order_refund_ledger.test.sql** — auth.users.
  `supabase/tests/billing_order_refund_ledger.test.sql:12,18`.
- **supabase/tests/billing_reconciliation.test.sql** — auth.users.
  `supabase/tests/billing_reconciliation.test.sql:14`.
- **supabase/tests/billing_subscription_lifecycle.test.sql** — auth.users.
  `supabase/tests/billing_subscription_lifecycle.test.sql:11`.
- **supabase/tests/operational_access.test.sql** — auth.users.
  `supabase/tests/operational_access.test.sql:27`.
- **supabase/tests/run-billing-checkout-postgres.ps1** — auth.users.
  `supabase/tests/run-billing-checkout-postgres.ps1:97`.
- **supabase/tests/run-supabase-hardening-postgres.ps1** — auth.uid; auth.users;
  cliente Auth.
  `supabase/tests/run-supabase-hardening-postgres.ps1:66,71,91,116,130,172,208,251,298,339,382,392,396,413`.
- **supabase/tests/run-testing-center-access-postgres.ps1** — auth.uid;
  auth.users. `supabase/tests/run-testing-center-access-postgres.ps1:59,64,70`.
- **supabase/tests/run-testing-center-agent-jobs-v2-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-agent-jobs-v2-postgres.ps1:132,137,200`.
- **supabase/tests/run-testing-center-candidate-feedback-postgres.ps1** —
  auth.uid; auth.users.
  `supabase/tests/run-testing-center-candidate-feedback-postgres.ps1:62,63,69,141`.
- **supabase/tests/run-testing-center-codex-control-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-codex-control-postgres.ps1:54,55,60`.
- **supabase/tests/run-testing-center-github-delivery-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-github-delivery-postgres.ps1:28,29`.
- **supabase/tests/run-testing-center-linear-outbox-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-linear-outbox-postgres.ps1:68,73`.
- **supabase/tests/run-testing-center-linear-pilot-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-linear-pilot-postgres.ps1:62,67`.
- **supabase/tests/run-testing-center-linear-webhook-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-linear-webhook-postgres.ps1:68,73`.
- **supabase/tests/run-testing-center-postgres.ps1** — auth.uid; auth.users.
  `supabase/tests/run-testing-center-postgres.ps1:55,60`.
- **supabase/tests/run-testing-center-posthog-privacy-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-posthog-privacy-postgres.ps1:59,60,82`.
- **supabase/tests/run-testing-center-report-submission-postgres.ps1** —
  auth.uid; auth.users.
  `supabase/tests/run-testing-center-report-submission-postgres.ps1:60,65,71`.
- **supabase/tests/run-testing-center-screenshot-evidence-postgres.ps1** —
  auth.uid; auth.users.
  `supabase/tests/run-testing-center-screenshot-evidence-postgres.ps1:60,61,87,159`.
- **supabase/tests/run-testing-center-triage-postgres.ps1** — auth.uid;
  auth.users. `supabase/tests/run-testing-center-triage-postgres.ps1:61,66,73`.
- **supabase/tests/supabase_auth_license_hardening_test.sql** — auth.users.
  `supabase/tests/supabase_auth_license_hardening_test.sql:79`.
- **supabase/tests/testing_center_access.test.sql** — auth.users.
  `supabase/tests/testing_center_access.test.sql:99`.
- **supabase/tests/testing_center_agent_closeout_callbacks.test.sql** —
  auth.users.
  `supabase/tests/testing_center_agent_closeout_callbacks.test.sql:11`.
- **supabase/tests/testing_center_agent_jobs_v2.test.sql** — auth.users.
  `supabase/tests/testing_center_agent_jobs_v2.test.sql:28`.
- **supabase/tests/testing_center_candidate_feedback.test.sql** — auth.users.
  `supabase/tests/testing_center_candidate_feedback.test.sql:41`.
- **supabase/tests/testing_center_codex_control.test.sql** — auth.users.
  `supabase/tests/testing_center_codex_control.test.sql:16`.
- **supabase/tests/testing_center_core.test.sql** — auth.users.
  `supabase/tests/testing_center_core.test.sql:234`.
- **supabase/tests/testing_center_github_delivery.test.sql** — auth.users.
  `supabase/tests/testing_center_github_delivery.test.sql:14`.
- **supabase/tests/testing_center_linear_outbox_upgrade_seed.sql** — auth.users.
  `supabase/tests/testing_center_linear_outbox_upgrade_seed.sql:4`.
- **supabase/tests/testing_center_posthog_privacy.test.sql** — auth.users.
  `supabase/tests/testing_center_posthog_privacy.test.sql:33`.
- **supabase/tests/testing_center_report_submission.test.sql** — auth.users.
  `supabase/tests/testing_center_report_submission.test.sql:91`.
- **supabase/tests/testing_center_screenshot_evidence.test.sql** — auth.users.
  `supabase/tests/testing_center_screenshot_evidence.test.sql:119`.
- **supabase/tests/testing_center_triage_outbox.test.sql** — auth.users.
  `supabase/tests/testing_center_triage_outbox.test.sql:76`.
- **vantare-v2/frontend/src/hub/auth/LoginScreen.test.tsx** — cliente Auth.
  `vantare-v2/frontend/src/hub/auth/LoginScreen.test.tsx:16,31`.
- **vantare-v2/frontend/src/hub/testing-center/candidate-feedback-client.test.ts**
  — cliente Auth.
  `vantare-v2/frontend/src/hub/testing-center/candidate-feedback-client.test.ts:6`.
- **vantare-v2/frontend/src/hub/testing-center/report-submission-client.test.ts**
  — cliente Auth.
  `vantare-v2/frontend/src/hub/testing-center/report-submission-client.test.ts:7`.
- **vantare-v2/frontend/src/lib/AuthSessionBridge.test.tsx** — cliente Auth.
  `vantare-v2/frontend/src/lib/AuthSessionBridge.test.tsx:13,14,15,16`.
- **vantare-v2/frontend/src/lib/access.test.tsx** — cliente Auth.
  `vantare-v2/frontend/src/lib/access.test.tsx:32`.
- **vantare-v2/frontend/src/lib/billing-client.test.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/billing-client.test.ts:6`.
- **vantare-v2/frontend/src/lib/entitlements-refresh.test.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/entitlements-refresh.test.ts:25`.
- **vantare-v2/frontend/src/lib/supabase-auth.test.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/supabase-auth.test.ts:54,55,57,59,309,317,318,323,333,340,346,348,358,366`.

## Tests y scripts de verificación — nativo

- **apps/desktop/e2e/sprint8-auth.spec.ts** — cliente Auth.
  `apps/desktop/e2e/sprint8-auth.spec.ts:32,34,127,131,134,137,139,140,142,143,144,145,147,148,149,183`.
- **apps/desktop/src/main/ipc/**tests**/handlers.test.ts** — cliente Auth.
  `apps/desktop/src/main/ipc/__tests__/handlers.test.ts:33`.
- **packages/auth/src/**tests**/auth.test.ts** — cliente Auth.
  `packages/auth/src/__tests__/auth.test.ts:2,4,6,7,11,16,18,25,26,28,35,38,39,45,46,52,53,57,58,62,63,65,66`.
- **packages/auth/src/**tests**/integration.test.ts** — cliente Auth.
  `packages/auth/src/__tests__/integration.test.ts:2,22,23,27,28,30,34,37`.
- **packages/auth/src/mock-auth-service.ts** — cliente Auth.
  `packages/auth/src/mock-auth-service.ts:10`.
- **supabase/functions/license-credential/index.test.ts** — config.
  `supabase/functions/license-credential/index.test.ts:468`.
- **supabase/functions/native-account-authorize/index.test.ts** — cliente Auth.
  `supabase/functions/native-account-authorize/index.test.ts:64`.
- **supabase/functions/native-account-authorize/postgrest.integration.test.ts**
  — puente Clerk.
  `supabase/functions/native-account-authorize/postgrest.integration.test.ts:87`.
- **supabase/functions/scripts/verify-deploy-surface.test.ts** — config.
  `supabase/functions/scripts/verify-deploy-surface.test.ts:20,70`.
- **supabase/tests/billing_checkout_attempts_test.sql** — auth.users.
  `supabase/tests/billing_checkout_attempts_test.sql:18`.
- **supabase/tests/billing_commercial_projection.test.sql** — auth.users.
  `supabase/tests/billing_commercial_projection.test.sql:22`.
- **supabase/tests/billing_observability.test.sql** — auth.users.
  `supabase/tests/billing_observability.test.sql:38`.
- **supabase/tests/billing_order_refund_ledger.test.sql** — auth.users.
  `supabase/tests/billing_order_refund_ledger.test.sql:12,18`.
- **supabase/tests/billing_reconciliation.test.sql** — auth.users.
  `supabase/tests/billing_reconciliation.test.sql:14`.
- **supabase/tests/billing_subscription_lifecycle.test.sql** — auth.users.
  `supabase/tests/billing_subscription_lifecycle.test.sql:11`.
- **supabase/tests/clerk_account_bootstrap_test.sql** — auth.uid; auth.users;
  cliente Auth; puente Clerk.
  `supabase/tests/clerk_account_bootstrap_test.sql:4,8,14,16,20,22,24,26,28,32,36,39,48,53,75,93,121,123,127,139,145`.
- **supabase/tests/native_account_data_upgrade.test.sql** — auth.users.
  `supabase/tests/native_account_data_upgrade.test.sql:13`.
- **supabase/tests/native_account_data_upgrade_seed.sql** — auth.users.
  `supabase/tests/native_account_data_upgrade_seed.sql:2`.
- **supabase/tests/native_admin.test.sql** — auth.users; cliente Auth; puente
  Clerk.
  `supabase/tests/native_admin.test.sql:4,5,11,12,13,19,38,41,44,51,83,89`.
- **supabase/tests/native_data_postgrest_seed.sql** — puente Clerk.
  `supabase/tests/native_data_postgrest_seed.sql:5`.
- **supabase/tests/native_license_bridge_test.sql** — auth.users; cliente Auth;
  puente Clerk.
  `supabase/tests/native_license_bridge_test.sql:21,57,62,63,86,93,103`.
- **supabase/tests/operational_access.test.sql** — auth.users.
  `supabase/tests/operational_access.test.sql:27`.
- **supabase/tests/run-billing-checkout-postgres.ps1** — auth.users.
  `supabase/tests/run-billing-checkout-postgres.ps1:95`.
- **supabase/tests/run-supabase-hardening-postgres.ps1** — auth.jwt/role;
  auth.uid; auth.users; cliente Auth; puente Clerk.
  `supabase/tests/run-supabase-hardening-postgres.ps1:67,72,75,84,129,188,192,206,248,284,327,374,415,458,470,474,494`.
- **supabase/tests/run-testing-center-access-postgres.ps1** — auth.uid;
  auth.users. `supabase/tests/run-testing-center-access-postgres.ps1:59,64,70`.
- **supabase/tests/run-testing-center-agent-jobs-v2-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-agent-jobs-v2-postgres.ps1:132,137,200`.
- **supabase/tests/run-testing-center-candidate-feedback-postgres.ps1** —
  auth.uid; auth.users.
  `supabase/tests/run-testing-center-candidate-feedback-postgres.ps1:62,63,69,141`.
- **supabase/tests/run-testing-center-codex-control-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-codex-control-postgres.ps1:54,55,60`.
- **supabase/tests/run-testing-center-github-delivery-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-github-delivery-postgres.ps1:28,29`.
- **supabase/tests/run-testing-center-linear-outbox-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-linear-outbox-postgres.ps1:68,73`.
- **supabase/tests/run-testing-center-linear-pilot-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-linear-pilot-postgres.ps1:62,67`.
- **supabase/tests/run-testing-center-linear-webhook-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-linear-webhook-postgres.ps1:68,73`.
- **supabase/tests/run-testing-center-postgres.ps1** — auth.uid; auth.users.
  `supabase/tests/run-testing-center-postgres.ps1:55,60`.
- **supabase/tests/run-testing-center-posthog-privacy-postgres.ps1** — auth.uid;
  auth.users.
  `supabase/tests/run-testing-center-posthog-privacy-postgres.ps1:59,60,82`.
- **supabase/tests/run-testing-center-report-submission-postgres.ps1** —
  auth.uid; auth.users.
  `supabase/tests/run-testing-center-report-submission-postgres.ps1:60,65,71`.
- **supabase/tests/run-testing-center-screenshot-evidence-postgres.ps1** —
  auth.uid; auth.users.
  `supabase/tests/run-testing-center-screenshot-evidence-postgres.ps1:60,61,87,159`.
- **supabase/tests/run-testing-center-triage-postgres.ps1** — auth.uid;
  auth.users. `supabase/tests/run-testing-center-triage-postgres.ps1:61,66,73`.
- **supabase/tests/supabase_auth_license_hardening_test.sql** — auth.users.
  `supabase/tests/supabase_auth_license_hardening_test.sql:79`.
- **supabase/tests/testing_center_access.test.sql** — auth.users.
  `supabase/tests/testing_center_access.test.sql:99`.
- **supabase/tests/testing_center_agent_closeout_callbacks.test.sql** —
  auth.users.
  `supabase/tests/testing_center_agent_closeout_callbacks.test.sql:11`.
- **supabase/tests/testing_center_agent_jobs_v2.test.sql** — auth.users.
  `supabase/tests/testing_center_agent_jobs_v2.test.sql:28`.
- **supabase/tests/testing_center_candidate_feedback.test.sql** — auth.users.
  `supabase/tests/testing_center_candidate_feedback.test.sql:41`.
- **supabase/tests/testing_center_codex_control.test.sql** — auth.users.
  `supabase/tests/testing_center_codex_control.test.sql:16`.
- **supabase/tests/testing_center_core.test.sql** — auth.users.
  `supabase/tests/testing_center_core.test.sql:234`.
- **supabase/tests/testing_center_github_delivery.test.sql** — auth.users.
  `supabase/tests/testing_center_github_delivery.test.sql:14`.
- **supabase/tests/testing_center_linear_outbox_upgrade_seed.sql** — auth.users.
  `supabase/tests/testing_center_linear_outbox_upgrade_seed.sql:4`.
- **supabase/tests/testing_center_posthog_privacy.test.sql** — auth.users.
  `supabase/tests/testing_center_posthog_privacy.test.sql:33`.
- **supabase/tests/testing_center_report_submission.test.sql** — auth.users.
  `supabase/tests/testing_center_report_submission.test.sql:91`.
- **supabase/tests/testing_center_screenshot_evidence.test.sql** — auth.users.
  `supabase/tests/testing_center_screenshot_evidence.test.sql:119`.
- **supabase/tests/testing_center_triage_outbox.test.sql** — auth.users.
  `supabase/tests/testing_center_triage_outbox.test.sql:76`.
- **vantare-v2/frontend/src/hub/auth/LoginScreen.test.tsx** — cliente Auth.
  `vantare-v2/frontend/src/hub/auth/LoginScreen.test.tsx:16,31`.
- **vantare-v2/frontend/src/hub/testing-center/candidate-feedback-client.test.ts**
  — cliente Auth.
  `vantare-v2/frontend/src/hub/testing-center/candidate-feedback-client.test.ts:6`.
- **vantare-v2/frontend/src/hub/testing-center/report-submission-client.test.ts**
  — cliente Auth.
  `vantare-v2/frontend/src/hub/testing-center/report-submission-client.test.ts:7`.
- **vantare-v2/frontend/src/lib/AuthSessionBridge.test.tsx** — cliente Auth.
  `vantare-v2/frontend/src/lib/AuthSessionBridge.test.tsx:13,14,15,16`.
- **vantare-v2/frontend/src/lib/access.test.tsx** — cliente Auth.
  `vantare-v2/frontend/src/lib/access.test.tsx:32`.
- **vantare-v2/frontend/src/lib/billing-client.test.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/billing-client.test.ts:6`.
- **vantare-v2/frontend/src/lib/entitlements-refresh.test.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/entitlements-refresh.test.ts:25`.
- **vantare-v2/frontend/src/lib/supabase-auth.test.ts** — cliente Auth.
  `vantare-v2/frontend/src/lib/supabase-auth.test.ts:54,55,57,59,309,317,318,323,333,340,346,348,358,366`.
