package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestStrategyTelemetryStartupReportsUnavailableCatalog(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "authorized-sessions.json")
	if err := os.WriteFile(path, []byte("broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, service := strategyTelemetrySources(root, "")
	status, err := service.Status(context.Background())
	if err != nil || status.Reason != "catalog_unavailable" || status.Failures == nil {
		t.Fatalf("status=%+v err=%v", status, err)
	}
	if _, err := service.ImportNext(context.Background()); err == nil {
		t.Fatal("unavailable catalog allowed import")
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "broken" {
		t.Fatal("startup changed damaged evidence")
	}
}

func TestStrategyTelemetryStartupReportsRecoveredCatalog(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "authorized-sessions.json")
	if err := os.WriteFile(path, []byte("broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path+".bak", []byte(`{"version":1,"models":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, service := strategyTelemetrySources(root, "")
	status, err := service.Status(context.Background())
	if err != nil || !status.Recovered || status.Reason != "importer_unavailable" {
		t.Fatalf("status=%+v err=%v", status, err)
	}
}
