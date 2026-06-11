package config_test

import (
	"os"
	"path/filepath"
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
	expectedW := (500-40) + 8*2 // 476
	if b.W != expectedW {
		t.Fatalf("W=%d, want %d", b.W, expectedW)
	}
	expectedH := (880-200) + 8*2 // 696
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
