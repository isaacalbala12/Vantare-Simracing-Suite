// Command isolation_probe measures whether an external inference worker can be
// cancelled without stalling a concurrent high-frequency heartbeat.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"time"
)

type result struct {
	Schema             string  `json:"schema"`
	CapturedAtUTC      string  `json:"captured_at_utc"`
	CancelAfterMS      int64   `json:"requested_cancel_after_ms"`
	HeartbeatTargetMS  int64   `json:"heartbeat_target_ms"`
	HeartbeatCount     int     `json:"heartbeat_count"`
	MaxHeartbeatGapMS  float64 `json:"max_heartbeat_gap_ms"`
	CancelLatencyMS    float64 `json:"cancel_latency_ms"`
	ChildExited        bool    `json:"child_exited"`
	MicrophoneAccess   string  `json:"microphone_access"`
	MeasurementMeaning string  `json:"measurement_meaning"`
}

func main() {
	var executable string
	var output string
	var cancelAfter time.Duration
	var heartbeat time.Duration
	flag.StringVar(&executable, "executable", "", "external worker executable")
	flag.StringVar(&output, "output", "", "JSON result path")
	flag.DurationVar(&cancelAfter, "cancel-after", 500*time.Millisecond, "time before forced cancellation")
	flag.DurationVar(&heartbeat, "heartbeat", 10*time.Millisecond, "heartbeat interval")
	flag.Parse()
	if executable == "" || output == "" || cancelAfter <= 0 || heartbeat <= 0 {
		fmt.Fprintln(os.Stderr, "executable, output and positive intervals are required")
		os.Exit(2)
	}

	command := exec.Command(executable, flag.Args()...)
	if err := command.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "start worker: %v\n", err)
		os.Exit(1)
	}

	started := time.Now()
	last := started
	maxGap := time.Duration(0)
	heartbeats := 0
	ticker := time.NewTicker(heartbeat)
	timer := time.NewTimer(cancelAfter)
	defer ticker.Stop()
	defer timer.Stop()
loop:
	for {
		select {
		case now := <-ticker.C:
			gap := now.Sub(last)
			if gap > maxGap {
				maxGap = gap
			}
			last = now
			heartbeats++
		case <-timer.C:
			break loop
		}
	}

	cancelStarted := time.Now()
	killErr := command.Process.Kill()
	waitErr := command.Wait()
	if killErr != nil {
		fmt.Fprintf(os.Stderr, "kill worker: %v\n", killErr)
		os.Exit(1)
	}
	if waitErr == nil {
		fmt.Fprintln(os.Stderr, "worker exited cleanly before forced cancellation")
		os.Exit(1)
	}

	measurement := result{
		Schema:             "vantare.engineer.voice-bench.isolation.v1",
		CapturedAtUTC:      time.Now().UTC().Format(time.RFC3339Nano),
		CancelAfterMS:      cancelAfter.Milliseconds(),
		HeartbeatTargetMS:  heartbeat.Milliseconds(),
		HeartbeatCount:     heartbeats,
		MaxHeartbeatGapMS:  float64(maxGap.Microseconds()) / 1000,
		CancelLatencyMS:    float64(time.Since(cancelStarted).Microseconds()) / 1000,
		ChildExited:        command.ProcessState.Exited(),
		MicrophoneAccess:   "none",
		MeasurementMeaning: "Process isolation and forced cancellation only; product wiring remains out of scope.",
	}
	encoded, err := json.MarshalIndent(measurement, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "encode result: %v\n", err)
		os.Exit(1)
	}
	encoded = append(encoded, '\n')
	if err := os.WriteFile(output, encoded, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write result: %v\n", err)
		os.Exit(1)
	}
	fmt.Print(string(encoded))
}
