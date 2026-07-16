package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestMigrateProfileJSONToV3Golden(t *testing.T) {
	cases := []struct {
		source   string
		golden   string
		wantFrom int
	}{
		{"testdata/profile-v0-core-widgets.json", "testdata/profile-v3-core-widgets-from-v0.golden.json", 0},
		{"testdata/profile-v2-core-widgets.json", "testdata/profile-v3-core-widgets-from-v2.golden.json", 2},
	}
	for _, tc := range cases {
		t.Run(tc.source, func(t *testing.T) {
			data, err := os.ReadFile(tc.source)
			if err != nil {
				t.Fatal(err)
			}
			doc, from, err := MigrateProfileJSONToV3(data)
			if err != nil {
				t.Fatal(err)
			}
			if from != tc.wantFrom {
				t.Fatalf("from=%d want %d", from, tc.wantFrom)
			}
			assertMatchesGolden(t, doc, tc.golden)
		})
	}
}

func TestProfileV3MigrationCoreInvariant(t *testing.T) {
	v0Data, err := os.ReadFile("testdata/profile-v0-core-widgets.json")
	if err != nil {
		t.Fatal(err)
	}
	v2Data, err := os.ReadFile("testdata/profile-v2-core-widgets.json")
	if err != nil {
		t.Fatal(err)
	}
	v0Doc, from0, err := MigrateProfileJSONToV3(v0Data)
	if err != nil {
		t.Fatal(err)
	}
	v2Doc, from2, err := MigrateProfileJSONToV3(v2Data)
	if err != nil {
		t.Fatal(err)
	}
	if from0 != 0 || from2 != 2 {
		t.Fatalf("unexpected from versions: v0=%d v2=%d", from0, from2)
	}

	v0Widgets := v0Doc.Layouts[LayoutGeneral].Widgets
	v2Widgets := v2Doc.Layouts[LayoutGeneral].Widgets
	if len(v0Widgets) != 4 || len(v2Widgets) != 4 {
		t.Fatalf("expected 4 core widgets, got v0=%d v2=%d", len(v0Widgets), len(v2Widgets))
	}

	v0ByID := indexCoreWidgets(v0Widgets)
	v2ByID := indexCoreWidgets(v2Widgets)
	for id, v0Widget := range v0ByID {
		v2Widget, ok := v2ByID[id]
		if !ok {
			t.Fatalf("missing widget %s in v2 migration", id)
		}
		if v0Widget.Type != v2Widget.Type {
			t.Fatalf("%s type mismatch: v0=%s v2=%s", id, v0Widget.Type, v2Widget.Type)
		}
		if v0Widget.Layout != v2Widget.Layout {
			t.Fatalf("%s layout mismatch:\nv0=%#v\nv2=%#v", id, v0Widget.Layout, v2Widget.Layout)
		}
		if !isSupportedDesignSystemID(v0Widget.Visual.SystemID) {
			t.Fatalf("%s v0 has unsupported system %s", id, v0Widget.Visual.SystemID)
		}
		if !isSupportedDesignSystemID(v2Widget.Visual.SystemID) {
			t.Fatalf("%s v2 has unsupported system %s", id, v2Widget.Visual.SystemID)
		}
	}

	v2Relative := v2ByID["relative-main"]
	if v2Relative.Visual.SystemID != DesignSystemVantareCrystal {
		t.Fatalf("relative-main expected crystal, got %s", v2Relative.Visual.SystemID)
	}
	v2Pedals := v2ByID["pedals-main"]
	if v2Pedals.Visual.SystemID != DesignSystemVantareCrystal {
		t.Fatalf("pedals-main expected crystal, got %s", v2Pedals.Visual.SystemID)
	}
}

