package lmu

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestFrameSanitizerRebuildsFromZeroAndPreservesParserFacts(t *testing.T) {
	input := knownBuffer(t)
	original := append([]byte(nil), input...)
	sanitizer, err := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	if err != nil {
		t.Fatal(err)
	}
	output, err := sanitizer.Sanitize(input)
	if err != nil {
		t.Fatalf("Sanitize() error = %v", err)
	}
	if !bytes.Equal(input, original) {
		t.Fatal("Sanitize() mutated the input buffer")
	}
	if len(output) != ObjectOutSize || output[500] != 0 || output[130000] != 0 {
		t.Fatal("unknown bytes survived sanitization")
	}
	assertOnlyAllowedDiagnosticBytes(t, input, output)
	body := string(output)
	for _, forbidden := range []string{"driver-", "Circuit", "SyntheticUser", "synthetic-account-id"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("sanitized frame leaked %q", forbidden)
		}
	}
	if !strings.Contains(body, "Track-01") || !strings.Contains(body, "Driver-001") ||
		!strings.Contains(body, "Vehicle-001") || !strings.Contains(body, "Class-001") {
		t.Fatal("synthetic aliases are absent")
	}
	parsed, err := parseWithBuild(output, time.Unix(2, 0).UTC(), BuildEvidence{FileVersion: supportedLMUVersion})
	if err != nil || parsed.Compatibility != CompatibilityKnown {
		t.Fatalf("sanitized parse = %#v, %v", parsed, err)
	}
	track, ok := parsed.TrackName.Value()
	if !ok || track != "Track-01" {
		t.Fatalf("track = %q,%v", track, ok)
	}
	if len(parsed.Vehicles) != 44 {
		t.Fatalf("sanitized grid rows=%d, want 44", len(parsed.Vehicles))
	}
	vehicle, ok := parsed.Vehicles[0].VehicleName.Value()
	if !ok || string(vehicle) != "Vehicle-001" {
		t.Fatalf("vehicle = %q,%v", vehicle, ok)
	}
	originalParsed, err := parseWithBuild(input, time.Unix(2, 0).UTC(), BuildEvidence{FileVersion: supportedLMUVersion})
	if err != nil {
		t.Fatal(err)
	}
	assertDiagnosticPlayerScopeEqual(t, originalParsed, parsed)
}

func TestFrameSanitizerRejectsUnknownBuildFingerprintAndShortFrames(t *testing.T) {
	if _, err := NewFrameSanitizer(BuildEvidence{}); !errors.Is(err, ErrUnsanitizableFrame) {
		t.Fatalf("NewFrameSanitizer(unknown) error = %v", err)
	}
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	for _, input := range [][]byte{nil, make([]byte, ObjectOutSize-1)} {
		if _, err := sanitizer.Sanitize(input); !errors.Is(err, ErrUnsanitizableFrame) {
			t.Fatalf("Sanitize(len=%d) error = %v", len(input), err)
		}
	}
}

func TestDiagnosticCandidateSanitizerRebuildsPinnedLMU14WithoutLeaking(t *testing.T) {
	input := knownBuffer(t)
	writeCString(input[lmu13Layout.Session.TrackName.Offset:lmu13Layout.Session.TrackName.end()], "Private Circuit")
	firstScoring, _ := lmu13Layout.ScoringRows.rowBase(0)
	writeCString(input[firstScoring+lmu13Layout.Scoring.DriverLabel.Offset:firstScoring+lmu13Layout.Scoring.DriverLabel.end()], "Private Driver")
	input[500] = 0xa5

	build := BuildEvidence{FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion}
	sanitizer, err := newDiagnosticFrameSanitizer(build)
	if err != nil {
		t.Fatal(err)
	}
	output, err := sanitizer.Sanitize(input)
	if err != nil {
		t.Fatal(err)
	}
	assertOnlyAllowedDiagnosticBytes(t, input, output)
	if bytes.Contains(output, []byte("Private")) || output[500] != 0 {
		t.Fatal("candidate sanitizer retained PII or an excluded byte")
	}
	production, err := parseWithBuild(output, time.Unix(1, 0).UTC(), build)
	if err != nil {
		t.Fatal(err)
	}
	if production.Compatibility != CompatibilityKnown ||
		!strings.Contains(production.Fingerprint, "build="+diagnosticLMUVersion) {
		t.Fatalf("compatibility=%v fingerprint=%q", production.Compatibility, production.Fingerprint)
	}
	for _, size := range []int{ObjectOutSize - 1, ObjectOutSize + 1} {
		if _, err := sanitizer.Sanitize(make([]byte, size)); !errors.Is(err, ErrUnsanitizableFrame) {
			t.Fatalf("candidate Sanitize(len=%d) error = %v", size, err)
		}
	}
}

