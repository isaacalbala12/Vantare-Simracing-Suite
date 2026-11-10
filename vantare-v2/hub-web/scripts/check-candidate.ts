import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { requiredPath } from "./qa-paths.ts";
import { until } from "./wait-for.ts";

const root = requiredPath("VANTARE_HUB_CANDIDATE_ROOT");
const evidence = requiredPath("VANTARE_HUB_EVIDENCE");
await mkdir(evidence, { recursive: true });
const state = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
const id = state.active.generation;
assert.match(id, /^[a-f0-9]{32}$/);
const generation = join(root, "generations", id);
const log = join(generation, "data/hub/hub-ui-qa.log");
await unlink(log).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});
const child = spawn(
  process.execPath,
  ["--experimental-strip-types", resolve("scripts/launch-candidate.ts")],
  { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
);
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
const exited = new Promise<number | null>((accept, reject) => {
  child.once("exit", accept);
  child.once("error", reject);
});
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
try {
  let endpoint = "";
  await until(
    async () => {
      if (child.exitCode !== null)
        throw new Error(`candidate exited ${child.exitCode}: ${stderr}`);
      const text = await readFile(log, "utf8").catch(() => "");
      endpoint = text.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? "";
      return !!endpoint;
    },
    60000,
    "sealed candidate UI",
  );
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  await page.getByRole("tab", { name: "General", exact: true }).waitFor();
  assert.equal(context.pages().length, 1);
  await page.screenshot({ path: join(evidence, "candidate-settings.png") });
  const session = await browser.newBrowserCDPSession();
  const pids = (
    await session.send("SystemInfo.getProcessInfo")
  ).processInfo.map((process) => process.id);
  await session.detach();
  await browser.close();
  browser = undefined;
  child.stdin.end();
  await until(
    () => child.exitCode !== null,
    10000,
    "sealed candidate controlled close",
  );
  assert.equal(await exited, 0);
  const alive = () =>
    pids.filter((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
  await until(
    () => alive().length === 0,
    10000,
    "all candidate Electron processes exit",
  );
  const manifest = await readFile(join(generation, "manifest.json"));
  await writeFile(
    join(evidence, "candidate-smoke.json"),
    JSON.stringify(
      {
        passed: true,
        root,
        generation: id,
        manifestSha256: createHash("sha256").update(manifest).digest("hex"),
        visibleSettings: true,
        controlledExit: 0,
        electronPids: pids,
        survivors: alive(),
        stderr,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    child.stdin.end();
    child.kill();
  }
  await writeFile(join(evidence, "candidate-stderr.log"), stderr);
}
