# Overlay Studio V3 Phase 1 Profile and Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a validated, revision-aware V3 profile and user-design format that migrates legacy profiles without changing the production editor yet.

**Architecture:** New Go and TypeScript V3 contracts coexist with `ProfileConfig` V2. Go is the persistence authority, migrations are pure, saves are atomic and conflict-aware, and golden JSON fixtures keep Go/TypeScript wire shapes aligned.

**Tech Stack:** Go encoding/json + crypto/sha256, TypeScript, Vitest, Wails v3 events, JSON files.

---

## Context capsule

- Phase 0 must be green.
- Legacy `ProfileConfig`, `layout:save` and preset services remain operational.
- V3 saves the entire document and allows zero widgets.
- Do not wire the production UI to V3 in this phase.

## Canonical V3 wire contract

Use these names and JSON keys consistently in Go and TypeScript:

```ts
export const PROFILE_SCHEMA_VERSION_V3 = 3 as const;
export type CoreWidgetType = "delta" | "standings" | "relative" | "pedals";
export type DesignSystemId = "vantare-original" | "vantare-crystal";
export type SessionLayoutType = "general" | "practice" | "qualifying" | "race" | "endurance";

export type WidgetLayoutV3 = {
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  aspectLocked: boolean;
};

export type WidgetVisibilityV3 = {
  inPit?: boolean;
  sessionTypes?: Array<"practice" | "qualifying" | "race" | "warmup" | "endurance">;
};

export type WidgetBehaviorV3 = {
  enabled: boolean;
  updateHz: number;
  visibleWhen?: WidgetVisibilityV3;
};

export type WidgetDesignProvenanceV3 = {
  designId: string;
  designName: string;
  origin: "vantare" | "user";
  appliedAt: string;
};

export type WidgetVisualV3 = {
  systemId: DesignSystemId;
  systemVersion: number;
  configVersion: number;
  baseSettings: Record<string, unknown>;
  appearanceOverrides: Record<string, unknown>;
  provenance?: WidgetDesignProvenanceV3;
};

export type WidgetInstanceV3 = {
  id: string;
  type: CoreWidgetType;
  name?: string;
  layout: WidgetLayoutV3;
  behavior: WidgetBehaviorV3;
  content: Record<string, unknown>;
  visual: WidgetVisualV3;
};

export type SessionLayoutV3 = {
  type: SessionLayoutType;
  widgets: WidgetInstanceV3[];
  preservedWidgets?: Array<{
    id: string;
    type: string;
    source: Record<string, unknown>;
  }>;
};

export type ProfileDocumentV3 = {
  schemaVersion: 3;
  id: string;
  name: string;
  displayMode: "racing" | "edit" | "streaming";
  monitorIndex: number;
  layouts: Partial<Record<SessionLayoutType, SessionLayoutV3>> & { general: SessionLayoutV3 };
  source?: { kind?: string; profileId?: string; name?: string };
};
```

Revision is transport metadata, not persisted inside the document:

```ts
export type LoadedProfileDocumentV3 = {
  document: ProfileDocumentV3;
  revision: string;
  migratedFrom?: 0 | 2;
};
```

### Task 1.1: Add Go V3 types without touching V2

**Files:**
- Create: `vantare-v2/pkg/config/profile_v3.go`
- Create: `vantare-v2/pkg/config/profile_v3_test.go`

- [ ] **Step 1: Write the failing JSON round-trip test**

Create `minimalProfileV3()` with a required empty `general` layout and assert:

```go
func TestProfileDocumentV3JSONRoundTrip(t *testing.T) {
	want := minimalProfileV3()
	data, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	var got ProfileDocumentV3
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(want, got) {
		t.Fatalf("round trip mismatch:\nwant: %#v\n got: %#v", want, got)
	}
}
```

Import `reflect`. The repo does not currently depend on `go-cmp`; do not add it.

- [ ] **Step 2: Verify RED**

```powershell
go test ./pkg/config/... -run ProfileDocumentV3JSONRoundTrip -count=1
```

Expected: FAIL because `ProfileDocumentV3` is undefined.

- [ ] **Step 3: Implement exact Go mirrors**

Define:

