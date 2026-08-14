package lmu

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/catalog"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
)

type strategySignalAuditV1 struct {
	Schema  string                  `json:"schema"`
	Signals []strategySignalEntryV1 `json:"signals"`
}

type strategySignalEntryV1 struct {
	Key        string `json:"key"`
	Capability string `json:"capability"`
	Source     string `json:"source"`
	Unit       string `json:"unit"`
	Authority  string `json:"authority"`
	Freshness  string `json:"freshness"`
	Identity   string `json:"identity"`
	Evidence   string `json:"evidence"`
}

var strategySignalKeysV1 = []string{
	"energy.fuel_amount",
	"energy.fuel_capacity",
	"energy.virtual_energy",
	"tyres.identity",
	"tyres.compound",
	"tyres.wear",
	"tyres.corner",
	"weather.ambient_temperature",
	"weather.track_temperature",
	"weather.rain_intensity",
	"weather.track_wetness",
	"pit.in_pit",
	"pit.stop_count",
	"session.lap_number",
	"standings.completed_laps",
	"standings.lap_distance",
	"session.maximum_laps",
	"session.remaining_time",
}

var strategySignalCapabilitiesV1 = []string{
	"supported",
	"supported",
	"unsupported",
	"unsupported",
	"unsupported",
	"unsupported",
	"unsupported",
	"unsupported",
	"unsupported",
	"unsupported",
	"unsupported",
	"supported",
	"supported",
	"supported",
	"supported",
	"supported",
	"supported",
	"supported",
}

func TestStrategySignalAuditCarriesRealLMU14FuelToFinalState(t *testing.T) {
	frame, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-1.4-track-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}

	result, opens := runSingleLMU14Frame(t, frame)
	if opens != 1 {
		t.Fatalf("LMU_Data opens = %d, want one", opens)
	}
	final, ok := result.final.Value()
	if !ok {
		t.Fatal("final snapshot has no owned value")
	}
	playerID := result.final.Header().Identity.Vehicle
	for _, current := range final.Observed.Vehicles {
		if current.Identity.Vehicle != playerID {
			continue
		}
		fuel, present := current.Fuel.Value()
		if !present || current.Fuel.Provenance() != schema.ProvenanceObserved || current.Fuel.Freshness() != schema.FreshnessFresh {
			t.Fatalf("player fuel quality = present:%v provenance:%v freshness:%v", present, current.Fuel.Provenance(), current.Fuel.Freshness())
		}
		if fuel.Amount != energy.FuelAmount(83.80992715710434) || fuel.Capacity != energy.FuelCapacity(115) {
			t.Fatalf("player fuel = %+v", fuel)
		}
		projected, err := strategyprojection.ProjectV1(result.final)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(projected.Capabilities, []strategyprojection.Capability{
			strategyprojection.CapabilitySession,
			strategyprojection.CapabilityProgress,
			strategyprojection.CapabilityPit,
			strategyprojection.CapabilityFuel,
		}) {
			t.Fatalf("Strategy v1 capabilities = %v, want exact session/progress/pit/fuel", projected.Capabilities)
		}
		return
	}
	t.Fatalf("player %q not found in final state", playerID)
}

