// @vitest-environment jsdom

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostError, Request } from "../src/contract/generated/contract";
import type {
  StrategyAutomaticPlan,
  StrategyView,
} from "../src/contract/generated/strategy";
import { createMockHost } from "../src/mock/host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { HostFailure } from "../src/renderer/bridge/client";
import { amounts } from "../src/renderer/i18n/strategyAmounts";
import { automaticCompare } from "../src/renderer/screens/strategy/planText";
import { StrategyScreen } from "../src/renderer/ui/strategy/StrategyScreen";

afterEach(cleanup);

// «Neumáticos: Cambiar / No cambiar» in «Ajustar paradas» (E5h), seen from the screen.
// The mock host answers like the real one: `plannedFuji` has tyres that last 43 laps
// (no stop can keep them), `plannedFujiLongLife` 90 (the last one can, and saves 6,8 s).
// Every number on screen is the host's: the screen only spells them.

type MapView = (view: StrategyView) => StrategyView;
function clientFor(
  scene: string,
  override?: (request: Request) => HostError | undefined,
  mapView?: MapView,
) {
  const host = createMockHost(`strategy-${scene}`);
  const request = vi.fn(async (request: Request) => {
    const error = override?.(request);
    if (error) throw new HostFailure(error);
    const reply = host({ kind: "request", id: 1, request });
    if (reply?.kind === "failure") throw new HostFailure(reply.error);
    if (reply?.kind === "response") {
      const value = reply.result;
      const held = (value as { value?: { plan?: unknown } }).value;
      return mapView && held?.plan
        ? ({ ...value, value: mapView(held as StrategyView) } as typeof value)
        : value;
    }
    throw Error("Missing strategy response");
  });
  return Object.assign(request, { host });
}
type Client = ReturnType<typeof clientFor>;
function mount(...args: Parameters<typeof clientFor>) {
  const request = clientFor(...args);
  render(
    <SectionChromeProvider>
      <SectionTabsSlot />
      <StrategyScreen client={{ request }} />
    </SectionChromeProvider>,
  );
  return request;
}
const button = (name: string) => screen.getByRole("button", { name });
const click = (name: string) => fireEvent.click(button(name));
const heading = (name: string) => screen.findByRole("heading", { name });
const status = () => screen.getByRole("status").textContent;
// the line against the automatic plan (the status line says it too)
const line = (text: string | RegExp) =>
  screen.getByText(text, { selector: ".strategy-slower p" });
const calls = (request: Client) =>
  request.mock.calls
    .map(([r]) => r)
    .filter(
      (r): r is Extract<Request, { method: "strategy.setStopService" }> =>
        r.method === "strategy.setStopService",
    );
async function stops(
  scene = "plannedFujiLongLife",
  override?: Parameters<typeof clientFor>[1],
  mapView?: MapView,
) {
  const request = mount(scene, override, mapView);
  await screen.findByRole("heading", { name: "Tus estrategias" });
  click("Continuar");
  fireEvent.click(screen.getByRole("tab", { name: "Plan" }));
  await heading("Plan calculado");
  click("Ajustar paradas");
  await heading("Ajustar paradas");
  return request;
}
function pick(stop: number, lap: number) {
  fireEvent.click(
    screen.getByRole("radio", {
      name: new RegExp(`^Parada ${stop}, vuelta ${lap}`),
    }),
  );
}
const tyres = (stop: number) =>
  screen.getByRole("group", { name: `Neumáticos de la parada ${stop}` });
const keep = (stop: number) =>
  within(tyres(stop)).getByRole("radio", { name: "No cambiar" });
const change = (stop: number) =>
  within(tyres(stop)).getByRole("radio", { name: "Cambiar" });
const checked = (radio: HTMLElement) => (radio as HTMLInputElement).checked;
async function recalculate() {
  await heading("Plan modificado");
  click("Recalcular");
  await waitFor(() => expect(status()).toContain("recalculado"));
  click("Resumen");
}
// the plan the host gives, with the automatic one `delta` seconds faster (negative:
// slower) than it: the host's figures, moved
const withAutomatic =
  (delta: number): MapView =>
  (view) => {
    const total = view.plan.result?.metrics?.totalSeconds;
    if (view.plan.edit?.automatic && total !== undefined)
      view.plan.edit.automatic = {
        ...(view.plan.edit.automatic as StrategyAutomaticPlan),
        totalSeconds: total - delta,
      };
    return view;
  };

