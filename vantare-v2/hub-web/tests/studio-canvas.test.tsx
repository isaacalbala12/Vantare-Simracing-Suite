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
import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import {
  type StudioView,
  studioLimits,
} from "../src/contract/generated/studio";
import { HostProvider } from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { studioText } from "../src/renderer/i18n/studio";
import { canvasText as t } from "../src/renderer/i18n/studio-canvas";
import { studioDropText as dropText } from "../src/renderer/i18n/studio-drop";
import { StudioProvider } from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioFocus } from "../src/renderer/ui/studio/StudioFocus";

let cache: QueryClient;
beforeAll(async () => {
  await import("../src/mock/host");
});
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId: number;
      isPrimary = true;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(360);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(640);
  const rect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("v-studio-canvas-viewport")
        ? new DOMRect(0, 0, 640, 360)
        : this.classList.contains("v-studio-canvas-plane")
          ? new DOMRect(
              Number.parseFloat(this.style.left),
              Number.parseFloat(this.style.top),
              Number.parseFloat(this.style.width),
              Number.parseFloat(this.style.height),
            )
          : rect.call(this);
    },
  );
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => document.querySelector(".v-studio-canvas-plane")),
  });
  for (const name of [
    "setPointerCapture",
    "hasPointerCapture",
    "releasePointerCapture",
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      writable: true,
      value() {},
    });
  }
  const captures = new WeakMap<HTMLElement, number>();
  vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(
    function (this: HTMLElement, id: number) {
      captures.set(this, id);
    },
  );
  vi.spyOn(HTMLElement.prototype, "hasPointerCapture").mockImplementation(
    function (this: HTMLElement, id: number) {
      return captures.get(this) === id;
    },
  );
  vi.spyOn(HTMLElement.prototype, "releasePointerCapture").mockImplementation(
    function (this: HTMLElement) {
      captures.delete(this);
    },
  );
});
afterEach(() => {
  cleanup();
  cache?.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
async function renderStudio(scene = "studio-canvas") {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui = render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <CSPProvider disableStyleElements>
          <TooltipProvider>
            <UiProvider>
              <StudioProvider>
                <StudioFocus />
              </StudioProvider>
            </UiProvider>
          </TooltipProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
  return ui;
}
async function mount(scene = "studio-canvas") {
  const ui = await renderStudio(scene);
  await screen.findByRole("button", { name: "Standings Visible" });
  await userEvent.setup().click(screen.getByRole("button", { name: t.open }));
  const move = await screen.findByRole("button", { name: t.move("Standings") });
  await waitFor(() =>
    expect(move.getAttribute("aria-disabled")).toBe(
      scene.endsWith("readonly") ? "true" : "false",
    ),
  );
  return { ...ui, move };
}
function requests(spy: MockInstance<Client["request"]>) {
  return spy.mock.calls
    .map((args) => args[0])
    .filter((request) => request.method === "studio.geometry");
}
function arrow(node: HTMLElement, key = "ArrowRight") {
  fireEvent.keyDown(node, { key });
  fireEvent.keyUp(node, { key });
}
it("moves with a held key locally and sends one revision-bound request on release", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { move } = await mount();
  expect(screen.getByText(t.placementHint)).toBeTruthy();
  await waitFor(() => expect(move.getAttribute("aria-disabled")).toBe("false"));
  fireEvent.keyDown(move, { key: "ArrowRight" });
  fireEvent.keyDown(move, { key: "ArrowRight", repeat: true });
  expect(requests(spy)).toHaveLength(0);
  fireEvent.keyUp(move, { key: "ArrowRight" });
  await waitFor(() => expect(requests(spy)).toHaveLength(1));
  expect(requests(spy)[0]).toMatchObject({
    method: "studio.geometry",
    id: "widget-1",
    baseRevision: "0".repeat(64),
    change: { kind: "move", x: 49, y: 62 },
  });
  expect(await screen.findByText(t.saved)).toBeTruthy();
});
it("Escape discards a keyboard gesture without a write", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { move } = await mount();
  fireEvent.keyDown(move, { key: "ArrowLeft" });
  fireEvent.keyDown(move, { key: "Escape" });
  fireEvent.keyDown(move, { key: "ArrowLeft", repeat: true });
  fireEvent.keyUp(move, { key: "ArrowLeft" });
  await act(async () => {});
  expect(requests(spy)).toHaveLength(0);
});
it("captures pointer movement and writes only after pointerup", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { move } = await mount();
  fireEvent.pointerDown(move, {
    button: 0,
    pointerId: 7,
    clientX: 20,
    clientY: 20,
  });
  fireEvent.pointerMove(move, { pointerId: 7, clientX: 120, clientY: 20 });
  expect(requests(spy)).toHaveLength(0);
  fireEvent.pointerUp(move, { pointerId: 7, clientX: 120, clientY: 20 });
  await waitFor(() => expect(requests(spy)).toHaveLength(1));
  expect(requests(spy)[0].change).toMatchObject({
    kind: "move",
    // 100 CSS px at the full 640/1920 fit = 300 layout units, from x=48.
    x: 348,
    y: 76,
  });
});
it("keeps the plane and scroll fixed while a captured draft crosses zero", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { container } = await mount();
  const move = container.querySelector<HTMLButtonElement>(
    'button[data-canvas-handle="0"]',
  );
  if (!move) throw Error("resize handle missing");
  const plane = container.querySelector<HTMLElement>(".v-studio-canvas-plane");
  const viewport = container.querySelector<HTMLElement>(
    ".v-studio-canvas-viewport",
  );
  if (!plane || !viewport) throw Error("canvas missing");
  const before = [
    plane.style.left,
    plane.style.top,
    viewport.scrollLeft,
    viewport.scrollTop,
  ];
  fireEvent.pointerDown(move, {
    button: 0,
    pointerId: 17,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(move, { pointerId: 17, clientX: -100, clientY: -100 });
  expect(
    container
      .querySelector('[data-canvas-selected="true"]')
      ?.getAttribute("data-outside"),
  ).toBe("true");
  expect([
    plane.style.left,
    plane.style.top,
    viewport.scrollLeft,
    viewport.scrollTop,
  ]).toEqual(before);
  fireEvent.pointerMove(move, { pointerId: 17, clientX: -150, clientY: -150 });
  expect([
    plane.style.left,
    plane.style.top,
    viewport.scrollLeft,
    viewport.scrollTop,
  ]).toEqual(before);
  fireEvent.lostPointerCapture(move, { pointerId: 17 });
  expect(requests(spy)).toHaveLength(0);
});
it.each(["pointer", "keyboard"])(
  "blur cancels a %s gesture without sending its draft",
  async (mode) => {
    const spy = vi.spyOn(Client.prototype, "request");
    const { move } = await mount();
    if (mode === "pointer") {
      fireEvent.pointerDown(move, {
        button: 0,
        pointerId: 18,
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerMove(move, { pointerId: 18, clientX: 120, clientY: 20 });
    } else fireEvent.keyDown(move, { key: "ArrowRight" });
    fireEvent.blur(window);
    fireEvent.keyUp(window, { key: "ArrowRight" });
    fireEvent.pointerUp(move, { pointerId: 18, clientX: 120, clientY: 20 });
    await act(async () => {});
    expect(requests(spy)).toHaveLength(0);
  },
);
it("lost pointer capture discards movement", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { move } = await mount();
  fireEvent.pointerDown(move, {
    button: 0,
    pointerId: 8,
    clientX: 20,
    clientY: 20,
  });
  fireEvent.pointerMove(move, { pointerId: 8, clientX: 120, clientY: 20 });
  fireEvent.lostPointerCapture(move, { pointerId: 8 });
  fireEvent.pointerUp(move, { pointerId: 8, clientX: 120, clientY: 20 });
  await act(async () => {});
  expect(requests(spy)).toHaveLength(0);
});
it("does not send geometry with a live simulator", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { move } = await mount("studio-canvas-readonly");
  expect(await screen.findByText(t.liveReadOnly)).toBeTruthy();
  expect(move.getAttribute("aria-disabled")).toBe("true");
  arrow(move);
  await act(async () => {});
  expect(requests(spy)).toHaveLength(0);
});
it("shows conflict, restores authority and reloads without retrying the gesture", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { move } = await mount("studio-canvas-conflict");
  arrow(move);
  expect(await screen.findByText(t.changed)).toBeTruthy();
  await waitFor(() =>
    expect(
      spy.mock.calls.filter(([request]) => request.method === "studio.get"),
    ).toHaveLength(2),
  );
  expect(requests(spy)).toHaveLength(1);
  expect(screen.getByText(t.position(48, 62, 338, 304))).toBeTruthy();
});
it("keeps only the last queued gesture while a save is in flight", async () => {
  const original = Client.prototype.request;
  let release: () => void = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  const spy = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(async function (this: Client, request, ...rest) {
      if (request.method === "studio.geometry" && first) {
        first = false;
        await hold;
      }
      return original.call(this, request, ...rest);
    });
  const { move } = await mount();
  arrow(move);
  await waitFor(() => expect(requests(spy)).toHaveLength(1));
  arrow(move);
  arrow(move);
  expect(requests(spy)).toHaveLength(1);
  await act(async () => {
    release();
  });
  await waitFor(() => expect(requests(spy)).toHaveLength(2));
  expect(requests(spy)[1]).toMatchObject({
    baseRevision: "1".padStart(64, "0"),
    change: { kind: "move", x: 51, y: 62 },
  });
});

