package v1

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strings"
	"time"
)

// v1JSONFieldNames is the exact wire-tag vocabulary. The typed decoder below
// still validates which of these fields belong in each object.
var v1JSONFieldNames = map[string]struct{}{
	"version": {}, "kind": {}, "canonicalVersion": {}, "streamEpoch": {},
	"revision": {}, "sessionId": {}, "capturedAt": {}, "session": {},
	"player": {}, "vehicles": {},
	"track": {}, "type": {}, "remainingSeconds": {}, "maximumLaps": {},
	"vehicleId": {}, "speedMps": {}, "rpm": {}, "gear": {}, "throttle": {},
	"brake": {}, "clutch": {}, "lapNumber": {}, "completedLaps": {},
	"sector": {}, "lapDistanceMeters": {}, "inPit": {}, "pitStopCount": {},
	"fuelRemainingLiters": {}, "fuelCapacityLiters": {}, "fuelPerLapLiters": {},
	"deltaSeconds": {}, "deltaReference": {}, "damage": {},
	"dents": {}, "overheating": {}, "detached": {}, "wheelDetachedCount": {},
	"driverName": {}, "vehicleName": {}, "vehicleClass": {}, "position": {},
	"penaltyCount": {}, "gapToLeaderSeconds": {}, "lapsBehindLeader": {},
	"gapToNextSeconds": {}, "lapsBehindNext": {}, "gapToPlayerSeconds": {},
	"lapDeltaToPlayer": {}, "groundPositionCm": {},
	"x": {}, "z": {}, "q": {}, "v": {},
}

func Validate(update RemoteCanonicalUpdateV1) error {
	if update.Version != VersionV1 {
		return fmt.Errorf("%w: got %d", ErrUnsupportedVersion, update.Version)
	}
	if update.Kind != KindFull {
		return fmt.Errorf("%w: got %q", ErrUnsupportedKind, update.Kind)
	}
	if update.CanonicalVersion != CanonicalVersionV1 {
		return fmt.Errorf("%w: got %d", ErrUnsupportedCanonicalVersion, update.CanonicalVersion)
	}
	if update.StreamEpoch == 0 || update.Revision == 0 {
		return fmt.Errorf("%w: stream epoch and revision must be non-zero", ErrInvalidUpdate)
	}
	if strings.TrimSpace(update.SessionID) == "" {
		return fmt.Errorf("%w: sessionId is required", ErrInvalidUpdate)
	}
	capturedAt, err := time.Parse(time.RFC3339Nano, update.CapturedAt)
	if err != nil || capturedAt.IsZero() {
		return fmt.Errorf("%w: capturedAt must be RFC3339", ErrInvalidUpdate)
	}
	_, offset := capturedAt.Zone()
	if offset != 0 {
		return fmt.Errorf("%w: capturedAt must use UTC", ErrInvalidUpdate)
	}
	if update.Vehicles == nil || len(update.Vehicles) > MaxVehiclesV1 {
		return fmt.Errorf("%w: vehicles must contain at most %d entries", ErrInvalidUpdate, MaxVehiclesV1)
	}

	if err := validateSession(update.Session); err != nil {
		return err
	}
	if err := validatePlayer(update.Player); err != nil {
		return err
	}

	ids := make(map[string]struct{}, len(update.Vehicles))
	for index, current := range update.Vehicles {
		if err := validateVehicle(index, current); err != nil {
			return err
		}
		if _, exists := ids[current.VehicleID]; exists {
			return fmt.Errorf("%w: %q", ErrDuplicateVehicle, current.VehicleID)
		}
		ids[current.VehicleID] = struct{}{}
	}
	if update.Player.VehicleID != "" {
		if _, exists := ids[update.Player.VehicleID]; !exists {
			return fmt.Errorf("%w: player vehicle %q is absent from vehicles", ErrInvalidUpdate, update.Player.VehicleID)
		}
	} else if playerHasUsableValue(update.Player) {
		return fmt.Errorf("%w: player values require vehicleId", ErrInvalidUpdate)
	}
	return nil
}

func Encode(update RemoteCanonicalUpdateV1) ([]byte, error) {
	if err := Validate(update); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(update)
	if err != nil {
		return nil, fmt.Errorf("%w: encode: %v", ErrInvalidJSON, err)
	}
	if len(encoded) > MaxPayloadBytesV1 {
		return nil, fmt.Errorf("%w: %d > %d bytes", ErrPayloadTooLarge, len(encoded), MaxPayloadBytesV1)
	}
	return encoded, nil
}

