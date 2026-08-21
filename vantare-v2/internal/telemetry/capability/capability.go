// Package capability declares what a simulator driver can and cannot answer.
// It is simulator neutral and product neutral: it imports no driver, no
// derivation and no projection, and it never names a simulator.
//
// Three orthogonal questions are answered separately, because conflating them
// is what made the previous implicit contract wrong:
//
//   - Supported is stable for a whole session and comes from the active
//     driver's declaration. "This simulator never publishes rival positions"
//     is a Supported answer.
//   - Available is recomputed per session from the real presence and freshness
//     of the canonical state. "The REST channel is down" is an Available
//     answer, and it can only ever narrow a supported capability.
//   - Modes says how a supported capability was resolved -- lap distance
//     instead of world coordinates, session best instead of personal best --
//     so a consumer degrades on the mode and never on the simulator name.
package capability

import (
	"errors"
	"fmt"
	"slices"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

var (
	// ErrUnknownCapability reports an id outside the declared vocabulary.
	ErrUnknownCapability = errors.New("capability id is unknown")
	// ErrDuplicateCapability reports the same id declared twice.
	ErrDuplicateCapability = errors.New("capability id is declared twice")
	// ErrInvalidQuality reports a quality outside the declared vocabulary.
	ErrInvalidQuality = errors.New("capability quality is invalid")
	// ErrUnsupportedAvailability reports availability declared for a
	// capability the driver does not support. Available may never widen
	// Supported.
	ErrUnsupportedAvailability = errors.New("capability availability declared without support")
)

// ID is one product capability. Spatial is deliberately split: a simulator
// publishing only lap distance supports longitudinal proximity but cannot
// support a lateral "car on your left", and the Spotter families that need
// laterality must be able to see the difference.
type ID string

const (
	Session             ID = "session"
	Controls            ID = "controls"
	Standings           ID = "standings"
	Gaps                ID = "gaps"
	Fuel                ID = "fuel"
	Pit                 ID = "pit"
	Delta               ID = "delta"
	SpatialLongitudinal ID = "spatial.longitudinal"
	SpatialLateral      ID = "spatial.lateral"
	Spotter             ID = "spotter"
	Weather             ID = "weather"
	Damage              ID = "damage"
)

// All is the closed capability vocabulary in canonical order.
func All() []ID {
	return []ID{
		Session, Controls, Standings, Gaps, Fuel, Pit, Delta,
		SpatialLongitudinal, SpatialLateral, Spotter, Weather, Damage,
	}
}

// Known reports whether an id belongs to the vocabulary.
func Known(id ID) bool { return slices.Contains(All(), id) }

// Quality mirrors the canonical field quality vocabulary. It is the per
// session answer, never the compiled one.
type Quality string

const (
	QualityFresh   Quality = "fresh"
	QualityStale   Quality = "stale"
	QualityMissing Quality = "missing"
	QualityInvalid Quality = "invalid"
)

func (quality Quality) valid() bool {
	switch quality {
	case QualityFresh, QualityStale, QualityMissing, QualityInvalid:
		return true
	default:
		return false
	}
}

// State is the product answer for one capability. Unknown is the safe zero and
// differs from an explicit Unsupported.
type State uint8

const (
	StateUnknown State = iota
	StateSupported
	StateUnsupported
	StateDegraded
)

// SpatialMode declares how position was resolved.
type SpatialMode string

const (
	SpatialXYZ         SpatialMode = "xyz"
	SpatialXY          SpatialMode = "xy"
	SpatialLapDistance SpatialMode = "lap-distance"
	SpatialNone        SpatialMode = "none"
)

// StandingsMode declares whether the order came from the simulator.
type StandingsMode string

const (
	StandingsOfficial      StandingsMode = "official"
	StandingsReconstructed StandingsMode = "reconstructed"
	StandingsNone          StandingsMode = "none"
)

// GapsMode declares whether gaps came from the simulator.
type GapsMode string

const (
	GapsOfficial  GapsMode = "official"
	GapsEstimated GapsMode = "estimated"
	GapsNone      GapsMode = "none"
)

// Modes says how each supported capability was resolved. DeltaReferences is
// the ordered list of delta references the active driver can actually answer,
// so the fallback from a preference the simulator cannot serve is decided and
// declared in Go, never negotiated inside a widget.
type Modes struct {
	Spatial         SpatialMode
	DeltaReferences []string
	Standings       StandingsMode
	Gaps            GapsMode
}

func (modes Modes) normalized() Modes {
	switch modes.Spatial {
	case SpatialXYZ, SpatialXY, SpatialLapDistance, SpatialNone:
	default:
		modes.Spatial = SpatialNone
	}
	switch modes.Standings {
	case StandingsOfficial, StandingsReconstructed, StandingsNone:
	default:
		modes.Standings = StandingsNone
	}
	switch modes.Gaps {
	case GapsOfficial, GapsEstimated, GapsNone:
	default:
		modes.Gaps = GapsNone
	}
	modes.DeltaReferences = slices.Clone(modes.DeltaReferences)
	if modes.DeltaReferences == nil {
		modes.DeltaReferences = []string{}
	}
	return modes
}

// Declaration is what one compiled driver states about itself. It is stable
// for the whole session and is the only place a driver is allowed to answer
// "this simulator never publishes X".
type Declaration struct {
	// Driver identifies the declaring driver. It never leaves the composition
	// root: no product consumer may branch on it.
	Driver driver.ID
	// Supported lists the capabilities the driver can answer at all.
	Supported []ID
	// Modes declares how the supported capabilities are resolved.
	Modes Modes
}

// Validate rejects an unknown or duplicated capability id.
func (declaration Declaration) Validate() error {
	seen := make(map[ID]struct{}, len(declaration.Supported))
	for _, id := range declaration.Supported {
		if !Known(id) {
			return fmt.Errorf("%w: %q", ErrUnknownCapability, id)
		}
		if _, exists := seen[id]; exists {
			return fmt.Errorf("%w: %q", ErrDuplicateCapability, id)
		}
		seen[id] = struct{}{}
	}
	return nil
}

// Supports reports compiled support for one capability.
func (declaration Declaration) Supports(id ID) bool {
	return slices.Contains(declaration.Supported, id)
}

// Presence is the evidence gathered from the canonical state for one session.
// The composition root fills it; this package never reads telemetry itself.
type Presence map[ID]Quality

// Set is an immutable resolved capability answer for one session.
type Set struct {
	supported []ID
	available map[ID]Quality
	modes     Modes
}

// Resolve intersects a compiled declaration with the evidence of one session.
// An unsupported capability never appears; a supported one always appears,
// with QualityMissing when the session has no evidence for it yet.
func Resolve(declaration Declaration, presence Presence) (Set, error) {
	if err := declaration.Validate(); err != nil {
		return Set{}, err
	}
	for id, quality := range presence {
		if !Known(id) {
			return Set{}, fmt.Errorf("%w: %q", ErrUnknownCapability, id)
		}
		if !quality.valid() {
			return Set{}, fmt.Errorf("%w: %q for %q", ErrInvalidQuality, quality, id)
		}
		if !declaration.Supports(id) && quality != QualityMissing {
			return Set{}, fmt.Errorf("%w: %q", ErrUnsupportedAvailability, id)
		}
	}
	supported := slices.Clone(declaration.Supported)
	slices.Sort(supported)
	supported = slices.Compact(supported)
	available := make(map[ID]Quality, len(supported))
	for _, id := range supported {
		quality, reported := presence[id]
		if !reported {
			quality = QualityMissing
		}
		available[id] = quality
	}
	return Set{supported: supported, available: available, modes: declaration.Modes.normalized()}, nil
}

// Supported returns the sorted compiled capabilities.
func (set Set) Supported() []ID { return slices.Clone(set.supported) }

// SupportedKeys returns the sorted compiled capabilities as wire strings.
func (set Set) SupportedKeys() []string {
	result := make([]string, 0, len(set.supported))
	for _, id := range set.supported {
		result = append(result, string(id))
	}
	return result
}

// Available returns the per-session quality of every supported capability.
func (set Set) Available() map[ID]Quality {
	result := make(map[ID]Quality, len(set.available))
	for id, quality := range set.available {
		result[id] = quality
	}
	return result
}

// Modes returns how the supported capabilities were resolved.
func (set Set) Modes() Modes { return set.modes.normalized() }

// State answers one capability for a product consumer. An unsupported
// capability is Unsupported, never Unknown: the difference between "this
// simulator cannot" and "nobody asked" is the whole point of this package.
func (set Set) State(id ID) State {
	if !Known(id) {
		return StateUnknown
	}
	quality, supported := set.available[id]
	if !supported {
		return StateUnsupported
	}
	// Support is a compiled property: a capability whose value has simply not
	// arrived yet stays Supported. Only structurally invalid evidence -- a
	// channel answering with unusable data -- downgrades it to Degraded.
	if quality == QualityInvalid {
		return StateDegraded
	}
	return StateSupported
}
