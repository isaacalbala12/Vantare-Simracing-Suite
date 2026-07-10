# Overlay Studio V3 Phase 5 Inspector Catalog and Designs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the editor control plane with a capability-driven inspector, real catalog, official/user designs and mutation access enforcement.

**Architecture:** Widget definitions and system registrations publish control capabilities; the inspector derives only non-empty sections. All controls dispatch global commands, while one access policy guards every mutation path and a save-time comparison prevents UI bypasses.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing access-policy module, Wails design events.

---

## Context capsule

- Phase 4 shell/canvas is green.
- Delta is the only registered widget until Phase 6; catalog derives from the registry and expands automatically.
- Base Original and Crystal systems are product pillars and remain previewable. Widget/design entries may independently require `overlays.advanced`.
- Existing premium instances render after entitlement loss, but may not be changed, duplicated or applied.

### Task 5.1: Add declarative control capabilities to registries

**Files:**
- Create: `vantare-v2/frontend/src/overlay/core/inspector-control.ts`
- Create: `vantare-v2/frontend/src/overlay/core/inspector-control.test.ts`
- Modify: `vantare-v2/frontend/src/overlay/core/widget-definition.ts`
- Modify: `vantare-v2/frontend/src/overlay/core/design-system-definition.ts`
- Modify: `vantare-v2/frontend/src/overlay/widget-types/delta/delta-definition.ts`
- Modify: both Delta system manifests

- [ ] **Step 1: Write failing descriptor tests**

Use a hybrid descriptor model:

```ts
export type InspectorControl =
  | { kind: "color"; id: string; labelKey: string; path: string; defaultValue: string }
  | { kind: "range"; id: string; labelKey: string; path: string; min: number; max: number; step: number; defaultValue: number }
  | { kind: "toggle"; id: string; labelKey: string; path: string; defaultValue: boolean }
  | { kind: "select"; id: string; labelKey: string; path: string; options: readonly { value: string; labelKey: string }[]; defaultValue: string };

export type InspectorCapability = {
  appearance: readonly InspectorControl[];
  content: readonly InspectorControl[];
  CustomContentInspector?: ComponentType<CustomInspectorProps>;
  CustomAppearanceInspector?: ComponentType<CustomInspectorProps>;
};
```

Assert duplicate IDs/paths are rejected, defaults pass control constraints and paths cannot target `layout`, `behavior`, `id` or `type` from appearance/content descriptors.

- [ ] **Step 2: Implement descriptor validation**

```ts
export function validateInspectorControls(controls: readonly InspectorControl[]): void;
export function readControlValue(root: Record<string, unknown>, path: string): unknown;
export function writeControlValue(root: Record<string, unknown>, path: string, value: unknown): Record<string, unknown>;
```

Support dot-separated own-properties only; reject `__proto__`, `prototype` and `constructor` path segments.

- [ ] **Step 3: Publish Delta controls**

Delta functional definition has no Content controls. Original and Crystal registrations expose their actually consumed colors/opacity through Appearance descriptors. Every descriptor path must be read by its renderer and covered by a renderer test.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- inspector-control.test.ts DeltaOriginal.test.tsx DeltaCrystal.test.tsx
git add vantare-v2/frontend/src/overlay/core vantare-v2/frontend/src/overlay/widget-types/delta/delta-definition.ts vantare-v2/frontend/src/overlay/design-systems/vantare-original/manifest.ts vantare-v2/frontend/src/overlay/design-systems/vantare-crystal/manifest.ts
git commit -m "feat(studio): declare real inspector capabilities"
```

### Task 5.2: Derive non-empty inspector sections

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/inspector-sections.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/inspector-sections.test.ts`

- [ ] **Step 1: Write failing section tests**

For Delta, expect Design, Appearance, Behavior, Layout and Actions; Content is absent. A synthetic definition with real content controls includes Content. If a system/widget has no renderer compatibility, Design/Appearance are replaced by one unsupported diagnostic rather than empty sections.

- [ ] **Step 2: Implement derivation**

