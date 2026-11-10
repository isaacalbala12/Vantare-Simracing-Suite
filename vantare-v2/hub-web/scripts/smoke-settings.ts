import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { checkSettingsHost } from "./check-settings-host.ts";
import { requiredPath } from "./qa-paths.ts";
import { until } from "./wait-for.ts";

const base = requiredPath("VANTARE_HUB_QA_ROOT");
const root = join(base, `standalone-${randomBytes(8).toString("hex")}`);
const data = join(root, "data");
const hub = join(data, "hub");
const evidence =
  process.env.VANTARE_HUB_EVIDENCE ?? resolve("test-results/settings-native");
await mkdir(hub, { recursive: true });
await mkdir(evidence, { recursive: true });
if (process.env.VANTARE_HUB_SETTINGS_PROTECTED === "1")
  await writeFile(join(hub, "hub-settings.json"), '{"version":999}');
if (process.env.VANTARE_HUB_STARTUP_TEST === "1")
  execFileSync(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      resolve("scripts/prepare-startup-qa.ps1"),
      "-Root",
      root,
      "-Generation",
      randomBytes(16).toString("hex"),
    ],
    { windowsHide: true },
  );
const env: Record<string, string> = {};
for (const name of [
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
  if (process.env[name]) env[name] = process.env[name] as string;
Object.assign(env, {
  VANTARE_NATIVE_DATA_ROOT: data,
  LOCALAPPDATA: join(root, "local"),
  APPDATA: join(root, "roaming"),
  VANTARE_HUB_UI: resolve(
    "release/package-qa/vantare-hub-ui-win32-x64/vantare-hub-ui.exe",
  ),
  VANTARE_HUB_QA_SCALE: process.env.VANTARE_HUB_SCALE ?? "1",
});
if (process.env.VANTARE_HUB_STARTUP_TEST === "1")
  Object.assign(env, {
    VANTARE_BETA_ROOT: join(root, "installer-fixture"),
    VANTARE_INSTALLER_QA_CONTEXT: join(
      root,
      "installer-fixture/qa-context.json",
    ),
  });
const executable = join(root, "vantare-hub.exe");
const source = requiredPath("VANTARE_HUB_HOST_BINARY");
if (resolve(source).toLowerCase() !== resolve(executable).toLowerCase())
  await copyFile(source, executable);
const child = spawn(
  executable,
  [
    "--control-stdin",
    "--pipe",
    `vantare-settings-${randomBytes(16).toString("hex")}`,
    "--data-dir",
    hub,
    "--layout",
    join(data, "layout.json"),
  ],
  { env, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
);
const stderr: string[] = [];
child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
try {
  let endpoint = "";
  await until(
    async () => {
      if (child.exitCode !== null)
        throw new Error(`Host exited ${child.exitCode}`);
      try {
        endpoint =
          (await readFile(join(hub, "hub-ui-qa.log"), "utf8")).match(
            /DevTools listening on (ws:\/\/[^\s]+)/,
          )?.[1] ?? "";
        return !!endpoint;
      } catch {
        return false;
      }
    },
    60000,
    "packaged UI starts from stable path",
  );
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  await page
    .getByRole("status")
    .filter({ hasText: "Núcleo no disponible" })
    .waitFor();
  await checkSettingsHost(page, hub, evidence, join(root, "installer-fixture"));
  child.stdin.end();
  await until(() => child.exitCode !== null, 10000, "host closes on EOF");
  assert.equal(child.exitCode, 0);
  await writeFile(
    join(evidence, "stable-host.json"),
    JSON.stringify({
      passed: true,
      root,
      packagedUI: true,
      realRust: true,
      controlEofExit: 0,
    }),
  );
} finally {
  await writeFile(join(evidence, "native-stderr.log"), stderr.join(""));
  try {
    await writeFile(
      join(evidence, "phases.log"),
      await readFile(join(hub, "hub-host-qa.log"), "utf8"),
    );
  } catch {
    /* Phase file can be absent if creation itself fails. */
  }
  await browser?.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
