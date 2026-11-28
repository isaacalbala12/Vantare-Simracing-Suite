import assert from "node:assert/strict";
import type { Browser, Page } from "playwright-core";
import { analysisQaNow } from "../src/mock/analysis-scenes";
import { until } from "./wait-for";

/**
 * Issue 2896: ninguna pestaña de la barra queda oculta e inalcanzable.
 *
 * Build web + mock + Chromium (layout real; jsdom no lo tiene). Usa las 8
 * pestañas reales de Ajustes del mock. A 1280 y 1440 se ven todas; con pantalla
 * pequeña (zoom 90 % automático) o la barra lateral abierta, las que no caben
 * están en «⋯». La pestaña seleccionada nunca queda oculta. «⋯» y su menú no
 * arrastran la ventana (#2854). Sin esperas fijas: sondeos con plazo.
 */
const AJUSTES = [
  "Cuenta",
  "General",
  "Apariencia",
  "Rendimiento en pista",
  "Atajos",
  "Actualizaciones",
  "Privacidad",
  "Diagnóstico",
] as const;
const MORE = "Más pestañas de Ajustes";

interface Caso {
  ventana: readonly [number, number];
  /** A 1280 y 1440 caben todas; si no, hay «⋯». */
  todas: boolean;
  lateral?: boolean;
  /** Zoom automático que aplica el Hub a ese tamaño (window-zoom.ts). */
  zoom: string;
}
const CASOS: readonly Caso[] = [
  { ventana: [1280, 720], todas: true, zoom: "1" },
  { ventana: [1280, 900], todas: true, zoom: "1" },
  { ventana: [1440, 1000], todas: true, zoom: "1" },
  // 1366×768 y 1280×800 al 125 % de Windows: el Hub baja solo al 90 %.
  { ventana: [1093, 583], todas: false, zoom: "0.9" },
  { ventana: [1024, 592], todas: false, zoom: "0.9" },
  { ventana: [1280, 900], todas: false, lateral: true, zoom: "1" },
];

const nombre = (caso: Caso) =>
  `${caso.ventana.join("×")}${caso.lateral ? " con la barra lateral abierta" : ""}`;

/** El ResizeObserver ya marcó el recorte y «⋯» está en su estado final. */
function asentada(page: Page) {
  return until(
    () =>
      page.evaluate(() => {
        const list = document.querySelector(".v-section-tab-list");
        if (!list) return false;
        const bounds = list.getBoundingClientRect();
        const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
        const clipped = tabs.map((tab) => {
          const box = tab.getBoundingClientRect();
          return box.left < bounds.left - 1 || box.right > bounds.right + 1;
        });
        const more = document.querySelector<HTMLElement>(
          ".v-section-tabs-more",
        );
        return (
          bounds.width > 0 &&
          tabs.every(
            (tab, index) => tab.hasAttribute("data-clipped") === clipped[index],
          ) &&
          (!more || more.hidden === !clipped.some(Boolean))
        );
      }),
    5000,
    "recorte de pestañas asentado",
  );
}

/** Pestañas que se ven enteras y reciben el clic en su centro. */
function alcanzables(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector(".v-section-tab-list");
    if (!list) return [];
    const bounds = list.getBoundingClientRect();
    return [...list.querySelectorAll<HTMLElement>('[role="tab"]')]
      .filter((tab) => {
        const box = tab.getBoundingClientRect();
        const style = getComputedStyle(tab);
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return (
          style.opacity !== "0" &&
          style.visibility !== "hidden" &&
          style.pointerEvents !== "none" &&
          box.left >= bounds.left - 1 &&
          box.right <= bounds.right + 1 &&
          !!hit &&
          tab.contains(hit)
        );
      })
      .map((tab) => tab.textContent?.trim() ?? "");
  });
}

/** Ninguna pestaña a la vista pisa la píldora «Esperando simulador». */
async function sinSolapes(page: Page, label: string) {
  const overlap = await page.evaluate(() => {
    const pill = document.querySelector(".v-simulator-pill");
    const list = document.querySelector(".v-section-tab-list");
    if (!pill || !list) return null;
    const limit = pill.getBoundingClientRect().left;
    const more = document.querySelector<HTMLElement>(".v-section-tabs-more");
    const right = Math.max(
      list.getBoundingClientRect().right,
      more && !more.hidden ? more.getBoundingClientRect().right : 0,
    );
    return right - limit;
  });
  assert.ok(overlap !== null, `${label}: falta la píldora o la lista`);
  assert.ok(
    overlap <= 0,
    `${label}: las pestañas pisan «Esperando simulador» (${overlap.toFixed(1)} px)`,
  );
}

async function menu(page: Page, label: string) {
  const more = page.getByRole("button", { name: MORE, exact: true });
  if (!(await more.isVisible())) return [];
  assert.equal(await more.getAttribute("aria-haspopup"), "menu", label);
  assert.equal(await more.getAttribute("aria-expanded"), "false", label);
  await more.click();
  const popup = page.getByRole("menu", { name: MORE, exact: true });
  await popup.waitFor();
  assert.equal(await more.getAttribute("aria-expanded"), "true", label);
  const items = (await popup.getByRole("menuitem").allTextContents()).map(
    (text) => text.trim(),
  );
  await page.keyboard.press("Escape");
  await popup.waitFor({ state: "hidden" });
  await until(
    () => more.evaluate((node) => node === document.activeElement),
    5000,
    "Escape devuelve el foco a «⋯»",
  );
  return items;
}

