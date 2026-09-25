package telemetryanalysis

import (
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
