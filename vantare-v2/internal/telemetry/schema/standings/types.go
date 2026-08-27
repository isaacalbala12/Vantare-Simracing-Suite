// Package standings contains canonical classification values.
package standings

type Position int32

type CompletedLaps int32

type VehicleClass string

type Sector uint8

const (
	SectorUnknown Sector = iota
	SectorOne
	SectorTwo
	SectorThree
)

func (sector Sector) Known() bool { return sector >= SectorOne && sector <= SectorThree }

type LapDistance float64

// LapProgressTime is the simulator-observed temporal coordinate of a vehicle
// within the current circuit lap. Drivers map an exact native equivalent or
// leave the field missing; the canonical derivation never infers it from
// distance or speed.
type LapProgressTime float64

type LapTime float64

type PenaltyCount int32

type TimeGap float64

type LapGap int32

type RelativeTime float64

type RelativeLaps int32
