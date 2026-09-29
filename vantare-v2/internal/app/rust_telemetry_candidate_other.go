//go:build !windows

package app

import (
	"context"
	"errors"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

var ErrRustCandidateLifecycle = errors.New("rust telemetry candidate requires Windows")

type RustTelemetryCandidateConfig struct {
	Executable              string
	Enabled                 bool
	OverlaySections         bool
	StrategyPublicTransport bool
	PerformancePolicy       performancepolicy.Policy
	Emitter                 telemetrytransport.EventEmitter
	Engineer                EngineerProjectionConsumer
}

type RustTelemetryCandidateRuntime struct{}

func NewRustTelemetryCandidateRuntime(RustTelemetryCandidateConfig) (*RustTelemetryCandidateRuntime, error) {
	return nil, ErrRustCandidateLifecycle
}

func (*RustTelemetryCandidateRuntime) Start(context.Context) error { return ErrRustCandidateLifecycle }
func (*RustTelemetryCandidateRuntime) Stop(context.Context) error  { return nil }
func (*RustTelemetryCandidateRuntime) SourceStatus() driver.SourceStatus {
	return driver.UnknownSourceStatus()
}
func (*RustTelemetryCandidateRuntime) SetPerformancePolicy(performancepolicy.Policy) {}
func (*RustTelemetryCandidateRuntime) PerformancePolicy() performancepolicy.Policy {
	return performancepolicy.Policy{}
}
func (*RustTelemetryCandidateRuntime) EmitPerformanceLevel()                {}
func (*RustTelemetryCandidateRuntime) StrategyHub() *telemetrytransport.Hub { return nil }
func (*RustTelemetryCandidateRuntime) OverlayV2Publishers() *telemetrytransport.PublisherRegistry {
	return nil
}
