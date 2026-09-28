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
	var gears []int32
	for index, observation := range observations {
		if err := sink.WriteObservation(context.Background(), fusion.Merge(time.Now().UTC(), time.Duration(index)*recordedInterval, observation)); err != nil {
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
		gears = append(gears, update.Frame.Player.Gear.V)
		if update.Frame.Player.Gear.Q != overlayv2.QualityFresh {
			t.Fatalf("recorded frame %d gear quality = %s", index, update.Frame.Player.Gear.Q)
		}
	}
	if want := []string{overlayv2.PitStateTrack, overlayv2.PitStatePit, overlayv2.PitStateTrack}; !reflect.DeepEqual(pitStates, want) {
		t.Fatalf("real LMU pit sequence = %v, want %v", pitStates, want)
	}
	if want := []int32{1, 0, 1}; !reflect.DeepEqual(gears, want) {
		t.Fatalf("real LMU gear sequence = %v, want %v", gears, want)
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

func TestRecordedStandingsKeepsFortyFourRealCars(t *testing.T) {
	root := filepath.Join("..", "..", "..", "testdata")
	observations, err := loadRecordedStandings(root)
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
	for index := 0; index < 2; index++ {
		if err := sink.WriteObservation(context.Background(), fusion.Merge(time.Now().UTC(), time.Duration(index)*100*time.Millisecond, observations[0])); err != nil {
			t.Fatalf("publish 44-car frame %d: %v", index, err)
		}
		event, ok := publisher.ReplaySnapshot()
		if !ok {
			t.Fatalf("44-car frame %d published nothing", index)
		}
		var update overlayv2.UpdateV2
		if err := json.Unmarshal(event.Data, &update); err != nil {
			t.Fatal(err)
		}
		if update.DeliveryRevision != uint64(index+1) || update.Frame == nil || len(update.Frame.Standings) != 44 {
			t.Fatalf("44-car frame %d standings: %+v", index, update.Frame)
		}
	}
}

func TestRecordedStandingsRejectsTampering(t *testing.T) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	input[0] ^= 1
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "lmu-fixture.bin"), input, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadRecordedStandings(root); err == nil {
		t.Fatal("tampered 44-car frame was accepted")
	}
}
