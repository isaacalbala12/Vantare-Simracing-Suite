// strategy-oracle freezes the current Go document and solver, never Rust output.
package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
)

func main() {
	out := flag.String("out", "native/strategy/testdata/oracle", "new output directory")
	flag.Parse()
	if err := freeze(*out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func freeze(out string) error {
	if err := os.Mkdir(out, 0755); err != nil {
		return err
	}
	commit, err := exec.Command("git", "rev-parse", "HEAD").Output()
	if err != nil {
		return err
	}
	hashes := map[string]string{}
	write := func(name string, data any) error {
		bytes, err := json.MarshalIndent(data, "", "  ")
		if err != nil {
			return err
		}
		bytes = append(bytes, '\n')
		hash := sha256.Sum256(bytes)
		hashes[name] = hex.EncodeToString(hash[:])
		return os.WriteFile(filepath.Join(out, name), bytes, 0644)
	}
	// Freeze hashes of every transitive Strategy/Analysis Go source, including
	// local modifications: commit identity alone is not sufficient provenance.
	sources := map[string]string{}
	for _, root := range []string{"internal/strategy", "internal/telemetryanalysis/strategyprojection"} {
		if err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			bytes, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			hash := sha256.Sum256(bytes)
			sources[filepath.ToSlash(path)] = hex.EncodeToString(hash[:])
			return nil
		}); err != nil {
			return err
		}
	}
	if err := write("sources.json", sources); err != nil {
		return err
	}
	exporter, err := os.ReadFile("tools/strategy-oracle/main.go")
	if err != nil {
		return err
	}
	exporterHash := sha256.Sum256(exporter)
	sources["tools/strategy-oracle/main.go"] = hex.EncodeToString(exporterHash[:])
	if err := write("sources.json", sources); err != nil {
		return err
	}
	sourced := func(value any) any {
		return map[string]any{"value": value, "evidence": map[string]any{
			"provenance": map[string]any{"kind": "manual", "sourceId": "oracle:manual"},
			"confidence": map[string]any{"level": "high", "basis": "explicit fixture"}}}
	}
	ev := map[string]any{"id": "event-1", "name": sourced("Spa"), "source": sourced("custom"), "track": sourced("Spa-Francorchamps"), "cls": sourced("LMGT3"), "durationMin": sourced(120), "startAt": sourced(nil), "drivers": []any{map[string]any{"id": "d1", "order": 0, "name": sourced("Driver")}}, "tankLiters": sourced(100), "pitLossSeconds": sourced(54), "fillMode": sourced("manual"), "availability": map[string]any{}, "tyreInventory": map[string]any{"sets": []any{}}, "strategies": []any{map[string]any{"id": "v1", "name": sourced("Base"), "note": sourced(""), "mode": sourced("dry"), "state": sourced("draft"), "order": []string{"d1"}, "overrides": map[string]any{"opaque": map[string]any{"nested": []any{1, nil, "raw"}}}}}, "rawLegacy": "eyJjb3JydXB0Ijog"}
	base := map[string]any{"contractVersion": "strategy.v2", "schemaVersion": "2.0.0", "generatedAt": "2026-09-30T00:00:00Z", "events": []any{ev}, "activeEventId": "event-1"}
	docCases := []any{}
	addDocument := func(name string, value any) error {
		bytes, err := json.Marshal(value)
		if err != nil {
			return err
		}
		var doc document.StrategyDocumentV2
		err = json.Unmarshal(bytes, &doc)
		if err == nil {
			err = doc.Validate()
		}
		docCases = append(docCases, map[string]any{"name": name, "input": value, "valid": err == nil})
		return nil
	}
	if err := addDocument("complete", base); err != nil {
		return err
	}
	for _, mutation := range []struct {
		name, path string
		value      any
	}{
		{"future_version", "schemaVersion", "3.0.0"}, {"duplicate_events", "events", []any{ev, ev}}, {"bad_active", "activeEventId", "absent"},
	} {
		copy := map[string]any{}
		for key, value := range base {
			copy[key] = value
		}
		copy[mutation.path] = mutation.value
		if err := addDocument(mutation.name, copy); err != nil {
			return err
		}
	}
	for _, mutation := range []struct {
		name, field string
		value       any
	}{
		{"empty_name", "name", sourced("")}, {"zero_duration", "durationMin", sourced(0)}, {"negative_tank", "tankLiters", sourced(-1)}, {"bad_fill", "fillMode", sourced("telemetry")}, {"missing_driver_reference", "strategies", []any{map[string]any{"id": "v1", "name": sourced("X"), "note": sourced(""), "mode": sourced("dry"), "state": sourced("draft"), "order": []string{"absent"}}}},
	} {
		copyEv := map[string]any{}
		for key, value := range ev {
			copyEv[key] = value
		}
		copyEv[mutation.field] = mutation.value
		copy := map[string]any{}
		for key, value := range base {
			copy[key] = value
		}
		copy["events"] = []any{copyEv}
		if err := addDocument(mutation.name, copy); err != nil {
			return err
		}
	}
	if err := write("documents.json", docCases); err != nil {
		return err
	}
	// Add a complete persisted weather/migration document and invalid mutations.
	clone := func(value any) (map[string]any, error) {
		bytes, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		var result map[string]any
		err = json.Unmarshal(bytes, &result)
		return result, err
	}
	weatherDoc, err := clone(base)
	if err != nil {
		return err
	}
	weatherEvent := weatherDoc["events"].([]any)[0].(map[string]any)
	weatherEvent["combination"] = map[string]any{"combinationId": "manual-combination", "sessions": []any{}}
	nodes := []any{}
	for index, progress := range []string{"START", "25", "50", "75", "FINISH"} {
		nodes = append(nodes, map[string]any{"progress": progress, "rainChance": index * 25, "sky": "overcast", "airTempC": 18, "trackTempC": 22})
	}
	weatherEvent["weatherScenarios"] = []any{map[string]any{"weight": 0.65, "scenario": map[string]any{"contractVersion": "weatherscenario.v1", "scenarioId": "manual-rain", "combinationId": "manual-combination", "generatedAt": "2026-09-30T00:00:00Z", "nodes": nodes, "provenance": map[string]any{"source": "manual", "capturedAt": "2026-09-30T00:00:00Z", "freshUntil": "2026-09-30T00:01:00Z", "sessionType": "manual", "signalFreshness": "manual"}}}}
	weatherDoc["migrationMeta"] = map[string]any{"sourceFingerprint": "fixture-fingerprint", "journalId": "fixture-journal", "migratedAt": "2026-09-30T00:00:00Z", "status": "committed", "sources": []any{map[string]any{"key": "orbit", "present": true, "raw": "eyJjb3JydXB0Ijog"}}, "warnings": []string{"fixture only"}, "quarantine": []any{map[string]any{"sourceKey": "orbit", "path": "events/0", "code": "fixture", "message": "retained bytes", "raw": "e30="}}}
	if err := addDocument("weather_and_migration", weatherDoc); err != nil {
		return err
	}
	for _, mutation := range []struct {
		name, path string
		value      any
	}{
		{"rain_overflow", "events/0/weatherScenarios/0/scenario/nodes/0/rainChance", 101},
		{"wrong_progress", "events/0/weatherScenarios/0/scenario/nodes/0/progress", "FINISH"},
		{"expired_capture", "events/0/weatherScenarios/0/scenario/provenance/freshUntil", "2026-09-30T00:00:00Z"},
		{"negative_weight", "events/0/weatherScenarios/0/weight", -1},
		{"wrong_weather_combination", "events/0/weatherScenarios/0/scenario/combinationId", "wrong"},
		{"unknown_claims_source", "events/0/name/evidence/provenance/kind", "unknown"},
		{"unknown_claims_basis", "events/0/name/evidence/confidence/level", "unknown"},
		{"bad_base64", "events/0/rawLegacy", "!"},
		{"negative_driver_order", "events/0/drivers/0/order", -1},
		{"bad_track_type", "events/0/track/value", 3},
		{"unknown_migration_status", "migrationMeta/status", "unknown"},
		{"bad_backup_base64", "migrationMeta/sources/0/raw", "broken"},
		{"absent_backup_with_bytes", "migrationMeta/sources/0/present", false},
	} {
		copy, err := clone(weatherDoc)
		if err != nil {
			return err
		}
		parts := strings.Split(mutation.path, "/")
		var current any = copy
		for _, part := range parts[:len(parts)-1] {
			switch container := current.(type) {
			case map[string]any:
				current = container[part]
			case []any:
				index, err := strconv.Atoi(part)
				if err != nil {
					return err
				}
				current = container[index]
			}
		}
		current.(map[string]any)[parts[len(parts)-1]] = mutation.value
		if err := addDocument(mutation.name, copy); err != nil {
			return err
		}
	}
	if err := write("documents.json", docCases); err != nil {
		return err
	}
	projectionDoc, err := clone(base)
	if err != nil {
		return err
	}
	projectionEvent := projectionDoc["events"].([]any)[0].(map[string]any)
	projectionEvent["combination"] = map[string]any{"combinationId": "analysis-combination", "sessions": []any{map[string]any{"sessionId": "session", "included": true}}}
	axes := map[string]any{"presence": "valid", "provenance": map[string]any{"kind": "derived", "sourceId": "oracle:analysis", "observedAt": "2026-09-30T00:00:00.001Z"}, "confidence": map[string]any{"sampleSize": 5, "computationVersion": "oracle.v1"}}
	combined, err := clone(axes)
	if err != nil {
		return err
	}
	combined["identifiability"] = "separable"
	pace, err := clone(axes)
	if err != nil {
		return err
	}
	pace["medianLapSeconds"] = 100
	curve, err := clone(axes)
	if err != nil {
		return err
	}
	curve["slopeSecondsPerUnit"] = 0.05
	projection := map[string]any{"contractVersion": "strategyinputprojection.v2", "generatedAt": "2026-09-30T00:00:00.001Z", "computationVersion": "oracle.v1", "sourceSessions": []string{"session"}, "combinationId": "analysis-combination", "combinedStintPaceCurve": combined, "fuelWeightCurve": curve, "representativePaceByClimateBucket": map[string]any{"dry": pace}, "pit": map[string]any{"presence": "valid", "observedIntervals": []any{map[string]any{"durationSeconds": 30, "hasFuelRise": true, "hasVERise": false, "ambiguous": false}}}}
	projectionEvent["planningInputs"] = map[string]any{"projection": projection}
	if err := addDocument("analysis_projection", projectionDoc); err != nil {
		return err
	}
	for _, mutation := range []struct {
		name, path string
		value      any
	}{
		{"projection_timestamp_precision", "generatedAt", "2026-09-30T00:00:00.000001Z"},
		{"projection_identifiability", "combinedStintPaceCurve/identifiability", "combined_only"},
		{"projection_negative_fuel_slope", "fuelWeightCurve/slopeSecondsPerUnit", -0.1},
		{"projection_zero_pace", "representativePaceByClimateBucket/dry/medianLapSeconds", 0},
		{"projection_zero_samples", "representativePaceByClimateBucket/dry/confidence/sampleSize", 0},
		{"projection_unknown_claims", "combinedStintPaceCurve/provenance/kind", "unknown"},
		{"projection_legacy_provenance", "combinedStintPaceCurve/provenance/kind", "legacy_synthetic_default"},
		{"projection_observed_precision", "combinedStintPaceCurve/provenance/observedAt", "2026-09-30T00:00:00.000001Z"},
		{"projection_pit_ambiguous", "pit/observedIntervals/0/hasFuelRise", false},
		{"projection_pit_duration", "pit/observedIntervals/0/durationSeconds", 0},
	} {
		copy, err := clone(projectionDoc)
		if err != nil {
			return err
		}
		var current any = copy["events"].([]any)[0].(map[string]any)["planningInputs"].(map[string]any)["projection"]
		parts := strings.Split(mutation.path, "/")
		for _, part := range parts[:len(parts)-1] {
			switch container := current.(type) {
			case map[string]any:
				current = container[part]
			case []any:
				index, err := strconv.Atoi(part)
				if err != nil {
					return err
				}
				current = container[index]
			}
		}
		current.(map[string]any)[parts[len(parts)-1]] = mutation.value
		if err := addDocument(mutation.name, copy); err != nil {
			return err
		}
	}
	if err := write("documents.json", docCases); err != nil {
		return err
	}
	cases := []any{}
	rawResults := []any{}
	for index := 0; index < 125; index++ {
		s := func(value float64) solver.ScalarInput { return solver.NewUserOverrideScalar(value, "oracle:manual") }
		input := solver.SolverInputV2{ContractVersion: solver.SolverContractVersionV2, RaceLaps: int64(3 + index%6), BaseLapSeconds: s(90),
			PitCost:   solver.PitCostModel{TransitSeconds: s(10), RefuelRateLPerS: s(1), VERatePPerS: s(2), TyreSeconds: s(2), ServiceMode: manual.PitServiceParallel},
			Formation: solver.Formation{Seconds: s(3), Presence: "valid"}, Budget: solver.ComputeBudget{P95Millis: 10000, MaxCandidates: 1000000, MaxIterations: 100000000},
			FuelCapacityLiters: s(float64(2 + index%4)), VECapacityPercent: s(0), TyreLifeLaps: s(0), FuelPerLapLiters: s(1), VEPerLapPercent: s(0), DegradationPerLap: s(float64(index%3) * 0.25), Discretization: solver.ServiceDiscretization{FuelLiters: 1, VEPercent: 1}}
		if index%2 == 1 {
			input.VECapacityPercent = s(6)
			input.VEPerLapPercent = s(2)
		}
		if index%4 == 0 {
			input.PitCost.ServiceMode = manual.PitServiceSequential
		}
		if index%5 == 0 {
			input.TyreLifeLaps = s(2)
		}
		if index >= 30 && index < 36 {
			input.RaceLaps = 0
		}
		if index >= 36 {
			evidence := manual.Evidence{Provenance: contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "oracle:manual"}, Confidence: contract.Confidence{Level: contract.ConfidenceHigh, Basis: "explicit fixture"}}
			input.FuelReserve = manual.FuelReserveInput{Kind: manual.ReserveLaps, Laps: manual.Sourced[float64]{Value: 0.8, Evidence: evidence}, Selection: evidence}
		}
		if index >= 60 {
			input.Discretization.FuelLiters = 0.5
			input.FuelPerLapLiters = s(0.75)
			input.Discretization.VEPercent = 0.5
			input.VEPerLapPercent = s(1.25)
			input.VECapacityPercent = s(6)
		}
		if index >= 84 {
			minimum, maximum := 1, 3
			input.EventRules.MinPitStops = &minimum
			input.EventRules.MaxPitStops = &maximum
			input.EventRules.RequiredWindows = []solver.PitWindow{{FromLap: 1, ToLap: 2}}
		}
		if index >= 120 {
			input.RaceLaps = 139
			input.FuelCapacityLiters = s(96)
			input.FuelPerLapLiters = s(3)
			input.VECapacityPercent = s(0)
			input.VEPerLapPercent = s(0)
			input.TyreLifeLaps = s(0)
			input.DegradationPerLap = s(0)
			input.PitCost.TransitSeconds = s(120)
			input.PitCost.RefuelRateLPerS = s(2)
			input.PitCost.TyreSeconds = s(0)
			input.Discretization = solver.ServiceDiscretization{FuelLiters: 1, VEPercent: 1}
			input.EventRules = solver.EventRules{}
			if index == 120 {
				input.FuelReserve = manual.FuelReserveInput{}
			}
		}
		if index == 122 {
			input.FuelCapacityLiters = s(0.5)
		}
		if index == 123 {
			input.FuelReserve.Laps.Value = 100
		}
		if index == 124 {
			maximum := 0
			input.EventRules.MaxPitStops = &maximum
		}
		result, err := solver.SolveV2(input)
		if err != nil {
			cases = append(cases, map[string]any{"name": fmt.Sprintf("scalar-%02d", index), "input": input, "error": err.Error()})
			continue
		}
		// Runtime duration is nondeterministic. Retain it in the raw Go result;
		// compare the native result's explicit semantic projection field by field.
		stints := []int64{}
		for _, stint := range result.Best.Stints {
			stints = append(stints, stint.Laps)
		}
		pits := []any{}
		for _, pit := range result.Best.PitStops {
			pits = append(pits, map[string]any{"lap": pit.Lap, "fuelLiters": pit.FuelLiters, "vePercent": pit.VEPercent, "changeTyres": pit.ChangeTyres, "serviceMode": pit.ServiceMode})
		}
		fuelStart, veStart := 0.0, 0.0
		if result.Feasible {
			fuelStart = result.Reserve.Fuel.RemainingAmount + float64(input.RaceLaps)*input.FuelPerLapLiters.Value
			veStart = result.Reserve.VirtualEnergy.RemainingAmount + float64(input.RaceLaps)*input.VEPerLapPercent.Value
			for _, pit := range result.Best.PitStops {
				fuelStart -= pit.FuelLiters
				veStart -= pit.VEPercent
			}
		}
		parity := map[string]any{"feasible": result.Feasible, "stints": stints, "pitStops": pits, "expected": result.Expected,
			"fuelStartLiters": fuelStart, "veStartPercent": veStart, "fuelRemainingLiters": result.Reserve.Fuel.RemainingAmount, "veRemainingPercent": result.Reserve.VirtualEnergy.RemainingAmount}
		cases = append(cases, map[string]any{"name": fmt.Sprintf("scalar-%02d", index), "input": input, "parity": parity})
		rawResults = append(rawResults, map[string]any{"name": fmt.Sprintf("scalar-%02d", index), "goResult": result})
	}
	if err := write("solver.json", cases); err != nil {
		return err
	}
	var compressed bytes.Buffer
	zipper := gzip.NewWriter(&compressed)
	if err := json.NewEncoder(zipper).Encode(rawResults); err != nil {
		return err
	}
	if err := zipper.Close(); err != nil {
		return err
	}
	zipHash := sha256.Sum256(compressed.Bytes())
	hashes["solver-go.json.gz"] = hex.EncodeToString(zipHash[:])
	if err := os.WriteFile(filepath.Join(out, "solver-go.json.gz"), compressed.Bytes(), 0644); err != nil {
		return err
	}
	return write("manifest.json", map[string]any{"goCommit": strings.TrimSpace(string(commit)), "generatedAt": time.Now().UTC().Format(time.RFC3339), "files": hashes})
}
