package recording

import (
	"context"
	"errors"
	"time"
)

const (
	DefaultQueueCapacity      = 96
	DefaultCheckpointInterval = 1500 * time.Millisecond
	DefaultCommitBudget       = 500 * time.Millisecond
	DefaultMaxVolatileAge     = 2 * time.Second
	MaxQueueCapacity          = 4096
)

var (
	ErrAlreadyStarted = errors.New("recording coordinator already started")
	ErrNotRecording   = errors.New("recording coordinator is not accepting")
	ErrQueueFull      = errors.New("recording queue is full")
	ErrCommitBudget   = errors.New("recording commit exceeded budget")
	ErrRPOBudget      = errors.New("recording volatile durability budget exceeded")
	ErrClosed         = errors.New("recording coordinator is closed")
)

type SessionRef struct {
	Root      string
	SessionID string
}

type PersistedWatermark struct {
	Accepted  Cursor
	Committed Cursor
	AtUTC     time.Time
}

type SessionSummary struct {
	Ref                SessionRef
	Manifest           SessionManifest
	EffectiveIntegrity IntegrityState
	ObservedCount      uint64
	FactCount          uint64
	CountsKnown        bool
	Bytes              int64
}

type RecoveryReport struct {
	Original        SessionRef
	Recovered       SessionRef
	OriginalSHA256  string
	RecoveredSHA256 string
	Manifest        SessionManifest
}

type HistoricalStore interface {
	Begin(context.Context, SessionRef, SessionManifest) (SessionWriter, error)
	Inspect(context.Context, SessionRef) (SessionSummary, error)
	OpenReader(context.Context, SessionRef) (SessionReader, error)
	RecoverCopy(context.Context, SessionRef) (RecoveryReport, error)
}

type SessionWriter interface {
	Append(context.Context, RecordingBatch) (Cursor, error)
	Checkpoint(context.Context) (PersistedWatermark, error)
	Complete(context.Context) (PersistedWatermark, error)
	Abort(context.Context, IncompleteReason, Cursor) error
	Close() error
}

type CursorRange struct {
	First Cursor
	Last  Cursor
}

func (r CursorRange) Validate() error {
	if !r.First.Valid() || !r.Last.Valid() ||
		r.First.IsZero() || r.Last.IsZero() || r.Last.Before(r.First) {
		return ErrInvalidRecording
	}
	return nil
}

type SessionReader interface {
	Observed(context.Context, CursorRange) ([]RecordingPayloadV1, error)
	Facts(context.Context, CursorRange, []FactType) ([]RecordingFactV1, error)
	Close() error
}

type Clock interface {
	Now() time.Time
}

type systemClock struct{}

func (systemClock) Now() time.Time { return time.Now().UTC() }

type CoordinatorState string

const (
	StateIdle       CoordinatorState = "idle"
	StateRecording  CoordinatorState = "recording"
	StateStopping   CoordinatorState = "stopping"
	StateComplete   CoordinatorState = "complete"
	StateIncomplete CoordinatorState = "incomplete"
)

type FailureCode string

const (
	FailureNone       FailureCode = ""
	FailureQueue      FailureCode = "queue_full"
	FailureStorage    FailureCode = "storage_failure"
	FailureTimeout    FailureCode = "commit_timeout"
	FailurePermission FailureCode = "permission_denied"
	FailureCanceled   FailureCode = "canceled"
)

type CoordinatorStatus struct {
	State               CoordinatorState
	QueueDepth          int
	QueueCapacity       int
	VolatileAccepted    Cursor
	PersistedAccepted   Cursor
	BackendCommitted    Cursor
	AcceptedBatches     uint64
	RejectedBatches     uint64
	CommittedBatches    uint64
	Checkpoints         uint64
	LastCheckpointAtUTC time.Time
	Failure             FailureCode
}

type CoordinatorConfig struct {
	QueueCapacity      int
	CheckpointInterval time.Duration
	CommitBudget       time.Duration
	MaxVolatileAge     time.Duration
	Clock              Clock
	CheckpointSignal   <-chan time.Time
}

func (c CoordinatorConfig) normalized() (CoordinatorConfig, error) {
	if c.QueueCapacity == 0 {
		c.QueueCapacity = DefaultQueueCapacity
	}
	if c.CheckpointInterval == 0 {
		c.CheckpointInterval = DefaultCheckpointInterval
	}
	if c.CommitBudget == 0 {
		c.CommitBudget = DefaultCommitBudget
	}
	if c.MaxVolatileAge == 0 {
		c.MaxVolatileAge = DefaultMaxVolatileAge
	}
	if c.Clock == nil {
		c.Clock = systemClock{}
	}
	if c.QueueCapacity < 1 || c.QueueCapacity > MaxQueueCapacity ||
		c.CheckpointInterval <= 0 || c.CheckpointInterval > DefaultCheckpointInterval ||
		c.CommitBudget <= 0 || c.CommitBudget > DefaultCommitBudget ||
		c.MaxVolatileAge <= 0 || c.MaxVolatileAge > DefaultMaxVolatileAge {
		return CoordinatorConfig{}, ErrInvalidRecording
	}
	return c, nil
}
