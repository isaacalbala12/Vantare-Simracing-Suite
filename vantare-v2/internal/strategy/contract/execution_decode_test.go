package contract

import (
	"encoding/json"
	"errors"
	"os"
	"testing"
)

type executionStateCorpus struct {
	Cases []struct {
		Name       string    `json:"name"`
		Document   string    `json:"document"`
		Accepted   bool      `json:"accepted"`
		ErrorCode  ErrorCode `json:"errorCode,omitempty"`
		ErrorField string    `json:"errorField,omitempty"`
	} `json:"cases"`
}

var expectedExecutionStateCaseNames = []string{
	"root must be an object",
	"missing contract version",
	"valid minimum counters",
	"valid maximum safe counters",
	"unknown top level field",
	"unknown nested active plan field",
	"missing nested revision",
	"duplicate top level key",
	"duplicate nested key",
	"trailing data",
	"non canonical active timestamp",
	"non canonical updated timestamp",
	"unknown capability",
	"duplicate capabilities",
	"zero epoch",
	"zero sequence",
	"fractional epoch",
	"unknown execution status",
	"unsorted capabilities",
	"unknown provenance kind",
	"known provenance without source",
	"known confidence without basis",
	"non canonical provenance timestamp",
	"epoch above shared safe range",
	"sequence above shared safe range",
}

func TestDecodeStrategyExecutionStateMatchesSharedCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/execution_state_v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus executionStateCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Cases) != len(expectedExecutionStateCaseNames) {
		t.Fatalf("execution corpus has %d cases, want exactly %d", len(corpus.Cases), len(expectedExecutionStateCaseNames))
	}
	for index, want := range expectedExecutionStateCaseNames {
		if got := corpus.Cases[index].Name; got != want {
			t.Fatalf("execution corpus case %d = %q, want %q", index, got, want)
		}
	}
	for _, test := range corpus.Cases {
		t.Run(test.Name, func(t *testing.T) {
			state, err := DecodeStrategyExecutionState([]byte(test.Document))
			if test.Accepted {
				if err != nil {
					t.Fatalf("DecodeStrategyExecutionState: %v", err)
				}
				if state.ExecutionID != "execution-1" {
					t.Fatalf("executionId = %q", state.ExecutionID)
				}
				return
			}
			if err == nil {
				t.Fatal("expected rejection")
			}
			var contractErr *ContractError
			if !errors.As(err, &contractErr) {
				t.Fatalf("error = %T %v, want ContractError", err, err)
			}
			if contractErr.Code != test.ErrorCode || contractErr.Field != test.ErrorField {
				t.Fatalf("error = %s/%q, want %s/%q", contractErr.Code, contractErr.Field, test.ErrorCode, test.ErrorField)
			}
		})
	}
}

