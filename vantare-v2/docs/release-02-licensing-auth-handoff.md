# Handoff: Stage de Licencias, Auth y Pagos Reales (Beta Pública)

> **Propósito:** Continuar esta sesión en otro chat con la máxima información posible.
> **Fecha de la sesión original:** 2026-07-06.
> **Estado:** Planificación completada, 10 miniplans redactados, bloqueado por acceso F0.
> **Doc ancla del stage:** `docs/release-02-licensing-auth-stage.md`
> **Auditoría técnica:** `docs/stripe-licensing-status-audit.md`

---

## 0. Contexto de la sesión

Se realizó una auditoría profunda del estado de Stripe, licencias, pagos y auth de Vantare v2. Se encontró que **el backend Go `internal/license` y la Edge Function de Stripe ya están implementados y testeados**, pero el sistema no puede cobrar ni adquirir usuarios porque faltan: (1) registro de usuarios (`signUp`), (2) migración SQL (tablas + RLS + 2 RPCs que el Go ya invoca), (3) checkout real de Stripe, (4) deploy de la Edge Function con secretos.

**Decisiones de producto tomadas durante la sesión:**
- NO se construye panel de administración web propio. Soporte operativo = Stripe Dashboard + Supabase Studio + CLI de soporte Go local (no distribuido).
- Checkout será EXTERNO (Stripe Checkout en navegador del sistema), no embebido en WebView.
- La creación de Checkout Session la hace la Edge Function (reusa `STRIPE_SECRET_KEY`), no el Go ni el frontend.
- Política de signup: abierto + email confirmation (recomendado para beta pública; decisión de producto pendiente).

---

## 1. Arquitectura actual (verificada contra el código)

### Implementado ✅
- **Go `internal/license`**: `Service.Validate`, `HasEntitlement`, `ResetDevice`, `LoadCache`, `SaveCache`. Cache-first + fallback online con grace 24h. Fingerprint de device (MachineGuid Windows). Cliente Supabase stdlib. `ClassifyPlan`/`ClassifyStatus`. Tests completos.
- **Wiring en `cmd/vantare/main.go`**: registrado como servicio Wails, eventos `license:validate` y `license:reset-device` cableados, inyección de Supabase URL/anon key vía ldflags o env vars.
- **Frontend UI**: `LicenseProvider`, `useLicense`, `useAccess`, `access-policy`, `LoginScreen` (email+OAuth), `PaywallScreen` (⚠️ sin checkout real), `LicenseBanner`, `UnconfiguredScreen`, `AccountSettings`, `AccessGate`.
- **Edge Function `stripe-webhook`**: código completo en `supabase/functions/stripe-webhook/`, maneja 5 eventos de Stripe, upsert idempotente de `user_entitlements/stripe_customers/stripe_subscriptions`. Tests en Deno. ❌ No deployada, sin secretos.
- **Supabase Auth**: conectado, login email/password, OAuth Google+Discord externo, persistencia de sesión (AUTH-03 cerrado).
- **Acceso Dev**: modos de QA (`?access=`) sin tocar producción.

### Faltante ❌
1. **Registro de usuarios (`signUp`)** — 🔴 Bloquea adquisición. No hay `signUp` en `supabase-auth.ts`. LoginScreen no tiene toggle "Crear cuenta". Ver `AUTH-04`.
2. **Migración SQL** — 🔴 **Bloqueador padre.** No hay `.sql` en el repo. Faltan 6 tablas, RLS, trigger de `profiles`, y los 2 RPCs (`get_account_entitlements`, `reset_active_device`) que el Go invoca en producción. Ver `SQL-01`.
3. **Checkout real** — 🔴 Bloquea cobros. `PaywallScreen.handleSubscribe` solo muestra "Pago en línea próximamente". Ver `CHECKOUT-01`.
4. **Deploy de la EF** — 🔴 Edge Function no deployada, secretos no configurados, webhook de Stripe no creado. Ver `DEPLOY-01`.
5. **Productos/precios Stripe** — ❌ Placeholders; no hay price IDs reales. Ver `STRIPE-01`.
6. **Soporte operativo** — ❌ Sin CLI de soporte ni runbook. Ver `SUPPORT-01` + `RUNBOOK-01`.
7. **Auditoría/license_events** — ❌ La EF no escribe auditoría ni emite Discord sync. Ver `AUDIT-01`.
8. **i18n de Auth/Paywall** — ❌ Copy hardcodeada en español. Ver `I18N-03b`.

