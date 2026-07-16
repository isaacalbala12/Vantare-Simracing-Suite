package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestSpotterDebugSmoke(t *testing.T) {
	// Build the binary first.
	binPath := filepath.Join(t.TempDir(), "spotter-debug.exe")
	cmd := exec.Command("go", "build", "-o", binPath, ".")
	cmd.Dir = filepath.Dir(".")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go build failed: %v\n%s", err, out)
	}

	// Run with -mock -once -out <tempfile>.
	outPath := filepath.Join(t.TempDir(), "output.jsonl")
	run := exec.Command(binPath, "-mock", "-once", "-out", outPath)
	runOut, err := run.CombinedOutput()
	if err != nil {
		t.Fatalf("spotter-debug failed: %v\n%s", err, runOut)
	}

	// Read the output JSONL.
	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("reading output %s: %v", outPath, err)
	}
	if len(data) == 0 {
		t.Fatal("output JSONL is empty")
	}

	// Verify at least one valid JSON line with expected fields.
	var records []map[string]interface{}
	for _, line := range splitLines(string(data)) {
		if line == "" {
			continue
		}
		var rec map[string]interface{}
		if err := json.Unmarshal([]byte(line), &rec); err != nil {
			t.Errorf("invalid JSON line: %v\n  line: %s", err, line)
			continue
		}
		records = append(records, rec)
	}

	if len(records) == 0 {
		t.Fatal("no JSON records found in output")
	}

	// Verify required geometry fields on first record.
	rec := records[0]
	requiredFields := []string{"alignedX", "alignedZ", "side", "inOverlap"}
	for _, f := range requiredFields {
		if _, ok := rec[f]; !ok {
			t.Errorf("first record missing field %q", f)
		}
	}

	// rejectReason is omitempty; only require it when present.
	if reason, hasReason := rec["rejectReason"]; hasReason {
		if reasonStr, ok := reason.(string); !ok || reasonStr == "" {
			t.Error("rejectReason must be non-empty when present")
		}
	}

	// playerX and playerZ should be present too.
	if _, ok := rec["playerX"]; !ok {
		t.Error("first record missing field playerX")
	}
	if _, ok := rec["playerZ"]; !ok {
		t.Error("first record missing field playerZ")
	}
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}