func TestFrameSanitizerReportsClosedFailureCodesWithoutRawValues(t *testing.T) {
	tests := []struct {
		name string
		code SanitizationFailureCode
		edit func([]byte)
	}{
		{
			name: "vehicle count",
			code: SanitizationVehicleCount,
			edit: func(input []byte) {
				binary.LittleEndian.PutUint32(input[lmu13Layout.Session.VehicleCount.Offset:], maxVehicles+1)
			},
		},
		{
			name: "scoring position",
			code: SanitizationScoringPosition,
			edit: func(input []byte) {
				base, _ := lmu13Layout.ScoringRows.rowBase(0)
				writeCString(input[base+lmu13Layout.Scoring.DriverLabel.Offset:base+lmu13Layout.Scoring.DriverLabel.end()], "Private Driver Canary")
				input[base+lmu13Layout.Scoring.Position.Offset] = 0
			},
		},
		{
			name: "scoring boolean",
			code: SanitizationScoringBoolean,
			edit: func(input []byte) {
				base, _ := lmu13Layout.ScoringRows.rowBase(0)
				input[base+lmu13Layout.Scoring.PlayerMarker.Offset] = 2
			},
		},
		{
			name: "ID bijection",
			code: SanitizationIDBijection,
			edit: func(input []byte) {
				base, _ := lmu13Layout.TelemetryRows.rowBase(0)
				binary.LittleEndian.PutUint32(input[base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset:], 999_999)
			},
		},
		{
			name: "duplicate player",
			code: SanitizationPlayerDuplicate,
			edit: func(input []byte) {
				base, _ := lmu13Layout.ScoringRows.rowBase(0)
				input[base+lmu13Layout.Scoring.PlayerMarker.Offset] = 1
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := knownBuffer(t)
			test.edit(input)
			sanitizer, err := newDiagnosticFrameSanitizer(BuildEvidence{
				FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion,
			})
			if err != nil {
				t.Fatal(err)
			}
			_, err = sanitizer.Sanitize(input)
			if !errors.Is(err, ErrUnsanitizableFrame) {
				t.Fatalf("Sanitize() error = %v", err)
			}
			code, ok := SanitizationCode(err)
			if !ok || code != test.code {
				t.Fatalf("SanitizationCode() = %q,%v, want %q", code, ok, test.code)
			}
			for _, forbidden := range []string{"Private Driver Canary", "999999", "raw", "offset"} {
				if strings.Contains(err.Error(), forbidden) {
					t.Fatalf("diagnostic error leaked %q: %v", forbidden, err)
				}
			}
		})
	}
}

func TestDiagnoseScoringRowFailureReportsExactClosedRangeCode(t *testing.T) {
	base, _ := lmu13Layout.ScoringRows.rowBase(0)
	tests := []struct {
		name string
		code SanitizationFailureCode
		edit func([]byte)
	}{
		{name: "completed laps", code: SanitizationScoringCompletedLaps, edit: func(input []byte) {
			binary.LittleEndian.PutUint16(input[base+lmu13Layout.Scoring.CompletedLaps.Offset:], ^uint16(0))
		}},
		{name: "sector", code: SanitizationScoringSector, edit: func(input []byte) {
			input[base+lmu13Layout.Scoring.Sector.Offset] = 3
		}},
		{name: "position", code: SanitizationScoringPosition, edit: func(input []byte) {
			input[base+lmu13Layout.Scoring.Position.Offset] = 0
		}},
		{name: "pit stops", code: SanitizationScoringPitStops, edit: func(input []byte) {
			binary.LittleEndian.PutUint16(input[base+lmu13Layout.Scoring.PitStopCount.Offset:], ^uint16(0))
		}},
		{name: "penalties", code: SanitizationScoringPenalties, edit: func(input []byte) {
			binary.LittleEndian.PutUint16(input[base+lmu13Layout.Scoring.PenaltyCount.Offset:], ^uint16(0))
		}},
		{name: "laps next", code: SanitizationScoringLapsNext, edit: func(input []byte) {
			binary.LittleEndian.PutUint32(input[base+lmu13Layout.Scoring.LapsBehindNext.Offset:], ^uint32(0))
		}},
		{name: "laps leader", code: SanitizationScoringLapsLeader, edit: func(input []byte) {
			binary.LittleEndian.PutUint32(input[base+lmu13Layout.Scoring.LapsBehindLeader.Offset:], ^uint32(0))
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := knownBuffer(t)
			test.edit(input)
			if code := diagnoseScoringRowFailure(input, base); code != test.code {
				t.Fatalf("code = %q, want %q", code, test.code)
			}
		})
	}
}

func TestDiagnosticCapturePreservesSanitizedFailureCode(t *testing.T) {
	input := knownBuffer(t)
	base, _ := lmu13Layout.ScoringRows.rowBase(0)
	writeCString(input[base+lmu13Layout.Scoring.DriverLabel.Offset:base+lmu13Layout.Scoring.DriverLabel.end()], "Private Driver Canary")
	input[base+lmu13Layout.Scoring.InPits.Offset] = 2
	reader := &testReader{data: input}
	_, err := captureSanitizedSharedMemory(
		t.Context(),
		func() (BuildEvidence, error) {
			return BuildEvidence{FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion}, nil
		},
		func() (memoryReader, error) { return reader, nil },
		func() time.Time { return time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC) },
	)
	if !errors.Is(err, ErrDiagnosticCapture) || !errors.Is(err, ErrUnsanitizableFrame) {
		t.Fatalf("capture error chain = %v", err)
	}
	code, ok := SanitizationCode(err)
	if !ok || code != SanitizationScoringBoolean {
		t.Fatalf("SanitizationCode() = %q,%v", code, ok)
	}
	if strings.Contains(err.Error(), "Private Driver Canary") {
		t.Fatalf("capture error leaked PII: %v", err)
	}
}

// advancedClockBuffer devuelve una copia del buffer con source_time adelantado,
// para que la confirmacion de vitalidad de la captura vea un reloj vivo.
func advancedClockBuffer(t testing.TB, source []byte, delta float64) []byte {
	t.Helper()
	buf := append([]byte(nil), source...)
	offset := lmu13Layout.Session.CurrentTime.Offset
	current := math.Float64frombits(binary.LittleEndian.Uint64(buf[offset : offset+8]))
	binary.LittleEndian.PutUint64(buf[offset:offset+8], math.Float64bits(current+delta))
	return buf
}

