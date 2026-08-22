package sqlite

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording"
)

var errInjected = errors.New("injected storage failure")

type switchFault struct {
	mu     sync.Mutex
	active FaultPoint
	err    error
}

func (f *switchFault) Set(point FaultPoint) {
	f.mu.Lock()
	f.active = point
	f.mu.Unlock()
}

func (f *switchFault) Check(point FaultPoint) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.active == point {
		if f.err != nil {
			return f.err
		}
		return errInjected
	}
	return nil
}

type failingFiles struct {
	OSFileSystem
	fail atomic.Bool
}

type cooperativeBlockingFiles struct {
	OSFileSystem
	block atomic.Bool
}

func (f *cooperativeBlockingFiles) WriteAtomic(
	ctx context.Context,
	path string,
	data []byte,
	mode os.FileMode,
) error {
	if f.block.Load() {
		<-ctx.Done()
		return ctx.Err()
	}
	return f.OSFileSystem.WriteAtomic(ctx, path, data, mode)
}

func (f *failingFiles) WriteAtomic(ctx context.Context, path string, data []byte, mode os.FileMode) error {
	if f.fail.Load() {
		return os.ErrPermission
	}
	return f.OSFileSystem.WriteAtomic(ctx, path, data, mode)
}

func TestStorePersistsQueriesAndCompletesDeterministically(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	ref, manifest := testSession(root)
	store := New(Options{Clock: fixedClock{now: testTime(0)}})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}

	first := batch(1, 64, true)
	if committed, err := writer.Append(ctx, first); err != nil || committed != first.Accepted {
		t.Fatalf("Append(first) = %#v, %v", committed, err)
	}
	watermark, err := writer.Checkpoint(ctx)
	if err != nil {
		t.Fatalf("Checkpoint() error = %v", err)
	}
	if watermark.Accepted != first.Accepted || watermark.Committed != first.Accepted {
		t.Fatalf("watermark = %#v", watermark)
	}

	reader, err := store.OpenReader(ctx, ref)
	if err != nil {
		t.Fatalf("OpenReader() error = %v", err)
	}
	second := batch(2, 64, false)
	if _, err := writer.Append(ctx, second); err != nil {
		t.Fatalf("Append(second) error = %v", err)
	}
	observed, err := reader.Observed(ctx, recording.CursorRange{
		First: recording.Cursor{Epoch: 1, Sequence: 1},
		Last:  recording.Cursor{Epoch: 1, Sequence: 2},
	})
	if err != nil {
		t.Fatalf("Observed() error = %v", err)
	}
	if len(observed) != 2 || len(observed[0].Vehicles) != 64 ||
		observed[0].Sequence != 1 || observed[1].Sequence != 2 {
		t.Fatalf("observed = %#v", observed)
	}
	facts, err := reader.Facts(ctx, recording.CursorRange{
		First: recording.Cursor{Epoch: 1, Sequence: 1},
		Last:  recording.Cursor{Epoch: 1, Sequence: 2},
	}, []recording.FactType{recording.FactLapCompleted})
	if err != nil {
		t.Fatalf("Facts() error = %v", err)
	}
	if len(facts) != 1 || facts[0].FactSequence != 1 {
		t.Fatalf("facts = %#v", facts)
	}
	if err := reader.Close(); err != nil {
		t.Fatalf("reader.Close() error = %v", err)
	}
	if _, err := writer.Complete(ctx); err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close() error = %v", err)
	}

	summary, err := store.Inspect(ctx, ref)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if summary.EffectiveIntegrity != recording.IntegrityComplete ||
		summary.ObservedCount != 2 || summary.FactCount != 1 || summary.Bytes <= 0 ||
		summary.Manifest.PersistedAcceptedCursor != second.Accepted ||
		summary.Manifest.CommittedCursor != second.Accepted {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestStoreRoundTripAndRecoveryUnderEncodedUnicodePath(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := filepath.Join(t.TempDir(), "folder # 100% telemetría 測試")
	ref, manifest := testSession(root)
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	candidate := batch(1, 1, true)
	if _, err := writer.Append(ctx, candidate); err != nil {
		t.Fatalf("Append() error = %v", err)
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		t.Fatalf("Checkpoint() error = %v", err)
	}
	reader, err := store.OpenReader(ctx, ref)
	if err != nil {
		t.Fatalf("OpenReader() error = %v", err)
	}
	observed, err := reader.Observed(ctx, recording.CursorRange{
		First: candidate.Accepted,
		Last:  candidate.Accepted,
	})
	if err != nil || len(observed) != 1 {
		t.Fatalf("Observed() = %d, %v", len(observed), err)
	}
	if err := reader.Close(); err != nil {
		t.Fatalf("reader.Close() error = %v", err)
	}
	if _, err := writer.Complete(ctx); err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close() error = %v", err)
	}
	if _, err := store.Inspect(ctx, ref); err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	report, err := store.RecoverCopy(ctx, ref)
	if err != nil {
		t.Fatalf("RecoverCopy() error = %v", err)
	}
	if _, err := store.Inspect(ctx, report.Recovered); err != nil {
		t.Fatalf("Inspect(recovered) error = %v", err)
	}
	dsn := writableDSN(filepath.Join(root, ref.SessionID, manifest.ActiveDatabase))
	for _, encoded := range []string{"%23", "%25", "%20"} {
		if !strings.Contains(dsn, encoded) {
			t.Fatalf("DSN %q does not contain %s", dsn, encoded)
		}
	}
}

