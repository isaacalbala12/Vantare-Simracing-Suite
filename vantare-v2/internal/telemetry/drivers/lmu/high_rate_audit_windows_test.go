//go:build windows

package lmu

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The high-rate corpus is external and immutable once audited. This test
// rejects missing, reordered or altered events before a benchmark may use it.
func TestAuditLMUHighRateTemporalOptIn(t *testing.T) {
	dir := os.Getenv("LMU_HIGH_RATE_CORPUS")
	if dir == "" {
		t.Skip("set LMU_HIGH_RATE_CORPUS to a real high-rate LMU capture")
	}
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest highRateManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.CapturerSHA256) != 64 {
		t.Fatal("missing capturer SHA-256")
	}
	if _, err := hex.DecodeString(manifest.CapturerSHA256); err != nil {
		t.Fatalf("invalid capturer SHA-256: %v", err)
	}
	duration, err := time.ParseDuration(manifest.Duration)
	if err != nil || duration < time.Minute || duration > 2*time.Minute || manifest.Schema != "vantare.lmu-temporal-high-rate.v1" ||
		manifest.Vehicles < 46 || manifest.Vehicles > 104 || manifest.SHMTicks < int(duration.Seconds()*55) ||
		manifest.RESTReports < int(duration.Seconds()*3) || len(manifest.Events) != manifest.SHMTicks+manifest.RESTReports {
		t.Fatalf("invalid high-rate manifest: duration=%q vehicles=%d SHM=%d REST=%d events=%d", manifest.Duration, manifest.Vehicles, manifest.SHMTicks, manifest.RESTReports, len(manifest.Events))
	}
	if manifest.Build != supportedLMUVersion {
		if _, ok := diagnosticLMUVersions[manifest.Build]; !ok {
			t.Fatalf("unadmitted LMU build %q", manifest.Build)
		}
	}
	profile := compatibilityProfile{version: manifest.Build, supported: true}
	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != len(manifest.Events)+1 {
		t.Fatalf("capture directory contains %d files, expected %d", len(files), len(manifest.Events)+1)
	}
	var first, previous time.Time
	var firstSource, previousSource time.Duration
	var shmCount, restCount int
	for index, event := range manifest.Events {
		at, err := time.Parse(time.RFC3339Nano, event.AtUTC)
		if err != nil || (index > 0 && at.Before(previous)) {
			t.Fatalf("event %d capture time is invalid or out of order", index)
		}
		if index == 0 {
			first = at
		}
		previous = at
		switch event.Kind {
		case "shm":
			if event.Index != shmCount || event.File != fmt.Sprintf("shm-%05d.bin", shmCount) || event.Vehicles != manifest.Vehicles {
				t.Fatalf("event %d SHM index/file/grid mismatch", index)
			}
			shared := readHashedCorpusFile(t, dir, event.File, event.SHA256)
			if len(shared) != ObjectOutSize {
				t.Fatalf("event %d SHM size=%d", index, len(shared))
			}
			observation, err := parseWithProfile(shared, at, profile)
			if err != nil || observation.Compatibility != CompatibilityKnown {
				t.Fatalf("event %d Go parser rejected SHM: %v", index, err)
			}
			count, countOK := observation.VehicleCount.Value()
			player, playerOK := observation.PlayerPresent.Value()
			source, sourceOK := observation.SourceTime.Value()
			if !countOK || int(count) != manifest.Vehicles || !playerOK || !player || !sourceOK || source.Milliseconds() != event.SourceMS {
				t.Fatalf("event %d SHM content disagrees with manifest", index)
			}
			if shmCount > 0 && source < previousSource {
				t.Fatalf("event %d source clock reversed", index)
			}
			if shmCount == 0 {
				firstSource = source
			}
			previousSource = source
			shmCount++
		case "rest":
			if event.Index != restCount || event.File != fmt.Sprintf("rest-%05d.json", restCount) {
				t.Fatalf("event %d REST index/file mismatch", index)
			}
			started, startErr := time.Parse(time.RFC3339Nano, event.StandingsStartedUTC)
			standingsDone, standingsErr := time.Parse(time.RFC3339Nano, event.StandingsCompletedUTC)
			sessionStarted, sessionErr := time.Parse(time.RFC3339Nano, event.SessionStartedUTC)
			if startErr != nil || standingsErr != nil || sessionErr != nil || started.After(standingsDone) || standingsDone.After(sessionStarted) || sessionStarted.After(at) {
				t.Fatalf("event %d REST request times invalid", index)
			}
			body := readHashedCorpusFile(t, dir, event.File, event.SHA256)
			var payload struct {
				Schema      string                       `json:"schema"`
				Standings   []map[string]json.RawMessage `json:"standings"`
				SessionInfo map[string]json.RawMessage   `json:"sessionInfo"`
			}
			if err := json.Unmarshal(body, &payload); err != nil || payload.Schema != sanitizedRESTBodiesSchema || len(payload.Standings) != manifest.Vehicles || len(payload.SessionInfo) == 0 {
				t.Fatalf("event %d REST sanitized body invalid: %v", index, err)
			}
			for _, row := range payload.Standings {
				for key := range row {
					switch key {
					case "player", "position", "lapsCompleted", "pitstops", "slotID", "vehicleName", "carNumber":
					default:
						t.Fatalf("event %d REST standings contains unadmitted key", index)
					}
				}
			}
			for key := range payload.SessionInfo {
				switch key {
				case "numberOfVehicles", "currentEventTime", "ambientTemp", "trackTemp", "averagePathWetness", "yellowFlagState", "trackName", "session":
				default:
					t.Fatalf("event %d REST session contains unadmitted key", index)
				}
			}
			restCount++
		default:
			t.Fatalf("event %d unknown kind %q", index, event.Kind)
		}
	}
	if manifest.StartedAtUTC != manifest.Events[0].AtUTC || manifest.CompletedAtUTC != manifest.Events[len(manifest.Events)-1].AtUTC ||
		shmCount != manifest.SHMTicks || restCount != manifest.RESTReports || previous.Sub(first) < duration-time.Second || previousSource-firstSource < duration-2*time.Second {
		t.Fatalf("corpus incomplete: SHM=%d REST=%d wall=%s source=%s", shmCount, restCount, previous.Sub(first), previousSource-firstSource)
	}
	t.Logf("audited high-rate real corpus: build=%s vehicles=%d SHM=%d REST=%d wall=%s source=%s", manifest.Build, manifest.Vehicles, shmCount, restCount, previous.Sub(first), previousSource-firstSource)
}
