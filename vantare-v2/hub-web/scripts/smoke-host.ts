import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { cp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { chromium } from "playwright-core";
import {
  checkSettingsHost,
  waitForIsolatedCore,
} from "./check-settings-host.ts";
import { hostVersion, sealQaGeneration } from "./qa-inventory.ts";
import { requiredPath } from "./qa-paths.ts";
import { until } from "./wait-for.ts";

const qa = requiredPath("VANTARE_HUB_QA_ROOT");
const evidence = process.env.VANTARE_HUB_EVIDENCE
  ? requiredPath("VANTARE_HUB_EVIDENCE")
  : resolve("test-results/host");
await mkdir(evidence, { recursive: true });
const root = join(qa, `installed-${randomBytes(8).toString("hex")}`);
const generation = join(root, "generations", randomBytes(16).toString("hex"));
const data = join(generation, "data");
const hubData = join(data, "hub");
await mkdir(join(generation, "bin"), { recursive: true });
await mkdir(hubData, { recursive: true });
if (process.env.VANTARE_HUB_SETTINGS_PROTECTED === "1")
  await writeFile(join(hubData, "hub-settings.json"), '{"version":999}');
// P6 (#2785): Windows start with "start minimized" saved, as the launcher does
// with --background. Confirmation must still arrive from a minimized window.
const background = process.env.VANTARE_HUB_BACKGROUND === "1";
if (background) {
  if (
    process.env.VANTARE_HUB_SETTINGS_PROTECTED === "1" ||
    process.env.VANTARE_HUB_SETTINGS_TEST === "1"
  )
    throw new Error("Background smoke uses its own settings");
  const settings = JSON.parse(
    await readFile(
      resolve("../native/hub-host/fixtures/writer-bytes/hub-settings.json"),
      "utf8",
    ),
  );
  settings.general.minimized = true;
  await writeFile(join(hubData, "hub-settings.json"), JSON.stringify(settings));
}
await cp(
  requiredPath("VANTARE_HUB_HOST_BINARY"),
  join(generation, "bin/vantare-hub.exe"),
);
await cp(
  resolve("release/package-qa/vantare-hub-ui-win32-x64"),
  join(generation, "hub-ui"),
  { recursive: true },
);
if (process.env.VANTARE_HUB_STARTUP_TEST === "1") {
  execFileSync(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      resolve("scripts/prepare-startup-qa.ps1"),
      "-Root",
      root,
      "-Generation",
      basename(generation),
    ],
    { windowsHide: true },
  );
}
if (
  process.env.VANTARE_HUB_SETTINGS_TEST === "1" &&
  process.env.VANTARE_HUB_LAYOUT_MISSING !== "1"
)
  await cp(
    resolve("../native/ui/fixtures/layout.json"),
    join(data, "layout.json"),
  );
