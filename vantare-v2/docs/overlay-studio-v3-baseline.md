# Overlay Studio V3 baseline — 2026-07-10

## Revision

- Branch and commit: `refactor` @ `b2326e3`
- Worktree: `C:\Users\isaac\emdash\worktrees\vantare-v2\refactor`
- Worktree before checks: 11 plan files untracked under `docs/superpowers/plans/2026-07-10-overlay-studio-rebuild-*`; no lockfile changes after `pnpm install --frozen-lockfile`
- Tooling: `pnpm 9.1.0`, `go1.26.4 windows/amd64`

## Frontend

- **Test:** `pnpm --dir vantare-v2/frontend test` → exit 0 — **162** test files, **1551** tests passed (25.03s)
- **Build:** `pnpm --dir vantare-v2/frontend build` → exit 0 (`tsc -b && vite build`, built in 585ms)
- **Lint:** `pnpm --dir vantare-v2/frontend lint` → exit 1 — **11** pre-existing ESLint errors:
  - `@typescript-eslint/no-unused-vars` in `CalendarDayView.tsx`, `CalendarRaceRail.tsx`, `CalendarWeekView.tsx`, `wails-runtime-topbar-mock.ts`
  - `react-refresh/only-export-components` in `chain-store.tsx`, `HubApp.tsx`
  - `react-hooks/refs` in `chain-store.tsx` (ref access during render)

## Go

- **Focused packages:** `go test ./pkg/config/... ./internal/app/... ./internal/window/...` → exit 0 (cached)
- **Focused + server (plan command):** `go test ./pkg/config/... ./internal/app/... ./internal/server/... ./internal/window/...` → exit 1 — `internal/server` FAIL (port bind collision + auth nonce tests)
- **Full suite:** `go test ./...` → exit 1 — same `internal/server` failures; all other listed packages PASS

### `internal/server` pre-existing failures (2026-07-10)

| Test | Failure |
|------|---------|
| `TestAuthTokenRejectsMissingNonce` | POST `/auth/token` missing nonce = 200, want 401 |
| `TestAuthTokenRejectsInvalidNonce` | POST `/auth/token` invalid nonce = 200, want 401 |
| `TestAuthTokenRejectsReusedNonce` | reused nonce = 200, want 401 |
| (suite teardown) | `listen tcp 127.0.0.1:<port>: bind: Only one usage of each socket address` |

## Known legacy defects intentionally not protected

- Mock selector does not alter PreviewCanvas data.
- Saved slots/columnGroups may not affect current renderers.
- Conditional visibility editing and runtime consumption diverge.
- Widget catalog and renderer maps diverge.
- Empty widget arrays are rejected by SaveProfileState.
- Inspector uses local drafts and duplicate design surfaces.

## Gate

Later phases may preserve valid user behavior but must not reproduce the listed defects.