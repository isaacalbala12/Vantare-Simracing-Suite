import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import type {
  CoreStatus,
  HostError,
  HostToUi,
  UiToHost,
} from "../src/contract/generated/contract";
import type { PreviewImage } from "../src/contract/generated/preview";
import { workshopCatalog } from "../src/mock/modules/workshop";

type Scheme = "dark" | "light";
type Shot = readonly [string, readonly Scheme[], number?, number?, 125?];
const both = ["dark", "light"] as const;
const dark = ["dark"] as const;
const shots: readonly Shot[] = [
  ["normal", both],
  ["barra-plegada", both],
  ["abriendo", dark],
  ["cargando", both],
  ["ocupado", dark],
  ["error", both],
  ["lista-widgets", dark],
  ["lista-escenas", both],
  ["foto-suelta", dark],
  ["sin-escenas", dark],
  ["sin-ejemplo", dark],
  ["bloqueado-plan", dark],
  ["sin-derechos", dark],
  ["demasiado-grande", dark],
  ["live", both],
  ["1280x720", dark, 1280, 720],
  ["1280x720-lista-escenas", dark, 1280, 720],
  ["sin-pie", dark, 1280, 720],
  ["pie-largo", dark, 1280, 720],
  ["zoom125", ["light"], 1600, 900, 125],
  ["zoom125-error", dark, 1600, 900, 125],
];
const battle = "standings-functional-battle";
const battleCaptions =
  workshopCatalog.widgets
    .find(({ kind }) => kind === "standings")
    ?.scenes.find(({ id }) => id === battle)?.captions ?? [];
const longCaption = (
  "Se acerca a 0,65 s: aparece el acento de batalla; el texto no cambia de tamaño y el acento se retira al separarse. " +
  "Giovinazzi mantiene la distancia durante toda la escena."
)
  .slice(0, 160)
  .padEnd(160, "x");
const frame = (page: Page, n: number) =>
  page.getByRole("img", {
    name: new RegExp(`Batalla cercana · conducción, fotograma ${n} de 4`),
  });

async function choose(page: Page, selector: RegExp, option: RegExp) {
  await page.getByRole("combobox", { name: selector }).click();
  await page.getByRole("option", { name: option }).click();
}

async function setup(
  page: Page,
  scheme: Scheme,
  shot: string,
  zoom: 125 | 100,
  image?: PreviewImage,
) {
  await page.addInitScript(
    ({ scheme, shot, zoom, image, battle, longCaption }) => {
      const send = MessagePort.prototype.postMessage;
      const requests = new Map<
        number,
        Extract<UiToHost, { kind: "request" }>["request"]
      >();
      MessagePort.prototype.postMessage = function (
        message: HostToUi | UiToHost,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        if (message?.kind === "request")
          requests.set(message.id, message.request);
        if (message?.kind === "hello" && "theme" in message)
          message = { ...message, theme: { ...message.theme, scheme } };
        if (message?.kind === "event" && message.event.topic === "core") {
          const value = message.event.value;
          value.access.tester = true;
          Reflect.set(window, "workshopCore", (patch: Partial<CoreStatus>) =>
            Reflect.apply(send, this, [
              {
                kind: "event",
                event: { topic: "core", value: { ...value, ...patch } },
              },
              options,
            ]),
          );
        }
        if (
          message?.kind === "response" &&
          message.result.method === "settings.get"
        ) {
          message.result.value.appearance.scheme = scheme;
          message.result.value.zoom = zoom;
        }
        if (
          message?.kind === "response" &&
          message.result.method === "workshop.catalog"
        ) {
          for (const widget of message.result.widgets) {
            if (shot === "sin-escenas" && widget.kind === "track-map")
              widget.scenes = [];
            if (shot === "abriendo" && widget.kind === "standings")
              widget.scenes.sort(
                (a, b) => Number(b.id === battle) - Number(a.id === battle),
              );
            if (shot === "pie-largo" && widget.kind === "standings") {
              const scene = widget.scenes.find(({ id }) => id === battle);
              if (scene?.captions.length) scene.captions[0] = longCaption;
            }
          }
        }
        if (message?.kind === "response" || message?.kind === "failure") {
          const id = message.id;
          const request = requests.get(id);
          requests.delete(id);
          if (
            request?.method === "preview.render" &&
            request.target.kind === "scene"
          ) {
            const { widget, frame } = request.target;
            if (shot === "abriendo" || (shot === "cargando" && frame === 2))
              return;
            let error: HostError | undefined;
            if (shot === "ocupado" && frame === 2) error = { kind: "busy" };
            if ((shot === "error" || shot === "zoom125-error") && frame === 2)
              error = { kind: "previewFailed", reason: "timeout" };
            if (shot === "sin-ejemplo" && widget === "input-telemetry")
              error = { kind: "previewFailed", reason: "noDemo" };
            if (shot === "bloqueado-plan" && widget === "radar")
              error = { kind: "denied" };
            if (shot === "demasiado-grande" && widget === "fuel-strategy")
              error = { kind: "previewFailed", reason: "tooLarge" };
            if (error) message = { kind: "failure", id, error };
            else if (image && message.kind === "response")
              message = {
                kind: "response",
                id,
                result: { method: "preview.render", value: image },
              };
          }
        }
        Reflect.apply(send, this, [message, options]);
      };
    },
    { scheme, shot, zoom, image, battle, longCaption },
  );
}

