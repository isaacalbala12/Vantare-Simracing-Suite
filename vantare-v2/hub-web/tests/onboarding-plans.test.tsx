// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { launchEndsAt } from "../src/renderer/ui/onboarding/launch-offer";
import { PlansArt } from "../src/renderer/ui/onboarding/PlansArt";

afterEach(cleanup);

// El final y el reloj se fijan aquí: alargar la oferta no rompe estos tests.
function renderAt(instant: string, endsAt = "2026-11-26T18:00:00Z") {
  cleanup();
  return render(
    <PlansArt
      onPrices={() => {}}
      now={() => new Date(instant)}
      endsAt={endsAt}
    />,
  );
}
const banner = () => screen.queryByText("PRECIO DE LANZAMIENTO");
const buttons = () =>
  screen.getAllByRole("button").map((button) => button.textContent);
const texts = (container: HTMLElement, selector: string) =>
  Array.from(container.querySelectorAll(selector), (node) => node.textContent);

it("shows the launch offer up to the last second", () => {
  const { container } = renderAt("2026-11-26T17:59:59Z");
  expect(banner()).toBeTruthy();
  expect(screen.getByText("HASTA EL 26 NOV")).toBeTruthy();
  expect(screen.getAllByText("PRIMER MES")).toHaveLength(2);
  expect(texts(container, ".v-ob-plan-price strong")).toEqual([
    "3,99 €",
    "6,99 €",
  ]);
  expect(texts(container, ".v-ob-plan-price s")).toEqual([
    "Precio normal: 5,99 €",
    "Precio normal: 9,99 €",
  ]);
});

it.each(["2026-11-26T18:00:00Z", "2026-11-27T12:00:00Z"])(
  "shows only the normal prices at %s",
  (instant) => {
    const { container } = renderAt(instant);
    expect(banner()).toBeNull();
    expect(container.textContent).not.toMatch(
      /HASTA EL|PRIMER MES|3,99|6,99|normal/i,
    );
    expect(container.querySelector(".v-ob-plans-heading, s")).toBeNull();
    expect(texts(container, ".v-ob-plan-price strong")).toEqual([
      "5,99 €",
      "9,99 €",
    ]);
    // Sin el título del banner, los planes suben un nivel: no se salta ninguno.
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["PRO", "PRO PLUS"]);
  },
);

it.each(["2026-11-26T17:59:59Z", "2026-11-26T18:00:00Z"])(
  "never offers the retired Launch Edition at %s",
  (instant) => {
    const { container } = renderAt(instant);
    expect(container.innerHTML).not.toMatch(/launch|30 €/i);
    expect(buttons()).toEqual(["Elegir Pro", "Elegir Pro Plus"]);
  },
);

it.each([
  ["2026-12-31T23:00:00Z", "31 DIC"],
  ["2027-04-10T22:00:00Z", "10 ABR"],
])("announces the last valid day of an offer ending %s", (endsAt, label) => {
  renderAt("2026-11-20T12:00:00Z", endsAt);
  expect(screen.getByText(`HASTA EL ${label}`)).toBeTruthy();
});

// El Hub no puede anunciar una oferta que el cobro ya no aplica, ni al revés.
it("ends the offer at the same instant as the checkout", async () => {
  const prices = JSON.parse(
    await readFile(
      resolve(
        import.meta.dirname,
        "../../../supabase/functions/scripts/polar-launch-prices.json",
      ),
      "utf8",
    ),
  );
  expect(launchEndsAt).toBe(prices.launch_windows.production.ends_at);
});
