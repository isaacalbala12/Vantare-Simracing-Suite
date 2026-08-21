package curation

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const uploadStateVersionV1 = "curation.upload-state.v1"

var (
	ErrCredentialsNotFound = errors.New("curation credentials not found")
	ErrConsentRequired     = errors.New("active curation consent is required")
	ErrQueuePaused         = errors.New("curation queue is paused")
	ErrQueueEmpty          = errors.New("curation queue is empty")
	ErrDispatchInProgress  = errors.New("curation dispatch is already in progress")
)

type QueueState string

const (
	QueuePending QueueState = "pending"
	QueueSent    QueueState = "sent"
	QueueFailed  QueueState = "failed"
	QueuePaused  QueueState = "paused"
)

type UploadCredentials struct {
	UploadID     string `json:"uploadId"`
	UploadSecret string `json:"uploadSecret"`
	DeleteSecret string `json:"deleteSecret"`
}

type CredentialStore interface {
	Save(UploadCredentials) error
	Load() (UploadCredentials, error)
	Delete() error
}

type ConsentRecord struct {
	TextVersion string     `json:"textVersion"`
	AcceptedAt  time.Time  `json:"acceptedAt"`
	RevokedAt   *time.Time `json:"revokedAt,omitempty"`
	Active      bool       `json:"active"`
}

type QueueItem struct {
	ID             string           `json:"id"`
	CreatedAt      time.Time        `json:"createdAt"`
	UpdatedAt      time.Time        `json:"updatedAt"`
	State          QueueState       `json:"state"`
	Bundle         CurationBundleV1 `json:"bundle"`
	Attempts       int              `json:"attempts"`
	LastError      string           `json:"lastError,omitempty"`
	AcceptedAt     *time.Time       `json:"acceptedAt,omitempty"`
	SemanticDigest string           `json:"semanticDigest,omitempty"`
}

type RemoteDeletion struct {
	RequestedAt     time.Time `json:"requestedAt"`
	State           string    `json:"state"`
	TombstoneRef    string    `json:"tombstoneRef,omitempty"`
	ApplyWithinDays int       `json:"applyWithinDays,omitempty"`
	LastError       string    `json:"lastError,omitempty"`
}

type UploadSnapshot struct {
	Consent   ConsentRecord    `json:"consent"`
	Paused    bool             `json:"paused"`
	Enabled   bool             `json:"enabled"`
	Queue     []QueueItem      `json:"queue"`
	Deletions []RemoteDeletion `json:"deletions"`
}

type uploadState struct {
	Version   string           `json:"version"`
	Consent   ConsentRecord    `json:"consent"`
	Paused    bool             `json:"paused"`
	Queue     []QueueItem      `json:"queue"`
	Deletions []RemoteDeletion `json:"deletions"`
}

type UploadServiceOptions struct {
	StatePath   string
	Credentials CredentialStore
	Endpoint    string
	BuildToken  string
	HTTPClient  *http.Client
	Now         func() time.Time
	Random      io.Reader
}

type UploadService struct {
	mu          sync.Mutex
	statePath   string
	credentials CredentialStore
	endpoint    string
	buildToken  string
	httpClient  *http.Client
	now         func() time.Time
	random      io.Reader
	state       uploadState
	cancel      context.CancelFunc
	dispatching bool
}

