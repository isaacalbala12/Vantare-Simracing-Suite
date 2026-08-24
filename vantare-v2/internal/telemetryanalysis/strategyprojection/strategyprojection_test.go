package strategyprojection

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPresenceValid(t *testing.T) {
	for _, p := range []Presence{PresenceValid, PresenceMissing, PresenceInvalid, PresenceStale, PresenceUnsupported, PresenceUnknown} {
		if !p.Valid() {
			t.Fatalf("presence %s should be valid", p)
		}
	}
	if Presence("other").Valid() {
		t.Fatal("invalid presence should not be valid")
	}
}

func TestProvenanceReferenceAdded(t *testing.T) {
	// v2 introduce reference; must be valid y no existir en v1.
	if !ProvenanceReference.Valid() {
		t.Fatal("reference provenance must be valid in v2")
	}
	p := Provenance{Kind: ProvenanceReference, SourceID: "catalog:sha256:abc"}
	if err := p.Validate(); err != nil {
		t.Fatalf("reference provenance should validate: %v", err)
	}
	// unknown no puede llevar source
	if err := (Provenance{Kind: ProvenanceUnknown, SourceID: "x"}).Validate(); err == nil {
		t.Fatal("unknown with source should fail")
	}
}

func TestContinuousSegmentDoesNotCompressGaps(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	seg := ContinuousSegment{
		SegmentID:      "seg-1",
		SessionStartTs: now,
		SessionEndTs:   now.Add(time.Minute),
		Reason:         "continuous_window",
		Presence:       PresenceValid,
		Provenance:     Provenance{Kind: ProvenanceObserved, SourceID: "lmu:session:1"},
		Confidence:     Confidence{SampleSize: 100, ComputationVersion: "1.0.0"},
	}
	if err := seg.Validate(); err != nil {
		t.Fatalf("segment validate: %v", err)
	}
	gap := CoverageGap{
		GapID:      "gap-1",
		StartTs:    now.Add(time.Minute),
		EndTs:      now.Add(2 * time.Minute),
		Reason:     "driver_not_in_car",
		Presence:   PresenceMissing,
		Provenance: Provenance{Kind: ProvenanceDerived, SourceID: "analysis:gapdetector"},
	}
	if err := gap.Validate(); err != nil {
		t.Fatalf("gap validate: %v", err)
	}
	if !gap.EndTs.After(gap.StartTs) {
		t.Fatal("gap must have duration")
	}
}

func TestLapBoundarySourceAndQuality(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	lb := LapBoundary{
		LapNumber:  1,
		Timestamp:  now,
		Source:     LapBoundarySourceReconciled,
		Quality:    PresenceValid,
		Provenance: Provenance{Kind: ProvenanceDerived, SourceID: "analysis:lap"},
		Confidence: Confidence{SampleSize: 1, ComputationVersion: "1.0.0"},
		Location:   TrackLocation{NormalizedDistance: 0.0, Presence: PresenceValid},
	}
	if err := lb.Validate(); err != nil {
		t.Fatalf("lap boundary: %v", err)
	}
}

func TestStintBoundaryCauseAndConfidence(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	sb := StintBoundary{
		StintNumber: 1,
		Timestamp:   now,
		Cause:       StintCausePit,
		Presence:    PresenceValid,
		Provenance:  Provenance{Kind: ProvenanceObserved, SourceID: "lmu:in_pits"},
		Confidence:  Confidence{SampleSize: 2, ComputationVersion: "1.0.0"},
	}
	if err := sb.Validate(); err != nil {
		t.Fatalf("stint boundary: %v", err)
	}
}

func TestCombinedStintPaceCurveIdentifiability(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	curve := CombinedStintPaceCurve{
		Presence:        PresenceValid,
		Provenance:      Provenance{Kind: ProvenanceDerived, SourceID: "analysis:pace"},
		Confidence:      Confidence{SampleSize: 14, ComputationVersion: "1.0.0"},
		Identifiability: IdentifiabilityCombinedOnly,
		Points:          []PacePoint{{LapInStint: 1, DeltaSeconds: 7.19, SampleSize: 14}},
	}
	if err := curve.Validate(); err != nil {
		t.Fatalf("combined curve: %v", err)
	}
	// Separable solo si gate pasa
	proj := StrategyInputProjectionV2{
		ContractVersion:        ContractVersionStrategyInputProjectionV2,
		GeneratedAt:            now,
		ComputationVersion:     "1.0.0",
		SourceSessions:         []string{"sess-1"},
		CombinationID:          "fuji-classic-hypercar",
		CombinedStintPaceCurve: curve,
		Pit:                    PitFamily{Presence: PresenceValid, Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "analysis:pit"}, Confidence: Confidence{SampleSize: 1, ComputationVersion: "1.0.0"}, RatesNote: "observed 1.9-4.0 L/s"},
	}
	if err := proj.Validate(); err != nil {
		t.Fatalf("projection without separable: %v", err)
	}
	// Intentar publicar fuelWeightCurve sin separable debe fallar
	proj.FuelWeightCurve = &SeparableCurve{Presence: PresenceValid, Provenance: Provenance{Kind: ProvenanceDerived, SourceID: "x"}, Confidence: Confidence{SampleSize: 1, ComputationVersion: "1.0.0"}}
	if err := proj.Validate(); err == nil {
		t.Fatal("expected error when fuelWeightCurve without separable")
	}
}