```ts
export type ResolvedInspectorSection = {
  id: InspectorSectionId;
  labelKey: string;
  badge?: string;
};

export function resolveInspectorSections(
  widget: WidgetInstanceV3,
): readonly ResolvedInspectorSection[];
```

Order is fixed: Design, Appearance, Content, Behavior, Layout, Actions.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- inspector-sections.test.ts
git add vantare-v2/frontend/src/hub/overlay-studio/inspector/inspector-sections.ts vantare-v2/frontend/src/hub/overlay-studio/inspector/inspector-sections.test.ts
git commit -m "feat(studio): derive dynamic inspector sections"
```

### Task 5.3: Build inspector rail and section host

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/StudioInspector.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/StudioInspector.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/InspectorRail.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/InspectorRail.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/InspectorSectionFrame.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/components/InspectorSlot.tsx`

- [ ] **Step 1: Write failing UI tests**

Assert:

- rail matches the V10 mini-navigation composition;
- active section alone is mounted;
- selecting another widget resets to its first available section;
- a section disappears immediately when capability disappears;
- enabled/hidden toggle is singular and dispatches behavior command;
- footer reports global dirty state, never a local section save state;
- Reset section dispatches `widget/reset-section` with saved snapshot;
- no section stores a copy of the widget in local React state.

- [ ] **Step 2: Implement rail/frame**

Rail icons use local SVG/inline paths, accessible labels and badges. `InspectorSectionFrame` owns title/help/reset button, but section content receives current widget directly from global store.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- StudioInspector.test.tsx InspectorRail.test.tsx
git add vantare-v2/frontend/src/hub/overlay-studio/inspector vantare-v2/frontend/src/hub/overlay-studio/components/InspectorSlot.tsx
git commit -m "feat(studio): add capability-driven inspector rail"
```

### Task 5.4: Implement Appearance, Behavior, Layout and Actions sections

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/AppearanceSection.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/AppearanceSection.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/BehaviorSection.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/BehaviorSection.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/LayoutSection.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/LayoutSection.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/ActionsSection.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/ActionsSection.test.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/inspector/StudioInspector.tsx`

- [ ] **Step 1: Write Appearance tests**

Descriptor controls write only `visual.appearanceOverrides`, renderer changes immediately through the tested base/override merge, invalid user values are rejected and section Reset restores only appearance overrides. No duplicate top-level design selector appears.

- [ ] **Step 2: Write Behavior tests**

Controls:

- Enabled/hidden (same underlying field as rail toggle);
- updateHz presets 5, 10, 15, 30, 60;
- Advanced numeric input constrained 1..240;
- conditional `inPit` and session types.

Every control dispatches behavior only. Conditional controls are covered by a runtime visibility unit test added to `overlay/core/widget-visibility.test.ts` before being shown.

- [ ] **Step 3: Write Layout tests**

Only aspect lock, center, reset layout and z-order actions appear. There are no inputs with names/labels x, y, width, height, w or h. Unlock is disabled with explanation when widget capability forbids it.

- [ ] **Step 4: Write Actions tests**

Duplicate, delete, restore defaults and discard-all route to the same action/command functions as canvas. Destructive actions confirm. Restore defaults explicitly lists Content/Visual/Behavior and preserves ID/layout.

- [ ] **Step 5: Implement sections and visibility predicate**

```ts
export function isWidgetVisibleV3(
  widget: WidgetInstanceV3,
  snapshot: TelemetrySnapshot,
): boolean;
```

Session and pit logic must be consumed later by Studio/Desktop/OBS lists. Until that predicate test passes, Behavior must not render conditional controls.

