package telemetryanalysis

import (
	"errors"
	"math"
	"testing"
)

func TestBuildSpatialEvidenceValidCompleteAndPartialLaps(t *testing.T) {
	input := syntheticSpatialInput()
	result, err := BuildSpatialEvidence(input)
	if err != nil {
		t.Fatal(err)
	}

	if result.ContractVersion != SpatialContractVersion || result.Provenance.Parser.Version != LMUDuckDBParserVersion {
		t.Fatalf("provenance/version = %#v", result)
	}
	if result.Capabilities.Boundary != CapabilityValid || result.Capabilities.Progress != CapabilityValid ||
		result.Capabilities.TimeAnchor != CapabilityValid || result.Capabilities.GPS != CapabilityUnknown || result.Capabilities.Geometry != CapabilityUnknown ||
		result.Capabilities.Width != CapabilityIncompatible {
		t.Fatalf("capabilities = %#v", result.Capabilities)
	}
	if len(result.Laps) != 4 {
		t.Fatalf("laps = %d, want 4", len(result.Laps))
	}
	if result.Laps[0].Completeness != LapPartial || result.Laps[1].Completeness != LapComplete || result.Laps[2].Completeness != LapComplete || result.Laps[3].Completeness != LapPartial {
		t.Fatalf("completeness = %#v", result.Laps)
	}
	if result.Laps[0].StartSeconds != nil || result.Laps[0].LengthMeters != nil || result.Laps[0].EndSeconds == nil || result.Laps[0].Validity != QualityUnknown || result.Laps[0].Boundary != QualityUnknown ||
		result.Laps[3].StartSeconds == nil || result.Laps[3].EndSeconds != nil || result.Laps[3].LengthMeters != nil || result.Laps[3].Validity != QualityUnknown || result.Laps[3].Boundary != QualityUnknown {
		t.Fatalf("partial lap boundaries/length are not honest: %#v / %#v", result.Laps[0], result.Laps[3])
	}
	complete := result.Laps[1]
	if complete.Number == nil || *complete.Number != 2 || complete.StartSeconds == nil || *complete.StartSeconds != 0.32 || complete.EndSeconds == nil || *complete.EndSeconds != 0.62 ||
		complete.Boundary != QualityValid || complete.Validity != QualityValid || complete.Progress != QualityValid || complete.LengthMeters == nil || *complete.LengthMeters != 100 {
		t.Fatalf("complete lap = %#v", complete)
	}
	if len(complete.Samples) != 3 || complete.Samples[1].S != 0.5 || complete.Samples[2].S != 1 {
		t.Fatalf("progress = %#v", complete.Samples)
	}
	if input.LapDistance[4].Value != 50 {
		t.Fatalf("input mutated: %#v", input.LapDistance)
	}
}

