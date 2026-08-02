// Package wheels contains canonical per-wheel values.
package wheels

import "github.com/vantare/overlays/v2/internal/telemetry/schema"

type Corner uint8

const (
	CornerUnknown Corner = iota
	CornerFrontLeft
	CornerFrontRight
	CornerRearLeft
	CornerRearRight
)

func (corner Corner) Known() bool { return corner >= CornerFrontLeft && corner <= CornerRearRight }

type BrakeTemperature struct {
	Corner Corner
	Value  schema.Celsius
}
