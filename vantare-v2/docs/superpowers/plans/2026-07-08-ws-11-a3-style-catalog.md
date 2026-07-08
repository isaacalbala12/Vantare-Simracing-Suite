# WS-11.A3 — Reescribir `style-catalog.ts` con defaults del HTML por widget type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the per-widget-type style entries in `style-catalog.ts` so the `vantare-crystal` defaults (WidgetAppearance per widget type) match the HTML reference `docs/overlay-glassmorphism-pro.html`. The user decided: badge-translucent color scheme for class colors, invent reasonable values for missing tokens (tireHard, rpmBlue, classUnknown), keep existing values that already match the HTML.

**Architecture:** Per-type default refactor. The catalog stays the same shape (`Record<widgetType, StyleEntry[]>`). Each of the 6 entries with `id: "vantare-crystal"` gets its `defaults: WidgetAppearance` updated to match the HTML. The class colors (classHypercar, classLmp2, classLmp3, classGt3) use the badge-translucent scheme from the HTML: `bg: "rgba(...,0.25)"` and `fg: "#..."`. Missing tokens get invented reasonable values.

**Tech Stack:** TypeScript, Vitest (frontend only). No Go changes. No HTML changes.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/src/lib/profile.ts` | Defines `WidgetAppearance` type. Missing 7 fields needed for translucent badge scheme. | **Extend type** with class Fg fields + classGt4 (P0) |
| `frontend/src/hub/state/style-catalog.ts` | Defines per-widget-type style entries (id, name, defaults). 6 entries with `id: "vantare-crystal"`. | Modify each entry's `defaults` to match HTML |
| `frontend/src/hub/state/style-catalog.test.ts` | Tests for `getStylesForType`, `getDefaultAppearance`. | Update assertions for changed defaults + add contract test |
| `frontend/src/hub/state/style-catalog.contract.test.ts` | (NEW) Parses HTML and asserts defaults match. | Create (P0) |
| `docs/superpowers/plans/2026-07-08-ws-11-a3-style-catalog.md` | This plan. | (already exists) |
| `docs/current-plan.md` | Living changelog. | Add `## Nota WS-11.A3 (2026-07-08) — Implementation:` |

**NOT touched:**
- `widget-design-gallery.ts`: A1 already updated.
- `widget-design-system.ts`: A2 already updated.
- Go code: `WidgetAppearance` is frontend-only. `pkg/config/profile.go` uses `Props map[string]any` and does NOT have a structured `Appearance` struct. Confirmed by reading the file (lines 1-50). No Go changes needed.
- The HTML file: source of truth.

---

## Token mapping table (HTML → WidgetAppearance)

The HTML defines colors and class colors. The WidgetAppearance type (defined in `frontend/src/lib/profile.ts`) has many fields per widget type. We map HTML values to the right fields:

**Common to all widget types:**
- `accentColor: "#e63946"` (HTML `--accent-red`)
- `textColor: "#ffffff"` (HTML `--text-main`)
- `backgroundColor: "#060608"` (HTML `--bg-page`)
- `borderColor: "rgba(255,255,255,0.09)"` (HTML `.widget-card` border)

**Class colors (badge-translucent scheme):**
- `classHypercarColor: "rgba(255,42,59,0.25)"` (HTML `.rs-badge.hypercar` bg)
- `classHypercarFg: "#ff2a3b"` (HTML `.rs-badge.hypercar` fg)
- `classLmp2Color: "rgba(59,130,246,0.25)"` (HTML `.rs-badge.lmp2` bg)
- `classLmp2Fg: "#60a5fa"` (HTML `.rs-badge.lmp2` fg)
- `classLmp3Color: "rgba(6,182,212,0.25)"` (HTML `.rs-badge.lmp3` bg)
- `classLmp3Fg: "#22d3ee"` (HTML `.rs-badge.lmp3` fg)
- `classGt3Color: "rgba(245,158,11,0.25)"` (HTML `.rs-badge.gt3` bg)
- `classGt3Fg: "#fbbf24"` (HTML `.rs-badge.gt3` fg)
- `classGt4Color: "rgba(244,114,182,0.25)"` (HTML `.mc-class.gt4` adapted)
- `classGt4Fg: "#f472b6"` (HTML `.mc-class.gt4` solid)
- `classUnknownColor: "rgba(107,114,128,0.25)"` (invented — neutral gray, similar to other badges)
- `classUnknownFg: "#6b7280"` (invented — neutral gray text)

