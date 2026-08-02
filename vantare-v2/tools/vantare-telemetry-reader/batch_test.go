package main

import (
	"testing"

	"github.com/vantare/overlays/v2/tools/vantare-telemetry-reader/internal/protocol"
)

func TestRowsToBatchPreservesTypedZerosAndNull(t *testing.T) {
	rows := []protocol.Row{
		{Values: []protocol.Scalar{{Kind: "integer", Integer: 0, Quality: "valid"}, {Kind: "boolean", Boolean: false, Quality: "valid"}, {Null: true, Quality: "missing"}}},
		{Values: []protocol.Scalar{{Kind: "integer", Integer: 2, Quality: "valid"}, {Kind: "boolean", Boolean: true, Quality: "valid"}, {Kind: "text", Text: "ok", Quality: "valid"}}},
	}
	batch, err := rowsToBatch(rows)
	if err != nil {
		t.Fatal(err)
	}
	if batch.RowCount != 2 || batch.Columns[0].Integers[0] != 0 || batch.Columns[1].Booleans[0] ||
		len(batch.Columns[2].NullIndexes) != 1 || batch.Columns[2].NullIndexes[0] != 0 || batch.Columns[2].Texts[1] != "ok" {
		t.Fatalf("batch = %#v", batch)
	}
}
