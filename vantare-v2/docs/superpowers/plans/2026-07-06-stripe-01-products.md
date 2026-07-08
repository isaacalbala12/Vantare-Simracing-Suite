# STRIPE-01 — Productos, precios y mapping de entitlements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear los productos y precios de Vantare en Stripe test mode y generar el mapping `PRICE_ID_TO_PRODUCT_KEYS` para la Edge Function.

**Architecture:** Se crean 9 productos en Stripe Dashboard (o vía API con `STRIPE_SECRET_KEY` de test): los 4 tiers release (Free sin precio, Overlays, Engineer, Suite) + 5 tiers beta (Beta Access, Supporter, Founder, Pro Founder, Visionary Backer). El precio "Suite" usa un product bundle. El mapping se vuelca en una variable de entorno de Supabase (`PRICE_ID_TO_PRODUCT_KEYS`) que la Edge Function lee. También se habilita el Customer Portal para self-service de suscripciones. La app de escritorio no se toca.

**Tech Stack:** Stripe Dashboard (o Stripe API vía `stripe` CLI/curl), Supabase Dashboard (Edge Function secrets), JSON.

---

## Contexto

- Los productos/precios actuales son placeholders en los docs (`docs/stripe-integration-plan.md` §1, `docs/stripe-webhook-deployment.md` §Price mapping).
- `supabase/functions/stripe-webhook/index.ts` lee `PRICE_ID_TO_PRODUCT_KEYS` como `Record<string, string[]>`.
- `internal/license/plan.go` clasifica todos los `product_key` de beta y release.
- Estado actual: `STRIPE_SECRET_KEY` de test no configurada (bloqueador de acceso F0).

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `configs/stripe-price-mapping.json` | Mapping `price_id → product_key[]` (no secreto, referencia) |
| Modify | `docs/release-02-licensing-auth-stage.md` | Marcar `STRIPE-01` ✅ al cerrar |

**Forbidden files:** cualquier código Go, frontend, Edge Function.

---

### Task 1: Crear productos en Stripe test mode

Usando `STRIPE_SECRET_KEY` de test:

```bash
# Release tiers
stripe prices create --product-data.name="Vantare Free" --unit-amount 0 --currency eur --recurring.interval month
stripe prices create --product-data.name="Vantare Overlays" --unit-amount 500 --currency eur --recurring.interval month
stripe prices create --product-data.name="Vantare Engineer" --unit-amount 500 --currency eur --recurring.interval month
stripe prices create --product-data.name="Vantare Suite" --unit-amount 899 --currency eur --recurring.interval month

# Beta tiers (se crean aunque NO se vendan en el paywall principal;
# la auditoría §4.2 exige incluirlos en el mapping para que los
# suscriptores beta no caigan a Free. Decisión G.)
stripe prices create --product-data.name="Vantare Beta Access" --unit-amount 500 --currency eur --recurring.interval month
stripe prices create --product-data.name="Vantare Supporter" --unit-amount 1000 --currency eur --recurring.interval month
stripe prices create --product-data.name="Vantare Founder" --unit-amount 2000 --currency eur --recurring.interval month
stripe prices create --product-data.name="Vantare Pro Founder" --unit-amount 3500 --currency eur --recurring.interval month
stripe prices create --product-data.name="Vantare Visionary Backer" --unit-amount 5000 --currency eur --recurring.interval month
```

Expected: cada comando devuelve un objeto JSON con `"id": "price_XXXXXXXXXXXXX"`. Anotar todos los price IDs.

- [ ] **Step 2: Verificar productos en Dashboard**

Ir a `https://dashboard.stripe.com/test/products` y confirmar que los 9 productos + precios están listados.

- [ ] **Step 3: Habilitar Customer Portal**

En `https://dashboard.stripe.com/test/settings/billing/portal`, activar Customer Portal. Configurar:
- "Allow customers to cancel subscriptions" → yes.
- "Allow customers to update payment methods" → yes.
- "Products" → seleccionar los 9 productos.
Anotar la URL del portal (p. ej. `https://billing.stripe.com/p/login/test_xxxx`).

