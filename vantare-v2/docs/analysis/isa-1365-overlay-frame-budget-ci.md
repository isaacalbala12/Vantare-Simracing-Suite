# OverlayFrame V2 budget in Windows CI (ISA-1365)

The compact decode budget remains **< 1.5 ms** in `overlay-frame-v2-performance.test.ts`. This change neither modifies its parser nor changes its fixture or threshold.

In PR #1363, three Windows branch-gate runs reported compact CPU medians of 1.782, 1.500, and 1.560 ms. Comparable passing branch gates reported 1.470, 1.404, and 1.498 ms. The decoder did not change in #1363, and the performance test previously ran alongside hundreds of functional files in the same Vitest invocation. That makes runner contention a plausible cause, not a proven one.

`pnpm test` now runs the functional suite excluding this one benchmark file, then runs that file in a separate single-worker Vitest process. The Windows branch and release gates both invoke this script, so the four tests in the benchmark file run once per gate. The dedicated process avoids competing with the functional suite while retaining the same 1.5 ms policy. Windows CI on this PR determines whether isolation is sufficient; a further failure should be investigated as a real budget or runner-environment problem rather than masked by relaxing the threshold.
