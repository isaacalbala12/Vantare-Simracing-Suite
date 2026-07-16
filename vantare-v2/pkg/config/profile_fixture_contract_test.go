package config_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/pkg/config"
)

func TestOverlayStudioV3LegacyFixturesAreStable(t *testing.T) {
	profileFiles := []string{
		"testdata/profile-v0-core-widgets.json",
		"testdata/profile-v2-core-widgets.json",
	}
	for _, name := range profileFiles {
		t.Run(name, func(t *testing.T) {
			profile, err := config.LoadFile(name)
			if err != nil {
				t.Fatalf("LoadFile(%q): %v", name, err)
			}
			seen := map[string]bool{}
			for _, widget := range profile.Widgets {
				seen[widget.Type] = true
			}
			for _, required := range []string{"delta", "standings", "relative", "pedals"} {
				if !seen[required] {
					t.Fatalf("fixture %q missing %s", name, required)
				}
			}
		})
	}
}

func TestOverlayStudioV3LegacyDesignFixture(t *testing.T) {
	data, err := os.ReadFile("testdata/widget-designs-v1.json")
	if err != nil {
		t.Fatalf("read widget-designs-v1.json: %v", err)
	}
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatalf("parse widget-designs-v1.json: %v", err)
	}
	presets, ok := doc["presets"].([]any)
	if !ok || len(presets) == 0 {
		t.Fatal("widget-designs-v1.json missing non-empty presets array")
	}
	foundCrystal := false
	for _, preset := range presets {
		raw, err := json.Marshal(preset)
		if err != nil {
			t.Fatalf("marshal preset: %v", err)
		}
		if strings.Contains(string(raw), "vantare-crystal") || strings.Contains(string(raw), "glassmorphism-pro") {
			foundCrystal = true
			break
		}
	}
	if !foundCrystal {
		t.Fatal("widget-designs-v1.json presets must include vantare-crystal or glassmorphism-pro alias")
	}
}