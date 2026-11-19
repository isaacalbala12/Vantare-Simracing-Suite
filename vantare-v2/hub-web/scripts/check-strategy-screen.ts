import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "playwright-core";
import type { HostToUi, UiToHost } from "../src/contract/generated/contract";
import { until } from "./wait-for";

// Comprobar y capturar son cosas distintas: `verify` (axe, desbordamiento,
// foco, conducta) corre SIEMPRE; los PNG solo se escriben si se pasa
// `evidence` (carpeta). `web-a11y.ts` la pasa solo con STRATEGY_SHOTS=1:
//   STRATEGY_SHOTS=1 bun scripts/web-a11y.ts   -> test-results/web/strategy/
// (o VANTARE_HUB_EVIDENCE=<carpeta> para otra raíz). Ninguna captura se usa
// como aserción (no hay comparación de píxeles).

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
        node.querySelector(".strategy-plan"),
        node.querySelector(".strategy-legs"),
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
  // The editor was just audited in this layout. The focus exercise checks
  // the ring and border directly without a second axe pass over the same form.
  if (
    [
      "carrera-foco",
      "carrera-editar-fin",
      "carrera-calcular-error",
      "plan-ok-fin",
    ].includes(scene)
  )
    return;
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
  // The title takes programmatic focus so a screen reader announces it, but it
  // is not a control: it keeps tabindex -1 and draws no focus ring.
  const title = page.getByRole("heading", {
    name: "Editando los datos de la carrera",
  });
  assert(await title.evaluate((node) => node === document.activeElement));
  assert.equal(await title.getAttribute("tabindex"), "-1");
  assert.equal(
    await title.evaluate((node) => getComputedStyle(node).outlineStyle),
    "none",
  );
  await shot("carrera-editar");
  const body = page.locator(".strategy-race-editor-body");
  await body.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await shot("carrera-editar-fin");
  await body.evaluate((node) => {
    node.scrollTop = 0;
  });

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

async function openPlan(page: Page, base: string, scene: string) {
  await collection(page, base, scene);
  await button(page, "Continuar").click();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
}
async function focusVisible(locator: Locator) {
  assert(
    await locator.evaluate(
      (node) =>
        node === document.activeElement && node.matches(":focus-visible"),
    ),
  );
}
// The stints are drawn to scale inside the bar and every stop sits on it.
async function checkTimeline(page: Page, scene: string) {
  const drawn = await page.locator(".strategy-timeline-bar").evaluate((bar) => {
    const area = bar.getBoundingClientRect();
    const inside = (node: Element) => {
      const box = node.getBoundingClientRect();
      return box.left >= area.left - 1 && box.right <= area.right + 1;
    };
    return {
      stints: Array.from(bar.querySelectorAll("[data-stint]")).map(inside),
      stops: Array.from(bar.querySelectorAll("[data-stop] > i")).map((node) => {
        const box = node.getBoundingClientRect();
        return box.left >= area.left - 8 && box.right <= area.right + 8;
      }),
    };
  });
  assert(drawn.stints.length > 0 && drawn.stints.every(Boolean), scene);
  assert(drawn.stops.every(Boolean), `stop outside the timeline: ${scene}`);
}

