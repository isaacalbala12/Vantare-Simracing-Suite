> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# Widget Profile Schema v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first safe profile schema v2 contract for widget variants and session layouts without implementing Relative UI customization yet.

**Architecture:** Schema v2 introduces `schemaVersion`, `layouts`, `variants`, and source metadata while keeping the existing top-level `widgets` array as a compatibility mirror during the transition. Backend helpers keep `widgets` and `layouts.general.widgets` in sync when saving layout changes, so current overlay rendering and Hub flows keep working. No existing profile is silently rewritten on load; disk migration only happens when a save or explicit profile creation writes a v2 profile.

**Tech Stack:** Go config/profile structs and tests, Wails app profile services, React/TypeScript profile types, Vitest, Go test.

---

## Context

Read before implementation:

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/beta-widget-system-spec.md`
- `docs/product-widget-customization.md`
- `docs/relative-current-inventory.md`
- `pkg/config/profile.go`
- `frontend/src/lib/profile.ts`

Current facts:

- Current persisted profiles use top-level `widgets`.
- `WidgetConfig.Props map[string]any` is not acceptable for advanced columns/templates/variants.
- `WidgetStudio` may edit internal widget configuration and data.
- `LayoutStudio` owns position and size.
- This plan must not touch `RelativeWidget.tsx`, telemetry, metric catalog, or visual editor UI.

Existing dirty tree warning:

- Before starting, run `git status --short`.
- Do not stage or commit unrelated existing changes.
- If working in a dedicated worker worktree, commit after each task.
- If working in the shared dirty tree, skip commits and report scoped diffs instead.

---

## File Structure

Expected created files:

- `pkg/config/testdata/profile-v1-legacy.json`
  - Fixture for the current profile shape without `schemaVersion`.
- `pkg/config/testdata/profile-v2-general-layout.json`
  - Fixture for the new profile shape with `schemaVersion: 2`, `layouts.general`, and `variants`.

Expected modified files:

- `pkg/config/profile.go`
  - Add schema v2 types, layout constants, variant config types, helpers, and compatibility sync.
- `pkg/config/profile_test.go`
  - Add tests for legacy loading, v2 roundtrip, explicit v2 conversion, and widget/layout sync.
- `internal/app/hub_service.go`
  - Create new profiles as v2 profiles while preserving top-level `widgets` compatibility.
- `internal/app/hub_service_test.go`
  - Verify created profiles contain schema v2 fields and list normally.
- `internal/app/profile_service.go`
  - Save layout through config helper so v2 `layouts.general.widgets` stays synced.
- `internal/app/profile_service_test.go`
  - Verify SaveLayout preserves v2 metadata and syncs the general layout.
- `frontend/src/lib/profile.ts`
  - Add TypeScript schema v2 types matching Go.
- `frontend/src/hub/preview/profile-editor.test.ts`
  - Verify existing frontend widget edits preserve v2 layouts/variants metadata.
- `docs/current-plan.md`
  - Update only after implementation succeeds, noting schema v2 foundation status.

Out of scope:

- Do not edit `frontend/src/overlay/widgets/RelativeWidget.tsx`.
- Do not implement Relative column UI.
- Do not add metric catalogs.
- Do not add dependencies.
- Do not change build config.
- Do not remove top-level `widgets` in this cut.

---

## Schema Contract

The first v2 cut uses this compatibility model:

```json
{
  "schemaVersion": 2,
  "id": "custom-racing",
  "name": "Racing",
  "displayMode": "edit",
  "monitorIndex": 0,
  "widgets": [
    {
      "id": "relative",
      "type": "relative",
      "variantId": "variant-relative-default",
      "enabled": true,
      "updateHz": 15,
      "position": { "x": 40, "y": 600, "w": 320, "h": 280 }
    }
  ],
  "layouts": {
    "general": {
      "type": "general",
      "widgets": [
        {
          "id": "relative",
          "type": "relative",
          "variantId": "variant-relative-default",
          "enabled": true,
          "updateHz": 15,
          "position": { "x": 40, "y": 600, "w": 320, "h": 280 }
        }
      ]
    }
  },
  "variants": [
    {
      "id": "variant-relative-default",
      "widgetType": "relative",
      "templateId": "relative-vantare-default",
      "themeId": "vantare-racing",
      "name": "Relative Default"
    }
  ]
}
```

Rules:

- `general` is mandatory for v2 profiles.
- `practice`, `qualifying`, `race`, and `endurance` are allowed optional layout keys.
- `widgets` remains present as a compatibility mirror of `layouts.general.widgets`.
- Layout widgets may have `position`; variants must not have `position`.
- A widget instance may reference `variantId`.
- Variant config may store columns, column groups, slots, filters, formats, and legacy `props`.
- Legacy profiles without `schemaVersion` must still load.
- Loading a legacy profile must not write a migrated file to disk.

---

### Task 1: Go Schema Types And Compatibility Helpers

**Files:**
- Modify: `pkg/config/profile.go`
- Modify: `pkg/config/profile_test.go`
- Create: `pkg/config/testdata/profile-v1-legacy.json`
- Create: `pkg/config/testdata/profile-v2-general-layout.json`

- [ ] **Step 1: Write legacy fixture**

Create `pkg/config/testdata/profile-v1-legacy.json`:

```json
{
  "id": "legacy-racing",
  "name": "Legacy Racing",
  "displayMode": "racing",
  "monitorIndex": 0,
  "widgets": [
    {
      "id": "relative",
      "type": "relative",
      "enabled": true,
      "updateHz": 15,
      "position": { "x": 40, "y": 40, "w": 300, "h": 250 },
      "props": {
        "rangeAhead": 3,
        "rangeBehind": 3,
        "style": "vantare-racing"
      }
    }
  ]
}
```

- [ ] **Step 2: Write v2 fixture**

Create `pkg/config/testdata/profile-v2-general-layout.json`:

```json
{
  "schemaVersion": 2,
  "id": "v2-racing",
  "name": "V2 Racing",
  "displayMode": "edit",
  "monitorIndex": 0,
  "widgets": [
    {
      "id": "relative",
      "type": "relative",
      "variantId": "variant-relative-default",
      "enabled": true,
      "updateHz": 15,
      "position": { "x": 40, "y": 600, "w": 320, "h": 280 }
    }
  ],
  "layouts": {
    "general": {
      "type": "general",
      "widgets": [
        {
          "id": "relative",
          "type": "relative",
          "variantId": "variant-relative-default",
          "enabled": true,
          "updateHz": 15,
          "position": { "x": 40, "y": 600, "w": 320, "h": 280 }
        }
      ]
    }
  },
  "variants": [
    {
      "id": "variant-relative-default",
      "widgetType": "relative",
      "templateId": "relative-vantare-default",
      "themeId": "vantare-racing",
      "name": "Relative Default"
    }
  ]
}
```

- [ ] **Step 3: Add failing config tests**

Append these tests to `pkg/config/profile_test.go`:

```go
func TestLoadLegacyProfileWithoutSchemaVersion(t *testing.T) {
	p, err := config.LoadFile("testdata/profile-v1-legacy.json")
	if err != nil {
		t.Fatal(err)
	}
	if p.SchemaVersion != 0 {
		t.Fatalf("SchemaVersion=%d, want 0 for unchanged legacy file", p.SchemaVersion)
	}
	if len(p.Widgets) != 1 {
		t.Fatalf("Widgets len=%d, want 1", len(p.Widgets))
	}
	if len(p.Layouts) != 0 {
		t.Fatalf("Layouts len=%d, want 0 for unchanged legacy load", len(p.Layouts))
	}
}

