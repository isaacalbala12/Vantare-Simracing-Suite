package coldstart

import (
	"context"
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

var errCatalogReconciliation = errors.New("catalog reconciliation unavailable")

// The authorized store is the authority for completed imports. Discovery
// alone never grants permission or proves that a session was imported.
func (service *Service) readReconciledState(ctx context.Context) (persistedState, map[string]struct{}, error) {
	if err := ctx.Err(); err != nil {
		return persistedState{}, nil, err
	}
	state, err := service.readState()
	if err != nil || state.Decision == DecisionRejected {
		return state, nil, err
	}
	stored := make(map[string]struct{})
	if service.options.Store == nil {
		if len(state.ImportedLocators) > 0 {
			return state, nil, errCatalogReconciliation
		}
		return state, stored, nil
	}
	models, err := service.options.Store.ListAuthorizedSessions(ctx)
	if err != nil {
		return state, nil, fmt.Errorf("%w: %w", errCatalogReconciliation, err)
	}
	for _, model := range models {
		// Production stores verify this source against the authorized artifact.
		if locator := model.Session.Provenance.Source.Locator; locator != "" {
			stored[locator] = struct{}{}
		}
	}
	retained := make([]string, 0, len(state.ImportedLocators))
	seen := make(map[string]bool)
	failed := make(map[string]bool)
	for _, failure := range state.Failures {
		failed[failure.Locator] = true
	}
	changed := false
	for _, locator := range state.ImportedLocators {
		if _, present := stored[locator]; present && !seen[locator] {
			retained = append(retained, locator)
			seen[locator] = true
			continue
		}
		changed = true
		if !seen[locator] && !failed[locator] {
			state.Failures = append(state.Failures, Failure{Locator: locator, Reason: "catalog_entry_missing"})
			failed[locator] = true
		}
	}
	remainingFailures := make([]Failure, 0, len(state.Failures))
	for _, failure := range state.Failures {
		if _, present := stored[failure.Locator]; !present {
			remainingFailures = append(remainingFailures, failure)
			continue
		}
		changed = true
		if !seen[failure.Locator] {
			retained = append(retained, failure.Locator)
			seen[failure.Locator] = true
		}
	}
	state.ImportedLocators = retained
	state.Failures = remainingFailures
	if changed {
		if err := ctx.Err(); err != nil {
			return state, stored, err
		}
		if err := service.writeState(state); err != nil {
			return state, stored, err
		}
	}
	return state, stored, nil
}

// Retained authorized sessions may no longer be in the current directory.
// Count their union with discovery; completion depends on candidate identities.
func importCompletion(state persistedState, candidates []telemetryanalysis.Candidate) (int, Decision) {
	processed := make(map[string]bool)
	for _, locator := range state.ImportedLocators {
		processed[locator] = true
	}
	for _, failure := range state.Failures {
		processed[failure.Locator] = true
	}
	decision := DecisionAccepted
	total := len(processed)
	for _, candidate := range candidates {
		if !processed[candidate.Locator] {
			decision = DecisionPending
			total++
		}
	}
	return total, decision
}
