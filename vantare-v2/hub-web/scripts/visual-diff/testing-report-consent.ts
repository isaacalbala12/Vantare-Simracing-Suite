import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";

const consentLabel =
  "He revisado y acepto enviar este contenido al equipo de Vantare";
function luminance(rgb: number[]) {
  const channels = rgb.map((value) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

/** Inspect the actual control state, disabled face opacity, and rasterized tick. */
export async function assertReportConsent(page: Page, checked: boolean) {
  const checkbox = page.getByRole("checkbox", {
    name: consentLabel,
    exact: true,
  });
  const send = page.getByRole("button", {
    name: "Enviar informe",
    exact: true,
  });
  await send.and(page.locator(checked ? ":enabled" : ":disabled")).waitFor();
  assert.equal(await checkbox.isChecked(), checked);
  assert.equal(await checkbox.getAttribute("aria-checked"), String(checked));
  assert.equal(await send.isDisabled(), !checked);
  const paint = await send.evaluate((button) => ({
    opacity: Number(getComputedStyle(button).opacity),
    faceOpacity: Number(getComputedStyle(button, "::before").opacity),
    disabledOpacity: Number(
      getComputedStyle(button).getPropertyValue("--disabled-opacity"),
    ),
  }));
  if (!checked) {
    assert.ok(paint.disabledOpacity > 0 && paint.disabledOpacity < 1);
    assert.equal(
      paint.faceOpacity,
      paint.disabledOpacity,
      "Disabled paint must be attenuated",
    );
  } else {
    assert.equal(paint.opacity, 1, "Accepted send must be fully painted");
    assert.ok(await checkbox.locator("svg").isVisible());
  }
  await send.scrollIntoViewIfNeeded();
  const box = await checkbox.boundingBox();
  assert.ok(
    box && box.y >= 52 && box.y + box.height <= 900,
    "Consent must fit the capture",
  );
  if (checked) {
    const png = PNG.sync.read(
      await checkbox.screenshot({ animations: "disabled" }),
    );
    const backgroundOffset = (2 * png.width + Math.floor(png.width / 2)) * 4;
    const background = luminance(
      Array.from(png.data.subarray(backgroundOffset, backgroundOffset + 3)),
    );
    let tickPixels = 0;
    for (let y = 3; y < png.height - 3; y++)
      for (let x = 3; x < png.width - 3; x++) {
        const offset = (y * png.width + x) * 4;
        const ink = luminance(
          Array.from(png.data.subarray(offset, offset + 3)),
        );
        if (
          (Math.max(ink, background) + 0.05) /
            (Math.min(ink, background) + 0.05) >=
          3
        )
          tickPixels++;
      }
    assert.ok(
      tickPixels >= 3,
      "Checked control must paint a contrasting tick, not just aria-checked",
    );
  }
  console.log(
    `Consent QA: checked=${checked}, disabled=${!checked}, faceOpacity=${paint.faceOpacity}`,
  );
  return send.screenshot({ animations: "disabled" });
}

export function assertConsentPaintChange(before: Buffer, after: Buffer) {
  const a = PNG.sync.read(before),
    b = PNG.sync.read(after);
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      [0, 1, 2].some(
        (channel) => Math.abs(a.data[i + channel] - b.data[i + channel]) > 8,
      )
    )
      changed++;
  }
  assert.ok(
    changed > a.width * a.height * 0.05,
    "Disabled and active send must look different in actual pixels",
  );
}