func TestBatchBoundsUsesObservedCursorAndAllTimestamps(t *testing.T) {
	t.Parallel()
	candidate := batch(7, 1, false)
	candidate.Observed[0].CapturedAtUTC = testTime(20)
	candidate.Facts = []recording.RecordingFactV1{
		validSQLiteFact(7, testTime(10)),
		validSQLiteFact(8, testTime(30)),
	}
	first, last, firstAt, lastAt := batchBounds(candidate)
	wantCursor := recording.Cursor{Epoch: 1, Sequence: 7}
	if first != wantCursor || last != wantCursor ||
		!firstAt.Equal(testTime(10)) || !lastAt.Equal(testTime(30)) {
		t.Fatalf("batchBounds() = %#v %#v %s %s", first, last, firstAt, lastAt)
	}
}

func TestReaderAllowsEveryKnownFactTypeWithIndependentSequence(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	ref, manifest := testSession(root)
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	candidate := batch(1, 1, false)
	var known []recording.FactType
	for factType := recording.FactLapCompleted; factType <= recording.FactConnectionRecovered; factType++ {
		known = append(known, factType)
		fact := validSQLiteFact(uint64(len(known)), testTime(uint64(len(known))))
		fact.FactType = factType
		fact.CausalSnapshotSequence = 1
		candidate.Facts = append(candidate.Facts, fact)
	}
	if _, err := writer.Append(ctx, candidate); err != nil {
		t.Fatalf("Append() error = %v", err)
	}
	if _, err := writer.Complete(ctx); err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	reader, err := store.OpenReader(ctx, ref)
	if err != nil {
		t.Fatalf("OpenReader() error = %v", err)
	}
	defer reader.Close()
	facts, err := reader.Facts(ctx, recording.CursorRange{
		First: recording.Cursor{Epoch: 1, Sequence: 1},
		Last:  recording.Cursor{Epoch: 1, Sequence: uint64(len(known))},
	}, known)
	if err != nil {
		t.Fatalf("Facts() error = %v", err)
	}
	if len(facts) != len(known) {
		t.Fatalf("facts count = %d, want %d", len(facts), len(known))
	}
	for index, fact := range facts {
		if fact.FactType != known[index] || fact.FactSequence != uint64(index+1) {
			t.Fatalf("facts[%d] = %#v", index, fact)
		}
	}
}

func validSQLiteFact(sequence uint64, occurred time.Time) recording.RecordingFactV1 {
	return recording.RecordingFactV1{
		Version:                recording.RecordingVersionV1,
		Channel:                recording.ChannelFact,
		Epoch:                  1,
		FactSequence:           sequence,
		OccurredAtUTC:          occurred,
		CausalSnapshotSequence: 7,
		FactType:               recording.FactLapCompleted,
		SessionSlot:            1,
		Presence:               recording.PresenceFactValue,
		Quality:                recording.QualityCurrent,
	}
}

