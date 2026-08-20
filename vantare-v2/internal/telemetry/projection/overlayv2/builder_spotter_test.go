package overlayv2

import (
	"math"
	"testing"

	enginespotter "github.com/vantare/overlays/v2/internal/engineer/spotter"
	enginetelemetry "github.com/vantare/overlays/v2/internal/engineer/telemetry"
	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

// TestSpotterThresholdsMatchEngineerNormalSensitivity pins the projection to
// the numbers Engineer's audio spotter already uses. The two implementations
// are separate on purpose — Engineer classifies its own rF2 frame, this one
// classifies the canonical state — and F13 unifies them; until then this test
// is what stops the two sets of metres from drifting apart in silence.
//
// The import is test-only. Production code in internal/telemetry may not
// import a product package, and the architecture scan enforces exactly that.
func TestSpotterThresholdsMatchEngineerNormalSensitivity(t *testing.T) {
	t.Parallel()

	config := enginespotter.DefaultOverlapConfig()
	for _, testCase := range []struct {
		name       string
		projection float64
		engineer   float64
	}{
		{"track zone", spotterTrackZoneM, config.TrackZoneToConsiderM},
		{"car width", spotterCarWidthM, config.CarWidthM},
		{"car length", spotterCarLengthM, config.CarLengthM},
		{"car behind extra", spotterCarBehindExtraM, config.CarBehindExtraM},
		{"minimum speed", spotterMinSpeedMPS, enginespotter.MinSpotterSpeedMPS},
	} {
		if testCase.projection != testCase.engineer {
			t.Errorf("%s: projection uses %v, Engineer uses %v", testCase.name, testCase.projection, testCase.engineer)
		}
	}
}

// TestSpotterAgreesWithEngineerGeometry sweeps the neighbourhood of the player
// and requires the same verdict Engineer's stateless classification gives for
// the same offset. Engineer's evidence path (engineer/projectioninput) calls
// spotter.Classify, which is ClassifyAlignedOverlap with no active side, so
// this is the same comparison the audio spotter itself makes.
func TestSpotterAgreesWithEngineerGeometry(t *testing.T) {
	t.Parallel()

	config := enginespotter.DefaultOverlapConfig()
	for _, lateral := range []float64{-25, -19, -6, -2.5, -1.8, -0.5, 0, 0.5, 1.8, 2.5, 6, 19, 25} {
		for _, longitudinal := range []float64{-6, -4.4, -2, 0, 2, 4.4, 4.9, 6} {
			expected := enginespotter.ClassifyAlignedOverlap(
				enginespotter.AlignedOpponent{X: lateral, Z: longitudinal}, false, config,
			)
			wantLeft := expected.InOverlap && expected.Side == enginespotter.SideLeft
			wantRight := expected.InOverlap && expected.Side == enginespotter.SideRight

			// Yaw zero means the player's forward axis is -Z, so an opponent's
			// world offset is already its aligned offset.
			view := BuildSpotter(spotterState(t, spotterPlayer{}, spotterOpponent{x: lateral, z: longitudinal}))
			if view.Left.V != wantLeft || view.Right.V != wantRight {
				t.Errorf("offset (%v, %v): projection left=%v right=%v, Engineer left=%v right=%v (%s)",
					lateral, longitudinal, view.Left.V, view.Right.V, wantLeft, wantRight, expected.RejectReason)
			}
		}
	}
}

func TestSpotterReportsEachSideFromTheCanonicalSpatialState(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name                string
		opponents           []spotterOpponent
		wantLeft, wantRight bool
	}{
		{name: "an empty track is all clear"},
		{name: "a car alongside on the left", opponents: []spotterOpponent{{x: 3, z: 1}}, wantLeft: true},
		{name: "a car alongside on the right", opponents: []spotterOpponent{{x: -3, z: 1}}, wantRight: true},
		{
			name:      "three wide is both sides at once",
			opponents: []spotterOpponent{{x: 3, z: 0.5}, {x: -3, z: -0.5}},
			wantLeft:  true, wantRight: true,
		},
		{name: "a car far ahead is not alongside", opponents: []spotterOpponent{{x: 3, z: -40}}},
		{name: "a car across the circuit is not alongside", opponents: []spotterOpponent{{x: 60, z: 0}}},
		{name: "a car directly in front is not alongside", opponents: []spotterOpponent{{x: 0.5, z: -2}}},
		{
			name:      "two cars stacked on one side are still one side",
			opponents: []spotterOpponent{{x: 3, z: 1}, {x: 3.5, z: -1}},
			wantLeft:  true,
		},
		{
			name:      "an opponent in the pits is not racing the player",
			opponents: []spotterOpponent{{x: 3, z: 1, inPit: true}},
		},
		{
			name:      "an opponent with an invalid lap distance is discarded",
			opponents: []spotterOpponent{{x: 3, z: 1, lapDistance: -1, hasLapDistance: true}},
		},
		{
			name:      "an opponent without a position cannot be placed",
			opponents: []spotterOpponent{{x: 3, z: 1, positionMissing: true}},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			view := BuildSpotter(spotterState(t, spotterPlayer{}, testCase.opponents...))
			if view.Mode != ModeXYZ {
				t.Fatalf("mode = %q, want xyz: the classification did run", view.Mode)
			}
			if view.Left.Q != QualityFresh || view.Right.Q != QualityFresh {
				t.Fatalf("quality = %q/%q, want fresh", view.Left.Q, view.Right.Q)
			}
			if view.Left.V != testCase.wantLeft || view.Right.V != testCase.wantRight {
				t.Fatalf("left=%v right=%v, want left=%v right=%v",
					view.Left.V, view.Right.V, testCase.wantLeft, testCase.wantRight)
			}
		})
	}
}

