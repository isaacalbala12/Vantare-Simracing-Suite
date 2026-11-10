import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { until } from "./wait-for.ts";

const evidence = process.env.VANTARE_HUB_EVIDENCE ?? resolve("test-results");
await mkdir(evidence, { recursive: true });
// Distribution is built separately and must reject debugger switches before readiness.
const production = spawn(
  resolve("release/package/vantare-hub-ui-win32-x64/vantare-hub-ui.exe"),
  ["--remote-debugging-port=0"],
  {
    env: {
      ...process.env,
      VANTARE_HUB_HOST: "mock",
      VANTARE_HUB_QA_BUILD: "1", // A runtime variable must never enable CDP in distribution.
      VANTARE_HUB_DATA_DIR: resolve(evidence, "production-probe"),
    },
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let productionLog = "";
production.stderr.on("data", (chunk) => {
  productionLog += chunk.toString();
});
try {
  await until(
    () => production.exitCode !== null,
    20000,
    "distribution rejects CDP",
  );
  assert.equal(production.exitCode, 1);
  assert.equal(productionLog.includes("DevTools listening"), false);
  assert.equal(
    productionLog.includes("debugging disabled in distribution"),
    true,
  );
} finally {
  if (production.exitCode === null) production.kill();
}
const child = spawn(
  resolve("release/package-qa/vantare-hub-ui-win32-x64/vantare-hub-ui.exe"),
  [
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    `--force-device-scale-factor=${process.env.VANTARE_HUB_SCALE ?? "1"}`,
  ],
  {
    env: {
      ...process.env,
      VANTARE_HUB_HOST: "mock",
      VANTARE_HUB_DATA_DIR:
        process.env.VANTARE_HUB_DATA_DIR ?? resolve("test-results/qa"),
    },
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let navigationBlocked = false;
let diagnostics = "";
child.stderr.on("data", (chunk) => {
  diagnostics = (diagnostics + chunk.toString()).slice(-4096);
  navigationBlocked ||= diagnostics.includes("HUB_QA_NAVIGATION_BLOCKED");
});
const endpoint = await new Promise<string>((accept, reject) => {
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error("Electron CDP startup timed out"));
  }, 60000);
  let output = "";
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
    const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) {
      clearTimeout(timer);
      accept(match[1]);
    }
  });
  child.once("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.once("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`Electron exited ${code}`));
  });
});
let externalRequests = 0;
const external = createServer((_request, response) => {
  externalRequests++;
  response.end("blocked navigation reached network");
});
await new Promise<void>((accept) => external.listen(0, "127.0.0.1", accept));
const address = external.address();
if (!address || typeof address === "string")
  throw new Error("QA loopback bind failed");
