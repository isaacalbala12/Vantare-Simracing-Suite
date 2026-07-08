# WS-11.A2 — Reescribir `widget-design-system.ts` con tokens del HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the runtime resolver `widget-design-system.ts` so the `vantare-crystal` tokens match the HTML reference (`docs/overlay-glassmorphism-pro.html`). This fixes the bug where the cristal design looks black/empty in OBS — the runtime was returning a fallback. The user explicitly decided that the **Vantare brand tokens** (e.g. the specific Vantare red) stay as-is; **other tokens** (background, border, text-muted, radii) are replaced with the HTML values.

**Architecture:** Token-only refactor. No new types. No new files. No behavior changes other than the actual token values. Two token sets live in the file: `BASE_TOKENS` and `VANTARE_CRYSTAL_TOKENS`. The user said:
- Vantare brand tokens (accent red, the specific Vantare palette) stay as-is.
- Other tokens (background, surface, border, text, radii, glow) are replaced with HTML values.

For the test file: assertions that test exact hex values need to be updated to match the new tokens. Assertions that test structure (e.g. "all required keys present") stay.

**Tech Stack:** TypeScript, Vitest (frontend only). No Go changes. No HTML changes (the HTML is the source of truth, we update the code to match).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/src/overlay/widgets/widget-design-system.ts` | Defines `BASE_TOKENS`, `VANTARE_CRYSTAL_TOKENS`, `THEMES` map, and `resolveWidgetDesignSystem(themeId)` function. | Modify `VANTARE_CRYSTAL_TOKENS` values (and possibly `BASE_TOKENS` if user wants) |
| `frontend/src/overlay/widgets/widget-design-system.test.ts` | Tests `resolveWidgetDesignSystem` for `base` and `vantare-crystal`. | Update assertions if exact values changed |
| `docs/superpowers/plans/2026-07-08-ws-11-a2-resolver-tokens.md` | This plan. | (already exists) |
| `docs/current-plan.md` | Living changelog. | Add `## Nota WS-11.A2 (2026-07-08) — Implementation:` |

**NOT touched:**
- `widget-design-gallery.ts`, `style-catalog.ts`: A1 renamed, A3 will update defaults.
- Go code, `pkg/config/profile.go`: no backend changes.
- The HTML file: it's the source of truth, not to be modified.

---

## Task 1: Baseline and verify HTML tokens

**Files:** Read-only.

- [ ] **Step 1: Confirm A1 already committed**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git log --oneline -3
```

Expected: top commit is A1 (`refactor(widgets): rename glassmorphism-pro to vantare-crystal` or similar).

- [ ] **Step 2: Confirm working tree clean except pnpm-workspace.yaml**

```powershell
git status --short
```

Expected: only `M ../pnpm-workspace.yaml` (external, not ours).

- [ ] **Step 3: Re-read the current resolver to know what we're editing**

```powershell
Get-Content "frontend\src\overlay\widgets\widget-design-system.ts"
```

Capture the full file. Identify the exact lines for each token.

- [ ] **Step 4: Re-read the HTML reference for token values**

```powershell
Get-Content "docs\overlay-glassmorphism-pro.html" -TotalCount 30
```

Look at the `:root` block (lines 11-24). The HTML defines:
- `--bg-page: #060608`
- `--accent-red: #e63946`
- `--accent-red-bright: #ff2a3b`
- `--accent-green: #22c55e`
- `--accent-yellow: #f59e0b`
- `--text-main: #ffffff`
- `--text-muted: #999999`
- `--text-dim: #555555`
- `--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`
- `--font-display: 'Plus Jakarta Sans', sans-serif`
- `--font-mono: 'JetBrains Mono', monospace`

For glass effects, the HTML uses (inferred from `.widget-card` line 65):
- `backdrop-filter: blur(24px)`
- `background: rgba(18,18,22,0.82)`
- `border: rgba(255,255,255,0.09)`
- `box-shadow: 0 24px 60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.1)`

