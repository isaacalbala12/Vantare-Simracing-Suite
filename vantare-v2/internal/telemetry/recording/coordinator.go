package recording

import (
	"context"
	"errors"
	"os"
	"sync"
	"time"
)

type Coordinator struct {
	store    HistoricalStore
	ref      SessionRef
	manifest SessionManifest
	config   CoordinatorConfig

	mu           sync.Mutex
	status       CoordinatorStatus
	writer       SessionWriter
	queue        chan RecordingBatch
	failure      chan failureRequest
	stop         chan struct{}
	done         chan struct{}
	stopOnce     sync.Once
	runErr       error
	pendingSince time.Time
	pending      []pendingBatch
	terminal     *failureRequest
}

type pendingBatch struct {
	cursor     Cursor
	acceptedAt time.Time
}

type failureRequest struct {
	reason IncompleteReason
	code   FailureCode
	err    error
}

func NewCoordinator(
	store HistoricalStore,
	ref SessionRef,
	manifest SessionManifest,
	config CoordinatorConfig,
) (*Coordinator, error) {
	if store == nil || ref.Root == "" || ref.SessionID != manifest.SessionID {
		return nil, ErrInvalidRecording
	}
	if err := manifest.Validate(); err != nil {
		return nil, err
	}
	normalized, err := config.normalized()
	if err != nil {
		return nil, err
	}
	return &Coordinator{
		store:    store,
		ref:      ref,
		manifest: manifest,
		config:   normalized,
		status: CoordinatorStatus{
			State:         StateIdle,
			QueueCapacity: normalized.QueueCapacity,
		},
		queue:   make(chan RecordingBatch, normalized.QueueCapacity),
		failure: make(chan failureRequest, 1),
		stop:    make(chan struct{}),
		done:    make(chan struct{}),
	}, nil
}

func (c *Coordinator) Start(ctx context.Context) error {
	c.mu.Lock()
	if c.status.State != StateIdle {
		c.mu.Unlock()
		return ErrAlreadyStarted
	}
	c.status.State = StateStopping
	c.mu.Unlock()

	writer, err := c.store.Begin(ctx, c.ref, c.manifest)
	if err != nil {
		c.mu.Lock()
		c.status.State = StateIncomplete
		c.status.Failure = classifyFailure(err)
		c.runErr = err
		c.mu.Unlock()
		close(c.done)
		return err
	}

	c.mu.Lock()
	c.writer = writer
	c.status.State = StateRecording
	c.mu.Unlock()
	go c.run(ctx)
	return nil
}

func (c *Coordinator) TryAccept(batch RecordingBatch) error {
	if err := batch.Validate(); err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.status.State != StateRecording {
		if c.status.State == StateComplete || c.status.State == StateIncomplete {
			return ErrClosed
		}
		return ErrNotRecording
	}
	if !c.status.VolatileAccepted.IsZero() && !c.status.VolatileAccepted.Before(batch.Accepted) {
		return ErrInvalidRecording
	}
	now := c.config.Clock.Now()
	// One batch may be in the writer while QueueCapacity more remain queued.
	if len(c.pending) >= c.config.QueueCapacity+1 {
		c.status.State = StateStopping
		c.status.RejectedBatches++
		c.status.Failure = FailureQueue
		c.requestFailureLocked(failureRequest{
			reason: IncompleteQueueFull,
			code:   FailureQueue,
			err:    ErrQueueFull,
		})
		return ErrQueueFull
	}
	if len(c.pending) > 0 && now.Sub(c.pending[0].acceptedAt) >= c.config.MaxVolatileAge {
		c.status.State = StateStopping
		c.status.RejectedBatches++
		c.status.Failure = FailureTimeout
		c.requestFailureLocked(failureRequest{
			reason: IncompleteCommitTimeout,
			code:   FailureTimeout,
			err:    ErrRPOBudget,
		})
		return ErrRPOBudget
	}
	select {
	case c.queue <- batch:
		c.pending = append(c.pending, pendingBatch{cursor: batch.Accepted, acceptedAt: now})
		c.pendingSince = c.pending[0].acceptedAt
		c.status.VolatileAccepted = batch.Accepted
		c.status.AcceptedBatches++
		c.status.QueueDepth = len(c.queue)
		return nil
	default:
		c.status.State = StateStopping
		c.status.RejectedBatches++
		c.status.Failure = FailureQueue
		c.requestFailureLocked(failureRequest{
			reason: IncompleteQueueFull,
			code:   FailureQueue,
			err:    ErrQueueFull,
		})
		return ErrQueueFull
	}
}

