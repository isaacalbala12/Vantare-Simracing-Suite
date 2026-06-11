package window_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

func TestShrinkWrapWithWidgets(t *testing.T) {
	p := &config.ProfileConfig{Widgets: []config.WidgetConfig{
		{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		{Enabled: true, Position: config.Rect{X: 40, Y: 600, W: 320, H: 280}},
	}}
	wb, origin := window.ShrinkWrap(p, 8)

	// minX=40, minY=200, maxX=500, maxY=880
	// Window bounds: X=32, Y=192, W=476, H=696
	if wb.X != 32 {
		t.Fatalf("window.X=%d, want 32", wb.X)
	}
	if wb.Y != 192 {
		t.Fatalf("window.Y=%d, want 192", wb.Y)
	}
	if wb.Width != 476 {
		t.Fatalf("window.Width=%d, want 476", wb.Width)
	}
	if wb.Height != 696 {
		t.Fatalf("window.Height=%d, want 696", wb.Height)
	}
	if origin.X != 32 || origin.Y != 192 {
		t.Fatalf("origin=(%d,%d), want (32,192)", origin.X, origin.Y)
	}
}

func TestShrinkWrapNoWidgets(t *testing.T) {
	p := &config.ProfileConfig{}
	wb, _ := window.ShrinkWrap(p, 8)
	if wb.Width != 200 || wb.Height != 80 {
		t.Fatalf("fallback: got %dx%d, want 200x80", wb.Width, wb.Height)
	}
}

func TestWindowLocalPos(t *testing.T) {
	// Widget from the shrink-wrap test: X=100,Y=200,W=400,H=48
	// Origin from that same profile: X=32, Y=192
	widget := config.Rect{X: 100, Y: 200, W: 400, H: 48}
	origin := config.Rect{X: 32, Y: 192}
	local := window.WindowLocalPos(widget, origin)
	if local.X != 68 || local.Y != 8 {
		t.Fatalf("local=(%d,%d), want (68,8)", local.X, local.Y)
	}
	if local.W != 400 || local.H != 48 {
		t.Fatalf("local size=%dx%d, want 400x48", local.W, local.H)
	}
}

func TestShrinkWrapDisabledIgnored(t *testing.T) {
	p := &config.ProfileConfig{Widgets: []config.WidgetConfig{
		{Enabled: true, Position: config.Rect{X: 100, Y: 100, W: 200, H: 50}},
		{Enabled: false, Position: config.Rect{X: 500, Y: 500, W: 200, H: 100}},
	}}
	wb, _ := window.ShrinkWrap(p, 0)
	if wb.Width != 200 || wb.Height != 50 {
		t.Fatalf("disabled widget included: got %dx%d", wb.Width, wb.Height)
	}
}

func TestShrinkWrapPad(t *testing.T) {
	p := &config.ProfileConfig{Widgets: []config.WidgetConfig{
		{Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 100}},
	}}
	wb, _ := window.ShrinkWrap(p, 20)
	if wb.Width != 140 || wb.Height != 140 {
		t.Fatalf("padding: got %dx%d, want 140x140", wb.Width, wb.Height)
	}
}
