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

type LapTime float64

type PenaltyCount int32

type TimeGap float64

type LapGap int32

type RelativeTime float64

type RelativeLaps int32
