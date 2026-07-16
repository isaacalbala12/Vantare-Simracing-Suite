# Overlay Studio V3 Phase 3 Editor State and Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one deterministic global draft with command-based edits, bounded undo/redo, explicit save, session documents, dirty guards and crash recovery.

**Architecture:** A pure command reducer owns document mutations; a history reducer owns committed snapshots; React store glue owns selection and editor-only preview state. Persistence is accessed through a narrow client interface so state tests do not require Wails.

**Tech Stack:** TypeScript, React hooks/context, Vitest, Testing Library, Wails v3 event adapter, localStorage recovery.

---

## Context capsule

- Phase 2 host and Delta harness are green.
- Production `useOverlayStudioState` remains untouched until Phase 7.
- A canvas drag/resize previews locally and sends one command only at pointer-up.
- Selection, active session, zoom, background and mock/live state are not persisted and do not enter history.

### Task 3.1: Resolve and materialize session layouts

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/session-layouts.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/session-layouts.test.ts`

- [ ] **Step 1: Write failing pure-function tests**

Assert:

- `general` resolves directly;
- a missing session resolves as a deep cloned copy of `general` with the requested type;
- resolving does not mutate or materialize the document;
- materializing writes a full independent layout;
- later general edits do not alter materialized Race;
- copying from one session replaces only the target session;
- empty source layouts copy correctly.

- [ ] **Step 2: Verify RED**

```powershell
pnpm --dir vantare-v2/frontend test -- session-layouts.test.ts
```

Expected: FAIL because module is missing.

- [ ] **Step 3: Implement exact APIs**

```ts
export function resolveSessionLayout(
  document: ProfileDocumentV3,
  type: SessionLayoutType,
): SessionLayoutV3;

export function materializeSessionLayout(
  document: ProfileDocumentV3,
  type: SessionLayoutType,
): ProfileDocumentV3;

export function copySessionLayout(
  document: ProfileDocumentV3,
  source: SessionLayoutType,
  target: SessionLayoutType,
): ProfileDocumentV3;
```

All returned values are independent structured clones. `general` may never be deleted.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- session-layouts.test.ts
git add vantare-v2/frontend/src/hub/overlay-studio/state/session-layouts.ts vantare-v2/frontend/src/hub/overlay-studio/state/session-layouts.test.ts
git commit -m "feat(studio): add independent session layouts"
```

### Task 3.2: Implement the complete command reducer

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-command.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-command.test.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/widget-order.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/widget-order.test.ts`

- [ ] **Step 1: Define the command union in the failing test**

Use a `widgetIds` array even while selection is single:

```ts
export type StudioCommand =
  | { type: "widget/add"; session: SessionLayoutType; widget: WidgetInstanceV3 }
  | { type: "widget/duplicate"; session: SessionLayoutType; widgetIds: readonly string[]; newIds: readonly string[] }
  | { type: "widget/delete"; session: SessionLayoutType; widgetIds: readonly string[] }
  | { type: "widget/layout"; session: SessionLayoutType; widgetIds: readonly string[]; patch: Partial<WidgetLayoutV3> }
  | { type: "widget/behavior"; session: SessionLayoutType; widgetIds: readonly string[]; patch: Partial<WidgetBehaviorV3> }
  | { type: "widget/content"; session: SessionLayoutType; widgetIds: readonly string[]; content: Record<string, unknown> }
  | { type: "widget/visual"; session: SessionLayoutType; widgetIds: readonly string[]; visual: WidgetVisualV3 }
  | { type: "widget/order"; session: SessionLayoutType; widgetIds: readonly string[]; direction: "front" | "forward" | "backward" | "back" }
  | { type: "widget/reset-section"; session: SessionLayoutType; widgetIds: readonly string[]; section: "design" | "appearance" | "content" | "behavior" | "layout"; saved: ProfileDocumentV3 }
  | { type: "widget/restore-defaults"; session: SessionLayoutType; widgetIds: readonly string[]; defaults: readonly WidgetInstanceV3[] }
  | { type: "session/copy"; source: SessionLayoutType; target: SessionLayoutType };
