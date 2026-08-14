package trackgeometry

import (
	"encoding/binary"
	"encoding/csv"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

// Scoring row layout of the hash-pinned LMU fixture, mirroring
// internal/telemetry/drivers/lmu/layout.go. Duplicated deliberately and kept
// tiny: this is an independent oracle, and reaching into the driver would let a
// layout mistake agree with itself.
const (
	scoringBase          = 2192
	scoringStride        = 584
	scoringRows          = 104
	offsetLapDistance    = 104
	offsetPlayerInPits   = 198
	offsetWorldPositionX = 264
	offsetWorldPositionZ = 264 + 16
)

// TestWorldPositionMatchesSharedMemory is the load-bearing test of this package.
//
// It takes a real recorded lap, converts it with WorldPosition, and checks the
// result against the world positions of the 44 vehicles in the hash-pinned
// shared-memory fixture for the same circuit, matched by lap distance. If the
// anchor, the scale, the axis mapping or the sign were wrong, the residual
// would explode; a silent mistake here would put every car in the wrong place
// on the map.
func TestWorldPositionMatchesSharedMemory(t *testing.T) {
	trace := loadTraceFixture(t)
	vehicles := loadSharedMemoryVehicles(t)

	byDistance := map[int]Point{}
	for _, sample := range trace {
		byDistance[int(math.Round(sample.LapDistance))] = WorldPosition(sample.Latitude, sample.Longitude)
	}

	var residuals []float64
	for _, vehicle := range vehicles {
		converted, ok := nearest(byDistance, int(math.Round(vehicle.lapDistance)), 3)
		if !ok {
			continue
		}
		residuals = append(residuals, math.Hypot(converted.X-vehicle.x, converted.Z-vehicle.z))
	}

	if len(residuals) < 5 {
		t.Fatalf("only %d vehicles could be matched by lap distance", len(residuals))
	}

	rms, worst := spread(residuals)

	// The threshold is set by physics, not by taste. Every car sits somewhere
	// across the track width relative to the single recorded line, so several
	// metres of residual are expected and legitimate. A wrong anchor, scale,
	// axis mapping or sign misses by hundreds of metres, which the companion
	// assertion below pins down.
	if rms > 8 {
		t.Fatalf("RMS = %.2f m over %d vehicles (worst %.2f m), want <= 8 m", rms, len(residuals), worst)
	}
	t.Logf("matched %d vehicles: RMS %.2f m, worst %.2f m", len(residuals), rms, worst)

	// Proves the threshold discriminates: mirroring the conversion, the single
	// most plausible way to get it wrong, must blow straight past it.
	var mirrored []float64
	for _, vehicle := range vehicles {
		converted, ok := nearest(byDistance, int(math.Round(vehicle.lapDistance)), 3)
		if !ok {
			continue
		}
		mirrored = append(mirrored, math.Hypot(-converted.X-vehicle.x, converted.Z-vehicle.z))
	}
	mirroredRMS, _ := spread(mirrored)
	if mirroredRMS <= 8 {
		t.Fatalf("a mirrored conversion still passes at %.2f m RMS; the test has no teeth", mirroredRMS)
	}
	t.Logf("mirrored conversion RMS %.2f m, correctly rejected", mirroredRMS)
}

func spread(residuals []float64) (rms, worst float64) {
	sum := 0.0
	for _, residual := range residuals {
		sum += residual * residual
		worst = math.Max(worst, residual)
	}
	return math.Sqrt(sum / float64(len(residuals))), worst
}

func TestWorldPositionAnchorIsTheOrigin(t *testing.T) {
	if got := WorldPosition(60, 0); got.X != 0 || got.Z != 0 {
		t.Fatalf("anchor maps to %+v, want the origin", got)
	}
}

func TestWorldPositionIsLinearAndUnmirrored(t *testing.T) {
	north := WorldPosition(60.001, 0)
	east := WorldPosition(60, 0.001)
	if north.Z <= 0 {
		t.Fatalf("increasing latitude must increase Z, got %+v", north)
	}
	if east.X <= 0 {
		t.Fatalf("increasing longitude must increase X, got %+v", east)
	}
	double := WorldPosition(60.002, 0)
	if math.Abs(double.Z-2*north.Z) > 1e-9 {
		t.Fatalf("conversion is not linear: %v vs %v", double.Z, 2*north.Z)
	}
}

// The trace fixture is one extracted lap, so it contains no wrap back to the
// line. Callers in that position must declare the lap length, exactly as the
// tool does from the whole session.
func fixtureOptions(trace []Sample) Options {
	options := DefaultOptions()
	options.LapLength = trace[len(trace)-1].LapDistance
	return options
}

func TestBuildProducesAClosedOutlineFromARealLap(t *testing.T) {
	trace := loadTraceFixture(t)

	result, err := Build(trace, fixtureOptions(trace))
	if err != nil {
		t.Fatal(err)
	}
	if result.Laps != 1 {
		t.Fatalf("laps = %d, want 1", result.Laps)
	}
	if result.Coverage < 0.98 {
		t.Fatalf("coverage = %.3f", result.Coverage)
	}
	// Barcelona is a little over 4.6 km. The outline is averaged onto a coarse
	// grid so it cuts corners slightly; it must not invent length.
	if result.IntegratedLength < 4400 || result.IntegratedLength > result.LapDistanceSpan*1.02 {
		t.Fatalf("integrated length = %.1f m against a %.1f m lap",
			result.IntegratedLength, result.LapDistanceSpan)
	}
	if len(result.Points) < 100 {
		t.Fatalf("outline has only %d points", len(result.Points))
	}
}

func TestBuildIsDeterministic(t *testing.T) {
	trace := loadTraceFixture(t)
	first, err := Build(trace, fixtureOptions(trace))
	if err != nil {
		t.Fatal(err)
	}
	second, err := Build(trace, fixtureOptions(trace))
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Points) != len(second.Points) {
		t.Fatalf("point counts differ: %d vs %d", len(first.Points), len(second.Points))
	}
	for index := range first.Points {
		if first.Points[index] != second.Points[index] {
			t.Fatalf("point %d differs: %+v vs %+v", index, first.Points[index], second.Points[index])
		}
	}
}

