package app

import (
	"context"
	"testing"
	"time"
)

func TestShadowHasNoExternalEffects(t *testing.T) {
	fixedNow := func() time.Time { return time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC) }
	consumer := &recordingEngineerConsumer{}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Now:                   fixedNow,
		Engineer:              consumer,
		TelemetryShadowEvery:  1,
		TelemetryShadowBudget: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatal(err)
	}
	if len(consumer.observations) != 1 || len(consumer.facts) != 1 {
		t.Fatalf("shadow duplicated external Engineer delivery: observations=%d facts=%d", len(consumer.observations), len(consumer.facts))
	}
	metrics := runtime.Metrics()
	// R6a: sin produccion V1, los contadores heredados quedan en cero; el
	// shadow sigue sin efectos externos ni divergencias.
	if metrics.ProjectionsPublished != 0 || metrics.OverlayProjectionsPublished != 0 ||
		len(metrics.ShadowMismatches) != 0 || metrics.ShadowDisabled {
		t.Fatalf("shadow affected authority or diverged: %+v", metrics)
	}
}

func TestShadowReportsMismatch(t *testing.T) {
	fixedNow := func() time.Time { return time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC) }
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Now:                   fixedNow,
		TelemetryShadowEvery:  1,
		TelemetryShadowBudget: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	batch := engineerRuntimeBatch()
	authority, err := runtime.engine.Apply(context.Background(), batch)
	if err != nil {
		t.Fatal(err)
	}
	authority.Cursor.Sequence++
	runtime.shadow.observe(context.Background(), batch, authority)

	metrics := runtime.Metrics()
	if metrics.ShadowMismatches["cursor"] != 1 {
		t.Fatalf("shadow mismatch metrics = %#v, want cursor=1", metrics.ShadowMismatches)
	}
	metrics.ShadowMismatches["cursor"] = 99
	if runtime.Metrics().ShadowMismatches["cursor"] != 1 {
		t.Fatal("Metrics returned mutable shadow counters")
	}
}

func TestShadowAutoDisablesOverBudget(t *testing.T) {
	fixedNow := func() time.Time { return time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC) }
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Now:                   fixedNow,
		TelemetryShadowEvery:  1,
		TelemetryShadowBudget: time.Nanosecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Force a deterministic overrun independent of the host timer resolution.
	runtime.shadow.budget = -1
	batch := engineerRuntimeBatch()
	authority, err := runtime.engine.Apply(context.Background(), batch)
	if err != nil {
		t.Fatal(err)
	}
	runtime.shadow.observe(context.Background(), batch, authority)
	if !runtime.Metrics().ShadowDisabled {
		t.Fatal("shadow remained enabled after exceeding its budget")
	}
}