---

## 2. Los 10 miniplans (dónde está cada uno)

Todos en `docs/superpowers/plans/2026-07-06-*.md`. Enlace directo en la tabla §3 del stage doc.

| ID | Archivo | Dificultad | Resumen |
|---|---|---|---|
| `AUTH-04` | `auth-04-signup.md` | 🟢 Baja | Añadir `signUp` + `resetPasswordForEmail` a `supabase-auth.ts` + toggle en `LoginScreen`. Frontend puro. |
| `SQL-01` | `sql-01-migration.md` | 🟡 Media | Migración SQL: 6 tablas, RLS, trigger `handle_new_user`, 2 RPCs (`get_account_entitlements` + `reset_active_device`). |
| `STRIPE-01` | `stripe-01-products.md` | 🟢 Baja | Stripe CLI: crear 9 productos release+beta, mapping JSON, Customer Portal. |
| `DEPLOY-01` | `deploy-01-webhook.md` | 🟡 Media | Deployar EF, setear 5 secretos, crear webhook en Stripe, verificar con `stripe trigger`. |
| `CHECKOUT-01` | `checkout-01.md` | 🟡 Media | Nuevo handler EF para crear checkout session + PaywallScreen substituye placeholder por fetch + `Browser.OpenURL`. |
| `E2E-01` | `e2e-01.md` | 🟢 Baja | Smoke manual en Stripe test mode: registro→login→checkout→verificar entitlement. |
| `SUPPORT-01` | `support-01-cli.md` | 🟢 Baja | CLI Go `vantare-admin` (binario aparte): lookup, grant, revoke, device-reset, events. |
| `RUNBOOK-01` | `runbook-01.md` | 🟢 Baja | 3 escenarios de soporte documentados en el runbook. |
| `AUDIT-01` | `audit-01.md` | 🟡 Media | `insertLicenseEvent` + `syncDiscordRole` en la EF. |
| `I18N-03b` | `i18n-03b-auth.md` | 🟡 Media | 40+ keys de auth/paywall/account en 4 idiomas, migrar componentes a `t()`. |

---

## 3. Issues detectados (corregir antes de ejecutar)

### 3a. SQL-01 — Bug de rate-limit en `reset_active_device`
**Problema:** El RPC incrementa `reset_count_24h` sin comprobar si ha pasado 24h desde el último reset. La primera vez funciona; la segunda bloquea permanentemente porque `reset_count_24h >= 1` sin comprobar `last_reset_at`.

**Fix:** Añadir columna `last_reset_at timestamptz` a `public.devices` y cambiar la lógica a:
```sql
if v_resets is not null and v_resets >= 1 
   and (select last_reset_at from public.devices where user_id = v_user_id) > now() - interval '24 hours'
then raise exception 'rate_limit: solo 1 reset cada 24h';
end if;
```

### 3b. CHECKOUT-01 — Ruta debe insertarse ANTES de la verificación Stripe
**Problema:** La EF actual verifica `stripe-signature` para TODAS las peticiones POST. El nuevo endpoint `/create-checkout-session` no tiene firma Stripe (lo llama el frontend). La ruta debe añadirse **antes** del bloque de verificación en `handleRequest`.

**Fix:**
```typescript
async function handleRequest(req: Request, ctx: WebhookContext): Promise<Response> {
  const url = new URL(req.url);
  
  // ⬇️ AÑADIR ANTES DE LA VERIFICACIÓN
  if (url.pathname === "/create-checkout-session" && req.method === "POST") {
    return await handleCreateCheckoutSession(ctx, req);
  }
  
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }
  const signature = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();
  // ...
}
```

### 3c. I18N-03b — Traducciones pt/it incompletas
El plan da `es` completo pero solo ejemplos de `en/pt/it`. El agente ejecutor completa usando LLM o traductor. No bloquea arquitectónicamente.

---

## 4. Orden de ejecución correcto

```
F0 ──► [HUMANO] Dar ref Supabase + STRIPE_SECRET_KEY test + habilitar Customer Portal
         │
         ├──────────────────────────────────────────────────────────┐
         ▼                                                          ▼
F1 ──► SQL-01 [fix rate-limit 1st]                                 │
       STRIPE-01 (dashboard Stripe, 2h hum)                        │
       SUPPORT-01 + RUNBOOK-01 (CLI + docs)                        │
       I18N-03b (i18n, independiente)                              │
       AUTH-04 (signup, NO depende de SQL-01) ◄────────────────────┘
         │
         ▼
F2 ──► DEPLOY-01: supabase functions deploy + secrets + webhook Stripe
         │
         ▼
F3 ──► CHECKOUT-01: PaywallScreen real fetch + Browser.OpenURL
         │
         ▼
F4 ──► E2E-01: smoke test en Stripe test mode ◄── AUDIT-01 (paralelo)
```

