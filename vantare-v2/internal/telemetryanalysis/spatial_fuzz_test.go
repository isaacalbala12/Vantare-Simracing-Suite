package telemetryanalysis

import (
	"math"
	"testing"
)

func FuzzBuildSpatialEvidenceRejectsInvalidSequences(f *testing.F) {
	f.Add(int64(101), 50.0)
	f.Add(int64(-1), math.NaN())
	f.Add(int64(101), math.Inf(1))
	f.Fuzz(func(t *testing.T, index int64, value float64) {
		in := syntheticSpatialInput()
		in.LapDistance[4].Index = index
		in.LapDistance[4].Value = value
		result, err := BuildSpatialEvidence(in)
		if err != nil {
			return
		}
		if !finite(value) || index <= in.LapDistance[3].Index || index >= in.LapDistance[5].Index {
			t.Fatalf("accepted invalid point index=%d value=%v", index, value)
		}
		for _, lap := range result.Laps {
			for _, sample := range lap.Samples {
				if !finite(sample.S) || sample.S < 0 || sample.S > 1 {
					t.Fatalf("invalid published progress: %#v", sample)
				}
			}
		}
	})
}

func FuzzSpatialLapDistanceAtRejectsInvalidReceiver(f *testing.F) {
	f.Add(0.0, 100.0, 0.5)
	f.Add(-math.MaxFloat64, math.MaxFloat64, 0.5)
	f.Add(math.NaN(), math.Inf(1), math.NaN())
	f.Fuzz(func(t *testing.T, first, second, s float64) {
		lap := SpatialLap{Samples: []SpatialProgressSample{
			{Index: 0, S: 0, DistanceMeters: first},
			{Index: 1, S: 1, DistanceMeters: second},
		}}
		distance, err := lap.DistanceAt(s)
		if err == nil && (!finite(distance) || distance < 0) {
			t.Fatalf("published invalid distance %v from %v/%v at %v", distance, first, second, s)
		}
	})
}

func BenchmarkBuildSpatialEvidencePaged(b *testing.B) {
	const (
		laps       = 50
		rowsPerLap = 100
		pageRows   = 4096
	)
	input := SpatialInput{
		Provenance:             SpatialProvenance{Parser: ParserRef{ID: LMUDuckDBParserID, Version: LMUDuckDBParserVersion}, EvidenceID: "synthetic-ta04a-benchmark"},
		Tolerance:              DefaultSpatialTolerance(),
		LapDistanceFrequencyHz: 10,
		GPSTimeFrequencyHz:     100,
		GPSTime:                syntheticGPSTime((laps+2)*rowsPerLap*10 + 1),
		LapEvents:              []SpatialLapEvent{{Number: 0, TimestampSeconds: 0.02, Quality: QualityValid}},
	}
	for pageStart := 0; pageStart < (laps+2)*rowsPerLap; pageStart += pageRows {
		pageEnd := min(pageStart+pageRows, (laps+2)*rowsPerLap)
		for i := pageStart; i < pageEnd; i++ {
			input.LapDistance = append(input.LapDistance, SpatialPoint{Index: int64(i), Value: float64(i % rowsPerLap), Quality: QualityValid})
			if i > 0 && i%rowsPerLap == 0 {
				input.LapEvents = append(input.LapEvents, SpatialLapEvent{Number: int64(i/rowsPerLap) + 1, TimestampSeconds: float64(i)/10 + 0.02, Quality: QualityValid})
			}
		}
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := BuildSpatialEvidence(input); err != nil {
			b.Fatal(err)
		}
	}
}