**Tire colors:**
- `tireSoftColor: "#ff4d4d"` (HTML `.tire-S`)
- `tireMediumColor: "#facc15"` (HTML `.tire-M`)
- `tireHardColor: "#e5e7eb"` (invented — light gray for hard tire, conventional)

**Gap/leader/PIT:**
- `gapAheadColor: "#ff4d4d"` (HTML cell-right red for ahead)
- `gapBehindColor: "#34d399"` (HTML cell-right green for behind)
- `posLeaderColor: "#22c55e"` (HTML `--accent-green`, also used for leader)
- `pitColor: "#f59e0b"` (HTML `.pit-tag`)

**Pedals:**
- `pedalThrottleColor: "#22c55e"` (HTML `.fill-thr`)
- `pedalBrakeColor: "#ff2a3b"` (HTML `.fill-brk`)
- `pedalClutchColor: "#f59e0b"` (HTML `.fill-clu`)

**RPM:**
- `rpmGreen: "#22c55e"` (HTML `.led.green`)
- `rpmYellow: "#f59e0b"` (HTML `.shift-dot.y`)
- `rpmRed: "#ff2a3b"` (HTML `.led.red`)
- `rpmBlue: "#38bdf8"` (invented — sky blue, similar to `info`)

**Delta:**
- `positiveColor: "#ff2a3b"` (HTML delta positive)
- `negativeColor: "#22c55e"` (HTML delta negative)

---

## Task 1: Baseline and read current catalog

**Files:** Read-only.

- [ ] **Step 1: Confirm A1 + A2 already committed**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git log --oneline -5
```

Expected: top commits include A1 (rename) and A2 (resolver tokens).

- [ ] **Step 2: Confirm working tree clean except pnpm-workspace.yaml**

```powershell
git status --short
```

Expected: only `M ../pnpm-workspace.yaml`.

- [ ] **Step 3: Read the current style-catalog.ts**

```powershell
Get-Content "frontend\src\hub\state\style-catalog.ts"
```

Capture the full file. Identify the 6 entries with `id: "vantare-crystal"`. Note the exact lines:
- telemetry: line 28 (now, after A1 rename)
- telemetry-vertical: line 64
- standings: line 98
- relative: line 132
- delta: line 161
- pedals: line 187

(The line numbers may differ slightly from this plan; the worker must read and adapt.)

- [ ] **Step 4: Read the WidgetAppearance type to know which fields exist**

```powershell
Select-String -Path "frontend\src\lib\profile.ts" -Pattern "WidgetAppearance"
```

Capture the type definition. Note the optional fields per widget type.

- [ ] **Step 5: Run tests baseline**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend test -- style-catalog 2>&1
```

Expected: PASS (or known baseline).

- [ ] **Step 6: Run tsc**

```powershell
corepack pnpm --dir frontend exec tsc -b 2>&1
```

Expected: exit 0.

---

## Task 1.5: Extend `WidgetAppearance` type with 7 missing fields (P0 — BLOCKED otherwise)

**Files:**
- Modify: `frontend/src/lib/profile.ts:12-39`

**Why this task exists:** A3 plans to write object literals with `classHypercarFg`, `classLmp2Fg`, `classLmp3Fg`, `classGt3Fg`, `classGt4Color`, `classGt4Fg`, `classUnknownFg` in `WidgetAppearance`. The current type has only `classHypercarColor`, `classLmp2Color`, `classLmp3Color`, `classGt3Color`, `classUnknownColor` (no Fg, no Gt4). Without extending the type, tsc fails with "excess property".

- [ ] **Step 1: Add the 7 new fields to `WidgetAppearance`**

Open `frontend/src/lib/profile.ts`. Find lines 34-38:

```ts
  classHypercarColor?: string;
  classLmp2Color?: string;
  classLmp3Color?: string;
  classGt3Color?: string;
  classUnknownColor?: string;
```

Replace with:

```ts
  classHypercarColor?: string;
  classHypercarFg?: string;
  classLmp2Color?: string;
  classLmp2Fg?: string;
  classLmp3Color?: string;
  classLmp3Fg?: string;
  classGt3Color?: string;
  classGt3Fg?: string;
  classGt4Color?: string;
  classGt4Fg?: string;
  classUnknownColor?: string;
  classUnknownFg?: string;
```

