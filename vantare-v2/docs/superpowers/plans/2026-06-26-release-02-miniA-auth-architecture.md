# Release 02 Mini-Plan A — Auth, Supabase And Stripe Architecture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Design the complete authentication, payment and online-licensing architecture for Vantare Simracing Suite before writing production code.

**Architecture:** Supabase owns user identity, sessions and entitlements. Stripe direct owns products, prices, checkout, subscriptions and invoices. A Go `internal/license` package validates entitlement online, caches the last valid state locally with a 24-hour grace period, and exposes typed license states to the rest of the app. A backend webhook (deploy target decided in this plan) receives Stripe events and writes entitlement updates to Supabase. The frontend renders a login gate, license banners and a settings panel with read-only data from the Go service.

**Tech Stack:** Go/Wails v3, React/TypeScript, Supabase (Auth + Postgres), Stripe API + webhooks, local JSON cache, Go tests, Vitest, GitHub Actions, Markdown docs.

---

## File structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `docs/licensing-auth-architecture.md` | Threat model, account states, device fingerprint, offline behavior, failure modes, component map, event flow. |
| Create | `docs/supabase-schema-release.md` | Tables, columns, RLS policies, migrations, service-role paths, webhook update paths. |
| Create | `docs/stripe-integration-plan.md` | Products/prices, webhook events, entitlement mapping, Discord role sync contract. |
| Create | `docs/license-service-contract.md` | Go `LicenseService` public interface, typed states, methods, error types, observability. |
| Create | `docs/auth-ui-flow.md` | Login/logout/settings screens, license banners, onboarding integration. |
| Modify | `docs/release-roadmap-execution-index.md` | Record architecture decisions and Mini-Plan B dependency if any. |
| Modify | `docs/current-plan.md` | Update current objective to "Release 02 Mini-Plan A: architecture review". |

**Forbidden files in this mini-plan:**
- `cmd/vantare/main.go` (no wiring yet).
- `frontend/src/**` (no UI code yet, only UI flow doc).
- `pkg/config/profile.go` and `frontend/src/lib/profile.ts` (no schema changes).
- Any telemetry, OBS, LayoutStudio, WidgetStudio runtime files.
- Any build/package config changes.
- Any new Go/TypeScript dependencies.

---

### Task 1: Read existing context and constraints

**Files:**
- Read: `AGENTS.md`
- Read: `docs/current-plan.md`
- Read: `docs/release-roadmap-execution-index.md`
- Read: `docs/superpowers/plans/2026-06-26-release-02-stripe-supabase-licensing.md`
- Read: `cmd/vantare/main.go` (first 100 lines and service registration area around line 247)
- Read: `internal/app/settings_service.go` (to understand local settings persistence pattern)
- Read: `go.mod` (confirm no Supabase/Stripe deps yet)

- [ ] **Step 1: Read the 8 files above and take notes.**

Expected notes:
- AGENTS.md forbids new dependencies without approval and forbids architecture redesign without approval.
- `release-02-*` plan mandates Stripe direct + Supabase + mandatory login + 24h grace + one active PC.
- `settings_service.go` uses a single JSON file per path and `EventEmitter` for change notifications.
- `main.go` registers services with `wailsApp.RegisterService(application.NewService(svc))`.
- `go.mod` does not contain `supabase-community/supabase-go`, `stripe/stripe-go` or similar.

- [ ] **Step 2: Verify no auth/license/stripe/supabase files exist yet.**

Run:
```powershell
Get-ChildItem -Recurse -File -Path "internal","frontend\src","pkg","cmd" |
  Where-Object { $_.Name -match "auth|license|stripe|supabase|entitlement" } |
  Select-Object -ExpandProperty FullName
```

Expected: empty output.

---

### Task 2: Write the threat model and architecture document

**Files:**
- Create: `docs/licensing-auth-architecture.md`

- [ ] **Step 1: Write the document header and goals.**

Create `docs/licensing-auth-architecture.md` with the exact front matter:

