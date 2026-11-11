import assert from "node:assert/strict";
import type { Page } from "playwright-core";
/** Native top-layer modality must also cover an already open Base UI portal. */
export async function checkNativeAccessLayer(page: Page) {
  const selector = "dialog[data-access-layer-probe]";
  await page.evaluate(() => {
    const gate = document.createElement("dialog");
    gate.dataset.accessLayerProbe = "";
    gate.setAttribute("aria-label", "Acceso QA sobre el editor");
    const label = document.createElement("label");
    label.htmlFor = "access-layer-input";
    label.textContent = "Campo QA";
    const input = document.createElement("input");
    input.id = label.htmlFor;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Volver al editor";
    gate.append(label, input, close);
    gate.addEventListener("cancel", (event) => event.preventDefault());
    gate.addEventListener("keydown", (event) => event.stopPropagation());
    document.body.append(gate);
    gate.showModal();
    input.focus();
  });
  try {
    const gate = page.locator(selector);
    const input = gate.getByRole("textbox", { name: "Campo QA" });
    await input.fill("solo prueba local");
    assert.equal(await input.inputValue(), "solo prueba local");
    await page.keyboard.press("Escape");
    assert.equal(
      await gate.evaluate((node) => (node as HTMLDialogElement).open),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await gate.evaluate((node) => node.contains(document.activeElement)),
      true,
    );
  } finally {
    await page.locator(selector).evaluate((node) => {
      (node as HTMLDialogElement).close();
      node.remove();
    });
  }
  assert.equal(
    await page.getByRole("dialog").count(),
    1,
    "underlying editor remains open",
  );
}