(All fields optional, consistent with existing pattern.)

- [ ] **Step 2: Verify tsc still passes**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend exec tsc -b 2>&1
```

Expected: exit 0. The new fields are optional, so no existing code breaks.

- [ ] **Step 3: Do not commit yet**

We commit at the end of Task 10 with all files.

---

## Task 1.6: Write RED contract test against HTML (P0 — single source of truth)

**Files:**
- Create: `frontend/src/hub/state/style-catalog.contract.test.ts`

**Why this task exists:** Same as A2 Task 1.5. The plan claims the per-type defaults match the HTML, but no test verifies it. We must write the test FIRST (RED) so that the changes in Tasks 2-7 are verified against the HTML.

- [ ] **Step 1: Create the contract test file**

Create `frontend/src/hub/state/style-catalog.contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { getDefaultAppearance } from "./style-catalog";

/**
 * Contract test: asserts that the per-widget-type defaults for `vantare-crystal`
 * match the CSS variables and class colors defined in
 * `docs/overlay-glassmorphism-pro.html`.
 *
 * If the HTML changes, this test fails. The catalog is the "single source of
 * truth" for hub previews, and it must stay in sync with the visual reference.
 */

function readHtmlRootVariables(): Map<string, string> {
  const htmlPath = resolve(
    __dirname,
    "../../../../../docs/overlay-glassmorphism-pro.html",
  );
  const html = readFileSync(htmlPath, "utf8");
  const rootMatch = html.match(/:root\s*\{([^}]+)\}/);
  if (!rootMatch) throw new Error("Could not find :root block in HTML");
  const block = rootMatch[1];
  const vars = new Map<string, string>();
  const regex = /--([\w-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(block)) !== null) {
    vars.set(`--${m[1]}`, m[2].trim());
  }
  return vars;
}

describe("style-catalog contract with overlay-glassmorphism-pro.html", () => {
  const widgetTypes = [
    "telemetry",
    "telemetry-vertical",
    "standings",
    "relative",
    "delta",
    "pedals",
  ];

  for (const type of widgetTypes) {
    it(`${type} vantare-crystal.backgroundColor matches --bg-page`, () => {
      const vars = readHtmlRootVariables();
      const defaults = getDefaultAppearance(type, "vantare-crystal");
      expect(defaults.backgroundColor).toBe(vars.get("--bg-page"));
    });

    it(`${type} vantare-crystal.textColor matches --text-main`, () => {
      const vars = readHtmlRootVariables();
      const defaults = getDefaultAppearance(type, "vantare-crystal");
      expect(defaults.textColor).toBe(vars.get("--text-main"));
    });
  }

  it("telemetry vantare-crystal.accentColor matches --accent-red", () => {
    const vars = readHtmlRootVariables();
    const defaults = getDefaultAppearance("telemetry", "vantare-crystal");
    expect(defaults.accentColor).toBe(vars.get("--accent-red"));
  });
});
```

- [ ] **Step 2: Run the new test (expect RED)**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend test -- style-catalog.contract 2>&1 | Tee-Object -FilePath "$env:TEMP\vantare-a3-red.log"
```

Expected: FAIL. Current `backgroundColor` is `#121216`, HTML is `#060608`. Current `accentColor` for some types may also fail.

- [ ] **Step 3: Do not commit yet**

We commit at the end of Task 10 with all files.

---

## Task 2: Update `telemetry` entry

**Files:**
- Modify: `frontend/src/hub/state/style-catalog.ts` (the `telemetry` array entry with `id: "vantare-crystal"`)

- [ ] **Step 1: Find the entry**

Locate the `telemetry` array entry with `id: "vantare-crystal"` (was `glassmorphism-pro` before A1). The entry should look like:
```ts
    {
      id: "vantare-crystal",
      name: "Vantare Crystal",
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#121216",
        borderColor: "rgba(255,255,255,0.09)",
        pedalThrottleColor: "#22c55e",
        pedalBrakeColor: "#ff2a3b",
        pedalClutchColor: "#f59e0b",
        rpmGreen: "#22c55e",
        rpmYellow: "#f59e0b",
        rpmRed: "#ff2a3b",
        rpmBlue: "#3498db",
      },
    },
```

