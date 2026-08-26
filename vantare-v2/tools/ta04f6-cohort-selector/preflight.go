package main

import (
	"context"
	"os/exec"
	"path/filepath"
	"strings"
)

const protocolPlanGitPath = "vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f6-lap-cohort-plan.md"

type gitOutputV1 interface {
	Output(context.Context, ...string) (string, error)
}

type osGitV1 struct{ directory string }

func (g osGitV1) Output(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = g.directory
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func preflightGitV1(ctx context.Context, cfg ExistingConfigV1, git gitOutputV1, currentPlan []byte, expectedRoot string) error {
	if ctx == nil || git == nil || cfg.ProtocolSHA != protocolSHA || len(cfg.RunnerSHA) != 40 {
		return invalid()
	}
	root, err := git.Output(ctx, "rev-parse", "--show-toplevel")
	root = filepath.FromSlash(strings.TrimSpace(root))
	expectedRoot = filepath.FromSlash(strings.TrimSpace(expectedRoot))
	if err != nil || !filepath.IsAbs(root) || filepath.Clean(root) != root ||
		!filepath.IsAbs(expectedRoot) || filepath.Clean(expectedRoot) != expectedRoot || !samePathV1(root, expectedRoot) {
		return invalid()
	}
	branch, err := git.Output(ctx, "branch", "--show-current")
	branch = strings.TrimSpace(branch)
	if err != nil || branch != expectedBranch {
		return invalid()
	}
	status, err := git.Output(ctx, "status", "--porcelain")
	if err != nil || strings.TrimSpace(status) != "" {
		return invalid()
	}
	head, err := git.Output(ctx, "rev-parse", "HEAD")
	head = strings.TrimSpace(head)
	if err != nil || head != cfg.RunnerSHA {
		return invalid()
	}
	parents, err := git.Output(ctx, "rev-list", "--parents", "-n", "1", cfg.RunnerSHA)
	fields := strings.Fields(parents)
	if err != nil || len(fields) != 2 || fields[0] != cfg.RunnerSHA || fields[1] != protocolSHA {
		return invalid()
	}
	scope, err := git.Output(ctx, "diff-tree", "--no-commit-id", "--name-only", "-r", cfg.RunnerSHA)
	if err != nil || strings.TrimSpace(scope) == "" {
		return invalid()
	}
	for _, name := range strings.Fields(scope) {
		if !strings.HasPrefix(filepath.ToSlash(name), "vantare-v2/tools/ta04f6-cohort-selector/") {
			return invalid()
		}
	}
	committed, err := git.Output(ctx, "show", protocolSHA+":"+protocolPlanGitPath)
	if err != nil || committed != string(currentPlan) {
		return invalid()
	}
	return nil
}
