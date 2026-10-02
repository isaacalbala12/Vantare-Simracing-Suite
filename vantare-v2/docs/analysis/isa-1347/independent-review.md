# Revalidation — HEAD `aee6a415` — 2026-09-23

**Verdict for the four reported findings: PASS.** All four initial P2 findings below are corrected and independently revalidated. This supersedes the initial fix-required verdict only for those findings and this HEAD; the forthcoming wire-budget/serializer changes need their own final review. No new P1/P2 found in the inspected corrections. This is not physical release certification or merge authorization.

- Both standings VMs explicitly handle stopping as disconnected, with regressions.
- Class-view intervals are suppressed unless the unique authoritative absolute predecessor is known to be in the same class; no invented class interval. The reproduction now yields `—` for the hidden-other-class case.
- Practice/qualifying class gaps use each class's fastest observed lap. The two-class reproduction now labels both class leaders `Leader`.
- Relative derives signed full-lap differences from each car's completed laps plus metric track progress and the actual track length. Global leader deficit fields no longer govern the badge. Boundary, positive/negative and missing/mixed-quality cases were read and executed.
- The uppercase class assertion failure from the initial review is resolved through preserving source class casing while using normalized class keys for grouping.
- Additional Redline inspection: battle cues now consume `battleGapSeconds` numeric authority from the shared VM, not parsing localized/lap gap labels. Regressions cover absent authority and cropped windows; no new finding.

**Revalidation evidence:**

1. Original `/tmp/isa1347-review-repro.cjs`: exit0; stopping `disconnected disconnected`, invalid class interval `—`, GT qualifying class leader `Leader`.
2. Same four focal frontend suites as initial review: **95/95 passed**, exit0.
3. Redline `standings-motion.test.ts` and `useStandingsMotion.test.tsx`: **59/59 passed**, exit0.
4. Go derive and overlayv2 focused suites: both exit0.
5. Explicit `TestRelativeLapBadgeUsesPlayerProgressRatherThanLeaderDeficits`: all five boundary subtests passed, exit0. Each also checks stale mixed samples and missing track length.

Repository remained read-only from this reviewer. Root/other workers may have concurrent worktree modifications; results above identify the inspected committed HEAD and focal tests, not certification of an eventual changed serializer.

---

# Independent review ISA-1347 — 2026-09-23

**Verdict: fix-required (P2 findings).** Read-only code review of base `8b25d076` through integration HEAD `e6ed38e5`, with generated artifacts being regenerated concurrently by the owner. No repository edits, commits, PRs or subagents from this reviewer. This report is independent of implementer summaries. Scope is accepted Eficiencia Delta, Pedals, Relative, Standings, Horizontal; physical LMU certification is explicitly excluded from automated evidence.

## Findings

### P2 — Stopping is still rendered as ready by both standings models

`vantare-v2/frontend/src/overlay/widget-types/standings/standings-view-model-v2.ts:41` and `.../broadcast-tower/broadcast-tower-view-model-v2.ts:33` enumerate unavailable states but omit `stopping`, a valid `OverlaySourceStateV2`. Both then fall through to status `ready` with retained rows. A stop request therefore leaves old telemetry presented as live until the next stopped status. Use the same live/degraded/stale allowlist as Delta/Pedals or include stopping explicitly. Add regressions for both models.

**Executed reproduction:** `/tmp/isa1347-review-repro.cjs` prints `stopping statuses: ready ready`.

### P2 — Class-filtered intervals still refer to the hidden overall predecessor

`.../standings-view-model-v2.ts:198` calls `formatInterval(row)` irrespective of class scope; `internal/telemetry/projection/overlayv2/builder_standings.go:64` supplies native `TimeBehindNext`/`LapsBehindNext` from overall classification. For overall rows HYP P1 gap0, GT P2 gap5, HYP P3 gap7 and interval2, player-class HYP renders only P1/P3 but P3 interval is `+2.00s`, although the class predecessor is 7 seconds ahead. The new contract says interval is relative to the preceding competitor of the indicated classification. Carry a class-relative interval/reference from Go, or suppress the value when its actual predecessor does not match the shown scope. Never subtract incomparable lap references.

