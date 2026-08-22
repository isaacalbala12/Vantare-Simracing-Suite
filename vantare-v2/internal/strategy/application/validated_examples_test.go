package application

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/backtest"
	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type validatedRaceSourceStub struct {
	cases       []backtest.RaceCase
	combination string
}

func (stub *validatedRaceSourceStub) ListRaceCases(_ context.Context, combinationID string) ([]backtest.RaceCase, error) {
	stub.combination = combinationID
	return append([]backtest.RaceCase(nil), stub.cases...), nil
}

func TestGetValidatedExamplesReplaysAvailableRacesAndSummarizesObservedStrategy(t *testing.T) {
	newer := time.Date(2026, 8, 20, 18, 0, 0, 0, time.UTC)
	older := newer.Add(-7 * 24 * time.Hour)
	document := strategyDocumentWithCombination("event-1", "lmu:imola:lmp2")
	repo := &sessionCatalogRepository[any]{snapshot: repository.Snapshot[any]{Version: 12, StrategyDocument: document}}
	source := &validatedRaceSourceStub{cases: []backtest.RaceCase{
		validatedRaceCase("race-old", "lmu:imola:lmp2", older, []int{2, 2}, 100, 10),
		validatedRaceCase("race-new", "lmu:imola:lmp2", newer, []int{3, 1}, 101, 12),
	}}
	service := NewServiceWithSessionCatalogAndRaceCases[any](repo, nil, source)

	result, err := service.GetValidatedExamples(context.Background(), GetValidatedExamplesCommand{CommandHeader: CommandHeader{
		ProtocolVersion: ProtocolVersionV1, CommandID: "examples", Operation: OperationGetValidatedExamples, ExpectedRepositoryVersion: 12,
	}, EventID: "event-1"})
	if err != nil {
		t.Fatal(err)
	}
	if result.ValidatedExamples == nil || result.ValidatedExamples.Status != ValidatedExamplesAvailable {
		t.Fatalf("validated examples = %+v", result.ValidatedExamples)
	}
	got := result.ValidatedExamples
	if got.CombinationID != "lmu:imola:lmp2" || source.combination != got.CombinationID || len(got.Races) != 2 {
		t.Fatalf("validated examples = %+v, requested combination = %q", got, source.combination)
	}
	if got.Races[0].RaceID != "race-new" || got.Races[1].RaceID != "race-old" {
		t.Fatalf("race order = %+v", got.Races)
	}
	if got.Races[0].PredictedTotalSeconds != 416 || got.Races[0].ObservedTotalSeconds != 416 || got.Races[0].AbsoluteErrorRatio != 0 {
		t.Fatalf("newest calibration = %+v", got.Races[0])
	}
	if len(got.Races[0].Stints) != 2 || got.Races[0].Stints[0].Laps != 3 || got.Races[0].PitLaps[0] != 3 {
		t.Fatalf("observed summary = %+v", got.Races[0])
	}
	if got.Aggregate.RaceCount != 2 || got.Aggregate.TotalErrorRatio.Count != 2 || got.Aggregate.StintErrorRatio.Count != 4 {
		t.Fatalf("aggregate = %+v", got.Aggregate)
	}
	if repo.commitCalls != 0 {
		t.Fatalf("query committed %d times", repo.commitCalls)
	}
}

func TestGetValidatedExamplesReturnsHonestEmptyWhenCombinationHasNoRaces(t *testing.T) {
	document := strategyDocumentWithCombination("event-1", "lmu:imola:lmp2")
	repo := &sessionCatalogRepository[any]{snapshot: repository.Snapshot[any]{Version: 4, StrategyDocument: document}}
	service := NewServiceWithSessionCatalogAndRaceCases[any](repo, nil, &validatedRaceSourceStub{})

	result, err := service.GetValidatedExamples(context.Background(), GetValidatedExamplesCommand{CommandHeader: CommandHeader{
		ProtocolVersion: ProtocolVersionV1, CommandID: "empty-examples", Operation: OperationGetValidatedExamples, ExpectedRepositoryVersion: 4,
	}, EventID: "event-1"})
	if err != nil {
		t.Fatal(err)
	}
	if result.ValidatedExamples == nil || result.ValidatedExamples.Status != ValidatedExamplesNoRaces || len(result.ValidatedExamples.Races) != 0 {
		t.Fatalf("validated examples = %+v", result.ValidatedExamples)
	}
}

func TestJSONBridgeDispatchesValidatedExamples(t *testing.T) {
	document := strategyDocumentWithCombination("event-1", "lmu:imola:lmp2")
	repo := &sessionCatalogRepository[json.RawMessage]{snapshot: repository.Snapshot[json.RawMessage]{Version: 5, StrategyDocument: document}}
	source := &validatedRaceSourceStub{cases: []backtest.RaceCase{
		validatedRaceCase("race-1", "lmu:imola:lmp2", time.Date(2026, 8, 20, 18, 0, 0, 0, time.UTC), []int{2, 2}, 100, 10),
	}}
	bridge := NewJSONBridge(NewServiceWithSessionCatalogAndRaceCases[json.RawMessage](repo, nil, source))

	raw, err := bridge.Execute(context.Background(), []byte(`{"protocolVersion":"strategy.application.v1","commandId":"examples-wire","operation":"get_validated_examples","expectedRepositoryVersion":5,"eventId":"event-1"}`))
	if err != nil {
		t.Fatal(err)
	}
	var result Result[json.RawMessage]
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	if result.ValidatedExamples == nil || result.ValidatedExamples.Status != ValidatedExamplesAvailable || len(result.ValidatedExamples.Races) != 1 {
		t.Fatalf("result = %s", raw)
	}
}

