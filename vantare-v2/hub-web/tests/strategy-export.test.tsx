// @vitest-environment jsdom
import {
  act,
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
  StrategyExportFileValue,
  StrategyView,
} from "../src/contract/generated/strategy";
import { createMockHost } from "../src/mock/host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { HostFailure } from "../src/renderer/bridge/client";
import { StrategyScreen } from "../src/renderer/ui/strategy/StrategyScreen";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Exporting the plan, seen from the screen (E5d). The mock host answers like the
// real one (E5c). The main process copies the text and writes the file: the screen
// only asks, and says what came of it. `hold` keeps an answer back, as the window
// to save does while it is open.

function clientFor(
  scene: string,
  options: {
    override?: (request: Request) => HostError | undefined;
    hold?: (request: Request) => Promise<void> | undefined;
    // replaces the answer of the host to the export of a file
    answer?: (request: Request) => StrategyExportFileValue | undefined;
  } = {},
) {
  const host = createMockHost(`strategy-${scene}`);
  const request = vi.fn(async (request: Request) => {
    await options.hold?.(request);
    const error = options.override?.(request);
    if (error) throw new HostFailure(error);
    const value = options.answer?.(request);
    if (value) return { method: "strategy.exportFile" as const, value };
    const reply = host({ kind: "request", id: 1, request });
    if (reply?.kind === "failure") throw new HostFailure(reply.error);
    if (reply?.kind === "response") return reply.result;
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
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const maybe = (name: string | RegExp) => screen.queryByRole("button", { name });
const tab = (name: string) => screen.getByRole("tab", { name });
const status = () => screen.getByRole("status").textContent;
const calls = <M extends Request["method"]>(request: Client, method: M) =>
  request.mock.calls
    .map(([r]) => r)
    .filter((r): r is Extract<Request, { method: M }> => r.method === method);
async function lastView(request: Client) {
  let seen: StrategyView | undefined;
  for (const result of request.mock.results) {
    try {
      seen = ((await result.value) as { value: StrategyView }).value;
    } catch {
      // a refusal sends no view
    }
  }
  if (!seen?.plan) throw Error("no view yet");
  return seen;
}
async function openPlan(title = "Plan calculado") {
  await screen.findByRole("heading", { name: "Tus estrategias" });
  fireEvent.click(button("Continuar"));
  fireEvent.click(tab("Plan"));
  await screen.findByRole("heading", { name: title });
}
// a held answer: `release()` lets it go
function gate() {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Exportar"));
  return screen.findByRole("menu", { name: "Exportar el plan" });
}
const asText = /^Copiar como texto/;
const asFile = /^Guardar como hoja de cálculo/;
const noPath = () =>
  expect(document.body.textContent).not.toMatch(
    /[A-Za-z]:[\\/]|\\\\|\/Users\//,
  );
const failWith =
  (method: Request["method"], error: HostError) => (r: Request) =>
    r.method === method ? error : undefined;

// ---- the menu ----

describe("the menu «Exportar»", () => {
  it("is on a proposal, with a warning that it is not accepted, and two ways", async () => {
    const user = userEvent.setup();
    mount("plannedFuji");
    await openPlan();
    const menu = await open(user);
    expect(
      within(menu).getByText(
        "Es una propuesta sin aceptar. Lo que exportes lo dirá en la primera línea.",
      ),
    ).toBeTruthy();
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Copiar como textoPara pegarlo en un chat, un correo o una nota",
      "Guardar como hoja de cálculo…Archivo CSV para Excel, Google Sheets o Numbers",
    ]);
    // nothing was asked yet
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("has no warning on the accepted plan", async () => {
    const user = userEvent.setup();
    mount("acceptedFuji");
    await openPlan("Plan aceptado");
    const menu = await open(user);
    expect(within(menu).queryByText(/propuesta sin aceptar/)).toBeNull();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
  });

  it("moves with the arrows, and Escape closes it and gives the focus back to the button", async () => {
    const user = userEvent.setup();
    mount("plannedFuji");
    await openPlan();
    const trigger = button("Exportar");
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    const [first, second] = await screen.findAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(first));
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(document.activeElement).toBe(second));
    await user.keyboard("{ArrowUp}");
    await waitFor(() => expect(document.activeElement).toBe(first));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("is not offered when there is no plan yet", async () => {
    const request = mount("ready");
    await openPlan("Sin calcular");
    expect(maybe("Exportar")).toBeNull();
    expect(calls(request, "strategy.export")).toHaveLength(0);
  });

  it("is not offered when the recalculation has no solution", async () => {
    const user = userEvent.setup();
    mount("plannedFujiNoSolution");
    await openPlan();
    await user.click(button("Ajustar paradas"));
    await user.click(button("+ 1 vuelta"));
    await user.click(await screen.findByRole("button", { name: "Recalcular" }));
    await screen.findByRole("heading", { name: "Sin plan posible" });
    expect(maybe("Exportar")).toBeNull();
  });

  it("is not offered while the stops are adjusted and not recalculated", async () => {
    const user = userEvent.setup();
    mount("plannedFuji");
    await openPlan();
    expect(button("Exportar")).toBeTruthy();
    await user.click(button("Ajustar paradas"));
    await user.click(
      await screen.findByRole("button", { name: /^\+ 1 vuelta/ }),
    );
    await screen.findByRole("heading", { name: "Plan modificado" });
    expect(maybe("Exportar")).toBeNull();
  });
});

// ---- the text ----

describe("copying as text", () => {
  it("asks with the revision and the id of the proposal on view, and says it is copied", async () => {
    const user = userEvent.setup();
    // the screen never touches the clipboard: the main process does
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const request = mount("plannedFuji");
    await openPlan();
    const view = await lastView(request);
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asText }));
    await screen.findByText("Copiado");
    expect(calls(request, "strategy.export")).toEqual([
      {
        method: "strategy.export",
        revision: view.revision,
        target: { kind: "proposal", computeId: view.plan.computeId },
      },
    ]);
    expect(calls(request, "strategy.exportFile")).toHaveLength(0);
    expect(status()).toBe("Plan copiado como texto.");
    expect(writeText).not.toHaveBeenCalled();
    // the menu is closed and the focus is on the button
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(button("Exportar")),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks for the accepted plan when that is the one on view", async () => {
    const user = userEvent.setup();
    const request = mount("acceptedFuji");
    await openPlan("Plan aceptado");
    const view = await lastView(request);
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asText }));
    await screen.findByText("Copiado");
    expect(calls(request, "strategy.export")).toEqual([
      {
        method: "strategy.export",
        revision: view.revision,
        target: { kind: "accepted" },
      },
    ]);
  });

  it("is a flash: «Copiado» goes after a few seconds", async () => {
    // only the timer of the flash is held back; the rest of the timers run as ever
    const realSetTimeout = globalThis.setTimeout;
    const flashes: (() => void)[] = [];
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: () => void,
      delay?: number,
    ) => {
      if (delay === 4000) {
        flashes.push(callback);
        return 0;
      }
      return realSetTimeout(callback, delay);
    }) as unknown as typeof setTimeout);
    const user = userEvent.setup();
    mount("plannedFuji");
    await openPlan();
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asText }));
    await screen.findByText("Copiado");
    expect(flashes).toHaveLength(1);
    act(() => flashes[0]());
    expect(screen.queryByText("Copiado")).toBeNull();
    // what was said stays said
    expect(status()).toBe("Plan copiado como texto.");
  });

  it("does not retry a busy answer by itself, and says to wait", async () => {
    const user = userEvent.setup();
    const request = mount("plannedFuji", {
      override: failWith("strategy.export", { kind: "busy" }),
    });
    await openPlan();
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asText }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo copiar el plan");
    expect(alert.textContent).toContain(
      "Espera un momento y vuelve a intentarlo.",
    );
    expect(calls(request, "strategy.export")).toHaveLength(1);
    // trying again is a new request, with the button of the notice
    await user.click(
      within(alert).getByRole("button", { name: "Volver a intentarlo" }),
    );
    await waitFor(() =>
      expect(calls(request, "strategy.export")).toHaveLength(2),
    );
    expect(calls(request, "strategy.exportFile")).toHaveLength(0);
  });

  it("says the clipboard failed with its own words", async () => {
    const user = userEvent.setup();
    mount("plannedFuji", {
      override: failWith("strategy.export", { kind: "io" }),
    });
    await openPlan();
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asText }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo copiar el texto.");
    expect(
      within(alert).getByRole("button", { name: "Volver a intentarlo" }),
    ).toBeTruthy();
  });
});

