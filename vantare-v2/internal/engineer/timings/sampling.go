package timings

import (
	"errors"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"math"
	"slices"
)

// HardPart is a declared, ordered difficult section. T2 does not learn it.
type HardPart struct{ StartM, EndM float64 }

// SamplingProfileSpec requires explicit catalog identity, geometry and sectors.
// HardParts nil preserves setGapPoints; a non-nil list applies adjustGapPoints.
type SamplingProfileSpec struct {
	TrackName, LayoutID, CatalogVersion string
	LengthM                             float64
	Sectors                             int
	HardParts                           []HardPart
}

// SamplingProfile is immutable. Its zero value is invalid.
type SamplingProfile struct {
	geometry trackGeometry
	sectors  int
	points   []float64
}

func NewSamplingProfile(spec SamplingProfileSpec) (SamplingProfile, error) {
	bad := errors.New("timings sampling: invalid or ambiguous track profile")
	if spec.TrackName == "" || spec.LayoutID == "" || spec.CatalogVersion == "" || !finite(spec.LengthM) || spec.LengthM < 20 || spec.LengthM > 100000 || (spec.Sectors != 2 && spec.Sectors != 3) {
		return SamplingProfile{}, bad
	}
	for i, part := range spec.HardParts {
		if !finite(part.StartM) || !finite(part.EndM) || part.StartM < 0 || part.EndM < part.StartM || part.EndM >= spec.LengthM || (i > 0 && part.StartM <= spec.HardParts[i-1].EndM) {
			return SamplingProfile{}, bad
		}
	}
	p := SamplingProfile{geometry: trackGeometry{spec.TrackName, spec.LayoutID, spec.CatalogVersion, spec.LengthM}, sectors: spec.Sectors}
	adjust := spec.HardParts != nil && spec.LengthM > 3300
	if spec.Sectors == 2 && !adjust {
		p.points = []float64{math.RoundToEven(spec.LengthM / 2), spec.LengthM - 50}
	} else if spec.LengthM > 3300 {
		for candidate := 780.0; candidate < spec.LengthM-780; candidate += 780 {
			if adjust {
				for _, part := range spec.HardParts {
					if candidate >= part.StartM && candidate <= part.EndM {
						candidate = part.EndM
					}
				}
			}
			p.points = append(p.points, candidate)
		}
		p.points = append(p.points, spec.LengthM-50)
	}
	// The source does not recheck after a hardpart shift. Preserve its result
	// when valid; reject ambiguity instead of silently sorting/deduplicating.
	for i, point := range p.points {
		if point <= 0 || point >= spec.LengthM || (i > 0 && point <= p.points[i-1]) {
			return SamplingProfile{}, bad
		}
	}
	return p, nil
}

func (profile SamplingProfile) GapPoints() []float64 { return slices.Clone(profile.points) }

// GapSample is an admitted magnitude at the observation ending a crossing.
// SourceTime is not an interpolated crossing time or a freshness renewal.
type GapSample struct {
	Context    engineer.Context
	SourceTime float64
	VehicleID  engineer.VehicleID
	Seconds    float64
	Laps       int
}

// SampleWindow is newest-first and detached from the sampler. Admitted applies
// only to this call; an opportunity may leave it false for a duplicate gap.
type SampleWindow struct {
	VehicleID engineer.VehicleID
	Admitted  bool
	Samples   []GapSample
}

type SamplingResult struct {
	Context                            engineer.Context
	SourceTime                         float64
	Reason                             string
	Opportunity                        bool
	RaceFront, RaceRear, AutoTrackRear SampleWindow
}

type SamplingOptions struct{ Enabled bool }

// Sampler is a sequential, opt-in T2 consumer with no radio or simulator I/O.
// It retains four samples per relation, the maximum consumed by the T3 rules.
type Sampler struct {
	enabled  bool
	context  engineer.Context
	time     float64
	profile  SamplingProfile
	previous *samplingPosition
	windows  [3]SampleWindow
}

type samplingPosition struct {
	time, distance float64
	laps, sector   int
}

func NewSampler(options SamplingOptions) *Sampler { return &Sampler{enabled: options.Enabled} }

