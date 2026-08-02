package contract

type ContractManifest struct {
	ContractVersion        ContractVersion        `json:"contractVersion"`
	MaxSafeInteger         uint64                 `json:"maxSafeInteger"`
	CanonicalLimits        CanonicalLimits        `json:"canonicalLimits"`
	HashAlgorithms         []string               `json:"hashAlgorithms"`
	PlanModes              []PlanMode             `json:"planModes"`
	Capabilities           []Capability           `json:"capabilities"`
	ProvenanceKinds        []ProvenanceKind       `json:"provenanceKinds"`
	ConfidenceLevels       []ConfidenceLevel      `json:"confidenceLevels"`
	ExecutionStatuses      []ExecutionStatus      `json:"executionStatuses"`
	ReplanStatuses         []ReplanStatus         `json:"replanStatuses"`
	UnitNames              []string               `json:"unitNames"`
	ErrorCodes             []ErrorCode            `json:"errorCodes"`
	DocumentRequiredFields DocumentRequiredFields `json:"documentRequiredFields"`
}

type CanonicalLimits struct {
	MaxJSONBytes      int `json:"maxJsonBytes"`
	MaxOutputBytes    int `json:"maxOutputBytes"`
	MaxDepth          int `json:"maxDepth"`
	MaxContainerItems int `json:"maxContainerItems"`
}

type DocumentRequiredFields struct {
	PlanDraft      []string `json:"planDraft"`
	PlanRevision   []string `json:"planRevision"`
	ActivePlan     []string `json:"activePlan"`
	ExecutionState []string `json:"executionState"`
	ReplanProposal []string `json:"replanProposal"`
}

func ManifestV1() ContractManifest {
	return ContractManifest{
		ContractVersion: CurrentVersion,
		MaxSafeInteger:  maxSafeJSONInteger,
		CanonicalLimits: CanonicalLimits{
			MaxJSONBytes:      MaxCanonicalJSONBytes,
			MaxOutputBytes:    MaxCanonicalOutputBytes,
			MaxDepth:          MaxCanonicalDepth,
			MaxContainerItems: MaxCanonicalContainerItems,
		},
		HashAlgorithms:   []string{HashAlgorithmV1},
		PlanModes:        []PlanMode{PlanModeManual, PlanModeAssisted, PlanModeLive},
		Capabilities:     append([]Capability(nil), allCapabilities...),
		ProvenanceKinds:  []ProvenanceKind{ProvenanceUnknown, ProvenanceObserved, ProvenanceCorrected, ProvenanceManual, ProvenanceDerived, ProvenanceEstimated, ProvenanceRange},
		ConfidenceLevels: []ConfidenceLevel{ConfidenceUnknown, ConfidenceLow, ConfidenceMedium, ConfidenceHigh},
		ExecutionStatuses: []ExecutionStatus{
			ExecutionIdle, ExecutionMonitoring, ExecutionDeviated, ExecutionAwaitingDecision, ExecutionCompleted, ExecutionStopped,
		},
		ReplanStatuses: []ReplanStatus{ReplanProposed, ReplanAccepted, ReplanRejected, ReplanExpired, ReplanSuperseded},
		UnitNames: []string{
			"fuel_liters", "virtual_energy_percent", "duration_seconds", "lap_count", "distance_meters", "tyre_remaining_percent",
		},
		ErrorCodes: []ErrorCode{
			ErrorInvalidIdentifier, ErrorInvalidUnit, ErrorInvalidState, ErrorInvalidProvenance, ErrorInvalidConfidence,
			ErrorUnsupportedVersion, ErrorHashMismatch, ErrorRevisionConflict, ErrorProposalNotAccepted,
			ErrorProposalExpired, ErrorNonMonotonicSequence, ErrorIncompatibleUnits, ErrorInvalidDocument,
		},
		DocumentRequiredFields: DocumentRequiredFields{
			PlanDraft: []string{
				"contractVersion", "draftId", "planId", "variantId", "name", "mode", "capabilities",
				"provenance", "confidence", "updatedAt", "payload",
			},
			PlanRevision: []string{
				"contractVersion", "hashAlgorithm", "revisionId", "sourceDraftId", "planId", "variantId", "name", "mode", "capabilities",
				"provenance", "confidence", "createdAt", "payload", "contentHash",
			},
			ActivePlan: []string{
				"contractVersion", "activationId", "revision", "activatedAt",
			},
			ExecutionState: []string{
				"contractVersion", "executionId", "activePlan", "epoch", "sequence", "status", "capabilities",
				"provenance", "confidence", "updatedAt",
			},
			ReplanProposal: []string{
				"contractVersion", "proposalId", "base", "candidate", "status", "reasonCode", "provenance",
				"confidence", "createdAt",
			},
		},
	}
}
