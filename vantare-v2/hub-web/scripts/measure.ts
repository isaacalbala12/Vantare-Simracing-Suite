import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { cpus, freemem, release, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { type Browser, chromium } from "playwright-core";
import { hostVersion, sealQaGeneration } from "./qa-inventory.ts";
import { requiredPath } from "./qa-paths.ts";
import { until } from "./wait-for.ts";

async function main() {
  assert.equal(process.platform, "win32");
  const evidence = requiredPath("VANTARE_HUB_EVIDENCE");
  const qa = join(
    requiredPath("VANTARE_HUB_QA_ROOT"),
    `paired-${randomBytes(8).toString("hex")}`,
  );
  const bank = requiredPath("VANTARE_HUB_GPUI_BANK");
  const inventory = JSON.parse(await readFile(join(bank, "bank.json"), "utf8"));
  const gpuiBinary = join(bank, inventory.binary);
  assert.equal(
    createHash("sha256")
      .update(await readFile(gpuiBinary))
      .digest("hex"),
    inventory.sha256,
  );
  const generationId = randomBytes(16).toString("hex");
  const generation = join(qa, "generations", generationId);
  const data = join(generation, "data");
  const hub = join(data, "hub");
  const gpui = join(qa, "gpui");
  for (const directory of [
    evidence,
    join(generation, "bin"),
    hub,
    gpui,
    join(qa, "tmp"),
  ])
    await mkdir(directory, { recursive: true });
  await cp(
    requiredPath("VANTARE_HUB_HOST_BINARY"),
    join(generation, "bin/vantare-hub.exe"),
  );
  for (const name of ["vantare.exe", "vantare-core.exe"])
    await cp(
      requiredPath("VANTARE_HUB_MEASURE_PEER"),
      join(generation, "bin", name),
    );
  await cp(requiredPath("VANTARE_HUB_UI_PACKAGE"), join(generation, "hub-ui"), {
    recursive: true,
  });
  await writeFile(
    join(generation, "measurement-qa-owned"),
    "Read-only local measurement fixtures\n",
  );
  for (const root of [generation, gpui])
    await cp(join(bank, "template/replies.json"), join(root, "replies.json"));
  for (const root of [data, gpui])
    await cp(join(bank, "template/layout.json"), join(root, "layout.json"));
  const appearance = {
    ...JSON.parse(await readFile(join(bank, "appearance-dark.json"), "utf8")),
    paletteVersion: 1,
  };
  for (const root of [hub, gpui])
    await writeFile(join(root, "appearance.json"), JSON.stringify(appearance));
  const privacy = {
    generation: 0,
    crashes: false,
    usage: false,
    crashes_decided: true,
    usage_decided: true,
  };
  for (const root of [data, gpui]) {
    await mkdir(join(root, "Vantare/native"), { recursive: true });
    await writeFile(
      join(root, "Vantare/native/privacy.json"),
      JSON.stringify(privacy),
    );
  }
  const source = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const members = await sealQaGeneration(
    qa,
    generationId,
    source,
    hostVersion(join(generation, "bin/vantare-hub.exe")),
    "Release",
  );
  const payloadBytes = members
    .filter(
      (member) =>
        member.path.startsWith("hub-ui/") ||
        member.path.startsWith("bin/vantare-hub.exe"),
    )
    .reduce((sum, member) => sum + member.size, 0);
  const peerBytes = members
    .filter(
      (member) =>
        member.path.startsWith("bin/") &&
        !member.path.startsWith("bin/vantare-hub.exe"),
    )
    .reduce((sum, member) => sum + member.size, 0);
  const pipe = `vantare-measure-${randomBytes(16).toString("hex")}`;
  const environment: Record<string, string> = {};
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
    if (process.env[key]) environment[key] = process.env[key] as string;
  Object.assign(environment, { TEMP: join(qa, "tmp"), TMP: join(qa, "tmp") });
  const peers: ReturnType<typeof spawn>[] = [];
  let driver: ReturnType<typeof spawn> | undefined;
  let browser: Browser | undefined;
  const samples: Record<string, unknown>[] = [];
  try {
    for (const [name, role] of [
      ["vantare-core.exe", "rights"],
      ["vantare.exe", "services"],
    ]) {
      const peer = spawn(
        join(generation, "bin", name),
        ["--root", generation, "--pipe", pipe, "--role", role],
        {
          env: environment,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      peers.push(peer);
      await new Promise<void>((accept, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`QA ${role} readiness deadline`)),
          10000,
        );
        peer.stdout?.once("data", (chunk) => {
          clearTimeout(timeout);
          String(chunk).trim() === "ready"
            ? accept()
            : reject(new Error("Unexpected peer readiness"));
        });
        peer.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        peer.once("exit", (code) => {
          clearTimeout(timeout);
          reject(new Error(`QA peer exited ${code}`));
        });
      });
    }
    const configuration = {
      runs: 5,
      evidence,
      apps: [
        {
          name: "gpui",
          exe: gpuiBinary,
          arguments: [
            "--control-stdin",
            "--qa-root",
            gpui,
            "--qa-measure",
            "--capture",
            "ajustes-aplicacion",
            "--qa-catalog",
            "pro",
          ],
          environment: {
            ...environment,
            VANTARE_NATIVE_DATA_ROOT: gpui,
            VANTARE_CAPTURE_POLICY: "ipc",
            LOCALAPPDATA: gpui,
            APPDATA: join(gpui, "roaming"),
          },
        },
        {
          name: "electron",
          exe: join(generation, "bin/vantare-hub.exe"),
          arguments: [
            "--control-stdin",
            "--data-dir",
            hub,
            "--layout",
            join(data, "layout.json"),
            "--pipe",
            pipe,
          ],
          environment: {
            ...environment,
            VANTARE_NATIVE_DATA_ROOT: data,
            LOCALAPPDATA: data,
            APPDATA: join(data, "roaming"),
            VANTARE_BOOT_TOKEN: randomBytes(16).toString("hex"),
          },
        },
      ],
    };
    const config = join(qa, "config.json");
    await writeFile(config, JSON.stringify(configuration));
    await writeFile(
      join(evidence, "provenance.json"),
      JSON.stringify(
        {
          source,
          uiProductSource: "9401501ea38f2e8fe65584511f27844c7efd157a",
          qa,
          generation,
          payloadBytes,
          peerBytes,
          totalGenerationBytes: members.reduce(
            (sum, member) => sum + member.size,
            0,
          ),
          gpuiBank: inventory,
          os: release(),
          logicalCpus: cpus().length,
          totalMemory: totalmem(),
          freeMemory: freemem(),
          cache: "natural; no purge, no cold-start claim",
          method:
            "five alternating A/B process launches; Settings then Home in each process",
        },
        null,
        2,
      ),
    );
    driver = spawn(
      "pwsh",
      [
        "-NoProfile",
        "-MTA",
        "-File",
        resolve("scripts/measure-window.ps1"),
        "-Config",
        config,
      ],
      {
        env: { ...environment },
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stderr = "";
    driver.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const completion = new Promise<number | null>((accept, reject) => {
      driver?.once("exit", accept);
      driver?.once("error", reject);
    });
    assert.ok(driver.stdout && driver.stdin);
    for await (const line of createInterface({ input: driver.stdout })) {
      const event = JSON.parse(line) as Record<string, unknown>;
      samples.push(event);
      console.log(
        `${event.phase} ${event.app} ${event.iteration} ${event.section ?? ""}`,
      );
      await writeFile(
        join(evidence, "samples.json"),
        JSON.stringify(samples, null, 2),
      );
      if (event.phase === "before") {
        const profile = event.app === "gpui" ? gpui : hub;
        const archived = `${profile}-previous-${event.iteration}`;
        assert.ok(
          resolve(profile).startsWith(`${resolve(qa)}\\`) &&
            resolve(archived).startsWith(`${resolve(qa)}\\`),
        );
        await rename(profile, archived);
        await mkdir(profile, { recursive: true });
        await writeFile(
          join(profile, "appearance.json"),
          JSON.stringify(appearance),
        );
        if (event.app === "gpui") {
          await cp(
            join(bank, "template/replies.json"),
            join(profile, "replies.json"),
          );
          await cp(
            join(bank, "template/layout.json"),
            join(profile, "layout.json"),
          );
          await mkdir(join(profile, "Vantare/native"), { recursive: true });
          await writeFile(
            join(profile, "Vantare/native/privacy.json"),
            JSON.stringify(privacy),
          );
        }
        if (event.app === "electron") {
          for (const file of [
            join(hub, "hub-ui-qa.log"),
            join(qa, "hub-ready"),
          ])
            await unlink(file).catch((error) => {
              if (error.code !== "ENOENT") throw error;
            });
          await writeFile(join(qa, "boot-pending.json"), "{}");
        }
        driver.stdin.write("launch\n");
      } else if (event.phase === "visible") {
        if (event.app === "electron") {
          let endpoint = "";
          await until(
            async () => {
              const log = await readFile(
                join(hub, "hub-ui-qa.log"),
                "utf8",
              ).catch(() => "");
              endpoint =
                log.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? "";
              return !!endpoint;
            },
            15000,
            "Electron QA debugger",
          );
          browser = await chromium.connectOverCDP(endpoint);
          const context = browser.contexts()[0];
          const page =
            context.pages()[0] ?? (await context.waitForEvent("page"));
          await page
            .getByRole("heading", { name: "General", exact: true })
            .waitFor({ timeout: 15000 });
          await page
            .getByRole("switch", { name: "Empezar minimizado", exact: true })
            .focus();
          assert.equal(
            await page.evaluate(() =>
              document.activeElement?.getAttribute("role"),
            ),
            "switch",
          );
        }
        driver.stdin.write("ready\n");
      } else if (event.phase === "navigate") {
        if (event.app === "electron") {
          assert.ok(browser);
          const page = browser.contexts()[0].pages()[0];
          await page
            .getByRole("navigation", { name: "Navegación principal" })
            .getByRole("button", { name: "Inicio", exact: true })
            .click();
          await page.locator(".v-home").waitFor({ timeout: 15000 });
        }
        driver.stdin.write("ready\n");
      } else if (event.phase === "idle") {
        assert.deepEqual(
          (event.familyAfter as number[]).sort((a, b) => a - b),
          (event.processMetrics as { pid: number }[])
            .map((item) => item.pid)
            .sort((a, b) => a - b),
          "Process family changed during idle sample",
        );
        driver.stdin.write("next\n");
      } else if (event.phase === "closed") {
        assert.deepEqual(
          event.survivors,
          [],
          "A measured application left child processes alive",
        );
        await browser?.close().catch(() => {});
        browser = undefined;
      }
    }
    const code = await completion;
    await writeFile(join(evidence, "stderr.log"), stderr);
    assert.equal(code, 0, stderr);
    assert.equal(samples.filter((event) => event.phase === "idle").length, 20);
  } finally {
    await browser?.close().catch(() => {});
    if (driver?.exitCode === null && driver.pid) {
      try {
        execFileSync("taskkill", ["/PID", String(driver.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } catch {
        driver.kill();
      }
    }
    for (const peer of peers) {
      peer.stdin?.end();
      if (peer.exitCode === null)
        await Promise.race([
          new Promise((resolve) => peer.once("exit", resolve)),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      if (peer.exitCode === null) peer.kill();
    }
  }
}
await main();
