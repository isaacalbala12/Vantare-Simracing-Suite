package repository

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

type testPayload struct {
	Laps int    `json:"laps"`
	Note string `json:"note,omitempty"`
}

func TestRepositoryRecoversDraftWithoutMutatingStableRevision(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}

	draft := validDraft("draft-1", "plan-1", testPayload{Laps: 10})
	revision := mustRevision(t, draft, "revision-1")
	first, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{
		Drafts:    []contract.PlanDraft[testPayload]{draft},
		Revisions: []contract.PlanRevision[testPayload]{revision},
	})
	if err != nil {
		t.Fatal(err)
	}

	draft.Payload.Laps = 12
	draft.UpdatedAt = draft.UpdatedAt.Add(time.Second)
	if _, err := repository.Commit(ctx, first.Version, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{draft}}); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := reopened.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := snapshot.Drafts[0].Payload.Laps; got != 12 {
		t.Fatalf("recovered draft laps = %d, want 12", got)
	}
	stablePayload, err := snapshot.Revisions[0].Payload()
	if err != nil {
		t.Fatal(err)
	}
	if stablePayload.Laps != 10 {
		t.Fatalf("stable revision changed with draft: got %d, want 10", stablePayload.Laps)
	}
}

func TestRepositoryRejectsReplacingImmutableRevision(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	repository, err := Open[testPayload](t.TempDir(), Options{})
	if err != nil {
		t.Fatal(err)
	}
	draft := validDraft("draft-1", "plan-1", testPayload{Laps: 10})
	firstRevision := mustRevision(t, draft, "revision-1")
	snapshot, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{Revisions: []contract.PlanRevision[testPayload]{firstRevision}})
	if err != nil {
		t.Fatal(err)
	}

	draft.Payload.Laps = 11
	draft.UpdatedAt = draft.UpdatedAt.Add(time.Second)
	secondRevision := mustRevision(t, draft, "revision-1")
	_, err = repository.Commit(ctx, snapshot.Version, ChangeSet[testPayload]{Revisions: []contract.PlanRevision[testPayload]{secondRevision}})
	if !errors.Is(err, ErrImmutableRevision) {
		t.Fatalf("replace revision error = %v, want ErrImmutableRevision", err)
	}

	after, err := repository.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if after.Version != snapshot.Version || len(after.Revisions) != 1 {
		t.Fatalf("failed replacement mutated repository: %#v", after)
	}
}

func TestRepositoryRejectsStaleWriters(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	firstWriter, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	secondWriter, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	initial, err := firstWriter.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := firstWriter.Commit(ctx, initial.Version, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{validDraft("draft-a", "plan-a", testPayload{Laps: 1})}}); err != nil {
		t.Fatal(err)
	}
	_, err = secondWriter.Commit(ctx, initial.Version, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{validDraft("draft-b", "plan-b", testPayload{Laps: 2})}})
	if !errors.Is(err, ErrStaleWrite) {
		t.Fatalf("second writer error = %v, want ErrStaleWrite", err)
	}
}

func TestRepositorySerializesConcurrentWriters(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	first, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	second, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	errorsByWriter := make(chan error, 2)
	var workers sync.WaitGroup
	for index, repository := range []*Repository[testPayload]{first, second} {
		workers.Add(1)
		go func(index int, repository *Repository[testPayload]) {
			defer workers.Done()
			<-start
			_, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{
				validDraft(contract.DraftID("draft-"+string(rune('a'+index))), contract.PlanID("plan-"+string(rune('a'+index))), testPayload{Laps: index + 1}),
			}})
			errorsByWriter <- err
		}(index, repository)
	}
	close(start)
	workers.Wait()
	close(errorsByWriter)

	var successes, explicitRejections int
	for err := range errorsByWriter {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrStaleWrite), errors.Is(err, ErrWriteInProgress):
			explicitRejections++
		default:
			t.Fatalf("unexpected concurrent writer error: %v", err)
		}
	}
	if successes != 1 || explicitRejections != 1 {
		t.Fatalf("successes=%d rejections=%d, want 1/1", successes, explicitRejections)
	}
}

