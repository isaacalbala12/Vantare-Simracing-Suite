//go:build !production

package main

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"runtime/pprof"
	"strings"
	"sync"
	"time"
)

// Diagnostic CPU profiling hook (ISA-912). The host cannot measure itself
// today: there is no pprof endpoint and TelemetryCoreRuntime.Metrics has no
// production caller. This writes a runtime/pprof CPU profile to a file, opens
// no listener and adds no dependency. It is compiled only without
// `-tags production` (see cpu_profile_production.go).
const (
	cpuProfilePathEnv     = "VANTARE_CPU_PROFILE_PATH"
	cpuProfileDurationEnv = "VANTARE_CPU_PROFILE_DURATION"

	defaultCPUProfileDuration = 30 * time.Second
	minCPUProfileDuration     = time.Second
	// maxCPUProfileDuration stays short on purpose. A CPU profile is a sample
	// of a representative window, not a recording of a session: the 20-minute
	// soak in the ISA-912 protocol is measured per process from outside and
	// must not become a continuous pprof capture.
	maxCPUProfileDuration = 2 * time.Minute
)

var (
	errCPUProfileDurationUnparsable = errors.New("value is not a Go duration")
	errCPUProfileDurationOutOfRange = fmt.Errorf(
		"value is outside %s..%s", minCPUProfileDuration, maxCPUProfileDuration,
	)
)

// cpuProfileControl isolates the process-wide profiler so the lifecycle can be
// exercised without competing for the single global CPU profile.
type cpuProfileControl struct {
	start func(io.Writer) error
	stop  func()
}

// parseCPUProfileDuration validates the capture window. It returns a sentinel
// error so the caller can explain the rejection without echoing raw input.
func parseCPUProfileDuration(raw string) (time.Duration, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultCPUProfileDuration, nil
	}
	duration, err := time.ParseDuration(trimmed)
	if err != nil {
		return 0, errCPUProfileDurationUnparsable
	}
	if duration < minCPUProfileDuration || duration > maxCPUProfileDuration {
		return 0, errCPUProfileDurationOutOfRange
	}
	return duration, nil
}

// createCPUProfileFile fails closed: O_EXCL never overwrites an earlier
// profile, and a missing parent directory is an error rather than something to
// create.
func createCPUProfileFile(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
}

// cpuProfileFileReason classifies a creation failure. The error is never
// logged: it carries the full path, which contains the operator's directory.
func cpuProfileFileReason(err error) string {
	switch {
	case errors.Is(err, fs.ErrExist):
		return "target file already exists"
	case errors.Is(err, fs.ErrPermission):
		return "permission denied"
	case errors.Is(err, fs.ErrNotExist):
		return "target directory does not exist"
	default:
		return "target file could not be created"
	}
}

// startCPUProfile reads the two environment variables and starts a capture. It
// always returns a non-nil, idempotent stop function.
func startCPUProfile() func() {
	return startCPUProfileWith(
		os.Getenv(cpuProfilePathEnv),
		os.Getenv(cpuProfileDurationEnv),
		cpuProfileControl{start: pprof.StartCPUProfile, stop: pprof.StopCPUProfile},
	)
}

func startCPUProfileWith(rawPath, rawDuration string, control cpuProfileControl) func() {
	noop := func() {}
	path := strings.TrimSpace(rawPath)
	if path == "" {
		return noop
	}
	duration, err := parseCPUProfileDuration(rawDuration)
	if err != nil {
		log.Printf("cpu profile: disabled, %s %v", cpuProfileDurationEnv, err)
		return noop
	}
	file, err := createCPUProfileFile(path)
	if err != nil {
		log.Printf("cpu profile: disabled, %s %s", cpuProfilePathEnv, cpuProfileFileReason(err))
		return noop
	}
	if err := control.start(file); err != nil {
		// Remove the empty file so the O_EXCL guard does not block a retry.
		if cleanupErr := errors.Join(file.Close(), os.Remove(path)); cleanupErr != nil {
			log.Printf("cpu profile: disabled, profiler unavailable and the empty file could not be removed")
			return noop
		}
		log.Printf("cpu profile: disabled, profiler unavailable")
		return noop
	}

	session := &cpuProfileSession{
		control: control,
		file:    file,
		started: time.Now(),
		done:    make(chan struct{}),
	}
	// Armed after construction and handed over under the mutex: AfterFunc can
	// fire on another goroutine before this assignment completes.
	session.arm(time.AfterFunc(duration, session.stop))
	log.Printf("cpu profile: capturing for %s, requested by %s", duration, cpuProfilePathEnv)
	return session.stop
}

// cpuProfileSession owns one capture. The duration timer and the shutdown path
// race by construction, so exactly one of them finalises. Every caller of stop
// returns only once the profiler has been stopped and the file closed, so a
// process exiting right after stop cannot leave a truncated profile.
type cpuProfileSession struct {
	control cpuProfileControl
	file    *os.File
	started time.Time
	done    chan struct{}

	mu       sync.Mutex
	timer    *time.Timer
	stopping bool
}

// arm publishes the duration timer. A capture already stopping cancels it.
func (session *cpuProfileSession) arm(timer *time.Timer) {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.stopping {
		timer.Stop()
		return
	}
	session.timer = timer
}

func (session *cpuProfileSession) stop() {
	session.mu.Lock()
	if session.stopping {
		session.mu.Unlock()
		// Wait without the lock: the finaliser needs neither, and a caller that
		// returned early could otherwise exit the process mid-flush.
		<-session.done
		return
	}
	session.stopping = true
	timer := session.timer
	session.timer = nil
	session.mu.Unlock()

	if timer != nil {
		timer.Stop()
	}
	session.control.stop()
	elapsed := time.Since(session.started).Round(time.Millisecond)
	if err := session.file.Close(); err != nil {
		log.Printf("cpu profile: capture stopped after %s but the file could not be closed", elapsed)
	} else {
		log.Printf("cpu profile: capture stopped after %s", elapsed)
	}
	close(session.done)
}
