# S4.5 Preview Mock Session Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit practice, qualifying and race mock scenarios so WidgetStudio previews can validate Standings without confusing the `gap` column with the optional `bestLap` column.

**Architecture:** Keep telemetry mocking centralized and deterministic. Add scenario-specific mock payload helpers, then expose a small preview-only scenario selector in `WidgetStudio`/`WidgetPreviewPanel` that feeds `WidgetRenderer` without touching widget variants, layouts or persisted profile data.

**Tech Stack:** React, TypeScript, Vitest, existing mock telemetry and WidgetSandboxPreview architecture.

---

## Why This Exists

Manual S4 validation found that Standings appeared to show "mejor vuelta" by default.

GLM review determined this is not a code bug:

- `bestLap` is disabled by default.
- The visible lap time is the default `gap` column.
- In practice/qualifying, legacy Standings semantics render best lap time inside `gap`.
- The current edit mock is always `PRACTICE1`, so manual validation is ambiguous.

This task improves the preview/mocking layer so users can validate:

- practice: `gap` column intentionally shows lap times;
- qualifying: `gap` column intentionally shows lap times;
- race: `gap` column shows leader/gaps/FASTEST instead of lap times.

## Scope

Allowed files:

- `frontend/src/overlay/widgets/mock-telemetry.ts`
- `frontend/src/overlay/widgets/mock-telemetry.test.ts` if it does not exist, create it
- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- `frontend/src/overlay/widgets/StandingsWidget.test.tsx`
- `frontend/src/overlay/widgets/use-widget-telemetry.ts` only if needed for typing
- `frontend/src/hub/preview/WidgetRenderer.tsx`
- `frontend/src/hub/preview/WidgetRenderer.test.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.test.tsx`
- `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- `frontend/src/hub/overlays/WidgetPreviewPanel.test.tsx`
- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/WidgetStudio.test.tsx`

Prefer the smallest subset possible. If the scenario can be passed through fewer files, do that.

## Do Not Edit

Do not modify:

- `frontend/src/overlay/widgets/standings-catalog.ts`
- `frontend/src/overlay/widgets/standings-format.ts`
- `frontend/src/lib/widget-variants.ts`
- `frontend/src/lib/profile.ts`
- backend Go files
- schema files
- configs
- `docs/current-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/marketing`
- `docs/INTEGRATION_ANALYSIS.md`

No dependencies. No commits. No staging.

## Required Docs To Read

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/feature-architecture-map.md`
- `docs/widget-preview-bug-log.md`
- `docs/superpowers/plans/2026-06-22-s4-standings-render-configurable.md`

## Product Requirements

1. Widget preview must allow choosing mock session scenario:
   - `Práctica`
   - `Qualy`
   - `Carrera`
2. The control is preview-only and must not persist to profile.
3. The control must not modify `widget.props`, `widget.position`, `profile.variants`, layout or configs.
4. Race scenario must make default Standings visually distinct from practice/qualy:
   - `gap` should show `Leader`, `+x.xxxs`, `FASTEST` or lap gaps;
   - it should not look like a best-lap column by default.
5. Practice/qualy scenarios may show lap times in `gap`, but the UI must make it clear which session scenario is active.
6. Relative and other widgets must continue using mock telemetry normally.
7. No Standings UI configuration is added in this task. S5 handles Standings column toggles later.

## Suggested Design

Add a small segmented control above or inside the preview panel, visually secondary:

```text
Mock: Práctica | Qualy | Carrera
```

Recommended default for manual validation:

- `Carrera`

Reason: it avoids the visual ambiguity where `gap` looks like best lap.

If changing default from global mock practice is risky for other widgets, keep the global mock as-is and make only WidgetStudio preview default to `Carrera`.

## Task 1: Add Deterministic Mock Session Helpers

**Files:**

- Modify: `frontend/src/overlay/widgets/mock-telemetry.ts`
- Create: `frontend/src/overlay/widgets/mock-telemetry.test.ts`

- [ ] **Step 1: Add scenario type and helper tests first**

Create `frontend/src/overlay/widgets/mock-telemetry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getMockTelemetry, getMockTelemetryForSession } from "./mock-telemetry";

