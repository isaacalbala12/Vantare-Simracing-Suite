// Package session contains canonical session values, not session identity or time envelopes.
package session

type Type uint8

const (
	TypeUnknown Type = iota
	TypePractice
	TypeQualifying
	TypeRace
	TypeWarmup
	TypeEndurance
)

func (value Type) Known() bool { return value >= TypePractice && value <= TypeEndurance }

type LapNumber int32

type EndTime float64

type RemainingTime float64

type MaximumLaps int32

type DeltaSeconds float64

// Flag is the canonical session flag carried from the LMU REST sessionInfo
// signal. ISA-1106 correction B2: no yellow vocabulary is demonstrated for
// the REST state (field names attested, values pending active-session
// capture), so the driver asserts nothing and the flag stays missing — never
// green by absence, never yellow by guess. The plumbing
// (RESTObservation → fusion → ObservedState → BuildSession) is demonstrated
// by fixtures and ready for the first attested value, tracked as follow-up.
type Flag string

type DeltaReference uint8

const (
	DeltaReferenceUnknown DeltaReference = iota
	DeltaReferenceBestCompletedPlayerLap
)

func (reference DeltaReference) Known() bool {
	return reference == DeltaReferenceBestCompletedPlayerLap
}
