package lmu

import (
	"math"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/catalog"
	"github.com/vantare/overlays/v2/internal/telemetry/fusion"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

const (
	MatrixVersion          uint16 = 6
	maxConflictDiagnostics        = 5
)

type AuthorityRule struct {
	Signal         catalog.SignalID
	Preferred      ObservationSource
	Alternative    ObservationSource
	Equivalent     bool
	PreferredTTL   time.Duration
	AlternativeTTL time.Duration
}

var authorityMatrixV4 = [...]AuthorityRule{
	{catalog.SignalSessionSourceTime, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalSessionTrackName, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalSessionType, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalSessionVehicleCount, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalVehiclePlayerPresent, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalIdentityDriverName, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalVehicleName, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsCompletedLaps, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalPitStopCount, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalStandingsPosition, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalPitInPit, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalSessionLapNumber, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalVehicleGear, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalVehicleEngineRPM, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalVehicleSpeedMPS, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalControlsThrottle, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalControlsBrake, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalControlsClutch, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalSessionEndTime, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalSessionMaximumLaps, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalVehicleClass, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsSector, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsLapDistance, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsLapProgressTime, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsBestLapTime, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsLastLapTime, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsEstimatedLapTime, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsPenaltyCount, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsTimeBehindLeader, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsLapsBehindLeader, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsTimeBehindNext, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsLapsBehindNext, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalEnergyFuelAmount, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalEnergyFuelCapacity, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalSpatialPosition, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalSpatialOrientation, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalSpatialLocalVelocity, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalSessionNativeDeltaBest, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
}

func AuthorityMatrix() []AuthorityRule {
	result := make([]AuthorityRule, len(authorityMatrixV4))
	copy(result, authorityMatrixV4[:])
	return result
}

// sharedMatrix is the driver-neutral projection of authorityMatrixV4. It is
// built once at process start and indexed by signal, so no lookup below scans
// the table linearly and none of them can panic on an uncovered signal.
var sharedMatrix = fusion.MustMatrix(sharedRules())

func sharedRules() []fusion.Rule {
	rules := make([]fusion.Rule, 0, len(authorityMatrixV4))
	for _, rule := range authorityMatrixV4 {
		sources := []fusion.Candidate{{Slot: slotOf(rule.Preferred), TTL: rule.PreferredTTL}}
		if rule.Alternative != SourceUnknown {
			sources = append(sources, fusion.Candidate{Slot: slotOf(rule.Alternative), TTL: rule.AlternativeTTL})
		}
		rules = append(rules, fusion.Rule{Signal: rule.Signal, Sources: sources, Equivalent: rule.Equivalent})
	}
	return rules
}

func slotOf(source ObservationSource) fusion.SlotID {
	switch source {
	case SourceSharedMemory:
		return fusion.SlotID(CapabilitySharedMemory)
	case SourceREST:
		return fusion.SlotID(CapabilityREST)
	default:
		return fusion.SlotUnknown
	}
}

func sourceOf(slot fusion.SlotID) ObservationSource {
	switch slot {
	case fusion.SlotID(CapabilitySharedMemory):
		return SourceSharedMemory
	case fusion.SlotID(CapabilityREST):
		return SourceREST
	default:
		return SourceUnknown
	}
}

func stampOf(stamp monotonicStamp) fusion.Stamp {
	return fusion.Stamp{Elapsed: stamp.elapsed, Set: stamp.set}
}

type FieldDecision struct {
	Signal    catalog.SignalID
	Source    ObservationSource
	Freshness schema.Freshness
	Fallback  bool
}

type ConflictDiagnostic struct {
	Signal      catalog.SignalID
	Preferred   ObservationSource
	Alternative ObservationSource
}

type monotonicStamp struct {
	elapsed time.Duration
	set     bool
}

// Fusion is single-writer state owned by one Driver.Run. UTC is output metadata
// only; arrival sequence orders inputs and monotonic elapsed time governs TTL.
// The N-slot store lives in the shared fusion package: LMU declares two slots,
// and a single-source driver declares one without duplicating this code.
type Fusion struct {
	slots *fusion.Slots[Observation]
}

func (state *Fusion) store() *fusion.Slots[Observation] {
	if state.slots == nil {
		state.slots = fusion.NewSlots[Observation](slotOf(SourceSharedMemory), slotOf(SourceREST))
	}
	return state.slots
}

func (state *Fusion) Merge(receivedUTC time.Time, elapsed time.Duration, inputs ...Observation) Observation {
	slots := state.store()
	for _, input := range inputs {
		slots.Put(slotOf(input.Source), input, fusion.Stamp{Elapsed: elapsed, Set: true})
	}
	sharedEntry := slots.Get(slotOf(SourceSharedMemory))
	restEntry := slots.Get(slotOf(SourceREST))
	sharedStamp := monotonicStamp{elapsed: sharedEntry.Received.Elapsed, set: sharedEntry.Received.Set}
	restStamp := monotonicStamp{elapsed: restEntry.Received.Elapsed, set: restEntry.Received.Set}

	result := Observation{
		Source:        SourceCanonical,
		ReceivedUTC:   receivedUTC.Round(0).UTC(),
		MatrixVersion: MatrixVersion,
		Decisions:     make([]FieldDecision, 0, len(authorityMatrixV4)),
		Conflicts:     make([]ConflictDiagnostic, 0, maxConflictDiagnostics),
	}
	if sharedEntry.Present() {
		result.Compatibility = sharedEntry.Value.Compatibility
		result.Fingerprint = sharedEntry.Value.Fingerprint
		result.ClockChange = sharedEntry.Value.ClockChange
	}
	shm := sharedEntry.Value
	rest := restEntry.Value.REST
	shmStamp := sharedStamp
	result.SourceTime = chooseSourceTime(elapsed, ruleFor(catalog.SignalSessionSourceTime), shm.SourceTime, shmStamp, rest.SourceTime.Field, timedStamp(rest.SourceTime, restStamp), &result)
	result.TrackName = chooseField(elapsed, ruleFor(catalog.SignalSessionTrackName), shm.TrackName, shmStamp, rest.TrackName.Field, timedStamp(rest.TrackName, restStamp), &result)
	result.SessionType = chooseField(elapsed, ruleFor(catalog.SignalSessionType), shm.SessionType, shmStamp, rest.SessionType.Field, timedStamp(rest.SessionType, restStamp), &result)
	result.VehicleCount = chooseField(elapsed, ruleFor(catalog.SignalSessionVehicleCount), shm.VehicleCount, shmStamp, rest.VehicleCount.Field, timedStamp(rest.VehicleCount, restStamp), &result)
	result.Vehicles = ageVehicleGrid(elapsed, shmStamp, shm.SourceTime, shm.Vehicles)
	playerIndex := playerVehicleIndex(result.Vehicles)
	restPlayerPresent := rest.PlayerPresent.Field
	if len(result.Vehicles) == 0 {
		restPlayerPresent = schema.MissingField[bool]()
	}
	result.PlayerPresent = chooseField(elapsed, ruleFor(catalog.SignalVehiclePlayerPresent), shm.PlayerPresent, shmStamp, restPlayerPresent, timedStamp(rest.PlayerPresent, restStamp), &result)
	result.EndTime = choosePreferredOnly(elapsed, ruleFor(catalog.SignalSessionEndTime), shm.EndTime, shmStamp, &result)
	result.MaximumLaps = choosePreferredOnly(elapsed, ruleFor(catalog.SignalSessionMaximumLaps), shm.MaximumLaps, shmStamp, &result)

	if playerIndex >= 0 {
		player := result.Vehicles[playerIndex]
		result.PlayerPosition = chooseField(elapsed, ruleFor(catalog.SignalStandingsPosition), player.Position, shmStamp, rest.PlayerPosition.Field, timedStamp(rest.PlayerPosition, restStamp), &result)
		result.CompletedLaps = chooseField(elapsed, ruleFor(catalog.SignalStandingsCompletedLaps), player.CompletedLaps, shmStamp, rest.CompletedLaps.Field, timedStamp(rest.CompletedLaps, restStamp), &result)
		result.PitStopCount = chooseField(elapsed, ruleFor(catalog.SignalPitStopCount), player.PitStopCount, shmStamp, rest.PitStopCount.Field, timedStamp(rest.PitStopCount, restStamp), &result)
		player.Position = result.PlayerPosition
		player.CompletedLaps = result.CompletedLaps
		player.PitStopCount = result.PitStopCount
		result.Vehicles[playerIndex] = player
		publishPlayer(&result, player)
	} else {
		result.PlayerPosition = missingDecision[standings.Position](ruleFor(catalog.SignalStandingsPosition), &result)
		result.CompletedLaps = missingDecision[standings.CompletedLaps](ruleFor(catalog.SignalStandingsCompletedLaps), &result)
		result.PitStopCount = missingDecision[pit.StopCount](ruleFor(catalog.SignalPitStopCount), &result)
		result.VehicleName = fieldAt(elapsed, shmStamp, defaultFreshnessLimit, shm.VehicleName)
		result.LapNumber = fieldAt(elapsed, shmStamp, defaultFreshnessLimit, shm.LapNumber)
		result.Gear = fieldAt(elapsed, shmStamp, defaultFreshnessLimit, shm.Gear)
		result.EngineRPM = fieldAt(elapsed, shmStamp, defaultFreshnessLimit, shm.EngineRPM)
		result.SpeedMPS = fieldAt(elapsed, shmStamp, defaultFreshnessLimit, shm.SpeedMPS)
		result.Throttle = fieldAt(elapsed, shmStamp, defaultFreshnessLimit, shm.Throttle)
		result.Brake = fieldAt(elapsed, shmStamp, defaultFreshnessLimit, shm.Brake)
		result.Clutch = fieldAt(elapsed, shmStamp, defaultFreshnessLimit, shm.Clutch)
		result.InPit = fieldAt(elapsed, shmStamp, defaultFreshnessLimit, shm.InPit)
		result.Fuel = fieldAt(elapsed, shmStamp, defaultFreshnessLimit, shm.Fuel)
	}
	orderDecisions(&result)
	return result
}

// ruleFor resolves one signal through the indexed shared matrix. An uncovered
// signal degrades to an unsourced rule -- the field is reported missing -- and
// never panics.
func ruleFor(signal catalog.SignalID) AuthorityRule {
	shared, err := sharedMatrix.Lookup(signal)
	if err != nil {
		return AuthorityRule{Signal: signal, Preferred: SourceUnknown, Alternative: SourceUnknown}
	}
	rule := AuthorityRule{Signal: shared.Signal, Equivalent: shared.Equivalent}
	preferred := shared.Preferred()
	rule.Preferred = sourceOf(preferred.Slot)
	rule.PreferredTTL = preferred.TTL
	if alternatives := shared.Alternatives(); len(alternatives) > 0 {
		rule.Alternative = sourceOf(alternatives[0].Slot)
		rule.AlternativeTTL = alternatives[0].TTL
	}
	return rule
}

func sharedRuleFor(rule AuthorityRule) fusion.Rule {
	shared, err := sharedMatrix.Lookup(rule.Signal)
	if err != nil {
		return fusion.Rule{Signal: rule.Signal}
	}
	return shared
}

// resolve runs one shared-package choice and folds its ledger back into the
// driver observation.
func resolve[T comparable](rule AuthorityRule, result *Observation, choose func(fusion.Rule, *fusion.Ledger) schema.Field[T]) schema.Field[T] {
	ledger := fusion.NewLedger(1, maxConflictDiagnostics)
	field := choose(sharedRuleFor(rule), ledger)
	for _, decision := range ledger.Decisions() {
		result.Decisions = append(result.Decisions, FieldDecision{
			Signal:    decision.Signal,
			Source:    sourceOf(decision.Slot),
			Freshness: decision.Freshness,
			Fallback:  decision.Fallback,
		})
	}
	for _, conflict := range ledger.Conflicts() {
		appendConflict(result, ConflictDiagnostic{
			Signal:      conflict.Signal,
			Preferred:   sourceOf(conflict.Preferred),
			Alternative: sourceOf(conflict.Alternative),
		})
	}
	return field
}

func missingDecision[T comparable](rule AuthorityRule, result *Observation) schema.Field[T] {
	appendDecision(result, rule, SourceUnknown, schema.FreshnessMissing, false)
	return schema.MissingField[T]()
}

func playerVehicleIndex(vehicles []VehicleObservation) int {
	for index := range vehicles {
		if player, present := vehicles[index].Player.Value(); present && player {
			return index
		}
	}
	return -1
}

func ageVehicleGrid(elapsed time.Duration, updated monotonicStamp, sourceTime schema.Field[time.Duration], input []VehicleObservation) []VehicleObservation {
	if len(input) == 0 {
		return nil
	}
	result := make([]VehicleObservation, len(input))
	forceStale := fieldAt(elapsed, updated, defaultFreshnessLimit, sourceTime).Freshness() == schema.FreshnessStale
	for index, row := range input {
		row.DriverName = ageGridField(elapsed, updated, forceStale, row.DriverName)
		row.VehicleName = ageGridField(elapsed, updated, forceStale, row.VehicleName)
		row.VehicleClass = ageGridField(elapsed, updated, forceStale, row.VehicleClass)
		row.Player = ageGridField(elapsed, updated, forceStale, row.Player)
		row.Position = ageGridField(elapsed, updated, forceStale, row.Position)
		row.CompletedLaps = ageGridField(elapsed, updated, forceStale, row.CompletedLaps)
		row.Sector = ageGridField(elapsed, updated, forceStale, row.Sector)
		row.LapDistance = ageGridField(elapsed, updated, forceStale, row.LapDistance)
		row.LapProgressTime = ageGridField(elapsed, updated, forceStale, row.LapProgressTime)
		row.BestLapTime = ageGridField(elapsed, updated, forceStale, row.BestLapTime)
		row.LastLapTime = ageGridField(elapsed, updated, forceStale, row.LastLapTime)
		row.EstimatedLapTime = ageGridField(elapsed, updated, forceStale, row.EstimatedLapTime)
		row.InPit = ageGridField(elapsed, updated, forceStale, row.InPit)
		row.PitStopCount = ageGridField(elapsed, updated, forceStale, row.PitStopCount)
		row.PenaltyCount = ageGridField(elapsed, updated, forceStale, row.PenaltyCount)
		row.TimeBehindLeader = ageGridField(elapsed, updated, forceStale, row.TimeBehindLeader)
		row.LapsBehindLeader = ageGridField(elapsed, updated, forceStale, row.LapsBehindLeader)
		row.TimeBehindNext = ageGridField(elapsed, updated, forceStale, row.TimeBehindNext)
		row.LapsBehindNext = ageGridField(elapsed, updated, forceStale, row.LapsBehindNext)
		row.LapNumber = ageGridField(elapsed, updated, forceStale, row.LapNumber)
		row.Gear = ageGridField(elapsed, updated, forceStale, row.Gear)
		row.EngineRPM = ageGridField(elapsed, updated, forceStale, row.EngineRPM)
		row.SpeedMPS = ageGridField(elapsed, updated, forceStale, row.SpeedMPS)
		row.Throttle = ageGridField(elapsed, updated, forceStale, row.Throttle)
		row.Brake = ageGridField(elapsed, updated, forceStale, row.Brake)
		row.Clutch = ageGridField(elapsed, updated, forceStale, row.Clutch)
		row.Fuel = ageGridField(elapsed, updated, forceStale, row.Fuel)
		row.DeltaBest = ageGridField(elapsed, updated, forceStale, row.DeltaBest)
		row.WorldPosition = ageGridField(elapsed, updated, forceStale, row.WorldPosition)
		row.LocalVelocity = ageGridField(elapsed, updated, forceStale, row.LocalVelocity)
		row.Orientation = ageGridField(elapsed, updated, forceStale, row.Orientation)
		row.Damage = ageGridField(elapsed, updated, forceStale, row.Damage)
		result[index] = row
	}
	return result
}

func ageGridField[T comparable](elapsed time.Duration, updated monotonicStamp, forceStale bool, field schema.Field[T]) schema.Field[T] {
	field = fieldAt(elapsed, updated, defaultFreshnessLimit, field)
	if forceStale && hasValue(field) && field.Freshness() != schema.FreshnessInvalid {
		return copyFreshness(field, schema.FreshnessStale)
	}
	return field
}

func orderDecisions(result *Observation) {
	existing := make(map[catalog.SignalID]FieldDecision, len(result.Decisions))
	for _, decision := range result.Decisions {
		existing[decision.Signal] = decision
	}
	ordered := make([]FieldDecision, 0, len(authorityMatrixV4))
	for _, rule := range authorityMatrixV4 {
		decision, ok := existing[rule.Signal]
		if !ok {
			decision = inferredDecision(*result, rule)
		}
		ordered = append(ordered, decision)
	}
	result.Decisions = ordered
}

func inferredDecision(result Observation, rule AuthorityRule) FieldDecision {
	switch rule.Signal {
	case catalog.SignalIdentityDriverName:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[identity.DriverName] { return row.DriverName })
	case catalog.SignalVehicleName:
		if len(result.Vehicles) > 0 {
			return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[vehicle.VehicleName] { return row.VehicleName })
		}
		return decisionFromField(rule, result.VehicleName)
	case catalog.SignalPitInPit:
		return decisionFromField(rule, result.InPit)
	case catalog.SignalSessionLapNumber:
		return decisionFromField(rule, result.LapNumber)
	case catalog.SignalVehicleGear:
		return decisionFromField(rule, result.Gear)
	case catalog.SignalVehicleEngineRPM:
		return decisionFromField(rule, result.EngineRPM)
	case catalog.SignalVehicleSpeedMPS:
		return decisionFromField(rule, result.SpeedMPS)
	case catalog.SignalControlsThrottle:
		return decisionFromField(rule, result.Throttle)
	case catalog.SignalControlsBrake:
		return decisionFromField(rule, result.Brake)
	case catalog.SignalControlsClutch:
		return decisionFromField(rule, result.Clutch)
	case catalog.SignalSessionEndTime:
		return decisionFromField(rule, result.EndTime)
	case catalog.SignalSessionMaximumLaps:
		return decisionFromField(rule, result.MaximumLaps)
	case catalog.SignalVehicleClass:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.VehicleClass] { return row.VehicleClass })
	case catalog.SignalStandingsSector:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.Sector] { return row.Sector })
	case catalog.SignalStandingsLapDistance:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.LapDistance] { return row.LapDistance })
	case catalog.SignalStandingsLapProgressTime:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.LapProgressTime] { return row.LapProgressTime })
	case catalog.SignalStandingsBestLapTime:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.LapTime] { return row.BestLapTime })
	case catalog.SignalStandingsLastLapTime:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.LapTime] { return row.LastLapTime })
	case catalog.SignalStandingsEstimatedLapTime:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.LapTime] { return row.EstimatedLapTime })
	case catalog.SignalStandingsPenaltyCount:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.PenaltyCount] { return row.PenaltyCount })
	case catalog.SignalStandingsTimeBehindLeader:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.TimeGap] { return row.TimeBehindLeader })
	case catalog.SignalStandingsLapsBehindLeader:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.LapGap] { return row.LapsBehindLeader })
	case catalog.SignalStandingsTimeBehindNext:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.TimeGap] { return row.TimeBehindNext })
	case catalog.SignalStandingsLapsBehindNext:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[standings.LapGap] { return row.LapsBehindNext })
	case catalog.SignalEnergyFuelAmount, catalog.SignalEnergyFuelCapacity:
		return decisionFromField(rule, result.Fuel)
	case catalog.SignalSpatialPosition:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[spatial.Position] { return row.WorldPosition })
	case catalog.SignalSpatialOrientation:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[spatial.Orientation] { return row.Orientation })
	case catalog.SignalSpatialLocalVelocity:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[spatial.LocalVelocity] { return row.LocalVelocity })
	case catalog.SignalSessionNativeDeltaBest:
		return gridDecision(rule, result.Vehicles, func(row VehicleObservation) schema.Field[session.DeltaSeconds] { return row.DeltaBest })
	default:
		return FieldDecision{Signal: rule.Signal, Source: SourceUnknown, Freshness: schema.FreshnessMissing}
	}
}

