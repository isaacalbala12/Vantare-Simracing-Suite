package recording

import (
	"context"
	"errors"
	"runtime"
	"sync"
	"testing"
	"time"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(duration time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(duration)
	c.mu.Unlock()
}

type fakeStore struct {
	writer *fakeWriter
	err    error
}

func (s *fakeStore) Begin(context.Context, SessionRef, SessionManifest) (SessionWriter, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.writer, nil
}
func (*fakeStore) Inspect(context.Context, SessionRef) (SessionSummary, error) {
	return SessionSummary{}, nil
}
func (*fakeStore) OpenReader(context.Context, SessionRef) (SessionReader, error) {
	return nil, nil
}
func (*fakeStore) RecoverCopy(context.Context, SessionRef) (RecoveryReport, error) {
	return RecoveryReport{}, nil
}

type fakeWriter struct {
	mu             sync.Mutex
	clock          *fakeClock
	appendDelay    time.Duration
	appendBlock    chan struct{}
	appendStarted  chan struct{}
	appendErr      error
	checkErr       error
	checkWatermark *PersistedWatermark
	appendWait     bool
	checkWait      bool
	completeWait   bool
	last           Cursor
	accepted       Cursor
	appends        int
	aborted        IncompleteReason
	abortBlock     bool
	abortCanceled  chan struct{}
	closed         int
	completes      int
}

func (w *fakeWriter) Append(ctx context.Context, batch RecordingBatch) (Cursor, error) {
	if w.appendStarted != nil {
		select {
		case w.appendStarted <- struct{}{}:
		default:
		}
	}
	if w.appendBlock != nil {
		<-w.appendBlock
	}
	if w.appendWait {
		<-ctx.Done()
		return Cursor{}, ctx.Err()
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.clock != nil {
		w.clock.Advance(w.appendDelay)
	}
	if w.appendErr != nil {
		return Cursor{}, w.appendErr
	}
	w.last = batch.Accepted
	w.accepted = batch.Accepted
	w.appends++
	return w.last, nil
}
func (w *fakeWriter) Checkpoint(ctx context.Context) (PersistedWatermark, error) {
	if w.checkWait {
		<-ctx.Done()
		return PersistedWatermark{}, ctx.Err()
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.checkErr != nil {
		return PersistedWatermark{}, w.checkErr
	}
	if w.checkWatermark != nil {
		return *w.checkWatermark, nil
	}
	return PersistedWatermark{Accepted: w.accepted, Committed: w.last, AtUTC: testStart()}, nil
}
func (w *fakeWriter) Complete(ctx context.Context) (PersistedWatermark, error) {
	if w.completeWait {
		<-ctx.Done()
		return PersistedWatermark{}, ctx.Err()
	}
	w.mu.Lock()
	w.completes++
	w.mu.Unlock()
	return w.Checkpoint(context.Background())
}
func (w *fakeWriter) Abort(ctx context.Context, reason IncompleteReason, _ Cursor) error {
	if w.abortBlock {
		<-ctx.Done()
		if w.abortCanceled != nil {
			close(w.abortCanceled)
		}
		return ctx.Err()
	}
	w.mu.Lock()
	w.aborted = reason
	w.mu.Unlock()
	return nil
}
func (w *fakeWriter) Close() error {
	w.mu.Lock()
	w.closed++
	w.mu.Unlock()
	return nil
}

func TestCoordinatorNeverBlocksLiveAndFailsClosedOnFullQueue(t *testing.T) {
	t.Parallel()
	block := make(chan struct{})
	startedAppend := make(chan struct{}, 1)
	writer := &fakeWriter{appendBlock: block, appendStarted: startedAppend}
	coordinator := newTestCoordinator(t, writer, CoordinatorConfig{QueueCapacity: 1})
	if err := coordinator.Start(context.Background()); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if err := coordinator.TryAccept(validBatch(1)); err != nil {
		t.Fatalf("TryAccept(first) error = %v", err)
	}
	select {
	case <-startedAppend:
	case <-time.After(2 * time.Second):
		t.Fatal("writer did not start")
	}
	if err := coordinator.TryAccept(validBatch(2)); err != nil {
		t.Fatalf("TryAccept(second) error = %v", err)
	}
	started := time.Now()
	if err := coordinator.TryAccept(validBatch(3)); !errors.Is(err, ErrQueueFull) {
		t.Fatalf("TryAccept(full) error = %v", err)
	}
	if elapsed := time.Since(started); elapsed > 50*time.Millisecond {
		t.Fatalf("TryAccept(full) blocked for %v", elapsed)
	}
	close(block)
	waitDone(t, coordinator.done)
	status := coordinator.Status()
	if status.State != StateIncomplete || status.Failure != FailureQueue ||
		status.AcceptedBatches != 2 || status.RejectedBatches != 1 {
		t.Fatalf("status = %#v", status)
	}
}

func TestCoordinatorPeriodicCheckpointAndCleanDoubleStop(t *testing.T) {
	t.Parallel()
	ticks := make(chan time.Time, 1)
	writer := &fakeWriter{}
	coordinator := newTestCoordinator(t, writer, CoordinatorConfig{
		QueueCapacity:    4,
		CheckpointSignal: ticks,
	})
	if err := coordinator.Start(context.Background()); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if err := coordinator.TryAccept(validBatch(1)); err != nil {
		t.Fatalf("TryAccept() error = %v", err)
	}
	waitForCondition(t, func() bool { return coordinator.Status().CommittedBatches == 1 })
	ticks <- testStart()
	waitForCondition(t, func() bool { return coordinator.Status().Checkpoints == 1 })
	if got := coordinator.Status().PersistedAccepted; got != (Cursor{Epoch: 1, Sequence: 1}) {
		t.Fatalf("persisted cursor = %#v", got)
	}
	if err := coordinator.Stop(context.Background()); err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
	if err := coordinator.Stop(context.Background()); err != nil {
		t.Fatalf("Stop(second) error = %v", err)
	}
	if status := coordinator.Status(); status.State != StateComplete || status.QueueDepth != 0 {
		t.Fatalf("status = %#v", status)
	}
	writer.mu.Lock()
	defer writer.mu.Unlock()
	if writer.closed != 1 {
		t.Fatalf("Close calls = %d", writer.closed)
	}
}

func TestCoordinatorSlowWriterAndCancellationBecomeIncomplete(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		writer *fakeWriter
		action func(context.CancelFunc)
		want   FailureCode
		reason IncompleteReason
	}{
		{
			name:   "slow writer",
			writer: &fakeWriter{clock: &fakeClock{now: testStart()}, appendDelay: 501 * time.Millisecond},
			action: func(context.CancelFunc) {},
			want:   FailureTimeout,
			reason: IncompleteCommitTimeout,
		},
		{
			name:   "canceled",
			writer: &fakeWriter{},
			action: func(cancel context.CancelFunc) { cancel() },
			want:   FailureCanceled,
			reason: IncompleteCanceled,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			clock := test.writer.clock
			config := CoordinatorConfig{}
			if clock != nil {
				config.Clock = clock
			}
			coordinator := newTestCoordinator(t, test.writer, config)
			if err := coordinator.Start(ctx); err != nil {
				t.Fatalf("Start() error = %v", err)
			}
			if test.name == "slow writer" {
				if err := coordinator.TryAccept(validBatch(1)); err != nil {
					t.Fatalf("TryAccept() error = %v", err)
				}
			}
			test.action(cancel)
			waitDone(t, coordinator.done)
			if status := coordinator.Status(); status.State != StateIncomplete || status.Failure != test.want {
				t.Fatalf("status = %#v", status)
			}
			test.writer.mu.Lock()
			reason := test.writer.aborted
			test.writer.mu.Unlock()
			if reason != test.reason {
				t.Fatalf("abort reason = %q, want %q", reason, test.reason)
			}
		})
	}
}

func TestCoordinatorRejectsNewDataAtVolatileDurabilityLimit(t *testing.T) {
	t.Parallel()
	clock := &fakeClock{now: testStart()}
	writer := &fakeWriter{}
	coordinator := newTestCoordinator(t, writer, CoordinatorConfig{
		Clock:          clock,
		MaxVolatileAge: 2 * time.Second,
	})
	if err := coordinator.Start(context.Background()); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if err := coordinator.TryAccept(validBatch(1)); err != nil {
		t.Fatalf("TryAccept(first) error = %v", err)
	}
	waitForCondition(t, func() bool { return coordinator.Status().CommittedBatches == 1 })

	clock.Advance(2 * time.Second)
	started := time.Now()
	if err := coordinator.TryAccept(validBatch(2)); !errors.Is(err, ErrRPOBudget) {
		t.Fatalf("TryAccept(at RPO limit) error = %v", err)
	}
	if elapsed := time.Since(started); elapsed > 50*time.Millisecond {
		t.Fatalf("TryAccept(at RPO limit) blocked for %v", elapsed)
	}
	waitDone(t, coordinator.done)

	status := coordinator.Status()
	if status.State != StateIncomplete || status.Failure != FailureTimeout ||
		status.AcceptedBatches != 1 || status.RejectedBatches != 1 {
		t.Fatalf("status = %#v", status)
	}
	writer.mu.Lock()
	defer writer.mu.Unlock()
	if writer.aborted != IncompleteCommitTimeout {
		t.Fatalf("abort reason = %q, want %q", writer.aborted, IncompleteCommitTimeout)
	}
}

func TestCoordinatorIdleTimeDoesNotConsumeVolatileDurabilityBudget(t *testing.T) {
	t.Parallel()
	clock := &fakeClock{now: testStart()}
	writer := &fakeWriter{}
	coordinator := newTestCoordinator(t, writer, CoordinatorConfig{
		Clock:          clock,
		MaxVolatileAge: 2 * time.Second,
	})
	if err := coordinator.Start(context.Background()); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	clock.Advance(24 * time.Hour)
	if err := coordinator.TryAccept(validBatch(1)); err != nil {
		t.Fatalf("TryAccept(first after idle) error = %v", err)
	}
	if err := coordinator.Stop(context.Background()); err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
	if status := coordinator.Status(); status.State != StateComplete || status.AcceptedBatches != 1 {
		t.Fatalf("status = %#v", status)
	}
}

func TestCheckpointPartialResetsRPOToOldestUnpersistedAcrossEpochs(t *testing.T) {
	t.Parallel()
	clock := &fakeClock{now: testStart()}
	ticks := make(chan time.Time, 2)
	writer := &fakeWriter{}
	coordinator := newTestCoordinator(t, writer, CoordinatorConfig{
		Clock:            clock,
		MaxVolatileAge:   2 * time.Second,
		CheckpointSignal: ticks,
		QueueCapacity:    8,
	})
	if err := coordinator.Start(context.Background()); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if err := coordinator.TryAccept(validBatch(1)); err != nil {
		t.Fatalf("TryAccept(1) error = %v", err)
	}
	waitForCondition(t, func() bool { return coordinator.Status().CommittedBatches == 1 })
	clock.Advance(time.Second)
	if err := coordinator.TryAccept(validBatch(2)); err != nil {
		t.Fatalf("TryAccept(2) error = %v", err)
	}
	waitForCondition(t, func() bool { return coordinator.Status().CommittedBatches == 2 })
	writer.mu.Lock()
	writer.checkWatermark = &PersistedWatermark{
		Accepted:  Cursor{Epoch: 1, Sequence: 1},
		Committed: Cursor{Epoch: 1, Sequence: 2},
		AtUTC:     testStart().Add(time.Second),
	}
	writer.mu.Unlock()
	ticks <- testStart()
	waitForCondition(t, func() bool { return coordinator.Status().Checkpoints == 1 })

	clock.Advance(1500 * time.Millisecond)
	epochTwo := validBatch(1)
	epochTwo.Observed[0].Epoch = 2
	epochTwo.Accepted = Cursor{Epoch: 2, Sequence: 1}
	if err := coordinator.TryAccept(epochTwo); err != nil {
		t.Fatalf("TryAccept(epoch 2) inherited durable age: %v", err)
	}
	writer.mu.Lock()
	writer.checkWatermark = &PersistedWatermark{
		Accepted:  Cursor{Epoch: 1, Sequence: 2},
		Committed: Cursor{Epoch: 2, Sequence: 1},
		AtUTC:     testStart().Add(2500 * time.Millisecond),
	}
	writer.mu.Unlock()
	ticks <- testStart()
	waitForCondition(t, func() bool { return coordinator.Status().Checkpoints == 2 })
	coordinator.mu.Lock()
	if len(coordinator.pending) != 1 || coordinator.pending[0].cursor != (Cursor{Epoch: 2, Sequence: 1}) {
		pending := append([]pendingBatch(nil), coordinator.pending...)
		coordinator.mu.Unlock()
		t.Fatalf("pending = %#v", pending)
	}
	coordinator.mu.Unlock()
	if err := coordinator.Stop(context.Background()); err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
}

func TestCoordinatorBoundsAbortAndReleasesWriter(t *testing.T) {
	t.Parallel()
	abortCanceled := make(chan struct{})
	writer := &fakeWriter{abortBlock: true, abortCanceled: abortCanceled}
	ctx, cancel := context.WithCancel(context.Background())
	coordinator := newTestCoordinator(t, writer, CoordinatorConfig{CommitBudget: 10 * time.Millisecond})
	if err := coordinator.Start(ctx); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	cancel()
	waitDone(t, coordinator.done)
	select {
	case <-abortCanceled:
	default:
		t.Fatal("Abort did not observe bounded context cancellation")
	}
	status := coordinator.Status()
	if status.State != StateIncomplete || status.Failure != FailureCanceled {
		t.Fatalf("status = %#v", status)
	}
	writer.mu.Lock()
	defer writer.mu.Unlock()
	if writer.closed != 1 {
		t.Fatalf("Close calls = %d, want 1", writer.closed)
	}
}

func TestCoordinatorBoundsEveryWriterOperationWithContext(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		writer *fakeWriter
		run    func(*testing.T, *Coordinator)
	}{
		{
			name:   "append",
			writer: &fakeWriter{appendWait: true},
			run: func(t *testing.T, coordinator *Coordinator) {
				t.Helper()
				if err := coordinator.TryAccept(validBatch(1)); err != nil {
					t.Fatalf("TryAccept() error = %v", err)
				}
			},
		},
		{
			name:   "checkpoint",
			writer: &fakeWriter{checkWait: true},
			run:    func(*testing.T, *Coordinator) {},
		},
		{
			name:   "complete",
			writer: &fakeWriter{completeWait: true},
			run: func(t *testing.T, coordinator *Coordinator) {
				t.Helper()
				coordinator.stopOnce.Do(func() { close(coordinator.stop) })
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ticks := make(chan time.Time, 1)
			config := CoordinatorConfig{
				CommitBudget:     10 * time.Millisecond,
				CheckpointSignal: ticks,
			}
			coordinator := newTestCoordinator(t, test.writer, config)
			if err := coordinator.Start(context.Background()); err != nil {
				t.Fatalf("Start() error = %v", err)
			}
			if test.name == "checkpoint" {
				ticks <- testStart()
			} else {
				test.run(t, coordinator)
			}
			waitDone(t, coordinator.done)
			if status := coordinator.Status(); status.State != StateIncomplete || status.Failure != FailureTimeout {
				t.Fatalf("status = %#v", status)
			}
		})
	}
}