func OpenUploadService(options UploadServiceOptions) (*UploadService, error) {
	if strings.TrimSpace(options.StatePath) == "" || options.Credentials == nil {
		return nil, fmt.Errorf("curation upload state and credential store are required")
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	random := options.Random
	if random == nil {
		random = rand.Reader
	}
	service := &UploadService{
		statePath: options.StatePath, credentials: options.Credentials,
		endpoint: strings.TrimSpace(options.Endpoint), buildToken: options.BuildToken,
		httpClient: options.HTTPClient, now: now, random: random,
		state: uploadState{Version: uploadStateVersionV1, Queue: []QueueItem{}, Deletions: []RemoteDeletion{}},
	}
	if err := service.load(); err != nil {
		return nil, err
	}
	return service, nil
}

func (service *UploadService) Snapshot() UploadSnapshot {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.snapshotLocked()
}

func (service *UploadService) OptIn(textVersion string) (UploadSnapshot, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if strings.TrimSpace(textVersion) == "" || len(textVersion) > 128 {
		return UploadSnapshot{}, fmt.Errorf("consent text version is required")
	}
	createdCredentials := false
	_, err := service.credentials.Load()
	if errors.Is(err, ErrCredentialsNotFound) {
		credentials, generateErr := service.newCredentials()
		if generateErr != nil {
			return UploadSnapshot{}, generateErr
		}
		if saveErr := service.credentials.Save(credentials); saveErr != nil {
			return UploadSnapshot{}, fmt.Errorf("custody curation credentials: %w", saveErr)
		}
		createdCredentials = true
	} else if err != nil {
		return UploadSnapshot{}, fmt.Errorf("load curation credentials: %w", err)
	}
	now := service.now().UTC()
	service.state.Consent = ConsentRecord{TextVersion: textVersion, AcceptedAt: now, Active: true}
	service.state.Paused = false
	if err := service.persistLocked(); err != nil {
		if createdCredentials {
			_ = service.credentials.Delete()
		}
		return UploadSnapshot{}, err
	}
	return service.snapshotLocked(), nil
}

func (service *UploadService) GenerateAndEnqueue(request ExportRequest) (QueueItem, error) {
	service.mu.Lock()
	if !service.state.Consent.Active {
		service.mu.Unlock()
		return QueueItem{}, ErrConsentRequired
	}
	credentials, err := service.credentials.Load()
	if err != nil {
		service.mu.Unlock()
		return QueueItem{}, fmt.Errorf("load curation credentials: %w", err)
	}
	bundleID, err := service.randomHex(16)
	service.mu.Unlock()
	if err != nil {
		return QueueItem{}, err
	}
	deleteDigest := sha256.Sum256([]byte(credentials.DeleteSecret))
	request.UploadID = credentials.UploadID
	request.DeleteHash = hex.EncodeToString(deleteDigest[:])
	request.BundleID = "bundle-" + bundleID
	bundle, err := GenerateFromDerivations(request)
	if err != nil {
		return QueueItem{}, err
	}
	return service.Enqueue(bundle)
}

func (service *UploadService) Enqueue(bundle CurationBundleV1) (QueueItem, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if !service.state.Consent.Active {
		return QueueItem{}, ErrConsentRequired
	}
	credentials, err := service.credentials.Load()
	if err != nil {
		return QueueItem{}, fmt.Errorf("load curation credentials: %w", err)
	}
	bundle.Admin.UploadID = credentials.UploadID
	digest := sha256.Sum256([]byte(credentials.DeleteSecret))
	bundle.Admin.DeleteHash = hex.EncodeToString(digest[:])
	if _, err := bundle.MarshalStrict(); err != nil {
		return QueueItem{}, fmt.Errorf("enqueue curation bundle: %w", err)
	}
	id, err := service.randomHex(16)
	if err != nil {
		return QueueItem{}, err
	}
	now := service.now().UTC()
	item := QueueItem{ID: "queue-" + id, CreatedAt: now, UpdatedAt: now, State: QueuePending, Bundle: bundle}
	service.state.Queue = append(service.state.Queue, item)
	if err := service.persistLocked(); err != nil {
		service.state.Queue = service.state.Queue[:len(service.state.Queue)-1]
		return QueueItem{}, err
	}
	return item, nil
}

func (service *UploadService) Pause() (UploadSnapshot, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.state.Paused = true
	if service.cancel != nil {
		service.cancel()
	}
	now := service.now().UTC()
	for index := range service.state.Queue {
		if service.state.Queue[index].State != QueueSent {
			service.state.Queue[index].State = QueuePaused
			service.state.Queue[index].UpdatedAt = now
		}
	}
	if err := service.persistLocked(); err != nil {
		return UploadSnapshot{}, err
	}
	return service.snapshotLocked(), nil
}

func (service *UploadService) Resume() (UploadSnapshot, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if !service.state.Consent.Active {
		return UploadSnapshot{}, ErrConsentRequired
	}
	service.state.Paused = false
	now := service.now().UTC()
	for index := range service.state.Queue {
		if service.state.Queue[index].State == QueuePaused {
			service.state.Queue[index].State = QueuePending
			service.state.Queue[index].UpdatedAt = now
		}
	}
	if err := service.persistLocked(); err != nil {
		return UploadSnapshot{}, err
	}
	return service.snapshotLocked(), nil
}

func (service *UploadService) Revoke() (UploadSnapshot, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	now := service.now().UTC()
	service.state.Consent.Active = false
	service.state.Consent.RevokedAt = &now
	service.state.Paused = true
	if service.cancel != nil {
		service.cancel()
	}
	for index := range service.state.Queue {
		if service.state.Queue[index].State != QueueSent {
			service.state.Queue[index].State = QueuePaused
			service.state.Queue[index].UpdatedAt = now
		}
	}
	if err := service.persistLocked(); err != nil {
		return UploadSnapshot{}, err
	}
	return service.snapshotLocked(), nil
}

func (service *UploadService) DispatchNext(ctx context.Context) error {
	service.mu.Lock()
	if !service.state.Consent.Active {
		service.mu.Unlock()
		return ErrConsentRequired
	}
	if service.state.Paused {
		service.mu.Unlock()
		return ErrQueuePaused
	}
	if service.dispatching {
		service.mu.Unlock()
		return ErrDispatchInProgress
	}
	index := -1
	for candidate := range service.state.Queue {
		if service.state.Queue[candidate].State == QueuePending || service.state.Queue[candidate].State == QueueFailed {
			index = candidate
			break
		}
	}
	if index < 0 {
		service.mu.Unlock()
		return ErrQueueEmpty
	}
	credentials, err := service.credentials.Load()
	if err != nil {
		service.mu.Unlock()
		return fmt.Errorf("load curation credentials: %w", err)
	}
	client, err := NewWorkerClient(service.endpoint, service.buildToken, service.httpClient)
	if err != nil {
		service.mu.Unlock()
		return err
	}
	dispatchContext, cancel := context.WithCancel(ctx)
	service.cancel = cancel
	service.dispatching = true
	bundle := service.state.Queue[index].Bundle
	service.state.Queue[index].Attempts++
	service.mu.Unlock()

	receipt, dispatchErr := client.Upload(dispatchContext, bundle, credentials)
	cancel()

	service.mu.Lock()
	defer service.mu.Unlock()
	service.cancel = nil
	service.dispatching = false
	now := service.now().UTC()
	item := &service.state.Queue[index]
	item.UpdatedAt = now
	if dispatchErr == nil {
		item.State = QueueSent
		item.LastError = ""
		accepted := receipt.AcceptedAt.UTC()
		item.AcceptedAt = &accepted
		item.SemanticDigest = receipt.SemanticDigest
	} else if service.state.Paused || !service.state.Consent.Active || errors.Is(dispatchErr, ErrDispatchCanceled) {
		item.State = QueuePaused
		item.LastError = ""
		dispatchErr = ErrDispatchCanceled
	} else {
		item.State = QueueFailed
		item.LastError = "upload_failed"
	}
	if err := service.persistLocked(); err != nil {
		return err
	}
	return dispatchErr
}

func (service *UploadService) RequestRemoteDeletion(ctx context.Context) (DeletionReceipt, error) {
	service.mu.Lock()
	credentials, err := service.credentials.Load()
	endpoint, token, httpClient := service.endpoint, service.buildToken, service.httpClient
	service.mu.Unlock()
	if err != nil {
		return DeletionReceipt{}, fmt.Errorf("load curation credentials: %w", err)
	}
	client, err := NewWorkerClient(endpoint, token, httpClient)
	if err != nil {
		if persistErr := service.recordDeletionFailure(); persistErr != nil {
			return DeletionReceipt{}, persistErr
		}
		return DeletionReceipt{}, err
	}
	receipt, requestErr := client.Delete(ctx, credentials)
	service.mu.Lock()
	defer service.mu.Unlock()
	record := RemoteDeletion{RequestedAt: service.now().UTC()}
	if requestErr != nil {
		record.State, record.LastError = "failed", "deletion_failed"
	} else {
		record.State, record.TombstoneRef, record.ApplyWithinDays = "accepted", receipt.TombstoneRef, receipt.ApplyWithinDays
	}
	service.state.Deletions = append(service.state.Deletions, record)
	if persistErr := service.persistLocked(); persistErr != nil {
		return DeletionReceipt{}, persistErr
	}
	return receipt, requestErr
}

func (service *UploadService) recordDeletionFailure() error {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.state.Deletions = append(service.state.Deletions, RemoteDeletion{
		RequestedAt: service.now().UTC(), State: "failed", LastError: "deletion_failed",
	})
	return service.persistLocked()
}

func (service *UploadService) snapshotLocked() UploadSnapshot {
	queue := append([]QueueItem(nil), service.state.Queue...)
	deletions := append([]RemoteDeletion(nil), service.state.Deletions...)
	return UploadSnapshot{
		Consent: service.state.Consent, Paused: service.state.Paused,
		Enabled: service.endpoint != "", Queue: queue, Deletions: deletions,
	}
}

func (service *UploadService) newCredentials() (UploadCredentials, error) {
	uploadID, err := service.randomHex(16)
	if err != nil {
		return UploadCredentials{}, err
	}
	uploadSecret, err := service.randomSecret()
	if err != nil {
		return UploadCredentials{}, err
	}
	deleteSecret, err := service.randomSecret()
	if err != nil {
		return UploadCredentials{}, err
	}
	return UploadCredentials{UploadID: "install-" + uploadID, UploadSecret: uploadSecret, DeleteSecret: deleteSecret}, nil
}

func (service *UploadService) randomHex(size int) (string, error) {
	data := make([]byte, size)
	if _, err := io.ReadFull(service.random, data); err != nil {
		return "", fmt.Errorf("generate curation identity: %w", err)
	}
	return hex.EncodeToString(data), nil
}

func (service *UploadService) randomSecret() (string, error) {
	data := make([]byte, 32)
	if _, err := io.ReadFull(service.random, data); err != nil {
		return "", fmt.Errorf("generate curation secret: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func (service *UploadService) load() error {
	data, err := os.ReadFile(service.statePath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read curation upload state: %w", err)
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&service.state); err != nil {
		return fmt.Errorf("decode curation upload state: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return fmt.Errorf("decode curation upload state: trailing data")
	}
	if service.state.Version != uploadStateVersionV1 {
		return fmt.Errorf("unsupported curation upload state %q", service.state.Version)
	}
	return nil
}

func (service *UploadService) persistLocked() error {
	data, err := json.MarshalIndent(service.state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode curation upload state: %w", err)
	}
	directory := filepath.Dir(service.statePath)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create curation upload directory: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".curation-upload-*.tmp")
	if err != nil {
		return fmt.Errorf("create curation upload temporary: %w", err)
	}
	temporaryPath := temporary.Name()
	committed := false
	defer func() {
		if !committed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return fmt.Errorf("protect curation upload state: %w", err)
	}
	if _, err := temporary.Write(data); err != nil {
		return fmt.Errorf("write curation upload state: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync curation upload state: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close curation upload state: %w", err)
	}
	if err := os.Rename(temporaryPath, service.statePath); err != nil {
		return fmt.Errorf("replace curation upload state: %w", err)
	}
	committed = true
	return nil
}
