package engineer

import "errors"

var (
	ErrInvalidProjectionEpoch   = errors.New("engineer projection context requires a non-zero epoch")
	ErrStaleProjection          = errors.New("engineer projection epoch moved backwards")
	ErrProjectionIdentityChange = errors.New("engineer projection session or vehicle changed without an epoch reset")
)

type EventID string
type SessionID string
type VehicleID string
type TeamID string
type DriverID string

// Identity is the product-facing identity needed to cancel pending Engineer
// decisions. It deliberately does not expose canonical schema types.
type Identity struct {
	Event   EventID
	Session SessionID
	Vehicle VehicleID
	Team    TeamID
	Driver  DriverID
}

// Context is adapted from the transversal projection metadata in ENG-03.
// Sequence is intentionally absent: snapshots are latest-wins and may skip
// intermediate sequence numbers without losing state.
type Context struct {
	Epoch    uint64
	Identity Identity
}

// Complete reports the minimum stable identity required by every live
// Engineer producer. Team may legitimately be unavailable; event, session,
// vehicle and driver are cancellation boundaries and therefore mandatory.
func (context Context) Complete() bool {
	return context.Epoch != 0 && context.Identity.Event != "" && context.Identity.Session != "" &&
		context.Identity.Vehicle != "" && context.Identity.Driver != ""
}

// Boundary describes the state that consumers must discard before processing
// the next projection. Driver/team swaps cancel pending decisions even when
// Telemetry Core legitimately keeps the same run epoch.
type Boundary uint8

const (
	BoundaryContinuous Boundary = iota
	BoundaryEpochReset
	BoundaryTeamChanged
	BoundaryDriverChanged
	BoundaryVehicleChanged
	BoundarySessionChanged
	BoundaryEventChanged
)

func (boundary Boundary) CancelsPending() bool {
	return boundary != BoundaryContinuous
}

// ClassifyBoundary identifies cancellation boundaries without imposing fact
// sequence semantics on latest-wins snapshots.
func ClassifyBoundary(previous, next Context) (Boundary, error) {
	if previous.Epoch == 0 || next.Epoch == 0 {
		return BoundaryContinuous, ErrInvalidProjectionEpoch
	}
	if next.Epoch < previous.Epoch {
		return BoundaryContinuous, ErrStaleProjection
	}
	if next.Epoch == previous.Epoch {
		switch {
		case previous.Identity.Event != next.Identity.Event:
			return BoundaryEventChanged, ErrProjectionIdentityChange
		case previous.Identity.Session != next.Identity.Session:
			return BoundarySessionChanged, ErrProjectionIdentityChange
		case previous.Identity.Vehicle != next.Identity.Vehicle:
			return BoundaryVehicleChanged, ErrProjectionIdentityChange
		}
		if previous.Identity.Driver != next.Identity.Driver {
			return BoundaryDriverChanged, nil
		}
		if previous.Identity.Team != next.Identity.Team {
			return BoundaryTeamChanged, nil
		}
		return BoundaryContinuous, nil
	}
	switch {
	case previous.Identity.Event != next.Identity.Event:
		return BoundaryEventChanged, nil
	case previous.Identity.Session != next.Identity.Session:
		return BoundarySessionChanged, nil
	case previous.Identity.Vehicle != next.Identity.Vehicle:
		return BoundaryVehicleChanged, nil
	case previous.Identity.Driver != next.Identity.Driver:
		return BoundaryDriverChanged, nil
	case previous.Identity.Team != next.Identity.Team:
		return BoundaryTeamChanged, nil
	default:
		return BoundaryEpochReset, nil
	}
}
