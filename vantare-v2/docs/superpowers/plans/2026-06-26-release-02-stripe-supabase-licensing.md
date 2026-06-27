# Release 02 - Stripe, Supabase, Auth And Licensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mandatory account login, Stripe-backed subscriptions, and online license validation with a 24h grace period.

**Architecture:** Supabase owns users/auth/session data. Stripe direct owns payments/subscriptions. The app validates entitlement online, caches last valid state locally, and blocks premium runtime after the grace period.

**Tech Stack:** Go/Wails, React/TypeScript, Supabase, Stripe API/webhooks, local encrypted/session storage, Go tests.

---

## Decisions

- Provider: Stripe direct.
- Auth provider: Supabase.
- Login mandatory.
- Login methods: email/password, Google, Discord where viable.
- License validation online required.
- Grace period: 24 hours with warning.
- One active PC per license.
- PC reset from portal if viable; otherwise app/backend flow.
- Plans:
  - Overlays 5 EUR/month.
  - Engineer 5 EUR/month.
  - Bundle 8.99 EUR/month.
  - Beta tiers remain for first 6 months.
- Stripe beta tiers:
  - Beta Access 5 EUR/month.
  - Supporter 10 EUR/month.
  - Founder 20 EUR/month.
  - Pro Founder 35 EUR/month.
  - Visionary Backer 50 EUR/month.

## Miniplans

### Task 1: Architecture and threat model

- [ ] Create `docs/licensing-auth-architecture.md`.
- [ ] Define account states: anonymous, authenticated-no-entitlement, active, grace, expired, device-limit.
- [ ] Define device fingerprint approach with no invasive hardware collection.
- [ ] Define local cache contents and expiration.
- [ ] Define exact offline behavior after 24h.
- [ ] Define failure mode if Supabase/Stripe is down.
- [ ] GLM review before implementation.

### Task 2: Supabase schema plan

- [ ] Define tables:
  - `profiles`;
  - `user_entitlements`;
  - `devices`;
  - `license_events`;
  - `stripe_customers`;
  - `stripe_subscriptions`.
- [ ] Define RLS policies.
- [ ] Define migrations.
- [ ] Define service-role-only webhook update paths.
- [ ] Create `docs/supabase-schema-release.md`.

### Task 3: Stripe integration plan

- [ ] Define Stripe products/prices for beta tiers and release tiers.
- [ ] Define webhook events:
  - `checkout.session.completed`;
  - `customer.subscription.created`;
  - `customer.subscription.updated`;
  - `customer.subscription.deleted`;
  - `invoice.payment_failed`.
- [ ] Define entitlement mapping:
  - overlays;
  - engineer;
  - bundle;
  - beta role;
  - founder role;
  - AC Lua pack benefit.
- [ ] Define Discord role sync contract.

### Task 4: App auth UI

- [ ] Add login screen before main app if no valid session.
- [ ] Add email/password login.
- [ ] Add Google/Discord buttons if Supabase config supports them.
- [ ] Add logout.
- [ ] Add visible license state in Settings.
- [ ] Add warning banner for grace/expired/device-limit.
- [ ] Tests: login state rendering, expired blocks premium, grace allows limited use.

### Task 5: Go license service

- [ ] Create `internal/license` package.
- [ ] Use context-aware HTTP calls.
- [ ] Cache last valid entitlement locally.
- [ ] Do not hardcode secrets in app.
- [ ] Implement `Validate(ctx)` returning typed states.
- [ ] Implement device registration and device conflict error.
- [ ] Tests table-driven for all states.

### Task 6: Webhook backend

- [ ] Decide deployment target before coding.
- [ ] Implement webhook verifier with Stripe signature validation.
- [ ] Update Supabase entitlement records.
- [ ] Emit Discord role sync event or job.
- [ ] Add integration tests with fixture webhook payloads.

### Task 7: Portal/user account

- [ ] External portal is acceptable.
- [ ] Must show active plan, renewal/cancel link, current device, reset device action.
- [ ] Must delegate billing/invoices to Stripe Customer Portal.
- [ ] Must support Spanish and English.

### Task 8: Release gate

- [ ] Manual test new user purchase.
- [ ] Manual test expired subscription.
- [ ] Manual test 24h grace.
- [ ] Manual test device conflict.
- [ ] Manual test reset device.
- [ ] GLM security review.

## Checks

- `go test ./internal/license/... ./internal/app ./internal/server`
- `go vet ./internal/license/...`
- `pnpm --dir frontend test`
- `pnpm --dir frontend build`
- `git diff --check`

## Acceptance criteria

- App cannot be used without login after onboarding.
- Valid license unlocks correct modules.
- Offline works only inside 24h grace.
- Device limit is enforceable and recoverable.
- No secrets are committed.

## Worker prompt

```markdown
Implement Release 02 in phases. Start with Task 1 architecture only.
Use golang-error-handling, golang-testing, golang-code-style, golang-safety, golang-context.
Do not implement Stripe code before the architecture doc and GLM review are accepted.
```
