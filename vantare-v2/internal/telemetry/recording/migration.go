package recording

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
)

var (
	ErrInvalidMigration       = errors.New("invalid historical recording migration")
	ErrMigrationPath          = errors.New("historical recording migration path is unavailable")
	ErrMigrationDowngrade     = errors.New("historical recording downgrade is not supported")
	ErrMigrationSourceChanged = errors.New("historical recording source changed during migration")
	ErrMigrationTargetChanged = errors.New("historical recording target changed during migration")
)

type MigrationStep struct {
	ID   string
	From Version
	To   Version
}

func (step MigrationStep) Validate() error {
	if !safeMigrationID(step.ID) ||
		step.From == 0 ||
		step.To != step.From+1 {
		return ErrInvalidMigration
	}
	return nil
}

type MigrationPlan struct {
	From   Version
	To     Version
	Steps  []MigrationStep
	Digest string
}

type MigrationRegistry struct {
	current Version
	steps   []MigrationStep
}

// CurrentMigrationRegistry is intentionally empty while recording schema v1
// is the only real schema. A concrete step is added only together with its
// successor schema and golden compatibility evidence.
func CurrentMigrationRegistry() (MigrationRegistry, error) {
	return NewMigrationRegistry(RecordingVersionV1, nil)
}

func NewMigrationRegistry(
	current Version,
	steps []MigrationStep,
) (MigrationRegistry, error) {
	if current == 0 {
		return MigrationRegistry{}, ErrInvalidMigration
	}
	owned := append([]MigrationStep(nil), steps...)
	ids := make(map[string]struct{}, len(owned))
	for index, step := range owned {
		if err := step.Validate(); err != nil {
			return MigrationRegistry{}, err
		}
		if _, duplicate := ids[step.ID]; duplicate {
			return MigrationRegistry{}, ErrInvalidMigration
		}
		ids[step.ID] = struct{}{}
		if index > 0 && step.From != owned[index-1].To {
			return MigrationRegistry{}, ErrInvalidMigration
		}
	}
	if len(owned) > 0 && owned[len(owned)-1].To != current {
		return MigrationRegistry{}, ErrInvalidMigration
	}
	return MigrationRegistry{current: current, steps: owned}, nil
}

func (registry MigrationRegistry) Plan(from, to Version) (MigrationPlan, error) {
	if from == 0 || to == 0 || from == to {
		return MigrationPlan{}, ErrInvalidMigration
	}
	if to < from {
		return MigrationPlan{}, ErrMigrationDowngrade
	}
	if to > registry.current {
		return MigrationPlan{}, ErrMigrationPath
	}
	var steps []MigrationStep
	next := from
	for _, step := range registry.steps {
		if step.From < next {
			continue
		}
		if step.From != next || step.To > to {
			break
		}
		steps = append(steps, step)
		next = step.To
		if next == to {
			break
		}
	}
	if next != to {
		return MigrationPlan{}, ErrMigrationPath
	}
	plan := MigrationPlan{From: from, To: to, Steps: steps}
	plan.Digest = migrationPlanDigest(plan)
	return plan, nil
}

type MigrationBackend interface {
	Version(context.Context, SessionRef) (Version, error)
	SHA256(context.Context, SessionRef) (string, error)
	CopyForMigration(
		context.Context,
		SessionRef,
		Version,
		string,
	) (SessionRef, error)
	ApplyMigrationStep(context.Context, SessionRef, MigrationStep) error
	ValidateMigrationCopy(
		context.Context,
		SessionRef,
		SessionRef,
		MigrationPlan,
	) (string, error)
	// ActivateMigrationCAS must hold the backend's exclusive session lease,
	// compare both hashes and the plan digest immediately before the atomic
	// manifest replace, and refuse activation on any mismatch.
	ActivateMigrationCAS(
		context.Context,
		SessionRef,
		SessionRef,
		MigrationActivation,
	) error
}

type MigrationActivation struct {
	Plan                 MigrationPlan
	ExpectedSourceSHA256 string
	ExpectedTargetSHA256 string
}

func (activation MigrationActivation) Validate() error {
	if !validSHA256Hex(activation.ExpectedSourceSHA256) ||
		!validSHA256Hex(activation.ExpectedTargetSHA256) ||
		!validSHA256Hex(activation.Plan.Digest) {
		return ErrInvalidMigration
	}
	return nil
}

