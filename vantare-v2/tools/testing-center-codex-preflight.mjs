import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PREFLIGHT_VERSION = "testing-center.codex-preflight.v1";
const SHA = /^[0-9a-f]{40}$/;
const TARGET_BRANCH = /^vantareapp\/isa-[0-9]+-[a-z0-9-]{1,60}$/;

function needsOwner(code, observed = {}) {
  return { contractVersion: PREFLIGHT_VERSION, status: "NEEDS_OWNER", code, observed };
}

export function parsePreflightArguments(argv) {
  const allowed = new Set(["--expected-head", "--expected-base", "--expected-target-branch"]);
  if (argv.length !== 6) throw new Error("preflight_arguments_invalid");
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!allowed.has(key) || values[key] !== undefined || argv[index + 1] === undefined) {
      throw new Error("preflight_arguments_invalid");
    }
    values[key] = argv[index + 1];
  }
  if (!SHA.test(values["--expected-head"]) || !SHA.test(values["--expected-base"]) ||
    !TARGET_BRANCH.test(values["--expected-target-branch"])) {
    throw new Error("preflight_arguments_invalid");
  }
  return {
    expectedHead: values["--expected-head"],
    expectedBase: values["--expected-base"],
    expectedTargetBranch: values["--expected-target-branch"],
  };
}

function normalizeRemote(value) {
  return value.trim().replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "").toLowerCase();
}

export function verifyCodexPreflight(options, dependencies) {
  const runGit = dependencies.runGit;
  const rootResult = runGit(["rev-parse", "--show-toplevel"]);
  if (rootResult.exitCode !== 0) return needsOwner("git_root_unavailable");
  const root = resolve(rootResult.stdout.trim());
  if (basename(root).toLowerCase() !== "vantare-simracing-suite" ||
    !dependencies.fileExists(resolve(root, "vantare-v2", "AGENTS.md")) ||
    !dependencies.fileExists(resolve(root, "supabase", "config.toml"))) {
    return needsOwner("repository_identity_mismatch");
  }

  const status = runGit(["status", "--porcelain"]);
  if (status.exitCode !== 0 || status.stdout.trim() !== "") {
    return needsOwner("worktree_not_clean");
  }
  const head = runGit(["rev-parse", "HEAD"]);
  if (head.exitCode !== 0 || head.stdout.trim() !== options.expectedHead) {
    return needsOwner("head_sha_mismatch", { headSha: head.stdout.trim().slice(0, 40) });
  }
  if (options.expectedBase !== options.expectedHead) {
    return needsOwner("base_sha_mismatch");
  }
  const ancestry = runGit(["merge-base", "--is-ancestor", options.expectedBase, "HEAD"]);
  if (ancestry.exitCode !== 0) return needsOwner("base_not_ancestor");

  const branch = runGit(["branch", "--show-current"]);
  const remote = runGit(["remote", "get-url", "origin"]);
  let remoteStatus = "unavailable";
  let requiresHumanRepositoryConfirmation = true;
  if (remote.exitCode === 0 && remote.stdout.trim() !== "") {
    if (normalizeRemote(remote.stdout) !== "https://github.com/isaacalbala12/vantare-simracing-suite") {
      return needsOwner("repository_remote_mismatch");
    }
    remoteStatus = "verified";
    requiresHumanRepositoryConfirmation = false;
  }

  return {
    contractVersion: PREFLIGHT_VERSION,
    status: "READY",
    repository: "isaacalbala12/Vantare-Simracing-Suite",
    headSha: options.expectedHead,
    baseSha: options.expectedBase,
    targetBranch: options.expectedTargetBranch,
    observedLocalBranch: branch.exitCode === 0 ? branch.stdout.trim() : "",
    remoteStatus,
    requiresHumanRepositoryConfirmation,
  };
}

function realGit(args) {
  try {
    return {
      exitCode: 0,
      stdout: execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    };
  } catch (error) {
    return { exitCode: Number(error?.status ?? 1), stdout: String(error?.stdout ?? "") };
  }
}

export function runPreflightCli(argv) {
  let result;
  try {
    result = verifyCodexPreflight(parsePreflightArguments(argv), {
      runGit: realGit,
      fileExists: existsSync,
    });
  } catch {
    result = needsOwner("preflight_arguments_invalid");
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.status === "READY" ? 0 : 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runPreflightCli(process.argv.slice(2));
}
