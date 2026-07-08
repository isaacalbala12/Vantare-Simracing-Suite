# Auditoría de Stripe / Licencias / Pagos Reales — Estado e Implementación

> Fecha: 2026-07-06.
> Autor: auditoría técnica (orquestador).
> Alcance: estado real de la capa de pagos, licencias paid/suite y soporte operativo de Vantare v2.
> Estado del documento: **informe de estado** (no es un plan de implementación en sí; contiene los planes propuestos en la sección 7).
> Decisión aplicada: **el panel de administración web propio se OMITE completamente** (ver sección 6).

---

## 1. Resumen ejecutivo

La capa de **licencias en el frontend** (gating, paywall, account settings, i18n parcial) y la capa **Go `internal/license`** + la **Edge Function de Stripe** están muy implementadas y testeadas. Sin embargo, **el sistema no cobra ni entrega entitlements reales todavía**, por tres huecos que bloquean el lanzamiento de pagos:

1. **No existe migración SQL** en el repositorio. El Go invoca dos RPCs de Supabase —`get_account_entitlements` y `reset_active_device`— que **no están creados** en el proyecto. Sin ellos, un usuario que pague realmente **nunca recibe sus entitlements** y cae a `authenticated-no-entitlement` (Free). Es el riesgo documentado en `TD-043`.
2. **No hay checkout real**: el botón "Suscribirse" del `PaywallScreen` solo muestra "Pago en línea próximamente". No hay Stripe JS SDK, no se crea una Checkout Session, no se abre el portal de cliente.
3. **La Edge Function no está deployada ni configurada** con los secretos de Stripe/Supabase, por lo que los webhooks no escriben nada.

Hoy en día: un usuario **Free** entra al Hub (comportamiento correcto); un usuario que **pague** no obtendría sus beneficios. Eso es inaceptable para un lanzamiento con monetización real, pero es manejable porque está acotado a un conjunto pequeño y bien definido de piezas.

Además, se detectó que los documentos de arquitectura (`licensing-auth-architecture.md`, `stripe-integration-plan.md`, `license-service-contract.md`, `supabase-schema-release.md`) dicen **"design-only / no production code yet"**, pero **el código avanzó mucho más allá**. Están desactualizados respecto al estado real y conviene una nota de actualización para no confundir a otros workers (ver sección 8).

---

## 2. Estado por capa (verificado contra el código)

Leyenda: ✅ implementado y testeado · ⚠️ parcial / pendiente de piezas clave · ❌ no existe.

### 2.1 Backend Go — `internal/license` ✅

Paquete completo y con tests. Archivos presentes:

| Archivo | Responsabilidad | Estado |
|---|---|---|
| `types.go` | `Entitlement`, `State`, `Result`, `Config`, `AccountInfo` | ✅ |
| `errors.go` | `ErrNoCache`, `ErrValidationFailed`, `ErrDeviceLimit`, `ErrMissingSession` | ✅ |
| `service.go` | `Validate`, `HasEntitlement`, `ResetDevice`, `LoadCache`, `SaveCache`; cache-first + fallback online con grace 24h; emite `license:changed`/`license:error` | ✅ |
| `cache.go` | cache local `license-cache.json` (DPAPI en Windows, plaintext en otros) | ✅ |
| `fingerprint.go` / `fingerprint_windows.go` / `fingerprint_other.go` | hash de MachineGuid + CPU flags + appdata | ✅ |
| `plan.go` | `ClassifyPlan` / `ClassifyStatus` / `BuildSummary` (mirror de `plan.ts`) | ✅ |
| `supabase_client.go` | cliente **stdlib** que llama 2 RPCs (`get_account_entitlements`, `reset_active_device`) | ✅ (cliente) ❌ (RPCs destino) |
| `*_test.go` | tests por estado, cache, fingerprint, wire | ✅ |

Comportamiento de `Validate` (confirmado en `service.go`):
- Lee cache primero; si hay cache válida → `active`/`grace`/`expired` según timestamps.
- Si hay cliente Supabase → llama `get_account_entitlements` con el JWT del usuario + fingerprint.
  - Éxito → `active` con entitlements.
  - Device mismatch → `device-limit`.
  - Fallo de red con client configurado → cae a cache (grace/expired).
  - **Sin cliente Supabase configurado** → estado `unconfigured` (no bloquea al usuario; ver `TD-043`).

`ResetDevice` (confirmado en `service.go:282-306`): llama el RPC `reset_active_device` con el fingerprint, luego revalida y emite `license:changed` para desbloquear inmediatamente.

