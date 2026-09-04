package overlayv2

import (
	"encoding/json"
	"fmt"
	"reflect"
	"testing"
)

func TestFrameV2RoundTripPreservesQualityAndZero(t *testing.T) {
	t.Parallel()

	want := syntheticFullFrame(1)
	want.Player.Throttle = QValue[float64]{V: 0, Q: QualityFresh}
	payload, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal FrameV2: %v", err)
	}
	var got FrameV2
	if err := json.Unmarshal(payload, &got); err != nil {
		t.Fatalf("unmarshal FrameV2: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("round trip mismatch\ngot:  %#v\nwant: %#v", got, want)
	}
	if got.Player.Throttle.Q != QualityFresh || got.Player.Throttle.V != 0 {
		t.Fatalf("fresh zero was not preserved: %#v", got.Player.Throttle)
	}
}

func TestUpdateV2NullFrameRoundTrip(t *testing.T) {
	t.Parallel()

	want := UpdateV2{
		DeliveryRevision: 7,
		Source:           SourceStatusV2{State: "degraded", ReconnectAttempt: 2, LastFrameAgeMS: 1250, DegradedReason: "watchdog"},
	}
	payload, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal UpdateV2: %v", err)
	}
	var got UpdateV2
	if err := json.Unmarshal(payload, &got); err != nil {
		t.Fatalf("unmarshal UpdateV2: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("round trip mismatch: got %#v want %#v", got, want)
	}
}

func TestFrameV2SyntheticFullUnder64KiBWith104Vehicles(t *testing.T) {
	t.Parallel()

	payload, err := json.Marshal(syntheticFullFrame(104))
	if err != nil {
		t.Fatalf("marshal synthetic full FrameV2: %v", err)
	}
	t.Logf("synthetic full FrameV2 with 104 vehicles: %d bytes", len(payload))
	if len(payload) >= 64*1024 {
		t.Fatalf("synthetic full FrameV2 = %d bytes, want < %d", len(payload), 64*1024)
	}
}

