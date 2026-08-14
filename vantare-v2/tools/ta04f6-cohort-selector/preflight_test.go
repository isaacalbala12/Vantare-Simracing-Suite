package main

import (
	"context"
	"errors"
	"runtime"
	"strings"
	"testing"
)

type fakeGitV1 struct {
	answers map[string]string
	calls   []string
}

func (f *fakeGitV1) Output(_ context.Context, args ...string) (string, error) {
	k := strings.Join(args, " ")
	f.calls = append(f.calls, k)
	if value, ok := f.answers[k]; ok {
		return value, nil
	}
	return "", errors.New("git failed")
}

func validGitFakeV1() *fakeGitV1 {
	return &fakeGitV1{answers: map[string]string{
		"rev-parse --show-toplevel":                          `C:\repo`,
		"branch --show-current":                              expectedBranch,
		"status --porcelain":                                 "",
		"rev-parse HEAD":                                     strings.Repeat("a", 40),
		"rev-list --parents -n 1 " + strings.Repeat("a", 40): strings.Repeat("a", 40) + " " + protocolSHA,
		"diff-tree --no-commit-id --name-only -r " + strings.Repeat("a", 40):                                             "vantare-v2/tools/ta04f6-cohort-selector/main.go\n",
		"show " + protocolSHA + ":vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f6-lap-cohort-plan.md": "plan\n",
	}}
}

func TestGitPreflightAcceptsOnlyExactTopologyAndScope(t *testing.T) {
	g := validGitFakeV1()
	cfg := ExistingConfigV1{ProtocolSHA: protocolSHA, RunnerSHA: strings.Repeat("a", 40)}
	if err := preflightGitV1(context.Background(), cfg, g, []byte("plan\n"), `C:\repo`); err != nil {
		t.Fatal(err)
	}
	for name, mutate := range map[string]func(*fakeGitV1){
		"dirty":  func(g *fakeGitV1) { g.answers["status --porcelain"] = "?? secret" },
		"branch": func(g *fakeGitV1) { g.answers["branch --show-current"] = "nightly" },
		"merge": func(g *fakeGitV1) {
			g.answers["rev-list --parents -n 1 "+strings.Repeat("a", 40)] += " " + strings.Repeat("b", 40)
		},
		"scope": func(g *fakeGitV1) {
			g.answers["diff-tree --no-commit-id --name-only -r "+strings.Repeat("a", 40)] += "vantare-v2/internal/private.go\n"
		},
		"blob": func(g *fakeGitV1) {
			g.answers["show "+protocolSHA+":vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f6-lap-cohort-plan.md"] = "changed"
		},
	} {
		t.Run(name, func(t *testing.T) {
			bad := validGitFakeV1()
			mutate(bad)
			if err := preflightGitV1(context.Background(), cfg, bad, []byte("plan\n"), `C:\repo`); err == nil {
				t.Fatal("accepted")
			}
		})
	}
}

func TestGitPreflightAcceptsGitForWindowsRootSeparators(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Git for Windows path semantics")
	}
	g := validGitFakeV1()
	g.answers["rev-parse --show-toplevel"] = `C:/repo`
	cfg := ExistingConfigV1{ProtocolSHA: protocolSHA, RunnerSHA: strings.Repeat("a", 40)}
	if err := preflightGitV1(context.Background(), cfg, g, []byte("plan\n"), `C:\REPO`); err != nil {
		t.Fatal(err)
	}
}

func TestGitPreflightRejectsRelativeAndUncleanRoots(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows path semantics")
	}
	cfg := ExistingConfigV1{ProtocolSHA: protocolSHA, RunnerSHA: strings.Repeat("a", 40)}
	for _, root := range []string{`repo`, `C:/repo/../repo`} {
		t.Run(root, func(t *testing.T) {
			g := validGitFakeV1()
			g.answers["rev-parse --show-toplevel"] = root
			if err := preflightGitV1(context.Background(), cfg, g, []byte("plan\n"), `C:\repo`); err == nil {
				t.Fatal("accepted invalid root")
			}
		})
	}
}

func TestGitPreflightRejectsUnexpectedRoot(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows path semantics")
	}
	g := validGitFakeV1()
	cfg := ExistingConfigV1{ProtocolSHA: protocolSHA, RunnerSHA: strings.Repeat("a", 40)}
	if err := preflightGitV1(context.Background(), cfg, g, []byte("plan\n"), `C:\other`); err == nil {
		t.Fatal("accepted unexpected root")
	}
}
