import assert from "node:assert/strict";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { residentText } from "../src/renderer/i18n/launcher-resident.ts";
import { residentReviewText as text } from "../src/renderer/i18n/launcher-review.ts";
import { until } from "./wait-for.ts";

export const reviewScenes = [
  ["question", "pregunta"],
  ["reviewing", "revisando"],
  ["trusted", "confiado"],
  ["declined", "rechazado"],
  ["changed", "cambiado"],
  ["expired", "caducado"],
  ["unavailable", "no-disponible"],
  ["too-long", "demasiado-largo"],
  ["blocked-lookalike", "bloqueado-imita"],
  ["blocked-unusual-path", "bloqueado-forma"],
  // La revisión cambia mientras está abierta y ahora hay una ruta bloqueada.
  ["blocked-lookalike", "cambiado-y-bloqueado", "changed-blocked"],
  ["unconfirmed", "esperando-confirmacion", "awaiting-confirmation"],
] as const;

// Estados que llegan decididos del anfitrión: no hay nada que pulsar antes.
const fromHost: readonly string[] = [
  "question",
  "unavailable",
  "too-long",
  "blocked-lookalike",
  "blocked-unusual-path",
];

export async function openReviewScene(
  page: Page,
  state: (typeof reviewScenes)[number][0],
  scene: string = state,
) {
  await page.getByRole("button", { name: /^Launcher(, ?\d+)?$/ }).click();
  const drawer = page.getByRole("dialog", {
    name: residentText.title,
    exact: true,
  });
  await drawer.waitFor();
  const toggle = page.getByRole("button", {
    name: "Contraer o ampliar navegación",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-expanded")) === "true")
    await toggle.click();
  if (scene === "changed-blocked" || !fromHost.includes(state))
    await drawer
      .getByRole("button", { name: text.review, exact: true })
      .click();
  if (state !== "question")
    await drawer.getByText(text.states[state].title, { exact: true }).waitFor();
  await drawer.getByText(text.chip, { exact: true }).waitFor();
  await drawer
    .getByText(
      state === "too-long"
        ? "2 pasos · Le Mans Ultimate, Actualizador de overlays"
        : "3 pasos · Le Mans Ultimate, OBS Studio, Spotify",
      { exact: true },
    )
    .waitFor();
  return drawer;
}

export async function checkResidentReview(
  owner: Page,
  base: string,
  evidence?: string,
) {
  const page = await owner.context().newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [
      index,
      [state, name, scene = state],
    ] of reviewScenes.entries()) {
      for (const [scheme, theme] of [
        ["dark", "oscuro"],
        ["light", "claro"],
      ] as const) {
        await page.goto(
          `${base}?escena=visual-${scheme}:launcher-review-${scene}`,
        );
        const drawer = await openReviewScene(page, state, scene);
        await page.evaluate(() => document.fonts.ready);
        const live = page.getByRole("region", {
          name: residentText.answerStatusLabel,
        });
        const status = live.getByRole("status", { includeHidden: true });
        assert.equal(await status.count(), 1);
        assert.equal((await status.textContent())?.trim(), text.live[state]);
        assert.equal(await drawer.getByRole("status").count(), 0);
        assert.equal(
          await drawer
            .getByRole("button", { name: "Confiar y lanzar" })
            .count(),
          0,
        );
        if (state === "blocked-lookalike" || state === "blocked-unusual-path") {
          await drawer
            .getByText(text.states[state].text, { exact: true })
            .waitFor();
          for (const name of [text.review, text.reviewAgain])
            assert.equal(
              await drawer.getByRole("button", { name, exact: true }).count(),
              0,
            );
          assert.equal(await drawer.getByRole("alert").count(), 0);
        }
        if (state === "unconfirmed") {
          assert.equal(
            await drawer
              .getByRole("button", { name: text.review, exact: true })
              .count(),
            0,
          );
          assert.equal(
            await drawer
              .getByRole("button", { name: text.cancel, exact: true })
              .isEnabled(),
            true,
          );
        }
        // El botón «Revisar otra vez» desaparece: el foco no se pierde.
        if (scene === "changed-blocked")
          await until(
            () =>
              drawer.evaluate((node) => node.contains(document.activeElement)),
            5000,
            `${scene}: review focus`,
          );
        if (["changed", "expired", "trusted", "declined"].includes(state)) {
          const focus =
            state === "changed" || state === "expired"
              ? drawer.getByRole("button", { name: text.reviewAgain })
              : drawer;
          await until(
            () => focus.evaluate((node) => node === document.activeElement),
            5000,
            `${state}: review focus`,
          );
        }
        const report = await new AxeBuilder({ page })
          .include(".v-launcher-resident-drawer")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          report.violations.map(({ id, nodes }) => ({
            id,
            nodes: nodes.map(({ target, failureSummary }) => ({
              target,
              failureSummary,
            })),
          })),
          [],
          `review: ${state} / ${scheme}`,
        );
        if (evidence)
          await page.screenshot({
            path: resolve(
              evidence,
              `renderer-${index + 1}-${name}-${theme}.png`,
            ),
            animations: "disabled",
          });
      }
    }
  } finally {
    await page.close();
  }
}