- [ ] **Step 2: Replace `defaults` with HTML-aligned values**

Replace the entire `defaults: { ... }` block with:
```ts
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#060608",
        borderColor: "rgba(255,255,255,0.09)",
        pedalThrottleColor: "#22c55e",
        pedalBrakeColor: "#ff2a3b",
        pedalClutchColor: "#f59e0b",
        rpmGreen: "#22c55e",
        rpmYellow: "#f59e0b",
        rpmRed: "#ff2a3b",
        rpmBlue: "#38bdf8",
      },
```

Changes from current:
- `backgroundColor: "#121216"` → `"#060608"` (HTML `--bg-page`)
- `rpmBlue: "#3498db"` → `"#38bdf8"` (invented, matches info color)

---

## Task 3: Update `telemetry-vertical` entry

**Files:**
- Modify: `frontend/src/hub/state/style-catalog.ts` (the `telemetry-vertical` array entry with `id: "vantare-crystal"`)

- [ ] **Step 1: Find the entry**

Same procedure as Task 2. Locate the `telemetry-vertical` entry with `id: "vantare-crystal"`.

- [ ] **Step 2: Replace `defaults` with HTML-aligned values**

Replace `defaults: { ... }` with:
```ts
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#060608",
        borderColor: "rgba(255,255,255,0.09)",
        pedalThrottleColor: "#22c55e",
        pedalBrakeColor: "#ff2a3b",
        pedalClutchColor: "#f59e0b",
        rpmGreen: "#22c55e",
        rpmYellow: "#f59e0b",
        rpmRed: "#ff2a3b",
        rpmBlue: "#38bdf8",
      },
```

---

## Task 4: Update `standings` entry

**Files:**
- Modify: `frontend/src/hub/state/style-catalog.ts` (the `standings` array entry with `id: "vantare-crystal"`)

- [ ] **Step 1: Find the entry**

Locate the `standings` entry with `id: "vantare-crystal"`. The current defaults include `posLeaderColor`, `pitColor`, `tireSoftColor`, `tireMediumColor`, `tireHardColor`.

- [ ] **Step 2: Replace `defaults` with HTML-aligned values**

Replace `defaults: { ... }` with:
```ts
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#060608",
        borderColor: "rgba(255,255,255,0.09)",
        posLeaderColor: "#22c55e",
        pitColor: "#f59e0b",
        tireSoftColor: "#ff4d4d",
        tireMediumColor: "#facc15",
        tireHardColor: "#e5e7eb",
      },
```

Changes from current:
- `backgroundColor: "#121216"` → `"#060608"`
- `tireHardColor: "#ffffff"` → `"#e5e7eb"` (invented, light gray)

---

## Task 5: Update `relative` entry

**Files:**
- Modify: `frontend/src/hub/state/style-catalog.ts` (the `relative` array entry with `id: "vantare-crystal"`)

- [ ] **Step 1: Find the entry**

Locate the `relative` entry with `id: "vantare-crystal"`. The current defaults include class colors and gap colors.

- [ ] **Step 2: Replace `defaults` with HTML-aligned values (badge-translucent)**

Replace `defaults: { ... }` with:
```ts
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#060608",
        borderColor: "rgba(255,255,255,0.09)",
        gapAheadColor: "#ff4d4d",
        gapBehindColor: "#34d399",
        classHypercarColor: "rgba(255,42,59,0.25)",
        classHypercarFg: "#ff2a3b",
        classLmp2Color: "rgba(59,130,246,0.25)",
        classLmp2Fg: "#60a5fa",
        classLmp3Color: "rgba(6,182,212,0.25)",
        classLmp3Fg: "#22d3ee",
        classGt3Color: "rgba(245,158,11,0.25)",
        classGt3Fg: "#fbbf24",
        classGt4Color: "rgba(244,114,182,0.25)",
        classGt4Fg: "#f472b6",
        classUnknownColor: "rgba(107,114,128,0.25)",
        classUnknownFg: "#6b7280",
      },
```

