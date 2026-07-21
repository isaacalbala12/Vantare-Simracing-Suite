package lmu

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/controls"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

const (
	MemoryName             = "LMU_Data"
	ObjectOutSize          = 324820
	telemetryOffset        = 128468
	telemetryStride        = 1888
	scoringStride          = 584
	maxVehicles            = 104
	knownFingerprintFormat = "LMU_Data/runtime:build=%s;size=324820;scoring=invariants+player-name-nul;telemetry=%s"
	unknownFingerprint     = "LMU_Data/size=324820/evidence=insufficient"
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
	return parseWithBuild(buf, received, BuildEvidence{})
}

func parseWithBuild(buf []byte, received time.Time, build BuildEvidence) (Observation, error) {
	return parseWithProfile(buf, received, profileFromBuild(build))
}

func parseWithProfile(buf []byte, received time.Time, profile compatibilityProfile) (Observation, error) {
	if len(buf) < ObjectOutSize {
		return Observation{}, ErrIncompatibleBuffer
	}

	result := Observation{
		ReceivedUTC:   received.Round(0).UTC(),
		Compatibility: CompatibilityUnknown,
		Fingerprint:   unknownFingerprint,
	}
	if !profile.supported {
		return result, nil
	}
	vehicles := readInt32(buf, 1736)
	phase := buf[1740]
	playerIndex := int(buf[128465])
	if !hasScoringEvidence(buf, vehicles, phase, playerIndex) {
		result.Fingerprint = fmt.Sprintf("LMU_Data/runtime:build=%s;evidence=scoring-insufficient", profile.version)
		return result, nil
	}
	playerPresent := buf[128466] != 0
	telemetryEvidence := "not-required-no-player"
	if playerPresent {
		if !hasPlayerTelemetryEvidence(buf, vehicles, playerIndex) {
			result.Fingerprint = fmt.Sprintf("LMU_Data/runtime:build=%s;evidence=telemetry-insufficient", profile.version)
			return result, nil
		}
		telemetryEvidence = "player-slot-correlated"
	}
	result.Compatibility = CompatibilityKnown
	result.Fingerprint = fmt.Sprintf(knownFingerprintFormat, profile.version, telemetryEvidence)
	result.PlayerPresent = observed(playerPresent)

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
	rpm := readFloat64(buf, base+356)
	if finite(rpm) && rpm >= 0 {
		result.EngineRPM = observed(vehicle.EngineRPM(rpm))
	} else {
		result.EngineRPM = invalid[vehicle.EngineRPM]()
	}

	vx, vy, vz := readFloat64(buf, base+184), readFloat64(buf, base+192), readFloat64(buf, base+200)
	if finite(vx) && finite(vy) && finite(vz) {
		speed := math.Sqrt(vx*vx + vy*vy + vz*vz)
		if finite(speed) {
			result.SpeedMPS = observed(speed)
		} else {
			result.SpeedMPS = invalid[float64]()
		}
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

func hasScoringEvidence(buf []byte, vehicles int32, phase byte, playerIndex int) bool {
	playerMarker := buf[128466]
	if vehicles < 0 || vehicles > maxVehicles || phase > 9 || playerMarker > 1 {
		return false
	}
	if playerMarker == 1 && (playerIndex < 0 || playerIndex >= maxVehicles) {
		return false
	}
	// Both audited real fixtures contain a non-empty, NUL-terminated scoring
	// player name at this offset. The content is never returned or fingerprinted;
	// only its structural shape contributes positive runtime evidence.
	_, ok := reasonableCString(buf[1748:1748+32], false)
	return ok
}

func hasPlayerTelemetryEvidence(buf []byte, vehicles int32, playerIndex int) bool {
	if vehicles <= 0 {
		return false
	}
	playerScoring := -1
	for index := 0; index < int(vehicles); index++ {
		base := 2192 + index*scoringStride
		if buf[base+196] == 1 {
			if playerScoring != -1 {
				return false
			}
			playerScoring = base
		}
	}
	if playerScoring < 0 {
		return false
	}
	telemetry := telemetryOffset + playerIndex*telemetryStride
	if readInt32(buf, playerScoring) != readInt32(buf, telemetry) {
		return false
	}
	scoringVehicle, ok := reasonableCString(buf[playerScoring+36:playerScoring+100], false)
	if !ok {
		return false
	}
	telemetryVehicle, ok := reasonableCString(buf[telemetry+32:telemetry+96], false)
	if !ok || scoringVehicle != telemetryVehicle {
		return false
	}
	scoringTrack, ok := reasonableCString(buf[1632:1696], false)
	if !ok {
		return false
	}
	telemetryTrack, ok := reasonableCString(buf[telemetry+96:telemetry+160], false)
	return ok && scoringTrack == telemetryTrack
}

func reasonableCString(value []byte, allowEmpty bool) (string, bool) {
	nul := -1
	for index, char := range value {
		if char == 0 {
			nul = index
			break
		}
	}
	if nul < 0 || (!allowEmpty && nul == 0) {
		return "", false
	}
	value = value[:nul]
	if !utf8.Valid(value) {
		return "", false
	}
	for _, char := range string(value) {
		if char < 0x20 {
			return "", false
		}
	}
	return string(value), true
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