```markdown
# Licensing And Authentication Architecture

> Scope: Release 02 — Stripe, Supabase, auth and online licensing.
> Status: design-only (no production code yet).
> Date: 2026-06-26.

## Goals

- Mandatory account login before using the app after onboarding.
- Stripe direct subscription billing.
- Online license validation with a 24-hour offline grace period.
- One active PC per license; reset flow recoverable without manual support.
- No hardcoded secrets in the app binary or repository.
```

- [ ] **Step 2: Define account states and transitions.**

Append to `docs/licensing-auth-architecture.md`:

```markdown
## Account States

| State | Meaning | UX Treatment | Runtime Block |
|---|---|---|---|
| `anonymous` | Onboarding not started or login skipped. | Show login screen. | All premium modules blocked. |
| `authenticated-no-entitlement` | Logged in but no active subscription. | Show paywall / plans. | All premium modules blocked. |
| `active` | Valid subscription and device registered. | Normal app. | None. |
| `grace` | Subscription valid but device offline > grace start, or license server unreachable. | Warning banner + countdown. | Premium modules still work until grace expires. |
| `expired` | Subscription ended or grace expired. | Full blocker with renew link. | All premium modules blocked. |
| `device-limit` | Another PC is active and limit reached. | Dialog to reset device or contact support. | All premium modules blocked. |

## State Transitions

- `anonymous` → `authenticated-no-entitlement` on successful Supabase login.
- `authenticated-no-entitlement` → `active` on Stripe checkout completion.
- `active` → `grace` when online validation fails for up to 24 hours.
- `grace` → `expired` after 24 hours without successful validation.
- `active` → `device-limit` when a second PC tries to register while one is already active.
- `expired` → `active` on renewal webhook or explicit revalidation.
```

- [ ] **Step 3: Define device fingerprint approach.**

Append:

```markdown
## Device Fingerprint

- Fingerprint is computed in Go and sent at license validation time.
- Inputs (non-invasive):
  - Windows machine GUID from registry (`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`).
  - CPU feature flags hash (not serial).
  - Local app data directory path hash.
- The fingerprint is **not stored locally as a secret**; it is recomputed each validation.
- Supabase stores the current active fingerprint per user.
- Reset device sets `active_fingerprint` to NULL; next validation writes the new fingerprint.
- Two devices cannot share the same active fingerprint at the same time.
```

- [ ] **Step 4: Define local cache and offline behavior.**

Append:

```markdown
## Local Cache And Offline Behavior

- Cache file: `{cfgDir}/license-cache.json`.
- Contents (encrypted at rest using DPAPI on Windows, plaintext JSON on other platforms for this release):
  - `userId`, `email`, `entitlements[]`, `activeFingerprint`, `lastValidatedAt`, `expiresAt`, `graceStartedAt`.
- On startup:
  1. Read cache.
  2. If `expiresAt` is in the future → state `active`.
  3. If `expiresAt` is past but `graceStartedAt` + 24h is in the future → state `grace`.
  4. Else → state `expired`.
- On every online validation success, rewrite cache with fresh timestamps.
- Grace is only entered when the device **previously validated successfully** and then goes offline. A fresh install with no cache cannot enter grace.
```

- [ ] **Step 5: Define failure modes and recovery.**

Append:

```markdown
## Failure Modes

| Failure | App Behavior | Admin/User Recovery |
|---|---|---|
| Supabase down at login | Show "servicio de cuenta no disponible", allow retry. | User retries later. |
| Stripe down at checkout | Show "pasarela no disponible", keep selection. | User retries later. |
| License server down after active | Enter `grace` for 24h. | Auto-recover when online. |
| Clock tampering (local backdate) | Detect monotonic drift via `lastValidatedAt` > current UTC; flag `expired`. | User must go online to revalidate. |
| Device lost/broken | User uses reset-device in app or portal; old fingerprint invalidated. | One reset per 24h rate limit. |
| Webhook delayed | Cache + explicit revalidation on startup covers gap. | Auto-heals on next validation. |
```

