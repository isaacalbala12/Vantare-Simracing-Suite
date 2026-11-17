// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AnalysisRequest } from "../src/contract/generated/analysis";
import type { Reply } from "../src/contract/generated/contract";
import { analysisQaNow } from "../src/mock/analysis-scenes";
import { createMockHost } from "../src/mock/host";
import { AnalysisController } from "../src/renderer/app/AnalysisController";
import * as host from "../src/renderer/app/Host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import * as settings from "../src/renderer/app/SettingsState";
import { UiProvider } from "../src/renderer/app/UiState";
import { type Client, HostFailure } from "../src/renderer/bridge/client";
import Analysis from "../src/renderer/screens/analysis/entry";
import { TooltipProvider } from "../src/renderer/ui/Layers";

const access = {
  ...host.offline.access,
  verified: true,
  blocked: false,
  analysis: true,
};
function bridge() {
  const mock = createMockHost(
    "analysis-qa-catalog",
    undefined,
    () => analysisQaNow,
  );
  let id = 0;
  return vi.fn(async (request: AnalysisRequest): Promise<Reply> => {
    const r = mock({ kind: "request", id: ++id, request });
    if (r?.kind === "response") return r.result;
    if (r?.kind === "failure") throw new HostFailure(r.error);
    throw Error("fixture has no response");
  });
}
function mount(request = bridge(), timeZone = "UTC") {
  vi.spyOn(host, "useHost").mockReturnValue({
    client: { request } as unknown as Client,
  });
  vi.spyOn(settings, "useSettings").mockReturnValue({
    view: { general: { grabacion: true } },
  } as unknown as ReturnType<typeof settings.useSettings>);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  cache.setQueryData(host.coreKey, { ...host.offline, access });
  const ui = render(
    <QueryClientProvider client={cache}>
      <UiProvider>
        <TooltipProvider>
          <SectionChromeProvider>
            <SectionTabsSlot />
            <Analysis clock={() => analysisQaNow} timeZone={timeZone} />
          </SectionChromeProvider>
        </TooltipProvider>
      </UiProvider>
    </QueryClientProvider>,
  );
  return ui;
}
beforeEach(() =>
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const selectRow = async (index = 1) =>
  userEvent.click(
    (
      await screen.findAllByRole("button", { name: /Circuito sin identificar/ })
    )[index],
  );
it("keeps unavailable Laps keyboard reachable, described, and inert without native disabled", async () => {
  const request = bridge();
  mount(request);
  await screen.findAllByText("Coche sin identificar");
  const laps = screen.getByRole("tab", { name: "Vueltas" });
  expect(laps.hasAttribute("disabled")).toBe(false);
  expect(laps.getAttribute("aria-disabled")).toBe("true");
  const description = laps.getAttribute("aria-describedby");
  expect(description).toBeTruthy();
  expect(document.getElementById(description ?? "")?.textContent).toBe(
    "Abre una grabación para ver sus vueltas",
  );
  await userEvent.click(screen.getByRole("tab", { name: "Grabaciones" }));
  await userEvent.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(laps);
  const before = request.mock.calls.length;
  await userEvent.keyboard("{Enter} ");
  expect(request.mock.calls.length).toBe(before);
  expect(
    screen
      .getByRole("tab", { name: "Grabaciones" })
      .getAttribute("aria-selected"),
  ).toBe("true");
});
it("opens the host mock, renders approximate reduced signals and closes its token on returning", async () => {
  const request = bridge();
  mount(request);
  await selectRow();
  await screen.findByText("Detalle técnico de la grabación");
  expect(
    screen.getByRole("tab", { name: "Vueltas" }).getAttribute("aria-disabled"),
  ).toBeNull();
  expect(screen.getByText("≈1:51.6", { selector: "strong" })).toBeTruthy();
  const bestRow = screen
    .getByRole("rowheader", { name: "Vuelta 7" })
    .closest("tr");
  if (!bestRow) throw Error("missing best row");
  expect(within(bestRow).getByText("mejor")).toBeTruthy();
  expect(within(bestRow).getByText("183,6")).toBeTruthy();
  expect(within(bestRow).getByText("70 %")).toBeTruthy();
  expect(
    within(bestRow)
      .getByRole("meter", { name: "Acelerador %" })
      .getAttribute("value"),
  ).toBe("0.7");
  expect(screen.getByText("de 10 vueltas completas")).toBeTruthy();
  expect(
    screen.getByText("10 completas · 1 con huecos · 3 sin tiempo"),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Diferencia con tu mejor vuelta" }),
  ).toBeTruthy();
  expect(screen.getAllByRole("img")).toHaveLength(14);
  expect(screen.getByRole("button", { name: "Comparar A y B" })).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: "Comparar" }).getAttribute("aria-disabled"),
  ).toBeNull();
  expect(screen.getAllByText("Incompleta").length).toBeGreaterThan(0);
  expect(screen.getByText("Con huecos")).toBeTruthy();
  expect(screen.getByText("≈ parte estimada")).toBeTruthy();
  expect(screen.getByText("Sin cerrar")).toBeTruthy();
  await userEvent.click(
    screen.getByRole("button", { name: "Volver a la lista" }),
  );
  await waitFor(() =>
    expect(
      request.mock.calls.some(([r]) => r.method === "analysis.close"),
    ).toBe(true),
  );
  expect(
    screen.getByRole("tab", { name: "Vueltas" }).getAttribute("aria-disabled"),
  ).toBe("true");
});
it.each([
  ["UTC", "Hoy · 16:05 · 21,4 MB"],
  ["Europe/Madrid", "Hoy · 17:05 · 21,4 MB"],
])(
  "uses the injected clock and zone %s in the recording heading",
  async (zone, metadata) => {
    mount(bridge(), zone);
    await selectRow();
    expect(await screen.findByText(metadata)).toBeTruthy();
  },
);
it("keeps technical counters folded and preserves u64 strings exactly", async () => {
  const real = bridge();
  const request = vi.fn(async (r: AnalysisRequest) => {
    const reply = await real(r);
    return reply.method === "analysis.open"
      ? {
          ...reply,
          attempted: "18446744073709551614",
          total: "18446744073709551613",
        }
      : reply;
  });
  mount(request);
  await selectRow();
  const summary = await screen.findByText("Detalle técnico de la grabación");
  const details = summary.closest("details");
  expect(details?.open).toBe(false);
  await userEvent.click(summary);
  expect(details?.open).toBe(true);
  for (const value of [
    "18446744073709551615",
    "18446744073709551614",
    "18446744073709551613",
  ])
    expect(screen.getByText(value)).toBeTruthy();
});
it("shows no invented zero for missing speed and no best lap for incomplete data", async () => {
  const real = bridge();
  mount(
    vi.fn(async (r: AnalysisRequest) => {
      const reply = await real(r);
      return reply.method === "analysis.open"
        ? {
            ...reply,
            laps: reply.laps.map((lap) => ({
              ...lap,
              sealed: false,
              speed: { ...lap.speed, min: null, mean: null, max: null },
            })),
          }
        : reply;
    }),
  );
  await selectRow();
  await screen.findByText("Detalle técnico de la grabación");
  expect(
    screen.getByText("Velocidad máx.").parentElement?.querySelector("strong")
      ?.textContent,
  ).toBe("—");
});
it("does not open the database of the current recording", async () => {
  const request = bridge();
  mount(request);
  await selectRow(0);
  expect(
    await screen.findByText("Esta sesión se está grabando ahora"),
  ).toBeTruthy();
  expect(request.mock.calls.some(([r]) => r.method === "analysis.open")).toBe(
    false,
  );
});
it.each([
  ["analysisChanged", "La grabación ha cambiado", 1],
  ["analysisTooLarge", "Esta grabación es demasiado grande para abrirla", 1],
  ["analysisNotFound", "Esta grabación ya no está", 1],
  ["analysisLocked", "Otro programa tiene abierta esta grabación", 2],
  ["analysisUnreadable", "No se puede leer esta grabación", 2],
  ["analysisIncompatible", "Esta grabación es de otra versión de Vantare", 2],
  ["analysisTimeout", "El lector no responde", 2],
] as const)(
  "renders approved typed %s without exposing host text",
  async (kind, title, actions) => {
    const real = bridge();
    mount(
      vi.fn(async (r: AnalysisRequest) => {
        if (r.method === "analysis.open") throw new HostFailure({ kind });
        return real(r);
      }),
    );
    await selectRow();
    const heading = await screen.findByRole("heading", { name: title });
    const parent = heading.parentElement;
    if (!parent) throw Error("missing error container");
    expect(within(parent).getAllByRole("button")).toHaveLength(actions);
    expect(
      screen.getAllByRole("button", { name: "Volver a la lista" }),
    ).toHaveLength(1);
  },
);
it("returns silently after host cancellation", async () => {
  const real = bridge();
  mount(
    vi.fn(async (r: AnalysisRequest) => {
      if (r.method === "analysis.open")
        throw new HostFailure({ kind: "analysisCancelled" });
      return real(r);
    }),
  );
  await selectRow();
  await waitFor(() =>
    expect(screen.getAllByText("Coche sin identificar")).toHaveLength(10),
  );
  expect(screen.queryByRole("alert")).toBeNull();
});
it("cancels an in-flight opening before reloading the list", async () => {
  const real = bridge();
  let reject: ((e: HostFailure) => void) | undefined;
  const request = vi.fn((r: AnalysisRequest) => {
    if (r.method === "analysis.open")
      return new Promise<Reply>((_, fail) => {
        reject = fail;
      });
    if (r.method === "analysis.cancel" && reject) {
      reject(new HostFailure({ kind: "analysisCancelled" }));
      reject = undefined;
    }
    return real(r);
  });
  mount(request);
  await selectRow();
  await screen.findByText("Leyendo vueltas…");
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await screen.findAllByText("Coche sin identificar");
  expect(screen.queryByText("Leyendo vueltas…")).toBeNull();
});
it("closes a late open token after unmount", async () => {
  const real = bridge();
  let release: (r: Reply) => void = () => {};
  const request = vi.fn((r: AnalysisRequest) =>
    r.method === "analysis.open"
      ? new Promise<Reply>((done) => {
          release = done;
        })
      : real(r),
  );
  const ui = mount(request);
  await selectRow();
  await waitFor(() =>
    expect(request.mock.calls.some(([r]) => r.method === "analysis.open")).toBe(
      true,
    ),
  );
  ui.unmount();
  release({
    method: "analysis.open",
    session: "f".repeat(64),
    watermark: "0",
    attempted: "0",
    total: "0",
    finished: true,
    laps: [],
  });
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      method: "analysis.close",
      session: "f".repeat(64),
    }),
  );
});
it("closes the preceding token before opening a different recording", async () => {
  const request = bridge();
  const c = new AnalysisController({ request });
  c.load();
  await waitFor(() => expect(c.snapshot().loading).toBe(false));
  c.open(c.snapshot().rows[1]);
  await waitFor(() => expect(c.snapshot().opened).toBeTruthy());
  c.open(c.snapshot().rows[2]);
  await waitFor(() =>
    expect(
      request.mock.calls.filter(([r]) => r.method === "analysis.open"),
    ).toHaveLength(2),
  );
  c.dispose();
  await waitFor(() =>
    expect(
      request.mock.calls.filter(([r]) => r.method === "analysis.close"),
    ).toHaveLength(2),
  );
  expect(
    request.mock.calls
      .map(([r]) => r.method)
      .filter((m) => m === "analysis.open" || m === "analysis.close"),
  ).toEqual([
    "analysis.open",
    "analysis.close",
    "analysis.open",
    "analysis.close",
  ]);
});
