package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestScanTraceDirectoryCountsSensitiveMarkersWithoutEmittingValues(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	const (
		eventID = "12345678-1234-1234-1234-123456789abc"
		steamID = "76561191234567890"
	)
	jwt := strings.Join([]string{"eyJheader", "payload", "signature"}, ".")
	trace := strings.Join([]string{
		"GET https://raceos.gg/api/v1/notifications/global",
		"GET https://raceos.gg/api/v1/events/" + eventID + "?token=never-print-query",
		"Joining race server for online event " + eventID,
		"nakama remote marker",
		"Author" + "ization: Bearer " + "never-print-this",
		jwt,
		steamID,
	}, "\n")
	path := filepath.Join(dir, "trace_synthetic.txt")
	if err := os.WriteFile(path, []byte(trace), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := scanTraceDirectory(dir, 1)
	if err != nil {
		t.Fatalf("scanTraceDirectory() error = %v", err)
	}
	if len(got.Files) != 1 {
		t.Fatalf("files = %d, want 1", len(got.Files))
	}
	file := got.Files[0]
	if file.File != "trace-1" {
		t.Fatalf("file label = %q, want anonymous label", file.File)
	}
	if file.RaceOSMentions != 2 || file.NakamaMentions != 1 || file.OnlineEventJoins != 1 {
		t.Fatalf("unexpected public marker counts: %+v", file)
	}
	if file.BearerHeaderMarkers != 1 || file.JWTLikeValues != 1 || file.SteamIDLikeValues != 1 {
		t.Fatalf("unexpected sensitive marker counts: %+v", file)
	}

	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{eventID, steamID, jwt, "never-print-this"} {
		if bytes.Contains(encoded, []byte(forbidden)) {
			t.Fatalf("report leaked sensitive value %q", forbidden)
		}
	}
	if len(file.OnlineRoutes) != 2 {
		t.Fatalf("online routes = %+v, want two sanitized routes", file.OnlineRoutes)
	}
	encodedString := string(encoded)
	if strings.Contains(encodedString, "never-print-query") || strings.Contains(encodedString, eventID) {
		t.Fatalf("online route leaked query or identifier: %s", encodedString)
	}
	if file.OnlineRoutes[0].Path != "/api/v1/events/<id>" {
		t.Fatalf("online route did not sanitize path identifier: %+v", file.OnlineRoutes)
	}
}

func TestSafeOnlineRouteRedactsSubdomainAndEveryUnapprovedSegment(t *testing.T) {
	t.Parallel()

	origin, path, ok := safeOnlineRoute("https://private-tenant.raceos.gg/api/v1/profile/isaac/abc123?ticket=secret")
	if !ok {
		t.Fatal("safeOnlineRoute() rejected a RaceOS URL")
	}
	if origin != "https://raceos.gg" || path != "/api/v1/profile/<id>/<id>" {
		t.Fatalf("safeOnlineRoute() = %q %q", origin, path)
	}
}

func TestSchemaFromBodyReturnsPathsAndNeverValues(t *testing.T) {
	t.Parallel()

	body := []byte(`{"state":{"user":{"admin":false,"userState":"private-value"}},"rows":[{"driver":"secret-name","rating":42}]}`)
	documents, schema := schemaFromBody(body)
	if documents != 1 {
		t.Fatalf("documents = %d, want 1", documents)
	}
	for _, want := range []string{
		"rows:array",
		"rows[].driver:string",
		"rows[].rating:number",
		"state.user.admin:bool",
		"state.user.userState:string",
	} {
		if !slices.Contains(schema, want) {
			t.Errorf("schema missing %q: %v", want, schema)
		}
	}
	joined := strings.Join(schema, "\n")
	if strings.Contains(joined, "private-value") || strings.Contains(joined, "secret-name") {
		t.Fatalf("schema leaked JSON values: %s", joined)
	}
}

func TestSchemaFromBodyRedactsDynamicKeysAndScansEveryArrayItem(t *testing.T) {
	t.Parallel()

	body := []byte(`{"rows":[{"driver":"first"},{"private-name":{"rating":42}}],"76561191234567890":{"rank":1}}`)
	documents, schema := schemaFromBody(body)
	if documents != 1 {
		t.Fatalf("documents = %d, want 1", documents)
	}
	for _, want := range []string{"<field>:object", "<field>.rank:number", "rows[].<field>:object", "rows[].<field>.rating:number"} {
		if !slices.Contains(schema, want) {
			t.Errorf("schema missing %q: %v", want, schema)
		}
	}
	joined := strings.Join(schema, "\n")
	if strings.Contains(joined, "private-name") || strings.Contains(joined, "76561191234567890") {
		t.Fatalf("schema leaked dynamic keys: %s", joined)
	}
}

func TestScanTraceFileReadsRecentTailWhenTraceIsLarge(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "trace_large.txt")
	prefix := bytes.Repeat([]byte("old line without marker\n"), maxTraceSize/24+2)
	content := append(prefix, []byte("GET https://raceos.gg/api/v1/events/recent-id\n")...)
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := scanTraceFile(path, "trace-1")
	if err != nil {
		t.Fatalf("scanTraceFile() error = %v", err)
	}
	if !got.Truncated || got.RaceOSMentions != 1 {
		t.Fatalf("scanTraceFile() = %+v, want recent tail marker", got)
	}
	if len(got.OnlineRoutes) != 1 || got.OnlineRoutes[0].Path != "/api/v1/events/<id>" {
		t.Fatalf("online routes = %+v", got.OnlineRoutes)
	}
}

