package derive

import (
	"math"
	"slices"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

const (
	// MaxSelfDeltaSamples bounds the private interpolation history to 30 minutes
	// at the canonical 10 Hz sampling rate.
	MaxSelfDeltaSamples = 18_000
	// MaxSelfDeltaHistory is the bounded consumer-facing trend window.
	MaxSelfDeltaHistory = 120

	selfDeltaSampleInterval  = 100 * time.Millisecond
	selfDeltaWrapMinimumDrop = standings.LapDistance(100)
)

// DeltaSample is a bounded, consumer-facing delta observation. The private
// interpolation samples used to build the reference lap are never exposed.
type DeltaSample struct {
	Cursor      schema.Cursor
	CapturedAt  time.Time
	SourceTime  time.Duration
	LapDistance standings.LapDistance
	Seconds     session.DeltaSeconds
}

type SelfDelta struct {
	Freshness schema.Freshness
	Seconds   schema.Field[session.DeltaSeconds]
	Reference schema.Field[session.DeltaReference]
	History   []DeltaSample
	// PersonalBest is the simulator-provided personal reference.
	// SessionBest and PreviousLap are independently reconstructed from complete
	// valid laps observed during the current canonical session.
	PersonalBest schema.Field[session.DeltaSeconds]
	SessionBest  schema.Field[session.DeltaSeconds]
	PreviousLap  schema.Field[session.DeltaSeconds]
}

type lapSample struct {
	Lap      session.LapNumber
	Distance standings.LapDistance
	Elapsed  time.Duration
}

type selfDeltaTracker struct {
	limit int

	initialized  bool
	epoch        schema.Epoch
	session      identity.SessionID
	player       identity.VehicleID
	hasLast      bool
	lastLap      session.LapNumber
	lastDistance standings.LapDistance
	lastTime     time.Duration

	synchronized bool
	candidateOK  bool
	candidateAt  time.Duration
	candidate    []lapSample
	lastPrivate  time.Duration
	pendingWrap  bool
	pendingReset bool
	pendingAt    time.Duration

	hasReference      bool
	referenceDuration time.Duration
	reference         []lapSample
	hasPrevious       bool
	previousDuration  time.Duration
	previous          []lapSample

	history    []DeltaSample
	lastPublic time.Duration
}

func newSelfDeltaTracker(limit int) *selfDeltaTracker {
	if limit <= 0 || limit > MaxSelfDeltaSamples {
		limit = MaxSelfDeltaSamples
	}
	return &selfDeltaTracker{limit: limit}
}

func cloneSelfDeltaTracker(input *selfDeltaTracker) *selfDeltaTracker {
	if input == nil {
		return newSelfDeltaTracker(MaxSelfDeltaSamples)
	}
	result := *input
	result.candidate = slices.Clone(input.candidate)
	result.reference = slices.Clone(input.reference)
	result.previous = slices.Clone(input.previous)
	result.history = slices.Clone(input.history)
	return &result
}

func (tracker *selfDeltaTracker) Apply(header envelope.Header, observed core.ObservedState) SelfDelta {
	derived := tracker.applySelf(header, observed)
	current, found := activeDeltaVehicle(header.Identity.Vehicle, observed.Vehicles)
	if !found {
		return derived
	}
	value, present := current.DeltaBest.Value()
	if !present || current.DeltaBest.Provenance() != schema.ProvenanceObserved ||
		current.DeltaBest.Freshness() == schema.FreshnessMissing ||
		current.DeltaBest.Freshness() == schema.FreshnessInvalid ||
		!isFinite(float64(value)) || math.Abs(float64(value)) >= 10_000 {
		return derived
	}
	derived.PersonalBest = current.DeltaBest

	freshness := current.DeltaBest.Freshness()
	if freshness == schema.FreshnessFresh {
		tracker.recordSelectedDelta(header, observed.SourceTime, current.LapDistance, value)
	}
	reference, err := schema.NewField(
		session.DeltaReferenceBestCompletedPlayerLap,
		schema.ProvenanceObserved,
		freshness,
	)
	if err != nil {
		return derived
	}
	return SelfDelta{
		Freshness:    freshness,
		Seconds:      current.DeltaBest,
		Reference:    reference,
		History:      slices.Clone(tracker.history),
		PersonalBest: current.DeltaBest,
		SessionBest:  derived.SessionBest,
		PreviousLap:  derived.PreviousLap,
	}
}

func (tracker *selfDeltaTracker) applySelf(header envelope.Header, observed core.ObservedState) SelfDelta {
	if tracker.initialized && (tracker.epoch != header.Cursor.Epoch || tracker.session != header.Identity.Session) {
		limit := tracker.limit
		*tracker = *newSelfDeltaTracker(limit)
	}
	if !tracker.initialized {
		tracker.initialized = true
		tracker.epoch = header.Cursor.Epoch
		tracker.session = header.Identity.Session
		tracker.player = header.Identity.Vehicle
	}
	tracker.player = header.Identity.Vehicle
	if header.Identity.Vehicle == "" {
		tracker.invalidateCurrentLap()
		return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
	}

	current, found := activeDeltaVehicle(header.Identity.Vehicle, observed.Vehicles)
	if !found {
		tracker.invalidateCurrentLap()
		return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
	}
	input, quality := readDeltaInput(observed.SourceTime, observed.PlayerPresent, current)
	if quality != schema.FreshnessFresh {
		tracker.invalidateCurrentLap()
		if quality == schema.FreshnessInvalid {
			return tracker.output(quality, invalidDerived[session.DeltaSeconds]())
		}
		return tracker.output(quality, schema.MissingField[session.DeltaSeconds]())
	}
	if input.inPit {
		tracker.invalidateCurrentLap()
		return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
	}

	if !tracker.hasLast {
		tracker.remember(input)
		return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
	}
	lapStep := int64(input.lap) - int64(tracker.lastLap)
	if lapStep < 0 {
		// A lap regression is a session boundary that the upstream identity did
		// not represent. It invalidates a confirmed reference on every path,
		// including equal timestamps and pending distance-first wraps.
		tracker.clearReference()
	}
	if input.sourceTime == tracker.lastTime {
		if input.lap == tracker.lastLap && input.distance == tracker.lastDistance {
			if tracker.pendingWrap {
				return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
			}
			return tracker.currentDelta(header, input)
		}
		tracker.invalidateCurrentLap()
		tracker.remember(input)
		return tracker.output(schema.FreshnessInvalid, invalidDerived[session.DeltaSeconds]())
	}

	if tracker.pendingReset {
		if input.sourceTime < tracker.lastTime || input.sourceTime-tracker.pendingAt > 5*selfDeltaSampleInterval {
			tracker.invalidateCurrentLap()
			tracker.remember(input)
			return tracker.output(schema.FreshnessInvalid, invalidDerived[session.DeltaSeconds]())
		}
		switch lapStep {
		case 0:
			if input.distance < tracker.lastDistance {
				if tracker.lastDistance-input.distance < selfDeltaWrapMinimumDrop {
					tracker.rememberSourceTime(input.sourceTime)
					return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
				}
				tracker.invalidateCurrentLap()
				tracker.remember(input)
				return tracker.output(schema.FreshnessInvalid, invalidDerived[session.DeltaSeconds]())
			}
			tracker.remember(input)
			return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
		case 1:
			tracker.completeAndStartLap(tracker.pendingAt, input)
			tracker.remember(input)
			return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
		default:
			tracker.invalidateCurrentLap()
			tracker.remember(input)
			return tracker.output(schema.FreshnessInvalid, invalidDerived[session.DeltaSeconds]())
		}
	}
	switch {
	case lapStep < 0:
		tracker.invalidateCurrentLap()
		tracker.remember(input)
		return tracker.output(schema.FreshnessInvalid, invalidDerived[session.DeltaSeconds]())

	case lapStep == 0:
		if tracker.pendingWrap {
			if input.sourceTime < tracker.lastTime || input.sourceTime-tracker.pendingAt > 5*selfDeltaSampleInterval {
				tracker.invalidateCurrentLap()
				tracker.remember(input)
				return tracker.output(schema.FreshnessInvalid, invalidDerived[session.DeltaSeconds]())
			}
			if input.distance < tracker.lastDistance && tracker.lastDistance-input.distance >= selfDeltaWrapMinimumDrop {
				tracker.completeAndStartLap(tracker.pendingAt, input)
				tracker.remember(input)
				return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
			}
			if input.distance < tracker.lastDistance {
				tracker.rememberSourceTime(input.sourceTime)
			} else {
				tracker.remember(input)
			}
			return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
		}
		if input.sourceTime < tracker.lastTime {
			tracker.invalidateCurrentLap()
			tracker.remember(input)
			return tracker.output(schema.FreshnessInvalid, invalidDerived[session.DeltaSeconds]())
		}
		if input.distance < tracker.lastDistance {
			if tracker.lastDistance-input.distance < selfDeltaWrapMinimumDrop {
				tracker.rememberSourceTime(input.sourceTime)
				return tracker.currentDelta(header, input)
			}
			tracker.pendingReset = true
			tracker.pendingAt = input.sourceTime
			tracker.remember(input)
			return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
		}
		if tracker.synchronized && !tracker.appendCandidate(input) {
			tracker.invalidateCurrentLap()
			tracker.remember(input)
			return tracker.output(schema.FreshnessInvalid, invalidDerived[session.DeltaSeconds]())
		}
		tracker.remember(input)
		return tracker.currentDelta(header, input)

	case lapStep == 1 && input.sourceTime > tracker.lastTime:
		if input.distance >= tracker.lastDistance {
			tracker.pendingWrap = true
			tracker.pendingAt = input.sourceTime
			tracker.remember(input)
			return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
		}
		tracker.completeAndStartLap(input.sourceTime, input)
		tracker.remember(input)
		return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())

	default:
		tracker.invalidateCurrentLap()
		tracker.remember(input)
		return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
	}
}