func TestDiagnosticCaptureRetriesTransientInvariantThenAccepts(t *testing.T) {
	invalid := knownBuffer(t)
	base, _ := lmu13Layout.ScoringRows.rowBase(0)
	invalid[base+lmu13Layout.Scoring.Position.Offset] = 0
	valid := knownBuffer(t)
	advanced := advancedClockBuffer(t, valid, 0.4)
	reader := &testReader{snapshots: [][]byte{invalid, invalid, valid, valid, advanced, advanced}}
	waits := 0
	livenessWaits := 0
	artifact, err := captureSanitizedSharedMemoryWithRetry(
		t.Context(),
		func() (BuildEvidence, error) {
			return BuildEvidence{FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion}, nil
		},
		func() (memoryReader, error) { return reader, nil },
		func() time.Time { return time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC) },
		func(context.Context) error {
			waits++
			return nil
		},
		func(context.Context) error {
			livenessWaits++
			return nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !artifact.valid() || reader.reads != 6 || reader.closes != 1 || waits != 1 || livenessWaits != 1 {
		t.Fatalf("artifact valid=%t reads=%d closes=%d waits=%d livenessWaits=%d", artifact.valid(), reader.reads, reader.closes, waits, livenessWaits)
	}
}

func TestDiagnosticCaptureExhaustsTwentyInvalidAttemptsWithoutPersistence(t *testing.T) {
	invalid := knownBuffer(t)
	base, _ := lmu13Layout.ScoringRows.rowBase(0)
	writeCString(invalid[base+lmu13Layout.Scoring.DriverLabel.Offset:base+lmu13Layout.Scoring.DriverLabel.end()], "Private Driver Canary")
	invalid[base+lmu13Layout.Scoring.Position.Offset] = 0
	reader := &testReader{data: invalid}
	waits := 0
	artifact, err := captureSanitizedSharedMemoryWithRetry(
		t.Context(),
		func() (BuildEvidence, error) {
			return BuildEvidence{FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion}, nil
		},
		func() (memoryReader, error) { return reader, nil },
		func() time.Time { return time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC) },
		func(context.Context) error {
			waits++
			return nil
		},
		func(context.Context) error { return nil },
	)
	if artifact.valid() || !errors.Is(err, ErrDiagnosticCapture) || !errors.Is(err, ErrUnsanitizableFrame) {
		t.Fatalf("artifact=%#v error=%v", artifact, err)
	}
	var exhausted *DiagnosticRetryError
	if !errors.As(err, &exhausted) {
		t.Fatalf("error type = %T, want *DiagnosticRetryError", err)
	}
	counts := exhausted.FailureCounts()
	if exhausted.AttemptCount() != diagnosticCaptureAttempts ||
		counts[string(SanitizationScoringPosition)] != diagnosticCaptureAttempts ||
		len(counts) != 1 || reader.reads != diagnosticCaptureAttempts*2 || waits != diagnosticCaptureAttempts-1 {
		t.Fatalf("attempts=%d counts=%v reads=%d waits=%d", exhausted.AttemptCount(), counts, reader.reads, waits)
	}
	for _, forbidden := range []string{"Private Driver Canary", "raw", "offset"} {
		if strings.Contains(err.Error(), forbidden) {
			t.Fatalf("retry error leaked %q: %v", forbidden, err)
		}
	}
	directory := t.TempDir()
	entries, readErr := os.ReadDir(directory)
	if readErr != nil || len(entries) != 0 {
		t.Fatalf("diagnostic retry persisted files: entries=%d error=%v", len(entries), readErr)
	}
}

func TestDiagnosticCaptureRejectsPermanentBuildOnce(t *testing.T) {
	buildCalls, opens, waits := 0, 0, 0
	_, err := captureSanitizedSharedMemoryWithRetry(
		t.Context(),
		func() (BuildEvidence, error) {
			buildCalls++
			return BuildEvidence{FileVersion: "9.9.9.9", ProductVersion: "9.9.9.9"}, nil
		},
		func() (memoryReader, error) {
			opens++
			return &testReader{data: knownBuffer(t)}, nil
		},
		func() time.Time { return time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC) },
		func(context.Context) error {
			waits++
			return nil
		},
		func(context.Context) error { return nil },
	)
	if !errors.Is(err, ErrDiagnosticCapture) || buildCalls != 1 || opens != 0 || waits != 0 {
		t.Fatalf("error=%v buildCalls=%d opens=%d waits=%d", err, buildCalls, opens, waits)
	}
	var exhausted *DiagnosticRetryError
	if errors.As(err, &exhausted) {
		t.Fatal("permanent version failure entered retry loop")
	}
}

func TestDiagnosticSharedMemoryCaptureUsesOneMappingAndNeverReturnsRaw(t *testing.T) {
	input := knownBuffer(t)
	writeCString(input[lmu13Layout.Session.TrackName.Offset:lmu13Layout.Session.TrackName.end()], "Private Circuit")
	// La confirmacion de vitalidad exige un reloj en movimiento para frames de
	// sesion activa, asi que la segunda adquisicion avanza source_time.
	advanced := advancedClockBuffer(t, input, 0.4)
	reader := &testReader{snapshots: [][]byte{input, input, advanced, advanced}}
	opens := 0
	at := time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC)
	artifact, err := captureSanitizedSharedMemory(
		t.Context(),
		func() (BuildEvidence, error) {
			return BuildEvidence{FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion}, nil
		},
		func() (memoryReader, error) {
			opens++
			return reader, nil
		},
		func() time.Time { return at },
	)
	if err != nil {
		t.Fatal(err)
	}
	if opens != 1 || reader.closes != 1 || reader.reads != 4 {
		t.Fatalf("opens=%d closes=%d reads=%d", opens, reader.closes, reader.reads)
	}
	if len(artifact.payload) != ObjectOutSize || artifact.capturedAtUTC != at || len(artifact.sha256) != 64 {
		t.Fatalf("artifact = %#v", artifact)
	}
	if bytes.Contains(artifact.payload, []byte("Private Circuit")) || strings.Contains(artifact.summary, "Private Circuit") {
		t.Fatal("diagnostic artifact retained raw input")
	}
}