it("provides eight keyboard resize handles and persists only changed geometry", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await mount();
  expect(document.querySelectorAll("[data-canvas-handle]")).toHaveLength(8);
  const top = screen.getByRole("button", {
    name: t.resize("Standings", t.handles[1]),
  });
  // Horizontal movement cannot change a top-only handle or auto size mode.
  arrow(top, "ArrowRight");
  expect(requests(spy)).toHaveLength(0);
  const right = screen.getByRole("button", {
    name: t.resize("Standings", t.handles[3]),
  });
  arrow(right);
  await waitFor(() => expect(requests(spy)).toHaveLength(1));
  expect(requests(spy)[0]).toMatchObject({
    change: { kind: "resize", x: 48, y: 62, width: 339 },
  });
});

it("anchors with a click alternative and keeps canvas zoom local", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: t.zoomMore }));
  await user.click(screen.getByRole("button", { name: t.fit }));
  expect(requests(spy)).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: t.anchors }));
  await user.click(
    await screen.findByRole("button", {
      name: t.anchor(t.rows[2], t.columns[2]),
    }),
  );
  await waitFor(() => expect(requests(spy)).toHaveLength(1));
  expect(requests(spy)[0]).toMatchObject({
    change: { kind: "anchor", column: 2, row: 2 },
  });
});

