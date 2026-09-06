package telemetrytransport

// ISA-996 E17: diagnostic prototype only, deliberately NOT wired to runtime.
// Measures whether splitting already-serialized frames is worth implementing.
import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"testing"
)

type sectionExperimentUpdate struct {
	Revision uint64                     `json:"revision"`
	Source   json.RawMessage            `json:"source"`
	Frame    map[string]json.RawMessage `json:"frame"`
}

type sectionExperimentPatch struct {
	Revision uint64                     `json:"revision"`
	Source   json.RawMessage            `json:"source"`
	Frame    map[string]json.RawMessage `json:"frame"`
	Removed  []string                   `json:"removed,omitempty"`
}

func splitSectionsExperiment(previous, next []byte) ([]byte, error) {
	var old, current sectionExperimentUpdate
	if err := json.Unmarshal(previous, &old); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(next, &current); err != nil {
		return nil, err
	}
	return splitParsedSectionsExperiment(old, current)
}

func splitParsedSectionsExperiment(old, current sectionExperimentUpdate) ([]byte, error) {
	patch := sectionExperimentPatch{Revision: current.Revision, Source: current.Source, Frame: make(map[string]json.RawMessage)}
	for key, value := range current.Frame {
		if !bytes.Equal(old.Frame[key], value) {
			patch.Frame[key] = value
		}
	}
	for key := range old.Frame {
		if _, present := current.Frame[key]; !present {
			patch.Removed = append(patch.Removed, key)
		}
	}
	return json.Marshal(patch)
}

func TestSectionExperimentRoundTrip(t *testing.T) {
	before := []byte(`{"revision":1,"source":{"state":"live"},"frame":{"sequence":1,"standings":[1,2],"weather":{"v":4},"optional":true}}`)
	after := []byte(`{"revision":2,"source":{"state":"stale"},"frame":{"sequence":2,"standings":[],"weather":{"v":4},"added":null}}`)
	wire, err := splitSectionsExperiment(before, after)
	if err != nil {
		t.Fatal(err)
	}
	var patch sectionExperimentPatch
	if err := json.Unmarshal(wire, &patch); err != nil {
		t.Fatal(err)
	}
	if _, retransmitted := patch.Frame["weather"]; retransmitted {
		t.Fatal("unchanged section retransmitted")
	}
	var old, want sectionExperimentUpdate
	if err := json.Unmarshal(before, &old); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(after, &want); err != nil {
		t.Fatal(err)
	}
	for _, key := range patch.Removed {
		delete(old.Frame, key)
	}
	for key, value := range patch.Frame {
		old.Frame[key] = value
	}
	old.Revision, old.Source = patch.Revision, patch.Source
	if !reflect.DeepEqual(old, want) {
		t.Fatal("lost replacement, deletion, null, metadata or freshness")
	}
	if !bytes.Contains(before, []byte(`"optional":true`)) {
		t.Fatal("mutated baseline")
	}
}

func BenchmarkOverlaySectionsExperiment(b *testing.B) {
	for _, cars := range []int{20, 44, 104} {
		b.Run(fmt.Sprint(cars), func(b *testing.B) {
			fixture, err := os.ReadFile(fmt.Sprintf("../../telemetry/projection/overlayv2/testdata/overlay_v2_%d.golden.json", cars))
			if err != nil {
				b.Fatal(err)
			}
			var compact bytes.Buffer
			if err := json.Compact(&compact, fixture); err != nil {
				b.Fatal(err)
			}
			before := compact.Bytes()
			var next sectionExperimentUpdate
			if err := json.Unmarshal(before, &next); err != nil {
				b.Fatal(err)
			}
			next.Revision++
			next.Frame["sequence"] = json.RawMessage(`999`)
			after, err := json.Marshal(next)
			if err != nil {
				b.Fatal(err)
			}
			var cached sectionExperimentUpdate
			if err := json.Unmarshal(before, &cached); err != nil {
				b.Fatal(err)
			}
			b.Run("split-cached-base", func(b *testing.B) {
				b.ReportAllocs()
				var size int
				for b.Loop() {
					var current sectionExperimentUpdate
					if err := json.Unmarshal(after, &current); err != nil {
						b.Fatal(err)
					}
					wire, err := splitParsedSectionsExperiment(cached, current)
					if err != nil {
						b.Fatal(err)
					}
					size = len(wire)
				}
				b.ReportMetric(float64(size), "wire-B/op")
			})
			b.Run("full-envelope", func(b *testing.B) {
				response := OverlayPullResponse{SessionID: "bench", Delivery: 2, Events: []OverlayPullEvent{{Name: "telemetry:overlay-v2:snapshot", Data: after}}}
				b.ReportAllocs()
				var size int
				for b.Loop() {
					wire, err := json.Marshal(response)
					if err != nil {
						b.Fatal(err)
					}
					size = len(wire)
				}
				b.ReportMetric(float64(size), "wire-B/op")
			})
			b.Run("split-serialized", func(b *testing.B) {
				b.ReportAllocs()
				var size int
				for b.Loop() {
					wire, err := splitSectionsExperiment(before, after)
					if err != nil {
						b.Fatal(err)
					}
					size = len(wire)
				}
				b.ReportMetric(float64(size), "wire-B/op")
			})
		})
	}
}
