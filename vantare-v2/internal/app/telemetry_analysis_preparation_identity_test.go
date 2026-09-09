package app

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

func TestPreparationOffersCanonicalCombinationWithoutPriorStrategyCatalog(t *testing.T) {
	for _, complete := range []bool{true, false} {
		t.Run(map[bool]string{true: "identified", false: "missing metadata"}[complete], func(t *testing.T) {
			svc, _, now := telemetryAnalysisTestService(t, true)
			t.Cleanup(func() {
				if err := svc.ServiceShutdown(); err != nil {
					t.Error(err)
				}
			})
			candidate := telemetryAnalysisReadyCandidate(t, svc, now)
			svc.runtimeReady = true
			svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
				a, b := 10000.0, 10090.0
				reader := &telemetryAnalysisReaderStub{
					evidence: artifact.Evidence(),
					catalog:  telemetryanalysis.LMUDuckDBCatalog{Events: []telemetryanalysis.LMUDuckDBChannel{{Name: "Lap", Columns: []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "USMALLINT"}}}}},
					rows:     []telemetryanalysis.LMUDuckDBRow{{TimestampSeconds: &a, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 1}}}, {TimestampSeconds: &b, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 2}}}},
				}
				if complete {
					for key, value := range map[string]string{"TrackName": "Imola", "TrackLayout": "Grand Prix", "CarName": "Test Car", "CarClass": "Hypercar", "SessionType": "Race", "WeatherConditions": "Clear"} {
						reader.catalog.Metadata = append(reader.catalog.Metadata, telemetryanalysis.LMUDuckDBMetadata{Key: key, Value: value, Present: true, Quality: telemetryanalysis.QualityValid})
					}
				}
				return reader, nil
			}
			ctx := context.Background()
			opened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
			if err != nil {
				t.Fatal(err)
			}
			prepared, err := svc.PrepareCorrections(ctx, opened.SessionID)
			if err != nil {
				t.Fatal(err)
			}
			encoded, err := json.Marshal(prepared)
			if err != nil {
				t.Fatal(err)
			}
			var response struct {
				Combination *telemetryanalysis.CombinationIdentity `json:"combination"`
				Reason      string                                 `json:"combinationUnavailableReason"`
			}
			if err := json.Unmarshal(encoded, &response); err != nil {
				t.Fatal(err)
			}
			if complete {
				classified, err := telemetryanalysis.ClassifyHistoricalSession(opened.Session)
				if err != nil {
					t.Fatal(err)
				}
				if response.Combination == nil || *response.Combination != classified.Combination || response.Reason != "" {
					t.Fatal("preparation did not expose the existing canonical classifier identity")
				}
			} else if response.Combination != nil || response.Reason != "metadata_unavailable" {
				t.Fatal("missing metadata must remain explicit without blocking correction preparation")
			}
			if prepared.Base.SessionID != opened.Session.ID || len(prepared.BaseRevisionID) != 64 {
				t.Fatal("preparation lost its exact correction identity")
			}
		})
	}
}
