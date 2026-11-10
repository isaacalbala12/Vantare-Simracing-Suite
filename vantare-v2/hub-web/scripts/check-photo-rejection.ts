import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { t } from "../src/renderer/i18n/es.ts";

type QaWindow = Window & {
  qaDecoder?: typeof createImageBitmap;
  qaDecodes?: number;
};
export async function checkPhotoRejection(page: Page) {
  await page.evaluate(() => {
    const qa = window as QaWindow;
    qa.qaDecoder = window.createImageBitmap;
    qa.qaDecodes = 0;
    window.createImageBitmap = ((...args: unknown[]) => {
      qa.qaDecodes = (qa.qaDecodes ?? 0) + 1;
      return Reflect.apply(
        qa.qaDecoder as typeof createImageBitmap,
        window,
        args,
      );
    }) as typeof createImageBitmap;
  });
  try {
    const bytes = Buffer.alloc(33);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    bytes.writeUInt32BE(13, 8);
    bytes.writeUInt32BE(0x49484452, 12);
    bytes.writeUInt32BE(30000, 16);
    bytes.writeUInt32BE(30000, 20);
    bytes[24] = 8;
    bytes[25] = 6;
    await page
      .getByLabel(t("pilot.choosePhoto"), { exact: true })
      .setInputFiles({
        name: "bomb.png",
        mimeType: "image/png",
        buffer: bytes,
      });
    await page.getByText(t("pilot.photoFailed"), { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => (window as QaWindow).qaDecodes),
      0,
      "reject header before allocating decoded pixels",
    );
  } finally {
    await page.evaluate(() => {
      const qa = window as QaWindow;
      if (qa.qaDecoder) window.createImageBitmap = qa.qaDecoder;
      delete qa.qaDecoder;
      delete qa.qaDecodes;
    });
  }
}