describe("the tyres row of a stop", () => {
  it("is a row like the amounts, in a group with two radios, «Cambiar» on and nothing pinned", async () => {
    await stops();
    pick(2, 85);
    expect(checked(change(2))).toBe(true);
    expect(checked(keep(2))).toBe(false);
    expect(screen.getByText("Neumáticos")).toBeTruthy();
    expect(
      screen.getByText("Las de ahora llegan con 42 vueltas; aguantan 90."),
    ).toBeTruthy();
    expect(screen.getAllByText("lo decide el cálculo")).toHaveLength(3);
    expect(screen.queryByText("fijado por ti")).toBeNull();
    // the read-only card of the tyres is gone: the row replaces it
    expect(screen.queryByText("Nuevos")).toBeNull();
    expect(screen.queryByText("Los mismos")).toBeNull();
    // «true» is never offered: it would restrict nothing
    expect(within(tyres(2)).getAllByRole("radio")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Volver todo a automático" }),
    ).toBeNull();
  });

  it("says «no limit» without a made-up life", async () => {
    await stops("plannedFujiLongLife", undefined, (view) => {
      for (const stop of view.plan.edit?.stops ?? [])
        stop.tyres.lifeLaps = null;
      return view;
    });
    pick(2, 85);
    expect(
      screen.getByText("Las de ahora llegan con 42 vueltas."),
    ).toBeTruthy();
    fireEvent.click(keep(2));
    expect(
      await screen.findByText(
        "Sin cambiar, llegarían a la parada 3 con 84 vueltas.",
      ),
    ).toBeTruthy();
  });

  it("sends the whole stop: «No cambiar» is false and «Cambiar» is null", async () => {
    const request = await stops();
    pick(2, 85);
    fireEvent.click(keep(2));
    await heading("Plan modificado");
    expect(calls(request)).toHaveLength(1);
    expect(calls(request)[0]).toMatchObject({
      index: 1,
      fuelLiters: null,
      vePercent: null,
      changeTyres: false,
    });
    expect(checked(keep(2))).toBe(true);
    fireEvent.click(change(2));
    await waitFor(() => expect(calls(request)).toHaveLength(2));
    expect(calls(request)[1]).toMatchObject({
      index: 1,
      fuelLiters: null,
      vePercent: null,
      changeTyres: null,
    });
    await waitFor(() => expect(screen.queryByText("fijado por ti")).toBeNull());
  });

  it("keeps the amounts fixed when the tyres are fixed, and the tyres when an amount is", async () => {
    const request = await stops();
    pick(2, 85);
    fireEvent.click(
      within(
        screen.getByRole("group", {
          name: "Combustible de la parada 2: cómo se decide",
        }),
      ).getByRole("radio", { name: "A mano" }),
    );
    await waitFor(() => expect(calls(request)).toHaveLength(1));
    fireEvent.click(keep(2));
    await waitFor(() => expect(calls(request)).toHaveLength(2));
    expect(calls(request)[1]).toMatchObject({
      fuelLiters: 77,
      vePercent: null,
      changeTyres: false,
    });
    const input = screen.getByRole("textbox", {
      name: "Combustible de la parada 2",
    });
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(calls(request)).toHaveLength(3));
    expect(calls(request)[2]).toMatchObject({
      fuelLiters: 75,
      changeTyres: false,
    });
  });

  it("works with the keyboard: Tab reaches the checked one, the arrows change and send, the focus stays", async () => {
    const user = userEvent.setup();
    const request = await stops();
    pick(2, 85);
    // the way in is the checked radio of the group
    for (let i = 0; i < 40 && document.activeElement !== change(2); i += 1)
      await user.tab();
    expect(document.activeElement).toBe(change(2));
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(calls(request)).toHaveLength(1));
    expect(calls(request)[0].changeTyres).toBe(false);
    await waitFor(() => expect(checked(keep(2))).toBe(true));
    expect(document.activeElement).toBe(keep(2));
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(calls(request)).toHaveLength(2));
    expect(calls(request)[1].changeTyres).toBe(null);
    await waitFor(() => expect(checked(change(2))).toBe(true));
    expect(document.activeElement).toBe(change(2));
  });

  it("pins the stop everywhere the host says tyres are fixed, and only there", async () => {
    await stops();
    pick(2, 85);
    fireEvent.click(keep(2));
    await heading("Plan modificado");
    // the row, the chip and the timeline
    expect(
      within(tyres(2).closest(".strategy-amount") as HTMLElement).getByText(
        "fijado por ti",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", {
        name: /^Parada 2, vuelta 85, con algo fijado por ti/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: /^Parada 1, vuelta 43$/ }),
    ).toBeTruthy();
    expect(
      document.querySelectorAll(".strategy-stop .strategy-pin"),
    ).toHaveLength(1);
    // and the header says it
    expect(
      screen.getByText(
        "Has fijado «No cambiar» en los neumáticos de la parada 2.",
      ),
    ).toBeTruthy();
  });

  it("shows «Cambiar» with the pin when the host holds true (an edited file)", async () => {
    await stops("plannedFujiLongLife", undefined, (view) => {
      const stop = view.plan.edit?.stops[1];
      if (stop) stop.fixed.changeTyres = true;
      return view;
    });
    pick(2, 85);
    expect(checked(change(2))).toBe(true);
    expect(
      within(tyres(2).closest(".strategy-amount") as HTMLElement).getByText(
        "fijado por ti",
      ),
    ).toBeTruthy();
  });
});