func TestCoordinatorTerminalFailureAlwaysBeatsConcurrentStop(t *testing.T) {
	for iteration := 0; iteration < 100; iteration++ {
		block := make(chan struct{})
		startedAppend := make(chan struct{}, 1)
		writer := &fakeWriter{appendBlock: block, appendStarted: startedAppend}
		coordinator := newTestCoordinator(t, writer, CoordinatorConfig{QueueCapacity: 1})
		if err := coordinator.Start(context.Background()); err != nil {
			t.Fatalf("iteration %d Start() error = %v", iteration, err)
		}
		if err := coordinator.TryAccept(validBatch(1)); err != nil {
			t.Fatalf("iteration %d first accept = %v", iteration, err)
		}
		<-startedAppend
		if err := coordinator.TryAccept(validBatch(2)); err != nil {
			t.Fatalf("iteration %d second accept = %v", iteration, err)
		}
		coordinator.mu.Lock()
		pending := append([]pendingBatch(nil), coordinator.pending...)
		coordinator.mu.Unlock()
		if len(pending) != 2 ||
			pending[0].cursor != (Cursor{Epoch: 1, Sequence: 1}) ||
			pending[1].cursor != (Cursor{Epoch: 1, Sequence: 2}) {
			t.Fatalf("iteration %d pending = %#v", iteration, pending)
		}
		if err := coordinator.TryAccept(validBatch(3)); !errors.Is(err, ErrQueueFull) {
			t.Fatalf("iteration %d third accept = %v", iteration, err)
		}
		stopped := make(chan error, 1)
		go func() { stopped <- coordinator.Stop(context.Background()) }()
		close(block)
		if err := <-stopped; !errors.Is(err, ErrQueueFull) {
			t.Fatalf("iteration %d Stop() error = %v", iteration, err)
		}
		status := coordinator.Status()
		if status.State != StateIncomplete || status.Failure != FailureQueue {
			t.Fatalf("iteration %d status = %#v", iteration, status)
		}
		writer.mu.Lock()
		completes := writer.completes
		writer.mu.Unlock()
		if completes != 0 {
			t.Fatalf("iteration %d Complete calls = %d", iteration, completes)
		}
	}
}

