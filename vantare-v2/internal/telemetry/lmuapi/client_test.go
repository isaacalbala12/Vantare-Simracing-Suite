package lmuapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/lmuapi"
)

func TestClientFetchesStandings(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/watch/standings" {
			t.Fatalf("path: got %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{
			"driverName":"Isaac Albala",
			"carNumber":"46",
			"carClass":"LMP3",
			"fullTeamName":"ADESS Factory Racing Team 2025",
			"position":12,
			"player":true,
			"lapsBehindLeader":6,
			"lapsBehindClassLeader":2,
			"timeBehindNext":243.93,
			"lapDistance":165.79,
			"timeIntoLap":3.02,
			"bestLapTime":-1,
			"lastLapTime":0,
			"estimatedLapTime":246.19,
			"pitState":"EXITING",
			"pitting":true,
			"inGarageStall":true,
			"sector":"SECTOR1"
		}]`))
	}))
	defer srv.Close()

	client := lmuapi.NewClient(srv.URL, 500*time.Millisecond)
	rows, err := client.StandingsWithContext(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("rows: got %d want 1", len(rows))
	}
	row := rows[0]
	if row.DriverName != "Isaac Albala" || row.CarNumber != "46" || !row.Player {
		t.Fatalf("unexpected row: %#v", row)
	}
}

func TestClientFetchesSessionInfo(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/watch/sessionInfo" {
			t.Fatalf("path: got %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"trackName":"Circuit de la Sarthe",
			"session":"PRACTICE1",
			"gamePhase":5,
			"numberOfVehicles":12,
			"playerName":"Isaac Albala",
			"currentEventTime":1587,
			"timeRemainingInGamePhase":123.9,
			"yellowFlagState":"NONE",
			"sectorFlag":["YELLOW","YELLOW","YELLOW"]
		}`))
	}))
	defer srv.Close()

	client := lmuapi.NewClient(srv.URL, 500*time.Millisecond)
	info, err := client.SessionInfoWithContext(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if info.TrackName != "Circuit de la Sarthe" || info.Session != "PRACTICE1" || info.NumberOfVehicles != 12 {
		t.Fatalf("unexpected session info: %#v", info)
	}
}

func TestClientFetchesMultiplayerTeams(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/multiplayer/teams" {
			t.Fatalf("path: got %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"coherenceId":105,
			"drivers":{
				"Isaac Albala":{"badge":"none","isConnected":true,"nationality":"ES","roles":["Driver","Owner"],"teamId":"tid1","teamName":"Alpine","uniqueTeamId":"utid1"}
			},
			"teams":{
				"utid1":{"Id":"tid1","carNumber":"35","drivers":{"Isaac Albala":{"badge":"none","nationality":"ES","roles":["Driver","Owner"]}},"name":"Alpine Endurance Team","vehicle":"35_26_ALPI"}
			}
		}`))
	}))
	defer srv.Close()

	client := lmuapi.NewClient(srv.URL, 500*time.Millisecond)
	resp, err := client.MultiplayerTeams(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if resp.CoherenceID != 105 {
		t.Fatalf("coherenceId: got %d want 105", resp.CoherenceID)
	}
	d, ok := resp.Drivers["Isaac Albala"]
	if !ok {
		t.Fatal("expected driver Isaac Albala")
	}
	if d.Nationality != "ES" || d.Badge != "none" {
		t.Fatalf("unexpected driver: %#v", d)
	}
	if len(resp.Teams) != 1 {
		t.Fatalf("teams: got %d want 1", len(resp.Teams))
	}
}

func TestClientUsesDefaultTimeout(t *testing.T) {
	c := lmuapi.NewClient("http://localhost:6397", 0)
	if c == nil {
		t.Fatal("expected client")
	}
}

func TestClientPropagatesHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()
	c := lmuapi.NewClient(srv.URL, 500*time.Millisecond)
	if _, err := c.StandingsWithContext(context.Background()); err == nil {
		t.Fatal("expected error")
	}
}

func TestClientPropagatesContextCancel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	c := lmuapi.NewClient(srv.URL, 10*time.Second)
	if _, err := c.StandingsWithContext(ctx); err == nil {
		t.Fatal("expected error from cancelled context")
	}
}

func TestClientHandlesInvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{invalid json`))
	}))
	defer srv.Close()

	c := lmuapi.NewClient(srv.URL, 500*time.Millisecond)
	if _, err := c.SessionInfoWithContext(context.Background()); err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestClientBuildsCorrectURLs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/rest/watch/standings":
			_, _ = w.Write([]byte(`[]`))
		case "/rest/watch/sessionInfo":
			_, _ = w.Write([]byte(`{}`))
		case "/rest/multiplayer/teams":
			_, _ = w.Write([]byte(`{}`))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	c := lmuapi.NewClient(srv.URL, 500*time.Millisecond)
	ctx := context.Background()

	if _, err := c.StandingsWithContext(ctx); err != nil {
		t.Fatalf("standings: %v", err)
	}
	if _, err := c.SessionInfoWithContext(ctx); err != nil {
		t.Fatalf("sessionInfo: %v", err)
	}
	if _, err := c.MultiplayerTeams(ctx); err != nil {
		t.Fatalf("multiplayerTeams: %v", err)
	}
}

