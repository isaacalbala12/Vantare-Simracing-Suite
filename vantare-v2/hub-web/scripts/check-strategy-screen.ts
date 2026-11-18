import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import type { HostToUi, UiToHost } from "../src/contract/generated/contract";
import { until } from "./wait-for";

type Scheme = "dark" | "light";
const scenes = {
  col: "ready",
  "col-vacio": "empty",
  "col-importado": "importedLegacy",
  "col-danado": "recovered",
  "col-futuro": "protected",
  "col-conflicto": "ready",
  "col-sucio": "ready",
} as const;

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}
async function fill(page: Page, fields: Record<string, string>) {
  for (const [name, value] of Object.entries(fields))
    await page.getByRole("textbox", { name, exact: true }).fill(value);
}

async function setup(page: Page, scheme: Scheme, zoom: number) {
  await page.addInitScript(
    ({ scheme, zoom }) => {
      const post = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function (
        message: HostToUi | UiToHost,
        transfer?: StructuredSerializeOptions | Transferable[],
      ) {
        if (message?.kind === "hello" && "theme" in message)
          message = { ...message, theme: { ...message.theme, scheme } };
        if (
          message?.kind === "response" &&
          message.result.method === "settings.get"
        ) {
          message.result.value.appearance.scheme = scheme;
          message.result.value.zoom = zoom;
        }
        // Inject one stale save reply through the normal protocol without changing the mock.
        const conflict = new URLSearchParams(location.search).has("conflict");
        if (
          conflict &&
          message?.kind === "response" &&
          message.result.method === "strategy.save"
        ) {
          message = {
            kind: "failure",
            id: message.id,
            error: {
              kind: "strategyConflict",
              current: {
                ...message.result.value,
                file: { name: "carreras-actualizadas.json" },
              },
            },
          };
        }
        Reflect.apply(post, this, [message, transfer]);
      };
    },
    { scheme, zoom },
  );
}
async function navigate(
  page: Page,
  base: string,
  scene: string,
  conflict = false,
) {
  await page.goto(`${base}?escena=${scene}${conflict ? "&conflict" : ""}`);
  const sidebar = page.locator(".v-sidebar");
  await sidebar.waitFor();
  if (
    await sidebar.evaluate((node) =>
      node.classList.contains("v-sidebar--collapsed"),
    )
  ) {
    await page.keyboard.press("Control+b");
    await until(
      () =>
        sidebar.evaluate(
          (node) => !node.classList.contains("v-sidebar--collapsed"),
        ),
      5000,
      "strategy sidebar expanded",
    );
  }
  await page.getByRole("button", { name: /^(Estrategia|Strategy)/ }).click();
}
async function collection(
  page: Page,
  base: string,
  scene: string,
  conflict = false,
) {
  await navigate(page, base, `strategy-${scene}`, conflict);
  await page.getByRole("heading", { name: "Tus estrategias" }).waitFor();
}
async function chooseWizard(page: Page) {
  await page
    .getByRole("button", { name: /^(Nueva estrategia|Empezar)$/ })
    .press("Enter");
}
async function combination(page: Page) {
  await fill(page, { Circuito: "Fuji Speedway", "Clase o coche": "Hypercar" });
}
async function rules(page: Page) {
  await fill(page, {
    "Nombre de la carrera": "Fuji 6 Horas",
    Salida: "2026-12-06 13:00",
    Duración: "360",
    Depósito: "82",
    "Reserva al final": "0,8",
    "Energía virtual máxima": "100",
    "Energía virtual por vuelta": "2,316",
    "Vueltas que vas a dar": "236",
    "Consumo por vuelta": "1,830",
  });
  await page.getByText("Neumáticos y boxes", { exact: true }).click();
  await fill(page, {
    "Vida del neumático": "43",
    "Tránsito por boxes": "25",
    "Velocidad de repostaje": "4",
    "Velocidad de recarga de energía": "2,5",
    "Cambio de neumáticos": "30",
  });
}
async function pilot(page: Page) {
  await fill(page, {
    "Nombre del piloto": "Isaac Albalá",
    Iniciales: "IA",
    "Ritmo por vuelta": "90,472",
  });
}
async function createRace(page: Page) {
  await chooseWizard(page);
  const next = () => button(page, "Continuar").click();
  await next();
  await combination(page);
  await next();
  await rules(page);
  await next();
  await pilot(page);
  await next();
  await fill(page, { "Nombre de esta estrategia": "Seco" });
  await button(page, "Crear carrera").click();
  await page.getByRole("tab", { name: "Carrera", exact: true }).waitFor();
}

