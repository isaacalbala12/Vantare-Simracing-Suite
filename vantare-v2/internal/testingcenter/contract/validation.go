package contract

import (
	"errors"
	"fmt"
	"strings"
)

const maxOpaqueValueBytes = 256

var (
	ErrUnsupportedVersion  = errors.New("testing center contract version is unsupported")
	ErrUnknownRole         = errors.New("testing center role is unknown")
	ErrUnknownChannel      = errors.New("testing center channel is unknown")
	ErrUnknownOrigin       = errors.New("testing center origin is unknown")
	ErrUnknownState        = errors.New("testing center state is unknown")
	ErrInvalidDocument     = errors.New("testing center document is invalid")
	ErrInvalidTransition   = errors.New("testing center transition is invalid")
	ErrPermissionDenied    = errors.New("testing center transition permission denied")
	ErrAutomatedValidation = errors.New("automated actors cannot issue human validation")
	ErrSelfValidation      = errors.New("candidate author cannot validate its own candidate")
	ErrStaleSHA            = errors.New("testing center candidate SHA is stale")
	ErrPaused              = errors.New("testing center automated flow is paused")
	ErrInvalidIdempotency  = errors.New("testing center idempotency data is invalid")
	ErrIdempotencyConflict = errors.New("testing center idempotency key conflicts with another digest")
)

func NewHumanActor(id string, role Role) (Actor, error) {
	actor := Actor{id: id, role: role, origin: OriginTestingCenter}
	if err := validateActor(actor); err != nil {
		return Actor{}, err
	}
	return actor, nil
}

func NewAutomatedActor(id string, origin Origin) (Actor, error) {
	actor := Actor{id: id, origin: origin, automated: true}
	if err := validateActor(actor); err != nil {
		return Actor{}, err
	}
	return actor, nil
}

func (actor Actor) ID() string      { return actor.id }
func (actor Actor) Role() Role      { return actor.role }
func (actor Actor) Origin() Origin  { return actor.origin }
func (actor Actor) Automated() bool { return actor.automated }

func (report Report) Validate() error {
	if err := validateVersion(report.ContractVersion); err != nil {
		return err
	}
	if err := validateID("reportId", report.ReportID); err != nil {
		return err
	}
	if err := validateID("reporterId", report.ReporterID); err != nil {
		return err
	}
	if report.Channel != ChannelNightly && report.Channel != ChannelTesters {
		return fmt.Errorf("channel: %w", ErrUnknownChannel)
	}
	switch report.State {
	case ReportDraft, ReportSubmitted, ReportValidated, ReportDuplicateLinked, ReportIncomplete, ReportClosed:
		return nil
	default:
		return fmt.Errorf("state: %w", ErrUnknownState)
	}
}

func (evidence Evidence) Validate() error {
	if err := validateVersion(evidence.ContractVersion); err != nil {
		return err
	}
	if err := validateID("evidenceId", evidence.EvidenceID); err != nil {
		return err
	}
	if err := validateID("reportId", evidence.ReportID); err != nil {
		return err
	}
	switch evidence.Kind {
	case EvidenceReportContext, EvidenceDiagnostic, EvidenceReproduction, EvidenceScreenshot:
	default:
		return fmt.Errorf("kind: %w", ErrUnknownState)
	}
	return validateDigest("digest", evidence.Digest)
}

func (issue TechnicalIssue) Validate() error {
	if err := validateVersion(issue.ContractVersion); err != nil {
		return err
	}
	if err := validateID("technicalIssueId", issue.TechnicalIssueID); err != nil {
		return err
	}
	if err := validateID("reportId", issue.ReportID); err != nil {
		return err
	}
	switch issue.State {
	case TechnicalIssueOpen, TechnicalIssueNeedsOwner, TechnicalIssueClosed:
		return nil
	default:
		return fmt.Errorf("state: %w", ErrUnknownState)
	}
}

func (run CodexRun) Validate() error {
	if err := validateVersion(run.ContractVersion); err != nil {
		return err
	}
	if err := validateID("runId", run.RunID); err != nil {
		return err
	}
	if err := validateID("technicalIssueId", run.TechnicalIssueID); err != nil {
		return err
	}
	if run.Attempt == 0 || run.Attempt > 2 {
		return fmt.Errorf("attempt: %w", ErrInvalidDocument)
	}
	switch run.State {
	case CodexRunQueued, CodexRunRunning, CodexRunPROpen, CodexRunFailed:
		return nil
	default:
		return fmt.Errorf("state: %w", ErrUnknownState)
	}
}

