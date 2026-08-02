package telemetryanalysis

import (
	"math"
	"testing"
)

func FuzzNormalizeLMUDuckDBContinuous(f *testing.F) {
	f.Add(float64(0), int64(0), false, false)
	f.Add(float64(1), int64(25), false, false)
	f.Add(math.NaN(), int64(0), false, false)
	f.Add(float64(0), int64(0), true, false)
	f.Add(float64(0), int64(0), false, true)

	channel := HistoricalChannel{
		ID: "lmu-duckdb/fuzz", SourceName: "Value",
		Sampling: HistoricalSampling{
			Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 50, Origin: TimeOriginUnknown,
		},
		Columns: []HistoricalColumn{{Name: "value", Type: ScalarNumber}},
	}
	f.Fuzz(func(t *testing.T, number float64, start int64, null, stale bool) {
		if start < 0 {
			start = -(start + 1)
		}
		quality := QualityValid
		if stale {
			quality = QualityStale
		}
		page, err := NormalizeLMUDuckDBPage(channel, start, []LMUDuckDBRow{{
			Values: []LMUDuckDBValue{{
				Kind: ScalarNumber, Number: number, Null: null, Quality: quality,
			}},
		}})
		if err != nil {
			t.Fatalf("NormalizeLMUDuckDBPage() error = %v", err)
		}
		if len(page.Samples) != 1 || len(page.Samples[0].Values) != 1 {
			t.Fatalf("unexpected page shape: %#v", page)
		}
		value := page.Samples[0].Values[0]
		if null && value.Quality != QualityMissing {
			t.Fatalf("null quality = %q, want missing", value.Quality)
		}
		if (math.IsNaN(number) || math.IsInf(number, 0)) && !null && value.Quality != QualityInvalid {
			t.Fatalf("non-finite quality = %q, want invalid", value.Quality)
		}
	})
}

func BenchmarkNormalizeLMUDuckDBTwoHours100Hz(b *testing.B) {
	const (
		frequency   = 100
		sessionRows = 2 * 60 * 60 * frequency
		pageRows    = 4096
	)
	channel := HistoricalChannel{
		ID: "lmu-duckdb/benchmark", SourceName: "Speed",
		Sampling: HistoricalSampling{
			Kind: SamplingContinuousImplicitFrequency, FrequencyHz: frequency, Origin: TimeOriginUnknown,
		},
		Columns: []HistoricalColumn{{Name: "value", Type: ScalarNumber}},
	}
	rows := make([]LMUDuckDBRow, pageRows)
	for index := range rows {
		rows[index] = LMUDuckDBRow{
			Values: []LMUDuckDBValue{{Kind: ScalarNumber, Number: float64(index)}},
		}
	}

	b.ReportAllocs()
	b.ReportMetric(sessionRows, "samples/op")
	for b.Loop() {
		var normalized int
		for start := 0; start < sessionRows; start += pageRows {
			count := min(pageRows, sessionRows-start)
			page, err := NormalizeLMUDuckDBPage(channel, int64(start), rows[:count])
			if err != nil {
				b.Fatal(err)
			}
			normalized += len(page.Samples)
		}
		if normalized != sessionRows {
			b.Fatalf("normalized = %d, want %d", normalized, sessionRows)
		}
	}
}