func TestStoreRejectsSessionReuseAndRecoveryWhileWriterIsActive(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	ref, manifest := testSession(root)
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	if _, err := store.RecoverCopy(ctx, ref); !errors.Is(err, ErrSessionActive) {
		t.Fatalf("RecoverCopy(active) error = %v, want active session", err)
	}
	if _, err := New(Options{}).Begin(ctx, ref, manifest); !errors.Is(err, ErrSessionActive) {
		t.Fatalf("Begin(active from second store) error = %v, want active session", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if _, err := store.Begin(ctx, ref, manifest); !errors.Is(err, ErrSessionExists) {
		t.Fatalf("Begin(closed existing) error = %v, want existing session", err)
	}
}

func TestSessionLeaseIsExclusiveAcrossProcessesAndReleasedOnExit(t *testing.T) {
	if os.Getenv("VANTARE_SQLITE_LEASE_HELPER") == "1" {
		root := os.Getenv("VANTARE_SQLITE_LEASE_ROOT")
		ref, manifest := testSession(root)
		writer, err := New(Options{}).Begin(context.Background(), ref, manifest)
		if err != nil {
			panic(err)
		}
		fmt.Println("READY")
		_, _ = io.Copy(io.Discard, os.Stdin)
		_ = writer
		os.Exit(0)
		return
	}
	if runtime.GOOS != "windows" {
		t.Skip("kernel-release crash semantics are specific to the Windows product lease")
	}

	root := t.TempDir()
	ref, manifest := testSession(root)
	command := exec.Command(os.Args[0], "-test.run=^TestSessionLeaseIsExclusiveAcrossProcessesAndReleasedOnExit$")
	command.Env = append(os.Environ(),
		"VANTARE_SQLITE_LEASE_HELPER=1",
		"VANTARE_SQLITE_LEASE_ROOT="+root,
	)
	stdin, err := command.StdinPipe()
	if err != nil {
		t.Fatalf("StdinPipe() error = %v", err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatalf("StdoutPipe() error = %v", err)
	}
	if err := command.Start(); err != nil {
		t.Fatalf("Start helper error = %v", err)
	}
	scanner := bufio.NewScanner(stdout)
	if !scanner.Scan() || scanner.Text() != "READY" {
		t.Fatalf("helper readiness = %q, error = %v", scanner.Text(), scanner.Err())
	}
	store := New(Options{})
	if _, err := store.Begin(context.Background(), ref, manifest); !errors.Is(err, ErrSessionActive) {
		t.Fatalf("Begin(cross-process active) error = %v", err)
	}
	if _, err := store.RecoverCopy(context.Background(), ref); !errors.Is(err, ErrSessionActive) {
		t.Fatalf("RecoverCopy(cross-process active) error = %v", err)
	}
	if err := stdin.Close(); err != nil {
		t.Fatalf("close helper stdin: %v", err)
	}
	if err := command.Wait(); err != nil {
		t.Fatalf("helper wait error = %v", err)
	}
	if _, err := store.RecoverCopy(context.Background(), ref); err != nil {
		t.Fatalf("RecoverCopy(after process exit) error = %v", err)
	}
	if _, err := store.Begin(context.Background(), ref, manifest); !errors.Is(err, ErrSessionExists) {
		t.Fatalf("Begin(after process release) error = %v, want existing session", err)
	}
}

func TestStoreRejectsMismatchedSessionAndNegativeStorageLimit(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	ref, manifest := testSession(root)
	manifest.SessionID = "different-session-0002"
	if _, err := New(Options{}).Begin(context.Background(), ref, manifest); !errors.Is(err, recording.ErrInvalidRecording) {
		t.Fatalf("Begin(mismatched session) error = %v, want invalid recording", err)
	}

	ref, manifest = testSession(t.TempDir())
	if _, err := New(Options{MaxSessionBytes: -1}).Begin(context.Background(), ref, manifest); !errors.Is(err, recording.ErrInvalidRecording) {
		t.Fatalf("Begin(negative storage limit) error = %v, want invalid recording", err)
	}
}

func TestStoreFaultsNeverCreatePartialChunkAndRemainIncomplete(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name  string
		point FaultPoint
		err   error
	}{
		{name: "disk full before commit", point: FaultBeforeCommit, err: syscall.ENOSPC},
		{name: "write failure before append", point: FaultBeforeAppend},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			root := t.TempDir()
			ref, manifest := testSession(root)
			fault := &switchFault{}
			fault.err = test.err
			store := New(Options{Fault: fault, Clock: fixedClock{now: testTime(0)}})
			writer, err := store.Begin(ctx, ref, manifest)
			if err != nil {
				t.Fatalf("Begin() error = %v", err)
			}
			t.Cleanup(func() { _ = writer.Close() })
			fault.Set(test.point)
			candidate := batch(1, 1, true)
			if _, err := writer.Append(ctx, candidate); !errors.Is(err, test.err) && !errors.Is(err, errInjected) {
				t.Fatalf("Append() error = %v", err)
			}
			fault.Set("")
			if err := writer.Abort(ctx, recording.IncompleteStorageFailure, candidate.Accepted); err != nil {
				t.Fatalf("Abort() error = %v", err)
			}
			if err := writer.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
			summary, err := store.Inspect(ctx, ref)
			if err != nil {
				t.Fatalf("Inspect() error = %v", err)
			}
			if summary.ObservedCount != 0 || summary.FactCount != 0 ||
				summary.EffectiveIntegrity != recording.IntegrityIncomplete ||
				!summary.Manifest.PersistedAcceptedCursor.IsZero() ||
				!summary.Manifest.CommittedCursor.IsZero() {
				t.Fatalf("summary = %#v", summary)
			}
		})
	}
}

