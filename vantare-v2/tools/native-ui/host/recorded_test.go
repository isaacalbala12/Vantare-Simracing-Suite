package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	overlayv2 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

func TestRecordedLMUFramesChangeTheGoOverlayProjection(t *testing.T) {
	root := filepath.Join("..", "..", "..", "testdata")
	observations, err := loadRecordedFrames(root)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := telemetrytransport.NewPublisherRegistry(telemetrytransport.PublisherConfig{Product: telemetrytransport.ProductOverlayV2})
	if err != nil {
		t.Fatal(err)
	}
	publisher, release, err := registry.RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	sink := newLiveSink(lmu.New(), publisher)
	fusion := new(lmu.Fusion)
	var pitStates []string
	for index, observation := range observations {
		if err := sink.WriteObservation(context.Background(), fusion.Merge(time.Now().UTC(), time.Duration(index)*4*time.Second, observation)); err != nil {
			t.Fatalf("publish recorded frame %d: %v", index, err)
		}
		event, ok := publisher.ReplaySnapshot()
		if !ok {
			t.Fatalf("recorded frame %d published nothing", index)
		}
		var update overlayv2.UpdateV2
		if err := json.Unmarshal(event.Data, &update); err != nil {
			t.Fatal(err)
		}
		if update.Frame == nil || len(update.Frame.Standings) != 1 {
			t.Fatalf("recorded frame %d standings: %+v", index, update.Frame)
		}
		pitStates = append(pitStates, update.Frame.Standings[0].PitState)
	}
	if want := []string{overlayv2.PitStateTrack, overlayv2.PitStatePit, overlayv2.PitStateTrack}; !reflect.DeepEqual(pitStates, want) {
		t.Fatalf("real LMU pit sequence = %v, want %v", pitStates, want)
	}
}

func TestRecordedLMUFrameRejectsTampering(t *testing.T) {
	root := t.TempDir()
	for _, frame := range recordedFrames {
		input, err := os.ReadFile(filepath.Join("..", "..", "..", "testdata", frame.name))
		if err != nil {
			t.Fatal(err)
		}
		if frame.name == recordedFrames[1].name {
			input[0] ^= 1
		}
		if err := os.WriteFile(filepath.Join(root, frame.name), input, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := loadRecordedFrames(root); err == nil {
		t.Fatal("tampered recorded LMU frame was accepted")
	}
}