func Decode(encoded []byte) (RemoteCanonicalUpdateV1, error) {
	if len(encoded) > MaxPayloadBytesV1 {
		return RemoteCanonicalUpdateV1{}, fmt.Errorf("%w: %d > %d bytes", ErrPayloadTooLarge, len(encoded), MaxPayloadBytesV1)
	}
	if err := validateClosedJSON(encoded); err != nil {
		return RemoteCanonicalUpdateV1{}, fmt.Errorf("%w: closed contract: %v", ErrInvalidJSON, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	var update RemoteCanonicalUpdateV1
	if err := decoder.Decode(&update); err != nil {
		return RemoteCanonicalUpdateV1{}, fmt.Errorf("%w: decode: %v", ErrInvalidJSON, err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			err = fmt.Errorf("multiple JSON values")
		}
		return RemoteCanonicalUpdateV1{}, fmt.Errorf("%w: trailing data: %v", ErrInvalidJSON, err)
	}
	if err := Validate(update); err != nil {
		return RemoteCanonicalUpdateV1{}, err
	}
	return update, nil
}

func validateClosedJSON(encoded []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	if err := scanJSONValue(decoder); err != nil {
		return err
	}
	if _, err := decoder.Token(); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values")
		}
		return err
	}
	return nil
}

func scanJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	if token == nil {
		return fmt.Errorf("null is not allowed")
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return nil
	}

	switch delimiter {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return fmt.Errorf("object key is not a string")
			}
			if _, allowed := v1JSONFieldNames[key]; !allowed {
				return fmt.Errorf("field %q is not an exact V1 tag", key)
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("duplicate field %q", key)
			}
			seen[key] = struct{}{}
			if err := scanJSONValue(decoder); err != nil {
				return err
			}
		}
		return consumeJSONDelimiter(decoder, '}')
	case '[':
		for decoder.More() {
			if err := scanJSONValue(decoder); err != nil {
				return err
			}
		}
		return consumeJSONDelimiter(decoder, ']')
	default:
		return fmt.Errorf("unexpected delimiter %q", delimiter)
	}
}

func consumeJSONDelimiter(decoder *json.Decoder, expected json.Delim) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	if token != expected {
		return fmt.Errorf("unexpected delimiter %q", token)
	}
	return nil
}

func validateSession(value SessionV1) error {
	if err := validateQ("session.track", value.Track, nonBlank); err != nil {
		return err
	}
	if err := validateQ("session.type", value.Type, validSessionType); err != nil {
		return err
	}
	if err := validateQ("session.remainingSeconds", value.RemainingSeconds, finiteNonNegative); err != nil {
		return err
	}
	return validateQ("session.maximumLaps", value.MaximumLaps, func(number int32) bool { return number >= 0 })
}

func validatePlayer(value PlayerV1) error {
	checks := []error{
		validateQ("player.speedMps", value.SpeedMPS, finiteNonNegative),
		validateQ("player.rpm", value.RPM, finiteNonNegative),
		validateQ("player.gear", value.Gear, func(int32) bool { return true }),
		validateQ("player.throttle", value.Throttle, validRatio),
		validateQ("player.brake", value.Brake, validRatio),
		validateQ("player.clutch", value.Clutch, validRatio),
		validateQ("player.lapNumber", value.LapNumber, func(number int32) bool { return number >= 0 }),
		validateQ("player.completedLaps", value.CompletedLaps, func(number int32) bool { return number >= 0 }),
		validateQ("player.sector", value.Sector, validSector),
		validateQ("player.lapDistanceMeters", value.LapDistanceMeters, finiteNonNegative),
		validateQ("player.inPit", value.InPit, func(bool) bool { return true }),
		validateQ("player.pitStopCount", value.PitStopCount, func(number int32) bool { return number >= 0 }),
		validateQ("player.fuelRemainingLiters", value.FuelRemainingLiters, finiteNonNegative),
		validateQ("player.fuelCapacityLiters", value.FuelCapacityLiters, finitePositive),
		validateQ("player.fuelPerLapLiters", value.FuelPerLapLiters, finitePositive),
		validateQ("player.deltaSeconds", value.DeltaSeconds, finite),
		validateQ("player.deltaReference", value.DeltaReference, func(reference string) bool { return reference == deltaReferenceBestCompletedPlayerLap }),
		validateQ("player.damage.dents", value.Damage.Dents, validDents),
		validateQ("player.damage.overheating", value.Damage.Overheating, func(bool) bool { return true }),
		validateQ("player.damage.detached", value.Damage.Detached, func(bool) bool { return true }),
		validateQ("player.damage.wheelDetachedCount", value.Damage.WheelDetachedCount, func(count uint8) bool { return count <= 4 }),
	}
	for _, err := range checks {
		if err != nil {
			return err
		}
	}
	if hasUsableQuality(value.FuelRemainingLiters.Quality) && hasUsableQuality(value.FuelCapacityLiters.Quality) &&
		*value.FuelRemainingLiters.Value > *value.FuelCapacityLiters.Value {
		return fmt.Errorf("%w: player fuel remaining exceeds capacity", ErrInvalidValue)
	}
	return nil
}