func (candidate CandidateBuild) Validate() error {
	if err := validateVersion(candidate.ContractVersion); err != nil {
		return err
	}
	if err := validateID("candidateId", candidate.CandidateID); err != nil {
		return err
	}
	if err := validateID("technicalIssueId", candidate.TechnicalIssueID); err != nil {
		return err
	}
	if candidate.Channel != ChannelNightly && candidate.Channel != ChannelTesters {
		return fmt.Errorf("channel: %w", ErrUnknownChannel)
	}
	if err := validateOpaque("buildVersion", candidate.BuildVersion); err != nil {
		return err
	}
	if err := validateSHA("exactSha", candidate.ExactSHA); err != nil {
		return err
	}
	if err := validateID("authorId", candidate.AuthorID); err != nil {
		return err
	}
	switch candidate.State {
	case CandidatePending, CandidateAccepted, CandidateRejected, CandidateStale:
		return nil
	default:
		return fmt.Errorf("state: %w", ErrUnknownState)
	}
}

func (validation Validation) Validate() error {
	if err := validateVersion(validation.ContractVersion); err != nil {
		return err
	}
	if err := validateID("validationId", validation.ValidationID); err != nil {
		return err
	}
	if err := validateID("candidateId", validation.CandidateID); err != nil {
		return err
	}
	if validation.Channel != ChannelNightly && validation.Channel != ChannelTesters {
		return fmt.Errorf("channel: %w", ErrUnknownChannel)
	}
	if err := validateSHA("exactSha", validation.ExactSHA); err != nil {
		return err
	}
	if err := validateID("candidateAuthorId", validation.CandidateAuthorID); err != nil {
		return err
	}
	if err := validateID("actorId", validation.ActorID); err != nil {
		return err
	}
	switch validation.Decision {
	case ValidationAccepted, ValidationCannotVerify:
		if validation.RejectionReason != "" {
			return fmt.Errorf("rejectionReason: %w", ErrInvalidDocument)
		}
		return nil
	case ValidationRejected:
		return validateRejectionReason(validation.RejectionReason)
	default:
		return fmt.Errorf("decision: %w", ErrUnknownState)
	}
}

func (candidate CandidateBuild) ValidateForAuthor(actor Actor) error {
	if err := candidate.Validate(); err != nil {
		return err
	}
	if err := validateActor(actor); err != nil {
		return err
	}
	if candidate.AuthorID != actor.id || !actor.automated || actor.origin != OriginCodex {
		return ErrPermissionDenied
	}
	return nil
}

func (validation Validation) ValidateForActor(actor Actor) error {
	if err := validation.Validate(); err != nil {
		return err
	}
	if err := validateActor(actor); err != nil {
		return err
	}
	if validation.ActorID != actor.id || validation.CandidateAuthorID == actor.id ||
		actor.automated || !canValidate(validation.Channel, actor.role) {
		return ErrPermissionDenied
	}
	return nil
}

func (promotion Promotion) ValidateForActor(actor Actor) error {
	if err := promotion.Validate(); err != nil {
		return err
	}
	if err := validateActor(actor); err != nil {
		return err
	}
	if promotion.AuthorizedByID != actor.id || actor.automated ||
		!canAuthorizePromotion(promotion.FromChannel, promotion.ToChannel, actor.role) {
		return ErrPermissionDenied
	}
	return nil
}

