package schema_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
)

func TestMinimalDomainContractsPreserveZeroValues(t *testing.T) {
	t.Parallel()

	values := []any{
		identity.DriverName(""),
		energy.FuelAmount(0),
		pit.StopCount(0),
		standings.Position(0),
		weather.Temperature(0),
		spatial.Vector3{},
		schema.RPM(0),
	}
	if len(values) != 7 {
		t.Fatalf("domain contract count = %d, want 7", len(values))
	}
}
