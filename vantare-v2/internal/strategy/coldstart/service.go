package coldstart

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
	"sync"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type Decision string

const (
	DecisionPending  Decision = "pending"
	DecisionAccepted Decision = "accepted"
	DecisionRejected Decision = "rejected"
)

type Status struct {
	ShouldShow bool     `json:"shouldShow"`
	Found      int      `json:"found"`
	Imported   int      `json:"imported"`
	Decision   Decision `json:"decision"`
}

type Progress struct {
	Imported int  `json:"imported"`
	Total    int  `json:"total"`
	Done     bool `json:"done"`
}

type SessionImporter interface {
	Import(context.Context, telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedSessionModel, error)
}

type SessionStore interface {
	telemetryanalysis.AuthorizedSessionSource
	Add(context.Context, telemetryanalysis.AuthorizedSessionModel) error
}

type DiscoverFunc func(context.Context) ([]telemetryanalysis.Candidate, error)

type ServiceOptions struct {
	StatePath string
	Discover  DiscoverFunc
	Importer  SessionImporter
	Store     SessionStore
}

type Service struct {
	mu         sync.Mutex
	options    ServiceOptions
	candidates []telemetryanalysis.Candidate
}

type persistedState struct {
	Decision         Decision `json:"decision"`
	ImportedLocators []string `json:"importedLocators"`
}

func NewService(options ServiceOptions) *Service {
	return &Service{options: options}
}

func (service *Service) Status(ctx context.Context) (Status, error) {
	// Defensa ante un receptor nulo: si el arranque no pudo construir el
	// servicio, el arranque en frío queda pendiente en vez de romper la app.
	if service == nil {
		return Status{Decision: DecisionPending}, nil
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	state, err := service.readState()
	if err != nil {
		return Status{}, err
	}
	if state.Decision == DecisionAccepted || state.Decision == DecisionRejected {
		return Status{Decision: state.Decision, Imported: len(state.ImportedLocators)}, nil
	}
	if service.options.Discover == nil || service.options.Importer == nil || service.options.Store == nil {
		return Status{Decision: DecisionPending}, nil
	}
	if service.candidates == nil {
		service.candidates, err = service.options.Discover(ctx)
		if err != nil {
			return Status{}, err
		}
		sort.Slice(service.candidates, func(i, j int) bool { return service.candidates[i].Locator < service.candidates[j].Locator })
	}
	return Status{ShouldShow: len(service.candidates) > 0, Found: len(service.candidates), Imported: len(state.ImportedLocators), Decision: DecisionPending}, nil
}

func (service *Service) ImportNext(ctx context.Context) (Progress, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	state, err := service.readState()
	if err != nil {
		return Progress{}, err
	}
	if state.Decision == DecisionRejected {
		return Progress{}, fmt.Errorf("cold start import was rejected")
	}
	if service.candidates == nil {
		if service.options.Discover == nil {
			return Progress{}, fmt.Errorf("cold start discovery unavailable")
		}
		service.candidates, err = service.options.Discover(ctx)
		if err != nil {
			return Progress{}, err
		}
		sort.Slice(service.candidates, func(i, j int) bool { return service.candidates[i].Locator < service.candidates[j].Locator })
	}
	imported := make(map[string]struct{}, len(state.ImportedLocators))
	for _, locator := range state.ImportedLocators {
		imported[locator] = struct{}{}
	}
	for _, candidate := range service.candidates {
		if _, exists := imported[candidate.Locator]; exists {
			continue
		}
		model, importErr := service.options.Importer.Import(ctx, candidate)
		if importErr != nil {
			return Progress{}, importErr
		}
		if err := service.options.Store.Add(ctx, model); err != nil {
			return Progress{}, err
		}
		state.ImportedLocators = append(state.ImportedLocators, candidate.Locator)
		if len(state.ImportedLocators) == len(service.candidates) {
			state.Decision = DecisionAccepted
		}
		if err := service.writeState(state); err != nil {
			return Progress{}, err
		}
		return Progress{Imported: len(state.ImportedLocators), Total: len(service.candidates), Done: state.Decision == DecisionAccepted}, nil
	}
	state.Decision = DecisionAccepted
	if err := service.writeState(state); err != nil {
		return Progress{}, err
	}
	return Progress{Imported: len(state.ImportedLocators), Total: len(service.candidates), Done: true}, nil
}

func (service *Service) Reject(_ context.Context) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	state, err := service.readState()
	if err != nil {
		return err
	}
	if state.Decision == DecisionAccepted {
		return nil
	}
	state.Decision = DecisionRejected
	return service.writeState(state)
}

func (service *Service) readState() (persistedState, error) {
	data, err := os.ReadFile(service.options.StatePath)
	if errors.Is(err, os.ErrNotExist) {
		return persistedState{Decision: DecisionPending, ImportedLocators: []string{}}, nil
	}
	if err != nil {
		return persistedState{}, fmt.Errorf("read cold start state: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var state persistedState
	if err := decoder.Decode(&state); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return persistedState{}, fmt.Errorf("decode cold start state")
	}
	if state.Decision != DecisionPending && state.Decision != DecisionAccepted && state.Decision != DecisionRejected {
		return persistedState{}, fmt.Errorf("invalid cold start decision")
	}
	if state.ImportedLocators == nil {
		state.ImportedLocators = []string{}
	}
	return state, nil
}

func (service *Service) writeState(state persistedState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("encode cold start state: %w", err)
	}
	directory := filepath.Dir(service.options.StatePath)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create cold start state directory: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".strategy-cold-start-*.tmp")
	if err != nil {
		return fmt.Errorf("create cold start temporary: %w", err)
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
	if err := os.Rename(temporaryPath, service.options.StatePath); err != nil {
		return fmt.Errorf("replace cold start state: %w", err)
	}
	return nil
}
