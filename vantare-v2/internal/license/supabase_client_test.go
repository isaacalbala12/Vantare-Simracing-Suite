package license

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSupabaseClientFetchAccount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/v1/rpc/get_account_entitlements" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth == "" {
			t.Fatal("missing Authorization header")
		}
		if r.Header.Get("apikey") == "" {
			t.Fatal("missing apikey header")
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("unexpected content type %s", r.Header.Get("Content-Type"))
		}
		w.Header().Set("Content-Type", "application/json")
		expires := time.Now().Add(time.Hour).UTC()
		_ = json.NewEncoder(w).Encode(AccountInfo{
			UserID:       "u1",
			Email:        "u1@example.com",
			Entitlements: []Entitlement{EntitlementOverlays},
			ActiveDevice: "fp1",
			ExpiresAt:    &expires,
		})
	}))
	defer server.Close()

	client := NewStdlibSupabaseClient(server.URL, "anon-key")
	info, err := client.FetchAccount(context.Background(), "token-123", "fp1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.UserID != "u1" {
		t.Fatalf("expected user u1, got %s", info.UserID)
	}
	if len(info.Entitlements) != 1 || info.Entitlements[0] != EntitlementOverlays {
		t.Fatalf("unexpected entitlements: %v", info.Entitlements)
	}
	if info.ActiveDevice != "fp1" {
		t.Fatalf("unexpected active device: %s", info.ActiveDevice)
	}
}

func TestSupabaseClientFetchAccountPostgRESTArray(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		expires := time.Now().Add(time.Hour).UTC()
		_ = json.NewEncoder(w).Encode([]AccountInfo{{
			UserID:       "u2",
			Email:        "u2@example.com",
			Entitlements: []Entitlement{EntitlementEngineer},
			ActiveDevice: "fp2",
			ExpiresAt:    &expires,
		}})
	}))
	defer server.Close()

	client := NewStdlibSupabaseClient(server.URL, "anon-key")
	info, err := client.FetchAccount(context.Background(), "token-456", "fp2")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.UserID != "u2" {
		t.Fatalf("expected user u2, got %s", info.UserID)
	}
	if len(info.Entitlements) != 1 || info.Entitlements[0] != EntitlementEngineer {
		t.Fatalf("unexpected entitlements: %v", info.Entitlements)
	}
}

func TestSupabaseClientFetchAccountError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("boom"))
	}))
	defer server.Close()

	client := NewStdlibSupabaseClient(server.URL, "anon-key")
	_, err := client.FetchAccount(context.Background(), "token", "fp")
	if err == nil {
		t.Fatal("expected error on 500 status")
	}
}

func TestSupabaseClientResetDevice(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/v1/rpc/reset_active_device" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewStdlibSupabaseClient(server.URL, "anon-key")
	if err := client.ResetDevice(context.Background(), "token", "fp"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
