# billing-webhook (Fase 2 — Polar)

**Estado BIL-02:** inbox durable implementado en código — pendiente de review y
deploy. La firma Polar se verifica antes de persistir; el inbox usa leases,
efectos reanudables, quarantine y replay auditado. `license_events` queda como
auditoría, no como claim.

Respuestas HTTP:
- `503` — falta `POLAR_WEBHOOK_SECRET` o mapping inválido
- `403` — firma inválida
- `400` — headers/body inválidos
- `202` — procesado / duplicado / ignorado / cuarentena conocida
- `503` — worker activo o reintento programado sin scheduler local; devuelve
  `lease_expires_at` o `next_attempt_at` y `Retry-After` para conservar el retry
  del proveedor
- `500` — evento verificado y persistido, pero el procesamiento falló; puede
  reintentarse sin perder efectos completados

## Endpoints relacionados

| Función | Auth | Fase |
|---------|------|------|
| `billing-checkout` | JWT Supabase | 2C checkout real |
| `billing-portal` | JWT Supabase | 2E portal real |
| `billing-webhook` | Firma Polar (sin JWT usuario) | 2D |

## Tablas destino (2D)

`billing_webhook_inbox`, `billing_webhook_effects`,
`billing_webhook_replay_audit`, `billing_customers`, `billing_subscriptions`,
`user_entitlements`, `license_events`

## Tests

```bash
deno test --allow-env supabase/functions/_shared/mapping.test.ts \
  supabase/functions/billing-checkout/index.test.ts \
  supabase/functions/billing-portal/index.test.ts \
  supabase/functions/billing-webhook/inbox.test.ts \
  supabase/functions/billing-webhook/process.test.ts \
  supabase/functions/billing-webhook/index.test.ts
```

La migración y el replay están documentados en
`vantare-v2/docs/billing/bil-02-webhook-inbox-runbook.md`.