- [ ] **Step 6: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- AppearanceSection.test.tsx BehaviorSection.test.tsx LayoutSection.test.tsx ActionsSection.test.tsx widget-visibility.test.ts
git add vantare-v2/frontend/src/hub/overlay-studio/inspector vantare-v2/frontend/src/overlay/core/widget-visibility.ts vantare-v2/frontend/src/overlay/core/widget-visibility.test.ts
git commit -m "feat(studio): add real common inspector sections"
```

### Task 5.5: Centralize mutation access policy and save-time enforcement

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/access/studio-access.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/access/studio-access.test.ts`
- Modify: `vantare-v2/frontend/src/overlay/core/widget-definition.ts`
- Modify: `vantare-v2/frontend/src/overlay/core/widget-design.ts`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.test.tsx`

- [ ] **Step 1: Write an exhaustive mutation matrix test**

Use existing access contexts and assert free/paid/tester outcomes for:

```ts
export type StudioMutation =
  | "add" | "duplicate" | "delete" | "layout" | "behavior"
  | "content" | "visual" | "apply-design" | "apply-all" | "save";
```

Set current V3 tiers explicitly:

- Delta, Standings and Pedals require `overlays.basic`.
- Relative requires `overlays.advanced`.
- Base Original/Crystal renderers are previewable; a design may add its own `requiredFeature`.
- Tester/staff/dev overrides follow existing access policy.

Free users can view/preview a saved Relative but cannot mutate/duplicate it. They may save unrelated free-widget edits only when premium instances are byte-equivalent to the saved snapshot.

- [ ] **Step 2: Implement one policy**

```ts
export function getStudioMutationGate(input: {
  access: AccessContext;
  mutation: StudioMutation;
  widget?: WidgetInstanceV3;
  design?: WidgetDesignV1;
}): FeatureGate;

export function validateDraftAccess(
  access: AccessContext,
  saved: ProfileDocumentV3,
  draft: ProfileDocumentV3,
): { allowed: true } | { allowed: false; widgetIds: string[]; reason: string };
```

Every UI action and store dispatch calls this policy. Save performs the final document comparison even if UI controls were bypassed.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-access.test.ts studio-store.test.tsx
git add vantare-v2/frontend/src/hub/overlay-studio/access vantare-v2/frontend/src/overlay/core/widget-definition.ts vantare-v2/frontend/src/overlay/core/widget-design.ts vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.tsx vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.test.tsx
git commit -m "feat(studio): enforce access on every mutation path"
```

### Task 5.6: Derive the real widget catalog

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/catalog/studio-catalog.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/catalog/studio-catalog.test.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/catalog/AddWidgetDialog.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/catalog/AddWidgetDialog.test.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/components/WidgetListPanel.tsx`

- [ ] **Step 1: Write failing derivation tests**

Catalog derives type, label, default size, inspector capabilities, compatible systems and access from canonical registries. In Phase 5 it returns Delta only because only Delta is registered. A test registers the four definitions in an isolated registry and expects exactly Delta/Standings/Relative/Pedals, with no future legacy entries.

- [ ] **Step 2: Implement catalog/dialog**

Premium entries remain visible with preview and lock explanation. Add applies registry default through `widget/add`, chooses the next z-index, and is blocked by access. There is no manually maintained renderer-ready flag.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-catalog.test.ts AddWidgetDialog.test.tsx WidgetListPanel.test.tsx
git add vantare-v2/frontend/src/hub/overlay-studio/catalog vantare-v2/frontend/src/hub/overlay-studio/components/WidgetListPanel.tsx
git commit -m "feat(studio): derive catalog from widget registry"
```

### Task 5.7: Implement official and user design section

**Files:**
- Create: `vantare-v2/frontend/src/overlay/design-systems/official-designs.ts`
- Create: `vantare-v2/frontend/src/overlay/design-systems/official-designs.test.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/designs/widget-design-client.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/designs/widget-design-client.test.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/DesignSection.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/inspector/DesignSection.test.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/designs/SaveDesignDialog.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/designs/SaveDesignDialog.test.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/inspector/StudioInspector.tsx`

- [ ] **Step 1: Define official Delta designs**

Create at least:

- `delta-original-base` based on `vantare-original`;
- `delta-crystal-base` based on `vantare-crystal`;
- `delta-time-attack` as a named Original design.

They use `includesContent=false`, explicit system/config versions and values accepted by manifest parsers. Official list is labeled “Diseños de Vantare”.

- [ ] **Step 2: Write failing client tests**

The injected transport client correlates list/save/delete/rename events from Phase 1, unsubscribes on timeout and returns validated `WidgetDesignV1` values.

