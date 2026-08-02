package manual

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestJSONBridgeCalculatesAndCorrelatesManualPlan(t *testing.T) {
	input := manualPlanFixture(t, []int64{2})
	document, err := json.Marshal(ManualCommandV1{
		ProtocolVersion: ManualProtocolV1,
		CommandID:       "manual-42",
		Input:           input,
	})
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := (JSONBridge{}).Execute(context.Background(), document)
	if err != nil {
		t.Fatal(err)
	}
	var result ManualResultV1
	if err := json.Unmarshal(encoded, &result); err != nil {
		t.Fatal(err)
	}
	if result.ProtocolVersion != ManualProtocolV1 || result.CommandID != "manual-42" {
		t.Fatalf("uncorrelated result: %#v", result)
	}
	assertClose(t, result.Result.Fuel.RaceNeed.Value(), 9.6)
}

func TestJSONBridgeRejectsUnknownFieldsTrailingDataAndInvalidProtocol(t *testing.T) {
	input := manualPlanFixture(t, []int64{1})
	command := ManualCommandV1{ProtocolVersion: ManualProtocolV1, CommandID: "manual-1", Input: input}
	document, err := json.Marshal(command)
	if err != nil {
		t.Fatal(err)
	}

	cases := [][]byte{
		append(document, []byte(` {}`)...),
		[]byte(strings.Replace(string(document), `"commandId":"manual-1"`, `"commandId":"manual-1","unknown":true`, 1)),
		[]byte(strings.Replace(string(document), ManualProtocolV1, "strategy.manual.v2", 1)),
	}
	for _, candidate := range cases {
		if _, err := (JSONBridge{}).Execute(context.Background(), candidate); !HasErrorCode(err, ErrorInvalidInput) {
			t.Fatalf("error = %v", err)
		}
	}
}

func TestJSONBridgeHonoursCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (JSONBridge{}).Execute(ctx, []byte(`{}`)); err == nil {
		t.Fatal("cancelled context was accepted")
	}
}
