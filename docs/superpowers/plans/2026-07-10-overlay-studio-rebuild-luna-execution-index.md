# Overlay Studio V3 Luna Microcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the Overlay Studio V3 plan with 5.6 Luna by limiting each working turn to one small file group, one behavior and one reviewable commit.

**Architecture:** The master and phase plans remain the technical authority. This index overrides only execution size: large parent tasks are split into ordered microcuts, and their parent integration command runs after all child microcuts are green.

**Tech Stack:** Same as the master plan; this document adds no production technology.

---

## How to dispatch work

Give Luna exactly:

1. the master plan;
2. the current phase plan;
3. one microcut ID from this file;
4. only the repository files named by that microcut.

For every microcut:

- [ ] Run `git status --short` and stop on overlapping changes.
- [ ] Read the parent task completely, but implement only the assigned child scope.
- [ ] Write/run the child RED test before production code.
- [ ] Implement the minimum child contract.
- [ ] Run the child focused tests and `git diff --check`.
- [ ] Review the diff across correctness, readability, architecture, security and performance.
- [ ] Commit only child files with the parent commit prefix plus the child subject.
- [ ] Report exact evidence in Spanish and stop.

The final child of a parent task runs the parent integration command. The parent’s broad `git add`/commit step is replaced by child commits and must not be executed again.

## Standard-size parent tasks

Every parent task not named in the split table below is one microcut. Execute its checkboxes as written and stop after its commit. Phase review gates are separate review-only turns.

## Required splits

### Phase 2

#### Microcut 2.4A — Design-system contracts and registry

Parent: Phase 2 Task 2.4.

Files: design-system definition/registry and registry test.

Deliverable: duplicate/version/pair resolution and migration-gap contracts using test definitions.

#### Microcut 2.4B — Original/Crystal manifests and document visual upgrade

Parent: Phase 2 Task 2.4.

Files: two manifests, `visual-config-migration.ts` and its test.

Deliverable: sequential 0→1 migrations and pure profile visual upgrade.

#### Microcut 2.5A — Delta Original renderer

Parent: Phase 2 Task 2.5.

Files: `DeltaOriginal.tsx`, its test, Original `tokens.css`.

Deliverable: Original ready/status renderer and scoped styles, without manifest wiring.

#### Microcut 2.5B — Delta Crystal renderer

Parent: Phase 2 Task 2.5.

Files: `DeltaCrystal.tsx`, its test, Crystal `tokens.css`.

Deliverable: structurally distinct Crystal renderer and status states, without manifest wiring.

#### Microcut 2.5C — Delta renderer registration

Parent: Phase 2 Task 2.5.

Files: both manifests, `frontend/src/index.css`, manifest/registry tests.

Deliverable: both renderers registered; run the parent focused tests and build.

#### Microcut 2.7A — Harness React surface

Parent: Phase 2 Task 2.7.

Files: harness HTML, `main.tsx`, `OverlayParityHarness.tsx` and its test.

Deliverable: query-driven deterministic Delta surface.

#### Microcut 2.7B — Harness Vite and Playwright runner

Parent: Phase 2 Task 2.7.

Files: Vite harness config, visual script, `package.json`.

Deliverable: lifecycle-safe capture and canvas/ImageData comparison with update/normal modes.

#### Microcut 2.7C — Reviewed Delta baselines

Parent: Phase 2 Task 2.7.

Files: Delta baseline PNGs only.

Deliverable: update run, human visual review, then normal comparison run.

### Phase 4

#### Microcut 4.1A — Workbench frame

Parent: Phase 4 Task 4.1.

Files: `OverlayStudioV3.tsx`, its test, base `overlay-studio-v3.css`.

Deliverable: three-slot composition without detailed header/list behavior.

#### Microcut 4.1B — Studio header

Parent: Phase 4 Task 4.1.

Files: `StudioHeader.tsx` and its test.

Deliverable: profile/session/save/history/menu contracts.

#### Microcut 4.1C — Widget list and inspector slot

Parent: Phase 4 Task 4.1.

Files: `WidgetListPanel.tsx`, its test, `InspectorSlot.tsx`, shell CSS integration.

Deliverable: ordered selection list, preserved-widget warning and responsive column integration.

#### Microcut 4.3A — Studio telemetry provider

Parent: Phase 4 Task 4.3.

Files: `StudioTelemetryProvider.tsx` and its test.