```

- [ ] **Step 2: Write behavior tests before implementation**

Cover every command plus:

- missing session materializes before first mutation;
- add rejects duplicate IDs;
- duplicate offsets x/y by 16, generates adjacent z-order and preserves content/visual as copies;
- delete permits an empty layout;
- layout patch never edits content/visual/behavior;
- content/visual replacements never edit layout;
- z-order always normalizes to 0..n-1;
- reset section copies only the named saved field;
- Design reset copies system ID/version, config version, base settings and provenance only; Appearance reset copies `appearanceOverrides` only;
- reset on a widget absent from saved snapshot returns unchanged document;
- every command leaves the input deeply unchanged;
- unknown widget IDs are a typed command error, not a silent no-op.

- [ ] **Step 3: Verify RED**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-command.test.ts widget-order.test.ts
```

Expected: FAIL because reducer/order helpers do not exist.

- [ ] **Step 4: Implement pure order helpers**

```ts
export function normalizeWidgetOrder(widgets: readonly WidgetInstanceV3[]): WidgetInstanceV3[];
export function reorderWidgets(
  widgets: readonly WidgetInstanceV3[],
  widgetIds: readonly string[],
  direction: "front" | "forward" | "backward" | "back",
): WidgetInstanceV3[];
```

Preserve relative order among targeted IDs and among untargeted IDs.

- [ ] **Step 5: Implement command reducer**

```ts
export class StudioCommandError extends Error {
  constructor(readonly commandType: StudioCommand["type"], message: string) {
    super(message);
  }
}

export function applyStudioCommand(
  document: ProfileDocumentV3,
  command: StudioCommand,
): ProfileDocumentV3;
```

Use focused helper functions; do not put all command logic in one switch body. Validate final documents with TypeScript V3 parser in development/test paths.

- [ ] **Step 6: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-command.test.ts widget-order.test.ts
git add vantare-v2/frontend/src/hub/overlay-studio/state/studio-command.ts vantare-v2/frontend/src/hub/overlay-studio/state/studio-command.test.ts vantare-v2/frontend/src/hub/overlay-studio/state/widget-order.ts vantare-v2/frontend/src/hub/overlay-studio/state/widget-order.test.ts
git commit -m "feat(studio): add immutable editor commands"
```

### Task 3.3: Add bounded document history and saved snapshot semantics

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-history.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-history.test.ts`

- [ ] **Step 1: Write failing history tests**

Required state:

```ts
export type StudioHistory = {
  past: ProfileDocumentV3[];
  present: ProfileDocumentV3;
  future: ProfileDocumentV3[];
  saved: ProfileDocumentV3;
  limit: number;
};
```

Test:

- initial state is clean and cannot undo/redo;
- one command produces one history entry;
- 500 pointer-preview events are irrelevant because only committed commands reach history;
- undo to saved becomes clean;
- redo becomes dirty;
- saving updates `saved` but preserves past/future history;
- a branch after undo clears future;
- history retains at most 100 past snapshots;
- discard-all restores saved as present and clears both past/future so discarded work cannot return through redo or undo;
- documents are cloned at load boundaries to avoid external mutation.

- [ ] **Step 2: Verify RED**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-history.test.ts
```

- [ ] **Step 3: Implement reducer/API**

```ts
export function createStudioHistory(document: ProfileDocumentV3, limit?: number): StudioHistory;
export function commitStudioCommand(history: StudioHistory, command: StudioCommand): StudioHistory;
export function undoStudioHistory(history: StudioHistory): StudioHistory;
export function redoStudioHistory(history: StudioHistory): StudioHistory;
export function markStudioHistorySaved(history: StudioHistory, saved: ProfileDocumentV3): StudioHistory;
export function discardStudioHistory(history: StudioHistory): StudioHistory;
export function isStudioHistoryDirty(history: StudioHistory): boolean;
```

Use a deterministic structural equality helper. Do not derive dirty state from a mutable boolean.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-history.test.ts
git add vantare-v2/frontend/src/hub/overlay-studio/state/studio-history.ts vantare-v2/frontend/src/hub/overlay-studio/state/studio-history.test.ts
git commit -m "feat(studio): add bounded undo redo history"
```

