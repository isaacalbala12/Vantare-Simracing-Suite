package config

import "testing"

func TestLayoutOriginV3EmptyProfile(t *testing.T) {
	doc := validProfileV3()
	origin := LayoutOriginV3(doc, 8)
	if origin.X != 0 || origin.Y != 0 {
		t.Fatalf("layoutOrigin=(%d,%d), want (0,0)", origin.X, origin.Y)
	}
}

func TestLayoutOriginV3EnabledWidgets(t *testing.T) {
	widget := validWidget("delta-main", WidgetTypeDelta)
	widget.Layout.X = 100
	widget.Layout.Y = 200
	widget.Layout.W = 400
	widget.Layout.H = 48
	doc := validProfileV3(widget)

	origin := LayoutOriginV3(doc, 8)
	if origin.X != 92 || origin.Y != 192 {
		t.Fatalf("layoutOrigin=(%d,%d), want (92,192)", origin.X, origin.Y)
	}
}
