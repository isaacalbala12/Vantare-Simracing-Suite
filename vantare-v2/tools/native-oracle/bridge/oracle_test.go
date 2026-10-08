//go:build native_oracle

// This test is compiled inside a temporary copy of the frozen LMU package.
// All parsing, fusion, identity, reduction, derivation and projection below
// call unchanged production functions; this file only schedules and records.
package lmu

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

const oracleCorpusSHA = "c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c"

type oracleCell struct {
	V any    `json:"v"`
	Q string `json:"q"`
}

type oracleRow struct {
	ID            string     `json:"id"`
	Ordinal       uint32     `json:"ordinal"`
	Number        string     `json:"number"`
	Driver        string     `json:"driver"`
	Class         string     `json:"class"`
	Position      oracleCell `json:"position"`
	ClassPosition oracleCell `json:"class_position"`
	Laps          oracleCell `json:"laps"`
	LastLap       oracleCell `json:"last_lap_ms"`
	BestLap       oracleCell `json:"best_lap_ms"`
	GapLeader     oracleCell `json:"gap_leader"`
	GapAhead      oracleCell `json:"gap_ahead"`
	InPits        oracleCell `json:"in_pits"`
}

type oracleGolden struct {
	GoRejection string                `json:"go_rejection"`
	Session     map[string]oracleCell `json:"session"`
	Cars        []oracleRow           `json:"cars"`
}

type oracleEntry struct {
	File        string `json:"file"`
	SHA256      string `json:"sha256"`
	Input       string `json:"input"`
	InputSHA256 string `json:"input_sha256"`
	Build       string `json:"build"`
	Event       int    `json:"event"`
}

type oracleEvent struct {
	Kind               string    `json:"kind"`
	Index              int       `json:"index"`
	File               string    `json:"file"`
	SHA256             string    `json:"sha256"`
	At                 time.Time `json:"atUtc"`
	StandingsStarted   time.Time `json:"standingsStartedUtc"`
	StandingsCompleted time.Time `json:"standingsCompletedUtc"`
	SessionStarted     time.Time `json:"sessionStartedUtc"`
}

type oraclePipeline struct {
	fusion   Fusion
	mapper   *BatchMapper
	reducer  *core.Reducer
	derive   *derive.Pipeline
	final    derive.FinalState
	ordinals map[string]uint32
}

func newOraclePipeline() *oraclePipeline {
	return &oraclePipeline{mapper: NewBatchMapper(), reducer: core.NewReducer(), derive: derive.NewPipeline(derive.Config{}), ordinals: make(map[string]uint32)}
}

func (p *oraclePipeline) apply(ctx context.Context, at time.Time, elapsed time.Duration, observation Observation) error {
	canonical := p.fusion.Merge(at, elapsed, observation)
	return p.mapper.WriteObservation(ctx, canonical, core.BatchSinkFunc(func(ctx context.Context, batch core.Batch) error {
		observed, err := p.reducer.Apply(batch)
		if err != nil {
			return err
		}
		final, err := p.derive.Apply(ctx, observed)
		if err != nil {
			return err
		}
		value, ok := final.Value()
		if !ok {
			return fmt.Errorf("missing final state")
		}
		p.final = value
		// Match identity namespaces by order of first appearance, never position.
		for _, row := range value.Observed.Vehicles {
			id := string(row.Identity.Vehicle)
			if _, found := p.ordinals[id]; !found {
				p.ordinals[id] = uint32(len(p.ordinals) + 1)
			}
		}
		return nil
	}))
}

func oracleValue(v any, q overlayv2.Quality) oracleCell {
	if q == overlayv2.QualityMissing || q == overlayv2.QualityInvalid {
		v = nil
	}
	return oracleCell{V: v, Q: string(q)}
}

