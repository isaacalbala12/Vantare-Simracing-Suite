# Stripe Webhook Deployment

> Scope: Release 02 Mini-Plan B — Supabase Edge Function that receives Stripe
> webhooks and updates entitlements.

## What this does

The `supabase/functions/stripe-webhook/` Edge Function:

1. Verifies the Stripe webhook signature using `STRIPE_WEBHOOK_SECRET`.
2. Routes the event to a handler by `event.type`.
3. Logs the event id. The full `price_id -> product_key` entitlement
   mapping and the Discord role sync job are intentionally left as a
   follow-up (Mini-Plan B+). Each handler carries a `TODO Mini-Plan B
   follow-up` comment so it is easy to grep.

The current handlers cover:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Any other event type returns `200 { received: true }` without further
work, which lets Stripe complete the retry handshake while we ignore
noise.

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

Trigger a fixture event:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

The Edge Function logs the event id to stdout. Once the entitlement
mapping follow-up lands, this is also where the upsert results will be
visible.

## Verifying in production

After deploying and configuring the Stripe webhook endpoint, send a
test event from the Stripe dashboard and confirm:

1. Stripe dashboard shows the delivery as `200 OK`.
2. Supabase Edge Function logs show `checkout completed <id>` (or the
   corresponding handler log line) with the event id from Stripe.
3. No error in `supabase functions logs stripe-webhook`.

## Type check before deploying

From the Edge Function directory:

```bash
cd supabase/functions/stripe-webhook
deno check index.ts
```

Expected: no type errors. The import map in `deno.json` resolves
`stripe` to `npm:stripe@^17.0.0`.

## Follow-ups

The Edge Function is intentionally a deployable skeleton. The next
Mini-Plan B follow-up must:

1. Resolve `price_id` to `product_key[]` using an env-loaded mapping.
2. Upsert `stripe_customers` and `stripe_subscriptions`.
3. Upsert `user_entitlements` (status `active` / `past_due` / `expired`).
4. Emit a Discord role sync job from `checkout.session.completed` and
   `customer.subscription.updated`.