func TestProfileV3MigrationDeterministic(t *testing.T) {
	data, err := os.ReadFile("testdata/profile-v2-core-widgets.json")
	if err != nil {
		t.Fatal(err)
	}
	first, _, err := MigrateProfileJSONToV3(data)
	if err != nil {
		t.Fatal(err)
	}
	second, _, err := MigrateProfileJSONToV3(data)
	if err != nil {
		t.Fatal(err)
	}
	firstJSON, err := json.Marshal(first)
	if err != nil {
		t.Fatal(err)
	}
	secondJSON, err := json.Marshal(second)
	if err != nil {
		t.Fatal(err)
	}
	if string(firstJSON) != string(secondJSON) {
		t.Fatal("migration output is not byte-for-byte deterministic")
	}
}

func TestProfileV3MigrationDeepCopy(t *testing.T) {
	data, err := os.ReadFile("testdata/profile-v2-core-widgets.json")
	if err != nil {
		t.Fatal(err)
	}
	doc, _, err := MigrateProfileJSONToV3(data)
	if err != nil {
		t.Fatal(err)
	}
	doc.Layouts[LayoutGeneral].Widgets[0].Content["mutated"] = true
	again, _, err := MigrateProfileJSONToV3(data)
	if err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(doc, again) {
		t.Fatal("expected mutated document to differ from fresh migration")
	}
}

func TestProfileV3MigrationExampleRacingPreservesTelemetry(t *testing.T) {
	path := filepath.Join("..", "..", "configs", "example-racing.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	doc, from, err := MigrateProfileJSONToV3(data)
	if err != nil {
		t.Fatal(err)
	}
	if from != 0 {
		t.Fatalf("from=%d want 0", from)
	}
	general := doc.Layouts[LayoutGeneral]
	var telemetry, telemetryVertical *PreservedWidgetV3
	for i := range general.PreservedWidgets {
		switch general.PreservedWidgets[i].Type {
		case "telemetry":
			telemetry = &general.PreservedWidgets[i]
		case "telemetry-vertical":
			telemetryVertical = &general.PreservedWidgets[i]
		}
	}
	if telemetry == nil || telemetryVertical == nil {
		t.Fatalf("expected telemetry preserved widgets, got %#v", general.PreservedWidgets)
	}
	if telemetry.ID != "telemetry" || telemetryVertical.ID != "telemetry-vertical" {
		t.Fatalf("unexpected preserved ids: %#v", general.PreservedWidgets)
	}
	assertPreservedSourceMatchesInput(t, data, "telemetry", telemetry.Source)
	assertPreservedSourceMatchesInput(t, data, "telemetry-vertical", telemetryVertical.Source)
}

func assertMatchesGolden(t *testing.T, doc *ProfileDocumentV3, goldenPath string) {
	t.Helper()
	got, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	want, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatal(err)
	}
	gotStr := strings.TrimSpace(string(got))
	wantStr := strings.TrimSpace(string(want))
	if gotStr != wantStr {
		t.Fatalf("golden mismatch for %s\n--- got ---\n%s\n--- want ---\n%s", goldenPath, got, want)
	}
}

func indexCoreWidgets(widgets []WidgetInstanceV3) map[string]WidgetInstanceV3 {
	indexed := make(map[string]WidgetInstanceV3, len(widgets))
	for _, widget := range widgets {
		indexed[widget.ID] = widget
	}
	return indexed
}

func assertPreservedSourceMatchesInput(t *testing.T, profileData []byte, widgetID string, source map[string]any) {
	t.Helper()
	var raw map[string]any
	if err := json.Unmarshal(profileData, &raw); err != nil {
		t.Fatal(err)
	}
	widgets, err := asMapSlice(raw["widgets"])
	if err != nil {
		t.Fatal(err)
	}
	var input map[string]any
	for _, widget := range widgets {
		if widget["id"] == widgetID {
			input = widget
			break
		}
	}
	if input == nil {
		t.Fatalf("widget %s not found in input", widgetID)
	}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	sourceJSON, err := json.Marshal(source)
	if err != nil {
		t.Fatal(err)
	}
	if string(inputJSON) != string(sourceJSON) {
		t.Fatalf("preserved source mismatch for %s\ninput=%s\nsource=%s", widgetID, inputJSON, sourceJSON)
	}
}
