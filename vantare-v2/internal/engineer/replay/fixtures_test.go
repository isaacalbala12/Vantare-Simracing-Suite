package replay

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/simulator"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// TestGenerateFixtures writes fixture JSONL files to testdata/ if they do
// not exist. This is idempotent: existing files are left untouched.
// Run with -update to regenerate, or simply delete the files and re-run.
func TestGenerateFixtures(t *testing.T) {
	scenarios := []struct {
		name     string
		scenario simulator.Scenario
	}{
		{"left-basic", simulator.ScenarioLeftBasic},
		{"right-basic", simulator.ScenarioRightBasic},
		{"three-wide", simulator.ScenarioThreeWide},
		{"all-clear", simulator.ScenarioAllClear},
	}

	for _, sc := range scenarios {
		path := filepath.Join("testdata", sc.name+".jsonl")

		// Skip if fixture already exists (idempotent).
		if _, err := os.Stat(path); err == nil {
			t.Logf("fixture already exists: %s", path)
			continue
		}

		// Ensure testdata directory exists.
		if err := os.MkdirAll("testdata", 0755); err != nil {
			t.Fatalf("failed to create testdata directory: %v", err)
		}

		frames := simulator.Build(sc.scenario)
		if len(frames) < 4 {
			t.Fatalf("scenario %s produced %d frames, want at least 4", sc.name, len(frames))
		}

		var buf bytes.Buffer
		for i := range frames {
			if err := WriteFrame(&buf, &frames[i]); err != nil {
				t.Fatalf("failed to write frame %d for %s: %v", i, sc.name, err)
			}
		}

		if err := os.WriteFile(path, buf.Bytes(), 0644); err != nil {
			t.Fatalf("failed to write fixture %s: %v", path, err)
		}

		t.Logf("generated fixture: %s (%d frames)", path, len(frames))
	}
}

// TestFixtures loads each fixture from testdata/ and validates:
//   - at least 4 unique frames
//   - left-basic: at least one frame with a SideLeft zone
//   - right-basic: at least one frame with a SideRight zone
//   - three-wide: at least one frame with both left and right zones
//   - all-clear: no frame produces any zone
func TestFixtures(t *testing.T) {
	cases := []struct {
		name      string
		wantSide  spotter.Side // expected side (empty for multi/zero checks)
		wantMulti bool         // expect at least one frame with left+right
		wantZero  bool         // expect all frames to have zero zones
	}{
		{name: "left-basic", wantSide: spotter.SideLeft},
		{name: "right-basic", wantSide: spotter.SideRight},
		{name: "three-wide", wantMulti: true},
		{name: "all-clear", wantZero: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join("testdata", tc.name+".jsonl")
			src, err := NewSource(path)
			if err != nil {
				t.Fatalf("failed to open %s: %v", path, err)
			}
			defer src.Close()

			// Collect unique frames (handle ReadFrame's repeat-after-EOF).
			var frames []*telemetry.Frame
			seen := make(map[int64]bool)
			for i := 0; i < 20; i++ {
				f := src.ReadFrame()
				if f == nil {
					break
				}
				if !seen[f.TimestampUnixMS] {
					seen[f.TimestampUnixMS] = true
					frames = append(frames, f)
				}
			}

			if len(frames) < 4 {
				t.Fatalf("%s: expected at least 4 frames, got %d", tc.name, len(frames))
			}

			switch {
			case tc.wantZero:
				// All frames must produce zero zones.
				for i, f := range frames {
					zones := spotter.Classify(f, spotter.SensitivityNormal)
					if len(zones) != 0 {
						t.Errorf("%s frame %d: expected 0 zones, got %d: %+v", tc.name, i, len(zones), zones)
					}
				}

			case tc.wantMulti:
				// At least one frame must have both left and right zones.
				found := false
				for _, f := range frames {
					zones := spotter.Classify(f, spotter.SensitivityNormal)
					var hasLeft, hasRight bool
					for _, z := range zones {
						if z.Side == spotter.SideLeft {
							hasLeft = true
						}
						if z.Side == spotter.SideRight {
							hasRight = true
						}
					}
					if hasLeft && hasRight {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("%s: expected at least one frame with both left and right zones, none found", tc.name)
				}

			default:
				// At least one frame must have a zone on the expected side.
				found := false
				for _, f := range frames {
					zones := spotter.Classify(f, spotter.SensitivityNormal)
					for _, z := range zones {
						if z.Side == tc.wantSide {
							found = true
							break
						}
					}
					if found {
						break
					}
				}
				if !found {
					t.Errorf("%s: expected at least one frame with zone side %q, none found", tc.name, tc.wantSide)
				}
			}
		})
	}
}
