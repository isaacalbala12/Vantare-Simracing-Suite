package telemetryanalysis

import (
	"errors"
	"math"
	"sort"
)

const SpatialContractVersion = 1

var (
	ErrSpatialInvalidInput       = errors.New("invalid spatial evidence input")
	ErrSpatialInvalidValue       = errors.New("invalid spatial evidence value")
	ErrSpatialIndexOrder         = errors.New("spatial evidence index order violation")
	ErrSpatialProgressOrder      = errors.New("spatial progress order violation")
	ErrSpatialSegmentTooShort    = errors.New("spatial lap segment too short")
	ErrSpatialLengthIncompatible = errors.New("spatial lap lengths incompatible")
	ErrSpatialTimeDiscontinuity  = errors.New("spatial time anchor discontinuity")
	ErrSpatialTimeOrder          = errors.New("spatial time anchor order violation")
	ErrSpatialTimeNotAligned     = errors.New("spatial time anchor not aligned")
	ErrSpatialTimeCoverage       = errors.New("spatial events outside time anchor coverage")
	ErrSpatialEventOrder         = errors.New("spatial lap event order violation")
	ErrSpatialBoundaryNotAligned = errors.New("spatial lap boundary not aligned")
	ErrSpatialProgressOutOfRange = errors.New("spatial progress outside lap")
	ErrSpatialInvalidLap         = errors.New("invalid spatial lap")
)

type SpatialTolerance struct {
	Version                 int     `json:"version"`
	TimeResidualSeconds     float64 `json:"time_residual_seconds"`
	BoundaryResidualSeconds float64 `json:"boundary_residual_seconds"`
	LengthRelative          float64 `json:"length_relative"`
}

const (
	spatialToleranceVersion    = 1
	spatialTimeResidualSeconds = 0.0125
	// Lap Dist is sampled causally at 10 Hz (up to 0.1 s quantization) and the
	// demonstrated GPS Time anchor has a 0.0124943 s maximum residual. V1 uses
	// 0.113 s, leaving 0.0005057 s solely for numeric representation. The
	// observed reset maximum (0.0925025 s) is evidence, not the envelope.
	spatialBoundaryResidualSeconds = 0.113
	spatialLengthRelativeTolerance = 0.003
	spatialNumericTolerance        = 1e-12
)

func DefaultSpatialTolerance() SpatialTolerance {
	return SpatialTolerance{Version: spatialToleranceVersion, TimeResidualSeconds: spatialTimeResidualSeconds,
		BoundaryResidualSeconds: spatialBoundaryResidualSeconds, LengthRelative: spatialLengthRelativeTolerance}
}

type SpatialPoint struct {
	Index   int64   `json:"index"`
	Value   float64 `json:"value"`
	Quality Quality `json:"quality"`
}

type SpatialLapEvent struct {
	Number           int64   `json:"number"`
	TimestampSeconds float64 `json:"timestamp_seconds"`
	Quality          Quality `json:"quality"`
}

type SpatialProvenance struct {
	Parser     ParserRef `json:"parser"`
	EvidenceID string    `json:"evidence_id"`
}

type SpatialInput struct {
	Provenance             SpatialProvenance `json:"provenance"`
	Tolerance              SpatialTolerance  `json:"tolerance"`
	LapDistanceFrequencyHz int               `json:"lap_distance_frequency_hz"`
	GPSTimeFrequencyHz     int               `json:"gps_time_frequency_hz"`
	LapDistance            []SpatialPoint    `json:"lap_distance"`
	GPSTime                []SpatialPoint    `json:"gps_time"`
	LapEvents              []SpatialLapEvent `json:"lap_events"`
}

type CapabilityState string

const (
	CapabilityValid        CapabilityState = "valid"
	CapabilityUnknown      CapabilityState = "unknown"
	CapabilityIncompatible CapabilityState = "incompatible"
)