### 2.2 Wiring en `cmd/vantare/main.go` ✅

- Importa `internal/license`; crea el servicio con `GracePeriod: 24h`, `CachePath: <cfgDir>/license-cache.json`.
- Resuelve Supabase URL/anon key: env `VANTARE_SUPABASE_URL`/`VANTARE_SUPABASE_ANON_KEY` → fallback `SUPABASE_URL`/`SUPABASE_KEY` → fallback a valores embebidos por `ldflags` (ver 2.4).
- Registra el servicio con Wails y escucha dos eventos:
  - `license:validate` → ejecuta `Validate` y emite `license:changed` (no re-emite para evitar race) + `auth:session` (persiste la sesión Supabase en el WebView).
  - `license:reset-device` → ejecuta `ResetDevice`.
- `LoadCache()` en startup; modo "offline-grace" si faltan env vars de Supabase.

### 2.3 Frontend — UI de licencias ✅ (gating) ⚠️ (checkout)

| Pieza | Archivo | Estado |
|---|---|---|
| Provider de licencia | `lib/license.tsx` (`LicenseProvider` + `useLicense`) | ✅ |
| Tipos de licencia | `lib/license-types.ts` | ✅ |
| Auth Supabase | `lib/supabase-auth.ts` (email + OAuth Google/Discord externo + `setSession` para persistencia) | ✅ |
| Política de acceso | `lib/access-policy.ts`, `lib/access.tsx` (`useAccess`), `AccessGate.tsx` | ✅ |
| Login | `hub/auth/LoginScreen.tsx` | ✅ |
| Paywall | `hub/auth/PaywallScreen.tsx` + `paywall-plans.ts` | ⚠️ UI completa, **sin checkout real** |
| Banner de gracia | `hub/auth/LicenseBanner.tsx` | ✅ |
| Pantalla unconfigured | `hub/auth/UnconfiguredScreen.tsx` | ✅ |
| Ajustes de cuenta | `hub/settings/AccountSettings.tsx` (plan/estado/entitlements + logout + reset-PC) | ✅ |
| Enrutado login→paywall→hub | `HubApp.tsx`, `OnboardingFlow.tsx` | ✅ |
| Modos dev/QA | `lib/access-dev-modes.ts` (`?access=` free/paid/tester/blocked) | ✅ |
| i18n | `i18n/*` (es/en/pt/it) en Widget Studio/onboarding/topbar | ⚠️ Auth/Paywall/Account **sin traducir** |

Detalle crítico del checkout (`PaywallScreen.tsx:29-34`):
```ts
const handleSubscribe = useCallback((planKey: string) => {
  // No fake checkout: dejamos el plan seleccionado y mostramos el aviso
  // público. Cuando se configure el portal real de Stripe, este handler
  // será el único punto a tocar.
  setPendingPlan(planKey);
}, []);
```
No se crea `Checkout Session`, no se abre navegador externo, no hay `@stripe/stripe-js` en el repo. El test `paywall-coming-soon` valida explícitamente que el botón muestra "Pago en línea próximamente".

`AccountSettings.tsx` reset-PC: emite el evento Wails `license:reset-device` con el `sessionToken` obtenido de `getSession()`. Funciona contra el backend, pero el backend a su vez necesita el RPC `reset_active_device` (ausente).

### 2.4 Inyección de config Supabase (build) ✅

- `tools/generate_supabase_config.ps1` genera `cmd/vantare/supabase_build.go` (base64 del URL/anon key) con un `init()` que rellena las vars `supabaseURL`/`supabaseAnonKey` del `main`.
- `main.go` prioriza env vars sobre el valor embebido. La anon key es pública (diseñada para el cliente), así que no es secreto en riesgo.
- Si no hay config → genera estado `unconfigured` en runtime (no bloquea).

### 2.5 Stripe backend — Edge Function ✅ (código) ❌ (deploy/config)

`supabase/functions/stripe-webhook/`:
- `index.ts` + `index.test.ts` + `deno.json` + `deno.lock`.
- `_utils/stripe.ts` (verifica firma con `STRIPE_WEBHOOK_SECRET` + `STRIPE_SECRET_KEY`) y `_utils/supabase.ts` (cliente admin con `SUPABASE_SERVICE_ROLE_KEY`).
- Maneja: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- Mapea `price_id → product_key[]` vía env `PRICE_ID_TO_PRODUCT_KEYS` (helper `productKeysForPriceIds`).
- Upsert idempotente de `stripe_customers`, `stripe_subscriptions`, `user_entitlements` (conflict keys documentados en `stripe-webhook-deployment.md`).
- Revoca entitlements en cancelación; deriva estado Stripe→entitlement (`deriveEntitlementStatus`).