func TestFindRatingFields_FindsSafetyRank(t *testing.T) {
	raw := json.RawMessage(`{"safetyRank":5,"driverName":"Test"}`)
	fields := lmuapi.FindRatingFields(raw)
	if len(fields) == 0 {
		t.Fatal("expected rating fields")
	}
	found := false
	for _, f := range fields {
		if f.Key == "safetyRank" {
			found = true
			if f.Value != "5" {
				t.Fatalf("value: got %s want 5", f.Value)
			}
		}
	}
	if !found {
		t.Fatal("safetyRank not found")
	}
}

func TestFindRatingFields_FindsNestedFields(t *testing.T) {
	raw := json.RawMessage(`{"driver":{"safetyBadge":"clean","driverRank":1850,"driverRankProgress":0.75,"driverRankShort":"G2"}}`)
	fields := lmuapi.FindRatingFields(raw)
	if len(fields) == 0 {
		t.Fatal("expected rating fields")
	}
	keys := make(map[string]string)
	for _, f := range fields {
		keys[f.Key] = f.Value
	}
	if keys["driver.safetyBadge"] != "clean" {
		t.Fatalf("safetyBadge: got %q", keys["driver.safetyBadge"])
	}
	if keys["driver.driverRank"] != "1850" {
		t.Fatalf("driverRank: got %q", keys["driver.driverRank"])
	}
	if keys["driver.driverRankShort"] != "G2" {
		t.Fatalf("driverRankShort: got %q", keys["driver.driverRankShort"])
	}
}

func TestFindRatingFields_FindsEloAndRating(t *testing.T) {
	raw := json.RawMessage(`{"elo":1520,"rating":4.5,"badge":"gold"}`)
	fields := lmuapi.FindRatingFields(raw)
	if len(fields) == 0 {
		t.Fatal("expected rating fields")
	}
	keys := make(map[string]string)
	for _, f := range fields {
		keys[f.Key] = f.Value
	}
	if keys["elo"] != "1520" {
		t.Fatalf("elo: got %q", keys["elo"])
	}
	if keys["rating"] != "4.50" {
		t.Fatalf("rating: got %q", keys["rating"])
	}
	if keys["badge"] != "gold" {
		t.Fatalf("badge: got %q", keys["badge"])
	}
}

func TestFindRatingFields_CaseInsensitive(t *testing.T) {
	raw := json.RawMessage(`{"SAFETYRANK":3,"SafetyBadge":"rookie"}`)
	fields := lmuapi.FindRatingFields(raw)
	if len(fields) == 0 {
		t.Fatal("expected rating fields")
	}
	keys := make(map[string]string)
	for _, f := range fields {
		keys[f.Key] = f.Value
	}
	if keys["SAFETYRANK"] != "3" {
		t.Fatalf("SAFETYRANK: got %q", keys["SAFETYRANK"])
	}
}

func TestFindRatingFields_NoPanicWithArrays(t *testing.T) {
	raw := json.RawMessage(`[{"safetyRank":1},{"safetyRank":2}]`)
	fields := lmuapi.FindRatingFields(raw)
	if len(fields) != 2 {
		t.Fatalf("expected 2 fields, got %d", len(fields))
	}
}

func TestFindRatingFields_NoPanicWithNull(t *testing.T) {
	raw := json.RawMessage(`null`)
	fields := lmuapi.FindRatingFields(raw)
	if fields != nil {
		t.Fatal("expected nil for null input")
	}
}

func TestFindRatingFields_NoPanicWithPrimitives(t *testing.T) {
	raw := json.RawMessage(`"just a string"`)
	fields := lmuapi.FindRatingFields(raw)
	if fields != nil {
		t.Fatal("expected nil for string input")
	}
}

func TestFindRatingFields_NoPanicWithNumbers(t *testing.T) {
	raw := json.RawMessage(`42`)
	fields := lmuapi.FindRatingFields(raw)
	if fields != nil {
		t.Fatal("expected nil for number input")
	}
}

func TestFindRatingFields_NoPanicWithInvalidJSON(t *testing.T) {
	raw := json.RawMessage(`{broken`)
	fields := lmuapi.FindRatingFields(raw)
	if fields != nil {
		t.Fatal("expected nil for invalid JSON")
	}
}

func TestFindRatingFields_DoesNotReturnSecrets(t *testing.T) {
	raw := json.RawMessage(`{"safetyRank":1,"token":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0","password":"secret123"}`)
	fields := lmuapi.FindRatingFields(raw)
	for _, f := range fields {
		if f.Key == "token" || f.Key == "password" {
			t.Fatalf("should not return secret field: %s", f.Key)
		}
	}
}
