// Package pit contains canonical pit values without inferring pit-lane state.
package pit

type StopCount int32

// InPit is the observed LMU VehicleScoring boolean. False is a valid present
// value. It does not distinguish pit lane, garage stall, pit box or PitState.
type InPit bool
