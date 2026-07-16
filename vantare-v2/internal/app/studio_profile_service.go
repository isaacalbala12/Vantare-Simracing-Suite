package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// StudioProfileSaved is delivered after a successful V3 profile save.
type StudioProfileSaved struct {
	Path     string
	Document *config.ProfileDocumentV3
	Revision string
}

// StudioProfileService manages Overlay Studio V3 profile documents in parallel to legacy ProfileService.
type StudioProfileService struct {
	path        string
	loaded      *config.LoadedProfileV3
	store       config.ProfileDocumentStore
	emitter     EventEmitter
	logger      *slog.Logger
	onSaved     func(StudioProfileSaved)
	profilesDir string
	mgr         *window.Manager
}

// NewStudioProfileService creates a parallel Studio profile service.
func NewStudioProfileService(emitter EventEmitter, onSaved func(StudioProfileSaved)) *StudioProfileService {
	return &StudioProfileService{
		store:   config.ProfileDocumentStore{},
		emitter: emitter,
		logger:  slog.Default(),
		onSaved: onSaved,
	}
}

// Load reads a profile from disk without emitting events.
func (s *StudioProfileService) Load(path string) (*config.LoadedProfileV3, error) {
	loaded, err := s.store.Load(path)
	if err != nil {
		return nil, err
	}
	s.path = path
	s.loaded = loaded
	return loaded, nil
}

// Save persists the supplied document using optimistic revision checks.
func (s *StudioProfileService) Save(requestID, expectedRevision string, doc *config.ProfileDocumentV3) error {
	if s.path == "" {
		err := fmt.Errorf("profile path not configured")
		s.emitError(requestID, "save", err)
		return err
	}
	migratedFrom := config.ProfileSchemaVersionV3
	if s.loaded != nil {
		migratedFrom = s.loaded.MigratedFrom
	}
	revision, err := s.store.Save(s.path, expectedRevision, doc, migratedFrom)
	if err != nil {
		if errors.Is(err, config.ErrProfileConflict) {
			s.emitConflict(requestID, err)
			return err
		}
		s.emitError(requestID, "save", err)
		return err
	}
	s.loaded = &config.LoadedProfileV3{
		Document:     config.NormalizeProfileDocumentV3(doc),
		Revision:     revision,
		MigratedFrom: config.ProfileSchemaVersionV3,
	}
	payload := map[string]any{
		"requestId": requestID,
		"document":  s.loaded.Document,
		"revision":  revision,
	}
	if s.emitter != nil {
		s.emitter.Emit("studio:profile:saved", payload)
	}
	if s.onSaved != nil {
		s.onSaved(StudioProfileSaved{
			Path:     s.path,
			Document: s.loaded.Document,
			Revision: revision,
		})
	}
	return nil
}

// RegisterHandlers registers Wails event listeners for Studio V3 profile operations.
func (s *StudioProfileService) RegisterHandlers(app *application.App) {
	app.Event.On("studio:profile:load", func(event *application.CustomEvent) {
		s.HandleLoad(event.Data)
	})
	app.Event.On("studio:profile:save", func(event *application.CustomEvent) {
		s.HandleSave(event.Data)
	})
}

// HandleLoad decodes a correlated load request and emits studio:profile:loaded or studio:profile:error.
func (s *StudioProfileService) HandleLoad(data any) {
	requestID, file, err := decodeStudioProfileLoadPayload(data)
	if err != nil {
		s.emitError(requestID, "load", err)
		return
	}
	path, err := s.resolveProfilePath(file)
	if err != nil {
		s.emitError(requestID, "load", err)
		return
	}
	if _, err := s.Load(path); err != nil {
		s.emitError(requestID, "load", err)
		return
	}
	s.EmitLoaded(requestID)
}

func (s *StudioProfileService) resolveProfilePath(file string) (string, error) {
	file = strings.TrimSpace(file)
	if file == "" {
		return "", fmt.Errorf("file is required")
	}
	if filepath.IsAbs(file) {
		return file, nil
	}
	if s.profilesDir == "" {
		return "", fmt.Errorf("profiles directory not configured")
	}
	basename := filepath.Base(file)
	if basename != file || strings.Contains(basename, "..") {
		return "", fmt.Errorf("invalid profile file")
	}
	if !strings.HasSuffix(basename, ".json") {
		basename += ".json"
	}
	path := filepath.Join(s.profilesDir, basename)
	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("profile not found: %s", basename)
	}
	return path, nil
}

