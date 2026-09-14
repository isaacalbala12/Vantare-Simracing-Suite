package telemetrytransport

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"math"
	"os"
	"testing"
)

func sectionFixture(t testing.TB, cars int) overlayv2.UpdateV2 {
	t.Helper()
	data, err := os.ReadFile(fmt.Sprintf("../../telemetry/projection/overlayv2/testdata/overlay_v2_%d.golden.json", cars))
	if err != nil {
		t.Fatal(err)
	}
	var value overlayv2.UpdateV2
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func TestOverlaySectionsMatchCanonicalJSON(t *testing.T) {
	for _, cars := range []int{1, 20, 44, 104} {
		value := sectionFixture(t, cars)
		want, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		parts, err := encodeOverlaySections(value)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(parts.full(), want) {
			t.Fatalf("%d cars: wire differs from canonical marshal", cars)
		}
		value.Frame.Standings = nil
		if !bytes.Equal(parts.full(), want) {
			t.Fatal("caller mutated encoded ownership")
		}
	}
}

func TestOverlaySectionsKeepNullAndRejectInvalidNumbers(t *testing.T) {
	value := sectionFixture(t, 1)
	value.Frame = nil
	parts, err := encodeOverlaySections(value)
	if err != nil || parts != nil {
		t.Fatalf("null frame needs full path: %v", err)
	}
	value = sectionFixture(t, 1)
	value.Frame.Player.Speed.V = math.NaN()
	if _, err := encodeOverlaySections(value); err == nil {
		t.Fatal("accepted non-JSON number")
	}
}

func BenchmarkOverlayTypedSections(b *testing.B) {
	value := sectionFixture(b, 44)
	b.Run("canonical-marshal", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			if _, err := json.Marshal(value); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("typed-sections-full", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			parts, err := encodeOverlaySections(value)
			if err != nil {
				b.Fatal(err)
			}
			_ = parts.full()
		}
	})
}

func TestOverlaySectionsDeliveryTracksConsumerBaseAndReplay(t *testing.T) {
	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2, SectionEncoding: true})
	transport := NewOverlayPullTransport(registry)
	t.Cleanup(transport.CloseAll)
	request := OverlayPullRequest{SessionID: "s", Sections: 1}
	if _, _, err := transport.Pull("w", request); err != nil {
		t.Fatal(err)
	}
	publisher, _ := registry.Lookup(ProductOverlayV2)
	value := sectionFixture(t, 20)
	value.DeliveryRevision = 1
	if err := publisher.PublishSnapshot(1, value); err != nil {
		t.Fatal(err)
	}
	first, ok, err := transport.Pull("w", request)
	if err != nil || !ok || first.Events[0].BaseRevision != 0 {
		t.Fatal("bootstrap not full")
	}
	value.DeliveryRevision = 2
	value.Frame.Standings = nil
	if err := publisher.PublishSnapshot(2, value); err != nil {
		t.Fatal(err)
	}
	value.DeliveryRevision = 3
	value.Frame.SectionBuildMask = 0
	value.Frame.SourceSequence++
	if err := publisher.PublishSnapshot(3, value); err != nil {
		t.Fatal(err)
	}
	replay, _, _ := transport.Pull("w", request)
	if !bytes.Equal(replay.Events[0].Data, first.Events[0].Data) {
		t.Fatal("pending replay changed")
	}
	request.Ack = first.Delivery
	next, ok, err := transport.Pull("w", request)
	if err != nil || !ok || next.Events[0].BaseRevision != 1 {
		t.Fatal("delta did not use delivered base")
	}
	var patch struct {
		Frame map[string]json.RawMessage `json:"frame"`
	}
	if err := json.Unmarshal(next.Events[0].Data, &patch); err != nil {
		t.Fatal(err)
	}
	if string(patch.Frame["standings"]) != "null" {
		t.Fatal("lost change on skipped source tick")
	}
	if _, found := patch.Frame["weather"]; found {
		t.Fatal("resent unchanged weather")
	}
	again, _, _ := transport.Pull("w", request)
	if !bytes.Equal(again.Events[0].Data, next.Events[0].Data) || again.Events[0].BaseRevision != 1 {
		t.Fatal("delta replay changed")
	}
	fresh, ok, err := transport.Pull("w2", OverlayPullRequest{SessionID: "new", Sections: 1})
	if err != nil || !ok || fresh.Events[0].BaseRevision != 0 {
		t.Fatal("new consumer received delta")
	}
	value.DeliveryRevision = 4
	value.Frame.StreamEpoch++
	if err := publisher.PublishSnapshot(4, value); err != nil {
		t.Fatal(err)
	}
	request.Ack = next.Delivery
	reset, ok, err := transport.Pull("w", request)
	if err != nil || !ok || reset.Events[0].BaseRevision != 0 {
		t.Fatal("epoch reset did not bootstrap")
	}
}
