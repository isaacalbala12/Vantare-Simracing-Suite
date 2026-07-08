# DEPLOY-01 — Deploy Edge Function + secretos + webhook Stripe

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desplegar la Edge Function `stripe-webhook` en Supabase, configurar sus 5 secretos, y registrar el endpoint de webhook en Stripe Dashboard para que los pagos reales escriban entitlements.

**Architecture:** La EF (`supabase/functions/stripe-webhook/index.ts`) ya está completa y testeada (`index.test.ts` con `deno test`). Solo hay que deployarla con `supabase functions deploy`, setear los secretos de entorno (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `PRICE_ID_TO_PRODUCT_KEYS`), y crear el webhook endpoint en Stripe apuntando a la URL pública de la EF. Verificar con `stripe trigger checkout.session.completed` que el webhook escribe `user_entitlements`.

**Tech Stack:** Supabase CLI (`supabase functions`), Deno, Stripe Dashboard/CLI, SQL Editor de Supabase. Cero cambios en la app de escritorio.

---

## Contexto

- `supabase/functions/stripe-webhook/index.ts` maneja 5 eventos de Stripe y hace upsert idempotente de `stripe_customers`, `stripe_subscriptions` y `user_entitlements`.
- El mapping `PRICE_ID_TO_PRODUCT_KEYS` lo creó `STRIPE-01` y debe estar en Supabase secrets como JSON minificado.
- Requiere `SQL-01` aplicado (las tablas deben existir para los upserts).
- `docs/stripe-webhook-deployment.md` documenta el procedimiento manual; este plan lo ejecuta.

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/functions/stripe-webhook/.env.local.example` | Template de env vars locales para testing |
| Modify | `docs/release-02-licensing-auth-stage.md` | Marcar `DEPLOY-01` ✅ al cerrar |

**Forbidden files:** app Go, frontend.

---

### Task 1: Verificar y deployar la Edge Function

- [ ] **Step 1: Verificar que la EF compila con tipo**

```bash
cd supabase/functions/stripe-webhook
deno check index.ts
```
Expected: sin errores de tipo. Si hay fallos, revisar la versión de `stripe` en `deno.json` (debe ser `npm:stripe@^17.0.0`) y que los imports de `Deno.env` no tengan errores de tipo (el `Deno` namespace está disponible en el runtime de Supabase).

- [ ] **Step 2: Ejecutar tests de la EF**

```bash
cd supabase/functions/stripe-webhook
SUPABASE_URL=http://localhost \
SUPABASE_SERVICE_ROLE_KEY=dummy \
STRIPE_WEBHOOK_SECRET=dummy \
STRIPE_SECRET_KEY=sk_test_dummy \
deno test --allow-env
```
Expected: todos PASS. Si algún test falla, revisar el código de la EF (no tocar si solo falla por env vars no seteadas).

- [ ] **Step 3: Deployar al proyecto Supabase**

```bash
supabase functions deploy stripe-webhook --project-ref <project-ref>
```

Expected: output `Deployed Function stripe-webhook (use supa_funct_stripe_webhook url: ...)` o similar.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/stripe-webhook/.env.local.example
git commit -m "feat(supabase): deploy stripe-webhook Edge Function (DEPLOY-01)"
```

---

### Task 2: Configurar secretos en Supabase

- [ ] **Step 1: Setear cada secreto**

Desde Supabase Dashboard → Edge Functions → `stripe-webhook` → Secrets, o vía CLI:

```bash
supabase secrets set SUPABASE_URL=<url> --project-ref <ref>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key> --project-ref <ref>
supabase secrets set STRIPE_WEBHOOK_SECRET=<whsec_...> --project-ref <ref>
supabase secrets set STRIPE_SECRET_KEY=<sk_test_...> --project-ref <ref>
supabase secrets set PRICE_ID_TO_PRODUCT_KEYS='<JSON minificado>' --project-ref <ref>
```

- `STRIPE_WEBHOOK_SECRET`: se obtiene del siguiente paso (Task 3, cuando se cree el webhook en Stripe) y se rellena después. Por ahora, placeholder temporal.
- `PRICE_ID_TO_PRODUCT_KEYS`: el JSON minificado de `configs/stripe-price-mapping.json` (creado en `STRIPE-01`).

Expected: cada comando devuelve "Set ... secret successfully".

- [ ] **Step 2: Verificar secretos seteados**

Desde el dashboard de Supabase, ir a Edge Functions → `stripe-webhook` → Secrets y confirmar que los 5 secretos aparecen (los valores se muestran ofuscados).

- [ ] **Step 3: Commit**

Sin commit (los secretos no se commitean).

---

### Task 3: Crear webhook endpoint en Stripe

- [ ] **Step 1: Obtener la URL pública de la EF**

La URL es: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

- [ ] **Step 2: Crear webhook en Stripe Dashboard**

En `https://dashboard.stripe.com/test/webhooks`:
- URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- Events to send: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- API version: latest

Al crear el webhook, Stripe muestra `whsec_...` (Signing secret). Copiar este valor.

- [ ] **Step 3: Actualizar `STRIPE_WEBHOOK_SECRET` en Supabase**

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=<whsec_...> --project-ref <ref>
```

---

### Task 4: Verificación end-to-end en test mode

- [ ] **Step 1: Crear un usuario y producto de prueba**

En Supabase SQL Editor:

```sql
-- Crear usuario de prueba (vía Supabase Auth dashboard)
-- Asignarle un stripe_customers link manual
insert into public.stripe_customers (user_id, stripe_customer_id)
values ('<uuid>', 'cus_test_XXXX');
```

En Stripe CLI:

```bash
stripe customers create --email test@example.com
# Anotar customer ID y actualizar stripe_customers
```

Crear un precio de prueba (o usar uno de los ya creados en `STRIPE-01`).

- [ ] **Step 2: Disparar webhook de prueba**

```bash
stripe trigger checkout.session.completed
```

Expected: Stripe CLI reporta `200 OK`. Verificar en Supabase SQL Editor:

```sql
select * from public.user_entitlements where user_id = '<uuid>';
select * from public.stripe_subscriptions;
```

Debe haber al menos 1 fila en `user_entitlements` con `product_key` correspondiente al precio del checkout.

- [ ] **Step 3: Verificar logs de la EF**

```bash
supabase functions logs stripe-webhook --project-ref <ref>
```

Expected: log lines del handler `checkout.session.completed` con el event ID de Stripe, sin errores.

- [ ] **Step 4: Commit stage doc**

```bash
git add docs/release-02-licensing-auth-stage.md
git commit -m "chore: close DEPLOY-01"
```

---

## Self-Review

- [x] Spec coverage: deploy EF, 5 secretos, webhook Stripe, verificación con `stripe trigger`.
- [x] Placeholder scan: `<project-ref>`, `<whsec_...>`, `<uuid>` son valores que se obtienen en tiempo de ejecución (no TBD).
- [x] Type consistency: los secretos coinciden con los que lee `index.ts` y `_utils/*.ts`.

Plan completo. Requiere `SQL-01` aplicado, `STRIPE-01` completado, y `SUPABASE_SERVICE_ROLE_KEY` + `STRIPE_SECRET_KEY` de test (bloqueador F0).