func oracleGap(seconds float64, timeQ overlayv2.Quality, laps int32, lapsQ overlayv2.Quality) oracleCell {
	if lapsQ == overlayv2.QualityFresh && laps > 0 {
		return oracleValue(map[string]any{"laps": laps}, lapsQ)
	}
	return oracleValue(map[string]any{"time_ms": seconds * 1000}, timeQ)
}

func (p *oraclePipeline) golden() oracleGolden {
	session := overlayv2.BuildSession(p.final)
	result := oracleGolden{Session: map[string]oracleCell{
		"kind":         oracleValue(session.Phase.V, session.Phase.Q),
		"remaining_ms": oracleValue(session.RemainingSeconds.V*1000, session.RemainingSeconds.Q),
		"track":        oracleValue(session.Track.V, session.Track.Q),
	}, Cars: make([]oracleRow, 0)}
	for _, row := range overlayv2.BuildStandings(p.final) {
		quality := func(q overlayv2.Quality) overlayv2.Quality {
			if q == "" {
				return row.Quality.Q
			}
			return q
		}
		result.Cars = append(result.Cars, oracleRow{
			ID: row.VehicleID, Ordinal: p.ordinals[row.VehicleID], Number: row.CarNumber, Driver: row.DriverName, Class: row.ClassID,
			Position:      oracleValue(row.Position, quality(row.Quality.Position)),
			ClassPosition: oracleValue(row.ClassPosition, quality(row.Quality.ClassPosition)),
			Laps:          oracleValue(row.CompletedLaps, quality(row.Quality.Laps)),
			LastLap:       oracleValue(row.LastLapSeconds.V*1000, row.LastLapSeconds.Q),
			BestLap:       oracleValue(row.BestLapSeconds.V*1000, row.BestLapSeconds.Q),
			GapLeader:     oracleGap(row.GapSeconds.V, row.GapSeconds.Q, row.GapLaps, quality(row.Quality.GapLaps)),
			GapAhead:      oracleGap(row.Interval, quality(row.Quality.Interval), row.IntervalLaps, quality(row.Quality.IntervalLaps)),
			InPits:        oracleValue(row.PitState == overlayv2.PitStatePit, quality(row.Quality.Pit)),
		})
	}
	return result
}

type oracleREST struct{ standings, session []byte }

func (b oracleREST) Do(request *http.Request) (*http.Response, error) {
	var body []byte
	switch request.URL.Path {
	case standingsEndpoint:
		body = b.standings
	case sessionInfoEndpoint:
		body = b.session
	default:
		return nil, fmt.Errorf("unexpected endpoint %s", request.URL.Path)
	}
	return &http.Response{StatusCode: http.StatusOK, Request: request, Body: io.NopCloser(strings.NewReader(string(body)))}, nil
}

func oracleReadREST(t *testing.T, cache *restCache, event oracleEvent, content []byte, origin time.Time) Observation {
	t.Helper()
	var bodies struct {
		Schema    string          `json:"schema"`
		Standings json.RawMessage `json:"standings"`
		Session   json.RawMessage `json:"sessionInfo"`
	}
	if err := json.Unmarshal(content, &bodies); err != nil {
		t.Fatal(err)
	}
	if bodies.Schema != "vantare.lmu-rest-bodies.v1" {
		t.Fatal("wrong REST schema")
	}
	clock := []time.Time{event.StandingsStarted, event.StandingsCompleted, event.StandingsCompleted, event.SessionStarted, event.At, event.At, event.At}
	index := 0
	cfg := normalizeRESTConfig(&restConfig{
		client:  oracleREST{bodies.Standings, bodies.Session},
		now:     func() time.Time { value := clock[index]; index++; return value },
		elapsed: func() time.Duration { return clock[index-1].Sub(origin) + time.Second },
	}, nil, nil)
	observation, complete := pollREST(t.Context(), cfg, cache)
	if !complete {
		t.Fatal("REST round incomplete")
	}
	return observation
}

func oracleHash(content []byte) string { return fmt.Sprintf("%x", sha256.Sum256(content)) }

