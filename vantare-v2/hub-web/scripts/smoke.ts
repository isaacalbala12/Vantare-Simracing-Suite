import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const evidence = process.env.VANTARE_HUB_EVIDENCE ?? resolve("test-results");
await mkdir(evidence, { recursive: true });
const child = spawn(
  resolve("release/package/vantare-hub-ui-win32-x64/vantare-hub-ui.exe"),
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
const endpoint = await new Promise<string>((accept, reject) => {
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error("Electron CDP startup timed out"));
  }, 20000);
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
    await expect(
      window.getByRole("button", { name: "Abrir diálogo", exact: true }),
    ).toBeFocused();
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
  const result = await window.evaluate(() => ({
    node: typeof (globalThis as Record<string, unknown>).require,
    devicePixelRatio: globalThis.devicePixelRatio,
    bridge: Object.keys(globalThis.window.vantare ?? {}),
  }));
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
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
} finally {
  await browser.close();
  child.kill();
}
