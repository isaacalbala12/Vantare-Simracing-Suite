package replay

import (
	"context"
	"errors"
	"io"
	"math"
	"math/big"
	"reflect"
	"testing"
	"time"
)

func TestTimedPlayerUsesDeterministicTimeAndScaledWaits(t *testing.T) {
	t.Parallel()
	metadata := testMetadata()
	source, err := NewSliceSource(metadata, []Frame[int]{
		{Offset: 100 * time.Millisecond, Value: 1},
		{Offset: 300 * time.Millisecond, Value: 2},
		{Offset: 900 * time.Millisecond, Value: 3},
	}, func(value int) int { return value })
	if err != nil {
		t.Fatalf("NewSliceSource() error = %v", err)
	}
	var waits []time.Duration
	var outputs []Output[int]
	player, err := NewPlayer(source, Options{
		Mode: ModeTimed,
		Rate: Rate{Numerator: 2, Denominator: 1},
		Wait: func(ctx context.Context, duration time.Duration) error {
			waits = append(waits, duration)
			return ctx.Err()
		},
	})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	err = player.Run(context.Background(), func(_ context.Context, output Output[int]) error {
		outputs = append(outputs, output)
		return nil
	})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if want := []time.Duration{50 * time.Millisecond, 100 * time.Millisecond, 300 * time.Millisecond}; !reflect.DeepEqual(waits, want) {
		t.Fatalf("waits = %v, want %v", waits, want)
	}
	if len(outputs) != 3 {
		t.Fatalf("outputs = %d, want 3", len(outputs))
	}
	for index, output := range outputs {
		wantOffset := []time.Duration{100 * time.Millisecond, 300 * time.Millisecond, 900 * time.Millisecond}[index]
		if output.Index != uint64(index+1) ||
			output.Offset != wantOffset ||
			output.ReplayUTC != metadata.StartedAtUTC.Add(wantOffset) ||
			output.Value != index+1 {
			t.Fatalf("output[%d] = %#v", index, output)
		}
	}
}

func TestStepPlayerNeverWaitsAndStopsAtEOF(t *testing.T) {
	t.Parallel()
	source, err := NewSliceSource(testMetadata(), []Frame[string]{
		{Offset: 0, Value: "first"},
		{Offset: time.Second, Value: "second"},
	}, func(value string) string { return value })
	if err != nil {
		t.Fatalf("NewSliceSource() error = %v", err)
	}
	player, err := NewPlayer(source, Options{
		Mode: ModeStep,
		Wait: func(context.Context, time.Duration) error {
			t.Fatal("step replay must not wait")
			return nil
		},
	})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	var values []string
	sink := func(_ context.Context, output Output[string]) error {
		values = append(values, output.Value)
		return nil
	}
	if err := player.Step(context.Background(), sink); err != nil {
		t.Fatalf("Step(first) error = %v", err)
	}
	if err := player.Step(context.Background(), sink); err != nil {
		t.Fatalf("Step(second) error = %v", err)
	}
	if err := player.Step(context.Background(), sink); !errors.Is(err, io.EOF) {
		t.Fatalf("Step(eof) error = %v, want io.EOF", err)
	}
	if want := []string{"first", "second"}; !reflect.DeepEqual(values, want) {
		t.Fatalf("values = %v, want %v", values, want)
	}
	if err := player.Run(context.Background(), sink); !errors.Is(err, ErrWrongMode) {
		t.Fatalf("Run(step mode) error = %v, want wrong mode", err)
	}
}

func TestPlayerRejectsInvalidMetadataFramesAndRate(t *testing.T) {
	t.Parallel()
	valid := testMetadata()
	tests := []struct {
		name     string
		metadata FixtureMetadata
		frames   []Frame[int]
	}{
		{name: "missing simulator", metadata: FixtureMetadata{}, frames: []Frame[int]{{}}},
		{name: "negative offset", metadata: valid, frames: []Frame[int]{{Offset: -1}}},
		{name: "out of order", metadata: valid, frames: []Frame[int]{{Offset: time.Second}, {Offset: time.Millisecond}}},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if _, err := NewSliceSource(test.metadata, test.frames, func(value int) int { return value }); !errors.Is(err, ErrInvalidFixture) {
				t.Fatalf("NewSliceSource() error = %v, want invalid fixture", err)
			}
		})
	}
	source, err := NewSliceSource(valid, []Frame[int]{{}}, func(value int) int { return value })
	if err != nil {
		t.Fatalf("NewSliceSource() error = %v", err)
	}
	if _, err := NewPlayer(source, Options{Rate: Rate{Numerator: 0, Denominator: 1}}); !errors.Is(err, ErrInvalidRate) {
		t.Fatalf("NewPlayer() error = %v, want invalid rate", err)
	}
}