func TestLoadSchemaV2Profile(t *testing.T) {
	p, err := config.LoadFile("testdata/profile-v2-general-layout.json")
	if err != nil {
		t.Fatal(err)
	}
	if p.SchemaVersion != config.ProfileSchemaVersionV2 {
		t.Fatalf("SchemaVersion=%d, want %d", p.SchemaVersion, config.ProfileSchemaVersionV2)
	}
	general, ok := p.Layouts[config.LayoutGeneral]
	if !ok {
		t.Fatal("general layout missing")
	}
	if len(general.Widgets) != 1 {
		t.Fatalf("general widgets len=%d, want 1", len(general.Widgets))
	}
	if len(p.Variants) != 1 {
		t.Fatalf("variants len=%d, want 1", len(p.Variants))
	}
	if p.Variants[0].TemplateID != "relative-vantare-default" {
		t.Fatalf("TemplateID=%q", p.Variants[0].TemplateID)
	}
}

func TestConvertProfileToV2CreatesGeneralLayoutAndVariants(t *testing.T) {
	legacy := &config.ProfileConfig{
		ID:           "legacy-racing",
		Name:         "Legacy Racing",
		DisplayMode:  config.ModeRacing,
		MonitorIndex: 0,
		Widgets: []config.WidgetConfig{
			{
				ID:       "relative",
				Type:     "relative",
				Enabled:  true,
				UpdateHz: 15,
				Position: config.Rect{X: 40, Y: 40, W: 300, H: 250},
				Props:    map[string]any{"style": "vantare-racing"},
			},
		},
	}

	converted := config.ConvertProfileToV2(legacy)

	if converted.SchemaVersion != config.ProfileSchemaVersionV2 {
		t.Fatalf("SchemaVersion=%d, want %d", converted.SchemaVersion, config.ProfileSchemaVersionV2)
	}
	if legacy.SchemaVersion != 0 {
		t.Fatalf("legacy mutated: SchemaVersion=%d", legacy.SchemaVersion)
	}
	general := converted.Layouts[config.LayoutGeneral]
	if len(general.Widgets) != 1 {
		t.Fatalf("general widgets len=%d, want 1", len(general.Widgets))
	}
	if len(converted.Widgets) != 1 {
		t.Fatalf("compat widgets len=%d, want 1", len(converted.Widgets))
	}
	if converted.Widgets[0].VariantID == "" {
		t.Fatal("compat widget VariantID is empty")
	}
	if general.Widgets[0].VariantID != converted.Widgets[0].VariantID {
		t.Fatalf("variant mismatch: general=%q compat=%q", general.Widgets[0].VariantID, converted.Widgets[0].VariantID)
	}
	if len(converted.Variants) != 1 {
		t.Fatalf("variants len=%d, want 1", len(converted.Variants))
	}
}