func (tracker *selfDeltaTracker) recordSelectedDelta(
	header envelope.Header,
	sourceTime schema.Field[time.Duration],
	lapDistance schema.Field[standings.LapDistance],
	seconds session.DeltaSeconds,
) {
	source, sourcePresent := sourceTime.Value()
	distance, distancePresent := lapDistance.Value()
	if !sourcePresent || !distancePresent || sourceTime.Freshness() != schema.FreshnessFresh ||
		lapDistance.Freshness() != schema.FreshnessFresh {
		return
	}
	last := len(tracker.history) - 1
	sameCursor := last >= 0 && tracker.history[last].Cursor == header.Cursor
	if !sameCursor && tracker.lastPublic != 0 && source-tracker.lastPublic < selfDeltaSampleInterval {
		return
	}
	sample := DeltaSample{
		Cursor:      header.Cursor,
		CapturedAt:  header.Clock.ReceivedUTC,
		SourceTime:  source,
		LapDistance: distance,
		Seconds:     seconds,
	}
	if sameCursor {
		tracker.history[last] = sample
	} else {
		tracker.history = append(tracker.history, sample)
	}
	if overflow := len(tracker.history) - MaxSelfDeltaHistory; overflow > 0 {
		tracker.history = slices.Clone(tracker.history[overflow:])
	}
	tracker.lastPublic = source
}

