//go:build windows

package bench_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestISA944SensorCostRequiresCleanRelevantTree(t *testing.T) {
	source, err := os.ReadFile("isa944-sensor-cost.ps1")
	if err != nil {
		t.Fatal(err)
	}
	for _, contract := range []string{"Get-FileHash -Algorithm SHA256", "executableSha256", "SHA-256 del ejecutable"} {
		if !strings.Contains(string(source), contract) {
			t.Errorf("sensor cost script does not record %q", contract)
		}
	}
	if strings.Contains(string(source), "SHA-256 del ejecutable: `$exeSha256`") {
		t.Error("sensor cost README escapes the executable hash instead of expanding it")
	}
	repo := t.TempDir()
	script := filepath.Join(repo, "scripts", "bench", "isa944-sensor-cost.ps1")
	relevant := filepath.Join(repo, "internal", "app", "performance", "policy.go")
	for _, path := range []string{script, relevant} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(script, source, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(relevant, []byte("package performance\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git(t, repo, "init")
	git(t, repo, "config", "user.email", "isa944-test@invalid.local")
	git(t, repo, "config", "user.name", "ISA-944 test")
	git(t, repo, "add", ".")
	git(t, repo, "commit", "-m", "fixture")

	if output, err := guard(repo, script); err != nil {
		t.Fatalf("clean guard failed: %v\n%s", err, output)
	}
	if err := os.WriteFile(relevant, []byte("package performance\n// dirty\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	output, err := guard(repo, script)
	if err == nil || !strings.Contains(output, "internal/app/performance/policy.go") {
		t.Fatalf("relevant dirty guard = %v\n%s", err, output)
	}
	git(t, repo, "add", ".")
	git(t, repo, "commit", "-m", "relevant change")

	if err := os.WriteFile(filepath.Join(repo, "unrelated.txt"), []byte("ignored\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if output, err := guard(repo, script); err != nil {
		t.Fatalf("unrelated dirt blocked guard: %v\n%s", err, output)
	}
}

func guard(repo, script string) (string, error) {
	command := exec.Command("powershell.exe", "-NoProfile", "-File", script, "-GuardOnly")
	command.Dir = repo
	output, err := command.CombinedOutput()
	return string(output), err
}

func git(t *testing.T, repo string, args ...string) {
	t.Helper()
	command := exec.Command("git", append([]string{"-C", repo}, args...)...)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, output)
	}
}
