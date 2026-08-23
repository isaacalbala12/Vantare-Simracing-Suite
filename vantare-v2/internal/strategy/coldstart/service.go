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
	"strings"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type Decision string

const (
	defaultImportConcurrency = 4
	maximumImportConcurrency = 4
)

const (
	DecisionPending  Decision = "pending"
	DecisionAccepted Decision = "accepted"
	DecisionRejected Decision = "rejected"
)

type Status struct {
	ShouldShow bool      `json:"shouldShow"`
	Checking   bool      `json:"checking"`
	Found      int       `json:"found"`
	Imported   int       `json:"imported"`
	Skipped    int       `json:"skipped"`
	Failures   []Failure `json:"failures"`
	Decision   Decision  `json:"decision"`
}

type Progress struct {
	Imported int       `json:"imported"`
	Skipped  int       `json:"skipped"`
	Total    int       `json:"total"`
	Done     bool      `json:"done"`
	Failures []Failure `json:"failures"`
}

type Failure struct {
	Locator string `json:"locator"`
	Reason  string `json:"reason"`
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
	StatePath         string
	Discover          DiscoverFunc
	Importer          SessionImporter
	Store             SessionStore
	ImportConcurrency int
}

type Service struct {
	mu           sync.Mutex
	options      ServiceOptions
	candidates   []telemetryanalysis.Candidate
	discovering  bool
	discoveryErr error
}

type persistedState struct {
	Decision         Decision  `json:"decision"`
	ImportedLocators []string  `json:"importedLocators"`
	Failures         []Failure `json:"failures"`
	Total            int       `json:"total"`
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
	if state.Decision == DecisionRejected {
		return statusFromState(state, false, false), nil
	}
	if state.Decision == DecisionAccepted {
		return statusFromState(state, len(state.Failures) > 0, false), nil
	}
	if service.options.Discover == nil || service.options.Importer == nil || service.options.Store == nil {
		return Status{Decision: DecisionPending}, nil
	}
	if service.candidates == nil {
		if service.discoveryErr != nil {
			return Status{}, service.discoveryErr
		}
		if !service.discovering {
			service.startDiscovery()
		}
		return statusFromState(state, true, true), nil
	}
	state.Total = len(service.candidates)
	return statusFromState(state, len(service.candidates) > 0, false), nil
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
	if err := ctx.Err(); err != nil {
		return progressFromState(state), err
	}
	if service.candidates == nil {
		if service.options.Discover == nil {
			return Progress{}, fmt.Errorf("cold start discovery unavailable")
		}
		service.candidates, err = service.options.Discover(ctx)
		if err != nil {
			return Progress{}, err
		}
		sortCandidates(service.candidates)
	}
	state.Total = len(service.candidates)
	imported := make(map[string]struct{}, len(state.ImportedLocators))
	for _, locator := range state.ImportedLocators {
		imported[locator] = struct{}{}
	}
	failed := make(map[string]struct{}, len(state.Failures))
	for _, failure := range state.Failures {
		failed[failure.Locator] = struct{}{}
	}
	pending := make([]telemetryanalysis.Candidate, 0, service.importConcurrency())
	for _, candidate := range service.candidates {
		if _, exists := imported[candidate.Locator]; exists {
			continue
		}
		if _, exists := failed[candidate.Locator]; exists {
			continue
		}
		pending = append(pending, candidate)
		if len(pending) == cap(pending) {
			break
		}
	}
	if len(pending) > 0 {
		results := make([]candidateImportResult, len(pending))
		var wait sync.WaitGroup
		wait.Add(len(pending))
		for index, candidate := range pending {
			go func() {
				defer wait.Done()
				results[index].model, results[index].err = importCandidate(ctx, service.options.Importer, candidate)
			}()
		}
		wait.Wait()
		if err := ctx.Err(); err != nil {
			return progressFromState(state), err
		}
		for index, candidate := range pending {
			if err := ctx.Err(); err != nil {
				return progressFromState(state), err
			}
			importErr := results[index].err
			if importErr == nil {
				importErr = storeCandidate(ctx, service.options.Store, results[index].model)
			}
			if err := ctx.Err(); err != nil {
				return progressFromState(state), err
			}
			if importErr != nil {
				state.Failures = append(state.Failures, Failure{Locator: candidate.Locator, Reason: failureReason(importErr)})
			} else {
				state.ImportedLocators = append(state.ImportedLocators, candidate.Locator)
			}
		}
		if len(state.ImportedLocators)+len(state.Failures) == len(service.candidates) {
			state.Decision = DecisionAccepted
		}
		if err := ctx.Err(); err != nil {
			return progressFromState(state), err
		}
		if err := service.writeState(state); err != nil {
			return Progress{}, err
		}
		return progressFromState(state), nil
	}
	if err := ctx.Err(); err != nil {
		return progressFromState(state), err
	}
	state.Decision = DecisionAccepted
	if err := service.writeState(state); err != nil {
		return Progress{}, err
	}
	return progressFromState(state), nil
}