```go
const ProfileSchemaVersionV3 = 3
const StudioCanvasWidth = 1920
const StudioCanvasHeight = 1080
const StudioMinimumVisible = 32

type WidgetTypeV3 string
type DesignSystemID string

type ProfileDocumentV3 struct {
	SchemaVersion int                       `json:"schemaVersion"`
	ID            string                    `json:"id"`
	Name          string                    `json:"name"`
	DisplayMode   DisplayMode               `json:"displayMode"`
	MonitorIndex  int                       `json:"monitorIndex"`
	Layouts       map[LayoutType]SessionLayoutV3 `json:"layouts"`
	Source        *ProfileSourceMeta        `json:"source,omitempty"`
}

type SessionLayoutV3 struct {
	Type             LayoutType          `json:"type"`
	Widgets          []WidgetInstanceV3  `json:"widgets"`
	PreservedWidgets []PreservedWidgetV3 `json:"preservedWidgets,omitempty"`
}

type PreservedWidgetV3 struct {
	ID     string         `json:"id"`
	Type   string         `json:"type"`
	Source map[string]any `json:"source"`
}

type WidgetInstanceV3 struct {
	ID       string         `json:"id"`
	Type     WidgetTypeV3   `json:"type"`
	Name     string         `json:"name,omitempty"`
	Layout   WidgetLayoutV3 `json:"layout"`
	Behavior WidgetBehaviorV3 `json:"behavior"`
	Content  map[string]any `json:"content"`
	Visual   WidgetVisualV3 `json:"visual"`
}

type WidgetLayoutV3 struct {
	X            int  `json:"x"`
	Y            int  `json:"y"`
	W            int  `json:"w"`
	H            int  `json:"h"`
	ZIndex       int  `json:"zIndex"`
	AspectLocked bool `json:"aspectLocked"`
}

type WidgetBehaviorV3 struct {
	Enabled     bool                `json:"enabled"`
	UpdateHz    int                 `json:"updateHz"`
	VisibleWhen *WidgetVisibilityV3 `json:"visibleWhen,omitempty"`
}

type WidgetVisibilityV3 struct {
	InPit        *bool    `json:"inPit,omitempty"`
	SessionTypes []string `json:"sessionTypes,omitempty"`
}

type WidgetVisualV3 struct {
	SystemID            DesignSystemID              `json:"systemId"`
	SystemVersion       int                         `json:"systemVersion"`
	ConfigVersion       int                         `json:"configVersion"`
	BaseSettings        map[string]any              `json:"baseSettings"`
	AppearanceOverrides map[string]any              `json:"appearanceOverrides"`
	Provenance          *WidgetDesignProvenanceV3   `json:"provenance,omitempty"`
}

type WidgetDesignProvenanceV3 struct {
	DesignID   string `json:"designId"`
	DesignName string `json:"designName"`
	Origin     string `json:"origin"`
	AppliedAt  string `json:"appliedAt"`
}
```

Use named string types and constants for core widget types, design systems and session layouts. Keep all maps/slices JSON-compatible and use `omitempty` only for optional fields shown in the TypeScript contract.

- [ ] **Step 4: Run test and formatting**

```powershell
gofmt -w pkg/config/profile_v3.go pkg/config/profile_v3_test.go
go test ./pkg/config/... -run ProfileDocumentV3JSONRoundTrip -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add pkg/config/profile_v3.go pkg/config/profile_v3_test.go
git commit -m "feat(config): add Overlay Studio profile v3 types"
```

Run the last commands from `vantare-v2`; paths in `git add` are relative to that module.

### Task 1.2: Validate and normalize V3 documents

**Files:**
- Create: `vantare-v2/pkg/config/profile_v3_validate.go`
- Create: `vantare-v2/pkg/config/profile_v3_validate_test.go`

- [ ] **Step 1: Write table-driven failing tests**

Cover these exact cases:

| Case | Result |
|---|---|
| valid empty general layout | valid |
| schema not 3 | error at `schemaVersion` |
| empty profile ID/name | error |
| missing general | error at `layouts.general` |
| layout key/type mismatch | error |
| duplicate widget ID within a layout | error |
| unsupported type inside `widgets` | error |
| unsupported legacy payload inside `preservedWidgets` | valid and preserved |
| unsupported system ID | error |
| system/config version less than 1 | error |
| width or height less than 1 | error |
| fewer than 32 pixels recoverable | error |
| updateHz outside 1..240 | error |
| duplicate zIndex | normalized, not rejected |
| non-contiguous zIndex | normalized to 0..n-1 preserving order |
| nil content/baseSettings/appearanceOverrides | normalized to empty maps |
| profile file larger than 5 MiB | load error before JSON decode |
| more than 128 V3 + preserved widgets in one layout | validation error |
| profile/widget/design ID over 128 chars or name over 160 chars | validation error |
| one content/visual/preserved payload over 256 KiB | validation error |

