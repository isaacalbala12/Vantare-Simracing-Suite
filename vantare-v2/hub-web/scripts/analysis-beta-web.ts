import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";
import { t } from "../src/renderer/i18n/es";
import { until } from "./wait-for";
import { webQaPreview } from "./web-qa";

const output = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/analysis-beta",
);
const viewport = { width: 1280, height: 900 };
const server = await webQaPreview();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
try {
  await mkdir(output, { recursive: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const toggle = page.getByRole("switch", {
    name: t("privacy.analysisBeta"),
    exact: true,
  });
  const analysis = page.getByRole("button", {
    name: t("analysis.title"),
    exact: true,
  });
  const group = page.getByRole("heading", { name: /Funciones en pruebas/ });
  async function open(scene: string) {
    await page.goto(`${server.resolvedUrls?.local[0]}?escena=${scene}`);
    await page
      .getByRole("tab", { name: t("settings.privacy"), exact: true })
      .click();
    await page
      .getByRole("switch", { name: t("privacy.crashes"), exact: true })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  async function scheme(value: "light" | "dark") {
    if ((await page.locator("html").getAttribute("data-scheme")) !== value)
      await page
        .getByRole("button", { name: t("shell.toggleTheme"), exact: true })
        .click();
    await until(
      async () =>
        (await page.locator("html").getAttribute("data-scheme")) === value,
      5000,
      "theme saved",
    );
    // At 1280 the rail starts collapsed; expand it so the menu labels show.
    await page.keyboard.press("Control+b");
  }
  const captures: string[] = [];
  async function capture(name: string) {
    assert.deepEqual(
      (await new AxeBuilder({ page }).analyze()).violations,
      [],
      name,
    );
    const file = `${name}.png`;
    await page.screenshot({ path: resolve(output, file) });
    captures.push(file);
  }
  for (const channel of ["testers", "master"]) {
    await open(`privacidad-beta-${channel}`);
    assert.equal(await toggle.count(), 0, channel);
    assert.equal(await analysis.count(), 0, channel);
  }
  for (const theme of ["light", "dark"] as const) {
    await open("privacidad-mail");
    await scheme(theme);
    await capture(`privacidad-referencia-${theme}`);

    await open("privacidad-beta-nightly");
    await group.waitFor();
    await scheme(theme);
    await group.scrollIntoViewIfNeeded();
    assert.equal(await toggle.getAttribute("aria-checked"), "false");
    assert.equal(await analysis.count(), 0);
    await capture(`ajustes-nightly-${theme}`);

    await toggle.click();
    await analysis.waitFor();
    assert.equal(await toggle.getAttribute("aria-checked"), "true");
    await capture(`menu-nightly-${theme}`);
    await toggle.click();
    await analysis.waitFor({ state: "detached" });
    assert.equal(await toggle.getAttribute("aria-checked"), "false");
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "manifest.json"),
    `${JSON.stringify(
      {
        head: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        viewport,
        channel: "nightly (mock)",
        axeViolations: 0,
        captures,
      },
      null,
      2,
    )}\n`,
  );
  const groups = (["light", "dark"] as const)
    .map(
      (theme) =>
        `<section><h2>${theme === "light" ? "Claro" : "Oscuro"}</h2><div>${[
          ["Molde de Privacidad", `privacidad-referencia-${theme}.png`],
          ["Funciones en pruebas", `ajustes-nightly-${theme}.png`],
          ["Menú con Análisis visible", `menu-nightly-${theme}.png`],
        ]
          .map(
            ([label, file]) =>
              `<figure><figcaption>${label}</figcaption><a href="${file}"><img src="${file}" alt="${label}"></a></figure>`,
          )
          .join("")}</div></section>`,
    )
    .join("");
  await writeFile(
    resolve(output, "comparacion.html"),
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>Análisis beta</title><style>body{font:16px system-ui;margin:2rem}section div{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}figure{margin:0}img{width:100%;display:block}figcaption{padding:.5rem 0}</style><h1>Análisis beta</h1>${groups}</html>\n`,
  );
} finally {
  await context.close();
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : done())),
  );
}
