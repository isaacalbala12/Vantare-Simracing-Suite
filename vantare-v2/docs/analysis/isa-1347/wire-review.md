# Independent compact-wire review — ISA-1347

**Scope:** committed product `6e3ee9ac` plus the root's subsequently inspected working-tree fix accepting Relative position0. Read-only review; no product edits or delegation. Prior four findings are independently closed in `/tmp/isa1347-independent-review.md`.

**Verdict: PASS for the inspected serializer/decoder changes with the position0 correction included.** The committed `6e3ee9ac` alone still contains the position0 rejection described below; the corrected tree must be committed before this verdict applies to a final SHA. No remaining P1/P2 found in the inspected compact-wire path. This is neither release certification nor merge authorization.

## Finding discovered and revalidated

The decoder's `validRelative` required `position > 0`, while the new Go builder truthfully publishes0 for an unavailable classification. Any such row in relative, relativeSettled or relativeSameClass rejected the **entire update**, so the UI's new unknown-rank handling could not run.

- Reproduction `/tmp/isa1347-wire-repro.cjs` initially produced `invalid-contract:frame.relative[0]` and equivalent errors for the other two sections.
- Root changed the decoder to safe integer `>=0` and added regression coverage for all three windows, rejecting negative, fractional and unsafe ranks.
- Independent reread and the same reproduction now accept all three cases. The display remains a dash, with no P0 badge.

## Wire and quality review

Read `standing_wire.go`, `relative_wire.go`, the associated frame/type generator changes, production TypeScript decoder, compact-wire tests, byte-accounting tests and the Relative metadata changes.

- Standing scalar timings preserve numeric precision. A shared base plus explicit overrides retains fresh/stale/missing/invalid for gap, bestLap and lastLap; the normalized consumer still receives QValue cells. Missing scalars may only be zero placeholders, not nonzero observations.
- Compact field aliases and quality-code aliases are expanded once at the owned decoder boundary. Ambiguous compact+descriptive aliases, unknown quality codes, conflicting scalar/object overrides and invalid Relative authorities are rejected by the frontend. There are no widget joins or new per-VM normalization paths.
- Legacy object timings, descriptive field names and explicit derived authority remain readable by the new decoder. This is **new-reader/old-payload compatibility only**: old strict readers cannot read new scalar/alias payloads, so backend/frontend must deploy together. No backward-reader compatibility claim.
- Relative's omitted authority has the declared derived default; native/estimated remain explicit. Existing consumer uses were inspected; absence does not get reclassified as native.
- Raw per-field byte accounting is captured before normalized expansion. Section deltas retain validated/frozen array identity, validate new sections and calculate the reconstructed raw-wire update size before bypassing the defensive clone. Failed deltas do not advance the base. I found no bypass of the existing72KiB bound.
- The72KiB decoder/publisher caps remain unchanged. Budgets below are explicitly the tested scenarios, not a universal bound for arbitrary unbounded strings or every possible payload.
- Relative metadata now converts Celsius according to frame.units.temperature and suppresses unavailable rank; the existing accepted layout is preserved.

## Independent automated evidence

All commands used the current root worktree without modifying source.

- Go wire/quality/legacy/authority/roundtrip and frame budget tests: **passed**, exit0.
- Go measured full104 synthetic: **55,670B**.
- Representative20-character strings +120-sample history: **64,880B**.
- Adverse32-character strings +120-sample history: **71,120B**.
- Same adverse scenario with mixed timing quality on every standing: **73,096B**, below73,728B cap.
- Go compact marshal benchmark (Apple M5/macOS arm64,200ms): **525,212ns/op**,220,973B/op,330allocs/op. This is a local microbenchmark, not Windows frame-rate certification.
- Frontend compact-wire + store + performance + Relative suites on6e3ee9ac: **89/89 passed**, exit0. Both legacy and compact decoder performance gates passed their existing1.5ms CPU median threshold; console runner did not expose exact medians in this invocation.
- Original position0 reproduction after root fix: all three Relative sections accepted. New regression and final compact/store/Relative focal suites rerun after fix: **86/86 passed**, exit0.

## Remaining limits

Final immutable commit/CI and root's full suites remain the owner's gate. Physical LMU Windows sessions, mixed weather correlation, reconnect behavior in Desktop/OBS, and deployment pairing are outside these automated tests. No universal100% correctness claim is supported by this review.
