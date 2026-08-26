package main

import "time"

const (
	maxNumericChannelSamples = 2_000_000
	maxLapEvents             = 100_000
	maxSerializedBytes       = 256 << 20
)

type ErrorCode string

const (
	CodeDataInvalid    ErrorCode = "data_invalid"
	CodeNotImplemented ErrorCode = "not_implemented"
	CodePipelineFault  ErrorCode = "pipeline_fault"
)

type CodedError struct {
	Code ErrorCode
}

func (e *CodedError) Error() string { return string(e.Code) }

func IsCode(err error, code ErrorCode) bool {
	e, ok := err.(*CodedError)
	return ok && e.Code == code
}

func invalid() error    { return &CodedError{Code: CodeDataInvalid} }
func structural() error { return &CodedError{Code: CodePipelineFault} }

type CoordinateDigestV1 [32]byte

type GroupKeyV1 struct {
	TrackName   string
	TrackLayout string
	CarName     string
	CarClass    string
}

type SampleV1 struct {
	Index   int64
	Value   float64
	Quality string
}

type ChannelV1 struct {
	Name      string
	Present   bool
	Quality   string
	Frequency float64
	Samples   []SampleV1
}

type EventV1 struct {
	Index     int64
	Timestamp float64
	Value     float64
	Present   bool
	Quality   string
}

type EventChannelV1 struct {
	Name    string
	Present bool
	Quality string
	Events  []EventV1
}

type CoordinateSummaryV1 struct {
	LatitudeName, LongitudeName       string
	LatitudePresent, LongitudePresent bool
	LatitudeQuality, LongitudeQuality string
	Frequency                         float64
	Count                             uint64
	FirstIndex, LastIndex             int64
	Digest                            CoordinateDigestV1
}

type CanonicalRecordingV1 struct {
	Schema      uint64
	Group       GroupKeyV1
	Coordinates CoordinateSummaryV1
	GPSTime     ChannelV1
	LapDist     ChannelV1
	TotalDist   ChannelV1
	LapEvents   EventChannelV1
}

type CandidateV1 struct {
	ModifiedAt time.Time
	Size       int64
	Locator    string
}
