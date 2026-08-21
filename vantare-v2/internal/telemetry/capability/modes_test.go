package capability

import (
	"slices"
	"testing"
)

func TestResolveModesKeepsFullGeometryWhenTheSessionIsHealthy(t *testing.T) {
	t.Parallel()

	modes := ResolveModes(lmuLike(), SessionEvidence{
		WorldPosition:   QualityFresh,
		LapDistance:     QualityFresh,
		DeltaReferences: []string{"previous-lap", "personal-best", "session-best"},
		Standings:       QualityFresh,
		Gaps:            QualityFresh,
	})
	if modes.Spatial != SpatialXYZ {
		t.Fatalf("spatial = %q, want xyz", modes.Spatial)
	}
	if !slices.Equal(modes.DeltaReferences, []string{"personal-best", "session-best", "previous-lap"}) {
		t.Fatalf("delta references = %v, want the declared order", modes.DeltaReferences)
	}
	if modes.Standings != StandingsOfficial || modes.Gaps != GapsOfficial {
		t.Fatalf("standings/gaps = %q/%q, want official/official", modes.Standings, modes.Gaps)
	}
}

func TestResolveModesDegradesGeometryWhenWorldPositionIsNotFresh(t *testing.T) {
	t.Parallel()

	stale := ResolveModes(lmuLike(), SessionEvidence{
		WorldPosition:   QualityStale,
		LapDistance:     QualityFresh,
		DeltaReferences: []string{"personal-best"},
		Standings:       QualityStale,
		Gaps:            QualityMissing,
	})
	if stale.Spatial != SpatialLapDistance {
		t.Fatalf("spatial = %q, want lap-distance", stale.Spatial)
	}
	if !slices.Equal(stale.DeltaReferences, []string{"personal-best"}) {
		t.Fatalf("delta references = %v, want only the reference with data", stale.DeltaReferences)
	}
	if stale.Standings != StandingsOfficial {
		t.Fatalf("standings = %q, want official while the order is still usable", stale.Standings)
	}
	if stale.Gaps != GapsNone {
		t.Fatalf("gaps = %q, want none when the gap set is missing", stale.Gaps)
	}

	blind := ResolveModes(lmuLike(), SessionEvidence{
		WorldPosition: QualityMissing,
		LapDistance:   QualityMissing,
		Standings:     QualityMissing,
		Gaps:          QualityInvalid,
	})
	if blind.Spatial != SpatialNone {
		t.Fatalf("spatial = %q, want none", blind.Spatial)
	}
	if len(blind.DeltaReferences) != 0 {
		t.Fatalf("delta references = %v, want empty", blind.DeltaReferences)
	}
	if blind.Standings != StandingsNone || blind.Gaps != GapsNone {
		t.Fatalf("standings/gaps = %q/%q, want none/none", blind.Standings, blind.Gaps)
	}
}

func TestResolveModesNeverPromotesADriverBeyondItsDeclaration(t *testing.T) {
	t.Parallel()

	modes := ResolveModes(lapDistanceOnly(), SessionEvidence{
		WorldPosition:   QualityFresh,
		LapDistance:     QualityFresh,
		DeltaReferences: []string{"personal-best", "session-best", "previous-lap"},
		Standings:       QualityFresh,
		Gaps:            QualityFresh,
	})
	if modes.Spatial != SpatialLapDistance {
		t.Fatalf("spatial = %q, want lap-distance even with fresh world positions", modes.Spatial)
	}
	if !slices.Equal(modes.DeltaReferences, []string{"session-best", "previous-lap"}) {
		t.Fatalf("delta references = %v, want personal-best excluded by the declaration", modes.DeltaReferences)
	}
	if modes.Standings != StandingsOfficial {
		t.Fatalf("standings = %q, want official", modes.Standings)
	}
	if modes.Gaps != GapsEstimated {
		t.Fatalf("gaps = %q, want estimated as declared", modes.Gaps)
	}
}

func TestResolveModesSilencesModesOfUnsupportedCapabilities(t *testing.T) {
	t.Parallel()

	declaration := Declaration{
		Driver:    "bare",
		Supported: []ID{Session},
		Modes: Modes{
			Spatial:         SpatialXYZ,
			DeltaReferences: []string{"personal-best"},
			Standings:       StandingsOfficial,
			Gaps:            GapsOfficial,
		},
	}
	modes := ResolveModes(declaration, SessionEvidence{
		WorldPosition:   QualityFresh,
		LapDistance:     QualityFresh,
		DeltaReferences: []string{"personal-best"},
		Standings:       QualityFresh,
		Gaps:            QualityFresh,
	})
	if modes.Spatial != SpatialNone || modes.Standings != StandingsNone || modes.Gaps != GapsNone {
		t.Fatalf("modes = %#v, want the none vocabulary for unsupported capabilities", modes)
	}
	if len(modes.DeltaReferences) != 0 {
		t.Fatalf("delta references = %v, want empty", modes.DeltaReferences)
	}
}