- [ ] **Step 3: Write failing Design section tests**

Assert clear Vantare/User segmentation, compatibility filtering, active provenance indicator, apply as copy into base settings with cleared appearance overrides, save user design from resolved merged settings, rename/delete user design, no layout capture and access locks. `SaveDesignDialog` defaults “include content” to false, makes inclusion explicit when enabled and never captures layout, behavior, ID, session or z-order.

Apply-to-all behavior:

- compatible instances are same widget type and target system registration exists;
- scope is the active session layout only;
- show confirmation with exact affected/skipped count;
- dispatch one history command or one atomic batch command, not N history entries;
- preserve layout/behavior/IDs for every instance.

- [ ] **Step 4: Implement design batch command**

Extend `StudioCommand` with:

```ts
| { type: "widget/apply-design"; session: SessionLayoutType; widgetIds: readonly string[]; design: WidgetDesignV1; appliedAt: string }
```

Reducer calls the tested copy-semantics function for every target in one commit.

- [ ] **Step 5: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- official-designs.test.ts widget-design-client.test.ts DesignSection.test.tsx SaveDesignDialog.test.tsx studio-command.test.ts
git add vantare-v2/frontend/src/overlay/design-systems/official-designs.ts vantare-v2/frontend/src/overlay/design-systems/official-designs.test.ts vantare-v2/frontend/src/hub/overlay-studio/designs vantare-v2/frontend/src/hub/overlay-studio/inspector/DesignSection.tsx vantare-v2/frontend/src/hub/overlay-studio/inspector/DesignSection.test.tsx vantare-v2/frontend/src/hub/overlay-studio/inspector/StudioInspector.tsx vantare-v2/frontend/src/hub/overlay-studio/state/studio-command.ts vantare-v2/frontend/src/hub/overlay-studio/state/studio-command.test.ts
git commit -m "feat(studio): add official and user widget designs"
```

### Task 5.8: Wire Browser View to saved state only

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/browser-view.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/browser-view.test.ts`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/canvas/PreviewSourceControls.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/OverlayStudioV3.tsx`

- [ ] **Step 1: Write failing orchestration tests**

Test clean open, dirty Save then open, dirty Cancel, save failure no open and correct URL encoding. The callback receives the resolved profile file/reference from the active profile entry, never guesses from display name or ID.

- [ ] **Step 2: Implement**

```ts
export async function openBrowserView(input: {
  dirty: boolean;
  profileFile: string;
  baseUrl: string;
  decide: () => Promise<"save" | "cancel">;
  save: () => Promise<StudioSaveResult>;
  open: (url: string) => void;
}): Promise<"opened" | "cancelled" | "failed">;
```

URL is `${baseUrl}/overlay?profile=${encodeURIComponent(profileFile)}`.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- browser-view.test.ts PreviewSourceControls.test.tsx OverlayStudioV3.test.tsx
git add vantare-v2/frontend/src/hub/overlay-studio/browser-view.ts vantare-v2/frontend/src/hub/overlay-studio/browser-view.test.ts vantare-v2/frontend/src/hub/overlay-studio/canvas/PreviewSourceControls.tsx vantare-v2/frontend/src/hub/overlay-studio/OverlayStudioV3.tsx
git commit -m "feat(studio): open Browser View from saved profile"
```

## Phase 5 review gate

- [ ] Run all inspector/catalog/design/access tests.
- [ ] Search inspector for local widget drafts and “Save to widget”; expect no matches.
- [ ] Verify each visible control has a renderer/ViewModel/runtime consumer test.
- [ ] Attempt every premium mutation through direct store dispatch and confirm save-time rejection.
- [ ] Confirm apply-to-all is one undo step and preserves layout.
- [ ] Confirm Browser View never receives the unsaved document.
- [ ] Run full frontend tests/build/lint and visual harness.
- [ ] Perform the master phase code-review brief.
- [ ] Fix P0/P1 and resolve or record P2 findings.
- [ ] Update `vantare-v2/docs/current-plan.md` and mark Phase 5 green.
