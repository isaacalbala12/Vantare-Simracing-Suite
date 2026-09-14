package main

import (
	"encoding/json"
	"testing"
)

func TestScreenIntersection(t *testing.T) {
	screen := rect{0, 0, 1920, 1080}
	for _, tt := range []struct {
		r    rect
		want bool
	}{
		{rect{0, 0, 1920, 1080}, true}, {rect{2000, 0, 2100, 100}, false},
		{rect{0, 0, 0, 100}, false}, {rect{-100, 0, 100, 100}, true},
	} {
		if got := onScreen(tt.r, screen); got != tt.want {
			t.Errorf("%v: got %v", tt.r, got)
		}
	}
}

func TestHubWindowClassification(t *testing.T) {
	for _, tt := range []struct {
		name       string
		change     func(*windowState)
		foreground uintptr
		present    bool
		visible    bool
		minimized  bool
		valid      bool
	}{
		{name: "visible foreground without topmost", foreground: 42, present: true, visible: true, valid: true},
		{name: "background", foreground: 7, present: true, visible: true},
		{name: "no foreground window", present: true, visible: true},
		{name: "minimized", change: func(w *windowState) { w.minimized = true }, foreground: 42, present: true, minimized: true},
		{name: "hidden", change: func(w *windowState) { w.visible = false }, foreground: 42, present: true},
		{name: "cloaked or DWM query failed", change: func(w *windowState) { w.uncloaked = false }, foreground: 42, present: true},
		{name: "off screen or invalid rectangle", change: func(w *windowState) { w.onScreen = false }, foreground: 42, present: true},
		{name: "destroyed", change: func(w *windowState) { *w = windowState{} }, foreground: 42},
	} {
		t.Run(tt.name, func(t *testing.T) {
			window := windowState{hwnd: 42, visible: true, uncloaked: true, onScreen: true}
			if tt.change != nil {
				tt.change(&window)
			}
			got := classifyWindow("hub", window, tt.foreground, false)
			if got.hubSample == nil || got.HubPresent != tt.present || got.HubVisible != tt.visible || got.HubMinimized != tt.minimized || got.Valid != tt.valid {
				t.Fatalf("classification = %+v, hub = %+v", got, got.hubSample)
			}
			if got.HubForeground != (tt.present && tt.foreground == 42) || got.Occlusion != "unknown" {
				t.Fatalf("foreground/occlusion = %+v", got.hubSample)
			}
		})
	}
}

func TestOverlayVisibilityContract(t *testing.T) {
	for _, tt := range []struct {
		name           string
		change         func(*windowState)
		gameForeground bool
		visible        bool
		valid          bool
	}{
		{name: "visible overlay over game", gameForeground: true, visible: true, valid: true},
		{name: "game not foreground", visible: true},
		{name: "not topmost", change: func(w *windowState) { w.topmost = false }, gameForeground: true},
		{name: "hidden", change: func(w *windowState) { w.visible = false }, gameForeground: true},
		{name: "minimized", change: func(w *windowState) { w.minimized = true }, gameForeground: true},
		{name: "cloaked or DWM query failed", change: func(w *windowState) { w.uncloaked = false }, gameForeground: true},
		{name: "off screen or invalid rectangle", change: func(w *windowState) { w.onScreen = false }, gameForeground: true},
		{name: "absent", change: func(w *windowState) { *w = windowState{} }, gameForeground: true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			window := windowState{hwnd: 42, visible: true, uncloaked: true, onScreen: true, topmost: true}
			if tt.change != nil {
				tt.change(&window)
			}
			got := classifyWindow("overlay", window, 7, tt.gameForeground)
			if got.GameForeground != tt.gameForeground || got.OverlayVisible != tt.visible || got.Valid != tt.valid || got.hubSample != nil {
				t.Fatalf("classification = %+v", got)
			}
		})
	}
}

func TestSurfaceJSONContract(t *testing.T) {
	for _, surface := range []string{"overlay", "hub"} {
		t.Run(surface, func(t *testing.T) {
			encoded, err := json.Marshal(classifyWindow(surface, windowState{}, 0, false))
			if err != nil {
				t.Fatal(err)
			}
			var fields map[string]any
			if err := json.Unmarshal(encoded, &fields); err != nil {
				t.Fatal(err)
			}
			wantCount := 4
			if surface == "hub" {
				wantCount += 5
				for _, name := range []string{"hubPresent", "hubVisible", "hubMinimized", "hubForeground"} {
					if value, exists := fields[name]; !exists || value != false {
						t.Errorf("%s must explicitly report false; JSON = %s", name, encoded)
					}
				}
				if fields["occlusion"] != "unknown" {
					t.Errorf("occlusion must remain unknown; JSON = %s", encoded)
				}
			}
			if len(fields) != wantCount || fields["gameForeground"] != false || fields["overlayVisible"] != false || fields["valid"] != false || fields["at"] == nil {
				t.Fatalf("unexpected JSON contract: %s", encoded)
			}
		})
	}
}

func TestCaptureTargetValidation(t *testing.T) {
	for _, tt := range []struct {
		surface    string
		host, game uint
		valid      bool
	}{
		{surface: "overlay", host: 1, game: 2, valid: true},
		{surface: "overlay", host: 1},
		{surface: "overlay", game: 2},
		{surface: "hub", host: 1, valid: true},
		{surface: "hub"},
		{surface: "studio", host: 1, game: 2},
	} {
		if err := validateTarget(tt.surface, tt.host, tt.game); (err == nil) != tt.valid {
			t.Errorf("validateTarget(%q, %d, %d) = %v", tt.surface, tt.host, tt.game, err)
		}
	}
}
