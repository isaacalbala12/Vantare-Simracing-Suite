# Fase 2A — Polar dashboard, productos y mapping (completada en repo)

> **Estado:** Artefactos y docs listos. **Productos Polar:** requieren acción humana (sin `POLAR_ACCESS_TOKEN` local).
>
> **Siguiente:** Fase 2B — skeleton Edge Functions + mapping loader.

**Proyecto Supabase objetivo (verificado 2026-07-09):** `ombjshwzqgeisazijduq`  
**URL:** `https://ombjshwzqgeisazijduq.supabase.co`

---

## Decisiones v1 confirmadas

| Decisión | Valor |
|----------|-------|
| Pro Monthly entitlement | **`bundle`** (suite completa) |
| `overlays_only` en v1 | **No** |
| Free tier en Polar | **No** — Free es solo lógica interna Vantare |
| Entorno inicial | **Polar Sandbox** (`sandbox.polar.sh` / `sandbox-api.polar.sh`) |

---

## 1. Documentación oficial Polar (confirmada 2026-07-09)

Fuentes: [API Overview](https://polar.sh/docs/api-reference/introduction), [Checkout API](https://polar.sh/docs/features/checkout/session), [Webhooks](https://polar.sh/docs/integrate/webhooks/delivery), [Webhook Events](https://polar.sh/docs/integrate/webhooks/events), [Sandbox](https://polar.sh/docs/integrate/sandbox).

### Base URLs

| Entorno | API |
|---------|-----|
| Production | `https://api.polar.sh/v1` |
| Sandbox | `https://sandbox-api.polar.sh/v1` |

### Autenticación

- **Core API (checkout, customers, products):** Organization Access Token (OAT) en header `Authorization: Bearer <token>`.
- **Customer Portal session:** mismo OAT en servidor; **no** OAT en cliente/desktop.
- Tokens sandbox y production son **independientes**.

### Checkout — endpoint real

```
POST https://sandbox-api.polar.sh/v1/checkouts/
Authorization: Bearer <POLAR_ACCESS_TOKEN>
Content-Type: application/json
```

**Scopes:** `checkouts:write`

**Campos clave (request):**

| Campo | Uso Vantare |
|-------|-------------|
| `products` | Array con **Product ID** (UUID) del catálogo Polar |
| `external_customer_id` | `auth.uid()` de Supabase — reconciliación |
| `customer_email` | Email Supabase (pre-fill checkout) |
| `customer_id` | Reutilizar si ya existe customer Polar |
| `metadata` | `{ user_id, product_key, source: "desktop", app: "vantare", plan_sku }` |
| `customer_metadata` | Metadata persistida en customer post-checkout |
| `success_url` | `CHECKOUT_SUCCESS_URL` |
| `return_url` | Cancel/back — `CHECKOUT_CANCEL_URL` o similar |
| `customer_ip_address` | IP real del usuario (Edge Function debe reenviarla) |

**Response:** `201` → objeto `Checkout` con **`url`** (redirect al usuario).

**Status checkout:** `open` → `confirmed` → `succeeded` | `failed` | `expired`. Webhook `checkout.updated` refleja cambios.

### Customer Portal — endpoint real

```
POST https://sandbox-api.polar.sh/v1/customer-sessions/
Authorization: Bearer <POLAR_ACCESS_TOKEN>
Content-Type: application/json
```

**Scopes:** `customer_sessions:write`

**Request (elegir uno):**

```json
{ "customer_id": "<polar-customer-uuid>", "return_url": "https://..." }
```

```json
{ "external_customer_id": "<supabase-auth-uid>", "return_url": "https://..." }
```

**Response:** `201` → `customer_portal_url` (link pre-autenticado, **corto TTL** — generar al click).

Portal por defecto (email OTP): `https://polar.sh/<org-slug>/portal` (sandbox: `https://sandbox.polar.sh/<org-slug>/portal`).

### Customer — crear / reutilizar

**Opción A (recomendada v1):** En checkout, pasar `external_customer_id` = Supabase `user_id`. Polar crea o enlaza customer automáticamente.

**Opción B (explícita):**

```
POST https://sandbox-api.polar.sh/v1/customers/
```

```json
{
  "email": "user@example.com",
  "external_id": "<supabase-auth-uid>",
  "metadata": { "app": "vantare" }
}
```

**Scopes:** `customers:write`

Lookup: `GET /v1/customers/external/{external_id}`

`external_id` es **único por org** e **inmutable** tras creación.

### Webhook — verificación y entrega

- Estándar: [Standard Webhooks](https://www.standardwebhooks.com/)
- SDK: `validateEvent(body, headers, POLAR_WEBHOOK_SECRET)` (`@polar-sh/sdk/webhooks`)
- **Raw body** obligatorio antes de parse JSON
- Secret: si validación manual, Polar secret debe estar **base64-encoded** (SDK lo maneja)
- Headers típicos Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature`
- Respuesta éxito recomendada: **HTTP 202** con body vacío
- Firma inválida: **403**
- Reintentos: hasta 10 con backoff; timeout 10s; endpoint se deshabilita tras 10 fallos consecutivos

**URL futura (Fase 2D deploy, no configurar aún):**

```
https://ombjshwzqgeisazijduq.supabase.co/functions/v1/billing-webhook
```

### Eventos webhook — nombres exactos (billing)

**Checkout:** `checkout.created`, `checkout.updated`, `checkout.expired`

**Orders (one-time + renovaciones):** `order.created`, `order.paid`, `order.updated`, `order.refunded`  
- `order.created.billing_reason`: `purchase` | `subscription_create` | `subscription_cycle` | `subscription_update`

**Subscriptions:** `subscription.created`, `subscription.active`, `subscription.updated`, `subscription.canceled`, `subscription.uncanceled`, `subscription.past_due`, `subscription.revoked`

**Customers:** `customer.created`, `customer.updated`, `customer.deleted`, `customer.state_changed`

**Refunds:** `refund.created`, `refund.updated`

**Recomendación Vantare v1 (suscribir en endpoint):**

- `order.paid` — Launch Edition one-time
- `order.refunded` — revocación one-time
- `subscription.created`, `subscription.active`, `subscription.updated` — catch-all lifecycle
- `subscription.canceled`, `subscription.past_due`, `subscription.revoked` — estado acceso
- `customer.created`, `customer.updated` — sync `billing_customers`

Polar documenta que `subscription.updated` es catch-all para active/canceled/uncanceled/past_due/revoked; conviene manejar ambos eventos específicos y `updated`.

### Campos útiles en payloads (referencia implementación 2D)

| Recurso | Campos |
|---------|--------|
| Checkout | `id`, `status`, `customer_id`, `external_customer_id`, `product_id`, `metadata`, `url` |
| Order | `id`, `customer_id`, `product_id`, `billing_reason`, `subscription_id`, `metadata` |
| Subscription | `id`, `customer_id`, `product_id`, `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end` |
| Customer | `id`, `external_id`, `email`, `metadata` |

Webhook envelope incluye `type` (nombre evento) e `data` (objeto recurso).

---

## 2. Crear productos en Polar (acción humana)

**Bloqueo:** No hay `POLAR_ACCESS_TOKEN` en entorno local. Productos **no creados automáticamente** en esta sesión.

### Paso 0 — Sandbox

1. Ir a [sandbox.polar.sh/start](https://sandbox.polar.sh/start)
2. Crear cuenta + organización **Vantare** (o usar org existente)
3. Settings → Access Tokens → crear OAT con scopes: `products:write`, `checkouts:write`, `customers:write`, `customer_sessions:write`
4. Guardar token solo en gestor de secrets / `supabase secrets set` (nunca git)

### Paso 1 — Launch Edition (dashboard)

1. Products → Create product
2. Name: **Vantare Launch Edition**
3. Type: **One-time purchase**
4. Price: **30.00 EUR** (fixed)
5. Visibility: **Public**
6. Metadata (product):

```json
{
  "vantare_checkout_key": "launch_lifetime",
  "vantare_entitlement_key": "bundle",
  "vantare_plan_sku": "launch_lifetime",
  "vantare_lifetime": true
}
```

7. Copy **Product ID** y **Price ID** → sustituir placeholders en mapping

### Paso 2 — Pro Monthly (dashboard)

1. Products → Create product
2. Name: **Vantare Pro Monthly**
3. Type: **Subscription** — interval **month**
4. Price: **4.99 EUR/month** (fixed)
5. Metadata:

```json
{
  "vantare_checkout_key": "pro_monthly",
  "vantare_entitlement_key": "bundle",
  "vantare_plan_sku": "pro_monthly",
  "vantare_lifetime": false
}
```

6. Copy Product ID y Price ID

### Alternativa API (sandbox)

**Launch Edition:**

```bash
curl -X POST "https://sandbox-api.polar.sh/v1/products/" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Vantare Launch Edition",
    "recurring_interval": null,
    "metadata": {
      "vantare_checkout_key": "launch_lifetime",
      "vantare_entitlement_key": "bundle",
      "vantare_plan_sku": "launch_lifetime",
      "vantare_lifetime": true
    },
    "prices": [{
      "amount_type": "fixed",
      "price_currency": "eur",
      "price_amount": 3000
    }]
  }'
```

**Pro Monthly:**

```bash
curl -X POST "https://sandbox-api.polar.sh/v1/products/" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Vantare Pro Monthly",
    "recurring_interval": "month",
    "recurring_interval_count": 1,
    "metadata": {
      "vantare_checkout_key": "pro_monthly",
      "vantare_entitlement_key": "bundle",
      "vantare_plan_sku": "pro_monthly",
      "vantare_lifetime": false
    },
    "prices": [{
      "amount_type": "fixed",
      "price_currency": "eur",
      "price_amount": 499
    }]
  }'
