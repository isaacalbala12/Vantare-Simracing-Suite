package config

import (
	"encoding/json"
	"testing"
)

func TestFastestLapProfileRoundTrip(t *testing.T) {
	widget := validWidget("fastest", WidgetTypeFastestLap)
	widget.Visual.SystemID = DesignSystemVantareFunctional
	widget.Content = map[string]any{"scope": "class", "durationSeconds": 6, "showDriver": true}
	original := validProfileV3(widget)
	data, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	var restored ProfileDocumentV3
	if err := json.Unmarshal(data, &restored); err != nil {
		t.Fatal(err)
	}
	if err := ValidateProfileDocumentV3(&restored); err != nil {
		t.Fatal(err)
	}
	normalized := NormalizeProfileDocumentV3(&restored)
	layout := normalized.Layouts[LayoutGeneral]
	if len(layout.Widgets) != 1 || len(layout.PreservedWidgets) != 0 {
		t.Fatalf("fastest-lap must remain active after loading: %+v", layout)
	}
	got := layout.Widgets[0]
	if got.Type != WidgetTypeFastestLap || got.Visual.SystemID != DesignSystemVantareFunctional || got.Content["scope"] != "class" || got.Content["durationSeconds"] != float64(6) {
		t.Fatalf("round trip changed the widget: %+v", got)
	}
}