Pendiente en la función (follow-ups explícitos en `stripe-webhook-deployment.md`):
- ❌ No escribe `license_events` (auditoría por evento).
- ❌ No emite Discord role sync.

### 2.6 Migración de base de datos ❌

- `find . -name "*.sql"` → **vacío**. No hay ninguna migración en el repo.
- Las tablas planeadas (`profiles`, `user_entitlements`, `devices`, `license_events`, `stripe_customers`, `stripe_subscriptions`) y las RLS **no existen**.
- Los dos RPCs que el Go invoca (`get_account_entitlements`, `reset_active_device`) **no existen**.
- Esto es el bloqueador padre: sin la migración, nada de lo demás entrega entitlements reales.

---

## 3. Lo que FALTA (bloquea pagos reales)

| # | Hueco | Severidad | Evidencia |
|---|-------|-----------|-----------|
| 1 | **Migración SQL inexistente** — 0 `.sql` en el repo; faltan tablas + RLS + los 2 RPCs | 🔴 Crítico | `find . -name "*.sql"` vacío; `supabase_client.go:46,78` llama esos RPCs |
| 2 | **Checkout no implementado** — botón solo muestra "próximamente" | 🔴 Crítico | `PaywallScreen.tsx:29-34`; test `paywall-coming-soon` |
| 3 | **Edge Function no deployada / sin secretos** — Stripe/Supabase no configurados en el proyecto | 🔴 Crítico | `stripe-webhook-deployment.md` (manual, no ejecutado) |
| 4 | **Productos/Precios Stripe no creados** — price IDs son placeholders | 🔴 Necesario para #2/#3 | `stripe-webhook-deployment.md:35` |
| 5 | **Discord role sync** — contrato lo menciona; la EF no lo emite | 🟡 Comunidad | `stripe-webhook-deployment.md:188` |
| 6 | **`license_events` audit** — la EF no escribe auditoría por evento | 🟡 Soporte/debug | ídem |
| 7 | **RLS policies reales** — sin SQL no existen; datos de entitlements sin protección por fila | 🟠 Seguridad (público seguro) | `supabase-schema-release.md` |
| 8 | **i18n de Auth/Paywall/AccountSettings** — copy hardcodeada en español (`I18N-03b` pendiente) | 🟡 UX multilenguaje | `docs/current-plan.md` Nota I18N-03 |

---

## 4. Riesgos adicionales detectados

### 4.1 `TD-043` — RPC `get_account_entitlements` sin migración SQL
- Documentado en `docs/technical-debt.md` como P3, con subida a **P2 antes de activar cobros/entitlements reales**.
- Motivo: el fix A+B+C hace que el binario reciba Supabase vía `generate_supabase_config.ps1` y que `unconfigured` no bloquee. Con `s.client != nil` y RPC caído, el estado cae a `authenticated-no-entitlement` (Free, no bloqueo) → usuario Free entra, pero **usuario pagado no recibe entitlements**.
- **Este informe confirma que `TD-043` sigue abierto y es el bloqueador principal.**

### 4.2 Clasificación de `supporter`
- El Go (`plan.go`) y el TS (`plan.ts`) mapean `supporter` → `paid_overlays`.
- El webhook solo escribe `product_key`s; el mapping de ejemplo en `stripe-webhook-deployment.md` tiene solo tiers de release (`price_overlays_monthly`, etc.), no los tiers beta (`beta_access`, `supporter`, `founder`…).
- **Acción necesaria**: incluir los price IDs de los tiers beta en `PRICE_ID_TO_PRODUCT_KEYS` antes de activarlos, o los suscriptores beta caerán a Free en la clasificación.

### 4.3 Cobertura de `unconfigured` en runtime real
- El estado `unconfigured` solo aparece cuando **no hay cliente Supabase** (`s.client == nil`).
- Si se genera `supabase_build.go` con valores válidos pero los RPCs no existen, el flujo cae a Free en vez de `unconfigured`. Es comportamiento seguro (no bloquea) pero **oculta el problema** de la migración faltante.

---

## 5. Qué se necesita para implementarlo