func strategyDocumentWithCombination(eventID, combinationID string) *strategydocument.StrategyDocumentV2 {
	return &strategydocument.StrategyDocumentV2{Events: []strategydocument.Event{{
		ID:          strategydocument.EventID(eventID),
		Combination: &strategydocument.CombinationReference{CombinationID: combinationID},
	}}}
}

func validatedRaceCase(raceID, combinationID string, occurredAt time.Time, stintLaps []int, baseLap, pitSeconds float64) backtest.RaceCase {
	projection := sp.StrategyInputProjectionV2{
		ContractVersion: sp.ContractVersionStrategyInputProjectionV2,
		GeneratedAt:     occurredAt.Add(-48 * time.Hour), ComputationVersion: "application-test.v1",
		SourceSessions: []string{"training-before-race"}, CombinationID: combinationID,
		CombinedStintPaceCurve: sp.CombinedStintPaceCurve{
			Presence: sp.PresenceMissing, Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "training-before-race"},
			Confidence: sp.Confidence{ComputationVersion: "application-test.v1"}, Identifiability: sp.IdentifiabilityCombinedOnly,
		},
		Pit: sp.PitFamily{Presence: sp.PresenceMissing, Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "training-before-race"}, Confidence: sp.Confidence{ComputationVersion: "application-test.v1"}},
	}
	totalLaps := 0
	for _, laps := range stintLaps {
		totalLaps += laps
	}
	input := solver.SolverInputV2{
		ContractVersion: solver.SolverContractVersionV2, RaceLaps: int64(totalLaps),
		BaseLapSeconds: solver.NewFallbackScalar(baseLap, "application-test:pace"), Projection: &projection,
		PitCost: solver.PitCostModel{
			TransitSeconds:  solver.NewFallbackScalar(pitSeconds, "application-test:pit"),
			RefuelRateLPerS: solver.NewFallbackScalar(1, "application-test:refuel"), VERatePPerS: solver.NewFallbackScalar(1, "application-test:ve"),
			TyreSeconds: solver.NewFallbackScalar(0, "application-test:tyres"), ServiceMode: manual.PitServiceSequential,
		},
		Formation:          solver.Formation{Seconds: solver.NewFallbackScalar(0, "application-test:formation"), Presence: "valid"},
		Budget:             solver.ComputeBudget{P95Millis: 10_000},
		FuelCapacityLiters: solver.NewFallbackScalar(0, "application-test:fuel-capacity"), VECapacityPercent: solver.NewFallbackScalar(0, "application-test:ve-capacity"),
		TyreLifeLaps: solver.NewFallbackScalar(0, "application-test:tyre-life"), FuelPerLapLiters: solver.NewFallbackScalar(0, "application-test:fuel"),
		VEPerLapPercent: solver.NewFallbackScalar(0, "application-test:ve-per-lap"), DegradationPerLap: solver.NewFallbackScalar(0, "application-test:degradation"),
	}
	observed := sp.ObservedStrategyV1{
		ContractVersion: sp.ContractVersionObservedStrategyV1, SessionID: raceID, GeneratedAt: occurredAt.Add(time.Hour), Presence: sp.PresenceValid,
		Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: raceID}, Confidence: sp.Confidence{SampleSize: totalLaps, ComputationVersion: "application-test.v1"},
		Stints: []sp.ObservedStint{}, PitStops: []sp.ObservedPitStop{}, Changes: []sp.ObservedChange{},
	}
	lap, total := 1, 0.0
	for index, laps := range stintLaps {
		stintTotal := float64(laps) * baseLap
		if index < len(stintLaps)-1 {
			stintTotal += pitSeconds
		}
		endLap := lap + laps - 1
		observed.Stints = append(observed.Stints, sp.ObservedStint{StintNumber: index + 1, StartLap: lap, EndLap: endLap, TotalTimeSeconds: &stintTotal, Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceObserved, SourceID: raceID}})
		if index < len(stintLaps)-1 {
			observed.PitStops = append(observed.PitStops, sp.ObservedPitStop{LapNumber: endLap, PitLaneSeconds: pitSeconds, Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceObserved, SourceID: raceID}})
		}
		total += stintTotal
		lap = endLap + 1
	}
	observed.Result = &sp.ObservedResult{CompletedLaps: totalLaps, TotalTimeSeconds: total, Completed: true}
	return backtest.RaceCase{RaceID: raceID, CombinationID: combinationID, OccurredAt: occurredAt, TrainingDataThrough: occurredAt.Add(-48 * time.Hour), Dry: true, PredictionInput: input, RealizedInput: input, Observed: observed}
}