func TestRepositoryRecoversLastKnownGoodBackup(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	first, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{validDraft("draft-1", "plan-1", testPayload{Laps: 1})}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Commit(ctx, first.Version, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{validDraft("draft-2", "plan-2", testPayload{Laps: 2})}}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(repository.statePath(), []byte(`{"repositoryVersion":`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".strategy-repository-interrupted.tmp"), []byte("partial"), 0o600); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := reopened.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !snapshot.RecoveredFromBackup {
		t.Fatal("snapshot did not report backup recovery")
	}
	if snapshot.Version != first.Version || len(snapshot.Drafts) != 1 || snapshot.Drafts[0].PlanID != "plan-1" {
		t.Fatalf("backup snapshot = %#v, want first committed state", snapshot)
	}
	if _, err := reopened.Snapshot(ctx); err != nil {
		t.Fatalf("restored primary is not readable: %v", err)
	}
}

func TestRepositoryNewRootStartsAtGenerationZero(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := repository.Snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Version != 0 || snapshot.RecoveredFromBackup || len(snapshot.Drafts) != 0 || len(snapshot.Revisions) != 0 {
		t.Fatalf("new repository snapshot = %#v, want genuine empty generation zero", snapshot)
	}
	for _, path := range []string{repository.statePath(), filepath.Join(root, backupFileName)} {
		if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("new repository unexpectedly persisted %s: %v", filepath.Base(path), err)
		}
	}
}

func TestRepositoryFirstCommitCreatesRecoverableBackup(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	committed, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{
		validDraft("draft-1", "plan-1", testPayload{Laps: 1}),
	}})
	if err != nil {
		t.Fatal(err)
	}
	primary, err := os.ReadFile(repository.statePath())
	if err != nil {
		t.Fatal(err)
	}
	backup, err := os.ReadFile(filepath.Join(root, backupFileName))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(primary, backup) {
		t.Fatal("first commit backup does not contain the committed generation")
	}
	if err := os.Remove(repository.statePath()); err != nil {
		t.Fatal(err)
	}

	recovered, err := repository.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !recovered.RecoveredFromBackup || recovered.Version != committed.Version || len(recovered.Drafts) != 1 || recovered.Drafts[0].PlanID != "plan-1" {
		t.Fatalf("snapshot after primary loss = %#v, want recovered first commit", recovered)
	}
	restored, err := os.ReadFile(repository.statePath())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(restored, backup) {
		t.Fatal("recovery did not restore the exact first committed generation")
	}
}

func TestRepositoryCommitAfterFirstPrimaryLossCannotOverwriteAsGenerationZero(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{
		validDraft("draft-1", "plan-1", testPayload{Laps: 1}),
	}}); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(repository.statePath()); err != nil {
		t.Fatal(err)
	}

	_, err = repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{
		validDraft("draft-2", "plan-2", testPayload{Laps: 2}),
	}})
	if !errors.Is(err, ErrStaleWrite) {
		t.Fatalf("Commit after primary loss = %v, want ErrStaleWrite", err)
	}
	after, err := repository.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if after.Version != 1 || len(after.Drafts) != 1 || after.Drafts[0].PlanID != "plan-1" {
		t.Fatalf("stale commit consolidated silent loss: %#v", after)
	}
}

