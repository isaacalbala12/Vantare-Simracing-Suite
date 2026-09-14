package service_test

import (
	"context"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/service"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func boundaryTestFact(epoch schema.Epoch, sequence telemetrycore.FactSequence) engineerprojection.FactEnvelopeV1 {
	return engineerprojection.FactEnvelopeV1{
		Metadata: projection.Metadata{Epoch: epoch},
		Fact:     engineerprojection.FactV1{Sequence: sequence, Kind: engineerprojection.FactLapCompleted},
	}
}

func TestEngineerServiceFactBoundaryDegradesHealthUntilNewEpoch(t *testing.T) {
	svc := service.NewEngineerService(nil)
	if err := svc.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	if err := svc.ConsumeFact(boundaryTestFact(1, 1)); err != nil {
		t.Fatal(err)
	}
	before := svc.Health()
	boundary := &engineerprojection.FactResyncRequiredError{Previous: 1, Next: 3}
	if err := svc.ConsumeFactBoundary(boundary); err != nil {
		t.Fatal(err)
	}
	if got := svc.Health(); got.LastError != boundary.Error() {
		t.Fatalf("Health LastError = %q after boundary, want %q", got.LastError, boundary.Error())
	} else if got.Connected != before.Connected || got.Source != before.Source {
		t.Fatalf("fact boundary changed connection %+v -> %+v, want untouched", before, got)
	}
	// El stream (Status) también lo muestra: Health solo no alcanza.
	if got := svc.Status().LastError; got != boundary.Error() {
		t.Fatalf("Status LastError = %q after boundary, want %q", got, boundary.Error())
	}
	// Los facts del mismo epoch siguen fluyendo, pero la degradacion persiste.
	if err := svc.ConsumeFact(boundaryTestFact(1, 2)); err != nil {
		t.Fatal(err)
	}
	if got := svc.Health().LastError; got != boundary.Error() {
		t.Fatalf("Health LastError = %q after same-epoch fact, want %q", got, boundary.Error())
	}
	// Una observacion exitosa no limpia la degradacion ni la provoca: connected
	// lo decide la observacion, el gap sigue visible.
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}
	if got := svc.Health(); got.LastError != boundary.Error() || !got.Connected {
		t.Fatalf("Health after observation = %+v, want gap %q with connected=true", got, boundary.Error())
	}
	if got := svc.Status().LastError; got != boundary.Error() {
		t.Fatalf("Status LastError = %q after observation, want %q", got, boundary.Error())
	}
	// Un epoch real nuevo limpia.
	if err := svc.ConsumeFact(boundaryTestFact(2, 1)); err != nil {
		t.Fatal(err)
	}
	if got := svc.Health().LastError; got != "" {
		t.Fatalf("Health LastError = %q after new epoch, want empty", got)
	}
}