func TestSetGeneralLayoutWidgetsSyncsCompatibilityWidgets(t *testing.T) {
	p := config.ConvertProfileToV2(&config.ProfileConfig{
		ID:          "sync",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}},
		},
	})

	nextWidgets := []config.WidgetConfig{
		{ID: "relative", Type: "relative", VariantID: p.Widgets[0].VariantID, Enabled: true, Position: config.Rect{X: 50, Y: 60, W: 300, H: 280}},
	}
	config.SetGeneralLayoutWidgets(p, nextWidgets)

	if p.Widgets[0].Position.X != 50 {
		t.Fatalf("compat X=%d, want 50", p.Widgets[0].Position.X)
	}
	if p.Layouts[config.LayoutGeneral].Widgets[0].Position.X != 50 {
		t.Fatalf("general X=%d, want 50", p.Layouts[config.LayoutGeneral].Widgets[0].Position.X)
	}
}
```

Add `encoding/json` and `strings` to the imports, then append this serialization test:

```go
func TestWidgetVariantDoesNotSerializePosition(t *testing.T) {
	p := config.ConvertProfileToV2(&config.ProfileConfig{
		ID:          "variant-no-position",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}},
		},
	})

	data, err := json.Marshal(p.Variants[0])
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "position") {
		t.Fatalf("variant serialized position: %s", string(data))
	}
}
```

- [ ] **Step 4: Run tests and verify failure**

Run:

```powershell
go test ./pkg/config
```

Expected: FAIL because `SchemaVersion`, v2 types, and helper functions do not exist yet.

- [ ] **Step 5: Implement v2 types and helpers**

Modify `pkg/config/profile.go`. Add these declarations near the existing profile structs:

```go
const ProfileSchemaVersionV2 = 2

// LayoutType identifies a profile layout by session/use case.
type LayoutType string

const (
	LayoutGeneral    LayoutType = "general"
	LayoutPractice   LayoutType = "practice"
	LayoutQualifying LayoutType = "qualifying"
	LayoutRace       LayoutType = "race"
	LayoutEndurance  LayoutType = "endurance"
)

// ProfileLayout stores positioned widget instances for one layout.
type ProfileLayout struct {
	Type    LayoutType     `json:"type"`
	Widgets []WidgetConfig `json:"widgets"`
}

// ProfileSourceMeta records where a profile came from when copied from a recommended preset.
type ProfileSourceMeta struct {
	Kind      string `json:"kind,omitempty"`
	ProfileID string `json:"profileId,omitempty"`
	Name      string `json:"name,omitempty"`
}

// WidgetVariantConfig stores reusable internal widget configuration.
type WidgetVariantConfig struct {
	ID           string                `json:"id"`
	WidgetType   string                `json:"widgetType"`
	TemplateID   string                `json:"templateId,omitempty"`
	ThemeID      string                `json:"themeId,omitempty"`
	Name         string                `json:"name,omitempty"`
	Slots        []SlotConfig          `json:"slots,omitempty"`
	Columns      []ColumnConfig        `json:"columns,omitempty"`
	ColumnGroups []ColumnGroupConfig   `json:"columnGroups,omitempty"`
	Filters      map[string]any        `json:"filters,omitempty"`
	Formats      map[string]any        `json:"formats,omitempty"`
	Props        map[string]any        `json:"props,omitempty"`
}