// A rotated player is the case a naive implementation gets wrong: the sides
// are the player's, not the circuit's.
func TestSpotterSidesFollowThePlayerHeading(t *testing.T) {
	t.Parallel()

	// Yaw pi/2 turns the player a quarter turn. The same world offsets now mean
	// something else: a car at +X world is straight ahead, and a car at -Z
	// world — which was ahead at yaw zero — is now beside the player. The side
	// it lands on is Engineer's convention, checked below against Engineer's
	// own alignment (AlignOpponentXZ at pi/2 maps -Z to a negative aligned X,
	// and a negative aligned X is the right-hand side).
	player := spotterPlayer{yaw: math.Pi / 2}
	if view := BuildSpotter(spotterState(t, player, spotterOpponent{x: 10, z: 0})); view.Left.V || view.Right.V {
		t.Fatalf("a car ahead of the rotated player is not alongside: %#v", view)
	}
	aligned := enginespotter.AlignOpponentXZ(math.Pi/2, enginetelemetry.Vec3{}, enginetelemetry.Vec3{Z: -3})
	if aligned.X >= 0 {
		t.Fatalf("Engineer aligns the neighbour at X=%v, this test assumes the right-hand side", aligned.X)
	}
	view := BuildSpotter(spotterState(t, player, spotterOpponent{x: 0, z: -3}))
	if view.Left.V || !view.Right.V {
		t.Fatalf("rotated neighbour = left:%v right:%v, want right only", view.Left.V, view.Right.V)
	}
}

func TestSpotterWithoutUsableSpatialDataDeclaresNoMode(t *testing.T) {
	t.Parallel()

	alongside := spotterOpponent{x: 3, z: 1}
	for _, testCase := range []struct {
		name   string
		player spotterPlayer
	}{
		{"no orientation means no heading, so no sides", spotterPlayer{orientationMissing: true}},
		{"a degenerate forward axis is not a heading", spotterPlayer{degenerateOrientation: true}},
		{"no position means nothing to measure from", spotterPlayer{positionMissing: true}},
		{"a stale-free invalid position is not a position", spotterPlayer{positionInvalid: true}},
		{"below the minimum speed the spotter stays silent", spotterPlayer{speedMPS: 2, hasSpeed: true}},
		{"in the pits the spotter stays silent", spotterPlayer{inPit: true}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			view := BuildSpotter(spotterState(t, testCase.player, alongside))
			if view.Mode != ModeNone {
				t.Fatalf("mode = %q, want none", view.Mode)
			}
			// "Cannot tell" must never be published as "all clear".
			if view.Left.Q != QualityMissing || view.Right.Q != QualityMissing {
				t.Fatalf("an unavailable spotter must publish missing sides: %#v", view)
			}
		})
	}
}

