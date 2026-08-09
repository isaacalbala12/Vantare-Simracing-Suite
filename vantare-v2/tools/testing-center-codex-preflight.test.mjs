import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePreflightArguments,
  verifyCodexPreflight,
} from "./testing-center-codex-preflight.mjs";

const sha = "a".repeat(40);
const options = {
  expectedHead: sha,
  expectedBase: sha,
  expectedTargetBranch: "vantareapp/isa-999-correction",
};

function dependencies(overrides = {}) {
  const responses = new Map([
    ["rev-parse --show-toplevel", { exitCode: 0, stdout: "/workspace/Vantare-Simracing-Suite\n" }],
    ["status --porcelain", { exitCode: 0, stdout: "" }],
    ["rev-parse HEAD", { exitCode: 0, stdout: `${sha}\n` }],
    [`merge-base --is-ancestor ${sha} HEAD`, { exitCode: 0, stdout: "" }],
    ["branch --show-current", { exitCode: 0, stdout: "work\n" }],
    ["remote get-url origin", { exitCode: 0, stdout: "git@github.com:isaacalbala12/Vantare-Simracing-Suite.git\n" }],
  ]);
  for (const [key, value] of Object.entries(overrides)) responses.set(key, value);
  return {
    runGit(args) {
      return responses.get(args.join(" ")) ?? { exitCode: 1, stdout: "" };
    },
    fileExists(path) {
      return path.endsWith("AGENTS.md") || path.endsWith("config.toml");
    },
  };
}

test("accepts Codex Cloud work branch when exact SHA and remote match", () => {
  const result = verifyCodexPreflight(options, dependencies());
  assert.equal(result.status, "READY");
  assert.equal(result.observedLocalBranch, "work");
  assert.equal(result.remoteStatus, "verified");
  assert.equal(result.requiresHumanRepositoryConfirmation, false);
});

test("missing remote requires the external repository selection confirmation", () => {
  const result = verifyCodexPreflight(options, dependencies({
    "remote get-url origin": { exitCode: 2, stdout: "" },
  }));
  assert.equal(result.status, "READY");
  assert.equal(result.remoteStatus, "unavailable");
  assert.equal(result.requiresHumanRepositoryConfirmation, true);
});

test("dirty tree, wrong head and wrong remote fail closed", () => {
  assert.equal(verifyCodexPreflight(options, dependencies({
    "status --porcelain": { exitCode: 0, stdout: " M file.ts\n" },
  })).code, "worktree_not_clean");
  assert.equal(verifyCodexPreflight(options, dependencies({
    "rev-parse HEAD": { exitCode: 0, stdout: `${"b".repeat(40)}\n` },
  })).code, "head_sha_mismatch");
  assert.equal(verifyCodexPreflight(options, dependencies({
    "remote get-url origin": { exitCode: 0, stdout: "https://github.com/example/other.git\n" },
  })).code, "repository_remote_mismatch");
});

test("argument parser rejects extras and malformed refs", () => {
  assert.deepEqual(parsePreflightArguments([
    "--expected-head", sha,
    "--expected-base", sha,
    "--expected-target-branch", options.expectedTargetBranch,
  ]), options);
  assert.throws(() => parsePreflightArguments([
    "--expected-head", sha,
    "--expected-base", sha,
    "--unexpected", "value",
  ]), /preflight_arguments_invalid/);
});
