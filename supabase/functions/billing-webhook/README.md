# billing-webhook (Fase 2 — Polar)

**Estado Fase 2D:** implementado — verificación firma Polar (Standard Webhooks), idempotencia `license_events`, upsert `billing_customers` / `billing_subscriptions` / `user_entitlements`.

Respuestas HTTP:
- `503` — falta `POLAR_WEBHOOK_SECRET` o mapping inválido
- `403` — firma inválida
- `400` — headers/body inválidos
- `202` — procesado / duplicado / ignorado

## Endpoints relacionados

| Función | Auth | Fase |
|---------|------|------|
| `billing-checkout` | JWT Supabase | 2C checkout real |
| `billing-portal` | JWT Supabase | 2E portal real |
| `billing-webhook` | Firma Polar (sin JWT usuario) | 2D |

## Tablas destino (2D)

`billing_customers`, `billing_subscriptions`, `user_entitlements`, `license_events`

## Tests

```bash
deno test --allow-env supabase/functions/_shared/mapping.test.ts \
  supabase/functions/billing-checkout/index.test.ts \
  supabase/functions/billing-portal/index.test.ts \
  supabase/functions/billing-webhook/index.test.ts
```