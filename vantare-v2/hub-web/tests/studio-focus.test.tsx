// @vitest-environment jsdom

import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Reply, StudioView } from "../src/contract/generated/contract";
import { studioDuplicateCases } from "../src/contract/generated/studio";
import { HostProvider } from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { studioText as t } from "../src/renderer/i18n/studio";
import { initialStudioSelection } from "../src/renderer/screens/studio/selection";
import {
  StudioProvider,
  useStudio,
} from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioFocus } from "../src/renderer/ui/studio/StudioFocus";
import { illustrationSizes } from "../src/renderer/ui/widgets/illustrations";
import { stageGeometry } from "../src/renderer/ui/widgets/WidgetThumb";

const caches: QueryClient[] = [];
beforeAll(async () => {
  await import("../src/mock/host");
});
beforeEach(() =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  caches.forEach((c) => {
    c.clear();
  });
  caches.length = 0;
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
function ToggleScreen() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        Toggle Studio
      </button>
      {open && (
        <StudioProvider>
          <StudioFocus />
          <NoticeProbe />
        </StudioProvider>
      )}
    </>
  );
}
function NoticeProbe() {
  const state = useStudio();
  return (
    <button type="button" onClick={() => state.setNotice(undefined)}>
      Clear notice
    </button>
  );
}
function mount(scene = "studio-base") {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <CSPProvider disableStyleElements>
          <TooltipProvider>
            <UiProvider>
              <ToggleScreen />
            </UiProvider>
          </TooltipProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}
async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
) {
  for (let i = 0; i < 40 && document.activeElement !== element; i++)
    await user.tab();
  expect(document.activeElement).toBe(element);
}
const listRow = (name: string) =>
  screen.findByRole("button", {
    name: new RegExp(`^${name} (?:Visible|Oculto)`),
  });