func TestStrategySignalAuditLedgerMatchesClosedV1Golden(t *testing.T) {
	audit := strategySignalAuditV1{
		Schema:  "vantare.strategy-live-signal-audit.v1",
		Signals: strategyLiveSignalLedgerV1(),
	}
	if len(audit.Signals) != len(strategySignalKeysV1) {
		t.Fatalf("audit signals = %d, want %d", len(audit.Signals), len(strategySignalKeysV1))
	}

	seen := make(map[string]struct{}, len(audit.Signals))
	for index, entry := range audit.Signals {
		if entry.Key != strategySignalKeysV1[index] {
			t.Fatalf("audit key %d = %q, want %q", index, entry.Key, strategySignalKeysV1[index])
		}
		if entry.Capability != strategySignalCapabilitiesV1[index] {
			t.Fatalf("audit capability for %q = %q, want %q", entry.Key, entry.Capability, strategySignalCapabilitiesV1[index])
		}
		if _, duplicate := seen[entry.Key]; duplicate {
			t.Fatalf("audit contains duplicate key %q", entry.Key)
		}
		seen[entry.Key] = struct{}{}
		if entry.Capability == "unsupported" && (entry.Source != "none-admitted" || entry.Authority != "none" || entry.Freshness != "missing") {
			t.Fatalf("unsupported signal %q is not fail-closed: %+v", entry.Key, entry)
		}
	}

	encoded, err := json.MarshalIndent(audit, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	encoded = append(encoded, '\n')
	want, err := os.ReadFile(filepath.Join("testdata", "strategy_live_signals_v1.golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(encoded, want) {
		t.Fatalf("Strategy live signal audit v1 changed\n--- got ---\n%s\n--- want ---\n%s", encoded, want)
	}
}

func TestStrategySignalAuditTracksCanonicalVehicleGeneration(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7), sink)
	first := sink.last(t)
	if first.Header.Identity.Session != "lmu-session-1" || first.Header.Identity.Vehicle != "lmu-slot-7-generation-1" {
		t.Fatalf("initial identity = %+v", first.Header.Identity)
	}

	absent := trackObservation()
	absent.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, absent, sink)
	reappeared := trackObservation(7)
	reappeared.SourceTime = observed(3 * time.Second)
	writeMapped(t, mapper, reappeared, sink)
	secondGeneration := sink.last(t)
	if secondGeneration.Header.Identity.Session != "lmu-session-1" || secondGeneration.Header.Identity.Vehicle != "lmu-slot-7-generation-2" {
		t.Fatalf("identity after disappearance/reappearance = %+v", secondGeneration.Header.Identity)
	}

	reset := trackObservation(7)
	reset.ClockChange = ClockReset
	reset.SourceTime = observed(100 * time.Millisecond)
	writeMapped(t, mapper, reset, sink)
	newSession := sink.last(t)
	if newSession.Header.Identity.Session != "lmu-session-2" || newSession.Header.Identity.Vehicle != "lmu-slot-7-generation-1" {
		t.Fatalf("identity after session reset = %+v", newSession.Header.Identity)
	}

	wantIdentity := map[string]string{
		"energy.fuel_amount":       "player vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset",
		"energy.fuel_capacity":     "player vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset",
		"pit.in_pit":               "vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset",
		"pit.stop_count":           "vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset; REST cannot create identity",
		"session.lap_number":       "player vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset",
		"standings.completed_laps": "vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset; REST cannot create identity",
		"standings.lap_distance":   "vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset",
	}
	for _, entry := range strategyLiveSignalLedgerV1() {
		want, required := wantIdentity[entry.Key]
		if required && entry.Identity != want {
			t.Fatalf("audit identity for %q = %q, want %q", entry.Key, entry.Identity, want)
		}
	}
}