---

### Task 2: Crear mapping price_id → product_key

- [ ] **Step 1: Escribir el mapping**

Crear `configs/stripe-price-mapping.json`:

```json
{
  "price_OVERLAYS_TODO": ["overlays"],
  "price_ENGINEER_TODO": ["engineer"],
  "price_SUITE_TODO": ["overlays", "engineer"],
  "price_BETA_ACCESS_TODO": ["beta_access", "overlays", "engineer"],
  "price_SUPPORTER_TODO": ["supporter", "overlays"],
  "price_FOUNDER_TODO": ["founder", "overlays", "engineer", "ac_lua_pack"],
  "price_PRO_FOUNDER_TODO": ["pro_founder", "overlays", "engineer", "ac_lua_pack"],
  "price_VISIONARY_BACKER_TODO": ["visionary_backer", "overlays", "engineer", "ac_lua_pack"]
}
```
> Nota: se eliminó la fila `"price_FREE_TODO": ["free"]` (decisión H). Free no se compra; el Go clasifica free/anonymous sin necesidad de entitlement.
```

Reemplazar `price_*_TODO` por los IDs reales del paso 1.

- [ ] **Step 2: Validar coherencia con el clasificador Go**
> **Decisión I (mostrado en el paywall principal):** solo `overlays`, `engineer` y `suite` aparecen como filas comprables en `paywall-plans.ts` (la UI ya lo tiene). Los tiers beta (Beta Access, Supporter, Founder, Pro Founder, Visionary Backer) se crean en Stripe y van en el mapping, pero NO se muestran como botón "Suscribirse" en el paywall principal: son históricos / acceso anticipado comunicado por otros canales (Patreon, Discord). Si en el futuro quieres venderlos desde la app, solo hay que añadir una fila en `paywall-plans.ts` que use su `priceKey` (p.ej. `founder`) — el pipeline ya funciona.

Confirmar en `internal/license/plan.go` que cada `product_key` del mapping existe en el switch de `ClassifyPlan`:
- `overlays`, `engineer`, `bundle` → release
- `beta_access`, `supporter`, `founder`, `pro_founder`, `visionary_backer`, `ac_lua_pack` → beta

El producto "Suite" emite `["overlays", "engineer"]` (no `bundle`); el Go combina ambos → `PlanSuite`. Correcto según `docs/stripe-integration-plan.md` (regla "overlays + engineer together").

- [ ] **Step 3: Commit**

```bash
git add configs/stripe-price-mapping.json
git commit -m "feat(stripe): add product price mapping for Stripe test (STRIPE-01)"
```

---

### Task 3: Carga del mapping en Supabase secrets

- [ ] **Step 1: Minificar el JSON para env var**

```bash
cat configs/stripe-price-mapping.json | jq -c .
```

Copiar la salida.

- [ ] **Step 2: Setear en Supabase como secret de la EF**

En Supabase Dashboard → Edge Functions → `stripe-webhook` → Secrets, añadir:

```
PRICE_ID_TO_PRODUCT_KEYS = <JSON minificado>
```

- [ ] **Step 3: Marcar cierre**

En `docs/release-02-licensing-auth-stage.md`: `STRIPE-01` 🔴 BLOQUEADO → ✅ HECHO.

- [ ] **Step 4: Commit stage doc**

```bash
git add docs/release-02-licensing-auth-stage.md
git commit -m "chore: close STRIPE-01"
```

---

## Self-Review

- [x] Spec coverage: 9 productos release + beta, mapping JSON, Customer Portal, coherencia con Go classifier.
- [x] Placeholder scan: price IDs reales se obtienen del Stripe CLI (no TBD).
- [x] Type consistency: `PRICE_ID_TO_PRODUCT_KEYS` es `Record<string, string[]>` en la EF.

Plan completo. Requiere `STRIPE_SECRET_KEY` de test y acceso al dashboard (bloqueador F0).