type SlotConfig struct {
	ID       string         `json:"id"`
	MetricID string         `json:"metricId"`
	Enabled  bool           `json:"enabled"`
	Format   map[string]any `json:"format,omitempty"`
	Style    map[string]any `json:"style,omitempty"`
}

type ColumnConfig struct {
	ID       string         `json:"id"`
	MetricID string         `json:"metricId"`
	Enabled  bool           `json:"enabled"`
	Width    int            `json:"width,omitempty"`
	Format   map[string]any `json:"format,omitempty"`
	Style    map[string]any `json:"style,omitempty"`
}

type ColumnGroupConfig struct {
	ID      string         `json:"id"`
	Enabled bool           `json:"enabled"`
	Columns []ColumnConfig `json:"columns,omitempty"`
}
```

Update `WidgetConfig`:

```go
type WidgetConfig struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"` // delta | relative | standings
	VariantID string         `json:"variantId,omitempty"`
	Enabled   bool           `json:"enabled"`
	UpdateHz  int            `json:"updateHz,omitempty"`
	Position  Rect           `json:"position"`
	Props     map[string]any `json:"props,omitempty"`
}
```

Update `ProfileConfig`:

```go
type ProfileConfig struct {
	SchemaVersion int                            `json:"schemaVersion,omitempty"`
	ID            string                         `json:"id,omitempty"`
	Name          string                         `json:"name,omitempty"`
	DisplayMode   DisplayMode                    `json:"displayMode"`
	MonitorIndex  int                            `json:"monitorIndex"` // reserved: multi-monitor placement (F9); primary monitor for now
	Widgets       []WidgetConfig                 `json:"widgets"`
	Layouts       map[LayoutType]ProfileLayout   `json:"layouts,omitempty"`
	Variants      []WidgetVariantConfig          `json:"variants,omitempty"`
	Source        *ProfileSourceMeta             `json:"source,omitempty"`
}
```

Add these helpers below `SaveFile`:

```go
// ConvertProfileToV2 returns a v2 copy without mutating the input profile.
func ConvertProfileToV2(p *ProfileConfig) *ProfileConfig {
	if p == nil {
		return nil
	}
	next := *p
	next.SchemaVersion = ProfileSchemaVersionV2
	next.Widgets = copyWidgetsWithDefaultVariants(p.Widgets)
	next.Layouts = map[LayoutType]ProfileLayout{
		LayoutGeneral: {
			Type:    LayoutGeneral,
			Widgets: copyWidgetConfigs(next.Widgets),
		},
	}
	next.Variants = buildDefaultVariants(next.Widgets)
	return &next
}

// SetGeneralLayoutWidgets updates the compatibility widgets mirror and the v2 general layout.
func SetGeneralLayoutWidgets(p *ProfileConfig, widgets []WidgetConfig) {
	if p == nil {
		return
	}
	copied := copyWidgetConfigs(widgets)
	p.Widgets = copyWidgetConfigs(copied)
	if p.SchemaVersion != ProfileSchemaVersionV2 {
		return
	}
	if p.Layouts == nil {
		p.Layouts = map[LayoutType]ProfileLayout{}
	}
	p.Layouts[LayoutGeneral] = ProfileLayout{
		Type:    LayoutGeneral,
		Widgets: copied,
	}
}

// CopyProfileLayouts returns a deep-enough copy for rollback around SaveFile.
func CopyProfileLayouts(layouts map[LayoutType]ProfileLayout) map[LayoutType]ProfileLayout {
	if layouts == nil {
		return nil
	}
	copied := make(map[LayoutType]ProfileLayout, len(layouts))
	for key, layout := range layouts {
		copied[key] = ProfileLayout{
			Type:    layout.Type,
			Widgets: copyWidgetConfigs(layout.Widgets),
		}
	}
	return copied
}

func copyWidgetsWithDefaultVariants(widgets []WidgetConfig) []WidgetConfig {
	copied := copyWidgetConfigs(widgets)
	for i := range copied {
		if copied[i].VariantID == "" {
			copied[i].VariantID = defaultVariantID(copied[i])
		}
	}
	return copied
}