it("discards an unfinished gesture on unmount without leaving a key listener", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { move, unmount } = await mount();
  fireEvent.keyDown(move, { key: "ArrowRight" });
  unmount();
  fireEvent.keyUp(window, { key: "ArrowRight" });
  await act(async () => {});
  expect(requests(spy)).toHaveLength(0);
});

it("returns focus to the mode button when leaving the canvas", async () => {
  await mount();
  await userEvent.setup().click(screen.getByRole("button", { name: t.close }));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: t.close }),
  );
});

it.each([false, true])(
  "freezes Shift at the start of a held gesture (%s)",
  async (shift) => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const spy = vi.spyOn(Client.prototype, "request");
    const { move } = await mount();
    fireEvent.keyDown(move, { key: "ArrowRight", shiftKey: shift });
    fireEvent.keyDown(move, {
      key: "ArrowRight",
      repeat: true,
      shiftKey: !shift,
    });
    fireEvent.keyUp(move, { key: "ArrowRight", shiftKey: !shift });
    await waitFor(() => expect(requests(spy)).toHaveLength(1));
    expect(requests(spy)[0]).toMatchObject({
      change: { kind: "move", x: shift ? 56 : 49, y: 62 },
    });
  },
);

it("does not swallow an arrow when no gesture can start", async () => {
  const { move } = await mount("studio-canvas-readonly");
  const received = vi.fn();
  window.addEventListener("keydown", received);
  try {
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    fireEvent(move, event);
    expect(event.defaultPrevented).toBe(false);
    expect(received).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener("keydown", received);
  }
});

it("cancels a failed pointer capture and permits a later explicit gesture", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { move } = await mount();
  vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementationOnce(
    () => {
      throw new DOMException("inactive pointer", "NotFoundError");
    },
  );
  fireEvent.pointerDown(move, {
    pointerId: 3,
    button: 0,
    clientX: 20,
    clientY: 20,
  });
  fireEvent.pointerMove(move, { pointerId: 3, clientX: 120, clientY: 20 });
  fireEvent.pointerUp(move, { pointerId: 3, clientX: 120, clientY: 20 });
  expect(requests(spy)).toHaveLength(0);
  arrow(move);
  await waitFor(() => expect(requests(spy)).toHaveLength(1));
});

