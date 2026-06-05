# Sprint 5b — QA Evidence & Phase Close

Date: 2026-06-05  
Status: **COMPLETED**

## Automated verification

| Check | Result |
|-------|--------|
| `pnpm test` (monorepo) | PASS — see `full-test-suite.log` |
| `pnpm typecheck` | PASS — see `typecheck.log` |
| LMU bun tests (parser, edge, integration, benchmark, fixture) | 39 pass — see `task19-benchmark.log` |
| `@vantare/desktop` REST client tests | 2 pass (`lmu-rest-client.test.ts`) |
| `@vantare/desktop` adapter integration | 2 pass (`lmu-adapter.integration.test.ts`) |

## T17 — Real fixture policy

- Test: `packages/sim-core/src/__tests__/lmu-fixture.test.ts`
- Fixture files: `test-data/lmu-fixture.bin` + `.json` (gitignored, local only)
- CI: test **skips** when fixture absent
- Verified locally: Fuji Speedway, 15 vehicles, parser matches Python sidecar

## T13 — REST client

- Implementation: `apps/desktop/src/main/sim/adapters/lmu-rest-client.ts`
- Endpoints: RepairAndRefuel, sessions/weather, strategy/usage
- Unit tests mock `fetch` for all three endpoints + error tolerance

## Hub smoke (renderer)

- `SimSwitcher.static.test.tsx` — verifies `lmu` appears in sim dropdown
- `lmu-adapter.integration.test.ts` — adapter metadata + parser → normalizer path

## Electron smoke (optional)

Spec: `apps/desktop/e2e/sprint5b-lmu.spec.ts` (requires vite renderer alias for `@vantare/ui-core/themes` in playwright webServer)

```bash
pnpm --filter @vantare/desktop build
pnpm exec playwright test e2e/sprint5b-lmu.spec.ts
```

## File layout (deduplicated)

Canonical adapter files live only under `apps/desktop/src/main/sim/adapters/`:

- `lmu-adapter-v2.ts` (primary, wired in `createAdapter`)
- `lmu-rest-client.ts`
- `lmu-adapter-v1-skeleton.ts` (archived)

## Tools

- `tools/ingeniero_path.py` — resolves sibling `Vantare-Ingeniero` on Desktop
- `tools/dump-lmu-memory.py` — generates local fixtures (requires LMU on track)
