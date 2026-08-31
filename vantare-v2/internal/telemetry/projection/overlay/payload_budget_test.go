package overlay

import (
	"encoding/json"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
)

// A full LMU grid. The hash-pinned fixture in testdata/lmu-fixture.bin carries
// exactly this many scoring rows.
const fullGrid = 44

// The reader publishes at 60 Hz (drivers/lmu/driver.go) and the runtime always
// publishes a full frame, never a delta (app/telemetry_core_runtime.go), so
// every frame pays the whole payload.
const publishHz = 60

// transportCap mirrors app/telemetrytransport.DefaultMaxPayloadBytes. It is
// duplicated rather than imported so this package keeps its dependency
// direction: a projection must not reach into the transport that carries it.
const transportCap = 256 * 1024

// budgetFraction is the share of the transport cap a full grid may occupy.
//
// Half leaves the other half for everything a frame may still grow by:
// per-vehicle signals that are still missing from the contract, longer
// histories, and the spatial poses this measurement exists to price. Crossing
// it is not an outage, it is the point where the next feature has to argue for
// its bytes instead of assuming them.
const budgetFraction = 0.5

func TestFullGridPayloadStaysWellInsideTheTransportCap(t *testing.T) {
	encoded := encodeFullGrid(t)

	perVehicle := len(encoded) / fullGrid
	perSecond := len(encoded) * publishHz
	share := float64(len(encoded)) / transportCap

	t.Logf("full grid of %d vehicles: %d bytes/frame, %d bytes/vehicle, %.1f%% of the %d KiB cap",
		fullGrid, len(encoded), perVehicle, share*100, transportCap/1024)
	t.Logf("at %d Hz with full frames only: %.2f MB/s", publishHz, float64(perSecond)/1e6)

	if share > budgetFraction {
		t.Fatalf("full grid uses %.1f%% of the transport cap, budget is %.0f%%",
			share*100, budgetFraction*100)
	}
}

// TestSpatialEncodingCostIsMeasuredNotAssumed prices the two ways of publishing
// a vehicle pose, so the choice rests on bytes rather than on intuition.
// The pose is measured as a standalone array of 44 objects rather than inlined
// into each vehicle. The difference is the per-vehicle braces, a byte or two,
// which is far below the gap between the two encodings being compared.
func TestSpatialEncodingCostIsMeasuredNotAssumed(t *testing.T) {
	baseline := len(encodeFullGrid(t))

	matrix := baseline + sizeOf(t, gridOf(rawPose{
		WorldPosition: projection.Field[spatial.Position]{
			Present: true, Value: spatial.Position{X: -487.8100280761719, Y: 12.5, Z: -482.8159484863281},
			Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
		},
		Orientation: projection.Field[spatial.Orientation]{
			Present: true, Value: spatial.Orientation{
				Row0: spatial.Vector3{X: 0.4984, Y: 0, Z: -0.8669500350952148},
				Row1: spatial.Vector3{X: 0, Y: 1, Z: 0},
				Row2: spatial.Vector3{X: 0.8669500350952148, Y: 0, Z: 0.4984},
			},
			Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
		},
	}))

	quantised := baseline + sizeOf(t, gridOf(quantisedPose{
		X: -48781, Z: -48282,
		Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
	}))

	report := func(label string, size int) float64 {
		share := float64(size) / transportCap
		t.Logf("%-24s %7d bytes/frame  %5d bytes/vehicle  %5.1f%% of cap  %.2f MB/s",
			label, size, size/fullGrid, share*100, float64(size*publishHz)/1e6)
		return share
	}

	report("baseline", baseline)
	matrixShare := report("+ position and matrix", matrix)
	quantisedShare := report("+ quantised x/z", quantised)

	if quantised >= matrix {
		t.Fatalf("quantised encoding is not cheaper: %d vs %d bytes", quantised, matrix)
	}
	if quantisedShare > budgetFraction {
		t.Fatalf("even the quantised pose breaks the budget at %.1f%%", quantisedShare*100)
	}
	if matrixShare <= budgetFraction {
		t.Logf("note: the raw matrix also fits today, at %.1f%%", matrixShare*100)
	}
}

// rawPose publishes geometry exactly as the driver holds it.
type rawPose struct {
	WorldPosition projection.Field[spatial.Position]    `json:"worldPosition"`
	Orientation   projection.Field[spatial.Orientation] `json:"orientation"`
}

// quantisedPose publishes the ground plane in centimetres, which is finer than
// anything a map can draw, and carries quality once for the pair instead of
// once per axis.
type quantisedPose struct {
	X          int32                 `json:"xCm"`
	Z          int32                 `json:"zCm"`
	Provenance projection.Provenance `json:"provenance"`
	Freshness  projection.Freshness  `json:"freshness"`
}

func gridOf[T any](pose T) []T {
	grid := make([]T, fullGrid)
	for index := range grid {
		grid[index] = pose
	}
	return grid
}

func sizeOf(t *testing.T, value any) int {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return len(encoded)
}

// encodeFullGrid projects the shared fixture and replicates its vehicle up to a
// full grid, so the measurement uses the real contract types with every field
// populated rather than a hand-built approximation.
func encodeFullGrid(t *testing.T) []byte {
	t.Helper()
	payload, err := ProjectV1(overlayInput(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(payload.Vehicles) == 0 {
		t.Fatal("fixture produced no vehicles")
	}

	vehicles := make([]VehicleV1, fullGrid)
	for index := range vehicles {
		vehicles[index] = payload.Vehicles[index%len(payload.Vehicles)]
	}
	payload.Vehicles = vehicles

	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}
