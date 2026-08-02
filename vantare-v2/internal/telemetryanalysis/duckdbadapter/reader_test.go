package duckdbadapter

import (
	"context"
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

func TestReaderDoesNotStartSessionForCancelledRequest(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	reader := &Reader{}
	if _, err := reader.do(ctx, request{Operation: operationHandshake}); !errors.Is(err, context.Canceled) {
		t.Fatalf("do() error = %v, want context.Canceled", err)
	}
	if reader.session != nil {
		t.Fatal("cancelled request started a helper session")
	}
}

func TestMapBatchPreservesZeroFalseEmptyNullAndUnknown(t *testing.T) {
	rows, err := mapBatch(wireRowBatch{RowCount: 1, Columns: []wireColumnVector{
		{Kind: "number", Numbers: []float64{0}},
		{Kind: "boolean", Booleans: []bool{false}},
		{Kind: "text", Texts: []string{""}},
		{Kind: "unknown", NullIndexes: []int{0}, QualityOverrides: []wireQualityOverride{{Index: 0, Quality: "missing"}}},
		{Kind: "unknown", DuckType: "HUGEINT", QualityOverrides: []wireQualityOverride{{Index: 0, Quality: "unknown"}}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || len(rows[0].Values) != 5 {
		t.Fatalf("rows = %#v", rows)
	}
	values := rows[0].Values
	if values[0].Kind != telemetryanalysis.ScalarNumber || values[0].Number != 0 ||
		values[1].Kind != telemetryanalysis.ScalarBoolean || values[1].Boolean ||
		values[2].Kind != telemetryanalysis.ScalarText || values[2].Text != "" ||
		!values[3].Null || values[3].Quality != telemetryanalysis.QualityMissing ||
		values[4].Kind != telemetryanalysis.ScalarUnknown || values[4].Quality != telemetryanalysis.QualityUnknown {
		t.Fatalf("mapped values = %#v", values)
	}
}

func TestDecodeResponseRejectsStaleRequestAndUnknownFields(t *testing.T) {
	stale := []byte(`{"protocol_version":1,"request_id":"old","operation":"catalog","ok":true,"catalog":{"metadata":[],"continuous":[],"events":[]}}` + "\n")
	if _, err := decodeResponse(stale, "current", operationCatalog); err != ErrProtocol {
		t.Fatalf("stale response error = %v", err)
	}
	unknown := []byte(`{"protocol_version":1,"request_id":"current","operation":"catalog","ok":true,"sql":"select 1"}` + "\n")
	if _, err := decodeResponse(unknown, "current", operationCatalog); err != ErrProtocol {
		t.Fatalf("unknown field error = %v", err)
	}
}

func FuzzDecodeRowBatch(f *testing.F) {
	f.Add("")
	f.Add("VlRCMQAAAAAAAQ==")
	f.Fuzz(func(t *testing.T, payload string) {
		_, _ = decodeRowBatch(payload)
	})
}
