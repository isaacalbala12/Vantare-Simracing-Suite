# ISA-1332 independent motion review

Decision: PASS for the bounded code review; no blocking findings.

Reviewed HEAD 6c67ed7380442a99a79ec189017125d9827cc0bb against origin/nightly e6d7d2b5e58f55b82c0ed2f6a79667476d897086. Working tree stayed clean. Read all eight changed files and the WidgetVisualHost call path; no tracker writes or repository edits.

Confirmed: canonical V2 IDs reach keyed cards; source/session/epoch/retry and presentation boundaries reset the motion baseline; current transformed rectangles have their running offset removed once before computing the next origin; scale is converted to local pixels; exiting ghosts are inert and aria-hidden; reentry and incomplete entrance preserve current opacity; reduced/minimal and layout cleanup behavior are consistent with the shared motion owner. Numeric samples return before geometry reads, animations, or timers. React layout effects still execute on renders, so the evidence supports no new visual work, not literally no React effect execution.

Independent verification: Node v22.23.2, vitest renderer motion plus V2 view-model tests: 32 passed, exit 0. Shared widget-motion tests: 8 passed, exit 0. Total 40 passing tests across three files.

Limits: no browser permitted in this subtask, so no independent native WAAPI/compositor or visual-parity observation. Geometry/animation behavior is tested with mocks. The geometry mock fixes stream/card widths, so changes in intrinsic lead/side width (for example lap digit count or localization) are not directly covered. No demonstrated blocking defect from this limitation. Full suite, build, lint, and quality gates belong to the root integrator.