// ---- the file ----

describe("saving as a spreadsheet", () => {
  it("waits while the window is open, then says the name it was saved with and nothing else", async () => {
    const user = userEvent.setup();
    const held = gate();
    const request = mount("plannedFuji", {
      hold: (r) => (r.method === "strategy.exportFile" ? held.held : undefined),
    });
    await openPlan();
    const view = await lastView(request);
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asFile }));
    // «Esperando…»: the button is busy, not gone, and nothing else can start
    const busy = await screen.findByRole("button", { name: "Exportando…" });
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Elige dónde guardar el archivo")).toBeTruthy();
    expect(status()).toBe("Elige dónde guardar el archivo.");
    expect(button("Calcular de nuevo").hasAttribute("disabled")).toBe(true);
    expect(calls(request, "strategy.exportFile")).toEqual([
      {
        method: "strategy.exportFile",
        revision: view.revision,
        target: { kind: "proposal", computeId: view.plan.computeId },
      },
    ]);
    // a press on the busy button opens nothing
    await user.click(busy);
    expect(screen.queryByRole("menu")).toBeNull();
    held.release();
    await screen.findByText("Plan exportado");
    expect(document.body.textContent).toContain(
      "Guardado como «Fuji 6 Horas.csv». Ábrelo con Excel, Google Sheets o Numbers.",
    );
    expect(status()).toBe("Guardado como Fuji 6 Horas.csv.");
    expect(screen.queryByText("Elige dónde guardar el archivo")).toBeNull();
    // the button is back, with the focus
    await waitFor(() =>
      expect(document.activeElement).toBe(button("Exportar")),
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    noPath();
    // put away: the focus stays on the button
    await user.click(button("Cerrar aviso"));
    expect(screen.queryByText("Plan exportado")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(button("Exportar")),
    );
  });

  it("asks for the accepted plan when that is the one on view", async () => {
    const user = userEvent.setup();
    const request = mount("acceptedFuji");
    await openPlan("Plan aceptado");
    const view = await lastView(request);
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asFile }));
    await screen.findByText("Plan exportado");
    expect(calls(request, "strategy.exportFile")).toEqual([
      {
        method: "strategy.exportFile",
        revision: view.revision,
        target: { kind: "accepted" },
      },
    ]);
  });

  it("says nothing when the window is cancelled, only the status line", async () => {
    const user = userEvent.setup();
    mount("plannedFuji", {
      answer: (r) =>
        r.method === "strategy.exportFile" ? { kind: "cancelled" } : undefined,
    });
    await openPlan();
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asFile }));
    await waitFor(() => expect(status()).toBe("Exportación cancelada."));
    expect(screen.queryByText("Elige dónde guardar el archivo")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Plan exportado")).toBeNull();
    expect(button("Exportar").getAttribute("aria-disabled")).toBeNull();
  });

  it("is not an alarm when the window stayed open too long", async () => {
    const user = userEvent.setup();
    mount("plannedFuji", {
      override: failWith("strategy.exportFile", {
        kind: "strategyPickExpired",
      }),
    });
    await openPlan();
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asFile }));
    await screen.findByText("No se guardó nada");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(status()).toBe(
      "No se guardó nada: la ventana para guardar se cerró.",
    );
    expect(button("Exportar").getAttribute("aria-disabled")).toBeNull();
  });

  it.each([
    [
      "strategyNothingToExport",
      "No hay ningún plan que exportar. Calcula el plan o acepta una propuesta y vuelve a intentarlo.",
      null,
    ],
    [
      "strategyExportNotCsv",
      "El archivo tiene que terminar en «.csv». Elige otro nombre.",
      "Elegir otro nombre…",
    ],
    [
      "strategyFileInUse",
      "Otro programa tiene ese archivo abierto, por ejemplo Excel. Ciérralo en el otro programa y vuelve a intentarlo.",
      "Volver a intentarlo",
    ],
    [
      "strategyFileUnavailable",
      "No se pudo escribir el archivo en esa carpeta. El plan no ha cambiado. Prueba en otra carpeta, como Documentos.",
      "Elegir otra carpeta…",
    ],
    [
      "strategyFileTooLarge",
      "El plan es demasiado grande para guardarlo como hoja de cálculo. Cópialo como texto.",
      null,
    ],
    [
      "strategyTargetExists",
      "Ese archivo es el de tus estrategias y no se puede sobrescribir. Elige otro nombre.",
      "Elegir otro nombre…",
    ],
    [
      "busy",
      "Vantare está ocupado. Espera un momento y vuelve a intentarlo.",
      "Volver a intentarlo",
    ],
    [
      "strategyEditPending",
      "Tienes ajustes sin recalcular. Recalcula o restablece el plan antes de exportarlo.",
      null,
    ],
    [
      "protected",
      "Este archivo es de una versión más nueva de Vantare y no se puede exportar desde esta versión.",
      null,
    ],
    [
      "denied",
      "Ahora mismo no tienes acceso a esta función. Revisa tu sesión e inténtalo de nuevo.",
      null,
    ],
    [
      "io",
      "No se ha podido completar la exportación. El plan no ha cambiado. Vuelve a intentarlo.",
      "Volver a intentarlo",
    ],
    [
      "coreUnavailable",
      "No se ha podido completar la exportación. El plan no ha cambiado. Vuelve a intentarlo.",
      "Volver a intentarlo",
    ],
  ] as const)(
    "says %s in an alert, with no path, and offers to try again only when it can help",
    async (kind, detail, retry) => {
      const user = userEvent.setup();
      const request = mount("plannedFuji", {
        override: failWith("strategy.exportFile", { kind } as HostError),
      });
      await openPlan();
      await open(user);
      await user.click(await screen.findByRole("menuitem", { name: asFile }));
      const alert = await screen.findByRole("alert");
      expect(
        within(alert).getByText("No se pudo exportar el plan"),
      ).toBeTruthy();
      expect(within(alert).getByText(detail)).toBeTruthy();
      noPath();
      expect(screen.getAllByRole("status")).toHaveLength(1);
      // the plan is as it was, and the button is free again
      expect(
        screen.getByRole("heading", { name: "Plan calculado" }),
      ).toBeTruthy();
      expect(button("Exportar").getAttribute("aria-disabled")).toBeNull();
      const again = within(alert).queryByRole("button", {
        name: /^(Elegir|Volver)/,
      });
      if (retry) {
        expect(again?.textContent).toBe(retry);
        // the same try, with the window that lets the person choose
        await user.click(again as HTMLElement);
        await waitFor(() =>
          expect(calls(request, "strategy.exportFile")).toHaveLength(2),
        );
        expect(calls(request, "strategy.exportFile")[1]).toEqual(
          calls(request, "strategy.exportFile")[0],
        );
      } else expect(again).toBeNull();
      // put away, with the focus on the button
      await user.click(
        within(await screen.findByRole("alert")).getByRole("button", {
          name: "Cerrar aviso",
        }),
      );
      expect(screen.queryByRole("alert")).toBeNull();
      await waitFor(() =>
        expect(document.activeElement).toBe(button("Exportar")),
      );
    },
  );
});