async function show(page: Page, shot: string) {
  const next = page.getByRole("button", { name: "Siguiente", exact: true });
  const message = (text: string) =>
    page.getByText(text, { exact: true }).waitFor();
  const busy = () => page.getByRole("figure").getAttribute("aria-busy");
  if (shot === "abriendo") {
    await message("Haciendo la primera foto…");
    assert.equal(await busy(), "true");
    return;
  }
  await page.getByRole("img", { name: /^Foto de Standings, escena/ }).waitFor();
  if (shot === "foto-suelta") {
    await choose(page, /^Escena/, /standings-legacy/);
    await message("Es una foto suelta: solo tiene un fotograma.");
    await page
      .getByRole("img", { name: /Standings.*fotograma 1 de 1/ })
      .waitFor();
    return;
  }
  const chooseWidget = (name: RegExp) => choose(page, /^Widget/, name);
  switch (shot) {
    case "sin-escenas":
      await chooseWidget(/^Mapa del circuito/);
      return message("Mapa del circuito no tiene escenas de ejemplo");
    case "sin-ejemplo":
      await chooseWidget(/^Telemetría de entrada/);
      return message("Esta escena no tiene ejemplo real");
    case "bloqueado-plan":
      await chooseWidget(/^Radar/);
      return message("Radar no está incluido en tu plan");
    case "demasiado-grande":
      await chooseWidget(/^Fuel y stint/);
      return message("Esta foto es demasiado grande para el Taller");
  }

  await choose(page, /^Escena/, /Batalla cercana · conducción/);
  await frame(page, 1).waitFor();
  const caption = page.locator(".v-workshop-caption");
  const announced = page.locator('.v-workshop [role="status"]');
  assert.equal(await announced.count(), 1);
  assert.equal(await caption.getAttribute("role"), null);
  assert.equal(await caption.getAttribute("aria-live"), null);
  const firstCaption =
    shot === "pie-largo" ? longCaption : (battleCaptions[0] ?? "");
  assert.equal(await caption.getAttribute("aria-hidden"), null);
  assert((await caption.textContent())?.includes(firstCaption));
  assert.equal(
    await announced.textContent(),
    `Fotograma 1 de 4 listo. ${firstCaption}`,
  );
  if (shot === "pie-largo") {
    const box = await caption.boundingBox();
    assert(box && box.y + box.height <= 720);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
  }
  const figure = page.getByRole("figure");
  const height = await figure.evaluate(
    (node) => node.getBoundingClientRect().height,
  );
  assert(height > 0);
  await next.click();
  await frame(page, 2).waitFor();
  assert.equal(
    await figure.evaluate((node) => node.getBoundingClientRect().height),
    height,
  );
  assert.equal(
    await announced.textContent(),
    `Fotograma 2 de 4 listo. ${battleCaptions[1] ?? ""}`,
  );
  if (shot === "sin-pie") {
    await choose(page, /^Escena/, /standings-legacy/);
    await page
      .getByRole("img", { name: /Standings.*fotograma 1 de 1/ })
      .waitFor();
    assert.equal(
      await figure.evaluate((node) => node.getBoundingClientRect().height),
      height,
    );
    assert.equal(await caption.getAttribute("data-empty"), "true");
    assert.equal(await caption.textContent(), "");
    assert.equal(
      await announced.textContent(),
      "Fotograma 1 de 1 listo.",
    );
    return;
  }
  await message(
    workshopCatalog.widgets
      .find(({ kind }) => kind === "standings")
      ?.scenes.find(({ id }) => id === battle)?.watchFor ?? "",
  );
  if (
    shot === "cargando" ||
    shot === "ocupado" ||
    shot === "error" ||
    shot === "zoom125-error"
  ) {
    await next.click();
    if (shot === "cargando") {
      await message("Haciendo la foto del fotograma 3…");
      assert.equal(await busy(), "true");
      assert.equal(await frame(page, 2).getAttribute("data-dim"), "true");
      assert.equal(
        await figure.evaluate((node) => node.getBoundingClientRect().height),
        height,
      );
    } else {
      await message(
        shot === "ocupado"
          ? "El pintor está ocupado con otra foto"
          : "No se pudo hacer la foto del fotograma 3",
      );
      await page.getByRole("button", { name: "Volver a generar" }).waitFor();
    }
    return;
  }
  if (shot === "sin-derechos" || shot === "live") {
    await page.evaluate(
      (patch) => Reflect.get(window, "workshopCore")(patch),
      shot === "live" ? { live: true } : { accountGeneration: null },
    );
    await message(
      shot === "live" ? "Live está en marcha" : "Sin acceso a las fotos",
    );
    assert.equal(await next.getAttribute("aria-disabled"), "true");
    return;
  }
  if (shot === "lista-widgets" || shot.endsWith("lista-escenas")) {
    await page
      .getByRole("combobox", {
        name: shot === "lista-widgets" ? /^Widget/ : /^Escena/,
      })
      .click();
    await page.getByRole("listbox").waitFor();
  } else {
    await next.press("Shift+Tab");
    await page.keyboard.press("Tab");
    assert.equal(
      await next.evaluate(
        (node) =>
          node === document.activeElement && node.matches(":focus-visible"),
      ),
      true,
    );
  }
  if (shot === "pie-largo") {
    await page.getByRole("button", { name: "Inicio", exact: true }).click();
    await frame(page, 1).waitFor();
    assert((await caption.textContent())?.includes(longCaption));
  }
}

