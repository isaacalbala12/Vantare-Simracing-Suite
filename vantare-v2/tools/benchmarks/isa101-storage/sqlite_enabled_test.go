//go:build sqlite

package main

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestSQLiteFileIdentity(t *testing.T) {
	path := filepath.Join(t.TempDir(), "identity.sqlite")
	writer, err := openSQLiteStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for query, want := range map[string]int{
		"PRAGMA application_id": sqliteApplicationID,
		"PRAGMA user_version":   sqliteUserVersion,
	} {
		var got int
		if err := db.QueryRow(query).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("%s: got %d want %d", query, got, want)
		}
	}
	var mode string
	if err := db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != "wal" {
		t.Fatalf("journal mode: got %q want wal", mode)
	}
}
