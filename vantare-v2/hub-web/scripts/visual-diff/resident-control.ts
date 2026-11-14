import assert from "node:assert/strict";
import { residentOrderReceiptTimeoutMs } from "../../src/contract/generated/launcher_resident.ts";
import { controlText as text } from "../../src/renderer/i18n/launcher-control.ts";
import {
  assertControlCaption,
  checkResidentControlInert,
  observeResidentControls,
} from "../check-resident-control.ts";
import type { VisualScene } from "./scenes.ts";
export const residentControlScenes: Record<string, VisualScene> = {};
for (const state of [
  "ready",
  "accepted",
  "rejected",
  "unknown",
  "finished",
  "no-steps",
  "unsupported",
  "cancel",
  "closing",
  "missing-document",
] as const) {
  residentControlScenes[`launcher-control-${state}`] = {
    mock: `launcher-control-${state}`,
    async prepare(page) {
      await observeResidentControls(page);
      if (state === "unknown") await page.clock.install();
      await page.getByRole("button", { name: "Launcher", exact: true }).click();
      await page
        .getByRole("heading", {
          name:
            state === "missing-document" ? "Launcher" : "Creador de Contenido",
          exact: true,
        })
        .waitFor();
      const toggle = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await toggle.getAttribute("aria-expanded")) === "true")
        await toggle.click();
      if (state === "unsupported") {
        const button = page.getByRole("button", {
          name: "Probar sin el juego",
          exact: true,
        });
        assert.equal(await button.getAttribute("aria-disabled"), "true");
        await button.focus();
        await page.keyboard.press("Enter");
        assert.equal(
          await page.evaluate(
            () =>
              (Reflect.get(window, "residentControlRequests") as unknown[])
                .length,
          ),
          0,
        );
      } else if (state !== "ready") {
        await page
          .getByRole("button", {
            name:
              state === "cancel" ||
              state === "closing" ||
              state === "missing-document"
                ? state === "missing-document"
                  ? "Cancelar secuencia actual"
                  : "Cancelar"
                : "Probar sin el juego",
            exact: true,
          })
          .click();
        const notice = page.getByRole("region", {
          name: text.title,
          exact: true,
        });
        if (state === "unknown") {
          await notice
            .getByText(`${text.rehearse}: ${text.queued}`, { exact: true })
            .waitFor();
          await page.clock.runFor(residentOrderReceiptTimeoutMs);
          await notice
            .getByText(`${text.rehearse}: ${text.unknown}`, { exact: true })
            .waitFor();
        } else if (state === "rejected" || state === "no-steps")
          await notice
            .getByText(
              `${text.rehearse}: ${text.rejected} ${text.rejection[state === "no-steps" ? "no-steps" : "start-failed"]}`,
              { exact: true },
            )
            .waitFor();
        else {
          await notice
            .getByText(
              `${state === "cancel" || state === "closing" || state === "missing-document" ? text.cancel : text.rehearse}: ${text.accepted}`,
              { exact: true },
            )
            .waitFor();
          if (state === "closing")
            await page
              .getByRole("dialog", {
                name: "Decisión de lanzamiento",
                exact: true,
              })
              .waitFor();
          if (
            state === "finished" ||
            state === "cancel" ||
            state === "missing-document"
          )
            await notice
              .getByText(
                `${state === "cancel" || state === "missing-document" ? text.cancel : text.rehearse}: ${state === "cancel" || state === "missing-document" ? text.cancelled : text.completed}`,
                { exact: true },
              )
              .waitFor();
        }
        const requests = await page.evaluate(
          () =>
            Reflect.get(window, "residentControlRequests") as {
              method: string;
            }[],
        );
        assert.equal(requests.length, 1);
        assert.equal(
          requests[0].method,
          state === "cancel" ||
            state === "closing" ||
            state === "missing-document"
            ? "launcher.resident.cancel"
            : "launcher.resident.rehearse",
        );
      }
      await assertControlCaption(page);
    },
  };
}
residentControlScenes["launcher-control-inert"] = {
  mock: "launcher-control-ready",
  prepare: checkResidentControlInert,
};

residentControlScenes["launcher-control-closed"] = {
  mock: "launcher-control-closing",
  async prepare(page) {
    await residentControlScenes["launcher-control-closing"].prepare(page);
    await page
      .getByRole("button", { name: "Dejar abiertas", exact: true })
      .click();
    await page
      .getByRole("region", { name: text.title, exact: true })
      .getByText(`${text.cancel}: ${text.cancelled}`, { exact: true })
      .waitFor();
    const requests = await page.evaluate(
      () =>
        Reflect.get(window, "residentControlRequests") as { method: string }[],
    );
    assert.deepEqual(
      requests.map((request) => request.method),
      ["launcher.resident.cancel", "launcher.resident.answer"],
    );
    await assertControlCaption(page);
  },
};