func (service *Service) RetryFailures(ctx context.Context) (Progress, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	state, err := service.readState()
	if err != nil {
		return Progress{}, err
	}
	if state.Decision == DecisionRejected {
		return Progress{}, fmt.Errorf("cold start import was rejected")
	}
	if err := ctx.Err(); err != nil {
		return progressFromState(state), err
	}
	if len(state.Failures) == 0 {
		return progressFromState(state), nil
	}
	state.Decision = DecisionPending
	state.Failures = []Failure{}
	if err := service.writeState(state); err != nil {
		return Progress{}, err
	}
	return progressFromState(state), nil
}

func (service *Service) importConcurrency() int {
	concurrency := service.options.ImportConcurrency
	if concurrency <= 0 {
		concurrency = defaultImportConcurrency
	}
	if concurrency > maximumImportConcurrency {
		concurrency = maximumImportConcurrency
	}
	return concurrency
}

type candidateImportResult struct {
	model telemetryanalysis.AuthorizedSessionModel
	err   error
}

func importCandidate(ctx context.Context, importer SessionImporter, candidate telemetryanalysis.Candidate) (model telemetryanalysis.AuthorizedSessionModel, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("import session panic: %v", recovered)
		}
	}()
	return importer.Import(ctx, candidate)
}

func storeCandidate(ctx context.Context, store SessionStore, model telemetryanalysis.AuthorizedSessionModel) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("import session panic: %v", recovered)
		}
	}()
	return store.Add(ctx, model)
}

func (service *Service) Reject(_ context.Context) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	state, err := service.readState()
	if err != nil {
		return err
	}
	state.Decision = DecisionRejected
	return service.writeState(state)
}

func (service *Service) startDiscovery() {
	service.discovering = true
	discover := service.options.Discover
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		candidates, err := discover(ctx)
		if err == nil {
			sortCandidates(candidates)
		}
		service.mu.Lock()
		defer service.mu.Unlock()
		service.discovering = false
		service.discoveryErr = err
		if err == nil {
			service.candidates = candidates
		}
	}()
}

// copyFailures nunca devuelve nil. `append([]Failure(nil))` sin elementos
// devuelve nil, y una lista nula viaja como `null` hasta la pantalla, que
// exige un array y descarta la respuesta entera: el arranque en frio parecia
// roto mientras el backend importaba correctamente.
func copyFailures(failures []Failure) []Failure {
	result := make([]Failure, len(failures))
	copy(result, failures)
	return result
}

func statusFromState(state persistedState, shouldShow, checking bool) Status {
	found := state.Total
	if found == 0 {
		found = len(state.ImportedLocators) + len(state.Failures)
	}
	return Status{ShouldShow: shouldShow, Checking: checking, Found: found, Imported: len(state.ImportedLocators), Skipped: len(state.Failures), Failures: copyFailures(state.Failures), Decision: state.Decision}
}

func progressFromState(state persistedState) Progress {
	return Progress{Imported: len(state.ImportedLocators), Skipped: len(state.Failures), Total: state.Total, Done: state.Decision == DecisionAccepted, Failures: copyFailures(state.Failures)}
}

func sortCandidates(candidates []telemetryanalysis.Candidate) {
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].Locator < candidates[j].Locator })
}

func failureReason(err error) string {
	reason := strings.TrimSpace(err.Error())
	const maxReasonBytes = 512
	if len(reason) > maxReasonBytes {
		reason = reason[:maxReasonBytes]
	}
	return reason
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
	if state.Failures == nil {
		state.Failures = []Failure{}
	}
	for _, failure := range state.Failures {
		if failure.Locator == "" || failure.Reason == "" {
			return persistedState{}, fmt.Errorf("invalid cold start failure")
		}
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
