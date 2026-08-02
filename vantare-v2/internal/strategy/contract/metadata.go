package contract

import (
	"regexp"
	"sort"
	"strings"
	"time"
)

type DraftID string
type PlanID string
type VariantID string
type RevisionID string
type ActivationID string
type ExecutionID string
type ProposalID string

var identifierPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

func validateIdentifier[T ~string](field string, value T) error {
	if !identifierPattern.MatchString(string(value)) {
		return contractError(ErrorInvalidIdentifier, field, "must be 1-128 safe identifier characters")
	}
	return nil
}

func validateTimestamp(field string, value time.Time) error {
	return validateCanonicalTimestamp(field, value)
}

type PlanMode string

const (
	PlanModeManual   PlanMode = "manual"
	PlanModeAssisted PlanMode = "assisted"
	PlanModeLive     PlanMode = "live"
)

func (mode PlanMode) validate() error {
	switch mode {
	case PlanModeManual, PlanModeAssisted, PlanModeLive:
		return nil
	default:
		return contractError(ErrorInvalidState, "mode", "unknown plan mode")
	}
}

type Capability string

const (
	CapabilityManualInputs    Capability = "manual_inputs"
	CapabilityTelemetryImport Capability = "telemetry_import"
	CapabilityLiveUpdates     Capability = "live_updates"
	CapabilityTyreInventory   Capability = "tyre_inventory"
	CapabilityFuel            Capability = "fuel_strategy"
	CapabilityVirtualEnergy   Capability = "virtual_energy_strategy"
	CapabilityPlanComparison  Capability = "plan_comparison"
	CapabilityReplan          Capability = "replan"
)

var allCapabilities = []Capability{
	CapabilityManualInputs,
	CapabilityTelemetryImport,
	CapabilityLiveUpdates,
	CapabilityTyreInventory,
	CapabilityFuel,
	CapabilityVirtualEnergy,
	CapabilityPlanComparison,
	CapabilityReplan,
}

func normalizeCapabilities(values []Capability) ([]Capability, error) {
	known := make(map[Capability]struct{}, len(allCapabilities))
	for _, value := range allCapabilities {
		known[value] = struct{}{}
	}
	unique := make(map[Capability]struct{}, len(values))
	for _, value := range values {
		if _, ok := known[value]; !ok {
			return nil, contractError(ErrorInvalidDocument, "capabilities", "unknown strategy capability")
		}
		unique[value] = struct{}{}
	}
	normalized := make([]Capability, 0, len(unique))
	for value := range unique {
		normalized = append(normalized, value)
	}
	sort.Slice(normalized, func(left, right int) bool { return normalized[left] < normalized[right] })
	return normalized, nil
}

type ProvenanceKind string

const (
	ProvenanceUnknown   ProvenanceKind = "unknown"
	ProvenanceObserved  ProvenanceKind = "observed"
	ProvenanceCorrected ProvenanceKind = "corrected"
	ProvenanceManual    ProvenanceKind = "manual"
	ProvenanceDerived   ProvenanceKind = "derived"
	ProvenanceEstimated ProvenanceKind = "estimated"
	ProvenanceRange     ProvenanceKind = "range"
)

type Provenance struct {
	Kind       ProvenanceKind `json:"kind"`
	SourceID   string         `json:"sourceId,omitempty"`
	ObservedAt *time.Time     `json:"observedAt,omitempty"`
}

func (value Provenance) validate() error {
	switch value.Kind {
	case ProvenanceUnknown:
		if value.SourceID != "" || value.ObservedAt != nil {
			return contractError(ErrorInvalidProvenance, "provenance", "unknown provenance cannot claim a source")
		}
		return nil
	case ProvenanceObserved, ProvenanceCorrected, ProvenanceManual, ProvenanceDerived, ProvenanceEstimated, ProvenanceRange:
		if strings.TrimSpace(value.SourceID) == "" {
			return contractError(ErrorInvalidProvenance, "provenance.sourceId", "source is required")
		}
		if value.ObservedAt != nil {
			return validateTimestamp("provenance.observedAt", *value.ObservedAt)
		}
		return nil
	default:
		return contractError(ErrorInvalidProvenance, "provenance.kind", "unknown provenance kind")
	}
}

// Validate exposes the canonical provenance rules to domain packages without
// making them duplicate the strategy.v1 contract.
func (value Provenance) Validate() error { return value.validate() }

type ConfidenceLevel string

const (
	ConfidenceUnknown ConfidenceLevel = "unknown"
	ConfidenceLow     ConfidenceLevel = "low"
	ConfidenceMedium  ConfidenceLevel = "medium"
	ConfidenceHigh    ConfidenceLevel = "high"
)

type Confidence struct {
	Level ConfidenceLevel `json:"level"`
	Basis string          `json:"basis,omitempty"`
}

func (value Confidence) validate() error {
	switch value.Level {
	case ConfidenceUnknown:
		if strings.TrimSpace(value.Basis) != "" {
			return contractError(ErrorInvalidConfidence, "confidence.basis", "unknown confidence cannot claim a basis")
		}
		return nil
	case ConfidenceLow, ConfidenceMedium, ConfidenceHigh:
		if strings.TrimSpace(value.Basis) == "" {
			return contractError(ErrorInvalidConfidence, "confidence.basis", "basis is required")
		}
		return nil
	default:
		return contractError(ErrorInvalidConfidence, "confidence.level", "unknown confidence level")
	}
}

// Validate exposes the canonical confidence rules to domain packages without
// making them duplicate the strategy.v1 contract.
func (value Confidence) Validate() error { return value.validate() }
