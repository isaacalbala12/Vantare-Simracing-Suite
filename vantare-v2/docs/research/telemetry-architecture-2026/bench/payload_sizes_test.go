//go:build researchbench

package bench

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/analysis"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

// canonicalObserved mirrors core.ObservedState / derive.FinalState in a
// JSON-serialisable shape. The real canonical types are not serialisable
// (schema.Field keeps its fields unexported by design), so this measures what
// "serialise the whole canonical state" would cost if it were ever exposed.
type canonicalField struct {
	Value      any   `json:"value"`
	Present    bool  `json:"present"`
	Provenance uint8 `json:"provenance"`
	Freshness  uint8 `json:"freshness"`
}

func canonicalVehicleJSON(state core.VehicleState) map[string]canonicalField {
	field := func(value any, present bool) canonicalField {
		return canonicalField{Value: value, Present: present, Provenance: 1, Freshness: 1}
	}
	driver, driverOK := state.DriverName.Value()
	name, nameOK := state.Name.Value()
	class, classOK := state.VehicleClass.Value()
	player, playerOK := state.Player.Value()
	sector, sectorOK := state.Sector.Value()
	lapDistance, lapDistanceOK := state.LapDistance.Value()
	best, bestOK := state.BestLapTime.Value()
	last, lastOK := state.LastLapTime.Value()
	estimated, estimatedOK := state.EstimatedLapTime.Value()
	lapNumber, lapNumberOK := state.LapNumber.Value()
	gear, gearOK := state.Gear.Value()
	rpm, rpmOK := state.EngineRPM.Value()
	speed, speedOK := state.SpeedMPS.Value()
	throttle, throttleOK := state.Throttle.Value()
	brake, brakeOK := state.Brake.Value()
	clutch, clutchOK := state.Clutch.Value()
	position, positionOK := state.Position.Value()
	completed, completedOK := state.CompletedLaps.Value()
	inPit, inPitOK := state.InPit.Value()
	stops, stopsOK := state.PitStopCount.Value()
	penalties, penaltiesOK := state.PenaltyCount.Value()
	gapLeader, gapLeaderOK := state.TimeBehindLeader.Value()
	lapsLeader, lapsLeaderOK := state.LapsBehindLeader.Value()
	gapNext, gapNextOK := state.TimeBehindNext.Value()
	lapsNext, lapsNextOK := state.LapsBehindNext.Value()
	fuel, fuelOK := state.Fuel.Value()
	deltaBest, deltaBestOK := state.DeltaBest.Value()
	world, worldOK := state.WorldPosition.Value()
	velocity, velocityOK := state.LocalVelocity.Value()
	orientation, orientationOK := state.Orientation.Value()

	return map[string]canonicalField{
		"identityVehicle":  field(string(state.Identity.Vehicle), true),
		"identityEvent":    field(string(state.Identity.Event), true),
		"identitySession":  field(string(state.Identity.Session), true),
		"identityTeam":     field(string(state.Identity.Team), true),
		"identityDriver":   field(string(state.Identity.Driver), true),
		"driverName":       field(driver, driverOK),
		"name":             field(name, nameOK),
		"vehicleClass":     field(class, classOK),
		"player":           field(player, playerOK),
		"sector":           field(sector, sectorOK),
		"lapDistance":      field(lapDistance, lapDistanceOK),
		"bestLapTime":      field(best, bestOK),
		"lastLapTime":      field(last, lastOK),
		"estimatedLapTime": field(estimated, estimatedOK),
		"lapNumber":        field(lapNumber, lapNumberOK),
		"gear":             field(gear, gearOK),
		"engineRpm":        field(rpm, rpmOK),
		"speedMps":         field(speed, speedOK),
		"throttle":         field(throttle, throttleOK),
		"brake":            field(brake, brakeOK),
		"clutch":           field(clutch, clutchOK),
		"position":         field(position, positionOK),
		"completedLaps":    field(completed, completedOK),
		"inPit":            field(inPit, inPitOK),
		"pitStopCount":     field(stops, stopsOK),
		"penaltyCount":     field(penalties, penaltiesOK),
		"timeBehindLeader": field(gapLeader, gapLeaderOK),
		"lapsBehindLeader": field(lapsLeader, lapsLeaderOK),
		"timeBehindNext":   field(gapNext, gapNextOK),
		"lapsBehindNext":   field(lapsNext, lapsNextOK),
		"fuel":             field(fuel, fuelOK),
		"deltaBest":        field(deltaBest, deltaBestOK),
		"worldPosition":    field(world, worldOK),
		"localVelocity":    field(velocity, velocityOK),
		"orientation":      field(orientation, orientationOK),
	}
}