// Every state of the plan tab, one scene each. A calculation is started from
// the tab where the scene needs it, as a person would.
async function planStates(
  page: Page,
  base: string,
  scheme: Scheme,
  width: number,
  saveShot: (name: string) => Promise<void>,
  zoomed = false,
) {
  const ready = async (scene: string) => {
    await openPlan(page, base, scene);
    if (zoomed)
      await until(
        () =>
          page.evaluate(() => document.documentElement.style.zoom === "1.25"),
        5000,
        "Strategy zoom 125%",
      );
  };
  const noEditing = async (name: string) => {
    const text = (await page.locator(".strategy-plan").textContent()) ?? "";
    assert(!/Ajustar|Recalcular|Restablecer|valor anterior/.test(text), name);
    assert.equal(await page.getByRole("slider").count(), 0, name);
  };
  // a plan with a schedule offers the three views, and nothing to change yet
  const summaryOnly = async (name: string) => {
    const views = page
      .getByRole("group", { name: "Vista del plan" })
      .getByRole("button");
    assert.deepEqual(
      await views.allTextContents(),
      ["Resumen", "Ajustar stints", "Ajustar paradas"],
      name,
    );
    assert.equal(await page.getByRole("slider").count(), 0, name);
    assert.equal(
      await page
        .locator(".strategy-plan")
        .getByRole("button", { name: /^(Recalcular|Restablecer)$/ })
        .count(),
      0,
      name,
    );
  };

  await ready("ready");
  await page.getByRole("heading", { name: "Calcula tu plan" }).waitFor();
  await noEditing("plan-sin");
  await saveShot("plan-sin");

  await ready("calculating");
  await button(page, "Calcular plan").press("Enter");
  await page.getByRole("heading", { name: "Calculando…" }).waitFor();
  assert.equal(
    await page.locator(".strategy-screen").getByRole("status").textContent(),
    "Calculando el plan.",
  );
  await page.keyboard.press("Tab");
  await focusVisible(button(page, "Cancelar"));
  await saveShot("plan-calc");
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Sin calcular" }).waitFor();
  // the heading takes the focus the cancelled calculation left
  assert(
    await page.evaluate(() => document.activeElement?.tagName === "H2"),
    "focus after cancelling",
  );

  await ready("plannedFuji");
  await page.getByRole("heading", { name: "Plan calculado" }).waitFor();
  await summaryOnly("plan-ok");
  await checkTimeline(page, "plan-ok");
  assert.equal(
    await page
      .getByRole("list", { name: "Stints y paradas" })
      .getByRole("listitem")
      .count(),
    11,
  );
  await saveShot("plan-ok");
  await page.locator(".strategy-race").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await saveShot("plan-ok-fin");

  await ready("plannedFujiPartial");
  await page
    .getByText("Plan válido, pero sin garantía de que sea el más rápido")
    .waitFor();
  await summaryOnly("plan-parcial");
  await saveShot("plan-parcial");

  await adjustStates(page, ready, saveShot);

  await ready("computeFailed");
  await button(page, "Calcular plan").press("Enter");
  await page.getByRole("alert").waitFor();
  await saveShot("plan-error");

  await ready("reasonNoFeasiblePlan");
  await button(page, "Calcular plan").press("Enter");
  await page
    .getByRole("heading", {
      name: "Ningún plan termina la carrera con estos datos",
    })
    .waitFor();
  await saveShot("plan-nosol");

  // the plan the mock really calculates (3 laps), checked but not photographed
  await ready("planned");
  await page.getByRole("heading", { name: "Plan calculado" }).waitFor();
  await checkTimeline(page, "plan-mock");
  await verify(page, "plan-mock", scheme, width);

  // a calculation that refuses an input leads back to the marked field
  await openPlan(page, base, "computeInvalid");
  await page.getByRole("tab", { name: "Carrera", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar carrera", exact: true })
    .press("Enter");
  await fill(page, { "Nombre de la carrera": "Copa Fuji" });
  await button(page, "Confirmar y calcular").press("Enter");
  const laps = page.getByRole("textbox", {
    name: "Vueltas que vas a dar",
    exact: true,
  });
  await until(
    async () =>
      (await laps.getAttribute("aria-invalid").catch(() => null)) === "true",
    5000,
    "marked field after a refused calculation",
  );
  assert.equal(
    await page
      .getByRole("textbox", { name: "Nombre de la carrera", exact: true })
      .inputValue(),
    "Copa Fuji",
  );
  await saveShot("carrera-calcular-error");
}

// The Carrera tab of a race with a plan: the card that leads to the plan, and none without.
async function carreraWithPlan(
  page: Page,
  base: string,
  saveShot: (name: string) => Promise<void>,
) {
  await collection(page, base, "plannedFuji");
  await button(page, "Continuar").click();
  await page
    .getByText("Calculado · 6:01:04 · 5 paradas", { exact: true })
    .waitFor();
  await saveShot("carrera-plan");
  await button(page, "Ver plan").press("Enter");
  await page.getByRole("heading", { name: "Plan calculado" }).waitFor();
}

const rangeOf = (page: Page) =>
  page.getByRole("slider", { name: "Termina en la vuelta", exact: true });
async function lapReaches(page: Page, wanted: (lap: number) => boolean) {
  let seen = Number.NaN;
  await until(
    async () => {
      seen = Number(await rangeOf(page).inputValue());
      return wanted(seen);
    },
    5000,
    "stint boundary lap",
  );
  return seen;
}

// The edited plan: moving stints (keys, typed lap and drag) and stops, the plan
// that is modified, recalculated or reset, and what a recalculation can do wrong.
async function adjustStates(
  page: Page,
  ready: (scene: string) => Promise<void>,
  saveShot: (name: string) => Promise<void>,
) {
  const fileState = () =>
    page.locator(".strategy-file-state").getAttribute("data-state");
  const notSaved = page.getByText(
    "Estos ajustes son para probar. No se guardan en el archivo.",
    { exact: true },
  );
  const modified = () =>
    page.getByRole("heading", { name: "Plan modificado" }).waitFor();
  const status = () =>
    page.locator(".strategy-screen").getByRole("status").textContent();

  // stints: radios with arrows, the slider with keys, a typed lap and the mouse
  await ready("plannedFuji");
  await page.getByRole("heading", { name: "Plan calculado" }).waitFor();
  await button(page, "Ajustar stints").click();
  await page.getByRole("heading", { name: "Ajustar stints" }).waitFor();
  assert.equal(await notSaved.count(), 1);
  await page.getByRole("radio", { name: "Stint 1, 43 vueltas" }).focus();
  await page.keyboard.press("ArrowRight");
  assert(
    await page
      .getByRole("radio", { name: "Stint 2, 42 vueltas" })
      .evaluate((node) => (node as HTMLInputElement).checked),
    "arrow key walks the stints",
  );
  const range = rangeOf(page);
  assert.equal(await range.getAttribute("min"), "44");
  assert.equal(await range.getAttribute("max"), "126");
  assert.equal(
    await range.getAttribute("aria-valuetext"),
    "Vuelta 85: el stint 2 tiene 42 vueltas y el stint 3, 42 vueltas",
  );
  await saveShot("plan-stints");
  await range.focus();
  await focusVisible(range);
  await range.press("ArrowRight");
  assert.equal(await lapReaches(page, (lap) => lap === 86), 86);
  await modified();
  await focusVisible(range);
  assert.equal(await fileState(), "saved");
  assert.equal(await notSaved.count(), 1);
  await range.press("Home");
  assert.equal(await lapReaches(page, (lap) => lap === 44), 44);
  await range.press("End");
  assert.equal(await lapReaches(page, (lap) => lap === 126), 126);
  await range.press("PageDown");
  await lapReaches(page, (lap) => lap < 126);
  await range.press("PageUp");
  await lapReaches(page, (lap) => lap === 126);
  assert.equal(
    await range.getAttribute("aria-valuetext"),
    "Vuelta 126: el stint 2 tiene 83 vueltas y el stint 3, 1 vuelta",
  );
  const typed = page.getByRole("textbox", { name: "Termina en la vuelta" });
  await typed.fill("90");
  await typed.press("Enter");
  assert.equal(await lapReaches(page, (lap) => lap === 90), 90);
  await typed.fill("999");
  await typed.press("Enter");
  assert.equal(await lapReaches(page, (lap) => lap === 126), 126);
  await range.scrollIntoViewIfNeeded();
  const box = await range.boundingBox();
  assert(box, "slider box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.9, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 6 });
  await page.mouse.up();
  const dragged = await lapReaches(page, (lap) => lap < 70);
  assert(dragged >= 44, `dragged to ${dragged}`);
  // the plan is modified, and the file is still as it was
  assert.equal(await fileState(), "saved");
  await saveShot("plan-stints-mod");

  // stops: the stop that moves, the plan that is modified and the way out
  await ready("plannedFuji");
  await page.getByRole("heading", { name: "Plan calculado" }).waitFor();
  await button(page, "Ajustar paradas").click();
  await page.getByRole("heading", { name: "Ajustar paradas" }).waitFor();
  await page.getByRole("radio", { name: "Parada 1, vuelta 43" }).focus();
  await page.keyboard.press("ArrowRight");
  const later = button(page, "+ 1 vuelta");
  await later.focus();
  await focusVisible(later);
  await saveShot("plan-paradas");
  await later.press("Enter");
  await modified();
  assert.equal(
    await status(),
    "Parada 2 en la vuelta 86. Cambios pendientes de recalcular.",
  );
  // the button that was pressed keeps the focus through the change
  await focusVisible(later);
  assert.equal(await page.getByText("valor anterior").count(), 8);
  assert.equal(await notSaved.count(), 1);
  assert.equal(await fileState(), "saved");
  await saveShot("plan-pend");
  await button(page, "Resumen").click();
  assert.equal(await notSaved.count(), 1);
  await button(page, "Restablecer").click();
  await page
    .getByText("Ajustes restablecidos.", { exact: true })
    .waitFor({ state: "attached" });
  assert.equal(await page.getByText("valor anterior").count(), 0);
  assert.equal(
    await page
      .locator(".strategy-plan")
      .getByRole("button", { name: /^(Recalcular|Restablecer)$/ })
      .count(),
    0,
  );

  // a recalculated plan says it is a trial, in the summary and in Carrera. The
  // first stop goes one lap earlier: the solver has a plan for that calendar (and
  // not for the second stop one lap later), and does not prove it.
  await button(page, "Ajustar paradas").click();
  await page.getByRole("radio", { name: "Parada 1, vuelta 43" }).focus();
  await button(page, "− 1 vuelta").press("Enter");
  await modified();
  await button(page, "Recalcular").press("Enter");
  await page
    .getByText("Plan recalculado sin garantía de ser el más rápido.", {
      exact: true,
    })
    .waitFor({ state: "attached" });
  await button(page, "Resumen").click();
  const trial = page.getByText(
    "Plan recalculado de prueba: no se guarda en el archivo.",
    { exact: true },
  );
  assert.equal(await trial.count(), 1);
  assert.equal(await fileState(), "saved");
  assert.equal(await page.getByRole("alert").count(), 0);
  await saveShot("plan-recalculado");
  await page.getByRole("tab", { name: "Carrera", exact: true }).click();
  await page
    .getByText("Calculado · 6:01:06 · 5 paradas", { exact: true })
    .waitFor();
  assert.equal(await trial.count(), 1);
  await saveShot("carrera-plan-recalculado");

  // a recalculation: the plan stays on view while it runs
  await ready("plannedFujiRecalculating");
  await button(page, "Ajustar paradas").click();
  await button(page, "+ 1 vuelta").press("Enter");
  await modified();
  await button(page, "Recalcular").press("Enter");
  await page.getByRole("heading", { name: "Recalculando…" }).waitFor();
  assert.equal(await status(), "Recalculando el plan.");
  await page.keyboard.press("Tab");
  await saveShot("plan-recalculando");
  await button(page, "Cancelar").press("Enter");
  await modified();

  // a recalculation that fails, and a plan with no schedule
  await ready("plannedFujiNotPreserved");
  await button(page, "Ajustar paradas").click();
  await button(page, "+ 1 vuelta").press("Enter");
  await modified();
  await button(page, "Recalcular").press("Enter");
  await page.getByRole("alert").waitFor();
  assert.equal(await button(page, "Recalcular").isEnabled(), true);
  await saveShot("plan-edit-error");

  await ready("plannedFujiNoEdit");
  await page.getByRole("heading", { name: "Plan calculado" }).waitFor();
  await page
    .getByText("Este plan no se puede ajustar a mano.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("group", { name: "Vista del plan" }).count(),
    0,
  );
  await saveShot("plan-sin-edicion");
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
        name.startsWith("plan-") ||
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
  await planStates(page, base, scheme, width, saveShot);
  await carreraWithPlan(page, base, saveShot);

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
            page.evaluate(() => document.documentElement.style.zoom === "1.25"),
          5000,
          "Strategy zoom 125%",
        );
        await button(page, "Continuar").click();
        const shot = async (name: string) => {
          await verify(page, name, scheme, width);
          const suffix = scheme === "dark" ? "oscuro" : "claro";
          if (evidence)
            await page.screenshot({
              path: resolve(evidence, `zoom125-${name}-${suffix}.png`),
            });
        };
        await shot("carrera");
        await editRace(page, shot);
        await planStates(page, base, scheme, width, shot, true);
      } finally {
        await page.close();
      }
    }),
  );

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
