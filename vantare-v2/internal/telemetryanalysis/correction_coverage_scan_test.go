package telemetryanalysis

import "testing"

func TestOrderedCoverageScanMatchesMaterializedWindow(t *testing.T) {
	sampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginSourceTimestamp}
	page := func(start int64, times ...*float64) HistoricalPage {
		result := HistoricalPage{Sampling: sampling}
		for index, seconds := range times {
			result.Samples = append(result.Samples, HistoricalSample{Index: start + int64(index), TimestampSeconds: seconds})
		}
		return result
	}
	for _, test := range []struct {
		name  string
		pages []HistoricalPage
	}{
		{name: "contiguous pages", pages: []HistoricalPage{page(0, floatPointer(100), floatPointer(100.1)), page(2, floatPointer(100.2), floatPointer(100.3))}},
		{name: "single sample", pages: []HistoricalPage{page(0, floatPointer(100))}},
		{name: "gap", pages: []HistoricalPage{page(0, floatPointer(100)), page(3, floatPointer(100.3))}},
		{name: "non monotonic clock", pages: []HistoricalPage{page(0, floatPointer(100), floatPointer(99))}},
		{name: "missing clock", pages: []HistoricalPage{page(0, floatPointer(100), nil)}},
		{name: "unordered pages", pages: []HistoricalPage{page(2, floatPointer(100.2), floatPointer(100.3)), page(0, floatPointer(100), floatPointer(100.1))}},
		{name: "wrong sampling", pages: []HistoricalPage{page(0, floatPointer(100)), {Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 5, Origin: TimeOriginSourceTimestamp}, Samples: []HistoricalSample{{Index: 1, TimestampSeconds: floatPointer(100.1)}}}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			var scan orderedCoverageScan
			ordered := true
			for _, current := range test.pages {
				if !scan.accept(current) {
					ordered = false
					break
				}
			}
			if !ordered && test.name != "unordered pages" {
				t.Fatal("unexpected unordered input")
			}
			if ordered {
				gotStart, gotEnd, gotOK := scan.finish()
				wantStart, wantEnd, wantOK := unorderedChannelCoverageWindow(test.pages)
				if gotStart != wantStart || gotEnd != wantEnd || gotOK != wantOK {
					t.Fatalf("streamed coverage = (%v, %v, %v), sorted oracle = (%v, %v, %v)", gotStart, gotEnd, gotOK, wantStart, wantEnd, wantOK)
				}
			}
			gotStart, gotEnd, gotOK := channelCoverageWindow(test.pages)
			wantStart, wantEnd, wantOK := unorderedChannelCoverageWindow(test.pages)
			if gotStart != wantStart || gotEnd != wantEnd || gotOK != wantOK {
				t.Fatalf("coverage = (%v, %v, %v), sorted oracle = (%v, %v, %v)", gotStart, gotEnd, gotOK, wantStart, wantEnd, wantOK)
			}
		})
	}
}
