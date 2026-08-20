package app

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/capability"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

// fakeObservation stands in for any driver-shaped observation type. The point
// of the test is that the composition root never names it.
type fakeObservation struct{ sequence uint64 }

type fakeMapper struct{ written int }

func (mapper *fakeMapper) WriteObservation(context.Context, fakeObservation, telemetrycore.BatchSink) error {
	mapper.written++
	return nil
}

func fakeSimulator() *TelemetrySimulator {
	descriptor := driver.Descriptor{
		ID:           "fake",
		Priority:     1,
		Capabilities: []driver.Capability{"in-memory"},
	}
	return &TelemetrySimulator{
		Descriptor: descriptor,
		Capabilities: capability.Declaration{
			Driver:    descriptor.ID,
			Supported: []capability.ID{capability.Session, capability.Standings},
			Modes:     capability.Modes{Standings: capability.StandingsOfficial},
		},
		New: func(manager telemetrycore.ManagerConfig) (telemetrycore.SimulatorRuntime, error) {
			return telemetrycore.NewSimulatorRuntime(telemetrycore.SimulatorRegistration[fakeObservation]{
				Candidates: []telemetrycore.DriverCandidate[fakeObservation]{{
					Descriptor: descriptor,
					Detect:     func(context.Context) (bool, error) { return true, nil },
					New: func() (telemetrycore.Driver[fakeObservation], error) {
						return nil, errors.New("the fake simulator is never started in this test")
					},
				}},
				Manager: manager,
				Mapper:  &fakeMapper{},
			})
		},
	}
}

// The composition root must accept a simulator whose observation type it has
// never heard of. Before ISA-372 F10 the runtime held
// *DriverManager[lmu.Observation] and *lmu.BatchMapper, so this was impossible
// by construction.
func TestCompositionRootAcceptsAnySimulatorRegistration(t *testing.T) {
	t.Parallel()

	core, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Simulator: fakeSimulator()})
	if err != nil {
		t.Fatalf("NewTelemetryCoreRuntime() error = %v", err)
	}
	supported := core.simulator.Supported()
	if len(supported) != 1 || supported[0].ID != "fake" {
		t.Fatalf("Supported() = %#v", supported)
	}
	if got := core.descriptorCapabilities; len(got) == 0 || got[0] != "in-memory" {
		t.Fatalf("descriptorCapabilities = %v", got)
	}
	if core.simulator.MapperMetrics() != (telemetrycore.MapperMetrics{}) {
		t.Fatal("a mapper without slot generations must report zeroed metrics")
	}
	if core.simulator.Unmappable(errors.New("boom")) {
		t.Fatal("a registration without a predicate must treat every error as fatal")
	}
}

func TestTelemetrySimulatorRegistrationIsValidated(t *testing.T) {
	t.Parallel()

	mismatched := fakeSimulator()
	mismatched.Capabilities.Driver = "other"
	if _, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Simulator: mismatched}); !errors.Is(err, ErrInvalidTelemetrySimulator) {
		t.Fatalf("mismatched declaration error = %v", err)
	}
	incomplete := &TelemetrySimulator{Descriptor: driver.Descriptor{ID: "fake"}}
	if _, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Simulator: incomplete}); !errors.Is(err, ErrInvalidTelemetrySimulator) {
		t.Fatalf("missing constructor error = %v", err)
	}
}

// The composition root is allowed to know which simulator is the default, but
// only in the registration file. The runtime itself must stay neutral.
func TestTelemetryRuntimeSourceNamesNoConcreteDriver(t *testing.T) {
	t.Parallel()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate test source")
	}
	source, err := os.ReadFile(filepath.Join(filepath.Dir(filename), "telemetry_core_runtime.go"))
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"drivers/lmu", "lmu.Observation", "lmu.BatchMapper", "lmu.IsUnmappableFrame"} {
		if strings.Contains(string(source), forbidden) {
			t.Fatalf("telemetry_core_runtime.go still names the LMU driver: %s", forbidden)
		}
	}
}