describe("what the row says comes from the host", () => {
  it("writes the laps, the life and the stop of the host, not its own", async () => {
    await stops("plannedFujiLongLife", undefined, (view) => {
      const stop = view.plan.edit?.stops[1];
      if (stop) {
        stop.tyres.arrivalLaps = 51;
        stop.tyres.keptLaps = 77;
        stop.tyres.lifeLaps = 88;
      }
      return view;
    });
    pick(2, 85);
    expect(
      screen.getByText("Las de ahora llegan con 51 vueltas; aguantan 88."),
    ).toBeTruthy();
    fireEvent.click(keep(2));
    expect(
      await screen.findByText(
        "Sin cambiar, llegarían a la parada 3 con 77 vueltas; aguantan 88.",
      ),
    ).toBeTruthy();
  });

  it("follows the host's issue and not a comparison of its own", async () => {
    // 77 laps do not pass 88, yet the host says they do not fit: it is said
    await stops("plannedFujiLongLife", undefined, (view) => {
      const stop = view.plan.edit?.stops[1];
      if (stop) {
        stop.tyres.keptLaps = 77;
        stop.tyres.lifeLaps = 88;
        if (stop.fixed.changeTyres === false) stop.tyres.issue = "beyondLife";
      }
      return view;
    });
    pick(2, 85);
    fireEvent.click(keep(2));
    expect(
      await screen.findByText(
        "Sin cambiar, las ruedas llegarían a la parada 3 con 77 vueltas y aguantan 88. Así no hay plan: cambia las ruedas en esta parada.",
      ),
    ).toBeTruthy();
  });

  it("says «a meta» in the last stop and a plain note when they fit", async () => {
    await stops();
    pick(5, 212);
    fireEvent.click(keep(5));
    expect(
      await screen.findByText(
        "Sin cambiar, llegarían a meta con 66 vueltas; aguantan 90.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Así no hay plan/)).toBeNull();
  });

  it("warns, as an amber note and not an error, when they do not last, and announces it once", async () => {
    await stops("plannedFuji");
    pick(2, 85);
    fireEvent.click(keep(2));
    const note = await screen.findByText(
      "Sin cambiar, las ruedas llegarían a la parada 3 con 84 vueltas y aguantan 43. Así no hay plan: cambia las ruedas en esta parada.",
    );
    expect(note.closest("[data-tone]")?.getAttribute("data-tone")).toBe("warn");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(status()).toBe(
      "Parada 2: neumáticos sin cambiar, fijado por ti. Sin cambiar, las ruedas llegarían a la parada 3 con 84 vueltas y aguantan 43. Así no hay plan: cambia las ruedas en esta parada.",
    );
    // the radios are described by the help and by the note
    const described = keep(2).getAttribute("aria-describedby") ?? "";
    expect(described.split(" ")).toHaveLength(2);
    for (const id of described.split(" "))
      expect(document.getElementById(id)?.textContent).toBeTruthy();
  });

  it("announces going back to «Cambiar»", async () => {
    await stops();
    pick(2, 85);
    fireEvent.click(keep(2));
    await heading("Plan modificado");
    fireEvent.click(change(2));
    await waitFor(() =>
      expect(status()).toBe(
        "Parada 2: neumáticos nuevos, como decide el cálculo.",
      ),
    );
  });

  it("shows the pit time of the host: the last stop saves 6,8 s, the second does not", async () => {
    await stops();
    pick(5, 212);
    fireEvent.click(keep(5));
    expect(await screen.findByText("0:58,2")).toBeTruthy();
    expect(screen.getByText("antes 1:05,0")).toBeTruthy();
    fireEvent.click(change(5));
    await waitFor(() => expect(screen.queryByText("fijado por ti")).toBeNull());
    pick(2, 85);
    fireEvent.click(keep(2));
    await waitFor(() => expect(checked(keep(2))).toBe(true));
    expect(screen.queryByText(/^antes /)).toBeNull();
  });
});

describe("the line against the automatic plan", () => {
  it("is «más rápido» with the way back when the last stop keeps its tyres (Fuji, 6,8 s)", async () => {
    await stops();
    pick(5, 212);
    fireEvent.click(keep(5));
    await recalculate();
    expect(
      line(
        "Lo que fijaste hace el plan 6,8 s más rápido que el plan automático (6:01:04).",
      ),
    ).toBeTruthy();
    expect(screen.getByText("6,8 s menos que el automático")).toBeTruthy();
    expect(screen.getByText("1 parada con algo fijado")).toBeTruthy();
    expect(button("Volver todo a automático")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Stints y paradas" });
    expect(within(list).getAllByText("fijado por ti")).toHaveLength(1);
    expect(within(list).getByText(/mismas ruedas/)).toBeTruthy();
    expect(status()).toContain("6,8 s más rápido");
    // keeping them saves time here: the rule of the other case is not said
    expect(screen.queryByText(/solo ahorra tiempo cuando/)).toBeNull();
  });

  it("is «igual» with the general rule and no button when the second stop keeps them (Fuji)", async () => {
    await stops();
    pick(2, 85);
    fireEvent.click(keep(2));
    await recalculate();
    expect(
      line(
        "El plan respeta lo que fijaste y tarda lo mismo que el plan automático (6:01:04).",
      ),
    ).toBeTruthy();
    expect(
      line(
        /No cambiar las ruedas solo ahorra tiempo cuando el cambio es lo que más tarda de la parada\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText("igual que el automático")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Volver todo a automático" }),
    ).toBeNull();
    expect(status()).toContain("tarda lo mismo");
  });

  it("does not give the rule when the service is one after the other: there keeping always saves", async () => {
    await stops("plannedFujiLongLife", undefined, (view) => {
      for (const pit of view.plan.result?.timeline?.pits ?? [])
        pit.service = "sequential";
      return view;
    });
    pick(2, 85);
    fireEvent.click(keep(2));
    await recalculate();
    expect(line(/tarda lo mismo que el plan automático/)).toBeTruthy();
    expect(screen.queryByText(/solo ahorra tiempo cuando/)).toBeNull();
  });

  it.each([
    [-0.04, /tarda lo mismo/, false],
    [0.04, /tarda lo mismo/, false],
    [-0.06, /más rápido que el plan automático/, true],
    [0.06, /más lento que el plan automático/, true],
  ])(
    "with %s s of difference reads %s (button: %s)",
    async (delta, text, hasButton) => {
      await stops("plannedFujiLongLife", undefined, withAutomatic(delta));
      pick(5, 212);
      fireEvent.click(keep(5));
      await recalculate();
      expect(line(text)).toBeTruthy();
      expect(
        !!screen.queryByRole("button", { name: "Volver todo a automático" }),
      ).toBe(hasButton);
    },
  );

  it("compares by the host's durations only", () => {
    const automatic = {
      totalSeconds: 100,
      fuelFinishLiters: 1,
      veFinishPercent: 1,
    };
    const result = (total: number) =>
      ({ metrics: { totalSeconds: total } }) as never;
    expect(automaticCompare(result(100.049), automatic)?.kind).toBe("same");
    expect(automaticCompare(result(99.951), automatic)?.kind).toBe("same");
    expect(automaticCompare(result(100.06), automatic)?.kind).toBe("slower");
    expect(automaticCompare(result(99.94), automatic)?.kind).toBe("faster");
    expect(automaticCompare(result(99.94), null)).toBeNull();
    expect(automaticCompare(null, automatic)).toBeNull();
  });
});

describe("no plan because of the tyres", () => {
  async function noPlan() {
    const request = await stops("plannedFuji");
    pick(2, 85);
    fireEvent.click(keep(2));
    await heading("Plan modificado");
    click("Recalcular");
    const alert = await screen.findByRole("alert");
    return { request, alert };
  }

  it("names the stop and says it is the tyres, with the way back for the whole stop", async () => {
    const { alert } = await noPlan();
    expect(alert.textContent).toContain("Ningún plan cumple lo que fijaste");
    expect(alert.textContent).toContain(
      "En la parada 2 las ruedas no aguantan sin cambiar: llegarían a la parada 3 con 84 vueltas y aguantan 43.",
    );
    expect(status()).toBe(
      "Ningún plan cumple lo que fijaste: mira la parada 2.",
    );
    // the editor under it has the row, with the amber note
    expect(checked(keep(2))).toBe(true);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("«Volver la parada N a automático» takes the tyres back too (the pin goes and the plan can be had)", async () => {
    const { request } = await noPlan();
    click("Volver la parada 2 a automático");
    await waitFor(() =>
      expect(calls(request).at(-1)).toMatchObject({
        index: 1,
        fuelLiters: null,
        vePercent: null,
        changeTyres: null,
      }),
    );
    await waitFor(() => expect(button("Recalcular")).toBeTruthy());
    expect(screen.queryByText("fijado por ti")).toBeNull();
    expect(checked(change(2))).toBe(true);
    click("Recalcular");
    await waitFor(() => expect(status()).toContain("recalculado"));
  });

  it("is generic when the crate names no stop", async () => {
    await stops("plannedFuji", undefined, (view) => {
      if (view.plan.edit?.cause) view.plan.edit.cause = null;
      return view;
    });
    pick(2, 85);
    fireEvent.click(keep(2));
    await heading("Plan modificado");
    click("Recalcular");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Con lo que fijaste no hay plan que termine la carrera. Cambia algo de lo fijado o vuelve todo a automático.",
    );
    expect(alert.textContent).not.toMatch(/parada \d/);
  });
});

describe("«Calcular de nuevo» with only the tyres fixed", () => {
  it("asks first, counting the stop", async () => {
    const request = await stops();
    pick(5, 212);
    fireEvent.click(keep(5));
    await recalculate();
    const before = request.mock.calls.filter(
      ([r]) => r.method === "strategy.compute",
    ).length;
    click("Calcular de nuevo");
    expect(
      screen.getByText(
        "Se pierde lo que fijaste a mano en 1 parada: el cálculo nuevo decide todo.",
      ),
    ).toBeTruthy();
    expect(
      request.mock.calls.filter(([r]) => r.method === "strategy.compute")
        .length,
    ).toBe(before);
  });
});

describe("the texts of the header", () => {
  it("says tyres and amounts of one stop together, and many stops as «algo»", async () => {
    await stops();
    pick(2, 85);
    fireEvent.click(
      within(
        screen.getByRole("group", {
          name: "Combustible de la parada 2: cómo se decide",
        }),
      ).getByRole("radio", { name: "A mano" }),
    );
    await screen.findByRole("textbox", { name: "Combustible de la parada 2" });
    fireEvent.click(keep(2));
    expect(
      await screen.findByText(
        "En la parada 2 has fijado 77 L y «No cambiar» en los neumáticos.",
      ),
    ).toBeTruthy();
    pick(5, 212);
    fireEvent.click(keep(5));
    expect(
      await screen.findByText("Has fijado algo a mano en 2 paradas."),
    ).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("the texts of the tyres", () => {
  const leaves = (value: unknown, path: string): string[] =>
    typeof value === "object" && value !== null
      ? Object.entries(value).flatMap(([key, item]) =>
          leaves(item, `${path}.${key}`),
        )
      : [path];
  const source = (dir: string): string =>
    readdirSync(dir)
      .map((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory()
          ? source(path)
          : /\.tsx?$/.test(name) && !/i18n/.test(path)
            ? readFileSync(path, "utf8")
            : "";
      })
      .join("\n");
  it("leaves no key of the amounts without use", () => {
    const code = source(join(__dirname, "../src/renderer"));
    // a key is used when its name is written somewhere in the screens
    const orphans = leaves(amounts, "amounts").filter(
      (path) =>
        !new RegExp(String.raw`\b${path.split(".").at(-1)}\b`).test(code),
    );
    expect(orphans).toEqual([]);
  });
});

// Pulido tras la pantalla de neumáticos (#2765)
const fuelByHand = (stop: number) =>
  fireEvent.click(
    within(
      screen.getByRole("group", {
        name: `Combustible de la parada ${stop}: cómo se decide`,
      }),
    ).getByRole("radio", { name: "A mano" }),
  );

describe("pulido de la pantalla de neumáticos", () => {
  it("«igual» con solo cantidades fijadas no da la regla de las ruedas", async () => {
    await stops("plannedFujiLongLife", undefined, withAutomatic(0));
    pick(2, 85);
    fuelByHand(2);
    await recalculate();
    expect(line(/tarda lo mismo que el plan automático/)).toBeTruthy();
    expect(screen.queryByText(/solo ahorra tiempo cuando/)).toBeNull();
  });

  it("la fila de ruedas se bloquea mientras se recalcula", async () => {
    await stops("plannedFujiRecalculating");
    pick(2, 85);
    fireEvent.click(keep(2));
    await heading("Plan modificado");
    click("Recalcular");
    await heading("Recalculando…");
    expect((tyres(2) as HTMLFieldSetElement).disabled).toBe(true);
  });

  it("sin parada señalada, «Volver todo a automático» existe en la pantalla y quita lo fijado", async () => {
    const request = await stops("plannedFuji", undefined, (view) => {
      if (view.plan.edit?.cause) view.plan.edit.cause = null;
      return view;
    });
    pick(2, 85);
    fireEvent.click(keep(2));
    await heading("Plan modificado");
    click("Recalcular");
    await screen.findByRole("alert");
    click("Volver todo a automático");
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([r]) => r.method === "strategy.clearStopServices",
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText("fijado por ti")).toBeNull());
  });

  it("con una sola vuelta dice «vuelta», no «vueltas»", async () => {
    await stops("plannedFujiLongLife", undefined, (view) => {
      const stop = view.plan.edit?.stops[1];
      if (stop) {
        stop.tyres.arrivalLaps = 1;
        stop.tyres.keptLaps = 1;
      }
      return view;
    });
    pick(2, 85);
    expect(screen.getByText(/^Las de ahora llegan con 1 vuelta;/)).toBeTruthy();
    fireEvent.click(keep(2));
    expect(
      await screen.findByText(
        /^Sin cambiar, llegarían a la parada 3 con 1 vuelta;/,
      ),
    ).toBeTruthy();
  });

  it.each([
    [1, "1 vuelta"],
    [2, "2 vueltas"],
  ])("los textos de neumáticos con %s vuelta(s)", (laps, said) => {
    const t = amounts.tyres;
    expect(t.arrival(laps, null)).toContain(`con ${said}.`);
    expect(t.kept("a meta", laps, null)).toContain(`con ${said}.`);
    expect(t.beyondLife("a meta", laps, null)).toContain(`con ${said}.`);
    expect(amounts.noPlan.tyres(2, "a meta", laps, null)).toContain(
      `con ${said}.`,
    );
  });

  it("la cabecera distingue «Cambiar» (true) de «No cambiar» (false) con una cantidad", async () => {
    await stops("plannedFujiLongLife", undefined, (view) => {
      const stop = view.plan.edit?.stops[1];
      if (stop) stop.fixed.changeTyres = true;
      return view;
    });
    pick(2, 85);
    fuelByHand(2);
    expect(
      await screen.findByText(
        /^En la parada 2 has fijado .* y «Cambiar» en los neumáticos\.$/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/«No cambiar» en los neumáticos/)).toBeNull();
  });
});
