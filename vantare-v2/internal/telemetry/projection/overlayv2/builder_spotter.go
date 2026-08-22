package overlayv2

import (
	spottergeometry "github.com/vantare/overlays/v2/internal/spotter/geometry"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
)

// Compatibility aliases keep the existing threshold tests readable while the
// numeric authority lives only in internal/spotter/geometry.
const (
	// spotterTrackZoneM ignores anything farther sideways than a track width:
	// a car on the other side of the circuit is not alongside.
	spotterTrackZoneM = spottergeometry.TrackZoneToConsiderM
	// spotterCarWidthM is the minimum lateral separation that counts as being
	// beside the player instead of in front of or behind them.
	spotterCarWidthM = spottergeometry.CarWidthM
	// spotterCarLengthM is how far forward an opponent can be and still
	// overlap; spotterCarBehindExtraM extends it slightly for a car behind,
	// which is the harder one to see.
	spotterCarLengthM      = spottergeometry.CarLengthM
	spotterCarBehindExtraM = spottergeometry.CarBehindExtraM
	// spotterMinSpeedMPS silences the spotter when the player is barely
	// moving: standing on the grid or crawling in the pit lane surrounds them
	// with cars that are not racing them.
	spotterMinSpeedMPS = spottergeometry.MinSpotterSpeedMPS
)

// BuildSpotter reports whether the player currently has a car alongside.
//
// The authority is the canonical spatial state: every vehicle carries a
// WorldPosition and the player carries an Orientation, both published by the
// LMU driver (drivers/lmu/format.go reads them from scoring and telemetry).
// Opponent positions are rotated into the player's frame — the yaw comes from
// the orientation's third row, as the simulator's convention requires — and a
// car counts as alongside when it is inside the track zone, at least a car
// width to one side, and overlapping longitudinally.
//
// The semantics are deliberately Engineer's. Engineer's audio spotter feeds on
// spotter.Classify (via engineer/projectioninput.SemanticEvidence), which is
// this same test at normal sensitivity with no active-side hysteresis, plus the
// same gates: silence in the pits, silence below a minimum speed, skip
// opponents in the pits or with an invalid lap distance. Reimplementing it here
// rather than calling it is forced: engineer/spotter classifies
// engineer/telemetry.Frame, a product-specific rF2 shape, and the projection
// only ever sees the canonical state.
//
// Declared divergences against Engineer, to be unified in F13:
//   - no Full Course Yellow gate. Engineer silences the spotter under FCY from
//     the rF2 game phase; the canonical ObservedState has no session flag or
//     game phase at all (BuildSession leaves Flag missing), so the gate cannot
//     be reproduced without inventing a signal.
//   - sensitivity is fixed at normal. Engineer exposes conservative/normal/
//     aggressive as a user setting; the v2 contract has no preference for it
//     and the frame publishes the one Engineer's own evidence path uses.
//   - no zone list, no stacked-opponent collapse, no nearest-opponent
//     identity. The v2 contract is two booleans, and collapsing opponents on
//     one side cannot change whether that side is occupied.
//
// Mode is xyz when the classification actually ran on fresh player spatial
// data, and none when it could not run. A none mode never carries a verdict:
// "no car alongside" and "cannot tell" are different answers and the contract
// keeps them apart through the quality of Left and Right.
func BuildSpotter(final derive.FinalState) SpotterViewV2 {
	unavailable := SpotterViewV2{Mode: ModeNone, Left: missingValue[bool](), Right: missingValue[bool]()}

	player, found := playerVehicle(final.Observed.Vehicles)
	if !found {
		return unavailable
	}
	position, quality, ok := spotterWorldPosition(player.WorldPosition)
	if !ok {
		return unavailable
	}
	yaw, ok := playerYaw(player.Orientation)
	if !ok {
		return unavailable
	}
	// A player whose speed is unknown is not silenced: the gate exists to
	// suppress a stationary car, and an absent reading is not evidence of one.
	if speed, present := player.SpeedMPS.Value(); present &&
		player.SpeedMPS.Freshness() != schema.FreshnessInvalid && speed < spotterMinSpeedMPS {
		return unavailable
	}
	if inPit, present := player.InPit.Value(); present && bool(inPit) {
		return unavailable
	}

	var left, right bool
	for _, opponent := range final.Observed.Vehicles {
		if opponent.Identity.Vehicle == player.Identity.Vehicle {
			continue
		}
		if inPit, present := opponent.InPit.Value(); present && bool(inPit) {
			continue
		}
		if distance, present := opponent.LapDistance.Value(); present && float64(distance) < 0 {
			continue
		}
		opponentPosition, _, ok := spotterWorldPosition(opponent.WorldPosition)
		if !ok {
			continue
		}
		switch alignedSide(yaw, position, opponentPosition) {
		case sideLeft:
			left = true
		case sideRight:
			right = true
		}
	}
	return SpotterViewV2{
		Mode:  ModeXYZ,
		Left:  QValue[bool]{V: left, Q: quality},
		Right: QValue[bool]{V: right, Q: quality},
	}
}

type spotterSide uint8

const (
	sideNone spotterSide = iota
	sideLeft
	sideRight
)

// alignedSide rotates the opponent into the player's frame and returns the
// side it overlaps, if any. Positive X is left of the player.
func alignedSide(yaw float64, player, opponent spatial.Position) spotterSide {
	aligned := spottergeometry.AlignOpponentXZ(yaw,
		spottergeometry.Vec3{X: player.X, Y: player.Y, Z: player.Z},
		spottergeometry.Vec3{X: opponent.X, Y: opponent.Y, Z: opponent.Z})
	overlap := spottergeometry.ClassifyAlignedOverlap(aligned, false, spottergeometry.DefaultOverlapConfig())
	if !overlap.InOverlap {
		return sideNone
	}
	if overlap.Side == spottergeometry.SideLeft {
		return sideLeft
	}
	return sideRight
}

// playerYaw recovers the heading from the orientation's third row, which is
// the simulator's forward axis. An orientation that was never observed, or
// whose forward axis is degenerate, yields no heading: without it every
// opponent side would be arbitrary.
func playerYaw(field schema.Field[spatial.Orientation]) (float64, bool) {
	orientation, present := field.Value()
	if !present {
		return 0, false
	}
	switch qualityFromFreshness(field.Freshness()) {
	case QualityFresh, QualityStale:
	default:
		return 0, false
	}
	forward := orientation.Row2
	if !finite(forward.X) || !finite(forward.Z) || (forward.X == 0 && forward.Z == 0) {
		return 0, false
	}
	return spottergeometry.YawFromForward(spottergeometry.Vec3{X: forward.X, Y: forward.Y, Z: forward.Z})
}

// spotterWorldPosition accepts a present, finite position whose quality can be
// shown. It also rejects the exact origin, which the driver publishes for a
// vehicle whose slot carries no real coordinates.
func spotterWorldPosition(field schema.Field[spatial.Position]) (spatial.Position, Quality, bool) {
	position, present := field.Value()
	if !present {
		return spatial.Position{}, QualityMissing, false
	}
	quality := qualityFromFreshness(field.Freshness())
	switch quality {
	case QualityFresh, QualityStale:
	default:
		return spatial.Position{}, quality, false
	}
	if !finite(position.X) || !finite(position.Y) || !finite(position.Z) {
		return spatial.Position{}, QualityInvalid, false
	}
	if position.X == 0 && position.Y == 0 && position.Z == 0 {
		return spatial.Position{}, quality, false
	}
	return position, quality, true
}