func canonicalJSONPayload(final derive.FinalState) any {
	vehicles := make([]map[string]canonicalField, len(final.Observed.Vehicles))
	for index, current := range final.Observed.Vehicles {
		vehicles[index] = canonicalVehicleJSON(current)
	}
	sourceTime, _ := final.Observed.SourceTime.Value()
	endTime, _ := final.Observed.EndTime.Value()
	track, _ := final.Observed.TrackName.Value()
	sessionType, _ := final.Observed.SessionType.Value()
	remaining, _ := final.Derived.SessionRemaining.Value()
	return map[string]any{
		"observed": map[string]any{
			"sourceTimeNanos": int64(sourceTime),
			"endTime":         float64(endTime),
			"trackName":       track,
			"sessionType":     uint8(sessionType),
			"vehicleCount":    len(final.Observed.Vehicles),
			"vehicles":        vehicles,
		},
		"derived": map[string]any{
			"sessionRemaining": float64(remaining),
			"gaps":             final.Derived.Gaps.Vehicles,
			"deltaHistory":     final.Derived.Delta.History,
			"controlsHistory":  final.Derived.ControlsHistory.Samples,
			"algorithms":       final.Derived.Algorithms,
		},
	}
}

// TestPayloadSizes is the size table generator. It is a test, not a benchmark,
// because sizes are deterministic: one measurement is the measurement.
func TestPayloadSizes(t *testing.T) {
	outputDir := payloadDir(t)

	var rows []sizeRow
	record := func(variant string, count int, encoded []byte, filename string) {
		rows = append(rows, sizeRow{variant: variant, count: count, bytes: len(encoded)})
		if filename != "" {
			if err := os.WriteFile(filepath.Join(outputDir, filename), encoded, 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}

	for _, count := range VehicleCounts {
		previousFinal := FinalStateFixture(t, count, 32)
		nextSnapshot := advanceOne(t, count, 32)

		// (a) current overlay v1
		projected, err := overlay.ProjectV1(previousFinal)
		if err != nil {
			t.Fatal(err)
		}
		overlayEncoded, err := json.Marshal(projected.PayloadV1)
		if err != nil {
			t.Fatal(err)
		}
		record("a. overlay v1 (actual)", count, overlayEncoded, fmt.Sprintf("overlay-v1-%03d.json", count))

		projectedNext, err := overlay.ProjectV1(nextSnapshot)
		if err != nil {
			t.Fatal(err)
		}
		overlayNextEncoded, err := json.Marshal(projectedNext.PayloadV1)
		if err != nil {
			t.Fatal(err)
		}

		// sibling products published on the same batch
		engineerProjected, err := engineer.ProjectV1(previousFinal)
		if err != nil {
			t.Fatal(err)
		}
		engineerEncoded, _ := json.Marshal(engineerProjected.PayloadV1)
		record("a2. engineer v1", count, engineerEncoded, "")

		strategyProjected, err := strategy.ProjectV1(previousFinal)
		if err != nil {
			t.Fatal(err)
		}
		strategyEncoded, _ := json.Marshal(strategyProjected.PayloadV1)
		record("a3. strategy v1", count, strategyEncoded, "")

		analysisProjected, err := analysis.ProjectV1(previousFinal)
		if err != nil {
			t.Fatal(err)
		}
		analysisEncoded, _ := json.Marshal(analysisProjected.PayloadV1)
		record("a4. analysis v1", count, analysisEncoded, "")

		// (b) compact OverlayFrame
		compact := BuildCompactFrame(previousFinal)
		compactEncoded, err := json.Marshal(compact)
		if err != nil {
			t.Fatal(err)
		}
		record("b. OverlayFrame compacto (array)", count, compactEncoded, fmt.Sprintf("compact-array-%03d.json", count))

		compactNext := BuildCompactFrame(nextSnapshot)
		compactNextEncoded, _ := json.Marshal(compactNext)

		// (e) map-keyed vehicles
		mapEncoded, err := json.Marshal(ToMapFrame(compact))
		if err != nil {
			t.Fatal(err)
		}
		record("e. OverlayFrame compacto (mapa)", count, mapEncoded, fmt.Sprintf("compact-map-%03d.json", count))

		// (c) canonical/observed complete
		canonicalValue, ok := previousFinal.Value()
		if !ok {
			t.Fatal("final snapshot without value")
		}
		canonicalEncoded, err := json.Marshal(canonicalJSONPayload(canonicalValue))
		if err != nil {
			t.Fatal(err)
		}
		record("c. canonical/final completo", count, canonicalEncoded, fmt.Sprintf("canonical-%03d.json", count))

		// (d) RFC 7396 merge-patch between two consecutive realistic frames
		overlayPatch := GenerateMergePatch(overlayEncoded, overlayNextEncoded)
		record("d1. merge-patch sobre overlay v1", count, overlayPatch, fmt.Sprintf("overlay-v1-patch-%03d.json", count))

		compactPatch := GenerateMergePatch(compactEncoded, compactNextEncoded)
		record("d2. merge-patch sobre compacto", count, compactPatch, fmt.Sprintf("compact-patch-%03d.json", count))
	}

	t.Log("\n" + renderSizeTable(rows))
	report := "variante,vehiculos,bytes\n"
	for _, current := range rows {
		report += fmt.Sprintf("%s,%d,%d\n", current.variant, current.count, current.bytes)
	}
	if err := os.WriteFile(filepath.Join(resultsDir(t), "payload-sizes.csv"), []byte(report), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(resultsDir(t), "payload-sizes.txt"), []byte(renderSizeTable(rows)), 0o644); err != nil {
		t.Fatal(err)
	}
}

type sizeRow struct {
	variant string
	count   int
	bytes   int
}

func renderSizeTable(rows []sizeRow) string {
	out := fmt.Sprintf("%-36s %10s %12s %12s %12s %12s %12s\n",
		"variante", "vehiculos", "bytes", "MiB/s@10Hz", "MiB/s@20Hz", "MiB/s@30Hz", "MiB/s@60Hz")
	for _, current := range rows {
		mib := func(hz int) float64 {
			return float64(current.bytes) * float64(hz) / (1024 * 1024)
		}
		out += fmt.Sprintf("%-36s %10d %12d %12.3f %12.3f %12.3f %12.3f\n",
			current.variant, current.count, current.bytes, mib(10), mib(20), mib(30), mib(60))
	}
	return out
}

func advanceOne(tb testing.TB, count int, warm int) envelope.Snapshot[derive.FinalState] {
	return FinalStateFixture(tb, count, warm+1)
}

func payloadDir(tb testing.TB) string {
	dir := filepath.Join(resultsDir(tb), "payloads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		tb.Fatal(err)
	}
	return dir
}

func resultsDir(tb testing.TB) string {
	dir := "results"
	if err := os.MkdirAll(dir, 0o755); err != nil {
		tb.Fatal(err)
	}
	return dir
}
