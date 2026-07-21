package lmu

import "testing"

func FuzzParseEngineerFrameNeverPanics(f *testing.F) {
	f.Add([]byte(nil))
	f.Add(make([]byte, scoringInfoOffset+scoringInfoSize))
	f.Add(make([]byte, objectOutSize))

	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > objectOutSize+1024 {
			data = data[:objectOutSize+1024]
		}
		_ = ParseEngineerFrame(data)
	})
}