func TestDecodeStrategyExecutionStateKeepsNestedErrorPathsStable(t *testing.T) {
	data, err := os.ReadFile("testdata/execution_state_v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus executionStateCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	validDocument := corpus.Cases[2].Document

	tests := []struct {
		name   string
		mutate func(map[string]interface{})
		code   ErrorCode
		field  string
	}{
		{
			name: "invalid nested revision identifier",
			mutate: func(document map[string]interface{}) {
				document["activePlan"].(map[string]interface{})["revision"].(map[string]interface{})["planId"] = ""
			},
			code: ErrorInvalidIdentifier, field: "activePlan.revision.planId",
		},
		{
			name: "missing nested revision identifier",
			mutate: func(document map[string]interface{}) {
				delete(document["activePlan"].(map[string]interface{})["revision"].(map[string]interface{}), "planId")
			},
			code: ErrorInvalidDocument, field: "activePlan.revision.planId",
		},
		{
			name: "unknown nested revision field",
			mutate: func(document map[string]interface{}) {
				document["activePlan"].(map[string]interface{})["revision"].(map[string]interface{})["unexpected"] = true
			},
			code: ErrorInvalidDocument, field: "activePlan.revision.unexpected",
		},
		{
			name: "unknown provenance field",
			mutate: func(document map[string]interface{}) {
				document["provenance"].(map[string]interface{})["unexpected"] = true
			},
			code: ErrorInvalidDocument, field: "provenance.unexpected",
		},
		{
			name: "missing provenance kind",
			mutate: func(document map[string]interface{}) {
				delete(document["provenance"].(map[string]interface{}), "kind")
			},
			code: ErrorInvalidDocument, field: "provenance.kind",
		},
		{
			name: "unknown confidence field",
			mutate: func(document map[string]interface{}) {
				document["confidence"].(map[string]interface{})["unexpected"] = true
			},
			code: ErrorInvalidDocument, field: "confidence.unexpected",
		},
		{
			name: "missing confidence level",
			mutate: func(document map[string]interface{}) {
				delete(document["confidence"].(map[string]interface{}), "level")
			},
			code: ErrorInvalidDocument, field: "confidence.level",
		},
		{
			name: "scalar activation identifier",
			mutate: func(document map[string]interface{}) {
				document["activePlan"].(map[string]interface{})["activationId"] = float64(7)
			},
			code: ErrorInvalidIdentifier, field: "activePlan.activationId",
		},
		{
			name: "scalar revision hash",
			mutate: func(document map[string]interface{}) {
				document["activePlan"].(map[string]interface{})["revision"].(map[string]interface{})["contentHash"] = float64(7)
			},
			code: ErrorInvalidDocument, field: "activePlan.revision.contentHash",
		},
		{
			name:   "scalar execution status",
			mutate: func(document map[string]interface{}) { document["status"] = float64(7) },
			code:   ErrorInvalidState, field: "status",
		},
		{
			name:   "scalar capabilities",
			mutate: func(document map[string]interface{}) { document["capabilities"] = "fuel_strategy" },
			code:   ErrorInvalidDocument, field: "capabilities",
		},
		{
			name: "scalar provenance kind",
			mutate: func(document map[string]interface{}) {
				document["provenance"].(map[string]interface{})["kind"] = float64(7)
			},
			code: ErrorInvalidProvenance, field: "provenance.kind",
		},
		{
			name: "scalar confidence level",
			mutate: func(document map[string]interface{}) {
				document["confidence"].(map[string]interface{})["level"] = float64(7)
			},
			code: ErrorInvalidConfidence, field: "confidence.level",
		},
		{
			name:   "scalar updated timestamp",
			mutate: func(document map[string]interface{}) { document["updatedAt"] = float64(7) },
			code:   ErrorInvalidDocument, field: "updatedAt",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var document map[string]interface{}
			if err := json.Unmarshal([]byte(validDocument), &document); err != nil {
				t.Fatal(err)
			}
			test.mutate(document)
			encoded, err := json.Marshal(document)
			if err != nil {
				t.Fatal(err)
			}
			_, err = DecodeStrategyExecutionState(encoded)
			var contractErr *ContractError
			if !errors.As(err, &contractErr) {
				t.Fatalf("error = %T %v, want ContractError", err, err)
			}
			if contractErr.Code != test.code || contractErr.Field != test.field {
				t.Fatalf("error = %s/%q, want %s/%q", contractErr.Code, contractErr.Field, test.code, test.field)
			}
		})
	}
}

func TestDecodeStrategyExecutionStateRejectsTrulyInvalidUTF8(t *testing.T) {
	document := append([]byte(`{"contractVersion":"strategy.v1","executionId":"`), 0xff)
	document = append(document, []byte(`"}`)...)
	_, err := DecodeStrategyExecutionState(document)
	if !HasErrorCode(err, ErrorInvalidDocument) {
		t.Fatalf("error = %v, want %s", err, ErrorInvalidDocument)
	}
}

func FuzzDecodeStrategyExecutionStateNeverReturnsAnInvalidState(f *testing.F) {
	f.Add([]byte(`{"contractVersion":"strategy.v1"}`))
	f.Add([]byte{0xff})
	f.Fuzz(func(t *testing.T, document []byte) {
		state, err := DecodeStrategyExecutionState(document)
		if err == nil {
			if err := state.Validate(); err != nil {
				t.Fatalf("decoder returned invalid state: %v", err)
			}
		}
	})
}