export async function checkWorkshopScreen(
  parent: Page,
  base: string,
  evidence?: {
    images: Partial<Record<Scheme, PreviewImage>>;
    capture: (page: Page, shot: string, scheme: Scheme) => Promise<void>;
  },
) {
  for (const [shot, schemes, width = 1440, height = 900, zoom = 100] of shots) {
    for (const scheme of schemes) {
      const page = await parent.context().newPage();
      try {
        await page.setViewportSize({ width, height });
        await setup(page, scheme, shot, zoom, evidence?.images[scheme]);
        await page.goto(`${base}?escena=preview-image`);
        await page
          .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
          .click();
        const sidebar = page.locator(".v-sidebar");
        const collapsed = await sidebar.evaluate((node) =>
          node.classList.contains("v-sidebar--collapsed"),
        );
        if (collapsed !== (shot === "barra-plegada"))
          await page.keyboard.press("Control+b");
        await page.getByRole("tab", { name: "Taller", exact: true }).click();
        await show(page, shot);
        if (zoom === 125)
          await page.waitForFunction(
            () => document.documentElement.style.zoom === "1.25",
          );
        const list = page.getByRole("listbox");
        const open = await list.isVisible();
        if (open) {
          const trigger = page.getByRole("combobox", { expanded: true });
          const name = await trigger.getAttribute("aria-label");
          assert(name);
          await page.keyboard.press("Escape");
          await list.waitFor({ state: "hidden" });
          const closed = page.getByRole("combobox", {
            name,
            exact: true,
            expanded: false,
          });
          assert(
            await closed.evaluate((node) => node === document.activeElement),
          );
          await closed.press("Enter");
          await list.waitFor();
          await page.keyboard.press("Tab");
          await page.waitForFunction(
            () =>
              document.activeElement instanceof HTMLElement &&
              document.activeElement !== document.body &&
              !document.activeElement.hasAttribute("data-base-ui-focus-guard"),
          );
          if (await list.isVisible()) await page.keyboard.press("Escape");
          await list.waitFor({ state: "hidden" });
          await closed.click();
          await list.waitFor();
        }
        await evidence?.capture(page, shot, scheme);
        const axe = new AxeBuilder({ page });
        // Base UI's nonmodal portal redirects focus from these hidden sentinels.
        if (open) axe.exclude('[data-base-ui-focus-guard][aria-hidden="true"]');
        assert.deepEqual(
          (await axe.analyze()).violations,
          [],
          `Workshop ${scheme}/${shot}`,
        );
      } finally {
        await page.close();
      }
    }
  }
}
