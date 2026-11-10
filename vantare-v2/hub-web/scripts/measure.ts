import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { cpus, release, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { type Browser, chromium } from "playwright-core";
import { requiredPath } from "./qa-paths.ts";
import { until } from "./wait-for.ts";

export function summarize(values: number[]) {
  assert.ok(values.length >= 10 && values.every(Number.isFinite));
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    median:
      sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2,
    min: sorted[0],
    max: sorted.at(-1),
  };
}
async function main() {
  if (process.platform !== "win32") throw new Error("Windows desktop required");
  const runs = Number(process.env.VANTARE_HUB_MEASURE_RUNS ?? "10");
  assert.ok(Number.isInteger(runs) && runs >= 10);
  const evidence = requiredPath("VANTARE_HUB_EVIDENCE");
  const driverSourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const driverSourceDirty =
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim().length > 0;
  await mkdir(evidence, { recursive: true });
  const qa = join(
    requiredPath("VANTARE_HUB_QA_ROOT"),
    `measure-${randomBytes(8).toString("hex")}`,
  );
  const candidate = requiredPath("VANTARE_HUB_CANDIDATE_ROOT");
  const state = JSON.parse(
    await readFile(join(candidate, "state.json"), "utf8"),
  );
  assert.match(state.active.generation, /^[a-f0-9]{32}$/);
  const generation = join(candidate, "generations", state.active.generation);
  const manifest = JSON.parse(
    await readFile(join(generation, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.build_profile, "Release");
  const hubData = join(generation, "data/hub");
  const gpuiData = join(qa, "gpui");
  await mkdir(hubData, { recursive: true });
  await mkdir(gpuiData, { recursive: true });
  await mkdir(join(qa, "tmp"), { recursive: true });
  const environment: Record<string, string> = {};
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
    if (process.env[name]) environment[name] = process.env[name];
  const hostEnv = {
    ...environment,
    VANTARE_NATIVE_DATA_ROOT: join(generation, "data"),
    VANTARE_BOOT_TOKEN: randomBytes(16).toString("hex"),
    LOCALAPPDATA: join(qa, "local-host"),
    APPDATA: join(qa, "roaming-host"),
  };
  const gpuiEnv = {
    ...environment,
    VANTARE_NATIVE_DATA_ROOT: gpuiData,
    LOCALAPPDATA: join(qa, "local-gpui"),
    APPDATA: join(qa, "roaming-gpui"),
  };
  const configuration = {
    runs,
    apps: [
      {
        name: "electron",
        exe: join(generation, "bin/vantare-hub.exe"),
        arguments: [
          "--control-stdin",
          "--data-dir",
          hubData,
          "--layout",
          join(generation, "data/layout.json"),
          "--pipe",
          `vantare-measure-${randomBytes(16).toString("hex")}`,
        ],
        environment: hostEnv,
      },
      {
        name: "gpui",
        exe: requiredPath("VANTARE_HUB_GPUI_BINARY"),
        arguments: [
          "--control-stdin",
          "--data-dir",
          join(gpuiData, "hub"),
          "--layout",
          join(gpuiData, "layout.json"),
          "--pipe",
          `vantare-measure-${randomBytes(16).toString("hex")}`,
        ],
        environment: gpuiEnv,
      },
    ],
  };
  const config = join(qa, "config.json");
  await writeFile(config, JSON.stringify(configuration));
  const driver = spawn(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      resolve("scripts/measure-kernel.ps1"),
      "-Config",
      config,
    ],
    {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...environment, TEMP: join(qa, "tmp"), TMP: join(qa, "tmp") },
    },
  );
  let errorLog = "";
  driver.stderr.on("data", (chunk) => {
    errorLog += chunk.toString();
  });
  const completion = new Promise<number | null>((accept, reject) => {
    driver.once("exit", accept);
    driver.once("error", reject);
  });
  const samples: Record<string, unknown>[] = [];
  const deadline = setTimeout(() => driver.kill(), runs * 4 * 45000 + 60000);
  let browser: Browser | undefined;
  try {
    for await (const line of createInterface({ input: driver.stdout })) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        phase: string;
        app: string;
        mode: string;
        iteration: number;
        survivors?: number[];
        [key: string]: unknown;
      };
      samples.push(event);
      if (event.phase === "before") {
        if (event.app === "electron")
          await unlink(join(hubData, "hub-ui-qa.log")).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
        driver.stdin.write("launch\n");
      } else if (event.phase === "visible") {
        if (event.app === "electron") {
          let endpoint = "";
          await until(
            async () => {
              const log = await readFile(
                join(hubData, "hub-ui-qa.log"),
                "utf8",
              ).catch(() => "");
              endpoint =
                log.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? "";
              return !!endpoint;
            },
            10000,
            "fresh Electron CDP endpoint",
          );
          browser = await chromium.connectOverCDP(endpoint);
          const context = browser.contexts()[0];
          const page =
            context.pages()[0] ?? (await context.waitForEvent("page"));
          await page
            .getByRole("tab", { name: "General", exact: true })
            .waitFor();
          if (event.iteration === 0)
            await page.screenshot({
              path: join(evidence, `electron-${event.mode}.png`),
            });
        }
        driver.stdin.write("ready\n");
      } else if (event.phase === "idle") {
        if (browser) {
          const context = browser.contexts()[0];
          const page = context.pages()[0];
          const session = await context.newCDPSession(page);
          const heap = await session.send("Runtime.getHeapUsage");
          event.rendererHeapBytes = heap.usedSize;
          await session.detach();
          await browser.close();
          browser = undefined;
        }
        driver.stdin.write("stop\n");
      } else if (event.phase === "closed") {
        assert.deepEqual(
          event.survivors,
          [],
          "measured process family must fully exit",
        );
      }
      await writeFile(
        join(evidence, "samples.json"),
        JSON.stringify(samples, null, 2),
      );
    }
    const code = await completion;
    assert.equal(code, 0, errorLog);
    const summary = [];
    for (const app of ["electron", "gpui"])
      for (const mode of ["cold", "warm"]) {
        const values = samples.filter(
          (sample) => sample.app === app && sample.mode === mode,
        );
        const visible = values.filter((sample) => sample.phase === "visible");
        const idle = values.filter((sample) => sample.phase === "idle");
        const numbers = (events: Record<string, unknown>[], key: string) =>
          events.map((event) => {
            assert.equal(typeof event[key], "number");
            return event[key] as number;
          });
        assert.equal(visible.length, runs);
        assert.equal(idle.length, runs);
        summary.push({
          app,
          mode,
          visibleMs: summarize(numbers(visible, "visibleMs")),
          workingSetBytes: summarize(numbers(idle, "workingSetBytes")),
          cpuOneCorePercent: summarize(numbers(idle, "cpuOneCorePercent")),
          rendererHeapBytes:
            app === "electron"
              ? summarize(numbers(idle, "rendererHeapBytes"))
              : null,
        });
      }
    await writeFile(
      join(evidence, "measurements.json"),
      JSON.stringify(
        {
          machine: {
            os: release(),
            cpu: cpus()[0]?.model,
            logicalCores: cpus().length,
            ramBytes: totalmem(),
          },
          method: {
            runs,
            cold: "NtSetSystemInformation MemoryPurgeStandbyList, all measured processes stopped; no reboot",
            warm: "relaunch with OS cache retained",
            visible:
              "OS process creation time to visible top-level window >200x100; 5ms sampling",
            idle: "Settings confirmed, 10s settling, 5s CPU sample; total family working set",
            compilation:
              "both Global VantareCargoSlot mutexes held for entire series",
            profile: "Release; QA CDP only",
          },
          source: manifest,
          driverSourceSha,
          driverSourceDirty,
          summary,
        },
        null,
        2,
      ),
    );
  } finally {
    clearTimeout(deadline);
    await browser?.close();
    if (driver.exitCode === null) driver.kill();
    await writeFile(join(evidence, "driver-stderr.log"), errorLog);
  }
}
if (import.meta.main) await main();
