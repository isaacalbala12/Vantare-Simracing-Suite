import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export function measurementBuild() {
  const enabled = process.env.VANTARE_HUB_MEASUREMENT_HOME === "1";
  if (!enabled) return { enabled: false, provenance: "" };
  if (process.env.VANTARE_HUB_QA_BUILD !== "1")
    throw new Error("Measurement requires the isolated QA build");
  const cwd = resolve(import.meta.dirname, "..");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const sha = git("rev-parse", "HEAD");
  if (git("status", "--porcelain"))
    throw new Error("Commit measurement sources before building");
  return {
    enabled: true,
    provenance: `VANTARE_BUILD;sha=${sha};dirty=false;profile=release;electron=45.2.3;mock=1;home=1`,
  };
}
