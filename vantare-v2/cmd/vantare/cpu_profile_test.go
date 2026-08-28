//go:build !production

package main

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// waitForCPUProfileSignal is the shared bound for "this must happen"; a test
// that reaches it has failed rather than been slow.
const waitForCPUProfileSignal = 15 * time.Second

// observedCPUProfileGap is the window used to assert that something must *not*
// have happened yet. It is short because the assertion it guards is structural:
// the second stop is blocked on a channel that the test has not released.
const observedCPUProfileGap = 100 * time.Millisecond

// fakeCPUProfileControl records lifecycle calls without touching the single
// process-wide profiler, so these tests never compete with `go test
// -cpuprofile` or with each other. release, when non-nil, blocks stop until the
// test closes it; elapse, when non-nil, replaces the delay wait so no test
// depends on wall-clock time.
type fakeCPUProfileControl struct {
	starts  atomic.Int64
	stops   atomic.Int64
	writer  atomic.Value
	waiting chan time.Duration
	started chan struct{}
	stopped chan struct{}
	release chan struct{}
	elapse  chan time.Time
	failure error
}

func newFakeCPUProfileControl() *fakeCPUProfileControl {
	return &fakeCPUProfileControl{
		waiting: make(chan time.Duration, 8),
		started: make(chan struct{}, 8),
		stopped: make(chan struct{}, 8),
	}
}

func (fake *fakeCPUProfileControl) control() cpuProfileControl {
	control := cpuProfileControl{
		start: func(writer io.Writer) error {
			if fake.failure != nil {
				return fake.failure
			}
			fake.starts.Add(1)
			fake.writer.Store(writer)
			select {
			case fake.started <- struct{}{}:
			default:
			}
			return nil
		},
		stop: func() {
			fake.stops.Add(1)
			if fake.release != nil {
				<-fake.release
			}
			select {
			case fake.stopped <- struct{}{}:
			default:
			}
		},
	}
	if fake.elapse != nil {
		control.after = func(delay time.Duration) <-chan time.Time {
			select {
			case fake.waiting <- delay:
			default:
			}
			return fake.elapse
		}
	}
	return control
}

func TestParseCPUProfileDuration(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		raw  string
		want time.Duration
		err  error
	}{
		{name: "unset uses the default", raw: "", want: defaultCPUProfileDuration},
		{name: "whitespace uses the default", raw: "   ", want: defaultCPUProfileDuration},
		{name: "explicit value", raw: "45s", want: 45 * time.Second},
		{name: "trimmed value", raw: "  90s  ", want: 90 * time.Second},
		{name: "lower bound accepted", raw: "1s", want: minCPUProfileDuration},
		{name: "upper bound accepted", raw: "2m", want: maxCPUProfileDuration},
		{name: "not a duration", raw: "soon", err: errCPUProfileUnparsable},
		{name: "bare number", raw: "30", err: errCPUProfileUnparsable},
		{name: "zero rejected", raw: "0s", err: errCPUProfileDurationOutOfRange},
		{name: "negative rejected", raw: "-5s", err: errCPUProfileDurationOutOfRange},
		{name: "below lower bound", raw: "999ms", err: errCPUProfileDurationOutOfRange},
		{name: "above upper bound", raw: "3m", err: errCPUProfileDurationOutOfRange},
		{name: "long soak rejected", raw: "20m", err: errCPUProfileDurationOutOfRange},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, err := parseCPUProfileDuration(test.raw)
			if !errors.Is(err, test.err) {
				t.Fatalf("parseCPUProfileDuration(%q) error = %v, want %v", test.raw, err, test.err)
			}
			if test.err == nil && got != test.want {
				t.Fatalf("parseCPUProfileDuration(%q) = %s, want %s", test.raw, got, test.want)
			}
		})
	}
}

func TestStartCPUProfileDisabledWithoutPath(t *testing.T) {
	t.Parallel()
	fake := newFakeCPUProfileControl()
	stop := startCPUProfileWith("", "10s", "", fake.control())
	if stop == nil {
		t.Fatal("stop function must never be nil")
	}
	stop()
	if fake.starts.Load() != 0 || fake.stops.Load() != 0 {
		t.Fatalf("profiler touched without a path: starts=%d stops=%d", fake.starts.Load(), fake.stops.Load())
	}
}

