package app

import (
	"context"
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetry/capability"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
)

// ErrInvalidTelemetrySimulator reports a simulator registration the
// composition root cannot use.
var ErrInvalidTelemetrySimulator = errors.New("invalid telemetry simulator configuration")

// TelemetrySimulator is one registered simulator as the composition root sees
// it: a descriptor, a capability declaration, and a constructor that erases the
// driver's observation type. The runtime holds no generic parameter and names
// no concrete driver, so registering a second simulator is a configuration
// change and not a runtime change.
type TelemetrySimulator struct {
	Descriptor   driver.Descriptor
	Capabilities capability.Declaration
	New          func(telemetrycore.ManagerConfig) (telemetrycore.SimulatorRuntime, error)
}

func (simulator *TelemetrySimulator) validate() error {
	if simulator == nil || simulator.New == nil {
		return fmt.Errorf("%w: constructor is required", ErrInvalidTelemetrySimulator)
	}
	if simulator.Descriptor.ID == "" {
		return fmt.Errorf("%w: descriptor id is required", ErrInvalidTelemetrySimulator)
	}
	if simulator.Capabilities.Driver != simulator.Descriptor.ID {
		return fmt.Errorf("%w: capability declaration belongs to %q, not %q",
			ErrInvalidTelemetrySimulator, simulator.Capabilities.Driver, simulator.Descriptor.ID)
	}
	return simulator.Capabilities.Validate()
}

// DefaultTelemetrySimulator is the LMU registration. It is the only place in
// the composition root that names a concrete driver.
func DefaultTelemetrySimulator() *TelemetrySimulator {
	descriptor := driver.Descriptor{
		ID:       lmu.DriverID,
		Priority: 100,
		Capabilities: []driver.Capability{
			lmu.CapabilitySharedMemory,
			lmu.CapabilityREST,
		},
	}
	return &TelemetrySimulator{
		Descriptor:   descriptor,
		Capabilities: lmu.Capabilities(),
		New: func(manager telemetrycore.ManagerConfig) (telemetrycore.SimulatorRuntime, error) {
			mapper := lmu.NewBatchMapper()
			return telemetrycore.NewSimulatorRuntime(telemetrycore.SimulatorRegistration[lmu.Observation]{
				Candidates: []telemetrycore.DriverCandidate[lmu.Observation]{
					{
						Descriptor: descriptor,
						Detect:     func(context.Context) (bool, error) { return true, nil },
						New:        func() (telemetrycore.Driver[lmu.Observation], error) { return lmu.New(), nil },
						Retryable:  lmu.IsRetryable,
					},
				},
				Manager: manager,
				Mapper:  mapper,
				Metrics: func() telemetrycore.MapperMetrics {
					metrics := mapper.Metrics()
					return telemetrycore.MapperMetrics{
						SlotGraceReopen:     metrics.SlotGraceReopen,
						SlotGenerationBumps: metrics.SlotGenerationBumps,
					}
				},
				Unmappable: lmu.IsUnmappableFrame,
			})
		},
	}
}
