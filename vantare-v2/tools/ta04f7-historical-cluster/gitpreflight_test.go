package main

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

const branchRef = "work/ta04f-repetition-variance"

// scriptedGit answers the five preflight probes with fixed metadata. It never
// runs a command and never touches data.
func scriptedGit(toplevel, branch, head, parent, status string) gitRunner {
	return func(_ context.Context, args ...string) ([]byte, error) {
		key := strings.Join(args, " ")
		switch key {
		case "rev-parse --show-toplevel":
			return []byte(toplevel + "\n"), nil
		case "branch --show-current":
			return []byte(branch + "\n"), nil
		case "rev-parse HEAD":
			return []byte(head + "\n"), nil
		case "rev-parse HEAD^":
			return []byte(parent + "\n"), nil
		case "status --porcelain":
			return []byte(status), nil
		}
		return nil, fmt.Errorf("unexpected probe %q", key)
	}
}

// The regression that the second gate 3 attempt exposed: a child runner whose
// parent is its own erratum must be accepted, and the legacy anchor must not be
// applied to it.
func TestGitPreflightAnchorsToTheInvokedProtocol(t *testing.T) {
	const project = `C:\repo\vantare-v2`
	const runner = "0123456789012345678901234567890123456789"
	top := filepath.Dir(project)
	cfg := func(protocol string) RunConfig {
		return RunConfig{ProtocolSHA: protocol, RunnerSHA: runner, ProjectDir: project}
	}
	for _, tc := range []struct {
		name           string
		parent, status string
		cfgProtocol    string
		accept         bool
	}{
		{"shape child runner on its erratum", shapeProtocolSHA, "", shapeProtocolSHA, true},
		{"legacy ta04f7 runner on its own protocol", protocolSHA, "", protocolSHA, true},
		{"shape parent judged by the legacy anchor", shapeProtocolSHA, "", protocolSHA, false},
		{"legacy parent judged by the shape anchor", protocolSHA, "", shapeProtocolSHA, false},
		{"unrelated parent", "1111111111111111111111111111111111111111", "", shapeProtocolSHA, false},
		{"dirty worktree", shapeProtocolSHA, " M tools/x.go\n", shapeProtocolSHA, false},
	} {
		err := gitPreflight(context.Background(), cfg(tc.cfgProtocol), scriptedGit(top, branchRef, runner, tc.parent, tc.status))
		if tc.accept && err != nil {
			t.Fatalf("%s: rejected: %v", tc.name, err)
		}
		if !tc.accept && err == nil {
			t.Fatalf("%s: accepted", tc.name)
		}
	}
	// the remaining probes stay authoritative
	for _, bad := range []struct {
		name            string
		top, branch, hd string
	}{
		{"wrong toplevel", `C:\elsewhere`, branchRef, runner},
		{"wrong branch", top, "nightly", runner},
		{"wrong runner", top, branchRef, "ffffffffffffffffffffffffffffffffffffffff"},
	} {
		if err := gitPreflight(context.Background(), cfg(shapeProtocolSHA), scriptedGit(bad.top, bad.branch, bad.hd, shapeProtocolSHA, "")); err == nil {
			t.Fatalf("%s: accepted", bad.name)
		}
	}
	if err := gitPreflight(context.Background(), cfg(shapeProtocolSHA), func(context.Context, ...string) ([]byte, error) {
		return nil, fmt.Errorf("git missing")
	}); err == nil {
		t.Fatal("failing git accepted")
	}
}

// realGit answers from the actual worktree. Metadata only: five read-only git
// probes, no LMU resolution, no staging, no discovery, no DuckDB.
func realGit(t *testing.T) (gitRunner, string) {
	t.Helper()
	project, err := filepath.Abs("..")
	if err != nil {
		t.Fatal(err)
	}
	project = filepath.Dir(project) // tools/<pkg> -> vantare-v2
	run := func(ctx context.Context, args ...string) ([]byte, error) {
		return exec.CommandContext(ctx, "git", append([]string{"-C", project}, args...)...).Output()
	}
	return run, project
}

func gitOut(t *testing.T, run gitRunner, args ...string) string {
	t.Helper()
	o, err := run(context.Background(), args...)
	if err != nil {
		t.Skipf("git unavailable: %v", err)
	}
	return strings.TrimSpace(string(o))
}

// The behavioural counterpart on the real clean worktree: the runner commit and
// its erratum parent must satisfy the preflight under a shape RunConfig.
func TestGitPreflightAcceptsThisLiveRunnerOnTheRealWorktree(t *testing.T) {
	run, project := realGit(t)
	if s := gitOut(t, run, "status", "--porcelain"); s != "" {
		t.Skipf("worktree not clean, gate 3 preflight cannot be evaluated:\n%s", s)
	}
	if b := gitOut(t, run, "branch", "--show-current"); b != branchRef {
		t.Skipf("branch %q", b)
	}
	head := gitOut(t, run, "rev-parse", "HEAD")
	parent := gitOut(t, run, "rev-parse", "HEAD^")
	if parent != liveAuthorizationSHA {
		t.Fatalf("HEAD^ = %s, but the runner is pinned to authorization %s", parent, liveAuthorizationSHA)
	}
	shape := RunConfig{ProtocolSHA: liveProtocolSHA, AuthorizationSHA: liveAuthorizationSHA, RunnerSHA: head, ProjectDir: project, Mode: liveShapeMode}
	if err := gitPreflight(context.Background(), shape, run); err != nil {
		t.Fatalf("shape preflight rejected on a clean worktree: %v", err)
	}
	// the legacy anchor must not be accepted for this runner
	legacy := RunConfig{ProtocolSHA: protocolSHA, RunnerSHA: head, ProjectDir: project}
	if err := gitPreflight(context.Background(), legacy, run); err == nil {
		t.Fatal("legacy protocol accepted for a shape runner")
	}
	// a wrong parent is rejected
	wrong := RunConfig{ProtocolSHA: "1111111111111111111111111111111111111111", RunnerSHA: head, ProjectDir: project}
	if err := gitPreflight(context.Background(), wrong, run); err == nil {
		t.Fatal("wrong parent accepted")
	}
}