func TestStartCPUProfileDisabledWithWhitespacePath(t *testing.T) {
	t.Parallel()
	fake := newFakeCPUProfileControl()
	startCPUProfileWith("   ", "", "", fake.control())()
	if fake.starts.Load() != 0 {
		t.Fatalf("profiler started for a whitespace path: starts=%d", fake.starts.Load())
	}
}

func TestStartCPUProfileRejectsInvalidDurationWithoutCreatingAFile(t *testing.T) {
	t.Parallel()
	fake := newFakeCPUProfileControl()
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	startCPUProfileWith(path, "3m", "", fake.control())()
	if fake.starts.Load() != 0 {
		t.Fatalf("profiler started with an out-of-range duration: starts=%d", fake.starts.Load())
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stat = %v, want the file never to be created", err)
	}
}

func TestStartCPUProfileRefusesToOverwriteAnExistingFile(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	if err := os.WriteFile(path, []byte("previous evidence"), 0o600); err != nil {
		t.Fatal(err)
	}
	fake := newFakeCPUProfileControl()
	startCPUProfileWith(path, "10s", "", fake.control())()
	if fake.starts.Load() != 0 {
		t.Fatalf("profiler started over an existing file: starts=%d", fake.starts.Load())
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "previous evidence" {
		t.Fatalf("existing profile was modified: %q", string(contents))
	}
}

func TestStartCPUProfileRefusesAMissingDirectory(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "absent", "cpu.pprof")
	fake := newFakeCPUProfileControl()
	startCPUProfileWith(path, "", "", fake.control())()
	if fake.starts.Load() != 0 {
		t.Fatalf("profiler started without a target directory: starts=%d", fake.starts.Load())
	}
}

func TestStartCPUProfileRemovesTheFileWhenTheProfilerRefuses(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	fake := newFakeCPUProfileControl()
	fake.failure = errors.New("cpu profiling already in use")
	startCPUProfileWith(path, "", "", fake.control())()
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stat = %v, want the empty file removed so a retry is possible", err)
	}
	if fake.stops.Load() != 0 {
		t.Fatalf("stops = %d, want no stop after a failed start", fake.stops.Load())
	}
}

func TestStartCPUProfileStopIsIdempotent(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	fake := newFakeCPUProfileControl()
	stop := startCPUProfileWith(path, "2m", "", fake.control())
	if fake.starts.Load() != 1 {
		t.Fatalf("starts = %d, want 1", fake.starts.Load())
	}
	if _, ok := fake.writer.Load().(*os.File); !ok {
		t.Fatal("profiler did not receive the profile file as its writer")
	}
	stop()
	stop()
	stop()
	if got := fake.stops.Load(); got != 1 {
		t.Fatalf("stops = %d, want exactly 1 across repeated stop calls", got)
	}
}

// TestStartCPUProfileSecondStopWaitsForTheFirstToFinish is the regression for
// the finalisation race: a caller that returns while another goroutine is still
// flushing lets the process exit with a truncated profile. The first stop is
// held inside the profiler and the second must not return until it is released
// and the file is closed.
func TestStartCPUProfileSecondStopWaitsForTheFirstToFinish(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	fake := newFakeCPUProfileControl()
	fake.release = make(chan struct{})
	// A long duration keeps the timer out of this test: the two stops here are
	// the shutdown path racing itself.
	stop := startCPUProfileWith(path, "2m", "", fake.control())

	firstEntered := make(chan struct{})
	go func() {
		close(firstEntered)
		stop()
	}()
	select {
	case <-firstEntered:
	case <-time.After(waitForCPUProfileSignal):
		t.Fatal("first stop never started")
	}

	secondReturned := make(chan struct{})
	go func() {
		defer close(secondReturned)
		stop()
	}()

	// The first stop is parked inside control.stop, so the second cannot have
	// completed: if it returns here, callers can outrun the flush.
	select {
	case <-secondReturned:
		t.Fatal("second stop returned while the first was still finalising")
	case <-time.After(observedCPUProfileGap):
	}

	close(fake.release)
	select {
	case <-secondReturned:
	case <-time.After(waitForCPUProfileSignal):
		t.Fatal("second stop did not return after the first was released")
	}

	if got := fake.stops.Load(); got != 1 {
		t.Fatalf("stops = %d, want exactly one call to the control", got)
	}
	// Closing an already-closed file errors, which proves finalisation
	// completed before the second stop returned rather than merely started.
	file, ok := fake.writer.Load().(*os.File)
	if !ok {
		t.Fatal("profiler did not receive the profile file as its writer")
	}
	if err := file.Close(); err == nil {
		t.Fatal("profile file was still open when the second stop returned")
	}
}