const externalUrl = `http://127.0.0.1:${address.port}/external`;
const browser = await chromium.connectOverCDP(endpoint);
try {
  const context = browser.contexts()[0];
  const window = context.pages()[0] ?? (await context.waitForEvent("page"));
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  window.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await window
    .getByRole("status")
    .filter({ hasText: "Núcleo simulado" })
    .waitFor();
  for (let reload = 0; reload < 2; reload++) {
    await window.reload();
    await window
      .getByRole("status")
      .filter({ hasText: "Núcleo simulado" })
      .waitFor();
  }
  if (process.env.VANTARE_HUB_TEST_SCENE === "specimen") {
    await window.goto("app://hub/?escena=specimen");
    await window
      .getByRole("heading", { name: "Componentes Vantare" })
      .waitFor();
    await window
      .getByRole("button", { name: "Abrir diálogo", exact: true })
      .click();
    await window.getByRole("dialog", { name: "Cambios sin guardar" }).waitFor();
    await window.keyboard.press("Escape");
    await until(
      () =>
        window
          .getByRole("button", { name: "Abrir diálogo", exact: true })
          .evaluate((element) => element === document.activeElement),
      5000,
      "dialog restores focus",
    );
    await window.getByRole("slider", { name: "Contraste" }).press("ArrowRight");
    const virtualTable = window.locator(".v-table-scroll").last();
    if ((await virtualTable.locator("tbody tr").count()) >= 200)
      throw new Error("Table did not virtualize");
    await virtualTable.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await virtualTable.getByText("qa-999.json", { exact: true }).waitFor();
    await virtualTable.evaluate((element) => {
      element.scrollTop = 0;
    });
    await window.emulateMedia({ reducedMotion: "reduce" });
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const findings = await new AxeBuilder({ page: window })
      .setLegacyMode()
      .analyze();
    await writeFile(
      resolve(evidence, "axe.json"),
      JSON.stringify(findings, null, 2),
    );
    if (
      findings.violations.some(
        (item) => item.impact === "serious" || item.impact === "critical",
      )
    )
      throw new Error(
        `Axe: ${findings.violations.map((item) => item.id).join(",")}`,
      );
  }
  const beforePages = context.pages().length;
  assert.equal(
    await window.evaluate(
      (url) => globalThis.window.open(url) === null,
      externalUrl,
    ),
    true,
  );
  assert.equal(context.pages().length, beforePages);
  const originalUrl = window.url();
  await window.evaluate((url) => {
    location.href = url;
  }, externalUrl);
  await until(
    () => navigationBlocked,
    10000,
    "main denies external location.href",
  );
  assert.equal(window.url(), originalUrl);
  assert.equal(externalRequests, 0);
  const result = await window.evaluate(() => ({
    node: typeof (globalThis as Record<string, unknown>).require,
    devicePixelRatio: globalThis.devicePixelRatio,
    viewport: { width: innerWidth, height: innerHeight },
    available: { width: screen.availWidth, height: screen.availHeight },
    bridge: Object.keys(globalThis.window.vantare ?? {}),
  }));
  assert.ok(result.viewport.width <= result.available.width);
  assert.ok(result.viewport.height <= result.available.height);
  if (
    result.node !== "undefined" ||
    result.bridge.join(",") !== "platform,connect"
  )
    throw new Error("Renderer isolation failed");
  await window.screenshot({
    path: resolve(evidence, "esqueleto.png"),
    fullPage: true,
  });
  if (process.env.VANTARE_HUB_THEME_SHEET === "1") {
    for (const palette of [
      "vantare",
      "classic",
      "deepseek",
      "rose",
      "grove",
      "ocean",
      "ember",
      "iris",
      "mono",
    ])
      for (const scheme of ["dark", "light"]) {
        await window.evaluate(
          ({ palette, scheme }) => {
            document.documentElement.dataset.palette = palette;
            document.documentElement.dataset.scheme = scheme;
          },
          { palette, scheme },
        );
        if (process.env.VANTARE_HUB_TEST_SCENE === "specimen") {
          const { default: AxeBuilder } = await import("@axe-core/playwright");
          const audit = await new AxeBuilder({ page: window })
            .setLegacyMode()
            .analyze();
          await writeFile(
            resolve(evidence, `axe-${palette}-${scheme}.json`),
            JSON.stringify(audit, null, 2),
          );
          if (
            audit.violations.some(
              (item) => item.impact === "serious" || item.impact === "critical",
            )
          )
            throw new Error(
              `Axe ${palette}/${scheme}: ${audit.violations.map((item) => item.id).join(",")}`,
            );
        }
        await window.screenshot({
          path: resolve(evidence, `${palette}-${scheme}.png`),
          fullPage: true,
        });
      }
  }

  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(
    resolve(evidence, "smoke.json"),
    JSON.stringify(
      {
        passed: true,
        distributionDebuggerBlocked: true,
        reloads: 2,
        windowOpenBlocked: true,
        externalNavigationBlocked: true,
        externalRequests,
        ...result,
      },
      null,
      2,
    ),
  );
} finally {
  external.close();
  await browser.close();
  child.kill();
}
