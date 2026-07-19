// Package vehicle contains canonical vehicle state values.
package vehicle

import "github.com/vantare/overlays/v2/internal/telemetry/schema"

// Gear preserves every source value, including zero. LMU gear semantics remain deferred.
type Gear int32

type EngineRPM schema.RPM

type TeamName string

type VehicleName string