const boot = randomBytes(16).toString("hex");
await sealQaGeneration(
  root,
  basename(generation),
  "0".repeat(40),
  hostVersion(join(generation, "bin/vantare-hub.exe")),
);
await writeFile(join(root, "boot-pending.json"), "{}");
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
  LOCALAPPDATA: join(qa, "local"),
  APPDATA: join(qa, "roaming"),
  VANTARE_BOOT_TOKEN: boot,
  VANTARE_HUB_QA_SCALE: process.env.VANTARE_HUB_SCALE ?? "1",
});
if (background) env.VANTARE_BACKGROUND_STARTUP = "1";
else env.VANTARE_INTERACTIVE_STARTUP = "1";
if (process.env.VANTARE_HUB_STARTUP_TEST === "1") {
  env.VANTARE_BETA_ROOT = join(root, "installer-fixture");
  env.VANTARE_INSTALLER_QA_CONTEXT = join(
    root,
    "installer-fixture",
    "qa-context.json",
  );
}
const host = spawn(
  join(generation, "bin/vantare-hub.exe"),
  [
    "--control-stdin",
    "--pipe",
    `vantare-qa-${randomBytes(16).toString("hex")}`,
    "--data-dir",
    hubData,
    "--layout",
    join(data, "layout.json"),
  ],
  // Installed, nothing may depend on the checkout: start from the QA root.
  { cwd: root, env, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
);
const nativeLog: string[] = [];
host.stderr.on("data", (chunk) => nativeLog.push(chunk.toString()));
const startedAt = Date.now();
const endpoint = await new Promise<string>((accept, reject) => {
  // First launch from a fresh QA generation also includes Windows image loading.
  // Keep the bound explicit and record the measured time instead of hiding slow boots.
  const deadline = Date.now() + 60000;
  let reading = false;
  const timer = setInterval(() => {
    if (reading) return;
    reading = true;
    void readFile(join(hubData, "hub-ui-qa.log"), "utf8")
      .then((log) => {
        const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearInterval(timer);
          accept(match[1]);
        }
      })
      .catch(() => {})
      .finally(() => {
        reading = false;
        if (Date.now() > deadline) {
          clearInterval(timer);
          host.kill();
          reject(new Error("Host startup timed out"));
        }
      });
  }, 50);
  host.once("error", (error) => {
    clearInterval(timer);
    reject(error);
  });
  host.once("exit", (code) => {
    clearInterval(timer);
    reject(new Error(`Host exited early ${code}`));
  });
}).catch(async (error: unknown) => {
  await writeFile(join(evidence, "native-stderr.log"), nativeLog.join(""));
  throw error;
});
const initialBootMs = Date.now() - startedAt;
const browser = await chromium.connectOverCDP(endpoint);
try {
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  await waitForIsolatedCore(page);
  await until(
    async () => {
      try {
        return (await readFile(join(root, "hub-ready"), "utf8")) === boot;
      } catch {
        return false;
      }
    },
    10000,
    "host publishes matching ready token",
  );
  await unlink(join(root, "boot-pending.json"));
  // Minimized at startup: Chromium reports the document as hidden.
  const visibility = await page.evaluate(() => document.visibilityState);
  if (background !== (visibility === "hidden"))
    throw new Error(`Unexpected window visibility: ${visibility}`);
  // Positive control: the same query must see the live host of the generation,
  // so an empty answer after the exit really means no survivors.
  if (!generationProcesses(generation).includes(host.pid ?? -1))
    throw new Error("Process query cannot see the running host");
  // A minimized window has nothing to capture.
  if (!background)
    await page.screenshot({ path: join(evidence, "host-local.png") });
  const isolation = await page.evaluate(() => ({
    node: typeof (globalThis as Record<string, unknown>).require,
    bridge: Object.keys(window.vantare ?? {}),
  }));
  if (isolation.node !== "undefined") throw new Error("Renderer has Node");
  if (process.env.VANTARE_HUB_SETTINGS_TEST === "1")
    await checkSettingsHost(
      page,
      hubData,
      evidence,
      join(root, "installer-fixture"),
    );
  const crash = process.env.VANTARE_HUB_QA_CRASH === "1";
  if (crash) {
    const debug = await context.newCDPSession(page);
    await debug.send("Page.crash").catch(() => {});
  } else host.stdin.end();
  await until(
    () => host.exitCode !== null,
    10000,
    crash ? "renderer crash propagates to host" : "host exits on stdin EOF",
  );
  assert.equal(host.exitCode, crash ? 1 : 0);
  // Zero orphans: no process may keep running an image of this generation.
  // Read-only query by executable path; this smoke never kills by name.
  let survivors: number[] = [];
  await until(
    () => {
      survivors = generationProcesses(generation);
      return survivors.length === 0;
    },
    10000,
    "no process of the generation survives the host",
  ).catch((error: unknown) => {
    throw new Error(`${String(error)}: PIDs ${survivors.join(", ")}`);
  });
  await writeFile(
    join(evidence, crash ? "host-crash.json" : "host-smoke.json"),
    JSON.stringify(
      {
        passed: true,
        initialBootMs,
        privateTransport: true,
        readyAfterVisible: true,
        background,
        windowVisibility: visibility,
        cwd: "QA root, outside the checkout",
        generationProcessesWhileRunning: "host seen (positive control)",
        generationProcessesAfterExit: 0,
        controlEofExit: crash ? null : 0,
        rendererCrashExit: crash ? 1 : null,
        core: "unavailable (isolated pipe; no real services)",
        ...isolation,
      },
      null,
      2,
    ),
  );
} finally {
  await writeFile(join(evidence, "native-stderr.log"), nativeLog.join(""));
  await browser.close().catch(() => {});
  if (host.exitCode === null) host.kill();
}

function generationProcesses(generation: string): number[] {
  const output = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Where-Object ExecutablePath | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  const found: unknown = JSON.parse(output || "[]");
  // Compare resolved paths: 8.3 names and junctions must not hide a survivor.
  const real = (path: string) => {
    try {
      return realpathSync.native(path).toLowerCase();
    } catch {
      return path.toLowerCase();
    }
  };
  const prefix = real(generation) + sep;
  return (Array.isArray(found) ? found : [found])
    .filter(
      (item): item is { ProcessId: number; ExecutablePath: string } =>
        typeof item?.ExecutablePath === "string" &&
        real(item.ExecutablePath).startsWith(prefix),
    )
    .map((item) => item.ProcessId);
}