func TestRepositoryFirstCommitBackupDefinesAtomicRecoveryBoundary(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	for _, test := range []struct {
		name             string
		failWriteCall    int
		failAfterReplace bool
		wantUncertain    bool
		wantVersion      uint64
	}{
		{name: "backup fails before replace", failWriteCall: 1, wantVersion: 0},
		{name: "backup sync fails after replace", failWriteCall: 1, failAfterReplace: true, wantUncertain: true, wantVersion: 1},
		{name: "primary fails after backup", failWriteCall: 2, wantUncertain: true, wantVersion: 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			repository, err := Open[testPayload](root, Options{})
			if err != nil {
				t.Fatal(err)
			}
			defaultWriter := repository.write
			writeCall := 0
			fault := errors.New("injected write failure before replace")
			repository.write = func(path string, data []byte) (bool, error) {
				writeCall++
				if writeCall == test.failWriteCall {
					if test.failAfterReplace {
						return writeAtomicWithSync(path, data, func(string) error { return fault })
					}
					return false, fault
				}
				return defaultWriter(path, data)
			}
			_, err = repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{
				validDraft("draft-1", "plan-1", testPayload{Laps: 1}),
			}})
			if !errors.Is(err, fault) {
				t.Fatalf("Commit error = %v, want injected fault", err)
			}
			if errors.Is(err, ErrCommitUncertain) != test.wantUncertain {
				t.Fatalf("Commit uncertainty = %v, want %v: %v", errors.Is(err, ErrCommitUncertain), test.wantUncertain, err)
			}

			repository.write = defaultWriter
			snapshot, err := repository.Snapshot(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if snapshot.Version != test.wantVersion {
				t.Fatalf("snapshot version = %d, want %d", snapshot.Version, test.wantVersion)
			}
			if test.wantVersion == 1 && (!snapshot.RecoveredFromBackup || len(snapshot.Drafts) != 1) {
				t.Fatalf("candidate backup was not recovered after interrupted first commit: %#v", snapshot)
			}
		})
	}
}

func TestRepositoryHashDetectsValidJSONCorruption(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	first, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{validDraft("draft-1", "plan-1", testPayload{Laps: 1})}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Commit(ctx, first.Version, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{validDraft("draft-2", "plan-2", testPayload{Laps: 2})}}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(repository.statePath())
	if err != nil {
		t.Fatal(err)
	}
	corrupted := bytes.Replace(data, []byte(`"laps": 2`), []byte(`"laps": 9`), 1)
	if bytes.Equal(corrupted, data) {
		t.Fatal("fixture mutation did not change repository bytes")
	}
	if err := os.WriteFile(repository.statePath(), corrupted, 0o600); err != nil {
		t.Fatal(err)
	}

	snapshot, err := repository.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !snapshot.RecoveredFromBackup || snapshot.Version != first.Version || len(snapshot.Drafts) != 1 {
		t.Fatalf("valid-JSON corruption did not roll back: %#v", snapshot)
	}
}

func TestRepositoryDeleteNeverTouchesExternalFiles(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	externalRoot := t.TempDir()
	external := filepath.Join(externalRoot, "session.telemetry")
	if err := os.WriteFile(external, []byte("external"), 0o600); err != nil {
		t.Fatal(err)
	}
	repository, err := Open[map[string]any](t.TempDir(), Options{})
	if err != nil {
		t.Fatal(err)
	}
	draft := validMapDraft("draft-1", "plan-1", map[string]any{"externalPath": external})
	created, err := repository.Commit(ctx, 0, ChangeSet[map[string]any]{Drafts: []contract.PlanDraft[map[string]any]{draft}})
	if err != nil {
		t.Fatal(err)
	}
	deleted, err := repository.Commit(ctx, created.Version, ChangeSet[map[string]any]{DeletePlans: []contract.PlanID{"plan-1"}})
	if err != nil {
		t.Fatal(err)
	}
	if deleted.DeletedPlans != 1 || len(deleted.Drafts) != 0 {
		t.Fatalf("delete result = %#v", deleted)
	}
	if content, err := os.ReadFile(external); err != nil || string(content) != "external" {
		t.Fatalf("external file changed: content=%q err=%v", content, err)
	}
}

