package recording

import (
	"context"
	"errors"
	"time"
)

const MaxHistoricalPageSize uint16 = 4096

var (
	ErrInvalidHistoricalQuery = errors.New("invalid historical replay query")
	ErrHistoricalSnapshot     = errors.New("historical replay snapshot mismatch")
)

type HistoricalKind uint8

const (
	HistoricalObserved HistoricalKind = iota + 1
	HistoricalFact
)

func (kind HistoricalKind) Known() bool {
	return kind == HistoricalObserved || kind == HistoricalFact
}

// HistoricalPosition is a stable, exclusive pagination cursor. Ordering is
// causal: the observed snapshot is emitted before facts caused by it.
type HistoricalPosition struct {
	Epoch          uint64         `json:"epoch"`
	CausalSequence uint64         `json:"causalSequence"`
	Kind           HistoricalKind `json:"kind"`
	Sequence       uint64         `json:"sequence"`
}

func (position HistoricalPosition) Valid() bool {
	return position.Epoch != 0 &&
		position.CausalSequence != 0 &&
		position.Kind.Known() &&
		position.Sequence != 0 &&
		(position.Kind != HistoricalObserved || position.Sequence == position.CausalSequence)
}

type HistoricalQuery struct {
	SnapshotID string
	StartUTC   *time.Time
	EndUTC     *time.Time
	After      *HistoricalPosition
	Limit      uint16
	FactTypes  []FactType
}

func (query HistoricalQuery) Validate() error {
	if query.SnapshotID == "" || query.Limit == 0 || query.Limit > MaxHistoricalPageSize {
		return ErrInvalidHistoricalQuery
	}
	if query.StartUTC != nil && !validUTC(*query.StartUTC) {
		return ErrInvalidHistoricalQuery
	}
	if query.EndUTC != nil && !validUTC(*query.EndUTC) {
		return ErrInvalidHistoricalQuery
	}
	if query.StartUTC != nil && query.EndUTC != nil && query.EndUTC.Before(*query.StartUTC) {
		return ErrInvalidHistoricalQuery
	}
	if query.After != nil && !query.After.Valid() {
		return ErrInvalidHistoricalQuery
	}
	seen := make(map[FactType]struct{}, len(query.FactTypes))
	for _, factType := range query.FactTypes {
		if !factType.Known() {
			return ErrInvalidHistoricalQuery
		}
		if _, duplicate := seen[factType]; duplicate {
			return ErrInvalidHistoricalQuery
		}
		seen[factType] = struct{}{}
	}
	return nil
}

type HistoricalRecord struct {
	Position HistoricalPosition
	AtUTC    time.Time
	Observed *RecordingPayloadV1
	Fact     *RecordingFactV1
}

func (record HistoricalRecord) Validate() error {
	if !record.Position.Valid() || !validUTC(record.AtUTC) {
		return ErrInvalidRecording
	}
	switch record.Position.Kind {
	case HistoricalObserved:
		if record.Observed == nil || record.Fact != nil ||
			record.Observed.Cursor() != (Cursor{
				Epoch: record.Position.Epoch, Sequence: record.Position.Sequence,
			}) ||
			record.Observed.CapturedAtUTC != record.AtUTC {
			return ErrInvalidRecording
		}
		return record.Observed.Validate()
	case HistoricalFact:
		if record.Fact == nil || record.Observed != nil ||
			record.Fact.Epoch != record.Position.Epoch ||
			record.Fact.CausalSnapshotSequence != record.Position.CausalSequence ||
			record.Fact.FactSequence != record.Position.Sequence ||
			record.Fact.OccurredAtUTC != record.AtUTC {
			return ErrInvalidRecording
		}
		return record.Fact.Validate()
	default:
		return ErrInvalidRecording
	}
}

type HistoricalPage struct {
	SnapshotID string
	Records    []HistoricalRecord
	Next       *HistoricalPosition
}

type HistoricalSnapshot struct {
	ID                 string
	Ref                SessionRef
	Manifest           SessionManifest
	ObservedCount      uint64
	FactCount          uint64
	LastObserved       Cursor
	LastFact           Cursor
	OpenedAtUTC        time.Time
	EffectiveIntegrity IntegrityState
}

type HistoricalReplayStore interface {
	OpenHistoricalReplay(context.Context, SessionRef) (HistoricalReplayReader, error)
}

type HistoricalReplayReader interface {
	Snapshot() HistoricalSnapshot
	QueryPage(context.Context, HistoricalQuery) (HistoricalPage, error)
	Close() error
}