func copyWidgetConfigs(widgets []WidgetConfig) []WidgetConfig {
	if widgets == nil {
		return nil
	}
	copied := make([]WidgetConfig, len(widgets))
	copy(copied, widgets)
	return copied
}

func buildDefaultVariants(widgets []WidgetConfig) []WidgetVariantConfig {
	var variants []WidgetVariantConfig
	seen := map[string]bool{}
	for _, widget := range widgets {
		variantID := widget.VariantID
		if variantID == "" {
			variantID = defaultVariantID(widget)
		}
		if variantID == "" || seen[variantID] {
			continue
		}
		seen[variantID] = true
		variants = append(variants, WidgetVariantConfig{
			ID:         variantID,
			WidgetType: widget.Type,
			TemplateID: defaultTemplateID(widget.Type),
			ThemeID:    defaultThemeID(widget),
			Name:       defaultVariantName(widget),
			Props:      widget.Props,
		})
	}
	return variants
}

func defaultVariantID(widget WidgetConfig) string {
	if widget.ID == "" {
		return ""
	}
	return "variant-" + widget.ID + "-default"
}

func defaultTemplateID(widgetType string) string {
	switch widgetType {
	case "relative":
		return "relative-vantare-default"
	case "standings":
		return "standings-vantare-default"
	case "pedals":
		return "pedals-vantare-default"
	default:
		if widgetType == "" {
			return ""
		}
		return widgetType + "-vantare-default"
	}
}

func defaultVariantName(widget WidgetConfig) string {
	if widget.Type == "" {
		return "Widget Default"
	}
	return widget.Type + " Default"
}
```

- [ ] **Step 6: Add nil-safe theme helper**

Add this helper below `defaultTemplateID`:

```go
func defaultThemeID(widget WidgetConfig) string {
	if widget.Props != nil {
		if style, ok := widget.Props["style"].(string); ok && style != "" {
			return style
		}
	}
	return "vantare-racing"
}
```

- [ ] **Step 7: Run focused Go tests**

Run:

```powershell
gofmt -w pkg/config/profile.go pkg/config/profile_test.go
go test ./pkg/config
```

Expected: PASS.

- [ ] **Step 8: Commit or report scoped diff**

Dedicated clean worker worktree:

```powershell
git add pkg/config/profile.go pkg/config/profile_test.go pkg/config/testdata/profile-v1-legacy.json pkg/config/testdata/profile-v2-general-layout.json
git commit -m "feat: add profile schema v2 contract"
```

Shared dirty tree:

```powershell
git diff -- pkg/config/profile.go pkg/config/profile_test.go pkg/config/testdata/profile-v1-legacy.json pkg/config/testdata/profile-v2-general-layout.json
```

Expected: only schema v2 config files and fixtures appear.

---

### Task 2: Backend Profile Save And Creation Sync

**Files:**
- Modify: `internal/app/hub_service.go`
- Modify: `internal/app/hub_service_test.go`
- Modify: `internal/app/profile_service.go`
- Modify: `internal/app/profile_service_test.go`

- [ ] **Step 1: Add failing HubService test**

Append to `internal/app/hub_service_test.go`:

```go
func TestHubServiceCreateProfileWritesSchemaV2(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	if err := hubSvc.CreateProfile("Schema Two"); err != nil {
		t.Fatal(err)
	}

	loaded, err := config.LoadFile(filepath.Join(dir, "custom-schema-two.json"))
	if err != nil {
		t.Fatal(err)
	}
	if loaded.SchemaVersion != config.ProfileSchemaVersionV2 {
		t.Fatalf("SchemaVersion=%d, want %d", loaded.SchemaVersion, config.ProfileSchemaVersionV2)
	}
	general, ok := loaded.Layouts[config.LayoutGeneral]
	if !ok {
		t.Fatal("general layout missing")
	}
	if len(general.Widgets) != len(loaded.Widgets) {
		t.Fatalf("general widgets=%d, compat widgets=%d", len(general.Widgets), len(loaded.Widgets))
	}
	if len(loaded.Variants) != len(loaded.Widgets) {
		t.Fatalf("variants=%d, widgets=%d", len(loaded.Variants), len(loaded.Widgets))
	}
	if loaded.Widgets[0].Position.W == 0 {
		t.Fatal("created widget lost layout position")
	}
}
```

- [ ] **Step 2: Add failing ProfileService test**

Append to `internal/app/profile_service_test.go`:

```go
func TestProfileServiceSaveLayoutSyncsSchemaV2GeneralLayout(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "v2.json")
	profile := config.ConvertProfileToV2(&config.ProfileConfig{
		ID:          "v2",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	})
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatal(err)
	}

	svc := app.NewProfileService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	updated := []config.WidgetConfig{
		{ID: "relative", Type: "relative", VariantID: profile.Widgets[0].VariantID, Enabled: true, Position: config.Rect{X: 70, Y: 80, W: 320, H: 280}},
	}
	if err := svc.SaveLayout(updated); err != nil {
		t.Fatal(err)
	}

	reloaded, err := config.LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Widgets[0].Position.X != 70 {
		t.Fatalf("compat X=%d, want 70", reloaded.Widgets[0].Position.X)
	}
	if reloaded.Layouts[config.LayoutGeneral].Widgets[0].Position.X != 70 {
		t.Fatalf("general X=%d, want 70", reloaded.Layouts[config.LayoutGeneral].Widgets[0].Position.X)
	}
	if len(reloaded.Variants) != 1 {
		t.Fatalf("variants len=%d, want 1", len(reloaded.Variants))
	}
}
```

Append this rollback test to `internal/app/profile_service_test.go`:

```go
func TestProfileServiceSaveLayoutRestoresSchemaV2LayoutsOnDiskError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "v2-error.json")
	profile := config.ConvertProfileToV2(&config.ProfileConfig{
		ID:          "v2-error",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	})
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatal(err)
	}

	svc := app.NewProfileService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	updated := []config.WidgetConfig{
		{ID: "relative", Type: "relative", VariantID: profile.Widgets[0].VariantID, Enabled: true, Position: config.Rect{X: 99, Y: 88, W: 320, H: 280}},
	}

	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}

	if err := svc.SaveLayout(updated); err == nil {
		t.Fatal("expected save error")
	}
	if svc.GetProfile().Widgets[0].Position.X != 10 {
		t.Fatalf("compat X=%d, want 10 after failed save", svc.GetProfile().Widgets[0].Position.X)
	}
	if svc.GetProfile().Layouts[config.LayoutGeneral].Widgets[0].Position.X != 10 {
		t.Fatalf("general X=%d, want 10 after failed save", svc.GetProfile().Layouts[config.LayoutGeneral].Widgets[0].Position.X)
	}
}
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
go test ./internal/app -run "TestHubServiceCreateProfileWritesSchemaV2|TestProfileServiceSaveLayoutSyncsSchemaV2GeneralLayout"
```

Expected: FAIL because `CreateProfile` still writes v1, `SaveLayout` only assigns `Widgets`, and v2 layout rollback is not protected.

- [ ] **Step 4: Make CreateProfile write v2**

In `internal/app/hub_service.go`, keep the existing `profile := &config.ProfileConfig{...}` block, then convert it before saving:

```go
	profile = config.ConvertProfileToV2(profile)

	return config.SaveFile(path, profile)