func oracleWrite(t *testing.T, dir, name string, value any) string {
	t.Helper()
	content, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	content = append(content, '\n')
	if err := os.WriteFile(filepath.Join(dir, name), content, 0o600); err != nil {
		t.Fatal(err)
	}
	return oracleHash(content)
}

func TestNativeOracleFreeze(t *testing.T) {
	root, out := os.Getenv("NATIVE_ORACLE_ROOT"), os.Getenv("NATIVE_ORACLE_OUT")
	if root == "" || out == "" {
		t.Fatal("invoke tools/native-oracle, not this test directly")
	}
	if err := os.MkdirAll(out, 0o700); err != nil {
		t.Fatal(err)
	}
	var entries []oracleEntry
	fixtures, err := filepath.Glob(filepath.Join(root, "testdata/lmu*fixture.bin"))
	if err != nil || len(fixtures) != 12 {
		t.Fatalf("want 12 real fixtures: %d, %v", len(fixtures), err)
	}
	for _, path := range fixtures {
		name, build := filepath.Base(path), "1.3.0.0"
		switch {
		case strings.HasPrefix(name, "lmu-1.4.2.0-"):
			build = "1.4.2.0"
		case strings.HasPrefix(name, "lmu-1.4.1.3-"):
			build = "1.4.1.3"
		case strings.HasPrefix(name, "lmu-1.4-"):
			build = "1.4.0.0"
		}
		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		p := newOraclePipeline()
		at := time.Unix(1, 0).UTC()
		observation, err := parseWithBuild(content, at, BuildEvidence{FileVersion: build, ProductVersion: build})
		if err != nil || observation.Compatibility != CompatibilityKnown {
			t.Fatalf("%s parse: %v; compatibility %v", name, err, observation.Compatibility)
		}
		result := oracleGolden{Cars: make([]oracleRow, 0)}
		if err := p.apply(t.Context(), at, 0, observation); err != nil {
			if !IsUnmappableFrame(err) {
				t.Fatalf("%s pipeline: %v", name, err)
			}
			// A rejected menu has no Go projection. Keep the rejection and null
			// session rather than fabricating an empty successful projection.
			result.GoRejection = err.Error()
		} else {
			result = p.golden()
		}
		golden := strings.TrimSuffix(name, ".bin") + ".json"
		entries = append(entries, oracleEntry{File: golden, SHA256: oracleWrite(t, out, golden, result), Input: "testdata/" + name, InputSHA256: oracleHash(content), Build: build, Event: 0})
	}

	path := filepath.Join(root, "testdata/rust-port/lmu47-high-rate-60s.tar.gz")
	compressed, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if oracleHash(compressed) != oracleCorpusSHA {
		t.Fatal("corpus SHA-256 mismatch")
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := file.Close(); err != nil {
			t.Errorf("close corpus: %v", err)
		}
	}()
	gz, err := gzip.NewReader(file)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := gz.Close(); err != nil {
			t.Errorf("close gzip: %v", err)
		}
	}()
	tarReader := tar.NewReader(gz)
	next := func() (string, []byte) {
		t.Helper()
		for {
			header, err := tarReader.Next()
			if err != nil {
				t.Fatal(err)
			}
			if header.Typeflag != tar.TypeReg {
				continue
			}
			content, err := io.ReadAll(tarReader)
			if err != nil {
				t.Fatal(err)
			}
			return filepath.Base(header.Name), content
		}
	}
	var manifest struct {
		Schema string        `json:"schema"`
		Build  string        `json:"build"`
		Events []oracleEvent `json:"events"`
	}
	rests := make(map[string][]byte)
	var firstName string
	var firstFrame []byte
	for {
		name, content := next()
		if name == "manifest.json" {
			if err := json.Unmarshal(content, &manifest); err != nil {
				t.Fatal(err)
			}
		} else if strings.HasPrefix(name, "rest-") {
			rests[name] = content
		} else if strings.HasPrefix(name, "shm-") {
			firstName, firstFrame = name, content
			break
		}
	}
	if manifest.Schema != "vantare.lmu-temporal-high-rate.v1" || manifest.Build != "1.4.2.0" || len(manifest.Events) != 3839 || len(rests) != 239 {
		t.Fatal("unexpected corpus manifest")
	}
	origin := manifest.Events[0].At
	p, restCache := newOraclePipeline(), new(restCache)
	var schedule []int64
	sample, shmCount, restCount := 0, 0, 0
	for index, event := range manifest.Events {
		elapsed := event.At.Sub(origin) + time.Second
		if index > 0 && elapsed.Nanoseconds() < schedule[index-1] {
			t.Fatal("reversed corpus clock")
		}
		schedule = append(schedule, elapsed.Nanoseconds())
		var observation Observation
		switch event.Kind {
		case "shm":
			name, content := firstName, firstFrame
			if firstFrame == nil {
				name, content = next()
			}
			firstFrame = nil
			if name != event.File || event.Index != shmCount || oracleHash(content) != event.SHA256 {
				t.Fatalf("event %d input mismatch", index)
			}
			shmCount++
			observation, err = parseWithBuild(content, event.At, BuildEvidence{FileVersion: manifest.Build, ProductVersion: manifest.Build})
			if err != nil || observation.Compatibility != CompatibilityKnown {
				t.Fatalf("event %d parse: %v", index, err)
			}
		case "rest":
			content, found := rests[event.File]
			if !found || event.Index != restCount || oracleHash(content) != event.SHA256 {
				t.Fatalf("event %d REST mismatch", index)
			}
			restCount++
			observation = oracleReadREST(t, restCache, event, content, origin)
		default:
			t.Fatalf("unknown event kind %s", event.Kind)
		}
		if err := p.apply(t.Context(), event.At, elapsed, observation); err != nil {
			t.Fatalf("event %d pipeline: %v", index, err)
		}
		if event.Kind == "shm" && event.At.Sub(origin) >= time.Duration(sample)*time.Second && sample < 60 {
			golden := fmt.Sprintf("lmu47-%02ds.json", sample)
			entries = append(entries, oracleEntry{File: golden, SHA256: oracleWrite(t, out, golden, p.golden()), Input: "testdata/rust-port/lmu47-high-rate-60s.tar.gz", InputSHA256: oracleCorpusSHA, Build: manifest.Build, Event: index})
			sample++
		}
	}
	if sample != 60 || shmCount != 3600 || restCount != 239 {
		t.Fatalf("incomplete replay: samples %d, shm %d, rest %d", sample, shmCount, restCount)
	}
	indexSHA := oracleWrite(t, out, "manifest.json", map[string]any{"schema": "vantare.native-lmu-oracle.v1", "go_commit": os.Getenv("NATIVE_ORACLE_GO_COMMIT"), "entries": entries, "corpus_schedule_ns": schedule})
	readme := fmt.Sprintf("# Oráculo Go de Standings — ISA-1425\n\nGo congelado: `%s`.\n\nManifest SHA-256: `%s`.\n\nReproduce 12 fixtures y 3839 eventos reales (3600 SHM + 239 REST).\n60 muestras: primer SHM en o después de cada segundo 0..59, sin saltar eventos intermedios.\n\n| Golden | SHA-256 |\n|---|---|\n", os.Getenv("NATIVE_ORACLE_GO_COMMIT"), indexSHA)
	for _, entry := range entries {
		readme += fmt.Sprintf("| `%s` | `%s` |\n", entry.File, entry.SHA256)
	}
	if err := os.WriteFile(filepath.Join(out, "README.md"), []byte(readme), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Logf("12 fixtures + 60 temporal samples; replayed %d events; manifest SHA-256 %s", len(schedule), indexSHA)
}
