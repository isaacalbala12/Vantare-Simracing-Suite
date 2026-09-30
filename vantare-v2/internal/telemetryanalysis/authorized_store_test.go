package telemetryanalysis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAuthorizedSessionStoreRecoversBackup(t *testing.T) {
	for _, damage := range []string{"truncated", "missing", "invalid-model"} {
		t.Run(damage, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "authorized-sessions.json")
			store, err := OpenAuthorizedSessionStore(path)
			if err != nil {
				t.Fatal(err)
			}
			if err := store.Add(context.Background(), storedAuthorizedModel("session-1")); err != nil {
				t.Fatal(err)
			}
			var corrupt []byte
			switch damage {
			case "missing":
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
			case "truncated":
				corrupt = []byte(`{"version":1,`)
			case "invalid-model":
				corrupt = []byte(`{"version":1,"models":[{}]}`)
			}
			if corrupt != nil {
				if err := os.WriteFile(path, corrupt, 0o600); err != nil {
					t.Fatal(err)
				}
			}
			recovered, err := OpenAuthorizedSessionStore(path)
			if err != nil {
				t.Fatalf("recovery: %v", err)
			}
			if !recovered.RecoveredFromBackup() {
				t.Fatal("recovery not reported")
			}
			models, err := recovered.ListAuthorizedSessions(context.Background())
			if err != nil || len(models) != 1 || models[0].Session.ID != "session-1" {
				t.Fatalf("recovered models=%v error=%v", models, err)
			}
			if corrupt != nil {
				files, err := filepath.Glob(path + ".corrupt-*")
				if err != nil || len(files) != 1 {
					t.Fatalf("quarantine=%v error=%v", files, err)
				}
				data, err := os.ReadFile(files[0])
				if err != nil || string(data) != string(corrupt) {
					t.Fatalf("quarantine changed: %q, %v", data, err)
				}
			}
			if err := recovered.Add(context.Background(), storedAuthorizedModel("session-2")); err != nil {
				t.Fatal(err)
			}
			reopened, err := OpenAuthorizedSessionStore(path)
			if err != nil {
				t.Fatal(err)
			}
			models, err = reopened.ListAuthorizedSessions(context.Background())
			if err != nil || len(models) != 2 {
				t.Fatalf("reopen models=%v error=%v", models, err)
			}
		})
	}
}

func TestAuthorizedSessionStoreRejectsUnrecoverableData(t *testing.T) {
	for _, primary := range []string{"", `{"version":1,`, `{"version":1,"models":[{}]}`} {
		for _, backup := range []string{"", `{"version":1,`, `{"version":1,"models":[{}]}`} {
			if primary == "" && backup == "" {
				continue
			}
			t.Run(primary+"/"+backup, func(t *testing.T) {
				path := filepath.Join(t.TempDir(), "authorized-sessions.json")
				for name, data := range map[string]string{path: primary, path + ".bak": backup} {
					if data != "" {
						if err := os.WriteFile(name, []byte(data), 0o600); err != nil {
							t.Fatal(err)
						}
					}
				}
				store, err := OpenAuthorizedSessionStore(path)
				if store != nil || !errors.Is(err, ErrCorruptAuthorizedSessionStore) {
					t.Fatalf("store=%v error=%v", store, err)
				}
				for name, want := range map[string]string{path: primary, path + ".bak": backup} {
					got, err := os.ReadFile(name)
					if want == "" {
						if !errors.Is(err, os.ErrNotExist) {
							t.Fatalf("unexpected file: %v", err)
						}
						continue
					}
					if err != nil || string(got) != want {
						t.Fatalf("evidence changed: %q, %v", got, err)
					}
				}
			})
		}
	}
}

func TestAuthorizedSessionStoreKeepsPreviousGenerationAndRefusesCorruptWrites(t *testing.T) {
	path := filepath.Join(t.TempDir(), "authorized-sessions.json")
	store, err := OpenAuthorizedSessionStore(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"one", "two"} {
		if err := store.Add(context.Background(), storedAuthorizedModel(id)); err != nil {
			t.Fatal(err)
		}
	}
	backup, err := os.ReadFile(path + ".bak")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := store.Add(context.Background(), storedAuthorizedModel("three")); !errors.Is(err, ErrCorruptAuthorizedSessionStore) {
		t.Fatalf("error=%v", err)
	}
	got, err := os.ReadFile(path + ".bak")
	if err != nil || string(got) != string(backup) {
		t.Fatal("backup overwritten")
	}
	recovered, err := OpenAuthorizedSessionStore(path)
	if err != nil {
		t.Fatal(err)
	}
	models, err := recovered.ListAuthorizedSessions(context.Background())
	if err != nil || len(models) != 1 || models[0].Session.ID != "one" {
		t.Fatalf("models=%v error=%v", models, err)
	}
}

func TestAuthorizedSessionStoreWriteFailures(t *testing.T) {
	for _, first := range []bool{true, false} {
		for _, target := range []string{"primary", "backup"} {
			t.Run(fmt.Sprintf("first=%t/%s", first, target), func(t *testing.T) {
				path := filepath.Join(t.TempDir(), "authorized-sessions.json")
				store, err := OpenAuthorizedSessionStore(path)
				if err != nil {
					t.Fatal(err)
				}
				if !first {
					if err := store.Add(context.Background(), storedAuthorizedModel("one")); err != nil {
						t.Fatal(err)
					}
				}
				store.writeFile = func(name string, data []byte) error {
					if (target == "primary" && name == path) || (target == "backup" && name == path+".bak") {
						return os.ErrPermission
					}
					return writeAuthorizedSessionFile(name, data)
				}
				err = store.Add(context.Background(), storedAuthorizedModel("two"))
				if !errors.Is(err, os.ErrPermission) {
					t.Fatalf("error=%v", err)
				}
				if first && target == "primary" {
					if !errors.Is(err, ErrAuthorizedSessionCommitUncertain) {
						t.Fatalf("uncertain commit not reported: %v", err)
					}
					if err := store.Add(context.Background(), storedAuthorizedModel("three")); !errors.Is(err, ErrAuthorizedSessionCommitUncertain) {
						t.Fatalf("must reopen after uncertainty: %v", err)
					}
				}
				reopened, err := OpenAuthorizedSessionStore(path)
				if err != nil {
					t.Fatal(err)
				}
				models, err := reopened.ListAuthorizedSessions(context.Background())
				want := 1
				if first && target == "backup" {
					want = 0
				}
				if err != nil || len(models) != want {
					t.Fatalf("models=%v error=%v", models, err)
				}
			})
		}
	}
}

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
