package replay

import (
	"errors"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

var ErrInvalidCanonicalReplay = errors.New("invalid canonical replay frame")

type CanonicalFrame struct {
	Batch *core.Batch
	Facts []envelope.Fact[core.SessionFact]
}

func NewCanonicalSource(
	metadata FixtureMetadata,
	frames []CanonicalFrame,
) (*SliceSource[CanonicalFrame], error) {
	if err := metadata.Validate(); err != nil ||
		metadata.SchemaID != "canonical-observation" ||
		metadata.SchemaVersion != 1 {
		return nil, ErrInvalidCanonicalReplay
	}
	if len(frames) == 0 {
		return nil, ErrInvalidCanonicalReplay
	}
	timed := make([]Frame[CanonicalFrame], len(frames))
	reducer := core.NewReducer()
	var previousFact core.FactSequence
	var previousHeader envelope.Header
	var hasPreviousHeader bool
	for index, frame := range frames {
		atUTC, err := validateCanonicalFrame(
			frame,
			reducer,
			previousFact,
			previousHeader,
			hasPreviousHeader,
		)
		if err != nil {
			return nil, err
		}
		offset := atUTC.Sub(metadata.StartedAtUTC)
		if offset < 0 {
			return nil, ErrInvalidCanonicalReplay
		}
		if index == 0 && offset != 0 {
			return nil, ErrInvalidCanonicalReplay
		}
		timed[index] = Frame[CanonicalFrame]{
			Offset: offset,
			Value:  cloneCanonicalFrame(frame),
		}
		if len(frame.Facts) > 0 {
			previousFact = frame.Facts[len(frame.Facts)-1].Value().Sequence
		}
		if frame.Batch != nil {
			previousHeader = frame.Batch.Header
			hasPreviousHeader = true
		}
	}
	source, err := NewSliceSource(metadata, timed, cloneCanonicalFrame)
	if err != nil {
		return nil, ErrInvalidCanonicalReplay
	}
	return source, nil
}

func validateCanonicalFrame(
	frame CanonicalFrame,
	reducer *core.Reducer,
	previousFact core.FactSequence,
	previousHeader envelope.Header,
	hasPreviousHeader bool,
) (time.Time, error) {
	if frame.Batch == nil && len(frame.Facts) == 0 {
		return time.Time{}, ErrInvalidCanonicalReplay
	}
	var (
		atUTC         time.Time
		currentHeader envelope.Header
		hasBatch      = frame.Batch != nil
	)
	if hasBatch {
		currentHeader = frame.Batch.Header
		if !validCanonicalHeader(currentHeader) {
			return time.Time{}, ErrInvalidCanonicalReplay
		}
		if _, err := reducer.Apply(*frame.Batch); err != nil {
			return time.Time{}, errors.Join(ErrInvalidCanonicalReplay, err)
		}
		atUTC = currentHeader.Clock.ReceivedUTC
	} else {
		if !hasPreviousHeader {
			return time.Time{}, ErrInvalidCanonicalReplay
		}
		atUTC = frame.Facts[0].Value().OccurredUTC
	}
	nextFact := previousFact
	for _, fact := range frame.Facts {
		factHeader := fact.Header()
		value := fact.Value()
		if !validCanonicalHeader(factHeader) ||
			factHeader.Identity != value.Identity ||
			!value.Kind.Known() ||
			value.Sequence == 0 ||
			value.Sequence != nextFact+1 ||
			value.OccurredUTC.IsZero() ||
			value.OccurredUTC.Location() != time.UTC ||
			!canonicalFactMatchesFrame(
				factHeader,
				value,
				currentHeader,
				hasBatch,
				previousHeader,
				hasPreviousHeader,
			) {
			return time.Time{}, ErrInvalidCanonicalReplay
		}
		nextFact = value.Sequence
	}
	return atUTC, nil
}

func validCanonicalHeader(header envelope.Header) bool {
	return header.Cursor.Epoch != 0 &&
		header.Cursor.Sequence != 0 &&
		!header.Clock.ReceivedUTC.IsZero() &&
		header.Clock.ReceivedUTC.Location() == time.UTC &&
		header.Identity.SessionKnown()
}

func canonicalFactMatchesFrame(
	factHeader envelope.Header,
	value core.SessionFact,
	currentHeader envelope.Header,
	hasBatch bool,
	previousHeader envelope.Header,
	hasPreviousHeader bool,
) bool {
	if hasBatch &&
		factHeader.Cursor == currentHeader.Cursor &&
		factHeader.Identity.SameSession(currentHeader.Identity) {
		return true
	}
	if !hasPreviousHeader ||
		factHeader.Cursor != previousHeader.Cursor ||
		!factHeader.Identity.SameSession(previousHeader.Identity) {
		return false
	}
	if !hasBatch {
		return true
	}
	return value.Kind == core.FactSessionEnded &&
		!previousHeader.Identity.SameSession(currentHeader.Identity)
}

func cloneCanonicalFrame(frame CanonicalFrame) CanonicalFrame {
	cloned := CanonicalFrame{
		Facts: append([]envelope.Fact[core.SessionFact](nil), frame.Facts...),
	}
	if frame.Batch != nil {
		state := frame.Batch.State
		state.Vehicles = append([]core.VehicleState(nil), state.Vehicles...)
		cloned.Batch = &core.Batch{Header: frame.Batch.Header, State: state}
	}
	return cloned
}