```

Respuesta incluye `id` (product) y `prices[].id` (price).

### Paso 3 — Customer Portal (dashboard)

Settings → Customer Portal → habilitar gestión de suscripciones y métodos de pago.

### Paso 4 — Webhook endpoint (posponer hasta 2D)

Settings → Webhooks → **no crear aún** hasta deploy de `billing-webhook`. Anotar URL objetivo arriba.

---

## 3. Mapping

**Archivo example (sin secrets):** [`configs/polar-product-mapping.example.json`](../../../configs/polar-product-mapping.example.json)

Tras crear productos, copiar JSON con IDs reales a secret Supabase:

```bash
supabase link --project-ref ombjshwzqgeisazijduq
supabase secrets set POLAR_PRODUCT_MAP='{"checkout_keys":{...},"price_id_to_checkout_key":{...}}'
```

**No** commitear `configs/polar-product-mapping.json` con IDs reales.

---

## 4. Supabase secrets (lista para Fase 2B–2D)

Configurar en proyecto `ombjshwzqgeisazijduq` cuando corresponda:

| Secret | Cuándo | Notas |
|--------|--------|-------|
| `POLAR_ACCESS_TOKEN` | 2C | OAT sandbox primero |
| `POLAR_WEBHOOK_SECRET` | 2D | Al crear endpoint webhook en Polar |
| `POLAR_PRODUCT_MAP` | 2C | JSON minificado desde mapping real |
| `CHECKOUT_SUCCESS_URL` | 2C | Página estática post-pago |
| `CHECKOUT_CANCEL_URL` | 2C | Return/cancel checkout |
| `PORTAL_RETURN_URL` | 2E | Return portal (opcional) |
| `SUPABASE_URL` | Auto EF | Ya disponible en Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | 2D webhook | Escritura BD |
| `SUPABASE_ANON_KEY` | 2C checkout/portal | Validar JWT usuario |

**Ya en Supabase (Fase 1.6):** schema + RPCs — no requiere cambio en 2A.

**Frontend (NO activar aún):** `VITE_BILLING_ENABLED=false`

---

## 5. Checklist Fase 2A

- [x] Docs Polar consultadas y resumidas en este archivo
- [x] Decisiones v1: `bundle`, no `overlays_only`, no Free en Polar
- [x] `configs/polar-product-mapping.example.json` creado
- [x] Proyecto Supabase verificado: `ombjshwzqgeisazijduq`
- [x] Lista secrets documentada
- [ ] **Humano:** cuenta/org Polar sandbox
- [ ] **Humano:** productos Launch + Pro creados
- [ ] **Humano:** IDs copiados a `POLAR_PRODUCT_MAP` secret
- [ ] **Humano:** OAT sandbox guardado como `POLAR_ACCESS_TOKEN`

---

## 6. Listo para Fase 2B?

| Criterio | Estado |
|----------|--------|
| Arquitectura y mapping definidos | ✅ |
| Docs API confirmadas | ✅ |
| Example mapping en repo | ✅ |
| Productos Polar con IDs reales | ⏳ Humano |
| `POLAR_ACCESS_TOKEN` en Supabase secrets | ⏳ Humano |
| Edge Functions | ❌ No iniciado (correcto) |

**Veredicto:** Listos para **Fase 2B** (skeleton EF + tests 401) en paralelo con creación manual de productos. **Fase 2C** (checkout real) requiere OAT + `POLAR_PRODUCT_MAP` con IDs reales.