// ---- a plan that is no longer the one on view ----

describe("when the plan of the host is another one", () => {
  it("replaces the view with the host's and says so, as every conflict of the plan", async () => {
    const user = userEvent.setup();
    let before: StrategyView | undefined;
    const request = mount("plannedFuji", {
      override: (r) =>
        r.method === "strategy.exportFile" && before
          ? {
              kind: "strategyConflict",
              current: {
                ...before,
                revision: "f".repeat(64),
                plan: {
                  ...before.plan,
                  state: "uncalculated",
                  computeId: null,
                  result: null,
                  edit: null,
                  accepted: null,
                },
              },
            }
          : undefined,
    });
    await openPlan();
    before = await lastView(request);
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asFile }));
    await screen.findByRole("heading", { name: "Sin calcular" });
    expect(status()).toBe("El plan ha cambiado. Te mostramos el actual.");
    // the view is the host's: nothing is exported from it any more
    expect(maybe("Exportar")).toBeNull();
    expect(screen.queryByText("Elige dónde guardar el archivo")).toBeNull();
    expect(screen.queryByText("Plan exportado")).toBeNull();
    noPath();
  });

  it("takes the notice away when the plan on view changes", async () => {
    const user = userEvent.setup();
    mount("plannedFuji");
    await openPlan();
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asFile }));
    await screen.findByText("Plan exportado");
    // accepting makes the plan on view the accepted one: the notice was about the proposal
    await user.click(button("Aceptar propuesta"));
    await screen.findByRole("heading", { name: "Plan aceptado" });
    expect(screen.queryByText("Plan exportado")).toBeNull();
  });

  it("asks with the revision of the new view and the id of the new calculation", async () => {
    const user = userEvent.setup();
    const request = mount("plannedFuji");
    await openPlan();
    const first = await lastView(request);
    await user.click(button("Calcular de nuevo"));
    await waitFor(async () => {
      const view = await lastView(request);
      expect(view.plan.computeId).not.toBe(first.plan.computeId);
    });
    await screen.findByRole("heading", { name: "Plan calculado" });
    const view = await lastView(request);
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asText }));
    await screen.findByText("Copiado");
    expect(calls(request, "strategy.export")).toEqual([
      {
        method: "strategy.export",
        revision: view.revision,
        target: { kind: "proposal", computeId: view.plan.computeId },
      },
    ]);
  });
});

