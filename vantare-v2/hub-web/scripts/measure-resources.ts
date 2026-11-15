import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { commandsText } from "../src/renderer/i18n/commands.es.ts";
import { windowText } from "../src/renderer/i18n/window.es.ts";
import { summarize } from "./resources/summary.ts";
import { observeProcessExit } from "./visual-diff/process-exit.ts";
import { until } from "./wait-for.ts";

// QA candidate only. Never attach to an existing user's Hub or change its data.
assert.equal(process.platform, "win32");
const output = process.argv[2];
const checkOnly = process.argv.includes("--check-only");
assert.ok(
  output,
  "Usage: node --experimental-strip-types scripts/measure-resources.ts <evidence-directory>",
);
const qaRoot = process.env.VANTARE_HUB_QA_ROOT;
assert.ok(qaRoot, "VANTARE_HUB_QA_ROOT required");
const lock = "D:/VantareServer/qa/captura.lock";
const owner = JSON.parse(await readFile(join(lock, "owner.json"), "utf8"));
const nonce = process.env.VANTARE_HUB_RESOURCE_LEASE;
assert.ok(
  nonce && owner.nonce === nonce && owner.pid === process.ppid,
  "Use scripts/measure-resources.ps1 to reserve the capture and native slots",
);
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let child: ReturnType<typeof spawn> | undefined;
let stderr = "";
let exit: ReturnType<typeof observeProcessExit> | undefined;
const destination = resolve(output);
async function run(file: string, args: string[]) {
  const p = spawn(file, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "",
    error = "";
  p.stdout.on("data", (v) => {
    stdout += v;
  });
  p.stderr.on("data", (v) => {
    error += v;
  });
  await new Promise<void>((ok, no) => {
    p.once("error", no);
    p.once("close", (code) =>
      code === 0 ? ok() : no(Error(`${file}: ${code}: ${error}`)),
    );
  });
  return stdout;
}
try {
  await mkdir(destination, { recursive: true });
  const active = await run("pwsh", [
    "-NoProfile",
    "-Command",
    "@(Get-Process cargo,rustc -ErrorAction SilentlyContinue).Count",
  ]);
  assert.equal(
    Number(active.trim()),
    0,
    "Rust active despite the slot reservation; not opening Electron",
  );
  const binary = resolve(
    "release/package-qa/vantare-hub-ui-win32-x64/vantare-hub-ui.exe",
  );
  const asar = join(resolve(binary, ".."), "resources/app.asar");
  const data = join(resolve(qaRoot), `resources-${randomUUID()}`);
  await mkdir(data, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    VANTARE_HUB_HOST: "mock",
    VANTARE_HUB_SCENE: "visual-dark:inicio-base",
    VANTARE_HUB_DATA_DIR: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    binary,
    [
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      "--force-device-scale-factor=1",
    ],
    { env, windowsHide: false, stdio: ["ignore", "ignore", "pipe"] },
  );
  exit = observeProcessExit(child);
  child.stderr?.on("data", (v) => {
    stderr += v;
  });
  let endpoint = "";
  await until(
    () => {
      if (child?.exitCode !== null) throw Error(`QA exited: ${stderr}`);
      endpoint =
        stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? "";
      return !!endpoint;
    },
    60000,
    "QA endpoint",
  );
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  await page
    .getByRole("button", { name: windowText.close, exact: true })
    .waitFor();
  // Playwright enables focus emulation on attach; it forces pages visible.
  // Disable that testing override before measuring native window visibility.
  const visibilitySession = await context.newCDPSession(page);
  await visibilitySession.send("Emulation.setFocusEmulationEnabled", {
    enabled: false,
  });
  const windowState = async (action: "minimize" | "restore") => {
    await run("pwsh", [
      "-NoProfile",
      "-File",
      resolve("scripts/resources/window.ps1"),
      "-ProcessId",
      String(child?.pid),
      "-Executable",
      binary,
      "-Action",
      action,
    ]);
  };
  await windowState("restore");
  await until(
    () => page.evaluate(() => !document.hidden),
    5000,
    "initial Hub is actually visible",
  );
  await page.locator('[data-nav="home"]').click();
  const settle = async () => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((ok) =>
        requestAnimationFrame(() => requestAnimationFrame(() => ok())),
      );
    });
    await page
      .locator('[aria-busy="true"]')
      .first()
      .waitFor({ state: "hidden" });
    await until(
      async () =>
        (await page
          .locator('.v-shell-main .v-skeleton[role="status"]')
          .count()) === 0,
      15000,
      "loaded section, not Suspense fallback",
    );
  };
  await settle();
  const phases: {
    name: string;
    processes: ReturnType<typeof summarize>;
    domNodes: number;
    hidden: boolean;
    machine: {
      logicalProcessors: number;
      physicalMemoryBytes: number;
      availableMemoryKiB: number;
    };
    resources: string[];
  }[] = [];
  const sample = async (name: string) => {
    if (checkOnly) return;
    const expectedHidden = name.endsWith("-minimized");
    assert.equal(
      await page.evaluate(() => document.hidden),
      expectedHidden,
      `Visibility before ${name}`,
    );
    console.log(`Sampling ${name}`);
    const path = join(destination, `${name}.json`);
    await run("pwsh", [
      "-NoProfile",
      "-File",
      resolve("scripts/resources/sample.ps1"),
      "-RootProcessId",
      String(child?.pid),
      "-Seconds",
      "20",
      "-Output",
      path,
    ]);
    const raw = JSON.parse(await readFile(path, "utf8"));
    const hidden = await page.evaluate(() => document.hidden);
    assert.equal(hidden, expectedHidden, `Visibility after ${name}`);
    phases.push({
      name,
      hidden,
      domNodes: await page.locator("*").count(),
      resources: await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((e) => new URL(e.name).pathname)
          .filter((p) => p.endsWith(".js")),
      ),
      processes: summarize(raw.samples, raw.logicalProcessors),
      machine: {
        logicalProcessors: raw.logicalProcessors,
        physicalMemoryBytes: raw.physicalMemoryBytes,
        availableMemoryKiB: raw.availableMemoryKiB,
      },
    });
  };
  for (const name of ["Cuenta", "Ajustes", "Notificaciones"]) {
    assert.equal(
      await page.getByRole("button", { name, exact: true }).count(),
      1,
      `Navigation preflight: ${name}`,
    );
  }
  await sample("home-cold");
  const visited: { section: string; tabs: string[] }[] = [];
  for (const section of [
    "launcher",
    "studio",
    "roadmap",
    "testing",
    "calendar",
    "settings",
    "account",
  ]) {
    const button =
      section === "account"
        ? page.getByRole("button", { name: "Cuenta", exact: true })
        : section === "settings"
          ? page.getByRole("button", { name: "Ajustes", exact: true })
          : page.locator(`[data-nav="${section}"]`);
    assert.equal(await button.count(), 1, `Missing ${section}`);
    assert.notEqual(
      await button.getAttribute("aria-disabled"),
      "true",
      `Locked ${section}`,
    );
    await button.click();
    await until(
      async () => (await button.getAttribute("aria-current")) === "page",
      5000,
      `active section ${section}`,
    );
    await settle();
    const tabs = await page.getByRole("tab").allTextContents();
    const done: string[] = [];
    for (const name of [...new Set(tabs)]) {
      const tab = page.getByRole("tab", { name: name.trim(), exact: true });
      if (
        (await tab.count()) !== 1 ||
        (await tab.getAttribute("aria-disabled")) === "true" ||
        (await tab.isDisabled())
      )
        continue;
      await tab.click();
      await settle();
      done.push(name.trim());
    }
    visited.push({ section, tabs: done });
    console.log(`Visited ${section}: ${done.join(", ")}`);
  }
  await page.keyboard.press("Control+k");
  const commands = page.locator("[data-command-palette]");
  await commands.waitFor();
  await commands.fill("Notificaciones");
  await page
    .getByRole("option", {
      name: `${commandsText.notifications} · ${commandsText.notificationsMeta}`,
      exact: true,
    })
    .click();
  await page.locator(".v-command-palette").waitFor({ state: "hidden" });
  await page.locator(".v-notifications--full").waitFor();
  await settle();
  visited.push({ section: "notifications", tabs: [] });
  await page.locator('[data-nav="home"]').click();
  await settle();
  await sample("home-after-tour");
  await windowState("minimize");
  await until(
    () => page.evaluate(() => document.hidden),
    5000,
    "minimized document visibility",
  );
  await sample("home-minimized");
  await windowState("restore");
  await until(
    () => page.evaluate(() => !document.hidden),
    5000,
    "restored document visibility",
  );
  await page.locator('[data-nav="calendar"]').click();
  await settle();
  await sample("calendar-visible");
  await windowState("minimize");
  await until(
    () => page.evaluate(() => document.hidden),
    5000,
    "calendar minimized visibility",
  );
  await sample("calendar-minimized");
  await windowState("restore");
  await until(
    () => page.evaluate(() => !document.hidden),
    5000,
    "calendar restored visibility",
  );
  await writeFile(
    join(destination, "report.json"),
    JSON.stringify(
      {
        schema: 1,
        checkOnly,
        at: new Date().toISOString(),
        source: process.env.VANTARE_HUB_QA_SOURCE ?? "not supplied",
        viewport: await page.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
        })),
        browserVersion: browser.version(),
        asarSha256: createHash("sha256")
          .update(await readFile(asar))
          .digest("hex"),
        visited,
        phases,
        limitations: [
          "QA simulated core; no real services or native host in these numbers",
          "CDP attached; compare only runs with the same instrumentation",
          "20-second windows; not a long-term leak test",
          "Working sets include shared pages: do not sum them as unique physical RAM",
          "Future modules, dialogs and native overlays excluded",
        ],
      },
      null,
      2,
    ),
  );
  await page
    .getByRole("button", { name: windowText.close, exact: true })
    .click();
  await until(() => child?.exitCode !== null, 10000, "QA normal close");
  await exit;
} finally {
  await browser?.close().catch(() => {});
  if (child && child.exitCode === null) child.kill();
  await writeFile(join(destination, "stderr.log"), stderr).catch(() => {});
}
