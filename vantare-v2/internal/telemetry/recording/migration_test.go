package recording

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestMigrationRegistryBuildsClosedContiguousPlans(t *testing.T) {
	t.Parallel()
	registry, err := NewMigrationRegistry(3, []MigrationStep{
		{ID: "schema-1-to-2", From: 1, To: 2},
		{ID: "schema-2-to-3", From: 2, To: 3},
	})
	if err != nil {
		t.Fatalf("NewMigrationRegistry() error = %v", err)
	}
	plan, err := registry.Plan(1, 3)
	if err != nil {
		t.Fatalf("Plan() error = %v", err)
	}
	if plan.From != 1 || plan.To != 3 || len(plan.Steps) != 2 || len(plan.Digest) != 64 {
		t.Fatalf("plan = %#v", plan)
	}
	again, err := registry.Plan(1, 3)
	if err != nil || plan.Digest != again.Digest {
		t.Fatalf("second plan = %#v, %v", again, err)
	}
}

func TestCurrentMigrationRegistryDoesNotInventSuccessorSchema(t *testing.T) {
	t.Parallel()
	registry, err := CurrentMigrationRegistry()
	if err != nil {
		t.Fatalf("CurrentMigrationRegistry() error = %v", err)
	}
	if _, err := registry.Plan(1, 2); !errors.Is(err, ErrMigrationPath) {
		t.Fatalf("Plan(1,2) error = %v, want unavailable path", err)
	}
}

func TestMigrationRegistryRejectsUnsafeGraphsAndDowngrade(t *testing.T) {
	t.Parallel()
	tests := [][]MigrationStep{
		{{ID: "jump", From: 1, To: 3}},
		{
			{ID: "one-two", From: 1, To: 2},
			{ID: "gap", From: 3, To: 4},
		},
		{
			{ID: "one-two", From: 1, To: 2},
			{ID: "duplicate", From: 1, To: 2},
		},
		{
			{ID: "same-id", From: 1, To: 2},
			{ID: "same-id", From: 2, To: 3},
		},
	}
	for _, steps := range tests {
		if _, err := NewMigrationRegistry(4, steps); !errors.Is(err, ErrInvalidMigration) {
			t.Fatalf("NewMigrationRegistry(%#v) error = %v", steps, err)
		}
	}
	registry, err := NewMigrationRegistry(1, nil)
	if err != nil {
		t.Fatalf("NewMigrationRegistry(empty) error = %v", err)
	}
	if _, err := registry.Plan(2, 1); !errors.Is(err, ErrMigrationDowngrade) {
		t.Fatalf("Plan(downgrade) error = %v", err)
	}
	if _, err := registry.Plan(1, 2); !errors.Is(err, ErrMigrationPath) {
		t.Fatalf("Plan(future) error = %v", err)
	}
}

type fakeMigrationBackend struct {
	version         Version
	sourceHashes    []string
	calls           []string
	failStep        string
	validateErr     error
	activateErr     error
	targetHash      string
	sourceHashReads int
	activation      MigrationActivation
}

func (backend *fakeMigrationBackend) Version(context.Context, SessionRef) (Version, error) {
	backend.calls = append(backend.calls, "version")
	return backend.version, nil
}

func (backend *fakeMigrationBackend) SHA256(context.Context, SessionRef) (string, error) {
	backend.calls = append(backend.calls, "source-hash")
	index := backend.sourceHashReads
	backend.sourceHashReads++
	if index >= len(backend.sourceHashes) {
		index = len(backend.sourceHashes) - 1
	}
	return backend.sourceHashes[index], nil
}

func (backend *fakeMigrationBackend) CopyForMigration(
	_ context.Context,
	source SessionRef,
	to Version,
	attemptID string,
) (SessionRef, error) {
	backend.calls = append(backend.calls, "copy")
	return SessionRef{Root: source.Root, SessionID: attemptID}, nil
}

func (backend *fakeMigrationBackend) ApplyMigrationStep(
	_ context.Context,
	_ SessionRef,
	step MigrationStep,
) error {
	backend.calls = append(backend.calls, "apply:"+step.ID)
	if backend.failStep == step.ID {
		return errors.New("step failed")
	}
	return nil
}

