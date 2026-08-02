package main

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/tools/vantare-telemetry-reader/internal/protocol"
)

func TestOpenReadOnlyCatalogAndRows(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "session.duckdb")
	createSyntheticFixture(t, path)
	evidence, err := inspectArtifact(path)
	if err != nil {
		t.Fatal(err)
	}
	request := protocol.ArtifactRequest{Path: path, Size: evidence.Size, SHA256: evidence.SHA256}
	reader, err := openReader(context.Background(), request)
	if err != nil {
		t.Fatalf("openReader() error = %v", err)
	}
	defer reader.Close()
	catalog, err := reader.Catalog(context.Background())
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	if len(catalog.Continuous) != 2 || len(catalog.Events) != 1 {
		t.Fatalf("catalog = %+v", catalog)
	}
	if len(catalog.Metadata) != 1 || catalog.Metadata[0].Key != "TrackName" || !catalog.Metadata[0].Present || catalog.Metadata[0].Value != "Synthetic Track" {
		t.Fatalf("catalog metadata = %+v; sensitive metadata must not cross IPC", catalog.Metadata)
	}
	rows, err := reader.ReadRows(context.Background(), `quote"table`, 0, 2)
	if err != nil {
		t.Fatalf("ReadRows() error = %v", err)
	}
	if len(rows) != 2 || rows[0].Values[0].Kind != "integer" || rows[0].Values[0].Integer != 0 || rows[0].Values[1].Kind != "boolean" || rows[0].Values[1].Boolean || !rows[0].Values[3].Null {
		t.Fatalf("typed rows = %+v", rows)
	}
	if _, err := reader.db.ExecContext(context.Background(), `CREATE TABLE forbidden(value INTEGER)`); err == nil {
		t.Fatal("read-only connection accepted DDL")
	}
}

func TestNewColumnVectorKeepsUndemonstratedDecimalUnknown(t *testing.T) {
	vector := newColumnVector("DECIMAL", 4)
	if vector.Kind != "unknown" || len(vector.Numbers) != 0 {
		t.Fatalf("DECIMAL vector = %+v, want unknown until representation is demonstrated", vector)
	}
}

func TestReadRowsRejectsUnknownAndInjectionIdentifiers(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.duckdb")
	createSyntheticFixture(t, path)
	evidence, err := inspectArtifact(path)
	if err != nil {
		t.Fatal(err)
	}
	reader, err := openReader(context.Background(), protocol.ArtifactRequest{Path: path, Size: evidence.Size, SHA256: evidence.SHA256})
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	for _, identifier := range []string{"missing", `quote\"table; DROP TABLE metadata;--`} {
		if _, err := reader.ReadRows(context.Background(), identifier, 0, 1); !errors.Is(err, errInvalidRequest) {
			t.Fatalf("ReadRows(%q) error = %v, want errInvalidRequest", identifier, err)
		}
	}
}

func TestOpenReaderRejectsWALAndChangedHash(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.duckdb")
	createSyntheticFixture(t, path)
	evidence, err := inspectArtifact(path)
	if err != nil {
		t.Fatal(err)
	}
	request := protocol.ArtifactRequest{Path: path, Size: evidence.Size, SHA256: evidence.SHA256}
	if err := os.WriteFile(path+".wal", []byte("active"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := openReader(context.Background(), request); !errors.Is(err, errArtifactChanged) {
		t.Fatalf("WAL error = %v", err)
	}
	if err := os.Remove(path + ".wal"); err != nil {
		t.Fatal(err)
	}
	request.SHA256 = strings.Repeat("0", 64)
	if _, err := openReader(context.Background(), request); !errors.Is(err, errArtifactChanged) {
		t.Fatalf("hash error = %v", err)
	}
}

func createSyntheticFixture(t *testing.T, path string) {
	t.Helper()
	db, err := sql.Open("duckdb", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	statements := []string{
		`CREATE TABLE "channelsList" (channelName VARCHAR, frequency INTEGER, unit VARCHAR)`,
		`CREATE TABLE "eventsList" (eventName VARCHAR, unit VARCHAR)`,
		`CREATE TABLE "metadata" (key VARCHAR, value VARCHAR)`,
		`CREATE TABLE "quote""table" (value BIGINT, active BOOLEAN, note VARCHAR, nullable DOUBLE)`,
		`CREATE TABLE "speed" (value DOUBLE)`,
		`CREATE TABLE "pit" (ts DOUBLE, value BOOLEAN)`,
		`INSERT INTO "channelsList" VALUES ('quote"table', 50, ''), ('speed', 100, 'km/h')`,
		`INSERT INTO "eventsList" VALUES ('pit', '')`,
		`INSERT INTO "metadata" VALUES ('DriverName', 'Private Driver'), ('TrackName', 'Synthetic Track')`,
		`INSERT INTO "quote""table" VALUES (0, false, '', NULL), (2, true, 'ok', 1.5)`,
		`INSERT INTO "speed" VALUES (0.0), (123.5)`,
		`INSERT INTO "pit" VALUES (1.0, false), (2.0, true)`,
		`CHECKPOINT`,
	}
	for _, statement := range statements {
		if _, err := db.ExecContext(context.Background(), statement); err != nil {
			t.Fatalf("execute fixture statement: %v", err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
}
