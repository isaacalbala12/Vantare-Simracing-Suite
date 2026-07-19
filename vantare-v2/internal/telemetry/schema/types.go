// Package schema defines the typed runtime vocabulary shared by Telemetry Core.
// It deliberately does not model presence, quality, provenance, or time.
package schema

import (
	"fmt"
	"math"
)

// Domain identifies the canonical owner of a telemetry value.
type Domain uint8

const (
	DomainUnknown Domain = iota
	DomainIdentity
	DomainSession
	DomainVehicle
	DomainControls
	DomainWheels
	DomainEnergy
	DomainPit
	DomainStandings
	DomainWeather
	DomainSpatial
)

func (d Domain) Known() bool { return d >= DomainIdentity && d <= DomainSpatial }

func (d Domain) String() string {
	switch d {
	case DomainIdentity:
		return "identity"
	case DomainSession:
		return "session"
	case DomainVehicle:
		return "vehicle"
	case DomainControls:
		return "controls"
	case DomainWheels:
		return "wheels"
	case DomainEnergy:
		return "energy"
	case DomainPit:
		return "pit"
	case DomainStandings:
		return "standings"
	case DomainWeather:
		return "weather"
	case DomainSpatial:
		return "spatial"
	default:
		return "unknown"
	}
}

// Unit is catalog metadata. Unknown means evidence is not sufficient;
// Unsupported means the value has no meaningful physical unit.
type Unit uint8

const (
	UnitUnknown Unit = iota
	UnitUnsupported
	UnitBoolean
	UnitCount
	UnitRatio
	UnitSeconds
	UnitRPM
	UnitCelsius
)

func (u Unit) Known() bool { return u >= UnitUnsupported && u <= UnitCelsius }

func (u Unit) Supported() bool { return u != UnitUnknown && u != UnitUnsupported && u.Known() }

func (u Unit) Valid() bool { return u == UnitUnknown || u.Known() }

func (u Unit) String() string {
	switch u {
	case UnitUnsupported:
		return "unsupported"
	case UnitBoolean:
		return "boolean"
	case UnitCount:
		return "count"
	case UnitRatio:
		return "ratio"
	case UnitSeconds:
		return "seconds"
	case UnitRPM:
		return "rpm"
	case UnitCelsius:
		return "celsius"
	default:
		return "unknown"
	}
}

type RangeKind uint8

const (
	RangeUnknown RangeKind = iota
	RangeUnsupported
	RangeClosed
)

// Range describes only a demonstrated semantic range.
type Range struct {
	Kind RangeKind
	Min  float64
	Max  float64
}

func UnknownRange() Range { return Range{Kind: RangeUnknown} }

func UnsupportedRange() Range { return Range{Kind: RangeUnsupported} }

func ClosedRange(minimum, maximum float64) Range {
	return Range{Kind: RangeClosed, Min: minimum, Max: maximum}
}

func (r Range) Validate() error {
	switch r.Kind {
	case RangeUnknown, RangeUnsupported:
		if r.Min != 0 || r.Max != 0 {
			return fmt.Errorf("range kind %d must not carry numeric bounds", r.Kind)
		}
		return nil
	case RangeClosed:
		if math.IsNaN(r.Min) || math.IsNaN(r.Max) || math.IsInf(r.Min, 0) || math.IsInf(r.Max, 0) {
			return fmt.Errorf("closed range bounds must be finite")
		}
		if r.Min > r.Max {
			return fmt.Errorf("closed range minimum %g exceeds maximum %g", r.Min, r.Max)
		}
		return nil
	default:
		return fmt.Errorf("unknown range kind %d", r.Kind)
	}
}

func (r Range) String() string {
	switch r.Kind {
	case RangeUnsupported:
		return "unsupported"
	case RangeClosed:
		return fmt.Sprintf("[%g,%g]", r.Min, r.Max)
	default:
		return "unknown"
	}
}

// Ratio is a demonstrated normalized value in the inclusive range 0..1.
type Ratio float64

type Seconds float64

type RPM float64

type Celsius float64

type Count int32
