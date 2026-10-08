//go:build windows

package lmu

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// This opt-in capture records real SHM ticks and completed REST requests on
// independent schedules. Unlike the older paired capture, it never invents a
// REST time between two SHM samples. It is an input to the G0/G1/R bank, not
// evidence that the bank has passed.
func TestCaptureLMUHighRateTemporalOptIn(t *testing.T) {
	if os.Getenv("LMU_CAPTURE_HIGH_RATE") != "1" {
		t.Skip("set LMU_CAPTURE_HIGH_RATE=1 with LMU on track")
	}
	out := strings.TrimSpace(os.Getenv("LMU_CAPTURE_OUT"))
	if out == "" {
		t.Fatal("set LMU_CAPTURE_OUT to a new directory")
	}
	seconds := 60
	if value := strings.TrimSpace(os.Getenv("LMU_CAPTURE_DURATION_SECONDS")); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 10 || parsed > 120 {
			t.Fatalf("LMU_CAPTURE_DURATION_SECONDS must be 10..120, got %q", value)
		}
		seconds = parsed
	}
	evidence, err := readLMUBuildEvidence()
	if err != nil {
		t.Fatal(err)
	}
	sanitizer, err := newDiagnosticFrameSanitizer(evidence)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), time.Duration(seconds+10)*time.Second)
	defer cancel()
	live, err := CaptureSanitizedSharedMemory(ctx)
	if err != nil {
		t.Fatalf("live session: %v", err)
	}
	clear(live.payload)
	reader, err := openSharedMemory()
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := reader.Close(); err != nil {
			t.Errorf("close mapping: %v", err)
		}
	}()
	if err := os.Mkdir(out, 0o700); err != nil {
		t.Fatalf("create new output directory: %v", err)
	}
	manifest, err := captureHighRateTemporal(ctx, out, evidence.FileVersion, sanitizer, reader, time.Duration(seconds)*time.Second)
	if err != nil {
		t.Fatalf("high-rate capture: %v", err)
	}
	_, sourcePath, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("capture source path unavailable")
	}
	source, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	manifest.CapturerSHA256 = fmt.Sprintf("%x", sha256.Sum256(source))
	manifest.StartedAtUTC = manifest.Events[0].AtUTC
	manifest.CompletedAtUTC = manifest.Events[len(manifest.Events)-1].AtUTC
	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := writeHighRateFile(filepath.Join(out, "manifest.json"), append(encoded, '\n')); err != nil {
		t.Fatal(err)
	}
	t.Logf("captured real SHM=%d REST=%d build=%s vehicles=%d duration=%s", manifest.SHMTicks, manifest.RESTReports, manifest.Build, manifest.Vehicles, manifest.Duration)
}

type highRateEvent struct {
	at                    time.Time `json:"-"`
	Kind                  string    `json:"kind"`
	Index                 int       `json:"index"`
	AtUTC                 string    `json:"atUtc"`
	File                  string    `json:"file"`
	SHA256                string    `json:"sha256"`
	SourceMS              int64     `json:"sourceMs,omitempty"`
	Vehicles              int       `json:"vehicles,omitempty"`
	StandingsStartedUTC   string    `json:"standingsStartedUtc,omitempty"`
	StandingsCompletedUTC string    `json:"standingsCompletedUtc,omitempty"`
	SessionStartedUTC     string    `json:"sessionStartedUtc,omitempty"`
}

type highRateManifest struct {
	Schema         string          `json:"schema"`
	Build          string          `json:"build"`
	CapturerSHA256 string          `json:"capturerSha256"`
	StartedAtUTC   string          `json:"startedAtUtc"`
	CompletedAtUTC string          `json:"completedAtUtc"`
	Duration       string          `json:"duration"`
	Vehicles       int             `json:"vehicles"`
	SHMTicks       int             `json:"shmTicks"`
	RESTReports    int             `json:"restReports"`
	Events         []highRateEvent `json:"events"`
}

type highRateEventLog struct {
	mu     sync.Mutex
	events []highRateEvent
}

func (log *highRateEventLog) add(event highRateEvent) {
	log.mu.Lock()
	log.events = append(log.events, event)
	log.mu.Unlock()
}