func TestBuildSpatialEvidenceRejectsInvalidInputsClosed(t *testing.T) {
	tests := []struct {
		name string
		edit func(*SpatialInput)
		want error
	}{
		{"nan distance", func(in *SpatialInput) { in.LapDistance[1].Value = math.NaN() }, ErrSpatialInvalidValue},
		{"infinite gps time", func(in *SpatialInput) { in.GPSTime[1].Value = math.Inf(1) }, ErrSpatialInvalidValue},
		{"missing distance", func(in *SpatialInput) { in.LapDistance[1].Quality = QualityMissing }, ErrSpatialInvalidValue},
		{"invalid event", func(in *SpatialInput) { in.LapEvents[0].Quality = QualityInvalid }, ErrSpatialInvalidValue},
		{"duplicate index", func(in *SpatialInput) { in.LapDistance[2].Index = in.LapDistance[1].Index }, ErrSpatialIndexOrder},
		{"distance index gap", func(in *SpatialInput) { in.LapDistance[2].Index++ }, ErrSpatialIndexOrder},
		{"internal regression", func(in *SpatialInput) { in.LapDistance[4].Value = 60; in.LapDistance[5].Value = 50 }, ErrSpatialProgressOrder},
		{"short complete segment", func(in *SpatialInput) { in.LapDistance = in.LapDistance[:4]; in.LapEvents = in.LapEvents[:2] }, ErrSpatialSegmentTooShort},
		{"incompatible length", func(in *SpatialInput) { in.LapDistance[5].Value = 140 }, ErrSpatialLengthIncompatible},
		{"gps index gap", func(in *SpatialInput) { in.GPSTime[2].Index++ }, ErrSpatialTimeDiscontinuity},
		{"gps time regression", func(in *SpatialInput) { in.GPSTime[2].Value = in.GPSTime[1].Value }, ErrSpatialTimeOrder},
		{"gps not aligned", func(in *SpatialInput) { in.GPSTime[len(in.GPSTime)-1].Value += 0.02 }, ErrSpatialTimeNotAligned},
		{"event outside gps coverage", func(in *SpatialInput) { in.GPSTime = in.GPSTime[:50] }, ErrSpatialTimeCoverage},
		{"snapshot before gps coverage", func(in *SpatialInput) { in.LapEvents[0].TimestampSeconds = 0.001 }, ErrSpatialTimeCoverage},
		{"event order", func(in *SpatialInput) { in.LapEvents[1].TimestampSeconds = 9 }, ErrSpatialEventOrder},
		{"event reset mismatch", func(in *SpatialInput) { in.LapEvents[1].TimestampSeconds = 0.45 }, ErrSpatialBoundaryNotAligned},
		{"unsupported tolerance", func(in *SpatialInput) { in.Tolerance.LengthRelative = 1 }, ErrSpatialInvalidInput},
		{"missing reset", func(in *SpatialInput) {
			in.LapDistance[6].Value = 100
			in.LapDistance[7].Value = 110
			in.LapDistance[8].Value = 120
		}, ErrSpatialBoundaryNotAligned},
		{"missing event", func(in *SpatialInput) { in.LapEvents = in.LapEvents[:2] }, ErrSpatialProgressOrder},
		{"extra interior event", func(in *SpatialInput) {
			events := append([]SpatialLapEvent(nil), in.LapEvents[:2]...)
			events = append(events, SpatialLapEvent{Number: 3, TimestampSeconds: 0.45, Quality: QualityValid})
			in.LapEvents = append(events, in.LapEvents[2:]...)
			in.LapEvents[3].Number = 4
			in.LapEvents[4].Number = 5
		}, ErrSpatialBoundaryNotAligned},
		{"extra event at coverage end", func(in *SpatialInput) {
			in.LapEvents = append(in.LapEvents, SpatialLapEvent{Number: 5, TimestampSeconds: 0.94, Quality: QualityValid})
		}, ErrSpatialBoundaryNotAligned},
		{"extra event after coverage", func(in *SpatialInput) {
			in.LapEvents = append(in.LapEvents, SpatialLapEvent{Number: 5, TimestampSeconds: 1.05, Quality: QualityValid})
		}, ErrSpatialTimeCoverage},
		{"lap distance starts before gps", func(in *SpatialInput) { in.GPSTime = in.GPSTime[1:] }, ErrSpatialTimeCoverage},
		{"lap distance ends after gps", func(in *SpatialInput) { in.GPSTime = in.GPSTime[:100] }, ErrSpatialTimeCoverage},
		{"fewer than two complete segments", func(in *SpatialInput) { in.LapDistance = in.LapDistance[:8]; in.LapEvents = in.LapEvents[:3] }, ErrSpatialSegmentTooShort},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := syntheticSpatialInput()
			tt.edit(&in)
			_, err := BuildSpatialEvidence(in)
			if !errors.Is(err, tt.want) {
				t.Fatalf("error = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestBuildSpatialEvidenceBoundaryToleranceV1(t *testing.T) {
	in := syntheticSpatialInput()
	in.LapEvents[1].TimestampSeconds += 0.0926
	if _, err := BuildSpatialEvidence(in); err != nil {
		t.Fatalf("demonstrated 0.0926s residual rejected: %v", err)
	}
	in = syntheticSpatialInput()
	in.LapEvents[1].TimestampSeconds += 0.1131
	if _, err := BuildSpatialEvidence(in); !errors.Is(err, ErrSpatialBoundaryNotAligned) {
		t.Fatalf("residual above v1 envelope error = %v", err)
	}
}

func TestBuildSpatialEvidenceUsesFixedSlopeOLSIntercept(t *testing.T) {
	in := syntheticSpatialInput()
	in.GPSTime[0].Value -= 0.012
	result, err := BuildSpatialEvidence(in)
	if err != nil {
		t.Fatal(err)
	}
	want := 0.02 - 0.012/float64(len(in.GPSTime))
	if math.Abs(result.TimeIntercept-want) > 1e-12 {
		t.Fatalf("intercept=%v, want OLS mean %v", result.TimeIntercept, want)
	}

	in = syntheticSpatialInput()
	in.GPSTime[0].Value -= 0.02
	if _, err := BuildSpatialEvidence(in); !errors.Is(err, ErrSpatialTimeNotAligned) {
		t.Fatalf("anchor above envelope error=%v", err)
	}
}

func TestSpatialLapDistanceAtRejectsUnobservedPartialProgress(t *testing.T) {
	result, err := BuildSpatialEvidence(syntheticSpatialInput())
	if err != nil {
		t.Fatal(err)
	}
	first, last := result.Laps[0], result.Laps[len(result.Laps)-1]
	if first.Samples[0].S <= 0 || first.Samples[len(first.Samples)-1].S != 1 {
		t.Fatalf("first partial domain = %#v", first.Samples)
	}
	if last.Samples[0].S != 0 || last.Samples[len(last.Samples)-1].S >= 1 {
		t.Fatalf("last partial domain = %#v", last.Samples)
	}
	if _, err := first.DistanceAt(0); !errors.Is(err, ErrSpatialProgressOutOfRange) {
		t.Fatalf("first DistanceAt(0) error = %v", err)
	}
	if _, err := last.DistanceAt(1); !errors.Is(err, ErrSpatialProgressOutOfRange) {
		t.Fatalf("last DistanceAt(1) error = %v", err)
	}
}

func TestBuildSpatialEvidenceRejectsIndexOverflow(t *testing.T) {
	for _, gps := range []bool{false, true} {
		in := syntheticSpatialInput()
		points := in.LapDistance
		if gps {
			points = in.GPSTime
		}
		points[0].Index, points[1].Index = math.MaxInt64, math.MinInt64
		if gps {
			in.GPSTime = points
		} else {
			in.LapDistance = points
		}
		_, err := BuildSpatialEvidence(in)
		want := ErrSpatialIndexOrder
		if gps {
			want = ErrSpatialTimeDiscontinuity
		}
		if !errors.Is(err, want) {
			t.Fatalf("gps=%v error=%v, want %v", gps, err, want)
		}
	}
}

func TestDefaultSpatialToleranceReturnsIndependentValues(t *testing.T) {
	first := DefaultSpatialTolerance()
	first.LengthRelative = 1
	second := DefaultSpatialTolerance()
	if second.LengthRelative != spatialLengthRelativeTolerance {
		t.Fatalf("default tolerance was mutated: %#v", second)
	}
}

func TestSpatialLapProgressAtDeterministicAndBounded(t *testing.T) {
	result, err := BuildSpatialEvidence(syntheticSpatialInput())
	if err != nil {
		t.Fatal(err)
	}
	lap := result.Laps[1]
	for _, tt := range []struct{ s, want float64 }{{0, 0}, {0.25, 25}, {0.5, 50}, {1, 100}} {
		got, err := lap.DistanceAt(tt.s)
		if err != nil || got != tt.want {
			t.Fatalf("DistanceAt(%v) = %v, %v; want %v", tt.s, got, err, tt.want)
		}
	}
	for _, s := range []float64{-0.01, 1.01, math.NaN(), math.Inf(1)} {
		if _, err := lap.DistanceAt(s); !errors.Is(err, ErrSpatialProgressOutOfRange) {
			t.Fatalf("DistanceAt(%v) error = %v", s, err)
		}
	}
}

func TestSpatialLapDistanceAtRejectsFabricatedReceiver(t *testing.T) {
	tests := []SpatialLap{
		{Samples: []SpatialProgressSample{{Index: 1, S: 0, DistanceMeters: 0}, {Index: 1, S: 1, DistanceMeters: 1}}},
		{Samples: []SpatialProgressSample{{Index: math.MaxInt64, S: 0, DistanceMeters: 0}, {Index: math.MinInt64, S: 1, DistanceMeters: 1}}},
		{Samples: []SpatialProgressSample{{Index: 0, S: 0.5, DistanceMeters: 1}, {Index: 1, S: 0.4, DistanceMeters: 2}}},
		{Samples: []SpatialProgressSample{{Index: 0, S: 0, DistanceMeters: 2}, {Index: 1, S: 1, DistanceMeters: 1}}},
		{Samples: []SpatialProgressSample{{Index: 0, S: math.NaN(), DistanceMeters: 0}, {Index: 1, S: 1, DistanceMeters: 1}}},
		{Samples: []SpatialProgressSample{{Index: 0, S: 0, DistanceMeters: -math.MaxFloat64}, {Index: 1, S: 1, DistanceMeters: math.MaxFloat64}}},
	}
	for i, lap := range tests {
		if _, err := lap.DistanceAt(0.5); !errors.Is(err, ErrSpatialInvalidLap) {
			t.Fatalf("case %d error=%v", i, err)
		}
	}
}

func syntheticSpatialInput() SpatialInput {
	return SpatialInput{
		Provenance:             SpatialProvenance{Parser: ParserRef{ID: LMUDuckDBParserID, Version: LMUDuckDBParserVersion}, EvidenceID: "synthetic-ta04a"},
		Tolerance:              DefaultSpatialTolerance(),
		LapDistanceFrequencyHz: 10,
		GPSTimeFrequencyHz:     100,
		LapDistance: []SpatialPoint{
			{Index: 0, Value: 40, Quality: QualityValid}, {Index: 1, Value: 70, Quality: QualityValid}, {Index: 2, Value: 100, Quality: QualityValid},
			{Index: 3, Value: 0, Quality: QualityValid}, {Index: 4, Value: 50, Quality: QualityValid}, {Index: 5, Value: 100, Quality: QualityValid},
			{Index: 6, Value: 0, Quality: QualityValid}, {Index: 7, Value: 50, Quality: QualityValid}, {Index: 8, Value: 100, Quality: QualityValid},
			{Index: 9, Value: 0, Quality: QualityValid}, {Index: 10, Value: 30, Quality: QualityValid},
		},
		GPSTime: syntheticGPSTime(103),
		LapEvents: []SpatialLapEvent{
			{Number: 1, TimestampSeconds: 0.02, Quality: QualityValid},
			{Number: 2, TimestampSeconds: 0.32, Quality: QualityValid},
			{Number: 3, TimestampSeconds: 0.62, Quality: QualityValid},
			{Number: 4, TimestampSeconds: 0.92, Quality: QualityValid},
		},
	}
}

func syntheticGPSTime(count int) []SpatialPoint {
	points := make([]SpatialPoint, count)
	for i := range points {
		points[i] = SpatialPoint{Index: int64(i), Value: 0.02 + float64(i)/100, Quality: QualityValid}
	}
	return points
}
