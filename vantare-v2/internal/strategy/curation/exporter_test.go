package curation

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestGenerateFromDerivationsBuildsClosedQuantizedBundle(t *testing.T) {
	projection := loadProjectionFixture(t)
	projection.GeneratedAt = time.Date(2026, 8, 21, 14, 15, 16, 0, time.UTC)
	projection.CombinationID = "lmu:spa:lmp2"
	projection.SourceSessions = []string{"session-a"}
	projection.FuelConsumption.MeanPerLap = 2.5
	projection.VirtualEnergyConsumption.MeanPerLap = 1.25
	projection.LapValidity.Laps = []strategyprojection.LapValidity{
		{SessionID: "session-a", LapNumber: 1, Included: true},
		{SessionID: "session-a", LapNumber: 2, Included: false, Reason: "pit"},
	}
	projection.Pit.ObservedIntervals = []strategyprojection.ObservedPitLaneInterval{
		{PitNumber: 1, DurationSeconds: 20, HasFuelRise: true, FuelRateLPerS: floatPtr(2)},
	}
	observed := strategyprojection.ObservedStrategyV1{
		ContractVersion: strategyprojection.ContractVersionObservedStrategyV1,
		SessionID:       "session-a",
		GeneratedAt:     projection.GeneratedAt,
		Presence:        strategyprojection.PresenceValid,
		Provenance:      projection.LapValidity.Provenance,
		Confidence:      projection.LapValidity.Confidence,
		Stints: []strategyprojection.ObservedStint{
			{StintNumber: 1, StartLap: 1, EndLap: 10, CompoundRaw: intPtr(1), Presence: strategyprojection.PresenceValid, Provenance: projection.LapValidity.Provenance},
			{StintNumber: 2, StartLap: 11, EndLap: 19, CompoundRaw: intPtr(2), Presence: strategyprojection.PresenceValid, Provenance: projection.LapValidity.Provenance},
		},
		PitStops: []strategyprojection.ObservedPitStop{
			{LapNumber: 10, PitLaneSeconds: 20, Presence: strategyprojection.PresenceValid, Provenance: projection.LapValidity.Provenance},
		},
	}

	bundle, err := GenerateFromDerivations(ExportRequest{
		UploadID:   "install-123",
		DeleteHash: "delete-hash",
		BundleID:   "bundle-123",
		Projection: projection,
		Observed:   []strategyprojection.ObservedStrategyV1{observed},
	})
	if err != nil {
		t.Fatalf("generate bundle: %v", err)
	}
	if bundle.Payload.Epoch != "2026-W34" {
		t.Fatalf("epoch = %q", bundle.Payload.Epoch)
	}
	if bundle.Admin.UploadID != "install-123" || bundle.Payload.CombinationID != "lmu:spa:lmp2" {
		t.Fatalf("identity mapping = %+v / %q", bundle.Admin, bundle.Payload.CombinationID)
	}
	if got := bundle.Payload.ObservedStrategies[0]; got.StintCount != 2 || len(got.PitLaps) != 1 || got.PitLaps[0] != 10 {
		t.Fatalf("observed strategy = %+v", got)
	}
	encoded, err := bundle.MarshalStrict()
	if err != nil {
		t.Fatalf("marshal strict: %v", err)
	}
	for _, forbidden := range []string{"session-a", "2026-08-21", "startTimestamp", "generatedAt", "trackName", "carName"} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("analytical payload leaked %q: %s", forbidden, encoded)
		}
	}
}

func TestGenerateFromDerivationsRejectsPIICanaries(t *testing.T) {
	projection := loadProjectionFixture(t)
	projection.GeneratedAt = time.Date(2026, 8, 21, 14, 15, 16, 0, time.UTC)
	projection.SourceSessions = []string{"session-a"}
	projection.LapValidity.Laps = []strategyprojection.LapValidity{{SessionID: "session-a", LapNumber: 1, Included: true}}
	observed := strategyprojection.ObservedStrategyV1{
		ContractVersion: strategyprojection.ContractVersionObservedStrategyV1,
		SessionID:       "session-a",
		GeneratedAt:     projection.GeneratedAt,
		Presence:        strategyprojection.PresenceValid,
		Provenance:      projection.LapValidity.Provenance,
		Confidence:      projection.LapValidity.Confidence,
		Stints: []strategyprojection.ObservedStint{
			{StintNumber: 1, StartLap: 1, EndLap: 2, Presence: strategyprojection.PresenceValid, Provenance: projection.LapValidity.Provenance},
		},
	}
	for _, canary := range []string{"steamid:123", "driverName", "userpath", "raw-telemetry@example.com"} {
		t.Run(canary, func(t *testing.T) {
			projection.CombinationID = canary
			_, err := GenerateFromDerivations(ExportRequest{
				UploadID: "install-123", DeleteHash: "delete-hash", BundleID: "bundle-123",
				Projection: projection, Observed: []strategyprojection.ObservedStrategyV1{observed},
			})
			if err == nil {
				t.Fatal("PII canary was accepted")
			}
		})
	}
}

func loadProjectionFixture(t *testing.T) strategyprojection.StrategyInputProjectionV2 {
	t.Helper()
	path := filepath.Join("..", "..", "telemetryanalysis", "strategyprojection", "testdata", "strategyinputprojection_v2_new.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read projection fixture: %v", err)
	}
	var projection strategyprojection.StrategyInputProjectionV2
	if err := json.Unmarshal(data, &projection); err != nil {
		t.Fatalf("decode projection fixture: %v", err)
	}
	return projection
}

func floatPtr(value float64) *float64 { return &value }
func intPtr(value int) *int           { return &value }
