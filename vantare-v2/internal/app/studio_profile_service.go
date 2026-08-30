package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"

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
	deltaCycleMu         sync.Mutex
	operationMu          sync.Mutex
	stateMu              sync.RWMutex
	path                 string
	loaded               *config.LoadedProfileV3
	autosaveBaseRevision string
	store                config.ProfileDocumentStore
	emitter              EventEmitter
	logger               *slog.Logger
	onSaved              func(StudioProfileSaved)
	onPerformanceSaved   func(*config.ProfileDocumentV4)
	performanceSaves     *PerformanceSaveCoordinator
	// beforePersist is an internal synchronization seam for deterministic
	// concurrency tests. Production constructors leave it nil.
	beforePersist func(string)
	profilesDir   string
	mgr           *window.Manager
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
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	loaded, err := s.store.Load(path)
	if err != nil {
		return nil, err
	}
	s.stateMu.Lock()
	s.path = path
	s.loaded = loaded
	s.autosaveBaseRevision = ""
	s.stateMu.Unlock()
	for _, notice := range loaded.MigrationNotices {
		s.logger.Warn("studio profile v3 migration discarded atypical updateHz",
			"profile", path,
			"path", notice.Path,
			"widgetId", notice.WidgetID,
			"widgetType", notice.WidgetType,
			"updateHz", notice.UpdateHz,
		)
	}
	return loaded, nil
}

// Save persists the supplied document using optimistic revision checks and
// notifies the runtime refresh callback (which recreates the desktop window).
func (s *StudioProfileService) Save(requestID, expectedRevision string, doc *config.ProfileDocumentV3) error {
	return s.savePath(requestID, s.Path(), expectedRevision, doc, true)
}

// SaveInPlace persists the supplied document using optimistic revision checks
// WITHOUT invoking the onSaved callback: the edit-mode overlay saves the layout
// without recreating its own window. The studio:profile:saved event is emitted
// with the requestID so the overlay can update its local revision.
func (s *StudioProfileService) SaveInPlace(requestID, expectedRevision string, doc *config.ProfileDocumentV3) error {
	return s.savePath(requestID, s.Path(), expectedRevision, doc, false)
}

