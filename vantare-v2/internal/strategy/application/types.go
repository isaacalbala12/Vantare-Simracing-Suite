package application

import (
	"regexp"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/packaging"
)

const ProtocolVersionV1 = "strategy.application.v1"

type CommandID string
type Operation string

const (
	OperationCreate       Operation = "create"
	OperationOpen         Operation = "open"
	OperationEdit         Operation = "edit"
	OperationSaveRevision Operation = "save_revision"
	OperationDuplicate    Operation = "duplicate"
	OperationActivate     Operation = "activate"
	OperationDeactivate   Operation = "deactivate"
	OperationRestore      Operation = "restore"
	OperationClose        Operation = "close"
	OperationList         Operation = "list"
	OperationExport       Operation = "export"
	OperationImport       Operation = "import"
)

var commandIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type CommandHeader struct {
	ProtocolVersion           string    `json:"protocolVersion"`
	CommandID                 CommandID `json:"commandId"`
	Operation                 Operation `json:"operation"`
	ExpectedRepositoryVersion uint64    `json:"expectedRepositoryVersion"`
}

type CreateCommand[T any] struct {
	CommandHeader
	Draft contract.PlanDraft[T] `json:"draft"`
}

type OpenCommand struct {
	CommandHeader
	DraftID contract.DraftID `json:"draftId"`
}

type EditCommand[T any] struct {
	CommandHeader
	Draft contract.PlanDraft[T] `json:"draft"`
}

type SaveRevisionCommand[T any] struct {
	CommandHeader
	Draft      contract.PlanDraft[T] `json:"draft"`
	RevisionID contract.RevisionID   `json:"revisionId"`
	CreatedAt  time.Time             `json:"createdAt"`
}

type DuplicateCommand[T any] struct {
	CommandHeader
	SourceDraft     contract.PlanDraft[T] `json:"sourceDraft"`
	TargetDraftID   contract.DraftID      `json:"targetDraftId"`
	TargetPlanID    contract.PlanID       `json:"targetPlanId"`
	TargetVariantID contract.VariantID    `json:"targetVariantId"`
	Name            string                `json:"name"`
	UpdatedAt       time.Time             `json:"updatedAt"`
}

type ActivateCommand struct {
	CommandHeader
	Revision     contract.RevisionRef  `json:"revision"`
	ActivationID contract.ActivationID `json:"activationId"`
	ActivatedAt  time.Time             `json:"activatedAt"`
	Current      *contract.ActivePlan  `json:"current,omitempty"`
}

type DeactivateCommand struct {
	CommandHeader
	Current              *contract.ActivePlan  `json:"current,omitempty"`
	ExpectedActivationID contract.ActivationID `json:"expectedActivationId"`
}

type RestoreCommand struct {
	CommandHeader
	DraftID contract.DraftID `json:"draftId"`
}

type CloseCommand[T any] struct {
	CommandHeader
	Draft      contract.PlanDraft[T] `json:"draft"`
	SavedDraft contract.PlanDraft[T] `json:"savedDraft"`
	Discard    bool                  `json:"discard"`
}

// ListCommand asks for the library. It reads and never writes, so it carries no
// expected version to check against.
type ListCommand struct {
	CommandHeader
}

// PlanSummary is what "My plans" needs to find and choose a plan. It carries no
// payload on purpose: a library view must not load the contents of every plan
// to draw a list of them.
type PlanSummary struct {
	PlanID    contract.PlanID    `json:"planId"`
	VariantID contract.VariantID `json:"variantId"`
	// DraftID is present only while the plan has unsaved work open.
	DraftID contract.DraftID  `json:"draftId,omitempty"`
	Name    string            `json:"name"`
	Mode    contract.PlanMode `json:"mode"`
	// UpdatedAt is the most recent activity, draft or revision.
	UpdatedAt     time.Time `json:"updatedAt"`
	HasDraft      bool      `json:"hasDraft"`
	RevisionCount int       `json:"revisionCount"`
	// LatestRevision identifies what would be opened or activated.
	LatestRevision   *contract.RevisionRef `json:"latestRevision,omitempty"`
	LatestRevisionAt *time.Time            `json:"latestRevisionAt,omitempty"`
}

// PlanSelector names one plan variant to export.
type PlanSelector struct {
	PlanID    contract.PlanID    `json:"planId"`
	VariantID contract.VariantID `json:"variantId"`
}

// ExportCommand asks for a package containing the selected plans. Exporting is
// explicit and local: the service returns the bytes, and writing them anywhere
// is the caller's decision, not this service's.
type ExportCommand struct {
	CommandHeader
	// Plans selects what to export. Empty is rejected rather than treated as
	// "everything": exporting more than intended is not a safe default.
	Plans      []PlanSelector       `json:"plans"`
	Provenance packaging.Provenance `json:"provenance"`
}

// ImportCommand offers a package. With DryRun set, the service reports what
// would happen and touches nothing; without it, the whole package is applied
// as one repository transaction or not at all.
type ImportCommand struct {
	CommandHeader
	Package []byte `json:"package"`
	DryRun  bool   `json:"dryRun"`
}

type Result[T any] struct {
	ProtocolVersion   string                    `json:"protocolVersion"`
	CommandID         CommandID                 `json:"commandId"`
	RepositoryVersion uint64                    `json:"repositoryVersion"`
	Draft             *contract.PlanDraft[T]    `json:"draft,omitempty"`
	SavedDraft        *contract.PlanDraft[T]    `json:"savedDraft,omitempty"`
	Revision          *contract.PlanRevision[T] `json:"revision,omitempty"`
	ActivePlan        *contract.ActivePlan      `json:"activePlan,omitempty"`
	Plans             []PlanSummary             `json:"plans,omitempty"`
	// Package carries exported bytes. Import returns no package.
	Package []byte `json:"package,omitempty"`
	// Preview is what an import would do. It is present on a dry run and on a
	// completed import, so the caller can report what actually happened.
	Preview             *packaging.Preview `json:"preview,omitempty"`
	Imported            bool               `json:"imported"`
	RecoveredFromBackup bool               `json:"recoveredFromBackup"`
	Closed              bool               `json:"closed"`
}