1. **Acceso al proyecto Supabase** (ref + permisos) para aplicar la migración, o que el equipo la aplique / la deploye vía `supabase db push`. Los `.sql` se pueden generar desde este repo.
2. **Credenciales Stripe de test** (`STRIPE_SECRET_KEY`) y, tras crear productos, los **price IDs reales** para el mapping `PRICE_ID_TO_PRODUCT_KEYS`.
3. **URL del Customer Portal** de Stripe (portal habilitado) para el botón "Gestionar suscripción" / "Suscribirse".
4. **Decisión de diseño de checkout**:
   - **Recomendado — externo**: abrir Stripe Checkout en el navegador del sistema (igual que se hizo con OAuth Google/Discord). Evita problemas de WebView con pagos y reduce superficie de PCI.
   - Alternativa — embebido: Stripe JS dentro del WebView (mayor fricción, posibles bloqueos de Google/Apple).
5. **Confirmación del contrato del RPC** `get_account_entitlements`: debe devolver `{user_id, email, entitlements, active_device, expires_at}` para que encaje con `AccountInfo` del Go (ya definido en `supabase_client.go` / `types.go`).

---

## 6. Decisión: Panel de administración OMITIDO

**Se omite completamente la construcción de un panel de administración web propio.** No se planea, no se implementa, no se presupuesta en esta fase.

### 6.1 Por qué
- Para una app de escritorio tipo micro-SaaS de simracing en beta, **lo estándar es operar con las consolas que ya se pagan**:
  - **Stripe Dashboard**: pagos, suscripciones, reembolsos, Customer Portal (auto-gestión del usuario), eventos.
  - **Supabase Studio**: base de datos (tablas, RLS, SQL manual).
  - **Discord de soporte**: canal de contacto.
- El `changelog.md` del repo ya lo asume: *"Portal completo de usuario, gestión avanzada de pagos, facturas y self-service de licencias… El login/gating básico sí entra"* → el portal completo está **postergado por decisión**.
- Un panel admin web propio implica: auth de admin + rol + RLS, hosting, y **superficie de ataque que toca PII de terceros**. Para volumen de beta es gasto ciego y riesgo innecesario.
- **Nunca debe ir dentro de la app de escritorio (Wails)**: meter service-role en el binario que descargan los usuarios es inaceptable. Si algún día se hace, sería una app web aparte con su propia auth (fase estable 0.2+).

### 6.2 Alternativa de soporte operativo (lo que SÍ se hace)
En lugar del panel web, el soporte de la beta se cubre con:

1. **Consolas externas** (Stripe Dashboard + Supabase Studio) — lectura y acciones de pago.
2. **CLI de soporte local** (`SUPPORT-01`, ver 7.6): un comando Go **aparte de la app de escritorio**, que usa la service-role key para:
   - `lookup-user <email|id>` → estado, entitlements, device, últimos `license_events`.
   - `grant <user> <product_key>` / `revoke <user> <product_key>` → mutación directa (solo en caso excepcional).
   - `force-device-reset <user>` → limpia `active_fingerprint` para que el usuario pueda reregistrar PC.
   - Se ejecuta desde la máquina del equipo; **nunca se distribuye** con la app.
3. **Runbook de soporte** (sección 7.7): documentar en `release-beta-operations-runbook.md` los 3–4 escenarios reales (pago sin entitlement, device-limit, reembolso) y el comando exacto.

Esta combinación cubre el soporte real de la beta sin superficie de ataque y en días, no semanas.

---

## 7. Qué toca planear (orden sugerido)

Cada ítem es un miniplan independiente; el orden es de dependencia, no de asignación.

### 7.1 `SQL-01` — Migración + RLS + RPCs (bloqueador padre)
- **Objetivo**: crear las 6 tablas, RLS y los 2 RPCs (`get_account_entitlements`, `reset_active_device`) en el proyecto Supabase.
- **Archivos**: `supabase/migrations/XXXX_init_licensing.sql` (nuevo). Sin cambios de código Go (los RPCs ya se invocan).
- **Contrato RPC**:
  - `get_account_entitlements(device_fingerprint text)` → `{user_id, email, entitlements, active_device, expires_at}` (join `user_entitlements` + `devices`). `SECURITY DEFINER`, RLS-aware vía `auth.uid()`.
  - `reset_active_device(device_fingerprint text)` → NULL del `fingerprint_hash`/`active_fingerprint` del usuario autenticado; rate-limit 1/24h.
