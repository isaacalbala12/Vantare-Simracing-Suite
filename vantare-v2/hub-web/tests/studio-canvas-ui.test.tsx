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
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type {
  CoreStatus,
  StudioView,
} from "../src/contract/generated/contract";
import { coreKey, HostProvider } from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { studioText } from "../src/renderer/i18n/studio";
import { canvasText as t } from "../src/renderer/i18n/studio-canvas.es";
import { StudioProvider } from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioFocus } from "../src/renderer/ui/studio/StudioFocus";

const caches: QueryClient[] = [];
const captureNames = [
  "setPointerCapture",
  "releasePointerCapture",
  "hasPointerCapture",
] as const;
const originalCaptures = captureNames.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
);
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
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("v-canvas-viewport") ? 960 : 320;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("v-canvas-viewport") ? 540 : 180;
    },
  );
  const captured = new WeakMap<HTMLElement, number>();
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value: function (this: HTMLElement, id: number) {
        captured.set(this, id);
      },
    },
    releasePointerCapture: {
      configurable: true,
      value: function (this: HTMLElement) {
        captured.delete(this);
      },
    },
    hasPointerCapture: {
      configurable: true,
      value: function (this: HTMLElement, id: number) {
        return captured.get(this) === id;
      },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  caches.forEach((c) => {
    c.clear();
  });
  caches.length = 0;
  window.history.replaceState(null, "", "/");
  captureNames.forEach((name, index) => {
    const original = originalCaptures[index];
    if (original) Object.defineProperty(HTMLElement.prototype, name, original);
    else delete (HTMLElement.prototype as Partial<HTMLElement>)[name];
  });
});
async function mount(scene = "studio-base") {
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
              <StudioProvider>
                <StudioFocus />
              </StudioProvider>
            </UiProvider>
          </TooltipProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: t.open }));
  const viewport = await screen.findByRole("application", { name: t.title });
  return { cache, viewport };
}
const geometryCalls = (spy: {
  mock: { calls: Parameters<Client["request"]>[] };
}) => spy.mock.calls.filter(([r]) => r.method === "studio.geometry");
function pointer(
  target: HTMLElement,
  type: string,
  x: number,
  y: number,
  extra = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
    ...extra,
  });
  Object.defineProperties(event, {
    pointerId: { value: 7 },
    isPrimary: { value: true },
  });
  fireEvent(target, event);
}
it("opens the real canvas from Studio and returns to its visible trigger", async () => {
  await mount();
  expect(screen.getByText(t.illustration)).toBeTruthy();
  expect(screen.getByRole("textbox", { name: t.x })).toHaveProperty(
    "value",
    "48",
  );
  fireEvent.click(screen.getByRole("button", { name: t.back }));
  const open = await screen.findByRole("button", { name: t.open });
  expect(document.activeElement).toBe(open);
});
it("moves with arrows in one CAS write on release, never on keydown or repeated keyup", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { viewport } = await mount();
  fireEvent.keyDown(viewport, { key: "ArrowRight", shiftKey: true });
  expect(geometryCalls(spy)).toHaveLength(0);
  fireEvent.keyUp(viewport, { key: "ArrowRight" });
  fireEvent.keyUp(viewport, { key: "ArrowRight" });
  await waitFor(() => expect(geometryCalls(spy)).toHaveLength(1));
  expect(geometryCalls(spy)[0][0]).toMatchObject({
    baseRevision: "0".repeat(64),
    change: { kind: "move", x: 56, y: 62 },
  });
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: t.x })).toHaveProperty(
      "value",
      "56",
    ),
  );
});
it("preserves the pointer offset and sends once only after a drag", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await mount();
  const move = screen.getByRole("button", { name: t.move("Standings") });
  pointer(move, "pointerdown", 100, 200);
  pointer(move, "pointermove", 120, 210);
  expect(geometryCalls(spy)).toHaveLength(0);
  pointer(move, "pointerup", 120, 210);
  await waitFor(() => expect(geometryCalls(spy)).toHaveLength(1));
  expect(geometryCalls(spy)[0][0]).toMatchObject({
    // The upper widget ends at y=84: native snap wins over raw y=82.
    change: { kind: "move", x: 88, y: 84 },
  });
});
it("does not write for a click or pointer jitter below three screen pixels", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await mount();
  const move = screen.getByRole("button", { name: t.move("Standings") });
  pointer(move, "pointerdown", 100, 100);
  pointer(move, "pointermove", 102, 100);
  pointer(move, "pointerup", 102, 100);
  expect(geometryCalls(spy)).toHaveLength(0);
});
it("cancels local pointer movement with Escape and pointer cancellation", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { viewport } = await mount();
  const move = screen.getByRole("button", { name: t.move("Standings") });
  pointer(move, "pointerdown", 100, 200);
  pointer(move, "pointermove", 120, 210);
  fireEvent.keyDown(viewport, { key: "Escape" });
  pointer(move, "pointerup", 120, 210);
  expect(geometryCalls(spy)).toHaveLength(0);
  pointer(move, "pointerdown", 100, 200);
  pointer(move, "pointermove", 120, 210);
  pointer(move, "pointercancel", 120, 210);
  pointer(move, "pointerup", 120, 210);
  expect(geometryCalls(spy)).toHaveLength(0);
});
it("uses the native acceleration clock and commits one held nudge", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { viewport } = await mount();
  let clock = 0,
    frame: FrameRequestCallback | undefined;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    frame = cb;
    return 1;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  fireEvent.keyDown(viewport, { key: "ArrowRight" });
  fireEvent.keyDown(viewport, { key: "ArrowRight", repeat: true });
  clock = 900;
  act(() => frame?.(900));
  expect(geometryCalls(spy)).toHaveLength(0);
  fireEvent.keyUp(viewport, { key: "ArrowRight" });
  await waitFor(() => expect(geometryCalls(spy)).toHaveLength(1));
  expect(geometryCalls(spy)[0][0]).toMatchObject({
    change: { kind: "move", x: 69, y: 62 },
  });
});
it.each(["account", "rights", "offline", "live"])(
  "discards a gesture on an observed %s transition",
  async (kind) => {
    const spy = vi.spyOn(Client.prototype, "request");
    const { viewport, cache } = await mount();
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    act(() => {
      const core = structuredClone(cache.getQueryData<CoreStatus>(coreKey));
      if (!core) throw new Error("core required");
      if (kind === "account")
        core.accountGeneration = "next-account-generation";
      if (kind === "rights") core.access.verified = false;
      if (kind === "offline") core.photos = "unavailable";
      if (kind === "live") core.live = true;
      cache.setQueryData(coreKey, core);
    });
    await waitFor(() => expect(screen.getByText(t.changed)).toBeTruthy());
    fireEvent.keyUp(viewport, { key: "ArrowRight" });
    expect(geometryCalls(spy)).toHaveLength(0);
  },
);
it("supports single-pointer alternatives with anchors and explicit size fields", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  await mount();
  fireEvent.click(screen.getByRole("button", { name: t.anchors[4] }));
  await waitFor(() => expect(geometryCalls(spy)).toHaveLength(1));
  expect(geometryCalls(spy)[0][0]).toMatchObject({
    change: { kind: "anchor", column: 1, row: 1 },
  });
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: t.x })).toHaveProperty(
      "value",
      "791",
    ),
  );
  const width = screen.getByRole("textbox", { name: t.width });
  fireEvent.change(width, { target: { value: "676" } });
  fireEvent.keyDown(width, { key: "Enter" });
  await waitFor(() => expect(geometryCalls(spy)).toHaveLength(2));
  expect(geometryCalls(spy)[1][0]).toMatchObject({
    change: { kind: "resize", width: 676, height: 608 },
  });
});
it("does not mutate geometry behind the catalogue dialog", async () => {
  const spy = vi.spyOn(Client.prototype, "request");
  const { viewport } = await mount();
  fireEvent.click(screen.getByRole("button", { name: t.add }));
  await screen.findByRole("dialog", { name: studioText.add });
  fireEvent.keyDown(viewport, { key: "ArrowRight" });
  fireEvent.keyUp(viewport, { key: "ArrowRight" });
  expect(geometryCalls(spy)).toHaveLength(0);
});
it("adopts a revision conflict without displaying saved or retrying the gesture", async () => {
  const native = Client.prototype.request;
  let current: StudioView | undefined;
  const spy = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(async function (this: Client, request) {
      if (request.method === "studio.geometry") {
        if (!current) throw new Error("initial view required");
        const changed = structuredClone(current);
        changed.revision = "b".repeat(64);
        changed.instances[0].x = 400;
        throw new HostFailure({ kind: "studioConflict", current: changed });
      }
      const response = await native.call(this, request);
      if (response.method === "studio.get") current = response.value;
      return response;
    });
  const { viewport } = await mount();
  fireEvent.keyDown(viewport, { key: "ArrowRight" });
  fireEvent.keyUp(viewport, { key: "ArrowRight" });
  await screen.findByText(studioText.conflict);
  expect(geometryCalls(spy)).toHaveLength(1);
  expect(screen.queryByText(t.saved)).toBeNull();
  expect(screen.getByRole("textbox", { name: t.x })).toHaveProperty(
    "value",
    "400",
  );
});
