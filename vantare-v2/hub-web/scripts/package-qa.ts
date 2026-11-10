import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sealQaGeneration } from "./qa-inventory.ts";
import { requiredPath } from "./qa-paths.ts";

if (process.env.VANTARE_HUB_QA_BUILD !== "1")
  throw new Error("QA build required");
const root = join(
  requiredPath("VANTARE_HUB_QA_ROOT"),
  `candidate-${randomBytes(8).toString("hex")}`,
);
const generation = randomBytes(16).toString("hex");
const directory = join(root, "generations", generation);
await mkdir(join(directory, "bin"), { recursive: true });
await mkdir(join(directory, "data"));
await cp(
  requiredPath("VANTARE_HUB_HOST_BINARY"),
  join(directory, "bin/vantare-hub.exe"),
);
await cp(
  resolve("release/package-qa/vantare-hub-ui-win32-x64"),
  join(directory, "hub-ui"),
  { recursive: true },
);
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
  windowsHide: true,
}).trim();
const profile = process.env.VANTARE_HUB_BUILD_PROFILE;
if (profile !== "Debug" && profile !== "Release")
  throw new Error("VANTARE_HUB_BUILD_PROFILE must match the host artifact");
const members = await sealQaGeneration(root, generation, source, profile);
await writeFile(
  join(root, "QA-ONLY.txt"),
  "VANTA-138: candidato aislado. Sin instalador, registro ni distribución.\n",
);
execFileSync(
  "pwsh",
  ["-NoProfile", "-File", resolve("scripts/zip-qa.ps1"), "-Root", root],
  { windowsHide: true },
);
console.log(
  JSON.stringify({
    root,
    zip: `${root}.zip`,
    zipBytes: (await stat(`${root}.zip`)).size,
    generation,
    files: members.length,
    bytes: members.reduce((total, member) => total + member.size, 0),
  }),
);