func validateVehicle(index int, value VehicleV1) error {
	prefix := fmt.Sprintf("vehicles[%d].", index)
	if strings.TrimSpace(value.VehicleID) == "" {
		return fmt.Errorf("%w: %svehicleId is required", ErrInvalidUpdate, prefix)
	}
	checks := []error{
		validateQ(prefix+"driverName", value.DriverName, nonBlank),
		validateQ(prefix+"vehicleName", value.VehicleName, nonBlank),
		validateQ(prefix+"vehicleClass", value.VehicleClass, nonBlank),
		validateQ(prefix+"position", value.Position, func(number int32) bool { return number > 0 }),
		validateQ(prefix+"lapNumber", value.LapNumber, func(number int32) bool { return number >= 0 }),
		validateQ(prefix+"completedLaps", value.CompletedLaps, func(number int32) bool { return number >= 0 }),
		validateQ(prefix+"sector", value.Sector, validSector),
		validateQ(prefix+"lapDistanceMeters", value.LapDistanceMeters, finiteNonNegative),
		validateQ(prefix+"inPit", value.InPit, func(bool) bool { return true }),
		validateQ(prefix+"penaltyCount", value.PenaltyCount, func(number int32) bool { return number >= 0 }),
		validateQ(prefix+"gapToLeaderSeconds", value.GapToLeaderSeconds, finiteNonNegative),
		validateQ(prefix+"lapsBehindLeader", value.LapsBehindLeader, func(number int32) bool { return number >= 0 }),
		validateQ(prefix+"gapToNextSeconds", value.GapToNextSeconds, finiteNonNegative),
		validateQ(prefix+"lapsBehindNext", value.LapsBehindNext, func(number int32) bool { return number >= 0 }),
		validateQ(prefix+"gapToPlayerSeconds", value.GapToPlayerSeconds, finite),
		validateQ(prefix+"lapDeltaToPlayer", value.LapDeltaToPlayer, func(int32) bool { return true }),
		validateQ(prefix+"groundPositionCm", value.GroundPositionCM, func(GroundPositionCM) bool { return true }),
	}
	for _, err := range checks {
		if err != nil {
			return err
		}
	}
	return nil
}

func validateQ[T any](name string, value QValue[T], valid func(T) bool) error {
	switch value.Quality {
	case QualityFresh, QualityStale:
		if value.Value == nil {
			return fmt.Errorf("%w: %s %s requires v", ErrInvalidQuality, name, value.Quality)
		}
		if valid != nil && !valid(*value.Value) {
			return fmt.Errorf("%w: %s", ErrInvalidValue, name)
		}
	case QualityMissing, QualityInvalid:
		if value.Value != nil {
			return fmt.Errorf("%w: %s %s cannot carry v", ErrInvalidQuality, name, value.Quality)
		}
	default:
		return fmt.Errorf("%w: %s has %q", ErrInvalidQuality, name, value.Quality)
	}
	return nil
}

func playerHasUsableValue(value PlayerV1) bool {
	qualities := []Quality{
		value.SpeedMPS.Quality, value.RPM.Quality, value.Gear.Quality, value.Throttle.Quality,
		value.Brake.Quality, value.Clutch.Quality, value.LapNumber.Quality, value.CompletedLaps.Quality,
		value.Sector.Quality, value.LapDistanceMeters.Quality, value.InPit.Quality, value.PitStopCount.Quality,
		value.FuelRemainingLiters.Quality, value.FuelCapacityLiters.Quality, value.FuelPerLapLiters.Quality,
		value.DeltaSeconds.Quality, value.DeltaReference.Quality, value.Damage.Dents.Quality,
		value.Damage.Overheating.Quality, value.Damage.Detached.Quality, value.Damage.WheelDetachedCount.Quality,
	}
	for _, quality := range qualities {
		if hasUsableQuality(quality) {
			return true
		}
	}
	return false
}

func hasUsableQuality(quality Quality) bool {
	return quality == QualityFresh || quality == QualityStale
}

func validDents(dents []uint16) bool {
	if len(dents) != 8 {
		return false
	}
	for _, severity := range dents {
		if severity > math.MaxUint8 {
			return false
		}
	}
	return true
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func finiteNonNegative(value float64) bool { return finite(value) && value >= 0 }

func finitePositive(value float64) bool { return finite(value) && value > 0 }

func validRatio(value float64) bool { return finite(value) && value >= 0 && value <= 1 }

func validSector(value uint8) bool { return value >= 1 && value <= 3 }

func nonBlank(value string) bool { return strings.TrimSpace(value) != "" }

func validSessionType(value string) bool {
	switch value {
	case "practice", "qualifying", "race", "warmup", "endurance":
		return true
	default:
		return false
	}
}
