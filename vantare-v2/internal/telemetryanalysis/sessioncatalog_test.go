package telemetryanalysis

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type authorizedSessionSourceStub struct{ models []AuthorizedSessionModel }

func (stub authorizedSessionSourceStub) ListAuthorizedSessions(context.Context) ([]AuthorizedSessionModel, error) {
	return stub.models, nil
}

func TestListAuthorizedSessionCombinationsGroupsWithoutExposingStorage(t *testing.T) {
	models := []AuthorizedSessionModel{
		catalogModel(t, "race-1", "Race", true, time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC), strategyprojection.ClimateBucketDry),
		catalogModel(t, "practice-1", "Practice", false, time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC), strategyprojection.ClimateBucketWet),
	}
	got, err := ListAuthorizedSessionCombinations(context.Background(), models)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].SessionCount != 2 || got[0].RaceCount != 1 {
		t.Fatalf("catalog = %+v", got)
	}
	if !got[0].LastActivity.Equal(models[1].Artifact.Evidence().Metadata.ModTime) {
		t.Fatalf("last activity = %s", got[0].LastActivity)
	}
	if len(got[0].Sessions) != 2 || got[0].Sessions[0].SessionID != "practice-1" || got[0].Sessions[0].DefaultIncluded {
		t.Fatalf("sessions = %+v", got[0].Sessions)
	}
	if got[0].Sessions[0].ExclusionReason != UnusableReasonNoCompletedLap {
		t.Fatalf("reason = %q", got[0].Sessions[0].ExclusionReason)
	}
	if len(got[0].ClimateBuckets) != 2 {
		t.Fatalf("buckets = %+v", got[0].ClimateBuckets)
	}
}

func TestListAuthorizedSessionCombinationsRejectsModelFromAnotherArtifact(t *testing.T) {
	model := catalogModel(t, "race-1", "Race", true, time.Now(), strategyprojection.ClimateBucketDry)
	model.Session.Provenance.Parser.Version = "other"
	if _, err := ListAuthorizedSessionCombinations(context.Background(), []AuthorizedSessionModel{model}); err != ErrInvalidAuthorizedSession {
		t.Fatalf("error = %v", err)
	}
}

func TestProjectStrategyInputsUsesExactAuthorizedSelection(t *testing.T) {
	first := catalogModel(t, "race-1", "Race", true, time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC), strategyprojection.ClimateBucketDry)
	second := catalogModel(t, "race-2", "Race", true, time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC), strategyprojection.ClimateBucketDry)
	classified, err := ClassifyHistoricalSession(first.Session)
	if err != nil {
		t.Fatal(err)
	}
	metric := DerivedMetric{
		Presence:   strategyprojection.PresenceValid,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "race-1"},
		Confidence: strategyprojection.Confidence{SampleSize: 1, RangeLower: floatPointer(3), RangeUpper: floatPointer(3), ComputationVersion: consumptionPaceComputationVersion},
		Value:      3,
	}
	first.Consumption = &SessionConsumptionPace{
		SessionID: "race-1", CombinationID: classified.Combination.ID,
		Laps: []LapConsumptionPace{{Number: 1, ClimateBucket: climateBucketPointer(strategyprojection.ClimateBucketDry), FuelConsumption: &metric}},
		ByClimateBucket: map[strategyprojection.ClimateBucket]ClimateBucketConsumptionPace{
			strategyprojection.ClimateBucketDry: {FuelConsumption: summarizeResource("race-1", strategyprojection.ClimateBucketDry, []metricSample{{value: 3, presence: strategyprojection.PresenceValid}})},
		},
	}
	catalog := NewSessionCatalog(authorizedSessionSourceStub{models: []AuthorizedSessionModel{first, second}})
	projection, err := catalog.ProjectStrategyInputs(context.Background(), classified.Combination.ID, []string{"race-1"}, time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if len(projection.SourceSessions) != 1 || projection.SourceSessions[0] != "race-1" || projection.FuelConsumption.MeanPerLap != 3 {
		t.Fatalf("projection = %+v", projection)
	}
	if projection.FuelConsumption.Provenance.SourceID != "aggregate:"+classified.Combination.ID {
		t.Fatalf("provenance = %+v", projection.FuelConsumption.Provenance)
	}
}

func climateBucketPointer(value strategyprojection.ClimateBucket) *strategyprojection.ClimateBucket {
	return &value
}

func catalogModel(t *testing.T, id, sessionType string, completed bool, modified time.Time, bucket strategyprojection.ClimateBucket) AuthorizedSessionModel {
	t.Helper()
	manifest := historicalTestManifest()
	manifest.Provenance = Provenance{Kind: ProvenanceSynthetic, EvidenceID: "f5a-catalog"}
	artifact := AuthorizedHistoricalArtifact{
		manifest: manifest,
		evidence: HistoricalArtifactEvidence{
			ContentSHA256: manifest.ContentSHA256,
			Metadata:      ContentMetadata{Size: manifest.Size, ModTime: modified.UTC(), IsRegular: true, Identity: id},
		},
	}
	metadata := []HistoricalMetadata{}
	for key, value := range map[string]string{
		"TrackName": "Fuji", "TrackLayout": "Classic", "CarName": "499P", "CarClass": "Hypercar",
		"SessionType": sessionType, "WeatherConditions": "Clear",
	} {
		metadata = append(metadata, HistoricalMetadata{Key: key, Present: true, Value: value, Quality: QualityValid})
	}
	session := HistoricalSession{ID: id, SchemaVersion: HistoricalSchemaVersion, Provenance: HistoricalProvenance{Source: manifest.Source, Parser: manifest.Parser}, Metadata: metadata}
	if completed {
		end := 90.0
		session.Laps = []HistoricalLap{{Number: 1, EndSeconds: &end}}
	}
	classified, err := ClassifyHistoricalSession(session)
	if err != nil {
		t.Fatal(err)
	}
	consumption := &SessionConsumptionPace{SessionID: id, CombinationID: classified.Combination.ID, Laps: []LapConsumptionPace{{ClimateBucket: &bucket}}}
	return AuthorizedSessionModel{Artifact: artifact, Session: session, Consumption: consumption}
}
