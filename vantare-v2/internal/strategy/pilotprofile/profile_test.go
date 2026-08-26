package pilotprofile

import (
	"testing"
	"time"
)

func TestPilotProfile_ExportImport_RoundTrip(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	p := PilotProfileV1{
		ContractVersion: ContractVersionV1,
		ProfileID:       "prof-1",
		CombinationID:   "spa-lmgt3",
		Condition:       ConditionDry,
		DisplayName:     "Equipo Alfa",
		ExportedAt:      now,
		Fuel:            FuelConsumption{MeanPerLap: 2.8, RangeLower: 2.6, RangeUpper: 3.0, SampleSize: 30},
		VE:              FuelConsumption{MeanPerLap: 1.2, RangeLower: 1.1, RangeUpper: 1.3, SampleSize: 30},
		Pace:            Pace{BaseSeconds: 105, DegradationPerLap: 0.3, SampleSize: 30},
		Provenance:      Provenance{Kind: "derived", SourceID: "strategyprojection.v2#spa"},
	}
	b, err := p.Export()
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	got, err := Import(b)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if got.ProfileID != p.ProfileID {
		t.Fatalf("mismatch")
	}
}

func TestPilotProfile_RejectUnknownFields(t *testing.T) {
	data := []byte(`{"contractVersion":"pilotprofile.v1","profileId":"p","combinationId":"c","condition":"dry","displayName":"n","exportedAt":"2026-08-21T14:00:00.000Z","fuel":{"meanPerLap":1,"rangeLower":1,"rangeUpper":1,"sampleSize":1},"ve":{"meanPerLap":1,"rangeLower":1,"rangeUpper":1,"sampleSize":1},"pace":{"baseSeconds":100,"degradationPerLap":0.3,"sampleSize":1},"provenance":{"kind":"derived","sourceId":"s"},"unknownField":123}`)
	if _, err := Import(data); err == nil {
		t.Fatalf("expected unknown field rejection")
	}
}
