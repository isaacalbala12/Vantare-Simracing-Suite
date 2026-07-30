// Package replay owns deterministic, harness-only telemetry playback. It is
// deliberately separate from driver discovery and cannot become a live source
// without an explicit adapter in a later issue.
package replay

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"math/bits"
	"time"
)

const FixtureVersionV1 uint16 = 1

const (
	FixtureOriginSynthetic        = "synthetic"
	FixtureOriginSanitizedCapture = "sanitized-capture"
)

var (
	ErrInvalidFixture = errors.New("invalid replay fixture")
	ErrInvalidRate    = errors.New("invalid replay rate")
	ErrWrongMode      = errors.New("replay operation is not available in this mode")
)

type FixtureMetadata struct {
	FixtureVersion uint16    `json:"fixtureVersion"`
	SimulatorID    string    `json:"simulatorID"`
	SimulatorBuild string    `json:"simulatorBuild"`
	AppBuild       string    `json:"appBuild"`
	SchemaID       string    `json:"schemaID"`
	SchemaVersion  uint16    `json:"schemaVersion"`
	StartedAtUTC   time.Time `json:"startedAtUTC"`
	Origin         string    `json:"origin"`
	Sanitized      bool      `json:"sanitized"`
}

func (metadata FixtureMetadata) Validate() error {
	if metadata.FixtureVersion != FixtureVersionV1 ||
		!safeToken(metadata.SimulatorID, 32) ||
		!safeToken(metadata.SimulatorBuild, 128) ||
		!safeToken(metadata.AppBuild, 128) ||
		!safeToken(metadata.SchemaID, 64) ||
		metadata.SchemaVersion == 0 ||
		metadata.StartedAtUTC.IsZero() ||
		metadata.StartedAtUTC.Location() != time.UTC ||
		(metadata.Origin != FixtureOriginSynthetic &&
			metadata.Origin != FixtureOriginSanitizedCapture) ||
		!metadata.Sanitized {
		return ErrInvalidFixture
	}
	return nil
}

type Frame[T any] struct {
	Offset time.Duration
	Value  T
}

type Output[T any] struct {
	Index     uint64
	Offset    time.Duration
	ReplayUTC time.Time
	Value     T
}

type Source[T any] interface {
	Metadata() FixtureMetadata
	Next(context.Context) (Frame[T], error)
	Clone(T) T
}

type Clone[T any] func(T) T

type SliceSource[T any] struct {
	metadata FixtureMetadata
	frames   []Frame[T]
	clone    Clone[T]
	next     int
}

func NewSliceSource[T any](
	metadata FixtureMetadata,
	frames []Frame[T],
	clone Clone[T],
) (*SliceSource[T], error) {
	if err := metadata.Validate(); err != nil || clone == nil {
		return nil, ErrInvalidFixture
	}
	owned := make([]Frame[T], len(frames))
	var previous time.Duration
	for index, frame := range frames {
		if frame.Offset < 0 || (index > 0 && frame.Offset < previous) {
			return nil, ErrInvalidFixture
		}
		owned[index] = Frame[T]{Offset: frame.Offset, Value: clone(frame.Value)}
		previous = frame.Offset
	}
	return &SliceSource[T]{metadata: metadata, frames: owned, clone: clone}, nil
}

func (source *SliceSource[T]) Metadata() FixtureMetadata {
	return source.metadata
}

func (source *SliceSource[T]) Clone(value T) T {
	return source.clone(value)
}

func (source *SliceSource[T]) Next(ctx context.Context) (Frame[T], error) {
	if err := ctx.Err(); err != nil {
		return Frame[T]{}, err
	}
	if source.next >= len(source.frames) {
		return Frame[T]{}, io.EOF
	}
	frame := source.frames[source.next]
	source.next++
	frame.Value = source.clone(frame.Value)
	return frame, nil
}

type Mode uint8

const (
	ModeTimed Mode = iota + 1
	ModeStep
)

func (mode Mode) known() bool {
	return mode == ModeTimed || mode == ModeStep
}

// Rate is rational to keep the pacing calculation deterministic and avoid
// float rounding drift across long fixtures.
type Rate struct {
	Numerator   uint32
	Denominator uint32
}

