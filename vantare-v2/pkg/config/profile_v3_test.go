package config

import (
	"encoding/json"
	"reflect"
	"testing"
)

func minimalProfileV3() ProfileDocumentV3 {
	return ProfileDocumentV3{
		SchemaVersion: ProfileSchemaVersionV3,
		ID:            "minimal-v3",
		Name:          "Minimal V3",
		DisplayMode:   ModeEdit,
		MonitorIndex:  0,
		Layouts: map[LayoutType]SessionLayoutV3{
			LayoutGeneral: {
				Type:    LayoutGeneral,
				Widgets: []WidgetInstanceV3{},
			},
		},
	}
}

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
