package service_test

import (
	"context"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/service"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

func lifecycleFact(kind engineerprojection.FactKind) engineerprojection.FactEnvelopeV1 {
	return engineerprojection.FactEnvelopeV1{
		Metadata: projection.Metadata{Epoch: 1},
		Fact:     engineerprojection.FactV1{Sequence: telemetrycore.FactSequence(1), Kind: kind},
	}
}

func readySpotterService(t *testing.T) *service.EngineerService {
	t.Helper()
	svc := service.NewEngineerService(nil)
	if err := svc.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1)); err != nil {
		t.Fatal(err)
	}
	if got := svc.Status().SpotterAvailability.State; got != service.SpotterAvailabilityReady {
		t.Fatalf("spotter availability = %q, want ready", got)
	}
	return svc
}

func TestSpotterAvailabilityResetsAtLifecycleBoundaries(t *testing.T) {
	kinds := []engineerprojection.FactKind{
		engineerprojection.FactSessionStarted,
		engineerprojection.FactSessionEnded,
		engineerprojection.FactDriverChanged,
		engineerprojection.FactConnectionLost,
		engineerprojection.FactConnectionRecovered,
	}
	for _, kind := range kinds {
		t.Run(string(kind), func(t *testing.T) {
			svc := readySpotterService(t)
			defer svc.Stop()
			if err := svc.ConsumeFact(lifecycleFact(kind)); err != nil {
				t.Fatal(err)
			}
			availability := svc.Status().SpotterAvailability
			if availability.State != service.SpotterAvailabilityWaiting || availability.Reason != "source" {
				t.Fatalf("availability after %s = %+v, want waiting/source", kind, availability)
			}
		})
	}
}

func TestSpotterAvailabilityStaysDisabledAtLifecycleBoundaries(t *testing.T) {
	svc := service.NewEngineerService(nil)
	if err := svc.SetSpotterEnabled(false); err != nil {
		t.Fatal(err)
	}
	if err := svc.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	for index, kind := range []engineerprojection.FactKind{
		engineerprojection.FactSessionEnded,
		engineerprojection.FactConnectionLost,
		engineerprojection.FactConnectionRecovered,
	} {
		fact := lifecycleFact(kind)
		fact.Fact.Sequence = telemetrycore.FactSequence(index + 1)
		if err := svc.ConsumeFact(fact); err != nil {
			t.Fatal(err)
		}
		if got := svc.Status().SpotterAvailability.State; got != service.SpotterAvailabilityDisabled {
			t.Fatalf("availability after %s = %q, want disabled", kind, got)
		}
	}
}

func TestSpotterAvailabilityResetsOnStop(t *testing.T) {
	svc := readySpotterService(t)
	svc.Stop()
	availability := svc.Status().SpotterAvailability
	if availability.State != service.SpotterAvailabilityWaiting || availability.Reason != "source" {
		t.Fatalf("availability after Stop = %+v, want waiting/source", availability)
	}
}

func TestSpotterAvailabilityPreservesCapabilityState(t *testing.T) {
	cases := []struct {
		name   string
		state  engineerprojection.CapabilityState
		reason string
	}{
		{"unknown", engineerprojection.CapabilityUnknown, "capability"},
		{"unsupported", engineerprojection.CapabilityUnsupported, "capability_unsupported"},
		{"degraded", engineerprojection.CapabilityDegraded, "capability_degraded"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := service.NewEngineerService(nil)
			if err := svc.Start(context.Background()); err != nil {
				t.Fatal(err)
			}
			defer svc.Stop()

			observation := canonicalSpotterObservation(t, 1)
			manifest, err := engineerprojection.NewManifest([]engineerprojection.Capability{
				{ID: engineerprojection.CapabilitySpatial, State: tc.state},
			})
			if err != nil {
				t.Fatal(err)
			}
			observation.Manifest = manifest
			_ = svc.ConsumeObservation(observation)
			availability := svc.Status().SpotterAvailability
			if availability.State != service.SpotterAvailabilityUnavailable || availability.Reason != tc.reason {
				t.Fatalf("availability for %s = %+v, want unavailable/%s", tc.name, availability, tc.reason)
			}
		})
	}
}
