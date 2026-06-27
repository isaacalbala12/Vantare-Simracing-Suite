// spotter-debug exports the spotter's DebugRecords as JSONL, frame by frame.
//
// Usage:
//
//	go run ./cmd/spotter-debug                          # simulator, 10 Hz, Ctrl+C
//	go run ./cmd/spotter-debug -once -out out.jsonl     # single frame to file
//	go run ./cmd/spotter-debug -source=replay -once     # replay fixture
//	go run ./cmd/spotter-debug -source=lmu -once        # live LMU (Windows only)
//	go run ./cmd/spotter-debug -mock -once              # shorthand for simulator
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	engineerlmu "github.com/vantare/overlays/v2/internal/engineer/lmu"
	"github.com/vantare/overlays/v2/internal/engineer/replay"
	"github.com/vantare/overlays/v2/internal/engineer/simulator"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
	lmureader "github.com/vantare/overlays/v2/internal/telemetry/lmu"
)

func main() {
	once := flag.Bool("once", false, "process one frame and exit")
	hz := flag.Float64("hz", 10, "poll rate in Hz")
	outPath := flag.String("out", "", "output JSONL path (empty = stdout)")
	mock := flag.Bool("mock", false, "use simulator source with ScenarioLeftBasic")
	source := flag.String("source", "simulator", "frame source: simulator, replay, lmu")
	replayPath := flag.String("replay-path", "internal/engineer/replay/testdata/left-basic.jsonl", "path to replay JSONL fixture")
	sensitivityStr := flag.String("sensitivity", "normal", "spotter sensitivity: conservative, normal, aggressive")
	flag.Parse()

	sensitivity := parseSensitivity(*sensitivityStr)

	// Build the frame source.
	var readFrame func() *telemetry.Frame
	var closeSource func() error

	switch {
	case *mock || *source == "simulator":
		frames := simulator.Build(simulator.ScenarioLeftBasic)
		src := simulator.NewSource(frames)
		readFrame = src.ReadFrame
		closeSource = src.Close

	case *source == "replay":
		src, err := replay.NewSource(*replayPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error opening replay %q: %v\n", *replayPath, err)
			os.Exit(1)
		}
		readFrame = src.ReadFrame
		closeSource = src.Close

	case *source == "lmu":
		reader, err := lmureader.Open()
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		readFrame = func() *telemetry.Frame {
			buf := reader.Bytes()
			return engineerlmu.ParseEngineerFrame(buf)
		}
		closeSource = reader.Close

	default:
		fmt.Fprintf(os.Stderr, "unknown source %q: use simulator, replay, or lmu\n", *source)
		os.Exit(1)
	}

	// Set up output writer.
	var out io.Writer
	if *outPath != "" {
		f, err := os.Create(*outPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error creating output file %q: %v\n", *outPath, err)
			os.Exit(1)
		}
		defer f.Close()
		out = f
	} else {
		out = os.Stdout
	}

	ctx := make(chan os.Signal, 1)
	signal.Notify(ctx, syscall.SIGINT, syscall.SIGTERM)

	processFrame := func() {
		frame := readFrame()
		if frame == nil {
			return
		}
		records := spotter.DebugRecords(frame, sensitivity)
		if err := spotter.WriteDebugRecordsJSONL(out, records); err != nil {
			fmt.Fprintf(os.Stderr, "error writing JSONL: %v\n", err)
		}
	}

	if *once {
		var lastTS int64
		const maxOnceFrames = 100
		for i := 0; i < maxOnceFrames; i++ {
			frame := readFrame()
			if frame == nil {
				break
			}
			if lastTS != 0 && frame.TimestampUnixMS == lastTS {
				break
			}
			lastTS = frame.TimestampUnixMS
			processFrame()
		}
		_ = closeSource()
		return
	}

	modeName := *source
	if *mock {
		modeName = "mock"
	}
	fmt.Fprintf(os.Stderr, "spotter-debug [%s] — %.0f Hz (Ctrl+C to stop)\n", modeName, *hz)

	interval := time.Duration(float64(time.Second) / *hz)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			processFrame()
		case <-ctx:
			fmt.Fprintln(os.Stderr, "\nstopped")
			_ = closeSource()
			return
		}
	}
}

func parseSensitivity(s string) spotter.Sensitivity {
	switch s {
	case "conservative":
		return spotter.SensitivityConservative
	case "aggressive":
		return spotter.SensitivityAggressive
	default:
		return spotter.SensitivityNormal
	}
}