func TestRESTDiagnosticCaptureWritesOnlySanitizedOverlap(t *testing.T) {
	now := time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC)
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			fmt.Fprint(w, `[{"player":true,"position":9,"lapsCompleted":0,"pitstops":0,"driverName":"Private Driver","steamId":"76561198000000000"}]`)
		case sessionInfoEndpoint:
			fmt.Fprint(w, `{"trackName":"Private Circuit","session":"PRACTICE","numberOfVehicles":44,"currentEventTime":112.6,"path":"C:\\Users\\Private","secret":"raw-body-canary"}`)
		default:
			http.NotFound(w, request)
		}
	})
	artifact, err := captureSanitizedRESTForSharedMemory(
		t.Context(),
		testRESTConfig(server, now),
		diagnosticTrackArtifact(t),
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(artifact.sha256) != 64 || !json.Valid(artifact.payload) {
		t.Fatalf("invalid REST artifact: %#v", artifact)
	}
	text := string(artifact.payload)
	for _, forbidden := range []string{
		"Private Driver", "Private Circuit", "76561198000000000", "Users", "raw-body-canary", "driverName", "steamId", "path", "secret",
	} {
		if strings.Contains(text, forbidden) || strings.Contains(artifact.summary, forbidden) {
			t.Fatalf("REST diagnostic artifact leaked %q: %s", forbidden, text)
		}
	}
	var decoded map[string]any
	if err := json.Unmarshal(artifact.payload, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"schema", "captured_at_utc", "status", "endpoints", "session", "player"} {
		if _, present := decoded[key]; !present {
			t.Fatalf("sanitized REST artifact omitted %q: %s", key, text)
		}
	}
	if len(decoded) != 6 {
		t.Fatalf("unexpected top-level REST keys: %#v", decoded)
	}
}

func TestRESTDiagnosticCaptureRejectsMismatchedTrackBeforeAliasing(t *testing.T) {
	now := time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC)
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			fmt.Fprint(w, `[{"player":true,"position":9,"lapsCompleted":0,"pitstops":0}]`)
		case sessionInfoEndpoint:
			fmt.Fprint(w, `{"trackName":"Different Circuit","session":"PRACTICE","numberOfVehicles":44,"currentEventTime":112.6}`)
		default:
			http.NotFound(w, request)
		}
	})
	if _, err := captureSanitizedRESTForSharedMemory(
		t.Context(),
		testRESTConfig(server, now),
		diagnosticTrackArtifact(t),
	); !errors.Is(err, ErrDiagnosticCapture) {
		t.Fatalf("mismatched track error = %v", err)
	}
}

func TestRESTDiagnosticCaptureAcceptsTypedUnavailableMenuWithoutOverlap(t *testing.T) {
	for _, test := range []struct {
		name       string
		statusCode int
		wantStatus string
	}{
		{name: "unavailable", statusCode: http.StatusServiceUnavailable, wantStatus: "unavailable"},
		{name: "empty", statusCode: http.StatusOK, wantStatus: "empty"},
		{name: "unsupported", statusCode: http.StatusNotFound, wantStatus: "unsupported"},
	} {
		t.Run(test.name, func(t *testing.T) {
			now := time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC)
			server := newRESTServer(t, func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(test.statusCode)
			})
			artifact, err := captureSanitizedRESTForSharedMemory(
				t.Context(),
				testRESTConfig(server, now),
				diagnosticMenuArtifact(t),
			)
			if err != nil {
				t.Fatal(err)
			}
			var document diagnosticRESTDocument
			if err := json.Unmarshal(artifact.payload, &document); err != nil {
				t.Fatal(err)
			}
			if document.Status != test.wantStatus {
				t.Fatalf("status = %q, want %q", document.Status, test.wantStatus)
			}
			for name, field := range diagnosticRESTOverlapFields(document) {
				if field.Freshness != "missing" || field.UpdatedUTC != "" || field.Value != nil {
					t.Fatalf("%s overlap = %#v, want missing without value/timestamp", name, field)
				}
			}
			if document.Endpoints.Standings.LastAttemptUTC.IsZero() || document.Endpoints.SessionInfo.LastAttemptUTC.IsZero() {
				t.Fatal("menu status artifact omitted allowed attempt timestamps")
			}
		})
	}
}

func TestRESTDiagnosticCaptureRejectsUnavailableTrackAndMalformedMenu(t *testing.T) {
	now := time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC)
	unavailable := newRESTServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	if _, err := captureSanitizedRESTForSharedMemory(
		t.Context(),
		testRESTConfig(unavailable, now),
		diagnosticTrackArtifact(t),
	); !errors.Is(err, ErrDiagnosticCapture) {
		t.Fatalf("track unavailable error = %v", err)
	}

	malformed := newRESTServer(t, func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `{broken`)
	})
	if _, err := captureSanitizedRESTForSharedMemory(
		t.Context(),
		testRESTConfig(malformed, now),
		diagnosticMenuArtifact(t),
	); !errors.Is(err, ErrDiagnosticCapture) {
		t.Fatalf("menu malformed error = %v", err)
	}

	staleTrack := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			fmt.Fprint(w, `[{"player":true,"position":9,"lapsCompleted":0,"pitstops":0}]`)
		case sessionInfoEndpoint:
			fmt.Fprint(w, `{"trackName":"Previous Track","session":"PRACTICE","numberOfVehicles":44,"currentEventTime":112.6}`)
		default:
			http.NotFound(w, request)
		}
	})
	if _, err := captureSanitizedRESTForSharedMemory(
		t.Context(),
		testRESTConfig(staleTrack, now),
		diagnosticMenuArtifact(t),
	); !errors.Is(err, ErrDiagnosticCapture) {
		t.Fatalf("uncorrelated live REST beside menu error = %v", err)
	}

	correlatedMenu := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			fmt.Fprint(w, `[]`)
		case sessionInfoEndpoint:
			fmt.Fprint(w, `{"trackName":"Private Circuit","session":"PRACTICE","numberOfVehicles":44,"currentEventTime":112.6}`)
		default:
			http.NotFound(w, request)
		}
	})
	if _, err := captureSanitizedRESTForSharedMemory(
		t.Context(),
		testRESTConfig(correlatedMenu, now),
		diagnosticMenuArtifact(t),
	); !errors.Is(err, ErrDiagnosticCapture) {
		t.Fatalf("correlated live REST beside menu error = %v", err)
	}
}

