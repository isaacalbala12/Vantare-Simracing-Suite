import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { I18nContext, LANGUAGE_OPTIONS } from "../src/i18n/i18n-context";
import type { WidgetRendererProps } from "../src/overlay/core/design-system-definition";
import { BroadcastTowerFunctional } from "../src/overlay/design-systems/vantare-functional/BroadcastTowerFunctional";
import type { BroadcastTowerViewModel } from "../src/overlay/widget-types/broadcast-tower/broadcast-tower-view-model";

const outputDirectory = resolve(process.cwd(), "artifacts/review/horizontal-standings-flags-1");
const functionalCss = readFileSync(resolve(process.cwd(), "src/overlay/design-systems/vantare-functional/tokens.css"), "utf8");

const rows: BroadcastTowerViewModel["rows"] = [
  { place: 1, number: "17", name: "María Costa", team: "hypercar", className: "hypercar", gap: undefined, isPlayer: true },
  { place: 2, number: "42", name: "Alex Martin", team: "hypercar", className: "hypercar", gap: 1.234, isPlayer: false },
  { place: 3, number: "08", name: "Luca Bianchi", team: "lmp2", className: "lmp2", gap: 4.567, isPlayer: false },
  { place: 4, number: "31", name: "Noah Smith", team: "lmp2", className: "lmp2", gap: 8.901, isPlayer: false },
  { place: 5, number: "05", name: "Ana Silva", team: "gt3", className: "gt3", gap: 12.345, isPlayer: false },
];

const baseModel: Omit<BroadcastTowerViewModel, "flag"> = {
  type: "broadcast-tower",
  status: "ready",
  sessionLabel: "RACE",
  lap: 34,
  totalLaps: 240,
  trackTempC: undefined,
  sof: undefined,
  rows,
  rowCount: 5,
  showWeather: true,
  showSof: true,
};

const flags = [
  { id: "unknown", flag: "unknown", signal: "missing", expectedToken: "177 180 188", expectedLabel: "Sin señal / estado neutro" },
  { id: "yellow", flag: "yellow", signal: "fresh", expectedToken: "255 208 61", expectedLabel: "Amarilla (mapeo candidato LMU)" },
  { id: "green", flag: "green", signal: "fresh", expectedToken: "41 195 111", expectedLabel: "Verde (vocabulario consumidor)" },
  { id: "black", flag: "black", signal: "fresh", expectedToken: "12 12 14", expectedLabel: "Negra (franja neutra con borde visible)" },
  { id: "checkered", flag: "checkered", signal: "fresh", expectedToken: "177 180 188", expectedAccent: "repeating-conic-gradient", expectedLabel: "A cuadros (patrón explícito)" },
] as const;

function renderWidget(flag: BroadcastTowerViewModel["flag"]) {
  const props: WidgetRendererProps<BroadcastTowerViewModel> = {
    model: { ...baseModel, flag },
    settings: {},
    renderMode: "harness",
    effects: "full",
  };
  return renderToStaticMarkup(
    <I18nContext.Provider value={{ locale: "es", setLocale: () => {}, t: (key) => key, options: LANGUAGE_OPTIONS }}>
      <BroadcastTowerFunctional {...props} />
    </I18nContext.Provider>,
  );
}

function documentFor(scene: (typeof flags)[number]) {
  return `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><style>
    ${functionalCss}
    :root { color-scheme: dark; background: #07080b; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 1400px; background: radial-gradient(circle at 12% 0%, #252a36 0, transparent 38%), #07080b; color: #f5f5f5; font-family: Inter, Arial, sans-serif; }
    .evidence-shell { width: 1320px; margin: 0 auto; padding: 28px 0 32px; }
    h1 { margin: 0 0 7px; font-size: 18px; letter-spacing: .08em; text-transform: uppercase; }
    .subtitle { margin: 0 0 22px; color: #a8abb4; font: 12px/1.45 "JetBrains Mono", monospace; }
    .widget-frame { width: 1280px; height: 71px; margin: 0 auto 22px; }
    .proof { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .proof-card { padding: 14px 16px; border: 1px solid rgb(255 255 255 / 12%); border-radius: 6px; background: rgb(16 17 19 / 88%); }
    .proof-label { color: #a8abb4; font: 600 10px/1.2 "JetBrains Mono", monospace; letter-spacing: .12em; text-transform: uppercase; }
    .proof-value { margin-top: 7px; color: #f5f5f5; font: 600 14px/1.3 "JetBrains Mono", monospace; }
    .proof-note { margin-top: 8px; color: #b9b9bd; font: 11px/1.45 Inter, Arial, sans-serif; }
    .proof-note code { color: #e2c568; }
  </style></head>
  <body>
    <main class="evidence-shell">
      <h1>Horizontal Standings · Broadcast Tower</h1>
      <p class="subtitle">Overlay V2 · session.flag → BroadcastTowerViewModel.flag → data-flag → --vf-flag</p>
      <div class="widget-frame">${renderWidget(scene.flag)}</div>
      <div class="proof">
        <div class="proof-card"><div class="proof-label">Input quality</div><div class="proof-value">session.flag q=${scene.signal}</div><div class="proof-note">Escenario determinista del contrato para aislar el widget.</div></div>
        <div class="proof-card"><div class="proof-label">Expected semantic state</div><div class="proof-value">${scene.expectedLabel}</div><div class="proof-note">Rendered state: <code>${scene.flag}</code> · expected token: <code>${scene.expectedToken}</code></div></div>
      </div>
    </main>
  </body>
</html>`;
}

describe("Horizontal Standings flag evidence", () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>;

  afterAll(async () => {
    await browser?.close();
  });

  it.each(flags)("captures the complete $id state and verifies the responsive accent", async (scene) => {
    browser ??= await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 320 }, deviceScaleFactor: 1 });
    await page.setContent(documentFor(scene), { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready);

    const probe = await page.locator('[data-widget-renderer="broadcast-tower"]').evaluate((element) => {
      const style = getComputedStyle(element);
      const before = getComputedStyle(element, "::before");
      const rect = element.getBoundingClientRect();
      return {
        flag: element.getAttribute("data-flag"),
        token: style.getPropertyValue("--vf-flag").trim(),
        accent: before.backgroundImage,
        width: rect.width,
        height: rect.height,
      };
    });

    expect(probe.flag).toBe(scene.flag);
    expect(probe.token).toBe(scene.expectedToken);
    expect(probe.accent).toContain("expectedAccent" in scene ? scene.expectedAccent : scene.expectedToken.split(" ")[0]);
    expect(probe.width).toBe(1280);
    expect(probe.height).toBe(71);

    mkdirSync(outputDirectory, { recursive: true });
    await page.screenshot({ path: resolve(outputDirectory, `horizontal-standings-${scene.id}.png`), fullPage: true });
    await page.close();
  });
});