Deliverable: injected mock/live snapshot boundary with no document writes.

#### Microcut 4.3B — Studio widget frame

Parent: Phase 4 Task 4.3.

Files: `StudioWidgetFrame.tsx`, its test, `CanvasGuides.tsx`.

Deliverable: absolute V3 frame and shared host without interactions.

#### Microcut 4.3C — Studio canvas integration

Parent: Phase 4 Task 4.3.

Files: `StudioCanvas.tsx`, its test, `OverlayStudioV3.tsx`.

Deliverable: scaled scene, ordering, selection and provider integration.

#### Microcut 4.7A — Dirty changes dialog

Parent: Phase 4 Task 4.7.

Files: `DirtyChangesDialog.tsx` and its test.

#### Microcut 4.7B — Recovery dialog

Parent: Phase 4 Task 4.7.

Files: `RecoveryDialog.tsx` and its test.

#### Microcut 4.7C — Responsive panel controls

Parent: Phase 4 Task 4.7.

Files: `ResponsivePanelControls.tsx`, its test and workbench CSS.

#### Microcut 4.7D — Modal/shell integration

Parent: Phase 4 Task 4.7.

Files: `OverlayStudioV3.tsx` and its test.

Deliverable: beforeunload, focus restoration and responsive orchestration.

### Phase 5

#### Microcut 5.4A — Appearance section

Parent: Phase 5 Task 5.4.

Files: `AppearanceSection.tsx` and its test.

Deliverable: descriptor-driven appearance overrides and exact reset.

#### Microcut 5.4B — Behavior and visibility

Parent: Phase 5 Task 5.4.

Files: `BehaviorSection.tsx`, its test, `widget-visibility.ts` and its test.

Deliverable: enabled/updateHz/conditional behavior with a real visibility predicate.

#### Microcut 5.4C — Layout section

Parent: Phase 5 Task 5.4.

Files: `LayoutSection.tsx` and its test.

Deliverable: nonnumeric aspect/center/reset/z-order controls.

#### Microcut 5.4D — Actions section integration

Parent: Phase 5 Task 5.4.

Files: `ActionsSection.tsx`, its test, `StudioInspector.tsx`.

Deliverable: shared duplicate/delete/default/discard actions and section host integration.

#### Microcut 5.7A — Official design data

Parent: Phase 5 Task 5.7.

Files: `official-designs.ts` and its test.

#### Microcut 5.7B — User design transport client

Parent: Phase 5 Task 5.7.

Files: `widget-design-client.ts` and its test.

#### Microcut 5.7C — Save design dialog

Parent: Phase 5 Task 5.7.

Files: `SaveDesignDialog.tsx` and its test.

#### Microcut 5.7D — Atomic design command

Parent: Phase 5 Task 5.7.

Files: `studio-command.ts` and its test.

Deliverable: one active-layout apply-to-all history step.

#### Microcut 5.7E — Design inspector integration

Parent: Phase 5 Task 5.7.

Files: `DesignSection.tsx`, its test, `StudioInspector.tsx`.

Deliverable: Vantare/User segmentation, apply, locks and provenance.

### Phase 6

#### Microcut 6.2A — Standings content parser

Parent: Phase 6 Task 6.2.

Files: `standings-content.ts` and its test.

#### Microcut 6.2B — Standings ViewModel

Parent: Phase 6 Task 6.2.

Files: `standings-view-model.ts` and its test.

#### Microcut 6.2C — Standings definition

Parent: Phase 6 Task 6.2.

Files: `standings-definition.ts` and its test.

#### Microcut 6.2D — Standings content inspector

Parent: Phase 6 Task 6.2.

Files: `StandingsContentInspector.tsx` and its test.

Run the complete Task 6.2 focused command after this microcut.

#### Microcut 6.4A — Relative content parser

Parent: Phase 6 Task 6.4.

Files: `relative-content.ts` and its test.

#### Microcut 6.4B — Relative ViewModel

Parent: Phase 6 Task 6.4.

Files: `relative-view-model.ts` and its test.

#### Microcut 6.4C — Relative definition

Parent: Phase 6 Task 6.4.

Files: `relative-definition.ts` and its test.

#### Microcut 6.4D — Relative content inspector

Parent: Phase 6 Task 6.4.

Files: `RelativeContentInspector.tsx` and its test.

Run the complete Task 6.4 focused command after this microcut.

