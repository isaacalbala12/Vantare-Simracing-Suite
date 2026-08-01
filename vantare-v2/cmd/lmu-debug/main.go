// lmu-debug reads Le Mans Ultimate shared memory and prints telemetry to stdout.
//
// Usage:
//
//	go run ./cmd/lmu-debug              # poll until Ctrl+C
//	go run ./cmd/lmu-debug -once        # single read
//	go run ./cmd/lmu-debug -mock        # synthetic buffer (no LMU required)
//	go run ./cmd/lmu-debug -hz 10       # poll rate (default 10)
//	go run ./cmd/lmu-debug -once -probe-sanitized
//	go run ./cmd/lmu-debug -once -capture-sanitized <shared-path> -capture-rest-sanitized <rest-path>
//	go run ./cmd/lmu-debug -capture-delta-trace <path> -trace-duration 30m
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	driverlmu "github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	legacylmu "github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/pkg/models"
)

func main() {
	once := flag.Bool("once", false, "read once and exit")
	mock := flag.Bool("mock", false, "use synthetic buffer instead of LMU")
	hz := flag.Float64("hz", 10, "poll rate in Hz")
	probeSanitized := flag.Bool("probe-sanitized", false, "validate one sanitized Shared Memory snapshot without writing a file")
	captureSanitized := flag.String("capture-sanitized", "", "write one zero-rebuilt diagnostic Shared Memory capture")
	captureRESTSanitized := flag.String("capture-rest-sanitized", "", "write one sanitized REST overlap capture")
	captureDeltaTrace := flag.String("capture-delta-trace", "", "write a sanitized canonical player delta trace after two comparable laps")
	traceDuration := flag.Duration("trace-duration", driverlmu.DeltaTraceMaxDuration, "maximum delta trace capture duration")
	flag.Parse()
	var traceDurationSet, hzSet bool
	flag.Visit(func(current *flag.Flag) {
		switch current.Name {
		case "trace-duration":
			traceDurationSet = true
		case "hz":
			hzSet = true
		}
	})

	if *captureDeltaTrace != "" {
		if err := runDeltaTraceCapture(
			*captureDeltaTrace, *traceDuration, *once, *mock, *probeSanitized,
			*captureSanitized, *captureRESTSanitized, hzSet,
		); err != nil {
			fmt.Fprintf(os.Stderr, "delta trace capture failed: %v\n", err)
			os.Exit(1)
		}
		return
	}
	if traceDurationSet {
		fmt.Fprintln(os.Stderr, "delta trace capture failed: -trace-duration requires -capture-delta-trace")
		os.Exit(1)
	}

	if *probeSanitized {
		if err := runDiagnosticProbe(*once, *mock, *captureSanitized, *captureRESTSanitized); err != nil {
			fmt.Fprintf(os.Stderr, "diagnostic probe failed: %v\n", err)
			os.Exit(1)
		}
		return
	}
	if *captureSanitized != "" || *captureRESTSanitized != "" {
		if err := runDiagnosticCapture(*once, *mock, *captureSanitized, *captureRESTSanitized); err != nil {
			fmt.Fprintf(os.Stderr, "diagnostic capture failed: %v\n", err)
			os.Exit(1)
		}
		return
	}

	if *mock {
		buf := legacylmu.BuildSyntheticBuffer()
		runLoop(func() []byte { return buf }, *once, *hz, "mock")
		return
	}

	reader, err := legacylmu.Open()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	defer reader.Close()

	runLoop(reader.Bytes, *once, *hz, "live")
}

func runDeltaTraceCapture(
	path string,
	duration time.Duration,
	once, mock, probe bool,
	sharedPath, restPath string,
	hzExplicit bool,
) error {
	if err := validateDeltaTraceOptions(path, duration, once, mock, probe, sharedPath, restPath, hzExplicit); err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	artifact, err := driverlmu.CaptureDeltaTrace(ctx, duration)
	if err != nil {
		return err
	}
	if err := driverlmu.WriteDeltaTrace(path, artifact); err != nil {
		return err
	}
	summary := artifact.Summary()
	fmt.Printf(
		"delta-trace sha256=%s | samples=%d completed_laps=%d duration=%s\n",
		artifact.SHA256(), summary.Samples, summary.CompletedLaps, summary.Duration,
	)
	return nil
}

func validateDeltaTraceOptions(
	path string,
	duration time.Duration,
	once, mock, probe bool,
	sharedPath, restPath string,
	hzExplicit bool,
) error {
	if path == "" {
		return errors.New("delta trace destination is empty")
	}
	if duration <= 0 || duration > driverlmu.DeltaTraceMaxDuration {
		return fmt.Errorf("delta trace duration must be within (0,%s]", driverlmu.DeltaTraceMaxDuration)
	}
	if once || mock || probe || sharedPath != "" || restPath != "" || hzExplicit {
		return errors.New("delta trace mode is exclusive and refuses -once, -mock, -probe-sanitized, other captures and -hz")
	}
	if _, err := os.Lstat(path); err == nil || !errors.Is(err, os.ErrNotExist) {
		return errors.New("delta trace destination already exists or cannot be inspected")
	}
	return nil
}