```

This replaces the current final line:

```go
	return config.SaveFile(path, profile)
```

- [ ] **Step 5: Sync SaveLayout through config helper**

In `internal/app/profile_service.go`, replace this block:

```go
	backup := s.profile.Widgets
	s.profile.Widgets = widgets
	if err := config.SaveFile(s.path, s.profile); err != nil {
		s.profile.Widgets = backup
		return err
	}
```

with:

```go
	backupWidgets := s.profile.Widgets
	backupLayouts := config.CopyProfileLayouts(s.profile.Layouts)
	config.SetGeneralLayoutWidgets(s.profile, widgets)
	if err := config.SaveFile(s.path, s.profile); err != nil {
		s.profile.Widgets = backupWidgets
		s.profile.Layouts = backupLayouts
		return err
	}
```

- [ ] **Step 6: Run focused backend tests**

Run:

```powershell
gofmt -w internal/app/hub_service.go internal/app/hub_service_test.go internal/app/profile_service.go internal/app/profile_service_test.go
go test ./internal/app -run "TestHubServiceCreateProfileWritesSchemaV2|TestProfileServiceSaveLayoutSyncsSchemaV2GeneralLayout|TestProfileServiceSaveLayoutRestoresSchemaV2LayoutsOnDiskError|TestProfileServiceSaveLayoutRestoresWidgetsOnDiskError|TestHubServiceCreateAndList"
```

Expected: PASS.

- [ ] **Step 7: Run package tests touched by backend contract**

Run:

```powershell
go test ./pkg/config ./internal/app
```

Expected: PASS.

- [ ] **Step 8: Commit or report scoped diff**

Dedicated clean worker worktree:

```powershell
git add internal/app/hub_service.go internal/app/hub_service_test.go internal/app/profile_service.go internal/app/profile_service_test.go
git commit -m "feat: save profile schema v2 layouts"
```

Shared dirty tree:

```powershell
git diff -- internal/app/hub_service.go internal/app/hub_service_test.go internal/app/profile_service.go internal/app/profile_service_test.go
```

Expected: only profile save/create sync changes appear.

---

### Task 3: Frontend Schema Types And Metadata Preservation

**Files:**
- Modify: `frontend/src/lib/profile.ts`
- Modify: `frontend/src/hub/preview/profile-editor.test.ts`

- [ ] **Step 1: Add failing frontend metadata preservation test**

Append to `frontend/src/hub/preview/profile-editor.test.ts`:

```ts
it("preserves schema v2 layouts and variants when editing widget appearance", () => {
  const v2Profile: ProfileConfig = {
    id: "v2-racing",
    name: "V2 Racing",
    schemaVersion: 2,
    displayMode: "edit",
    monitorIndex: 0,
    widgets: [
      {
        id: "relative",
        type: "relative",
        variantId: "variant-relative-default",
        enabled: true,
        position: { x: 40, y: 600, w: 320, h: 280 },
      },
    ],
    layouts: {
      general: {
        type: "general",
        widgets: [
          {
            id: "relative",
            type: "relative",
            variantId: "variant-relative-default",
            enabled: true,
            position: { x: 40, y: 600, w: 320, h: 280 },
          },
        ],
      },
    },
    variants: [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        themeId: "vantare-racing",
        name: "Relative Default",
      },
    ],
  };

  const next = updateWidgetAppearance(v2Profile, "relative", { accentColor: "#E63946" });

  expect(next.schemaVersion).toBe(2);
  expect(next.layouts?.general.widgets[0].variantId).toBe("variant-relative-default");
  expect(next.variants?.[0].templateId).toBe("relative-vantare-default");
  expect(next.widgets[0].props?.appearance?.accentColor).toBe("#E63946");
});
```

- [ ] **Step 2: Run test and verify TypeScript failure**

Run:

```powershell
pnpm --dir frontend test -- profile-editor
```

Expected: FAIL at typecheck/compile because `schemaVersion`, `layouts`, `variants`, and `variantId` are not typed yet.

- [ ] **Step 3: Add TypeScript v2 types**

In `frontend/src/lib/profile.ts`, replace `WidgetConfig` and `ProfileConfig` type definitions with:

```ts
export type LayoutType = "general" | "practice" | "qualifying" | "race" | "endurance";

