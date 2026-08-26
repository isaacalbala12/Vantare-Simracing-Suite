package main

import (
	"context"
	"errors"
	"testing"
)

type fakePages struct {
	n      int
	starts []int64
	kind   ScalarKind
	fail   bool
}

func (f *fakePages) ReadPage(ctx context.Context, _ string, start int64, limit int) (NumericPage, error) {
	if err := ctx.Err(); err != nil {
		return NumericPage{}, err
	}
	f.starts = append(f.starts, start)
	if f.fail {
		return NumericPage{}, errors.New("private path sentinel")
	}
	left := f.n - int(start)
	if left < 0 {
		left = 0
	}
	if left > limit {
		left = limit
	}
	v := make([]NumericSample, left)
	for i := range v {
		v[i] = NumericSample{Index: start + int64(i), Present: true, Valid: true, Kind: f.kind, Number: float64(start) + float64(i), Integer: start + int64(i)}
	}
	return NumericPage{ChannelID: "c", Start: start, Samples: v}, nil
}

func TestPagingExactBoundariesAndKinds(t *testing.T) {
	for _, n := range []int{4095, 4096, 8191, 8192} {
		f := &fakePages{n: n, kind: ScalarNumber}
		v, err := readNumeric(context.Background(), f, "c", ScalarNumber, maxSamples)
		if err != nil || len(v) != n {
			t.Fatalf("n=%d len=%d err=%v", n, len(v), err)
		}
		wantCalls := n/4096 + 1
		if len(f.starts) != wantCalls {
			t.Fatalf("n=%d starts=%v", n, f.starts)
		}
		for i, s := range f.starts {
			if s != int64(i*4096) {
				t.Fatalf("start %d", s)
			}
		}
	}
	for _, k := range []ScalarKind{ScalarNumber, ScalarInteger} {
		f := &fakePages{n: 2, kind: k}
		if _, err := readNumeric(context.Background(), f, "c", ScalarLap, maxEvents); err != nil {
			t.Fatalf("lap kind %v: %v", k, err)
		}
	}
	f := &fakePages{n: 2, kind: ScalarInteger}
	if _, err := readNumeric(context.Background(), f, "c", ScalarNumber, maxSamples); err == nil {
		t.Fatal("continuous integer accepted")
	}
}
func TestPagingCancelErrorCapsAndSanitizedError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := readNumeric(ctx, &fakePages{n: 1, kind: ScalarNumber}, "c", ScalarNumber, maxSamples); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if _, err := readNumeric(context.Background(), &fakePages{fail: true}, "c", ScalarNumber, maxSamples); err == nil || err.Error() != "data_invalid" {
		t.Fatalf("raw leak %v", err)
	}
	if v, err := readNumeric(context.Background(), &fakePages{n: 3, kind: ScalarNumber}, "c", ScalarNumber, 3); err != nil || len(v) != 3 {
		t.Fatalf("cap equality rejected: %v", err)
	}
	if _, err := readNumeric(context.Background(), &fakePages{n: 4, kind: ScalarNumber}, "c", ScalarNumber, 3); err == nil {
		t.Fatal("cap exceeded accepted")
	}
}
func TestClassificationZeroOneTwoThreeAndFiveChannels(t *testing.T) {
	for laps, want := range map[int]string{0: "insufficient_laps", 1: "insufficient_laps", 2: "accepted", 3: "accepted"} {
		r := MaterializedRecording{CompleteLaps: laps}
		for _, n := range requiredChannels {
			r.Channels = append(r.Channels, MaterializedChannel{Name: n, Count: 10, Finite: true, Valid: true})
		}
		if got := classifyRecording(r); got != want {
			t.Fatalf("laps=%d got=%s", laps, got)
		}
	}
	r := MaterializedRecording{CompleteLaps: 2}
	for _, n := range requiredChannels[:4] {
		r.Channels = append(r.Channels, MaterializedChannel{Name: n, Count: 10, Finite: true, Valid: true})
	}
	if classifyRecording(r) != "data_invalid" {
		t.Fatal("missing fifth channel")
	}
}
