package app

import (
	"context"
	"errors"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestPostReducerStageFailureKeepsCursorsAligned(t *testing.T) {
	t.Skip("ISA-371 D-01: activar en F3")

	mapper := lmu.NewBatchMapper()
	sink := &postReducerFailingSink{reducer: telemetrycore.NewReducer(), failNext: true}
	observation := commitBoundaryObservation(1)
	firstErr := mapper.WriteObservation(context.Background(), observation, sink)
	if !errors.Is(firstErr, errInjectedPostReducerStage) {
		t.Fatalf("first post-reducer error = %v, want injected stage failure", firstErr)
	}

	observation.ReceivedUTC = observation.ReceivedUTC.Add(time.Second / 60)
	observation.SourceTime = runtimePresent(time.Second + time.Second/60)
	secondErr := mapper.WriteObservation(context.Background(), observation, sink)
	if errors.Is(secondErr, telemetrycore.ErrStaleBatch) {
		t.Fatalf("mapper/reducer cursors diverged after post-reducer failure: %v", secondErr)
	}
}

var errInjectedPostReducerStage = errors.New("injected post-reducer stage failure")

type postReducerFailingSink struct {
	reducer  *telemetrycore.Reducer
	failNext bool
}

func (sink *postReducerFailingSink) WriteBatch(_ context.Context, batch telemetrycore.Batch) error {
	if _, err := sink.reducer.Apply(batch); err != nil {
		return err
	}
	if sink.failNext {
		sink.failNext = false
		return errInjectedPostReducerStage
	}
	return nil
}

func commitBoundaryObservation(count int) lmu.Observation {
	result := lmu.Observation{
		Source: lmu.SourceCanonical, ReceivedUTC: time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC),
		Compatibility: lmu.CompatibilityKnown, SourceTime: runtimePresent(time.Second),
		TrackName: runtimePresent("Circuit de la Sarthe"), SessionType: runtimePresent(session.TypeRace),
		VehicleCount: runtimePresent(schema.Count(count)), PlayerPresent: runtimePresent(true),
		Vehicles: make([]lmu.VehicleObservation, count),
	}
	for index := range result.Vehicles {
		result.Vehicles[index] = lmu.VehicleObservation{
			SourceID: lmu.VehicleSourceID(index), Player: runtimePresent(index == 0),
			Position: runtimePresent(standings.Position(index + 1)), CompletedLaps: runtimePresent(standings.CompletedLaps(0)),
			WorldPosition: runtimePresent(spatial.Position{X: float64(index)}),
			LocalVelocity: runtimePresent(spatial.LocalVelocity{Z: -1}),
			Orientation: runtimePresent(spatial.Orientation{
				Row0: spatial.Vector3{X: 1}, Row1: spatial.Vector3{Y: 1}, Row2: spatial.Vector3{Z: 1},
			}),
		}
	}
	return result
}
