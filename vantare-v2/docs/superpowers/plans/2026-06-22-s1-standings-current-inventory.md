# S1 Standings Current Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inventory the current `Standings` widget before implementing configurable columns, filters, formats and variants.

**Architecture:** This is a read-only technical inventory. The worker must inspect current frontend/backend/data contracts and produce a report that enables the next miniplan (`S2 - Standings catalogo/metricas/columnas`). No implementation is allowed.

**Tech Stack:** React/TypeScript frontend, Go/Wails backend, JSON profiles, Vitest, Go tests.

---

## Scope

Inventory current `Standings` behavior:

- rendered columns and visual structure;
- props/configuration currently supported;
- frontend data source and telemetry shape;
- backend fields available for standings-like data;
- profile/schema usage;
- tests covering `Standings`;
- gaps against the alpha requirement: full customization except multiclass.

## Do Not Edit

Do not modify code.

Do not modify:

- `frontend/src/**`
- `internal/**`
- `pkg/**`
- `configs/**`
- `docs/marketing/**`
- `docs/INTEGRATION_ANALYSIS.md`

Allowed output:

- final report in the worker response;
- optionally create `docs/standings-current-inventory.md` only if explicitly instructed by the orchestrator/user. Otherwise do not create files.

## Required Docs To Read

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/master-feature-plan.md`
- `docs/roadmap-execution-board.md`
- `docs/feature-architecture-map.md`
- `docs/beta-widget-system-spec.md`
- `docs/product-widget-customization.md`
- `docs/relative-current-inventory.md` as reference for inventory style
- `docs/superpowers/plans/2026-06-22-s1-standings-current-inventory.md`

## Task 1: Locate Standings Files

- [ ] **Step 1: Find frontend standings files**

Run:

```powershell
rg --files frontend/src | rg -i "standings|standing"
```

Expected:

- locate `StandingsWidget` and tests if present;
- locate mock telemetry or shared widgets that mention standings.

- [ ] **Step 2: Find backend standings/scoring fields**

Run:

```powershell
rg -n "Standing|Standings|standing|VehicleScoring|BestLap|LastLap|Lap|Class|Gap|Position|Pit|Country|Nationality|Offtrack|Tire|Energy|Fuel|Speed" internal pkg cmd frontend/src
```

Expected:

- list backend/frontend data definitions relevant to `Standings`;
- identify REST/shared-memory fields already present.

- [ ] **Step 3: Find profile/config references**

Run:

```powershell
rg -n "\"standings\"|type.*standings|standings" configs frontend/src internal pkg
```

Expected:

- find profile entries using standings;
- find default props;
- find whether variants already reference standings.

## Task 2: Inspect Current Standings Widget

- [ ] **Step 1: Read widget component**

Read the main `Standings` component and answer:

- What rows does it render?
- What columns does it render?
- Which columns are always visible?
- Which values have fallbacks?
- Which values are color-coded?
- Which CSS classes determine width/truncation/density?
- Does it use `props.appearance`, `props.style`, `range`, filters or hardcoded values?
- Does it already have compact/fill modes?
- Does it use `escapeHTML` or equivalent for driver data?

- [ ] **Step 2: Identify current columns**

Create a table in the final report:

| Column | Source field | Always visible? | Configurable today? | Fallback | Notes |
|---|---|---:|---:|---|---|

Include every currently rendered field.

- [ ] **Step 3: Identify candidate alpha columns**

Using `docs/feature-architecture-map.md` and the original feature list reflected there, classify candidate columns:

| Candidate | Data available? | Current renderer support? | Recommended channel | Notes |
|---|---:|---:|---|---|

Candidates to check:

- position;
- driver name;
- driver number;
- class/category;
- current lap;
- nationality/flag/text;
- positions gained/lost;
- best lap;
- last lap;
- delta laptime;
- tires;
- offtracks;
- interval;
- distance;
- max speed;
- relative time;
- virtual energy/fuel;
- player highlight color;
- pit lap/duration;
- brand logo.

Remember:

- multiclass is out of alpha for `Standings`;
- latest 5/10 laps are out of first closure;
- brand logos are out of first closure unless already trivial;
- do not mark unreliable data as `stable`.

## Task 3: Inspect Data Contracts

- [ ] **Step 1: Inspect frontend telemetry types**

Find TypeScript types/interfaces for standings rows or vehicle scoring.

Answer:

- What fields are available in frontend today?
- Which fields are mock-only?
- Which fields are live-backed?
- Are `bestLapTime` and `lastLapTime` available like they were for `Relative`?

- [ ] **Step 2: Inspect Go telemetry structs**

Find Go structs feeding standings/vehicle data.

Answer:

- Which fields are available from LMU shared memory?
- Which fields come from LMU REST API if any?
- Which fields are computed in Go?
- Which fields would need new backend work?

- [ ] **Step 3: Identify schema/variant needs**

Answer:

- Can `Standings` reuse existing variant schema used by `Relative`?
- Are new fields needed in `ColumnConfig`, filters, or formats?
- Would the first `Standings` configurable cut require backend/schema changes?
- Can first cut be frontend-only plus existing schema v2?

## Task 4: Inspect Tests

- [ ] **Step 1: Find standings tests**

Run:

```powershell
rg --files frontend/src internal pkg | rg -i "standings|standing"
```

Then run focused tests if present:

```powershell
pnpm --dir frontend test -- Standings
```

Expected:

- PASS if tests exist;
- if no tests match, report that clearly.

- [ ] **Step 2: Inspect coverage gaps**

Answer:

- Do tests cover current columns?
- Do tests cover fallbacks?
- Do tests cover player highlight?
- Do tests cover class filters/top N?
- Do tests cover escaping/truncation?
- Do tests cover profile/variant integration?

## Task 5: Compare Against Alpha Requirement

- [ ] **Step 1: Map requirements**

Create a final checklist:

| Requirement | Current status | Needs backend? | Needs schema? | Suggested miniplan |
|---|---|---:|---:|---|

Requirements:

- configurable columns;
- filters except multiclass;
- formats;
- colors;
- width/alignment;
- save/load;
- preview correct;
- desktop/OBS render;
- no `LayoutStudio` responsibility leakage.

- [ ] **Step 2: Recommend next miniplans**

Recommend concrete next steps after inventory.

Expected shape:

1. `S2 - Standings catalog/columns`
2. `S3 - Standings variant integration`
3. `S4 - Standings renderer`
4. `S5 - Standings WidgetStudio UI`
5. `S6 - Standings verification/docs`

If backend/schema is required earlier, say so and explain why.

## Task 6: Final Report

- [ ] **Step 1: Write report in Spanish**

The report must include:

- verdict: `READY FOR S2`, `BLOCKED`, or `NEEDS DECISION`;
- files inspected;
- commands executed and results;
- commands not executed and why;
- current columns table;
- candidate columns table;
- data availability summary;
- schema/backend needs;
- test coverage gaps;
- risks;
- recommended next miniplans;
- explicit confirmation that no files were modified.

## Acceptance Criteria

This task is complete when:

- all required docs were read;
- current `Standings` files were located and inspected;
- focused tests were run or absence/failure explained;
- report clearly states whether S2 can start;
- no code was modified.

## Stop Conditions

Stop and report if:

- `Standings` component cannot be found;
- tests fail for unknown reasons;
- data contracts contradict docs;
- the first configurable cut appears to require schema/backend changes not covered by current plans.

## Next Step

If verdict is `READY FOR S2`, orchestrator creates:

`docs/superpowers/plans/YYYY-MM-DD-s2-standings-catalog-columns.md`

If verdict is `BLOCKED` or `NEEDS DECISION`, orchestrator asks the user before creating implementation plans.
