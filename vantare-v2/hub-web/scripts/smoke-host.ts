import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { until } from "./wait-for.ts";

const qa =
  process.env.VANTARE_HUB_QA_ROOT ?? "D:/VantareServer/qa/isa-1995-puente";
if (!resolve(qa).toLowerCase().startsWith("d:\\vantareserver\\qa\\"))
  throw new Error("QA root required");
const evidence =
  process.env.VANTARE_HUB_EVIDENCE ??
  "D:/VantareServer/evidence/hub-web/puente";
await mkdir(evidence, { recursive: true });
const root = join(qa, `installed-${randomBytes(8).toString("hex")}`);
const generation = join(root, "generations", randomBytes(16).toString("hex"));
const data = join(generation, "data");
const hubData = join(data, "hub");
await mkdir(join(generation, "bin"), { recursive: true });
await mkdir(hubData, { recursive: true });
await cp(
  process.env.VANTARE_HUB_HOST_BINARY ??
    "D:/VantareServer/targets/isa-1995-puente/debug/vantare-hub-host.exe",
  join(generation, "bin/vantare-hub.exe"),
);
await cp(
  resolve("release/package-qa/vantare-hub-ui-win32-x64"),
  join(generation, "hub-ui"),
  { recursive: true },
);
const boot = randomBytes(16).toString("hex");
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
});
const host = spawn(
  join(generation, "bin/vantare-hub.exe"),
  [
    "--control-stdin",
    "--pipe",
    `vantare-qa-${randomBytes(16).toString("hex")}`,
    "--data-dir",
    hubData,
  ],
  { env, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
);
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
});
const initialBootMs = Date.now() - startedAt;
const browser = await chromium.connectOverCDP(endpoint);
try {
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  await page
    .getByRole("status")
    .filter({ hasText: "Núcleo no disponible" })
    .waitFor();
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
  await page.screenshot({ path: join(evidence, "host-local.png") });
  const isolation = await page.evaluate(() => ({
    node: typeof (globalThis as Record<string, unknown>).require,
    bridge: Object.keys(window.vantare ?? {}),
  }));
  if (isolation.node !== "undefined") throw new Error("Renderer has Node");
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
  await writeFile(
    join(evidence, crash ? "host-crash.json" : "host-smoke.json"),
    JSON.stringify(
      {
        passed: true,
        initialBootMs,
        privateTransport: true,
        readyAfterVisible: true,
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
  await browser.close().catch(() => {});
  if (host.exitCode === null) host.kill();
}