func TestStrategySignalAuditSupportedRowsMatchProductionContracts(t *testing.T) {
	entries := make(map[string]strategySignalEntryV1, len(strategySignalKeysV1))
	for _, entry := range strategyLiveSignalLedgerV1() {
		entries[entry.Key] = entry
	}
	matrix := AuthorityMatrix()
	rules := make(map[catalog.SignalID]AuthorityRule, len(matrix))
	for _, rule := range matrix {
		rules[rule.Signal] = rule
	}
	if MatrixVersion != 5 || len(matrix) != 37 || len(rules) != 37 {
		t.Fatalf("runtime authority matrix = version %d / %d rules / %d unique, want v5 / 37 / 37", MatrixVersion, len(matrix), len(rules))
	}

	for _, contract := range []struct {
		key        string
		signal     catalog.SignalID
		layout     layoutField
		layoutName string
		rest       bool
	}{
		{key: "energy.fuel_amount", signal: catalog.SignalEnergyFuelAmount, layout: lmu13Layout.Telemetry.FuelLiters, layoutName: "telemetry.fuel_liters"},
		{key: "energy.fuel_capacity", signal: catalog.SignalEnergyFuelCapacity, layout: lmu13Layout.Telemetry.FuelCapacityLiters, layoutName: "telemetry.fuel_capacity_liters"},
		{key: "pit.in_pit", signal: catalog.SignalPitInPit, layout: lmu13Layout.Scoring.InPits, layoutName: "scoring.in_pits"},
		{key: "pit.stop_count", signal: catalog.SignalPitStopCount, layout: lmu13Layout.Scoring.PitStopCount, layoutName: "scoring.pit_stop_count", rest: true},
		{key: "session.lap_number", signal: catalog.SignalSessionLapNumber, layout: lmu13Layout.Telemetry.LapNumber, layoutName: "telemetry.lap_number"},
		{key: "standings.completed_laps", signal: catalog.SignalStandingsCompletedLaps, layout: lmu13Layout.Scoring.CompletedLaps, layoutName: "scoring.completed_laps", rest: true},
		{key: "standings.lap_distance", signal: catalog.SignalStandingsLapDistance, layout: lmu13Layout.Scoring.LapDistance, layoutName: "scoring.lap_distance"},
		{key: "session.maximum_laps", signal: catalog.SignalSessionMaximumLaps, layout: lmu13Layout.Session.MaximumLaps, layoutName: "session.maximum_laps"},
	} {
		entry, present := entries[contract.key]
		if !present || entry.Capability != "supported" {
			t.Fatalf("supported audit row %q = %+v, present=%v", contract.key, entry, present)
		}
		if contract.layout.Name != contract.layoutName {
			t.Fatalf("production layout for %q = %q, want %q", contract.key, contract.layout.Name, contract.layoutName)
		}
		wantSource := strategyAuditLayoutSource(contract.layout)
		if contract.rest {
			wantSource += "; REST standings player overlap"
		}
		if entry.Source != wantSource {
			t.Fatalf("audit source for %q = %q, production says %q", contract.key, entry.Source, wantSource)
		}
		definition, present := catalog.ByID(contract.signal)
		if !present || definition.Key != contract.key || definition.Action == catalog.LedgerExistingUnproduced {
			t.Fatalf("catalog contract for %q = %+v, present=%v", contract.key, definition, present)
		}
		if entry.Unit != definition.Unit.String() {
			t.Fatalf("audit unit for %q = %q, catalog says %q", contract.key, entry.Unit, definition.Unit)
		}
		rule, present := rules[contract.signal]
		if !present || rule.Preferred != SourceSharedMemory || rule.PreferredTTL != defaultFreshnessLimit {
			t.Fatalf("authority rule for %q = %+v, present=%v", contract.key, rule, present)
		}
		wantAuthority := "Shared Memory only"
		if contract.rest {
			wantAuthority = "Shared Memory preferred; REST fallback only for SHM-identified player"
			if rule.Alternative != SourceREST || rule.AlternativeTTL != defaultRESTTTL || !rule.Equivalent {
				t.Fatalf("REST authority rule for %q = %+v", contract.key, rule)
			}
		} else if rule.Alternative != SourceUnknown || rule.AlternativeTTL != 0 || rule.Equivalent {
			t.Fatalf("SHM-only authority rule for %q = %+v", contract.key, rule)
		}
		if entry.Authority != wantAuthority || !strings.Contains(entry.Freshness, defaultFreshnessLimit.String()) {
			t.Fatalf("audit quality for %q = authority:%q freshness:%q", contract.key, entry.Authority, entry.Freshness)
		}
		if contract.rest && !strings.Contains(entry.Freshness, defaultRESTTTL.String()) {
			t.Fatalf("audit freshness for %q omits REST TTL %s: %q", contract.key, defaultRESTTTL, entry.Freshness)
		}
	}

	remaining := entries["session.remaining_time"]
	definition, present := catalog.ByID(catalog.SignalSessionRemainingTime)
	if !present || definition.Key != remaining.Key || definition.Unit != schema.UnitSeconds || definition.Action != catalog.LedgerAppended || remaining.Unit != definition.Unit.String() {
		t.Fatalf("remaining-time catalog/audit contract = definition:%+v audit:%+v present=%v", definition, remaining, present)
	}
	wantRemainingSource := fmt.Sprintf(
		"derived from session.source_time (+%d) and session.end_time (+%d)",
		lmu13Layout.Session.CurrentTime.Offset,
		lmu13Layout.Session.EndTime.Offset,
	)
	if remaining.Source != wantRemainingSource || remaining.Authority != "canonical Derive pipeline only; no raw remaining-time field" {
		t.Fatalf("remaining-time source/authority = %+v", remaining)
	}
	foundRemainingDerivation := false
	for _, definition := range derive.Registry() {
		if definition.ID != derive.DerivationSessionRemaining {
			continue
		}
		foundRemainingDerivation = reflect.DeepEqual(definition.Inputs, []derive.SignalID{derive.SignalObservedSourceTime, derive.SignalObservedEndTime}) &&
			reflect.DeepEqual(definition.Outputs, []derive.SignalID{derive.SignalSessionRemaining})
	}
	if !foundRemainingDerivation {
		t.Fatal("canonical Derive registry no longer proves session.remaining_time from source/end time")
	}
}