- [ ] **Step 6: Commit the architecture document.**

Run:
```powershell
git add docs/licensing-auth-architecture.md
```

---

### Task 3: Design the Supabase schema

**Files:**
- Create: `docs/supabase-schema-release.md`

- [ ] **Step 1: Write the schema plan header.**

Create `docs/supabase-schema-release.md`:

```markdown
# Supabase Schema Plan — Release 02

> Date: 2026-06-26.
> Scope: users, entitlements, devices, Stripe customers/subscriptions, license events.
> Status: design-only; migrations will be created in Mini-Plan B.
```

- [ ] **Step 2: Define tables and columns.**

Append:

```markdown
## Tables

### `public.profiles`

One row per Supabase Auth user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `auth.users.id` reference, RLS user can read own. |
| `email` | text | Synced from Auth, read-only to user. |
| `created_at` | timestamptz | Default now(). |
| `updated_at` | timestamptz | Default now(). |
| `language` | text | `es` or `en`; app can update own. |
| `primary_simulator` | text | Optional, app-owned. |
| `onboarding_completed` | boolean | Default false. |

### `public.user_entitlements`

Single source of truth for what a user can access.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Default gen_random_uuid(). |
| `user_id` | uuid FK profiles | RLS user can read own. |
| `product_key` | text | `overlays`, `engineer`, `bundle`, `beta_access`, etc. |
| `status` | text | `active`, `cancelled`, `past_due`, `grace`, `expired`. |
| `expires_at` | timestamptz | NULL means no expiration. |
| `created_at` | timestamptz | Default now(). |
| `updated_at` | timestamptz | Default now(). |
| `metadata` | jsonb | Stripe subscription id, price id, etc. |

### `public.devices`

Tracks active device per user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Default gen_random_uuid(). |
| `user_id` | uuid FK profiles | Unique per user (one active PC). |
| `fingerprint_hash` | text | Hash of device fingerprint. |
| `first_seen_at` | timestamptz | Default now(). |
| `last_seen_at` | timestamptz | Default now(). |
| `reset_count_24h` | int | Default 0; used for rate limit. |

### `public.license_events`

Audit trail of validation events for support/debug.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Default gen_random_uuid(). |
| `user_id` | uuid FK profiles | Indexed. |
| `event_type` | text | `validate`, `device_reset`, `checkout_complete`, `grace_enter`, `grace_expire`. |
| `payload` | jsonb | Result, fingerprint, error. |
| `created_at` | timestamptz | Default now(). |

### `public.stripe_customers`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Default gen_random_uuid(). |
| `user_id` | uuid FK profiles | Unique. |
| `stripe_customer_id` | text | Unique, indexed. |
| `created_at` | timestamptz | Default now(). |

### `public.stripe_subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Default gen_random_uuid(). |
| `user_id` | uuid FK profiles | Indexed. |
| `stripe_subscription_id` | text | Unique. |
| `stripe_price_id` | text | Indexed. |
| `status` | text | Stripe status (`active`, `canceled`, `past_due`, etc.). |
| `current_period_start` | timestamptz | |
| `current_period_end` | timestamptz | |
| `cancel_at_period_end` | boolean | |
| `created_at` | timestamptz | Default now(). |
| `updated_at` | timestamptz | Default now(). |
```

- [ ] **Step 3: Define RLS policies and service-role paths.**

Append:

```markdown
## Row Level Security

- All tables have RLS enabled.
- `profiles`: user can SELECT/UPDATE own row only (`auth.uid() = id`).
- `user_entitlements`: user can SELECT own rows.
- `devices`: user can SELECT own row only; update via service role.
- `license_events`: user can SELECT own rows (limited to last 30 days).
- `stripe_customers` / `stripe_subscriptions`: user can SELECT own rows only.

## Service-Role Paths

- Stripe webhook backend uses Supabase service-role key to write:
  - `user_entitlements`
  - `stripe_subscriptions`
  - `stripe_customers`
