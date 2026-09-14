# Licensing And Authentication Architecture

> **Ámbito documental (2026-09-14):** Diseño histórico de Release 02; no expresa el estado de ejecución de Clerk/Billing ni autoriza una migración.
> [Referencia vigente](vantare-program/handoffs/platform-commercial.md).


> Scope: Release 02 — Stripe, Supabase, auth and online licensing.
> Status: design-only (no production code yet).
> Date: 2026-06-26.

## Goals

- Mandatory account login before using the app after onboarding.
- Stripe direct subscription billing.
- Online license validation with a 24-hour offline grace period.
- One active PC per license; reset flow recoverable without manual support.
- No hardcoded secrets in the app binary or repository.

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

## Failure Modes

| Failure | App Behavior | Admin/User Recovery |
|---|---|---|
| Supabase down at login | Show "servicio de cuenta no disponible", allow retry. | User retries later. |
| Stripe down at checkout | Show "pasarela no disponible", keep selection. | User retries later. |
| License server down after active | Enter `grace` for 24h. | Auto-recover when online. |
| Clock tampering (local backdate) | Detect monotonic drift via `lastValidatedAt` > current UTC; flag `expired`. | User must go online to revalidate. |
| Device lost/broken | User uses reset-device in app or portal; old fingerprint invalidated. | One reset per 24h rate limit. |
| Webhook delayed | Cache + explicit revalidation on startup covers gap. | Auto-heals on next validation. |

## Component Map

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React/TypeScript)                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │Login     │  │Paywall   │  │Settings / Account    │  │
│  │Screen    │  │/Plans    │  │(billing, device,     │  │
│  │          │  │          │  │ license state,       │  │
│  │          │  │          │  │ logout)              │  │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘  │
│       │             │                   │               │
│       └─────────────┼───────────────────┘               │
│                     │ useLicense() hook                 │
│                     │ gates routes by state             │
└─────────────────────┼───────────────────────────────────┘
                      │ Wails events (license:changed)
┌─────────────────────┼───────────────────────────────────┐
│  Go App (Wails)     │                                   │
│  ┌──────────────────▼──────────────────────────────┐    │
│  │ LicenseService (internal/license)                │    │
│  │  - Validate(ctx, sessionToken) → Result          │    │
│  │  - HasEntitlement(ctx, sessionToken, e) → bool   │    │
│  │  - ResetDevice(ctx, sessionToken) → error        │    │
│  │  - LoadCache() / SaveCache(...)                  │    │
│  │  - Cache-first, online-fallback, 5s timeout      │    │
│  └──────────────────┬───────────────────────────────┘    │
│                     │                                    │
│                     │ HTTPS (Supabase Go API client)     │
└─────────────────────┼───────────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────────┐
│  Supabase           │                                   │
│  ┌──────────────────▼──────────────────────────────┐    │
│  │ Postgres: profiles, user_entitlements, devices, │    │
│  │ license_events, stripe_customers,               │    │
│  │ stripe_subscriptions                            │    │
│  └──────────────────┬───────────────────────────────┘    │
│                     │                                    │
│  RLS: user sees own rows; service-role writes via EF     │
└─────────────────────┼───────────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────────┐
│  Supabase Edge Fn   │  (Stripe webhook handler)         │
│  ┌──────────────────▼──────────────────────────────┐    │
│  │ Verify Stripe signature → upsert entitlements,   │    │
│  │ customers, subscriptions → emit Discord role     │    │
│  │ sync job                                         │    │
│  └──────┬───────────────────────────────────────────┘    │
│         │ incoming webhook                              │
│         ▼                                                │
│  ┌──────────────┐                                        │
│  │ Stripe       │                                        │
│  │ (checkout,   │                                        │
│  │ subscriptions,│                                       │
│  │ invoices)    │                                        │
│  └──────────────┘                                        │
└───────────────────────────────────────────────────────────┘
```

## Event Flow

1. User opens app → `LicenseService.LoadCache()` → gate by cached state.
2. If no valid cache, frontend shows Login screen.
3. User logs in via Supabase Auth (email/password or OAuth).
4. Supabase returns session token (JWT).
5. Frontend sends JWT to `LicenseService.Validate()`.
6. LicenseService calls Supabase DB (with JWT) to read entitlements and device row.
7. If entitlements active and device matches → `active`, cache written.
8. If entitlements active but no device registered → register device, cache written.
9. If entitlements active but device mismatch → `device-limit`.
10. If entitlements absent → `authenticated-no-entitlement`, frontend shows paywall.
11. User clicks Subscribe → Stripe Checkout in browser.
12. Stripe sends `checkout.session.completed` → Edge Function writes entitlements.
13. User returns to app → revalidation → `active`.
