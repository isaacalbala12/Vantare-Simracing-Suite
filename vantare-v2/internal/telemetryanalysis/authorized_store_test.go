package telemetryanalysis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"testing"
	"time"
)

func TestAuthorizedSessionStorePersistsAndDeduplicatesModels(t *testing.T) {
	path := filepath.Join(t.TempDir(), "authorized-sessions.json")
	store, err := OpenAuthorizedSessionStore(path)
	if err != nil {
		t.Fatal(err)
	}
	model := storedAuthorizedModel("session-1")
	if err := store.Add(context.Background(), model); err != nil {
		t.Fatal(err)
	}
	if err := store.Add(context.Background(), model); err != nil {
		t.Fatal(err)
	}

	reopened, err := OpenAuthorizedSessionStore(path)
	if err != nil {
		t.Fatal(err)
	}
	got, err := reopened.ListAuthorizedSessions(context.Background())
	if err != nil || len(got) != 1 || got[0].Session.ID != "session-1" || !validAuthorizedHistoricalArtifact(got[0].Artifact) {
		t.Fatalf("models=%+v err=%v", got, err)
	}
}

func TestAuthorizedSessionStoreRejectsUncatalogableModelWithoutPersisting(t *testing.T) {
	path := filepath.Join(t.TempDir(), "authorized-sessions.json")
	store, err := OpenAuthorizedSessionStore(path)
	if err != nil {
		t.Fatal(err)
	}
	model := storedAuthorizedModel("bad-session")
	for index := range model.Session.Metadata {
		if model.Session.Metadata[index].Key == "SessionType" {
			model.Session.Metadata[index].Value = "Warmup"
		}
	}
	if err := store.Add(context.Background(), model); err == nil || err.Error() != `catalog authorized session: invalid historical session classification: unknown SessionType "Warmup"` {
		t.Fatalf("Add() error = %v", err)
	}
	reopened, err := OpenAuthorizedSessionStore(path)
	if err != nil {
		t.Fatal(err)
	}
	models, err := reopened.ListAuthorizedSessions(context.Background())
	if err != nil || len(models) != 0 {
		t.Fatalf("models = %+v, error = %v", models, err)
	}
}

func storedAuthorizedModel(id string) AuthorizedSessionModel {
	content := sha256.Sum256([]byte(id))
	hash := hex.EncodeToString(content[:])
	size := int64(100)
	manifest := Manifest{Version: ManifestVersion, ContentSHA256: hash, Size: size, Source: ManifestSource{Kind: SourceLMU, Format: LMUDuckDBParserID, Locator: "lmu://0123456789abcdef", Storage: StorageManagedCopy}, Parser: ParserRef{ID: LMUDuckDBParserID, Version: LMUDuckDBParserVersion}, Provenance: Provenance{Kind: ProvenanceUser, EvidenceID: "cold-start"}}
	manifest.DedupeKey = dedupeKey(hash, size)
	artifact := AuthorizedHistoricalArtifact{manifest: manifest, evidence: HistoricalArtifactEvidence{ContentSHA256: hash, Metadata: ContentMetadata{Size: size, ModTime: time.Unix(10, 0).UTC(), IsRegular: true, Identity: hash}}}
	end := 90.0
	metadata := []HistoricalMetadata{}
	for key, value := range map[string]string{"TrackName": "Fuji", "TrackLayout": "Classic", "CarName": "499P", "CarClass": "Hypercar", "SessionType": "Race", "WeatherConditions": "Clear"} {
		metadata = append(metadata, HistoricalMetadata{Key: key, Present: true, Value: value, Quality: QualityValid})
	}
	validity := LapValidityAnalysis{Laps: []AnalyzedLap{}}
	return AuthorizedSessionModel{Artifact: artifact, Session: HistoricalSession{SchemaVersion: HistoricalSchemaVersion, ID: id, Provenance: HistoricalProvenance{Source: manifest.Source, Parser: manifest.Parser}, Metadata: metadata, Laps: []HistoricalLap{{Number: 1, EndSeconds: &end}}}, Validity: &validity}
}