- **Depende de**: ref de proyecto Supabase.
- **Cierra**: `TD-043`.
- **Criterio de cierre**: tras aplicar la migración, un `FetchAccount` real desde el Go devuelve entitlements para un usuario con fila en `user_entitlements`.

### 7.2 `STRIPE-01` — Productos/Precios en test mode
- **Objetivo**: crear en el dashboard de Stripe (test) los productos/precios de los tiers release (y beta si aplica) y volcar los `price_id` reales en `PRICE_ID_TO_PRODUCT_KEYS`.
- **Incluye**: tiers beta (`beta_access`, `supporter`, `founder`, `pro_founder`, `visionary_backer`) en el mapping para no caer a Free (ver 4.2).
- **Depende de**: cuenta Stripe + `STRIPE_SECRET_KEY` de test.
- **Criterio de cierre**: mapping completo y coherente con `stripe-integration-plan.md`.

### 7.3 `DEPLOY-01` — Deploy de la Edge Function + secretos
- **Objetivo**: `supabase functions deploy stripe-webhook`, configurar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `PRICE_ID_TO_PRODUCT_KEYS`. Crear el webhook en Stripe apuntando a la URL de la EF.
- **Depende de**: 7.1, 7.2.
- **Criterio de cierre**: un evento de prueba desde Stripe devuelve `200 OK` y escribe `user_entitlements`.

### 7.4 `CHECKOUT-01` — Checkout real en el Paywall
- **Objetivo**: `PaywallScreen.handleSubscribe` crea una Checkout Session (vía un endpoint Go o la EF) y abre la URL en navegador externo; `AccountSettings` añade botón "Gestionar suscripción" al Customer Portal.
- **Depende de**: 7.2, 7.3.
- **Decisión pendiente de confirmar**: checkout externo (recomendado) vs embebido.
- **Punto de cambio único**: el handler de `PaywallScreen` ya está aislado paraesto.
- **Criterio de cierre**: clic en "Suscribirse" → navegador externo → pago test → vuelta a la app → `useAccess` desbloquea Pro/Suite.

### 7.5 `E2E-01` — Flujo real en test mode
- **Objetivo**: prueba de extremo a extremo login → checkout → webhook → entitlement llega → `useAccess` desbloquea. Los tests actuales usan mocks/dev-modes; este valida el camino real.
- **Depende de**: 7.1–7.4.
- **Criterio de cierre**: flujo completo verde en test mode con un usuario de prueba.

### 7.6 `SUPPORT-01` — CLI de soporte local (sustituye al panel admin)
- **Objetivo**: comando Go aparte (p. ej. `cmd/vantare-admin` o script `tools/support-cli`) que usa service-role para `lookup-user`, `grant`/`revoke`, `force-device-reset`, `list-license-events`.
- **No se distribuye** con la app de escritorio.
- **Depende de**: 7.1 (tablas + `license_events`).
- **Criterio de cierre**: los 3 escenarios de soporte se resuelven desde el CLI sin tocar Supabase Studio a mano.

### 7.7 `RUNBOOK-01` — Runbook de soporte
- **Objetivo**: añadir a `release-beta-operations-runbook.md` los escenarios (pago sin entitlement, device-limit, reembolso) y los comandos exactos (CLI + Stripe Dashboard + Supabase Studio).
- **Depende de**: 7.1, 7.6.

### 7.8 `AUDIT-01` — `license_events` + Discord sync (follow-ups de la EF)
- **Objetivo**: la Edge Function escribe `license_events` por cada webhook procesado; emite Discord role sync en `checkout.session.completed` / `customer.subscription.updated`.
- **Depende de**: 7.1, 7.3.
- **Criterio de cierre**: cada webhook deja traza en `license_events`; rol de Discord asignado en cambios de tier.

### 7.9 `I18N-03b` — Traducir Auth/Paywall/Account
- **Objetivo**: migrar copy hardcodeada de `LoginScreen`, `PaywallScreen`, `AccountSettings`, `LicenseBanner`, `UnconfiguredScreen` a `t()` (es/en/pt/it).
- **Depende de**: infraestructura i18n ya existente (I18N-02).
- **Criterio de cierre**: paridad de keys + tests de la pantalla.

---

## 8. Desincronización de documentos (hallazgo)

Los siguientes docs dicen "design-only / no production code yet" pero el código está implementado:
- `licensing-auth-architecture.md` (header "Status: design-only").
- `stripe-integration-plan.md` (header "Status: design-only; code in Mini-Plan B").
- `license-service-contract.md` (header "Status: design-only").
- `supabase-schema-release.md` (header "Status: schema is locked… migrations will be created in Mini-Plan B").