### Task 3.4: Build the persistence client boundary

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-profile-client.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-profile-client.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Test request correlation, timeout cleanup, event unsubscription and these results:

```ts
export type StudioSaveResult =
  | { status: "saved"; document: ProfileDocumentV3; revision: string }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

export interface StudioProfileClient {
  load(file: string): Promise<LoadedProfileDocumentV3>;
  save(input: { document: ProfileDocumentV3; expectedRevision: string }): Promise<StudioSaveResult>;
}
```

Mock an event transport interface; tests must not import the real Wails runtime.

- [ ] **Step 2: Implement transport injection and Wails factory**

```ts
export type StudioEventTransport = {
  emit(name: string, payload?: unknown): void;
  on(name: string, listener: (payload: unknown) => void): () => void;
};

export function createStudioProfileClient(transport: StudioEventTransport): StudioProfileClient;
export function createWailsStudioEventTransport(): StudioEventTransport;
```

Use Phase 1 event names and include a unique request ID in requests/responses. If Phase 1 Go payload lacks correlation, extend the Go service tests and payload in the same commit.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-profile-client.test.ts
pnpm --dir vantare-v2/frontend build
git add vantare-v2/frontend/src/hub/overlay-studio/state/studio-profile-client.ts vantare-v2/frontend/src/hub/overlay-studio/state/studio-profile-client.test.ts
git commit -m "feat(studio): add profile persistence client"
```

### Task 3.5: Implement the global Studio store

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.tsx`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.test.tsx`

- [ ] **Step 1: Write failing provider/hook tests**

State is split explicitly:

```ts
export type StudioSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export type StudioPreviewState = {
  source: "mock" | "live";
  mockSession: MockSessionScenario;
  mockLocation: MockLocationScenario;
  zoom: "fit" | 50 | 75 | 100 | 125;
  backgroundId: string;
  safeArea: boolean;
};
```

Test load, selection, session switch, command dispatch, undo/redo, explicit save, failed save, conflict, discard all and editor-only preview updates. Assert preview changes never affect dirty/history/document. Loading an old supported visual version upgrades the draft through `upgradeProfileVisualConfigs`, keeps the original as saved snapshot, exposes the migrated widget IDs and therefore requires explicit Save; an unsupported migration gap produces a load error rather than fallback.

- [ ] **Step 2: Verify RED**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-store.test.tsx
```

- [ ] **Step 3: Implement provider with injected client**

Expose:

```ts
export function StudioProvider(props: {
  client: StudioProfileClient;
  initialFile: string;
  children: ReactNode;
}): JSX.Element;

export function useStudioDocument(): {
  document: ProfileDocumentV3 | null;
  activeLayout: SessionLayoutV3 | null;
  activeSession: SessionLayoutType;
  selectedWidgetId: string | null;
  dirty: boolean;
  saveState: StudioSaveState;
  lastError: string | null;
  visuallyMigratedWidgetIds: readonly string[];
  dispatch(command: StudioCommand): void;
  selectWidget(id: string | null): void;
  selectSession(type: SessionLayoutType): void;
  save(): Promise<StudioSaveResult>;
  undo(): void;
  redo(): void;
  discardAll(): void;
};
```

Keep preview state in a second context so frequent canvas/mock changes do not rerender inspector consumers unnecessarily.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-store.test.tsx
git add vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.tsx vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.test.tsx
git commit -m "feat(studio): add global profile draft store"
```

### Task 3.6: Add crash-recovery storage without profile autosave

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-recovery.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-recovery.test.ts`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.tsx`
- Modify: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.test.tsx`

- [ ] **Step 1: Write failing recovery tests**

Use versioned key `vantare:overlay-studio:v3:recovery:<profileId>`. Payload contains document, base revision and capturedAt. Test valid recovery, corrupt JSON cleanup, wrong schema cleanup, stale revision warning, storage quota/security exceptions as non-fatal recovery warnings, clear on successful save/discard and no call to profile client during recovery writes. Accepting recovery builds history with the current disk document as `saved` and recovered document as `present`, so one Undo returns safely to disk state.

