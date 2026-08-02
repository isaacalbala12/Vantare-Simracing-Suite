package application

import (
	"regexp"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
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

type Result[T any] struct {
	ProtocolVersion     string                    `json:"protocolVersion"`
	CommandID           CommandID                 `json:"commandId"`
	RepositoryVersion   uint64                    `json:"repositoryVersion"`
	Draft               *contract.PlanDraft[T]    `json:"draft,omitempty"`
	SavedDraft          *contract.PlanDraft[T]    `json:"savedDraft,omitempty"`
	Revision            *contract.PlanRevision[T] `json:"revision,omitempty"`
	ActivePlan          *contract.ActivePlan      `json:"activePlan,omitempty"`
	RecoveredFromBackup bool                      `json:"recoveredFromBackup"`
	Closed              bool                      `json:"closed"`
}