describe("mock telemetry scenarios", () => {
  it("keeps the legacy default mock as practice", () => {
    const telemetry = getMockTelemetry();

    expect(telemetry.sessionName).toBe("PRACTICE1");
  });

  it("creates an explicit practice scenario", () => {
    const telemetry = getMockTelemetryForSession("practice");

    expect(telemetry.sessionName).toBe("PRACTICE1");
    expect(telemetry.sessionType).toBe(10);
    expect(telemetry.sessionKey).toContain("practice");
  });

  it("creates an explicit qualifying scenario", () => {
    const telemetry = getMockTelemetryForSession("qual");

    expect(telemetry.sessionName).toBe("QUALIFY");
    expect(telemetry.sessionType).toBe(11);
    expect(telemetry.sessionKey).toContain("qual");
  });

  it("creates an explicit race scenario with race gaps", () => {
    const telemetry = getMockTelemetryForSession("race");

    expect(telemetry.sessionName).toBe("RACE");
    expect(telemetry.sessionType).toBe(3);
    expect(telemetry.sessionKey).toContain("race");
    expect(telemetry.vehicles[0].timeBehindLeader).toBe(0);
    expect(telemetry.vehicles.some((vehicle) => vehicle.fastestLap)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm --dir frontend test -- mock-telemetry
```

Expected: FAIL because `getMockTelemetryForSession` does not exist.

- [ ] **Step 3: Implement minimal helper**

In `frontend/src/overlay/widgets/mock-telemetry.ts`, add:

```ts
export type MockSessionScenario = "practice" | "qual" | "race";

export function getMockTelemetryForSession(scenario: MockSessionScenario): TelemetryRefState {
  const telemetry = getMockTelemetry();

  if (scenario === "practice") {
    return {
      ...telemetry,
      sessionType: 10,
      sessionName: "PRACTICE1",
      sessionKey: "mock|Circuit de Barcelona|practice",
    };
  }

  if (scenario === "qual") {
    return {
      ...telemetry,
      sessionType: 11,
      sessionName: "QUALIFY",
      sessionKey: "mock|Circuit de Barcelona|qual",
      timeRemaining: 900,
    };
  }

  return {
    ...telemetry,
    sessionType: 3,
    sessionName: "RACE",
    sessionKey: "mock|Circuit de Barcelona|race",
    timeRemaining: 3600,
  };
}
```

Keep `getMockTelemetry()` unchanged for compatibility.

- [ ] **Step 4: Run helper tests**

Run:

```powershell
pnpm --dir frontend test -- mock-telemetry
```

Expected: PASS.

## Task 2: Allow WidgetRenderer To Receive Mock Scenario

**Files:**

- Modify: `frontend/src/hub/preview/WidgetRenderer.tsx`
- Modify: `frontend/src/hub/preview/WidgetRenderer.test.tsx`

- [ ] **Step 1: Add a test proving mock scenario reaches widget props**

If `WidgetRenderer.test.tsx` already has a render test, extend it. Otherwise add a minimal test that renders a `standings` widget with `mockSessionScenario="race"` and asserts the wrapper renders without crashing.

Target behavior:

```tsx
render(
  <WidgetRenderer
    widget={{
      id: "standings",
      type: "standings",
      enabled: true,
      updateHz: 15,
      position: { x: 0, y: 0, w: 360, h: 300 },
    }}
    editMode={true}
    telemetryMode="mock"
    mockSessionScenario="race"
  />,
);
```

Expected assertion:

```ts
expect(screen.getByTestId("widget-renderer")).toBeTruthy();
```

- [ ] **Step 2: Add prop typing**

In `WidgetRenderer.tsx`, import the type:

```ts
import type { MockSessionScenario } from "../../overlay/widgets/mock-telemetry";
```

Add to `InnerWidgetProps`:

```ts
mockSessionScenario?: MockSessionScenario;
```

Add to `WidgetRendererProps`:

```ts
mockSessionScenario?: MockSessionScenario;
```

Pass it to the rendered component:

```tsx
mockSessionScenario={mockSessionScenario}
```

- [ ] **Step 3: Run WidgetRenderer tests**

Run:

```powershell
pnpm --dir frontend test -- WidgetRenderer
```

Expected: PASS.

## Task 3: Make Standings Use Preview Mock Scenario

**Files:**

- Modify: `frontend/src/overlay/widgets/StandingsWidget.tsx`
- Modify: `frontend/src/overlay/widgets/StandingsWidget.test.tsx`

This is the only allowed edit to `StandingsWidget.tsx` in this plan. It must be limited to reading the preview mock scenario.

- [ ] **Step 1: Add focused tests**

In `StandingsWidget.test.tsx`, add:

```tsx
it("uses race mock scenario when provided", () => {
  render(<StandingsWidget editMode={true} updateHz={15} mockSessionScenario="race" />);
  tick(100);

  const panel = screen.getByTestId("standings-panel");
  expect(panel.textContent).toContain("RACE");
  expect(panel.textContent).toContain("Leader");
});

it("uses practice mock scenario when provided", () => {
  render(<StandingsWidget editMode={true} updateHz={15} mockSessionScenario="practice" />);
  tick(100);

  const panel = screen.getByTestId("standings-panel");
  expect(panel.textContent).toContain("PRACTICE");
  expect(panel.textContent).toContain("1:29.823");
});
```

If the header does not display session name today, assert the gap behavior instead:

```ts
expect(panel.textContent).toContain("Leader");
expect(panel.textContent).toContain("+1.430s");
```

for race, and:

```ts
expect(panel.textContent).toContain("1:29.823");
```

for practice.

- [ ] **Step 2: Add prop type and mock selection**

In `StandingsWidget.tsx`, import:

```ts
import { getMockTelemetry, getMockTelemetryForSession, type MockSessionScenario } from "./mock-telemetry";
```

Extend `StandingsProps`:

```ts
mockSessionScenario?: MockSessionScenario;
```

Inside the component, replace both direct mock reads:

```ts
const t = (telemetryMode ?? (editMode ? "mock" : "live")) === "mock" ? getMockTelemetry() : getTelemetryRef();
```

with:

```ts
const readTelemetry = () =>
  (telemetryMode ?? (editMode ? "mock" : "live")) === "mock"
    ? mockSessionScenario
      ? getMockTelemetryForSession(mockSessionScenario)
      : getMockTelemetry()
    : getTelemetryRef();
```

Use `readTelemetry()` in the frame loop and initial render.

- [ ] **Step 3: Run Standings tests**

Run:

```powershell
pnpm --dir frontend test -- StandingsWidget mock-telemetry
```

Expected: PASS.

## Task 4: Add Preview Scenario Selector In WidgetStudio

**Files:**

- Modify: `frontend/src/hub/overlays/WidgetStudio.tsx`
- Modify: `frontend/src/hub/overlays/WidgetPreviewPanel.tsx`
- Modify: `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- Modify tests for the smallest touched surface.

- [ ] **Step 1: Add state in WidgetStudio**

Add:

```ts
const [mockSessionScenario, setMockSessionScenario] = useState<MockSessionScenario>("race");
```

Import:

```ts
import type { MockSessionScenario } from "../../overlay/widgets/mock-telemetry";
```

Pass it to `WidgetPreviewPanel`.

- [ ] **Step 2: Add preview-only segmented control**

Place the control close to the preview, not in the persisted settings panel:

```tsx
{activeWidget?.type === "standings" ? (
  <div className="flex items-center gap-2 text-xs text-neutral-400">
    <span className="uppercase tracking-wide text-neutral-500">Mock</span>
    {[
      ["practice", "Práctica"],
      ["qual", "Qualy"],
      ["race", "Carrera"],
    ].map(([value, label]) => (
      <button
        key={value}
        type="button"
        className={value === mockSessionScenario ? "..." : "..."}
        onClick={() => setMockSessionScenario(value as MockSessionScenario)}
      >
        {label}
      </button>
    ))}
  </div>
) : null}
```

Use existing project button classes/patterns. Do not introduce a new design system here.

- [ ] **Step 3: Propagate scenario to sandbox**

Add `mockSessionScenario?: MockSessionScenario` prop through:

- `WidgetPreviewPanel`
- `WidgetSandboxPreview`
- `WidgetRenderer`

Do not write it into profile/widget props.

- [ ] **Step 4: Add tests**

Add/adjust tests to cover:

1. Standings selected shows the mock segmented control.
2. Default selected mock scenario is `Carrera`.
3. Clicking `Práctica` changes selected state.
4. Relative selected does not show the mock segmented control.
5. Changing the control does not call save/update profile handlers.

Run:

```powershell
pnpm --dir frontend test -- WidgetStudio WidgetPreviewPanel WidgetSandboxPreview WidgetRenderer StandingsWidget mock-telemetry
```

Expected: PASS.

## Task 5: Final Checks

- [ ] **Step 1: Run focused tests**

```powershell
pnpm --dir frontend test -- mock-telemetry StandingsWidget WidgetRenderer WidgetSandboxPreview WidgetPreviewPanel WidgetStudio
```

Expected: PASS.

- [ ] **Step 2: Run frontend type-check**

```powershell
pnpm --dir frontend exec tsc -b
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

```powershell
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 4: Run whitespace check**

```powershell
git diff --check
```

Expected: exit code 0.

## Manual Verification

After implementation, rebuild/open the app and verify:

1. `Overlays Studio` -> `Widgets` -> `standings`.
2. A preview-only `Mock` selector is visible with `Práctica`, `Qualy`, `Carrera`.
3. Default is `Carrera`.
4. In `Carrera`, default Standings gap looks like race standings, not best-lap times.
5. Switching to `Práctica` makes the gap column show lap times.
6. Switching to `Qualy` makes the gap column show lap times.
7. Switching back to `Carrera` restores race gaps.
8. The selector does not mark the profile dirty and does not persist.
9. Relative preview is unchanged.

## Required Final Report

Report in Spanish:

- files modified/created;
- checks executed and results;
- checks not executed and why;
- confirmation that no profile/config/schema/backend changes were made;
- confirmation that the preview scenario selector is preview-only;
- remaining risks;
- manual verification steps.

## Review Handoff

After implementation, do not self-approve. The orchestrator will send the diff/report to GLM for review.