// ---- another strategy, another file: nothing of the last try goes with the user ----

describe("the notice of an export belongs to the strategy it was about", () => {
  it("is gone in another strategy with an accepted plan, so its retry can never export that plan", async () => {
    const user = userEvent.setup();
    const request = mount("acceptedFujiList", {
      override: failWith("strategy.exportFile", { kind: "strategyFileInUse" }),
    });
    await screen.findByRole("heading", { name: "Tus estrategias" });
    await user.click(screen.getByRole("button", { name: /Fuji 6 Horas/ }));
    fireEvent.click(tab("Plan"));
    await screen.findByRole("heading", { name: "Plan aceptado" });
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asFile }));
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("button", { name: "Volver a intentarlo" }),
    ).toBeTruthy();
    // the other strategy has an accepted plan too: its target is the very same
    await user.click(button("← Tus estrategias"));
    await user.click(screen.getByRole("button", { name: /Le Mans 24 Horas/ }));
    fireEvent.click(tab("Plan"));
    await screen.findByRole("heading", { name: "Plan aceptado" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(maybe("Volver a intentarlo")).toBeNull();
    expect(maybe("Cerrar aviso")).toBeNull();
    // and the button exports what is on view now, with its own revision
    const before = calls(request, "strategy.exportFile").length;
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asFile }));
    await screen.findByRole("alert");
    expect(calls(request, "strategy.exportFile")).toHaveLength(before + 1);
  });

  it("is gone when the person goes back to the collection and returns to the same strategy", async () => {
    const user = userEvent.setup();
    mount("acceptedFuji");
    await screen.findByRole("heading", { name: "Tus estrategias" });
    await user.click(button("Continuar"));
    fireEvent.click(tab("Plan"));
    await screen.findByRole("heading", { name: "Plan aceptado" });
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asFile }));
    await screen.findByText("Plan exportado");
    await user.click(button("← Tus estrategias"));
    await user.click(button("Continuar"));
    fireEvent.click(tab("Plan"));
    await screen.findByRole("heading", { name: "Plan aceptado" });
    expect(screen.queryByText("Plan exportado")).toBeNull();
  });
});

