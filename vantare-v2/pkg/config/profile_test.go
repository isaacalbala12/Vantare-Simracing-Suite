package config_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/pkg/config"
)

func TestLoadExampleRacing(t *testing.T) {
	// Resolve relative to project root (go test runs from package dir)
	p, err := config.LoadFile("../../configs/example-racing.json")
	if err != nil {
		t.Fatal(err)
	}
	if p.DisplayMode != config.ModeRacing {
		t.Fatalf("mode %q, want %q", p.DisplayMode, config.ModeRacing)
	}
	if len(p.Widgets) < 2 {
		t.Fatalf("expected at least 2 widgets, got %d", len(p.Widgets))
	}
}

func TestCompositeBounds(t *testing.T) {
	p := &config.ProfileConfig{Widgets: []config.WidgetConfig{
		{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		{Enabled: true, Position: config.Rect{X: 40, Y: 600, W: 320, H: 280}},
	}}
	b := config.CompositeBounds(p, 8)
	// minX=40, minY=200, maxX=400+40=440, maxY=600+280=880
	// W = (440-40) + 8*2 = 400 + 16 = 416? No: maxX=500 (100+400), minX=40, maxY=880, minY=200
	// Actually: widget1: X=100,Y=200,W=400,H=48 => right=500, bottom=248
	// widget2: X=40,Y=600,W=320,H=280 => right=360, bottom=880
	// minX=40, minY=200, maxX=500, maxY=880
	// W = (500-40) + 8*2 = 460+16 = 476
	expectedW := (500 - 40) + 8*2 // 476
	if b.W != expectedW {
		t.Fatalf("W=%d, want %d", b.W, expectedW)
	}
	expectedH := (880 - 200) + 8*2 // 696
	if b.H != expectedH {
		t.Fatalf("H=%d, want %d", b.H, expectedH)
	}
}

func TestCompositeBoundsNoWidgets(t *testing.T) {
	p := &config.ProfileConfig{}
	b := config.CompositeBounds(p, 8)
	if b.W != 200 || b.H != 80 {
		t.Fatalf("empty widgets: got %dx%d, want 200x80", b.W, b.H)
	}
}

func TestLayoutOrigin(t *testing.T) {
	p := &config.ProfileConfig{Widgets: []config.WidgetConfig{
		{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
	}}
	origin := config.LayoutOrigin(p, 8)
	if origin.X != 92 || origin.Y != 192 {
		t.Fatalf("origin=(%d,%d), want (92,192)", origin.X, origin.Y)
	}
}

func TestSaveAndLoadRoundtrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test-profile.json")
	original := &config.ProfileConfig{
		ID:          "roundtrip",
		Name:        "Test",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "w1", Type: "delta", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	}
	if err := config.SaveFile(path, original); err != nil {
		t.Fatal(err)
	}
	loaded, err := config.LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ID != original.ID {
		t.Fatalf("ID=%q, want %q", loaded.ID, original.ID)
	}
	if loaded.DisplayMode != config.ModeEdit {
		t.Fatalf("mode=%q, want %q", loaded.DisplayMode, config.ModeEdit)
	}
	if len(loaded.Widgets) != 1 || loaded.Widgets[0].Position.X != 10 {
		t.Fatalf("widget mismatch: %+v", loaded.Widgets)
	}
}

func TestSaveFileCreatesDirectory(t *testing.T) {
	// Use a subdirectory that does not exist yet.
	base := t.TempDir()
	path := filepath.Join(base, "sub", "nested", "profile.json")
	p := &config.ProfileConfig{
		ID:          "creates-dir",
		Name:        "DirCreate",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "w1", Type: "delta", Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		},
	}
	if err := config.SaveFile(path, p); err != nil {
		t.Fatal(err)
	}
	loaded, err := config.LoadFile(path)
	if err != nil {
		t.Fatalf("loading saved file: %v", err)
	}
	if loaded.ID != "creates-dir" {
		t.Fatalf("ID=%q, want %q", loaded.ID, "creates-dir")
	}
}

func TestSaveFileProducesValidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test-profile.json")
	p := &config.ProfileConfig{
		ID:          "valid-json",
		Name:        "Test",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "w1", Type: "delta", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	}
	if err := config.SaveFile(path, p); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading saved file: %v", err)
	}
	if !json.Valid(raw) {
		t.Fatalf("saved file is not valid JSON: %s", string(raw))
	}
}

func TestLoadFileNotFound(t *testing.T) {
	_, err := config.LoadFile("nonexistent.json")
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestLoadFileInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.json")
	os.WriteFile(path, []byte("{invalid"), 0644)
	_, err := config.LoadFile(path)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

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

func TestConvertProfileToV2PreservesExistingLayoutsAndVariants(t *testing.T) {
	v2 := &config.ProfileConfig{
		SchemaVersion: config.ProfileSchemaVersionV2,
		ID:            "existing-v2",
		DisplayMode:   config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", VariantID: "custom-relative", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}},
		},
		Layouts: map[config.LayoutType]config.ProfileLayout{
			config.LayoutRace: {
				Type: config.LayoutRace,
				Widgets: []config.WidgetConfig{
					{ID: "relative-race", Type: "relative", VariantID: "custom-relative", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 30, H: 40}},
				},
			},
		},
		Variants: []config.WidgetVariantConfig{
			{
				ID:         "custom-relative",
				WidgetType: "relative",
				TemplateID: "relative-custom",
				ThemeID:    "custom-theme",
				Columns: []config.ColumnConfig{
					{ID: "driver", MetricID: "driverName", Enabled: true, Format: map[string]any{"case": "upper"}},
				},
			},
		},
	}

	converted := config.ConvertProfileToV2(v2)

	if _, ok := converted.Layouts[config.LayoutRace]; !ok {
		t.Fatal("race layout was dropped")
	}
	if _, ok := converted.Layouts[config.LayoutGeneral]; !ok {
		t.Fatal("general layout should be added when missing")
	}
	if len(converted.Variants) != 1 {
		t.Fatalf("variants len=%d, want 1", len(converted.Variants))
	}
	if converted.Variants[0].TemplateID != "relative-custom" {
		t.Fatalf("TemplateID=%q, want relative-custom", converted.Variants[0].TemplateID)
	}
}

func TestConvertProfileToV2CopiesMutableMaps(t *testing.T) {
	legacy := &config.ProfileConfig{
		ID:          "mutable",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{
				ID:       "relative",
				Type:     "relative",
				Enabled:  true,
				Position: config.Rect{X: 1, Y: 2, W: 3, H: 4},
				Props: map[string]any{
					"style":  "vantare-racing",
					"format": map[string]any{"decimals": 1},
				},
			},
		},
	}

	converted := config.ConvertProfileToV2(legacy)

	legacy.Widgets[0].Props["style"] = "mutated"
	legacy.Widgets[0].Props["format"].(map[string]any)["decimals"] = 3
	converted.Widgets[0].Props["style"] = "compat-mutated"

	if converted.Variants[0].Props["style"] != "vantare-racing" {
		t.Fatalf("variant props aliased mutable map: %v", converted.Variants[0].Props["style"])
	}
	if converted.Variants[0].Props["format"].(map[string]any)["decimals"] != 1 {
		t.Fatalf("nested variant props aliased mutable map: %v", converted.Variants[0].Props["format"])
	}
	if converted.Layouts[config.LayoutGeneral].Widgets[0].Props["style"] != "vantare-racing" {
		t.Fatalf("layout widget props aliased compatibility widget props: %v", converted.Layouts[config.LayoutGeneral].Widgets[0].Props["style"])
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

func TestEnabledWidgetsOnly(t *testing.T) {
	p := &config.ProfileConfig{Widgets: []config.WidgetConfig{
		{Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		{Enabled: false, Position: config.Rect{X: 500, Y: 500, W: 200, H: 100}},
	}}
	b := config.CompositeBounds(p, 0)
	// Only enabled widget: X=0,Y=0,W=100,H=50
	if b.W != 100 || b.H != 50 {
		t.Fatalf("got %dx%d, want 100x50", b.W, b.H)
	}
}
