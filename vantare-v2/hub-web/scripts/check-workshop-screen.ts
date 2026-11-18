import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";

export async function checkWorkshopScreen(parent: Page, base: string) {
  for (const scheme of ["dark", "light"] as const) {
    const page = await parent.context().newPage();
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.addInitScript((scheme) => {
        const send = MessagePort.prototype.postMessage;
        const held = new Set<number>();
        MessagePort.prototype.postMessage = function (message, options) {
          if (message?.kind === "hello")
            message = { ...message, theme: { ...message.theme, scheme } };
          if (message?.kind === "event" && message.event.topic === "core")
            message.event.value.access.tester = true;
          if (
            message?.kind === "response" &&
            message.result.method === "settings.get"
          )
            message.result.value.appearance.scheme = scheme;
          if (
            message?.kind === "request" &&
            message.request.method === "preview.render" &&
            message.request.target.kind === "scene" &&
            Reflect.get(window, "holdWorkshopPhoto")
          )
            held.add(message.id);
          if (
            (message?.kind === "response" || message?.kind === "failure") &&
            held.delete(message.id)
          ) {
            Reflect.set(window, "releaseWorkshopPhoto", () => {
              send.call(this, message, options as StructuredSerializeOptions);
            });
            return;
          }
          send.call(this, message, options as StructuredSerializeOptions);
        };
      }, scheme);

      await page.goto(`${base}?escena=preview-image`);
      await page
        .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
        .click();
      await page.getByRole("tab", { name: "Taller", exact: true }).click();
      const scene = page.getByRole("combobox", { name: /^Escena/ });
      const photo = page.getByRole("img", {
        name: /^Foto de Standings, escena/,
      });
      await photo.waitFor();
      if (
        !(await scene.getAttribute("aria-label"))?.includes("Batalla cercana")
      ) {
        await scene.click();
        await page
          .getByRole("option", { name: /Batalla cercana · conducción/ })
          .click();
        await page
          .getByRole("img", {
            name: /Batalla cercana · conducción, fotograma 1 de 4/,
          })
          .waitFor();
      }
      const figure = page.getByRole("figure");
      const height = await figure.evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      assert(height > 0);
      assert.deepEqual(
        (await new AxeBuilder({ page }).analyze()).violations,
        [],
        `Workshop ${scheme}/photo`,
      );

      await page.evaluate(() => Reflect.set(window, "holdWorkshopPhoto", true));
      await page
        .getByRole("button", { name: "Siguiente", exact: true })
        .click();
      await page
        .getByText("Haciendo la foto del fotograma 2…", { exact: true })
        .waitFor();
      assert.equal(await figure.getAttribute("aria-busy"), "true");
      assert.equal(
        await figure.evaluate(
          (element) => element.getBoundingClientRect().height,
        ),
        height,
      );
      assert.deepEqual(
        (await new AxeBuilder({ page }).analyze()).violations,
        [],
        `Workshop ${scheme}/pending`,
      );
      await page.waitForFunction(() =>
        Reflect.has(window, "releaseWorkshopPhoto"),
      );
      await page.evaluate(() => {
        Reflect.deleteProperty(window, "holdWorkshopPhoto");
        Reflect.get(window, "releaseWorkshopPhoto")();
        Reflect.deleteProperty(window, "releaseWorkshopPhoto");
      });
      await page
        .getByRole("img", {
          name: /Batalla cercana · conducción, fotograma 2 de 4/,
        })
        .waitFor();
      assert.equal(
        await figure.evaluate(
          (element) => element.getBoundingClientRect().height,
        ),
        height,
      );
    } finally {
      await page.close();
    }
  }
}
