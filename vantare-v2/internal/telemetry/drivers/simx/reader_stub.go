package simx

import (
	"math"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

// TickInterval is the synthetic sampling period: 50 Hz.
const TickInterval = 20 * time.Millisecond

// Reader is the deterministic in-memory source of SimX. The same frame index
// always produces the same frame, on every platform, so goldens and conformance
// tests need no fixtures and no simulator.
type Reader struct {
	frame uint64
	epoch time.Time
	// boundaryEvery opens a new session every N frames. Zero never opens one.
	boundaryEvery uint64
}

// NewReader builds the synthetic source. The epoch anchors the reported UTC
// clock; it is injected so no test depends on the wall clock.
func NewReader(epoch time.Time, boundaryEvery uint64) *Reader {
	return &Reader{epoch: epoch.Round(0).UTC(), boundaryEvery: boundaryEvery}
}

// Next produces the next synthetic frame. Frames are numbered from one.
func (reader *Reader) Next() Observation {
	reader.frame++
	return reader.frameAt(reader.frame)
}

// Frame reports how many frames the reader has produced.
func (reader *Reader) Frame() uint64 { return reader.frame }

func (reader *Reader) frameAt(frame uint64) Observation {
	sessionFrame := frame
	boundary := false
	if reader.boundaryEvery > 0 {
		if frame%reader.boundaryEvery == 1 && frame > 1 {
			boundary = true
		}
		sessionFrame = ((frame - 1) % reader.boundaryEvery) + 1
	}
	elapsed := time.Duration(sessionFrame) * TickInterval
	observation := Observation{
		Slot:          slotSynthetic,
		ReceivedUTC:   reader.epoch.Add(time.Duration(frame) * TickInterval),
		SourceTime:    fresh(elapsed),
		TrackName:     fresh(TrackName),
		SessionType:   fresh(session.TypeRace),
		VehicleCount:  fresh(schema.Count(VehicleCount)),
		PlayerPresent: fresh(true),
		Vehicles:      make([]VehicleObservation, 0, VehicleCount),
		Boundary:      boundary,
	}
	seconds := elapsed.Seconds()
	for slot := 0; slot < VehicleCount; slot++ {
		observation.Vehicles = append(observation.Vehicles, syntheticVehicle(slot, seconds))
	}
	return observation
}

// syntheticVehicle is a closed-form function of the slot and the elapsed
// seconds, so it is reproducible and has no accumulated state.
func syntheticVehicle(slot int, seconds float64) VehicleObservation {
	// Every car runs a constant pace, and the pace gap between grid slots is
	// what produces a stable, believable order.
	pace := 45.0 + float64(slot)*0.35
	travelled := seconds * (TrackLengthMeters / pace)
	laps := math.Floor(travelled / TrackLengthMeters)
	distance := travelled - laps*TrackLengthMeters
	leaderTravelled := seconds * (TrackLengthMeters / 45.0)
	behindLeader := (leaderTravelled - travelled) / (TrackLengthMeters / pace)
	behindNext := 0.0
	if slot > 0 {
		previous := seconds * (TrackLengthMeters / (45.0 + float64(slot-1)*0.35))
		behindNext = (previous - travelled) / (TrackLengthMeters / pace)
	}
	// The pit window is deterministic and slot dependent so the standings and
	// pit capabilities carry real variation instead of a constant.
	inPit := distance < 120 && int(laps)%5 == slot%5 && laps > 0

	vehicle := VehicleObservation{
		Slot:             slot,
		DriverName:       fresh(driverName(slot)),
		VehicleName:      fresh(vehicleName(slot)),
		VehicleClass:     fresh(vehicleClass(slot)),
		Player:           fresh(slot == PlayerSlot),
		Position:         fresh(standings.Position(slot + 1)),
		CompletedLaps:    fresh(standings.CompletedLaps(laps)),
		LapDistance:      fresh(standings.LapDistance(distance)),
		InPit:            fresh(pit.InPit(inPit)),
		TimeBehindLeader: fresh(standings.TimeGap(behindLeader)),
		LapsBehindLeader: fresh(standings.LapGap(0)),
		TimeBehindNext:   fresh(standings.TimeGap(behindNext)),
		LapsBehindNext:   fresh(standings.LapGap(0)),
		Fuel:             fresh(syntheticFuel(seconds, pace)),
	}
	if laps >= 1 {
		vehicle.LastLapTime = fresh(standings.LapTime(pace))
		vehicle.BestLapTime = fresh(standings.LapTime(pace - 0.4))
	}
	if slot == PlayerSlot {
		vehicle.Gear = fresh(syntheticGear(distance))
		vehicle.EngineRPM = fresh(syntheticRPM(distance))
		vehicle.SpeedMPS = fresh(TrackLengthMeters / pace)
		vehicle.Throttle = fresh(syntheticThrottle(distance))
		vehicle.Brake = fresh(syntheticBrake(distance))
	}
	return vehicle
}

func syntheticFuel(seconds, pace float64) energy.Fuel {
	const capacity = 100.0
	burn := seconds / pace * 2.6
	amount := capacity - math.Mod(burn, capacity)
	return energy.Fuel{Amount: energy.FuelAmount(amount), Capacity: capacity}
}

func syntheticGear(distance float64) vehicle.Gear {
	gear := int(distance/700)%6 + 1
	return vehicle.Gear(gear)
}

func syntheticRPM(distance float64) vehicle.EngineRPM {
	phase := math.Mod(distance, 700) / 700
	return vehicle.EngineRPM(schema.RPM(4000 + 4500*phase))
}

func syntheticThrottle(distance float64) schema.Ratio {
	phase := math.Mod(distance, 700) / 700
	if phase > 0.85 {
		return 0
	}
	return schema.Ratio(phase / 0.85)
}

func syntheticBrake(distance float64) schema.Ratio {
	phase := math.Mod(distance, 700) / 700
	if phase <= 0.85 {
		return 0
	}
	return schema.Ratio((phase - 0.85) / 0.15)
}

func vehicleName(slot int) vehicle.VehicleName {
	if slot == PlayerSlot {
		return "SimX Prototype"
	}
	return vehicle.VehicleName("SimX Prototype " + string(rune('A'+slot%26)))
}

func vehicleClass(slot int) standings.VehicleClass {
	if slot%2 == 0 {
		return "SIMX-1"
	}
	return "SIMX-2"
}