// HandleSave decodes a correlated save request and emits saved/conflict/error.
func (s *StudioProfileService) HandleSave(data any) {
	requestID, expectedRevision, doc, err := decodeStudioProfileSavePayload(data)
	if err != nil {
		s.emitError(requestID, "save", err)
		return
	}
	_ = s.Save(requestID, expectedRevision, doc)
}

// EmitLoaded emits studio:profile:loaded for the current in-memory document.
func (s *StudioProfileService) EmitLoaded(requestID string) {
	if s.emitter == nil || s.loaded == nil {
		return
	}
	s.emitter.Emit("studio:profile:loaded", map[string]any{
		"requestId":    requestID,
		"document":     s.loaded.Document,
		"revision":     s.loaded.Revision,
		"migratedFrom": s.loaded.MigratedFrom,
	})
}

func decodeStudioProfileLoadPayload(data any) (requestID, file string, err error) {
	if data == nil {
		return "", "", fmt.Errorf("missing load payload")
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return "", "", fmt.Errorf("encoding load payload: %w", err)
	}
	var payload struct {
		RequestID string `json:"requestId"`
		File      string `json:"file"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", "", fmt.Errorf("decoding load payload: %w", err)
	}
	if strings.TrimSpace(payload.File) == "" {
		return payload.RequestID, "", fmt.Errorf("file is required")
	}
	return payload.RequestID, payload.File, nil
}

func decodeStudioProfileSavePayload(data any) (requestID, expectedRevision string, doc *config.ProfileDocumentV3, err error) {
	if data == nil {
		return "", "", nil, fmt.Errorf("missing save payload")
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return "", "", nil, fmt.Errorf("encoding save payload: %w", err)
	}
	var payload struct {
		RequestID        string          `json:"requestId"`
		ExpectedRevision string          `json:"expectedRevision"`
		Document         json.RawMessage `json:"document"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", "", nil, fmt.Errorf("decoding save payload: %w", err)
	}
	if len(payload.Document) == 0 || string(payload.Document) == "null" {
		return payload.RequestID, "", nil, fmt.Errorf("document is required")
	}
	var parsed config.ProfileDocumentV3
	if err := json.Unmarshal(payload.Document, &parsed); err != nil {
		return payload.RequestID, "", nil, fmt.Errorf("decoding document: %w", err)
	}
	normalized := config.NormalizeProfileDocumentV3(&parsed)
	if err := config.ValidateProfileDocumentV3(normalized); err != nil {
		return payload.RequestID, "", nil, err
	}
	return payload.RequestID, payload.ExpectedRevision, normalized, nil
}

func (s *StudioProfileService) emitConflict(requestID string, err error) {
	s.logFailure("conflict", requestID, err)
	if s.emitter == nil {
		return
	}
	s.emitter.Emit("studio:profile:conflict", map[string]any{
		"requestId": requestID,
		"message":   err.Error(),
	})
}

func (s *StudioProfileService) emitError(requestID, operation string, err error) {
	s.logFailure(operation, requestID, err)
	if s.emitter == nil || err == nil {
		return
	}
	s.emitter.Emit("studio:profile:error", map[string]any{
		"requestId": requestID,
		"operation": operation,
		"message":   err.Error(),
	})
}

func (s *StudioProfileService) logFailure(operation, requestID string, err error) {
	if s.logger == nil || err == nil {
		return
	}
	profileID := ""
	expectedRevisionSet := false
	if s.loaded != nil && s.loaded.Document != nil {
		profileID = s.loaded.Document.ID
		expectedRevisionSet = s.loaded.Revision != ""
	}
	s.logger.Warn("studio profile operation failed",
		"operation", operation,
		"requestId", requestID,
		"profileId", profileID,
		"expectedRevisionSet", expectedRevisionSet,
	)
}