describe("Studio Foco structure", () => {
  it("takes the row name from its existing visible name and status", async () => {
    mount();
    const row = await screen.findByRole("button", {
      name: "Standings Visible",
    });
    expect(row.getAttribute("aria-label")).toBeNull();
    expect(
      document.getElementById(row.getAttribute("aria-labelledby") ?? "")
        ?.textContent,
    ).toBe("Standings Visible");
    expect(row.hasAttribute("data-widget")).toBe(true);
  });
  it("selects remembered, then first visible, then first, then none", () => {
    const view = {
      instances: [
        { id: "hidden", visible: false },
        { id: "visible", visible: true },
      ],
    };
    expect(initialStudioSelection(view, "hidden")).toBe("hidden");
    expect(initialStudioSelection(view, "absent")).toBe("visible");
    expect(
      initialStudioSelection(
        { instances: [{ id: "hidden", visible: false }] },
        null,
      ),
    ).toBe("hidden");
    expect(initialStudioSelection({ instances: [] }, "absent")).toBeNull();
  });
  it("fits a stage drawing without cropping or exceeding its 2.6 scale", () => {
    const natural = illustrationSizes.delta;
    expect(stageGeometry("delta", 10000, 10000)).toEqual({
      width: natural.width * 2.6,
      height: natural.height * 2.6,
      cropped: false,
    });
    const small = stageGeometry("delta", 200, 100);
    expect(small.width).toBeLessThanOrEqual(200);
    expect(small.height).toBeLessThanOrEqual(100);
    expect(small.width / small.height).toBeCloseTo(
      natural.width / natural.height,
    );
  });
  it("keeps heading levels in order from the overlay title to its groups", async () => {
    mount();
    await screen.findByRole("heading", { name: new RegExp(t.widgetLook) });
    const levels = Array.from(
      document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
    ).map((heading) => Number(heading.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    for (let index = 1; index < levels.length; index++)
      expect(
        levels[index],
        `heading ${index + 1} skips a level`,
      ).toBeLessThanOrEqual(levels[index - 1] + 1);
  });
  it("uses real Tab, arrows, Home/End and Enter without moving focus on a click", async () => {
    mount();
    const user = userEvent.setup();
    const first = await listRow("Standings");
    await tabTo(user, first);
    await user.keyboard("{ArrowDown}");
    const delta = await listRow("Delta");
    expect(delta.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(delta);
    await user.keyboard("{End}");
    const fuel = await listRow("Fuel y stint");
    expect(document.activeElement).toBe(fuel);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(fuel);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(first);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: /Apariencia/ }),
    );
    await user.click(delta);
    expect(document.activeElement).toBe(delta);
  });
  it("sends the same CAS visibility request using Space", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const user = userEvent.setup();
    const first = await listRow("Standings");
    await tabTo(user, first);
    await user.keyboard(" ");
    await waitFor(() =>
      expect(
        requests.mock.calls.some(
          ([request]) =>
            request.method === "studio.visibility" &&
            request.id === "widget-1" &&
            request.visible === false &&
            request.baseRevision === "0".repeat(64),
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: new RegExp(`^Standings ${t.hidden}`),
        }),
      ).toBe(first),
    );
    expect(document.activeElement).toBe(first);
  });
  it("opens removal with Delete, returns focus on cancellation, and Esc never opens the catalogue", async () => {
    mount();
    const user = userEvent.setup();
    const first = await listRow("Standings");
    await tabTo(user, first);
    await user.keyboard("{Delete}");
    await screen.findByRole("dialog", { name: t.removeTitle });
    await user.click(screen.getByRole("button", { name: t.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(first));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("searchbox", { name: t.search })).toBeNull();
  });
  it("restores the chosen overlay when Studio remounts in the same Hub session", async () => {
    mount();
    const user = userEvent.setup();
    const delta = await listRow("Delta");
    await user.click(delta);
    await user.click(screen.getByRole("button", { name: "Toggle Studio" }));
    await user.click(screen.getByRole("button", { name: "Toggle Studio" }));
    expect((await listRow("Delta")).getAttribute("aria-pressed")).toBe("true");
  });
  it("starts with the first visible overlay and blocks showing an empty layout", async () => {
    mount("studio-oculto");
    expect((await listRow("Delta")).getAttribute("aria-pressed")).toBe("true");
    cleanup();
    mount("studio-vacio");
    const show = await screen.findByRole("button", { name: t.show });
    expect(show.hasAttribute("disabled")).toBe(true);
  });
  it("never paints editable defaults for a protected document", async () => {
    mount("studio-protegido");
    await screen.findByText(t.protected);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.getByRole("button", { name: t.show }).hasAttribute("disabled"),
    ).toBe(true);
  });
  it("reveals and focuses an added overlay when the hidden filter excluded it", async () => {
    mount("studio-nueve");
    const user = userEvent.setup();
    await listRow("Standings 1");
    await user.click(screen.getByRole("button", { name: t.filters.hidden }));
    await user.click(screen.getByRole("button", { name: t.add }));
    await user.click(
      await screen.findByRole("button", { name: /^Añadir .*Radar/i }),
    );
    const radar = await listRow("Radar");
    await waitFor(() => expect(document.activeElement).toBe(radar));
    expect(radar.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("searchbox", { name: t.search })).toBeNull();
  });
  it("applies a table recipe once, announces it and Undo restores the original settings", async () => {
    const native = Client.prototype.request;
    const views: import("../src/contract/generated/studio").StudioView[] = [];
    const requests = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(async function (this: Client, request) {
        const response = await native.call(this, request);
        if (response.method.startsWith("studio.") && "value" in response)
          views.push(
            structuredClone(
              response.value as import("../src/contract/generated/studio").StudioView,
            ),
          );
        return response;
      });
    mount();
    const user = userEvent.setup();
    await listRow("Standings");
    const original = JSON.stringify(views[0].instances[0].settings);
    await user.click(
      screen.getByRole("button", { name: t.applyFormat(t.formatCompact) }),
    );
    await screen.findByText(t.presetApplied(t.formatCompact));
    expect(
      requests.mock.calls.some(
        ([request]) =>
          request.method === "studio.instance" &&
          request.patch.field === "settings" &&
          JSON.stringify(request.patch.value) ===
            JSON.stringify({ kind: "standings", tablePreset: "compact" }),
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: t.undo }));
    await waitFor(() =>
      expect(JSON.stringify(views.at(-1)?.instances[0].settings)).toBe(
        original,
      ),
    );
    expect(screen.queryByText(t.presetApplied(t.formatCompact))).toBeNull();
  });
  it("rehaces a confirmed change with Ctrl+Y and keeps the selected row focused", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const user = userEvent.setup();
    const first = await listRow("Standings");
    await user.click(
      screen.getByRole("button", { name: t.applyFormat(t.formatCompact) }),
    );
    await screen.findByText(t.presetApplied(t.formatCompact));
    await user.click(first);
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() =>
      expect(screen.queryByText(t.presetApplied(t.formatCompact))).toBeNull(),
    );
    requests.mockClear();
    await user.keyboard("{Control>}y{/Control}");
    await waitFor(() =>
      expect(
        requests.mock.calls.filter(
          ([request]) => request.method === "studio.redo",
        ),
      ).toHaveLength(1),
    );
    expect(document.activeElement).toBe(first);
  });
  it("does not announce a no-op preset and never announces a conflicted write", async () => {
    mount();
    const user = userEvent.setup();
    await listRow("Standings");
    const apply = screen.getByRole("button", {
      name: t.applyFormat(t.formatCompact),
    });
    await user.click(apply);
    await screen.findByText(t.presetApplied(t.formatCompact));
    await user.click(screen.getByRole("button", { name: "Clear notice" }));
    expect(screen.queryByText(t.presetApplied(t.formatCompact))).toBeNull();
    const requests = vi.spyOn(Client.prototype, "request");
    await user.click(apply);
    await waitFor(() => expect(requests).toHaveBeenCalled());
    const response = await requests.mock.results[0].value;
    expect(response.method).toBe("studio.instance");
    expect(screen.queryByText(t.presetApplied(t.formatCompact))).toBeNull();
    cleanup();
    mount("studio-error");
    await listRow("Standings");
    await user.click(
      screen.getByRole("button", { name: t.applyFormat(t.formatCompact) }),
    );
    await screen.findByText(t.conflict);
    expect(screen.queryByText(t.presetApplied(t.formatCompact))).toBeNull();
  });
});

