package config

import (
	"encoding/json"
	"reflect"
	"strings"
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

func TestProfileDocumentV3LayoutViewportJSONRoundTrip(t *testing.T) {
	want := minimalProfileV3()
	want.LayoutViewport = &LayoutViewportV3{Width: 5120, Height: 1440}
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

func TestResolveLayoutViewportV3DefaultsMissingField(t *testing.T) {
	doc := minimalProfileV3()
	if got := ResolveLayoutViewportV3(&doc); got != (LayoutViewportV3{Width: 1920, Height: 1080}) {
		t.Fatalf("resolved viewport=%#v want 1920x1080", got)
	}
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "layoutViewport") {
		t.Fatalf("missing viewport should remain omitted, got %s", data)
	}
}