it("preserves the fractional coordinates used by v37 nudge", async () => {
  vi.spyOn(performance, "now").mockReturnValue(0);
  const spy = vi.spyOn(Client.prototype, "request");
  const { move } = await mount("studio-canvas-fractional");
  arrow(move);
  await waitFor(() => expect(requests(spy)).toHaveLength(1));
  expect(requests(spy)[0]).toMatchObject({
    change: { kind: "move", x: 1.25, y: -0.5 },
  });
});

it.each(["timeout", "io", "Unknown"])(
  "reconciles an applied %s outcome without mutation replay",
  async (outcome) => {
    const original = Client.prototype.request;
    let reads = 0;
    let release: () => void = () => {};
    let started: () => void = () => {};
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const spy = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(async function (this: Client, request, ...rest) {
        if (request.method === "studio.geometry") {
          await original.call(this, request, ...rest);
          if (outcome === "Unknown")
            throw new Error("Unknown mutation outcome");
          throw new HostFailure({
            kind: outcome === "timeout" ? "coreUnavailable" : "io",
          });
        }
        if (request.method === "studio.get" && ++reads > 1) {
          started();
          await hold;
        }
        return original.call(this, request, ...rest);
      });
    try {
      const { move } = await mount();
      arrow(move);
      await reading;
      expect(await screen.findByText(t.uncertain)).toBeTruthy();
      expect(screen.queryByText(t.saved)).toBeNull();
      arrow(move);
      expect(requests(spy)).toHaveLength(1);
      await act(async () => {
        release();
      });
      expect(await screen.findByText(t.saved)).toBeTruthy();
      expect(reads).toBe(2);
      expect(requests(spy)).toHaveLength(1);
    } finally {
      release();
    }
  },
);

it("keeps the read fence across modes after a failed reconciliation", async () => {
  const original = Client.prototype.request;
  let reads = 0;
  let failRead = true;
  let failWrite = true;
  const spy = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(async function (this: Client, request, ...rest) {
      if (request.method === "studio.geometry" && failWrite) {
        await original.call(this, request, ...rest);
        throw new HostFailure({ kind: "coreUnavailable" });
      }
      if (request.method === "studio.get" && ++reads > 1 && failRead)
        throw new HostFailure({ kind: "coreUnavailable" });
      return original.call(this, request, ...rest);
    });
  const { move } = await mount();
  arrow(move);
  await screen.findByRole("button", { name: studioText.reload });
  expect(screen.queryByText(t.saved)).toBeNull();
  arrow(move);
  expect(requests(spy)).toHaveLength(1);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: t.close }));
  await user.click(screen.getByRole("button", { name: "Mostrar en pista" }));
  expect(
    spy.mock.calls.filter(([request]) => request.method === "studio.track"),
  ).toHaveLength(0);
  failRead = false;
  failWrite = false;
  await user.click(screen.getByRole("button", { name: studioText.reload }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: studioText.reload }),
    ).toBeNull(),
  );
  await user.click(screen.getByRole("button", { name: t.open }));
  const next = screen.getByRole("button", { name: t.move("Standings") });
  await waitFor(() => expect(next.getAttribute("aria-disabled")).toBe("false"));
  expect(requests(spy)).toHaveLength(1);
  arrow(next);
  await waitFor(() => expect(requests(spy)).toHaveLength(2));
  expect(requests(spy)[1]).toMatchObject({
    baseRevision: "1".padStart(64, "0"),
    change: { kind: "move", x: 50 },
  });
});

it("replaces steps with the canvas, keeps one plane tab stop, and restores the active step with Done", async () => {
  const { move, container } = await mount();
  const user = userEvent.setup();
  expect(screen.queryByRole("tab", { name: "En pista" })).toBeNull();
  expect(
    container.querySelectorAll(
      '.v-studio-canvas-viewport button[tabindex="0"]',
    ),
  ).toHaveLength(1);
  fireEvent.keyDown(move, { key: "ArrowRight" });
  fireEvent.keyDown(move, { key: "Escape" });
  expect(screen.getByRole("region", { name: t.title })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: t.done }));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: t.close }),
  );
  await user.click(screen.getByRole("tab", { name: "En pista" }));
  await user.click(screen.getByRole("button", { name: t.open }));
  await user.click(screen.getByRole("button", { name: t.done }));
  expect(
    screen.getByRole("tab", { name: "En pista" }).getAttribute("aria-selected"),
  ).toBe("true");
});