describe("Studio Ctrl+D", () => {
  it.each(studioDuplicateCases)(
    "consumes added and the native $name vector without moving focus",
    async (vector) => {
      const requests = vi.spyOn(Client.prototype, "request");
      mount(`studio-duplicate-${vector.name}`);
      const first = await listRow("Standings");
      const initialIndex = requests.mock.calls.findIndex(
        ([request]) => request.method === "studio.get",
      );
      const initial = (await requests.mock.results[initialIndex]
        .value) as Reply;
      if (initial.method !== "studio.get")
        throw Error("Initial Studio snapshot");
      const sourceId = first.dataset.widget;
      const user = userEvent.setup();
      await user.click(first);
      await user.keyboard("{Control>}d{/Control}");
      await waitFor(() =>
        expect(
          requests.mock.calls.some(
            ([request]) => request.method === "studio.duplicate",
          ),
        ).toBe(true),
      );
      const index = requests.mock.calls.findIndex(
        ([request]) => request.method === "studio.duplicate",
      );
      expect(requests.mock.calls[index][0]).toEqual({
        method: "studio.duplicate",
        id: sourceId,
        baseRevision: initial.value.revision,
      });
      const reply = (await requests.mock.results[index].value) as Reply;
      if (reply.method !== "studio.duplicate")
        throw Error("Duplicate confirmation");
      const copy = reply.value.instances.find(
        (item) => item.id === reply.added,
      );
      expect(copy).toBeTruthy();
      expect(copy?.id).not.toBe(sourceId);
      expect(copy?.x).toBeCloseTo(vector.expected[0], 7);
      expect(copy?.y).toBeCloseTo(vector.expected[1], 7);
      expect(copy?.frequency.overrideHz).toBe(
        initial.value.instances[0].frequency.overrideHz,
      );
      expect(copy?.settings).toEqual(
        reply.value.instances.find((item) => item.id === sourceId)?.settings,
      );
      await waitFor(() =>
        expect(
          Array.from(
            document.querySelectorAll<HTMLButtonElement>("[data-widget]"),
          )
            .find((item) => item.dataset.widget === reply.added)
            ?.getAttribute("aria-pressed"),
        ).toBe("true"),
      );
      expect((document.activeElement as HTMLElement)?.dataset.widget).toBe(
        reply.added,
      );
      expect(
        requests.mock.calls.filter(
          ([request]) => request.method === "studio.duplicate",
        ),
      ).toHaveLength(1);
      expect(screen.queryByText(t.addedName("Standings"))).toBeNull();
    },
  );
  it("does not duplicate from a field, a menu, an inert row or an open dialog", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const first = await listRow("Standings");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: t.content }));
    await user.click(screen.getAllByRole("textbox")[0]);
    await user.keyboard("{Control>}d{/Control}");
    for (const role of ["menu", "dialog"]) {
      const overlay = document.createElement("div");
      overlay.setAttribute("role", role);
      document.body.append(overlay);
      first.focus();
      fireEvent.keyDown(first, { key: "d", ctrlKey: true });
      overlay.remove();
    }
    first.setAttribute("inert", "");
    fireEvent.keyDown(first, { key: "d", ctrlKey: true });
    first.removeAttribute("inert");
    for (const modifiers of [
      { repeat: true },
      { isComposing: true },
      { shiftKey: true },
      { altKey: true },
      { metaKey: true },
    ])
      fireEvent.keyDown(first, { key: "d", ctrlKey: true, ...modifiers });
    await act(async () => {});
    expect(
      requests.mock.calls.filter(
        ([request]) => request.method === "studio.duplicate",
      ),
    ).toHaveLength(0);
    first.focus();
    fireEvent.keyDown(first, { key: "d", ctrlKey: true });
    await waitFor(() =>
      expect(
        requests.mock.calls.filter(
          ([request]) => request.method === "studio.duplicate",
        ),
      ).toHaveLength(1),
    );
  });
  it("uses the existing write latch for two keyboard events before a render", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const first = await listRow("Standings");
    first.focus();
    act(() => {
      fireEvent.keyDown(first, { key: "d", ctrlKey: true });
      fireEvent.keyDown(first, { key: "d", ctrlKey: true });
    });
    await act(async () => {});
    expect(
      requests.mock.calls.filter(
        ([request]) => request.method === "studio.duplicate",
      ),
    ).toHaveLength(1);
  });
  it.each([
    "rejected",
    "busy",
    "coreUnavailable",
    "studioConflict",
    "io",
  ] as const)(
    "preserves the existing %s feedback, rereads only uncertain/conflicted results and never replays",
    async (kind) => {
      const original = Client.prototype.request;
      let current: StudioView | undefined;
      const requests = vi
        .spyOn(Client.prototype, "request")
        .mockImplementation(function (this: Client, request) {
          if (request.method === "studio.duplicate") {
            if (!current) throw Error("Initial Studio snapshot");
            return Promise.reject(
              new HostFailure(
                kind === "studioConflict" ? { kind, current } : { kind },
              ),
            );
          }
          return original.call(this, request);
        });
      mount();
      const first = await listRow("Standings");
      const initialIndex = requests.mock.calls.findIndex(
        ([request]) => request.method === "studio.get",
      );
      const initial = (await requests.mock.results[initialIndex]
        .value) as Reply;
      if (initial.method !== "studio.get") throw Error("Initial snapshot");
      current = initial.value;
      const reads = requests.mock.calls.filter(
        ([request]) => request.method === "studio.get",
      ).length;
      await userEvent.setup().click(first);
      fireEvent.keyDown(first, { key: "d", ctrlKey: true });
      const message =
        kind === "studioConflict"
          ? t.conflict
          : kind === "coreUnavailable" || kind === "io"
            ? t.duplicateUncertain
            : kind === "busy"
              ? t.busy
              : t.failed;
      await screen.findByText(message);
      expect(
        requests.mock.calls.filter(
          ([request]) => request.method === "studio.duplicate",
        ),
      ).toHaveLength(1);
      expect(
        requests.mock.calls.filter(
          ([request]) => request.method === "studio.get",
        ),
      ).toHaveLength(
        reads +
          Number(
            kind === "coreUnavailable" ||
              kind === "studioConflict" ||
              kind === "io",
          ),
      );
      expect(first.getAttribute("aria-pressed")).toBe("true");
      expect(document.activeElement).toBe(first);
      expect(screen.queryByRole("button", { name: t.retry })).toBeNull();
    },
  );
});

it("keeps the original failure if reading after an uncertain duplicate also fails", async () => {
  const original = Client.prototype.request;
  let sent = false;
  const requests = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(function (this: Client, request) {
      if (request.method === "studio.duplicate") sent = true;
      if (
        sent &&
        (request.method === "studio.duplicate" ||
          request.method === "studio.get")
      )
        return Promise.reject(new HostFailure({ kind: "coreUnavailable" }));
      return original.call(this, request);
    });
  mount();
  const first = await listRow("Standings");
  first.focus();
  fireEvent.keyDown(first, { key: "d", ctrlKey: true });
  await screen.findByText(t.duplicateUncertain);
  expect(
    screen.getByRole("status", { name: t.duplicateUnconfirmed }),
  ).toBeTruthy();
  expect(first.getAttribute("aria-pressed")).toBe("true");
  expect(
    requests.mock.calls.filter(
      ([request]) => request.method === "studio.duplicate",
    ),
  ).toHaveLength(1);
  expect(
    requests.mock.calls.filter(([request]) => request.method === "studio.get"),
  ).toHaveLength(2);
});