type SpatialCapabilities struct {
	Boundary   CapabilityState `json:"boundary"`
	Progress   CapabilityState `json:"progress"`
	TimeAnchor CapabilityState `json:"time_anchor"`
	GPS        CapabilityState `json:"gps"`
	Geometry   CapabilityState `json:"geometry"`
	Width      CapabilityState `json:"width"`
}

type LapCompleteness string

const (
	LapPartial  LapCompleteness = "partial"
	LapComplete LapCompleteness = "complete"
)

type SpatialProgressSample struct {
	Index          int64   `json:"index"`
	DistanceMeters float64 `json:"distance_meters"`
	S              float64 `json:"s"`
}

type SpatialLap struct {
	Number       *int64                  `json:"number,omitempty"`
	StartSeconds *float64                `json:"start_seconds,omitempty"`
	EndSeconds   *float64                `json:"end_seconds,omitempty"`
	Boundary     Quality                 `json:"boundary_quality"`
	Validity     Quality                 `json:"validity"`
	Progress     Quality                 `json:"progress_quality"`
	Completeness LapCompleteness         `json:"completeness"`
	LengthMeters *float64                `json:"length_meters,omitempty"`
	Samples      []SpatialProgressSample `json:"samples"`
}

func (l SpatialLap) DistanceAt(s float64) (float64, error) {
	if !validSpatialLapSamples(l.Samples) {
		return 0, ErrSpatialInvalidLap
	}
	if !finite(s) || s < l.Samples[0].S || s > l.Samples[len(l.Samples)-1].S {
		return 0, ErrSpatialProgressOutOfRange
	}
	i := sort.Search(len(l.Samples), func(i int) bool { return l.Samples[i].S >= s })
	if i == 0 {
		return l.Samples[0].DistanceMeters, nil
	}
	if i == len(l.Samples) {
		return 0, ErrSpatialProgressOutOfRange
	}
	a, b := l.Samples[i-1], l.Samples[i]
	if b.S == a.S {
		return b.DistanceMeters, nil
	}
	ratio := (s - a.S) / (b.S - a.S)
	distance := a.DistanceMeters + ratio*(b.DistanceMeters-a.DistanceMeters)
	if !finite(distance) {
		return 0, ErrSpatialInvalidLap
	}
	return distance, nil
}

func validSpatialLapSamples(samples []SpatialProgressSample) bool {
	if len(samples) < 2 {
		return false
	}
	for i, sample := range samples {
		if !finite(sample.S) || sample.S < 0 || sample.S > 1 || !finite(sample.DistanceMeters) || sample.DistanceMeters < 0 {
			return false
		}
		if i > 0 && (sample.Index <= samples[i-1].Index || sample.S < samples[i-1].S || sample.DistanceMeters < samples[i-1].DistanceMeters) {
			return false
		}
	}
	return true
}

type SpatialEvidence struct {
	ContractVersion int                 `json:"contract_version"`
	Provenance      SpatialProvenance   `json:"provenance"`
	Tolerance       SpatialTolerance    `json:"tolerance"`
	Capabilities    SpatialCapabilities `json:"capabilities"`
	TimeIntercept   float64             `json:"time_intercept_seconds"`
	Laps            []SpatialLap        `json:"laps"`
}