func gridDecision[T comparable](rule AuthorityRule, vehicles []VehicleObservation, field func(VehicleObservation) schema.Field[T]) FieldDecision {
	freshness := schema.FreshnessMissing
	present := false
	for _, row := range vehicles {
		candidate := field(row)
		if !hasValue(candidate) {
			continue
		}
		present = true
		if candidate.Freshness() > freshness {
			freshness = candidate.Freshness()
		}
	}
	if !present {
		return FieldDecision{Signal: rule.Signal, Source: SourceUnknown, Freshness: schema.FreshnessMissing}
	}
	return FieldDecision{Signal: rule.Signal, Source: SourceSharedMemory, Freshness: freshness}
}

func decisionFromField[T comparable](rule AuthorityRule, field schema.Field[T]) FieldDecision {
	if !hasValue(field) {
		return FieldDecision{Signal: rule.Signal, Source: SourceUnknown, Freshness: schema.FreshnessMissing}
	}
	return FieldDecision{Signal: rule.Signal, Source: SourceSharedMemory, Freshness: field.Freshness()}
}

func timedStamp[T comparable](field TimedField[T], fallback monotonicStamp) monotonicStamp {
	if field.updatedMono.set {
		return field.updatedMono
	}
	return fallback
}

func chooseSourceTime(elapsed time.Duration, rule AuthorityRule, preferred schema.Field[time.Duration], preferredAt monotonicStamp, alternative schema.Field[time.Duration], alternativeAt monotonicStamp, result *Observation) schema.Field[time.Duration] {
	return resolve(rule, result, func(shared fusion.Rule, ledger *fusion.Ledger) schema.Field[time.Duration] {
		return fusion.ChooseFunc(elapsed, shared, ledger,
			func(left, right fusion.Input[time.Duration]) bool {
				return sourceTimesDiffer(elapsed,
					left.Field, monotonicStamp{elapsed: left.At.Elapsed, set: left.At.Set},
					right.Field, monotonicStamp{elapsed: right.At.Elapsed, set: right.At.Set})
			},
			fusion.Input[time.Duration]{Slot: slotOf(rule.Preferred), Field: preferred, At: stampOf(preferredAt)},
			fusion.Input[time.Duration]{Slot: slotOf(rule.Alternative), Field: alternative, At: stampOf(alternativeAt)},
		)
	})
}

