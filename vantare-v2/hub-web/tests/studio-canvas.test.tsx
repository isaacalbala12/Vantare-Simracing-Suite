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
import { HostProvider } from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client } from "../src/renderer/bridge/client";
import { canvasText as t } from "../src/renderer/i18n/studio-canvas";
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
        : rect.call(this);
    },
  );
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
async function mount(scene = "studio-canvas") {
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
  await screen.findByRole("button", { name: /^Standings, / });
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
    x: 348,
    y: 80,
  });
});
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
  expect(await screen.findByText(t.readOnly)).toBeTruthy();
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
    screen.getByRole("button", { name: t.open }),
  );
});