func (c *Coordinator) Stop(ctx context.Context) error {
	c.mu.Lock()
	state := c.status.State
	c.mu.Unlock()
	if state == StateIdle {
		return ErrNotRecording
	}
	c.stopOnce.Do(func() {
		c.mu.Lock()
		if c.status.State == StateRecording {
			c.status.State = StateStopping
		}
		c.mu.Unlock()
		close(c.stop)
	})
	select {
	case <-c.done:
		c.mu.Lock()
		err := c.runErr
		c.mu.Unlock()
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c *Coordinator) Status() CoordinatorStatus {
	c.mu.Lock()
	defer c.mu.Unlock()
	status := c.status
	status.QueueDepth = len(c.queue)
	return status
}

func (c *Coordinator) run(ctx context.Context) {
	defer close(c.done)
	defer func() {
		if err := c.writer.Close(); err != nil {
			c.mu.Lock()
			if c.runErr == nil {
				c.runErr = err
			}
			if c.status.State != StateIncomplete {
				c.status.State = StateIncomplete
				c.status.Failure = classifyFailure(err)
			}
			c.mu.Unlock()
		}
	}()

	var (
		ticker     *time.Ticker
		checkpoint <-chan time.Time
	)
	if c.config.CheckpointSignal != nil {
		checkpoint = c.config.CheckpointSignal
	} else {
		ticker = time.NewTicker(c.config.CheckpointInterval)
		checkpoint = ticker.C
		defer ticker.Stop()
	}

	for {
		select {
		case batch := <-c.queue:
			batch, count := c.collectBatch(batch)
			if !c.append(ctx, batch, count) {
				return
			}
		case request := <-c.failure:
			c.abort(request)
			return
		case <-checkpoint:
			if !c.checkpoint(ctx) {
				return
			}
		case <-c.stop:
			if request, exists := c.terminalRequest(); exists {
				c.abort(request)
				return
			}
			c.drainAndComplete(ctx)
			return
		case <-ctx.Done():
			c.abort(failureRequest{
				reason: IncompleteCanceled,
				code:   FailureCanceled,
				err:    ctx.Err(),
			})
			return
		}
	}
}

func (c *Coordinator) append(ctx context.Context, batch RecordingBatch, batchCount uint64) bool {
	started := c.config.Clock.Now()
	operationContext, cancel := context.WithTimeout(ctx, c.config.CommitBudget)
	committed, err := c.writer.Append(operationContext, batch)
	cancel()
	elapsed := c.config.Clock.Now().Sub(started)
	if err != nil {
		c.abort(failureFromError(err))
		return false
	}
	if elapsed > c.config.CommitBudget {
		c.abort(failureRequest{reason: IncompleteCommitTimeout, code: FailureTimeout, err: ErrCommitBudget})
		return false
	}
	c.mu.Lock()
	c.status.BackendCommitted = committed
	c.status.CommittedBatches += batchCount
	c.status.QueueDepth = len(c.queue)
	c.mu.Unlock()
	return true
}

func (c *Coordinator) checkpoint(ctx context.Context) bool {
	started := c.config.Clock.Now()
	operationContext, cancel := context.WithTimeout(ctx, c.config.CommitBudget)
	watermark, err := c.writer.Checkpoint(operationContext)
	cancel()
	elapsed := c.config.Clock.Now().Sub(started)
	if err != nil {
		c.abort(failureFromError(err))
		return false
	}
	if elapsed > c.config.CommitBudget {
		c.abort(failureRequest{reason: IncompleteCommitTimeout, code: FailureTimeout, err: ErrCommitBudget})
		return false
	}
	c.mu.Lock()
	c.status.PersistedAccepted = watermark.Accepted
	c.status.BackendCommitted = watermark.Committed
	c.status.LastCheckpointAtUTC = watermark.AtUTC
	c.status.Checkpoints++
	c.removePersistedPendingLocked(watermark.Accepted)
	if len(c.pending) == 0 {
		c.pendingSince = time.Time{}
	} else {
		c.pendingSince = c.pending[0].acceptedAt
	}
	c.mu.Unlock()
	return true
}

func (c *Coordinator) removePersistedPendingLocked(persisted Cursor) {
	firstPending := 0
	for firstPending < len(c.pending) && !persisted.Before(c.pending[firstPending].cursor) {
		firstPending++
	}
	if firstPending == 0 {
		return
	}
	copy(c.pending, c.pending[firstPending:])
	c.pending = c.pending[:len(c.pending)-firstPending]
}

func (c *Coordinator) drainAndComplete(ctx context.Context) {
	for {
		if request, exists := c.terminalRequest(); exists {
			c.abort(request)
			return
		}
		select {
		case batch := <-c.queue:
			batch, count := c.collectBatch(batch)
			if !c.append(ctx, batch, count) {
				return
			}
		default:
			started := c.config.Clock.Now()
			operationContext, cancel := context.WithTimeout(ctx, c.config.CommitBudget)
			watermark, err := c.writer.Complete(operationContext)
			cancel()
			elapsed := c.config.Clock.Now().Sub(started)
			if err != nil {
				c.abort(failureFromError(err))
				return
			}
			if elapsed > c.config.CommitBudget {
				c.abort(failureRequest{
					reason: IncompleteCommitTimeout,
					code:   FailureTimeout,
					err:    ErrCommitBudget,
				})
				return
			}
			c.mu.Lock()
			c.status.State = StateComplete
			c.status.PersistedAccepted = watermark.Accepted
			c.status.BackendCommitted = watermark.Committed
			c.status.LastCheckpointAtUTC = watermark.AtUTC
			c.status.QueueDepth = 0
			c.runErr = nil
			c.mu.Unlock()
			return
		}
	}
}

func (c *Coordinator) collectBatch(first RecordingBatch) (RecordingBatch, uint64) {
	const maxBatchesPerTransaction = 64
	combined := RecordingBatch{
		Observed: append([]RecordingPayloadV1(nil), first.Observed...),
		Facts:    append([]RecordingFactV1(nil), first.Facts...),
		Accepted: first.Accepted,
	}
	count := uint64(1)
	for count < maxBatchesPerTransaction {
		select {
		case next := <-c.queue:
			combined.Observed = append(combined.Observed, next.Observed...)
			combined.Facts = append(combined.Facts, next.Facts...)
			combined.Accepted = next.Accepted
			count++
		default:
			return combined, count
		}
	}
	return combined, count
}

func (c *Coordinator) abort(request failureRequest) {
	c.mu.Lock()
	accepted := c.status.VolatileAccepted
	c.mu.Unlock()
	abortContext, cancel := context.WithTimeout(context.Background(), c.config.CommitBudget)
	abortErr := c.writer.Abort(abortContext, request.reason, accepted)
	cancel()
	c.mu.Lock()
	c.status.State = StateIncomplete
	c.status.Failure = request.code
	c.status.QueueDepth = len(c.queue)
	c.runErr = errors.Join(request.err, abortErr)
	c.mu.Unlock()
}

func (c *Coordinator) requestFailureLocked(request failureRequest) {
	if c.terminal == nil {
		candidate := request
		c.terminal = &candidate
	}
	select {
	case c.failure <- request:
	default:
	}
}

func (c *Coordinator) terminalRequest() (failureRequest, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.terminal == nil {
		return failureRequest{}, false
	}
	return *c.terminal, true
}

func classifyFailure(err error) FailureCode {
	if errors.Is(err, os.ErrPermission) {
		return FailurePermission
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, ErrCommitBudget) ||
		errors.Is(err, ErrRPOBudget) {
		return FailureTimeout
	}
	if errors.Is(err, context.Canceled) {
		return FailureCanceled
	}
	if errors.Is(err, ErrQueueFull) {
		return FailureQueue
	}
	return FailureStorage
}

func failureFromError(err error) failureRequest {
	code := classifyFailure(err)
	reason := IncompleteStorageFailure
	switch code {
	case FailurePermission:
		reason = IncompletePermissionDenied
	case FailureTimeout:
		reason = IncompleteCommitTimeout
	case FailureCanceled:
		reason = IncompleteCanceled
	}
	return failureRequest{reason: reason, code: code, err: err}
}