it("uses fixed resolution presets and returns to the detected monitor with CAS", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: t.resolution }));
  expect(
    screen
      .getByRole("radio", { name: /Tu monitor/ })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.click(screen.getByRole("radio", { name: /2560 × 1440/ }));
  await waitFor(() =>
    expect(
      spy.mock.calls.filter(([r]) => r.method === "studio.canvas"),
    ).toHaveLength(1),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("radio", { name: /2560 × 1440/ })
        .getAttribute("aria-checked"),
    ).toBe("true"),
  );
  await user.click(screen.getByRole("radio", { name: /Tu monitor/ }));
  await waitFor(() =>
    expect(
      spy.mock.calls.filter(([r]) => r.method === "studio.canvas"),
    ).toHaveLength(2),
  );
  expect(
    spy.mock.calls
      .filter(([r]) => r.method === "studio.canvas")
      .map(([r]) => r),
  ).toEqual([
    {
      method: "studio.canvas",
      baseRevision: "0".repeat(64),
      resolution: { kind: "custom", width: 2560, height: 1440 },
    },
    {
      method: "studio.canvas",
      baseRevision: "1".padStart(64, "0"),
      resolution: { kind: "monitor" },
    },
  ]);
});

it("shows no resize handles or keyboard help in readonly mode", async () => {
  const { container } = await mount("studio-canvas-readonly");
  expect(container.querySelectorAll("[data-canvas-handle]")).toHaveLength(0);
  expect(screen.queryByText(t.help)).toBeNull();
});

it("keeps the illustration disclaimer on the toolbar info, outside the canvas", async () => {
  await mount();
  expect(screen.queryByText(t.note)).toBeNull();
  const info = screen.getByRole("button", { name: t.note });
  expect(info.closest("footer")).not.toBeNull();
});

it("blocks sidebar, anchors and removal in the readonly canvas without writes", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { move } = await mount("studio-canvas-readonly");
  const user = userEvent.setup();
  expect(
    screen
      .getByRole("button", { name: studioText.add })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  const anchor = screen.getByRole("button", { name: t.anchors });
  expect(anchor.getAttribute("aria-disabled")).toBe("true");
  expect(
    screen
      .getByRole("button", { name: t.resolution })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  await user.click(anchor);
  expect(screen.queryByRole("toolbar", { name: t.anchors })).toBeNull();
  const row = screen.getByRole("button", { name: "Standings" });
  await user.click(row);
  await user.keyboard(" {Delete}");
  await user.click(screen.getByRole("button", { name: /Más/ }));
  expect(
    (await screen.findByRole("menuitem", { name: /Standings/ })).getAttribute(
      "aria-disabled",
    ),
  ).toBe("true");
  await user.keyboard("{Escape}");
  await user.click(row);
  await user.keyboard("{Enter}");
  expect(document.activeElement).toBe(move);
  expect(
    spy.mock.calls.filter(
      ([request]) =>
        request.method.startsWith("studio.") && request.method !== "studio.get",
    ),
  ).toHaveLength(0);
});

it("navigates the nine anchors with the keyboard and restores trigger focus", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await mount();
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: t.anchors });
  await user.click(trigger);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: t.anchor(t.rows[1], t.columns[1]) }),
    ),
  );
  await user.keyboard("{Home}{Enter}");
  await waitFor(() => expect(requests(spy)).toHaveLength(1));
  expect(requests(spy)[0]).toMatchObject({
    change: { kind: "anchor", column: 0, row: 0 },
  });
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it("hides row coordinates only in Canvas and keeps Widget status lines", async () => {
  const { container } = await mount();
  expect(container.querySelectorAll(".v-focus-row-name small")).toHaveLength(0);
  await userEvent.setup().click(screen.getByRole("button", { name: t.close }));
  expect(
    container.querySelectorAll(".v-focus-row-name small").length,
  ).toBeGreaterThan(0);
});

const additions = (spy: MockInstance<Client["request"]>) =>
  spy.mock.calls
    .map(([request]) => request)
    .filter((request) => request.method === "studio.add");

