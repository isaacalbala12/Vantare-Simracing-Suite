import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { pilotLimits } from "../src/contract/generated/contract.ts";
import { t } from "../src/renderer/i18n/es.ts";
import { until } from "./wait-for.ts";
export async function checkPilotCore(page: Page, evidence: string) {
  await page
    .getByRole("tab", { name: t("settings.account"), exact: true })
    .click();
  const name = page.getByRole("textbox", {
    name: t("pilot.name"),
    exact: true,
  });
  await name.fill("Piloto local QA").catch(async (error) => {
    await page.screenshot({ path: join(evidence, "pilot-load-failure.png") });
    await writeFile(
      join(evidence, "pilot-load-failure.json"),
      JSON.stringify(
        await page.evaluate(
          () => (window as unknown as { qaFailures?: unknown }).qaFailures,
        ),
      ),
    );
    throw error;
  });
  await page
    .getByRole("textbox", { name: t("pilot.description"), exact: true })
    .fill("Guardado por IPC local, sin cuenta ni red");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 600, 300);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel(t("pilot.choosePhoto"), { exact: true })
    .setInputFiles({
      name: "qa.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await page
    .getByRole("img", { name: "Piloto local QA", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: t("pilot.save"), exact: true })
    .click();
  await page.getByText(t("pilot.saved"), { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, "pilot-core-saved.png") });
  await page.reload();
  await page
    .getByRole("tab", { name: t("settings.account"), exact: true })
    .click();
  await until(
    async () => (await name.inputValue()) === "Piloto local QA",
    10000,
    "pilot reopened from real supervisor",
  );
  assert.equal(
    await page
      .getByRole("textbox", { name: t("pilot.description"), exact: true })
      .inputValue(),
    "Guardado por IPC local, sin cuenta ni red",
  );
  const photo = page.getByRole("img", { name: "Piloto local QA", exact: true });
  await photo.waitFor();
  assert.equal(
    await photo.evaluate((img) => (img as HTMLImageElement).naturalWidth),
    pilotLimits.photoSide,
  );
  // A draft must not prevent the real Live transition from closing the Hub.
  await name.fill("Borrador descartado al entrar en pista");
}