async function verify(
  page: Page,
  scene: string,
  scheme: Scheme,
  width: number,
) {
  const scope = page.locator(".strategy-screen");
  assert.equal(await scope.getByRole("status").count(), 1, scene);
  assert.equal(
    await scope.evaluate((node) =>
      [
        document.documentElement,
        document.querySelector(".v-shell-main"),
        node,
        node.querySelector(".strategy-wizard-body"),
        node.querySelector(".strategy-race"),
        node.querySelector(".strategy-race-editor-body"),
      ].every((panel) => !panel || panel.scrollWidth <= panel.clientWidth + 1),
    ),
    true,
    `horizontal overflow: ${scene}`,
  );
  assert(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <=
        document.documentElement.clientHeight + 1,
    ),
    `document scrolls outside strategy at ${scene}`,
  );
  if (width === 1280) {
    const geometry = await scope.evaluate((node) => {
      const bar = node
        .querySelector(".strategy-filebar")
        ?.getBoundingClientRect();
      const content = Array.from(node.children)
        .slice(1)
        .find((child) => getComputedStyle(child).position !== "absolute")
        ?.getBoundingClientRect();
      const header = document
        .querySelector(".v-titlebar")
        ?.getBoundingClientRect();
      if (!bar || !content || !header)
        throw new Error("Missing strategy header geometry");
      return {
        header: header.height,
        row: bar.height,
        push: content.top - bar.top,
      };
    });
    assert(
      geometry.push <= 40,
      `Strategy/${scene}/${scheme}: file row pushes content ${geometry.push}px (max 40px)`,
    );
    if (scene === "col" || scene === "as-reglas")
      console.log(
        `Strategy 1280×720 ${scene}/${scheme}: ${JSON.stringify(geometry)}`,
      );
  }
  const text = (await scope.textContent()) ?? "";
  assert(
    !/[a-z]:[\\/]|\\\\|(^|\s)\/(?:[^\s]+\/)+/im.test(text),
    `path displayed: ${scene}`,
  );
  const { violations } = await new AxeBuilder({ page })
    .include(".strategy-screen")
    .include('[role="menu"][aria-label="Archivo"]')
    .exclude('[data-base-ui-focus-guard][aria-hidden="true"]')
    .analyze();
  assert.deepEqual(
    violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target }) => target),
    })),
    [],
    `Estrategia/${scene}/${scheme}/${width}`,
  );
}

async function editRace(page: Page, shot: (name: string) => Promise<void>) {
  await page
    .getByRole("button", { name: "Editar carrera", exact: true })
    .press("Enter");
  assert(
    await page
      .getByRole("heading", { name: "Editando los datos de la carrera" })
      .evaluate((node) => node.matches(":focus-visible")),
  );
  await shot("carrera-editar");

  const deposit = page.getByRole("textbox", { name: "Depósito", exact: true });
  const date = page.getByRole("textbox", { name: "Salida", exact: true });
  assert.equal(
    await page
      .getByText("Fecha y hora de inicio", { exact: true })
      .evaluate(
        (node) =>
          !!node.closest("a, [role=link]") ||
          getComputedStyle(node).textDecorationLine !== "none",
      ),
    false,
  );
  await date.press("Tab");
  assert(
    await page
      .getByRole("textbox", { name: "Duración", exact: true })
      .evaluate(
        (node) =>
          node === document.activeElement && node.matches(":focus-visible"),
      ),
  );
  const depositDecoration = () =>
    deposit.evaluate((node) => {
      if (!node.parentElement) throw new Error("Missing field frame");
      const style = getComputedStyle(node.parentElement);
      return {
        border: style.borderColor,
        outline: style.outlineStyle,
        width: style.outlineWidth,
      };
    });
  const clean = await depositDecoration();
  await deposit.fill("85");
  assert.equal(await deposit.getAttribute("aria-invalid"), null);
  assert(await deposit.evaluate((node) => node.matches(":focus-visible")));
  const focused = await depositDecoration();
  assert.equal(focused.border, clean.border);
  assert.equal(focused.outline, "solid");
  assert(Number.parseFloat(focused.width) >= 1, "visible field focus outline");
  await shot("carrera-foco");

  await deposit.fill("");
  await button(page, "Confirmar datos").press("Enter");
  const alert = page.getByRole("alert");
  await alert.getByText("Revisa 1 dato antes de continuar").waitFor();
  assert.equal(await deposit.getAttribute("aria-invalid"), "true");
  const invalid = await depositDecoration();
  assert.notEqual(invalid.border, focused.border);
  assert.equal(invalid.outline, "none");
  await page
    .locator(".strategy-field [data-error=true]")
    .scrollIntoViewIfNeeded();
  await shot("carrera-error");
  await button(page, "Cancelar edición").press("Enter");
  assert(
    await page
      .getByRole("button", { name: "Editar carrera", exact: true })
      .evaluate(
        (node) =>
          node.matches(":focus-visible") && document.activeElement === node,
      ),
  );
}