func TestStrategySignalAuditV1HasExactReviewedProductionSurfaces(t *testing.T) {
	for _, current := range []struct {
		name   string
		typeOf reflect.Type
		fields []string
	}{
		{name: "lmu.Observation", typeOf: reflect.TypeOf(Observation{}), fields: []string{
			"Source", "ReceivedUTC", "Compatibility", "Fingerprint", "ClockChange", "SourceTime", "EndTime", "MaximumLaps", "TrackName", "SessionType", "VehicleCount", "PlayerPresent", "VehicleName", "LapNumber", "Gear", "EngineRPM", "SpeedMPS", "Throttle", "Brake", "Clutch", "PlayerPosition", "CompletedLaps", "PitStopCount", "InPit", "Fuel", "Vehicles", "REST", "MatrixVersion", "Decisions", "Conflicts",
		}},
		{name: "core.VehicleState", typeOf: reflect.TypeOf(telemetrycore.VehicleState{}), fields: []string{
			"Identity", "DriverName", "Name", "VehicleClass", "Player", "Sector", "LapDistance", "BestLapTime", "LastLapTime", "EstimatedLapTime", "LapNumber", "Gear", "EngineRPM", "SpeedMPS", "Throttle", "Brake", "Clutch", "Position", "CompletedLaps", "InPit", "PitStopCount", "PenaltyCount", "TimeBehindLeader", "LapsBehindLeader", "TimeBehindNext", "LapsBehindNext", "Fuel", "DeltaBest", "WorldPosition", "LocalVelocity", "Orientation",
		}},
		{name: "core.ObservedState", typeOf: reflect.TypeOf(telemetrycore.ObservedState{}), fields: []string{
			"SourceTime", "EndTime", "MaximumLaps", "TrackName", "SessionType", "VehicleCount", "PlayerPresent", "Vehicles",
		}},
		{name: "strategy.SnapshotV1", typeOf: reflect.TypeOf(strategyprojection.SnapshotV1{}), fields: []string{"Metadata", "PayloadV1"}},
		{name: "strategy.PayloadV1", typeOf: reflect.TypeOf(strategyprojection.PayloadV1{}), fields: []string{"Capabilities", "TrackName", "SessionType", "SourceTime", "EndTime", "Remaining", "MaximumLaps", "Player"}},
		{name: "strategy.PlayerV1", typeOf: reflect.TypeOf(strategyprojection.PlayerV1{}), fields: []string{"ID", "LapNumber", "CompletedLaps", "Sector", "LapDistance", "InPit", "PitStopCount", "FuelLiters", "FuelCapacity"}},
	} {
		assertExactStrategyAuditFields(t, current.name, current.typeOf, current.fields)
	}
	assertExactStrategyAuditJSONFields(t, "strategy.PayloadV1", reflect.TypeOf(strategyprojection.PayloadV1{}), []string{
		"capabilities", "trackName", "sessionType", "sourceTimeSeconds", "endTimeSeconds", "remainingSeconds", "maximumLaps", "player",
	})
	assertExactStrategyAuditJSONFields(t, "strategy.PlayerV1", reflect.TypeOf(strategyprojection.PlayerV1{}), []string{
		"id", "lapNumber", "completedLaps", "sector", "lapDistanceMeters", "inPit", "pitStopCount", "fuelLiters", "fuelCapacityLiters",
	})

	if strategyprojection.CapabilitySession != "session" || strategyprojection.CapabilityProgress != "progress" || strategyprojection.CapabilityPit != "pit" || strategyprojection.CapabilityFuel != "fuel" {
		t.Fatalf("Strategy v1 capability values changed: %q/%q/%q/%q", strategyprojection.CapabilitySession, strategyprojection.CapabilityProgress, strategyprojection.CapabilityPit, strategyprojection.CapabilityFuel)
	}

	forbiddenCatalogKeys := map[string]struct{}{
		"energy.virtual_energy":     {},
		"tyres.identity":            {},
		"tyres.compound":            {},
		"tyres.wear":                {},
		"tyres.corner":              {},
		"weather.track_temperature": {},
		"weather.rain_intensity":    {},
		"weather.track_wetness":     {},
	}
	for _, definition := range catalog.All() {
		if _, forbidden := forbiddenCatalogKeys[definition.Key]; forbidden {
			t.Fatalf("ISA-160 audit v1 requires review before catalog admits %q", definition.Key)
		}
	}
	for _, signal := range []catalog.SignalID{
		catalog.SignalWheelsBrakeTemperature,
		catalog.SignalWeatherAmbientTemperature,
	} {
		definition, present := catalog.ByID(signal)
		if !present {
			t.Fatalf("catalog signal %d is missing", signal)
		}
		if definition.Action != catalog.LedgerExistingUnproduced {
			t.Fatalf("catalog signal %q action = %s, want %s", definition.Key, definition.Action, catalog.LedgerExistingUnproduced)
		}
	}
}

