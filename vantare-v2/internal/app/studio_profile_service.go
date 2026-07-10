package app

import (
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/pkg/config"
)

// StudioProfileSaved is delivered after a successful V3 profile save.
type StudioProfileSaved struct {
	Path     string
	Document *config.ProfileDocumentV3
	Revision string
}

// StudioProfileService manages Overlay Studio V3 profile documents in parallel to legacy ProfileService.
type StudioProfileService struct {
	path    string
	loaded  *config.LoadedProfileV3
	store   config.ProfileDocumentStore
	emitter EventEmitter
	onSaved func(StudioProfileSaved)
}

// NewStudioProfileService creates a parallel Studio profile service.
func NewStudioProfileService(emitter EventEmitter, onSaved func(StudioProfileSaved)) *StudioProfileService {
	return &StudioProfileService{
		store:   config.ProfileDocumentStore{},
		emitter: emitter,
		onSaved: onSaved,
	}
}

// Load reads a profile from disk without emitting events.
func (s *StudioProfileService) Load(path string) (*config.LoadedProfileV3, error) {
	loaded, err := s.store.Load(path)
	if err != nil {
		s.emitError("load", err)
		return nil, err
	}
	s.path = path
	s.loaded = loaded
	return loaded, nil
}

// Save persists the supplied document using optimistic revision checks.
func (s *StudioProfileService) Save(expectedRevision string, doc *config.ProfileDocumentV3) error {
	if s.path == "" {
		err := fmt.Errorf("profile path not configured")
		s.emitError("save", err)
		return err
	}
	migratedFrom := config.ProfileSchemaVersionV3
	if s.loaded != nil {
		migratedFrom = s.loaded.MigratedFrom
	}
	revision, err := s.store.Save(s.path, expectedRevision, doc, migratedFrom)
	if err != nil {
		if errors.Is(err, config.ErrProfileConflict) {
			s.emitConflict(err)
			return err
		}
		s.emitError("save", err)
		return err
	}
	s.loaded = &config.LoadedProfileV3{
		Document:     config.NormalizeProfileDocumentV3(doc),
		Revision:     revision,
		MigratedFrom: config.ProfileSchemaVersionV3,
	}
	payload := map[string]any{
		"document": s.loaded.Document,
		"revision": revision,
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

// EmitLoaded emits studio:profile:loaded for the current in-memory document.
func (s *StudioProfileService) EmitLoaded() {
	if s.emitter == nil || s.loaded == nil {
		return
	}
	s.emitter.Emit("studio:profile:loaded", map[string]any{
		"document":     s.loaded.Document,
		"revision":     s.loaded.Revision,
		"migratedFrom": s.loaded.MigratedFrom,
	})
}

func (s *StudioProfileService) emitConflict(err error) {
	if s.emitter == nil {
		return
	}
	s.emitter.Emit("studio:profile:conflict", map[string]any{
		"message": err.Error(),
	})
}

func (s *StudioProfileService) emitError(operation string, err error) {
	if s.emitter == nil || err == nil {
		return
	}
	s.emitter.Emit("studio:profile:error", map[string]any{
		"operation": operation,
		"message":   err.Error(),
	})
}