// TestStartCPUProfileStopsOnItsOwnWhenTheDurationElapses covers the bounded
// capture: the hook must end without anyone calling stop.
func TestStartCPUProfileStopsOnItsOwnWhenTheDurationElapses(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	fake := newFakeCPUProfileControl()
	stop := startCPUProfileWith(path, "1s", "", fake.control())

	select {
	case <-fake.stopped:
	case <-time.After(waitForCPUProfileSignal):
		t.Fatal("the bounded duration did not stop the capture on its own")
	}
	// The deferred shutdown stop must not stop the profiler a second time.
	stop()
	if got := fake.stops.Load(); got != 1 {
		t.Fatalf("stops = %d, want 1 after the timer and shutdown both ran", got)
	}
}

// TestStartCPUProfileReadsTheEnvironment covers the real runtime/pprof wiring
// end to end. It is skipped rather than failed when the test binary already
// holds the single process-wide CPU profile (`go test -cpuprofile`).
func TestStartCPUProfileReadsTheEnvironment(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	t.Setenv(cpuProfilePathEnv, path)
	t.Setenv(cpuProfileDurationEnv, "2m")
	stop := startCPUProfile()
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		t.Skip("a CPU profile is already active in this test binary")
	} else if err != nil {
		t.Fatal(err)
	}
	stop()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() == 0 {
		t.Fatal("profile file is empty after stop; the capture was not flushed")
	}
}

func TestParseCPUProfileDelay(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		raw  string
		want time.Duration
		err  error
	}{
		{name: "unset means no delay", raw: ""},
		{name: "whitespace means no delay", raw: "   "},
		{name: "bare zero means no delay", raw: "0"},
		{name: "zero seconds means no delay", raw: "0s"},
		{name: "explicit value", raw: "45s", want: 45 * time.Second},
		{name: "trimmed value", raw: "  90s  ", want: 90 * time.Second},
		{name: "upper bound accepted", raw: "5m", want: maxCPUProfileDelay},
		{name: "not a duration", raw: "later", err: errCPUProfileUnparsable},
		{name: "bare number", raw: "30", err: errCPUProfileUnparsable},
		{name: "negative rejected", raw: "-1s", err: errCPUProfileDelayOutOfRange},
		{name: "above upper bound", raw: "6m", err: errCPUProfileDelayOutOfRange},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, err := parseCPUProfileDelay(test.raw)
			if !errors.Is(err, test.err) {
				t.Fatalf("parseCPUProfileDelay(%q) error = %v, want %v", test.raw, err, test.err)
			}
			if test.err == nil && got != test.want {
				t.Fatalf("parseCPUProfileDelay(%q) = %s, want %s", test.raw, got, test.want)
			}
		})
	}
}

func TestStartCPUProfileRejectsInvalidDelayWithoutCreatingAFile(t *testing.T) {
	t.Parallel()
	fake := newFakeCPUProfileControl()
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	startCPUProfileWith(path, "", "6m", fake.control())()
	if fake.starts.Load() != 0 {
		t.Fatalf("profiler started with an out-of-range delay: starts=%d", fake.starts.Load())
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stat = %v, want the file never to be created", err)
	}
}

