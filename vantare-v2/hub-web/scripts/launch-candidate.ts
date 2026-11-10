import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { requiredPath } from "./qa-paths.ts";

const root = requiredPath("VANTARE_HUB_CANDIDATE_ROOT");
await readFile(join(root, "QA-ONLY.txt"));
const state = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
const id = state.active.generation;
if (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id))
  throw new Error("Invalid QA generation");
const generation = join(root, "generations", id);
const data = join(generation, "data");
const hub = join(data, "hub");
await mkdir(hub, { recursive: true });
const env: Record<string, string> = {};
for (const key of [
  "SystemRoot",
  "SystemDrive",
  "WINDIR",
  "PATH",
  "PATHEXT",
  "COMSPEC",
  "USERPROFILE",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "SESSIONNAME",
])
  if (process.env[key]) env[key] = process.env[key];
Object.assign(env, {
  VANTARE_NATIVE_DATA_ROOT: data,
  VANTARE_BOOT_TOKEN: randomBytes(16).toString("hex"),
  LOCALAPPDATA: join(data, "local"),
  APPDATA: join(data, "roaming"),
});
const child = spawn(
  join(generation, "bin/vantare-hub.exe"),
  [
    "--control-stdin",
    "--data-dir",
    hub,
    "--layout",
    join(data, "layout.json"),
    "--pipe",
    `vantare-isolated-${randomBytes(16).toString("hex")}`,
  ],
  { env, windowsHide: true, stdio: ["pipe", "ignore", "inherit"] },
);
process.stdin.pipe(child.stdin);
process.once("SIGINT", () => child.stdin.end());
const code = await new Promise<number | null>((accept, reject) => {
  child.once("error", reject);
  child.once("exit", accept);
});
process.stdin.unpipe(child.stdin);
process.stdin.pause();
process.exitCode = code ?? 1;
