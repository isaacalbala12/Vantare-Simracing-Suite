package curation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

type memoryCredentialStore struct {
	mu          sync.Mutex
	credentials UploadCredentials
	hasValue    bool
}

func (store *memoryCredentialStore) Save(value UploadCredentials) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.credentials, store.hasValue = value, true
	return nil
}

func (store *memoryCredentialStore) Load() (UploadCredentials, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if !store.hasValue {
		return UploadCredentials{}, ErrCredentialsNotFound
	}
	return store.credentials, nil
}

func (store *memoryCredentialStore) Delete() error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.credentials, store.hasValue = UploadCredentials{}, false
	return nil
}

func TestUploadServiceOptInVersionsConsentAndCustodiesIndependentSecrets(t *testing.T) {
	secretStore := &memoryCredentialStore{}
	service := openTestUploadService(t, secretStore, "")

	snapshot, err := service.OptIn("curation-consent.v1")
	if err != nil {
		t.Fatalf("opt in: %v", err)
	}
	credentials, err := secretStore.Load()
	if err != nil {
		t.Fatalf("load credentials: %v", err)
	}
	if credentials.UploadSecret == "" || credentials.DeleteSecret == "" || credentials.UploadSecret == credentials.DeleteSecret {
		t.Fatalf("secrets are not independent: %+v", credentials)
	}
	if !snapshot.Consent.Active || snapshot.Consent.TextVersion != "curation-consent.v1" || snapshot.Consent.AcceptedAt.IsZero() {
		t.Fatalf("consent = %+v", snapshot.Consent)
	}
	data, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if containsSecret(data, credentials.UploadSecret) || containsSecret(data, credentials.DeleteSecret) {
		t.Fatal("snapshot exposed protected credentials")
	}
}

func TestUploadServicePauseCancelsUnacceptedRequestAndPersistsAcrossReload(t *testing.T) {
	arrived := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		close(arrived)
		select {
		case <-request.Context().Done():
		case <-release:
		}
	}))
	defer server.Close()

	secretStore := &memoryCredentialStore{}
	statePath := filepath.Join(t.TempDir(), "curation-upload.json")
	service := openUploadServiceAt(t, statePath, secretStore, server.URL)
	if _, err := service.OptIn("curation-consent.v1"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Enqueue(validBundle()); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- service.DispatchNext(context.Background()) }()
	<-arrived
	if _, err := service.Pause(); err != nil {
		t.Fatalf("pause: %v", err)
	}
	if err := <-done; !errors.Is(err, ErrDispatchCanceled) {
		t.Fatalf("dispatch error = %v", err)
	}
	close(release)

	reloaded := openUploadServiceAt(t, statePath, secretStore, server.URL)
	snapshot := reloaded.Snapshot()
	if !snapshot.Paused || len(snapshot.Queue) != 1 || snapshot.Queue[0].State != QueuePaused {
		t.Fatalf("reloaded queue = %+v", snapshot)
	}
}

func TestUploadServicePauseKeepsAcceptedRequestSent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("content-type", "application/json")
		writer.WriteHeader(http.StatusCreated)
		_, _ = writer.Write([]byte(`{"status":"accepted","semanticDigest":"abc","acceptedAt":"2026-08-22T10:00:00Z","expiresAt":"2027-02-18T10:00:00Z","retentionDays":180}`))
	}))
	defer server.Close()

	service := openTestUploadService(t, &memoryCredentialStore{}, server.URL)
	if _, err := service.OptIn("curation-consent.v1"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Enqueue(validBundle()); err != nil {
		t.Fatal(err)
	}
	if err := service.DispatchNext(context.Background()); err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if _, err := service.Pause(); err != nil {
		t.Fatal(err)
	}
	if got := service.Snapshot().Queue[0]; got.State != QueueSent || got.AcceptedAt == nil {
		t.Fatalf("accepted item changed after pause: %+v", got)
	}
}

func TestWorkerClientUsesF6BProtocolOnlyAgainstConfiguredLocalServer(t *testing.T) {
	var sawUpload, sawDelete bool
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/v1/bundles":
			sawUpload = request.Header.Get("x-vantare-build-token") == "test-build-token-0123456789012345" &&
				request.Header.Get("x-vantare-upload-secret") == "upload-secret-012345678901234567890123" &&
				request.Header.Get("x-vantare-delete-secret") == "delete-secret-012345678901234567890123"
			writer.WriteHeader(http.StatusCreated)
			_, _ = writer.Write([]byte(`{"status":"accepted","semanticDigest":"digest","acceptedAt":"2026-08-22T10:00:00Z","expiresAt":"2027-02-18T10:00:00Z","retentionDays":180}`))
		case "/v1/tombstones":
			sawDelete = request.Header.Get("x-vantare-delete-secret") == "delete-secret-012345678901234567890123"
			writer.WriteHeader(http.StatusCreated)
			_, _ = writer.Write([]byte(`{"status":"accepted","tombstoneRef":"tomb-1","applyWithinDays":7}`))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	client, err := NewWorkerClient(server.URL, "test-build-token-0123456789012345", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	credentials := UploadCredentials{
		UploadID: "install-1", UploadSecret: "upload-secret-012345678901234567890123", DeleteSecret: "delete-secret-012345678901234567890123",
	}
	if _, err := client.Upload(context.Background(), validBundle(), credentials); err != nil {
		t.Fatalf("upload: %v", err)
	}
	if _, err := client.Delete(context.Background(), credentials); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !sawUpload || !sawDelete {
		t.Fatalf("protocol headers upload=%v delete=%v", sawUpload, sawDelete)
	}
	if _, err := NewWorkerClient("", "", server.Client()); !errors.Is(err, ErrUploadDisabled) {
		t.Fatalf("empty endpoint error = %v", err)
	}
}

func openTestUploadService(t *testing.T, secrets CredentialStore, endpoint string) *UploadService {
	t.Helper()
	return openUploadServiceAt(t, filepath.Join(t.TempDir(), "curation-upload.json"), secrets, endpoint)
}

func openUploadServiceAt(t *testing.T, path string, secrets CredentialStore, endpoint string) *UploadService {
	t.Helper()
	service, err := OpenUploadService(UploadServiceOptions{
		StatePath:   path,
		Credentials: secrets,
		Endpoint:    endpoint,
		BuildToken:  "test-build-token-0123456789012345",
		Now:         func() time.Time { return time.Date(2026, 8, 22, 10, 0, 0, 0, time.UTC) },
	})
	if err != nil {
		t.Fatalf("open upload service: %v", err)
	}
	return service
}

func containsSecret(data []byte, secret string) bool {
	return secret != "" && bytes.Contains(data, []byte(secret))
}