func TestRepositoryCurrentMigrationFixtureAndFutureRejection(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	for _, test := range []struct {
		name    string
		fixture string
		wantErr error
	}{
		{name: "current v1", fixture: "repository-v1.json"},
		{name: "future version", fixture: "repository-future.json", wantErr: ErrUnsupportedRepositoryVersion},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			fixture, err := os.ReadFile(filepath.Join("testdata", test.fixture))
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(root, stateFileName), fixture, 0o600); err != nil {
				t.Fatal(err)
			}
			migrated, steps, migrationErr := MigrateRepositoryJSON(fixture)
			if !errors.Is(migrationErr, test.wantErr) {
				t.Fatalf("MigrateRepositoryJSON error = %v, want %v", migrationErr, test.wantErr)
			}
			if test.wantErr == nil && (string(migrated) != string(fixture) || len(steps) != 0) {
				t.Fatalf("v1 migration must be a byte-exact no-op: steps=%v", steps)
			}
			if test.wantErr == nil {
				golden, err := os.ReadFile(filepath.Join("testdata", "repository-v1.golden.json"))
				if err != nil {
					t.Fatal(err)
				}
				if string(migrated) != string(golden) {
					t.Fatal("v1 migration differs from its rollback-safe golden")
				}
			}
			repository, err := Open[testPayload](root, Options{})
			if err != nil {
				t.Fatal(err)
			}
			snapshot, err := repository.Snapshot(ctx)
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("Snapshot error = %v, want %v", err, test.wantErr)
			}
			if test.wantErr == nil && (snapshot.Version != 7 || len(snapshot.Drafts) != 1) {
				t.Fatalf("fixture snapshot = %#v", snapshot)
			}
		})
	}
}

func TestRepositoryRejectsDuplicateJSONKeys(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	document := []byte(`{"repositoryVersion":"strategy.repository.v1","generation":1,"generation":2,"drafts":[],"revisions":[]}`)
	if err := os.WriteFile(filepath.Join(root, stateFileName), document, 0o600); err != nil {
		t.Fatal(err)
	}
	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	_, err = repository.Snapshot(context.Background())
	if !errors.Is(err, ErrCorruptRepository) {
		t.Fatalf("duplicate key error = %v, want ErrCorruptRepository", err)
	}
}

func TestRepositoryMigrationRejectsTrailingData(t *testing.T) {
	t.Parallel()
	document := []byte(`{"repositoryVersion":"strategy.repository.v1","generation":0,"drafts":[],"revisions":[]} broken`)
	_, _, err := MigrateRepositoryJSON(document)
	if !errors.Is(err, ErrCorruptRepository) {
		t.Fatalf("trailing data error = %v, want ErrCorruptRepository", err)
	}
}

func TestRepositoryLimitsRejectWithoutMutation(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	repository, err := Open[testPayload](t.TempDir(), Options{Limits: Limits{
		MaxRepositoryBytes: 4096,
		MaxDrafts:          1,
		MaxRevisions:       1,
		MaxDocumentBytes:   1024,
	}})
	if err != nil {
		t.Fatal(err)
	}
	first, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{validDraft("draft-1", "plan-1", testPayload{Laps: 1})}})
	if err != nil {
		t.Fatal(err)
	}
	_, err = repository.Commit(ctx, first.Version, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{validDraft("draft-2", "plan-2", testPayload{Laps: 2})}})
	if !errors.Is(err, ErrLimitExceeded) {
		t.Fatalf("limit error = %v, want ErrLimitExceeded", err)
	}
	after, err := repository.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if after.Version != first.Version || len(after.Drafts) != 1 {
		t.Fatalf("limit failure mutated repository: %#v", after)
	}
}

func TestRepositoryDoesNotRestoreBackupWhenConfiguredLimitsRejectPrimary(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	first, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{
		validDraft("draft-1", "plan-1", testPayload{Laps: 1}),
	}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Commit(ctx, first.Version, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{
		validDraft("draft-2", "plan-2", testPayload{Laps: 2}),
	}}); err != nil {
		t.Fatal(err)
	}
	primaryBefore, err := os.ReadFile(repository.statePath())
	if err != nil {
		t.Fatal(err)
	}

	limits := DefaultLimits()
	limits.MaxDrafts = 1
	restricted, err := Open[testPayload](root, Options{Limits: limits})
	if err != nil {
		t.Fatal(err)
	}
	_, err = restricted.Snapshot(ctx)
	if !errors.Is(err, ErrLimitExceeded) {
		t.Fatalf("Snapshot error = %v, want ErrLimitExceeded", err)
	}
	primaryAfter, err := os.ReadFile(repository.statePath())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(primaryAfter, primaryBefore) {
		t.Fatal("limit rejection replaced the primary with its older backup")
	}
}

