package app

import (
	"errors"
	"testing"
)

func TestTelemetryCoreMetricsCounters(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}

	runtime.metricStore.dropFrame("payload-too-large")
	runtime.metricStore.publishFailure("Overlay")
	runtime.metricStore.consumerPanic("engineer.observation")
	runtime.metricStore.observePayload("Overlay", 100)
	runtime.metricStore.observePayload("Overlay", 70*1024)
	runtime.lifecycleMu.Lock()
	runtime.transitionLifecycleLocked(telemetryRuntimeStarting)
	runtime.transitionLifecycleLocked(telemetryRuntimeRunning)
	runtime.lifecycleMu.Unlock()
	runtime.failStop(errors.New("injected programming failure"))

	metrics := runtime.Metrics()
	if metrics.FramesDropped["payload-too-large"] != 1 ||
		metrics.PublishFailures["Overlay"] != 1 ||
		metrics.ConsumerPanics["engineer.observation"] != 1 ||
		metrics.FailStops != 1 {
		t.Fatalf("unexpected counters: %+v", metrics)
	}
	payload := metrics.PayloadBytes["Overlay"]
	if payload.Count != 2 || payload.P50 != 1024 || payload.P95 != 128*1024 || payload.P99 != 128*1024 {
		t.Fatalf("payload histogram = %+v", payload)
	}
	if metrics.LifecycleTransitions["new->starting"] != 1 ||
		metrics.LifecycleTransitions["starting->running"] != 1 ||
		metrics.LifecycleTransitions["running->terminal"] != 1 {
		t.Fatalf("lifecycle transitions = %+v", metrics.LifecycleTransitions)
	}

	metrics.FramesDropped["payload-too-large"] = 99
	if runtime.Metrics().FramesDropped["payload-too-large"] != 1 {
		t.Fatal("Metrics returned mutable counter state")
	}
}
