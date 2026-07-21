package lmu

import (
	"encoding/binary"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/controls"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

const (
	MemoryName       = "LMU_Data"
	ObjectOutSize    = 324820
	telemetryOffset  = 128468
	telemetryStride  = 1888
	scoringStride    = 584
	maxVehicles      = 104
	knownFingerprint = "LMU_Data/324820/telemetry-1888/scoring-584"
)

var ErrIncompatibleBuffer = errors.New("LMU_Data buffer is structurally incompatible")

type Compatibility uint8

const (
	CompatibilityUnknown Compatibility = iota
	CompatibilityKnown
)

type ClockChange uint8

const (
	ClockContinuous ClockChange = iota
	ClockReset
	ClockWrap
)

// Observation is the canonical, product-neutral subset demonstrated by the
// audited LMU_Data fixtures. It intentionally contains no raw bytes, deltas,
// gaps, warnings, or product decisions.
type Observation struct {
	ReceivedUTC   time.Time
	Compatibility Compatibility
	Fingerprint   string
	ClockChange   ClockChange
	SourceTime    schema.Field[time.Duration]
	TrackName     schema.Field[string]
	SessionType   schema.Field[session.Type]
	VehicleCount  schema.Field[schema.Count]
	PlayerPresent schema.Field[bool]
	VehicleName   schema.Field[vehicle.VehicleName]
	LapNumber     schema.Field[session.LapNumber]
	Gear          schema.Field[vehicle.Gear]
	EngineRPM     schema.Field[vehicle.EngineRPM]
	SpeedMPS      schema.Field[float64]
	Controls      schema.Field[controls.Inputs]
}

func Parse(buf []byte, received time.Time) (Observation, error) {
	if len(buf) < ObjectOutSize {
		return Observation{}, ErrIncompatibleBuffer
	}

	result := Observation{
		ReceivedUTC:   received.Round(0).UTC(),
		Compatibility: CompatibilityKnown,
		Fingerprint:   knownFingerprint,
		PlayerPresent: observed(buf[128466] != 0),
	}

	vehicles := readInt32(buf, 1736)
	phase := buf[1740]
	playerIndex := int(buf[128465])
	if vehicles < 0 || vehicles > maxVehicles || playerIndex >= maxVehicles || phase > 9 {
		result.Compatibility = CompatibilityUnknown
	}

	result.TrackName = observed(readString(buf, 1632, 64))
	result.VehicleCount = validateCount(vehicles, 0, maxVehicles)
	result.SessionType = validateSessionType(readInt32(buf, 1696))
	result.SourceTime = validateDuration(readFloat64(buf, 1700))

	if !bufBool(result.PlayerPresent) || playerIndex < 0 || playerIndex >= maxVehicles {
		return result, nil
	}
	base := telemetryOffset + playerIndex*telemetryStride
	result.VehicleName = observed(vehicle.VehicleName(readString(buf, base+32, 64)))
	result.LapNumber = observed(session.LapNumber(readInt32(buf, base+20)))
	result.Gear = observed(vehicle.Gear(readInt32(buf, base+352)))
	result.EngineRPM = finiteField(vehicle.EngineRPM(readFloat64(buf, base+356)))

	vx, vy, vz := readFloat64(buf, base+184), readFloat64(buf, base+192), readFloat64(buf, base+200)
	if finite(vx) && finite(vy) && finite(vz) {
		result.SpeedMPS = observed(math.Sqrt(vx*vx + vy*vy + vz*vz))
	} else {
		result.SpeedMPS = invalid[float64]()
	}
	throttle, brake, clutch := readFloat64(buf, base+420), readFloat64(buf, base+428), readFloat64(buf, base+444)
	if finiteRatio(throttle) && finiteRatio(brake) && finiteRatio(clutch) {
		result.Controls = observed(controls.Inputs{Throttle: schema.Ratio(throttle), Brake: schema.Ratio(brake), Clutch: schema.Ratio(clutch)})
	} else {
		result.Controls = invalid[controls.Inputs]()
	}
	return result, nil
}

func observed[T comparable](value T) schema.Field[T] {
	field, _ := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	return field
}

func invalid[T comparable]() schema.Field[T] {
	var zero T
	field, _ := schema.NewField(zero, schema.ProvenanceObserved, schema.FreshnessInvalid)
	return field
}

func finiteField[T ~float64](value T) schema.Field[T] {
	if !finite(float64(value)) {
		return invalid[T]()
	}
	return observed(value)
}

func validateDuration(seconds float64) schema.Field[time.Duration] {
	if !finite(seconds) || seconds < 0 || seconds > float64(math.MaxInt64)/float64(time.Second) {
		return invalid[time.Duration]()
	}
	return observed(time.Duration(seconds * float64(time.Second)))
}

func validateCount(value, min, max int32) schema.Field[schema.Count] {
	if value < min || value > max {
		return invalid[schema.Count]()
	}
	return observed(schema.Count(value))
}

func validateSessionType(value int32) schema.Field[session.Type] {
	// Only codes demonstrated by the audited fixture and existing LMU monitors
	// are translated. Other source codes remain explicitly invalid until TC-03
	// has real captures proving their semantics.
	var canonical session.Type
	switch value {
	case 1:
		canonical = session.TypePractice
	case 3:
		canonical = session.TypeQualifying
	case 4, 5:
		canonical = session.TypeRace
	default:
		return invalid[session.Type]()
	}
	return observed(canonical)
}

func bufBool(field schema.Field[bool]) bool { value, present := field.Value(); return present && value }
func finite(value float64) bool             { return !math.IsNaN(value) && !math.IsInf(value, 0) }
func finiteRatio(value float64) bool        { return finite(value) && value >= 0 && value <= 1 }
func readInt32(buf []byte, off int) int32   { return int32(binary.LittleEndian.Uint32(buf[off:])) }
func readFloat64(buf []byte, off int) float64 {
	return math.Float64frombits(binary.LittleEndian.Uint64(buf[off:]))
}

func readString(buf []byte, off, size int) string {
	value := buf[off : off+size]
	if index := strings.IndexByte(string(value), 0); index >= 0 {
		value = value[:index]
	}
	return string(value)
}

func classifyClock(previous, current time.Duration) ClockChange {
	if previous <= 0 || current >= previous {
		return ClockContinuous
	}
	if previous >= 24*time.Hour && current < time.Minute {
		return ClockWrap
	}
	return ClockReset
}