**Executed reproduction:** `/tmp/isa1347-review-repro.cjs` prints HYP P3 `{gap:'+7.00s', interval:'+2.00s'}` with GT omitted.

### P2 — Multiclass pace gaps use the fastest lap of a different class

`.../standings-view-model-v2.ts:64` calculates one `fastestLap(scoped)` across all classes, and line197 uses it in practice/qualifying even when classification mode is multiclass. For HYP best100s and GT class leader120s, the GT class leader receives `isLeader:true` but `gapText:'+20.00s'` under its class band. Resolve best lap per class for the class-grouped presentation; overall normal mode can retain overall reference. The current regression suite covers racing class gaps but not this pace-session case.

**Executed reproduction:** `/tmp/isa1347-review-repro.cjs` prints this contradictory GT leader row.

### P2 — Relative lap badge still subtracts global lap deficits

`internal/telemetry/derive/gaps.go:109-123` computes relative lap delta as player `LapsBehindLeader` minus rival `LapsBehindLeader`. This can differ by one from the actual full-lap difference between player and rival around the global leader's lap boundary. Example full race progress leader10.2, player9.3, rival9.1: native leader deficits0 and1 yield rival badge−1 despite player/rival being0.2 lap apart. `RelativeFunctional.tsx` renders it with text `1 lap fewer than you` / `1 vuelta menos que tú`, and the accepted contract describes progress relative to the player. The integrated class-gap fix already avoids this reference-boundary error using completed laps, track length and lap distance; Relative needs the equivalent authority and boundary tests. This is an existing accepted-widget defect within the requested data-correctness scope, not necessarily introduced by this patch.

**Evidence:** direct derivation read plus arithmetic counterexample and renderer/label wiring. No physical-capture claim. Freshness checks do not correct the reference mismatch.

## Automated evidence

- `go test ./internal/telemetry/projection/overlayv2 ./internal/telemetry/drivers/lmu -run 'Test(BuildStandings|BuildRelative|BuildDelta|RESTWeather|NativeRain|TrackLength|Class)' -count=1`: exit0 for both packages.
- Focal Vitest: delta-pedals-data-contract, standings-contract-regressions, relative-domain-free, BroadcastTowerFunctional.motion: **90 passed / 1 failed**, exit1. Failure `relative-domain-free.test.ts:641` expects lowercase `hypercar`, whereas the new builder normalizes class IDs uppercase. Membership assertions before this line pass. Root notified to reconcile the fixture assertion; do not silently report green.
- `/tmp/isa1347-review-repro.cjs`, using repository TypeScript compiler and current modules without altering source: exit0, prints incorrect values for three frontend findings above.

## Confirmed improvements and bounded gaps

Independently read Go builders for player/delta/relative/standings/weather, new native track length/rain decoding, REST weather validation/cache/TTL paths, generated reader quality handling, five ViewModels, functional Relative/Standings/Horizontal renderers, footer resolution, and focused regressions. Delta references are selected from separate Go-resolved entries with effective-reference notice; unavailable pedals retain a dash rather than false observed0; relative neighbour selection is physical and independently class-filtered; missing positions are no longer synthesized from array indices; public SOF is disabled; carousel is an actual settings option with decorative duplicate accessibility suppression. Weather source documentation distinguishes measured wetness/native rain from forecasts and explicitly leaves wind without assumed units.

This review did not certify actual Windows LMU, OBS/Desktop reconnection, weather readings in a physical wet session, or absolute runtime performance. The separate wire-budget worker and root's final full checks remain necessary. Unknown-position motion was already assigned to root and is not duplicated as a new finding. Relative Fahrenheit presentation remains a latent inconsistency (meta still formats Celsius directly), but no claim here that current runtime can select Fahrenheit; root can retain as bounded gap or cover with other unit work.

Do not use this initial verdict as a merge/release approval. Re-review corrected findings and final immutable HEAD after integration.