func TestWriteSanitizedCaptureNeverOverwritesOrAcceptsTampering(t *testing.T) {
	sanitizer, err := newDiagnosticFrameSanitizer(BuildEvidence{
		FileVersion:    diagnosticLMUVersion,
		ProductVersion: diagnosticLMUVersion,
	})
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := buildSharedMemoryDiagnosticArtifact(
		knownBuffer(t),
		time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC),
		sanitizer,
	)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "capture.bin")
	if err := WriteSanitizedCapture(path, artifact); err != nil {
		t.Fatal(err)
	}
	written, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(written, artifact.payload) {
		t.Fatalf("written artifact mismatch: bytes=%d error=%v", len(written), err)
	}
	if err := WriteSanitizedCapture(path, artifact); !errors.Is(err, ErrDiagnosticCapture) {
		t.Fatalf("overwrite error = %v", err)
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(after, written) {
		t.Fatal("failed overwrite changed the existing evidence")
	}

	tampered := artifact
	tampered.payload = append([]byte(nil), artifact.payload...)
	tampered.payload[500] = 0xa5
	tamperedPath := filepath.Join(filepath.Dir(path), "tampered.bin")
	if err := WriteSanitizedCapture(tamperedPath, tampered); !errors.Is(err, ErrDiagnosticCapture) {
		t.Fatalf("tampered artifact error = %v", err)
	}
	if _, err := os.Stat(tamperedPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("tampered artifact was persisted: %v", err)
	}
}

func TestWriteSanitizedCapturePairIsFailClosedWhenEitherTargetExists(t *testing.T) {
	shared := diagnosticTrackArtifact(t)
	rest := newDiagnosticArtifact(
		DiagnosticCaptureREST,
		shared.capturedAtUTC,
		[]byte("{}\n"),
		"status=live",
	)
	directory := t.TempDir()
	sharedPath := filepath.Join(directory, "shared.bin")
	restPath := filepath.Join(directory, "rest.json")
	if err := os.WriteFile(restPath, []byte("existing"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := WriteSanitizedCapturePair(sharedPath, shared, restPath, rest); !errors.Is(err, ErrDiagnosticCapture) {
		t.Fatalf("pair error = %v", err)
	}
	if _, err := os.Stat(sharedPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("pair left partial Shared Memory artifact: %v", err)
	}
	existing, err := os.ReadFile(restPath)
	if err != nil || string(existing) != "existing" {
		t.Fatal("pair overwrote the existing REST target")
	}
}

func diagnosticTrackArtifact(t testing.TB) DiagnosticCaptureArtifact {
	t.Helper()
	input := knownBuffer(t)
	if !writeCString(
		input[lmu13Layout.Session.TrackName.Offset:lmu13Layout.Session.TrackName.end()],
		"Private Circuit",
	) {
		t.Fatal("write private track fixture")
	}
	sanitizer, err := newDiagnosticFrameSanitizer(BuildEvidence{
		FileVersion:    diagnosticLMUVersion,
		ProductVersion: diagnosticLMUVersion,
	})
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := buildSharedMemoryDiagnosticArtifact(
		input,
		time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC),
		sanitizer,
	)
	if err != nil {
		t.Fatal(err)
	}
	return artifact
}

func diagnosticMenuArtifact(t testing.TB) DiagnosticCaptureArtifact {
	t.Helper()
	input := knownBuffer(t)
	vehicles := int(readInt32(input, lmu13Layout.Session.VehicleCount.Offset))
	for row := range vehicles {
		base, _ := lmu13Layout.ScoringRows.rowBase(row)
		input[base+lmu13Layout.Scoring.PlayerMarker.Offset] = 0
	}
	sanitizer, err := newDiagnosticFrameSanitizer(BuildEvidence{
		FileVersion:    diagnosticLMUVersion,
		ProductVersion: diagnosticLMUVersion,
	})
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := buildSharedMemoryDiagnosticArtifact(
		input,
		time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC),
		sanitizer,
	)
	if err != nil {
		t.Fatal(err)
	}
	return artifact
}

func diagnosticRESTOverlapFields(document diagnosticRESTDocument) map[string]diagnosticRESTField {
	return map[string]diagnosticRESTField{
		"track":           document.Session.Track,
		"source_time":     document.Session.SourceTimeSeconds,
		"session_type":    document.Session.Type,
		"vehicle_count":   document.Session.VehicleCount,
		"player_present":  document.Player.Present,
		"player_position": document.Player.Position,
		"completed_laps":  document.Player.CompletedLaps,
		"pit_stop_count":  document.Player.PitStopCount,
	}
}

func TestFrameSanitizerRemapsIdentityStablyWithinCapture(t *testing.T) {
	input := knownBuffer(t)
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	first, err := sanitizer.Sanitize(input)
	if err != nil {
		t.Fatal(err)
	}
	secondInput := append([]byte(nil), input...)
	second, err := sanitizer.Sanitize(secondInput)
	if err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 44; index++ {
		scoringBase, _ := lmu13Layout.ScoringRows.rowBase(index)
		telemetryBase, _ := lmu13Layout.TelemetryRows.rowBase(index)
		if binary.LittleEndian.Uint32(first[scoringBase:]) != binary.LittleEndian.Uint32(second[scoringBase:]) ||
			binary.LittleEndian.Uint32(first[telemetryBase:]) != binary.LittleEndian.Uint32(second[telemetryBase:]) {
			t.Fatalf("row %d source ID received unstable aliases", index)
		}
		if binary.LittleEndian.Uint32(first[scoringBase:]) == binary.LittleEndian.Uint32(input[scoringBase:]) {
			t.Fatalf("row %d source ID survived sanitization", index)
		}
	}
}

