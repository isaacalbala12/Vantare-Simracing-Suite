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
