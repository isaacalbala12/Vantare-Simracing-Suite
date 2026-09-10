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
// signal. ISA-1106 admits only the yellow assertion in this cut: the driver
// publishes FlagYellow exclusively on positive yellow evidence
// (nonzero yellowFlagState) and leaves every other state missing, so absence
// never reads as green and a sector-only flag never promotes to global.
// Green and the remaining vocabulary stay missing until an active-session
// capture demonstrates their enums.
type Flag string

const (
	// FlagYellow is the only assertion admitted in this cut (ISA-1106).
	FlagYellow Flag = "yellow"
)

func (value Flag) Known() bool { return value == FlagYellow }

type DeltaReference uint8

const (
	DeltaReferenceUnknown DeltaReference = iota
	DeltaReferenceBestCompletedPlayerLap
)

func (reference DeltaReference) Known() bool {
	return reference == DeltaReferenceBestCompletedPlayerLap
}