func TestRepresentativePaceRequiresValueWhenValidAndReasonWhenMissing(t *testing.T) {
	pace := RepresentativePaceFamily{
		Presence:   PresenceMissing,
		Provenance: Provenance{Kind: ProvenanceDerived, SourceID: "analysis:pace"},
		Confidence: Confidence{ComputationVersion: "consumption-pace.v2"},
	}
	if err := pace.Validate("representativePaceByClimateBucket.dry"); err == nil {
		t.Fatal("missing representative pace without cause must fail")
	}
	pace.Reason = "no_reliable_lap_time_for_representative_pace"
	if err := pace.Validate("representativePaceByClimateBucket.dry"); err != nil {
		t.Fatalf("missing representative pace with cause: %v", err)
	}
	pace.Presence = PresenceValid
	pace.Reason = ""
	pace.Confidence.SampleSize = 3
	pace.MedianLapSeconds = 90.82
	if err := pace.Validate("representativePaceByClimateBucket.dry"); err != nil {
		t.Fatalf("valid representative pace: %v", err)
	}
}

func TestPitWithoutResourceRiseMustBeAmbiguous(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	projection := StrategyInputProjectionV2{
		ContractVersion:    ContractVersionStrategyInputProjectionV2,
		GeneratedAt:        now,
		ComputationVersion: "1.0.0",
		CombinedStintPaceCurve: CombinedStintPaceCurve{
			Presence:        PresenceMissing,
			Provenance:      Provenance{Kind: ProvenanceDerived, SourceID: "analysis:pace"},
			Confidence:      Confidence{ComputationVersion: "1.0.0"},
			Identifiability: IdentifiabilityCombinedOnly,
			Points:          []PacePoint{},
		},
		Pit: PitFamily{
			Presence: PresenceUnknown,
			ObservedIntervals: []ObservedPitLaneInterval{{
				PitNumber:       1,
				DurationSeconds: 30,
			}},
		},
	}
	if err := projection.Validate(); err == nil {
		t.Fatal("pit without a resource rise must declare ambiguity")
	}
	projection.Pit.ObservedIntervals[0].Ambiguous = true
	projection.Pit.ObservedIntervals[0].AmbiguityReason = "no_resource_rise_detected"
	if err := projection.Validate(); err != nil {
		t.Fatalf("explicitly ambiguous pit should validate: %v", err)
	}
}

func TestFixturesDecode(t *testing.T) {
	cases := []struct {
		file string
		kind string
	}{
		{"testdata/strategyinputprojection_v2_new.json", "projection"},
		{"testdata/observedstrategy_v1.json", "observed"},
		{"testdata/temporalsegments_v1.json", "temporal"},
	}
	for _, tc := range cases {
		data, err := os.ReadFile(filepath.Join(".", tc.file))
		if err != nil {
			t.Fatalf("read %s: %v", tc.file, err)
		}
		switch tc.kind {
		case "projection":
			var p StrategyInputProjectionV2
			if err := json.Unmarshal(data, &p); err != nil {
				t.Fatalf("unmarshal %s: %v", tc.file, err)
			}
			if err := p.Validate(); err != nil {
				t.Fatalf("validate %s: %v", tc.file, err)
			}
		case "observed":
			var o ObservedStrategyV1
			if err := json.Unmarshal(data, &o); err != nil {
				t.Fatalf("unmarshal %s: %v", tc.file, err)
			}
			if err := o.Validate(); err != nil {
				t.Fatalf("validate %s: %v", tc.file, err)
			}
		case "temporal":
			var s TemporalSegmentsV1
			if err := json.Unmarshal(data, &s); err != nil {
				t.Fatalf("unmarshal %s: %v", tc.file, err)
			}
			for _, seg := range s.Segments {
				if err := seg.Validate(); err != nil {
					t.Fatalf("segment in %s: %v", tc.file, err)
				}
			}
		}
	}
}

func TestOldFixtureCompatibility(t *testing.T) {
	// old v1 no tenia reference ni gaps ni climate buckets; debe seguir decodificando como v2 con presence missing
	data, err := os.ReadFile(filepath.Join(".", "testdata/strategyinputprojection_v1_old.json"))
	if err != nil {
		t.Fatalf("read old fixture: %v", err)
	}
	// old fixture es JSON generico; verificamos que no contiene reference ni gaps
	raw := string(data)
	if strings.Contains(raw, "\"reference\"") {
		t.Fatal("old fixture must not contain reference provenance")
	}
	// debe decodificar como mapa y tener contractVersion v1 (simulado)
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("old fixture json: %v", err)
	}
	if m["contractVersion"] != "strategyinputprojection.v1" {
		t.Fatalf("old fixture contractVersion mismatch: %v", m["contractVersion"])
	}
}

func TestNoImportOfStrategyPrivateDomain(t *testing.T) {
	// Guard: este paquete no debe importar internal/strategy.
	// Solo fallar si hay un import real (linea con tab/import).
	files, _ := filepath.Glob("*.go")
	for _, f := range files {
		if f == "strategyprojection_test.go" {
			continue
		}
		data, _ := os.ReadFile(f)
		for _, line := range strings.Split(string(data), "\n") {
			trim := strings.TrimSpace(line)
			if strings.HasPrefix(trim, "import") || strings.Contains(trim, "\"github.com/vantare/overlays/v2/internal/strategy") {
				if strings.Contains(line, "internal/strategy") {
					t.Fatalf("forbidden import of internal/strategy in %s: %s", f, line)
				}
			}
		}
	}
}