func (s *Sampler) Observe(obs engineer.ObservationV1, track *TrackEvidence, profile SamplingProfile, relations Relations) SamplingResult {
	now, timeOK := observedValue(obs.SourceTime)
	result := SamplingResult{Context: obs.Context, SourceTime: now}
	if !s.enabled {
		result.Reason = "disabled"
		return result
	}
	if !obs.Context.Complete() || !timeOK || !finite(now) || now < 0 {
		s.clear()
		result.Reason = "invalid_context_or_time"
		return result
	}
	if s.context.Epoch != 0 {
		boundary, err := engineer.ClassifyBoundary(s.context, obs.Context)
		if err != nil {
			s.clear()
			result.Reason = "invalid_boundary"
			return result
		}
		if boundary.CancelsPending() {
			s.clear()
		} else if now < s.time {
			s.clear()
			result.Reason = "time_reversed"
			return result
		}
	}
	s.context, s.time = obs.Context, now
	session, sessionOK := observedValue(obs.SessionType)
	present, presentOK := observedValue(obs.PlayerPresent)
	if !sessionOK || session != "race" || !presentOK || !present || obs.Player.ID != obs.Context.Identity.Vehicle || relations.Reason != "" {
		s.clear()
		result.Reason = "unavailable_observation"
		return result
	}
	if profile.sectors == 0 || !validTrackEvidence(obs, track) || profile.geometry != (trackGeometry{track.TrackName, track.LayoutID, track.CatalogVersion, track.LengthM}) {
		s.clear()
		result.Reason = "invalid_profile_evidence"
		return result
	}
	if profile.geometry != s.profile.geometry || profile.sectors != s.profile.sectors || !slices.Equal(profile.points, s.profile.points) {
		s.clear()
		s.profile = profile
	}
	distance, dk := observedValue(obs.Player.LapDistance)
	laps, lk := observedValue(obs.Player.CompletedLaps)
	sector, sk := observedValue(obs.Player.Sector)
	if !dk || !lk || !finite(distance) || distance < 0 || distance >= profile.geometry.length || laps < 0 || (len(profile.points) == 0 && (!sk || sector < 1 || sector > profile.sectors)) {
		s.clear()
		result.Reason = "invalid_player_position"
		return result
	}
	current := samplingPosition{now, distance, laps, sector}
	previous := s.previous
	s.previous = &current
	if previous == nil {
		result.Reason = "baseline"
	} else {
		advance := float64(laps-previous.laps)*profile.geometry.length + distance - previous.distance
		wrap := laps == previous.laps+1 && distance < previous.distance
		invalid := now-previous.time > maxPassageSampleGap || advance < 0 || advance >= profile.geometry.length/2 || laps-previous.laps > 1 || (laps != previous.laps && !wrap)
		if now == previous.time {
			if distance != previous.distance || laps != previous.laps || (len(profile.points) == 0 && sector != previous.sector) {
				invalid = true
			}
			result.Reason = "duplicate_observation"
		} else if len(profile.points) > 0 {
			if distance > 0 && distance > previous.distance && !wrap {
				for _, point := range profile.points {
					if previous.distance < point && distance >= point {
						result.Opportunity = true
						break
					}
				}
			}
		} else if sector != previous.sector {
			if (laps == previous.laps && sector == previous.sector+1) || (wrap && previous.sector == profile.sectors && sector == 1) {
				result.Opportunity = true
			} else {
				invalid = true
			}
		} else if wrap {
			invalid = true
		}
		if invalid {
			s.windows = [3]SampleWindow{}
			result.Opportunity = false
			result.Reason = "discontinuity"
		}
	}
	for i, relation := range []Relation{relations.RaceFront, relations.RaceRear, relations.AutoTrackRear} {
		s.updateWindow(i, obs, relation, result.Opportunity)
	}
	result.RaceFront = s.copyWindow(0)
	result.RaceRear = s.copyWindow(1)
	result.AutoTrackRear = s.copyWindow(2)
	return result
}

func (s *Sampler) clear() { s.previous = nil; s.windows = [3]SampleWindow{} }

func (s *Sampler) updateWindow(index int, obs engineer.ObservationV1, relation Relation, opportunity bool) {
	window := &s.windows[index]
	window.Admitted = false
	count := 0
	for _, car := range obs.Vehicles {
		if car.ID == relation.VehicleID {
			count++
		}
	}
	if relation.State != RelationKnown || relation.Context != obs.Context || relation.SourceTime != s.time || relation.VehicleID == "" || relation.VehicleID == obs.Player.ID || count != 1 || !relation.Gap.Known || !finite(relation.Gap.Seconds) {
		*window = SampleWindow{}
		return
	}
	if window.VehicleID != relation.VehicleID || (len(window.Samples) > 0 && window.Samples[0].Laps != relation.Gap.Laps) {
		*window = SampleWindow{VehicleID: relation.VehicleID}
	}
	seconds := math.Abs(relation.Gap.Seconds)
	if !opportunity || (len(window.Samples) > 0 && window.Samples[0].Seconds == seconds) {
		return
	}
	sample := GapSample{Context: obs.Context, SourceTime: s.time, VehicleID: relation.VehicleID, Seconds: seconds, Laps: relation.Gap.Laps}
	window.Samples = append([]GapSample{sample}, window.Samples...)
	if len(window.Samples) > 4 {
		window.Samples = window.Samples[:4]
	}
	window.Admitted = true
}

func (s *Sampler) copyWindow(index int) SampleWindow {
	result := s.windows[index]
	result.Samples = slices.Clone(result.Samples)
	return result
}