// A player whose speed was never observed is not a stopped player: the gate
// suppresses a car standing still, and absence is not evidence of one.
func TestSpotterRunsWhenTheSpeedIsUnknown(t *testing.T) {
	t.Parallel()

	view := BuildSpotter(spotterState(t, spotterPlayer{}, spotterOpponent{x: 3, z: 1}))
	if view.Mode != ModeXYZ || !view.Left.V {
		t.Fatalf("an unknown speed must not silence the spotter: %#v", view)
	}
}

func TestSpotterWithoutAPlayerHasNothingToMeasure(t *testing.T) {
	t.Parallel()

	if view := BuildSpotter(derive.FinalState{}); view.Mode != ModeNone || view.Left.Q != QualityMissing {
		t.Fatalf("an empty state cannot place a player: %#v", view)
	}
}

// --- fixtures -------------------------------------------------------------

type spotterPlayer struct {
	yaw                   float64
	orientationMissing    bool
	degenerateOrientation bool
	positionMissing       bool
	positionInvalid       bool
	inPit                 bool
	speedMPS              float64
	hasSpeed              bool
}

type spotterOpponent struct {
	x, z            float64
	inPit           bool
	lapDistance     float64
	hasLapDistance  bool
	positionMissing bool
}

// spotterState builds the minimum canonical state the builder reads. The
// player sits at a world position away from the origin so opponent offsets are
// unambiguous, and the opponents are placed relative to it.
func spotterState(tb testing.TB, player spotterPlayer, opponents ...spotterOpponent) derive.FinalState {
	tb.Helper()

	const originX, originZ = 100.0, 200.0
	playerState := core.VehicleState{
		Identity: identity.RunIdentity{Event: "spotter", Session: "spotter", Vehicle: "vehicle-000"},
		Player:   spotterField(tb, true),
		InPit:    spotterField(tb, pit.InPit(player.inPit)),
	}
	if !player.positionMissing {
		position := spatial.Position{X: originX, Z: originZ}
		if player.positionInvalid {
			position = spatial.Position{X: math.NaN(), Z: originZ}
		}
		playerState.WorldPosition = spotterField(tb, position)
	}
	if !player.orientationMissing {
		forward := spatial.Vector3{X: math.Sin(player.yaw), Z: math.Cos(player.yaw)}
		if player.degenerateOrientation {
			forward = spatial.Vector3{}
		}
		playerState.Orientation = spotterField(tb, spatial.Orientation{Row2: forward})
	}
	if player.hasSpeed {
		playerState.SpeedMPS = spotterField(tb, player.speedMPS)
	}

	vehicles := make([]core.VehicleState, 0, len(opponents)+1)
	vehicles = append(vehicles, playerState)
	for index, opponent := range opponents {
		state := core.VehicleState{
			Identity: identity.RunIdentity{
				Event: "spotter", Session: "spotter",
				Vehicle: identity.VehicleID(string(rune('a'+index)) + "-opponent"),
			},
			Player: spotterField(tb, false),
			InPit:  spotterField(tb, pit.InPit(opponent.inPit)),
		}
		if !opponent.positionMissing {
			state.WorldPosition = spotterField(tb, spatial.Position{X: originX + opponent.x, Z: originZ + opponent.z})
		}
		if opponent.hasLapDistance {
			state.LapDistance = spotterField(tb, standings.LapDistance(opponent.lapDistance))
		}
		vehicles = append(vehicles, state)
	}
	return derive.FinalState{Observed: core.ObservedState{Vehicles: vehicles}}
}

func spotterField[T comparable](tb testing.TB, value T) schema.Field[T] {
	tb.Helper()
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		tb.Fatal(err)
	}
	return field
}