func captureHighRateTemporal(ctx context.Context, out, build string, sanitizer *FrameSanitizer, reader memoryReader, duration time.Duration) (highRateManifest, error) {
	manifest := highRateManifest{Schema: "vantare.lmu-temporal-high-rate.v1", Build: build, Duration: duration.String()}
	input := make([]byte, ObjectOutSize)
	scratch := make([]byte, ObjectOutSize)
	defer clear(input)
	defer clear(scratch)
	var log highRateEventLog
	var restDone chan error
	var restCancel context.CancelFunc
	defer func() {
		if restCancel != nil {
			restCancel()
			<-restDone
		}
	}()
	ticker := time.NewTicker(time.Second / 60)
	defer ticker.Stop()
	end := time.Now().Add(duration)
	var lastSource time.Duration
	for time.Now().Before(end) {
		select {
		case <-ctx.Done():
			return manifest, ctx.Err()
		case <-ticker.C:
		}
		if err := readStable(ctx, reader, input, scratch, defaultStableComparisons); err != nil {
			return manifest, fmt.Errorf("SHM stable read %d: %w", manifest.SHMTicks, err)
		}
		at := time.Now().Round(0).UTC()
		artifact, err := buildSharedMemoryDiagnosticArtifact(input, at, sanitizer)
		if err != nil {
			return manifest, fmt.Errorf("SHM sanitize %d: %w", manifest.SHMTicks, err)
		}
		observation, err := parseDiagnosticSharedMemoryArtifact(artifact)
		if err != nil {
			clear(artifact.payload)
			return manifest, fmt.Errorf("SHM parse %d: %w", manifest.SHMTicks, err)
		}
		vehicles, countOK := observation.VehicleCount.Value()
		player, playerOK := observation.PlayerPresent.Value()
		source, sourceOK := observation.SourceTime.Value()
		if !countOK || !playerOK || !player || !sourceOK || vehicles < 46 || (manifest.SHMTicks > 0 && (int(vehicles) != manifest.Vehicles || source < lastSource)) {
			clear(artifact.payload)
			return manifest, fmt.Errorf("SHM grid/player/clock changed at tick %d", manifest.SHMTicks)
		}
		manifest.Vehicles = int(vehicles)
		lastSource = source
		file := fmt.Sprintf("shm-%05d.bin", manifest.SHMTicks)
		if err := writeHighRateFile(filepath.Join(out, file), artifact.payload); err != nil {
			clear(artifact.payload)
			return manifest, err
		}
		clear(artifact.payload)
		log.add(highRateEvent{at: at, Kind: "shm", Index: manifest.SHMTicks, AtUTC: at.Format(time.RFC3339Nano), File: file, SHA256: artifact.SHA256(), SourceMS: source.Milliseconds(), Vehicles: int(vehicles)})
		manifest.SHMTicks++
		if restDone == nil {
			var restCtx context.Context
			restCtx, restCancel = context.WithCancel(ctx)
			defer restCancel()
			restDone = make(chan error, 1)
			go func() { restDone <- captureHighRateREST(restCtx, out, sanitizer, &log) }()
		}
		select {
		case err := <-restDone:
			restDone = nil
			restCancel = nil
			if err != nil {
				return manifest, err
			}
			return manifest, fmt.Errorf("REST capture stopped early")
		default:
		}
	}
	restCancel()
	if err := <-restDone; err != nil {
		restCancel = nil
		return manifest, err
	}
	restCancel = nil
	log.mu.Lock()
	manifest.Events = log.events
	log.mu.Unlock()
	sort.Slice(manifest.Events, func(i, j int) bool {
		if manifest.Events[i].AtUTC == manifest.Events[j].AtUTC {
			return manifest.Events[i].Kind < manifest.Events[j].Kind
		}
		return manifest.Events[i].at.Before(manifest.Events[j].at)
	})
	for _, event := range manifest.Events {
		if event.Kind == "rest" {
			manifest.RESTReports++
		}
	}
	if manifest.SHMTicks < int(duration.Seconds()*55) || manifest.RESTReports < int(duration.Seconds()*3) {
		return manifest, fmt.Errorf("capture cadence incomplete: SHM=%d REST=%d", manifest.SHMTicks, manifest.RESTReports)
	}
	return manifest, nil
}

func captureHighRateREST(ctx context.Context, out string, sanitizer *FrameSanitizer, log *highRateEventLog) error {
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for index := 0; ; index++ {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
		capture, err := captureSanitizedRESTBodiesTimed(ctx, sanitizer)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("REST capture %d: %w", index, err)
		}
		file := fmt.Sprintf("rest-%05d.json", index)
		if err := writeHighRateFile(filepath.Join(out, file), capture.body); err != nil {
			clear(capture.body)
			return err
		}
		sha := fmt.Sprintf("%x", sha256.Sum256(capture.body))
		clear(capture.body)
		log.add(highRateEvent{at: capture.sessionCompleted, Kind: "rest", Index: index, AtUTC: capture.sessionCompleted.Format(time.RFC3339Nano), File: file, SHA256: sha,
			StandingsStartedUTC: capture.standingsStarted.Format(time.RFC3339Nano), StandingsCompletedUTC: capture.standingsCompleted.Format(time.RFC3339Nano),
			SessionStartedUTC: capture.sessionStarted.Format(time.RFC3339Nano)})
	}
}

func writeHighRateFile(path string, payload []byte) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create capture file: %w", err)
	}
	count, writeErr := file.Write(payload)
	closeErr := file.Close()
	if writeErr != nil || count != len(payload) || closeErr != nil {
		return fmt.Errorf("write capture file: write=%v close=%v", writeErr, closeErr)
	}
	return nil
}