func (rate Rate) normalized() (Rate, error) {
	if rate.Numerator == 0 && rate.Denominator == 0 {
		return Rate{Numerator: 1, Denominator: 1}, nil
	}
	if rate.Numerator == 0 || rate.Denominator == 0 {
		return Rate{}, ErrInvalidRate
	}
	divisor := greatestCommonDivisor(rate.Numerator, rate.Denominator)
	return Rate{
		Numerator:   rate.Numerator / divisor,
		Denominator: rate.Denominator / divisor,
	}, nil
}

type WaitFunc func(context.Context, time.Duration) error

type Options struct {
	Mode Mode
	Rate Rate
	Wait WaitFunc
}

type Player[T any] struct {
	source     Source[T]
	metadata   FixtureMetadata
	mode       Mode
	rate       Rate
	wait       WaitFunc
	pending    *Frame[T]
	position   uint64
	lastOffset time.Duration
	lastScaled time.Duration
}

func NewPlayer[T any](source Source[T], options Options) (*Player[T], error) {
	if source == nil {
		return nil, ErrInvalidFixture
	}
	metadata := source.Metadata()
	if err := metadata.Validate(); err != nil {
		return nil, err
	}
	mode := options.Mode
	if mode == 0 {
		mode = ModeTimed
	}
	if !mode.known() {
		return nil, ErrWrongMode
	}
	rate, err := options.Rate.normalized()
	if err != nil {
		return nil, err
	}
	wait := options.Wait
	if wait == nil {
		wait = waitContext
	}
	return &Player[T]{
		source:   source,
		metadata: metadata,
		mode:     mode,
		rate:     rate,
		wait:     wait,
	}, nil
}

func (player *Player[T]) Position() uint64 {
	return player.position
}

func (player *Player[T]) Run(
	ctx context.Context,
	sink func(context.Context, Output[T]) error,
) error {
	if player.mode != ModeTimed {
		return ErrWrongMode
	}
	if sink == nil {
		return ErrInvalidFixture
	}
	for {
		err := player.deliver(ctx, sink, true)
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
	}
}

func (player *Player[T]) Step(
	ctx context.Context,
	sink func(context.Context, Output[T]) error,
) error {
	if player.mode != ModeStep {
		return ErrWrongMode
	}
	if sink == nil {
		return ErrInvalidFixture
	}
	return player.deliver(ctx, sink, false)
}

func (player *Player[T]) deliver(
	ctx context.Context,
	sink func(context.Context, Output[T]) error,
	pace bool,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if player.pending == nil {
		frame, err := player.source.Next(ctx)
		if err != nil {
			return err
		}
		if frame.Offset < player.lastOffset {
			return ErrInvalidFixture
		}
		player.pending = &frame
	}
	frame := *player.pending
	scaledOffset := player.lastScaled
	if pace {
		var err error
		scaledOffset, err = scaleDuration(frame.Offset, player.rate)
		if err != nil {
			return err
		}
		delay := scaledOffset - player.lastScaled
		if err := player.wait(ctx, delay); err != nil {
			return err
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if player.position == math.MaxUint64 {
		return ErrInvalidFixture
	}
	output := Output[T]{
		Index:     player.position + 1,
		Offset:    frame.Offset,
		ReplayUTC: player.metadata.StartedAtUTC.Add(frame.Offset),
		Value:     player.source.Clone(frame.Value),
	}
	if err := sink(ctx, output); err != nil {
		return fmt.Errorf("deliver replay frame %d: %w", output.Index, err)
	}
	player.position++
	player.lastOffset = frame.Offset
	if pace {
		player.lastScaled = scaledOffset
	}
	player.pending = nil
	return nil
}

func scaleDuration(value time.Duration, rate Rate) (time.Duration, error) {
	if value < 0 || rate.Numerator == 0 || rate.Denominator == 0 {
		return 0, ErrInvalidRate
	}
	if value == 0 {
		return 0, nil
	}
	high, low := bits.Mul64(uint64(value), uint64(rate.Denominator))
	divisor := uint64(rate.Numerator)
	if high >= divisor {
		return 0, ErrInvalidRate
	}
	scaled, _ := bits.Div64(high, low, divisor)
	if scaled > math.MaxInt64 {
		return 0, ErrInvalidRate
	}
	return time.Duration(scaled), nil
}

func waitContext(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func greatestCommonDivisor(left, right uint32) uint32 {
	for right != 0 {
		left, right = right, left%right
	}
	return left
}

func safeToken(value string, max int) bool {
	if value == "" || len(value) > max {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '-' || character == '_' || character == '.' {
			continue
		}
		return false
	}
	return true
}