func (tracker *selfDeltaTracker) completeAndStartLap(boundary time.Duration, input selfDeltaInput) {
	tracker.completeCandidate(boundary)
	tracker.synchronized = true
	tracker.candidateOK = true
	tracker.candidateAt = boundary
	tracker.lastPrivate = input.sourceTime
	tracker.pendingWrap = false
	tracker.pendingReset = false
	tracker.pendingAt = 0
	tracker.candidate = []lapSample{{
		Lap: input.lap, Distance: input.distance, Elapsed: input.sourceTime - boundary,
	}}
}

type selfDeltaInput struct {
	lap        session.LapNumber
	distance   standings.LapDistance
	sourceTime time.Duration
	inPit      bool
}

func readDeltaInput(
	sourceTime schema.Field[time.Duration],
	playerPresent schema.Field[bool],
	vehicle core.VehicleState,
) (selfDeltaInput, schema.Freshness) {
	present, presentOK := observedBool(playerPresent)
	player, playerOK := observedBool(vehicle.Player)
	if !presentOK || !present || !playerOK || !player {
		return selfDeltaInput{}, schema.FreshnessMissing
	}
	fields := []fieldQuality{
		qualityOf(sourceTime),
		qualityOf(vehicle.LapNumber),
		qualityOf(vehicle.LapDistance),
		qualityOf(vehicle.InPit),
	}
	quality := schema.FreshnessFresh
	for _, current := range fields {
		if current.freshness == schema.FreshnessInvalid || (current.present && current.provenance != schema.ProvenanceObserved) {
			return selfDeltaInput{}, schema.FreshnessInvalid
		}
		if !current.present || current.freshness == schema.FreshnessMissing {
			quality = schema.FreshnessMissing
		} else if current.freshness == schema.FreshnessStale && quality == schema.FreshnessFresh {
			quality = schema.FreshnessStale
		}
	}
	if quality != schema.FreshnessFresh {
		return selfDeltaInput{}, quality
	}
	source, _ := sourceTime.Value()
	lap, _ := vehicle.LapNumber.Value()
	distance, _ := vehicle.LapDistance.Value()
	inPit, _ := vehicle.InPit.Value()
	if source < 0 || lap < 0 || float64(distance) < 0 || !isFinite(float64(distance)) {
		return selfDeltaInput{}, schema.FreshnessInvalid
	}
	return selfDeltaInput{lap: lap, distance: distance, sourceTime: source, inPit: bool(inPit)}, schema.FreshnessFresh
}

