package protocol

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"math"
)

var batchMagic = [4]byte{'V', 'T', 'B', '1'}

func EncodeRowBatch(batch RowBatch) (string, error) {
	if batch.RowCount < 0 || batch.RowCount > 16_384 || len(batch.Columns) > 64 ||
		len(batch.TimestampSeconds) != 0 && len(batch.TimestampSeconds) != batch.RowCount {
		return "", ErrInvalidFrame
	}
	var output bytes.Buffer
	output.Write(batchMagic[:])
	writeUint32(&output, uint32(batch.RowCount))
	if len(batch.TimestampSeconds) != 0 {
		output.WriteByte(1)
		for _, value := range batch.TimestampSeconds {
			writeFloat64(&output, value)
		}
	} else {
		output.WriteByte(0)
	}
	writeUint16(&output, uint16(len(batch.Columns)))
	for _, vector := range batch.Columns {
		kind, valuesOK := vectorKind(vector, batch.RowCount)
		if !valuesOK || len(vector.DuckType) > 256 || len(vector.NullIndexes) > batch.RowCount || len(vector.QualityOverrides) > batch.RowCount {
			return "", ErrInvalidFrame
		}
		output.WriteByte(kind)
		writeString16(&output, vector.DuckType)
		switch kind {
		case 1:
			for _, value := range vector.Numbers {
				writeFloat64(&output, value)
			}
		case 2:
			for _, value := range vector.Integers {
				writeUint64(&output, uint64(value))
			}
		case 3:
			for _, value := range vector.Booleans {
				if value {
					output.WriteByte(1)
				} else {
					output.WriteByte(0)
				}
			}
		case 4:
			for _, value := range vector.Texts {
				if len(value) > MaxOutputFrameBytes {
					return "", ErrFrameTooLarge
				}
				writeUint32(&output, uint32(len(value)))
				output.WriteString(value)
			}
		}
		writeUint32(&output, uint32(len(vector.NullIndexes)))
		for _, index := range vector.NullIndexes {
			if index < 0 || index >= batch.RowCount {
				return "", ErrInvalidFrame
			}
			writeUint32(&output, uint32(index))
		}
		writeUint32(&output, uint32(len(vector.QualityOverrides)))
		for _, override := range vector.QualityOverrides {
			quality, ok := qualityCode(override.Quality)
			if !ok || override.Index < 0 || override.Index >= batch.RowCount {
				return "", ErrInvalidFrame
			}
			writeUint32(&output, uint32(override.Index))
			output.WriteByte(quality)
		}
		if output.Len() > MaxOutputFrameBytes {
			return "", ErrFrameTooLarge
		}
	}
	return base64.StdEncoding.EncodeToString(output.Bytes()), nil
}

func vectorKind(vector ColumnVector, rows int) (byte, bool) {
	lengths := []int{len(vector.Numbers), len(vector.Integers), len(vector.Booleans), len(vector.Texts)}
	wantIndex := -1
	var code byte
	switch vector.Kind {
	case "unknown":
		code = 0
	case "number":
		code, wantIndex = 1, 0
	case "integer":
		code, wantIndex = 2, 1
	case "boolean":
		code, wantIndex = 3, 2
	case "text":
		code, wantIndex = 4, 3
	default:
		return 0, false
	}
	for index, length := range lengths {
		want := 0
		if index == wantIndex {
			want = rows
		}
		if length != want {
			return 0, false
		}
	}
	return code, true
}

func qualityCode(value string) (byte, bool) {
	switch value {
	case "valid":
		return 1, true
	case "stale":
		return 2, true
	case "missing":
		return 3, true
	case "invalid":
		return 4, true
	case "unknown":
		return 5, true
	default:
		return 0, false
	}
}

func writeUint16(buffer *bytes.Buffer, value uint16) {
	var data [2]byte
	binary.LittleEndian.PutUint16(data[:], value)
	buffer.Write(data[:])
}
func writeUint32(buffer *bytes.Buffer, value uint32) {
	var data [4]byte
	binary.LittleEndian.PutUint32(data[:], value)
	buffer.Write(data[:])
}
func writeUint64(buffer *bytes.Buffer, value uint64) {
	var data [8]byte
	binary.LittleEndian.PutUint64(data[:], value)
	buffer.Write(data[:])
}
func writeFloat64(buffer *bytes.Buffer, value float64) { writeUint64(buffer, math.Float64bits(value)) }
func writeString16(buffer *bytes.Buffer, value string) {
	writeUint16(buffer, uint16(len(value)))
	buffer.WriteString(value)
}
