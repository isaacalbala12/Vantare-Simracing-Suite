// Package session contains canonical session values, not session identity or time envelopes.
package session

type Type uint8

const (
	TypeUnknown Type = iota
	TypePractice
	TypeQualifying
	TypeRace
	TypeWarmup
)

func (value Type) Known() bool { return value >= TypePractice && value <= TypeWarmup }

type LapNumber int32
