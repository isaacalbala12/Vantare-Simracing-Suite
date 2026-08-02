// Package controls contains canonical runtime contracts for driver inputs.
package controls

import "github.com/vantare/overlays/v2/internal/telemetry/schema"

// Inputs contains only controls whose normalized 0..1 range is demonstrated.
// Presence and quality are added by a later contract, not inferred from zero.
type Inputs struct {
	Throttle schema.Ratio
	Brake    schema.Ratio
	Clutch   schema.Ratio
}
