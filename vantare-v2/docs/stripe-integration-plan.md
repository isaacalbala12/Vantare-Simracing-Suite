# Stripe Integration Plan — Release 02

> **Ámbito documental (2026-09-14):** Plan histórico de Stripe; Polar es la autoridad comercial decidida y su readiness se verifica por separado.
> [Referencia vigente](vantare-program/product-contract.md).


> Date: 2026-06-26.
> Scope: products, prices, checkout, webhooks, entitlement mapping, Discord role sync.
> Status: design-only; code in Mini-Plan B.

## Products And Prices

### Release Tiers (after beta)

| Plan | Price | Product Key | Includes |
| --- | --- | --- | --- |
| Free | 0 EUR | _(no entitlement)_ | Basic overlays, mock/demo, limited profiles |
| Overlays | 5 EUR/mo | `overlays` | Overlays Studio, premium overlay presets |
| Engineer | 5 EUR/mo | `engineer` | Engineer app/module |
| Suite | 8.99 EUR/mo | `bundle` | Overlays + Engineer together |
| Assetto Corsa Lua/CSP Pack | 20 EUR one-time | `ac_lua_pack` | Lua/CSP overlay pack (download entitlement only) |

> The pair `overlays + engineer` is treated as `Suite` in the UI even without
> an explicit `bundle` row, so a tester upgrading plans does not regress the
> status label during the transition.

### Beta Tiers (first 6 months)

| Product | Price (monthly) | Product Key | Benefit |
|---|---|---|---|
| Beta Access | 5 EUR | `beta_access` | Overlays + Engineer during beta |
| Supporter | 10 EUR | `supporter` | Above + badge |
| Founder | 20 EUR | `founder` | Above + AC Lua Pack while subscribed |
| Pro Founder | 35 EUR | `pro_founder` | Above |
| Visionary Backer | 50 EUR | `visionary_backer` | Above |

Each tier maps to one or more `product_key` entitlements stored in Supabase.

### UI Plan Mapping

The visible label shown to the user is derived from the entitlements via
`internal/license.ClassifyPlan` (and the TS mirror in `frontend/src/lib/plan.ts`).
The mapping is locked to the table above:

- `bundle`, `beta_access`, `founder`, `pro_founder`, `visionary_backer`, or
  `overlays + engineer` together → `Suite`
- `overlays` (alone) or `supporter` → `Overlays`
- `engineer` (alone) → `Engineer`
- `ac_lua_pack` only → `Free` (add-on, does not unlock the app)
- no entitlement → `Free`
- any other key → `unknown` (visible to flag stale data, never silently free)

The user-facing status collapses the runtime `state` into five buckets:
`active`, `grace`, `blocked` (covers `expired`, `device-limit`,
`authenticated-no-entitlement`), `free`, `anonymous`.

## Webhook Events

Backend endpoint: `POST /webhooks/stripe` (deploy target decided below).

| Stripe Event | Action |
|---|---|
| `checkout.session.completed` | Create/update `stripe_customers`, create/update `user_entitlements` based on line items, emit Discord role sync job. |
| `customer.subscription.created` | Upsert `stripe_subscriptions`, update `user_entitlements`. |
| `customer.subscription.updated` | Update `stripe_subscriptions` and `user_entitlements` status/period. |
| `customer.subscription.deleted` | Mark `user_entitlements` as `expired` at period end. |
| `invoice.payment_failed` | Mark `user_entitlements` as `past_due`; enter grace logic handled by app. |

## Entitlement Mapping

- `price_id` → `product_key[]` mapping stored in backend config (env, not repo).
- `checkout.session.completed` resolves price IDs and writes entitlements.
- Subscription status `active` or `trialing` with `current_period_end` in future → `active`.
- `past_due` → `grace` immediately (app still validates online).
- `canceled` with `cancel_at_period_end=true` → `active` until `current_period_end`, then `expired`.
- `incomplete_expired` or `unpaid` → `expired`.

## Discord Role Sync Contract

- On new subscription or tier change, emit `{ user_id, email, product_keys, tier }` to a Discord bot/job.
- This release: implement an outgoing webhook or Supabase trigger that calls a Discord bot endpoint. Do not implement the Discord bot itself here.

## Webhook Deployment Target

Options:
1. **Supabase Edge Function** (preferred if team is comfortable with Deno/TS).
2. Cloudflare Worker (if already using Cloudflare; requires separate plan).
3. Self-hosted small service in the existing Go binary (adds attack surface to desktop app; **avoid**).
4. GitHub Actions-based processing (not realtime enough for Stripe webhooks).

**Decision: Supabase Edge Function for v1** because auth/data already live in Supabase, reducing network latency and operational complexity.

### Edge Function responsibilities

- Verify Stripe webhook signature using `STRIPE_WEBHOOK_SECRET` (Supabase secret).
- Upsert `stripe_customers`, `stripe_subscriptions`, `user_entitlements` using service-role key.
- Return `200 OK` to Stripe immediately; enqueue Discord role sync via Supabase Queue or outgoing HTTP if needed.
- Log all events to `license_events` for audit trail.

### Why Supabase Edge Function

- Co-located with the database (no cross-region latency).
- Service-role key stays within Supabase network — never exposed to the app.
- No additional infrastructure to manage.
- Stripe webhook signature verification uses standard Supabase secrets.
- Free tier covers expected webhook volume for beta.

### Options discarded

- **Self-hosted in Go binary**: adds attack surface to the desktop app, requires the desktop app to be running for webhook processing, not suitable for Stripe's retry-when-fail semantics.
- **Cloudflare Worker**: viable but adds a second platform to manage; Supabase is already the auth/data provider.
- **GitHub Actions**: polling-based, not real-time enough for Stripe webhooks (Stripe expects a 5-second response window and immediate retries).

## Stripe Dashboard Setup (Manual)

1. Create products and prices in Stripe Dashboard (both beta and release tiers).
2. Enable Stripe Customer Portal for subscription management.
3. Configure webhook endpoint pointing to the deployed Supabase Edge Function URL.
4. Add webhook signing secret (`STRIPE_WEBHOOK_SECRET`) to Supabase secrets.
5. Configure price IDs in Edge Function environment variables (mapping `price_id` → `product_key[]`).