Use `errors.As` against:

```go
type ProfileValidationError struct {
	Path    string
	Message string
}
```

- [ ] **Step 2: Verify RED**

```powershell
go test ./pkg/config/... -run "ValidateProfileDocumentV3|NormalizeProfileDocumentV3" -count=1
```

Expected: FAIL because validation functions are undefined.

- [ ] **Step 3: Implement pure validation and normalization**

Required signatures:

```go
func ValidateProfileDocumentV3(p *ProfileDocumentV3) error
func NormalizeProfileDocumentV3(p *ProfileDocumentV3) *ProfileDocumentV3
```

Normalization returns a deep copy, sorts widgets by current `zIndex` and original slice order, then rewrites z-indexes from zero. Validation accepts empty widget arrays. Bounds use:

```go
recoverable := layout.X <= StudioCanvasWidth-StudioMinimumVisible &&
	layout.X+layout.W >= StudioMinimumVisible &&
	layout.Y <= StudioCanvasHeight-StudioMinimumVisible &&
	layout.Y+layout.H >= StudioMinimumVisible
```

- [ ] **Step 4: Run tests**

```powershell
gofmt -w pkg/config/profile_v3_validate.go pkg/config/profile_v3_validate_test.go
go test ./pkg/config/... -run "ValidateProfileDocumentV3|NormalizeProfileDocumentV3" -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add pkg/config/profile_v3_validate.go pkg/config/profile_v3_validate_test.go
git commit -m "feat(config): validate Overlay Studio profile v3"
```

### Task 1.3: Migrate legacy JSON deterministically

**Files:**
- Create: `vantare-v2/pkg/config/profile_v3_migrate.go`
- Create: `vantare-v2/pkg/config/profile_v3_migrate_test.go`
- Create: `vantare-v2/pkg/config/testdata/profile-v3-core-widgets-from-v0.golden.json`
- Create: `vantare-v2/pkg/config/testdata/profile-v3-core-widgets-from-v2.golden.json`

- [ ] **Step 1: Write failing golden migration tests**

For both Phase 0 legacy fixtures:

```go
func TestMigrateProfileJSONToV3Golden(t *testing.T) {
	cases := []struct{ source, golden string }{
		{"testdata/profile-v0-core-widgets.json", "testdata/profile-v3-core-widgets-from-v0.golden.json"},
		{"testdata/profile-v2-core-widgets.json", "testdata/profile-v3-core-widgets-from-v2.golden.json"},
	}
	for _, tc := range cases {
		t.Run(tc.source, func(t *testing.T) {
			data, err := os.ReadFile(tc.source)
			if err != nil { t.Fatal(err) }
			doc, from, err := MigrateProfileJSONToV3(data)
			if err != nil { t.Fatal(err) }
			if from != 0 && from != 2 { t.Fatalf("from=%d", from) }
			assertMatchesGolden(t, doc, tc.golden)
		})
	}
}
```

Add a separate invariant test proving both migrations preserve the same four IDs/types/layout coordinates and valid Original/Crystal mapping. V0 uses V3 defaults for data it never stored; V2 preserves its columns/filters/appearance and therefore has a different golden.

- [ ] **Step 2: Verify RED**

```powershell
go test ./pkg/config/... -run MigrateProfileJSONToV3Golden -count=1
```

Expected: FAIL because migration is undefined.

- [ ] **Step 3: Implement version dispatch from raw JSON**

Use a small envelope to inspect `schemaVersion`. Do not call legacy `LoadFile`, because its structs currently discard fields such as `visibleWhen`.

Required signature:

```go
func MigrateProfileJSONToV3(data []byte) (*ProfileDocumentV3, int, error)
```

Rules:

