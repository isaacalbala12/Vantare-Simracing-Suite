package standings

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestSectorUnknownValuesAreInvalid(t *testing.T) {
	t.Parallel()

	if SectorUnknown.Known() {
		t.Fatal("unknown sector must not become valid")
	}
	for _, sector := range []Sector{SectorOne, SectorTwo, SectorThree} {
		if !sector.Known() {
			t.Fatalf("sector %d must be known", sector)
		}
	}
	if Sector(255).Known() {
		t.Fatal("unrecognized sector must remain invalid")
	}
}

func TestStandingsSignalTypesPreserveLegitimateZero(t *testing.T) {
	t.Parallel()

	assertStandingsZeroPresent(t, CompletedLaps(0))
	assertStandingsZeroPresent(t, LapDistance(0))
	assertStandingsZeroPresent(t, LapTime(0))
	assertStandingsZeroPresent(t, PenaltyCount(0))
	assertStandingsZeroPresent(t, TimeGap(0))
	assertStandingsZeroPresent(t, LapGap(0))
	assertStandingsZeroPresent(t, RelativeTime(0))
	assertStandingsZeroPresent(t, RelativeLaps(0))
}

func assertStandingsZeroPresent[T comparable](t *testing.T, value T) {
	t.Helper()
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	got, present := field.Value()
	if !present || got != value {
		t.Fatalf("Value() = (%v,%v), want (%v,true)", got, present, value)
	}
}