// TestStartCPUProfileDelayedTouchesNothingBeforeTheDelay is the point of the
// warm-up: with a delay pending, neither the file nor the profiler exists yet,
// so a capture never mixes in process startup.
func TestStartCPUProfileDelayedTouchesNothingBeforeTheDelay(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	fake := newFakeCPUProfileControl()
	fake.elapse = make(chan time.Time)
	stop := startCPUProfileWith(path, "2m", "30s", fake.control())

	select {
	case got := <-fake.waiting:
		if got != 30*time.Second {
			t.Fatalf("waited for %s, want the parsed delay 30s", got)
		}
	case <-time.After(waitForCPUProfileSignal):
		t.Fatal("the waiter never reached the delay")
	}
	if got := fake.starts.Load(); got != 0 {
		t.Fatalf("starts = %d while the delay was pending, want 0", got)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stat = %v, want no file while the delay was pending", err)
	}

	// Cancelling before the delay must leave nothing behind: no profiler start,
	// no file, and the waiting goroutine already finished when stop returns.
	stop()
	if got := fake.starts.Load(); got != 0 {
		t.Fatalf("starts = %d after cancelling, want 0", got)
	}
	if got := fake.stops.Load(); got != 0 {
		t.Fatalf("stops = %d after cancelling, want 0: nothing had started", got)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stat = %v, want no file after cancelling", err)
	}

	// The goroutine is gone, so releasing the wait now cannot start anything.
	close(fake.elapse)
	stop()
	if got := fake.starts.Load(); got != 0 {
		t.Fatalf("starts = %d after releasing a cancelled wait, want 0", got)
	}
}

// TestStartCPUProfileDelayedStartsOnceTheDelayElapses covers the other half:
// after the warm-up the capture runs exactly as an undelayed one.
func TestStartCPUProfileDelayedStartsOnceTheDelayElapses(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	fake := newFakeCPUProfileControl()
	fake.elapse = make(chan time.Time)
	stop := startCPUProfileWith(path, "2m", "30s", fake.control())

	close(fake.elapse)
	// Wait for the capture to actually start before stopping. Without this the
	// waiter's select would see both the elapsed delay and the cancel ready and
	// could legally pick either, which is the race the next test covers.
	select {
	case <-fake.started:
	case <-time.After(waitForCPUProfileSignal):
		t.Fatal("the capture did not start after the delay elapsed")
	}
	// stop waits for the waiting goroutine, so by the time it returns the
	// capture has also been finalised.
	stop()

	if got := fake.starts.Load(); got != 1 {
		t.Fatalf("starts = %d after the delay elapsed, want 1", got)
	}
	if got := fake.stops.Load(); got != 1 {
		t.Fatalf("stops = %d, want exactly 1", got)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("stat = %v, want the profile file to exist after the delay", err)
	}
	stop()
	if got := fake.stops.Load(); got != 1 {
		t.Fatalf("stops = %d after a repeated stop, want 1", got)
	}
}

// TestStartCPUProfileDelayedStopRacingTheDelayIsSafe drives the delay expiring
// and shutdown concurrently. Either outcome is legal, but both must be clean:
// if the capture started it is fully finalised before stop returns, and the
// waiting goroutine never survives. Run under -race.
func TestStartCPUProfileDelayedStopRacingTheDelayIsSafe(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	fake := newFakeCPUProfileControl()
	fake.elapse = make(chan time.Time)
	stop := startCPUProfileWith(path, "2m", "30s", fake.control())

	released := make(chan struct{})
	stopped := make(chan struct{})
	go func() {
		defer close(released)
		close(fake.elapse)
	}()
	go func() {
		defer close(stopped)
		stop()
	}()
	for _, done := range []chan struct{}{released, stopped} {
		select {
		case <-done:
		case <-time.After(waitForCPUProfileSignal):
			t.Fatal("delay release and stop did not both complete")
		}
	}

	starts := fake.starts.Load()
	if starts > 1 {
		t.Fatalf("starts = %d, want at most one capture", starts)
	}
	_, statErr := os.Stat(path)
	if starts == 0 {
		if !errors.Is(statErr, os.ErrNotExist) {
			t.Fatalf("stat = %v, want no file when the capture never started", statErr)
		}
		if got := fake.stops.Load(); got != 0 {
			t.Fatalf("stops = %d without a start, want 0", got)
		}
		return
	}
	if statErr != nil {
		t.Fatalf("stat = %v, want the profile file to exist after a started capture", statErr)
	}
	if got := fake.stops.Load(); got != 1 {
		t.Fatalf("stops = %d after a started capture, want exactly 1", got)
	}
	file, ok := fake.writer.Load().(*os.File)
	if !ok {
		t.Fatal("profiler did not receive the profile file as its writer")
	}
	if err := file.Close(); err == nil {
		t.Fatal("profile file was still open when stop returned")
	}
}