func TestBuildRejectsIncompleteAndUnusableInput(t *testing.T) {
	trace := loadTraceFixture(t)
	half := trace[:len(trace)/2]

	pitted := make([]Sample, len(trace))
	copy(pitted, trace)
	for index := range pitted {
		pitted[index].InPit = true
	}

	corrupted := make([]Sample, len(trace))
	copy(corrupted, trace)
	for index := range corrupted {
		corrupted[index].Latitude = math.NaN()
	}

	// A truncated recording only reveals itself against a known lap length: on
	// its own, half a lap reaches its own maximum and looks complete.
	known := fixtureOptions(trace)

	for name, testCase := range map[string]struct {
		samples []Sample
		options Options
	}{
		"empty":         {nil, DefaultOptions()},
		"partial lap":   {half, known},
		"entirely pits": {pitted, known},
		"non finite":    {corrupted, known},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Build(testCase.samples, testCase.options); !errors.Is(err, ErrNoCompleteLap) {
				t.Fatalf("error = %v, want ErrNoCompleteLap", err)
			}
		})
	}
}

func TestBuildRejectsAnOutlineWithGaps(t *testing.T) {
	trace := loadTraceFixture(t)
	// Remove a stretch of the lap: the run still starts at the line and reaches
	// the end, so only the coverage check can catch it.
	var holed []Sample
	for _, sample := range trace {
		if sample.LapDistance > 1500 && sample.LapDistance < 2000 {
			continue
		}
		holed = append(holed, sample)
	}
	if _, err := Build(holed, fixtureOptions(trace)); !errors.Is(err, ErrCoverageTooLow) {
		t.Fatalf("error = %v, want ErrCoverageTooLow", err)
	}
}

func TestBuildRejectsInvalidOptions(t *testing.T) {
	trace := loadTraceFixture(t)
	for name, options := range map[string]Options{
		"zero bin":         {BinMetres: 0, MinimumCoverage: 0.9},
		"negative bin":     {BinMetres: -1, MinimumCoverage: 0.9},
		"coverage above 1": {BinMetres: 10, MinimumCoverage: 1.5},
		"coverage below 0": {BinMetres: 10, MinimumCoverage: -0.1},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Build(trace, options); !errors.Is(err, ErrInvalidOptions) {
				t.Fatalf("error = %v, want ErrInvalidOptions", err)
			}
		})
	}
}

func nearest(byDistance map[int]Point, target, tolerance int) (Point, bool) {
	for offset := 0; offset <= tolerance; offset++ {
		if point, ok := byDistance[target-offset]; ok {
			return point, true
		}
		if point, ok := byDistance[target+offset]; ok {
			return point, true
		}
	}
	return Point{}, false
}

func loadTraceFixture(t testing.TB) []Sample {
	t.Helper()
	file, err := os.Open(filepath.Join("..", "..", "testdata", "lmu-barcelona-lap-trace.csv"))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	records, err := csv.NewReader(file).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	samples := make([]Sample, 0, len(records)-1)
	for _, record := range records[1:] {
		samples = append(samples, Sample{
			LapDistance: parseFloat(t, record[0]),
			Latitude:    parseFloat(t, record[1]),
			Longitude:   parseFloat(t, record[2]),
		})
	}
	return samples
}

type fixtureVehicle struct {
	lapDistance float64
	x           float64
	z           float64
}

func loadSharedMemoryVehicles(t testing.TB) []fixtureVehicle {
	t.Helper()
	buffer, err := os.ReadFile(filepath.Join("..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}

	var vehicles []fixtureVehicle
	for row := 0; row < scoringRows; row++ {
		base := scoringBase + row*scoringStride
		if base+scoringStride > len(buffer) {
			break
		}
		if buffer[base+offsetPlayerInPits] != 0 {
			continue
		}
		lapDistance := readFloat64(buffer, base+offsetLapDistance)
		x := readFloat64(buffer, base+offsetWorldPositionX)
		z := readFloat64(buffer, base+offsetWorldPositionZ)
		if lapDistance < 0 || !finite(lapDistance) || !finite(x) || !finite(z) || (x == 0 && z == 0) {
			continue
		}
		vehicles = append(vehicles, fixtureVehicle{lapDistance: lapDistance, x: x, z: z})
	}
	if len(vehicles) == 0 {
		t.Fatal("no on-track vehicles in the shared memory fixture")
	}
	return vehicles
}

func readFloat64(buffer []byte, offset int) float64 {
	return math.Float64frombits(binary.LittleEndian.Uint64(buffer[offset:]))
}

func parseFloat(t testing.TB, value string) float64 {
	t.Helper()
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}
