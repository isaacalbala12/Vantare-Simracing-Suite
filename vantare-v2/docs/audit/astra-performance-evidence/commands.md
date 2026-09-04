# Command ledger

All timed runs were awaited sequentially; no subagents/background tasks. Output sanitizes workspace paths. CLI logs preserve failures. `commands.jsonl` records argv/cwd/start/seconds/exit. Initial topology commands also used rev-parse/status/remote/worktree/log, gh pr list/API, merge-base, rev-list, cherry and git diff for all 156 PRs; their structured primary outputs are committed. Git range-diff and stable patch-id are retained separately.

| Run | UTC | seconds | exit | command |
|---|---|---:|---:|---|
| install | 2026-09-04T22:02:35.540528+00:00 | 2.698 | 0 | `pnpm install --frozen-lockfile` |
| candidate-bundle | 2026-09-04T22:04:14.143407+00:00 | 4.640 | 0 | `node scripts/performance/measure-bundle.mjs frontend <evidence-temp>/bundle candidate minified` |
| candidate-raw | 2026-09-04T22:04:32.342316+00:00 | 5.454 | 0 | `node scripts/performance/measure-bundle.mjs frontend <evidence-temp>/bundle candidate raw` |
| candidate-typecheck | 2026-09-04T22:04:37.828021+00:00 | 5.149 | 0 | `pnpm --dir frontend typecheck` |
| base-install | 2026-09-04T22:04:57.956439+00:00 | 2.618 | 0 | `pnpm install --frozen-lockfile` |
| base-bundle | 2026-09-04T22:05:00.595941+00:00 | 4.410 | 0 | `node <worktrees>/vantare-isa-978-astra/vantare-v2/scripts/performance/measure-bundle.mjs frontend <evidence-temp>/bundle nightly minified` |
| base-raw | 2026-09-04T22:05:05.030328+00:00 | 5.178 | 0 | `node <worktrees>/vantare-isa-978-astra/vantare-v2/scripts/performance/measure-bundle.mjs frontend <evidence-temp>/bundle nightly raw` |
| candidate-go-bench | 2026-09-04T22:05:32.293790+00:00 | 48.066 | 0 | `go test ./internal/strategy/solver ./internal/engineer/presentation ./internal/engineer/messagepolicy ./internal/engineer/service ./internal/spotter ./internal/radio -run ^$ -bench . -benchmem -benchtime=100ms -count=10` |
| candidate-transport-bench | 2026-09-04T22:06:20.389207+00:00 | 1.237 | 0 | `go test ./internal/app/telemetrytransport -run ^$ -bench . -benchmem -benchtime=100x -count=10` |
| track-map-base | 2026-09-04T22:07:39.734910+00:00 | 6.606 | 0 | `node scripts/performance/measure-track-map.mjs frontend <evidence-temp>/runtime base` |
| candidate-tests | 2026-09-04T22:08:16.114869+00:00 | 30.785 | 0 | `pnpm --dir frontend test` |
| track-map-base-clean | 2026-09-04T22:09:32.302617+00:00 | 6.768 | 0 | `node scripts/performance/measure-track-map.mjs frontend <evidence-temp>/runtime base-clean` |
| track-map-cache | 2026-09-04T22:09:39.092087+00:00 | 0.385 | 0 | `node scripts/performance/measure-track-map.mjs frontend <evidence-temp>/runtime cache track-cache` |
| experiment-edit-lazy | 2026-09-04T22:09:39.497406+00:00 | 3.476 | 0 | `node scripts/performance/measure-bundle.mjs frontend <evidence-temp>/bundle edit-lazy minified edit-lazy` |
| experiment-locale-active | 2026-09-04T22:09:42.993116+00:00 | 3.310 | 0 | `node scripts/performance/measure-bundle.mjs frontend <evidence-temp>/bundle locale-active minified locale-active` |
| react-base | 2026-09-04T22:11:21.235156+00:00 | 7.517 | 0 | `node scripts/performance/measure-react.mjs frontend <evidence-temp>/runtime base` |
| react-cache | 2026-09-04T22:11:59.444291+00:00 | 7.246 | 0 | `node scripts/performance/measure-react.mjs frontend <evidence-temp>/runtime cache track-cache` |
| candidate-build | 2026-09-04T22:12:06.716686+00:00 | 5.266 | 0 | `pnpm --dir frontend build` |
| candidate-go-suite | 2026-09-04T22:12:12.004756+00:00 | 91.923 | 1 | `go test -p 1 ./...` |
| wire-generated | 2026-09-04T22:14:23.695820+00:00 | 0.866 | 0 | `go run ./tools/telemetry-contract-gen -check` |
| tidy-diff | 2026-09-04T22:14:24.590503+00:00 | 0.112 | 0 | `go mod tidy -diff` |
| roadmap-generated | 2026-09-04T22:14:24.724188+00:00 | 0.061 | 0 | `python3 .github/scripts/roadmap_digest.py --repo . --ref origin/nightly --check` |
| wails-bindings | 2026-09-04T22:14:24.804297+00:00 | 0.132 | 0 | `wails3 generate bindings -clean=true` |
| experiment-route-lazy | 2026-09-04T22:15:37.544446+00:00 | 5.938 | 0 | `node scripts/performance/measure-bundle.mjs frontend <evidence-temp>/bundle route-lazy minified route-lazy` |
| candidate-race | 2026-09-04T22:15:43.504169+00:00 | 152.141 | 0 | `go test -race -p 1 ./internal/app/telemetrytransport ./internal/strategy/... ./internal/engineer/... ./internal/spotter ./internal/radio` |
| version-sync | 2026-09-04T22:18:15.676801+00:00 | 0.469 | 0 | `go run build/sync_version.go` |
| candidate-repeat | 2026-09-04T22:23:19.716948+00:00 | 6.355 | 0 | `node scripts/performance/measure-bundle.mjs frontend <evidence-temp>/bundle candidate-repeat minified` |
| storage-bench | 2026-09-04T22:23:57.009504+00:00 | 6.727 | 0 | `go test -p 1 ./scripts/performance/storage-bench -run ^$ -bench . -benchmem -benchtime=100ms -count=10 -cpuprofile <evidence-temp>/storage.cpu -memprofile <evidence-temp>/storage.mem -o <evidence-temp>/storage.test` |
| geometry-defer | 2026-09-04T22:25:21.549857+00:00 | 6.402 | 0 | `node scripts/performance/measure-bundle.mjs frontend <evidence-temp>/bundle geometry-defer minified geometry-defer` |
| pprof-storage | 2026-09-04T22:25:27.978080+00:00 | 0.211 | 0 | `go tool pprof -top <evidence-temp>/storage.cpu` |
| pprof-storage-alloc | 2026-09-04T22:25:28.208259+00:00 | 0.090 | 0 | `go tool pprof -top -alloc_space <evidence-temp>/storage.mem` |
| impl-install | 2026-09-04T22:32:07.228747+00:00 | 2.762 | 0 | `pnpm install --frozen-lockfile` |
| impl-characterization | 2026-09-04T22:33:05.265267+00:00 | 1.895 | 0 | `pnpm --dir frontend exec vitest run src/overlay/widget-types/track-map/track-map-view-model-v2.test.ts` |
| impl-base | 2026-09-04T22:33:07.184251+00:00 | 6.968 | 0 | `node <worktrees>/vantare-isa-978-astra/vantare-v2/scripts/performance/measure-track-map.mjs frontend <evidence-temp>/runtime impl-base` |
| impl-focal | 2026-09-04T22:33:44.098765+00:00 | 0.697 | 0 | `pnpm --dir frontend exec vitest run src/overlay/widget-types/track-map/track-map-view-model-v2.test.ts` |
| impl-head | 2026-09-04T22:33:44.818569+00:00 | 0.404 | 0 | `node <worktrees>/vantare-isa-978-astra/vantare-v2/scripts/performance/measure-track-map.mjs frontend <evidence-temp>/runtime impl-head` |
| impl-tests | 2026-09-04T22:33:45.244399+00:00 | 31.258 | 0 | `pnpm --dir frontend test` |
| impl-typecheck | 2026-09-04T22:34:16.528055+00:00 | 4.945 | 0 | `pnpm --dir frontend typecheck` |
| impl-build | 2026-09-04T22:34:21.495151+00:00 | 5.369 | 0 | `pnpm --dir frontend build` |
| impl-lint | 2026-09-04T22:34:26.889227+00:00 | 11.921 | 0 | `pnpm --dir frontend lint` |
| impl-lint-focal | 2026-09-04T22:34:48.667876+00:00 | 0.619 | 0 | `pnpm --dir frontend exec eslint src/overlay/widget-types/track-map/track-map-view-model-v2.ts src/overlay/widget-types/track-map/track-map-view-model-v2.test.ts` |
| impl-react | 2026-09-04T22:34:49.309190+00:00 | 7.504 | 0 | `node <worktrees>/vantare-isa-978-astra/vantare-v2/scripts/performance/measure-react.mjs frontend <evidence-temp>/runtime impl-head` |
| impl-bundle | 2026-09-04T22:34:56.838244+00:00 | 6.440 | 0 | `node <worktrees>/vantare-isa-978-astra/vantare-v2/scripts/performance/measure-bundle.mjs frontend <evidence-temp>/bundle impl-head minified` |
| impl-nightly-tests | 2026-09-04T22:39:26.908853+00:00 | 28.583 | 0 | `pnpm --dir frontend test` |
| impl-nightly-build | 2026-09-04T22:39:55.519787+00:00 | 5.242 | 0 | `pnpm --dir frontend build` |
| impl-nightly-lint | 2026-09-04T22:40:00.783350+00:00 | 11.611 | 0 | `pnpm --dir frontend lint` |
| impl-nightly-base | 2026-09-04T22:40:52.109921+00:00 | 6.912 | 0 | `node <worktrees>/vantare-isa-978-astra/vantare-v2/scripts/performance/measure-track-map.mjs frontend <evidence-temp>/runtime nightly-base` |
| impl-nightly-head | 2026-09-04T22:40:59.049417+00:00 | 0.438 | 0 | `node <worktrees>/vantare-isa-978-astra/vantare-v2/scripts/performance/measure-track-map.mjs frontend <evidence-temp>/runtime nightly-head` |

## Delivery operations

Issue978 before audit writes → candidate worktree → blind freeze96539f54 → prior reports → issue979 before product edit → worktree/cache characterization/BASE/HEAD → draft980. Stacked-base contract failed; rebase of own changes to nightly, three documentation conflicts resolved against nightly, remeasurement and full checks. Final implementation330d3387, own remote updated with exact force-with-lease80e10d65; main untouched. Implementation worktree clean then removed. Audit delivery rebased to nightly, original blind commit retained/pushed under vantareapp/isa-978-blind-freeze; identical document blob. No merges or promotions.
