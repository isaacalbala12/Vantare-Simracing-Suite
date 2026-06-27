# Stripe Webhook Deployment

> Scope: Release 02 — Supabase Edge Function that receives Stripe webhooks and
> updates Supabase entitlements.

## What this does

The `supabase/functions/stripe-webhook/` Edge Function:

1. Verifies the Stripe webhook signature using `STRIPE_WEBHOOK_SECRET`.
2. Routes the event to a handler by `event.type`.
3. Resolves the Vantare user from the Stripe customer mapping stored in
   `stripe_customers`.
4. Maps `price_id` → `product_key[]` using the `PRICE_ID_TO_PRODUCT_KEYS`
   environment variable.
5. Upserts `stripe_customers`, `stripe_subscriptions` and `user_entitlements`.
6. Handles cancellation, revocation and payment failures.

Supported events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Any other event type returns `200 { received: true }` without further work,
which lets Stripe complete the retry handshake while we ignore noise.

## Price to entitlement mapping

Set `PRICE_ID_TO_PRODUCT_KEYS` as a JSON object where each key is a Stripe
price ID and each value is an array of Vantare product keys:

```json
{
  "price_overlays_monthly": ["overlays"],
  "price_engineer_monthly": ["engineer"],
  "price_bundle_monthly": ["overlays", "engineer"],
  "price_beta_access": ["beta_access", "overlays", "engineer"],
  "price_founder": ["founder", "overlays", "engineer", "ac_lua_pack"]
}
```

Product keys are stored in `user_entitlements.product_key` and consumed by the
Go `LicenseService`.

## Deploy the Edge Function

From the repo root:

```bash
supabase functions deploy stripe-webhook --project-ref <project-ref>
```

This ships the function code, the import map (`deno.json`) and the
TypeScript helpers under `_utils/`.

## Environment variables

Set the following secrets on the Supabase project (Dashboard -> Edge
Functions -> stripe-webhook -> Secrets):

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Public URL of the Supabase project. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key, used to upsert `user_entitlements`, `stripe_customers` and `stripe_subscriptions`. Never exposed to the desktop app. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret shown by Stripe when the webhook endpoint is created. |
| `STRIPE_SECRET_KEY` | Stripe secret key. Required to fetch checkout line items and subscription details from the Stripe API. Without it, one-time purchases cannot be mapped and subscription purchases rely on the follow-up `customer.subscription.*` event. |
| `PRICE_ID_TO_PRODUCT_KEYS` | JSON mapping from Stripe price IDs to Vantare product key arrays. |

Do **not** commit any of these values.

## Stripe dashboard configuration

Webhook URL:

```
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Events to send:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

## Local testing

Run the function locally:

```bash
supabase functions serve stripe-webhook --env-file supabase/.env.local
```

Forward Stripe events with the Stripe CLI:

```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```

Trigger fixture events:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
```

Run the Deno tests:

```bash
cd supabase/functions/stripe-webhook
SUPABASE_URL=http://localhost \
SUPABASE_SERVICE_ROLE_KEY=dummy \
STRIPE_WEBHOOK_SECRET=dummy \
STRIPE_SECRET_KEY=sk_test_dummy \
deno test --allow-env
```

## Entitlement status mapping

| Stripe subscription status | `user_entitlements.status` | Notes |
| --- | --- | --- |
| `active`, `trialing` | `active` | Until `current_period_end`. |
| `past_due` | `grace` | App still validates online; 24h grace handled by `LicenseService`. |
| `canceled` + `cancel_at_period_end=true` | `active` | Until `current_period_end`, then `expired`. |
| `canceled` (immediate) | `expired` | |
| `incomplete_expired`, `unpaid` | `expired` | |
| `invoice.payment_failed` | `grace` | For entitlements tied to the failed invoice's subscription. |

## Idempotency

All entitlement writes use `upsert` with an explicit conflict key:

- `user_entitlements`: `ON CONFLICT (user_id, product_key)`.
- `stripe_customers`: `ON CONFLICT (stripe_customer_id)`.
- `stripe_subscriptions`: `ON CONFLICT (stripe_subscription_id)`.

Stripe may retry a webhook if the first delivery is slow; the upserts make
retries safe.

## Trust model

The webhook does **not** trust client-provided data for entitlement decisions:

- For `checkout.session.completed` on one-time payments, it fetches line items
  from the Stripe API using `STRIPE_SECRET_KEY`.
- For subscriptions, it fetches the subscription from the Stripe API or uses
  the subscription object sent by Stripe.
- The `user_id` for checkout is taken from `client_reference_id` or session
  metadata only to create the initial `stripe_customers` link; subscription
  events then resolve the user through the `stripe_customers` table.

## Verifying in production

After deploying and configuring the Stripe webhook endpoint, send a test event
from the Stripe dashboard and confirm:

1. Stripe dashboard shows the delivery as `200 OK`.
2. Supabase Edge Function logs show the handler log line with the event id.
3. `user_entitlements` reflects the expected product keys and status.
4. No error in `supabase functions logs stripe-webhook`.

## Type check before deploying

From the Edge Function directory:

```bash
cd supabase/functions/stripe-webhook
deno check index.ts
```

From the repo root:

```bash
deno check --config supabase/functions/stripe-webhook/deno.json supabase/functions/stripe-webhook/index.ts
```

Expected: no type errors. The import map in `deno.json` resolves `stripe` to
`npm:stripe@^17.0.0`.

## Follow-ups

- Emit a Discord role sync job from `checkout.session.completed` and
  `customer.subscription.updated`.
- Write an audit entry to `license_events` for every processed webhook.
- Add RLS policy validation tests against a real Supabase project.