func TestProbeEndpointReportsOnlyJSONSchema(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"profile":{"driverRank":"Gold 3","steamId":"76561191234567890"}}`))
	}))
	defer server.Close()

	client := &http.Client{Timeout: time.Second}
	got := probeEndpoint(t.Context(), client, server.URL, "/profile")
	if got.Outcome != "json_schema_only" || got.JSONDocuments != 1 {
		t.Fatalf("probeEndpoint() = %+v", got)
	}
	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encoded, []byte("Gold 3")) || bytes.Contains(encoded, []byte("76561191234567890")) {
		t.Fatalf("endpoint report leaked values: %s", encoded)
	}
	for _, want := range []string{"profile.driverRank:string", "profile.steamId:string"} {
		if !slices.Contains(got.Schema, want) {
			t.Errorf("schema missing %q: %v", want, got.Schema)
		}
	}
}

func TestRunRequiresExplicitLogDirectory(t *testing.T) {
	t.Parallel()

	err := run([]string{"-skip-rest"}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "-log-dir is required") {
		t.Fatalf("run() error = %v, want explicit log directory error", err)
	}
}

func TestValidateLoopbackBase(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		base    string
		wantErr bool
	}{
		{name: "IPv4 loopback", base: "http://127.0.0.1:6397"},
		{name: "IPv6 loopback", base: "http://[::1]:6397"},
		{name: "reject localhost name", base: "http://localhost:6397", wantErr: true},
		{name: "reject HTTPS", base: "https://127.0.0.1:6397", wantErr: true},
		{name: "reject remote", base: "http://example.com", wantErr: true},
		{name: "reject credentials", base: "http://user:secret@127.0.0.1:6397", wantErr: true},
		{name: "reject path", base: "http://127.0.0.1:6397/rest", wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := validateLoopbackBase(test.base)
			if (err != nil) != test.wantErr {
				t.Fatalf("validateLoopbackBase(%q) error = %v, wantErr %v", test.base, err, test.wantErr)
			}
		})
	}
}

func TestRunRejectsRemoteRESTBeforeReadingLogs(t *testing.T) {
	t.Parallel()

	err := run([]string{"-log-dir", "path-that-must-not-be-read", "-rest-base", "http://example.com"}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "loopback") {
		t.Fatalf("run() error = %v, want loopback rejection", err)
	}
}
