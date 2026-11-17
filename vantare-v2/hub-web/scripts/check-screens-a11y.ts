import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { accountScenes } from "./visual-diff/account.ts";
import { calendarScenes } from "./visual-diff/calendar-scenes.ts";
import { homeScenes } from "./visual-diff/home.ts";

/**
 * Axe scan for the main screens outside the specimen and Studio (#2435).
 * Same rule set as Studio: axe's full rule set, which includes best-practice
 * rules such as heading-order, unlike the specimen's wcag2a/wcag2aa/wcag21aa
 * tags.
 *
 * Every scanned screen must be clean: there are no pending exceptions. A new
 * finding fails the step and gets its own issue, as the three Label in Name
 * findings (#2497, #2498, #2499) did before they were fixed.
 */

type Screen = {
  id: string;
  name: string;
  mock: string;
  prepare: (page: Page) => Promise<void>;
};

const mainNav = (page: Page) =>
  page.getByRole("navigation", { name: "Navegación principal" });

async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
}

async function selectTab(page: Page, name: string) {
  await page.getByRole("tab", { name, exact: true }).click();
  await page.waitForFunction(() => {
    const panel = document.querySelector('[role="tabpanel"]');
    return !!panel && !panel.querySelector(".v-skeleton");
  });
}

const settingsTabs = [
  "General",
  "Apariencia",
  "Rendimiento en pista",
  "Atajos",
  "Actualizaciones",
  "Privacidad",
  "Diagnóstico",
  "Cuenta",
] as const;

const screens: Screen[] = [
  {
    id: "inicio",
    name: "Inicio",
    mock: "inicio-base",
    prepare: (page) => homeScenes["inicio-base"].prepare(page),
  },
  {
    id: "launcher-perfiles",
    name: "Launcher · Perfiles",
    mock: "launcher-base",

    prepare: async (page) => {
      await mainNav(page)
        .getByRole("button", { name: /^Launcher(, ?\d+)?$/ })
        .click();
      await page.locator(".v-launcher-profiles").waitFor();
      await selectTab(page, "Perfiles");
    },
  },
  {
    id: "launcher-aplicaciones",
    name: "Launcher · Aplicaciones",
    mock: "launcher-aplicaciones",

    prepare: async (page) => {
      await mainNav(page)
        .getByRole("button", { name: /^Launcher(, ?\d+)?$/ })
        .click();
      await page.locator(".v-launcher-profiles").waitFor();
      await selectTab(page, "Aplicaciones");
    },
  },
  ...settingsTabs.map<Screen>((tab) => ({
    id: `ajustes-${tab.toLowerCase().replaceAll(" ", "-")}`,
    name: `Ajustes · ${tab}`,
    mock: "ajustes-con-diseno",

    prepare: async (page) => {
      await page.getByRole("tab", { name: tab, exact: true }).waitFor();
      await selectTab(page, tab);
    },
  })),
  {
    id: "calendario",
    name: "Calendario · Próximas",
    mock: "calendar-live-reference",

    prepare: (page) => calendarScenes["calendario-r6-proximas"].prepare(page),
  },
  {
    id: "testing",
    name: "Testing Center · Resumen",
    mock: "testing-tester-reference",
    prepare: async (page) => {
      await mainNav(page)
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page.locator(".v-testing-summary").waitFor();
    },
  },
  {
    id: "roadmap",
    name: "Roadmap",
    mock: "roadmap-base",
    prepare: async (page) => {
      await mainNav(page)
        .getByRole("button", { name: "Roadmap", exact: true })
        .click();
      await page.locator(".v-roadmap").waitFor();
    },
  },
  {
    id: "notificaciones",
    name: "Notificaciones",
    mock: "notificaciones-base",
    prepare: async (page) => {
      await page.locator(".v-notification-bell").click();
      await page
        .getByRole("dialog", { name: "Notificaciones", exact: true })
        .waitFor();
    },
  },
  {
    id: "cuenta",
    name: "Cuenta",
    mock: "cuenta-base",
    prepare: (page) => accountScenes["cuenta-base"].prepare(page),
  },
];

export type ScreenViolation = {
  id: string;
  impact: string | null;
  help: string;
  targets: string[];
  html: string[];
};

export type ScreenResult = {
  screen: string;
  id: string;
  scheme: string;
  violations: ScreenViolation[];
};

export async function scanMainScreens(
  page: Page,
  base: string,
): Promise<ScreenResult[]> {
  const results: ScreenResult[] = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const screen of screens) {
    for (const scheme of ["light", "dark"]) {
      await page.goto(`${base}?escena=visual-${scheme}:${screen.mock}`);
      await screen.prepare(page);
      await page.evaluate((value) => {
        document.documentElement.dataset.scheme = value;
      }, scheme);
      await settled(page);
      const report = await new AxeBuilder({ page }).analyze();
      results.push({
        screen: screen.name,
        id: screen.id,
        scheme,
        violations: report.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact ?? null,
          help: violation.help,
          targets: violation.nodes.flatMap((node) =>
            node.target.map((target) =>
              typeof target === "string" ? target : JSON.stringify(target),
            ),
          ),
          html: violation.nodes.slice(0, 3).map((node) => node.html),
        })),
      });
    }
  }
  return results;
}

export async function checkMainScreens(
  page: Page,
  base: string,
  evidence: string,
) {
  const results = await scanMainScreens(page, base);
  await writeFile(
    resolve(evidence, "screens-axe.json"),
    JSON.stringify(results, null, 2),
  );
  const failures = results.flatMap((result) =>
    result.violations.map(
      (violation) =>
        `${result.screen}/${result.scheme}: ${violation.id} — ${violation.help} (${violation.targets.join(", ")})`,
    ),
  );
  assert.deepEqual(
    failures,
    [],
    `Accessibility violations on the main screens:\n${failures.join("\n")}`,
  );
}
