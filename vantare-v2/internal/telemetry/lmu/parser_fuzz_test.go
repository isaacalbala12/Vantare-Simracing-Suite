package lmu

import "testing"

func FuzzParseNeverPanics(f *testing.F) {
	f.Add([]byte(nil))
	f.Add(make([]byte, scoringInfoOffset+scoringInfoSize))
	f.Add(make([]byte, ObjectOutSize))

	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > ObjectOutSize+1024 {
			data = data[:ObjectOutSize+1024]
		}
		_ = ParseSession(data)
		_ = ParsePlayerTelemetry(data, 0)
		_ = ParsePlayerTelemetry(data, 255)
		_ = ParseVehicleScoring(data, -1)
		_ = ParseVehicleScoring(data, 1_000_000)
		_ = Parse(data, ParsePlayerOnly)
		_ = Parse(data, ParseScoring)
		_ = Parse(data, ParseFull)
	})
}