func (s *StudioProfileService) savePath(requestID, path, expectedRevision string, doc *config.ProfileDocumentV3, notifySaved bool) error {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	if path == "" {
		err := fmt.Errorf("profile path not configured")
		s.emitError(requestID, "save", err)
		return err
	}
	migratedFrom := config.ProfileSchemaVersionV3
	var currentV4 *config.ProfileDocumentV4
	saveRevision := expectedRevision
	s.stateMu.RLock()
	activePath := s.path
	activeLoaded := s.loaded
	autosaveBaseRevision := s.autosaveBaseRevision
	onSaved := s.onSaved
	s.stateMu.RUnlock()
	if path == activePath && activeLoaded != nil {
		migratedFrom = activeLoaded.MigratedFrom
		currentV4 = activeLoaded.DocumentV4
		// A confirmed in-process performance save may advance the revision while
		// an autosave request is waiting on operationMu. Rebase that autosave on
		// the current in-memory revision; an external disk edit still conflicts
		// because activeLoaded keeps the caller's expected revision.
		if expectedRevision != "" && expectedRevision == autosaveBaseRevision && expectedRevision != activeLoaded.Revision {
			saveRevision = activeLoaded.Revision
		}
	} else {
		loaded, err := s.store.LoadV4(path)
		if err != nil {
			s.emitError(requestID, "save", err)
			return err
		}
		migratedFrom = loaded.MigratedFrom
		currentV4 = loaded.Document
	}
	updatedV4 := config.ConvertProfileV3ToV4(doc)
	if currentV4 != nil {
		updatedV4.Performance = config.NormalizeProfileDocumentV4(currentV4).Performance
	}
	revision, err := s.store.SaveV4(path, saveRevision, updatedV4, migratedFrom)
	if err != nil {
		if errors.Is(err, config.ErrProfileConflict) {
			s.emitConflict(requestID, err)
			return err
		}
		s.emitError(requestID, "save", err)
		return err
	}
	savedDocument := config.NormalizeProfileDocumentV3(doc)
	savedV4 := config.NormalizeProfileDocumentV4(updatedV4)
	loaded := &config.LoadedProfileV3{
		Document:     savedDocument,
		DocumentV4:   savedV4,
		Revision:     revision,
		MigratedFrom: config.ProfileSchemaVersionV4,
	}
	// Un save del editor queda ligado al archivo que cargo esa sesion. Si el
	// perfil activo global cambio entretanto, se persiste el archivo correcto
	// sin reemplazar el documento runtime que ahora pertenece al otro perfil.
	if path == activePath {
		s.stateMu.Lock()
		s.loaded = loaded
		s.autosaveBaseRevision = ""
		s.stateMu.Unlock()
	}
	payload := map[string]any{
		"requestId": requestID,
		"document":  savedDocument,
		"revision":  revision,
	}
	if s.emitter != nil {
		s.emitter.Emit("studio:profile:saved", payload)
	}
	if notifySaved && onSaved != nil {
		onSaved(StudioProfileSaved{
			Path:     path,
			Document: savedDocument,
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
	app.Event.On("overlay:edit-layout:save", func(event *application.CustomEvent) {
		s.HandleSaveInPlace(event.Data)
	})
	app.Event.On("studio:profile:performance:save", func(event *application.CustomEvent) {
		s.HandlePerformanceSave(event.Data)
	})
}

// HandlePerformanceSave updates only the active profile's V4 performance
// policy. Layout/content remain byte-for-byte equivalent after normalization.
func (s *StudioProfileService) HandlePerformanceSave(data any) {
	var payload struct {
		RequestID   string                       `json:"requestId"`
		Performance *config.ProfilePerformanceV4 `json:"performance"`
	}
	raw, err := json.Marshal(data)
	if err != nil || json.Unmarshal(raw, &payload) != nil {
		s.emitError(payload.RequestID, "performance-save", fmt.Errorf("invalid performance payload"))
		return
	}
	var doc *config.ProfileDocumentV4
	var revision string
	persist := func() error {
		var persistErr error
		doc, revision, persistErr = s.savePerformance(payload.Performance)
		return persistErr
	}
	s.stateMu.RLock()
	coordinator := s.performanceSaves
	s.stateMu.RUnlock()
	var saveErr error
	if coordinator != nil {
		_, _, saveErr = coordinator.Execute(persist)
	} else {
		saveErr = persist()
	}
	if saveErr != nil {
		if errors.Is(saveErr, config.ErrProfileConflict) {
			s.emitConflict(payload.RequestID, saveErr)
		} else {
			s.emitError(payload.RequestID, "performance-save", saveErr)
		}
		return
	}
	if s.emitter != nil {
		s.emitter.Emit("studio:profile:performance:saved", map[string]any{
			"requestId": payload.RequestID, "performance": doc.Performance, "revision": revision,
		})
		s.emitter.Emit("hub:profiles:refresh", map[string]any{"ok": true})
	}
	s.stateMu.RLock()
	onPerformanceSaved := s.onPerformanceSaved
	s.stateMu.RUnlock()
	if onPerformanceSaved != nil {
		onPerformanceSaved(doc)
	}
}

func (s *StudioProfileService) savePerformance(performance *config.ProfilePerformanceV4) (*config.ProfileDocumentV4, string, error) {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	if s.beforePersist != nil {
		s.beforePersist("performance")
	}
	s.stateMu.RLock()
	path := s.path
	loaded := s.loaded
	s.stateMu.RUnlock()
	if loaded == nil || loaded.DocumentV4 == nil || path == "" {
		return nil, "", fmt.Errorf("profile not loaded")
	}
	doc := config.NormalizeProfileDocumentV4(loaded.DocumentV4)
	doc.Performance = performance
	if err := config.ValidateProfileDocumentV4(doc); err != nil {
		return nil, "", err
	}
	revision, err := s.store.SaveV4(path, loaded.Revision, doc, loaded.MigratedFrom)
	if err != nil {
		return nil, "", err
	}
	legacy := config.ConvertProfileV4ToV3(doc)
	s.stateMu.Lock()
	s.autosaveBaseRevision = loaded.Revision
	s.loaded = &config.LoadedProfileV3{
		Document: legacy, DocumentV4: doc, Revision: revision,
		MigratedFrom: config.ProfileSchemaVersionV4,
	}
	s.stateMu.Unlock()
	return doc, revision, nil
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
	s.stateMu.RLock()
	profilesDir := s.profilesDir
	s.stateMu.RUnlock()
	if profilesDir == "" {
		return "", fmt.Errorf("profiles directory not configured")
	}
	basename := filepath.Base(file)
	if basename != file || strings.Contains(basename, "..") {
		return "", fmt.Errorf("invalid profile file")
	}
	if !strings.HasSuffix(basename, ".json") {
		basename += ".json"
	}
	path := filepath.Join(profilesDir, basename)
	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("profile not found: %s", basename)
	}
	return path, nil
}

// HandleSave decodes a correlated save request and emits saved/conflict/error.
func (s *StudioProfileService) HandleSave(data any) {
	requestID, file, expectedRevision, doc, err := decodeStudioProfileSavePayload(data)
	if err != nil {
		s.emitError(requestID, "save", err)
		return
	}
	path, err := s.resolveProfilePath(file)
	if err != nil {
		s.emitError(requestID, "save", err)
		return
	}
	_ = s.savePath(requestID, path, expectedRevision, doc, true)
}

// HandleSaveInPlace decodes a correlated in-place save request (edit-mode
// overlay) and persists without recreating the desktop window.
func (s *StudioProfileService) HandleSaveInPlace(data any) {
	requestID, _, expectedRevision, doc, err := decodeStudioProfileSavePayload(data)
	if err != nil {
		s.emitError(requestID, "save", err)
		return
	}
	_ = s.SaveInPlace(requestID, expectedRevision, doc)
}

// EmitLoaded emits studio:profile:loaded for the current in-memory document.
func (s *StudioProfileService) EmitLoaded(requestID string) {
	s.stateMu.RLock()
	loaded := s.loaded
	s.stateMu.RUnlock()
	if s.emitter == nil || loaded == nil {
		return
	}
	s.emitter.Emit("studio:profile:loaded", map[string]any{
		"requestId":        requestID,
		"document":         loaded.Document,
		"revision":         loaded.Revision,
		"migratedFrom":     loaded.MigratedFrom,
		"migrationNotices": loaded.MigrationNotices,
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

func decodeStudioProfileSavePayload(data any) (requestID, file, expectedRevision string, doc *config.ProfileDocumentV3, err error) {
	if data == nil {
		return "", "", "", nil, fmt.Errorf("missing save payload")
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return "", "", "", nil, fmt.Errorf("encoding save payload: %w", err)
	}
	var payload struct {
		RequestID        string          `json:"requestId"`
		File             string          `json:"file"`
		ExpectedRevision string          `json:"expectedRevision"`
		Document         json.RawMessage `json:"document"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", "", "", nil, fmt.Errorf("decoding save payload: %w", err)
	}
	if len(payload.Document) == 0 || string(payload.Document) == "null" {
		return payload.RequestID, payload.File, "", nil, fmt.Errorf("document is required")
	}
	var parsed config.ProfileDocumentV3
	if err := json.Unmarshal(payload.Document, &parsed); err != nil {
		return payload.RequestID, payload.File, "", nil, fmt.Errorf("decoding document: %w", err)
	}
	normalized := config.NormalizeProfileDocumentV3(&parsed)
	if err := config.ValidateProfileDocumentV3(normalized); err != nil {
		return payload.RequestID, payload.File, "", nil, err
	}
	return payload.RequestID, payload.File, payload.ExpectedRevision, normalized, nil
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
	s.stateMu.RLock()
	loaded := s.loaded
	s.stateMu.RUnlock()
	if loaded != nil && loaded.Document != nil {
		profileID = loaded.Document.ID
		expectedRevisionSet = loaded.Revision != ""
	}
	s.logger.Warn("studio profile operation failed",
		"operation", operation,
		"requestId", requestID,
		"profileId", profileID,
		"expectedRevisionSet", expectedRevisionSet,
	)
}