func assertExactStrategyAuditFields(t testing.TB, name string, typeOf reflect.Type, want []string) {
	t.Helper()
	if typeOf.NumField() != len(want) {
		t.Fatalf("%s fields = %d, want reviewed v1 count %d", name, typeOf.NumField(), len(want))
	}
	for index, field := range want {
		if got := typeOf.Field(index).Name; got != field {
			t.Fatalf("%s field %d = %q, want reviewed v1 field %q", name, index, got, field)
		}
	}
}

func assertExactStrategyAuditJSONFields(t testing.TB, name string, typeOf reflect.Type, want []string) {
	t.Helper()
	if typeOf.NumField() != len(want) {
		t.Fatalf("%s JSON fields = %d, want reviewed v1 count %d", name, typeOf.NumField(), len(want))
	}
	for index, key := range want {
		if got := strings.Split(typeOf.Field(index).Tag.Get("json"), ",")[0]; got != key {
			t.Fatalf("%s JSON field %d = %q, want reviewed v1 key %q", name, index, got, key)
		}
	}
}

func strategyAuditLayoutSource(field layoutField) string {
	switch field.Scope {
	case scopeTelemetryRow:
		return fmt.Sprintf("LMU_Data telemetry row +%d", field.Offset)
	case scopeScoringRow:
		return fmt.Sprintf("LMU_Data scoring row +%d", field.Offset)
	case scopeSession:
		return fmt.Sprintf("LMU_Data session +%d", field.Offset)
	default:
		return fmt.Sprintf("unknown layout scope %q +%d", field.Scope, field.Offset)
	}
}