- V3: decode, normalize, validate, return `from=3`.
- V2: prefer `layouts.general.widgets`; migrate every present session layout as a complete document.
- V0: migrate root `widgets` into `layouts.general`.
- Delta, Standings, Relative and Pedals migrate into `widgets`; every other type migrates into `preservedWidgets` with its original decoded object in `source`.
- Preserved widget IDs remain unique across both arrays, survive normalize/save/load unchanged and never enter a V3 registry parser.
- Preserve profile ID, name, mode, monitor and source.
- Widget `enabled`, `updateHz` and `visibleWhen` become behavior.
- Default Hz: Delta/Pedals 30; Standings/Relative 15.
- Position becomes layout; z-index follows source order; `aspectLocked=true`.
- Variant columns/filters/formats/slots are copied into `content` under their named keys.
- Relative legacy filters stay functional content.
- Appearance and non-transient visual props become `visual.baseSettings`; migration initializes `visual.appearanceOverrides` as an empty map.
- Strip `__previewFillHost`, `__engineerTransport`, `mockSessionScenario` and `telemetryMode`.
- `glassmorphism-pro` and `vantare-crystal` become system `vantare-crystal`.
- Every other legacy style becomes `vantare-original`; preserve the old theme as `baseSettings.legacyDesignId` when non-empty.
- Set system/config versions to 1.
- Convert visibility `qual` to `qualifying`.
- Never generate timestamps during migration; provenance is absent unless source JSON already contains stable provenance.
- Add a migration case for `configs/example-racing.json` and assert its `telemetry` and `telemetry-vertical` instances land in `preservedWidgets` and round-trip unchanged.

- [ ] **Step 4: Add the checked-in golden files**

Marshal each normalized result with two-space indentation. Both goldens contain all four widgets, stable z-indexes and no transient props; the V2 golden additionally proves custom columns/filters and both visual systems.

- [ ] **Step 5: Verify determinism and purity**

Add tests that migrate the same bytes twice and compare byte-for-byte marshalled output, and that changing the returned document does not mutate another result.

```powershell
gofmt -w pkg/config/profile_v3_migrate.go pkg/config/profile_v3_migrate_test.go
go test ./pkg/config/... -run "MigrateProfileJSONToV3|ProfileV3Migration" -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add pkg/config/profile_v3_migrate.go pkg/config/profile_v3_migrate_test.go pkg/config/testdata/profile-v3-core-widgets-from-v0.golden.json pkg/config/testdata/profile-v3-core-widgets-from-v2.golden.json
git commit -m "feat(config): migrate legacy profiles to v3"
```

### Task 1.4: Add atomic revision-aware document storage

**Files:**
- Create: `vantare-v2/pkg/config/profile_v3_store.go`
- Create: `vantare-v2/pkg/config/profile_v3_store_test.go`

- [ ] **Step 1: Write failing storage tests**

Cover:

- loading V3 returns SHA-256 revision of on-disk bytes;
- loading V2 migrates in memory and reports `MigratedFrom=2` without modifying disk;
- first successful save of a migrated V0/V2 file creates one sibling `.pre-v3.bak` containing original bytes;
- later saves never overwrite that backup;
- save accepts empty `general.widgets`;
- wrong expected revision returns `ErrProfileConflict` and leaves disk unchanged;
- validation failure leaves disk unchanged;
- write failure leaves disk and in-memory caller document unchanged;
- successful save is atomic and returns the new revision.

- [ ] **Step 2: Verify RED**

```powershell
go test ./pkg/config/... -run ProfileDocumentStore -count=1
```

Expected: FAIL because the store is undefined.

- [ ] **Step 3: Implement the store**

Required API:

```go
var ErrProfileConflict = errors.New("profile revision conflict")

type LoadedProfileV3 struct {
	Document     *ProfileDocumentV3
	Revision     string
	MigratedFrom int
}

type ProfileDocumentStore struct{}

func (ProfileDocumentStore) Load(path string) (*LoadedProfileV3, error)
func (ProfileDocumentStore) Save(path, expectedRevision string, doc *ProfileDocumentV3, migratedFrom int) (string, error)
```

Reuse the package's atomic-write approach, but expose a focused helper rather than calling unexported legacy internals through duplication. Wrap propagated errors with `%w` and path context.

Read at most 5 MiB plus one byte and return a typed size error before unmarshalling oversized input. Apply the same limit to backup/save serialization.

- [ ] **Step 4: Run tests and full config package**

```powershell
gofmt -w pkg/config/profile_v3_store.go pkg/config/profile_v3_store_test.go
go test ./pkg/config/... -run ProfileDocumentStore -count=1
go test ./pkg/config/...
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add pkg/config/profile_v3_store.go pkg/config/profile_v3_store_test.go
git commit -m "feat(config): add revision-aware profile v3 storage"
```

### Task 1.5: Expose a parallel Studio profile service

