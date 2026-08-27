package simx

import (
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

// VehicleObservation is one synthetic grid row. The unsupported signals of
// SimX -- world position, orientation, local velocity, native delta -- are
// simply absent from this struct: an unsupported signal must never be a zero
// value that a consumer could mistake for data.
type VehicleObservation struct {
	Slot             int
	DriverName       schema.Field[identity.DriverName]
	VehicleName      schema.Field[vehicle.VehicleName]
	VehicleClass     schema.Field[standings.VehicleClass]
	Player           schema.Field[bool]
	Position         schema.Field[standings.Position]
	CompletedLaps    schema.Field[standings.CompletedLaps]
	LapDistance      schema.Field[standings.LapDistance]
	LapProgressTime  schema.Field[standings.LapProgressTime]
	BestLapTime      schema.Field[standings.LapTime]
	LastLapTime      schema.Field[standings.LapTime]
	EstimatedLapTime schema.Field[standings.LapTime]
	InPit            schema.Field[pit.InPit]
	Gear             schema.Field[vehicle.Gear]
	EngineRPM        schema.Field[vehicle.EngineRPM]
	SpeedMPS         schema.Field[float64]
	Throttle         schema.Field[schema.Ratio]
	Brake            schema.Field[schema.Ratio]
	Fuel             schema.Field[energy.Fuel]
	TimeBehindLeader schema.Field[standings.TimeGap]
	LapsBehindLeader schema.Field[standings.LapGap]
	TimeBehindNext   schema.Field[standings.TimeGap]
	LapsBehindNext   schema.Field[standings.LapGap]
}

// Observation is one complete synthetic frame.
type Observation struct {
	Slot          fusionSlot
	ReceivedUTC   time.Time
	SourceTime    schema.Field[time.Duration]
	TrackName     schema.Field[string]
	SessionType   schema.Field[session.Type]
	VehicleCount  schema.Field[schema.Count]
	PlayerPresent schema.Field[bool]
	Vehicles      []VehicleObservation
	// Boundary marks a frame that opens a new session. It is the synthetic
	// equivalent of a source clock reset.
	Boundary bool
}

// fusionSlot names the acquisition slot an observation arrived through.
type fusionSlot string

const (
	slotUnknown   fusionSlot = ""
	slotSynthetic fusionSlot = fusionSlot(SlotSynthetic)
)

func fresh[T comparable](value T) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		return schema.MissingField[T]()
	}
	return field
}