- App Go `LicenseService` uses user's JWT to read own entitlements and devices.
- Device reset uses a Supabase Edge Function or backend endpoint with service-role key.
```

- [ ] **Step 4: Commit the schema document.**

Run:
```powershell
git add docs/supabase-schema-release.md
```

---

### Task 4: Design the Stripe integration plan

**Files:**
- Create: `docs/stripe-integration-plan.md`

- [ ] **Step 1: Write the Stripe plan header and products.**

Create `docs/stripe-integration-plan.md`:

```markdown
# Stripe Integration Plan — Release 02

> Date: 2026-06-26.
> Scope: products, prices, checkout, webhooks, entitlement mapping, Discord role sync.
> Status: design-only; code in Mini-Plan B.

## Products And Prices

### Release Tiers (after beta)

| Product | Price (monthly) | Product Key |
|---|---|---|
| Vantare Overlays | 5 EUR | `overlays` |
| Vantare Engineer | 5 EUR | `engineer` |
| Vantare Bundle (Overlays + Engineer) | 8.99 EUR | `bundle` |
| Assetto Corsa Lua/CSP Pack | 20 EUR one-time | `ac_lua_pack` |

### Beta Tiers (first 6 months)

| Product | Price (monthly) | Product Key | Benefit |
|---|---|---|---|
| Beta Access | 5 EUR | `beta_access` | Overlays + Engineer during beta |
| Supporter | 10 EUR | `supporter` | Above + badge |
| Founder | 20 EUR | `founder` | Above + AC Lua Pack while subscribed |
| Pro Founder | 35 EUR | `pro_founder` | Above |
| Visionary Backer | 50 EUR | `visionary_backer` | Above |

Each tier maps to one or more `product_key` entitlements stored in Supabase.
```

- [ ] **Step 2: Define webhook events and entitlement mapping.**

Append:

```markdown
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
```

- [ ] **Step 3: Commit the Stripe document.**

Run:
```powershell
git add docs/stripe-integration-plan.md
```

---

### Task 5: Define the Go LicenseService public contract

**Files:**
- Create: `docs/license-service-contract.md`

- [ ] **Step 1: Write the contract document.**

Create `docs/license-service-contract.md`:

```markdown
# License Service Contract

> Scope: Go package `internal/license` for Release 02.
> Status: design-only; implementation in Mini-Plan B.

## Types

```go
package license

import "context"

type Entitlement string

const (
    EntitlementOverlays   Entitlement = "overlays"
    EntitlementEngineer   Entitlement = "engineer"
    EntitlementBundle     Entitlement = "bundle"
    EntitlementBetaAccess Entitlement = "beta_access"
    EntitlementACLuaPack  Entitlement = "ac_lua_pack"
)

type State string

const (
    StateAnonymous                State = "anonymous"
    StateAuthenticatedNoEntitlement State = "authenticated-no-entitlement"
    StateActive                   State = "active"
    StateGrace                    State = "grace"
    StateExpired                  State = "expired"
    StateDeviceLimit              State = "device-limit"
)

type Result struct {
    State         State
    Entitlements  []Entitlement
    UserID        string
    Email         string
    DeviceOK      bool
    GraceEndsAt   *time.Time
    LastValidated time.Time
    Error         error
}
```

## Service Interface

```go
type Service struct {
    cfg      Config
    cache    *cache
    supabase SupabaseClient // interface
    fingerprint func() (string, error)
}

type Config struct {
    SupabaseURL        string
    SupabaseAnonKey    string
    GracePeriod        time.Duration // 24h
    CachePath          string
}

func NewService(cfg Config, fingerprint func() (string, error)) *Service
func (s *Service) Validate(ctx context.Context, sessionToken string) (*Result, error)
func (s *Service) HasEntitlement(ctx context.Context, sessionToken string, e Entitlement) (bool, error)
func (s *Service) ResetDevice(ctx context.Context, sessionToken string) error
func (s *Service) LoadCache() error
func (s *Service) SaveCache(state State, entitlements []Entitlement, expiresAt time.Time) error
```

