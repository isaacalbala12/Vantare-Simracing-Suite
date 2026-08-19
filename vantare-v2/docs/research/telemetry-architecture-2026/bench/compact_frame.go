//go:build researchbench

package bench

import (
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

// CompactVehicle is one prepared standings/relative row. Design rules:
//   - no per-field {present,value,provenance,freshness} envelope; presence is
//     carried once per frame by CompactFrame.Missing,
//   - no fast-telemetry fields on non-player rows: the LMU driver only
//     publishes gear/rpm/speed/throttle/brake/clutch/fuel for the scoring
//     selected player row, so 6-8 always-missing objects per row in overlay v1
//     are pure transport waste,
//   - gaps already resolved (no client-side join between vehicles and gaps).
type CompactVehicle struct {
	ID            string  `json:"id"`
	Position      int32   `json:"position"`
	Class         string  `json:"class,omitempty"`
	Driver        string  `json:"driver,omitempty"`
	Name          string  `json:"name,omitempty"`
	CompletedLaps int32   `json:"completedLaps,omitempty"`
	LapNumber     int32   `json:"lapNumber,omitempty"`
	Sector        uint8   `json:"sector,omitempty"`
	LapDistance   float64 `json:"lapDistance,omitempty"`
	BestLap       float64 `json:"bestLap,omitempty"`
	LastLap       float64 `json:"lastLap,omitempty"`
	EstimatedLap  float64 `json:"estimatedLap,omitempty"`
	InPit         bool    `json:"inPit,omitempty"`
	PitStops      int32   `json:"pitStops,omitempty"`
	Penalties     int32   `json:"penalties,omitempty"`
	GapLeader     float64 `json:"gapLeader,omitempty"`
	LapsLeader    int32   `json:"lapsLeader,omitempty"`
	GapNext       float64 `json:"gapNext,omitempty"`
	RelativeTime  float64 `json:"relativeTime,omitempty"`
	RelativeLaps  int32   `json:"relativeLaps,omitempty"`
}

// CompactPlayer holds the fast-telemetry channels that only the player row has.
type CompactPlayer struct {
	ID                 string  `json:"id"`
	SpeedMPS           float64 `json:"speedMps"`
	EngineRPM          float64 `json:"engineRpm"`
	Gear               int32   `json:"gear"`
	Throttle           float64 `json:"throttle"`
	Brake              float64 `json:"brake"`
	Clutch             float64 `json:"clutch"`
	FuelLiters         float64 `json:"fuelLiters"`
	FuelCapacityLiters float64 `json:"fuelCapacityLiters"`
	InPit              bool    `json:"inPit"`
}

// CompactDelta is the delta widget view model, already resolved.
type CompactDelta struct {
	Seconds      float64 `json:"seconds"`
	PersonalBest float64 `json:"personalBest"`
	SessionBest  float64 `json:"sessionBest"`
	PreviousLap  float64 `json:"previousLap"`
	Reference    string  `json:"reference"`
	Available    bool    `json:"available"`
}

// CompactSession carries the session/flags block.
type CompactSession struct {
	Track            string  `json:"track"`
	Type             string  `json:"type"`
	RemainingSeconds float64 `json:"remainingSeconds"`
	EndTimeSeconds   float64 `json:"endTimeSeconds"`
	MaximumLaps      int32   `json:"maximumLaps,omitempty"`
	GlobalFlag       string  `json:"globalFlag,omitempty"`
}

// CompactFrame is the hypothetical OverlayFrame: exactly what the widgets
// consume, in arrays, with per-frame presence instead of per-field envelopes.
type CompactFrame struct {
	Epoch    uint64           `json:"epoch"`
	Sequence uint64           `json:"sequence"`
	Captured int64            `json:"capturedAt"`
	Session  CompactSession   `json:"session"`
	Player   CompactPlayer    `json:"player"`
	Delta    CompactDelta     `json:"delta"`
	Vehicles []CompactVehicle `json:"vehicles"`
	Missing  []string         `json:"missing,omitempty"`
}

// CompactFrameMap is the same frame with vehicles keyed by id instead of an
// ordered array, to price the map-vs-array question.
type CompactFrameMap struct {
	Epoch    uint64                    `json:"epoch"`
	Sequence uint64                    `json:"sequence"`
	Captured int64                     `json:"capturedAt"`
	Session  CompactSession            `json:"session"`
	Player   CompactPlayer             `json:"player"`
	Delta    CompactDelta              `json:"delta"`
	Vehicles map[string]CompactVehicle `json:"vehicles"`
	Missing  []string                  `json:"missing,omitempty"`
}

func gapFor(gaps derive.GapSet, id string) derive.VehicleGap {
	for _, gap := range gaps.Vehicles {
		if string(gap.Vehicle) == id {
			return gap
		}
	}
	return derive.VehicleGap{}
}

// BuildCompactFrame projects the same FinalState the overlay v1 projector
// consumes into the compact contract, so both are measured over identical data.
func BuildCompactFrame(snapshot envelope.Snapshot[derive.FinalState]) CompactFrame {
	final, ok := snapshot.Value()
	if !ok {
		panic("final snapshot without value")
	}
	header := snapshot.Header()
	observed := final.Observed

	frame := CompactFrame{
		Epoch:    uint64(header.Cursor.Epoch),
		Sequence: uint64(header.Cursor.Sequence),
		Captured: header.Clock.ReceivedUTC.UnixMilli(),
		Vehicles: make([]CompactVehicle, len(observed.Vehicles)),
	}

	track, _ := observed.TrackName.Value()
	remaining, _ := final.Derived.SessionRemaining.Value()
	endTime, _ := observed.EndTime.Value()
	maximumLaps, _ := observed.MaximumLaps.Value()
	frame.Session = CompactSession{
		Track:            track,
		Type:             "endurance",
		RemainingSeconds: float64(remaining),
		EndTimeSeconds:   float64(endTime),
		MaximumLaps:      int32(maximumLaps),
	}

	deltaSeconds, deltaOK := final.Derived.Delta.Seconds.Value()
	personalBest, _ := final.Derived.Delta.PersonalBest.Value()
	sessionBest, _ := final.Derived.Delta.SessionBest.Value()
	previousLap, _ := final.Derived.Delta.PreviousLap.Value()
	frame.Delta = CompactDelta{
		Seconds:      float64(deltaSeconds),
		PersonalBest: float64(personalBest),
		SessionBest:  float64(sessionBest),
		PreviousLap:  float64(previousLap),
		Reference:    "best-completed-player-lap",
		Available:    deltaOK,
	}

	for index, current := range observed.Vehicles {
		id := string(current.Identity.Vehicle)
		gap := gapFor(final.Derived.Gaps, id)
		position, _ := current.Position.Value()
		class, _ := current.VehicleClass.Value()
		driver, _ := current.DriverName.Value()
		name, _ := current.Name.Value()
		completed, _ := current.CompletedLaps.Value()
		lapNumber, _ := current.LapNumber.Value()
		sector, _ := current.Sector.Value()
		lapDistance, _ := current.LapDistance.Value()
		best, _ := current.BestLapTime.Value()
		last, _ := current.LastLapTime.Value()
		estimated, _ := current.EstimatedLapTime.Value()
		inPit, _ := current.InPit.Value()
		stops, _ := current.PitStopCount.Value()
		penalties, _ := current.PenaltyCount.Value()
		gapLeader, _ := current.TimeBehindLeader.Value()
		lapsLeader, _ := current.LapsBehindLeader.Value()
		gapNext, _ := current.TimeBehindNext.Value()
		relativeTime, _ := gap.Time.Value()
		relativeLaps, _ := gap.Laps.Value()

		frame.Vehicles[index] = CompactVehicle{
			ID:            id,
			Position:      int32(position),
			Class:         string(class),
			Driver:        string(driver),
			Name:          string(name),
			CompletedLaps: int32(completed),
			LapNumber:     int32(lapNumber),
			Sector:        uint8(sector),
			LapDistance:   float64(lapDistance),
			BestLap:       float64(best),
			LastLap:       float64(last),
			EstimatedLap:  float64(estimated),
			InPit:         bool(inPit),
			PitStops:      int32(stops),
			Penalties:     int32(penalties),
			GapLeader:     float64(gapLeader),
			LapsLeader:    int32(lapsLeader),
			GapNext:       float64(gapNext),
			RelativeTime:  float64(relativeTime),
			RelativeLaps:  int32(relativeLaps),
		}

		if index == 0 {
			speed, _ := current.SpeedMPS.Value()
			rpm, _ := current.EngineRPM.Value()
			gear, _ := current.Gear.Value()
			throttle, _ := current.Throttle.Value()
			brake, _ := current.Brake.Value()
			clutch, _ := current.Clutch.Value()
			fuel, _ := current.Fuel.Value()
			frame.Player = CompactPlayer{
				ID:                 id,
				SpeedMPS:           speed,
				EngineRPM:          float64(rpm),
				Gear:               int32(gear),
				Throttle:           float64(throttle),
				Brake:              float64(brake),
				Clutch:             float64(clutch),
				FuelLiters:         float64(fuel.Amount),
				FuelCapacityLiters: float64(fuel.Capacity),
				InPit:              bool(inPit),
			}
		}
	}
	return frame
}

// ToMapFrame converts an array frame into the keyed-map variant.
func ToMapFrame(frame CompactFrame) CompactFrameMap {
	vehicles := make(map[string]CompactVehicle, len(frame.Vehicles))
	for _, current := range frame.Vehicles {
		vehicles[current.ID] = current
	}
	return CompactFrameMap{
		Epoch:    frame.Epoch,
		Sequence: frame.Sequence,
		Captured: frame.Captured,
		Session:  frame.Session,
		Player:   frame.Player,
		Delta:    frame.Delta,
		Vehicles: vehicles,
		Missing:  frame.Missing,
	}
}