func syntheticFullFrame(vehicles int) FrameV2 {
	// The controls history is the player's alone and does not scale with the
	// grid, but the worst case is always the full canonical window, so the
	// budget must be measured with it populated: 120 absolute instants plus
	// three quality-bearing motion cells per sample, all fresh with
	// representative values. The fuel history follows the same rule: the
	// player's alone, measured here at its full 64-sample cap with
	// representative lap numbers and litre figures, plus the session laps and
	// required fuel the builder always publishes alongside it.
	controls := ControlsHistoryV2{
		Q:            QualityFresh,
		CapturedAtMS: make([]int64, 120),
		Throttle:     make([]int16, 120), Brake: make([]int16, 120), Clutch: make([]int16, 120),
		SpeedMPS: make([]QValue[float64], 120), RPM: make([]QValue[float64], 120), Gear: make([]QValue[int32], 120),
	}
	origin := int64(1786711200000)
	for index := range controls.Throttle {
		controls.CapturedAtMS[index] = origin + int64(index)*16
		controls.Throttle[index] = int16(876 - index%100)
		controls.Brake[index] = int16(543 - index%100)
		controls.Clutch[index] = int16(index % 100)
		controls.SpeedMPS[index] = QValue[float64]{V: 82.5, Q: QualityFresh}
		controls.RPM[index] = QValue[float64]{V: 7250, Q: QualityFresh}
		controls.Gear[index] = QValue[int32]{V: 6, Q: QualityFresh}
	}
	fuelHistory := FuelHistoryV2{Q: QualityFresh, Lap: make([]int32, 64), Consumed: make([]float64, 64)}
	for index := range fuelHistory.Lap {
		fuelHistory.Lap[index] = int32(64 + index)
		fuelHistory.Consumed[index] = 3.4
	}
	standings := make([]StandingRowV2, vehicles)
	relative := make([]RelativeRowV2, vehicles)
	for index := 0; index < vehicles; index++ {
		id := fmt.Sprintf("vehicle-%03d", index+1)
		standings[index] = StandingRowV2{
			VehicleID: id, Position: int32(index + 1), ClassPosition: int32(index%24 + 1),
			ClassID: "hypercar", DriverName: fmt.Sprintf("Driver %03d", index+1), CarNumber: fmt.Sprintf("%d", index+1),
			GapSeconds: QValue[float64]{V: float64(index) * 1.234, Q: QualityFresh}, GapLaps: int32(index / 40),
			PitState: "track", CompletedLaps: 127, LastLapSeconds: QValue[float64]{V: 91.234, Q: QualityFresh},
			LapDistance: QValue[float64]{V: float64(index) * 42.5, Q: QualityFresh}, GroundPosition: QValue[GroundPositionV2]{V: GroundPositionV2{X: float64(index) * 10, Z: float64(index) * -5}, Q: QualityFresh},
		}
		relative[index] = RelativeRowV2{
			VehicleID: id, GapSeconds: QValue[float64]{V: float64(index-52) * 0.314, Q: QualityFresh},
			Side: "ahead", Authority: AuthorityDerived, DisplayName: fmt.Sprintf("Driver %03d", index+1),
		}
	}
	return FrameV2{
		ContractVersion: ContractVersionV2, AlgorithmVersion: AlgorithmVersionV2,
		StreamEpoch: 4, SourceSequence: 9001, SessionID: "session-2026-endurance", GeneratedAt: "2026-08-19T12:34:56.789Z",
		Units: UnitsV2{Speed: SpeedUnitMPS, Temperature: TemperatureUnitCelsius, Pressure: PressureUnitKPA, Fuel: FuelUnitLiters},
		Session: SessionV2{
			Track: QValue[string]{V: "Circuit de la Sarthe", Q: QualityFresh}, Phase: QValue[string]{V: "race", Q: QualityFresh},
			Flag: QValue[string]{V: "green", Q: QualityFresh}, RemainingSeconds: QValue[float64]{V: 8432.5, Q: QualityFresh},
			MaximumLaps: QValue[int32]{V: 240, Q: QualityFresh},
		},
		Player: PlayerInstrumentsV2{
			VehicleID: "vehicle-001", Speed: QValue[float64]{V: 82.5, Q: QualityFresh}, RPM: QValue[float64]{V: 7250, Q: QualityFresh},
			Gear: QValue[int32]{V: 6, Q: QualityFresh}, Throttle: QValue[float64]{V: .91, Q: QualityFresh},
			Brake: QValue[float64]{V: .02, Q: QualityFresh}, Clutch: QValue[float64]{V: 0, Q: QualityFresh},
			Steering: QValue[float64]{V: -.13, Q: QualityFresh},
		},
		Controls:  ControlsV2{History: controls},
		Standings: standings, Relative: relative,
		Delta:   DeltaViewV2{Seconds: QValue[float64]{V: -.238, Q: QualityFresh}, Reference: "personal-best", Requested: "personal-best", Available: []string{"personal-best", "session-best", "previous-lap"}, Trend: "improving", Authority: AuthorityDerived},
		Fuel:    FuelViewV2{Remaining: QValue[float64]{V: 42.1, Q: QualityFresh}, Capacity: QValue[float64]{V: 90, Q: QualityFresh}, PerLap: QValue[float64]{V: 3.4, Q: QualityFresh}, EstimatedLaps: QValue[float64]{V: 12.38, Q: QualityFresh}, SessionLaps: QValue[float64]{V: 79, Q: QualityFresh}, RequiredFuel: QValue[float64]{V: 268.6, Q: QualityFresh}, History: fuelHistory},
		Spotter: SpotterViewV2{Mode: "xy", Left: QValue[bool]{V: true, Q: QualityFresh}, Right: QValue[bool]{V: false, Q: QualityFresh}},
		Damage: DamageViewV2{
			Dents: QValue[[]uint16]{V: []uint16{1, 2, 3, 4, 5, 6, 7, 8}, Q: QualityFresh}, Overheating: QValue[bool]{V: false, Q: QualityFresh}, Detached: QValue[bool]{V: false, Q: QualityFresh}, WheelDetachedCount: QValue[uint8]{V: 0, Q: QualityFresh},
		},
		Weather: WeatherV2{
			AmbientC: QValue[float64]{V: 22, Q: QualityFresh}, TrackC: QValue[float64]{V: 31, Q: QualityFresh},
			RainPercent: QValue[float64]{V: 5, Q: QualityFresh}, WetnessPct: QValue[float64]{V: 12, Q: QualityFresh},
			WindKph: QValue[float64]{V: 12, Q: QualityFresh}, WindDir: QValue[string]{V: "NW", Q: QualityFresh},
			PressureHpa: QValue[float64]{V: 1012, Q: QualityFresh},
		},
		Capabilities: CapabilitiesV2{
			Supported: []string{"damage", "session", "controls", "standings", "gaps", "fuel", "delta", "spatial.longitudinal", "spatial.lateral", "spotter"},
			Available: map[string]Quality{"session": QualityFresh, "controls": QualityFresh, "standings": QualityFresh, "gaps": QualityFresh, "fuel": QualityFresh, "delta": QualityFresh, "spotter": QualityFresh, "damage": QualityFresh},
			Modes:     CapabilityModesV2{Spatial: []string{"xyz", "xy", "lap-distance"}, Delta: []string{"personal-best", "session-best", "previous-lap"}, Standings: ModeOfficial, Gaps: ModeEstimated},
		},
	}
}