func BuildSpatialEvidence(in SpatialInput) (SpatialEvidence, error) {
	if err := validateSpatialConfig(in); err != nil {
		return SpatialEvidence{}, err
	}
	intercept, err := validateTimeAnchor(in.GPSTime, in.GPSTimeFrequencyHz, in.Tolerance.TimeResidualSeconds)
	if err != nil {
		return SpatialEvidence{}, err
	}
	resets, err := validateDistances(in.LapDistance)
	if err != nil {
		return SpatialEvidence{}, err
	}
	if err := validateEvents(in.LapEvents); err != nil {
		return SpatialEvidence{}, err
	}
	if beforeCoverage(in.LapEvents[0].TimestampSeconds, in.GPSTime[0].Value) ||
		afterCoverage(in.LapEvents[len(in.LapEvents)-1].TimestampSeconds, in.GPSTime[len(in.GPSTime)-1].Value) {
		return SpatialEvidence{}, ErrSpatialTimeCoverage
	}
	lapStart := float64(in.LapDistance[0].Index)/float64(in.LapDistanceFrequencyHz) + intercept
	lapEnd := float64(in.LapDistance[len(in.LapDistance)-1].Index)/float64(in.LapDistanceFrequencyHz) + intercept
	if beforeCoverage(lapStart, in.GPSTime[0].Value) || afterCoverage(lapEnd, in.GPSTime[len(in.GPSTime)-1].Value) {
		return SpatialEvidence{}, ErrSpatialTimeCoverage
	}
	if math.Abs(in.LapEvents[0].TimestampSeconds-lapStart) > in.Tolerance.TimeResidualSeconds {
		return SpatialEvidence{}, ErrSpatialBoundaryNotAligned
	}
	if len(resets) > len(in.LapEvents)-1 {
		return SpatialEvidence{}, ErrSpatialProgressOrder
	}
	if len(resets) < len(in.LapEvents)-1 {
		return SpatialEvidence{}, ErrSpatialBoundaryNotAligned
	}
	for i, reset := range resets {
		resetTime := float64(in.LapDistance[reset].Index)/float64(in.LapDistanceFrequencyHz) + intercept
		if math.Abs(in.LapEvents[i+1].TimestampSeconds-resetTime) > in.Tolerance.BoundaryResidualSeconds {
			return SpatialEvidence{}, ErrSpatialBoundaryNotAligned
		}
	}
	starts := append([]int{0}, resets...)
	ends := append(append([]int(nil), resets...), len(in.LapDistance))
	laps := make([]SpatialLap, len(starts))
	lengths := make([]float64, len(starts))
	for i := range starts {
		if ends[i]-starts[i] < 2 {
			return SpatialEvidence{}, ErrSpatialSegmentTooShort
		}
		lengths[i] = in.LapDistance[ends[i]-1].Value - in.LapDistance[starts[i]].Value
		if lengths[i] <= 0 {
			return SpatialEvidence{}, ErrSpatialProgressOrder
		}
	}
	if len(lengths) < 4 {
		return SpatialEvidence{}, ErrSpatialSegmentTooShort
	}
	median := append([]float64(nil), lengths[1:len(lengths)-1]...)
	sort.Float64s(median)
	reference := median[len(median)/2]
	for _, length := range lengths[1 : len(lengths)-1] {
		if math.Abs(length-reference)/reference > in.Tolerance.LengthRelative {
			return SpatialEvidence{}, ErrSpatialLengthIncompatible
		}
	}
	for i := range starts {
		complete := i > 0 && i < len(starts)-1
		lap := SpatialLap{Boundary: QualityUnknown, Validity: QualityUnknown, Progress: QualityValid, Completeness: LapPartial}
		if i == 0 {
			end := in.LapEvents[1].TimestampSeconds
			lap.EndSeconds = &end
		}
		if i == len(starts)-1 {
			number := in.LapEvents[len(in.LapEvents)-1].Number
			start := in.LapEvents[len(in.LapEvents)-1].TimestampSeconds
			lap.Number, lap.StartSeconds = &number, &start
		}
		if complete {
			lap.Boundary, lap.Validity = QualityValid, QualityValid
			lap.Completeness = LapComplete
			length := lengths[i]
			lap.LengthMeters = &length
			number := in.LapEvents[i].Number
			start := in.LapEvents[i].TimestampSeconds
			lap.Number, lap.StartSeconds = &number, &start
			end := in.LapEvents[i+1].TimestampSeconds
			lap.EndSeconds = &end
		}
		base, divisor := in.LapDistance[starts[i]].Value, reference
		if complete {
			divisor = lengths[i]
		} else if i == 0 {
			base, divisor = 0, in.LapDistance[ends[i]-1].Value
		}
		for _, point := range in.LapDistance[starts[i]:ends[i]] {
			s := (point.Value - base) / divisor
			if !finite(s) || s < 0 || s > 1 {
				return SpatialEvidence{}, ErrSpatialLengthIncompatible
			}
			lap.Samples = append(lap.Samples, SpatialProgressSample{Index: point.Index, DistanceMeters: point.Value, S: s})
		}
		laps[i] = lap
	}
	return SpatialEvidence{
		ContractVersion: SpatialContractVersion, Provenance: in.Provenance, Tolerance: in.Tolerance, TimeIntercept: intercept, Laps: laps,
		Capabilities: SpatialCapabilities{Boundary: CapabilityValid, Progress: CapabilityValid, TimeAnchor: CapabilityValid, GPS: CapabilityUnknown, Geometry: CapabilityUnknown, Width: CapabilityIncompatible},
	}, nil
}

