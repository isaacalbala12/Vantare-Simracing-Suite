package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOperationalGrantIsDryRunByDefault(t *testing.T) {
	setCalls := 0
	server := operationalTestServer(t, &setCalls)
	defer server.Close()
	t.Setenv("SUPABASE_URL", server.URL)
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "secret-test-key")

	var output bytes.Buffer
	err := runOperationalAccess([]string{
		"grant", "00000000-0000-0000-0000-000000000247", "tester",
		"linear:isa-247", "Approved tester access", "isa-247-test",
	}, &output)
	if err != nil {
		t.Fatal(err)
	}
	if setCalls != 0 {
		t.Fatalf("write RPC calls = %d, want 0", setCalls)
	}
	if !strings.Contains(output.String(), "mode=dry-run writes=0") {
		t.Fatalf("output = %q", output.String())
	}
	if strings.Contains(output.String(), "secret-test-key") {
		t.Fatal("output leaked service key")
	}
}

func TestOperationalGrantApplyUsesServiceRPC(t *testing.T) {
	setCalls := 0
	server := operationalTestServer(t, &setCalls)
	defer server.Close()
	t.Setenv("SUPABASE_URL", server.URL)
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "secret-test-key")

	var output bytes.Buffer
	err := runOperationalAccess([]string{
		"grant", "00000000-0000-0000-0000-000000000247", "nightly_tester",
		"linear:isa-247", "Approved nightly access", "isa-247-apply", "--apply",
	}, &output)
	if err != nil {
		t.Fatal(err)
	}
	if setCalls != 1 {
		t.Fatalf("write RPC calls = %d, want 1", setCalls)
	}
	if !strings.Contains(output.String(), "mode=apply outcome=applied") {
		t.Fatalf("output = %q", output.String())
	}
}

func TestOperationalAccessRejectsInvalidRoleBeforeWrite(t *testing.T) {
	t.Setenv("SUPABASE_URL", "https://example.supabase.co")
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "secret-test-key")
	err := runOperationalAccess([]string{
		"grant", "00000000-0000-0000-0000-000000000247", "pro",
		"linear:isa-247", "Invalid commercial role", "isa-247-invalid",
	}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "rol inválido") {
		t.Fatalf("err = %v", err)
	}
}

func TestLegacyRetirementIsDryRunByDefault(t *testing.T) {
	setCalls := 0
	server := operationalTestServer(t, &setCalls)
	defer server.Close()
	t.Setenv("SUPABASE_URL", server.URL)
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "secret-test-key")

	var output bytes.Buffer
	err := runOperationalAccess([]string{
		"legacy-retire", "00000000-0000-0000-0000-000000000247",
		"linear:isa-247", "Retire classified legacy grants", "isa-247-retire",
	}, &output)
	if err != nil {
		t.Fatal(err)
	}
	if setCalls != 0 || !strings.Contains(output.String(), "legacy_active=2") || !strings.Contains(output.String(), "writes=0") {
		t.Fatalf("calls=%d output=%q", setCalls, output.String())
	}
}

func operationalTestServer(t *testing.T, setCalls *int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret-test-key" {
			t.Errorf("missing service authorization")
		}
		switch r.URL.Path {
		case "/rest/v1/rpc/operational_access_preview":
			json.NewEncoder(w).Encode([]operationalAssignment{})
		case "/rest/v1/rpc/operational_access_set":
			*setCalls++
			json.NewEncoder(w).Encode([]operationalAssignment{{
				Outcome: "applied", Role: "nightly_tester", Status: "active",
			}})
		case "/rest/v1/rpc/operational_legacy_grant_preview":
			json.NewEncoder(w).Encode([]legacyGrantPreview{{
				ActiveCount: 2, Capabilities: []string{"beta_access", "vantare.edition.launch_v1"},
			}})
		case "/rest/v1/rpc/operational_legacy_grant_retire":
			*setCalls++
			json.NewEncoder(w).Encode([]legacyRetirementResult{{Outcome: "applied", RetiredCount: 2}})
		default:
			http.NotFound(w, r)
		}
	}))
}
