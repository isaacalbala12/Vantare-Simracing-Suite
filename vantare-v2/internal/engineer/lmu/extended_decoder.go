package lmu

import (
	"encoding/binary"
	"errors"
	"math"
)

// ExtendedReader is a pure decoder retained for explicit monitor fixtures. It
// cannot open shared memory and therefore cannot become a second LMU source.
type ExtendedReader struct {
	data []byte
}

// NewExtendedReaderFromBuffer creates a fixture-backed decoder. Production
// data must arrive through Telemetry Core projections, never through this type.
func NewExtendedReaderFromBuffer(buffer []byte) *ExtendedReader {
	return &ExtendedReader{data: buffer}
}

func (reader *ExtendedReader) Read() (ExtendedData, error) {
	if reader == nil || reader.data == nil {
		return ExtendedData{}, errors.New("extended: fixture buffer not configured")
	}
	buffer := reader.data
	data := ExtendedData{
		FuelMult:           readByte(buffer, mFuelMultOffset),
		LastHistoryMessage: readString(buffer, mLastHistoryMessageOffset, LastHistoryMessageLength),
		OilPressureWarning: readByte(buffer, OilPressureWarningOffset) != 0,
	}
	if offset := mTicksLastHistoryMessageUpdatedOffset; offset+8 <= len(buffer) {
		data.TicksLastHistoryMsg = int64(binary.LittleEndian.Uint64(buffer[offset:]))
	}
	if offset := mCurrentPitSpeedLimitOffset; offset+4 <= len(buffer) {
		data.PitSpeedLimit = math.Float32frombits(binary.LittleEndian.Uint32(buffer[offset:]))
	}
	return data, nil
}

func readByte(buffer []byte, offset int) byte {
	if offset < 0 || offset >= len(buffer) {
		return 0
	}
	return buffer[offset]
}

func readString(buffer []byte, offset, size int) string {
	if offset < 0 || size <= 0 || offset >= len(buffer) {
		return ""
	}
	end := offset + size
	if end > len(buffer) {
		end = len(buffer)
	}
	bytes := buffer[offset:end]
	for index, value := range bytes {
		if value == 0 {
			bytes = bytes[:index]
			break
		}
	}
	return string(bytes)
}