func (promotion Promotion) Validate() error {
	if err := validateVersion(promotion.ContractVersion); err != nil {
		return err
	}
	if err := validateID("promotionId", promotion.PromotionID); err != nil {
		return err
	}
	if err := validateID("candidateId", promotion.CandidateID); err != nil {
		return err
	}
	if err := validateChannel(promotion.FromChannel); err != nil {
		return fmt.Errorf("fromChannel: %w", err)
	}
	if err := validateChannel(promotion.ToChannel); err != nil {
		return fmt.Errorf("toChannel: %w", err)
	}
	validRoute := promotion.FromChannel == ChannelNightly && promotion.ToChannel == ChannelTesters
	validRoute = validRoute || promotion.FromChannel == ChannelTesters && promotion.ToChannel == ChannelMaster
	if !validRoute {
		return fmt.Errorf("promotion route: %w", ErrInvalidTransition)
	}
	if err := validateSHA("exactSha", promotion.ExactSHA); err != nil {
		return err
	}
	if err := validateSHA("validatedSha", promotion.ValidatedSHA); err != nil {
		return err
	}
	if promotion.ExactSHA != promotion.ValidatedSHA {
		return ErrStaleSHA
	}
	switch promotion.State {
	case PromotionPending, PromotionBlocked:
		if promotion.AuthorizedByID != "" {
			return fmt.Errorf("authorizedById: %w", ErrInvalidDocument)
		}
	case PromotionAuthorized, PromotionCompleted:
		if err := validateID("authorizedById", promotion.AuthorizedByID); err != nil {
			return err
		}
	default:
		return fmt.Errorf("state: %w", ErrUnknownState)
	}
	return nil
}

func validateVersion(version ContractVersion) error {
	if version != CurrentVersion {
		return ErrUnsupportedVersion
	}
	return nil
}

func validateRole(role Role) error {
	switch role {
	case RoleTester, RolePrimaryTester, RoleOwner:
		return nil
	default:
		return ErrUnknownRole
	}
}

func validateChannel(channel Channel) error {
	switch channel {
	case ChannelNightly, ChannelTesters, ChannelMaster:
		return nil
	default:
		return ErrUnknownChannel
	}
}

func validateOrigin(origin Origin) error {
	switch origin {
	case OriginTestingCenter, OriginOrchestrator, OriginCodex, OriginGitHubActions:
		return nil
	default:
		return ErrUnknownOrigin
	}
}

func validateActor(actor Actor) error {
	if err := validateID("actor.id", actor.id); err != nil {
		return err
	}
	if err := validateOrigin(actor.origin); err != nil {
		return err
	}
	if actor.automated {
		if actor.origin == OriginTestingCenter || actor.role != "" {
			return fmt.Errorf("actor origin/automation mismatch: %w", ErrInvalidDocument)
		}
		return nil
	}
	if actor.origin != OriginTestingCenter {
		return fmt.Errorf("actor origin/automation mismatch: %w", ErrInvalidDocument)
	}
	return validateRole(actor.role)
}

func validateID(field, value string) error {
	if strings.TrimSpace(value) == "" || strings.TrimSpace(value) != value || len(value) > maxOpaqueValueBytes || strings.ContainsRune(value, '\x00') {
		return fmt.Errorf("%s: %w", field, ErrInvalidDocument)
	}
	return nil
}

func validateOpaque(field, value string) error {
	return validateID(field, value)
}

func validateSHA(field, value string) error {
	if len(value) != 40 && len(value) != 64 {
		return fmt.Errorf("%s: %w", field, ErrInvalidDocument)
	}
	for _, character := range value {
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return fmt.Errorf("%s: %w", field, ErrInvalidDocument)
		}
	}
	return nil
}

func validateDigest(field, value string) error {
	if len(value) != 64 {
		return fmt.Errorf("%s: %w", field, ErrInvalidDocument)
	}
	for _, character := range value {
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return fmt.Errorf("%s: %w", field, ErrInvalidDocument)
		}
	}
	return nil
}

func validateRejectionReason(reason RejectionReason) error {
	switch reason {
	case RejectionIssuePersists, RejectionNewRegression, RejectionCrash, RejectionDifferentBehavior, RejectionOther:
		return nil
	default:
		return fmt.Errorf("rejectionReason: %w", ErrInvalidDocument)
	}
}

func canValidate(channel Channel, role Role) bool {
	switch channel {
	case ChannelNightly:
		return role == RolePrimaryTester || role == RoleOwner
	case ChannelTesters:
		return role == RoleTester || role == RolePrimaryTester || role == RoleOwner
	default:
		return false
	}
}

func canAuthorizePromotion(from, to Channel, role Role) bool {
	switch {
	case from == ChannelNightly && to == ChannelTesters:
		return role == RoleOwner
	case from == ChannelTesters && to == ChannelMaster:
		return role == RoleOwner
	default:
		return false
	}
}