## Rules

- `Validate` reads cache first, then calls Supabase if online.
- If Supabase is reachable and device matches → `active`, rewrite cache.
- If Supabase unreachable but cache is valid or within grace → `grace`.
- If cache expired and Supabase unreachable → `expired`.
- `ResetDevice` requires service-role backend endpoint; the service only calls it.
- All network calls use `context.WithTimeout` (5s default).
- No secrets in error messages surfaced to UI.
```

- [ ] **Step 2: Commit the contract document.**

Run:
```powershell
git add docs/license-service-contract.md
```

---

### Task 6: Design the frontend auth and license UI flow

**Files:**
- Create: `docs/auth-ui-flow.md`

- [ ] **Step 1: Write the UI flow document.**

Create `docs/auth-ui-flow.md`:

```markdown
# Auth And License UI Flow

> Scope: Release 02 frontend screens and banners.
> Status: design-only; implementation in Mini-Plan C.

## Screens

### 1. Login screen

- Shown on first run after onboarding, or when session is missing/invalid.
- Email/password form.
- Google and Discord OAuth buttons (only if Supabase config supports them).
- Link to "Crear cuenta" that opens browser to Supabase/auth page or Stripe checkout.
- No premium content accessible from this screen.

### 2. Paywall / select plan

- Shown when `state = authenticated-no-entitlement`.
- Lists beta tiers and release tiers from Stripe prices.
- "Subscribe" button opens Stripe Checkout in browser or embedded (decision: browser for v1).
- Shows current entitlements if any.

### 3. License banner

- Sticky top banner when `state = grace` or `state = expired`.
- Grace: countdown to expiration + "Revalidar" button.
- Expired: blocker + "Renovar" button.
- Device-limit: dialog.

### 4. Settings / Account

- Shows logged-in email, active plan, renewal date, active device fingerprint hash (truncated).
- Button to reset device.
- Button to logout.
- Button to open Stripe Customer Portal for billing/invoices.

## State Propagation

- Go `LicenseService` exposes state via Wails events (`license:changed`).
- Frontend root holds state and gates routes.
- Overlays Studio, Engineer and Setup remain unaware of auth details; they consume `useLicense()` hook.

## Onboarding Integration