async function exercise(
  page: Page,
  base: string,
  scheme: Scheme,
  width: number,
  height: number,
  evidence?: string,
) {
  await page.setViewportSize({ width, height });
  await setup(page, scheme, 100);
  const saveShot = async (name: string) => {
    await verify(page, name, scheme, width);
    if (name.startsWith("as-"))
      await page.locator(".strategy-wizard-body").evaluate((node) => {
        node.scrollTop = 0;
      });
    const suffix = scheme === "dark" ? "oscuro" : "claro";
    if (
      evidence &&
      (width === 1440 ||
        name.startsWith("carrera") ||
        (scheme === "dark" && ["col", "as-reglas"].includes(name)))
    )
      await page.screenshot({
        path: resolve(
          evidence,
          `${width === 1280 ? "1280-" : ""}${name}-${suffix}.png`,
        ),
      });
  };
  for (const [name, scene] of Object.entries(scenes)) {
    await collection(page, base, scene, name === "col-conflicto");
    if (name === "col-sucio" || name === "col-conflicto") {
      await createRace(page);
      await button(page, "← Tus estrategias").click();
      if (name === "col-sucio") {
        await page.getByRole("button", { name: /Practice/ }).click();
        await page.getByRole("alert").waitFor();
        await button(page, "Más acciones de archivo").press("ArrowDown");
        await page.getByRole("menu").waitFor();
      } else {
        await page.keyboard.press("Control+s");
        await page
          .getByText(
            "No se ha guardado: el archivo ha cambiado fuera de esta pantalla.",
          )
          .waitFor();
      }
    }
    await saveShot(name);
    if (name === "col-sucio") {
      const more = button(page, "Más acciones de archivo");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Escape");
      await until(
        () =>
          more.evaluate(
            (node) =>
              document.activeElement === node && node.matches(":focus-visible"),
          ),
        5000,
        "focus returns to the file menu",
      );
      await page.keyboard.press("Control+s");
      await page
        .getByText("Guardado.", { exact: true })
        .waitFor({ state: "attached" });
    }
  }
  await collection(page, base, "ready");
  await button(page, "Continuar").click();
  await page.getByRole("tab", { name: "Carrera", exact: true }).waitFor();
  await saveShot("carrera");
  await editRace(page, saveShot);

  await collection(page, base, "ready");
  await chooseWizard(page);
  async function step(name: string, n: number) {
    const active = page.locator('[aria-current="step"]');
    assert.equal(await active.count(), 1);
    assert.match((await active.textContent()) ?? "", new RegExp(String(n)));

    await saveShot(name);
  }
  const next = () => button(page, "Continuar").click();
  assert(
    await page.evaluate(() =>
      document.activeElement?.matches("h2:focus-visible"),
    ),
  );
  await page
    .locator(".strategy-wizard-head")
    .getByRole("button", { name: "Tus estrategias", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".strategy-wizard-head").getByRole("button").count(),
    1,
  );
  assert.equal(
    await page
      .locator(".strategy-summary")
      .getByText("Se guarda al crear la carrera en el último paso.", {
        exact: true,
      })
      .count(),
    1,
  );
  await step("as-inicio", 1);
  await next();
  await combination(page);
  await step("as-comb", 2);
  await next();
  await rules(page);
  assert.equal(await page.locator(".strategy-advanced summary svg").count(), 1);
  await step("as-reglas", 3);
  await fill(page, { "Vueltas que vas a dar": "", "Consumo por vuelta": "0" });
  await next();
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 2);
  await saveShot("as-reglas-error");
  await fill(page, {
    "Vueltas que vas a dar": "236",
    "Consumo por vuelta": "1,830",
  });
  await next();
  await pilot(page);
  await step("as-pilotos", 4);
  await next();
  await fill(page, { "Nombre de esta estrategia": "Seco" });
  await step("as-sesiones", 5);
}

