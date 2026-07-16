package pitmanager_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/pitmanager"
)

func TestClient_GetStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/pitmenu/status" {
			t.Fatalf("path: got %s want /rest/pitmenu/status", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"category": "pit_main",
			"message": "Pit stop options",
			"choiceID": 3
		}`))
	}))
	defer srv.Close()

	client := pitmanager.NewPitMenuClientWithURL(srv.URL)
	status, err := client.GetStatus()
	if err != nil {
		t.Fatal(err)
	}
	if status.Category != "pit_main" {
		t.Fatalf("Category: got %q want %q", status.Category, "pit_main")
	}
	if status.Message != "Pit stop options" {
		t.Fatalf("Message: got %q want %q", status.Message, "Pit stop options")
	}
	if status.ChoiceID != 3 {
		t.Fatalf("ChoiceID: got %d want 3", status.ChoiceID)
	}
}

func TestClient_GetStandings(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/watch/standings" {
			t.Fatalf("path: got %s want /rest/watch/standings", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{
			"driverName": "Isaac Albala",
			"carNumber": "46",
			"carClass": "LMP3",
			"position": 12,
			"player": true,
			"pitState": "EXITING",
			"pitting": true,
			"inGarageStall": false,
			"sector": "SECTOR1",
			"lapsCompleted": 5,
			"timeBehindLeader": 45.2
		}]`))
	}))
	defer srv.Close()

	client := pitmanager.NewPitMenuClientWithURL(srv.URL)
	standings, err := client.GetStandings()
	if err != nil {
		t.Fatal(err)
	}
	if len(standings.Rows) != 1 {
		t.Fatalf("Rows: got %d want 1", len(standings.Rows))
	}
	row := standings.Rows[0]
	if row.DriverName != "Isaac Albala" {
		t.Fatalf("DriverName: got %q want %q", row.DriverName, "Isaac Albala")
	}
	if row.CarNumber != "46" {
		t.Fatalf("CarNumber: got %q want %q", row.CarNumber, "46")
	}
	if !row.Player {
		t.Fatal("expected Player=true")
	}
	if row.Position != 12 {
		t.Fatalf("Position: got %d want 12", row.Position)
	}
}

func TestClient_RequestPitAction(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/pitmenu/action" {
			t.Fatalf("path: got %s want /rest/pitmenu/action", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method: got %s want POST", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Fatalf("Content-Type: got %q want application/json", ct)
		}

		var req struct {
			Action string `json:"action"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if req.Action != "request" {
			t.Fatalf("action: got %q want %q", req.Action, "request")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := pitmanager.NewPitMenuClientWithURL(srv.URL)
	client.SetDryRun(false) // disable dry-run to actually send

	if err := client.RequestPitAction("request"); err != nil {
		t.Fatal(err)
	}
}

func TestClient_RequestPitAction_DryRunSkipsRequest(t *testing.T) {
	// When dry-run is true (default), RequestPitAction should return nil
	// without making any HTTP calls.
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	defer srv.Close()

	client := pitmanager.NewPitMenuClientWithURL(srv.URL)
	client.SetDryRun(true)

	if err := client.RequestPitAction("request"); err != nil {
		t.Fatal(err)
	}
	if called {
		t.Fatal("expected no HTTP call in dry-run mode")
	}
}

func TestClient_RequestPitAction_ReturnsErrorOnNonOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	client := pitmanager.NewPitMenuClientWithURL(srv.URL)
	client.SetDryRun(false)

	if err := client.RequestPitAction("confirm"); err == nil {
		t.Fatal("expected error for non-OK status")
	}
}

func TestClient_GetStatus_ReturnsErrorOnNonOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	client := pitmanager.NewPitMenuClientWithURL(srv.URL)
	if _, err := client.GetStatus(); err == nil {
		t.Fatal("expected error for non-OK status")
	}
}

func TestClient_NewPitMenuClientDefaultURL(t *testing.T) {
	client := pitmanager.NewPitMenuClient()
	if client == nil {
		t.Fatal("expected non-nil client")
	}
}

func TestClient_DryRunRoundTrip(t *testing.T) {
	client := pitmanager.NewPitMenuClient()
	if client == nil {
		t.Fatal("expected non-nil client")
	}
	// Default should be true
	client.SetDryRun(false)
	client.SetDryRun(true) // toggle back
}