it.each(["drag", "button"])(
  "focuses the confirmed new row and announces addition once after %s",
  async (method) => {
    const spy = vi.spyOn(Client.prototype, "request");
    await mount();
    const handle = await openDrop();
    const announcements = new Set<Element>();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const element =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        const status = element?.closest(
          '[role="status"], [aria-live="polite"]',
        );
        if (status?.textContent?.includes("Delta añadido"))
          announcements.add(status);
        for (const region of element?.querySelectorAll(
          '[role="status"], [aria-live="polite"]',
        ) ?? []) {
          if (region.textContent?.includes("Delta añadido"))
            announcements.add(region);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    try {
      if (method === "drag") {
        beginDrop(handle);
        fireEvent.pointerUp(handle, dropPoint());
      } else {
        await userEvent
          .setup()
          .click(screen.getByRole("button", { name: "Añadir Delta" }));
      }
      const row = await screen.findByRole("button", {
        name: "Delta 2",
      });
      await waitFor(() => expect(document.activeElement).toBe(row));
      const reply =
        await spy.mock.results[
          spy.mock.calls.findIndex(
            ([request]) => request.method === "studio.add",
          )
        ].value;
      expect(reply).toMatchObject({
        method: "studio.add",
        added: row.dataset.widget,
      });
      expect(row.getAttribute("aria-pressed")).toBe("true");
      expect(additions(spy)).toHaveLength(1);
      const statuses = screen
        .getAllByRole("status")
        .filter((node) => node.textContent?.includes("Delta añadido"));
      expect(statuses).toHaveLength(1);
      expect(statuses[0].textContent).toContain(studioText.addedName("Delta"));
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: t.close }));
      await act(async () => {});
      expect(announcements.size).toBe(1);
      expect(
        screen
          .getAllByRole("status")
          .filter((node) => node.textContent?.includes("Delta añadido")),
      ).toEqual(statuses);
    } finally {
      observer.disconnect();
    }
  },
);
async function openDrop() {
  await userEvent
    .setup()
    .click(screen.getAllByRole("button", { name: studioText.add })[0]);
  return screen.findByRole("button", {
    name: dropText.drag("Delta"),
  });
}
function dropPoint() {
  const rect = document
    .querySelector(".v-studio-canvas-plane")
    ?.getBoundingClientRect();
  if (!rect) throw Error("Visible canvas required");
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    pointerId: 7,
  };
}
function beginDrop(handle: HTMLElement) {
  fireEvent.pointerDown(handle, {
    button: 0,
    isPrimary: true,
    pointerId: 7,
    clientX: 620,
    clientY: 50,
  });
  expect(handle.hasPointerCapture(7)).toBe(true);
  fireEvent.pointerMove(handle, dropPoint());
  expect(document.querySelector(".v-canvas-drop-ghost")).not.toBeNull();
}
it("previews the catalogue silhouette and magnets without writing, then adds once at the snapped point", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await mount();
  const handle = await openDrop();
  beginDrop(handle);
  expect(document.querySelector(".v-canvas-drop-ghost")).not.toBeNull();
  expect(document.querySelectorAll(".v-studio-canvas-guide")).toHaveLength(2);
  expect(additions(spy)).toHaveLength(0);
  fireEvent.pointerUp(handle, dropPoint());
  fireEvent.pointerUp(handle, dropPoint());
  fireEvent.click(handle, { detail: 1 });
  await waitFor(() => expect(additions(spy)).toHaveLength(1));
  expect(additions(spy)[0]).toEqual({
    method: "studio.add",
    kind: "delta",
    baseRevision: "0".repeat(64),
    at: { x: 885, y: 522 },
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("complementary", { name: studioText.catalog }),
    ).toBeNull(),
  );
  expect(await screen.findByRole("button", { name: "Delta 2" })).toBeTruthy();
});
it.each(["outside", "covered"])(
  "does not add when releasing on an %s point",
  async (mode) => {
    const spy = vi.spyOn(Client.prototype, "request");
    await mount();
    const handle = await openDrop();
    beginDrop(handle);
    if (mode === "covered")
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: () => document.querySelector(".v-canvas-catalog"),
      });
    const point =
      mode === "outside"
        ? { pointerId: 7, clientX: -20, clientY: 20 }
        : dropPoint();
    fireEvent.pointerMove(handle, point);
    fireEvent.pointerUp(handle, point);
    fireEvent.click(handle, { detail: 1 });
    await act(async () => {});
    expect(additions(spy)).toHaveLength(0);
    expect(document.querySelector(".v-canvas-drop-ghost")).toBeNull();
  },
);
it.each([
  "Escape",
  "blur",
  "handleBlur",
  "resize",
  "pointerCancel",
  "lostPointerCapture",
])(
  "cancels a catalogue drag on %s without falling through to click",
  async (cause) => {
    const spy = vi.spyOn(Client.prototype, "request");
    await mount();
    const handle = await openDrop();
    beginDrop(handle);
    if (cause === "Escape") fireEvent.keyDown(handle, { key: "Escape" });
    else if (cause === "blur") fireEvent.blur(window);
    else if (cause === "handleBlur") fireEvent.blur(handle);
    else if (cause === "resize") fireEvent.resize(window);
    else if (cause === "pointerCancel")
      fireEvent.pointerCancel(handle, { pointerId: 7 });
    else fireEvent.lostPointerCapture(handle, { pointerId: 7 });
    fireEvent.pointerUp(handle, dropPoint());
    fireEvent.click(handle, { detail: 1 });
    await act(async () => {});
    expect(additions(spy)).toHaveLength(0);
    expect(document.querySelector(".v-canvas-drop-ghost")).toBeNull();
    expect(screen.getByRole("button", { name: t.close })).toBeTruthy();
  },
);
it("cancels a failed catalogue pointer capture but keeps keyboard addition available", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await mount();
  const handle = await openDrop();
  vi.spyOn(handle, "setPointerCapture").mockImplementationOnce(() => {
    throw Error("Detached capture");
  });
  fireEvent.pointerDown(handle, {
    button: 0,
    isPrimary: true,
    pointerId: 7,
    clientX: 620,
    clientY: 50,
  });
  expect(handle.setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  fireEvent.pointerUp(handle, dropPoint());
  fireEvent.click(handle, { detail: 1 });
  expect(additions(spy)).toHaveLength(0);
  await userEvent.setup().keyboard("{Enter}");
  await waitFor(() => expect(additions(spy)).toHaveLength(1));
  expect(additions(spy)[0]).not.toHaveProperty("at");
});
it("keeps the separate Add button usable after cancelling a drag", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await mount();
  const handle = await openDrop();
  beginDrop(handle);
  fireEvent.keyDown(handle, { key: "Escape" });
  fireEvent.pointerUp(handle, dropPoint());
  fireEvent.click(screen.getByRole("button", { name: "Añadir Delta" }), {
    detail: 1,
  });
  await waitFor(() => expect(additions(spy)).toHaveLength(1));
  expect(additions(spy)[0]).not.toHaveProperty("at");
});
it("can drop the first widget onto an empty canvas", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await renderStudio("studio-vacio");
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: t.open }));
  const handle = await openDrop();
  beginDrop(handle);
  fireEvent.pointerUp(handle, dropPoint());
  await waitFor(() => expect(additions(spy)).toHaveLength(1));
  expect(additions(spy)[0]).toHaveProperty("at");
  expect(await screen.findByRole("button", { name: "Delta" })).toBeTruthy();
});