F1 puede ejecutarse con 5–7 agents en paralelo; no comparten archivos de código (SQL, CLI, frontend i18n, frontend auth, docs).

---

## 5. Bloqueadores para arrancar

1. **Ref de proyecto Supabase** — para generar los `.sql` con el `--project-ref` correcto y hacer `supabase link` + `supabase db push`.
2. **`STRIPE_SECRET_KEY` de test** — para crear productos y deployar la EF con el secreto.
3. **Customer Portal de Stripe** habilitado (botón "Gestionar suscripción").
4. **Decisión de política de signup** — ¿abierto + email confirmation (recomendado) o invite-only?

---

## 6. Documentos creados en esta sesión

| Archivo | Rol |
|---|---|
| `docs/release-02-licensing-auth-stage.md` | **Ancla del stage**: estado de miniplans, ruta crítica, DoD, bloqueadores |
| `docs/release-02-licensing-auth-handoff.md` | **Este documento**: handoff para continuar en otro chat |
| `docs/stripe-licensing-status-audit.md` | **Auditoría técnica**: evidencia detallada, secciones 1–12 (410 líneas) |
| `docs/superpowers/plans/2026-07-06-auth-04-signup.md` | Plan AUTH-04 |
| `docs/superpowers/plans/2026-07-06-sql-01-migration.md` | Plan SQL-01 |
| `docs/superpowers/plans/2026-07-06-stripe-01-products.md` | Plan STRIPE-01 |
| `docs/superpowers/plans/2026-07-06-deploy-01-webhook.md` | Plan DEPLOY-01 |
| `docs/superpowers/plans/2026-07-06-checkout-01.md` | Plan CHECKOUT-01 |
| `docs/superpowers/plans/2026-07-06-e2e-01.md` | Plan E2E-01 |
| `docs/superpowers/plans/2026-07-06-support-01-cli.md` | Plan SUPPORT-01 |
| `docs/superpowers/plans/2026-07-06-runbook-01.md` | Plan RUNBOOK-01 |
| `docs/superpowers/plans/2026-07-06-audit-01.md` | Plan AUDIT-01 |
| `docs/superpowers/plans/2026-07-06-i18n-03b-auth.md` | Plan I18N-03b |

**Modificados en esta sesión:**
| Archivo | Cambio |
|---|---|
| `docs/current-plan.md` | Añadidas notas de auditoría, gap de auth, stage doc, planes completos |
| `docs/documentation-inventory.md` | Indexados audit doc + stage doc |
| `docs/superpowers/plans/2026-07-06-launcher-extensive.md` | AJENO (worker de Launcher) — no tocar |

---

## 7. Memoria durable (retener)

- El backend Go `internal/license` y la Edge Function Stripe están implementados y testeados. Los RPCs `get_account_entitlements` y `reset_active_device` que el Go invoca no existen como SQL. El checkout real no existe (PaywallScreen muestra "próximamente"). Falta registro de usuarios (`signUp`).
- Decisión: NO construir panel de admin web. Soporte operativo con Stripe Dashboard + Supabase Studio + CLI Go local no distribuido (`SUPPORT-01`).
- Decisión: Checkout externo (Stripe Checkout en navegador, no embebido en WebView). Creación de sesión por la Edge Function, no por el cliente.
- Decisión: Signup abierto + email confirmation para beta pública (pendiente de confirmación).

---

## 8. Cómo continuar en el próximo chat

1. Leer este archivo (`docs/release-02-licensing-auth-handoff.md`) para contexto completo.
2. Revisar el stage doc (`docs/release-02-licensing-auth-stage.md) para estado actual de miniplans.
3. Corregir los 3 issues identificados (sección 3 de este doc) en los planes afectados.
4. Solicitar acceso F0 (ref Supabase + STRIPE_SECRET_KEY test + Customer Portal) para desbloquear.
5. Ejecutar F1 en paralelo con agents.
6. Cada miniplan produce commits selectivos; Isaac hace merge final.