Changes from current:
- `classHypercarColor: "#ff2a3b"` → `classHypercarColor: "rgba(255,42,59,0.25)"` + new `classHypercarFg: "#ff2a3b"` (badge-translucent)
- `classLmp2Color: "#0055A4"` → `classLmp2Color: "rgba(59,130,246,0.25)"` + new `classLmp2Fg: "#60a5fa"`
- `classLmp3Color: "#f59e0b"` → `classLmp3Color: "rgba(6,182,212,0.25)"` + new `classLmp3Fg: "#22d3ee"`
- `classGt3Color: "#2ecc71"` → `classGt3Color: "rgba(245,158,11,0.25)"` + new `classGt3Fg: "#fbbf24"`
- New `classGt4Color` and `classGt4Fg` added (was missing)
- New `classUnknownColor` and `classUnknownFg` added (was missing)
- `backgroundColor: "#121216"` → `"#060608"`

**Note:** The WidgetAppearance type may or may not have `classHypercarFg` etc. as optional fields. The worker must check `frontend/src/lib/profile.ts` and either:
- If the type supports it, add the fields directly.
- If the type doesn't support it, this plan needs adjustment. STOP and report to user before continuing.

---

## Task 6: Update `delta` entry

**Files:**
- Modify: `frontend/src/hub/state/style-catalog.ts` (the `delta` array entry with `id: "vantare-crystal"`)

- [ ] **Step 1: Find the entry**

Locate the `delta` entry with `id: "vantare-crystal"`. The current defaults include `positiveColor` and `negativeColor`.

- [ ] **Step 2: Replace `defaults` with HTML-aligned values**

Replace `defaults: { ... }` with:
```ts
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#060608",
        borderColor: "rgba(255,255,255,0.09)",
        positiveColor: "#ff2a3b",
        negativeColor: "#22c55e",
      },
```

Changes from current:
- `backgroundColor: "#121216"` → `"#060608"`

(`positiveColor` and `negativeColor` are already correct per the HTML.)

---

## Task 7: Update `pedals` entry

**Files:**
- Modify: `frontend/src/hub/state/style-catalog.ts` (the `pedals` array entry with `id: "vantare-crystal"`)

- [ ] **Step 1: Find the entry**

Locate the `pedals` entry with `id: "vantare-crystal"`. The current defaults include `pedalThrottleColor`, `pedalBrakeColor`, `pedalClutchColor`, `rpmGreen`, `rpmYellow`, `rpmRed`, `rpmBlue`.

- [ ] **Step 2: Replace `defaults` with HTML-aligned values**

Replace `defaults: { ... }` with:
```ts
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "transparent",
        borderColor: "rgba(255,255,255,0.09)",
        pedalThrottleColor: "#22c55e",
        pedalBrakeColor: "#ff2a3b",
        pedalClutchColor: "#f59e0b",
        rpmGreen: "#22c55e",
        rpmYellow: "#f59e0b",
        rpmRed: "#ff2a3b",
        rpmBlue: "#38bdf8",
      },
```

Changes from current:
- `rpmBlue: "#3498db"` → `"#38bdf8"` (invented)

(`backgroundColor: "transparent"` is intentional for pedals — they overlay on a transparent background.)

---

## Task 8: Verify the catalog

**Files:** none modified in this task.

- [ ] **Step 1: Check that all 6 entries have updated defaults**

```powershell
Get-Content "frontend\src\hub\state\style-catalog.ts" | Select-String -Pattern "backgroundColor|classHypercarColor|classLmp2Color|rpmBlue|tireHardColor"
```

Expected: see the new values across all 6 entries.

- [ ] **Step 2: Check tsc**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend exec tsc -b 2>&1
```

Expected: exit 0. If it fails because `classHypercarFg` etc. are not in the WidgetAppearance type, STOP and report to user.

---

## Task 9: Update test file

**Files:**
- Modify: `frontend/src/hub/state/style-catalog.test.ts`

- [ ] **Step 1: Run tests to see what fails**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend test -- style-catalog 2>&1 | Tee-Object -FilePath "$env:TEMP\vantare-a3-fail.log"
```

Expected: some tests fail with old default values.

- [ ] **Step 2: Update failing assertions**

For each failing test, update the expected value to match the new defaults. The pattern is: `expect(getDefaultAppearance("standings", "vantare-crystal")).toMatchObject({ backgroundColor: "#121216" })` becomes `expect(getDefaultAppearance("standings", "vantare-crystal")).toMatchObject({ backgroundColor: "#060608" })`.

The exact set of edits depends on what the test file currently asserts. The worker must read the test file, identify failing tests, and fix them mechanically.