**Files:**
- Create: `vantare-v2/internal/app/studio_profile_service.go`
- Create: `vantare-v2/internal/app/studio_profile_service_test.go`
- Modify: `vantare-v2/internal/app/profile_service.go`

- [ ] **Step 1: Write failing service tests**

Test these events/payloads through the existing `EventEmitter` test spy:

```text
studio:profile:loaded  -> { document, revision, migratedFrom }
studio:profile:saved   -> { document, revision }
studio:profile:conflict -> { message }
studio:profile:error   -> { operation, message }
```

Assert that a successful save updates the service revision, emits saved only after disk success and calls a supplied `onSaved` callback exactly once with path, document and new revision. Assert empty widget layouts save.

- [ ] **Step 2: Verify RED**

```powershell
go test ./internal/app/... -run StudioProfileService -count=1
```

Expected: FAIL because the service is undefined.

- [ ] **Step 3: Implement the parallel service**

Required constructor and methods:

```go
type StudioProfileSaved struct {
	Path     string
	Document *config.ProfileDocumentV3
	Revision string
}
type StudioProfileService struct {
	path     string
	loaded   *config.LoadedProfileV3
	store    config.ProfileDocumentStore
	emitter  EventEmitter
	onSaved  func(StudioProfileSaved)
}
func NewStudioProfileService(emitter EventEmitter, onSaved func(StudioProfileSaved)) *StudioProfileService
func (s *StudioProfileService) Load(path string) (*config.LoadedProfileV3, error)
func (s *StudioProfileService) Save(expectedRevision string, doc *config.ProfileDocumentV3) error
func (s *StudioProfileService) EmitLoaded()
```

Add a read-only `Path() string` method to legacy `ProfileService` so later integration can synchronize the active path without exposing internal mutation.

- [ ] **Step 4: Run tests**

```powershell
gofmt -w internal/app/studio_profile_service.go internal/app/studio_profile_service_test.go internal/app/profile_service.go
go test ./internal/app/... -run "StudioProfileService|ProfileService" -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add internal/app/studio_profile_service.go internal/app/studio_profile_service_test.go internal/app/profile_service.go
git commit -m "feat(app): add parallel Studio profile service"
```

### Task 1.6: Mirror and validate the V3 contract in TypeScript

**Files:**
- Create: `vantare-v2/frontend/src/overlay/core/profile-document.ts`
- Create: `vantare-v2/frontend/src/overlay/core/profile-document.test.ts`
- Create: `vantare-v2/frontend/src/overlay/core/profile-contract-fixture.test.ts`

- [ ] **Step 1: Write failing parser tests**

Import both Go golden JSON files. Run structural parsing against both, then use the V2-to-V3 golden for the detailed four-widget assertion:

```ts
const parsed = parseProfileDocumentV3(golden);
expect(parsed.schemaVersion).toBe(3);
expect(parsed.layouts.general.widgets.map((widget) => widget.type)).toEqual([
  "delta", "standings", "relative", "pedals",
]);
expect(parsed.layouts.general.widgets[0].visual.systemId).toMatch(/^vantare-/);
```

Add invalid cases matching every Go validation category. TypeScript parser errors must include the same logical path, although wording may differ.

- [ ] **Step 2: Verify RED**

```powershell
pnpm --dir vantare-v2/frontend test -- profile-document.test.ts profile-contract-fixture.test.ts
```

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the exact contract and parser**

Export every type from the canonical contract section plus:

```ts
export class ProfileDocumentValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
  }
}

export function parseProfileDocumentV3(input: unknown): ProfileDocumentV3;
export function cloneProfileDocumentV3(document: ProfileDocumentV3): ProfileDocumentV3;
```

Use explicit type guards; do not add a schema dependency. Reject unknown widget/system/session IDs. Normalize only in Go; TypeScript parsing validates the received canonical form.

- [ ] **Step 4: Run tests and type build**

```powershell
pnpm --dir vantare-v2/frontend test -- profile-document.test.ts profile-contract-fixture.test.ts
pnpm --dir vantare-v2/frontend build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add vantare-v2/frontend/src/overlay/core/profile-document.ts vantare-v2/frontend/src/overlay/core/profile-document.test.ts vantare-v2/frontend/src/overlay/core/profile-contract-fixture.test.ts
git commit -m "feat(frontend): add profile v3 wire contract"
```

### Task 1.7: Replace presets with a parallel versioned design library

