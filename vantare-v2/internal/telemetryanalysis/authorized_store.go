package telemetryanalysis

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

const authorizedSessionStoreVersion = 1

type AuthorizedSessionStore struct {
	mu     sync.RWMutex
	path   string
	models []AuthorizedSessionModel
}

type authorizedSessionStoreDocument struct {
	Version int                            `json:"version"`
	Models  []authorizedSessionModelRecord `json:"models"`
}

type authorizedSessionModelRecord struct {
	Manifest    Manifest                         `json:"manifest"`
	Evidence    HistoricalArtifactEvidenceRecord `json:"evidence"`
	Session     HistoricalSession                `json:"session"`
	Validity    *LapValidityAnalysis             `json:"validity,omitempty"`
	Consumption *SessionConsumptionPace          `json:"consumption,omitempty"`
	Curves      *SessionDerivedCurves            `json:"curves,omitempty"`
	Pit         *SessionPitObservation           `json:"pit,omitempty"`
}

type HistoricalArtifactEvidenceRecord struct {
	ContentSHA256 string          `json:"contentSha256"`
	Metadata      ContentMetadata `json:"metadata"`
}

func OpenAuthorizedSessionStore(path string) (*AuthorizedSessionStore, error) {
	if strings.TrimSpace(path) == "" {
		return nil, fmt.Errorf("authorized session store path is required")
	}
	store := &AuthorizedSessionStore{path: path, models: []AuthorizedSessionModel{}}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read authorized session store: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var document authorizedSessionStoreDocument
	if err := decoder.Decode(&document); err != nil || decoder.Decode(&struct{}{}) != io.EOF || document.Version != authorizedSessionStoreVersion || document.Models == nil {
		return nil, fmt.Errorf("decode authorized session store")
	}
	seen := make(map[string]struct{}, len(document.Models))
	for _, record := range document.Models {
		model := modelFromRecord(record)
		if err := validateStoredModel(model); err != nil {
			return nil, err
		}
		if _, duplicate := seen[model.Session.ID]; duplicate {
			return nil, ErrInvalidAuthorizedSession
		}
		seen[model.Session.ID] = struct{}{}
		store.models = append(store.models, model)
	}
	return store, nil
}

func (store *AuthorizedSessionStore) Add(ctx context.Context, model AuthorizedSessionModel) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := validateStoredModel(model); err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, existing := range store.models {
		if existing.Session.ID != model.Session.ID {
			continue
		}
		if recordsEqual(recordFromModel(existing), recordFromModel(model)) {
			return nil
		}
		return ErrInvalidAuthorizedSession
	}
	previous := append([]AuthorizedSessionModel(nil), store.models...)
	store.models = append(store.models, model)
	sort.Slice(store.models, func(i, j int) bool { return store.models[i].Session.ID < store.models[j].Session.ID })
	if err := store.persistLocked(); err != nil {
		store.models = previous
		return err
	}
	return nil
}

func (store *AuthorizedSessionStore) ListAuthorizedSessions(ctx context.Context) ([]AuthorizedSessionModel, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	store.mu.RLock()
	defer store.mu.RUnlock()
	result := make([]AuthorizedSessionModel, len(store.models))
	copy(result, store.models)
	return result, nil
}

func validateStoredModel(model AuthorizedSessionModel) error {
	manifest := model.Artifact.Manifest()
	if !validAuthorizedHistoricalArtifact(model.Artifact) || strings.TrimSpace(model.Session.ID) == "" ||
		model.Session.Provenance.Source != manifest.Source || model.Session.Provenance.Parser != manifest.Parser {
		return ErrInvalidAuthorizedSession
	}
	return nil
}

func recordFromModel(model AuthorizedSessionModel) authorizedSessionModelRecord {
	evidence := model.Artifact.Evidence()
	evidence.Metadata.fileInfo = nil
	if evidence.Metadata.Identity == "" {
		evidence.Metadata.Identity = evidence.ContentSHA256
	}
	return authorizedSessionModelRecord{Manifest: model.Artifact.Manifest(), Evidence: HistoricalArtifactEvidenceRecord{ContentSHA256: evidence.ContentSHA256, Metadata: evidence.Metadata}, Session: model.Session, Validity: model.Validity, Consumption: model.Consumption, Curves: model.Curves, Pit: model.Pit}
}

func modelFromRecord(record authorizedSessionModelRecord) AuthorizedSessionModel {
	evidence := HistoricalArtifactEvidence{ContentSHA256: record.Evidence.ContentSHA256, Metadata: record.Evidence.Metadata}
	return AuthorizedSessionModel{Artifact: AuthorizedHistoricalArtifact{manifest: record.Manifest, evidence: evidence}, Session: record.Session, Validity: record.Validity, Consumption: record.Consumption, Curves: record.Curves, Pit: record.Pit}
}

func recordsEqual(left, right authorizedSessionModelRecord) bool {
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftJSON, rightJSON)
}

func (store *AuthorizedSessionStore) persistLocked() error {
	records := make([]authorizedSessionModelRecord, len(store.models))
	for index, model := range store.models {
		records[index] = recordFromModel(model)
	}
	data, err := json.Marshal(authorizedSessionStoreDocument{Version: authorizedSessionStoreVersion, Models: records})
	if err != nil {
		return fmt.Errorf("encode authorized session store: %w", err)
	}
	directory := filepath.Dir(store.path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create authorized session directory: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".authorized-sessions-*.tmp")
	if err != nil {
		return fmt.Errorf("create authorized session temporary: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.Write(data); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryPath, store.path); err != nil {
		return fmt.Errorf("replace authorized session store: %w", err)
	}
	return nil
}

var _ AuthorizedSessionSource = (*AuthorizedSessionStore)(nil)
