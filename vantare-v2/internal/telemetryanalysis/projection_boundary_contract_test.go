package telemetryanalysis

import (
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// A bounded projection reader must preserve these different tie rules when it
// replaces the complete sorted series with boundary observations.
func TestProjectionBoundaryQueriesPreserveDuplicateTimestampRules(t *testing.T) {
	scalars := []timedMetricSample{
		{seconds: 9, value: 1, presence: strategyprojection.PresenceValid},
		{seconds: 10, value: 2, presence: strategyprojection.PresenceValid},
		{seconds: 10, value: 3, presence: strategyprojection.PresenceValid},
		{seconds: 11, value: 4, presence: strategyprojection.PresenceValid},
	}
	if value, _, ok := valueAt(scalars, 10); !ok || value != 3 {
		t.Fatal("state lookup must use the last value at an exact timestamp")
	}
	if value, _, ok := continuousValueAt(scalars, 10); !ok || value != 3 {
		t.Fatal("resource lookup must use the last value at an exact timestamp")
	}
	if value, _, ok := continuousNearestValueAt(scalars, 10, 1); !ok || value != 2 {
		t.Fatal("nearest lookup must use the first value at an exact timestamp")
	}
	if value, _, ok := continuousNearestValueAt(scalars, 10.5, 1); !ok || value != 3 {
		t.Fatal("nearest lookup must prefer the preceding value at equal distance")
	}
	if _, _, ok := continuousValueAt(scalars, 12); ok {
		t.Fatal("resource lookup must preserve the missing value outside tolerance")
	}
	vectors := []vectorMetricSample{
		{seconds: 10, values: [4]float64{1, 1, 1, 1}, presence: strategyprojection.PresenceValid},
		{seconds: 10, values: [4]float64{2, 2, 2, 2}, presence: strategyprojection.PresenceValid},
	}
	if value, _, ok := vectorValueAt(vectors, 10, 0); !ok || value[0] != 2 {
		t.Fatal("vector state lookup must use the last value at an exact timestamp")
	}
}

func TestOrderedProjectionBoundaryScanMatchesCompleteScalarSeries(t *testing.T) {
	queries := []float64{-1, 9, 10, 10.5, 11, 12, 100}
	scan, err := newOrderedProjectionBoundaryScan(queries)
	if err != nil {
		t.Fatal(err)
	}
	rows := []HistoricalSample{}
	for index, point := range []struct {
		seconds float64
		value   float64
		valid   bool
	}{{9, 1, true}, {10, 2, true}, {10, 3, true}, {10.25, 99, false}, {11, 4, true}} {
		seconds := point.seconds
		quality := QualityValid
		if !point.valid {
			quality = QualityInvalid
		}
		row := HistoricalSample{Index: int64(index), TimestampSeconds: &seconds, Values: []HistoricalValue{{
			Column: "value", Present: true, Quality: quality, Scalar: HistoricalScalar{Kind: ScalarNumber, Number: point.value},
		}}}
		rows = append(rows, row)
		_, _, usable := numericValue(row.Values)
		if !scan.accept(row, usable) {
			t.Fatal("ordered source rejected")
		}
	}
	all := timestampedSeries([]HistoricalPage{{Sampling: HistoricalSampling{Origin: TimeOriginSourceTimestamp}, Samples: rows}})
	sparseRows := scan.finish()
	if len(sparseRows) > 2*len(queries) {
		t.Fatal("boundary scan retained more than two rows per query")
	}
	sparse := timestampedSeries([]HistoricalPage{{Sampling: HistoricalSampling{Origin: TimeOriginSourceTimestamp}, Samples: sparseRows}})
	for _, query := range queries {
		state, statePresence, stateOK := valueAt(all, query)
		gotState, gotStatePresence, gotStateOK := valueAt(sparse, query)
		if state != gotState || statePresence != gotStatePresence || stateOK != gotStateOK {
			t.Fatalf("state differs at %v", query)
		}
		resource, resourcePresence, resourceOK := continuousValueAt(all, query)
		gotResource, gotResourcePresence, gotResourceOK := continuousValueAt(sparse, query)
		if resource != gotResource || resourcePresence != gotResourcePresence || resourceOK != gotResourceOK {
			t.Fatalf("resource differs at %v", query)
		}
		nearest, nearestPresence, nearestOK := continuousNearestValueAt(all, query, 1)
		gotNearest, gotNearestPresence, gotNearestOK := continuousNearestValueAt(sparse, query, 1)
		if nearest != gotNearest || nearestPresence != gotNearestPresence || nearestOK != gotNearestOK {
			t.Fatalf("nearest differs at %v", query)
		}
	}
	if !reflect.DeepEqual([]int64{sparseRows[0].Index, sparseRows[len(sparseRows)-1].Index}, []int64{0, 4}) {
		t.Fatal("boundary scan changed source order")
	}
	if scan.accept(rows[0], true) {
		t.Fatal("out-of-order timestamp accepted")
	}
	if _, err := newOrderedProjectionBoundaryScan([]float64{10, 10}); err == nil {
		t.Fatal("duplicate query accepted")
	}
}

func TestOrderedProjectionBoundaryScanMatchesCompleteVectorSeries(t *testing.T) {
	queries := []float64{10, 10.5, 11}
	scan, err := newOrderedProjectionBoundaryScan(queries)
	if err != nil {
		t.Fatal(err)
	}
	rows := make([]HistoricalSample, 0, 4)
	for index, seconds := range []float64{9, 10, 10, 11} {
		values := make([]HistoricalValue, 4)
		for wheel := range values {
			values[wheel] = HistoricalValue{Column: "wheel", Present: true, Quality: QualityValid,
				Scalar: HistoricalScalar{Kind: ScalarNumber, Number: float64(index + 1)}}
		}
		row := HistoricalSample{Index: int64(index), TimestampSeconds: &seconds, Values: values}
		rows = append(rows, row)
		_, _, usable := numericVector(values)
		if !scan.accept(row, usable) {
			t.Fatal("ordered vector source rejected")
		}
	}
	all := timestampedVectorSeries([]HistoricalPage{{Sampling: HistoricalSampling{Origin: TimeOriginSourceTimestamp}, Samples: rows}})
	sparse := timestampedVectorSeries([]HistoricalPage{{Sampling: HistoricalSampling{Origin: TimeOriginSourceTimestamp}, Samples: scan.finish()}})
	for _, query := range queries {
		want, wantPresence, wantOK := vectorValueAt(all, query, 1)
		got, gotPresence, gotOK := vectorValueAt(sparse, query, 1)
		if want != got || wantPresence != gotPresence || wantOK != gotOK {
			t.Fatalf("vector differs at %v", query)
		}
	}
}