func TestRepositoryLeaseHelperProcess(t *testing.T) {
	if os.Getenv("STRATEGY_REPOSITORY_LEASE_HELPER") != "1" {
		return
	}
	root := os.Getenv("STRATEGY_REPOSITORY_LEASE_ROOT")
	lease, err := acquireRepositoryLease(filepath.Join(root, leaseFileName))
	if err != nil {
		fmt.Fprintf(os.Stderr, "acquire lease: %v\n", err)
		os.Exit(2)
	}
	defer lease.Close()
	fmt.Println("READY")
	_, _ = io.Copy(io.Discard, os.Stdin)
}

func TestRepositoryLeaseIsCrossProcessAndReleasedAfterAbruptDeath(t *testing.T) {
	root := t.TempDir()
	command := exec.Command(os.Args[0], "-test.run=^TestRepositoryLeaseHelperProcess$")
	command.Env = append(os.Environ(),
		"STRATEGY_REPOSITORY_LEASE_HELPER=1",
		"STRATEGY_REPOSITORY_LEASE_ROOT="+root,
	)
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	var stderr bytes.Buffer
	command.Stderr = &stderr
	stdin, err := command.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	defer stdin.Close()
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	reader := bufio.NewReader(stdout)
	type readiness struct {
		line string
		err  error
	}
	readyResult := make(chan readiness, 1)
	go func() {
		line, err := reader.ReadString('\n')
		readyResult <- readiness{line: line, err: err}
	}()
	var ready string
	select {
	case result := <-readyResult:
		ready, err = result.line, result.err
	case <-time.After(10 * time.Second):
		err = errors.New("helper readiness timed out")
	}
	if err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		t.Fatalf("wait for helper readiness: %v (%s)", err, stderr.String())
	}
	if strings.TrimSpace(ready) != "READY" {
		_ = command.Process.Kill()
		_ = command.Wait()
		t.Fatalf("helper readiness = %q, stderr=%q", ready, stderr.String())
	}

	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Snapshot(context.Background()); !errors.Is(err, ErrWriteInProgress) {
		_ = command.Process.Kill()
		_ = command.Wait()
		t.Fatalf("Snapshot while helper holds lease = %v, want ErrWriteInProgress", err)
	}
	if err := command.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	if err := command.Wait(); err == nil {
		t.Fatal("abrupt helper death unexpectedly reported success")
	}

	reopened, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := reopened.Snapshot(context.Background()); err != nil {
		t.Fatalf("lease was not released after helper death: %v", err)
	}
}

