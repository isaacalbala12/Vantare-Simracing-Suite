package app

import (
	"context"
	"testing"
)

func TestResolveOverlayV1Emit(t *testing.T) {
	tests := []struct {
		name      string
		persisted bool
		value     string
		present   bool
		want      bool
	}{
		{name: "default off"},
		{name: "persisted rollback", persisted: true, want: true},
		{name: "diagnostic environment override", value: "1", present: true, want: true},
		{name: "malformed override stays off", value: "true", present: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := ResolveOverlayV1Emit(test.persisted, func(string) (string, bool) {
				return test.value, test.present
			})
			if got != test.want {
				t.Fatalf("ResolveOverlayV1Emit() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestOverlayV1EmissionSwitch(t *testing.T) {
	for _, test := range []struct {
		name    string
		enabled bool
		want    uint64
	}{
		{name: "off by default"},
		{name: "diagnostic rollback", enabled: true, want: 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{OverlayV1Emit: &test.enabled})
			if err != nil {
				t.Fatal(err)
			}
			if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 1)); err != nil {
				t.Fatal(err)
			}
			metrics := runtime.Metrics()
			if metrics.OverlayProjectionsPublished != test.want || metrics.Transport.SnapshotPublications != test.want {
				t.Fatalf("V1 metrics = overlay %d transport %d, want %d", metrics.OverlayProjectionsPublished, metrics.Transport.SnapshotPublications, test.want)
			}
			if got := metrics.Transport.StatusPublications; got != test.want {
				t.Fatalf("V1 status publications = %d, want %d", got, test.want)
			}
		})
	}
}