**Recomendación**: añadir una nota de "Estado real 2026-07-06" al inicio de cada uno indicando que el Go `internal/license` y la Edge Function están implementados, y que el único bloqueador de pagos reales es la migración SQL + checkout + deploy (secciones 3 y 7). Esto evita que otro worker (p. ej. el de Launcher) asuma que la licencia no existe y duplique trabajo.

---

## 9. Mapa de archivos verificados

**Backend Go**
- `internal/license/{types,errors,service,cache,plan,supabase_client,fingerprint*}.go` (+ tests)
- `cmd/vantare/main.go` (wiring de licencia, líneas ~356–449)

**Frontend**
- `frontend/src/lib/{license.tsx,license-types.ts,supabase-auth.ts,access.tsx,access-policy.ts,plan.ts,access-dev-modes.ts}`
- `frontend/src/hub/auth/{LoginScreen,PaywallScreen,LicenseBanner,UnconfiguredScreen}.tsx`
- `frontend/src/hub/settings/AccountSettings.tsx`
- `frontend/src/hub/{HubApp,OnboardingFlow}.tsx`
- `frontend/src/hub/auth/paywall-plans.ts`

**Stripe / Supabase**
- `supabase/functions/stripe-webhook/{index.ts,index.test.ts,_utils/stripe.ts,_utils/supabase.ts}`
- `tools/generate_supabase_config.ps1`
- (ausente) cualquier `*.sql` de migración

**Docs de referencia**
- `docs/stripe-integration-plan.md`, `docs/license-service-contract.md`, `docs/licensing-auth-architecture.md`, `docs/supabase-schema-release.md`, `docs/stripe-webhook-deployment.md`
- `docs/technical-debt.md` (`TD-043`)
- `docs/current-plan.md` (Notas I18N-*, ACCESS-DEV-MODES, P0 Free plan)
- `docs/release-beta-operations-runbook.md`, `docs/changelog.md`


## 11. Auth / Cuentas — gap de registro (evidencia)

**Respuesta corta: SÍ, falta el alta de cuentas (signup/registro) para una beta pública.**

### 11.1 Qué existe y está verificado ✅

| Capacidad | Evidencia | Estado |
|---|---|---|
| Login email+password | `supabase-auth.ts:signInWithEmail` (usa `supabase.auth.signInWithPassword`) | ✅ |
| OAuth Google/Discord (navegador externo) | `supabase-auth.ts:signInWithOAuth` + `LoginScreen.handleOAuth` → `Browser.OpenURL` | ✅ |
| Logout | `supabase-auth.ts:signOut` | ✅ |
| Persistencia de sesión en WebView | `setSupabaseSession` + `auth:session` emit (AUTH-03 cerrado, `current-plan.md` Nota AUTH-03) | ✅ |
| Validación de licencia online (grace/device) | `internal/license/service.go` + wiring `main.go` | ✅ |
| Cierre de beta / rol de beta | `BetaWelcome.tsx` (selector de rol: beginner/intermediate/advanced/creator/organizer) | ✅ (UI, no escribía `onboarding_completed`) |

### 11.2 Qué NO existe (evidencia concreta) ❌

| Capacidad | Evidencia de ausencia | Impacto |
|---|---|---|
| **Registro de nuevos usuarios** (`signUp`) | `supabase-auth.ts` exporta solo `signInWithEmail`, `signOut`, `getSession`, `setSupabaseSession`, `signInWithOAuth`. **No hay `signUp` ni `signInWithOtp`.** `LoginScreen.tsx` solo renderiza email/password + OAuth, sin enlace "crear cuenta". | 🔴 Crítico para beta pública: un usuario nuevo no puede darse de alta desde la app |
| **Reset de contraseña** | No hay `resetPasswordForEmail` en `supabase-auth.ts`; `LoginScreen` no lo ofrece. | 🟠 UX: un usuario que olvide la password queda bloqueado |
| **Verificación de email / confirmación** | El flujo `LicenseProvider`/`main.go` no menciona `email_confirmed`; Supabase Auth por defecto envía el email pero la app no lo gestiona como estado. | 🟡 Depende de política de Supabase |
| **Invite / cierre de beta por invite** | `BetaWelcome` es solo UI de rol; no hay control de acceso a quién se registra. Supabase Auth por defecto deja el signup **abierto** salvo que se restrinja en el dashboard. | 🟡 Decisión de producto pendiente |
| **Escritura de `onboarding_completed`** | El campo existe en `supabase-schema-release.md` (`profiles.onboarding_completed` default false) pero **no hay trigger ni UX que lo escriba**; `BetaWelcome` no persiste nada en `profiles`. | 🟡 El flag existe en papel, no en runtime |