it.each(["rejected", "denied", "studioConflict"] as const)(
  "clears the drop status after %s, reads authority once and never replays add",
  async (kind) => {
    const original = Client.prototype.request;
    let current: StudioView | undefined;
    const spy = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(async function (this: Client, request, ...rest) {
        if (request.method === "studio.add") {
          if (kind === "studioConflict") {
            if (!current) throw Error("Initial view required");
            throw new HostFailure({ kind, current: structuredClone(current) });
          }
          throw new HostFailure({ kind });
        }
        const response = await original.call(this, request, ...rest);
        if (response.method === "studio.get") current = response.value;
        return response;
      });
    await mount();
    const handle = await openDrop();
    beginDrop(handle);
    const status = document.querySelector(
      '.v-canvas-accessible-help[role="status"]',
    );
    expect(status?.textContent).toContain(dropText.release);
    fireEvent.pointerUp(handle, dropPoint());
    await waitFor(() =>
      expect(
        spy.mock.calls.filter(([request]) => request.method === "studio.get"),
      ).toHaveLength(2),
    );
    await waitFor(() => expect(status?.textContent).toBe(""));
    expect(
      await screen.findByText(
        kind === "studioConflict" ? studioText.conflict : studioText.failed,
      ),
    ).toBeTruthy();
    expect(additions(spy)).toHaveLength(1);
    expect(additions(spy)[0]).toHaveProperty("at");
    expect(screen.queryByRole("button", { name: studioText.retry })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: studioText.discard }));
    await act(async () => {});
    expect(additions(spy)).toHaveLength(1);
  },
);