func TestPlayerNormalizesRateAndPacesFromAbsoluteFixtureTime(t *testing.T) {
	t.Parallel()
	frames := []Frame[int]{
		{Offset: 0, Value: 0},
		{Offset: time.Nanosecond, Value: 1},
		{Offset: 2 * time.Nanosecond, Value: 2},
		{Offset: 3 * time.Nanosecond, Value: 3},
	}
	source, err := NewSliceSource(testMetadata(), frames, func(value int) int { return value })
	if err != nil {
		t.Fatalf("NewSliceSource() error = %v", err)
	}
	var waits []time.Duration
	player, err := NewPlayer(source, Options{
		Mode: ModeTimed,
		Rate: Rate{Numerator: 3, Denominator: 1},
		Wait: func(_ context.Context, duration time.Duration) error {
			waits = append(waits, duration)
			return nil
		},
	})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	if err := player.Run(context.Background(), func(context.Context, Output[int]) error {
		return nil
	}); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if want := []time.Duration{0, 0, 0, time.Nanosecond}; !reflect.DeepEqual(waits, want) {
		t.Fatalf("waits = %v, want absolute pacing %v", waits, want)
	}

	normalized, err := (Rate{
		Numerator:   math.MaxUint32,
		Denominator: math.MaxUint32,
	}).normalized()
	if err != nil || normalized != (Rate{Numerator: 1, Denominator: 1}) {
		t.Fatalf("normalized max ratio = %#v, %v", normalized, err)
	}
	largeRate := Rate{
		Numerator:   math.MaxUint32,
		Denominator: math.MaxUint32 - 1,
	}
	got, err := scaleDuration(5*time.Second, largeRate)
	if err != nil {
		t.Fatalf("scaleDuration(large coprime rate) error = %v", err)
	}
	numerator := new(big.Int).Mul(
		new(big.Int).SetUint64(uint64(5*time.Second)),
		new(big.Int).SetUint64(uint64(largeRate.Denominator)),
	)
	want := new(big.Int).Quo(
		numerator,
		new(big.Int).SetUint64(uint64(largeRate.Numerator)),
	).Int64()
	if got != time.Duration(want) {
		t.Fatalf("scaleDuration(large coprime rate) = %s, want %dns", got, want)
	}
}

func TestPlayerCancellationAndSinkFailureDoNotConsumeFollowingFrame(t *testing.T) {
	t.Parallel()
	source, err := NewSliceSource(testMetadata(), []Frame[int]{
		{Offset: 0, Value: 1},
		{Offset: time.Second, Value: 2},
	}, func(value int) int { return value })
	if err != nil {
		t.Fatalf("NewSliceSource() error = %v", err)
	}
	player, err := NewPlayer(source, Options{Mode: ModeStep})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	sinkErr := errors.New("sink rejected frame")
	if err := player.Step(context.Background(), func(context.Context, Output[int]) error {
		return sinkErr
	}); !errors.Is(err, sinkErr) {
		t.Fatalf("Step() error = %v, want sink error", err)
	}
	if got := player.Position(); got != 0 {
		t.Fatalf("Position() = %d, want 0 after rejected frame", got)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := player.Step(ctx, func(context.Context, Output[int]) error { return nil }); !errors.Is(err, context.Canceled) {
		t.Fatalf("Step(cancelled) error = %v", err)
	}
	if got := player.Position(); got != 0 {
		t.Fatalf("Position() = %d, want 0 after cancellation", got)
	}
}

func TestPlayerRetryOwnsMutableOutput(t *testing.T) {
	t.Parallel()
	source, err := NewSliceSource(testMetadata(), []Frame[[]int]{
		{Value: []int{1, 2, 3}},
	}, func(value []int) []int {
		return append([]int(nil), value...)
	})
	if err != nil {
		t.Fatalf("NewSliceSource() error = %v", err)
	}
	player, err := NewPlayer(source, Options{Mode: ModeStep})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	rejected := errors.New("retry")
	if err := player.Step(context.Background(), func(_ context.Context, output Output[[]int]) error {
		output.Value[0] = 99
		return rejected
	}); !errors.Is(err, rejected) {
		t.Fatalf("Step(rejected) error = %v", err)
	}
	if err := player.Step(context.Background(), func(_ context.Context, output Output[[]int]) error {
		if want := []int{1, 2, 3}; !reflect.DeepEqual(output.Value, want) {
			t.Fatalf("retry value = %v, want %v", output.Value, want)
		}
		return nil
	}); err != nil {
		t.Fatalf("Step(retry) error = %v", err)
	}
}

func TestPlayerDoesNotEmitWhenCancellationWinsAfterWait(t *testing.T) {
	t.Parallel()
	source, err := NewSliceSource(testMetadata(), []Frame[int]{
		{Offset: time.Second, Value: 1},
	}, func(value int) int { return value })
	if err != nil {
		t.Fatalf("NewSliceSource() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	player, err := NewPlayer(source, Options{
		Mode: ModeTimed,
		Wait: func(context.Context, time.Duration) error {
			cancel()
			return nil
		},
	})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	called := false
	err = player.Run(ctx, func(context.Context, Output[int]) error {
		called = true
		return nil
	})
	if !errors.Is(err, context.Canceled) || called {
		t.Fatalf("Run() error = %v, sink called = %t", err, called)
	}
}

func testMetadata() FixtureMetadata {
	return FixtureMetadata{
		FixtureVersion: FixtureVersionV1,
		SimulatorID:    "lmu",
		SimulatorBuild: "2026.07-test",
		AppBuild:       "vantare-test",
		SchemaID:       "canonical-observation",
		SchemaVersion:  1,
		StartedAtUTC:   time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC),
		Origin:         FixtureOriginSynthetic,
		Sanitized:      true,
	}
}
