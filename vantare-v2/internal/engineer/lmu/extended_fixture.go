package lmu

import (
	"encoding/binary"
	"math"
)

// NewSyntheticExtendedBuffer builds deterministic data for explicit Engineer
// tests. It is never referenced by the production composition root.
func NewSyntheticExtendedBuffer() []byte {
	buffer := make([]byte, ExtendedMemorySize)
	buffer[mFuelMultOffset] = 3
	binary.LittleEndian.PutUint64(buffer[mTicksLastHistoryMessageUpdatedOffset:], 1234567890)
	message := "Stop/Go Penalty: Cut Track"
	copy(buffer[mLastHistoryMessageOffset:], message)
	binary.LittleEndian.PutUint32(buffer[mCurrentPitSpeedLimitOffset:], math.Float32bits(22.22))
	return buffer
}