func sourceTimesDiffer(elapsed time.Duration, preferred schema.Field[time.Duration], preferredAt monotonicStamp, alternative schema.Field[time.Duration], alternativeAt monotonicStamp) bool {
	left, leftOK := projectedSourceTime(elapsed, preferred, preferredAt)
	right, rightOK := projectedSourceTime(elapsed, alternative, alternativeAt)
	if !leftOK || !rightOK {
		return true
	}
	return math.Abs(float64(left)-float64(right)) > float64(defaultFreshnessLimit)
}

func projectedSourceTime(elapsed time.Duration, field schema.Field[time.Duration], updated monotonicStamp) (time.Duration, bool) {
	value, present := field.Value()
	if !present || value < 0 || !updated.set || elapsed < updated.elapsed {
		return 0, false
	}
	age := elapsed - updated.elapsed
	if age > 0 && value > time.Duration(math.MaxInt64)-age {
		return 0, false
	}
	return value + age, true
}

func chooseField[T comparable](elapsed time.Duration, rule AuthorityRule, preferred schema.Field[T], preferredAt monotonicStamp, alternative schema.Field[T], alternativeAt monotonicStamp, result *Observation) schema.Field[T] {
	return resolve(rule, result, func(shared fusion.Rule, ledger *fusion.Ledger) schema.Field[T] {
		return fusion.Choose(elapsed, shared, ledger,
			fusion.Input[T]{Slot: slotOf(rule.Preferred), Field: preferred, At: stampOf(preferredAt)},
			fusion.Input[T]{Slot: slotOf(rule.Alternative), Field: alternative, At: stampOf(alternativeAt)},
		)
	})
}

