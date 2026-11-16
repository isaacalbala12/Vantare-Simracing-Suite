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
 * A screen with findings already filed as an issue keeps an explicit `pending`
 * entry (rule + help + issue): CI stays green while that finding is open and
 * fails as soon as a different rule appears. Screens without `pending` must be
 * clean.
 */

type Pending = { rule: string; help: string; issue: number };
type Screen = {
  id: string;
  name: string;
  mock: string;
  prepare: (page: Page) => Promise<void>;
  /** Violations already filed as issues; a new rule still fails the scan. */
  pending?: Pending[];
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
    pending: [
      {
        rule: "label-content-name-mismatch",
        help: "Elements must have their visible text as part of their accessible name",
        issue: 2497,
      },
    ],
    prepare: async (page) => {
      await mainNav(page)
        .getByRole("button", { name: "Launcher", exact: true })
        .click();
      await page.locator(".v-launcher-profiles").waitFor();
      await selectTab(page, "Perfiles");
    },
  },
  {
    id: "launcher-aplicaciones",
    name: "Launcher · Aplicaciones",
    mock: "launcher-aplicaciones",
    pending: [
      {
        rule: "label-content-name-mismatch",
        help: "Elements must have their visible text as part of their accessible name",
        issue: 2497,
      },
    ],
    prepare: async (page) => {
      await mainNav(page)
        .getByRole("button", { name: "Launcher", exact: true })
        .click();
      await page.locator(".v-launcher-profiles").waitFor();
      await selectTab(page, "Aplicaciones");
    },
  },
  ...settingsTabs.map<Screen>((tab) => ({
    id: `ajustes-${tab.toLowerCase().replaceAll(" ", "-")}`,
    name: `Ajustes · ${tab}`,
    mock: "ajustes-con-diseno",
    pending:
      tab === "General" || tab === "Rendimiento en pista"
        ? [
            {
              rule: "label-content-name-mismatch",
              help: "Elements must have their visible text as part of their accessible name",
              issue: 2498,
            },
          ]
        : [],
    prepare: async (page) => {
      await page.getByRole("tab", { name: tab, exact: true }).waitFor();
      await selectTab(page, tab);
    },
  })),
  {
    id: "calendario",
    name: "Calendario · Próximas",
    mock: "calendar-live-reference",
    pending: [
      {
        rule: "label-content-name-mismatch",
        help: "Elements must have their visible text as part of their accessible name",
        issue: 2499,
      },
    ],
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
  const unexpected: string[] = [];
  for (const result of results) {
    const screen = screens.find((entry) => entry.id === result.id);
    assert.ok(screen, `unknown screen ${result.id}`);
    const expected = new Map(
      (screen.pending ?? []).map((pending) => [pending.rule, pending]),
    );
    for (const violation of result.violations) {
      const pending = expected.get(violation.id);
      if (pending) {
        console.log(
          `${screen.name}/${result.scheme}: pending ${violation.id} (#${pending.issue})`,
        );
        continue;
      }
      unexpected.push(
        `${screen.name}/${result.scheme}: ${violation.id} — ${violation.help} (${violation.targets.join(", ")})`,
      );
    }
  }
  assert.deepEqual(
    unexpected,
    [],
    `New accessibility violations outside the filed list:\n${unexpected.join("\n")}`,
  );
}