func TestCoordinatorConfigurationRejectsRPOOverTwoSeconds(t *testing.T) {
	t.Parallel()
	writer := &fakeWriter{}
	manifest := NewSessionManifest("session-local-1", "lmu", "test-build", testStart())
	_, err := NewCoordinator(
		&fakeStore{writer: writer},
		SessionRef{Root: t.TempDir(), SessionID: manifest.SessionID},
		manifest,
		CoordinatorConfig{MaxVolatileAge: 2*time.Second + time.Nanosecond},
	)
	if !errors.Is(err, ErrInvalidRecording) {
		t.Fatalf("NewCoordinator() error = %v, want invalid recording", err)
	}
}

func newTestCoordinator(t *testing.T, writer *fakeWriter, config CoordinatorConfig) *Coordinator {
	t.Helper()
	manifest := NewSessionManifest("session-local-1", "lmu", "test-build", testStart())
	coordinator, err := NewCoordinator(
		&fakeStore{writer: writer},
		SessionRef{Root: t.TempDir(), SessionID: manifest.SessionID},
		manifest,
		config,
	)
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	return coordinator
}

func validBatch(sequence uint64) RecordingBatch {
	return RecordingBatch{
		Observed: []RecordingPayloadV1{validPayload(sequence)},
		Accepted: Cursor{Epoch: 1, Sequence: sequence},
	}
}

func testStart() time.Time {
	return time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
}

func waitDone(t *testing.T, done <-chan struct{}) {
	t.Helper()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("coordinator did not finish")
	}
}

func waitForCondition(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		if condition() {
			return
		}
		select {
		case <-deadline:
			t.Fatal("condition did not become true")
		default:
			runtime.Gosched()
		}
	}
}
