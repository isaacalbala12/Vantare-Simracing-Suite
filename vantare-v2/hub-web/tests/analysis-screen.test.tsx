// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { AnalysisRequest } from "../src/contract/generated/analysis";
import type { Reply } from "../src/contract/generated/contract";
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
import { lapTime } from "../src/renderer/i18n/analysis.es";
import Analysis from "../src/renderer/screens/analysis/entry";
import { TooltipProvider } from "../src/renderer/ui/Layers";

const access = {
  ...host.offline.access,
  verified: true,
  blocked: false,
  analysis: true,
};
const observers: {
  node?: Element;
  receive: (entries: { isIntersecting: boolean }[]) => void;
}[] = [];
vi.stubGlobal(
  "IntersectionObserver",
  class {
    entry: (typeof observers)[number];
    constructor(receive: (typeof observers)[number]["receive"]) {
      this.entry = { receive };
      observers.push(this.entry);
    }
    observe(node: Element) {
      this.entry.node = node;
    }
    disconnect() {}
  },
);
function bridge(scene = "catalog") {
  const mock = createMockHost(`analysis-qa-${scene}`);
  let id = 0;
  return vi.fn(async (request: AnalysisRequest): Promise<Reply> => {
    const r = mock({ kind: "request", id: ++id, request });
    if (r?.kind === "response") return r.result;
    if (r?.kind === "failure") throw new HostFailure(r.error);
    throw Error("fixture has no response");
  });
}
function mount(request = bridge(), analysis = true, enabled = true) {
  vi.spyOn(host, "useHost").mockReturnValue({
    client: { request } as unknown as Client,
  });
  vi.spyOn(settings, "useSettings").mockReturnValue({
    view: { general: { grabacion: enabled } },
  } as unknown as ReturnType<typeof settings.useSettings>);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  cache.setQueryData(host.coreKey, {
    ...host.offline,
    access: { ...access, analysis },
  });
  return render(
    <QueryClientProvider client={cache}>
      <UiProvider>
        <TooltipProvider>
          <SectionChromeProvider>
            <SectionTabsSlot />
            <Analysis />
          </SectionChromeProvider>
        </TooltipProvider>
      </UiProvider>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  observers.length = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("formats approximate times with one decimal and carries rounding", () => {
  expect(lapTime(111600)).toBe("≈1:51.6");
  expect(lapTime(119999)).toBe("≈2:00.0");
  expect(lapTime(null)).toBe("—");
});
it("loads newest first, groups by local day, never invents car names and does not inspect offscreen rows", async () => {
  const request = bridge();
  mount(request);
  await screen.findAllByText("Coche sin identificar");
  expect(screen.getAllByText("Coche sin identificar")).toHaveLength(10);
  expect(screen.queryByText(/Coche #/)).toBeNull();
  expect(
    request.mock.calls.filter(([r]) => r.method === "analysis.inspect"),
  ).toHaveLength(0);
  await act(async () => {
    observers[0].receive([{ isIntersecting: true }]);
  });
  await screen.findByText("≈1:51.6");
  expect(
    request.mock.calls.filter(([r]) => r.method === "analysis.inspect"),
  ).toHaveLength(1);
  const c = new AnalysisController({ request });
  c.load();
  await waitFor(() => expect(c.snapshot().loading).toBe(false));
  expect(c.snapshot().rows[0].startedAtMs).toBeGreaterThan(
    c.snapshot().rows[1].startedAtMs,
  );
  c.dispose();
});
it("filters locally and clears search by keyboard", async () => {
  const request = bridge();
  mount(request);
  await screen.findAllByText("Coche sin identificar");
  const before = request.mock.calls.length;
  await userEvent.type(screen.getByRole("searchbox"), "unknown");
  expect(
    screen.getByText("Ninguna grabación coincide con la búsqueda"),
  ).toBeTruthy();
  await userEvent.clear(screen.getByRole("searchbox"));
  expect(screen.getAllByText("Coche sin identificar")).toHaveLength(10);
  expect(request.mock.calls.length).toBe(before);
});
it("inspects visible rows in series, retries Busy after 500ms, and cancels the queue on exit", async () => {
  vi.useFakeTimers();
  const real = bridge();
  let active = 0;
  let max = 0;
  let inspections = 0;
  const request = vi.fn(async (r: AnalysisRequest) => {
    if (r.method === "analysis.inspect") {
      ++active;
      max = Math.max(active, max);
      ++inspections;
      await Promise.resolve();
      --active;
      if (inspections === 1) throw new HostFailure({ kind: "busy" });
    }
    return real(r);
  });
  const c = new AnalysisController({ request });
  c.load();
  await vi.advanceTimersByTimeAsync(0);
  c.visibleRow("1".padStart(64, "0"), true);
  c.visibleRow("2".padStart(64, "0"), true);
  await vi.advanceTimersByTimeAsync(499);
  expect(inspections).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(inspections).toBe(3);
  expect(max).toBe(1);
  c.dispose();
  await vi.advanceTimersByTimeAsync(5000);
  expect(inspections).toBe(3);
  expect(request).toHaveBeenLastCalledWith({ method: "analysis.cancel" });
});
it("abandons Busy retry when its row leaves view", async () => {
  vi.useFakeTimers();
  const real = bridge();
  const request = vi.fn(async (r: AnalysisRequest) => {
    if (r.method === "analysis.inspect")
      throw new HostFailure({ kind: "busy" });
    return real(r);
  });
  const c = new AnalysisController({ request });
  c.load();
  await vi.advanceTimersByTimeAsync(0);
  c.visibleRow("1", true);
  await vi.advanceTimersByTimeAsync(0);
  c.visibleRow("1", false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(
    request.mock.calls.filter(([r]) => r.method === "analysis.inspect"),
  ).toHaveLength(1);
  c.dispose();
});
it("renders every row state including current recording without opening it", async () => {
  const request = bridge();
  mount(request);
  await screen.findAllByText("Coche sin identificar");
  await act(async () => {
    for (const o of observers) o.receive([{ isIntersecting: true }]);
  });
  for (const text of [
    "Completa",
    "Cierre sin confirmar",
    "No se puede leer",
    "Abierta por otro programa",
    "De otra versión",
  ])
    expect(await screen.findAllByText(text)).toBeTruthy();
  expect(screen.getAllByText("Grabando ahora")).toBeTruthy();
  expect(request.mock.calls.some(([r]) => r.method === "analysis.open")).toBe(
    false,
  );
});
it("does no reader work without permission", () => {
  const request = bridge();
  mount(request, false);
  expect(
    screen.getByText("Análisis no está incluido en tu acceso"),
  ).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
});
it.each([
  ["empty", true, "Todavía no hay grabaciones"],
  ["disabled-empty", false, "La grabación automática está apagada"],
  [
    "disabled",
    false,
    "No se guardan sesiones nuevas. Tus grabaciones anteriores siguen aquí.",
  ],
  ["catalog-error", true, "No se puede leer la carpeta de grabaciones"],
] as const)("renders list state %s", async (scene, enabled, text) => {
  mount(bridge(scene), true, enabled);
  expect(await screen.findByText(text)).toBeTruthy();
});
it("shows the loading skeleton after 300ms and cancels on unmount", async () => {
  vi.useFakeTimers();
  const request = vi.fn((r: AnalysisRequest) =>
    r.method === "analysis.catalog"
      ? new Promise<Reply>(() => {})
      : Promise.resolve({
          method: "analysis.cancel",
          cancelled: false,
        } as Reply),
  );
  const ui = mount(request);
  await act(() => vi.advanceTimersByTimeAsync(299));
  expect(screen.queryByText("Buscando grabaciones…")).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(screen.getByText("Buscando grabaciones…")).toBeTruthy();
  ui.unmount();
  expect(request).toHaveBeenLastCalledWith({ method: "analysis.cancel" });
});
it("accepts the full 256-row catalog", async () => {
  const real = bridge();
  const request = vi.fn(async (r: AnalysisRequest) => {
    const reply = await real(r);
    return reply.method === "analysis.catalog"
      ? {
          ...reply,
          recordings: Array.from({ length: 256 }, (_, i) => ({
            ...reply.recordings[0],
            id: i.toString(16).padStart(64, "0"),
          })),
        }
      : reply;
  });
  const c = new AnalysisController({ request });
  c.load();
  await waitFor(() => expect(c.snapshot().rows).toHaveLength(256));
  c.dispose();
});