type MigrationReport struct {
	Source       SessionRef
	Target       SessionRef
	Plan         MigrationPlan
	SourceSHA256 string
	TargetSHA256 string
}

type MigrationEngine struct {
	registry MigrationRegistry
	backend  MigrationBackend
}

func NewMigrationEngine(
	registry MigrationRegistry,
	backend MigrationBackend,
) (*MigrationEngine, error) {
	if backend == nil || registry.current == 0 {
		return nil, ErrInvalidMigration
	}
	return &MigrationEngine{registry: registry, backend: backend}, nil
}

// MigrateCopy never asks the backend to mutate the source. The backend must
// build and validate a separate target, then atomically switch only the
// manifest during ActivateMigrationCAS.
func (engine *MigrationEngine) MigrateCopy(
	ctx context.Context,
	source SessionRef,
	to Version,
) (MigrationReport, error) {
	if err := ctx.Err(); err != nil {
		return MigrationReport{}, err
	}
	from, err := engine.backend.Version(ctx, source)
	if err != nil {
		return MigrationReport{}, fmt.Errorf("read migration source version: %w", err)
	}
	plan, err := engine.registry.Plan(from, to)
	if err != nil {
		return MigrationReport{}, err
	}
	sourceHash, err := engine.backend.SHA256(ctx, source)
	if err != nil || !validSHA256Hex(sourceHash) {
		return MigrationReport{}, errors.Join(ErrInvalidMigration, err)
	}
	attemptID, err := newMigrationAttemptID()
	if err != nil {
		return MigrationReport{}, err
	}
	target, err := engine.backend.CopyForMigration(ctx, source, to, attemptID)
	if err != nil {
		return MigrationReport{}, fmt.Errorf("copy historical recording: %w", err)
	}
	if target == source || target.SessionID == "" {
		return MigrationReport{}, ErrInvalidMigration
	}
	for _, step := range plan.Steps {
		if err := ctx.Err(); err != nil {
			return MigrationReport{}, err
		}
		if err := engine.backend.ApplyMigrationStep(ctx, target, step); err != nil {
			return MigrationReport{}, fmt.Errorf("apply migration %s: %w", step.ID, err)
		}
	}
	targetHash, err := engine.backend.ValidateMigrationCopy(ctx, source, target, plan)
	if err != nil || !validSHA256Hex(targetHash) {
		return MigrationReport{}, errors.Join(ErrInvalidMigration, err)
	}
	sourceHashAfter, err := engine.backend.SHA256(ctx, source)
	if err != nil {
		return MigrationReport{}, fmt.Errorf("verify migration source: %w", err)
	}
	if sourceHashAfter != sourceHash {
		return MigrationReport{}, ErrMigrationSourceChanged
	}
	if err := ctx.Err(); err != nil {
		return MigrationReport{}, err
	}
	activation := MigrationActivation{
		Plan:                 plan,
		ExpectedSourceSHA256: sourceHash,
		ExpectedTargetSHA256: targetHash,
	}
	if err := activation.Validate(); err != nil {
		return MigrationReport{}, err
	}
	if err := engine.backend.ActivateMigrationCAS(ctx, source, target, activation); err != nil {
		return MigrationReport{}, fmt.Errorf("activate historical migration: %w", err)
	}
	return MigrationReport{
		Source: source, Target: target, Plan: plan,
		SourceSHA256: sourceHash, TargetSHA256: targetHash,
	}, nil
}

func migrationPlanDigest(plan MigrationPlan) string {
	digest := sha256.New()
	_, _ = fmt.Fprintf(digest, "%d>%d", plan.From, plan.To)
	for _, step := range plan.Steps {
		_, _ = fmt.Fprintf(digest, "\x00%s:%d>%d", step.ID, step.From, step.To)
	}
	return hex.EncodeToString(digest.Sum(nil))
}

func newMigrationAttemptID() (string, error) {
	var entropy [16]byte
	if _, err := rand.Read(entropy[:]); err != nil {
		return "", fmt.Errorf("generate migration attempt id: %w", err)
	}
	return "migration-" + hex.EncodeToString(entropy[:]), nil
}

func safeMigrationID(value string) bool {
	if len(value) < 3 || len(value) > 96 {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') ||
			(character >= '0' && character <= '9') ||
			character == '-' {
			continue
		}
		return false
	}
	return true
}

func validSHA256Hex(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}