function region(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((start) => {
      for (let node: Element | null = start; node; node = node.parentElement) {
        const value =
          getComputedStyle(node).getPropertyValue("-webkit-app-region");
        if (value === "drag" || value === "no-drag") return value;
      }
      return "none";
    });
}

async function abrirAjustes(browser: Browser, base: string, caso: Caso) {
  const [width, height] = caso.ventana;
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${base}?escena=visual-dark:inicio-base`);
  await page.locator(".v-section-title", { hasText: /^Ajustes$/ }).waitFor();
  if (caso.lateral) {
    await page
      .getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      })
      .first()
      .click();
    await page.locator(".v-sidebar:not(.v-sidebar--collapsed)").waitFor();
  }
  await until(
    async () => (await page.locator(".v-titlebar [role=tab]").count()) === 8,
    5000,
    "8 pestañas de Ajustes",
  );
  await asentada(page);
  return { context, page };
}

async function casoAjustes(browser: Browser, base: string, caso: Caso) {
  const label = nombre(caso);
  const { context, page } = await abrirAjustes(browser, base, caso);
  try {
    const zoom = await page.evaluate(
      () => getComputedStyle(document.documentElement).zoom,
    );
    assert.equal(zoom, caso.zoom, `${label}: zoom de la interfaz`);
    const tabs = (
      await page.locator(".v-titlebar [role=tab]").allTextContents()
    ).map((text) => text.trim());
    assert.deepEqual(tabs, AJUSTES, `${label}: pestañas de Ajustes del mock`);
    await sinSolapes(page, label);
    const vistas = await alcanzables(page);
    const enMenu = await menu(page, label);
    if (caso.todas) {
      assert.deepEqual(vistas, AJUSTES, `${label}: se ven las 8 pestañas`);
      assert.deepEqual(enMenu, [], `${label}: sin «⋯»`);
    } else assert.ok(enMenu.length > 0, `${label}: debe aparecer «⋯»`);
    for (const tab of AJUSTES)
      assert.ok(
        vistas.includes(tab) !== enMenu.includes(tab),
        `${label}: «${tab}» ni se ve ni está en «⋯» (o está en los dos)`,
      );
    // La lista solo contiene pestañas; «⋯» va fuera.
    assert.equal(
      await page
        .getByRole("tablist", { name: "Ajustes" })
        .evaluate((list) =>
          [...list.querySelectorAll("button")].every(
            (node) => node.getAttribute("role") === "tab",
          ),
        ),
      true,
      `${label}: la tablist solo contiene pestañas`,
    );
    // Elegir en el menú: seleccionada, con el foco y a la vista.
    for (const elegida of enMenu) {
      await page.getByRole("button", { name: MORE, exact: true }).click();
      await page.getByRole("menuitem", { name: elegida, exact: true }).click();
      const tab = page.getByRole("tab", { name: elegida, exact: true });
      await until(
        () => tab.evaluate((node) => node === document.activeElement),
        5000,
        `${label}: «${elegida}» recibe el foco`,
      );
      await asentada(page);
      assert.equal(
        await tab.getAttribute("aria-selected"),
        "true",
        `${label}: «${elegida}» seleccionada`,
      );
      assert.ok(
        (await alcanzables(page)).includes(elegida),
        `${label}: «${elegida}» a la vista tras elegirla en «⋯»`,
      );
      const vistasAhora = await alcanzables(page);
      const menuAhora = await menu(page, label);
      for (const other of AJUSTES)
        assert.ok(
          vistasAhora.includes(other) !== menuAhora.includes(other),
          `${label}: tras elegir «${elegida}», «${other}» se perdió`,
        );
    }
    // Ratón: pulsar cada pestaña (Playwright desplaza la lista hasta ella, como
    // un panel táctil). La seleccionada no tira de la lista y todas se eligen.
    for (const name of [...AJUSTES, ...[...AJUSTES].reverse()]) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.click({ timeout: 5000 });
      await until(
        async () => (await tab.getAttribute("aria-selected")) === "true",
        5000,
        `${label}: el clic selecciona «${name}»`,
      );
    }
    // Teclado: Fin, Inicio y las flechas recorren las 8 y la enfocada se ve.
    await page.getByRole("tab", { selected: true }).focus();
    const keys = [
      ["End", "Diagnóstico"],
      ["Home", "Cuenta"],
      ...AJUSTES.slice(1).map((tab) => ["ArrowRight", tab] as const),
      ...AJUSTES.slice(0, -1)
        .reverse()
        .map((tab) => ["ArrowLeft", tab] as const),
    ] as const;
    for (const [key, tab] of keys) {
      await page.keyboard.press(key);
      const target = page.getByRole("tab", { name: tab, exact: true });
      await until(
        () => target.evaluate((node) => node === document.activeElement),
        5000,
        `${label}: ${key} enfoca «${tab}»`,
      );
      await asentada(page);
      assert.ok(
        (await alcanzables(page)).includes(tab),
        `${label}: ${key} deja «${tab}» enfocada pero oculta`,
      );
    }
    // Arrastre (#2854): la lista y el hueco sí; pestañas, «⋯» y menú no.
    assert.equal(await region(page, ".v-section-tabs-slot"), "drag", label);
    assert.equal(await region(page, ".v-section-tab-list"), "drag", label);
    assert.equal(await region(page, ".v-titlebar [role=tab]"), "no-drag");
    if (!caso.todas) {
      assert.equal(await region(page, ".v-section-tabs-more"), "no-drag");
      await page.getByRole("button", { name: MORE, exact: true }).click();
      await page.getByRole("menu").waitFor();
      assert.equal(await region(page, ".v-section-tabs-menu"), "no-drag");
      assert.equal(await region(page, "[role=menuitem]"), "no-drag");
      await page.keyboard.press("Escape");
      await page.getByRole("menu").waitFor({ state: "hidden" });
    }
    return { caso: label, vistas: vistas.length, enMenu };
  } finally {
    await context.close();
  }
}

/** Seleccionada sin foco y después la ventana se estrecha: sigue a la vista. */
async function seleccionadaTrasEstrechar(browser: Browser, base: string) {
  const { context, page } = await abrirAjustes(browser, base, {
    ventana: [1280, 900],
    todas: true,
    zoom: "1",
  });
  try {
    await page.getByRole("tab", { name: "Diagnóstico", exact: true }).click();
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.setViewportSize({ width: 1024, height: 592 });
    await until(
      async () =>
        (await page.evaluate(
          () => getComputedStyle(document.documentElement).zoom,
        )) === "0.9",
      5000,
      "zoom 90 % al estrechar",
    );
    await asentada(page);
    assert.ok(
      (await alcanzables(page)).includes("Diagnóstico"),
      "1280→1024: la pestaña seleccionada quedó oculta",
    );
  } finally {
    await context.close();
  }
}

/** A1 en las demás pantallas con pestañas: nada oculto ni solapado. */
const PANTALLAS = [
  {
    pantalla: "Overlays Studio",
    escena: "visual-dark:inicio-base",
    nav: "studio",
  },
  { pantalla: "Launcher", escena: "visual-dark:inicio-base", nav: "launcher" },
  { pantalla: "Roadmap", escena: "visual-dark:inicio-base", nav: "roadmap" },
  {
    pantalla: "Calendario",
    escena: "visual-dark:calendar-reference",
    nav: "calendar",
  },
  {
    pantalla: "Testing",
    escena: "visual-dark:testing-reference",
    nav: "testing",
  },
  { pantalla: "Análisis", escena: "analysis-qa-lost-part" },
] as const;

async function otrasPantallas(browser: Browser, base: string) {
  const out = [];
  for (const ventana of [
    [1280, 720],
    [1280, 900],
    [1440, 1000],
  ] as const)
    for (const item of PANTALLAS) {
      const label = `${item.pantalla} ${ventana.join("×")}`;
      const context = await browser.newContext({
        viewport: { width: ventana[0], height: ventana[1] },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      try {
        if (!("nav" in item)) await page.clock.setFixedTime(analysisQaNow);
        await page.goto(`${base}?escena=${item.escena}`);
        await page.locator(".v-titlebar").waitFor();
        if ("nav" in item) {
          await page.locator(`button[data-nav=${item.nav}]`).click();
          await page
            .locator(`button[data-nav=${item.nav}][aria-current=page]`)
            .waitFor();
        }
        await page.locator(".v-titlebar [role=tab]").first().waitFor();
        const title = await page.locator(".v-section-title").textContent();
        assert.ok(
          title
            ?.toLocaleLowerCase("es")
            .includes(item.pantalla.toLocaleLowerCase("es")),
          `${label}: la barra muestra «${title}»`,
        );
        await asentada(page);
        const tabs = (
          await page.locator(".v-titlebar [role=tab]").allTextContents()
        ).map((text) => text.trim());
        assert.deepEqual(
          await alcanzables(page),
          tabs,
          `${label}: alguna pestaña queda oculta`,
        );
        assert.equal(
          await page.locator(".v-section-tabs-more").isVisible(),
          false,
          `${label}: no debe aparecer «⋯»`,
        );
        await sinSolapes(page, label);
        out.push({ pantalla: label, pestanas: tabs.length });
      } finally {
        await context.close();
      }
    }
  return out;
}

export async function checkSectionTabs(page: Page, base: string) {
  const browser = page.context().browser();
  assert.ok(browser, "checkSectionTabs necesita el navegador de Playwright");
  const casos = [];
  for (const caso of CASOS) casos.push(await casoAjustes(browser, base, caso));
  await seleccionadaTrasEstrechar(browser, base);
  return { casos, otras: await otrasPantallas(browser, base) };
}