### 11.3 Origen del hallazgo

La review adversaria (`docs/adversarial-review.md`, caso **C**) ya lo marcó como **P1** el 2026-06-29:
> *"No hay posibilidad de registro para nuevos usuarios, lo que confunde. El botón de Discord no debería estar en el flujo principal si no tiene soporte…"*

Es decir: el gap de registro es **conocido y no resuelto**. El login funciona (para usuarios ya existentes en Supabase Auth), pero la adquisición de nuevos usuarios desde la app está rota.

### 11.4 Miniplan propuesto — `AUTH-04` (registro + recuperación)

- **Backend**: Supabase Auth ya está conectado; no requiere código Go nuevo.
- **Frontend**:
  1. Añadir `signUp(email, password)` a `supabase-auth.ts` (wrapper de `supabase.auth.signUp`).
  2. `LoginScreen`: añadir estado/toggle "Crear cuenta" con email+password → `signUp`; enlace "¿Olvidaste tu contraseña?" → `resetPasswordForEmail`.
  3. Decidir política de signup en Supabase Dashboard: abierto (beta pública) vs invite-only (si se quiere cerrar la beta).
  4. (Opcional) escribir `onboarding_completed = true` y rol de `BetaWelcome` en `profiles` vía la Edge Function o RPC (requiere la migración `SQL-01` que crea el trigger de `profiles`).
- **No es rehacer arquitectura**: es exponer capacidades de Supabase Auth ya presentes. Estimación: 1–2 días (frontend + tests + decisión de política).
- **Criterio de cierre**: un usuario nuevo puede registrarse desde la app, recibe email de confirmación, entra al Hub como Free; un usuario existente puede resetear password.

### 11.5 Riesgo si se ignora

Para una beta **pública** (lo que dice el `changelog.md`: "beta pública"), sin registro la app solo sirve para usuarios que ya tengan fila en `auth.users` (p. ej. creados a mano en Supabase Studio). Eso convierte la "beta pública" en una beta cerrada de facto. **Bloquea la adquisición de testers.**

---

## 12. Alternativas y decisiones de diseño evaluadas

Esta sección documenta las opciones técnicas consideradas y la recomendación, para que la implementación no tenga que redebaterse.

### 12.1 Checkout: embebido vs externo

| Opción | Pros | Contras | Veredicto |
|---|---|---|---|
| **Externo** (abrir Stripe Checkout en navegador del sistema, como OAuth) | Evita bloqueos de WebView con pagos; reduce superficie PCI; reuse el patrón `Browser.OpenURL` ya implementado para OAuth | El usuario sale de la app un momento | **✅ Recomendado** |
| **Embebido** (Stripe JS en WebView2) | Experiencia continua | Google/Apple bloquean pagos en WebView en muchos casos; mayor complejidad de PCI; riesgo de white-screen como el caso B de `adversarial-review.md` | ❌ No |

Recomendación: **checkout externo**. El handler `PaywallScreen.handleSubscribe` ya está aislado como punto de cambio único; solo debe crear una Checkout Session (vía EF o endpoint Go) y abrir la URL con `Browser.OpenURL`, igual que `handleOAuth`.

### 12.2 ¿Dónde vive la lógica de checkout?

| Opción | Veredicto |
|---|---|
| Edge Function crea la Checkout Session (call Stripe desde Deno) | ✅ Recomendado: reusa el secreto `STRIPE_SECRET_KEY` ya en la EF; no expone el secreto al cliente; un solo lugar de trust |
| El Go `LicenseService` crea la sesión | ⚠️ Posible, pero metería la key de Stripe en el binario de escritorio (ya tenemos Supabase anon embebida; Stripe secret es más sensible). Evitar |
| El frontend llama Stripe directo | ❌ Nunca: expondría `STRIPE_SECRET_KEY` |

### 12.3 Trigger de `profiles` (auto-creación de fila)

