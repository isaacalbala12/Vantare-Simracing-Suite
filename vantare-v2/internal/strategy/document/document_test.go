package document

import (
	"encoding/json"
	"testing"
	"time"
)

func TestStrategyDocumentV2_Validate_FullFromOrbit(t *testing.T) {
	doc := validDocumentV2(t)
	if err := doc.Validate(); err != nil {
		t.Fatalf("validate: %v", err)
	}
	b, _ := json.Marshal(doc)
	var out StrategyDocumentV2
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("round-trip: %v", err)
	}
}

func validDocumentV2(t *testing.T) StrategyDocumentV2 {
	t.Helper()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	ev := Event{
		ID:             "own-1",
		Name:           Sourced[string]{Value: "Evento legacy completo", Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit.events-full"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "manual"}}},
		Source:         Sourced[EventSource]{Value: EventSourceCustom, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "manual"}}},
		Track:          Sourced[string]{Value: "Spa-Francorchamps", Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "manual"}}},
		Class:          Sourced[string]{Value: "LMGT3", Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "manual"}}},
		DurationMin:    Sourced[int]{Value: 120, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "manual"}}},
		StartAt:        Sourced[*time.Time]{Value: &now, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "manual"}}},
		Drivers:        []Driver{{ID: "driver-1", Order: 0}},
		TankLiters:     Sourced[float64]{Value: 100, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "manual"}}},
		PitLossSeconds: Sourced[float64]{Value: 54, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "manual"}}},
		Strategies:     []Variant{{ID: "s1", Name: Sourced[string]{Value: "Base", Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "m"}}}, Note: Sourced[string]{Value: "", Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "m"}}}, Mode: Sourced[VariantMode]{Value: VariantModeDry, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "m"}}}, Order: []DriverID{"driver-1"}, State: Sourced[VariantState]{Value: VariantStateOK, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "m"}}}}},
		Availability:   map[DriverID][]AvailabilityWindow{"driver-1": {{State: AvailabilityOK, From: 780, To: 1110}}},
		FillMode:       Sourced[FillMode]{Value: FillModeManual, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "manual"}}},
		TyreInventory:  TyreInventory{Sets: []TyreSet{}},
	}
	active := ev.ID
	doc := StrategyDocumentV2{
		ContractVersion: ContractVersionV2,
		SchemaVersion:   SchemaVersionV2,
		GeneratedAt:     now,
		Events:          []Event{ev},
		ActiveEventID:   &active,
	}
	return doc
}

func TestStrategyDocumentV2CombinationReferenceIsAdditiveAndValidated(t *testing.T) {
	doc := validDocumentV2(t)
	doc.Events[0].Combination = &CombinationReference{
		CombinationID: "lmu:combination",
		Sessions:      []SessionSelection{{SessionID: "race-1", Included: true}, {SessionID: "practice-1", Included: false}},
	}
	if err := doc.Validate(); err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	var reloaded StrategyDocumentV2
	if err := json.Unmarshal(raw, &reloaded); err != nil || reloaded.Events[0].Combination == nil || reloaded.Events[0].Combination.Sessions[1].Included {
		t.Fatalf("reloaded = %+v, error = %v", reloaded.Events[0].Combination, err)
	}
	reloaded.Events[0].Combination.Sessions = append(reloaded.Events[0].Combination.Sessions, SessionSelection{SessionID: "race-1"})
	if err := reloaded.Validate(); err == nil {
		t.Fatal("duplicate session accepted")
	}
}

func TestStrategyDocumentV2_LegacySyntheticDefaults(t *testing.T) {
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	ev := Event{
		ID:             "sparse-1",
		Name:           Sourced[string]{Value: "sparse-1", Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceLegacySyntheticDefault, SourceID: "orbit.migration"}, Confidence: Confidence{Level: ConfidenceUnknown}}},
		Source:         Sourced[EventSource]{Value: EventSourceCustom, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceLegacySyntheticDefault, SourceID: "orbit.migration"}, Confidence: Confidence{Level: ConfidenceUnknown}}},
		Track:          Sourced[string]{Value: "", Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceUnknown}, Confidence: Confidence{Level: ConfidenceUnknown}}},
		Class:          Sourced[string]{Value: "", Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceUnknown}, Confidence: Confidence{Level: ConfidenceUnknown}}},
		DurationMin:    Sourced[int]{Value: 60, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceLegacySyntheticDefault, SourceID: "orbit.migration.60min"}, Confidence: Confidence{Level: ConfidenceUnknown}}},
		StartAt:        Sourced[*time.Time]{Value: nil, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceUnknown}, Confidence: Confidence{Level: ConfidenceUnknown}}},
		Drivers:        []Driver{{ID: "driver-1", Order: 0}},
		TankLiters:     Sourced[float64]{Value: 90, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceLegacySyntheticDefault, SourceID: "orbit.migration.tankL"}, Confidence: Confidence{Level: ConfidenceUnknown}}},
		PitLossSeconds: Sourced[float64]{Value: 60, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceLegacySyntheticDefault, SourceID: "orbit.migration.pitLoss"}, Confidence: Confidence{Level: ConfidenceUnknown}}},
		Strategies:     []Variant{{ID: "s1", Name: Sourced[string]{Value: "s1", Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceLegacySyntheticDefault, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceUnknown}}}, Note: Sourced[string]{Value: "", Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceUnknown}, Confidence: Confidence{Level: ConfidenceUnknown}}}, Mode: Sourced[VariantMode]{Value: VariantModeDry, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceLegacySyntheticDefault, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceUnknown}}}, Order: []DriverID{"driver-1"}, State: Sourced[VariantState]{Value: VariantStateDraft, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceLegacySyntheticDefault, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceUnknown}}}, Overrides: map[string]json.RawMessage{}, Tyres: map[string]json.RawMessage{}}},
		Availability:   map[DriverID][]AvailabilityWindow{},
		FillMode:       Sourced[FillMode]{Value: FillModeManual, Evidence: Evidence{Provenance: Provenance{Kind: ProvenanceObserved, SourceID: "orbit"}, Confidence: Confidence{Level: ConfidenceHigh, Basis: "manual"}}},
		TyreInventory:  TyreInventory{Sets: []TyreSet{}},
		RawLegacy:      []byte(`{"id":"sparse-1"}`),
	}
	active := ev.ID
	doc := StrategyDocumentV2{ContractVersion: ContractVersionV2, SchemaVersion: SchemaVersionV2, GeneratedAt: now, Events: []Event{ev}, ActiveEventID: &active}
	if err := doc.Validate(); err != nil {
		t.Fatalf("validate sparse: %v", err)
	}
	if ev.DurationMin.Evidence.Provenance.Kind != ProvenanceLegacySyntheticDefault {
		t.Fatalf("expected legacy_synthetic_default")
	}
}

func TestStrategyDocumentV2_ValidationFailures(t *testing.T) {
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	active := EventID("missing")
	doc := StrategyDocumentV2{ContractVersion: "strategy.v1", SchemaVersion: SchemaVersionV2, GeneratedAt: now}
	if err := doc.Validate(); err == nil {
		t.Fatalf("expected version error")
	}
	doc.ContractVersion = ContractVersionV2
	doc.SchemaVersion = "bad"
	doc.Events = nil
	doc.ActiveEventID = &active
	if err := doc.Validate(); err == nil {
		t.Fatalf("expected schema error")
	}
}