func choosePreferredOnly[T comparable](elapsed time.Duration, rule AuthorityRule, field schema.Field[T], updated monotonicStamp, result *Observation) schema.Field[T] {
	return resolve(rule, result, func(shared fusion.Rule, ledger *fusion.Ledger) schema.Field[T] {
		return fusion.Choose(elapsed, shared, ledger,
			fusion.Input[T]{Slot: slotOf(rule.Preferred), Field: field, At: stampOf(updated)},
		)
	})
}

func fieldAt[T comparable](elapsed time.Duration, updated monotonicStamp, ttl time.Duration, field schema.Field[T]) schema.Field[T] {
	return fusion.FieldAt(elapsed, stampOf(updated), ttl, field)
}

func hasValue[T comparable](field schema.Field[T]) bool { return fusion.Present(field) }

func appendDecision(result *Observation, rule AuthorityRule, source ObservationSource, freshness schema.Freshness, fallback bool) {
	result.Decisions = append(result.Decisions, FieldDecision{Signal: rule.Signal, Source: source, Freshness: freshness, Fallback: fallback})
}

func appendConflict(result *Observation, diagnostic ConflictDiagnostic) {
	if len(result.Conflicts) < maxConflictDiagnostics {
		result.Conflicts = append(result.Conflicts, diagnostic)
	}
}
