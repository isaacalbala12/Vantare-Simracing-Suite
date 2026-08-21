package telemetryanalysis

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

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