func TestFrameSanitizerNeverUsesAnyActiveSourceIDAsAnAlias(t *testing.T) {
	input := knownBuffer(t)
	activeIDs := make(map[uint32]struct{}, 44)
	for row := 0; row < 44; row++ {
		id := uint32(1_000_001 + row)
		activeIDs[id] = struct{}{}
		scoringBase, _ := lmu13Layout.ScoringRows.rowBase(row)
		telemetryBase, _ := lmu13Layout.TelemetryRows.rowBase(row)
		binary.LittleEndian.PutUint32(input[scoringBase:], id)
		binary.LittleEndian.PutUint32(input[telemetryBase:], id)
	}
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	output, err := sanitizer.Sanitize(input)
	if err != nil {
		t.Fatal(err)
	}
	for row := 0; row < 44; row++ {
		scoringBase, _ := lmu13Layout.ScoringRows.rowBase(row)
		telemetryBase, _ := lmu13Layout.TelemetryRows.rowBase(row)
		for _, id := range []uint32{
			binary.LittleEndian.Uint32(output[scoringBase:]),
			binary.LittleEndian.Uint32(output[telemetryBase:]),
		} {
			if _, leaked := activeIDs[id]; leaked {
				t.Fatalf("row %d sanitized source ID %d matches an active source ID", row, id)
			}
		}
	}
}

func TestFrameSanitizerRebuildsFullGridAndDropsCanariesFromEveryExcludedRange(t *testing.T) {
	input := knownBuffer(t)
	allowed := diagnosticAllowedByteMask(input)
	for index := range input {
		if !allowed[index] {
			input[index] = 0xa5
		}
	}
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	output, err := sanitizer.Sanitize(input)
	if err != nil {
		t.Fatal(err)
	}
	assertOnlyAllowedDiagnosticBytes(t, input, output)
	for index, value := range output {
		if !allowed[index] && value != 0 {
			t.Fatalf("excluded byte %d survived as 0x%02x", index, value)
		}
	}
	parsed, err := parseSupported(output, time.Unix(0, 0).UTC())
	if err != nil || parsed.Compatibility != CompatibilityKnown || len(parsed.Vehicles) != 44 {
		t.Fatalf("rebuilt parse=(compatibility=%v rows=%d error=%v)", parsed.Compatibility, len(parsed.Vehicles), err)
	}
}

func TestCaptureTapIsBoundedCopiesAndClosesIdempotently(t *testing.T) {
	tap, err := NewCaptureTap(1)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().Round(0).UTC()
	payload := make([]byte, ObjectOutSize)
	payload[10] = 1
	reservation, ok := tap.Reserve(now)
	if !ok || !reservation.Commit(payload) {
		t.Fatal("first reservation/commit failed")
	}
	payload[10] = 2
	if _, ok := tap.Reserve(now.Add(time.Second)); ok {
		t.Fatal("saturated Reserve() = true")
	}
	frame := <-tap.Frames()
	if frame.Payload[10] != 1 {
		t.Fatal("tap retained caller-owned buffer")
	}
	tap.Close()
	tap.Close()
	if _, open := <-tap.Frames(); open {
		t.Fatal("tap channel remained open")
	}
	stats := tap.Stats()
	if stats.Offered != 1 || stats.Dropped != 1 || !stats.Closed {
		t.Fatalf("Stats() = %#v", stats)
	}
}

func TestDriverSaturatedTapDoesNotAllocateSanitizedFrame(t *testing.T) {
	source := knownBuffer(t)
	tap, _ := NewCaptureTap(1)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	reservation, ok := tap.Reserve(now)
	if !ok || !reservation.Commit(make([]byte, ObjectOutSize)) {
		t.Fatal("failed to saturate tap")
	}
	driver := newDriver(config{captureTap: tap, rest: nil})
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	allocations := testing.AllocsPerRun(100, func() {
		driver.captureDiagnosticFrame(now.Add(time.Second), source, sanitizer)
	})
	if allocations != 0 {
		t.Fatalf("saturated driver path allocations = %.2f, want 0", allocations)
	}
	// AllocsPerRun performs one warm-up invocation before the 100 measured runs.
	if stats := tap.Stats(); stats.Offered != 1 || stats.Dropped != 101 {
		t.Fatalf("Stats() = %#v", stats)
	}
}

func TestDriverFeedsSanitizedTapWithoutSecondSharedMemoryOpen(t *testing.T) {
	reader := &testReader{data: knownBuffer(t)}
	tap, _ := NewCaptureTap(2)
	opens := 0
	driver := newTestDriver(config{
		open: func() (memoryReader, error) {
			opens++
			return reader, nil
		},
		captureTap: tap,
	})
	sink := &collectingSink{values: make(chan Observation, 1)}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	<-sink.values
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v", err)
	}
	if opens != 1 || reader.closes != 1 {
		t.Fatalf("opens=%d closes=%d", opens, reader.closes)
	}
	frame, ok := <-tap.Frames()
	if !ok || len(frame.Payload) != ObjectOutSize {
		t.Fatalf("tap frame = %d,%v", len(frame.Payload), ok)
	}
	if _, open := <-tap.Frames(); open {
		t.Fatal("tap was not closed during driver teardown")
	}
}