export type SlotConfig = {
  id: string;
  metricId: string;
  enabled: boolean;
  format?: Record<string, unknown>;
  style?: Record<string, unknown>;
};

export type ColumnConfig = {
  id: string;
  metricId: string;
  enabled: boolean;
  width?: number;
  format?: Record<string, unknown>;
  style?: Record<string, unknown>;
};

export type ColumnGroupConfig = {
  id: string;
  enabled: boolean;
  columns?: ColumnConfig[];
};

export type WidgetVariantConfig = {
  id: string;
  widgetType: string;
  templateId?: string;
  themeId?: string;
  name?: string;
  slots?: SlotConfig[];
  columns?: ColumnConfig[];
  columnGroups?: ColumnGroupConfig[];
  filters?: Record<string, unknown>;
  formats?: Record<string, unknown>;
  props?: WidgetPropsMap;
};

export type ProfileLayout = {
  type: LayoutType;
  widgets: WidgetConfig[];
};

export type ProfileSourceMeta = {
  kind?: string;
  profileId?: string;
  name?: string;
};

export type WidgetConfig = {
  id: string;
  type: string;
  variantId?: string;
  name?: string;
  style?: string;
  enabled: boolean;
  updateHz?: number;
  visibleWhen?: VisibleWhen;
  position: Rect;
  props?: WidgetPropsMap;
};

export type ProfileConfig = {
  schemaVersion?: number;
  id?: string;
  name?: string;
  displayMode: DisplayMode;
  monitorIndex: number;
  widgets: WidgetConfig[];
  layouts?: Partial<Record<LayoutType, ProfileLayout>>;
  variants?: WidgetVariantConfig[];
  source?: ProfileSourceMeta;
};
```

Keep the existing `DisplayMode`, `Rect`, `WidgetAppearance`, `WidgetPropsMap`, `VisibleWhen`, helper functions, and exports.

- [ ] **Step 4: Run focused frontend tests**

Run:

```powershell
pnpm --dir frontend test -- profile-editor
```

Expected: PASS.

- [ ] **Step 5: Run TypeScript build**

Run:

```powershell
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 6: Commit or report scoped diff**

