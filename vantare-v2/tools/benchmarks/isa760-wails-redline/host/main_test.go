package main

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestParseConfigRejectsRelativeTrace(t *testing.T) {
	_, err := parseConfig([]string{"-scenario", "full", "-run-id", "run-1", "-trace", "trace.json"})
	if err == nil {
		t.Fatal("expected relative trace path to be rejected")
	}
}

func TestParseConfigRejectsUnsafeRunID(t *testing.T) {
	_, err := parseConfig([]string{"-scenario", "full", "-run-id", "run&other=1", "-trace", filepath.Join(t.TempDir(), "trace.json")})
	if err == nil {
		t.Fatal("expected unsafe run id to be rejected")
	}
}

func TestDecodeAndValidateTraceRejectsRowMismatch(t *testing.T) {
	payload := validPayload("full", "run-1", 250)
	frames := payload["frames"].([]map[string]any)
	frames[0]["observedRows"] = 15
	if _, err := decodeAndValidateTrace(payload, config{scenario: "full", runID: "run-1"}); err == nil {
		t.Fatal("expected row mismatch to be rejected")
	}
}

func TestWriteAtomicPublishesValidatedJSON(t *testing.T) {
	payload := validPayload("full", "run-1", 250)
	document, err := decodeAndValidateTrace(payload, config{scenario: "full", runID: "run-1"})
	if err != nil {
		t.Fatalf("validate trace: %v", err)
	}
	path := filepath.Join(t.TempDir(), "trace.json")
	if err := writeAtomic(path, document); err != nil {
		t.Fatalf("write trace: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(document, &decoded); err != nil {
		t.Fatalf("decode written trace: %v", err)
	}
}

func validPayload(scenario, runID string, frames int) map[string]any {
	contract := scenarioContracts[scenario]
	traceFrames := make([]map[string]any, frames)
	for index := range traceFrames {
		traceFrames[index] = map[string]any{
			"expectedRows": 16,
			"observedRows": 16,
			"commitMs":     1.0,
			"layoutMs":     2.0,
			"rafSubmitMs":  3.0,
		}
	}
	return map[string]any{
		"contractVersion": traceContractVersion,
		"complete":        true,
		"runId":           runID,
		"scenario":        scenario,
		"sceneId":         contract.sceneID,
		"replaySha256":    contract.sha256,
		"expectedFrames":  frames,
		"viewport":        map[string]any{"width": 1920, "height": 1080},
		"runtime":         map[string]any{"wailsBridge": true, "fontsReady": true},
		"frames":          traceFrames,
	}
}