func TestDriverDropsSaturatedTapWithoutBlockingLive(t *testing.T) {
	reader := &testReader{data: knownBuffer(t)}
	tap, _ := NewCaptureTap(1)
	ticks := &manualTicker{ticks: make(chan time.Time, 1)}
	current := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	driver := newTestDriver(config{
		open:       func() (memoryReader, error) { return reader, nil },
		newTicker:  func(time.Duration) ticker { return ticks },
		captureTap: tap,
		now: func() time.Time {
			value := current
			current = current.Add(time.Second)
			return value
		},
	})
	sink := &collectingSink{values: make(chan Observation, 2)}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	<-sink.values
	ticks.ticks <- time.Now()
	select {
	case <-sink.values:
	case <-time.After(time.Second):
		t.Fatal("saturated tap blocked live telemetry")
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	stats := tap.Stats()
	if stats.Offered != 1 || stats.Dropped != 1 {
		t.Fatalf("tap stats = %#v", stats)
	}
}

func assertDiagnosticPlayerScopeEqual(t testing.TB, original, sanitized Observation) {
	t.Helper()
	if original.Compatibility != sanitized.Compatibility ||
		original.SourceTime != sanitized.SourceTime ||
		original.SessionType != sanitized.SessionType ||
		original.VehicleCount != sanitized.VehicleCount ||
		original.PlayerPresent != sanitized.PlayerPresent ||
		original.EndTime != sanitized.EndTime ||
		original.MaximumLaps != sanitized.MaximumLaps ||
		len(original.Vehicles) != len(sanitized.Vehicles) {
		t.Fatalf("sanitized replay changed audited player/global fields:\noriginal=%#v\nsanitized=%#v", original, sanitized)
	}
	for index := range original.Vehicles {
		left, right := original.Vehicles[index], sanitized.Vehicles[index]
		if left.SourceID == right.SourceID ||
			left.Player != right.Player || left.Position != right.Position ||
			left.CompletedLaps != right.CompletedLaps || left.Sector != right.Sector ||
			left.LapDistance != right.LapDistance || left.BestLapTime != right.BestLapTime ||
			left.LastLapTime != right.LastLapTime || left.EstimatedLapTime != right.EstimatedLapTime ||
			left.InPit != right.InPit || left.PitStopCount != right.PitStopCount ||
			left.PenaltyCount != right.PenaltyCount || left.TimeBehindLeader != right.TimeBehindLeader ||
			left.LapsBehindLeader != right.LapsBehindLeader || left.TimeBehindNext != right.TimeBehindNext ||
			left.LapsBehindNext != right.LapsBehindNext || left.LapNumber != right.LapNumber ||
			left.Gear != right.Gear || left.EngineRPM != right.EngineRPM || left.SpeedMPS != right.SpeedMPS ||
			left.Throttle != right.Throttle || left.Brake != right.Brake || left.Clutch != right.Clutch ||
			left.Fuel != right.Fuel || left.WorldPosition != right.WorldPosition ||
			left.LocalVelocity != right.LocalVelocity || left.Orientation != right.Orientation {
			t.Fatalf("sanitized row %d changed numeric facts:\noriginal=%#v\nsanitized=%#v", index, left, right)
		}
	}
}

func FuzzFrameSanitizerNeverPanicsOrLeaksUnknownBytes(f *testing.F) {
	f.Add(knownBuffer(f))
	f.Add(make([]byte, ObjectOutSize))
	f.Fuzz(func(t *testing.T, input []byte) {
		original := append([]byte(nil), input...)
		sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
		output, err := sanitizer.Sanitize(input)
		if !bytes.Equal(input, original) {
			t.Fatal("Sanitize() mutated fuzz input")
		}
		if err == nil {
			if len(output) != ObjectOutSize {
				t.Fatalf("Sanitize() len = %d", len(output))
			}
			assertOnlyAllowedDiagnosticBytes(t, input, output)
		}
	})
}

func BenchmarkDriverCapturePath(b *testing.B) {
	source := knownBuffer(b)
	build := BuildEvidence{FileVersion: supportedLMUVersion}
	b.Run("tap-absent", func(b *testing.B) {
		driver := newDriver(config{rest: nil})
		profile := profileFromBuild(build)
		sanitizer, _ := NewFrameSanitizer(build)
		b.ReportAllocs()
		for b.Loop() {
			driver.captureDiagnosticFrame(time.Unix(1, 0).UTC(), source, sanitizer)
			if _, err := parseWithProfile(source, time.Unix(1, 0).UTC(), profile); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("tap-active", func(b *testing.B) {
		tap, _ := NewCaptureTap(1)
		driver := newDriver(config{captureTap: tap, rest: nil})
		profile := profileFromBuild(build)
		sanitizer, _ := NewFrameSanitizer(build)
		at := time.Unix(1, 0).UTC()
		b.ReportAllocs()
		for b.Loop() {
			driver.captureDiagnosticFrame(at, source, sanitizer)
			<-tap.Frames()
			if _, err := parseWithProfile(source, at, profile); err != nil {
				b.Fatal(err)
			}
			at = at.Add(time.Second)
		}
	})
	b.Run("tap-saturated", func(b *testing.B) {
		tap, _ := NewCaptureTap(1)
		driver := newDriver(config{captureTap: tap, rest: nil})
		profile := profileFromBuild(build)
		sanitizer, _ := NewFrameSanitizer(build)
		at := time.Unix(1, 0).UTC()
		reservation, _ := tap.Reserve(at)
		reservation.Commit(make([]byte, ObjectOutSize))
		b.ReportAllocs()
		for b.Loop() {
			driver.captureDiagnosticFrame(at.Add(time.Second), source, sanitizer)
			if _, err := parseWithProfile(source, at, profile); err != nil {
				b.Fatal(err)
			}
		}
	})
}

func BenchmarkSanitizeObjectOut44Vehicles(b *testing.B) {
	input := knownBuffer(b)
	sanitizer, err := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.SetBytes(ObjectOutSize)
	for b.Loop() {
		if _, err := sanitizer.Sanitize(input); err != nil {
			b.Fatal(err)
		}
	}
}

func assertOnlyAllowedDiagnosticBytes(t testing.TB, input, output []byte) {
	t.Helper()
	if len(input) != ObjectOutSize || len(output) != ObjectOutSize {
		t.Fatalf("unexpected frame lengths: input=%d output=%d", len(input), len(output))
	}
	allowed := diagnosticAllowedByteMask(input)
	assertCStringEquals(t, output[1632:1696], "Track-01")
	vehicles := int(readInt32(input, lmu13Layout.Session.VehicleCount.Offset))
	for row := 0; row < vehicles; row++ {
		base, _ := lmu13Layout.ScoringRows.rowBase(row)
		assertCStringEquals(t, output[base+4:base+36], fmt.Sprintf("Driver-%03d", row+1))
		assertCStringEquals(t, output[base+36:base+100], fmt.Sprintf("Vehicle-%03d", row+1))
		assertCStringEquals(t, output[base+200:base+232], fmt.Sprintf("Class-%03d", row+1))
	}
	for index, value := range output {
		if !allowed[index] && value != 0 {
			t.Fatalf("byte %d outside allowlist = 0x%02x", index, value)
		}
	}
}

func diagnosticAllowedByteMask(input []byte) []bool {
	allowed := make([]bool, ObjectOutSize)
	mark := func(offset, size int) {
		for index := offset; index < offset+size; index++ {
			allowed[index] = true
		}
	}
	for _, field := range []layoutField{
		lmu13Layout.Session.TrackName, lmu13Layout.Session.SessionType,
		lmu13Layout.Session.CurrentTime, lmu13Layout.Session.EndTime,
		lmu13Layout.Session.MaximumLaps, lmu13Layout.Session.VehicleCount,
	} {
		mark(field.Offset, field.width())
	}
	vehicles := int(readInt32(input, lmu13Layout.Session.VehicleCount.Offset))
	if vehicles < 0 || vehicles > lmu13Layout.ScoringRows.Maximum {
		return allowed
	}
	playerID := VehicleSourceID(-1)
	for row := 0; row < vehicles; row++ {
		base, _ := lmu13Layout.ScoringRows.rowBase(row)
		for _, field := range []layoutField{
			lmu13Layout.Scoring.VehicleSourceSlot, lmu13Layout.Scoring.DriverLabel,
			lmu13Layout.Scoring.VehicleLabel, lmu13Layout.Scoring.CompletedLaps,
			lmu13Layout.Scoring.Sector, lmu13Layout.Scoring.LapDistance,
			lmu13Layout.Scoring.BestLapTime, lmu13Layout.Scoring.LastLapTime,
			lmu13Layout.Scoring.PitStopCount, lmu13Layout.Scoring.PenaltyCount,
			lmu13Layout.Scoring.PlayerMarker, lmu13Layout.Scoring.InPits,
			lmu13Layout.Scoring.Position, lmu13Layout.Scoring.VehicleClass,
			lmu13Layout.Scoring.TimeBehindNext, lmu13Layout.Scoring.LapsBehindNext,
			lmu13Layout.Scoring.TimeBehindLeader, lmu13Layout.Scoring.LapsBehindLeader,
			lmu13Layout.Scoring.EstimatedLapTime,
			lmu13Layout.Scoring.WorldPosition, lmu13Layout.Scoring.LocalVelocity,
			lmu13Layout.Scoring.Orientation,
		} {
			mark(base+field.Offset, field.width())
		}
		if input[base+lmu13Layout.Scoring.PlayerMarker.Offset] == 1 {
			playerID = VehicleSourceID(readInt32(input, base+lmu13Layout.Scoring.VehicleSourceSlot.Offset))
		}
	}
	for row := 0; row < vehicles; row++ {
		base, _ := lmu13Layout.TelemetryRows.rowBase(row)
		mark(base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset, lmu13Layout.Telemetry.VehicleSourceSlot.width())
		if VehicleSourceID(readInt32(input, base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset)) != playerID {
			continue
		}
		for _, field := range []layoutField{
			lmu13Layout.Telemetry.LapNumber, lmu13Layout.Telemetry.WorldPosition,
			lmu13Layout.Telemetry.LocalVelocity, lmu13Layout.Telemetry.Orientation,
			lmu13Layout.Telemetry.Gear, lmu13Layout.Telemetry.EngineRPM,
			lmu13Layout.Telemetry.Throttle, lmu13Layout.Telemetry.Brake,
			lmu13Layout.Telemetry.Clutch, lmu13Layout.Telemetry.FuelLiters,
			lmu13Layout.Telemetry.FuelCapacityLiters,
		} {
			mark(base+field.Offset, field.width())
		}
	}
	return allowed
}

func assertCStringEquals(t testing.TB, value []byte, expected string) {
	t.Helper()
	want := make([]byte, len(value))
	copy(want, expected)
	if !bytes.Equal(value, want) {
		t.Fatalf("C string = %q, want %q", value, want)
	}
}

func TestDiagnosticCaptureRejectsFrozenSessionRemnant(t *testing.T) {
	frozen := knownBuffer(t)
	reader := &testReader{data: frozen}
	livenessWaits := 0
	artifact, err := captureSanitizedSharedMemoryWithRetry(
		t.Context(),
		func() (BuildEvidence, error) {
			return BuildEvidence{FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion}, nil
		},
		func() (memoryReader, error) { return reader, nil },
		func() time.Time { return time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC) },
		func(context.Context) error { return nil },
		func(context.Context) error {
			livenessWaits++
			return nil
		},
	)
	if artifact.valid() || !errors.Is(err, ErrDiagnosticCapture) || !errors.Is(err, ErrStaleSessionRemnant) {
		t.Fatalf("artifact=%#v error=%v", artifact, err)
	}
	if livenessWaits != 1 {
		t.Fatalf("livenessWaits = %d, want 1", livenessWaits)
	}
	if strings.Contains(err.Error(), "Private") {
		t.Fatalf("liveness error leaked PII: %v", err)
	}
}

func TestDiagnosticCaptureMenuFrameSkipsLivenessConfirmation(t *testing.T) {
	menu, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-1.4.1.3-menu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	reader := &testReader{data: menu}
	livenessWaits := 0
	artifact, err := captureSanitizedSharedMemoryWithRetry(
		t.Context(),
		func() (BuildEvidence, error) {
			return BuildEvidence{FileVersion: "1.4.1.3", ProductVersion: "1.4.1.3"}, nil
		},
		func() (memoryReader, error) { return reader, nil },
		func() time.Time { return time.Date(2026, 8, 20, 3, 0, 0, 0, time.UTC) },
		func(context.Context) error { return nil },
		func(context.Context) error {
			livenessWaits++
			return nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !artifact.valid() || livenessWaits != 0 || reader.reads != 2 {
		t.Fatalf("artifact valid=%t livenessWaits=%d reads=%d", artifact.valid(), livenessWaits, reader.reads)
	}
}