- [ ] **Step 2: Implement storage adapter**

```ts
export type StudioRecoveryRecord = {
  version: 1;
  profileId: string;
  baseRevision: string;
  capturedAt: string;
  document: ProfileDocumentV3;
};

export function createStudioRecoveryStore(storage: Storage): {
  read(profileId: string): StudioRecoveryRecord | null;
  write(record: StudioRecoveryRecord): void;
  clear(profileId: string): void;
};
```

The provider schedules local writes after committed document changes, but never invokes `client.save`. Inject clock/timer in tests to avoid sleeping.

- [ ] **Step 3: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-recovery.test.ts studio-store.test.tsx
git add vantare-v2/frontend/src/hub/overlay-studio/state/studio-recovery.ts vantare-v2/frontend/src/hub/overlay-studio/state/studio-recovery.test.ts vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.tsx vantare-v2/frontend/src/hub/overlay-studio/state/studio-store.test.tsx
git commit -m "feat(studio): add local crash draft recovery"
```

### Task 3.7: Add dirty-navigation decisions and keyboard policy

**Files:**
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-navigation-guard.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-navigation-guard.test.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-hotkeys.ts`
- Create: `vantare-v2/frontend/src/hub/overlay-studio/state/studio-hotkeys.test.ts`

- [ ] **Step 1: Write failing navigation tests**

Model decisions independently of modal UI:

```ts
export type DirtyDecision = "save" | "discard" | "cancel";
export async function resolveDirtyNavigation(input: {
  dirty: boolean;
  decide: () => Promise<DirtyDecision>;
  save: () => Promise<StudioSaveResult>;
  discard: () => void;
  continueNavigation: () => void;
}): Promise<"continued" | "cancelled">;
```

Save continues only on `saved`; error/conflict cancel navigation and preserve draft.

- [ ] **Step 2: Write failing hotkey tests**

Policy:

- `Ctrl+S`: save;
- `Ctrl+Z`: undo;
- `Ctrl+Shift+Z`: redo;
- `Delete`: delete selected;
- `Ctrl+D`: duplicate selected;
- arrows: move 1 logical px;
- Shift+arrows: move 8 logical px;
- Escape: cancel current interaction or clear selection;
- no hotkey runs from input, textarea, select or contenteditable;
- `Ctrl+Y` does not redo.

- [ ] **Step 3: Implement pure key mapping and guard orchestration**

```ts
export function getStudioHotkey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "target">): StudioHotkey | null;
```

Leave browser `beforeunload` installation to Phase 4 shell; this task supplies/test the policy only.

- [ ] **Step 4: Run and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- studio-navigation-guard.test.ts studio-hotkeys.test.ts
git add vantare-v2/frontend/src/hub/overlay-studio/state/studio-navigation-guard.ts vantare-v2/frontend/src/hub/overlay-studio/state/studio-navigation-guard.test.ts vantare-v2/frontend/src/hub/overlay-studio/state/studio-hotkeys.ts vantare-v2/frontend/src/hub/overlay-studio/state/studio-hotkeys.test.ts
git commit -m "feat(studio): guard dirty navigation and hotkeys"
```

## Phase 3 review gate

- [ ] Run all state/command tests with random order disabled and repeated twice.
- [ ] Review every command for strict separation among layout, behavior, content and visual.
- [ ] Verify one drag would produce one committed history entry by API design.
- [ ] Verify dirty is derived from saved snapshot and becomes clean on undo-to-save.
- [ ] Verify recovery cannot emit profile saves.
- [ ] Verify failed/conflicting saves preserve the draft.
- [ ] Run full frontend tests/build/lint.
- [ ] Perform the master phase code-review brief.
- [ ] Fix P0/P1 and resolve or record P2 findings.
- [ ] Update `vantare-v2/docs/current-plan.md` and mark Phase 3 green.