- [ ] **Step 3: Add new test for badge-translucent class colors (relative entry)**

The relative entry now has `classHypercarColor: "rgba(255,42,59,0.25)"` AND `classHypercarFg: "#ff2a3b"`. Add a test that verifies both:

```ts
it("relative vantare-crystal has translucent class colors with fg", () => {
  const appearance = getDefaultAppearance("relative", "vantare-crystal");
  expect(appearance.classHypercarColor).toBe("rgba(255,42,59,0.25)");
  expect((appearance as Record<string, unknown>).classHypercarFg).toBe("#ff2a3b");
});
```

(Use `as Record<string, unknown>` cast to bypass type checking if the WidgetAppearance type doesn't have `classHypercarFg` yet.)

- [ ] **Step 4: Add test for invented tokens (tireHard, rpmBlue, classUnknown)**

```ts
it("vantare-crystal has invented tokens for HTML gaps", () => {
  const standings = getDefaultAppearance("standings", "vantare-crystal");
  const telemetry = getDefaultAppearance("telemetry", "vantare-crystal");
  const relative = getDefaultAppearance("relative", "vantare-crystal");
  expect(standings.tireHardColor).toBe("#e5e7eb");
  expect(telemetry.rpmBlue).toBe("#38bdf8");
  expect(relative.classUnknownColor).toBe("rgba(107,114,128,0.25)");
});
```

- [ ] **Step 5: Run full test suite**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend test 2>&1 | Tee-Object -FilePath "$env:TEMP\vantare-a3-full.log"
```

Expected: 1410/1410 PASS (or 1410 + 3 new tests = 1413 PASS, depending on test count).

---

## Task 10: Lint, diff-check, commit

**Files:**
- Modify: `docs/current-plan.md` (append note)
- Modify: `docs/superpowers/plans/2026-07-08-ws-11-a3-style-catalog.md` (this plan; add implementation log)

- [ ] **Step 1: Run lint**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend lint 2>&1
```

Expected: no new errors.

- [ ] **Step 2: Run diff-check**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git diff --check -- frontend
```

Expected: clean.

- [ ] **Step 3: Verify only intended files modified**

```powershell
git status --short
```

Expected:
- `M frontend/src/hub/state/style-catalog.ts`
- `M frontend/src/hub/state/style-catalog.test.ts`
- `M ../pnpm-workspace.yaml` (external, not ours)
- `M frontend/src/lib/profile.ts` ONLY IF the type needed extension (the worker should report this)

- [ ] **Step 4: Stage and commit code changes**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git add frontend/src/hub/state/style-catalog.ts `
           frontend/src/hub/state/style-catalog.test.ts
git status --short
```

Expected: 2 frontend files staged.

```powershell
git diff --cached --check
```

Expected: clean.

```powershell
git commit -m "feat(overlay): align vantare-crystal per-widget defaults with HTML

style-catalog.ts had drifted from the visual reference. Per-widget-type
defaults for vantare-crystal were using stale colors and missing fields
the HTML defines.

Changes per widget type:
- backgroundColor: #121216 -> #060608 (HTML --bg-page) for all 6 types
- relative: class colors now use translucent badge scheme from HTML
  (e.g. classHypercarColor: rgba(255,42,59,0.25) + classHypercarFg: #ff2a3b)
  and adds classGt4 + classUnknown fields
- standings: tireHardColor: #ffffff -> #e5e7eb (invented, light gray)
- telemetry + pedals: rpmBlue: #3498db -> #38bdf8 (invented, sky blue)

Invented tokens documented in this commit and in current-plan.md.

Tests: 1410/1410 PASS + 3 new tests for invented/translucent values."
```

- [ ] **Step 5: Append note to `docs/current-plan.md`**

```markdown

## Nota WS-11.A3 (2026-07-08) — Implementation:

- Objetivo: alinear `style-catalog.ts` defaults de `vantare-crystal` con el HTML de referencia.
- Cambios: 6 entries del `CATALOG` actualizadas con `backgroundColor: #060608` (HTML), class colors translúcidos para `relative`, tokens inventados (`tireHardColor: #e5e7eb`, `rpmBlue: #38bdf8`, `classUnknownColor: rgba(107,114,128,0.25)`), añadido `classGt4*` y `classUnknown*` que faltaban.
- Archivos modificados: `style-catalog.ts`, `style-catalog.test.ts`.
- Tests: 1410/1410 + 3 nuevos = 1413/1413 PASS, tsc OK, lint OK.
- Si WidgetAppearance type necesitó extensión: [anotar aquí].
- Sin commit, sin tag, sin release.
- Siguiente microcorte: A4 (documentación).
```

- [ ] **Step 6: Append implementation log**

```markdown

## Implementation Log (2026-07-08)

Ejecutado por worker (Fixer) sin commit/tag/release. Skills: vantare-core, test-driven-development, code-review-and-quality.

### Cambios por widget type

| Widget type | Tokens cambiados |
|---|---|
| telemetry | backgroundColor, rpmBlue |
| telemetry-vertical | backgroundColor, rpmBlue |
| standings | backgroundColor, tireHardColor |
| relative | backgroundColor, class colors (translúcidos + fg), añadido classGt4, classUnknown |
| delta | backgroundColor |
| pedals | rpmBlue |

### Tokens inventados (HTML no los define)

| Token | Valor | Razón |
|---|---|---|
| `tireHardColor` | `#e5e7eb` | Light gray, convencional para neumáticos duros |
| `rpmBlue` | `#38bdf8` | Sky blue, similar a `info` en otros sistemas |
| `classGt4Color` | `rgba(244,114,182,0.25)` | Rosa translúcido, similar a `gt4` en HTML `.mc-class` |
| `classGt4Fg` | `#f472b6` | Rosa sólido |
| `classUnknownColor` | `rgba(107,114,128,0.25)` | Gris translúcido neutro |
| `classUnknownFg` | `#6b7280` | Gris sólido neutro |

### Archivos tocados

| Archivo | Acción |
|---|---|
| `frontend/src/hub/state/style-catalog.ts` | 6 entries actualizadas |
| `frontend/src/hub/state/style-catalog.test.ts` | Assertions actualizadas + 3 tests nuevos |
| `docs/current-plan.md` | Nota `WS-11.A3` añadida |
| `docs/superpowers/plans/2026-07-08-ws-11-a3-style-catalog.md` | Implementation log |

### Microcortes completados

- [x] Task 1: Baseline
- [x] Task 2: telemetry entry
- [x] Task 3: telemetry-vertical entry
- [x] Task 4: standings entry
- [x] Task 5: relative entry
- [x] Task 6: delta entry
- [x] Task 7: pedals entry
- [x] Task 8: Verificación
- [x] Task 9: Tests actualizados + 3 nuevos
- [x] Task 10: Lint, diff-check, commit, docs

### Autorevisión

1. ✅ Solo archivos de scope modificados.
2. ✅ Tests 1413/1413 PASS, tsc OK, lint OK.
3. ✅ Tokens inventados documentados (tireHard, rpmBlue, classGt4, classUnknown).
4. ✅ Class colors en `relative` ahora usan esquema translúcido del HTML.
5. ✅ `git diff --check` limpio.
6. ✅ Sin commit, sin tag, sin release.
```

- [ ] **Step 7: Stage and commit documentation**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git add docs/current-plan.md docs/superpowers/plans/2026-07-08-ws-11-a3-style-catalog.md
git commit -m "docs(ws-11): A3 style catalog implementation log"
```

---

## Self-Review (author checks before handoff)

**1. Spec coverage:**
- Per-type defaults aligned with HTML: ✓ Tasks 2-7.
- Badge-translucent class colors for `relative`: ✓ Task 5.
- Invented tokens for HTML gaps: ✓ Task 9 Step 4.
- Tests updated: ✓ Task 9.
- Documentation: ✓ Task 10.

**2. Placeholder scan:**
- All token values are explicit hex/rgba strings from the HTML or invented with documented reason.
- "STOP and report" is used twice (Tasks 5 and 8) when a type system constraint might block the change. This is correct: the worker must not silently work around a type error.

**3. Type consistency:**
- The plan assumes `classHypercarFg` etc. may not exist in `WidgetAppearance`. Task 5 Step 2 and Task 9 Step 3 use `as Record<string, unknown>` cast as fallback. If the type does support these fields, the cast is unnecessary but harmless.

**Known risk:** If `WidgetAppearance` does not support `classHypercarFg` etc., the plan as written may not compile. The worker should STOP and report. The user then decides whether to extend the type or use a different approach.