Dedicated clean worker worktree:

```powershell
git add frontend/src/lib/profile.ts frontend/src/hub/preview/profile-editor.test.ts
git commit -m "feat: type profile schema v2 in frontend"
```

Shared dirty tree:

```powershell
git diff -- frontend/src/lib/profile.ts frontend/src/hub/preview/profile-editor.test.ts
```

Expected: only frontend profile typing and focused tests appear.

---

### Task 4: Final Contract Checks And Documentation Update

**Files:**
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Run full relevant checks**

Run:

```powershell
go test ./pkg/config ./internal/app
pnpm --dir frontend test -- profile-editor
pnpm --dir frontend build
```

Expected: all PASS.

- [ ] **Step 2: Run broader Go tests if no unrelated failures block**

Run:

```powershell
go test ./...
```

Expected: PASS. If it fails in a package untouched by this plan, capture the package, failing test name, and exact error in the final report without hiding it.

- [ ] **Step 3: Update current plan**

In `docs/current-plan.md`, add this under `## Estado actual`:

```markdown
Base de schema v2 para perfiles preparada:
- `schemaVersion: 2` permite layouts por sesion y variantes de widgets.
- `layouts.general.widgets` existe como layout obligatorio en perfiles v2.
- `widgets` se mantiene como espejo de compatibilidad durante la transicion.
- Los perfiles legacy sin `schemaVersion` siguen cargando sin migracion silenciosa.
```

Add this under `## Proximas tareas pequenas`:

```markdown
5. Revisar el contrato schema v2 antes de implementar la primera UI persistente de `Relative`.
6. Crear el miniplan de catalogo/template inicial de `Relative` usando `bestLap` y `lastLap` como primeras columnas opcionales persistentes.
```

- [ ] **Step 4: Verify documentation diff**

Run:

```powershell
git diff -- docs/current-plan.md
```

Expected: only the schema v2 status and next small tasks were added.

- [ ] **Step 5: Commit or report scoped diff**

Dedicated clean worker worktree:

```powershell
git add docs/current-plan.md
git commit -m "docs: record profile schema v2 foundation"
```

Shared dirty tree:

```powershell
git diff -- docs/current-plan.md
```

Expected: only current-plan schema v2 notes appear.

---

## Review Checklist

Before handing off:

- [ ] Legacy `configs/example-racing.json` still loads.
- [ ] Legacy fixture without `schemaVersion` is not mutated by `LoadFile`.
- [ ] New profiles are saved with `schemaVersion: 2`.
- [ ] New profiles contain `layouts.general.widgets`.
- [ ] New profiles still contain top-level `widgets`.
- [ ] `SaveLayout` updates both top-level `widgets` and `layouts.general.widgets` for v2 profiles.
- [ ] `WidgetVariantConfig` has no serialized position field.
- [ ] Frontend `ProfileConfig` accepts v1 and v2 shapes.
- [ ] `WidgetStudio` did not gain position/size responsibilities.
- [ ] `LayoutStudio` did not gain internal widget configuration responsibilities.
- [ ] `RelativeWidget.tsx` was not modified.
- [ ] No dependency was added.
- [ ] No build config was changed.

---

## Manual Verification

After implementation:

1. Start the app normally.
2. Open `Overlays Studio`.
3. Create a new profile named `Schema Two`.
4. Confirm it appears in `Mis perfiles`.
5. Open it in layout editing.
6. Move the `Relative` widget.
7. Save.
8. Open the created JSON profile from `configs/` or the configured profiles directory.
9. Confirm:
   - `schemaVersion` is `2`.
   - `widgets[0].position` reflects the move.
   - `layouts.general.widgets[0].position` reflects the same move.
   - `variants` exists.
   - No variant contains `position`.
10. Open an older profile such as `configs/example-racing.json`.
11. Confirm it still appears and opens.

---

## Final Report Requirements

The worker must report in Spanish:

- Archivos creados/modificados/movidos.
- Tests/checks ejecutados and result.
- Checks not run and reason.
- Whether the worker committed or only produced scoped diffs.
- Remaining risks:
  - `widgets` and `layouts.general.widgets` are intentionally duplicated during transition.
  - Existing legacy profiles are not automatically migrated until saved or explicitly converted.
  - Session auto-switch is not implemented in this cut.
  - Relative configurable columns are not implemented in this cut.
- Manual verification steps completed or not completed.
