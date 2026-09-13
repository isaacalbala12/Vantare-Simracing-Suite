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
// signal. ISA-1106 admits it as a documented candidate mapping (B2): the
// value vocabulary comes from the official LMU-distributed SDK header
// (InternalsPlugin.hpp, "Yellow flag states (applies to full-course only)"),
// restricted to the unambiguous full-course integers 2, 3, 4, 5. Whether the
// REST field carries the same codes as the SHM field is still pending
// active-session verification, so this stays a candidate contract proven by
// fixtures — never a certified REST source — and every other shape stays
// missing: never green by absence, never yellow by guess.
type Flag string

const (
	// FlagYellow is the session-global yellow assertion admitted for the
	// documented candidate integers 2, 3, 4 and 5 only (ISA-1106 B2).
	FlagYellow Flag = "yellow"
)

type DeltaReference uint8

const (
	DeltaReferenceUnknown DeltaReference = iota
	DeltaReferenceBestCompletedPlayerLap
)

func (reference DeltaReference) Known() bool {
	return reference == DeltaReferenceBestCompletedPlayerLap
}
