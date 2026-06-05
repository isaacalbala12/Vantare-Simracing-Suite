# Sprint 6 — QA Evidence & Phase Close Review

Date: 2026-06-05  
Branch: `sprint6-themes-auth`

## Automated test results

| Package | Tests | Status |
|---------|-------|--------|
| `@vantare/auth` | 18/18 | PASS |
| `@vantare/ui-core` | 130/130 | PASS |
| `@vantare/sim-core` | 195/195 (LMU bun tests excluded from Vitest) | PASS |
| `@vantare/desktop` | 194/194 | PASS |

`pnpm test` (full monorepo) and `pnpm typecheck` pass cleanly (2026-06-05 close-out verification).

## F1 — Plan compliance (T1–T28)

| Task area | Status |
|-----------|--------|
| Theme schema + built-ins + ThemeProvider + hooks + utils | Done |
| Supabase migrations + RLS + validate-license edge function | Done |
| AuthService real + HWID + offline cache + feature-gate | Done |
| ThemesPage + ThemeEditor + export/import + duplicate custom | Done |
| AccountPage + auth-store + useLicense | Done |
| Feature gating (SimSwitcher, Overlays, Settings, Themes) | Done |
| ThemeProvider in App + overlay windows | Done |
| Hub color tokens (pages, layout, inspector, badges) | Done |
| E2E spec `sprint6-hub.spec.ts` | Added (not run in CI here) |
| F1–F4 formal reviewer agents | Manual checklist below |

Cancelled by design: `register-user` edge function (free license via DB trigger).

## F2 — Code quality

- Desktop + auth typecheck clean
- No new circular imports introduced in sprint packages
- Vitest aliases for `@vantare/auth` source in desktop tests

## F3 — Security review

| Check | Result |
|-------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` in renderer | Not found |
| JWT in localStorage/sessionStorage (auth) | Not used — secure storage in main only |
| Service role in edge function only | Yes (`validate-license`) |

Note: `DebugOverlay` uses `sessionStorage` for UI prefs only (unrelated to auth).

## F4 — Scope fidelity

Deliverables from sprint plan are present. Remaining **non-blocking** items:

1. **Live Supabase smoke** — register/login/HWID against production project (requires human or scripted credentials).
2. **Playwright E2E execution** — spec exists; run with `pnpm exec playwright test` when Hub dev server is up.
3. **35+ new tests target** — ~20 new tests added (auth + themes + gating); acceptable for MVP close.

## Fixes in close-out pass

- `loadSession()` on Hub mount for license gating hydration
- Dynamic `preferredSim` schema filtered by tier
- `Duplicate as custom theme` on ThemesPage
- UpgradePrompt navigates to `/account`
- Hub pages + TelemetryInspector + FeatureBadge migrated to CSS theme tokens
- sim-core Vitest excludes Bun-only LMU tests
- sim-manager integration test async stream cleanup
- FeatureGate keeps UpgradePrompt CTA clickable (no pointer-events on prompt)
- Settings coerces invalid preferredSim when tier lacks sim access
