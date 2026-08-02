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

type DeltaReference uint8

const (
	DeltaReferenceUnknown DeltaReference = iota
	DeltaReferenceBestCompletedPlayerLap
)

func (reference DeltaReference) Known() bool {
	return reference == DeltaReferenceBestCompletedPlayerLap
}
