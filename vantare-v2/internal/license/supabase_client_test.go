package license

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSupabaseClientFetchCredential(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/functions/v1/license-credential" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer token" || r.Header.Get("apikey") != "anon" {
			t.Fatal("missing auth headers")
		}
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["deviceFingerprint"] != "fp" {
			t.Fatalf("body = %#v", body)
		}
		_ = json.NewEncoder(w).Encode(CredentialResponse{
			Credential: OfflineCredential{Version: 1, Algorithm: "Ed25519", KeyID: "key", Signature: "signature"},
		})
	}))
	defer server.Close()
	credential, err := NewStdlibSupabaseClient(server.URL, "anon").FetchCredential(context.Background(), "token", "fp")
	if err != nil || credential.Credential.KeyID != "key" {
		t.Fatalf("credential = %#v, %v", credential, err)
	}
}

func TestSupabaseClientMapsDeviceLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"device_limit"}`))
	}))
	defer server.Close()
	_, err := NewStdlibSupabaseClient(server.URL, "anon").FetchCredential(context.Background(), "token", "fp")
	if !errors.Is(err, ErrDeviceLimit) {
		t.Fatalf("error = %v", err)
	}
}

func TestSupabaseClientRejectsUnknownCredentialField(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"version":1,"unexpected":true}`))
	}))
	defer server.Close()
	if _, err := NewStdlibSupabaseClient(server.URL, "anon").FetchCredential(context.Background(), "token", "fp"); err == nil {
		t.Fatal("expected decode error")
	}
}

func TestSupabaseClientRejectsTrailingAndOversizedCredentialResponses(t *testing.T) {
	for name, response := range map[string]string{
		"trailing":  `{"version":1} {"version":1}`,
		"oversized": `{"padding":"` + string(make([]byte, (64<<10)+1)) + `"}`,
	} {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte(response))
			}))
			defer server.Close()
			if _, err := NewStdlibSupabaseClient(server.URL, "anon").FetchCredential(context.Background(), "token", "fp"); err == nil {
				t.Fatal("expected decode error")
			}
		})
	}
}

func TestSupabaseClientMarksAuthoritativeClientRejection(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid_auth"}`))
	}))
	defer server.Close()
	_, err := NewStdlibSupabaseClient(server.URL, "anon").FetchCredential(context.Background(), "token", "fp")
	if !errors.Is(err, ErrCredentialRejected) {
		t.Fatalf("error = %v", err)
	}
}

func TestSupabaseClientResetDevice(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/v1/rpc/reset_active_device" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	if err := NewStdlibSupabaseClient(server.URL, "anon").ResetDevice(context.Background(), "token", "fp"); err != nil {
		t.Fatal(err)
	}
}
