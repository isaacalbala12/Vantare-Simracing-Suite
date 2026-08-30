package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProfileV3ToV4DropsAtypicalUpdateHzAndCreatesBackup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "pedals.json")
	widget := validWidget("pedals-main", WidgetTypePedals)
	widget.Behavior.UpdateHz = 3
	doc := validProfileV3(widget)
	original, err := marshalProfileDocumentV3(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, original, 0644); err != nil {
		t.Fatal(err)
	}

	store := ProfileDocumentStore{}
	loaded, err := store.LoadV4(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.MigratedFrom != ProfileSchemaVersionV3 {
		t.Fatalf("migratedFrom=%d want 3", loaded.MigratedFrom)
	}
	if len(loaded.MigrationNotices) != 1 {
		t.Fatalf("notices=%+v want one atypical updateHz notice", loaded.MigrationNotices)
	}
	notice := loaded.MigrationNotices[0]
	if notice.WidgetID != "pedals-main" || notice.UpdateHz != 3 || notice.Path != "layouts.general.widgets[0].behavior.updateHz" {
		t.Fatalf("notice=%+v", notice)
	}

	if _, err := store.SaveV4(path, loaded.Revision, loaded.Document, loaded.MigratedFrom); err != nil {
		t.Fatal(err)
	}
	backup, err := os.ReadFile(filepath.Join(dir, "pedals.v3.bak"))
	if err != nil {
		t.Fatal(err)
	}
	if string(backup) != string(original) {
		t.Fatal("v3 backup must preserve the original bytes")
	}
	written, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(written), "updateHz") {
		t.Fatalf("v4 writer leaked updateHz: %s", written)
	}
	var envelope profileSchemaEnvelope
	if err := json.Unmarshal(written, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.SchemaVersion != ProfileSchemaVersionV4 {
		t.Fatalf("schemaVersion=%d want 4", envelope.SchemaVersion)
	}
}

func TestProfileV3BackupCollisionCreatesDigestMatchingVersionedBackup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "collision.json")
	backupPath := filepath.Join(dir, "collision.v3.bak")
	doc := validProfileV3(validWidget("delta-main", WidgetTypeDelta))
	original, err := marshalProfileDocumentV3(doc)
	if err != nil {
		t.Fatal(err)
	}
	foreign := []byte(`{"schemaVersion":3,"id":"other-profile"}`)
	if err := os.WriteFile(path, original, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backupPath, foreign, 0644); err != nil {
		t.Fatal(err)
	}

	store := ProfileDocumentStore{}
	loaded, err := store.LoadV4(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveV4(path, loaded.Revision, loaded.Document, loaded.MigratedFrom); err != nil {
		t.Fatal(err)
	}

	fixed, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(fixed) != string(foreign) {
		t.Fatal("preexisting backup was overwritten")
	}
	versioned, err := filepath.Glob(filepath.Join(dir, "collision.v3.*.bak"))
	if err != nil {
		t.Fatal(err)
	}
	if len(versioned) != 1 {
		t.Fatalf("versioned backups=%v want one digest-matching collision backup", versioned)
	}
	versionedData, err := os.ReadFile(versioned[0])
	if err != nil {
		t.Fatal(err)
	}
	if profileRevision(versionedData) != profileRevision(original) {
		t.Fatal("versioned backup digest does not match migrated v3 source")
	}
}

func TestProfileV4PerformanceRoundTrip(t *testing.T) {
	doc := ConvertProfileV3ToV4(validProfileV3(validWidget("delta-main", WidgetTypeDelta)))
	rate := ProfileWidgetRateV4{Hertz: 24}
	effects := ProfileEffectsNoBlur
	doc.Performance = &ProfilePerformanceV4{
		Mode:  ProfilePerformanceCustom,
		Level: 3,
		Overrides: map[string]ProfilePerformanceOverrideV4{
			"delta-main": {Hz: &rate, Effects: &effects},
		},
	}
	data, err := marshalProfileDocumentV4(doc)
	if err != nil {
		t.Fatal(err)
	}
	parsed, from, notices, err := MigrateProfileJSONToV4(data)
	if err != nil {
		t.Fatal(err)
	}
	if from != 4 || len(notices) != 0 || parsed.Performance == nil {
		t.Fatalf("from=%d notices=%v performance=%+v", from, notices, parsed.Performance)
	}
	got := parsed.Performance.Overrides["delta-main"]
	if got.Hz == nil || got.Hz.Hertz != 24 || got.Effects == nil || *got.Effects != ProfileEffectsNoBlur {
		t.Fatalf("override=%+v", got)
	}
}

func TestProfileV4StoreRejectsFutureSchemaWithoutChangingFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "future.json")
	original := []byte(`{
  "schemaVersion": 5,
  "id": "future-profile",
  "name": "Future profile",
  "layouts": {
    "general": {
      "type": "general",
      "widgets": [{"id":"future-widget","type":"delta"}]
    }
  }
}`)
	if err := os.WriteFile(path, original, 0644); err != nil {
		t.Fatal(err)
	}

	_, err := (ProfileDocumentStore{}).LoadV4(path)
	if err == nil || !strings.Contains(err.Error(), "schemaVersion 5 no soportado") {
		t.Fatalf("LoadV4() error = %v, want unsupported future schema", err)
	}

	after, readErr := os.ReadFile(path)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if string(after) != string(original) {
		t.Fatal("future profile changed after rejected load")
	}
}

func TestProfileV4ReaderAcceptsEveryRepositoryProfileFixture(t *testing.T) {
	roots := []string{filepath.Join("..", "..", "configs"), filepath.Join("..", "..", "testdata")}
	count := 0
	for _, root := range roots {
		err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() || !strings.EqualFold(filepath.Ext(path), ".json") {
				return nil
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			var raw map[string]any
			if json.Unmarshal(data, &raw) != nil || raw["id"] == nil || raw["name"] == nil || (raw["widgets"] == nil && raw["layouts"] == nil) {
				return nil
			}
			count++
			if _, _, _, err := MigrateProfileJSONToV4(data); err != nil {
				t.Errorf("fixture %s: %v", path, err)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if count < 7 {
		t.Fatalf("only %d profile fixtures discovered; expected configs and bench fixtures", count)
	}
}
