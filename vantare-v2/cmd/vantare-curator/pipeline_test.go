package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBuildSummaryTableDriven(t *testing.T) {
	tests := []struct {
		name           string
		input          string
		wantFiles      int
		wantAccepted   int
		wantRejected   int
		wantDuplicates int
		golden         string
	}{
		{
			name:           "synthetic test bundles",
			input:          filepath.Join("testdata", "input"),
			wantFiles:      5,
			wantAccepted:   4,
			wantRejected:   1,
			wantDuplicates: 1,
			golden:         filepath.Join("testdata", "expected-summary.json"),
		},
		{
			name:  "empty environment root",
			input: t.TempDir(),
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := buildSummary(test.input)
			if err != nil {
				t.Fatalf("buildSummary: %v", err)
			}
			var decoded summary
			if err := json.Unmarshal(got, &decoded); err != nil {
				t.Fatalf("decode summary: %v", err)
			}
			if decoded.Input.Files != test.wantFiles || decoded.Input.Accepted != test.wantAccepted ||
				decoded.Input.Rejected != test.wantRejected || decoded.Input.Duplicates != test.wantDuplicates {
				t.Fatalf("input stats = %+v", decoded.Input)
			}
			if test.golden == "" {
				return
			}
			want, err := os.ReadFile(test.golden)
			if err != nil {
				t.Fatalf("read golden: %v", err)
			}
			want = bytes.TrimSuffix(want, []byte{'\n'})
			if !bytes.Equal(got, want) {
				t.Fatalf("summary differs byte-for-byte\ngot:  %s\nwant: %s", got, want)
			}
		})
	}
}

func TestBuildSummarySeparatesEnvironmentsAndAppliesCohort(t *testing.T) {
	encoded, err := buildSummary(filepath.Join("testdata", "input"))
	if err != nil {
		t.Fatalf("buildSummary: %v", err)
	}
	var got summary
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatalf("decode summary: %v", err)
	}
	testEnvironment := findEnvironment(t, got, "test")
	controlled := findEnvironment(t, got, "controlled-capture")
	if len(testEnvironment.Combinations) != 1 || len(controlled.Combinations) != 1 {
		t.Fatalf("separate combinations = test:%d controlled:%d", len(testEnvironment.Combinations), len(controlled.Combinations))
	}
	testCombination := testEnvironment.Combinations[0]
	controlledCombination := controlled.Combinations[0]
	if len(testCombination.Strategies) != 1 || testCombination.Contributors != 3 ||
		!testCombination.Publishable || !testCombination.Strategies[0].Publishable {
		t.Fatalf("test cohort = %+v", testCombination)
	}
	if controlledCombination.Contributors != 1 || controlledCombination.Publishable || controlledCombination.Reason != "minimum_cohort_not_met" {
		t.Fatalf("controlled cohort = %+v", controlledCombination)
	}
	if testCombination.SemanticBundles != 2 || testEnvironment.Duplicates != 1 {
		t.Fatalf("semantic dedupe = %+v", testEnvironment)
	}
}

func TestBuildSummaryIsByteDeterministic(t *testing.T) {
	first, err := buildSummary(filepath.Join("testdata", "input"))
	if err != nil {
		t.Fatalf("first summary: %v", err)
	}
	second, err := buildSummary(filepath.Join("testdata", "input"))
	if err != nil {
		t.Fatalf("second summary: %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("same input produced different bytes")
	}
}

func TestRunRequiresOutputOutsideInput(t *testing.T) {
	input := filepath.Join("testdata", "input")
	output := filepath.Join(input, "summary.json")
	if err := run([]string{"--in", input, "--out", output}, &bytes.Buffer{}); err == nil {
		t.Fatal("output inside input was accepted")
	}
}

func TestRunWritesCompactDeterministicSummary(t *testing.T) {
	input := filepath.Join("testdata", "input")
	output := filepath.Join(t.TempDir(), "summary.json")
	if err := run([]string{"--in", input, "--out", output}, &bytes.Buffer{}); err != nil {
		t.Fatalf("run: %v", err)
	}
	got, err := os.ReadFile(output)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	want, err := buildSummary(input)
	if err != nil {
		t.Fatalf("build expected summary: %v", err)
	}
	if !bytes.Equal(got, want) || bytes.Contains(got, []byte{'\n'}) {
		t.Fatal("CLI output is not the exact compact deterministic summary")
	}
}

func findEnvironment(t *testing.T, value summary, environment string) environmentSummary {
	t.Helper()
	for _, candidate := range value.Environments {
		if candidate.Environment == environment {
			return candidate
		}
	}
	t.Fatalf("environment %q not found", environment)
	return environmentSummary{}
}