type fieldQuality struct {
	freshness  schema.Freshness
	provenance schema.Provenance
	present    bool
}

func qualityOf[T comparable](field schema.Field[T]) fieldQuality {
	_, present := field.Value()
	return fieldQuality{freshness: field.Freshness(), provenance: field.Provenance(), present: present}
}

func activeDeltaVehicle(id identity.VehicleID, vehicles []core.VehicleState) (core.VehicleState, bool) {
	for _, current := range vehicles {
		if current.Identity.Vehicle == id {
			return current, true
		}
	}
	return core.VehicleState{}, false
}

func (tracker *selfDeltaTracker) appendCandidate(input selfDeltaInput) bool {
	if !tracker.candidateOK {
		return false
	}
	if input.sourceTime-tracker.lastPrivate < selfDeltaSampleInterval {
		return true
	}
	sample := lapSample{
		Lap:      input.lap,
		Distance: input.distance,
		Elapsed:  input.sourceTime - tracker.candidateAt,
	}
	last := len(tracker.candidate) - 1
	if last >= 0 && tracker.candidate[last].Distance == sample.Distance {
		tracker.candidate[last] = sample
		tracker.lastPrivate = input.sourceTime
		return true
	}
	if len(tracker.candidate) >= tracker.limit {
		return false
	}
	tracker.candidate = append(tracker.candidate, sample)
	tracker.lastPrivate = input.sourceTime
	return true
}

func (tracker *selfDeltaTracker) completeCandidate(boundary time.Duration) {
	if !tracker.synchronized || !tracker.candidateOK || len(tracker.candidate) < 2 {
		return
	}
	duration := boundary - tracker.candidateAt
	if duration <= 0 {
		return
	}
	tracker.hasPrevious = true
	tracker.previousDuration = duration
	tracker.previous = slices.Clone(tracker.candidate)
	if !tracker.hasReference || duration < tracker.referenceDuration {
		tracker.hasReference = true
		tracker.referenceDuration = duration
		tracker.reference = slices.Clone(tracker.candidate)
		tracker.history = nil
		tracker.lastPublic = 0
	}
}

