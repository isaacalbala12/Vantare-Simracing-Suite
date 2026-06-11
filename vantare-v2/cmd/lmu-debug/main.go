// lmu-debug reads Le Mans Ultimate shared memory and prints telemetry to stdout.
//
// Usage:
//
//	go run ./cmd/lmu-debug              # poll until Ctrl+C
//	go run ./cmd/lmu-debug -once        # single read
//	go run ./cmd/lmu-debug -mock        # synthetic buffer (no LMU required)
//	go run ./cmd/lmu-debug -hz 10       # poll rate (default 10)
package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/pkg/models"
)

func main() {
	once := flag.Bool("once", false, "read once and exit")
	mock := flag.Bool("mock", false, "use synthetic buffer instead of LMU")
	hz := flag.Float64("hz", 10, "poll rate in Hz")
	flag.Parse()

	if *mock {
		buf := lmu.BuildSyntheticBuffer()
		runLoop(func() []byte { return buf }, *once, *hz, "mock")
		return
	}

	reader, err := lmu.Open()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	defer reader.Close()

	runLoop(reader.Bytes, *once, *hz, "live")
}

func runLoop(read func() []byte, once bool, hz float64, mode string) {
	interval := time.Duration(float64(time.Second) / hz)

	if once {
		printTelemetry(lmu.Parse(read(), lmu.ParseFull))
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
			printTelemetry(lmu.Parse(read(), lmu.ParseFull))
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
