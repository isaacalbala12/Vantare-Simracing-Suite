package config

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestProfileDocumentStoreLoadV3ReturnsRevision(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	doc := validProfileV3(validWidget("delta-main", WidgetTypeDelta))
	writeProfileV3File(t, path, doc)

	store := ProfileDocumentStore{}
	loaded, err := store.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	wantRevision := profileRevisionFromFile(t, path)
	if loaded.Revision != wantRevision {
		t.Fatalf("revision=%q want %q", loaded.Revision, wantRevision)
	}
	if loaded.MigratedFrom != ProfileSchemaVersionV3 {
		t.Fatalf("migratedFrom=%d want %d", loaded.MigratedFrom, ProfileSchemaVersionV3)
	}
	if loaded.Document.ID != doc.ID {
		t.Fatalf("document id=%q want %q", loaded.Document.ID, doc.ID)
	}
}

func TestProfileDocumentStoreLoadV2MigratesWithoutMutatingDisk(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy-v2.json")
	source := filepath.Join("testdata", "profile-v2-core-widgets.json")
	data, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	store := ProfileDocumentStore{}
	loaded, err := store.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.MigratedFrom != ProfileSchemaVersionV2 {
		t.Fatalf("migratedFrom=%d want %d", loaded.MigratedFrom, ProfileSchemaVersionV2)
	}
	if loaded.Document.SchemaVersion != ProfileSchemaVersionV3 {
		t.Fatalf("schemaVersion=%d want %d", loaded.Document.SchemaVersion, ProfileSchemaVersionV3)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("load migrated in memory but modified disk")
	}
}

func TestProfileDocumentStoreSaveCreatesPreV3BackupOnce(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy-v0.json")
	source := filepath.Join("testdata", "profile-v0-core-widgets.json")
	original, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, original, 0644); err != nil {
		t.Fatal(err)
	}

	store := ProfileDocumentStore{}
	loaded, err := store.Load(path)
	if err != nil {
		t.Fatal(err)
	}

	backupPath := path + ".pre-v3.bak"
	if _, err := os.Stat(backupPath); !os.IsNotExist(err) {
		t.Fatalf("backup should not exist before first save: %v", err)
	}

	revision, err := store.Save(path, loaded.Revision, loaded.Document, loaded.MigratedFrom)
	if err != nil {
		t.Fatal(err)
	}
	if revision == "" {
		t.Fatal("expected non-empty revision")
	}

	backup, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(backup) != string(original) {
		t.Fatal("backup must contain original legacy bytes")
	}

	loaded.Document.Name = "Updated After Backup"
	revision2, err := store.Save(path, revision, loaded.Document, ProfileSchemaVersionV3)
	if err != nil {
		t.Fatal(err)
	}
	if revision2 == revision {
		t.Fatal("expected new revision after second save")
	}
	backupAgain, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(backupAgain) != string(original) {
		t.Fatal("later saves must not overwrite backup")
	}
}

func TestProfileDocumentStoreSaveAcceptsEmptyGeneralWidgets(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "empty.json")
	doc := validProfileV3()
	store := ProfileDocumentStore{}

	revision, err := store.Save(path, "", doc, ProfileSchemaVersionV3)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := store.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Document.Layouts[LayoutGeneral].Widgets) != 0 {
		t.Fatalf("expected empty widgets, got %d", len(loaded.Document.Layouts[LayoutGeneral].Widgets))
	}
	if loaded.Revision != revision {
		t.Fatalf("revision=%q want %q", loaded.Revision, revision)
	}
}

func TestProfileDocumentStoreSaveConflictLeavesDiskUnchanged(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	doc := validProfileV3(validWidget("delta-main", WidgetTypeDelta))
	writeProfileV3File(t, path, doc)

	store := ProfileDocumentStore{}
	loaded, err := store.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	mutated := NormalizeProfileDocumentV3(loaded.Document)
	mutated.Name = "Conflict Attempt"
	_, err = store.Save(path, "deadbeef", mutated, ProfileSchemaVersionV3)
	if !errors.Is(err, ErrProfileConflict) {
		t.Fatalf("expected ErrProfileConflict, got %v", err)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("conflict save modified disk")
	}
}

func TestProfileDocumentStoreSaveValidationFailureLeavesDiskUnchanged(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	doc := validProfileV3(validWidget("delta-main", WidgetTypeDelta))
	writeProfileV3File(t, path, doc)

	store := ProfileDocumentStore{}
	loaded, err := store.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	invalid := NormalizeProfileDocumentV3(loaded.Document)
	invalid.SchemaVersion = 2
	_, err = store.Save(path, loaded.Revision, invalid, ProfileSchemaVersionV3)
	if err == nil {
		t.Fatal("expected validation error")
	}
	var ve ProfileValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected ProfileValidationError, got %T %v", err, err)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("validation failure modified disk")
	}
}

func TestProfileDocumentStoreSaveWriteFailureLeavesCallerDocumentUnchanged(t *testing.T) {
	dir := t.TempDir()
	blocker := filepath.Join(dir, "blocker")
	if err := os.WriteFile(blocker, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(blocker, "profile.json")
	doc := validProfileV3()
	want := NormalizeProfileDocumentV3(doc)

	store := ProfileDocumentStore{}
	_, err := store.Save(path, "", want, ProfileSchemaVersionV3)
	if err == nil {
		t.Fatal("expected write failure")
	}
	if !reflect.DeepEqual(want, doc) {
		// Save must not mutate the caller's document pointer contents in place.
		if want.Name != doc.Name {
			t.Fatal("caller document mutated on write failure")
		}
	}
}

func TestProfileDocumentStoreSaveIsAtomicAndReturnsRevision(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	doc := validProfileV3(validWidget("delta-main", WidgetTypeDelta))
	store := ProfileDocumentStore{}

	revision, err := store.Save(path, "", doc, ProfileSchemaVersionV3)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if profileRevision(data) != revision {
		t.Fatalf("returned revision does not match on-disk bytes")
	}
	if len(data) == 0 {
		t.Fatal("expected non-empty profile file")
	}
}

func TestProfileDocumentStoreLoadRejectsOversizedFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "huge.json")
	payload := make([]byte, maxProfileFileBytes+1)
	for i := range payload {
		payload[i] = '{'
	}
	if err := os.WriteFile(path, payload, 0644); err != nil {
		t.Fatal(err)
	}
	store := ProfileDocumentStore{}
	_, err := store.Load(path)
	var sizeErr *ProfileFileTooLargeError
	if !errors.As(err, &sizeErr) {
		t.Fatalf("expected ProfileFileTooLargeError, got %v", err)
	}
}

func writeProfileV3File(t *testing.T, path string, doc *ProfileDocumentV3) {
	t.Helper()
	normalized := NormalizeProfileDocumentV3(doc)
	data, err := marshalProfileDocumentV3(normalized)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}

func profileRevisionFromFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return profileRevision(data)
}