#### Microcut 6.9A — Harness cases and parity assertions

Parent: Phase 6 Task 6.9.

Files: harness component/test and visual script.

#### Microcut 6.9B — Reviewed four-widget baselines

Parent: Phase 6 Task 6.9.

Files: new/changed visual PNGs only.

Deliverable: update run, manual matrix review and normal comparison run.

### Phase 7

#### Microcut 7.2A — Legacy payload normalization

Parent: Phase 7 Task 7.2.

Files: `telemetry-adapter.ts` and its test.

#### Microcut 7.2B — Rate coordinator

Parent: Phase 7 Task 7.2.

Files: `telemetry-rate-coordinator.ts` and its test.

#### Microcut 7.2C — Wails adapter

Parent: Phase 7 Task 7.2.

Files: Wails adapter and test.

#### Microcut 7.2D — SSE adapter

Parent: Phase 7 Task 7.2.

Files: SSE adapter and test.

#### Microcut 7.5A — Canonical V3 profile lifecycle

Parent: Phase 7 Task 7.5.

Files: `studio_profile_service.go` and its test.

#### Microcut 7.5B — V3 overlay controller

Parent: Phase 7 Task 7.5.

Files: `overlay_controller.go` and its test.

#### Microcut 7.5C — V3 window application

Parent: Phase 7 Task 7.5.

Files: `window/manager.go` and its test.

#### Microcut 7.5D — Main lifecycle wiring

Parent: Phase 7 Task 7.5.

Files: `cmd/vantare/main.go` plus focused integration tests already owned by the affected packages.

Deliverable: runtime broadcast and profile cycling; run parent Go integration command.

#### Microcut 7.9A — No-active-profile state

Parent: Phase 7 Task 7.9.

Files: `NoActiveProfileState.tsx` and its test.

#### Microcut 7.9B — Studio route orchestration

Parent: Phase 7 Task 7.9.

Files: `StudioRoute.tsx`, its test, `OverlaysStudioPage.tsx` and its test.

#### Microcut 7.9C — Studio live-rate integration

Parent: Phase 7 Task 7.9.

Files: `StudioWidgetFrame.tsx` and its test, plus the smallest route provider change.

Run the full parent focused command/build after this microcut.

### Phase 8

#### Microcut 8.1A — Translation key set

Parent: Phase 8 Task 8.1.

Files: four locale files and `i18n.test.ts`.

Deliverable: exact key parity before component replacement.

#### Microcut 8.1B — Replace V3 UI literals

Parent: Phase 8 Task 8.1.

Files: V3 UI components containing matches and `overlay-studio-i18n.test.ts`.

#### Microcut 8.3A — Coordinator hardening

Parent: Phase 8 Task 8.3.

Files: coordinator and test.

#### Microcut 8.3B — Runtime/Studio rate consumers

Parent: Phase 8 Task 8.3.

Files: Runtime and Studio widget frames and tests.

#### Microcut 8.3C — Performance harness and Crystal budget

Parent: Phase 8 Task 8.3.

Files: performance test, Crystal styles and performance audit document.

#### Microcut 8.5A — Compile-safe design-system template

Parent: Phase 8 Task 8.5.

Files: `_template` source/test files.

#### Microcut 8.5B — Design-system checker

Parent: Phase 8 Task 8.5.

Files: checker script and package scripts.

#### Microcut 8.5C — Authoring and HTML porting guides

Parent: Phase 8 Task 8.5.

Files: authoring guide, porting guide and worksheet.

#### Microcut 8.7A — Editor legacy retirement

Parent: Phase 8 Task 8.7.

Files: verified dead `hub/overlays` editor candidates and retirement audit.

#### Microcut 8.7B — Preview route retirement/migration

Parent: Phase 8 Task 8.7.

Files: only `hub/preview`/PreviewPage paths proven dead or migrated by consumer audit.

#### Microcut 8.7C — Duplicate renderer/map retirement

Parent: Phase 8 Task 8.7.

Files: verified dead shared maps, factory/variant/preset paths and legacy core renderers.

Run the full retirement gate after this microcut.

## Phase boundaries

After the final microcut of each phase:

- [ ] Run the complete phase gate.
- [ ] Start a fresh review-only turn using the master review brief.
- [ ] Fix findings in separate microcuts.
- [ ] Record evidence in `vantare-v2/docs/current-plan.md`.
- [ ] Mark the master phase checkbox only when green.