- After onboarding step "choose simulator", insert step "login" if no session.
- After login, insert step "choose plan" if no entitlement.
- Only then proceed to recommended profile selection.
```

- [ ] **Step 2: Commit the UI flow document.**

Run:
```powershell
git add docs/auth-ui-flow.md
```

---

### Task 7: Decide deployment target for the webhook backend

**Files:**
- Read: `.github/workflows/*.yml` (to see existing CI/deployment targets)
- Modify: `docs/stripe-integration-plan.md`

- [ ] **Step 1: Inventory existing deployment infrastructure.**

Run:
```powershell
Get-ChildItem -File -Path ".github\workflows" | Select-Object -ExpandProperty Name
```

Expected: list existing workflow files.

- [ ] **Step 2: Document deployment decision.**

Append to `docs/stripe-integration-plan.md`:

```markdown
## Webhook Deployment Target

Options:
1. Supabase Edge Function (preferred if team is comfortable with Deno/TS).
2. Cloudflare Worker (if already using Cloudflare; requires separate plan).
3. Self-hosted small service in the existing Go binary (adds attack surface to desktop app; **avoid**).
4. GitHub Actions-based processing (not realtime enough for Stripe webhooks).

Decision: **Supabase Edge Function** for v1 because auth/data already live in Supabase.

### Edge Function responsibilities
- Verify Stripe webhook signature using `STRIPE_WEBHOOK_SECRET` (Supabase secret).
- Read/checkout Upsert `stripe_customers`, `stripe_subscriptions`, `user_entitlements` using service-role key.
- Return `200 OK` to Stripe immediately; enqueue Discord role sync via Supabase Queue or outgoing HTTP if needed.
```

- [ ] **Step 3: Commit the updated Stripe document.**

Run:
```powershell
git add docs/stripe-integration-plan.md
```

---

### Task 8: Update roadmap and current plan

**Files:**
- Modify: `docs/release-roadmap-execution-index.md`
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Record Mini-Plan A completion and Mini-Plan B dependency.**

Append a short note to `docs/release-roadmap-execution-index.md` inside the Release 02 section (add it after the Release 02 link line if a section does not exist yet):

```markdown
### Release 02 — Mini-Plan tracking

- Mini-Plan A (architecture + Supabase schema + Stripe plan): design-only, requires GLM review before Mini-Plan B.
- Mini-Plan B (Go LicenseService + webhook backend): blocked until Mini-Plan A accepted.
- Mini-Plan C (frontend auth/license UI): blocked until Mini-Plan B accepted.
```

- [ ] **Step 2: Update current objective.**

Edit `docs/current-plan.md` current objective block to:

```markdown
## Objetivo actual

Release 02 Mini-Plan A: cerrar la arquitectura de auth, Supabase schema y Stripe integration plan, y obtener review GLM antes de escribir código de producción.
```

- [ ] **Step 3: Commit planning updates.**

Run:
```powershell
git add docs/release-roadmap-execution-index.md docs/current-plan.md
```

---

### Task 9: Final commit and handoff

- [ ] **Step 1: Run `git diff --check`.**

Run:
```powershell
git diff --check
```

Expected: no errors (warnings about CRLF in files from other agents are acceptable).

- [ ] **Step 2: Run the docs-only checks.**

Run:
```powershell
gofmt -l internal/app/*.go cmd/vantare/main.go  # should be empty
git status --short
```

Expected: only the 7 new/modified doc files staged; no Go/TS code changes.

- [ ] **Step 3: Commit all planning documents.**

Run:
```powershell
git commit -m "docs(release-02): auth, Supabase schema and Stripe integration architecture

- Add licensing-auth-architecture.md with threat model, states, device fingerprint and failure modes.
- Add supabase-schema-release.md with tables, RLS and service-role paths.
- Add stripe-integration-plan.md with products, prices, webhooks and entitlement mapping.
- Add license-service-contract.md with Go Service interface and typed states.
- Add auth-ui-flow.md with login, paywall, banners and onboarding integration.
- Update release-roadmap-execution-index.md and current-plan.md with Mini-Plan A tracking.

No production code, no dependencies, no schema changes."
```

Expected output: commit hash.

---

## Acceptance criteria

- [ ] `docs/licensing-auth-architecture.md` exists and covers states, fingerprint, cache, grace, failure modes.
- [ ] `docs/supabase-schema-release.md` exists and covers all 6 tables, RLS and service-role paths.
- [ ] `docs/stripe-integration-plan.md` exists and covers products/prices, webhook events, entitlement mapping and deployment target.
- [ ] `docs/license-service-contract.md` exists and covers Go `Service` interface, `Validate`, `HasEntitlement`, `ResetDevice`.
- [ ] `docs/auth-ui-flow.md` exists and covers login, paywall, banners, settings and onboarding.
- [ ] No Go/TypeScript source files modified.
- [ ] No new dependencies added.
- [ ] `git diff --check` passes.
- [ ] GLM review scheduled/requested before Mini-Plan B.

## Checks

- `git diff --check`
- `gofmt -l internal/app/*.go cmd/vantare/main.go` (should be empty)
- `pnpm --dir frontend exec tsc -b --noEmit` (should pass because no TS files changed)
- `git status --short` (only doc files staged)

## Worker prompt

```markdown
Implement Release 02 Mini-Plan A from docs/superpowers/plans/2026-06-26-release-02-miniA-auth-architecture.md.
This is design-only: write docs, do not write production code.
Do not add dependencies.
Do not modify Go/TypeScript source files.
Run the checks listed in the plan and report results.
```
