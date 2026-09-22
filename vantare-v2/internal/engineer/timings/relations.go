package timings

import (
	"cmp"
	"math"
	"slices"

	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

// RelationState distinguishes a proved absence from insufficient evidence.
type RelationState string

const (
	RelationUnknown RelationState = "unknown"
	RelationKnown   RelationState = "known"
	RelationAbsent  RelationState = "absent"
)

// Relation retains the observation boundary independently of any spoken message.
type Relation struct {
	State         RelationState
	Context       engineer.Context
	SourceTime    float64
	VehicleID     engineer.VehicleID
	Name          engineer.Field[string]
	Class         engineer.Field[string]
	Position      int
	ClassPosition int
	DistanceM     float64
	Gap           RelationDelta
}

// RelationDelta uses negative front/positive rear for race ranks; track and
// leader gaps retain the signed relative time, including lap-wrap adjustments.
type RelationDelta struct {
	Known   bool
	Seconds float64
	Laps    int
}

// PitEntryEvidence describes InLap, never an alias for the instantaneous InPit.
type PitEntryEvidence struct {
	State      engineer.ValueState
	Provenance engineer.Provenance
	InLap      bool
}

// TrackEvidence is optional, snapshot-bound evidence. No live LMU producer is
// certified yet; missing catalog or pit-entry data must keep track gaps unknown.
type TrackEvidence struct {
	Context        engineer.Context
	SourceTime     float64
	TrackName      string
	LayoutID       string
	CatalogVersion string
	LengthM        float64
	PitEntries     map[engineer.VehicleID]PitEntryEvidence
}

// Relations is an as-of-SourceTime snapshot, not a new sample or radio event.
// Repeated observations are idempotent; freshness belongs to the input contract.
// A known rival does not imply a known time gap. AutoTrackRear describes an
// eligible automatic candidate, so its absence does not mean no car is present.
type Relations struct {
	Reason        string
	ClassPosition int
	ClassCount    int
	Leader        Relation
	RaceFront     Relation
	RaceRear      Relation
	TrackFront    Relation
	TrackRear     Relation
	AutoTrackRear Relation
}

// RelationOptions keeps the new path opt-in until the later audible cut.
type RelationOptions struct{ Enabled bool }

// RelationTracker computes relations without simulator I/O or radio side effects.
type RelationTracker struct {
	options  RelationOptions
	session  string
	context  engineer.Context
	time     float64
	geometry trackGeometry
	passages map[engineer.VehicleID]*carPassages
}

type trackGeometry struct {
	name, layout, version string
	length                float64
}
type passage struct {
	time float64
	lap  int
}
type carPassages struct {
	point                            int
	laps                             int
	distance, speed, markSpeed, time float64
	samples                          int
	marks                            map[int]passage
}

func NewRelationTracker(options RelationOptions) *RelationTracker {
	return &RelationTracker{options: options}
}

func (tracker *RelationTracker) Observe(observation engineer.ObservationV1, track *TrackEvidence) Relations {
	now, timeOK := observedValue(observation.SourceTime)
	unknown := Relation{State: RelationUnknown, Context: observation.Context, SourceTime: now}
	result := Relations{Leader: unknown, RaceFront: unknown, RaceRear: unknown, TrackFront: unknown, TrackRear: unknown, AutoTrackRear: unknown}
	if !tracker.options.Enabled {
		result.Reason = "disabled"
		return result
	}
	if !observation.Context.Complete() || !timeOK || !finite(now) || now < 0 {
		tracker.passages = nil
		result.Reason = "invalid_context_or_time"
		return result
	}
	if tracker.context.Epoch != 0 {
		boundary, err := engineer.ClassifyBoundary(tracker.context, observation.Context)
		if err != nil {
			tracker.passages = nil
			result.Reason = "invalid_boundary"
			return result
		}
		if boundary.CancelsPending() {
			tracker.passages = nil
		}
		if !boundary.CancelsPending() && now < tracker.time {
			tracker.passages = nil
			result.Reason = "time_reversed"
			return result
		}
	}
	session, sessionOK := observedValue(observation.SessionType)
	if !sessionOK || session != tracker.session {
		tracker.passages = nil
	}
	tracker.session = session
	tracker.context = observation.Context
	tracker.time = now
	present, presentOK := observedValue(observation.PlayerPresent)
	count, countOK := observedValue(observation.VehicleCount)
	if !presentOK || !present || !countOK || count != len(observation.Vehicles) || count < 1 || observation.Player.ID != observation.Context.Identity.Vehicle {
		tracker.passages = nil
		result.Reason = "incomplete_roster"
		return result
	}
	ids := map[engineer.VehicleID]bool{}
	positions := map[int]bool{}
	foundPlayer := false
	for _, car := range observation.Vehicles {
		class, co := observedValue(car.VehicleClass)
		pos, po := observedValue(car.Position)
		isPlayer, io := observedValue(car.IsPlayer)
		if car.ID == "" || ids[car.ID] || !co || class == "" || !po || pos < 1 || positions[pos] || !io || isPlayer != (car.ID == observation.Player.ID) {
			tracker.passages = nil
			result.Reason = "ambiguous_standings"
			return result
		}
		ids[car.ID] = true
		positions[pos] = true
		if isPlayer {
			if car != observation.Player {
				tracker.passages = nil
				result.Reason = "player_mismatch"
				return result
			}
			foundPlayer = true
		}
	}
	if !foundPlayer {
		tracker.passages = nil
		result.Reason = "missing_player"
		return result
	}
	absent := unknown
	absent.State = RelationAbsent
	result.RaceFront = absent
	result.RaceRear = absent
	playerClass, _ := observation.Player.VehicleClass.Value()
	var class []engineer.VehicleObservationV1
	for _, car := range observation.Vehicles {
		carClass, _ := car.VehicleClass.Value()
		if carClass == playerClass {
			class = append(class, car)
		}
	}
	slices.SortFunc(class, func(a, b engineer.VehicleObservationV1) int {
		pa, _ := a.Position.Value()
		pb, _ := b.Position.Value()
		return cmp.Compare(pa, pb)
	})
	result.ClassCount = len(class)
	for i, car := range class {
		if car.ID != observation.Player.ID {
			continue
		}
		result.ClassPosition = i + 1
		result.Leader = relationFor(observation, class[0], 1)
		if i > 0 {
			result.RaceFront = relationFor(observation, class[i-1], i)
		}
		if i+1 < len(class) {
			result.RaceRear = relationFor(observation, class[i+1], i+2)
		}
	}
	if validTrackEvidence(observation, track) {
		tracker.recordPassages(observation, *track)
		result.TrackFront = nearestOnTrack(observation, *track, false, false)
		result.TrackRear = nearestOnTrack(observation, *track, true, false)
		result.AutoTrackRear = nearestOnTrack(observation, *track, true, true)
		// CrewChief selects the nearest same-class car first, then excludes
		// the race rear. It does not fall back to the second spatial candidate.
		if result.AutoTrackRear.State == RelationKnown && result.AutoTrackRear.VehicleID == result.RaceRear.VehicleID {
			result.AutoTrackRear = absent
		}
		for _, relation := range []*Relation{&result.Leader, &result.RaceFront, &result.RaceRear, &result.TrackFront, &result.TrackRear, &result.AutoTrackRear} {
			if relation.State == RelationKnown && relation.VehicleID != observation.Player.ID {
				relative := relation == &result.Leader || relation == &result.TrackFront || relation == &result.TrackRear || relation == &result.AutoTrackRear
				relation.Gap = tracker.passageDelta(observation.Player.ID, relation.VehicleID, track.LengthM, relative)
			}
		}
		// A spatial candidate is not a proved temporal direction.
		if result.TrackFront.Gap.Known && result.TrackFront.Gap.Seconds >= 0 {
			result.TrackFront.Gap = RelationDelta{}
		}
		if result.TrackRear.Gap.Known && result.TrackRear.Gap.Seconds <= 0 {
			result.TrackRear.Gap = RelationDelta{}
		}
		if result.AutoTrackRear.Gap.Known && result.AutoTrackRear.Gap.Seconds < 0 {
			result.AutoTrackRear = absent
		}
	} else {
		tracker.passages = nil
	}
	// Class ranks outside a race are not race gaps.
	if !sessionOK || session != "race" {
		result.RaceFront, result.RaceRear, result.AutoTrackRear = unknown, unknown, unknown
		return result
	}
	for _, direction := range []struct {
		relation *Relation
		sign     float64
	}{{&result.RaceFront, -1}, {&result.RaceRear, 1}} {
		gap := &direction.relation.Gap
		if gap.Known {
			gap.Seconds = direction.sign * math.Abs(gap.Seconds)
			gap.Laps = int(direction.sign) * int(math.Abs(float64(gap.Laps)))
		}
	}
	// A zero/unavailable game gap cannot silently fall back to derived history.
	if result.ClassCount == len(observation.Vehicles) && result.RaceFront.State == RelationKnown {
		for _, car := range observation.Vehicles {
			if car.ID != result.RaceFront.VehicleID {
				continue
			}
			p, pk := observedValue(observation.Player.CompletedLaps)
			r, rk := observedValue(car.CompletedLaps)
			sameLap := pk && rk && p >= 0 && r >= 0 && p == r
			if pk && rk && p >= 0 && r >= 0 && p != r && validTrackEvidence(observation, track) {
				pd, pdok := observedValue(observation.Player.LapDistance)
				rd, rdok := observedValue(car.LapDistance)
				sameLap = pdok && rdok && finite(pd) && finite(rd) && pd >= 0 && rd >= 0 && pd < track.LengthM && rd < track.LengthM && signedRaceLaps(p, r, pd, rd, track.LengthM) == 0
			}
			if sameLap {
				result.RaceFront.Gap = RelationDelta{}
				if gap, ok := observedValue(observation.Player.TimeBehindNext); ok && finite(gap) {
					result.RaceFront.Gap = RelationDelta{Known: true, Seconds: -math.Abs(gap)}
				}
			} else if !pk || !rk || p < 0 || r < 0 {
				result.RaceFront.Gap = RelationDelta{}
			}
		}
	}
	return result
}

// Conservative synthetic T1 continuity limits, not CrewChief defaults.
// Real acquisition must validate them before T4.
const maxPassageSampleGap = 2.0
const maxPassageAge = 300.0

func signedRaceLaps(player, rival int, playerDistance, rivalDistance, length float64) int {
	laps := player - rival
	if math.Abs(float64(laps)*length+playerDistance-rivalDistance) < length {
		if laps > 0 {
			laps--
		} else if laps < 0 {
			laps++
		}
	}
	return laps
}

// recordPassages keeps only measured point intervals. Unlike CrewChief's
// initial fill/interpolation, unseen points are never asserted as passed.
func (tracker *RelationTracker) recordPassages(obs engineer.ObservationV1, track TrackEvidence) {
	geometry := trackGeometry{track.TrackName, track.LayoutID, track.CatalogVersion, track.LengthM}
	if tracker.geometry != geometry {
		tracker.passages = nil
		tracker.geometry = geometry
	}
	if tracker.passages == nil {
		tracker.passages = map[engineer.VehicleID]*carPassages{}
	}
	now, _ := obs.SourceTime.Value()
	seen := map[engineer.VehicleID]bool{}
	for _, car := range obs.Vehicles {
		seen[car.ID] = true
		d, dk := observedValue(car.LapDistance)
		laps, lk := observedValue(car.CompletedLaps)
		speed, sk := observedValue(car.Speed)
		if !dk || !lk || !sk || !finite(d) || !finite(speed) || d < 0 || d >= track.LengthM || laps < 0 || speed <= 0 {
			delete(tracker.passages, car.ID)
			continue
		}
		h := tracker.passages[car.ID]
		if h != nil {
			advance := float64(laps-h.laps)*track.LengthM + d - h.distance
			// Conservative plausibility envelope: one point plus twice the
			// maximum endpoint speed over the observed interval. This rejects
			// discontinuities; it does not reconstruct motion or certify LMU.
			maxAdvance := 20 + 2*math.Max(speed, h.speed)*(now-h.time)
			if !finite(maxAdvance) || laps < h.laps || laps-h.laps > 1 || advance < 0 || advance >= track.LengthM/2 || advance > maxAdvance || now-h.time > maxPassageSampleGap || (now == h.time && advance != 0) || (now > h.time && advance == 0 && speed >= 5) {
				h = nil
			}
		}
		point := int(d / 20)
		if h == nil {
			// First snapshot locates the car, but witnesses no crossing.
			tracker.passages[car.ID] = &carPassages{point: point, laps: laps, distance: d, speed: speed, time: now, samples: 1, marks: map[int]passage{}}
			continue
		}
		if now == h.time {
			continue
		}
		crossed := point != h.point
		stamp := now
		if crossed {
			meanSpeed := speed
			if h.markSpeed > 0 {
				meanSpeed = (speed + h.markSpeed) / 2
			}
			if meanSpeed >= 0.5 {
				stamp -= (d - float64(point)*20) / meanSpeed
			}
			// Never extrapolate a crossing outside the observed interval.
			if stamp < h.time || !finite(stamp) {
				delete(tracker.passages, car.ID)
				continue
			}
		}
		_, alreadyMeasured := h.marks[point]
		if crossed || (speed < 5 && alreadyMeasured) {
			h.marks[point] = passage{stamp, laps}
			h.markSpeed = speed
		}
		for index, mark := range h.marks {
			if mark.lap < laps-1 || now-mark.time > maxPassageAge {
				delete(h.marks, index)
			}
		}
		h.samples++
		h.point = point
		h.laps = laps
		h.distance = d
		h.speed = speed
		h.time = now
	}
	for id := range tracker.passages {
		if !seen[id] {
			delete(tracker.passages, id)
		}
	}
}

func (tracker *RelationTracker) passageDelta(player, rival engineer.VehicleID, length float64, relative bool) RelationDelta {
	p, r := tracker.passages[player], tracker.passages[rival]
	if p == nil || r == nil || p.samples < 2 || r.samples < 2 {
		return RelationDelta{}
	}
	distance := float64(p.laps-r.laps)*length + p.distance - r.distance
	point, other := p.point, r.point
	if distance >= 0 {
		point, other = r.point, p.point
	}
	pmark, pok := p.marks[point]
	rmark, rok := r.marks[point]
	if !pok || !rok {
		return RelationDelta{}
	}
	seconds := rmark.time - pmark.time
	var laps int
	if relative {
		laps = int(distance / length)
		pother, po := p.marks[other]
		rother, ro := r.marks[other]
		if !po || !ro {
			return RelationDelta{}
		}
		reverse := rother.time - pother.time
		if math.Abs(reverse) < math.Abs(seconds) {
			seconds = reverse
			if distance < 0 {
				laps--
			} else {
				laps++
			}
		}
	} else {
		laps = signedRaceLaps(p.laps, r.laps, p.distance, r.distance, length)
	}

	if !finite(seconds) {
		return RelationDelta{}
	}
	return RelationDelta{Known: true, Seconds: seconds, Laps: laps}
}

func validTrackEvidence(obs engineer.ObservationV1, track *TrackEvidence) bool {
	name, ok := observedValue(obs.TrackName)
	now, _ := obs.SourceTime.Value()
	return track != nil && ok && name != "" && name == track.TrackName && track.Context == obs.Context && track.SourceTime == now && track.LayoutID != "" && track.CatalogVersion != "" && finite(track.LengthM) && track.LengthM >= 20 && track.LengthM <= 100000
}

func nearestOnTrack(obs engineer.ObservationV1, track TrackEvidence, behind, sameClass bool) Relation {
	now, _ := obs.SourceTime.Value()
	unknown := Relation{State: RelationUnknown, Context: obs.Context, SourceTime: now}
	best := unknown
	best.State = RelationAbsent
	playerDistance, pok := observedValue(obs.Player.LapDistance)
	playerClass, _ := obs.Player.VehicleClass.Value()
	if !pok || !finite(playerDistance) || playerDistance < 0 || playerDistance >= track.LengthM {
		return unknown
	}
	bestDistance := track.LengthM
	ambiguous := false
	for _, car := range obs.Vehicles {
		if car.ID == obs.Player.ID {
			continue
		}
		class, _ := car.VehicleClass.Value()
		if sameClass && class != playerClass {
			continue
		}
		speed, sok := observedValue(car.Speed)
		entry, ek := track.PitEntries[car.ID]
		if !sok || !finite(speed) || speed < 0 || !ek || entry.State != engineer.ValueFresh || entry.Provenance != engineer.ProvenanceObserved {
			return unknown
		}
		if speed <= 0.5 || entry.InLap {
			continue
		}
		distance, dok := observedValue(car.LapDistance)
		if !dok || !finite(distance) || distance < 0 || distance >= track.LengthM {
			return unknown
		}
		if distance == playerDistance {
			continue
		}
		delta := distance - playerDistance
		if behind {
			delta = -delta
		}
		if delta < 0 {
			delta += track.LengthM
		}
		if delta == bestDistance {
			ambiguous = true
		}
		if delta < bestDistance {
			bestDistance = delta
			best = relationFor(obs, car, 0)
			best.DistanceM = delta
			ambiguous = false
		}
	}
	if ambiguous {
		return unknown
	}
	return best
}

func observedValue[T comparable](field engineer.Field[T]) (T, bool) {
	value, present := field.Value()
	return value, present && field.Usable() && field.Provenance() == engineer.ProvenanceObserved
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func relationFor(obs engineer.ObservationV1, car engineer.VehicleObservationV1, classPosition int) Relation {
	position, _ := car.Position.Value()
	now, _ := obs.SourceTime.Value()
	if classPosition == 0 {
		classPosition = 1
		class, _ := car.VehicleClass.Value()
		for _, other := range obs.Vehicles {
			oc, _ := other.VehicleClass.Value()
			op, _ := other.Position.Value()
			if oc == class && op < position {
				classPosition++
			}
		}
	}
	return Relation{State: RelationKnown, Context: obs.Context, SourceTime: now, VehicleID: car.ID, Name: car.DriverName, Class: car.VehicleClass, Position: position, ClassPosition: classPosition}
}