func TestRepositoryCleansOnlySafeOrphanTemporaryFiles(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	externalRoot := t.TempDir()
	external := filepath.Join(externalRoot, "outside.txt")
	if err := os.WriteFile(external, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 128; index++ {
		name := filepath.Join(root, fmt.Sprintf(".strategy-repository-%03d.tmp", index))
		if err := os.WriteFile(name, []byte("orphan"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	unrelated := filepath.Join(root, "user-data.tmp")
	if err := os.WriteFile(unrelated, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	matchingDirectory := filepath.Join(root, ".strategy-repository-directory.tmp")
	if err := os.Mkdir(matchingDirectory, 0o700); err != nil {
		t.Fatal(err)
	}
	matchingLink := filepath.Join(root, ".strategy-repository-link.tmp")
	linkCreated := os.Symlink(external, matchingLink) == nil

	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Snapshot(context.Background()); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), temporaryFilePrefix) && strings.HasSuffix(entry.Name(), temporaryFileSuffix) {
			info, err := os.Lstat(filepath.Join(root, entry.Name()))
			if err != nil {
				t.Fatal(err)
			}
			if info.Mode().IsRegular() {
				t.Fatalf("orphan regular temporary file remains: %s", entry.Name())
			}
		}
	}
	if got, err := os.ReadFile(unrelated); err != nil || string(got) != "keep" {
		t.Fatalf("unrelated file changed: %q, %v", got, err)
	}
	if info, err := os.Stat(matchingDirectory); err != nil || !info.IsDir() {
		t.Fatalf("matching directory was removed: %v", err)
	}
	if linkCreated {
		if info, err := os.Lstat(matchingLink); err != nil || info.Mode()&os.ModeSymlink == 0 {
			t.Fatalf("matching symlink was followed or removed: %v", err)
		}
	}
	if got, err := os.ReadFile(external); err != nil || string(got) != "outside" {
		t.Fatalf("external target changed: %q, %v", got, err)
	}
}

func TestRepositoryDraftsUseCanonicalContractMigrationGate(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name    string
		fixture string
		wantErr contract.ErrorCode
	}{
		{name: "current", fixture: "draft-v1.json"},
		{name: "future", fixture: "draft-future.json", wantErr: contract.ErrorUnsupportedVersion},
	} {
		t.Run(test.name, func(t *testing.T) {
			document, err := os.ReadFile(filepath.Join("testdata", test.fixture))
			if err != nil {
				t.Fatal(err)
			}
			migrated, steps, err := contract.MigrateContractJSON(document)
			if test.wantErr != "" {
				if !contract.HasErrorCode(err, test.wantErr) {
					t.Fatalf("MigrateContractJSON error = %v, want %s", err, test.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(migrated, document) || len(steps) != 0 {
				t.Fatalf("current draft migration changed bytes or emitted steps: %v", steps)
			}
		})
	}
}

func TestRepositoryFutureDraftVersionDoesNotRestoreBackupOrMutatePrimary(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	first, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{validDraft("draft-1", "plan-1", testPayload{Laps: 1})}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Commit(ctx, first.Version, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{validDraft("draft-2", "plan-2", testPayload{Laps: 2})}}); err != nil {
		t.Fatal(err)
	}
	primary, err := os.ReadFile(repository.statePath())
	if err != nil {
		t.Fatal(err)
	}
	var envelope diskEnvelope
	if err := json.Unmarshal(primary, &envelope); err != nil {
		t.Fatal(err)
	}
	var draft map[string]any
	if err := json.Unmarshal(envelope.Drafts[1], &draft); err != nil {
		t.Fatal(err)
	}
	draft["contractVersion"] = "strategy.v999"
	envelope.Drafts[1], err = json.Marshal(draft)
	if err != nil {
		t.Fatal(err)
	}
	envelope.ContentHash, err = hashEnvelope(envelope)
	if err != nil {
		t.Fatal(err)
	}
	primary, err = json.MarshalIndent(envelope, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	primary = append(primary, '\n')
	if err := os.WriteFile(repository.statePath(), primary, 0o600); err != nil {
		t.Fatal(err)
	}

	_, err = repository.Snapshot(ctx)
	if !contract.HasErrorCode(err, contract.ErrorUnsupportedVersion) {
		t.Fatalf("Snapshot error = %v, want %s", err, contract.ErrorUnsupportedVersion)
	}
	after, err := os.ReadFile(repository.statePath())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(after, primary) {
		t.Fatal("unsupported draft version restored backup or mutated primary")
	}
}

func TestRepositoryReportsUncertainCommitAfterReplaceAndSupportsReconciliation(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	repository, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defaultWriter := repository.write
	fault := errors.New("directory sync fault")
	repository.write = func(path string, data []byte) (bool, error) {
		if filepath.Base(path) != stateFileName {
			return defaultWriter(path, data)
		}
		return writeAtomicWithSync(path, data, func(string) error { return fault })
	}
	_, err = repository.Commit(context.Background(), 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{
		validDraft("draft-1", "plan-1", testPayload{Laps: 1}),
	}})
	if !errors.Is(err, ErrCommitUncertain) || !errors.Is(err, fault) {
		t.Fatalf("Commit error = %v, want ErrCommitUncertain wrapping sync fault", err)
	}
	var uncertain *CommitUncertainError
	if !errors.As(err, &uncertain) || uncertain.Version != 1 {
		t.Fatalf("uncertain commit metadata = %#v, want version 1", uncertain)
	}

	repository.write = defaultWriter
	snapshot, err := repository.Snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Version != 1 || len(snapshot.Drafts) != 1 || snapshot.Drafts[0].PlanID != "plan-1" {
		t.Fatalf("reconciled snapshot = %#v, want committed generation 1", snapshot)
	}
}

func TestRepositoryChangeSetIsAtomicOnValidationFailure(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	repository, err := Open[testPayload](t.TempDir(), Options{})
	if err != nil {
		t.Fatal(err)
	}
	valid := validDraft("draft-valid", "plan-valid", testPayload{Laps: 1})
	invalid := validDraft("draft-invalid", "plan-invalid", testPayload{Laps: 2})
	invalid.Name = ""
	if _, err := repository.Commit(ctx, 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{valid, invalid}}); err == nil {
		t.Fatal("invalid change set was accepted")
	}
	snapshot, err := repository.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Version != 0 || len(snapshot.Drafts) != 0 || len(snapshot.Revisions) != 0 {
		t.Fatalf("failed change set mutated repository: %#v", snapshot)
	}
}

func validDraft(draftID contract.DraftID, planID contract.PlanID, payload testPayload) contract.PlanDraft[testPayload] {
	return contract.PlanDraft[testPayload]{
		ContractVersion: contract.CurrentVersion,
		DraftID:         draftID,
		PlanID:          planID,
		VariantID:       "variant-1",
		Name:            "Test plan",
		Mode:            contract.PlanModeManual,
		Capabilities:    []contract.Capability{contract.CapabilityManualInputs},
		Provenance:      contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "test"},
		Confidence:      contract.Confidence{Level: contract.ConfidenceHigh, Basis: "test fixture"},
		UpdatedAt:       time.Date(2026, 8, 2, 3, 0, 0, 0, time.UTC),
		Payload:         payload,
	}
}

func validMapDraft(draftID contract.DraftID, planID contract.PlanID, payload map[string]any) contract.PlanDraft[map[string]any] {
	return contract.PlanDraft[map[string]any]{
		ContractVersion: contract.CurrentVersion,
		DraftID:         draftID,
		PlanID:          planID,
		VariantID:       "variant-1",
		Name:            "Test plan",
		Mode:            contract.PlanModeManual,
		Capabilities:    []contract.Capability{contract.CapabilityManualInputs},
		Provenance:      contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "test"},
		Confidence:      contract.Confidence{Level: contract.ConfidenceHigh, Basis: "test fixture"},
		UpdatedAt:       time.Date(2026, 8, 2, 3, 0, 0, 0, time.UTC),
		Payload:         payload,
	}
}

func mustRevision(t *testing.T, draft contract.PlanDraft[testPayload], revisionID contract.RevisionID) contract.PlanRevision[testPayload] {
	t.Helper()
	revision, err := contract.NewPlanRevision(draft, contract.RevisionMetadata{
		RevisionID: revisionID,
		CreatedAt:  draft.UpdatedAt.Add(time.Second),
	})
	if err != nil {
		t.Fatal(err)
	}
	return revision
}

func TestRepositoryJSONRoundTripIsStable(t *testing.T) {
	t.Parallel()
	repository, err := Open[testPayload](t.TempDir(), Options{})
	if err != nil {
		t.Fatal(err)
	}
	draft := validDraft("draft-1", "plan-1", testPayload{Laps: 10})
	if _, err := repository.Commit(context.Background(), 0, ChangeSet[testPayload]{Drafts: []contract.PlanDraft[testPayload]{draft}}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(repository.statePath())
	if err != nil {
		t.Fatal(err)
	}
	if !json.Valid(data) {
		t.Fatalf("repository file is not JSON: %q", data)
	}
}