func (backend *fakeMigrationBackend) ValidateMigrationCopy(
	context.Context,
	SessionRef,
	SessionRef,
	MigrationPlan,
) (string, error) {
	backend.calls = append(backend.calls, "validate")
	return backend.targetHash, backend.validateErr
}

func (backend *fakeMigrationBackend) ActivateMigrationCAS(
	_ context.Context,
	_ SessionRef,
	_ SessionRef,
	activation MigrationActivation,
) error {
	backend.calls = append(backend.calls, "activate")
	backend.activation = activation
	return backend.activateErr
}

func TestMigrationEngineActivatesOnlyValidatedUnchangedCopy(t *testing.T) {
	t.Parallel()
	registry, err := NewMigrationRegistry(3, []MigrationStep{
		{ID: "schema-1-to-2", From: 1, To: 2},
		{ID: "schema-2-to-3", From: 2, To: 3},
	})
	if err != nil {
		t.Fatalf("NewMigrationRegistry() error = %v", err)
	}
	backend := &fakeMigrationBackend{
		version: 1, sourceHashes: []string{testSHA("a"), testSHA("a")},
		targetHash: testSHA("b"),
	}
	engine, err := NewMigrationEngine(registry, backend)
	if err != nil {
		t.Fatalf("NewMigrationEngine() error = %v", err)
	}
	report, err := engine.MigrateCopy(
		context.Background(),
		SessionRef{Root: "root", SessionID: "session-local-0001"},
		3,
	)
	if err != nil {
		t.Fatalf("MigrateCopy() error = %v", err)
	}
	want := []string{
		"version", "source-hash", "copy",
		"apply:schema-1-to-2", "apply:schema-2-to-3",
		"validate", "source-hash", "activate",
	}
	if !reflect.DeepEqual(backend.calls, want) ||
		report.SourceSHA256 != testSHA("a") ||
		report.TargetSHA256 != testSHA("b") ||
		backend.activation.ExpectedSourceSHA256 != testSHA("a") ||
		backend.activation.ExpectedTargetSHA256 != testSHA("b") ||
		backend.activation.Plan.Digest != report.Plan.Digest ||
		report.Target.SessionID[:10] != "migration-" {
		t.Fatalf("calls = %#v, report = %#v", backend.calls, report)
	}
}

func TestMigrationEngineNeverActivatesFailedOrChangedCopy(t *testing.T) {
	t.Parallel()
	registry, err := NewMigrationRegistry(2, []MigrationStep{
		{ID: "schema-1-to-2", From: 1, To: 2},
	})
	if err != nil {
		t.Fatalf("NewMigrationRegistry() error = %v", err)
	}
	tests := []struct {
		name    string
		backend *fakeMigrationBackend
		wantErr error
	}{
		{
			name: "step fails",
			backend: &fakeMigrationBackend{
				version: 1, sourceHashes: []string{testSHA("a")},
				targetHash: testSHA("b"), failStep: "schema-1-to-2",
			},
		},
		{
			name: "validation fails",
			backend: &fakeMigrationBackend{
				version: 1, sourceHashes: []string{testSHA("a")},
				targetHash: testSHA("b"), validateErr: errors.New("bad golden"),
			},
			wantErr: ErrInvalidMigration,
		},
		{
			name: "source changes",
			backend: &fakeMigrationBackend{
				version: 1, sourceHashes: []string{testSHA("a"), testSHA("c")},
				targetHash: testSHA("b"),
			},
			wantErr: ErrMigrationSourceChanged,
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			engine, err := NewMigrationEngine(registry, test.backend)
			if err != nil {
				t.Fatalf("NewMigrationEngine() error = %v", err)
			}
			_, err = engine.MigrateCopy(
				context.Background(),
				SessionRef{Root: "root", SessionID: "session-local-0001"},
				2,
			)
			if err == nil || (test.wantErr != nil && !errors.Is(err, test.wantErr)) {
				t.Fatalf("MigrateCopy() error = %v, want %v", err, test.wantErr)
			}
			for _, call := range test.backend.calls {
				if call == "activate" {
					t.Fatal("failed migration activated target")
				}
			}
		})
	}
}

func testSHA(character string) string {
	result := ""
	for range 64 {
		result += character
	}
	return result
}
