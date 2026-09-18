# ISA-911 — Inventario de superficies ligadas a Supabase Auth UUID

Fecha: 2026-09-11

Base auditada: `origin/nightly@dc5e7ae1` más el diff de ISA-909 (PR #913
rebasado, HEAD `c00c38bc`). Método: `git grep` sobre `auth.users`, `auth.uid()`,
`auth.jwt()`, `getUser(` y trazado de los consumidores frontend/Go de la sesión
persistida. Ningún inventario se deduce de memoria: cada entrada cita fichero y
línea de la base.

## Decisión previa que este inventario formaliza

ISA-909 (PR #913) convierte `public.profiles.id` en la raíz de cuenta interna:
retira la FK `profiles -> auth.users`, crea `public.account_identities`
(`issuer, subject -> account_id`) y hace que las cuatro RPC de licencia
(`claim_active_device`, `read_account_entitlements`, `reset_active_device`,
`get_account_entitlements`) resuelvan la cuenta vía
`private.resolve_current_account()` leyendo `auth.jwt()` validado por TPA. La
Edge Function `license-credential` deja de usar `auth.getUser()` y firma la
credencial con el UUID interno.

Las sesiones Supabase Auth existentes conservan su UUID solo cuando `iss`
termina en `/auth/v1` y el `sub` existe en `auth.users`. Cualquier otro issuer
pasa por el mapping. Email nunca es prueba.

## Ya resuelto por ISA-909 (no repetir)

- `profiles.id` ya no exige `auth.users` (FK retirada; las tablas comerciales
  referencian `profiles(id)` desde 20260709120000 y siguen funcionando).
- `license-credential` acepta JWT Clerk vía TPA por la ruta PostgREST;
  `verify_jwt = false` en `supabase/config.toml`.
- `internal/license` acepta `sub` no UUID y fija `Result.UserID` desde la
  credencial firmada.

## Superficies que aún asumen `auth.users`/`auth.uid()`

### A. Esquema — FK directas a `auth.users(id)`

Tablas legacy del esquema inicial (`supabase/migrations/20260605140000_initial_schema.sql`):

- `licenses.user_id` (l.18), `subscriptions.user_id` (l.32),
  `license_validations.user_id` (l.47), `rate_limits.user_id` (l.66).
  Ninguna es consumida por el frontend ni por Go hoy (búsqueda sin
  resultados en `vantare-v2/`); son restos del modelo pre-Billing.

- `billing_checkout_attempts.user_id` (`20260802000000_billing_checkout_attempts.sql:2`).
  Bloquea checkout para cuentas Clerk: el insert exige un `auth.users` real.

- Testing Center (FKs `on delete restrict` salvo `testing_center_access`,
  cascade): `reporter_user_id`, `actor_user_id`, `authorized_by_user_id`,
  `requested_by_user_id` (`20260802130100_testing_center_core.sql`),
  `testing_center_access.user_id` PK (`20260802140000_testing_center_access.sql:5`),
  `testing_center_reports.reporter_user_id`/`actor_user_id`
  (`20260802150000`), `actor_user_id` en candidate_feedback (`20260803120000`)
  y posthog_privacy (`20260803130000`, incluye `linear_link_authorized_by`),
  `reporter_user_id` en screenshot_evidence (`20260814154558`).

- `handle_new_user` trigger sobre `auth.users`
  (`20260605140000:127-150`): crea `profiles` + `licenses` al registrarse.
  Con Clerk no se ejecuta; ISA-909 crea el `profiles` directamente en el
  resolver y no crea la fila `licenses` (tabla legacy sin consumidores).

### B. Esquema — policies RLS con `auth.uid()`

`auth.uid()` hace cast del `sub` a UUID: con un JWT Clerk devuelve NULL/error
según versión y la policy niega o rompe. Falla cerrada, pero deja la superficie
inutilizable para cuentas Clerk.

- `profiles_select_own`, `profiles_update_own`
  (`20260605140000:164-171`).
- `licenses_select_own`, `subscriptions_select_own`,
  `license_validations_select_own`, `hwid_changes_select_own`
  (`20260605140000:174-222`) — tablas legacy sin consumidores.
- Billing: cinco policies `for select using (auth.uid() = user_id)` sobre
  `billing_customers`, `billing_subscriptions`, `billing_checkout_attempts`,
  `billing_orders`, `user_entitlements` (`20260709120000:129-145`).
- `race_schedule_publications`: policy de lectura del propio draft
  (`20260808000000:192-193`: `created_by = auth.uid() and is_active_owner(auth.uid())`).
- Testing Center: policies de `testing_center_access` (l.71), lectura de
  reports del reporter (l.78, 92, 108), `testing_center_reports`
  (`20260802150000:150`), closeout callbacks (`20260813193000:300`),
  screenshot evidence (`20260814154558:174`).

### C. Esquema — RPC/funciones con `auth.uid()`

- Billing: `billing_checkout`/`billing portal` helpers
  (`20260709120000:173, 257`); `get_account_entitlements` anterior
  (`20260709150000:21`, `20260802020000:10, 90`) — esta última queda
  reemplazada por ISA-909.
- Calendario (publicación Owner): `race_schedule_draft_save`,
  `race_schedule_publish` (`v_actor := auth.uid()`), `race_schedule_my_draft`,
  `race_schedule_current` (`20260808000000:90, 125, 155, 175`) y
  `is_active_owner(auth.uid())`.
- Testing Center: `testing_center_submit_report` (`20260802150000:184`),
  `testing_center_set_posthog_consent` (`20260803130000:123`),
  `testing_center_prepare_screenshot_batch`/`_finalize_screenshot`/
  `submit_report_with_evidence` (`20260814154558:212, 377, 471`),
  acceso vía `testing_center_current_role`/`testing_center_can_view_channel`
  (`20260802140000:36, 141`).

### D. Edge Functions — `supabase.auth.getUser()` y gateway `verify_jwt`

`supabase/functions/_shared/auth.ts::requireUserAuth` llama
`supabase.auth.getUser(token)`, que solo acepta JWT emitidos por Supabase
Auth. Con un JWT Clerk devuelve error → 401 (fail-closed correcto, pero
funcionalmente incompatible).

- `billing-checkout` (`index.ts:56`) — además `verify_jwt = true` en
  `config.toml`: el gateway rechaza el JWT Clerk antes de ejecutar.
- `billing-portal` (`index.ts:144`) — igual.
- `testing-center-feedback` (`index.ts:234`) — igual.
- `_deprecated/validate-license` — deprecated, no tocar.
- `license-credential` — resuelto por ISA-909 (bearer opaco + RPC TPA).

### E. Frontend — consumidores de la sesión Supabase

- `src/lib/supabase-auth.ts`: cliente singleton, email/password, OAuth
  externo (`createOAuthAttempt` → `auth:attempt:*`), `setSupabaseSession`,
  `onSupabaseAuthStateChange`, `removeLegacySupabaseSessions`, `getSession`.
- `src/lib/AuthSessionBridge.tsx`: restaura el par desde Credential Manager
  (`auth:session:get` → `setSupabaseSession` → `license:validate`) y rota con
  `TOKEN_REFRESHED` → `auth:session:save`.
- `src/hub/auth/LoginScreen.tsx`: UI de acceso (email/password + Google/
  Discord externos). ISA-915 la sustituye por el componente oficial Clerk
  cuando `VITE_CLERK_PUBLISHABLE_KEY` esté configurada.
- `src/hub/auth/OAuthCallbackHandler.tsx`: parsea `access_token` del fragmento
  → `license:validate`. Solo sirve al flujo Supabase.
- `src/lib/entitlements-refresh.ts`: `getSession().access_token` →
  `license:validate` y `license:reset-device`. Con Clerk debe obtener el token
  fresco vía `session.getToken()` (cubierto por ISA-915).
- `src/lib/billing-client.ts`: `getBillingAccessToken()` → `getSession()` →
  bearer hacia `billing-checkout`/`billing-portal`. Dependiente de las Edge
  Functions de D: con sesión Clerk devuelve `login_required`/`server_error`
  (fail-closed, sin acciones de cobro incorrectas).
- `src/hub/orbit/use-account-identity.ts`: nombre/avatar/email desde
  `session.user.user_metadata`. Con Clerk debe leer `clerk.user` (ISA-915).
- `src/hub/settings-orbit/SettingsOrbitPage.tsx`: `signOut()` borra store
  protegido + `supabase.auth.signOut()` + `clearLicense()`. Con Clerk debe
  además `clerk.signOut()` (ISA-915).
- `src/hub/testing-center/*-client.ts`: `getSupabaseClient().rpc(...)` usa la
  sesión Supabase en memoria. Sin sesión Supabase el cliente manda anon/anon
  key → las RPC fallan `testing_center_auth_required` (fail-closed).

### F. Go — contrato de sesión persistida

- `internal/authsession`: `Session{AccessToken, RefreshToken}` en
  Credential Manager; `Manager` solo acepta pares completos validados online
  (`AcceptValidated`) o restaurados (`Restore`), y `Rotate` exige sesión
  confiable previa.
- `cmd/vantare/main.go`:
  - `license:validate` (l.1895): `trustedSessionToken` =
    `authManager.Restore().AccessToken`; persistencia solo si hay
    `refreshToken` (`shouldPersistValidatedSession`, l.3560).
  - `auth:session:get/clear/save` (l.1960-2029): restore al frontend,
    borrado y rotación.
  - `refreshPublishedSchedule` (l.2357) y `schedule:draft:save|publish|get`
    (l.3408-3433): usan `Restore().AccessToken` como bearer PostgREST hacia
    las RPC `race_schedule_*` de C. Con Clerk no hay par persistido y las RPC
    usan `auth.uid()`: doble incompatibilidad documentada.
- `internal/license`: `cacheAuthorized` exige `sessionToken ==
  trustedSessionToken` (token exacto). Un `session.getToken()` Clerk produce
  un JWT distinto en cada llamada (~60 s de TTL observado en ISA-885): el
  par JWT no es persistible ni comparable. ISA-915 lo resuelve persistiendo
  el `sid` de la sesión Clerk (no un JWT) y autorizando la caché offline
  cuando el token presentado declara el mismo `sid`.

### G. Configuración remota (fuera de código, requiere autorización)

- Supabase hosted: `[auth.third_party.clerk] enabled + domain` — demostrado en
  local por ISA-885; falta aplicar al proyecto real.
- Clerk: aplicación production, claim `role=authenticated` en el session
  token (schema vivo), `allowed_origins`/`allowedRedirectProtocols` para el
  origen Wails. Persistencia de sesión en WebView por verificar en prueba
  Wails real (dev instance usa `__clerk_db_jwt`; producción puede exigir
  dominio propio — riesgo registrado).

## Contrato de logout/caché entre dos cuentas (decisión)

1. La credencial offline firmada pertenece al `account_id` firmado y al
   dispositivo. No sigue al proveedor de login.
2. Cerrar sesión (cualquier proveedor) borra el registro protegido de
   `authsession` (par Supabase o `sid` Clerk), limpia `licenseSvc` en memoria
   y devuelve la UI a acceso. La caché de credencial firmada no se borra en
   logout hoy; ISA-915 conserva ese comportamiento y la sobrescribe en la
   siguiente validación online aceptada.
3. Cambio de cuenta online: la nueva validación reescribe la caché con el
   UUID de la cuenta nueva. Sin red, una sesión distinta no puede validar:
   la gracia sigue siendo de la cuenta firmada en caché, nunca de la cuenta
   nueva (fail-closed: no hay degradación a "cualquier sesión Clerk").
4. Un JWT Clerk con `sid` distinto al persistido no autoriza la caché;
   tampoco un JWT Supabase (no lleva claim `sid`).

## Cortes SDD propuestos (orden seguro)

| Orden | Superficie | Contenido | Bloquea |
|---|---|---|---|
| 0 | ISA-909 (PR #913) | mapping `account_identities`, resolver, RPC licencia, Edge, Go | — |
| 1 | ISA-915 | login Clerk visible, token → `license:validate`, `sid` persistido para gracia offline, logout Clerk, identidad de cuenta | 0 |
| 2 | Calendario Owner | `race_schedule_*` + `is_active_owner` sobre `resolve_current_account()`; los eventos `schedule:*` de Go deben obtener el token fresco de Clerk (frontend lo pasa en el payload, no `authManager`) | 1 + config remota |
| 3 | Billing | `billing-checkout`/`billing-portal`: sustituir `requireUserAuth` por resolución TPA, `verify_jwt` gateway, FK `billing_checkout_attempts` y policies `auth.uid()` | 1 + 2 |
| 4 | Testing Center | `testing-center-feedback` + access/RLS/RPC sobre UUID interno + clients frontend con token Clerk | 1 |
| 5 | Retirada | tablas legacy (`licenses`, `subscriptions`, `license_validations`, `rate_limits`, `hwid_changes`), policies `profiles`/`auth.uid()`, `handle_new_user`, UI Supabase Auth, store de par de tokens | 1-4 |

Cada corte necesita su propia issue implementable, tests y autorización de
deploy separada. Nada de esto se aplica en remoto dentro de ISA-911.

## Riesgos y preguntas abiertas

- Persistencia de sesión Clerk en WebView2/WKWebView en producción
  (cookies first-party requieren dominio): mitigable con dev instance en el
  primer corte; decidir antes de producción.
- `sid` no es secreto pero sí identificador de sesión: se persiste en
  Credential Manager, nunca en logs ni en el repo.
- `get_account_entitlements` (wrapper compatible) conserva su contrato; si
  algún consumidor externo aún llama a las RPC antiguas, falla cerrado.
- El borrado de un usuario Supabase Auth ya no cascada a `profiles` tras
  ISA-909: la política de lifecycle (borrar cuenta) es un corte pendiente
  dentro de la retirada.