**Files:**
- Create: `vantare-v2/internal/app/widget_design_service.go`
- Create: `vantare-v2/internal/app/widget_design_service_test.go`
- Create: `vantare-v2/frontend/src/overlay/core/widget-design.ts`
- Create: `vantare-v2/frontend/src/overlay/core/widget-design.test.ts`

- [ ] **Step 1: Write failing Go migration/service tests**

Define design library version 1 and assert:

- legacy `widget-presets.json` migrates in memory;
- migrated entries become `origin=user`;
- a legacy Crystal alias becomes `systemId=vantare-crystal`;
- save writes `widget-designs.json` atomically;
- delete/rename do not mutate applied profile widgets;
- invalid type/system/version/name is rejected;
- more than 500 saved designs, a design over 256 KiB or overlong IDs/names are rejected;
- list can filter by widget type;
- save events include the full saved design.

- [ ] **Step 2: Implement Go design types/service**

Use this wire shape. `requiredFeature`, when present, is exactly `overlays.basic` or `overlays.advanced`:

```go
type WidgetDesignV1 struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	WidgetType      string         `json:"widgetType"`
	SystemID        string         `json:"systemId"`
	SystemVersion   int            `json:"systemVersion"`
	ConfigVersion   int            `json:"configVersion"`
	Visual          map[string]any `json:"visual"`
	Content         map[string]any `json:"content,omitempty"`
	IncludesContent bool           `json:"includesContent"`
	Origin          string         `json:"origin"`
	RequiredFeature string         `json:"requiredFeature,omitempty"`
	CreatedAt       string         `json:"createdAt,omitempty"`
	UpdatedAt       string         `json:"updatedAt,omitempty"`
}
```

Events are `design:list`, `design:list:response`, `design:save`, `design:saved`, `design:delete`, `design:deleted`, `design:rename`, `design:renamed`, `design:error`. Keep legacy preset handlers registered until Phase 7.

- [ ] **Step 3: Run Go tests**

```powershell
gofmt -w internal/app/widget_design_service.go internal/app/widget_design_service_test.go
go test ./internal/app/... -run WidgetDesignService -count=1
```

Expected: PASS.

- [ ] **Step 4: Write failing TypeScript copy-semantics tests**

Test `applyWidgetDesign(instance, design)`:

- preserves ID, layout, behavior and type;
- replaces system/version/base settings with structured clones and clears appearance overrides;
- replaces content only when `includesContent=true`;
- writes provenance;
- rejects mismatched widget type;
- mutating the design later does not alter the returned widget.

- [ ] **Step 5: Implement TypeScript design functions**

Required exports:

```ts
export type WidgetDesignV1 = {
  id: string;
  name: string;
  widgetType: CoreWidgetType;
  systemId: DesignSystemId;
  systemVersion: number;
  configVersion: number;
  visual: Record<string, unknown>;
  content?: Record<string, unknown>;
  includesContent: boolean;
  origin: "vantare" | "user";
  requiredFeature?: "overlays.basic" | "overlays.advanced";
  createdAt?: string;
  updatedAt?: string;
};
export function applyWidgetDesign(widget: WidgetInstanceV3, design: WidgetDesignV1, appliedAt: string): WidgetInstanceV3;
export function validateWidgetDesign(input: unknown): WidgetDesignV1;
```

The caller supplies `appliedAt` so tests remain deterministic.

- [ ] **Step 6: Run frontend tests and commit**

```powershell
pnpm --dir vantare-v2/frontend test -- widget-design.test.ts
git diff --check
git add vantare-v2/internal/app/widget_design_service.go vantare-v2/internal/app/widget_design_service_test.go vantare-v2/frontend/src/overlay/core/widget-design.ts vantare-v2/frontend/src/overlay/core/widget-design.test.ts
git commit -m "feat(studio): add versioned widget design library"
```

## Phase 1 review gate

- [ ] Run `go test ./pkg/config/... ./internal/app/...`.
- [ ] Run the full frontend tests and build.
- [ ] Compare Go golden JSON with TypeScript parser coverage.
- [ ] Review migration for data loss, alias mapping, transient props and deterministic output.
- [ ] Review atomic-save failure and conflict paths.
- [ ] Confirm empty widget arrays are valid in all V3 layers.
- [ ] Confirm no production UI emits V3 save events yet.
- [ ] Perform the master phase code-review brief.
- [ ] Fix P0/P1 and resolve or record P2 findings.
- [ ] Update `vantare-v2/docs/current-plan.md` and mark Phase 1 green.