type pendingCapture struct {
	path     string
	artifact driverlmu.DiagnosticCaptureArtifact
}

func runDiagnosticProbe(once, mock bool, sharedPath, restPath string) error {
	if !once {
		return errors.New("sanitized probe requires -once")
	}
	if mock {
		return errors.New("sanitized probe refuses -mock")
	}
	if sharedPath != "" || restPath != "" {
		return errors.New("sanitized probe cannot write capture targets")
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	result, err := driverlmu.ProbeSanitizedSharedMemory(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("%s probe sha256=%s | %s\n", result.Kind, result.SHA256, result.Summary)
	return nil
}

func runDiagnosticCapture(once, mock bool, sharedPath, restPath string) error {
	if err := validateDiagnosticCaptureOptions(once, mock, sharedPath, restPath); err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pending := make([]pendingCapture, 0, 2)
	if sharedPath != "" {
		artifact, err := driverlmu.CaptureSanitizedSharedMemory(ctx)
		if err != nil {
			return err
		}
		pending = append(pending, pendingCapture{path: sharedPath, artifact: artifact})
	}
	if restPath != "" {
		artifact, err := driverlmu.CaptureSanitizedREST(ctx, pending[0].artifact)
		if err != nil {
			return err
		}
		pending = append(pending, pendingCapture{path: restPath, artifact: artifact})
	}

	if len(pending) == 2 {
		if err := driverlmu.WriteSanitizedCapturePair(
			pending[0].path,
			pending[0].artifact,
			pending[1].path,
			pending[1].artifact,
		); err != nil {
			return err
		}
		for _, capture := range pending {
			fmt.Printf(
				"%s sha256=%s | %s\n",
				capture.artifact.Kind(),
				capture.artifact.SHA256(),
				capture.artifact.Summary(),
			)
		}
		return nil
	}
	for _, capture := range pending {
		if err := driverlmu.WriteSanitizedCapture(capture.path, capture.artifact); err != nil {
			return err
		}
		fmt.Printf(
			"%s sha256=%s | %s\n",
			capture.artifact.Kind(),
			capture.artifact.SHA256(),
			capture.artifact.Summary(),
		)
	}
	return nil
}

func validateDiagnosticCaptureOptions(once, mock bool, sharedPath, restPath string) error {
	if !once {
		return errors.New("sanitized capture requires -once")
	}
	if mock {
		return errors.New("sanitized capture refuses -mock")
	}
	if restPath != "" && sharedPath == "" {
		return errors.New("sanitized REST capture requires a Shared Memory capture")
	}
	if sharedPath != "" && restPath != "" {
		sharedAbsolute, sharedErr := filepath.Abs(sharedPath)
		restAbsolute, restErr := filepath.Abs(restPath)
		if sharedErr != nil || restErr != nil || strings.EqualFold(sharedAbsolute, restAbsolute) {
			return errors.New("Shared Memory and REST captures require different paths")
		}
	}
	for _, path := range []string{sharedPath, restPath} {
		if path == "" {
			continue
		}
		if _, err := os.Lstat(path); err == nil || !errors.Is(err, os.ErrNotExist) {
			return errors.New("sanitized capture destination already exists or cannot be inspected")
		}
	}
	return nil
}

func runLoop(read func() []byte, once bool, hz float64, mode string) {
	interval := time.Duration(float64(time.Second) / hz)

	if once {
		printTelemetry(legacylmu.Parse(read(), legacylmu.ParseFull))
		return
	}

	fmt.Fprintf(os.Stderr, "LMU debug [%s] — %.0f Hz (Ctrl+C to stop)\n", mode, hz)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case <-ticker.C:
			printTelemetry(legacylmu.Parse(read(), legacylmu.ParseFull))
		case <-sig:
			fmt.Fprintln(os.Stderr, "\nstopped")
			return
		}
	}
}

func printTelemetry(t *models.Telemetry) {
	if t == nil {
		fmt.Println("no data")
		return
	}
	if t.Player == nil {
		fmt.Println("connected — no player vehicle")
		return
	}
	p := t.Player
	speedKmh := p.Speed * 3.6
	track := ""
	if t.Session != nil {
		track = t.Session.TrackName
	}
	fmt.Printf("track=%s | speed=%.1f km/h | gear=%d | rpm=%.0f | fuel=%.1f L | lap=%d\n",
		track, speedKmh, p.Gear, p.EngineRPM, p.Fuel, p.LapNumber)
}