func TestCoordinatorWithSQLiteDiskFullStopsRecordingWithoutBlockingPublisher(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	ref, manifest := testSession(root)
	fault := &switchFault{err: syscall.ENOSPC}
	store := New(Options{Fault: fault})
	coordinator, err := recording.NewCoordinator(store, ref, manifest, recording.CoordinatorConfig{QueueCapacity: 4})
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	if err := coordinator.Start(context.Background()); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	fault.Set(FaultBeforeCommit)
	started := time.Now()
	if err := coordinator.TryAccept(batch(1, 1, false)); err != nil {
		t.Fatalf("TryAccept() error = %v", err)
	}
	if elapsed := time.Since(started); elapsed > 50*time.Millisecond {
		t.Fatalf("TryAccept() blocked live for %v", elapsed)
	}
	stopContext, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := coordinator.Stop(stopContext); !errors.Is(err, syscall.ENOSPC) {
		t.Fatalf("Stop() error = %v, want disk full", err)
	}
	status := coordinator.Status()
	if status.State != recording.StateIncomplete || status.Failure != recording.FailureStorage {
		t.Fatalf("status = %#v", status)
	}
	fault.Set("")
	summary, err := store.Inspect(context.Background(), ref)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if summary.EffectiveIntegrity != recording.IntegrityIncomplete ||
		summary.ObservedCount != 0 || !summary.Manifest.PersistedAcceptedCursor.IsZero() {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestAbortDoesNotPromoteVolatileAcceptedToPersistedWatermark(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	ref, manifest := testSession(root)
	store := New(Options{Clock: fixedClock{now: testTime(0)}})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	first := batch(1, 1, false)
	if _, err := writer.Append(ctx, first); err != nil {
		t.Fatalf("Append(first) error = %v", err)
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		t.Fatalf("Checkpoint() error = %v", err)
	}
	second := batch(2, 1, false)
	if _, err := writer.Append(ctx, second); err != nil {
		t.Fatalf("Append(second) error = %v", err)
	}
	volatileAhead := recording.Cursor{Epoch: 1, Sequence: 3}
	if err := writer.Abort(ctx, recording.IncompleteQueueFull, volatileAhead); err != nil {
		t.Fatalf("Abort() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	summary, err := store.Inspect(ctx, ref)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if summary.Manifest.PersistedAcceptedCursor != first.Accepted ||
		summary.Manifest.CommittedCursor != second.Accepted ||
		summary.Manifest.PersistedAcceptedCursor == volatileAhead {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestStorageLimitStopsWithoutDeletingCommittedData(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	ref, manifest := testSession(root)
	store := New(Options{MaxSessionBytes: 1})
	writer, err := store.Begin(context.Background(), ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	candidate := batch(1, 1, false)
	committed, err := writer.Append(context.Background(), candidate)
	if !errors.Is(err, ErrStorageLimit) || committed != candidate.Accepted {
		t.Fatalf("Append() = %#v, %v, want committed cursor plus storage limit", committed, err)
	}
	if err := writer.Abort(context.Background(), recording.IncompleteStorageFailure, candidate.Accepted); err != nil {
		t.Fatalf("Abort() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	summary, err := store.Inspect(context.Background(), ref)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if summary.ObservedCount != 1 || summary.Manifest.CommittedCursor != candidate.Accepted ||
		summary.EffectiveIntegrity != recording.IntegrityIncomplete {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestManifestPermissionFailureIsObservableAndRecoverable(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	ref, manifest := testSession(root)
	files := &failingFiles{}
	store := New(Options{Files: files, Clock: fixedClock{now: testTime(0)}})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	candidate := batch(1, 1, false)
	if _, err := writer.Append(ctx, candidate); err != nil {
		t.Fatalf("Append() error = %v", err)
	}
	files.fail.Store(true)
	if _, err := writer.Checkpoint(ctx); !errors.Is(err, os.ErrPermission) {
		t.Fatalf("Checkpoint() error = %v", err)
	}
	files.fail.Store(false)
	if err := writer.Abort(ctx, recording.IncompletePermissionDenied, candidate.Accepted); err != nil {
		t.Fatalf("Abort() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	summary, err := store.Inspect(ctx, ref)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if summary.EffectiveIntegrity != recording.IntegrityIncomplete ||
		summary.Manifest.IncompleteReason != recording.IncompletePermissionDenied ||
		summary.ObservedCount != 1 {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestManifestOperationsHonorContextWithoutLateWriteOrTempLeak(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		run  func(context.Context, recording.SessionWriter) error
	}{
		{name: "checkpoint", run: func(ctx context.Context, writer recording.SessionWriter) error {
			_, err := writer.Checkpoint(ctx)
			return err
		}},
		{name: "complete", run: func(ctx context.Context, writer recording.SessionWriter) error {
			_, err := writer.Complete(ctx)
			return err
		}},
		{name: "abort", run: func(ctx context.Context, writer recording.SessionWriter) error {
			return writer.Abort(ctx, recording.IncompleteCanceled, recording.Cursor{Epoch: 1, Sequence: 1})
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			ref, manifest := testSession(root)
			files := &cooperativeBlockingFiles{}
			store := New(Options{Files: files})
			writer, err := store.Begin(context.Background(), ref, manifest)
			if err != nil {
				t.Fatalf("Begin() error = %v", err)
			}
			t.Cleanup(func() { _ = writer.Close() })
			if _, err := writer.Append(context.Background(), batch(1, 1, false)); err != nil {
				t.Fatalf("Append() error = %v", err)
			}
			before, err := os.ReadFile(filepath.Join(root, ref.SessionID, manifestName))
			if err != nil {
				t.Fatalf("ReadFile(before) error = %v", err)
			}
			files.block.Store(true)
			ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
			started := time.Now()
			err = test.run(ctx, writer)
			cancel()
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("%s error = %v", test.name, err)
			}
			if elapsed := time.Since(started); elapsed > recording.DefaultCommitBudget {
				t.Fatalf("%s returned after %v", test.name, elapsed)
			}
			files.block.Store(false)
			after, err := os.ReadFile(filepath.Join(root, ref.SessionID, manifestName))
			if err != nil {
				t.Fatalf("ReadFile(after) error = %v", err)
			}
			if string(after) != string(before) {
				t.Fatalf("%s wrote manifest after cancellation", test.name)
			}
			temps, err := filepath.Glob(filepath.Join(root, ref.SessionID, manifestName+".tmp-*"))
			if err != nil || len(temps) != 0 {
				t.Fatalf("manifest temps = %v, error = %v", temps, err)
			}
			if err := writer.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
		})
	}
}

func TestCrashBoundariesPreserveManifestTruthAndRecoveryCopy(t *testing.T) {
	if os.Getenv("VANTARE_SQLITE_CRASH_HELPER") == "1" {
		runCrashHelper()
		return
	}
	tests := []struct {
		point         FaultPoint
		wantObserved  uint64
		wantPersisted recording.Cursor
	}{
		{point: FaultBeforeAppend},
		{point: FaultBeforeCommit},
		{point: FaultAfterCommit, wantObserved: 1},
		{point: FaultAfterManifest, wantObserved: 1, wantPersisted: recording.Cursor{Epoch: 1, Sequence: 1}},
	}
	for _, test := range tests {
		t.Run(string(test.point), func(t *testing.T) {
			root := t.TempDir()
			command := exec.Command(os.Args[0], "-test.run=^TestCrashBoundariesPreserveManifestTruthAndRecoveryCopy$")
			command.Env = append(os.Environ(),
				"VANTARE_SQLITE_CRASH_HELPER=1",
				"VANTARE_SQLITE_CRASH_ROOT="+root,
				"VANTARE_SQLITE_CRASH_POINT="+string(test.point),
			)
			err := command.Run()
			var exit *exec.ExitError
			if !errors.As(err, &exit) || exit.ExitCode() != 88 {
				t.Fatalf("crash helper error = %v", err)
			}
			ref, _ := testSession(root)
			store := New(Options{})
			summary, err := store.Inspect(context.Background(), ref)
			if err != nil {
				t.Fatalf("Inspect() error = %v", err)
			}
			if summary.EffectiveIntegrity != recording.IntegrityIncomplete ||
				summary.ObservedCount != test.wantObserved ||
				summary.Manifest.PersistedAcceptedCursor != test.wantPersisted {
				t.Fatalf("summary = %#v", summary)
			}
			report, err := store.RecoverCopy(context.Background(), ref)
			if err != nil {
				t.Fatalf("RecoverCopy() error = %v", err)
			}
			if report.OriginalSHA256 == "" || report.RecoveredSHA256 == "" ||
				report.Manifest.IntegrityState != recording.IntegrityIncomplete ||
				report.Manifest.AccessMode != recording.AccessReadOnly {
				t.Fatalf("recovery report = %#v", report)
			}
			recoveredSummary, err := store.Inspect(context.Background(), report.Recovered)
			if err != nil {
				t.Fatalf("Inspect(recovered) error = %v", err)
			}
			if recoveredSummary.ObservedCount != test.wantObserved {
				t.Fatalf("recovered summary = %#v", recoveredSummary)
			}
		})
	}
}

func TestStoreFourXGridPreservesCountsAndOrdering(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	root := t.TempDir()
	ref, manifest := testSession(root)
	store := New(Options{Clock: fixedClock{now: testTime(0)}})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	const records = 400
	for sequence := uint64(1); sequence <= records; sequence++ {
		if _, err := writer.Append(ctx, batch(sequence, 64, sequence%10 == 0)); err != nil {
			t.Fatalf("Append(%d) error = %v", sequence, err)
		}
		if sequence%100 == 0 {
			if _, err := writer.Checkpoint(ctx); err != nil {
				t.Fatalf("Checkpoint(%d) error = %v", sequence, err)
			}
		}
	}
	if _, err := writer.Complete(ctx); err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	summary, err := store.Inspect(ctx, ref)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if summary.ObservedCount != records || summary.FactCount != records/10 ||
		summary.Manifest.PersistedAcceptedCursor != (recording.Cursor{Epoch: 1, Sequence: records}) {
		t.Fatalf("summary = %#v", summary)
	}
	t.Logf("growth: records=%d vehicles=64 bytes=%d bytes_per_snapshot=%.1f",
		records, summary.Bytes, float64(summary.Bytes)/records)
	reader, err := store.OpenReader(ctx, ref)
	if err != nil {
		t.Fatalf("OpenReader() error = %v", err)
	}
	defer reader.Close()
	observed, err := reader.Observed(ctx, recording.CursorRange{
		First: recording.Cursor{Epoch: 1, Sequence: 1},
		Last:  recording.Cursor{Epoch: 1, Sequence: records},
	})
	if err != nil {
		t.Fatalf("Observed() error = %v", err)
	}
	for index, payload := range observed {
		if payload.Sequence != uint64(index+1) || len(payload.Vehicles) != 64 {
			t.Fatalf("observed[%d] = %#v", index, payload)
		}
	}
}

func TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	ref, manifest := testSession(root)
	store := New(Options{})
	coordinator, err := recording.NewCoordinator(store, ref, manifest, recording.CoordinatorConfig{
		QueueCapacity: 128,
	})
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	if err := coordinator.Start(context.Background()); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	for sequence := uint64(1); sequence <= 100; sequence++ {
		if err := coordinator.TryAccept(batch(sequence, 1, sequence%10 == 0)); err != nil {
			t.Fatalf("TryAccept(%d) error = %v", sequence, err)
		}
	}
	// Bajo carga paralela el commit puede tardar; espera acotada a que el
	// coordinator vacíe la cola por el camino normal antes de Stop, evitando
	// que el drain de Stop tenga que hacer todo el trabajo bajo CommitBudget.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if coordinator.Status().CommittedBatches == 100 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	stopCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := coordinator.Stop(stopCtx); err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
	status := coordinator.Status()
	if status.State != recording.StateComplete || status.AcceptedBatches != 100 ||
		status.CommittedBatches != 100 || status.BackendCommitted != (recording.Cursor{Epoch: 1, Sequence: 100}) {
		t.Fatalf("status = %#v", status)
	}
	summary, err := store.Inspect(context.Background(), ref)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if summary.ObservedCount != 100 || summary.FactCount != 10 ||
		summary.EffectiveIntegrity != recording.IntegrityComplete {
		t.Fatalf("summary = %#v", summary)
	}
	original := filepath.Join(root, ref.SessionID)
	moved := filepath.Join(root, "released-session")
	// En Windows el handle de SQLite/lease puede liberarse de forma
	// eventualmente consistente. Reintento acotado sin sleep arbitrario
	// largo: polling 1s para distinguir fuga real de cierre tardío.
	var renameErr error
	for attempt := 0; attempt < 50; attempt++ {
		renameErr = os.Rename(original, moved)
		if renameErr == nil {
			break
		}
		// Solo reintenta errores de handle abierto; otros fallan rápido.
		if !errors.Is(renameErr, os.ErrPermission) && !isWindowsSharingViolation(renameErr) {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if renameErr != nil {
		t.Fatalf("rename closed session (leaked handle): %v", renameErr)
	}
}

func isWindowsSharingViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "being used by another process") ||
		strings.Contains(msg, "The process cannot access the file")
}

func BenchmarkSQLiteAppend64Vehicles(b *testing.B) {
	root := b.TempDir()
	ref, manifest := testSession(root)
	store := New(Options{})
	writer, err := store.Begin(context.Background(), ref, manifest)
	if err != nil {
		b.Fatalf("Begin() error = %v", err)
	}
	b.Cleanup(func() { _ = writer.Close() })
	var sequence uint64
	b.ReportAllocs()
	for b.Loop() {
		sequence++
		if _, err := writer.Append(context.Background(), batch(sequence, 64, sequence%10 == 0)); err != nil {
			b.Fatalf("Append() error = %v", err)
		}
	}
}

type fixedClock struct{ now time.Time }

func (c fixedClock) Now() time.Time { return c.now }

type exitFault struct {
	active atomic.Bool
	point  FaultPoint
}

func (f *exitFault) Check(point FaultPoint) error {
	if f.active.Load() && point == f.point {
		os.Exit(88)
	}
	return nil
}

func runCrashHelper() {
	root := os.Getenv("VANTARE_SQLITE_CRASH_ROOT")
	point := FaultPoint(os.Getenv("VANTARE_SQLITE_CRASH_POINT"))
	ref, manifest := testSession(root)
	fault := &exitFault{point: point}
	store := New(Options{Fault: fault, Clock: fixedClock{now: testTime(0)}})
	writer, err := store.Begin(context.Background(), ref, manifest)
	if err != nil {
		panic(err)
	}
	fault.active.Store(true)
	candidate := batch(1, 1, false)
	if point == FaultAfterManifest {
		fault.active.Store(false)
		if _, err := writer.Append(context.Background(), candidate); err != nil {
			panic(err)
		}
		fault.active.Store(true)
		_, _ = writer.Checkpoint(context.Background())
	} else {
		_, _ = writer.Append(context.Background(), candidate)
	}
	os.Exit(89)
}

func testSession(root string) (recording.SessionRef, recording.SessionManifest) {
	const sessionID = "session-local-0001"
	return recording.SessionRef{Root: root, SessionID: sessionID},
		recording.NewSessionManifest(sessionID, "lmu", "test-build", testTime(0))
}

func batch(sequence uint64, vehicles int, withFact bool) recording.RecordingBatch {
	samples := make([]recording.RecordingVehicleV1, vehicles)
	for index := range samples {
		samples[index] = recording.RecordingVehicleV1{
			SessionSlot: uint16(index + 1),
			SpeedMS:     50 + float64(index),
			Throttle:    0.75,
			Brake:       0.1,
			Gear:        5,
			Presence:    15,
			Quality:     recording.QualityCurrent,
		}
	}
	result := recording.RecordingBatch{
		Observed: []recording.RecordingPayloadV1{{
			Version:       recording.RecordingVersionV1,
			Channel:       recording.ChannelObserved,
			Epoch:         1,
			Sequence:      sequence,
			CapturedAtUTC: testTime(sequence),
			Vehicles:      samples,
		}},
		Accepted: recording.Cursor{Epoch: 1, Sequence: sequence},
	}
	if withFact {
		factSequence := sequence
		if sequence%10 == 0 {
			factSequence = sequence / 10
		}
		result.Facts = []recording.RecordingFactV1{{
			Version:                recording.RecordingVersionV1,
			Channel:                recording.ChannelFact,
			Epoch:                  1,
			FactSequence:           factSequence,
			OccurredAtUTC:          testTime(sequence),
			CausalSnapshotSequence: sequence,
			FactType:               recording.FactLapCompleted,
			SessionSlot:            1,
			Value:                  float64(sequence),
			Presence:               recording.PresenceFactValue,
			Quality:                recording.QualityCurrent,
		}}
	}
	return result
}

func testTime(sequence uint64) time.Time {
	return time.Date(2026, 7, 30, 10, 0, 0, int(sequence)*1_000_000, time.UTC)
}

func TestSessionDirectoryRejectsTraversal(t *testing.T) {
	t.Parallel()
	for _, sessionID := range []string{"../outside", `..\outside`, "short", "session/child"} {
		t.Run(strconv.Quote(sessionID), func(t *testing.T) {
			if _, err := sessionDirectory(recording.SessionRef{Root: t.TempDir(), SessionID: sessionID}); !errors.Is(err, recording.ErrInvalidRecording) {
				t.Fatalf("sessionDirectory(%q) error = %v", sessionID, err)
			}
		})
	}
}

func TestManifestEnvelopeRejectsPathEscapeAndSessionMismatch(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		session  string
		database string
		schema   recording.Version
	}{
		{name: "traversal", session: "session-local-0001", database: "../outside.sqlite", schema: 2},
		{name: "absolute", session: "session-local-0001", database: filepath.Join(t.TempDir(), "outside.sqlite"), schema: 2},
		{name: "session mismatch", session: "session-other-0002", database: "history-v2.sqlite", schema: 2},
		{name: "schema filename mismatch", session: "session-local-0001", database: "history-v3.sqlite", schema: 2},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			ref, _ := testSession(root)
			writeFutureManifest(t, ref, test.session, test.database, test.schema)
			store := New(Options{})
			if _, err := store.Inspect(context.Background(), ref); !errors.Is(err, recording.ErrInvalidManifest) {
				t.Fatalf("Inspect() error = %v, want invalid manifest", err)
			}
			if _, err := store.OpenReader(context.Background(), ref); !errors.Is(err, recording.ErrInvalidManifest) {
				t.Fatalf("OpenReader() error = %v, want invalid manifest", err)
			}
			if _, err := store.RecoverCopy(context.Background(), ref); !errors.Is(err, recording.ErrInvalidManifest) {
				t.Fatalf("RecoverCopy() error = %v, want invalid manifest", err)
			}
		})
	}
}

func TestFutureManifestIsMetadataOnlyAndNeverOpenedOrRecovered(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	ref, _ := testSession(root)
	writeFutureManifest(t, ref, ref.SessionID, "history-v2.sqlite", 2)
	store := New(Options{})
	summary, err := store.Inspect(context.Background(), ref)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if summary.CountsKnown || summary.Bytes != 0 || summary.Manifest.AccessMode != recording.AccessReadOnly {
		t.Fatalf("summary = %#v", summary)
	}
	if _, err := store.OpenReader(context.Background(), ref); !errors.Is(err, ErrFutureManifest) {
		t.Fatalf("OpenReader() error = %v, want future manifest", err)
	}
	if _, err := store.RecoverCopy(context.Background(), ref); !errors.Is(err, ErrFutureManifest) {
		t.Fatalf("RecoverCopy() error = %v, want future manifest", err)
	}
	if _, err := store.OpenHistoricalReplay(context.Background(), ref); !errors.Is(err, ErrFutureManifest) {
		t.Fatalf("OpenHistoricalReplay() error = %v, want future manifest", err)
	}
}

func TestFutureSchemaUnderCurrentManifestIsMetadataOnly(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	ref, _ := testSession(root)
	sessionDir := filepath.Join(ref.Root, ref.SessionID)
	if err := os.MkdirAll(sessionDir, 0o700); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	document := map[string]any{
		"manifestVersion":        recording.ManifestVersionV1,
		"recordingSchemaVersion": recording.RecordingVersionV1 + 1,
		"activeDatabase":         "history-v2.sqlite",
		"sessionID":              ref.SessionID,
		"simulatorID":            "lmu",
		"appBuild":               "future-build",
		"integrityState":         recording.IntegrityComplete,
		"accessMode":             recording.AccessReadOnly,
		"startedAtUTC":           testTime(0),
		"futureField":            "must-not-be-interpreted",
		"rawCapture":             map[string]any{"state": "disabled"},
	}
	encoded, err := json.Marshal(document)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(sessionDir, manifestName), encoded, 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	store := New(Options{})
	summary, err := store.Inspect(context.Background(), ref)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if summary.CountsKnown || summary.Manifest.RecordingSchemaVersion != 2 ||
		summary.Manifest.AccessMode != recording.AccessReadOnly {
		t.Fatalf("summary = %#v", summary)
	}
	if _, err := store.OpenReader(context.Background(), ref); !errors.Is(err, ErrFutureManifest) {
		t.Fatalf("OpenReader() error = %v, want future manifest", err)
	}
	if _, err := store.OpenHistoricalReplay(context.Background(), ref); !errors.Is(err, ErrFutureManifest) {
		t.Fatalf("OpenHistoricalReplay() error = %v, want future manifest", err)
	}
	if _, err := store.RecoverCopy(context.Background(), ref); !errors.Is(err, ErrFutureManifest) {
		t.Fatalf("RecoverCopy() error = %v, want future manifest", err)
	}
}

func writeFutureManifest(
	t *testing.T,
	ref recording.SessionRef,
	sessionID, database string,
	schema recording.Version,
) {
	t.Helper()
	sessionDir := filepath.Join(ref.Root, ref.SessionID)
	if err := os.MkdirAll(sessionDir, 0o700); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	manifest := recording.NewSessionManifest(sessionID, "lmu", "future-build", testTime(0))
	manifest.ManifestVersion = recording.ManifestVersionV1 + 1
	manifest.RecordingSchemaVersion = schema
	manifest.ActiveDatabase = database
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(sessionDir, manifestName), encoded, 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

func TestManifestAndDatabaseUsePrivatePermissionsWhereSupported(t *testing.T) {
	t.Parallel()
	if runtime.GOOS == "windows" {
		t.Skip("Windows ACLs are governed by the user's private application-data directory; mode bits are not authoritative")
	}
	root := t.TempDir()
	ref, manifest := testSession(root)
	store := New(Options{})
	writer, err := store.Begin(context.Background(), ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	for _, name := range []string{manifestName, recording.ActiveDatabaseV1} {
		info, err := os.Stat(filepath.Join(root, ref.SessionID, name))
		if err != nil {
			t.Fatalf("Stat(%s) error = %v", name, err)
		}
		if got := info.Mode().Perm(); got&0o077 != 0 {
			t.Fatalf("%s permissions = %s, want private", name, got)
		}
	}
}

func ExampleStore() {
	fmt.Println("SQLite recording is private behind recording.HistoricalStore")
	// Output: SQLite recording is private behind recording.HistoricalStore
}
