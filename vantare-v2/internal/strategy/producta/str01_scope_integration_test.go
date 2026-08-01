//go:build str01scope

package producta

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

const str01BaseSHA = "c960815f555e65933f7a5060a99eb8cc59aaeb6a"

func TestSTR01ActualDeltaMatchesVersionedManifest(t *testing.T) {
	root, err := findModuleRootFromWorkingDirectory()
	if err != nil {
		t.Fatal(err)
	}
	expected, err := readDeliveryManifest(root)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := gitWorktreeDelta(root, str01BaseSHA)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateDeliveryManifest(actual, expected); err != nil {
		t.Fatal(err)
	}
	artifacts, err := collectDeliveryArtifacts(root, actual)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateDeniedBlobCopies(artifacts); err != nil {
		t.Fatal(err)
	}
}

func TestSTR01ActualDeltaRejectsUntrackedPathOutsideManifest(t *testing.T) {
	repo := t.TempDir()
	runGit(t, repo, "init", "--quiet")
	runGit(t, repo, "config", "user.email", "str01-test@invalid.example")
	runGit(t, repo, "config", "user.name", "STR-01 test")
	writeTestFile(t, repo, "docs/current-plan.md", "base\n")
	runGit(t, repo, "add", "docs/current-plan.md")
	runGit(t, repo, "commit", "--quiet", "-m", "base")
	base := strings.TrimSpace(runGit(t, repo, "rev-parse", "HEAD"))

	writeTestFile(t, repo, "docs/current-plan.md", "modified\n")
	writeTestFile(t, repo, "internal/app/strategy_service.go", "package app\n")
	actual, err := gitWorktreeDelta(repo, base)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(actual, "\n") != "docs/current-plan.md\ninternal/app/strategy_service.go" {
		t.Fatalf("actual delta = %v; tracked and untracked paths were not both discovered", actual)
	}
	err = validateDeliveryManifest(actual, []string{"docs/current-plan.md"})
	if err == nil || !strings.Contains(err.Error(), "internal/app/strategy_service.go") {
		t.Fatalf("untracked path outside manifest was not rejected: %v", err)
	}
}

func gitWorktreeDelta(repo, base string) ([]string, error) {
	tracked, err := gitNULPaths(repo, "diff", "--relative", "--name-only", "-z", base, "--", ".")
	if err != nil {
		return nil, fmt.Errorf("collect tracked STR-01 delta: %w", err)
	}
	untracked, err := gitNULPaths(repo, "ls-files", "--others", "--exclude-standard", "-z", "--", ".")
	if err != nil {
		return nil, fmt.Errorf("collect untracked STR-01 delta: %w", err)
	}
	paths := append(tracked, untracked...)
	for index := range paths {
		paths[index] = normalizeRepoPath(paths[index])
	}
	sort.Strings(paths)
	return paths, nil
}

func gitNULPaths(repo string, arguments ...string) ([]string, error) {
	command := exec.Command("git", append([]string{"-C", repo}, arguments...)...)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	output, err := command.Output()
	if err != nil {
		return nil, fmt.Errorf("git %s: %w: %s", strings.Join(arguments, " "), err, strings.TrimSpace(stderr.String()))
	}
	var paths []string
	for _, item := range bytes.Split(output, []byte{0}) {
		if len(item) != 0 {
			paths = append(paths, string(item))
		}
	}
	return paths, nil
}

func runGit(t *testing.T, repo string, arguments ...string) string {
	t.Helper()
	command := exec.Command("git", append([]string{"-C", repo}, arguments...)...)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v: %s", strings.Join(arguments, " "), err, strings.TrimSpace(string(output)))
	}
	return string(output)
}

func writeTestFile(t *testing.T, root, relative, content string) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}
