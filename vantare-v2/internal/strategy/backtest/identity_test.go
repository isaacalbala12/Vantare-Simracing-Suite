package backtest

import (
	"crypto/sha256"
	"fmt"
	"os"
	"testing"
)

func TestEngineSourceHashMatchesAuthority(t *testing.T) {
	hash := sha256.New()
	for _, name := range []string{"backtest.go", "holdout.go", "types.go"} {
		data, err := os.ReadFile(name)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		if _, err := fmt.Fprintf(hash, "%s\n", name); err != nil {
			t.Fatalf("hash file name: %v", err)
		}
		if _, err := hash.Write(data); err != nil {
			t.Fatalf("hash %s: %v", name, err)
		}
		if _, err := hash.Write([]byte{'\n'}); err != nil {
			t.Fatalf("hash separator: %v", err)
		}
	}
	got := fmt.Sprintf("sha256:%x", hash.Sum(nil))
	if got != EngineSourceHash {
		t.Fatalf("engine source hash = %q, want %q", got, EngineSourceHash)
	}
}
