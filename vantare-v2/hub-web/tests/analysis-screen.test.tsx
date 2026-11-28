// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AnalysisRequest } from "../src/contract/generated/analysis";
import type { HostToUi, Reply } from "../src/contract/generated/contract";
import { analysisQaNow } from "../src/mock/analysis-scenes";
import { createMockHost } from "../src/mock/host";
import { AnalysisController } from "../src/renderer/app/AnalysisController";
import * as host from "../src/renderer/app/Host";
import {
  SectionChromeProvider,
  SectionRailSlot,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import * as settings from "../src/renderer/app/SettingsState";
import { UiProvider, useUi } from "../src/renderer/app/UiState";
import { type Client, HostFailure } from "../src/renderer/bridge/client";
import { lapTime } from "../src/renderer/i18n/analysis.es";
import { recordingStatusText as statusText } from "../src/renderer/i18n/recording-status.es";
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
  const mock = createMockHost(
    `analysis-qa-${scene}`,
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
function mount(
  request = bridge(),
  analysis = true,
  enabled = true,
  clock = () => analysisQaNow,
  timeZone = "UTC",
  rail?: ReactNode,
  listen?: Client["listen"],
) {
  vi.spyOn(host, "useHost").mockReturnValue({
    client: { request, listen } as unknown as Client,
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
            {rail}
            <Analysis clock={clock} timeZone={timeZone} />
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
it("renders the four relative groups, concise dates and unidentified fallback text", async () => {
  mount();
  await screen.findAllByText("Coche sin identificar");
  for (const label of ["Hoy", "Ayer", "Esta semana", "Antes"])
    expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByText("18:42", { selector: "time" })).toBeTruthy();
  expect(screen.getByText("21:10", { selector: "time" })).toBeTruthy();
  expect(
    screen.getAllByText("Circuito sin identificar", { selector: "em" }),
  ).toHaveLength(10);
  expect(screen.getByRole("columnheader", { name: "Abrir" })).toBeTruthy();
  expect(screen.queryByRole("columnheader", { name: "—" })).toBeNull();
});
it.each([
  ["UTC", "Ayer", "23:30"],
  ["Europe/Madrid", "Hoy", "00:30"],
])(
  "groups the same recording with injected clock and zone %s",
  async (zone, label, time) => {
    const real = bridge();
    const request = vi.fn(async (r: AnalysisRequest) => {
      const reply = await real(r);
      return reply.method === "analysis.catalog"
        ? {
            ...reply,
            recordings: [
              {
                ...reply.recordings[0],
                startedAtMs: Date.parse("2026-11-16T23:30:00Z"),
              },
            ],
          }
        : reply;
    });
    mount(request, true, true, () => Date.parse("2026-11-17T00:30:00Z"), zone);
    expect(await screen.findByText(label)).toBeTruthy();
    expect(screen.getByText(time, { selector: "time" })).toBeTruthy();
  },
);
it("keeps Laps and Map visible, keyboard reachable and inert before opening", async () => {
  const request = bridge();
  mount(request);
  await screen.findAllByText("Coche sin identificar");
  const laps = screen.getByRole("tab", { name: "Vueltas" });
  expect(laps.getAttribute("aria-disabled")).toBe("true");
  expect(laps.hasAttribute("disabled")).toBe(false);
  expect(
    document.getElementById(laps.getAttribute("aria-describedby") ?? "")
      ?.textContent,
  ).toBe("Abre una grabación para ver sus vueltas");
  await userEvent.click(screen.getByRole("tab", { name: "Grabaciones" }));
  await userEvent.keyboard("{ArrowRight}{Enter} ");
  expect(document.activeElement).toBe(laps);
  expect(
    screen
      .getByRole("tab", { name: "Grabaciones" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(
    screen
      .getByRole("tab", { name: "Mapa · Próximamente" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    screen.getByRole("tab", { name: "Comparar" }).getAttribute("aria-disabled"),
  ).toBe("true");
  expect(request.mock.calls.some(([r]) => r.method === "analysis.open")).toBe(
    false,
  );
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
    "Incompleta",
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
it("says in the main area why there are no recordings when their folder is not a folder", async () => {
  mount(bridge("status-folderUnusable"));
  // The same clear message the status panel gives, where the user is looking.
  const title = await screen.findByRole("heading", {
    name: statusText.folderUnusable,
  });
  const notice = title.closest(".v-an-notice");
  expect(notice?.textContent).toContain(statusText.folderUnusableHelp);
  // Trying again does not turn a link into a folder: no such button, and no
  // sign of the passing failure it is offered for.
  expect(
    screen.queryByRole("button", { name: "Volver a intentar" }),
  ).toBeNull();
  expect(
    screen.queryByText("No se puede leer la carpeta de grabaciones"),
  ).toBeNull();
  // Announced once: the notice repeats the text, not the announcement.
  expect(notice?.querySelector("[role=status], [role=alert]")).toBeNull();
});
it("shows the unusable folder as an error and measures no space without limits", async () => {
  // Con grabaciones en la lista y un estado sin límites, el panel sigue
  // diciendo por qué no se graba, en rojo, y no mide el espacio contra nada.
  const unusable = bridge("status-folderUnusable");
  const catalog = bridge();
  mount(
    vi.fn((request: AnalysisRequest) =>
      request.method === "analysis.status"
        ? unusable(request)
        : catalog(request),
    ),
  );
  const said = await screen.findByText(statusText.folderUnusable, {
    selector: "[role=status]",
  });
  expect(said.closest(".v-badge")?.classList).toContain("v-badge--err");
  await screen.findAllByText("Circuito sin identificar");
  // Ni el bloque «Espacio» del panel ni la línea de uso de la tira.
  expect(screen.queryByText(statusText.space)).toBeNull();
  expect(document.body.textContent).not.toMatch(/\d\s+de\s+0\b/);
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
  expect(screen.getAllByText("Buscando grabaciones…")).toHaveLength(2);
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

it("limits repeated Busy retries to 500ms and cancels without marking the file unreadable", async () => {
  vi.useFakeTimers();
  const real = bridge();
  let attempts = 0;
  const request = vi.fn(async (r: AnalysisRequest) => {
    if (r.method === "analysis.inspect") {
      attempts++;
      throw new HostFailure({ kind: "busy" });
    }
    return real(r);
  });
  const controller = new AnalysisController({ request });
  controller.load();
  await vi.advanceTimersByTimeAsync(0);
  controller.visibleRow("1".padStart(64, "0"), true);
  await vi.advanceTimersByTimeAsync(0);
  expect(attempts).toBe(1);
  for (const expected of [2, 3]) {
    await vi.advanceTimersByTimeAsync(499);
    expect(attempts).toBe(expected - 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toBe(expected);
  }
  expect(controller.snapshot().rowErrors).toEqual({});
  controller.dispose();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(attempts).toBe(3);
  expect(request).toHaveBeenLastCalledWith({ method: "analysis.cancel" });
});

it("announces unavailability only after the first status query fails", async () => {
  const base = bridge("status-unavailable");
  let finish: () => void = () => {};
  const request = vi.fn(async (input: AnalysisRequest) => {
    if (input.method === "analysis.status")
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    return base(input);
  });
  mount(request);
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      { method: "analysis.status" },
      undefined,
      expect.any(AbortSignal),
    ),
  );
  expect(screen.queryByText(statusText.unavailable)).toBeNull();
  await act(async () => finish());
  expect(await screen.findByText(statusText.unavailable)).toBeTruthy();
});

it.each([
  ["quotaUnmet", "No se pudo cumplir el límite de espacio"],
  ["pruneIncomplete", statusText.pruneIncompleteHelp],
] as const)("explains the actual %s recording problem", async (cause, copy) => {
  const base = bridge("status-degraded");
  mount(
    vi.fn(async (input: AnalysisRequest) => {
      const reply = await base(input);
      return reply.method === "analysis.status" && reply.status
        ? { ...reply, status: { ...reply.status, cause } }
        : reply;
    }),
  );
  expect(await screen.findByText(copy)).toBeTruthy();
  expect(screen.queryByText(statusText.limitHelp)).toBeNull();
});

it.each([
  [0, /^Empezó a las 11:40\./],
  [1, /^Empezó el 16 nov 2026, 11:40\./],
] as const)(
  "labels the recording start relative to the current day (%s)",
  async (days, copy) => {
    const base = bridge("status-recording");
    mount(
      vi.fn(async (input: AnalysisRequest) => {
        const reply = await base(input);
        return reply.method === "analysis.status" && reply.status
          ? {
              ...reply,
              status: {
                ...reply.status,
                startedAtMs: reply.status.startedAtMs - days * 86400000,
              },
            }
          : reply;
      }),
    );
    expect(await screen.findByText(copy)).toBeTruthy();
  },
);

function DelayedRail() {
  const [mounted, setMounted] = useState(false);
  const collapsed = useUi((s) => s.railCollapsed);
  const toggle = useUi((s) => s.toggleRail);
  return (
    <>
      <button type="button" onClick={toggle}>
        Plegar rail
      </button>
      <button type="button" onClick={() => setMounted(true)}>
        Montar rail
      </button>
      {mounted && !collapsed && <SectionRailSlot fallback={null} />}
    </>
  );
}

it("does not focus the deletion list if its target mounts after the open request", async () => {
  mount(bridge("status-limit"), true, true, undefined, "UTC", <DelayedRail />);
  const see = await screen.findByRole("button", { name: statusText.seePrune });
  await userEvent.click(screen.getByRole("button", { name: "Plegar rail" }));
  await userEvent.click(see);
  await act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  const mountButton = screen.getByRole("button", { name: "Montar rail" });
  await userEvent.click(mountButton);
  expect(
    await screen.findByText(/3 grabaciones para dejar sitio/),
  ).toBeTruthy();
  expect(document.activeElement).toBe(mountButton);
});

it("shows the deletion notice again only when a new batch arrives", async () => {
  const catalog = bridge();
  const pruning = bridge("status-limit");
  let batch = 0;
  const request = vi.fn(async (input: AnalysisRequest) => {
    const reply = await (input.method === "analysis.status"
      ? pruning
      : catalog)(input);
    return reply.method === "analysis.status" && reply.status
      ? {
          ...reply,
          status: {
            ...reply.status,
            lastPrune: {
              ...reply.status.lastPrune,
              atMs: reply.status.lastPrune.atMs + batch,
            },
          },
        }
      : reply;
  });
  const title = statusText.pruneTitle(3);
  mount(request);
  await userEvent.click(
    await screen.findByRole("button", { name: statusText.acknowledge }),
  );
  expect(screen.queryByText(title)).toBeNull();
  const reload = async (count: number) => {
    const row = (
      await screen.findAllByRole("button", { name: /Circuito sin identificar/ })
    )[1];
    await userEvent.click(row);
    await screen.findByText("Detalle técnico de la grabación");
    await userEvent.click(screen.getByRole("tab", { name: "Grabaciones" }));
    await waitFor(() =>
      expect(
        request.mock.calls.filter(
          ([input]) => input.method === "analysis.status",
        ),
      ).toHaveLength(count),
    );
  };
  await reload(2);
  expect(screen.queryByText(title)).toBeNull();
  batch = 1;
  await reload(3);
  expect(await screen.findByText(title)).toBeTruthy();
});

it("updates the live title in place, pauses in the background and stops on exit", async () => {
  vi.useFakeTimers();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const base = bridge("status-recording");
  let reads = 0;
  let defer = false;
  let signal: AbortSignal | undefined;
  let resolveLast: (() => void) | undefined;
  const request = vi.fn(
    async (
      input: AnalysisRequest,
      _onSent?: () => void,
      abort?: AbortSignal,
    ) => {
      const reply = await base(input);
      if (reply.method !== "analysis.status") return reply;
      reads++;
      signal = abort;
      if (defer)
        await new Promise<void>((resolve) => {
          resolveLast = resolve;
        });
      return reads === 1 ? { ...reply, status: null } : reply;
    },
  );
  const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
  const show = (visible: boolean) =>
    act(() => {
      hidden.mockReturnValue(!visible);
      document.dispatchEvent(new Event("visibilitychange"));
    });
  let receive: ((message: HostToUi) => void) | undefined;
  const unsubscribe = vi.fn();
  const { unmount } = mount(
    request,
    true,
    true,
    undefined,
    "UTC",
    undefined,
    (listener) => {
      receive = listener;
      return unsubscribe;
    },
  );
  await tick(24_000);
  expect(reads).toBe(0);
  show(true);
  await tick(0);
  expect(reads).toBe(1);
  const live = screen.getByText(statusText.idle).closest('[role="status"]');
  if (!live) throw Error("Missing live recording title");
  expect(live.textContent).toBe(statusText.idle);
  await tick(12_000);
  expect(live.textContent).toBe(statusText.recording);
  expect(
    request.mock.calls.filter(([input]) => input.method === "analysis.catalog"),
  ).toHaveLength(1);
  const changes: MutationRecord[] = [];
  const observer = new MutationObserver((records) => changes.push(...records));
  observer.observe(live, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  await tick(12_000);
  expect(reads).toBe(3);
  expect(changes).toEqual([]);
  observer.disconnect();
  show(false);
  await tick(36_000);
  expect(reads).toBe(3);
  defer = true;
  show(true);
  await tick(0);
  expect(reads).toBe(4);
  act(() => receive?.({ kind: "closeRequested", reason: "window" }));
  expect(signal?.aborted).toBe(true);
  unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
  resolveLast?.();
  await tick(36_000);
  expect(reads).toBe(4);
});
