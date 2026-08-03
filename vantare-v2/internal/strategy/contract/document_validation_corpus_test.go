package contract

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
)

type documentValidationCorpus struct {
	ValidReplan         interface{}              `json:"validReplan"`
	PlanRevisionCases   []documentValidationCase `json:"planRevisionCases"`
	ReplanProposalCases []documentValidationCase `json:"replanProposalCases"`
}

type documentValidationCase struct {
	Name       string                        `json:"name"`
	Operations []documentValidationOperation `json:"operations"`
	Accepted   bool                          `json:"accepted"`
	ErrorCode  ErrorCode                     `json:"errorCode,omitempty"`
	ErrorField string                        `json:"errorField,omitempty"`
}

type documentValidationOperation struct {
	Kind  string      `json:"kind"`
	Path  []string    `json:"path"`
	Value interface{} `json:"value,omitempty"`
}

var expectedPlanRevisionValidationNames = []string{
	"valid plan revision",
	"revision root null",
	"revision root scalar",
	"revision missing contract version",
	"revision scalar contract version",
	"revision unsupported contract version",
	"revision missing identifier",
	"revision scalar identifier",
	"revision unknown top level field",
	"revision duplicate top level key",
	"revision null provenance",
	"revision unknown provenance field",
	"revision scalar mode",
	"revision base from another plan",
	"revision unknown base field",
	"revision tampered payload",
}

var expectedReplanProposalValidationNames = []string{
	"valid proposed replan",
	"replan root null",
	"replan root scalar",
	"replan missing contract version",
	"replan unsupported contract version",
	"replan scalar proposal identifier",
	"replan unknown top level field",
	"replan duplicate top level key",
	"replan scalar base",
	"replan unknown base field",
	"replan candidate from another plan",
	"replan candidate equals base",
	"replan scalar status",
	"accepted replan missing decision",
	"proposed replan with decision",
	"replan expiry not after creation",
	"replan decision predates creation",
	"accepted replan expired before decision",
	"replan non canonical creation timestamp",
	"replan unknown confidence field",
}

func TestPlanRevisionAndReplanDecodersMatchSharedCorpus(t *testing.T) {
	corpus := loadDocumentValidationCorpus(t)
	revisionBase := readJSONFixture(t, "testdata/plan_revision_v1.golden.json")
	assertValidationCaseInventory(t, corpus.PlanRevisionCases, expectedPlanRevisionValidationNames)
	assertValidationCaseInventory(t, corpus.ReplanProposalCases, expectedReplanProposalValidationNames)

	for _, test := range corpus.PlanRevisionCases {
		t.Run("revision/"+test.Name, func(t *testing.T) {
			document := applyDocumentOperations(t, revisionBase, test.Operations)
			_, err := DecodePlanRevision[map[string]interface{}](document)
			assertDocumentValidationResult(t, err, test)
		})
	}
	for _, test := range corpus.ReplanProposalCases {
		t.Run("replan/"+test.Name, func(t *testing.T) {
			document := applyDocumentOperations(t, corpus.ValidReplan, test.Operations)
			_, err := DecodeReplanProposal(document)
			assertDocumentValidationResult(t, err, test)
		})
	}
}

func loadDocumentValidationCorpus(t *testing.T) documentValidationCorpus {
	t.Helper()
	data, err := os.ReadFile("testdata/document_validation_v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus documentValidationCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	return corpus
}

func readJSONFixture(t *testing.T, path string) interface{} {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var value interface{}
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func assertValidationCaseInventory(t *testing.T, cases []documentValidationCase, expected []string) {
	t.Helper()
	if len(cases) != len(expected) {
		t.Fatalf("validation corpus has %d cases, want exactly %d", len(cases), len(expected))
	}
	for index, want := range expected {
		if got := cases[index].Name; got != want {
			t.Fatalf("validation corpus case %d = %q, want %q", index, got, want)
		}
	}
}

func applyDocumentOperations(t *testing.T, base interface{}, operations []documentValidationOperation) []byte {
	t.Helper()
	encoded, err := json.Marshal(base)
	if err != nil {
		t.Fatal(err)
	}
	var document interface{}
	if err := json.Unmarshal(encoded, &document); err != nil {
		t.Fatal(err)
	}
	for _, operation := range operations {
		if operation.Kind == "duplicate" {
			if len(operation.Path) != 1 {
				t.Fatalf("duplicate operation only supports top-level fields: %#v", operation.Path)
			}
			encoded, err = json.Marshal(document)
			if err != nil {
				t.Fatal(err)
			}
			duplicate, err := json.Marshal(operation.Value)
			if err != nil {
				t.Fatal(err)
			}
			needle := `"` + operation.Path[0] + `":`
			replacement := needle + string(duplicate) + `,` + needle
			return []byte(strings.Replace(string(encoded), needle, replacement, 1))
		}
		document = applyDocumentOperation(t, document, operation)
	}
	encoded, err = json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func applyDocumentOperation(t *testing.T, document interface{}, operation documentValidationOperation) interface{} {
	t.Helper()
	if len(operation.Path) == 0 {
		if operation.Kind != "set" {
			t.Fatalf("root operation %q is unsupported", operation.Kind)
		}
		return operation.Value
	}
	current, ok := document.(map[string]interface{})
	if !ok {
		t.Fatalf("operation path %v does not point into an object", operation.Path)
	}
	for _, part := range operation.Path[:len(operation.Path)-1] {
		next, ok := current[part].(map[string]interface{})
		if !ok {
			t.Fatalf("operation path %v does not point into an object", operation.Path)
		}
		current = next
	}
	field := operation.Path[len(operation.Path)-1]
	switch operation.Kind {
	case "set":
		current[field] = operation.Value
	case "delete":
		delete(current, field)
	default:
		t.Fatalf("unknown document operation %q", operation.Kind)
	}
	return document
}

func assertDocumentValidationResult(t *testing.T, err error, test documentValidationCase) {
	t.Helper()
	if test.Accepted {
		if err != nil {
			t.Fatalf("decode: %v", err)
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
}
