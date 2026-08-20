package capability

import (
	"errors"
	"slices"
	"testing"
)

func lmuLike() Declaration {
	return Declaration{
		Driver:    "lmu",
		Supported: []ID{Session, Controls, Standings, Gaps, Fuel, Pit, Delta, SpatialLongitudinal, SpatialLateral, Spotter},
		Modes: Modes{
			Spatial:         SpatialXYZ,
			DeltaReferences: []string{"personal-best", "session-best", "previous-lap"},
			Standings:       StandingsOfficial,
			Gaps:            GapsOfficial,
		},
	}
}

func lapDistanceOnly() Declaration {
	return Declaration{
		Driver:    "simx",
		Supported: []ID{Session, Controls, Standings, Gaps, Fuel, Pit, Delta, SpatialLongitudinal},
		Modes: Modes{
			Spatial:         SpatialLapDistance,
			DeltaReferences: []string{"session-best", "previous-lap"},
			Standings:       StandingsOfficial,
			Gaps:            GapsEstimated,
		},
	}
}

func TestSpatialLongitudinalAndLateralAreSeparateCapabilities(t *testing.T) {
	t.Parallel()

	set, err := Resolve(lapDistanceOnly(), nil)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if set.State(SpatialLongitudinal) != StateSupported {
		t.Fatalf("longitudinal state = %v, want supported", set.State(SpatialLongitudinal))
	}
	if set.State(SpatialLateral) != StateUnsupported {
		t.Fatalf("lateral state = %v, want unsupported", set.State(SpatialLateral))
	}
	if set.State(Spotter) != StateUnsupported {
		t.Fatalf("spotter state = %v, want unsupported", set.State(Spotter))
	}
	if set.State(Weather) != StateUnsupported {
		t.Fatalf("weather state = %v, want unsupported", set.State(Weather))
	}
	if modes := set.Modes(); modes.Spatial != SpatialLapDistance || modes.Gaps != GapsEstimated {
		t.Fatalf("Modes() = %#v", modes)
	}
	if references := set.Modes().DeltaReferences; slices.Contains(references, "personal-best") {
		t.Fatalf("DeltaReferences = %v, want no reference the driver cannot answer", references)
	}
}

func TestAvailableIsPerSessionAndNeverWidensSupported(t *testing.T) {
	t.Parallel()

	set, err := Resolve(lmuLike(), Presence{Session: QualityFresh, Gaps: QualityStale})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	available := set.Available()
	if available[Session] != QualityFresh || available[Gaps] != QualityStale {
		t.Fatalf("Available() = %#v", available)
	}
	// A supported capability with no evidence yet is reported missing, not
	// absent: "not yet" must stay distinguishable from "never".
	if available[Delta] != QualityMissing {
		t.Fatalf("Available()[delta] = %q, want missing", available[Delta])
	}
	if _, present := available[Weather]; present {
		t.Fatal("an unsupported capability must not appear in Available()")
	}
	if set.State(Session) != StateSupported {
		t.Fatal("a fresh supported capability must stay supported")
	}
}

func TestResolveRejectsAvailabilityWithoutSupport(t *testing.T) {
	t.Parallel()

	_, err := Resolve(lapDistanceOnly(), Presence{SpatialLateral: QualityFresh})
	if !errors.Is(err, ErrUnsupportedAvailability) {
		t.Fatalf("Resolve() error = %v, want ErrUnsupportedAvailability", err)
	}
}

func TestResolveRejectsAnUnknownVocabulary(t *testing.T) {
	t.Parallel()

	declaration := lapDistanceOnly()
	declaration.Supported = append(declaration.Supported, ID("spatial"))
	if _, err := Resolve(declaration, nil); !errors.Is(err, ErrUnknownCapability) {
		t.Fatalf("unknown id error = %v", err)
	}
	duplicate := lapDistanceOnly()
	duplicate.Supported = append(duplicate.Supported, Session)
	if _, err := Resolve(duplicate, nil); !errors.Is(err, ErrDuplicateCapability) {
		t.Fatalf("duplicate id error = %v", err)
	}
	if _, err := Resolve(lapDistanceOnly(), Presence{Session: Quality("great")}); !errors.Is(err, ErrInvalidQuality) {
		t.Fatalf("invalid quality error = %v", err)
	}
}

func TestInvalidEvidenceDegradesASupportedCapability(t *testing.T) {
	t.Parallel()

	set, err := Resolve(lmuLike(), Presence{Gaps: QualityInvalid})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if set.State(Gaps) != StateDegraded {
		t.Fatalf("gaps state = %v, want degraded", set.State(Gaps))
	}
}

func TestModesAreNormalizedAndSupportedKeysAreSorted(t *testing.T) {
	t.Parallel()

	declaration := Declaration{Driver: "simx", Supported: []ID{Standings, Session}}
	set, err := Resolve(declaration, nil)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	keys := set.SupportedKeys()
	if len(keys) != 2 || keys[0] != string(Session) || keys[1] != string(Standings) {
		t.Fatalf("SupportedKeys() = %v", keys)
	}
	modes := set.Modes()
	if modes.Spatial != SpatialNone || modes.Standings != StandingsNone || modes.Gaps != GapsNone {
		t.Fatalf("Modes() = %#v, want the explicit none vocabulary", modes)
	}
	if modes.DeltaReferences == nil {
		t.Fatal("DeltaReferences must be an empty list, never nil")
	}
}