func validateSpatialConfig(in SpatialInput) error {
	t := in.Tolerance
	defaults := DefaultSpatialTolerance()
	if in.Provenance.Parser.ID == "" || in.Provenance.Parser.Version == "" || in.Provenance.EvidenceID == "" ||
		in.LapDistanceFrequencyHz <= 0 || in.GPSTimeFrequencyHz <= 0 || len(in.LapDistance) < 2 || len(in.GPSTime) < 2 || len(in.LapEvents) < 2 ||
		t.Version != defaults.Version || !finite(t.TimeResidualSeconds) || t.TimeResidualSeconds < 0 ||
		t.TimeResidualSeconds > defaults.TimeResidualSeconds || !finite(t.BoundaryResidualSeconds) || t.BoundaryResidualSeconds < 0 ||
		t.BoundaryResidualSeconds > defaults.BoundaryResidualSeconds || !finite(t.LengthRelative) || t.LengthRelative < 0 ||
		t.LengthRelative > defaults.LengthRelative {
		return ErrSpatialInvalidInput
	}
	return nil
}

func validateTimeAnchor(points []SpatialPoint, hz int, tolerance float64) (float64, error) {
	var intercept float64
	for i, p := range points {
		if p.Quality != QualityValid || !finite(p.Value) {
			return 0, ErrSpatialInvalidValue
		}
		if i > 0 && (p.Index <= points[i-1].Index || p.Index-points[i-1].Index != 1) {
			return 0, ErrSpatialTimeDiscontinuity
		}
		if i > 0 && p.Value <= points[i-1].Value {
			return 0, ErrSpatialTimeOrder
		}
		intercept += p.Value - float64(p.Index)/float64(hz)
	}
	intercept /= float64(len(points))
	for _, p := range points {
		residual := p.Value - (float64(p.Index)/float64(hz) + intercept)
		if math.Abs(residual) > tolerance {
			return 0, ErrSpatialTimeNotAligned
		}
	}
	return intercept, nil
}

func validateDistances(points []SpatialPoint) ([]int, error) {
	resets := make([]int, 0)
	for i, p := range points {
		if p.Quality != QualityValid || !finite(p.Value) || p.Value < 0 {
			return nil, ErrSpatialInvalidValue
		}
		if i == 0 {
			continue
		}
		if p.Index <= points[i-1].Index || p.Index-points[i-1].Index != 1 {
			return nil, ErrSpatialIndexOrder
		}
		if p.Value < points[i-1].Value {
			resets = append(resets, i)
		}
	}
	return resets, nil
}

func validateEvents(events []SpatialLapEvent) error {
	for i, event := range events {
		if event.Quality != QualityValid || !finite(event.TimestampSeconds) || event.Number < 0 {
			return ErrSpatialInvalidValue
		}
		if i > 0 && (event.TimestampSeconds <= events[i-1].TimestampSeconds || event.Number <= events[i-1].Number) {
			return ErrSpatialEventOrder
		}
	}
	return nil
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func beforeCoverage(value, start float64) bool {
	return value < start && start-value > spatialNumericTolerance
}

func afterCoverage(value, end float64) bool {
	return value > end && value-end > spatialNumericTolerance
}
