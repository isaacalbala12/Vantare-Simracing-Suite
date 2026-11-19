import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Locator, Page } from "playwright-core";
import type { HostToUi, UiToHost } from "../src/contract/generated/contract";
import { axeClassic } from "./axe-classic";
import { focused, press, pressKey, until, visible } from "./wait-for";

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
  for (const [name, value] of Object.entries(fields)) {
    const field = page.getByRole("textbox", { name, exact: true });
    await visible(field);
    await field.fill(value);
  }
}

async function setup(page: Page, scheme: Scheme, zoom: number) {
  await page.addInitScript(
    ({ scheme, zoom }) => {
      const post = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function (
        message: HostToUi | UiToHost,
        transfer?: StructuredSerializeOptions | Transferable[],
      ) {
        // what the screen asked of the host, for the checks of the accepted plan
        if (message?.kind === "request") {
          const w = window as unknown as { __strategyRequests?: unknown[] };
          w.__strategyRequests = [
            ...(w.__strategyRequests ?? []),
            message.request,
          ];
        }
        if (message?.kind === "hello" && "theme" in message)
          message = { ...message, theme: { ...message.theme, scheme } };
        if (
          message?.kind === "response" &&
          message.result.method === "settings.get"
        ) {
          message.result.value.appearance.scheme = scheme;
          message.result.value.zoom = zoom;
        }
        // The window to save stays open: the answer of the export of a file is
        // kept until the check lets it go (`window.__release()`).
        const held = new URLSearchParams(location.search).get("hold");
        if (
          held === "exportFile" &&
          message?.kind === "response" &&
          message.result.method === "strategy.exportFile"
        ) {
          const answer = message;
          (window as unknown as { __release?: () => void }).__release = () =>
            Reflect.apply(post, this, [answer, transfer]);
          return;
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
  await visible(sidebar);
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
  await press(page.getByRole("button", { name: /^(Estrategia|Strategy)/ }));
}
async function collection(
  page: Page,
  base: string,
  scene: string,
  conflict = false,
) {
  await navigate(page, base, `strategy-${scene}`, conflict);
  await visible(page.getByRole("heading", { name: "Tus estrategias" }));
}
async function chooseWizard(page: Page) {
  await pressKey(
    page.getByRole("button", { name: /^(Nueva estrategia|Empezar)$/ }),
    "Enter",
  );
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
  await press(page.getByText("Neumáticos y boxes", { exact: true }));
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
  const next = () => press(button(page, "Continuar"));
  await next();
  await combination(page);
  await next();
  await rules(page);
  await next();
  await pilot(page);
  await next();
  await fill(page, { "Nombre de esta estrategia": "Seco" });
  await press(button(page, "Crear carrera"));
  await visible(page.getByRole("tab", { name: "Carrera", exact: true }));
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
  // Axe clásico (ver axe-classic.ts): falla si el contexto tiene iframes.
  const { violations } = await axeClassic(
    page,
    [
      ".strategy-screen",
      '[role="menu"][aria-label="Archivo"]',
      '[role="menu"][aria-label="Más acciones del plan aceptado"]',
      '[role="menu"][aria-label="Exportar el plan"]',
    ],
    ['[data-base-ui-focus-guard][aria-hidden="true"]'],
  );
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
  await pressKey(
    page.getByRole("button", { name: "Editar carrera", exact: true }),
    "Enter",
  );
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
  await pressKey(button(page, "Confirmar datos"), "Enter");
  const alert = page.getByRole("alert");
  await visible(alert.getByText("Revisa 1 dato antes de continuar"));
  assert.equal(await deposit.getAttribute("aria-invalid"), "true");
  const invalid = await depositDecoration();
  assert.notEqual(invalid.border, focused.border);
  assert.equal(invalid.outline, "none");
  await page
    .locator(".strategy-field [data-error=true]")
    .scrollIntoViewIfNeeded();
  await shot("carrera-error");
  await pressKey(button(page, "Cancelar edición"), "Enter");
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
  await press(button(page, "Continuar"));
  await press(page.getByRole("tab", { name: "Plan", exact: true }));
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
  await visible(page.getByRole("heading", { name: "Calcula tu plan" }));
  await noEditing("plan-sin");
  await saveShot("plan-sin");

  await ready("calculating");
  await pressKey(button(page, "Calcular plan"), "Enter");
  await visible(page.getByRole("heading", { name: "Calculando…" }));
  assert.equal(
    await page.locator(".strategy-screen").getByRole("status").textContent(),
    "Calculando el plan.",
  );
  await page.keyboard.press("Tab");
  await focusVisible(button(page, "Cancelar"));
  await saveShot("plan-calc");
  await page.keyboard.press("Enter");
  await visible(page.getByRole("heading", { name: "Sin calcular" }));
  // the heading takes the focus the cancelled calculation left
  assert(
    await page.evaluate(() => document.activeElement?.tagName === "H2"),
    "focus after cancelling",
  );

  await ready("plannedFuji");
  await visible(page.getByRole("heading", { name: "Plan calculado" }));
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
  await visible(
    page.getByText("Plan válido, pero sin garantía de que sea el más rápido"),
  );
  await summaryOnly("plan-parcial");
  await saveShot("plan-parcial");

  await adjustStates(page, ready, saveShot);

  await ready("computeFailed");
  await pressKey(button(page, "Calcular plan"), "Enter");
  await visible(page.getByRole("alert"));
  await saveShot("plan-error");

  await ready("reasonNoFeasiblePlan");
  await pressKey(button(page, "Calcular plan"), "Enter");
  await visible(
    page.getByRole("heading", {
      name: "Ningún plan termina la carrera con estos datos",
    }),
  );
  await saveShot("plan-nosol");

  // the plan the mock really calculates (3 laps), checked but not photographed
  await ready("planned");
  await visible(page.getByRole("heading", { name: "Plan calculado" }));
  await checkTimeline(page, "plan-mock");
  await verify(page, "plan-mock", scheme, width);

  // a calculation that refuses an input leads back to the marked field
  await openPlan(page, base, "computeInvalid");
  await press(page.getByRole("tab", { name: "Carrera", exact: true }));
  await pressKey(
    page.getByRole("button", { name: "Editar carrera", exact: true }),
    "Enter",
  );
  await fill(page, { "Nombre de la carrera": "Copa Fuji" });
  await pressKey(button(page, "Confirmar y calcular"), "Enter");
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
  await press(button(page, "Continuar"));
  await visible(
    page.getByText("Calculado · 6:01:04 · 5 paradas", { exact: true }),
  );
  await saveShot("carrera-plan");
  await pressKey(button(page, "Ver plan"), "Enter");
  await visible(page.getByRole("heading", { name: "Plan calculado" }));
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
    "Estos ajustes son de prueba hasta que recalcules y aceptes el plan.",
    { exact: true },
  );
  const modified = () =>
    visible(page.getByRole("heading", { name: "Plan modificado" }));
  const status = () =>
    page.locator(".strategy-screen").getByRole("status").textContent();

  // stints: radios with arrows, the slider with keys, a typed lap and the mouse
  await ready("plannedFuji");
  await visible(page.getByRole("heading", { name: "Plan calculado" }));
  await press(button(page, "Ajustar stints"));
  await visible(page.getByRole("heading", { name: "Ajustar stints" }));
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
  await visible(page.getByRole("heading", { name: "Plan calculado" }));
  await press(button(page, "Ajustar paradas"));
  await visible(page.getByRole("heading", { name: "Ajustar paradas" }));
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
  await press(button(page, "Resumen"));
  assert.equal(await notSaved.count(), 1);
  await press(button(page, "Restablecer"));
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

  // a recalculated plan is a proposal, in the summary and in Carrera. The
  // first stop goes one lap earlier: the solver has a plan for that calendar (and
  // not for the second stop one lap later), and does not prove it.
  await press(button(page, "Ajustar paradas"));
  await page.getByRole("radio", { name: "Parada 1, vuelta 43" }).focus();
  await pressKey(button(page, "− 1 vuelta"), "Enter");
  await modified();
  await pressKey(button(page, "Recalcular"), "Enter");
  await page
    .getByText("Plan recalculado sin garantía de ser el más rápido.", {
      exact: true,
    })
    .waitFor({ state: "attached" });
  await press(button(page, "Resumen"));
  const proposal = page.getByText(
    "Es una propuesta: no se guarda en el archivo hasta que la aceptes.",
    { exact: true },
  );
  assert.equal(
    await page
      .getByText("Puedes aceptarla aunque no tenga garantía", { exact: true })
      .count(),
    1,
  );
  assert.equal(await fileState(), "saved");
  assert.equal(await page.getByRole("alert").count(), 0);
  await saveShot("plan-recalculado");
  await press(page.getByRole("tab", { name: "Carrera", exact: true }));
  await visible(
    page.getByText("Calculado · 6:01:06 · 5 paradas", { exact: true }),
  );
  assert.equal(await proposal.count(), 1);
  await saveShot("carrera-plan-recalculado");

  // a recalculation: the plan stays on view while it runs
  await ready("plannedFujiRecalculating");
  await press(button(page, "Ajustar paradas"));
  await pressKey(button(page, "+ 1 vuelta"), "Enter");
  await modified();
  await pressKey(button(page, "Recalcular"), "Enter");
  await visible(page.getByRole("heading", { name: "Recalculando…" }));
  assert.equal(await status(), "Recalculando el plan.");
  await page.keyboard.press("Tab");
  await saveShot("plan-recalculando");
  await pressKey(button(page, "Cancelar"), "Enter");
  await modified();

  // a recalculation that fails, and a plan with no schedule
  await ready("plannedFujiNotPreserved");
  await press(button(page, "Ajustar paradas"));
  await pressKey(button(page, "+ 1 vuelta"), "Enter");
  await modified();
  await pressKey(button(page, "Recalcular"), "Enter");
  await visible(page.getByRole("alert"));
  assert.equal(await button(page, "Recalcular").isEnabled(), true);
  await saveShot("plan-edit-error");

  await ready("plannedFujiNoEdit");
  await visible(page.getByRole("heading", { name: "Plan calculado" }));
  await visible(
    page.getByText("Este plan no se puede ajustar a mano.", { exact: true }),
  );
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
        /^(a|c|x)-/.test(name) ||
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
      await press(button(page, "← Tus estrategias"));
      if (name === "col-sucio") {
        await press(page.getByRole("button", { name: /Practice/ }));
        await visible(page.getByRole("alert"));
        await pressKey(button(page, "Más acciones de archivo"), "ArrowDown");
        await visible(page.getByRole("menu"));
      } else {
        await page.keyboard.press("Control+s");
        await visible(
          page.getByText(
            "No se ha guardado: el archivo ha cambiado fuera de esta pantalla.",
          ),
        );
      }
    }
    await saveShot(name);
    if (name === "col-sucio") {
      const more = button(page, "Más acciones de archivo");
      await focused(page.getByRole("menuitem", { name: "Guardar como…" }));
      await page.keyboard.press("ArrowDown");
      await focused(page.getByRole("menuitem", { name: "Abrir archivo…" }));
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
  await press(button(page, "Continuar"));
  await visible(page.getByRole("tab", { name: "Carrera", exact: true }));
  await saveShot("carrera");
  await editRace(page, saveShot);
  await planStates(page, base, scheme, width, saveShot);
  await carreraWithPlan(page, base, saveShot);
  await acceptStates(page, base, saveShot);
  await amountStates(page, base, scheme, width, evidence);

  await collection(page, base, "ready");
  await chooseWizard(page);
  async function step(name: string, n: number) {
    const active = page.locator('[aria-current="step"]');
    assert.equal(await active.count(), 1);
    assert.match((await active.textContent()) ?? "", new RegExp(String(n)));

    await saveShot(name);
  }
  const next = () => press(button(page, "Continuar"));
  assert(
    await page.evaluate(() =>
      document.activeElement?.matches("h2:focus-visible"),
    ),
  );
  await visible(
    page
      .locator(".strategy-wizard-head")
      .getByRole("button", { name: "Tus estrategias", exact: true }),
  );
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
  // The hour of «Aceptado el … a las …» is the machine's: these pages use
  // Madrid's, so the checks and the captures do not depend on where they run.
  const browser = parent.context().browser();
  const context = browser
    ? await browser.newContext({ timezoneId: "Europe/Madrid" })
    : parent.context();
  try {
    await checkPages(() => context.newPage(), base, evidence);
  } finally {
    // the context of Madrid's hour was ours: it goes with the check, also when
    // the check fails
    if (browser) await context.close();
  }
}

async function checkPages(
  newPage: () => Promise<Page>,
  base: string,
  evidence?: string,
) {
  await Promise.all(
    (["dark", "light"] as const).flatMap((scheme) =>
      [
        [1440, 900],
        [1280, 720],
      ].map(async ([width, height]) => {
        const page = await newPage();
        try {
          await exercise(page, base, scheme, width, height, evidence);
        } finally {
          await page.close();
        }
      }),
    ),
  );

  const page = await newPage();
  try {
    await navigate(page, base, "proximamente-base");
    await visible(
      page
        .locator(".v-upcoming")
        .getByRole("heading", { name: "Estrategia", exact: true, level: 1 }),
    );
    assert.equal(await page.locator(".strategy-screen").count(), 0);
  } finally {
    await page.close();
  }
  await Promise.all(
    (["light", "dark"] as const).map(async (scheme) => {
      const page = await newPage();
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
        await press(button(page, "Continuar"));
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
        await acceptStates(page, base, shot, true);
        await amountStates(page, base, scheme, width, evidence, true);
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
    const page = await newPage();
    try {
      const width = zoom === 125 ? 1600 : 1440;
      await page.setViewportSize({ width, height: 900 });
      await setup(page, scheme, zoom);
      await collection(page, base, "ready");
      if (folded) {
        if (!(await page.locator(".v-sidebar--collapsed").count()))
          await page.keyboard.press("Control+b");
        await visible(page.locator(".v-sidebar--collapsed"));
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
      await press(button(page, "Continuar"));
      await combination(page);
      await press(button(page, "Continuar"));
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

// ---- Aceptar la propuesta (E5b) ----
// Funciones propias, al final del archivo: los estados del plan aceptado, sus
// menús y preguntas, la tarjeta de Carrera y la colección. Cada estado pasa por
// `shot` (axe, desbordamiento, un solo status, sin rutas) y, con evidencia, se
// fotografía con el nombre del diseño de Opus (`a-*`, `c-*`).

type Shot = (name: string) => Promise<void>;

const strategyRequests = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __strategyRequests?: Record<string, unknown>[] })
        .__strategyRequests ?? [],
  );
const planStatus = (page: Page) =>
  page.locator(".strategy-screen").getByRole("status").textContent();
const stateTag = (page: Page) =>
  page.locator(".strategy-plan .strategy-state").first().textContent();
const cardTag = (page: Page) =>
  page.locator(".strategy-plan-card .strategy-state").textContent();
const proposalLine =
  "Es una propuesta: no se guarda en el archivo hasta que la aceptes.";

// the plan tab of a scene, with the zoom the pass is running at
async function openAcceptedPlan(
  page: Page,
  base: string,
  scene: string,
  title: string,
  zoomed: boolean,
) {
  await openPlan(page, base, scene);
  if (zoomed)
    await until(
      () => page.evaluate(() => document.documentElement.style.zoom === "1.25"),
      5000,
      "Strategy zoom 125%",
    );
  await visible(page.getByRole("heading", { name: title, exact: true }));
}

// the state the zoomed pass photographs, and the ones every pass checks
async function proposalStates(
  page: Page,
  base: string,
  shot: Shot,
  zoomed: boolean,
) {
  // a proposal: only a proposal until it is accepted, and then accepted, not saved
  await openAcceptedPlan(page, base, "plannedFuji", "Plan calculado", zoomed);
  assert.equal(await stateTag(page), "Propuesta");
  assert.equal(await page.getByText(proposalLine, { exact: true }).count(), 1);
  assert.equal(await page.getByText(/Ingeniero/).count(), 0);
  await shot("a-propuesta");
  await press(button(page, "Aceptar propuesta"));
  await visible(page.getByRole("heading", { name: "Plan aceptado" }));
  assert.equal(await planStatus(page), "Plan aceptado.");
  assert.equal(await stateTag(page), "Aceptado");
  assert.equal(
    await page.locator(".strategy-file-state").getAttribute("data-state"),
    "dirty",
  );
  await visible(button(page, "Deshacer"));
  assert.equal(await page.getByText(proposalLine).count(), 0);
  // the request carries the revision and the id of the plan on view
  const accept = (await strategyRequests(page)).filter(
    (request) => request.method === "strategy.accept",
  );
  assert.equal(accept.length, 1);
  assert.match(String(accept[0].revision), /^[0-9a-f]{64}$/);
  assert.equal(typeof accept[0].computeId, "number");
  await shot("a-aceptado-singuardar");
  if (zoomed) return;
  // «Deshacer» brings the proposal back
  await press(button(page, "Deshacer"));
  await visible(page.getByRole("heading", { name: "Plan calculado" }));
  assert.equal(await planStatus(page), "Plan aceptado quitado.");
  assert.equal(await stateTag(page), "Propuesta");
}

async function acceptedStates(page: Page, base: string, shot: Shot) {
  // the plan of a file that already holds it, saved: the menu, and its question
  await openAcceptedPlan(page, base, "acceptedFuji", "Plan aceptado", false);
  assert.equal(await stateTag(page), "Aceptado");
  assert.equal(await button(page, "Aceptar propuesta").count(), 0);
  await visible(
    page.getByText(/^Aceptado el \d{1,2} \p{L}+\.? 2026 a las \d{2}:\d{2}\.$/u),
  );
  assert.equal(
    await page.locator(".strategy-file-state").getAttribute("data-state"),
    "saved",
  );
  await shot("a-aceptado");
  const menu = button(page, "Más acciones del plan aceptado");
  await menu.press("ArrowDown");
  const item = page.getByRole("menuitem", { name: /Quitar plan aceptado/ });
  await visible(item);
  await focused(item);
  await shot("a-menu");
  await page.keyboard.press("Escape");
  await until(
    async () => (await item.count()) === 0,
    5000,
    "menu of the accepted plan closed",
  );
  await until(
    () =>
      menu.evaluate(
        (node) =>
          node === document.activeElement && node.matches(":focus-visible"),
      ),
    5000,
    "focus returns to the menu of the accepted plan",
  );
  // removing it asks in the same place, with the focus on the safe button
  await menu.press("ArrowDown");
  await visible(item);
  await focused(item);
  await page.keyboard.press("Enter");
  const question = page.getByRole("group", {
    name: "¿Quitar el plan aceptado?",
  });
  await visible(question);
  await until(
    () =>
      button(page, "Cancelar").evaluate(
        (node) =>
          node === document.activeElement && node.matches(":focus-visible"),
      ),
    5000,
    "focus on Cancelar",
  );
  assert.equal(
    (await strategyRequests(page)).filter(
      (request) => request.method === "strategy.unaccept",
    ).length,
    0,
  );
  await shot("a-quitar");
  await page.keyboard.press("Escape");
  await until(
    async () => (await question.count()) === 0,
    5000,
    "question closed",
  );
  await until(
    () => menu.evaluate((node) => node === document.activeElement),
    5000,
    "focus returns to the menu after cancelling",
  );
  assert.equal(await stateTag(page), "Aceptado");

  // a proposal accepted with no guarantee says so, and can be accepted
  await openAcceptedPlan(
    page,
    base,
    "plannedFujiPartial",
    "Plan calculado",
    false,
  );
  assert.equal(await stateTag(page), "Propuesta");
  await visible(page.getByText("Puedes aceptarla aunque no tenga garantía"));
  await shot("a-parcial");
}

async function newProposalStates(
  page: Page,
  base: string,
  shot: Shot,
  zoomed: boolean,
) {
  // a proposal that is not the accepted plan: both, side by side
  await openAcceptedPlan(
    page,
    base,
    "acceptedFujiNew",
    "Plan calculado",
    zoomed,
  );
  const card = page.getByRole("region", { name: "Ya tienes un plan aceptado" });
  await visible(card);
  const text = (await card.textContent()) ?? "";
  assert.match(text, /Plan aceptado: 6:01:04 · 5 paradas · aceptado el/);
  assert.match(text, /Esta propuesta: 6:01:06 · 5 paradas · 2,0 s más lenta/);
  await visible(page.getByText("2,0 s más que tu plan aceptado"));
  await shot("a-nueva");
  if (zoomed) {
    // the question that replaces the accepted plan, at this zoom too
    await pressKey(button(page, "Aceptar propuesta"), "Enter");
    await visible(
      page.getByRole("group", {
        name: "¿Sustituir tu plan aceptado por esta propuesta?",
      }),
    );
    return;
  }
  await page.locator(".strategy-race").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await shot("a-nueva-lista");
  await page.locator(".strategy-race").evaluate((node) => {
    node.scrollTop = 0;
  });
  // replacing asks in the same place, moves the focus and goes back to the button
  await pressKey(button(page, "Aceptar propuesta"), "Enter");
  const question = page.getByRole("group", {
    name: "¿Sustituir tu plan aceptado por esta propuesta?",
  });
  await visible(question);
  assert.equal(await card.count(), 0);
  await until(
    () =>
      button(page, "Cancelar").evaluate(
        (node) =>
          node === document.activeElement && node.matches(":focus-visible"),
      ),
    5000,
    "focus on Cancelar",
  );
  assert.equal(
    (await strategyRequests(page)).filter(
      (request) => request.method === "strategy.accept",
    ).length,
    0,
  );
  await shot("a-sustituir");
  await page.keyboard.press("Escape");
  await until(
    () =>
      button(page, "Aceptar propuesta").evaluate(
        (node) =>
          node === document.activeElement && node.matches(":focus-visible"),
      ),
    5000,
    "focus returns to Aceptar propuesta",
  );
  await visible(card);
  await pressKey(button(page, "Aceptar propuesta"), "Enter");
  await visible(question);
  await press(button(page, "Sustituir plan aceptado"));
  await visible(page.getByRole("heading", { name: "Plan aceptado" }));
  assert.equal(await planStatus(page), "Plan sustituido.");
  assert.equal(await stateTag(page), "Aceptado");
  assert.equal(await button(page, "Deshacer").count(), 0);
  // back to the accepted plan: the proposal goes
  await openAcceptedPlan(
    page,
    base,
    "acceptedFujiNew",
    "Plan calculado",
    false,
  );
  await press(button(page, "Volver al plan aceptado"));
  await visible(page.getByRole("heading", { name: "Plan aceptado" }));
  assert.equal(await planStatus(page), "Mostrando el plan aceptado.");
  assert.equal(await card.count(), 0);
}

async function staleStates(
  page: Page,
  base: string,
  shot: Shot,
  zoomed: boolean,
) {
  if (!zoomed) {
    // the data changed, and the plan still reaches the finish
    await openAcceptedPlan(
      page,
      base,
      "acceptedFujiStale",
      "Plan aceptado",
      false,
    );
    assert.equal(await stateTag(page), "Desactualizado");
    await visible(page.getByText("Ritmo por vuelta: 1:30,472 → 1:30,900"));
    await visible(page.getByText(/sigue llegando a meta/));
    assert.equal(await page.getByText("datos antiguos").count(), 4);
    assert.equal(await page.getByText(/6:02:/).count(), 0);
    await shot("a-desactualizado");
  }
  // the data changed, and it does not: the cause, and no lap
  await openAcceptedPlan(
    page,
    base,
    "acceptedFujiUnreachable",
    "Plan aceptado",
    zoomed,
  );
  assert.equal(await stateTag(page), "No llega a meta");
  const alert = page.locator(".strategy-plan").getByRole("alert");
  await visible(alert);
  const said = (await alert.textContent()) ?? "";
  assert.match(said, /Consumo por vuelta: 1,83 L → 1,85 L/);
  assert.match(
    said,
    /Se quedaría sin combustible, energía o neumáticos antes de llegar a meta\./,
  );
  assert.doesNotMatch(said, /en la vuelta \d/);
  await shot("a-desact-imposible");
  if (zoomed) return;
  // the data changed and the new proposal has the same stops: it is a proposal
  // (its own certificate and figures), the outdated plan is shown apart, and it
  // can be accepted, which brings the plan up to date
  await openAcceptedPlan(
    page,
    base,
    "acceptedFujiStaleSame",
    "Plan calculado",
    false,
  );
  assert.equal(await stateTag(page), "Propuesta");
  assert.equal(await page.getByText("datos antiguos").count(), 0);
  await visible(
    page.getByText("Comprobado: es el plan más rápido con estos datos"),
  );
  await visible(
    page.getByRole("region", { name: "Ya tienes un plan aceptado" }),
  );
  await visible(button(page, "Volver al plan aceptado"));
  await visible(button(page, "Aceptar propuesta"));
  // an outdated plan is a warning, not a tick
  await visible(
    page.locator('.strategy-compare .strategy-compare-icon[data-tone="warn"]'),
  );
  await shot("a-desact-nueva-igual");
  await pressKey(button(page, "Aceptar propuesta"), "Enter");
  await visible(page.getByRole("heading", { name: "Plan aceptado" }));
  assert.equal(await planStatus(page), "Plan aceptado.");
  assert.equal(await stateTag(page), "Aceptado");
}

// The question tells the truth about «Descartar cambios»: it goes back to the
// file, so it brings a plan back only if the file holds it.
async function unsavedQuestions(page: Page, base: string, shot: Shot) {
  await openAcceptedPlan(page, base, "plannedFuji", "Plan calculado", false);
  await press(button(page, "Aceptar propuesta"));
  await visible(page.getByRole("heading", { name: "Plan aceptado" }));
  await press(button(page, "Ajustar paradas"));
  await page.getByRole("radio", { name: "Parada 1, vuelta 43" }).focus();
  await pressKey(button(page, "− 1 vuelta"), "Enter");
  await visible(page.getByRole("heading", { name: "Plan modificado" }));
  await pressKey(button(page, "Recalcular"), "Enter");
  await page
    .getByText("Plan recalculado sin garantía de ser el más rápido.", {
      exact: true,
    })
    .waitFor({ state: "attached" });
  await press(button(page, "Resumen"));
  await pressKey(button(page, "Aceptar propuesta"), "Enter");
  const replace = page.getByRole("group", {
    name: "¿Sustituir tu plan aceptado por esta propuesta?",
  });
  await visible(replace);
  const lost =
    "se pierde y no se puede recuperar: todavía no está guardado en el archivo.";
  assert.match((await replace.textContent()) ?? "", new RegExp(lost));
  assert.doesNotMatch((await replace.textContent()) ?? "", /Descartar cambios/);
  await shot("a-sustituir-singuardar");
  await page.keyboard.press("Escape");
  await press(button(page, "Volver al plan aceptado"));
  await visible(page.getByRole("heading", { name: "Plan aceptado" }));
  const menu = button(page, "Más acciones del plan aceptado");
  await menu.press("ArrowDown");
  const removeItem = page.getByRole("menuitem", {
    name: /Quitar plan aceptado/,
  });
  await visible(removeItem);
  await focused(removeItem);
  await page.keyboard.press("Enter");
  const remove = page.getByRole("group", { name: "¿Quitar el plan aceptado?" });
  await visible(remove);
  assert.match((await remove.textContent()) ?? "", new RegExp(lost));
  assert.doesNotMatch((await remove.textContent()) ?? "", /Descartar cambios/);
  await shot("a-quitar-singuardar");
}

async function carreraAcceptStates(
  page: Page,
  base: string,
  shot: Shot,
  zoomed: boolean,
) {
  const carrera = async (scene: string, title: RegExp) => {
    await collection(page, base, scene);
    await press(button(page, "Continuar"));
    await visible(page.locator(".strategy-plan-card"));
    await visible(page.getByText(title));
    if (zoomed)
      await until(
        () =>
          page.evaluate(() => document.documentElement.style.zoom === "1.25"),
        5000,
        "Strategy zoom 125%",
      );
  };
  await carrera("plannedFuji", /^Calculado · 6:01:04 · 5 paradas$/);
  assert.equal(await cardTag(page), "Propuesta");
  assert.equal(await page.getByText(proposalLine, { exact: true }).count(), 1);
  await visible(button(page, "Aceptar propuesta"));
  await shot("c-propuesta");
  if (zoomed) return;
  await carrera("acceptedFuji", /^6:01:04 · 5 paradas$/);
  assert.equal(await cardTag(page), "Aceptado");
  assert.equal(await page.locator("mark").count(), 0);
  await shot("c-aceptado");
  await carrera("acceptedFujiUnreachable", /^Aceptado · 6:01:04 · 5 paradas$/);
  assert.equal(await cardTag(page), "No llega a meta");
  assert.deepEqual(await page.locator("mark").allTextContents(), [
    "82 L · 1,85 L/v",
  ]);
  await visible(
    page.getByText(/Has cambiado «Consumo por vuelta»: 1,83 L → 1,85 L\./),
  );
  await shot("c-desactualizado");
  // the card leads to the plan
  await pressKey(button(page, "Ver plan"), "Enter");
  await visible(page.getByRole("heading", { name: "Plan aceptado" }));
}

async function acceptCollection(page: Page, base: string, shot: Shot) {
  await collection(page, base, "acceptedFujiList");
  const rows = page.locator(".strategy-row");
  assert.equal(await rows.count(), 3);
  const row = (name: string) => rows.filter({ hasText: name });
  assert.match(
    (await row("Fuji 6 Horas").textContent()) ?? "",
    /Desactualizado/,
  );
  assert.match((await row("Le Mans").textContent()) ?? "", /Plan aceptado/);
  assert.doesNotMatch(
    (await row("Sprint de Spa").textContent()) ?? "",
    /Plan aceptado|Desactualizado/,
  );
  await shot("col-aceptado");
}

// Every state of accepting the plan; the zoomed pass only photographs the five
// states Opus drew at 125 %.
async function acceptStates(
  page: Page,
  base: string,
  shot: Shot,
  zoomed = false,
) {
  await proposalStates(page, base, shot, zoomed);
  if (!zoomed) await acceptedStates(page, base, shot);
  if (!zoomed) await unsavedQuestions(page, base, shot);
  await newProposalStates(page, base, shot, zoomed);
  await staleStates(page, base, shot, zoomed);
  await carreraAcceptStates(page, base, shot, zoomed);
  if (!zoomed) await acceptCollection(page, base, shot);
  await exportStates(page, base, shot, zoomed);
}

// ---- Exportar el plan (E5d) ----
// Funciones propias, al final del archivo. Cada estado pasa por `shot` (axe, también
// con el menú abierto; desbordamiento; un solo status; sin rutas) y, con evidencia,
// se fotografía con el nombre del diseño de Opus (`x-*`). La ventana de guardar se
// retiene con `?hold=exportFile` para ver «Esperando…».

const exportRequestsOf = async (page: Page, method: string) =>
  (await strategyRequests(page)).filter((request) => request.method === method);
const exportTrigger = (page: Page) =>
  page.getByRole("button", { name: /^(Exportar|Exportando…)$/ });
const exportFocused = (page: Page, visibleRing: boolean) =>
  exportTrigger(page).evaluate(
    (node, ring) =>
      node === document.activeElement &&
      (!ring || node.matches(":focus-visible")),
    visibleRing,
  );

// ArrowDown on the button opens the menu with the focus on its first item
async function openExportMenu(page: Page) {
  await exportTrigger(page).press("ArrowDown");
  const first = page.getByRole("menuitem", { name: /^Copiar como texto/ });
  await visible(first);
  await focused(first);
}
async function closeExportMenu(page: Page) {
  await page.keyboard.press("Escape");
  await until(
    async () => (await page.getByRole("menu").count()) === 0,
    5000,
    "export menu closed",
  );
  // the focus is back on the button, and it is seen
  await until(
    () => exportFocused(page, true),
    5000,
    "focus returns to the export button",
  );
}
// the second item: the file; the arrows move and Enter chooses
async function chooseExportFile(page: Page) {
  await openExportMenu(page);
  await page.keyboard.press("ArrowDown");
  const file = page.getByRole("menuitem", { name: /^Guardar como hoja/ });
  await focused(file);
  await page.keyboard.press("Enter");
}

async function exportStates(
  page: Page,
  base: string,
  shot: Shot,
  zoomed: boolean,
) {
  // a proposal: the menu warns that it is not accepted
  await openAcceptedPlan(page, base, "plannedFuji", "Plan calculado", zoomed);
  await openExportMenu(page);
  assert.equal(
    await page
      .getByRole("menu", { name: "Exportar el plan" })
      .getByText(
        "Es una propuesta sin aceptar. Lo que exportes lo dirá en la primera línea.",
      )
      .count(),
    1,
  );
  // the menu covers the plan, so it must not let the text behind show through
  assert.match(
    await page
      .getByRole("menu", { name: "Exportar el plan" })
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    /^rgb\(/,
  );
  await shot("x-menu");
  await closeExportMenu(page);
  if (zoomed) return;
  // the accepted plan: no warning, and nothing was asked just by opening the menu
  await openAcceptedPlan(page, base, "acceptedFuji", "Plan aceptado", false);
  await openExportMenu(page);
  assert.equal(
    await page
      .getByRole("menu")
      .getByText(/propuesta sin aceptar/)
      .count(),
    0,
  );
  assert.equal((await exportRequestsOf(page, "strategy.export")).length, 0);
  await shot("x-menu-aceptado");
  // copy: the screen asks with the revision and the accepted plan, and says «Copiado»
  await focused(page.getByRole("menuitem", { name: /^Copiar como texto/ }));
  await page.keyboard.press("Enter");
  await visible(page.getByText("Copiado", { exact: true }));
  assert.equal(await planStatus(page), "Plan copiado como texto.");
  const copies = await exportRequestsOf(page, "strategy.export");
  assert.equal(copies.length, 1);
  assert.match(String(copies[0].revision), /^[0-9a-f]{64}$/);
  assert.deepEqual(copies[0].target, { kind: "accepted" });
  await until(
    () => exportFocused(page, true),
    5000,
    "focus on the export button after copying",
  );
  await shot("x-copiado");

  // the file: «Esperando…» while the window is open, then the name it was saved with
  await openAcceptedPlan(
    page,
    base,
    "acceptedFuji&hold=exportFile",
    "Plan aceptado",
    false,
  );
  await chooseExportFile(page);
  await visible(page.getByRole("button", { name: "Exportando…" }));
  await visible(
    page.getByText("Elige dónde guardar el archivo", { exact: true }),
  );
  assert.equal(await exportTrigger(page).getAttribute("aria-disabled"), "true");
  assert.equal(await planStatus(page), "Elige dónde guardar el archivo.");
  const files = await exportRequestsOf(page, "strategy.exportFile");
  assert.equal(files.length, 1);
  assert.match(String(files[0].revision), /^[0-9a-f]{64}$/);
  assert.deepEqual(files[0].target, { kind: "accepted" });
  await shot("x-esperando");
  await page.evaluate(() =>
    (window as unknown as { __release: () => void }).__release(),
  );
  await visible(page.getByText("Plan exportado", { exact: true }));
  await visible(page.getByText(/^Guardado como «Fuji 6 Horas\.csv»\./));
  assert.equal(await planStatus(page), "Guardado como Fuji 6 Horas.csv.");
  await until(
    () => exportFocused(page, false),
    5000,
    "focus on the export button after saving",
  );
  await shot("x-hecho");
  await press(button(page, "Cerrar aviso"));
  assert.equal(
    await page.getByText("Plan exportado", { exact: true }).count(),
    0,
  );
  await until(
    () => exportFocused(page, false),
    5000,
    "focus on the export button after putting the notice away",
  );

  // a refusal is an alert, with words and no path; the plan stays as it was
  await openAcceptedPlan(
    page,
    base,
    "acceptedFujiFileUnavailable",
    "Plan aceptado",
    false,
  );
  await chooseExportFile(page);
  const alert = page.getByRole("alert");
  await visible(alert);
  assert.match(
    (await alert.textContent()) ?? "",
    /No se pudo exportar el plan.*Prueba en otra carpeta, como Documentos\./,
  );
  await visible(page.getByRole("button", { name: "Elegir otra carpeta…" }));
  assert.equal(await stateTag(page), "Aceptado");
  await shot("x-error");
  // the other one the person can mend by themselves: a program has the file open
  await openAcceptedPlan(
    page,
    base,
    "plannedFujiExportInUse",
    "Plan calculado",
    false,
  );
  await chooseExportFile(page);
  await visible(
    page.getByText(
      "Otro programa tiene ese archivo abierto, por ejemplo Excel. Ciérralo en el otro programa y vuelve a intentarlo.",
      { exact: true },
    ),
  );
  await shot("x-error-enuso");
}

// ---- Combustible y energía a mano (E5g) ----
// Funciones propias, al final del archivo: fijar lo que carga una parada, los
// errores del anfitrión, el plan recalculado con lo fijado, la causa «ningún plan»
// y la pregunta antes de «Calcular de nuevo». Cada estado pasa por `verify` (axe,
// desbordamiento, un solo status, sin rutas) y, con evidencia, se fotografía con
// el nombre del diseño de Opus (`m-*`).

const setStopRequests = async (page: Page) =>
  (await strategyRequests(page)).filter(
    (request) => request.method === "strategy.setStopService",
  );
const amountBox = (page: Page, what: string, stop: number) =>
  page.getByRole("textbox", {
    name: `${what} de la parada ${stop}`,
    exact: true,
  });
const modeRadio = (page: Page, what: string, stop: number, label: string) =>
  page
    .getByRole("group", {
      name: `${what} de la parada ${stop}: cómo se decide`,
    })
    .getByRole("radio", { name: label, exact: true });
// the stop chips are radios: the first takes the focus, the arrows walk to the rest
async function pickStop(page: Page, stop: number) {
  const first = page.getByRole("radio", { name: /^Parada 1, vuelta/ });
  await first.focus();
  await focused(first);
  for (let step = 1; step < stop; step++)
    await page.keyboard.press("ArrowRight");
  await visible(
    page.getByRole("radio", {
      name: new RegExp(`^Parada ${stop}, vuelta`),
      checked: true,
    }),
  );
}
// «A mano» with the arrow key from «Automático»: the box opens with the focus in it
async function toManual(page: Page, what: string, stop: number) {
  const from = modeRadio(page, what, stop, "Automático");
  await from.focus();
  await focused(from);
  await page.keyboard.press("ArrowRight");
  const box = amountBox(page, what, stop);
  await visible(box);
  await focused(box);
  return box;
}
async function typeAmount(box: Locator, text: string) {
  await box.fill(text);
  await box.press("Enter");
}

async function amountStates(
  page: Page,
  base: string,
  scheme: Scheme,
  width: number,
  evidence?: string,
  zoomed = false,
) {
  const suffix = scheme === "dark" ? "oscuro" : "claro";
  const prefix = zoomed ? "zoom125-" : width === 1280 ? "1280-" : "";
  const shot = async (name: string) => {
    await verify(page, name, scheme, width);
    if (!evidence) return;
    // the shot starts at the timeline, so the editor is on it
    // (a plan with no plan has no timeline: the shot starts at the plan)
    // (the summary and the plan with no plan start at the heading)
    const timeline = page.locator(".strategy-timeline-card");
    const fromHeading =
      name === "m-fijado" ||
      name === "m-recalculado" ||
      name === "m-calcular" ||
      (await timeline.count()) === 0;
    await (fromHeading ? page.locator(".strategy-plan") : timeline).evaluate(
      (node) => node.scrollIntoView({ block: "start" }),
    );
    await page.screenshot({
      path: resolve(evidence, `${prefix}${name}-${suffix}.png`),
    });
  };
  const status = () => planStatus(page);
  const paradas = async (scene: string) => {
    await openAcceptedPlan(page, base, scene, "Plan calculado", zoomed);
    await press(button(page, "Ajustar paradas"));
    await visible(page.getByRole("heading", { name: "Ajustar paradas" }));
    await pickStop(page, 2);
  };

  // m-auto: nothing is fixed; the limits are the host's (73–81 L, not the sketch's 77)
  await paradas("plannedFuji");
  await visible(page.getByText("Puedes fijar de 73 a 81 L.", { exact: true }));
  await visible(
    page.getByText("Se llega con entre 0,4 y 4,4 L.", { exact: true }),
  );
  assert.equal(await page.getByText("fijado por ti").count(), 0);
  // tyres are shown, not fixed (#2691): no way to choose them
  assert.equal(
    await page.getByText(/Cambiar neumáticos|No cambiar/).count(),
    0,
  );
  assert.equal(
    await page.getByRole("group", { name: /Neumáticos/ }).count(),
    0,
  );
  await shot("m-auto");

  // m-fijado: 60 L leaves no plan; the lap is the host's
  const fuel = await toManual(page, "Combustible", 2);
  await typeAmount(fuel, "60");
  await visible(
    page.getByText(
      /^Con 60 L no hay plan: te quedarías sin combustible en la vuelta 121/,
    ),
  );
  await focusVisible(fuel);
  assert.equal(await fuel.getAttribute("aria-invalid"), null);
  assert.match(
    (await status()) ?? "",
    /^Parada 2: combustible fijado en 60 L\. Con 60 L no hay plan/,
  );
  const fixed = (await setStopRequests(page)).at(-1);
  assert.deepEqual(
    {
      index: fixed?.index,
      fuelLiters: fixed?.fuelLiters,
      vePercent: fixed?.vePercent,
    },
    { index: 1, fuelLiters: 60, vePercent: null },
  );
  assert.match(String(fixed?.revision), /^[0-9a-f]{64}$/);
  assert.equal(typeof fixed?.computeId, "number");
  assert.equal(
    await page.getByRole("alert").count(),
    0,
    "a warning is not an alert",
  );
  assert.equal(
    await page.locator(".strategy-file-state").getAttribute("data-state"),
    "saved",
  );
  // from the heading (with «Plan modificado», «Restablecer» and «Recalcular»), as
  // Opus', and again from the timeline so the whole editor is on the shot
  assert.equal(await button(page, "Recalcular").isVisible(), true);
  assert.equal(await button(page, "Restablecer").isVisible(), true);
  await shot("m-fijado");
  await shot("m-fijado-editor");

  // m-error: it does not fit; nothing changes but the message
  const before = (await setStopRequests(page)).length;
  await typeAmount(fuel, "90");
  // the refusal comes back before the next control is used
  await visible(page.getByRole("alert"));
  const energy = await toManual(page, "Energía", 2);
  await typeAmount(energy, "103");
  await until(
    async () => (await page.getByRole("alert").count()) === 2,
    5000,
    "both refusals",
  );
  assert.deepEqual(await page.getByRole("alert").allTextContents(), [
    "No cabe: el depósito no admite más de 82 L.",
    "No cabe: la energía no puede pasar de 100 %.",
  ]);
  assert.equal(await fuel.getAttribute("aria-invalid"), "true");
  assert.equal(await page.getByText("Con 90 L").count(), 0);
  assert.equal(await fuel.inputValue(), "90");
  assert.equal((await setStopRequests(page)).length > before, true);
  await shot("m-error");

  // m-rejilla: the nearest amounts the grid takes
  const manualEnergy = modeRadio(page, "Energía", 2, "A mano");
  await manualEnergy.focus();
  await focused(manualEnergy);
  await page.keyboard.press("ArrowLeft");
  await visible(page.getByText("lo decide el cálculo", { exact: true }));
  await typeAmount(fuel, "70,5");
  await visible(
    page.getByText(
      "Escribe litros enteros: el cálculo carga de 1 L en 1 L. Puedes poner 70 o 71.",
      { exact: true },
    ),
  );
  await shot("m-rejilla");
  // «Volver todo a automático»: the way back, in one request
  await fuel.fill("71");
  await fuel.press("Enter");
  await visible(button(page, "Volver todo a automático"));
  await pressKey(button(page, "Volver todo a automático"), "Enter");
  await until(
    async () => (await page.getByText("fijado por ti").count()) === 0,
    5000,
    "back to automatic",
  );
  assert.equal(
    await status(),
    "Todo vuelve a automático. Recalcula para ver el plan.",
  );
  const cleared = (await strategyRequests(page)).filter(
    (request) => request.method === "strategy.clearStopServices",
  );
  assert.equal(cleared.length, 1);
  assert.match(String(cleared[0].revision), /^[0-9a-f]{64}$/);

  // m-recalculado: the energy of the last stop, fixed, and the plan recalculated with it
  await paradas("plannedFujiFixedProven");
  await pickStop(page, 5);
  const last = await toManual(page, "Energía", 5);
  await typeAmount(last, "80");
  await visible(page.getByRole("heading", { name: "Plan modificado" }));
  await visible(
    page.getByText("Has fijado 80 % en la parada 5.", { exact: true }),
  );
  await pressKey(button(page, "Recalcular"), "Enter");
  await visible(page.getByText(/^Llegarás a meta con .* de energía/));
  await shot("m-recalculado-paradas");
  await press(button(page, "Resumen"));
  await visible(
    page.getByText(
      "Comprobado: con estas paradas y lo que fijaste, es el plan más rápido",
      { exact: true },
    ),
  );
  await visible(
    page.getByText(
      "Lo que fijaste hace el plan 2,0 s más lento que el plan automático (6:01:04).",
      { exact: true },
    ),
  );
  await visible(page.getByText("2,0 s más que el automático", { exact: true }));
  await visible(page.getByText("1 con cantidades fijadas", { exact: true }));
  assert.equal(
    await page.locator(".strategy-legs .strategy-fixed-tag").count(),
    1,
  );
  await shot("m-recalculado");

  // «Calcular de nuevo» throws away what was fixed: it asks first, with the focus on «Cancelar»
  const computes = async () =>
    (await strategyRequests(page)).filter(
      (request) => request.method === "strategy.compute",
    ).length;
  await pressKey(button(page, "Calcular de nuevo"), "Enter");
  const question = page.getByRole("group", {
    name: "¿Calcular de nuevo y perder lo que fijaste?",
  });
  await visible(question);
  const cancel = question.getByRole("button", { name: "Cancelar" });
  await focused(cancel);
  await focusVisible(cancel);
  assert.equal(await computes(), 0);
  await shot("m-calcular");
  await page.keyboard.press("Escape");
  await until(
    async () => (await question.count()) === 0,
    5000,
    "the question closes",
  );
  await focused(button(page, "Calcular de nuevo"));
  await focusVisible(button(page, "Calcular de nuevo"));
  assert.equal(await computes(), 0);

  // m-imposible: 40 L in the second stop leave no plan, and the host says which stop
  await paradas("plannedFuji");
  const short = await toManual(page, "Combustible", 2);
  await typeAmount(short, "40");
  await visible(page.getByRole("heading", { name: "Plan modificado" }));
  await pressKey(button(page, "Recalcular"), "Enter");
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Ningún plan cumple lo que fijaste" });
  await visible(alert);
  assert.match(
    (await alert.textContent()) ?? "",
    /Con lo que fijaste en la parada 2 no hay plan que termine la carrera\./,
  );
  assert.equal(
    await status(),
    "Ningún plan cumple lo que fijaste: mira la parada 2.",
  );
  await visible(
    page.getByText(
      /^Con 40 L no hay plan: te quedarías sin combustible en la vuelta 110/,
    ),
  );
  await shot("m-imposible");
  await pressKey(button(page, "Volver la parada 2 a automático"), "Enter");
  await visible(button(page, "Recalcular"));
  const back = (await setStopRequests(page)).at(-1);
  assert.deepEqual(
    {
      index: back?.index,
      fuelLiters: back?.fuelLiters,
      vePercent: back?.vePercent,
    },
    { index: 1, fuelLiters: null, vePercent: null },
  );
}
