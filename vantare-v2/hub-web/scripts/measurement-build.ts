import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export function hasMeasurementSourceChanges(status: string): boolean {
  // electron-vite 6 creates this module while importing the tracked config,
  // then removes it. Keep every other untracked file and all tracked changes.
  const temporaryConfig =
    /^\?\? vantare-v2\/hub-web\/electron\.vite\.config\.ts\.\d+-[a-f0-9]+\.mjs$/u;
  return status
    .split(/\r?\n/u)
    .some((line) => line.trim() !== "" && !temporaryConfig.test(line));
}

export function measurementBuild() {
  const enabled = process.env.VANTARE_HUB_MEASUREMENT_HOME === "1";
  if (!enabled) return { enabled: false, provenance: "" };
  if (process.env.VANTARE_HUB_QA_BUILD !== "1")
    throw new Error("Measurement requires the isolated QA build");
  const cwd = resolve(import.meta.dirname, "..");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const sha = git("rev-parse", "HEAD");
  if (
    hasMeasurementSourceChanges(
      git("status", "--porcelain", "--untracked-files=all"),
    )
  )
    throw new Error("Commit measurement sources before building");
  return {
    enabled: true,
    provenance: `VANTARE_BUILD;sha=${sha};dirty=false;profile=release;electron=45.2.3;mock=1;home=1`,
  };
}