- El doc `supabase-schema-release.md` dice "Create profile trigger (auto-create row on `auth.users` insert via Supabase trigger)" pero **no hay SQL**, así que el trigger **no existe**.
- Alternativas:
  1. **Trigger SQL** `handle_new_user` en `auth.users` → inserta en `public.profiles` (patrón estándar Supabase). ✅ Recomendado, va dentro de `SQL-01`.
  2. Hacerlo desde la Edge Function de Stripe (al vincular `stripe_customers`) — incompleto: no cubre usuarios Free que nunca pagan.
  3. Hacerlo desde el frontend tras `signUp` — frágil (falla si el usuario cierra antes).
- Veredicto: el trigger SQL es la fuente de verdad; se crea en la misma migración que las tablas.

### 12.4 RLS: quién escribe `devices` y `user_entitlements`

- El cliente Supabase (anon key) solo **lee** (`get_account_entitlements` es `SECURITY DEFINER` y respeta `auth.uid()`).
- La escritura de `user_entitlements` / `stripe_*` la hace **solo la Edge Function con service-role**.
- `devices.active_fingerprint` lo escribe el RPC `reset_active_device` (service-role/SECURITY DEFINER) o la validación online del Go cuando registra el device.
- Veredicto: RLS debe permitir SELECT al dueño y bloquear TODO lo demás salvo service-role; los RPCs llevan `SECURITY DEFINER`. Esto ya está especificado en `supabase-schema-release.md` y se implementa en `SQL-01`.

### 12.5 Persistencia de sesión vs re-login

- AUTH-03 cerró la persistencia: tras OAuth, `setSession` guarda tokens en localStorage del WebView2. En login email+password, `getSession()` al montar `LicenseProvider` revalida automáticamente.
- Riesgo residual (de `current-plan.md`): el flujo OAuth depende de la URL de redirect/callback en builds empaquetados Wails; requiere smoke manual real. No es un gap de código, es verificación pendiente.

### 12.6 Política de signup (abierto vs invite)

- Supabase Auth por defecto: signup **abierto** (cualquiera puede crear cuenta).
- Para "beta pública" → dejar abierto (o usar `email_confirmed` obligatorio para evitar spam).
- Para beta cerrada → `allow_signups = false` en Supabase Auth + distribuir invites, O un campo `beta_access` en `profiles` que la app compruebe.
- Veredicto: dado que el `changelog.md` dice "beta pública", recomendar **signup abierto + email confirmation**; si se quiere control, un flag `beta_access` gated tras `SQL-01`. Decisión de producto, no de ingeniería.

### 12.7 Resumen de alternativas

- Checkout: **externo**, creado por la **Edge Function**.
- `profiles`: **trigger SQL** en `auth.users`.
- Escritura de entitlements: **solo Edge Function (service-role)**.
- RLS: SELECT al dueño, todo lo demás solo service-role vía RPCs `SECURITY DEFINER`.
- Signup: **abierto + email confirmation** para beta pública (decisión de producto).
- Panel admin: **omitido** (sección 6).

---
---

## 10. Conclusión

El esqueleto de monetización de Vantare está **sorprendentemente avanzado** para una beta: gating, paywall, account settings, validación online con grace, fingerprint de device, y una Edge Function de Stripe completa y testeada. El motivo por el que hoy no se puede cobrar ni adquirir usuarios es un conjunto pequeño y bien acotado:

1. **Auth/registro** — falta `signUp` y recuperación de password en la app (`AUTH-04`). Para una beta pública esto es bloqueante: sin registro, la app solo sirve para usuarios ya existentes en `auth.users`. Login/OAuth/logout/sesión ya funcionan.
2. Crear la **migración SQL** (tablas + RLS + trigger `profiles` + 2 RPCs) — `SQL-01`. Sin esto, un usuario pagado cae a `authenticated-no-entitlement` (`TD-043`).
3. Crear **productos/precios** y **deployar** la Edge Function — `STRIPE-01` + `DEPLOY-01`.
4. Cablear el **checkout real** (externo, creado por la EF) en el Paywall — `CHECKOUT-01`.
5. Cubrir el **soporte operativo** con un CLI local, no con un panel web — `SUPPORT-01` + `RUNBOOK-01`.

Una vez cerrados 1–4, la beta pública puede adquirir usuarios Y cobrar. El panel de administración web propio **queda fuera de alcance por decisión** (sección 6); Stripe Dashboard + Supabase Studio + CLI de soporte cubren la operación de la beta.

Orden de ejecución recomendado: `AUTH-04` → `SQL-01` → `STRIPE-01` → `DEPLOY-01` → `CHECKOUT-01` → `E2E-01` → `SUPPORT-01` + `RUNBOOK-01` → `AUDIT-01` → `I18N-03b`.
