package schema

import (
	"errors"
	"testing"
)

func TestFieldKeepsZeroValuesPresent(t *testing.T) {
	t.Parallel()

	assertPresent(t, "numeric zero", 0)
	assertPresent(t, "false", false)
	assertPresent(t, "empty text", "")
}

func TestMissingFieldIsDistinctFromZero(t *testing.T) {
	t.Parallel()

	missing := MissingField[int]()
	value, present := missing.Value()
	if present || value != 0 {
		t.Fatalf("missing Value() = (%d, %v), want (0, false)", value, present)
	}
	if missing.Freshness() != FreshnessMissing || missing.Provenance() != ProvenanceUnknown {
		t.Fatalf("missing metadata = (%v, %v), want unknown/missing", missing.Provenance(), missing.Freshness())
	}
}

func TestNewFieldRejectsIncoherentMetadata(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		provenance Provenance
		freshness  Freshness
		wantErr    error
	}{
		{name: "unknown provenance", freshness: FreshnessFresh, wantErr: ErrUnknownProvenance},
		{name: "missing cannot carry a value", provenance: ProvenanceObserved, freshness: FreshnessMissing, wantErr: ErrMissingValue},
		{name: "unknown freshness", provenance: ProvenanceObserved, freshness: Freshness(255), wantErr: ErrUnknownFreshness},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewField(1, tt.provenance, tt.freshness)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("NewField() error = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestNewFieldAcceptsCanonicalQualityStates(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		provenance Provenance
		freshness  Freshness
	}{
		{name: "observed fresh", provenance: ProvenanceObserved, freshness: FreshnessFresh},
		{name: "derived stale", provenance: ProvenanceDerived, freshness: FreshnessStale},
		{name: "estimated invalid", provenance: ProvenanceEstimated, freshness: FreshnessInvalid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			field, err := NewField(0, tt.provenance, tt.freshness)
			if err != nil {
				t.Fatalf("NewField() error = %v", err)
			}
			if field.Provenance() != tt.provenance || field.Freshness() != tt.freshness {
				t.Fatalf("metadata = (%v, %v), want (%v, %v)", field.Provenance(), field.Freshness(), tt.provenance, tt.freshness)
			}
		})
	}
}

func assertPresent[T comparable](t *testing.T, name string, value T) {
	t.Helper()
	t.Run(name, func(t *testing.T) {
		field, err := NewField(value, ProvenanceObserved, FreshnessFresh)
		if err != nil {
			t.Fatalf("NewField() error = %v", err)
		}
		got, present := field.Value()
		if !present || got != value {
			t.Fatalf("Value() = (%v, %v), want (%v, true)", got, present, value)
		}
		if field.Freshness() != FreshnessFresh || field.Provenance() != ProvenanceObserved {
			t.Fatalf("metadata = (%v, %v), want observed/fresh", field.Provenance(), field.Freshness())
		}
	})
}
