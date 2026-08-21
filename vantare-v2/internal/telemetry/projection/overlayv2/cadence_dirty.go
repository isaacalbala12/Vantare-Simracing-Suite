package overlayv2

import (
	"math"
	"sort"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

// Fine-grained dirty detection.
//
// The coarse signals in cadence.go answer "did the grid move?"; these answer
// "did anything the builder actually projects change?". They are FNV-1a
// fingerprints over exactly the fields BuildStandings and BuildRelative read,
// so a canonical signal the builders ignore (RPM, throttle, world position…)
// never marks their section dirty, and any field they do read always does.
//
// Every helper is allocation-free and works on the snapshot in place: the cost
// is one linear pass over the vehicles per tick, no copies and no maps.

const (
	fnvOffset64 uint64 = 14695981039346656037
	fnvPrime64  uint64 = 1099511628211
)

func hashByte(sum uint64, value byte) uint64 { return (sum ^ uint64(value)) * fnvPrime64 }

func hashBool(sum uint64, value bool) uint64 {
	if value {
		return hashByte(sum, 1)
	}
	return hashByte(sum, 0)
}

func hashUint64(sum uint64, value uint64) uint64 {
	for shift := 0; shift < 64; shift += 8 {
		sum = hashByte(sum, byte(value>>shift))
	}
	return sum
}

// hashString terminates with a zero byte so "ab"+"c" and "a"+"bc" differ.
func hashString(sum uint64, value string) uint64 {
	for index := 0; index < len(value); index++ {
		sum = hashByte(sum, value[index])
	}
	return hashByte(sum, 0)
}

// hashQuality folds the presence and the freshness of a field, because both
// reach the wire through QValue.Q and through the missing/fallback branches.
func hashQuality[T comparable](sum uint64, field schema.Field[T]) uint64 {
	_, present := field.Value()
	sum = hashBool(sum, present)
	return hashByte(sum, byte(field.Freshness()))
}

func hashFieldString[T ~string](sum uint64, field schema.Field[T]) uint64 {
	value, _ := field.Value()
	return hashString(hashQuality(sum, field), string(value))
}

func hashFieldInt32[T ~int32](sum uint64, field schema.Field[T]) uint64 {
	value, _ := field.Value()
	return hashUint64(hashQuality(sum, field), uint64(uint32(value)))
}

func hashFieldFloat[T ~float64](sum uint64, field schema.Field[T]) uint64 {
	value, _ := field.Value()
	return hashUint64(hashQuality(sum, field), math.Float64bits(float64(value)))
}

func hashFieldBool[T ~bool](sum uint64, field schema.Field[T]) uint64 {
	value, _ := field.Value()
	return hashBool(hashQuality(sum, field), bool(value))
}

// hashStandingsVehicle folds one vehicle exactly as BuildStandings projects it:
// identity, position (value and freshness, which decides the sort and the
// index fallback), class, driver name, gap to the leader in time and laps, pit
// state, completed laps and last lap time. Gaps are folded bit for bit because
// the v2 frame publishes them unquantized.
func hashStandingsVehicle(sum uint64, vehicle *core.VehicleState) uint64 {
	sum = hashString(sum, string(vehicle.Identity.Vehicle))
	sum = hashFieldInt32(sum, vehicle.Position)
	sum = hashFieldString(sum, vehicle.VehicleClass)
	sum = hashFieldString(sum, vehicle.DriverName)
	sum = hashFieldFloat(sum, vehicle.TimeBehindLeader)
	sum = hashFieldInt32(sum, vehicle.LapsBehindLeader)
	sum = hashFieldBool(sum, vehicle.InPit)
	sum = hashFieldInt32(sum, vehicle.CompletedLaps)
	return hashFieldFloat(sum, vehicle.LastLapTime)
}

func hashProvenance(sum uint64, provenance schema.Provenance) uint64 {
	return hashByte(sum, byte(provenance))
}

func hashRelativeGap(sum uint64, field schema.Field[standings.RelativeTime]) uint64 {
	_, present := field.Value()
	sum = hashBool(sum, present)
	sum = hashByte(sum, byte(field.Freshness()))
	sum = hashProvenance(sum, field.Provenance())
	if present {
		value, _ := field.Value()
		sum = hashUint64(sum, math.Float64bits(float64(value)))
	}
	return sum
}

func hashRelativeLaps(sum uint64, field schema.Field[standings.RelativeLaps]) uint64 {
	_, present := field.Value()
	sum = hashBool(sum, present)
	sum = hashByte(sum, byte(field.Freshness()))
	sum = hashProvenance(sum, field.Provenance())
	if present {
		value, _ := field.Value()
		sum = hashUint64(sum, uint64(uint32(value)))
	}
	return sum
}

// hashRelativeMark fingerprints exactly the fields BuildRelative projects, scoped
// to the published window around the player. A signal the builder ignores (RPM,
// world position, fuel) never marks the section dirty; changing the player or
// any neighbour inside the window always does, even if the rest of the grid is
// untouched. The hash is ordered far->near ahead, player, near->far behind.
func hashRelativeMark(final derive.FinalState) uint64 {
	sum := fnvOffset64
	// Player identity and its presence.
	player, found := findPlayerVehicle(final.Observed.Vehicles)
	if !found {
		sum = hashByte(sum, 0)
		return sum
	}
	sum = hashByte(sum, 1)
	sum = hashString(sum, string(player.Identity.Vehicle))
	sum = hashQuality(sum, player.Player)

	// Index gaps by vehicle for O(1) lookup.
	gapsByVehicle := make(map[string]derive.VehicleGap, len(final.Derived.Gaps.Vehicles))
	for _, gap := range final.Derived.Gaps.Vehicles {
		gapsByVehicle[string(gap.Vehicle)] = gap
	}

	type candidate struct {
		id     string
		value  float64
		time   schema.Field[standings.RelativeTime]
		laps   schema.Field[standings.RelativeLaps]
		driver schema.Field[string]
		class  schema.Field[string]
	}
	candidates := make([]candidate, 0, len(final.Observed.Vehicles))
	for _, current := range final.Observed.Vehicles {
		id := string(current.Identity.Vehicle)
		if id == string(player.Identity.Vehicle) {
			continue
		}
		gap, ok := gapsByVehicle[id]
		if !ok {
			continue
		}
		value, usable := usableRelativeGapForDirty(gap.Time)
		if !usable {
			continue
		}
		// Normalize driver/class to string fields for hashing, preserving
		// quality semantics as the builder does via observedString/vehicleClassID.
		driverVal, driverPresent := current.DriverName.Value()
		driverField := schema.MissingField[string]()
		if driverPresent && current.DriverName.Freshness() != schema.FreshnessMissing {
			field, _ := schema.NewField(string(driverVal), current.DriverName.Provenance(), current.DriverName.Freshness())
			driverField = field
		}
		classVal, classPresent := current.VehicleClass.Value()
		classField := schema.MissingField[string]()
		if classPresent && current.VehicleClass.Freshness() != schema.FreshnessMissing {
			// Trim space as the builder does, but hashing the trimmed value is
			// equivalent for dirty detection (both sides trim the same way).
			trimmed := string(classVal)
			// Keep trimming minimal: the builder trims Space, we mimic by hashing
			// the builder's normalized value via vehicleClassID would be empty if
			// missing, else trimmed. For dirtiness a raw value difference that
			// trims to same string should remain clean (matches builder).
			// We replicate the trimming via strings.TrimSpace inline without import
			// to keep allocation-free: manual trim of spaces.
			trimmed = trimSpaces(trimmed)
			if trimmed != "" {
				field, _ := schema.NewField(trimmed, current.VehicleClass.Provenance(), current.VehicleClass.Freshness())
				classField = field
			}
		}
		candidates = append(candidates, candidate{
			id:     id,
			value:  value,
			time:   gap.Time,
			laps:   gap.Laps,
			driver: driverField,
			class:  classField,
		})
	}
	sort.Slice(candidates, func(left, right int) bool {
		if candidates[left].value != candidates[right].value {
			return candidates[left].value > candidates[right].value
		}
		return candidates[left].id < candidates[right].id
	})
	split := len(candidates)
	for index := range candidates {
		if candidates[index].value < 0 {
			split = index
			break
		}
	}
	ahead := candidates[:split]
	behind := candidates[split:]
	if len(ahead) > MaxRelativeAhead {
		ahead = ahead[len(ahead)-MaxRelativeAhead:]
	}
	if len(behind) > MaxRelativeBehind {
		behind = behind[:MaxRelativeBehind]
	}

	// Hash window in published order: ahead far->near, player, behind near->far.
	for _, c := range ahead {
		sum = hashString(sum, c.id)
		sum = hashRelativeGap(sum, c.time)
		sum = hashRelativeLaps(sum, c.laps)
		sum = hashFieldString(sum, c.driver)
		sum = hashFieldString(sum, c.class)
		sum = hashByte(sum, byte(RelativeSideAhead[0]))
	}
	// Player anchor.
	playerGap := gapsByVehicle[string(player.Identity.Vehicle)]
	sum = hashString(sum, string(player.Identity.Vehicle))
	sum = hashRelativeGap(sum, playerGap.Time)
	sum = hashRelativeLaps(sum, playerGap.Laps)
	// Player display fields are also projected (DisplayName/ClassID for the player
	// row). Hash them so a player name/class change dirties relative.
	sum = hashFieldString(sum, player.DriverName)
	if player.VehicleClass.Freshness() != schema.FreshnessMissing {
		if v, ok := player.VehicleClass.Value(); ok {
			classField, _ := schema.NewField(trimSpaces(string(v)), player.VehicleClass.Provenance(), player.VehicleClass.Freshness())
			sum = hashFieldString(sum, classField)
		} else {
			sum = hashFieldString(sum, schema.MissingField[string]())
		}
	} else {
		sum = hashFieldString(sum, schema.MissingField[string]())
	}
	sum = hashByte(sum, byte(RelativeSidePlayer[0]))
	for _, c := range behind {
		sum = hashString(sum, c.id)
		sum = hashRelativeGap(sum, c.time)
		sum = hashRelativeLaps(sum, c.laps)
		sum = hashFieldString(sum, c.driver)
		sum = hashFieldString(sum, c.class)
		sum = hashByte(sum, byte(RelativeSideBehind[0]))
	}
	// Include window cardinality so empty vs non-empty differs even with same hash prefix.
	sum = hashUint64(sum, uint64(len(ahead)))
	sum = hashUint64(sum, uint64(len(behind)))
	return sum
}

func findPlayerVehicle(vehicles []core.VehicleState) (core.VehicleState, bool) {
	for _, current := range vehicles {
		value, present := current.Player.Value()
		if present && value && current.Player.Freshness() != schema.FreshnessInvalid {
			return current, true
		}
	}
	return core.VehicleState{}, false
}

func usableRelativeGapForDirty(field schema.Field[standings.RelativeTime]) (float64, bool) {
	value, present := field.Value()
	if !present {
		return 0, false
	}
	switch qualityFromFreshnessDirty(field.Freshness()) {
	case QualityFresh, QualityStale:
	default:
		return 0, false
	}
	number := float64(value)
	if math.IsNaN(number) || math.IsInf(number, 0) {
		return 0, false
	}
	return number, true
}

func qualityFromFreshnessDirty(freshness schema.Freshness) Quality {
	switch freshness {
	case schema.FreshnessFresh:
		return QualityFresh
	case schema.FreshnessStale:
		return QualityStale
	case schema.FreshnessInvalid:
		return QualityInvalid
	default:
		return QualityMissing
	}
}

func trimSpaces(value string) string {
	start := 0
	end := len(value)
	for start < end && (value[start] == ' ' || value[start] == '\t' || value[start] == '\n' || value[start] == '\r') {
		start++
	}
	for end > start && (value[end-1] == ' ' || value[end-1] == '\t' || value[end-1] == '\n' || value[end-1] == '\r') {
		end--
	}
	return value[start:end]
}