func (tracker *selfDeltaTracker) currentDelta(header envelope.Header, input selfDeltaInput) SelfDelta {
	if !tracker.synchronized || !tracker.hasReference || !tracker.candidateOK {
		return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
	}
	referenceElapsed, ok := interpolateReference(tracker.reference, input.distance)
	if !ok {
		return tracker.output(schema.FreshnessMissing, schema.MissingField[session.DeltaSeconds]())
	}
	currentElapsed := input.sourceTime - tracker.candidateAt
	delta := currentElapsed - referenceElapsed
	seconds := float64(delta) / float64(time.Second)
	if !isFinite(seconds) {
		return tracker.output(schema.FreshnessInvalid, invalidDerived[session.DeltaSeconds]())
	}
	value := session.DeltaSeconds(seconds)
	if tracker.lastPublic == 0 || input.sourceTime-tracker.lastPublic >= selfDeltaSampleInterval {
		tracker.history = append(tracker.history, DeltaSample{
			Cursor: header.Cursor, CapturedAt: header.Clock.ReceivedUTC,
			SourceTime: input.sourceTime, LapDistance: input.distance, Seconds: value,
		})
		if overflow := len(tracker.history) - MaxSelfDeltaHistory; overflow > 0 {
			tracker.history = slices.Clone(tracker.history[overflow:])
		}
		tracker.lastPublic = input.sourceTime
	}
	result := tracker.output(schema.FreshnessFresh, mustDerived(value, schema.FreshnessFresh))
	if tracker.hasPrevious {
		if previousElapsed, previousOK := interpolateReference(tracker.previous, input.distance); previousOK {
			previousSeconds := float64(currentElapsed-previousElapsed) / float64(time.Second)
			if isFinite(previousSeconds) {
				result.PreviousLap = mustDerived(session.DeltaSeconds(previousSeconds), schema.FreshnessFresh)
			}
		}
	}
	return result
}

func interpolateReference(samples []lapSample, distance standings.LapDistance) (time.Duration, bool) {
	if len(samples) < 2 || distance < samples[0].Distance || distance > samples[len(samples)-1].Distance {
		return 0, false
	}
	index := 0
	for index+1 < len(samples) && samples[index+1].Distance < distance {
		index++
	}
	if samples[index].Distance == distance {
		return samples[index].Elapsed, true
	}
	if index+1 >= len(samples) {
		return 0, false
	}
	left, right := samples[index], samples[index+1]
	span := float64(right.Distance - left.Distance)
	if span <= 0 {
		return 0, false
	}
	ratio := float64(distance-left.Distance) / span
	interpolated := float64(left.Elapsed) + ratio*float64(right.Elapsed-left.Elapsed)
	if !isFinite(interpolated) || interpolated < math.MinInt64 || interpolated > math.MaxInt64 {
		return 0, false
	}
	return time.Duration(interpolated), true
}

func (tracker *selfDeltaTracker) output(freshness schema.Freshness, seconds schema.Field[session.DeltaSeconds]) SelfDelta {
	result := SelfDelta{
		Freshness:    freshness,
		Seconds:      seconds,
		Reference:    schema.MissingField[session.DeltaReference](),
		History:      slices.Clone(tracker.history),
		PersonalBest: schema.MissingField[session.DeltaSeconds](),
		SessionBest:  seconds,
		PreviousLap:  schema.MissingField[session.DeltaSeconds](),
	}
	if tracker.hasReference {
		result.Reference = mustDerived(session.DeltaReferenceBestCompletedPlayerLap, schema.FreshnessFresh)
	}
	return result
}

func (tracker *selfDeltaTracker) remember(input selfDeltaInput) {
	tracker.hasLast = true
	tracker.lastLap = input.lap
	tracker.lastDistance = input.distance
	tracker.lastTime = input.sourceTime
}

func (tracker *selfDeltaTracker) rememberSourceTime(source time.Duration) {
	tracker.lastTime = source
}

func (tracker *selfDeltaTracker) invalidateCurrentLap() {
	tracker.hasLast = false
	tracker.synchronized = false
	tracker.candidateOK = false
	tracker.candidate = nil
	tracker.lastPrivate = 0
	tracker.pendingWrap = false
	tracker.pendingReset = false
	tracker.pendingAt = 0
}

func (tracker *selfDeltaTracker) clearReference() {
	tracker.hasReference = false
	tracker.referenceDuration = 0
	tracker.reference = nil
	tracker.hasPrevious = false
	tracker.previousDuration = 0
	tracker.previous = nil
	tracker.history = nil
	tracker.lastPublic = 0
}
