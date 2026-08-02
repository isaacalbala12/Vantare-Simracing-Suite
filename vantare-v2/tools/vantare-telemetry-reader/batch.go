package main

import "github.com/vantare/overlays/v2/tools/vantare-telemetry-reader/internal/protocol"

func rowsToBatch(rows []protocol.Row) (protocol.RowBatch, error) {
	batch := protocol.RowBatch{RowCount: len(rows)}
	if len(rows) == 0 {
		return batch, nil
	}
	columnCount := len(rows[0].Values)
	batch.Columns = make([]protocol.ColumnVector, columnCount)
	eventRows := rows[0].TimestampSeconds != nil
	if eventRows {
		batch.TimestampSeconds = make([]float64, len(rows))
	}
	for rowIndex, row := range rows {
		if len(row.Values) != columnCount || (row.TimestampSeconds != nil) != eventRows {
			return protocol.RowBatch{}, errInvalidRequest
		}
		if eventRows {
			batch.TimestampSeconds[rowIndex] = *row.TimestampSeconds
		}
		for columnIndex, value := range row.Values {
			vector := &batch.Columns[columnIndex]
			if value.Null {
				vector.NullIndexes = append(vector.NullIndexes, rowIndex)
			} else if vector.Kind == "" {
				vector.Kind = value.Kind
				vector.DuckType = value.DuckType
			}
			if !value.Null && vector.Kind != value.Kind {
				return protocol.RowBatch{}, errInvalidRequest
			}
			if value.Quality != "valid" {
				vector.QualityOverrides = append(vector.QualityOverrides, protocol.QualityOverride{Index: rowIndex, Quality: value.Quality})
			}
		}
	}
	for columnIndex := range batch.Columns {
		vector := &batch.Columns[columnIndex]
		if vector.Kind == "" {
			vector.Kind = "unknown"
		}
		switch vector.Kind {
		case "number":
			vector.Numbers = make([]float64, len(rows))
		case "integer":
			vector.Integers = make([]int64, len(rows))
		case "boolean":
			vector.Booleans = make([]bool, len(rows))
		case "text":
			vector.Texts = make([]string, len(rows))
		case "unknown":
		default:
			return protocol.RowBatch{}, errInvalidRequest
		}
		for rowIndex, row := range rows {
			value := row.Values[columnIndex]
			if value.Null {
				continue
			}
			switch vector.Kind {
			case "number":
				vector.Numbers[rowIndex] = value.Number
			case "integer":
				vector.Integers[rowIndex] = value.Integer
			case "boolean":
				vector.Booleans[rowIndex] = value.Boolean
			case "text":
				vector.Texts[rowIndex] = value.Text
			}
		}
	}
	return batch, nil
}