- [ ] **Step 5: Run frontend tests baseline**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend test 2>&1 | Tee-Object -FilePath "$env:TEMP\vantare-a2-baseline.log"
```

Expected: 1410/1410 PASS.

- [ ] **Step 6: Run tsc baseline**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend exec tsc -b 2>&1
```

Expected: exit 0.

---

## Task 1.5: Write RED contract test against HTML (P0 — single source of truth)

**Files:**
- Create: `frontend/src/overlay/widgets/widget-design-system.contract.test.ts`

**Why this task exists:** The plan claims the resolver tokens must match `docs/overlay-glassmorphism-pro.html`. Without a test that parses the HTML and asserts the resolver matches, "coincide con el HTML" is unverifiable. The current test file doesn't assert the 9 tokens we'll change. We must write a test FIRST (RED), then change the code (GREEN).

- [ ] **Step 1: Create the contract test file**

Create `frontend/src/overlay/widgets/widget-design-system.contract.test.ts` with this content:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { resolveWidgetDesignSystem } from "./widget-design-system";

/**
 * Contract test: asserts that the runtime tokens for `vantare-crystal` match
 * the CSS variables defined in `docs/overlay-glassmorphism-pro.html` (`:root`).
 *
 * If the HTML changes, this test fails. The resolver is the "single source of
 * truth" for the runtime OBS, and it must stay in sync with the visual reference.
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

describe("widget-design-system contract with overlay-glassmorphism-pro.html", () => {
  it("vantare-crystal.background matches --bg-page", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.colors.background).toBe(vars.get("--bg-page"));
  });

  it("vantare-crystal.text matches --text-main", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.colors.text).toBe(vars.get("--text-main"));
  });

  it("vantare-crystal.textMuted matches --text-muted", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.colors.textMuted).toBe(vars.get("--text-muted"));
  });

  it("vantare-crystal.textDim matches --text-dim", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.colors.textDim).toBe(vars.get("--text-dim"));
  });

  it("vantare-crystal.displayFont matches --font-display", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.typography.displayFont).toBe(vars.get("--font-display"));
  });

  it("vantare-crystal.bodyFont matches --font-sans", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.typography.bodyFont).toBe(vars.get("--font-sans"));
  });

  it("vantare-crystal.monoFont matches --font-mono", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.typography.monoFont).toBe(vars.get("--font-mono"));
  });
});
```

- [ ] **Step 2: Run the new test (expect RED)**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend test -- widget-design-system.contract 2>&1 | Tee-Object -FilePath "$env:TEMP\vantare-a2-red.log"
```

Expected: FAIL. The current tokens don't match the HTML (e.g. `colors.background` is `#0a0a0a`, HTML is `#060608`). This is the RED we want.

- [ ] **Step 3: Do not commit yet**

We commit at the end of Task 4 with all files.

---

## Task 2: Update VANTARE_CRYSTAL_TOKENS with HTML values

**Files:**
- Modify: `frontend/src/overlay/widgets/widget-design-system.ts:105-155` (the `VANTARE_CRYSTAL_TOKENS` const)

The user said: "los de vantare deberian de dejarse como están, los demas reemplazarse."

Translation: "the Vantare brand tokens should stay as they are, the others should be replaced."

The Vantare brand tokens are the ones that define the Vantare identity: the `accent` red (`#ff3b3b` currently), the Vantare red on glows. These are the "Vantare" tokens.

The "others" are tokens that are generic and should match the HTML reference: background, surface, border, text colors, radii, fonts.

Concretely:
- **KEEP as-is (Vantare brand)**:
  - `colors.accent: "#ff3b3b"` (Vantare red)
  - `colors.negative: "#ff2a3b"` (Vantare bright red, used for negative deltas)
  - `glow.accent: "0 0 10px rgba(255,59,59,.5)"` (Vantare red glow)

- **REPLACE with HTML values**:
  - `colors.background: "#0a0a0a"` → `"#060608"` (from HTML `--bg-page`)
  - `colors.surface: "#0F0F0F"` → `"#121216"` (from HTML widget-card bg)
  - `colors.border: "#1E1E1E"` → `"rgba(255,255,255,0.09)"` (from HTML widget-card border)
  - `colors.text: "#f5f5f5"` → `"#ffffff"` (from HTML `--text-main`)
  - `colors.textMuted: "rgba(245,245,245,.6)"` → `"#999999"` (from HTML `--text-muted`)
  - `colors.textDim: "rgba(245,245,245,.35)"` → `"#555555"` (from HTML `--text-dim`)
  - `typography.displayFont: "'Plus Jakarta Sans',sans-serif"` (already matches HTML)
  - `typography.bodyFont: "'Inter',-apple-system,sans-serif"` → `"'Inter', -apple-system, BlinkMacSystemFont, sans-serif"` (from HTML `--font-sans`)
  - `typography.monoFont: "'JetBrains Mono',monospace"` (already matches HTML)
  - `surfaces.card: "rgba(20,20,20,.55)"` → `"rgba(18,18,22,0.82)"` (from HTML `.widget-card`)
  - `surfaces.panel: "#141414"` → keep (no direct HTML equivalent, but stylistically consistent)
  - `surfaces.header: "linear-gradient(180deg,rgba(255,255,255,.03),transparent)"` (keep, consistent with HTML patterns)
  - `surfaces.rowEven: "rgba(255,255,255,.015)"` → **KEEP** (HTML `.row:nth-child(even)` is `rgba(255,255,255,0.015)` — already correct, no change needed)
  - `surfaces.rowOdd: "rgba(0,0,0,.25)"` (keep, matches HTML `.row:nth-child(odd)` which is `rgba(0,0,0,0.25)`)
  - `surfaces.playerHighlight: "linear-gradient(90deg,rgba(255,42,59,.22),rgba(230,57,70,.05))"` (keep, uses Vantare red)
  - `surfaces.lockedOverlay: "rgba(0,0,0,.2)"` (keep)
  - `radius: { sm: "4px", md: "8px", lg: "12px", xl: "16px" }` (already matches HTML conventions)

- [ ] **Step 1: Replace `colors.background`**

Find line 110 in `widget-design-system.ts`:
```ts
    background: "#0a0a0a",
```
Replace with:
```ts
    background: "#060608",
```

- [ ] **Step 2: Replace `colors.surface`**

Find line 111:
```ts
    surface: "#0F0F0F",
```
Replace with:
```ts
    surface: "#121216",
```

- [ ] **Step 3: Replace `colors.border`**

Find line 112:
```ts
    border: "#1E1E1E",
```
Replace with:
```ts
    border: "rgba(255,255,255,0.09)",
```

- [ ] **Step 4: Replace `colors.text`**

Find line 113:
```ts
    text: "#f5f5f5",
```
Replace with:
```ts
    text: "#ffffff",
```

- [ ] **Step 5: Replace `colors.textMuted`**

Find line 114:
```ts
    textMuted: "rgba(245,245,245,.6)",
```
Replace with:
```ts
    textMuted: "#999999",
```

- [ ] **Step 6: Replace `colors.textDim`**

Find line 115:
```ts
    textDim: "rgba(245,245,245,.35)",
```
Replace with:
```ts
    textDim: "#555555",
```

- [ ] **Step 7: Update `typography.bodyFont`**

Find line 142:
```ts
    bodyFont: "'Inter',-apple-system,sans-serif",
```
Replace with:
```ts
    bodyFont: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
```

- [ ] **Step 8: Update `surfaces.card`**

Find line 132:
```ts
    card: "rgba(20,20,20,.55)",
```
Replace with:
```ts
    card: "rgba(18,18,22,0.82)",
```

- [ ] **Step 9: Verify the changes visually**

```powershell
Get-Content "frontend\src\overlay\widgets\widget-design-system.ts" | Select-String -Pattern "background|surface|border|text|bodyFont|card|rowEven" | Select-Object LineNumber, Line
```

Expected: see the new values. Verify the Vantare brand tokens (`accent: "#ff3b3b"`, `negative: "#ff2a3b"`, `glow.accent: "0 0 10px rgba(255,59,59,.5)"`) are unchanged.

---

## Task 3: Update test file with new token values

**Files:**
- Modify: `frontend/src/overlay/widgets/widget-design-system.test.ts`

- [ ] **Step 1: Read current test file**

```powershell
Get-Content "frontend\src\overlay\widgets\widget-design-system.test.ts"
```

Identify tests that assert on the changed token values (background, surface, border, text, textMuted, textDim, bodyFont, card, rowEven).

- [ ] **Step 2: Run tests to see what fails**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend test -- widget-design-system 2>&1 | Tee-Object -FilePath "$env:TEMP\vantare-a2-test-fail.log"
```

Expected: some tests fail with the old token values.

- [ ] **Step 3: Update assertions for changed tokens**

For each failing test, update the expected value to match the new token. Examples:
- `expect(tokens.colors.background).toBe("#0a0a0a")` → `expect(tokens.colors.background).toBe("#060608")`
- `expect(tokens.colors.surface).toBe("#0F0F0F")` → `expect(tokens.colors.surface).toBe("#121216")`
- `expect(tokens.colors.border).toBe("#1E1E1E")` → `expect(tokens.colors.border).toBe("rgba(255,255,255,0.09)")`
- `expect(tokens.colors.text).toBe("#f5f5f5")` → `expect(tokens.colors.text).toBe("#ffffff")`
- `expect(tokens.colors.textMuted).toBe("rgba(245,245,245,.6)")` → `expect(tokens.colors.textMuted).toBe("#999999")`
- `expect(tokens.colors.textDim).toBe("rgba(245,245,245,.35)")` → `expect(tokens.colors.textDim).toBe("#555555")`
- `expect(tokens.typography.bodyFont).toBe("'Inter',-apple-system,sans-serif")` → `expect(tokens.typography.bodyFont).toBe("'Inter', -apple-system, BlinkMacSystemFont, sans-serif")`
- `expect(tokens.surfaces.card).toBe("rgba(20,20,20,.55)")` → `expect(tokens.surfaces.card).toBe("rgba(18,18,22,0.82)")`
- `expect(tokens.surfaces.rowEven).toBe("rgba(255,255,255,.015)")` → `expect(tokens.surfaces.rowEven).toBe("rgba(255,255,255,0.03)")`

The exact set of edits depends on what the test file currently asserts. The worker must read the file and update each failing assertion.

- [ ] **Step 4: Verify all assertions for Vantare brand tokens are unchanged**

The test file should still assert:
- `accent: "#ff3b3b"` (Vantare red, kept)
- `negative: "#ff2a3b"` (Vantare bright red, kept)
- `glow.accent: "0 0 10px rgba(255,59,59,.5)"` (Vantare glow, kept)

If any test was asserting the OLD values for these (e.g. `#e63946`), update to the kept values.

- [ ] **Step 5: Run widget-design-system tests to verify all pass**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend test -- widget-design-system 2>&1
```

Expected: all widget-design-system tests PASS.

- [ ] **Step 6: Run full test suite**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend test 2>&1 | Tee-Object -FilePath "$env:TEMP\vantare-a2-full.log"
```

Expected: 1410/1410 PASS. If any other test asserts on the changed tokens, fix it (e.g. visual compare scripts, widget-appearance tests).

---

## Task 4: Run tsc, lint, diff-check

**Files:** none modified in this task.

- [ ] **Step 1: Run tsc**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend exec tsc -b 2>&1
```

Expected: exit 0.

- [ ] **Step 2: Run lint**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
corepack pnpm --dir frontend lint 2>&1
```

Expected: no new errors. Pre-existing warnings OK.

- [ ] **Step 3: Run diff-check**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git diff --check -- frontend
```

Expected: clean (exit 0).

- [ ] **Step 4: Verify only intended files modified**

```powershell
git status --short
```

Expected:
- `M frontend/src/overlay/widgets/widget-design-system.ts`
- `M frontend/src/overlay/widgets/widget-design-system.test.ts`
- `M ../pnpm-workspace.yaml` (external, not ours)
- No other files modified by us.

---

## Task 5: Commit and document

**Files:**
- Modify: `docs/current-plan.md` (append note)
- Modify: `docs/superpowers/plans/2026-07-08-ws-11-a2-resolver-tokens.md` (this plan; add implementation log)

- [ ] **Step 1: Stage and commit code changes**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git add frontend/src/overlay/widgets/widget-design-system.ts `
           frontend/src/overlay/widgets/widget-design-system.test.ts
git status --short
```

Expected: 2 frontend files staged.

```powershell
git diff --cached --check
```

Expected: clean.

```powershell
git commit -m "fix(overlay): align vantare-crystal resolver tokens with HTML reference

VANTARE_CRYSTAL_TOKENS had drifted from the visual reference in
docs/overlay-glassmorphism-pro.html. The runtime was returning token
values that no longer matched the hub preview, causing the cristal
design to render with stale colors in OBS. (NOT a fallback issue:
the resolver did return VANTARE_CRYSTAL_TOKENS for the correct themeId,
but the values themselves had drifted from the spec.)

User decision: Vantare brand tokens (accent #ff3b3b, negative #ff2a3b,
glow accent) stay unchanged. Generic tokens (background, surface, border,
text, text-muted, text-dim, bodyFont, card) replaced with HTML values.
surfaces.rowEven and rowOdd were already correct (verified against
.row:nth-child(even/odd) in the HTML).

Added a contract test (widget-design-system.contract.test.ts) that
parses :root from the HTML and asserts the resolver matches. This is
the single source of truth going forward: if the HTML changes, the
test fails.

Tests: 1410/1410 PASS + 7 new contract tests."
```

- [ ] **Step 2: Append note to `docs/current-plan.md`**

Open the file. Append at the end:

```markdown

## Nota WS-11.A2 (2026-07-08) — Implementation:

- Objetivo: alinear tokens del resolver `widget-design-system.ts` con el HTML de referencia `docs/overlay-glassmorphism-pro.html`.
- Cambio: VANTARE_CRYSTAL_TOKENS — los tokens Vantare (accent #ff3b3b, negative #ff2a3b, glow accent) se mantienen. Los tokens genéricos (background, surface, border, text, textMuted, textDim, bodyFont, surfaces.card, surfaces.rowEven) se reemplazan con los valores del HTML.
- Archivos modificados: `widget-design-system.ts`, `widget-design-system.test.ts`.
- Tests: 1410/1410 PASS, tsc OK, lint OK.
- Sin cambios en producción ajena al resolver.
- Sin commit, sin tag, sin release.
- Siguiente microcorte: A3 (catálogo de estilos por widget type con defaults del HTML).
```

- [ ] **Step 3: Append implementation log to this plan**

Append at the end of `docs/superpowers/plans/2026-07-08-ws-11-a2-resolver-tokens.md`:

```markdown

## Implementation Log (2026-07-08)

Ejecutado por worker (Fixer) sin commit/tag/release. Skills: vantare-core, test-driven-development, code-review-and-quality.

### Tokens cambiados

| Token | Valor anterior | Valor nuevo | Fuente |
|---|---|---|---|
| `colors.background` | `#0a0a0a` | `#060608` | HTML `--bg-page` |
| `colors.surface` | `#0F0F0F` | `#121216` | HTML `.widget-card` |
| `colors.border` | `#1E1E1E` | `rgba(255,255,255,0.09)` | HTML `.widget-card` |
| `colors.text` | `#f5f5f5` | `#ffffff` | HTML `--text-main` |
| `colors.textMuted` | `rgba(245,245,245,.6)` | `#999999` | HTML `--text-muted` |
| `colors.textDim` | `rgba(245,245,245,.35)` | `#555555` | HTML `--text-dim` |
| `typography.bodyFont` | `'Inter',-apple-system,sans-serif` | `'Inter', -apple-system, BlinkMacSystemFont, sans-serif` | HTML `--font-sans` |
| `surfaces.card` | `rgba(20,20,20,.55)` | `rgba(18,18,22,0.82)` | HTML `.widget-card` |
| `surfaces.rowEven` | `rgba(255,255,255,.015)` | `rgba(255,255,255,0.03)` | HTML `.row` |

### Tokens NO cambiados (Vantare brand)

| Token | Valor | Razón |
|---|---|---|
| `colors.accent` | `#ff3b3b` | Identidad Vantare (decision del usuario) |
| `colors.negative` | `#ff2a3b` | Identidad Vantare (decision del usuario) |
| `glow.accent` | `0 0 10px rgba(255,59,59,.5)` | Identidad Vantare (decision del usuario) |

### Archivos tocados

| Archivo | Acción |
|---|---|
| `frontend/src/overlay/widgets/widget-design-system.ts` | 9 tokens actualizados en `VANTARE_CRYSTAL_TOKENS` |
| `frontend/src/overlay/widgets/widget-design-system.test.ts` | Assertions actualizadas para los 9 tokens |
| `docs/current-plan.md` | Nota `WS-11.A2` añadida |
| `docs/superpowers/plans/2026-07-08-ws-11-a2-resolver-tokens.md` | Implementation log |

### Microcortes completados

- [x] Task 1: Baseline y verificación de tokens del HTML
- [x] Task 2: Actualización de VANTARE_CRYSTAL_TOKENS (9 tokens)
- [x] Task 3: Actualización de test file
- [x] Task 4: tsc, lint, diff-check
- [x] Task 5: Commit y documentación

### Autorevisión

1. ✅ Solo archivos de scope modificados. No se tocó `widget-design-gallery.ts`, `style-catalog.ts`, ni nada de Go.
2. ✅ Tests 1410/1410 PASS, tsc OK, lint OK.
3. ✅ Cero cambios en tokens Vantare brand (accent, negative, glow).
4. ✅ 9 tokens genéricos actualizados con valores del HTML.
5. ✅ `git diff --check` limpio.
6. ✅ Sin commit, sin tag, sin release.
```

- [ ] **Step 4: Stage and commit documentation**

```powershell
cd "C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2"
git add docs/current-plan.md docs/superpowers/plans/2026-07-08-ws-11-a2-resolver-tokens.md
git commit -m "docs(ws-11): A2 resolver tokens implementation log"
```

---

## Self-Review (author checks before handoff)

**1. Spec coverage:**
- Replace generic tokens with HTML values: ✓ Task 2 Steps 1-9.
- Keep Vantare brand tokens: ✓ explicitly stated in Task 2 introduction and verified in Step 10.
- Update tests: ✓ Task 3.
- No Go changes: ✓ File Structure explicitly excludes.
- Documentation: ✓ Task 5.

**2. Placeholder scan:**
- All steps have specific token values and exact line references.
- Test file edits in Task 3 Step 3 use the pattern "for each failing test, update the expected value" with concrete examples. This is acceptable because the test file's exact line numbers and assertions are unknown until we read it; the worker runs the tests, identifies failures, and fixes mechanically.

**3. Type consistency:**
- No new types, functions, or methods introduced. The `DesignSystemTokens` type is unchanged. All edits are string values inside an existing const.

## Implementation Log (2026-07-08)

Ejecutado por worker (Fixer) sin commit/tag/release/push (regla dura del usuario). Skills: vantare-core, test-driven-development, code-review-and-quality.

### Tokens cambiados

| Token | Valor anterior | Valor nuevo | Fuente |
|---|---|---|---|
| `colors.background` | `#0a0a0a` | `#060608` | HTML `--bg-page` |
| `colors.surface` | `#0F0F0F` | `#121216` | HTML `.widget-card` |
| `colors.border` | `#1E1E1E` | `rgba(255,255,255,0.09)` | HTML `.widget-card` |
| `colors.text` | `#f5f5f5` | `#ffffff` | HTML `--text-main` |
| `colors.textMuted` | `rgba(245,245,245,.6)` | `#999999` | HTML `--text-muted` |
| `colors.textDim` | `rgba(245,245,245,.35)` | `#555555` | HTML `--text-dim` |
| `typography.bodyFont` | `'Inter',-apple-system,sans-serif` | `'Inter', -apple-system, BlinkMacSystemFont, sans-serif` | HTML `--font-sans` |
| `typography.displayFont` | `'Plus Jakarta Sans',sans-serif` | `'Plus Jakarta Sans', sans-serif` | HTML `--font-display` (corregido espacio tras coma) |
| `typography.monoFont` | `'JetBrains Mono',monospace` | `'JetBrains Mono', monospace` | HTML `--font-mono` (corregido espacio tras coma) |
| `surfaces.card` | `rgba(20,20,20,.55)` | `rgba(18,18,22,0.82)` | HTML `.widget-card` |

### Tokens NO cambiados (Vantare brand + rowEven/rowOdd)

| Token | Valor | Razón |
|---|---|---|
| `colors.accent` | `#ff3b3b` | Identidad Vantare (decision del usuario) |
| `colors.negative` | `#ff2a3b` | Identidad Vantare (decision del usuario) |
| `glow.accent` | `0 0 10px rgba(255,59,59,.5)` | Identidad Vantare (decision del usuario) |
| `surfaces.rowEven` | `rgba(255,255,255,.015)` | Ya coincide con HTML `.row:nth-child(even)` (no se toca) |
| `surfaces.rowOdd` | `rgba(0,0,0,.25)` | Ya coincide con HTML `.row:nth-child(odd)` (no se toca) |

### Archivos tocados

| Archivo | Acción |
|---|---|
| `frontend/src/overlay/widgets/widget-design-system.ts` | 10 tokens actualizados en `VANTARE_CRYSTAL_TOKENS` |
| `frontend/src/overlay/widgets/widget-design-system.contract.test.ts` | NUEVO: test de contrato que parsea `:root` del HTML y afirma el resolver |
| `docs/current-plan.md` | Nota `WS-11.A2` añadida |
| `docs/superpowers/plans/2026-07-08-ws-11-a2-resolver-tokens.md` | Implementation log |

### Microcortes completados

- [x] Task 1: Baseline y verificación de tokens del HTML
- [x] Task 1.5: RED contract test contra HTML (vía `?raw` import para no requerir node types ni cambiar tsconfig)
- [x] Task 2: Actualización de `VANTARE_CRYSTAL_TOKENS` (10 tokens genéricos + display/mono font)
- [x] Task 3: Verificación de tests (el contract test es la única cobertura de los tokens cambiados; el test existente no los afirmaba)
- [x] Task 4: tsc, lint, diff-check
- [x] Task 5: Documentación (sin commit por regla dura del usuario)

### Desviaciones del plan original

- El plan afirmaba que `displayFont`/`monoFont` "ya coincidían" con el HTML; el contract test (fuente de verdad) reveló que faltaba el espacio tras la coma. Se corrigieron para coincidir exactamente.
- `surfaces.rowEven` NO se cambió (el plan original sugería cambiarlo a `rgba(255,255,255,0.03)`); el usuario lo prohibió explícitamente porque ya coincide con el HTML.
- El contract test usa import `?raw` de Vite en vez de `node:fs`/`__dirname` para no introducir tipos de node ni cambiar `tsconfig` (la app usa `types: ["vite/client"]`).
- La ruta del HTML en el test es `../../../../docs/...` (4 niveles), no `../../../../../docs/...` como decía el plan (el plan contaba un nivel de más).

### Autorevisión

1. ✅ Solo archivos de scope modificados. No se tocó `widget-design-gallery.ts`, `style-catalog.ts`, ni nada de Go.
2. ✅ Tests 1417/1417 PASS (1410 previos + 7 contract), tsc OK, lint OK (0 errores nuevos).
3. ✅ Cero cambios en tokens Vantare brand (accent, negative, glow).
4. ✅ 10 tokens genéricos actualizados con valores del HTML (incluye display/mono font corregidos).
5. ✅ `git diff --check` limpio.
6. ✅ Sin commit, sin tag, sin release, sin push (regla dura del usuario).
