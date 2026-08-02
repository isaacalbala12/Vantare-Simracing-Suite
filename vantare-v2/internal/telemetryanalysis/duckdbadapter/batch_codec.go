package duckdbadapter

import (
	"encoding/base64"
	"encoding/binary"
	"math"
)

var wireBatchMagic = [4]byte{'V', 'T', 'B', '1'}

func decodeRowBatch(payload string) (wireRowBatch, error) {
	if payload == "" || base64.StdEncoding.DecodedLen(len(payload)) > maxOutputFrameBytes {
		return wireRowBatch{}, ErrProtocol
	}
	data, err := base64.StdEncoding.DecodeString(payload)
	if err != nil || len(data) > maxOutputFrameBytes {
		return wireRowBatch{}, ErrProtocol
	}
	reader := batchReader{data: data}
	magic, ok := reader.take(4)
	if !ok || string(magic) != string(wireBatchMagic[:]) {
		return wireRowBatch{}, ErrProtocol
	}
	rowCountValue, ok := reader.uint32()
	if !ok || rowCountValue > 16_384 {
		return wireRowBatch{}, ErrProtocol
	}
	rowCount := int(rowCountValue)
	timestampFlag, ok := reader.byte()
	if !ok || timestampFlag > 1 {
		return wireRowBatch{}, ErrProtocol
	}
	batch := wireRowBatch{RowCount: rowCount}
	if timestampFlag == 1 {
		batch.TimestampSeconds = make([]float64, rowCount)
		for index := range batch.TimestampSeconds {
			value, ok := reader.float64()
			if !ok {
				return wireRowBatch{}, ErrProtocol
			}
			batch.TimestampSeconds[index] = value
		}
	}
	columnCount, ok := reader.uint16()
	if !ok || columnCount > 64 {
		return wireRowBatch{}, ErrProtocol
	}
	batch.Columns = make([]wireColumnVector, int(columnCount))
	for columnIndex := range batch.Columns {
		kindCode, ok := reader.byte()
		if !ok || kindCode > 4 {
			return wireRowBatch{}, ErrProtocol
		}
		duckType, ok := reader.string16()
		if !ok || len(duckType) > 256 {
			return wireRowBatch{}, ErrProtocol
		}
		vector := &batch.Columns[columnIndex]
		vector.DuckType = duckType
		switch kindCode {
		case 0:
			vector.Kind = "unknown"
		case 1:
			vector.Kind = "number"
			vector.Numbers = make([]float64, rowCount)
			for index := range vector.Numbers {
				value, ok := reader.float64()
				if !ok {
					return wireRowBatch{}, ErrProtocol
				}
				vector.Numbers[index] = value
			}
		case 2:
			vector.Kind = "integer"
			vector.Integers = make([]int64, rowCount)
			for index := range vector.Integers {
				value, ok := reader.uint64()
				if !ok {
					return wireRowBatch{}, ErrProtocol
				}
				vector.Integers[index] = int64(value)
			}
		case 3:
			vector.Kind = "boolean"
			vector.Booleans = make([]bool, rowCount)
			for index := range vector.Booleans {
				value, ok := reader.byte()
				if !ok || value > 1 {
					return wireRowBatch{}, ErrProtocol
				}
				vector.Booleans[index] = value == 1
			}
		case 4:
			vector.Kind = "text"
			vector.Texts = make([]string, rowCount)
			for index := range vector.Texts {
				value, ok := reader.string32()
				if !ok {
					return wireRowBatch{}, ErrProtocol
				}
				vector.Texts[index] = value
			}
		}
		nullCount, ok := reader.uint32()
		if !ok || nullCount > uint32(rowCount) {
			return wireRowBatch{}, ErrProtocol
		}
		vector.NullIndexes = make([]int, int(nullCount))
		for index := range vector.NullIndexes {
			value, ok := reader.uint32()
			if !ok || value >= uint32(rowCount) {
				return wireRowBatch{}, ErrProtocol
			}
			vector.NullIndexes[index] = int(value)
		}
		qualityCount, ok := reader.uint32()
		if !ok || qualityCount > uint32(rowCount) {
			return wireRowBatch{}, ErrProtocol
		}
		vector.QualityOverrides = make([]wireQualityOverride, int(qualityCount))
		for index := range vector.QualityOverrides {
			rowIndex, ok := reader.uint32()
			if !ok || rowIndex >= uint32(rowCount) {
				return wireRowBatch{}, ErrProtocol
			}
			quality, ok := reader.byte()
			if !ok {
				return wireRowBatch{}, ErrProtocol
			}
			qualityName, ok := decodeQuality(quality)
			if !ok {
				return wireRowBatch{}, ErrProtocol
			}
			vector.QualityOverrides[index] = wireQualityOverride{Index: int(rowIndex), Quality: qualityName}
		}
	}
	if reader.offset != len(reader.data) {
		return wireRowBatch{}, ErrProtocol
	}
	return batch, nil
}

type batchReader struct {
	data   []byte
	offset int
}

func (reader *batchReader) take(length int) ([]byte, bool) {
	if length < 0 || reader.offset > len(reader.data)-length {
		return nil, false
	}
	value := reader.data[reader.offset : reader.offset+length]
	reader.offset += length
	return value, true
}
func (reader *batchReader) byte() (byte, bool) {
	data, ok := reader.take(1)
	if !ok {
		return 0, false
	}
	return data[0], true
}
func (reader *batchReader) uint16() (uint16, bool) {
	data, ok := reader.take(2)
	if !ok {
		return 0, false
	}
	return binary.LittleEndian.Uint16(data), true
}
func (reader *batchReader) uint32() (uint32, bool) {
	data, ok := reader.take(4)
	if !ok {
		return 0, false
	}
	return binary.LittleEndian.Uint32(data), true
}
func (reader *batchReader) uint64() (uint64, bool) {
	data, ok := reader.take(8)
	if !ok {
		return 0, false
	}
	return binary.LittleEndian.Uint64(data), true
}
func (reader *batchReader) float64() (float64, bool) {
	value, ok := reader.uint64()
	return math.Float64frombits(value), ok
}
func (reader *batchReader) string16() (string, bool) {
	length, ok := reader.uint16()
	if !ok {
		return "", false
	}
	data, ok := reader.take(int(length))
	return string(data), ok
}
func (reader *batchReader) string32() (string, bool) {
	length, ok := reader.uint32()
	if !ok || uint64(length) > uint64(len(reader.data)) {
		return "", false
	}
	data, ok := reader.take(int(length))
	return string(data), ok
}
func decodeQuality(value byte) (string, bool) {
	switch value {
	case 1:
		return "valid", true
	case 2:
		return "stale", true
	case 3:
		return "missing", true
	case 4:
		return "invalid", true
	case 5:
		return "unknown", true
	default:
		return "", false
	}
}