it.each(["button", "Enter"] as const)(
  "reconciles an applied unpositioned %s add after an uncertain result without replaying it",
  async (trigger) => {
    const original = Client.prototype.request;
    let reads = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(async function (this: Client, request, ...rest) {
        if (request.method === "studio.get" && ++reads === 2) await held;
        const response = await original.call(this, request, ...rest);
        if (request.method === "studio.add") {
          if (trigger === "button") throw Error("Acknowledgement lost");
          throw new HostFailure({ kind: "coreUnavailable" });
        }
        return response;
      });
    try {
      await mount();
      const handle = await openDrop();
      if (trigger === "button")
        fireEvent.click(screen.getByRole("button", { name: "Añadir Delta" }));
      else {
        handle.focus();
        await userEvent.setup().keyboard("{Enter}");
      }
      await waitFor(() => expect(reads).toBe(2));
      expect(additions(spy)).toHaveLength(1);
      expect(additions(spy)[0]).not.toHaveProperty("at");
      expect(handle.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "Añadir Delta" }));
      expect(additions(spy)).toHaveLength(1);
      await act(async () => {
        release();
      });
      expect(
        await screen.findByRole("button", { name: "Delta 2" }),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: studioText.retry }),
      ).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: studioText.discard }));
      await act(async () => {});
      expect(reads).toBe(2);
      expect(additions(spy)).toHaveLength(1);
    } finally {
      release();
    }
  },
);

it.each(["protected", "readOnly", "limit", "pro", "noCanvas"] as const)(
  "prevents catalogue writes in the %s UI state",
  async (mode) => {
    const project = (view: StudioView): StudioView => {
      const value = structuredClone(view);
      if (mode === "protected") value.state = "protected";
      if (mode === "limit")
        value.instances = Array.from(
          { length: studioLimits.instances },
          (_, i) => ({
            ...structuredClone(value.instances[i === 0 ? 0 : 1]),
            id: `widget-${i + 1}`,
          }),
        );
      if (mode === "pro") {
        const radar = value.catalog.find((widget) => widget.kind === "radar");
        if (!radar) throw Error("Radar catalogue fixture required");
        radar.allowed = false;
        value.plan = "free";
      }
      if (mode === "noCanvas") value.canvas = null;
      return value;
    };
    // Subscription and get must describe the same authoritative test document.
    const listen = Client.prototype.listen;
    vi.spyOn(Client.prototype, "listen").mockImplementation(function (
      this: Client,
      callback,
    ) {
      return listen.call(this, (message) =>
        callback(
          message.kind === "event" && message.event.topic === "studio"
            ? {
                ...message,
                event: {
                  ...message.event,
                  value: project(message.event.value),
                },
              }
            : message,
        ),
      );
    });
    const original = Client.prototype.request;
    const spy = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(async function (this: Client, request, ...rest) {
        const response = await original.call(this, request, ...rest);
        if (response.method !== "studio.get") return response;
        return { ...response, value: project(response.value) };
      });
    await renderStudio(
      mode === "readOnly" ? "studio-canvas-readonly" : "studio-canvas",
    );
    await screen.findAllByRole("button", {
      name: "Standings Visible",
    });
    await userEvent.setup().click(screen.getByRole("button", { name: t.open }));
    if (mode === "pro") {
      await openDrop();
      const handle = screen.getByRole("button", {
        name: dropText.drag("Radar"),
      });
      expect(handle.getAttribute("aria-disabled")).toBe("true");
      fireEvent.pointerDown(handle, {
        button: 0,
        isPrimary: true,
        pointerId: 7,
        clientX: 620,
        clientY: 50,
      });
      expect(handle.hasPointerCapture(7)).toBe(false);
      fireEvent.pointerMove(handle, dropPoint());
      fireEvent.pointerUp(handle, dropPoint());
      fireEvent.click(handle);
      fireEvent.click(screen.getByRole("button", { name: "Añadir Radar" }));
      handle.focus();
      await userEvent.setup().keyboard("{Enter}");
    } else {
      const add = screen.getByRole("button", {
        name: studioText.add,
      });
      if (mode !== "noCanvas")
        expect(add.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(add);
      expect(
        screen.queryByRole("complementary", { name: studioText.catalog }),
      ).toBeNull();
      if (mode === "noCanvas")
        expect(document.querySelector(".v-studio-canvas-plane")).toBeNull();
    }
    await act(async () => {});
    expect(additions(spy)).toHaveLength(0);
    expect(document.querySelector(".v-canvas-drop-ghost")).toBeNull();
  },
);

it("releases catalogue pointer capture on unmount and cannot submit the detached drag", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { unmount } = await mount();
  const handle = await openDrop();
  beginDrop(handle);
  const point = dropPoint();
  unmount();
  expect(handle.hasPointerCapture(7)).toBe(false);
  fireEvent.pointerUp(handle, point);
  fireEvent.click(handle);
  await act(async () => {});
  expect(additions(spy)).toHaveLength(0);
});
