// Package contract defines the pure, versioned Testing Center contract.
// It performs no I/O, persistence, networking, or external side effects.
package contract

type ContractVersion string

const CurrentVersion ContractVersion = "testing-center.v1"

type Role string

const (
	RoleTester        Role = "tester"
	RolePrimaryTester Role = "primary_tester"
	RoleOwner         Role = "owner"
)

type Channel string

const (
	ChannelNightly Channel = "nightly"
	ChannelTesters Channel = "testers"
	ChannelMaster  Channel = "master"
)

type Origin string

const (
	OriginTestingCenter Origin = "testing_center"
	OriginOrchestrator  Origin = "orchestrator"
	OriginCodex         Origin = "codex"
	OriginGitHubActions Origin = "github_actions"
)

// Actor is a server-verified principal. Its fields are deliberately private so
// JSON supplied by a client cannot self-assert a role, origin, or automation
// status. Callers must construct it through NewHumanActor or
// NewAutomatedActor after authenticating the principal.
type Actor struct {
	id        string
	role      Role
	origin    Origin
	automated bool
}

type ReportState string

const (
	ReportDraft           ReportState = "draft"
	ReportSubmitted       ReportState = "submitted"
	ReportValidated       ReportState = "validated"
	ReportDuplicateLinked ReportState = "duplicate_linked"
	ReportIncomplete      ReportState = "incomplete"
	ReportClosed          ReportState = "closed"
)

type Report struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	ReportID        string          `json:"reportId"`
	ReporterID      string          `json:"reporterId"`
	Channel         Channel         `json:"channel"`
	State           ReportState     `json:"state"`
}

type EvidenceKind string

const (
	EvidenceReportContext EvidenceKind = "report_context"
	EvidenceDiagnostic    EvidenceKind = "diagnostic"
	EvidenceReproduction  EvidenceKind = "reproduction"
)

type Evidence struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	EvidenceID      string          `json:"evidenceId"`
	ReportID        string          `json:"reportId"`
	Kind            EvidenceKind    `json:"kind"`
	Digest          string          `json:"digest"`
}

type TechnicalIssueState string

const (
	TechnicalIssueOpen       TechnicalIssueState = "open"
	TechnicalIssueNeedsOwner TechnicalIssueState = "needs_owner"
	TechnicalIssueClosed     TechnicalIssueState = "closed"
)

type TechnicalIssue struct {
	ContractVersion  ContractVersion     `json:"contractVersion"`
	TechnicalIssueID string              `json:"technicalIssueId"`
	ReportID         string              `json:"reportId"`
	State            TechnicalIssueState `json:"state"`
}

type CodexRunState string

const (
	CodexRunQueued  CodexRunState = "queued"
	CodexRunRunning CodexRunState = "running"
	CodexRunPROpen  CodexRunState = "pr_open"
	CodexRunFailed  CodexRunState = "failed"
)

type CodexRun struct {
	ContractVersion  ContractVersion `json:"contractVersion"`
	RunID            string          `json:"runId"`
	TechnicalIssueID string          `json:"technicalIssueId"`
	Attempt          uint8           `json:"attempt"`
	State            CodexRunState   `json:"state"`
}

type CandidateState string

const (
	CandidatePending  CandidateState = "pending"
	CandidateAccepted CandidateState = "accepted"
	CandidateRejected CandidateState = "rejected"
	CandidateStale    CandidateState = "stale"
)

type CandidateBuild struct {
	ContractVersion  ContractVersion `json:"contractVersion"`
	CandidateID      string          `json:"candidateId"`
	TechnicalIssueID string          `json:"technicalIssueId"`
	Channel          Channel         `json:"channel"`
	BuildVersion     string          `json:"buildVersion"`
	ExactSHA         string          `json:"exactSha"`
	AuthorID         string          `json:"authorId"`
	State            CandidateState  `json:"state"`
}

type ValidationDecision string

const (
	ValidationAccepted     ValidationDecision = "accepted"
	ValidationRejected     ValidationDecision = "rejected"
	ValidationCannotVerify ValidationDecision = "cannot_verify"
)

type RejectionReason string

const (
	RejectionIssuePersists     RejectionReason = "issue_persists"
	RejectionNewRegression     RejectionReason = "new_regression"
	RejectionCrash             RejectionReason = "crash"
	RejectionDifferentBehavior RejectionReason = "different_behavior"
	RejectionOther             RejectionReason = "other"
)

type Validation struct {
	ContractVersion   ContractVersion    `json:"contractVersion"`
	ValidationID      string             `json:"validationId"`
	CandidateID       string             `json:"candidateId"`
	Channel           Channel            `json:"channel"`
	ExactSHA          string             `json:"exactSha"`
	CandidateAuthorID string             `json:"candidateAuthorId"`
	Decision          ValidationDecision `json:"decision"`
	ActorID           string             `json:"actorId"`
	RejectionReason   RejectionReason    `json:"rejectionReason,omitempty"`
}

func (validation Validation) IsStale(currentSHA string) bool {
	return validation.ExactSHA != currentSHA
}

type PromotionState string

const (
	PromotionPending    PromotionState = "pending"
	PromotionAuthorized PromotionState = "authorized"
	PromotionCompleted  PromotionState = "completed"
	PromotionBlocked    PromotionState = "blocked"
)

type Promotion struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	PromotionID     string          `json:"promotionId"`
	CandidateID     string          `json:"candidateId"`
	FromChannel     Channel         `json:"fromChannel"`
	ToChannel       Channel         `json:"toChannel"`
	ExactSHA        string          `json:"exactSha"`
	ValidatedSHA    string          `json:"validatedSha"`
	State           PromotionState  `json:"state"`
	AuthorizedByID  string          `json:"authorizedById,omitempty"`
}