export async function checkStrategyScreen(
  parent: Page,
  base: string,
  evidence?: string,
) {
  if (evidence) await mkdir(evidence, { recursive: true });
  await Promise.all(
    (["dark", "light"] as const).flatMap((scheme) =>
      [
        [1440, 900],
        [1280, 720],
      ].map(async ([width, height]) => {
        const page = await parent.context().newPage();
        try {
          await exercise(page, base, scheme, width, height, evidence);
        } finally {
          await page.close();
        }
      }),
    ),
  );

  const page = await parent.context().newPage();
  try {
    await navigate(page, base, "proximamente-base");
    await page
      .locator(".v-upcoming")
      .getByRole("heading", { name: "Estrategia", exact: true, level: 1 })
      .waitFor();
    assert.equal(await page.locator(".strategy-screen").count(), 0);
  } finally {
    await page.close();
  }

  if (evidence) {
    await Promise.all(
      (["light", "dark"] as const).map(async (scheme) => {
        const page = await parent.context().newPage();
        try {
          const width = 1600;
          await page.setViewportSize({ width, height: 900 });
          await setup(page, scheme, 125);
          await collection(page, base, "ready");
          await until(
            () =>
              page.evaluate(
                () => document.documentElement.style.zoom === "1.25",
              ),
            5000,
            "Strategy zoom 125%",
          );
          await button(page, "Continuar").click();
          const shot = async (name: string) => {
            await verify(page, name, scheme, width);
            const suffix = scheme === "dark" ? "oscuro" : "claro";
            await page.screenshot({
              path: resolve(evidence, `zoom125-${name}-${suffix}.png`),
            });
          };
          await shot("carrera");
          await editRace(page, shot);
        } finally {
          await page.close();
        }
      }),
    );
  }

  for (const [scheme, zoom, folded] of [
    ["light", 125, false],
    ["light", 100, true],
    ["dark", 100, true],
  ] as const) {
    const page = await parent.context().newPage();
    try {
      const width = zoom === 125 ? 1600 : 1440;
      await page.setViewportSize({ width, height: 900 });
      await setup(page, scheme, zoom);
      await collection(page, base, "ready");
      if (folded) {
        if (!(await page.locator(".v-sidebar--collapsed").count()))
          await page.keyboard.press("Control+b");
        await page.locator(".v-sidebar--collapsed").waitFor();
      } else {
        await until(
          () =>
            page.evaluate(() => document.documentElement.style.zoom === "1.25"),
          5000,
          "Strategy zoom 125%",
        );
      }
      const prefix = folded ? "plegada" : "zoom125";
      const suffix = scheme === "dark" ? "oscuro" : "claro";
      await verify(page, prefix, scheme, width);
      if (evidence)
        await page.screenshot({
          path: resolve(evidence, `${prefix}-col-${suffix}.png`),
        });
      await chooseWizard(page);
      await button(page, "Continuar").click();
      await combination(page);
      await button(page, "Continuar").click();
      await rules(page);
      await page.locator(".strategy-wizard-body").evaluate((node) => {
        node.scrollTop = 0;
      });
      await verify(page, prefix, scheme, width);
      if (evidence)
        await page.screenshot({
          path: resolve(evidence, `${prefix}-as-reglas-${suffix}.png`),
        });
    } finally {
      await page.close();
    }
  }
}