func strategyLiveSignalLedgerV1() []strategySignalEntryV1 {
	unsupported := func(key, evidence string) strategySignalEntryV1 {
		return strategySignalEntryV1{
			Key:        key,
			Capability: "unsupported",
			Source:     "none-admitted",
			Unit:       "none-admitted",
			Authority:  "none",
			Freshness:  "missing",
			Identity:   "none",
			Evidence:   evidence,
		}
	}

	return []strategySignalEntryV1{
		{
			Key:        "energy.fuel_amount",
			Capability: "supported",
			Source:     "LMU_Data telemetry row +524",
			Unit:       "liters",
			Authority:  "Shared Memory only",
			Freshness:  "500ms; observed fresh/stale/invalid/missing",
			Identity:   "player vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset",
			Evidence:   "lmu-1.4-track-fixture.bin through Driver/Fusion/BatchMapper/Reducer/Derive",
		},
		{
			Key:        "energy.fuel_capacity",
			Capability: "supported",
			Source:     "LMU_Data telemetry row +608",
			Unit:       "liters",
			Authority:  "Shared Memory only",
			Freshness:  "500ms; observed fresh/stale/invalid/missing",
			Identity:   "player vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset",
			Evidence:   "lmu-1.4-track-fixture.bin through Driver/Fusion/BatchMapper/Reducer/Derive",
		},
		unsupported("energy.virtual_energy", "FuelMult is a session fuel multiplier, not Virtual Energy"),
		unsupported("tyres.identity", "legacy Engineer tyre fields do not identify physical tyres"),
		unsupported("tyres.compound", "no canonical LMU compound source is admitted"),
		unsupported("tyres.wear", "legacy Engineer wheel placeholders have unverified offsets and scale"),
		unsupported("tyres.corner", "wheels.Corner locates brake-temperature measurements; it is not tyre identity"),
		unsupported("weather.ambient_temperature", "catalog signal remains LedgerExistingUnproduced"),
		unsupported("weather.track_temperature", "historical sidecar bytes have no admitted source and unit contract"),
		unsupported("weather.rain_intensity", "historical Pit Manager weather is not canonical evidence"),
		unsupported("weather.track_wetness", "no canonical LMU track-wetness source is admitted"),
		{
			Key:        "pit.in_pit",
			Capability: "supported",
			Source:     "LMU_Data scoring row +198",
			Unit:       "boolean",
			Authority:  "Shared Memory only",
			Freshness:  "500ms grid TTL; observed fresh/stale/invalid/missing",
			Identity:   "vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset",
			Evidence:   "menu_track_pit_disconnect_v1.golden.json real false/true/false sequence",
		},
		{
			Key:        "pit.stop_count",
			Capability: "supported",
			Source:     "LMU_Data scoring row +192; REST standings player overlap",
			Unit:       "count",
			Authority:  "Shared Memory preferred; REST fallback only for SHM-identified player",
			Freshness:  "Shared Memory 500ms; REST 2s; observed fresh/stale/invalid/missing",
			Identity:   "vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset; REST cannot create identity",
			Evidence:   "layout_test.go and fusion_test.go authority cases",
		},
		{
			Key:        "session.lap_number",
			Capability: "supported",
			Source:     "LMU_Data telemetry row +20",
			Unit:       "count",
			Authority:  "Shared Memory only",
			Freshness:  "500ms; observed fresh/stale/invalid/missing",
			Identity:   "player vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset",
			Evidence:   "lmu-1.4-self-delta-trace-v1.jsonl and layout_test.go",
		},
		{
			Key:        "standings.completed_laps",
			Capability: "supported",
			Source:     "LMU_Data scoring row +100; REST standings player overlap",
			Unit:       "count",
			Authority:  "Shared Memory preferred; REST fallback only for SHM-identified player",
			Freshness:  "Shared Memory 500ms; REST 2s; observed fresh/stale/invalid/missing",
			Identity:   "vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset; REST cannot create identity",
			Evidence:   "layout_test.go and fusion_test.go authority cases",
		},
		{
			Key:        "standings.lap_distance",
			Capability: "supported",
			Source:     "LMU_Data scoring row +104",
			Unit:       "meters",
			Authority:  "Shared Memory only",
			Freshness:  "500ms grid TTL; observed fresh/stale/invalid/missing",
			Identity:   "vehicle lmu-slot-N-generation-G; G increments after disappearance/reappearance and resets to 1 on session reset",
			Evidence:   "lmu-1.4-self-delta-trace-v1.jsonl and layout_test.go",
		},
		{
			Key:        "session.maximum_laps",
			Capability: "supported",
			Source:     "LMU_Data session +1716",
			Unit:       "count",
			Authority:  "Shared Memory only",
			Freshness:  "500ms; observed fresh/stale/invalid/missing",
			Identity:   "canonical event and session identity",
			Evidence:   "layout_test.go and derive lap-limited session regression",
		},
		{
			Key:        "session.remaining_time",
			Capability: "supported",
			Source:     "derived from session.source_time (+1700) and session.end_time (+1708)",
			Unit:       "seconds",
			Authority:  "canonical Derive pipeline only; no raw remaining-time field",
			Freshness:  "fresh/stale from exact input quality; otherwise missing or invalid",
			Identity:   "canonical event and session identity",
			Evidence:   "derive/gaps_test.go and pipeline_advanced_test.go",
		},
	}
}
