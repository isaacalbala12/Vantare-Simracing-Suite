// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  AnalysisReply,
  AnalysisRequest,
} from "../src/contract/generated/analysis";
import type { HostToUi, Reply } from "../src/contract/generated/contract";
import { analysisQaNow } from "../src/mock/analysis-scenes";
import { createMockHost } from "../src/mock/host";
import { AnalysisController } from "../src/renderer/app/AnalysisController";
import {
  commonRanges,
  comparable,
} from "../src/renderer/app/analysis-comparison";
import * as host from "../src/renderer/app/Host";
import {
  SectionChromeProvider,
  SectionRailSlot,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import * as settings from "../src/renderer/app/SettingsState";
import { UiProvider } from "../src/renderer/app/UiState";
import { type Client, HostFailure } from "../src/renderer/bridge/client";
import { comparisonText as t } from "../src/renderer/i18n/comparison.es";
import Analysis from "../src/renderer/screens/analysis/entry";
import {
  ComparisonPlot,
  tracePath,
} from "../src/renderer/ui/analysis/ComparisonPlot";
import { ComparisonRail } from "../src/renderer/ui/analysis/ComparisonRail";
import { CompareAction } from "../src/renderer/ui/analysis/LapChoices";
import { TooltipProvider } from "../src/renderer/ui/Layers";

function bridge(scene = "compare") {
  let id = 0;
  const pending = new Map<
    number,
    { resolve: (r: Reply) => void; reject: (e: unknown) => void }
  >();
  const settle = (r: HostToUi) => {
    if (r.kind === "response") pending.get(r.id)?.resolve(r.result);
    if (r.kind === "failure")
      pending.get(r.id)?.reject(new HostFailure(r.error));
    if (r.kind === "response" || r.kind === "failure") pending.delete(r.id);
  };
  const mock = createMockHost(
    `analysis-qa-${scene}`,
    settle,
    () => analysisQaNow,
  );
  return vi.fn(
    (request: AnalysisRequest): Promise<Reply> =>
      new Promise((resolve, reject) => {
        const requestId = ++id;
        pending.set(requestId, { resolve, reject });
        const response = mock({ kind: "request", id: requestId, request });
        if (response) settle(response);
      }),
  );
}
function mount(request = bridge(), withRail = false) {
  vi.spyOn(host, "useHost").mockReturnValue({
    client: { request } as unknown as Client,
  });
  vi.spyOn(settings, "useSettings").mockReturnValue({
    view: { general: { grabacion: true } },
  } as ReturnType<typeof settings.useSettings>);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  cache.setQueryData(host.coreKey, {
    ...host.offline,
    access: {
      ...host.offline.access,
      verified: true,
      blocked: false,
      analysis: true,
    },
  });
  return render(
    <QueryClientProvider client={cache}>
      <UiProvider>
        <TooltipProvider>
          <SectionChromeProvider>
            <SectionTabsSlot />
            {withRail && <SectionRailSlot fallback={null} />}
            <Analysis clock={() => analysisQaNow} timeZone="UTC" />
          </SectionChromeProvider>
        </TooltipProvider>
      </UiProvider>
    </QueryClientProvider>,
  );
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
  vi.useRealTimers();
});
async function open() {
  await userEvent.click(
    (
      await screen.findAllByRole("button", { name: /Circuito sin identificar/ })
    )[1],
  );
  await screen.findByText("Detalle técnico de la grabación");
}
async function compare() {
  await userEvent.click(screen.getByRole("button", { name: t.compare }));
}
it("selects exclusive A/B, swaps them, allows sealed gaps, and describes inert incomplete choices", async () => {
  const request = bridge();
  mount(request);
  await open();
  const choice = (side: string, lap: number) =>
    screen.getByRole("button", { name: t.select(side, lap) });
  const unavailable = choice(t.a, 1);
  expect(unavailable.hasAttribute("disabled")).toBe(false);
  expect(unavailable.getAttribute("aria-disabled")).toBe("true");
  expect(
    document.getElementById(unavailable.getAttribute("aria-describedby") ?? "")
      ?.textContent,
  ).toBe(t.unavailable);
  unavailable.focus();
  await userEvent.keyboard("{Enter} ");
  expect(unavailable.getAttribute("aria-pressed")).toBe("false");
  await userEvent.click(choice(t.a, 9));
  await userEvent.click(choice(t.b, 7));
  await userEvent.click(choice(t.a, 7));
  expect(choice(t.b, 9).getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(choice(t.a, 5));
  expect(choice(t.a, 5).getAttribute("aria-pressed")).toBe("true");
  await compare();
  await screen.findByRole("img", { name: t.speed });
  expect(screen.getAllByText(t.noDelta).length).toBeGreaterThan(0);
  expect(
    screen.getByRole("tab", { name: t.tab }).getAttribute("aria-selected"),
  ).toBe("true");
  const last = request.mock.calls
    .filter(([r]) => r.method === "analysis.compare")
    .at(-1)?.[0];
  expect(last).toMatchObject({ a: 4, b: 8 });
  const paths = screen
    .getByRole("img", { name: t.speed })
    .querySelectorAll("path.v-an-trace-line");
  expect(paths[0].classList.contains("v-an-series-a")).toBe(true);
  expect(paths[1].classList.contains("v-an-series-b")).toBe(true);
  expect(paths[0].getAttribute("d")?.match(/M/g)).toHaveLength(2);
  expect(
    document.querySelector(".v-an-values-table")?.hasAttribute("open"),
  ).toBe(false);
});
it("compares and exchanges selectors using native keyboard controls and individual elapsed axes", async () => {
  const request = bridge();
  mount(request);
  await open();
  await compare();
  const svg = await screen.findByRole("img", { name: t.speed });
  const before = svg.querySelector("path.v-an-series-b")?.getAttribute("d");
  await userEvent.click(screen.getByRole("button", { name: t.time }));
  expect(svg.querySelector("path.v-an-series-b")?.getAttribute("d")).not.toBe(
    before,
  );
  await userEvent.click(screen.getByRole("button", { name: t.swap }));
  await waitFor(() =>
    expect(
      request.mock.calls.filter(([r]) => r.method === "analysis.compare"),
    ).toHaveLength(2),
  );
  const selector = screen.getByRole("combobox", { name: t.a });
  await userEvent.click(selector);
  await userEvent.keyboard("{Home}{ArrowDown}{Enter}");
  await waitFor(() =>
    expect(
      request.mock.calls.filter(([r]) => r.method === "analysis.compare"),
    ).toHaveLength(3),
  );
});
it.each([
  ["compare-error", t.incomparable, t.back],
  ["compare-timeout", t.timeout, t.reopen],
  ["compare-cancelled", t.cancelled, t.reopen],
])(
  "renders approved %s and retries invalid sessions with the same pair on a new token",
  async (scene, title, button) => {
    const request = bridge(scene);
    mount(request);
    await open();
    await compare();
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    const first = request.mock.calls
      .map(([r]) => r)
      .find((r) => r.method === "analysis.compare");
    await userEvent.click(
      within(
        screen
          .getByRole("heading", { name: title })
          .closest(".v-an-notice") as HTMLElement,
      ).getByRole("button", { name: button }),
    );
    if (button === t.back)
      expect(screen.getByText("Detalle técnico de la grabación")).toBeTruthy();
    else {
      await screen.findByRole("img", { name: t.speed });
      const calls = request.mock.calls
        .map(([r]) => r)
        .filter((r) => r.method === "analysis.compare");
      expect(calls).toHaveLength(2);
      expect(calls[1]).toMatchObject({
        a: first?.method === "analysis.compare" ? first.a : -1,
        b: first?.method === "analysis.compare" ? first.b : -1,
      });
      expect(calls[1].session).not.toBe(calls[0].session);
    }
  },
);
it("keeps the old result while changing a pending pair, cancels and reopens silently", async () => {
  const request = bridge("compare-loading");
  mount(request);
  await open();
  await compare();
  await screen.findByRole("img", { name: t.speed });
  await userEvent.click(screen.getByRole("button", { name: t.swap }));
  await screen.findByRole("status", { name: t.updating });
  await userEvent.click(screen.getByRole("button", { name: t.swap }));
  await waitFor(() =>
    expect(
      request.mock.calls.filter(([r]) => r.method === "analysis.open"),
    ).toHaveLength(2),
  );
  expect(screen.queryByRole("heading", { name: t.cancelled })).toBeNull();
  expect(document.querySelector(".v-an-traces[data-updating]")).toBeTruthy();
  const calls = request.mock.calls
    .map(([r]) => r)
    .filter((r) => r.method === "analysis.compare");
  await waitFor(() =>
    expect(
      request.mock.calls.filter(([r]) => r.method === "analysis.compare"),
    ).toHaveLength(3),
  );
  const fresh = request.mock.calls
    .map(([r]) => r)
    .filter((r) => r.method === "analysis.compare")
    .at(-1);
  expect(fresh?.session).not.toBe(calls[0].session);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(
    await screen.findByRole("heading", { name: t.cancelled }),
  ).toBeTruthy();
});
it("retries Busy with a wait on one reader lane and cancels on unmount", async () => {
  const real = bridge();
  let busy = true;
  const request = vi.fn((r: AnalysisRequest) =>
    r.method === "analysis.compare" && busy
      ? Promise.reject(new HostFailure({ kind: "busy" }))
      : real(r),
  );
  const ui = mount(request);
  await open();
  vi.useFakeTimers();
  act(() => {
    screen.getByRole("button", { name: t.compare }).click();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(
    request.mock.calls.filter(([r]) => r.method === "analysis.compare"),
  ).toHaveLength(1);
  await act(() => vi.advanceTimersByTimeAsync(499));
  expect(
    request.mock.calls.filter(([r]) => r.method === "analysis.compare"),
  ).toHaveLength(1);
  busy = false;
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(
    request.mock.calls.filter(([r]) => r.method === "analysis.compare"),
  ).toHaveLength(2);
  ui.unmount();
  expect(request).toHaveBeenLastCalledWith({ method: "analysis.cancel" });
});
it("quick comparison picks the two fastest timed laps; fewer than two is described and inert", async () => {
  const request = bridge();
  const c = new AnalysisController({ request });
  c.load();
  await waitFor(() => expect(c.snapshot().loading).toBe(false));
  c.open(c.snapshot().rows[1]);
  await waitFor(() => expect(c.snapshot().opened).toBeTruthy());
  c.bestPair();
  await waitFor(() => expect(c.snapshot().comparison).toBeTruthy());
  expect(c.snapshot().pair).toEqual({ a: 6, b: 8 });
  c.dispose();
  const real = bridge();
  const short = vi.fn(async (r: AnalysisRequest) => {
    const result = await real(r);
    return result.method === "analysis.open"
      ? { ...result, laps: result.laps.slice(0, 2) }
      : result;
  });
  mount(short);
  await open();
  expect(
    screen
      .getByRole("button", { name: t.compare })
      .getAttribute("aria-disabled"),
  ).toBe("true");
});
it("never bridges segments or missing elapsed; subtracts overlapping gaps without changing u64 strings", async () => {
  const points = [
    { distance: 0, elapsed: 0, value: 1, segment: 0 },
    { distance: 10, elapsed: null, value: 2, segment: 0 },
    { distance: 20, elapsed: 3, value: 4, segment: 1 },
    { distance: 30, elapsed: 4, value: 5, segment: 1 },
  ];
  expect(
    tracePath(
      points,
      { time: false, range: [0, 30], distance: [0, 30] },
      (n) => n,
    ).match(/M/g),
  ).toHaveLength(2);
  expect(
    tracePath(
      points,
      { time: true, range: [0, 4], distance: [0, 30] },
      (n) => n,
    ).match(/M/g),
  ).toHaveLength(2);
  const request = bridge();
  const c = new AnalysisController({ request });
  c.load();
  await waitFor(() => expect(c.snapshot().loading).toBe(false));
  c.open(c.snapshot().rows[1]);
  await waitFor(() => expect(c.snapshot().opened).toBeTruthy());
  const opened = c.snapshot().opened;
  expect(opened?.watermark).toBe("18446744073709551615");
  if (!opened) throw Error("missing opened recording");
  expect(comparable(opened.laps[4])).toBe(true);
  expect(comparable(opened.laps[0])).toBe(false);
  expect(comparable(opened.laps[13])).toBe(false);
  expect(
    commonRanges({
      distanceRange: [0, 5000],
      gaps: { a: [{ from: 1000, to: 2000 }], b: [{ from: 1500, to: 3000 }] },
    } as Extract<AnalysisReply, { method: "analysis.compare" }> & {
      a: number;
      b: number;
    }),
  ).toEqual([
    [0, 1000],
    [3000, 5000],
  ]);
  c.compare();
  await waitFor(() => expect(c.snapshot().comparison).toBeTruthy());
  const data = c.snapshot().comparison;
  if (!data) throw Error("missing comparison");
  const axis = {
    time: false,
    range: [0, 30] as [number, number],
    distance: [0, 30] as [number, number],
  };
  const plot = render(
    <ComparisonPlot
      data={{
        ...data,
        delta: points.map((p, i) => ({ ...p, segment: i === 1 ? 1 : 0 })),
      }}
      signal="delta"
      axis={axis}
    />,
  );
  expect(plot.container.querySelector(".v-an-delta-area")).toBeNull();
  plot.rerender(
    <ComparisonPlot
      data={{ ...data, delta: points.map((p) => ({ ...p, segment: 0 })) }}
      signal="delta"
      axis={{ ...axis, time: true, range: [0, 4] }}
    />,
  );
  expect(plot.container.querySelector(".v-an-delta-area")).toBeNull();
  c.dispose();
});
it("explains the unavailable quick comparison without removing it from keyboard order", async () => {
  const c = new AnalysisController({ request: bridge() });
  render(<CompareAction state={c.snapshot()} controller={c} quick />);
  const button = screen.getByRole("button", { name: t.quick });
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(button.hasAttribute("disabled")).toBe(false);
  expect(
    document.getElementById(button.getAttribute("aria-describedby") ?? "")
      ?.textContent,
  ).toBe(t.quickHelp);
  button.focus();
  await userEvent.keyboard("{Enter} ");
  expect(document.activeElement).toBe(button);
  expect(c.snapshot().compareView).toBeUndefined();
  c.dispose();
});
it("shows the known pair while initially loading and never labels a failed new pair with the previous result", async () => {
  const c = new AnalysisController({ request: bridge() });
  c.load();
  await waitFor(() => expect(c.snapshot().loading).toBe(false));
  c.open(c.snapshot().rows[1]);
  await waitFor(() => expect(c.snapshot().opened).toBeTruthy());
  const rail = render(
    <ComparisonRail
      state={{ ...c.snapshot(), pair: { a: 8, b: 6 }, comparing: true }}
    />,
  );
  expect(screen.getByText(t.line(t.a, 9))).toBeTruthy();
  expect(screen.getByText(t.line(t.b, 7))).toBeTruthy();
  expect(screen.getAllByText(t.loading)).toHaveLength(2);
  c.compare();
  await waitFor(() => expect(c.snapshot().comparison).toBeTruthy());
  rail.rerender(
    <ComparisonRail
      state={{
        ...c.snapshot(),
        pair: { a: 6, b: 8 },
        compareError: "analysisTimeout",
        comparing: false,
      }}
    />,
  );
  expect(screen.getByText(t.line(t.a, 7))).toBeTruthy();
  expect(screen.getByText(t.line(t.b, 9))).toBeTruthy();
  expect(screen.queryByText(t.line(t.a, 13))).toBeNull();
  expect(screen.getAllByText(t.noDelta)).toHaveLength(2);
  c.dispose();
});
it("waits for both the abandoned reader and cancel acknowledgement before reopening, ignoring a late result", async () => {
  const real = bridge();
  let release: ((value: Reply) => void) | undefined;
  let old: Reply | undefined;
  let count = 0;
  const request = vi.fn(async (r: AnalysisRequest): Promise<Reply> => {
    if (r.method === "analysis.compare" && ++count === 2) {
      old = await real(r);
      return new Promise((done) => {
        release = done;
      });
    }
    return real(r);
  });
  const c = new AnalysisController({ request });
  c.load();
  await waitFor(() => expect(c.snapshot().loading).toBe(false));
  c.open(c.snapshot().rows[1]);
  await waitFor(() => expect(c.snapshot().opened).toBeTruthy());
  c.compare();
  await waitFor(() => expect(c.snapshot().comparison).toBeTruthy());
  c.select("a", 8);
  await waitFor(() => expect(release).toBeDefined());
  c.select("a", 7);
  await waitFor(() =>
    expect(
      request.mock.calls.filter(([r]) => r.method === "analysis.cancel"),
    ).toHaveLength(3),
  );
  expect(
    request.mock.calls.filter(([r]) => r.method === "analysis.open"),
  ).toHaveLength(1);
  expect(count).toBe(2);
  if (!release || !old) throw Error("missing pending comparison");
  release(old);
  await waitFor(() => expect(c.snapshot().comparing).toBe(false));
  expect(c.snapshot().comparison).toMatchObject({ a: 7, b: 6 });
  const sessions = request.mock.calls
    .map(([r]) => r)
    .filter((r) => r.method === "analysis.compare")
    .map((r) => r.session);
  expect(sessions[2]).not.toBe(sessions[1]);
  c.dispose();
});

it("exposes every trace value to keyboard and table, centers a 250 m window and resets the whole lap", async () => {
  mount(bridge(), true);
  await open();
  await compare();
  const slider = await screen.findByRole("slider", { name: t.cursor });
  expect(slider.getAttribute("aria-valuetext")).toContain("Velocidad A");
  expect(slider.getAttribute("aria-valuetext")).toContain("Freno B");
  slider.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(
    slider.getAttribute("aria-valuenow") ?? slider.getAttribute("value"),
  ).toBe("1");
  await userEvent.keyboard("{ArrowLeft}");
  expect((slider as HTMLInputElement).value).toBe("0");
  expect(document.activeElement).toBe(slider);
  await userEvent.keyboard("{Escape}");
  expect(slider.parentElement?.hasAttribute("data-cursor-dismissed")).toBe(
    true,
  );
  await userEvent.keyboard("{ArrowRight}");
  expect(slider.parentElement?.hasAttribute("data-cursor-dismissed")).toBe(
    false,
  );
  const choices = screen.getAllByRole("button", { name: /km.*s$/ });
  expect(choices).toHaveLength(3);
  await userEvent.click(choices[0]);
  const from = Number(slider.getAttribute("min"));
  expect(Number(slider.getAttribute("max")) - from).toBe(250);
  await userEvent.click(
    document.querySelector(".v-an-values-table summary") as HTMLElement,
  );
  const table = screen.getByRole("table", { name: t.table });
  expect(within(table).getAllByRole("columnheader")).toHaveLength(8);
  expect(
    within(table)
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent),
  ).toEqual(["0 m", "1 000 m", "2 000 m", "3 000 m", "4 000 m", "5 000 m"]);
  await userEvent.click(screen.getByRole("button", { name: t.whole }));
  expect(slider.getAttribute("min")).toBe("0");
  expect(slider.getAttribute("max")).toBe("5000");
});
it.each([
  [0, 5000, true],
  [1000, 5000, false],
] as const)(
  "retains zoom only when contained in the new result %s–%s",
  async (from, to, kept) => {
    const real = bridge();
    let release: ((r: Reply) => void) | undefined;
    let result: Reply | undefined;
    let count = 0;
    const request = vi.fn(async (r: AnalysisRequest): Promise<Reply> => {
      const reply = await real(r);
      if (
        r.method === "analysis.compare" &&
        ++count === 2 &&
        reply.method === "analysis.compare"
      ) {
        result = { ...reply, distanceRange: [from, to] };
        return new Promise((done) => {
          release = done;
        });
      }
      return reply;
    });
    const c = new AnalysisController({ request });
    c.load();
    await waitFor(() => expect(c.snapshot().loading).toBe(false));
    c.open(c.snapshot().rows[1]);
    await waitFor(() => expect(c.snapshot().opened).toBeTruthy());
    c.compare();
    await waitFor(() => expect(c.snapshot().comparison).toBeTruthy());
    c.zoom([250, 500]);
    const old = c.snapshot().comparison;
    c.select("a", 8);
    await waitFor(() => expect(release).toBeDefined());
    expect(c.snapshot().comparison).toBe(old);
    expect(c.snapshot().zoom).toEqual([250, 500]);
    expect(c.snapshot().comparing).toBe(true);
    if (!release || !result) throw Error("missing pending result");
    release(result);
    await waitFor(() => expect(c.snapshot().comparing).toBe(false));
    expect(c.snapshot().zoom).toEqual(kept ? [250, 500] : undefined);
    expect(c.snapshot().comparison?.distanceRange).toEqual([from, to]);
    c.dispose();
  },
);