// ---- what is on view decides which plan is exported ----

describe("which plan is exported", () => {
  it("asks for the accepted plan when the proposal that was just accepted is on view", async () => {
    const user = userEvent.setup();
    const request = mount("plannedFuji");
    await openPlan();
    await user.click(button("Aceptar propuesta"));
    await screen.findByRole("heading", { name: "Plan aceptado" });
    const view = await lastView(request);
    // the proposal is still on view, and it is the accepted plan
    expect(view.plan.result).not.toBeNull();
    expect(view.plan.accepted?.compare?.same).toBe(true);
    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: asText }));
    await screen.findByText("Copiado");
    expect(calls(request, "strategy.export")).toEqual([
      {
        method: "strategy.export",
        revision: view.revision,
        target: { kind: "accepted" },
      },
    ]);
  });

  it("asks for the proposal, with its id, when the accepted plan is outdated and the proposal has its stops", async () => {
    const user = userEvent.setup();
    const request = mount("acceptedFujiStaleSame");
    await openPlan();
    const view = await lastView(request);
    // «datos antiguos»: the accepted plan is outdated and the proposal is another one
    expect(view.plan.accepted?.state).not.toBe("accepted");
    expect(view.plan.accepted?.compare?.same).toBe(true);
    await open(user);
    // it is a proposal, and the menu says so
    expect(
      within(screen.getByRole("menu")).getByText(/propuesta sin aceptar/),
    ).toBeTruthy();
    await user.click(await screen.findByRole("menuitem", { name: asText }));
    await screen.findByText("Copiado");
    expect(calls(request, "strategy.export")).toEqual([
      {
        method: "strategy.export",
        revision: view.revision,
        target: { kind: "proposal", computeId: view.plan.computeId },
      },
    ]);
  });
});
